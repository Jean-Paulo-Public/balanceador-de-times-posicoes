// Gerador de divisões candidatas (quem-está-com-quem, mínimos por posição,
// reserva de goleiro, teto de atacantes). Usado internamente por `balance.ts`
// como fonte de divisões viáveis — não é mais um motor alternativo exposto ao
// usuário (a UI só chama `balanceTeams`/`balanceTeamsOptions`).

import type { Player, Team, TeamSlotPlayer, SimulationResult, Position } from '../domain/types';
import { posToLabel } from '../domain/types';
import { isPivot, isFast, hasGoodBuildUp, hasLowRecovery, overallOf } from './playerModel';
import { getCombinations } from './combinatorics';

/** Layout de vagas por setor (fora o goleiro) — as três somam 6 jogadores de linha. */
interface Layout { def: number; mei: number; ata: number }
const LAYOUT_OFENSIVA: Layout = { def: 2, mei: 2, ata: 2 }; // 2-2-2
const LAYOUT_DEFENSIVA: Layout = { def: 2, mei: 3, ata: 1 }; // 2-3-1
const LAYOUT_EQUILIBRADA: Layout = { def: 1, mei: 4, ata: 1 }; // 1-4-1

/**
 * Escolhe o layout de vagas que melhor encaixa nas contagens reais de
 * defensores e atacantes de um time:
 *  - 2+ defensores e 2+ atacantes  -> 2-2-2
 *  - 2+ defensores e <2 atacantes  -> 2-3-1
 *  - <2 defensores (qualquer nº de atacantes) -> 1-4-1
 */
const chooseLayout = (numDefenders: number, numAttackers: number): Layout => {
  if (numDefenders >= 2 && numAttackers >= 2) return LAYOUT_OFENSIVA;
  if (numDefenders >= 2) return LAYOUT_DEFENSIVA;
  return LAYOUT_EQUILIBRADA;
};

/** Um time não pode ter mais que isso de atacantes de origem na linha (regra dura). */
const MAX_ATTACKERS = 4;
/**
 * Ao garantir o mínimo de 1 por posição, dá-se preferência a quem tem overall
 * >= isso. CONVERSÃO DE ESCALA (estrela 0–5 -> overall 0–100): o valor antigo
 * era 3 (estrelas) numa escala em que o máximo é 5 -> 3/5 = 60% -> 60 (0–100).
 * Não é coincidência ter virado um número "redondo": é só reaplicar a mesma
 * fração ao teto novo (100 em vez de 5).
 */
const PREFERRED_MIN_OVERALL = 60;
/** Jogadores de linha por time (fora o goleiro). As três formações somam 6. */
const LINE_SIZE = 6;
/**
 * Ruído aplicado à nota na hora de escolher, pra variar os cenários entre
 * simulações. CONVERSÃO DE ESCALA: o valor antigo era 0,75 numa escala 0–5
 * (amplitude relativa de 0,75/5 = 15% do teto). Simplesmente multiplicar por
 * 20 (escala nova é 20x maior) preserva essa MESMA amplitude relativa:
 * 0,75 × 20 = 15 (15% de 100) — NÃO reaproveita o número 0,75 cru, que na
 * escala nova seria ruído desprezível (quase não desempataria nada).
 */
const NOISE_AMPLITUDE = 15;

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
  /**
   * Espalha entre os times (Proposta 1): 1 por time de "boa saída de bola" e
   * "veloz" (excedente distribuído normalmente), e limita os pivôs a
   * ceil(pivôs/times) por time (o mínimo que der).
   */
  spreadTraits?: boolean;
}

interface TeamData {
  id: number;
  name: string;
  gk?: Player;
  line: Player[];
  bench: Player[];
}

type Predicate = (p: Player) => boolean;
type Eligible = (t: TeamData, p: Player) => boolean;

const lineSum = (t: TeamData): number => t.line.reduce((s, p) => s + overallOf(p), 0);
const attackerCount = (t: TeamData): number => t.line.filter(p => p.position === 'ATACANTE').length;
const pivotLineCount = (t: TeamData): number => t.line.filter(p => isPivot(p)).length;
const hasPosition = (t: TeamData, pos: Position): boolean => t.line.some(p => p.position === pos);
const teamHasTrait = (t: TeamData, pred: Predicate): boolean => (t.gk ? pred(t.gk) : false) || t.line.some(pred);
const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const maxByOverall = (arr: Player[]): Player => arr.reduce((best, p) => (overallOf(p) > overallOf(best) ? p : best), arr[0]);

const variance = (values: number[]): number => {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
};

const canReceive: Eligible = (t, player) =>
  !(player.position === 'ATACANTE' && attackerCount(t) >= MAX_ATTACKERS);

/** Escolhe, dentre `candidates`, o de maior nota (com ruído) e remove do pool. */
const takeBest = (working: Player[], candidates: Player[], getNoise: () => number): Player | null => {
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (const cand of candidates) {
    const score = overallOf(cand) + getNoise();
    if (score > bestScore) {
      bestScore = score;
      bestIdx = working.indexOf(cand);
    }
  }
  if (bestIdx === -1) return null;
  return working.splice(bestIdx, 1)[0];
};

/** Atribui um jogador ao time mais fraco (menor soma de overall) que consiga recebê-lo. */
const assignToWeakestEligible = (
  teams: TeamData[],
  working: Player[],
  getNoise: () => number,
  needsSlot: (t: TeamData) => boolean,
  eligible: Eligible = canReceive
): boolean => {
  const candidatesTeams = teams.filter(needsSlot).sort((a, b) => lineSum(a) - lineSum(b));
  for (const team of candidatesTeams) {
    const elig = working.filter(p => eligible(team, p));
    if (elig.length === 0) continue;
    const chosen = takeBest(working, elig, getNoise);
    if (chosen) {
      team.line.push(chosen);
      return true;
    }
  }
  return false;
};

/**
 * Espalha um jogador que satisfaz `pred` por time: cada time que ainda não tem
 * nenhum recebe um (o time mais fraco primeiro), até acabarem os candidatos.
 * Usado pros traços (boa saída de bola, veloz, pivô) na Proposta 1.
 */
const spreadOnePerTeam = (teams: TeamData[], working: Player[], pred: Predicate, getNoise: () => number) => {
  let progressed = true;
  while (progressed) {
    progressed = false;
    const needing = teams
      .filter(t => t.line.length < LINE_SIZE && !teamHasTrait(t, pred))
      .sort((a, b) => lineSum(a) - lineSum(b));
    if (needing.length === 0) break;
    const team = needing[0];
    const holders = working.filter(p => pred(p) && canReceive(team, p));
    if (holders.length === 0) break;
    const chosen = takeBest(working, holders, getNoise);
    if (chosen) {
      team.line.push(chosen);
      progressed = true;
    }
  }
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
  roleScore: overallOf(player),
  roleShort,
  roleLabel,
  improvised,
});

/**
 * Escolhe qual meia sobe pro ataque quando o time não tem atacante de origem:
 * 1º um com "facilidade em ser pivô", 2º um com "recompõe pouco"; em empate
 * (vários candidatos) ou sem nenhuma tag, o de maior overall.
 */
export const pickImprovisedAttacker = (midfielders: Player[]): Player | null => {
  if (midfielders.length === 0) return null;
  const pivots = midfielders.filter(p => isPivot(p));
  if (pivots.length > 0) return maxByOverall(pivots);
  const lazy = midfielders.filter(p => hasLowRecovery(p));
  if (lazy.length > 0) return maxByOverall(lazy);
  return maxByOverall(midfielders);
};

/**
 * Monta o campinho de um time: melhores zagueiros na zaga, melhores atacantes no
 * ataque, resto no meio. Sem atacante de origem, sobe um meia pro ataque; sem
 * zagueiro de origem, um MEIA (preferência sobre ATACANTE) recua pra zaga.
 * A formação é a que melhor encaixa nas contagens de defensores e atacantes.
 */
const arrangeTeam = (team: TeamData): { slots: TeamSlotPlayer[] } => {
  const byOverallDesc = (a: Player, b: Player) => overallOf(b) - overallOf(a);
  const naturalDef = team.line.filter(p => p.position === 'DEFENSOR').sort(byOverallDesc);
  const naturalAta = team.line.filter(p => p.position === 'ATACANTE').sort(byOverallDesc);
  const usedIds = new Set<string>();

  let improvisedAttacker: Player | null = null;
  if (naturalAta.length === 0) {
    improvisedAttacker = pickImprovisedAttacker(team.line.filter(p => p.position === 'MEIA'));
  }
  const effectiveAttackers = naturalAta.length > 0 ? naturalAta.length : improvisedAttacker ? 1 : 0;

  const layout = chooseLayout(naturalDef.length, effectiveAttackers);

  const defStarters = naturalDef.slice(0, layout.def);
  defStarters.forEach(p => usedIds.add(p.id));

  const ataStarters = naturalAta.length > 0
    ? naturalAta.slice(0, layout.ata)
    : improvisedAttacker
      ? [improvisedAttacker]
      : [];
  ataStarters.forEach(p => usedIds.add(p.id));

  const improvisedDefenders: Player[] = [];
  if (defStarters.length < layout.def) {
    const availMids = team.line.filter(p => p.position === 'MEIA' && !usedIds.has(p.id)).sort(byOverallDesc);
    const availAtas = team.line.filter(p => p.position === 'ATACANTE' && !usedIds.has(p.id)).sort(byOverallDesc);
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

  return { slots };
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
    spreadTraits = false,
  } = options;

  const pool = players.filter(p => p.active);
  if (pool.length < numTeams * LINE_SIZE) return [];

  const nativeGks = pool.filter(p => p.isGoalkeeper);
  const spareCapacity = Math.max(0, pool.length - numTeams * LINE_SIZE);
  const targetGkCount = neverScaleGoalkeepers ? 0 : Math.min(nativeGks.length, numTeams, spareCapacity);
  const goalkeeperCombos = targetGkCount > 0 ? getCombinations(nativeGks, targetGkCount) : [];

  // Teto de pivôs por time (só na Proposta 1): 1 por time, subindo pro mínimo
  // possível (ceil) quando há mais pivôs do que times.
  const totalPivots = pool.filter(p => isPivot(p)).length;
  const pivotCap = spreadTraits && totalPivots > 0 ? Math.max(1, Math.ceil(totalPivots / numTeams)) : Infinity;
  const eligibleCapped: Eligible = (t, p) =>
    canReceive(t, p) && (!isPivot(p) || pivotLineCount(t) < pivotCap);

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

    // 2) (opcional, Proposta 1) espalha 1 por time de boa saída de bola, veloz e pivô.
    if (spreadTraits) {
      spreadOnePerTeam(teams, working, p => hasGoodBuildUp(p), getNoise);
      spreadOnePerTeam(teams, working, p => isFast(p), getNoise);
      spreadOnePerTeam(teams, working, p => isPivot(p), getNoise);
    }

    // 4) (opcional) 1 jogador de cada posição por time, preferindo overall >= PREFERRED_MIN_OVERALL.
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
          const preferred = ofPos.filter(p => overallOf(p) >= PREFERRED_MIN_OVERALL);
          const chosen = takeBest(working, preferred.length ? preferred : ofPos, getNoise);
          if (chosen) {
            team.line.push(chosen);
            progressed = true;
          }
        }
      }
    }

    // 5) Completa cada time até 6 de linha, reforçando o mais fraco. Respeita o
    // teto de pivôs quando dá; se travar, relaxa o teto pra não inviabilizar.
    let feasible = true;
    while (teams.some(t => t.line.length < LINE_SIZE) && working.length > 0) {
      const assigned =
        assignToWeakestEligible(teams, working, getNoise, t => t.line.length < LINE_SIZE, eligibleCapped) ||
        assignToWeakestEligible(teams, working, getNoise, t => t.line.length < LINE_SIZE, canReceive);
      if (!assigned) { feasible = false; break; }
    }
    if (!feasible) continue;
    if (teams.some(t => t.line.length < LINE_SIZE)) continue;

    // 6) Jogadores extras de linha (se não estiver limitado a 6), distribuídos igualitariamente.
    if (!maxSixLinePlayers && working.length >= numTeams) {
      const extraRounds = Math.floor(working.length / numTeams);
      for (let round = 0; round < extraRounds; round++) {
        for (let t = 0; t < numTeams; t++) {
          const cap = (tm: TeamData) => tm.line.length < LINE_SIZE + round + 1;
          const ok =
            assignToWeakestEligible(teams, working, getNoise, cap, eligibleCapped) ||
            assignToWeakestEligible(teams, working, getNoise, cap, canReceive);
          if (!ok) break;
        }
      }
    }

    // 7) O restante vai pro banco, distribuído uniformemente.
    let benchIdx = 0;
    while (working.length > 0) {
      teams[benchIdx % numTeams].bench.push(working.shift()!);
      benchIdx++;
    }

    // 8) Monta campinhos, overall e banco de cada time.
    const finalTeams: Team[] = teams.map(t => {
      const { slots } = arrangeTeam(t);
      const onFieldOveralls = [...(t.gk ? [overallOf(t.gk)] : []), ...t.line.map(p => overallOf(p))];
      const overall = mean(onFieldOveralls);

      const benchSlots: TeamSlotPlayer[] = t.bench.map(p =>
        makeSlot(p, posToLabel(p.position), POSITION_ROLE_SHORT[p.position], posToLabel(p.position))
      );
      const benchOverall = t.bench.length ? mean(t.bench.map(p => overallOf(p))) : undefined;

      return {
        id: t.id,
        name: t.name,
        overall,
        benchOverall,
        players: slots,
        bench: benchSlots,
      };
    });

    // 9) Assinatura da escalação, pra não repetir cenários que são a mesma divisão.
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
 *  - Proposta 1: 1 def + 1 meia + 1 atacante + 1 goleiro por time, e
 *    espalha "boa saída de bola", "veloz" e pivô entre os times.
 *  - Proposta 2: 1 def + 1 meia + 1 atacante + 1 goleiro por time
 *    (sem o espalhamento de traços), diferente da 1.
 *  - Proposta 3: só a garantia de 1 goleiro por time.
 * Todas balanceadas pelo overall e respeitando o teto de 4 atacantes.
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
    { title: 'Proposta 1', list: generateTeams(players, numTeams, { ...base, enforcePositionMin: true, spreadTraits: true }) },
    { title: 'Proposta 2', list: generateTeams(players, numTeams, { ...base, enforcePositionMin: true }) },
    { title: 'Proposta 3', list: generateTeams(players, numTeams, { ...base, enforcePositionMin: false }) },
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
