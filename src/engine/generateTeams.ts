import type { Player, Team, TeamSlotPlayer, SimulationResult, FormationType } from '../domain/types';
import { scoreGoalkeeper, scoreMeiaRole, scoreNativePosition, defensiveContribution } from './scoring';
import { isImprovisationAllowed, getImprovisationBonus, getRoleLabels, posToLabel } from './improvisation';
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

/**
 * Bônus pra priorizar, na defesa, um jogador que também sabe jogar no gol
 * (isGoalkeeper), quando o time ainda não tem nenhuma cobertura de goleiro
 * (nem um goleiro nativo escalado, nem ninguém na linha marcado como
 * isGoalkeeper). Isso garante, sempre que possível, que o time tenha pelo
 * menos alguém que consiga cobrir o gol na prática — importante porque um
 * jogador nunca pode ser escalado como goleiro E como defensor ao mesmo
 * tempo (ou é um, ou é outro): quando ele não é o goleiro titular do time,
 * ele entra normalmente na defesa, mas continua sendo "o jogador que sabe
 * jogar no gol" daquele time se precisar (inclusive pra emprestar pro time
 * de fora, ou assumir o gol se o goleiro titular não puder jogar).
 */
const GK_BACKUP_BONUS = 0.5;

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

/** O time já tem alguém que cobre o gol (o titular, ou um jogador de linha que também joga no gol)? */
const hasGkCoverage = (team: TeamData): boolean =>
  team.gk !== undefined || team.players.some(tp => tp.player.isGoalkeeper);

/** O time já tem pelo menos um Atacante de origem (não improvisado) escalado? */
const hasNativeAtacante = (team: TeamData): boolean =>
  team.players.some(tp => tp.roleShort === 'ATA' && tp.player.position === 'ATACANTE');

const isPivotMeia = (p: Player): boolean => p.position === 'MEIA' && p.pivotFriendly;

const addPlayerToTeam = (
  team: TeamData,
  player: Player,
  slot: FormationSlot,
  improvised: boolean
) => {
  const isPivotFit = improvised && slot.family === 'ATACANTE' && player.position === 'MEIA' && player.pivotFriendly;
  const labels = getRoleLabels(slot.family, improvised, false, isPivotFit);
  team.players.push({
    player,
    assignedRole: slot.id,
    roleScore: slot.calcScore(player),
    improvisationPenalty: improvised ? 1 : 0,
    ...labels,
  });
};

interface SelectionContext {
  /** Time ainda não tem cobertura de gol — dar bônus pra quem também joga no gol, na defesa. */
  needsGkBackup: boolean;
  /**
   * Time ainda não tem nenhum Atacante de origem — se a vaga de Atacante só puder ser
   * preenchida por improviso, um Meia "pivô" disponível tem prioridade absoluta sobre
   * qualquer outro Meia, mesmo que isso derrube o overall do time (é o que aconteceria
   * na prática, dado o perfil desse jogador).
   */
  forcePivotForAtacante: boolean;
}

const NO_CONTEXT: SelectionContext = { needsGkBackup: false, forcePivotForAtacante: false };

const selectBestPlayerIndex = (
  slot: FormationSlot,
  pool: Player[],
  noise: number,
  ctx: SelectionContext = NO_CONTEXT
): number => {
  let bestNativeIdx = -1, bestNativeScore = -Infinity;
  // Bucket "forçado": só populado quando o time não tem nenhum Atacante nativo e há um
  // Meia pivô disponível — tem prioridade ABSOLUTA sobre o fallback comum, mesmo que
  // outro Meia tenha nota maior (é o que aconteceria na prática, dado o perfil do jogador).
  let bestForcedIdx = -1, bestForcedScore = -Infinity;
  // Bucket "comum": fallback normal (inclui Meia pivô disputando Atacante quando o time
  // já tem um Atacante nativo — nesse caso ele só recebe um bônus pequeno, sem prioridade dura).
  let bestFallbackIdx = -1, bestFallbackScore = -Infinity;
  // Bucket "de último recurso": Meia pivô tentando vaga de Defensor — só é usado se não
  // sobrar nenhuma outra opção nos buckets acima.
  let bestLastResortIdx = -1, bestLastResortScore = -Infinity;

  const gkBonusFor = (player: Player): number =>
    ctx.needsGkBackup && slot.family === 'DEFENSOR' && player.isGoalkeeper ? GK_BACKUP_BONUS : 0;

  for (let i = 0; i < pool.length; i++) {
    const player = pool[i];

    if (slot.allowedOriginalPositions.includes(player.position)) {
      const score = slot.calcScore(player) + noise + gkBonusFor(player);
      if (score > bestNativeScore) { bestNativeScore = score; bestNativeIdx = i; }
      continue;
    }

    if (!isImprovisationAllowed(player.position, slot.family)) continue;

    const score = slot.calcScore(player) + noise + gkBonusFor(player) + getImprovisationBonus(player, slot.family);

    if (slot.family === 'DEFENSOR' && isPivotMeia(player)) {
      // Evite escalar um Meia pivô na defesa — só usa se não sobrar mais ninguém.
      if (score > bestLastResortScore) { bestLastResortScore = score; bestLastResortIdx = i; }
    } else if (slot.family === 'ATACANTE' && isPivotMeia(player) && ctx.forcePivotForAtacante) {
      // Time sem nenhum Atacante nativo: o Meia pivô tem prioridade absoluta pro ataque.
      if (score > bestForcedScore) { bestForcedScore = score; bestForcedIdx = i; }
    } else {
      if (score > bestFallbackScore) { bestFallbackScore = score; bestFallbackIdx = i; }
    }
  }

  if (bestNativeIdx !== -1) return bestNativeIdx;
  if (bestForcedIdx !== -1) return bestForcedIdx;
  if (bestFallbackIdx !== -1) return bestFallbackIdx;
  return bestLastResortIdx;
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
  // Reservar um goleiro nativo por time só é viável se sobrar gente suficiente pra
  // preencher as vagas de linha depois de tirá-los do pool. Num elenco justo (sem
  // ninguém "de sobra" além do mínimo de numTeams*6), reservar qualquer goleiro
  // dedicado inviabilizaria TODA a escalação — nesse caso a regra cede e os
  // jogadores marcados como goleiro simplesmente jogam na posição de origem deles,
  // como qualquer outro jogador, para garantir que a escalação continue possível.
  const spareCapacity = Math.max(0, pool.length - numTeams * 6);
  const targetGkCount = !neverScaleGoalkeepers ? Math.min(nativeGks.length, numTeams, spareCapacity) : 0;
  const goalkeeperCombos = targetGkCount > 0 ? getCombinations(nativeGks, targetGkCount) : [];

  const results: SimulationResult[] = [];
  // Evita que cenários com escalação IDÊNTICA (mesmos jogadores nas mesmas funções, em
  // cada time) apareçam mais de uma vez entre os resultados — não agrega nada pro
  // usuário ver a mesma escalação repetida só porque o sorteio caiu igual em
  // simulações diferentes.
  const seenSignatures = new Set<string>();

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
      const ctx: SelectionContext = {
        needsGkBackup: slot.family === 'DEFENSOR' && !hasGkCoverage(team),
        forcePivotForAtacante: slot.family === 'ATACANTE' && !hasNativeAtacante(team),
      };
      const idx = selectBestPlayerIndex(slot, workingPool, getNoise(), ctx);
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

    // Assinatura da escalação: quem joga em qual FUNÇÃO (GK/DEF/MEI/ATA), em cada
    // time, mais quem ficou no banco. Agrupa por `roleShort` (não por `assignedRole`,
    // que é o id da vaga específica, ex.: "Meia 1" vs "Meia 2") porque, pra quem olha
    // a lista de jogadores, dois cenários com os mesmos 4 Meias — só trocados entre
    // as vagas "Meia 1"/"Meia 2"/... — são visualmente a mesma escalação.
    const ROLE_KEYS = ['GK', 'DEF', 'MEI', 'ATA'];
    const signature = finalTeams
      .map(t => `${t.tacticalSystem}|`
        + ROLE_KEYS.map(role => `${role}:${t.players.filter(tp => tp.roleShort === role).map(tp => tp.player.id).sort().join(',')}`).join(';')
        + '|B:' + t.bench.map(tp => tp.player.id).sort().join(','))
      .join('||');
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);

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
