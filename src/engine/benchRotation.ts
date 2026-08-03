// Escolha do BANCO por rodada (Fase 6, regra do dono) — FUNÇÃO PURA e
// testável, separada da montagem do cronograma (`rotation.ts`). Prioridade:
//
//  (a) HARD, mas CONDICIONAL AO TAMANHO DO PRÓPRIO BANCO DO TIME NAQUELA
//      RODADA (ajuste do dono): com banco pequeno (<= `HARD_NO_REPEAT_MAX_BENCH_SIZE`,
//      ver constante abaixo), quem ficou no banco na rodada anterior JOGA
//      nesta rodada — ninguém fica dois jogos seguidos fora. Com banco maior
//      (>= o limiar + 1) essa restrição é IMPOSSÍVEL de sustentar na prática
//      (ou trava, ou vira um vaivém sem sentido) e por isso é RELAXADA:
//      repetir banco em rodadas consecutivas passa a ser permitido. O
//      limiar é POR TIME e POR RODADA — cada time avalia com o PRÓPRIO nº de
//      reservas naquela rodada, nunca uma contagem global do elenco/demais
//      times.
//  (b) Entre os elegíveis a sentar (quem NÃO sentou na rodada anterior — ou,
//      quando (a) foi relaxada, TODOS os outfielders), vão pro banco os que
//      sentaram MENOS VEZES até aqui (contagem acumulada). ISSO VALE SEMPRE,
//      mesmo com (a) relaxada: relaxar (a) não é licença pra alguém sentar 4
//      vezes enquanto outro senta 1 — (b) é o que segue garantindo a
//      justiça/equilíbrio da distribuição de banco ao longo dos 6 jogos.
//  (c) Desempate: escolhe a troca de MENOR IMPACTO — a combinação (dentre os
//      empatados em (b)) cujo time resultante em campo tem o MAIOR fit total
//      (`chooseBestSystem`), ou seja, preserva melhor o equilíbrio/sistema
//      tático. Heurística (não é ótimo global): avalia só as combinações
//      dentro do grupo empatado na fronteira de corte.
//
// Se a regra (a) — QUANDO APLICÁVEL (banco pequeno) — tornar IMPOSSÍVEL
// escalar (elegíveis a sentar < vagas de banco), NÃO relaxa em silêncio: cede
// a regra hard só o mínimo necessário pra fechar o banco, mas devolve um
// aviso nomeando quem ficou preso (mesmo padrão de
// `checkPositionFeasibility`/`applyGame1GoalkeeperRule` — nunca falha
// silenciosamente). Esse aviso NUNCA dispara quando (a) já foi relaxada pelo
// tamanho do banco — nesse caso não há regra hard pra travar.

import type { Player } from '../domain/types';
import { chooseBestSystem, type FormationCache } from './formationModel';
import { getCombinations } from './combinatorics';
import { joinNames } from './feasibility';

export interface BenchRoundContext {
  /** Outfielders elegíveis a banco/campo nesta divisão (mesmo conjunto nas 6 rodadas). */
  outfielders: Player[];
  /** Quantos vão pro banco nesta rodada. */
  benchCount: number;
  /** Contagem acumulada de banco por jogador (id -> nº de vezes já sentou antes desta rodada). */
  benchCounts: ReadonlyMap<string, number>;
  /** Ids que sentaram na rodada IMEDIATAMENTE anterior (regra hard: jogam agora). */
  benchedLastRound: ReadonlySet<string>;
  /**
   * Outros jogadores de linha que SEMPRE jogam nesta rodada (ex.: goleiros
   * reservas escalados como linha) — usados só pra avaliar o fit do sistema
   * no desempate (c); nunca são candidatos a banco aqui.
   */
  alwaysOnField?: Player[];
  /** Cache de sistema/custo (ver `FormationCache` em formationModel.ts), escopo = 1 execução de balanceamento. */
  cache?: FormationCache;
}

export interface BenchRoundResult {
  benched: Player[];
  /** null quando a escolha respeitou a regra hard (a) (ou ela nem se aplicava); nomeia quem travou, senão. */
  warning: string | null;
}

/**
 * Limiar (nº de vagas de banco NAQUELE time NAQUELA rodada) até o qual a
 * regra hard (a) — "ninguém repete banco em rodadas seguidas" — é OBRIGATÓRIA.
 * Acima disso (banco maior), a regra é RELAXADA (permite repetir), porque com
 * banco grande sustentar "todo mundo entra toda rodada" ou é infactível ou
 * vira um vaivém sem sentido (pedido do dono). Constante nomeada de propósito
 * — é regra de domínio calibrável, não deve virar número mágico espalhado.
 */
export const HARD_NO_REPEAT_MAX_BENCH_SIZE = 2;

/**
 * Teto de combinações realmente avaliadas (via `chooseBestSystem`, caro — 4
 * sistemas × húngaro) no desempate (c). Acima disso (só acontece quando um
 * grupo grande de jogadores está empatado na contagem acumulada — tipicamente
 * a 1ª rodada, todo mundo em 0), pula a avaliação de impacto e usa a ordem
 * estável do grupo empatado: (b) já garante justiça (todos ali têm a MESMA
 * contagem), então não avaliar (c) nesse caso não quebra nenhuma regra hard —
 * só evita explosão combinatória (`teamMetrics` roda isto centenas de vezes
 * durante a busca local do balanceamento).
 */
const MAX_TIEBREAK_COMBOS = 2;

const countOf = (benchCounts: ReadonlyMap<string, number>, p: Player): number => benchCounts.get(p.id) ?? 0;

/** C(n, k) — só pra decidir se vale a pena gerar as combinações de verdade. */
const combinationsCount = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
};

/**
 * Dentre `pool`, escolhe `benchCount` jogadores pra sentar por MENOR contagem
 * acumulada, desempatando (grupo empatado na fronteira) pelo maior fit total
 * do time resultante (`stayingRest` + os do grupo que NÃO forem escalados).
 */
const pickByCountThenImpact = (
  pool: Player[],
  benchCount: number,
  benchCounts: ReadonlyMap<string, number>,
  stayingRest: Player[],
  cache?: FormationCache,
): Player[] => {
  if (benchCount <= 0) return [];
  // Desempate secundário por `id` (não pela ordem de chegada no array, que
  // pode variar entre execuções independentes por causa do embaralhamento
  // aleatório do gerador de divisões candidatas) — mantém a escolha
  // determinística para o MESMO conjunto de jogadores, independente de qual
  // ordem eles chegaram aqui.
  const sorted = [...pool].sort((a, b) => countOf(benchCounts, a) - countOf(benchCounts, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (benchCount >= sorted.length) return sorted;

  const cutoff = countOf(benchCounts, sorted[benchCount - 1]);
  const below = sorted.filter((p) => countOf(benchCounts, p) < cutoff);
  const atCutoff = sorted.filter((p) => countOf(benchCounts, p) === cutoff);
  const remainingSlots = benchCount - below.length;

  if (atCutoff.length <= remainingSlots) return [...below, ...atCutoff];

  const above = sorted.filter((p) => countOf(benchCounts, p) > cutoff);

  // Teto de custo: grupo empatado grande demais pra avaliar toda combinação
  // (ver `MAX_TIEBREAK_COMBOS`) — usa a ordem estável (todos ali JÁ são
  // igualmente justos por (b); só não vale a pena pagar o custo de (c)).
  if (combinationsCount(atCutoff.length, remainingSlots) > MAX_TIEBREAK_COMBOS) {
    return [...below, ...atCutoff.slice(0, remainingSlots)];
  }

  // Desempate (c): experimenta cada combinação de `remainingSlots` dentre os
  // empatados e escolhe a que deixa o time em campo com maior fit total.
  const combos = getCombinations(atCutoff, remainingSlots);
  let bestCombo = combos[0];
  let bestFit = -Infinity;
  for (const combo of combos) {
    const comboIds = new Set(combo.map((p) => p.id));
    const stayingFromAtCutoff = atCutoff.filter((p) => !comboIds.has(p.id));
    const staying = [...stayingRest, ...above, ...stayingFromAtCutoff];
    if (staying.length !== 6) continue; // fora do formato esperado — não avalia
    const inf = chooseBestSystem(staying, cache);
    const fit = inf.feasible ? inf.total : -1;
    if (fit > bestFit) { bestFit = fit; bestCombo = combo; }
  }
  return [...below, ...bestCombo];
};

export const chooseBenchGroup = (ctx: BenchRoundContext): BenchRoundResult => {
  const { outfielders, benchCount, benchCounts, benchedLastRound, alwaysOnField = [], cache } = ctx;
  if (benchCount <= 0) return { benched: [], warning: null };

  // Regra (a) é CONDICIONAL ao tamanho do banco DESTE time NESTA rodada — não
  // uma contagem global do elenco. Banco grande: relaxa a proibição de
  // repetir, mas (b) — a contagem acumulada — continua valendo pra manter a
  // distribuição justa (ver comentário de topo do arquivo).
  if (benchCount > HARD_NO_REPEAT_MAX_BENCH_SIZE) {
    const benched = pickByCountThenImpact(outfielders, benchCount, benchCounts, alwaysOnField, cache);
    return { benched, warning: null };
  }

  const eligible = outfielders.filter((p) => !benchedLastRound.has(p.id));
  const mustPlay = outfielders.filter((p) => benchedLastRound.has(p.id));

  if (eligible.length < benchCount) {
    // Regra hard (a) impossível de cumprir com o elenco atual desta rodada:
    // cede o mínimo necessário (inclui alguém que acabou de sentar) só pra
    // fechar o banco, mas AVISA nomeando quem travou — nunca em silêncio.
    const benched = pickByCountThenImpact(outfielders, benchCount, benchCounts, alwaysOnField, cache);
    const warning =
      `Não dá pra respeitar "ninguém fica dois jogos seguidos no banco" com o elenco atual: ` +
      `${joinNames(mustPlay.map((p) => p.name))} acabou de sentar e precisaria jogar agora, mas só ` +
      `${eligible.length} jogador(es) elegível(is) sobra(m) para ${benchCount} vaga(s) de banco. ` +
      `Ative mais jogadores de linha ou reduza o nº de times.`;
    return { benched, warning };
  }

  const benched = pickByCountThenImpact(eligible, benchCount, benchCounts, [...mustPlay, ...alwaysOnField], cache);
  return { benched, warning: null };
};
