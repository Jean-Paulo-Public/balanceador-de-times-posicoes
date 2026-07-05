import type { Player, Team, TeamSlotPlayer, SimulationResult, FormationType } from '../domain/types';
import { scoreGoalkeeper, scoreMeiaRole, scoreNativePosition, defensiveContribution } from './scoring';
import { isImprovisationAllowed, getRoleLabels, posToLabel } from './improvisation';
import { getCombinations } from './combinatorics';
import { Formations, type FormationSlot, type RoleFamily } from '../domain/formations';

const TACTICAL_KEYS: (keyof typeof Formations)[] = ['OFENSIVA', 'EQUILIBRADA', 'DEFENSIVA'];

/** Peso de cada família de papel na força defensiva do time (quanto ele "aguenta" sem ser goleado). */
const DEFENSIVE_ROLE_WEIGHT: Record<RoleFamily, number> = {
  DEFENSOR: 1,
  MEIA: 0.6,
  ATACANTE: 0.25,
};
const GK_DEFENSIVE_WEIGHT = 0.3;

/** Diferença de equilíbrio defensivo (em pontos de variância) considerada "praticamente igual". */
const DEFENSIVE_TIE_EPSILON = 6;

interface TeamData {
  id: number;
  name: string;
  tacticalSystem: keyof typeof Formations;
  players: TeamSlotPlayer[];
  bench: TeamSlotPlayer[];
  reqs: (FormationSlot & { originalIndex: number })[];
  gk?: Player;
}

const sumSquaredDeviation = (values: number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
};

const addPlayerToTeam = (
  team: TeamData,
  player: Player,
  slot: FormationSlot,
  improvised: boolean
) => {
  const labels = getRoleLabels(slot.family, improvised);
  team.players.push({
    player,
    assignedRole: slot.id,
    roleScore: slot.calcScore(player),
    improvisationPenalty: improvised ? 1 : 0,
    ...labels,
  });
};

const selectBestPlayerIndex = (slot: FormationSlot, pool: Player[], noise: number): number => {
  let bestNativeIdx = -1, bestNativeScore = -Infinity;
  let bestFallbackIdx = -1, bestFallbackScore = -Infinity;

  for (let i = 0; i < pool.length; i++) {
    const player = pool[i];
    const score = slot.calcScore(player) + noise;
    if (slot.allowedOriginalPositions.includes(player.position)) {
      if (score > bestNativeScore) { bestNativeScore = score; bestNativeIdx = i; }
    } else if (isImprovisationAllowed(player.position, slot.family)) {
      if (score > bestFallbackScore) { bestFallbackScore = score; bestFallbackIdx = i; }
    }
  }
  return bestNativeIdx !== -1 ? bestNativeIdx : bestFallbackIdx;
};

export const generateTeams = (
  players: Player[],
  formationType: FormationType | FormationType[],
  numTeams: number,
  numSimulations: number = 2500,
  neverScaleGoalkeepers: boolean = false,
  maxSixLinePlayers: boolean = false
): SimulationResult[] => {
  const pool = players.filter(p => p.active);
  if (pool.length < numTeams * 6) return [];

  const nativeGks = pool.filter(p => p.isGoalkeeper);
  let targetGkCount = !neverScaleGoalkeepers ? Math.min(nativeGks.length, numTeams) : 0;
  if (!neverScaleGoalkeepers && numTeams === 3) {
    if (pool.length === 20) targetGkCount = Math.min(nativeGks.length, 2);
    else if (pool.length === 19) targetGkCount = Math.min(nativeGks.length, 1);
  }
  const goalkeeperCombos = targetGkCount > 0 ? getCombinations(nativeGks, targetGkCount) : [];

  const results: SimulationResult[] = [];

  for (let iter = 0; iter < numSimulations; iter++) {
    const workingPool = [...pool];
    const getNoise = () => (Math.random() - 0.5) * 1.5;
    const currentScore = (team: TeamData) => team.players.reduce((sum, tp) => sum + tp.roleScore, 0);

    const teamsData: TeamData[] = Array.from({ length: numTeams }, (_, i) => {
      const requested = Array.isArray(formationType) ? (formationType[i] ?? 'QUALQUER') : formationType;
      const key = requested === 'QUALQUER'
        ? TACTICAL_KEYS[Math.floor(Math.random() * TACTICAL_KEYS.length)]
        : requested as keyof typeof Formations;
      return {
        id: i + 1,
        name: `Time ${i + 1}`,
        tacticalSystem: key,
        players: [],
        bench: [],
        reqs: Formations[key].map((slot, idx) => ({ ...slot, originalIndex: idx })),
      };
    });

    if (goalkeeperCombos.length > 0) {
      const combo = goalkeeperCombos[Math.floor(Math.random() * goalkeeperCombos.length)];
      for (let t = 0; t < combo.length; t++) {
        const idx = workingPool.findIndex(p => p.id === combo[t].id);
        if (idx === -1) continue;
        const gkPlayer = workingPool.splice(idx, 1)[0];
        teamsData[t].gk = gkPlayer;
        teamsData[t].players.push({
          player: gkPlayer,
          assignedRole: 'Goleiro',
          roleScore: scoreGoalkeeper(gkPlayer),
          improvisationPenalty: 0,
          roleShort: 'GK',
          roleLabel: 'Goleiro',
        });
      }
    }

    workingPool.sort(() => Math.random() - 0.5);

    const assignSlot = (team: TeamData, slot: FormationSlot & { originalIndex: number }): boolean => {
      if (workingPool.length === 0) return false;
      const idx = selectBestPlayerIndex(slot, workingPool, getNoise());
      if (idx === -1) return false;
      const chosen = workingPool.splice(idx, 1)[0];
      team.reqs = team.reqs.filter(r => r.originalIndex !== slot.originalIndex);
      const improvised = !slot.allowedOriginalPositions.includes(chosen.position);
      addPlayerToTeam(team, chosen, slot, improvised);
      return true;
    };

    // Ordem de preenchimento: Goleiro (já feito) -> Defensor -> Atacante -> Meia.
    // Defesa entra primeiro para garantir prioridade sobre os jogadores disponíveis;
    // Meia entra por último porque é a única posição que aceita qualquer improviso,
    // então sobra naturalmente para quem restar no elenco.
    let validGeneration = true;
    const phases: RoleFamily[] = ['DEFENSOR', 'ATACANTE', 'MEIA'];
    for (const family of phases) {
      const pending = teamsData
        .flatMap(t => t.reqs.filter(r => r.family === family).map(r => ({ team: t, req: r })))
        .sort((a, b) => currentScore(a.team) - currentScore(b.team));
      for (const { team, req } of pending) {
        if (!assignSlot(team, req)) { validGeneration = false; break; }
      }
      if (!validGeneration) break;
    }
    if (!validGeneration) continue;

    const missingLinePlayers = teamsData.some(t => t.players.filter(p => p.assignedRole !== 'Goleiro').length < 6);
    if (missingLinePlayers) continue;

    // Distribuição igualitária de jogadores de linha extras (se houver sobra e não estiver limitado a 6).
    if (!maxSixLinePlayers) {
      const extraPerTeam = Math.floor(workingPool.length / numTeams);
      if (extraPerTeam > 0) {
        const extraSlot: FormationSlot = { id: 'Meia Extra', family: 'MEIA', allowedOriginalPositions: ['MEIA'], calcScore: scoreMeiaRole };
        for (let step = 0; step < extraPerTeam; step++) {
          for (let t = 0; t < numTeams; t++) {
            const idx = selectBestPlayerIndex(extraSlot, workingPool, getNoise());
            if (idx === -1) continue;
            const chosen = workingPool.splice(idx, 1)[0];
            const improvised = chosen.position !== 'MEIA';
            addPlayerToTeam(teamsData[t], chosen, extraSlot, improvised);
          }
        }
      }
    }

    // O restante vai para o banco de reservas, distribuído uniformemente.
    let benchIdx = 0;
    while (workingPool.length > 0) {
      const player = workingPool.shift()!;
      const targetTeam = teamsData[benchIdx % numTeams];
      targetTeam.bench.push({
        player,
        assignedRole: posToLabel(player.position),
        roleScore: scoreNativePosition(player),
        improvisationPenalty: 0,
        roleShort: player.position === 'DEFENSOR' ? 'DEF' : player.position === 'ATACANTE' ? 'ATA' : 'MEI',
        roleLabel: posToLabel(player.position),
      });
      benchIdx++;
    }

    const finalTeams: Team[] = teamsData.map(t => {
      const sumScores = t.players.reduce((s, tp) => s + tp.roleScore, 0);
      const totalPenalty = t.players.reduce((s, tp) => s + tp.improvisationPenalty, 0);
      const avgScore = t.players.length ? sumScores / t.players.length : 1;
      const overall = Math.max(0, Math.min(100, Math.round((avgScore / 6) * 100) - totalPenalty * 3));

      const benchSum = t.bench.reduce((s, bp) => s + bp.roleScore, 0);
      const benchOverall = t.bench.length
        ? Math.max(0, Math.min(100, Math.round((benchSum / t.bench.length / 6) * 100)))
        : 0;

      const lineDefenders = t.players.filter(tp => tp.assignedRole !== 'Goleiro');
      const weightedDefSum = lineDefenders.reduce((s, tp) => {
        const family: RoleFamily = tp.roleShort === 'DEF' ? 'DEFENSOR' : tp.roleShort === 'ATA' ? 'ATACANTE' : 'MEIA';
        return s + defensiveContribution(tp.player) * DEFENSIVE_ROLE_WEIGHT[family];
      }, 0);
      const weightSum = lineDefenders.reduce((s, tp) => {
        const family: RoleFamily = tp.roleShort === 'DEF' ? 'DEFENSOR' : tp.roleShort === 'ATA' ? 'ATACANTE' : 'MEIA';
        return s + DEFENSIVE_ROLE_WEIGHT[family];
      }, 0);
      const lineDefScore = weightSum > 0 ? weightedDefSum / weightSum : 0;
      const gkScore = t.gk ? scoreGoalkeeper(t.gk) : null;
      const blendedDef = gkScore !== null ? lineDefScore * (1 - GK_DEFENSIVE_WEIGHT) + gkScore * GK_DEFENSIVE_WEIGHT : lineDefScore;
      const defensiveOverall = Math.max(0, Math.min(100, Math.round((blendedDef / 6) * 100)));

      return {
        id: t.id,
        name: t.name,
        overall,
        benchOverall,
        defensiveOverall,
        tacticalSystem: t.tacticalSystem,
        players: t.players,
        bench: t.bench,
      };
    });

    const overalls = finalTeams.map(t => t.overall);
    const defOveralls = finalTeams.map(t => t.defensiveOverall);
    const totalImprov = teamsData.reduce((acc, t) => acc + t.players.reduce((s, p) => s + p.improvisationPenalty, 0), 0);
    const benchToTitularDiff = finalTeams.reduce((acc, t) => acc + Math.abs(t.overall - (t.benchOverall ?? 0)), 0);

    const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
    const scoreDeviation = Math.sqrt(overalls.reduce((a, b) => a + (b - mean) ** 2, 0) / overalls.length);

    results.push({
      id: crypto.randomUUID(),
      teams: finalTeams,
      scoreDeviation,
      totalImprov,
      equilibrium: sumSquaredDeviation(overalls),
      defensiveEquilibrium: sumSquaredDeviation(defOveralls),
      benchToTitularDiff,
    });
  }

  // Defesa primeiro: minimiza a diferença de força defensiva entre os times.
  // Só usa o equilíbrio geral / improviso / banco como critério de desempate,
  // para não sacrificar demais o resto do time em nome de um empate técnico na defesa.
  results.sort((a, b) => {
    if (Math.abs(a.defensiveEquilibrium - b.defensiveEquilibrium) > DEFENSIVE_TIE_EPSILON) {
      return a.defensiveEquilibrium - b.defensiveEquilibrium;
    }
    if (a.equilibrium !== b.equilibrium) return a.equilibrium - b.equilibrium;
    if (a.totalImprov !== b.totalImprov) return a.totalImprov - b.totalImprov;
    if (a.benchToTitularDiff !== b.benchToTitularDiff) return a.benchToTitularDiff - b.benchToTitularDiff;
    return a.scoreDeviation - b.scoreDeviation;
  });

  return results;
};
