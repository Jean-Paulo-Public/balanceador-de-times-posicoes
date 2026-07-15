import type { Player, Team, TeamSlotPlayer, SimulationResult, Position, FormationType } from '../domain/types';
import { FORMATIONS, chooseFormation } from '../domain/formations';
import { posToLabel } from '../domain/playerAttributes';
import { getCombinations } from './combinatorics';

/** Um time não pode ter mais que isso de atacantes de origem na linha (regra dura). */
const MAX_ATTACKERS = 4;
/** Ao garantir o mínimo de 1 por posição, dá-se preferência a quem tem >= isso. */
const PREFERRED_MIN_RATING = 3;
/** Jogadores de linha por time (fora o goleiro). As três formações somam 6. */
const LINE_SIZE = 6;
/** Ruído aplicado à nota na hora de escolher, pra variar os cenários entre simulações. */
const NOISE_AMPLITUDE = 0.75;

const POSITION_ROLE_SHORT: Record<Position, string> = {
  DEFENSOR: 'DEF',
  MEIA: 'MEI',
  ATACANTE: 'ATA',
};

/** Ordem de garantia do mínimo por posição: defesa e ataque primeiro (mais escassos), meio por último. */
const MIN_GUARANTEE_ORDER: Position[] = ['DEFENSOR', 'ATACANTE', 'MEIA'];

export interface GenerateOptions {
  numSimulations?: number;
  neverScaleGoalkeepers?: boolean;
  maxSixLinePlayers?: boolean;
  /** Garante (se possível) 1 defensor, 1 meia e 1 atacante de origem por time. */
  enforcePositionMin?: boolean;
  /** Garante (se possível) pelo menos 1 capitão por time. */
  enforceCaptainPerTeam?: boolean;
}

interface TeamData {
  id: number;
  name: string;
  gk?: Player;
  line: Player[];
  bench: Player[];
}

const lineSum = (t: TeamData): number => t.line.reduce((s, p) => s + p.rating, 0);
const attackerCount = (t: TeamData): number => t.line.filter(p => p.position === 'ATACANTE').length;
const hasPosition = (t: TeamData, pos: Position): boolean => t.line.some(p => p.position === pos);
const hasCaptain = (t: TeamData): boolean => !!t.gk?.isCaptain || t.line.some(p => p.isCaptain);
const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const maxByRating = (arr: Player[]): Player => arr.reduce((best, p) => (p.rating > best.rating ? p : best), arr[0]);

const variance = (values: number[]): number => {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
};

const canReceive = (t: TeamData, player: Player): boolean =>
  !(player.position === 'ATACANTE' && attackerCount(t) >= MAX_ATTACKERS);

/** Escolhe, dentre `candidates`, o de maior nota (com ruído) e remove do pool. */
const takeBest = (working: Player[], candidates: Player[], getNoise: () => number): Player | null => {
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (const cand of candidates) {
    const score = cand.rating + getNoise();
    if (score > bestScore) {
      bestScore = score;
      bestIdx = working.indexOf(cand);
    }
  }
  if (bestIdx === -1) return null;
  return working.splice(bestIdx, 1)[0];
};

/** Atribui um jogador ao time mais fraco (menor soma de estrelas) que consiga recebê-lo. */
const assignToWeakestEligible = (
  teams: TeamData[],
  working: Player[],
  getNoise: () => number,
  needsSlot: (t: TeamData) => boolean
): boolean => {
  const candidatesTeams = teams.filter(needsSlot).sort((a, b) => lineSum(a) - lineSum(b));
  for (const team of candidatesTeams) {
    const eligible = working.filter(p => canReceive(team, p));
    if (eligible.length === 0) continue;
    const chosen = takeBest(working, eligible, getNoise);
    if (chosen) {
      team.line.push(chosen);
      return true;
    }
  }
  return false;
};

const makeSlot = (
  player: Player,
  assignedRole: string,
  roleShort: string,
  roleLabel: string,
  improvised = false
): TeamSlotPlayer => ({
  player,
  assignedRole,
  roleScore: player.rating,
  roleShort,
  roleLabel,
  improvised,
});

/**
 * Escolhe qual meia sobe pro ataque quando o time não tem atacante de origem:
 * 1º um com "facilidade em ser pivô", 2º um com "recompõe pouco"; em empate
 * (vários candidatos) ou sem nenhuma tag, o de mais estrelas.
 */
export const pickImprovisedAttacker = (midfielders: Player[]): Player | null => {
  if (midfielders.length === 0) return null;
  const pivots = midfielders.filter(p => p.pivotFriendly);
  if (pivots.length > 0) return maxByRating(pivots);
  const lazy = midfielders.filter(p => p.recompoePouco);
  if (lazy.length > 0) return maxByRating(lazy);
  return maxByRating(midfielders);
};

/**
 * Monta o campinho de um time: os melhores zagueiros vão pra zaga, os melhores
 * atacantes pro ataque, e todo o resto completa o meio. Quando falta gente de
 * origem numa ponta, improvisa:
 *  - sem atacante de origem: sobe um meia pro ataque (ver pickImprovisedAttacker);
 *  - sem zagueiro de origem pra vaga: um MEIA tem preferência sobre um ATACANTE
 *    pra recuar e cobrir a zaga.
 * A formação exibida é a que melhor encaixa nas contagens de defensores e atacantes.
 */
const arrangeTeam = (team: TeamData): { slots: TeamSlotPlayer[]; formation: FormationType } => {
  const byRatingDesc = (a: Player, b: Player) => b.rating - a.rating;
  const naturalDef = team.line.filter(p => p.position === 'DEFENSOR').sort(byRatingDesc);
  const naturalAta = team.line.filter(p => p.position === 'ATACANTE').sort(byRatingDesc);
  const usedIds = new Set<string>();

  // Improviso de ataque: sem atacante de origem, sobe um meia pro ataque.
  let improvisedAttacker: Player | null = null;
  if (naturalAta.length === 0) {
    improvisedAttacker = pickImprovisedAttacker(team.line.filter(p => p.position === 'MEIA'));
  }
  const effectiveAttackers = naturalAta.length > 0 ? naturalAta.length : improvisedAttacker ? 1 : 0;

  const formation = chooseFormation(naturalDef.length, effectiveAttackers);
  const layout = FORMATIONS[formation];

  // Zaga: melhores zagueiros de origem.
  const defStarters = naturalDef.slice(0, layout.def);
  defStarters.forEach(p => usedIds.add(p.id));

  // Ataque: melhores atacantes de origem, ou o meia improvisado.
  const ataStarters = naturalAta.length > 0
    ? naturalAta.slice(0, layout.ata)
    : improvisedAttacker
      ? [improvisedAttacker]
      : [];
  ataStarters.forEach(p => usedIds.add(p.id));

  // Improviso de defesa: se faltou zagueiro de origem pra vaga, um MEIA tem
  // preferência sobre um ATACANTE pra recuar (dentro de cada grupo, o de mais estrelas).
  const improvisedDefenders: Player[] = [];
  if (defStarters.length < layout.def) {
    const availMids = team.line.filter(p => p.position === 'MEIA' && !usedIds.has(p.id)).sort(byRatingDesc);
    const availAtas = team.line.filter(p => p.position === 'ATACANTE' && !usedIds.has(p.id)).sort(byRatingDesc);
    const defPool = [...availMids, ...availAtas];
    const needed = layout.def - defStarters.length;
    for (let k = 0; k < needed && k < defPool.length; k++) {
      improvisedDefenders.push(defPool[k]);
      usedIds.add(defPool[k].id);
    }
  }

  const allDefenders = [...defStarters, ...improvisedDefenders];
  const mids = team.line.filter(p => !usedIds.has(p.id));

  const slots: TeamSlotPlayer[] = [];
  if (team.gk) slots.push(makeSlot(team.gk, 'Goleiro', 'GK', 'Goleiro'));
  allDefenders.forEach((p, i) => {
    const improvised = p.position !== 'DEFENSOR';
    slots.push(makeSlot(p, `Defensor ${i + 1}`, 'DEF', improvised ? 'Defensor (improvisado)' : 'Defensor', improvised));
  });
  mids.forEach((p, i) => slots.push(makeSlot(p, `Meia ${i + 1}`, 'MEI', 'Meia')));
  ataStarters.forEach((p, i) => {
    const improvised = p.position !== 'ATACANTE';
    slots.push(makeSlot(p, `Atacante ${i + 1}`, 'ATA', improvised ? 'Atacante (improvisado)' : 'Atacante', improvised));
  });

  return { slots, formation };
};

export const generateTeams = (
  players: Player[],
  numTeams: number,
  options: GenerateOptions = {}
): SimulationResult[] => {
  const {
    numSimulations = 3000,
    neverScaleGoalkeepers = false,
    maxSixLinePlayers = false,
    enforcePositionMin = true,
    enforceCaptainPerTeam = false,
  } = options;

  const pool = players.filter(p => p.active);
  if (pool.length < numTeams * LINE_SIZE) return [];

  const nativeGks = pool.filter(p => p.isGoalkeeper);
  const spareCapacity = Math.max(0, pool.length - numTeams * LINE_SIZE);
  const targetGkCount = neverScaleGoalkeepers ? 0 : Math.min(nativeGks.length, numTeams, spareCapacity);
  const goalkeeperCombos = targetGkCount > 0 ? getCombinations(nativeGks, targetGkCount) : [];

  const results: SimulationResult[] = [];
  const seenSignatures = new Set<string>();

  for (let iter = 0; iter < numSimulations; iter++) {
    const getNoise = () => (Math.random() - 0.5) * NOISE_AMPLITUDE;

    const teams: TeamData[] = Array.from({ length: numTeams }, (_, i) => ({
      id: i + 1,
      name: `Time ${i + 1}`,
      line: [],
      bench: [],
    }));

    const working = [...pool];

    // 1) Reserva de goleiros (um por time, embaralhando qual goleiro vai pra qual time).
    if (goalkeeperCombos.length > 0) {
      const combo = [...goalkeeperCombos[Math.floor(Math.random() * goalkeeperCombos.length)]]
        .sort(() => Math.random() - 0.5);
      for (let t = 0; t < combo.length; t++) {
        const idx = working.findIndex(p => p.id === combo[t].id);
        if (idx === -1) continue;
        teams[t].gk = working.splice(idx, 1)[0];
      }
    }

    working.sort(() => Math.random() - 0.5);

    // 2) (opcional) Garante pelo menos 1 capitão por time.
    if (enforceCaptainPerTeam) {
      for (const team of teams) {
        if (hasCaptain(team) || team.line.length >= LINE_SIZE) continue;
        const idx = working.findIndex(p => p.isCaptain && canReceive(team, p));
        if (idx === -1) continue;
        team.line.push(working.splice(idx, 1)[0]);
      }
    }

    // 3) (opcional) Garante 1 jogador de cada posição por time, preferindo >= 3 estrelas.
    if (enforcePositionMin) {
      for (const pos of MIN_GUARANTEE_ORDER) {
        let progressed = true;
        while (progressed) {
          progressed = false;
          const needing = teams
            .filter(t => t.line.length < LINE_SIZE && !hasPosition(t, pos))
            .sort((a, b) => lineSum(a) - lineSum(b));
          if (needing.length === 0) break;
          const team = needing[0];
          const ofPos = working.filter(p => p.position === pos && canReceive(team, p));
          if (ofPos.length === 0) break; // não há mais dessa posição — regra cede
          const preferred = ofPos.filter(p => p.rating >= PREFERRED_MIN_RATING);
          const chosen = takeBest(working, preferred.length ? preferred : ofPos, getNoise);
          if (chosen) {
            team.line.push(chosen);
            progressed = true;
          }
        }
      }
    }

    // 4) Completa cada time até 6 de linha, sempre reforçando o time mais fraco.
    let feasible = true;
    while (teams.some(t => t.line.length < LINE_SIZE) && working.length > 0) {
      const assigned = assignToWeakestEligible(teams, working, getNoise, t => t.line.length < LINE_SIZE);
      if (!assigned) { feasible = false; break; } // só sobraram atacantes e todos os times estão no teto
    }
    if (!feasible) continue;
    if (teams.some(t => t.line.length < LINE_SIZE)) continue;

    // 5) Jogadores extras de linha (se não estiver limitado a 6), distribuídos igualitariamente.
    if (!maxSixLinePlayers && working.length >= numTeams) {
      const extraRounds = Math.floor(working.length / numTeams);
      for (let round = 0; round < extraRounds; round++) {
        for (let t = 0; t < numTeams; t++) {
          if (!assignToWeakestEligible(teams, working, getNoise, tm => tm.line.length < LINE_SIZE + round + 1)) break;
        }
      }
    }

    // 6) O restante vai pro banco, distribuído uniformemente.
    let benchIdx = 0;
    while (working.length > 0) {
      teams[benchIdx % numTeams].bench.push(working.shift()!);
      benchIdx++;
    }

    // 7) Monta campinhos, overall e banco de cada time.
    const finalTeams: Team[] = teams.map(t => {
      const { slots, formation } = arrangeTeam(t);
      const onFieldRatings = [...(t.gk ? [t.gk.rating] : []), ...t.line.map(p => p.rating)];
      const overall = mean(onFieldRatings);

      const benchSlots: TeamSlotPlayer[] = t.bench.map(p =>
        makeSlot(p, posToLabel(p.position), POSITION_ROLE_SHORT[p.position], posToLabel(p.position))
      );
      const benchOverall = t.bench.length ? mean(t.bench.map(p => p.rating)) : undefined;

      return {
        id: t.id,
        name: t.name,
        overall,
        benchOverall,
        tacticalSystem: formation,
        players: slots,
        bench: benchSlots,
      };
    });

    // 8) Assinatura da escalação, pra não repetir cenários que são a mesma divisão.
    const ROLE_KEYS = ['GK', 'DEF', 'MEI', 'ATA'];
    const signature = finalTeams
      .map(t =>
        ROLE_KEYS.map(role => `${role}:${t.players.filter(tp => tp.roleShort === role).map(tp => tp.player.id).sort().join(',')}`).join(';')
        + '|B:' + t.bench.map(tp => tp.player.id).sort().join(',')
      )
      .join('||');
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);

    const overalls = finalTeams.map(t => t.overall);
    results.push({
      id: crypto.randomUUID(),
      teams: finalTeams,
      equilibrium: variance(overalls),
    });
  }

  results.sort((a, b) => {
    if (a.equilibrium !== b.equilibrium) return a.equilibrium - b.equilibrium;
    const spread = (r: SimulationResult) => {
      const o = r.teams.map(t => t.overall);
      return Math.max(...o) - Math.min(...o);
    };
    return spread(a) - spread(b);
  });

  return results;
};

export interface ProposalOptions {
  numSimulations?: number;
  neverScaleGoalkeepers?: boolean;
  maxSixLinePlayers?: boolean;
}

/** Assinatura canônica da DIVISÃO (quem está com quem), ignorando ordem dos times. */
const canonicalMembership = (r: SimulationResult): string =>
  r.teams
    .map(t => [...t.players, ...t.bench].map(tp => tp.player.id).sort().join(','))
    .sort()
    .join('|');

/**
 * Gera as 3 propostas exibidas juntas:
 *  - Proposta 1: (se possível) 1 def + 1 meia + 1 atacante + 1 goleiro + 1 capitão por time.
 *  - Proposta 2: 1 def + 1 meia + 1 atacante + 1 goleiro por time (sem capitão), diferente da 1.
 *  - Proposta 3: só a garantia de 1 goleiro por time (sem mínimos de posição).
 * Todas balanceadas pela estrela e respeitando o teto de 4 atacantes.
 */
export const generateProposals = (
  players: Player[],
  numTeams: number,
  opts: ProposalOptions = {}
): SimulationResult[] => {
  const base = {
    numSimulations: opts.numSimulations ?? 2500,
    neverScaleGoalkeepers: opts.neverScaleGoalkeepers ?? false,
    maxSixLinePlayers: opts.maxSixLinePlayers ?? false,
  };

  const lists: { title: string; list: SimulationResult[] }[] = [
    { title: 'Proposta 1', list: generateTeams(players, numTeams, { ...base, enforcePositionMin: true, enforceCaptainPerTeam: true }) },
    { title: 'Proposta 2', list: generateTeams(players, numTeams, { ...base, enforcePositionMin: true, enforceCaptainPerTeam: false }) },
    { title: 'Proposta 3', list: generateTeams(players, numTeams, { ...base, enforcePositionMin: false, enforceCaptainPerTeam: false }) },
  ];

  const proposals: SimulationResult[] = [];
  const used = new Set<string>();
  for (const { title, list } of lists) {
    if (list.length === 0) continue;
    const distinct = list.find(r => !used.has(canonicalMembership(r)));
    const chosen = distinct ?? list[0];
    used.add(canonicalMembership(chosen));
    proposals.push({ ...chosen, title });
  }
  return proposals;
};
