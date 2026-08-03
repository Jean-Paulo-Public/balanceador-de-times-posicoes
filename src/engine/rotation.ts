// Escalonador do rodízio de 6 jogos por time (para o mapinha exportado E para
// o custo médio de 6 jogos usado no balanceamento — Fase 6).
//
// Regras (pedido do Jean):
//  - Goleiros formam uma FILA (round-robin): um goleiro só volta ao gol depois
//    que todos os outros goleiros passaram. Ordem da fila: melhores goleiros
//    primeiro (para o jogo ficar equilibrado) — EXCETO o Jogo 1, que nunca
//    pode ser um ATACANTE (PIVO/SEGUNDO_ATACANTE/MEIA_ATACANTE): acha o
//    primeiro não-atacante da fila e move pra frente, preservando a ordem
//    relativa dos demais. Se não existir nenhum não-atacante apto, avisa
//    explicitamente (não escala um atacante em silêncio).
//  - Banco: prioridade (a) HARD — quem sentou na rodada anterior joga na
//    próxima (ninguém fica dois jogos seguidos fora); (b) entre os elegíveis a
//    sentar, vão pro banco os que sentaram MENOS vezes até ali (contagem
//    acumulada); (c) desempate por MENOR IMPACTO (maior fit total do time
//    resultante). Lógica pura em `benchRotation.ts` (`chooseBenchGroup`) — se
//    a regra (a) travar, não relaxa em silêncio: devolve aviso nomeando quem
//    ficou preso (ver `goalkeeperWarning`/`benchWarning`).
//  - A formação (sistema tático) é reinferida a cada jogo via `chooseBestSystem`
//    (húngaro) — cada jogo pode escolher um sistema diferente pra quem está em
//    campo naquele jogo.

import type { Player } from '../domain/types';
import type { BalancedTeam, BalancedSlot } from './balance';
import { effectiveGk, isAttackerPlayer } from './playerModel';
import { chooseBestSystem, type TacticalSystem, type FormationCache } from './formationModel';
import { chooseBenchGroup } from './benchRotation';

export interface GameLineup {
  game: number;
  formation: TacticalSystem;
  feasible: boolean;
  slots: BalancedSlot[];
  goalkeeperName: string | null;
  /**
   * Id de quem está no gol NESTE jogo. A nota de goleiro só entra na nota do
   * time no jogo em que ele está escalado no gol, então o custo precisa saber
   * QUEM é o goleiro por jogo — o nome não serve (pode repetir).
   */
  goalkeeperId: string | null;
  benchNames: string[];
}

export interface TeamSchedule {
  games: GameLineup[];
  /** true = o time não tem como variar (1 goleiro e sem banco) → mostrar "Jogo 1 ao 6". */
  constant: boolean;
  /** Aviso explícito quando a regra "Jogo 1 sem atacante no gol" não pôde ser satisfeita. */
  goalkeeperWarning: string | null;
  /** Aviso explícito quando a regra "ninguém repete banco em rodadas seguidas" (banco pequeno) não pôde ser satisfeita nalguma rodada. */
  benchWarning: string | null;
}

/**
 * Reordena a fila de goleiros (já ordenada melhor-primeiro) pra que o Jogo 1
 * nunca seja um atacante: acha o primeiro não-atacante e move pra frente,
 * preservando a ordem relativa dos demais. Devolve um aviso se nenhum
 * goleiro-apto não-atacante existir (a regra cede — não falha em silêncio).
 */
export const applyGame1GoalkeeperRule = (keepersBestFirst: Player[]): { queue: Player[]; warning: string | null } => {
  if (keepersBestFirst.length === 0) return { queue: keepersBestFirst, warning: null };
  const idx = keepersBestFirst.findIndex((p) => !isAttackerPlayer(p));
  if (idx === -1) {
    return {
      queue: keepersBestFirst,
      warning: 'Todos os goleiros aptos são atacantes (PIVO/Segundo Atacante/Meia-Atacante) — não deu pra evitar escalar um deles no gol do Jogo 1.',
    };
  }
  if (idx === 0) return { queue: keepersBestFirst, warning: null };
  const chosen = keepersBestFirst[idx];
  const rest = [...keepersBestFirst.slice(0, idx), ...keepersBestFirst.slice(idx + 1)];
  return { queue: [chosen, ...rest], warning: null };
};

export const buildTeamSchedule = (team: BalancedTeam, totalGames = 6, cache?: FormationCache): TeamSchedule => {
  const roster: Player[] = [
    ...team.slots.map((s) => s.player),
    ...(team.goalkeeper ? [team.goalkeeper] : []),
    ...team.bench,
  ];
  const n = roster.length;
  const fielded = team.fieldsGoalkeeper;
  const keepersBestFirst = fielded
    ? roster.filter((p) => p.isGoalkeeper).sort((a, b) => (effectiveGk(b) ?? 0) - (effectiveGk(a) ?? 0))
    : [];
  const { queue: keepers, warning: goalkeeperWarning } = applyGame1GoalkeeperRule(keepersBestFirst);
  const k = keepers.length;
  const outfielders = fielded ? roster.filter((p) => !p.isGoalkeeper) : [...roster];
  const onField = fielded ? 7 : 6;
  const benchCount = Math.max(0, n - onField);

  const baseLineup: GameLineup = {
    game: 1,
    formation: team.formation,
    feasible: team.metrics.feasible,
    slots: team.slots,
    goalkeeperName: team.goalkeeper?.name ?? null,
    goalkeeperId: team.goalkeeper?.id ?? null,
    benchNames: team.bench.map((b) => b.name),
  };

  // Sem variação possível: 1 goleiro (ou nenhum) e sem banco.
  if (k <= 1 && benchCount === 0) return { games: [baseLineup], constant: true, goalkeeperWarning, benchWarning: null };

  const games: GameLineup[] = [];
  const benchCounts = new Map<string, number>(outfielders.map((p) => [p.id, 0]));
  let benchedLastRound = new Set<string>();
  let benchWarning: string | null = null;
  for (let g = 0; g < totalGames; g++) {
    const goalie = fielded && k > 0 ? keepers[g % k] : null;
    const lineKeepers = keepers.filter((p) => p !== goalie);
    const { benched, warning } = chooseBenchGroup({
      outfielders,
      benchCount,
      benchCounts,
      benchedLastRound,
      alwaysOnField: lineKeepers,
      cache,
    });
    if (warning && !benchWarning) benchWarning = warning;
    const benchedSet = new Set(benched.map((p) => p.id));
    for (const p of benched) benchCounts.set(p.id, (benchCounts.get(p.id) ?? 0) + 1);
    benchedLastRound = benchedSet;
    const lineOutfielders = outfielders.filter((p) => !benchedSet.has(p.id));
    const linePlayers = [...lineKeepers, ...lineOutfielders].slice(0, 6);
    if (linePlayers.length !== 6) {
      games.push({ ...baseLineup, game: g + 1 });
      continue;
    }
    const inf = chooseBestSystem(linePlayers, cache);
    const slots: BalancedSlot[] = inf.assignments.map((a) => ({
      player: linePlayers[a.playerIndex],
      role: a.identity,
      zone: a.zone,
      fit: Math.round(a.fit),
      x: a.x,
      y: a.y,
    }));
    games.push({
      game: g + 1,
      formation: inf.system,
      feasible: inf.feasible,
      slots,
      goalkeeperName: goalie?.name ?? null,
      goalkeeperId: goalie?.id ?? null,
      benchNames: benched.map((b) => b.name),
    });
  }
  // Colapsa se, na prática, todos os jogos ficaram idênticos (sem variação real).
  const sig = (g: GameLineup): string =>
    [g.goalkeeperName ?? '', ...g.slots.map((s) => s.player.name).sort(), '#', ...[...g.benchNames].sort()].join('|');
  const allSame = games.every((g) => sig(g) === sig(games[0]));
  if (allSame) return { games: [games[0]], constant: true, goalkeeperWarning, benchWarning };
  return { games, constant: false, goalkeeperWarning, benchWarning };
};
