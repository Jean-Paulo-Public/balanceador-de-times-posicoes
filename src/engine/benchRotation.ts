// Escolha do BANCO por rodada (Fase 6, regra do dono) — FUNÇÃO PURA e
// testável, separada da montagem do cronograma (`rotation.ts`). Prioridade:
//
//  (a) HARD, SEM EXCEÇÃO DE TAMANHO (regra revisada — a antiga condicionava a
//      dureza da regra ao tamanho do próprio banco do time; isso foi
//      REMOVIDO): ninguém pode ficar mais de um jogo seguido no banco. Vale
//      SEMPRE, independentemente de quantos jogadores o banco daquele time
//      tem naquela rodada, ou de quantos times existem na pelada.
//
//      Quando a regra estrita for IMPOSSÍVEL de cumprir nesta rodada (não
//      sobra gente suficiente que não acabou de sentar), a divisão inteira é
//      INVIÁLIDA — `chooseBenchGroup` devolve `impossible: true` e não cede a
//      regra em silêncio nem com um aviso informativo (comportamento antigo);
//      quem chama (`rotation.ts` → `balance.ts`) precisa DESCARTAR essa
//      divisão dos resultados, nunca apresentá-la ao usuário.
//
//      Exceção OPCIONAL (checkbox "Permitir jogadores ficarem duas vezes
//      seguidas no banco", ligado pelo usuário, NUNCA por padrão): quando
//      ligada e a regra estrita não fecha o banco, um jogador pode sentar
//      pela 2ª vez CONSECUTIVA (paga um "crédito"). Enquanto o crédito está
//      ativo (`BENCH_EXCEPTION_COOLDOWN_ROUNDS` rodadas SEGUINTES à rodada em
//      que sentou a 2ª vez), esse jogador fica INELEGÍVEL ao banco — sempre
//      em campo — e SÓ volta a poder sentar depois que a janela expira (não é
//      permanente: passada a janela, ele volta a ser elegível normalmente,
//      inclusive podendo gastar o crédito de novo mais adiante se for
//      necessário). Mesmo com a exceção ligada, a regra estrita continua
//      sendo a PREFERIDA: só usa o crédito de alguém quando faltam vagas
//      estritamente elegíveis pra fechar o banco daquela rodada — nunca por
//      "conveniência" quando a regra estrita já fecharia sozinha.
//
//  (b) Entre os elegíveis a sentar (quem NÃO sentou na rodada anterior e não
//      está em cooldown de exceção — ou, entre os repetentes quando a exceção
//      é necessária), vão pro banco os que sentaram MENOS VEZES até aqui
//      (contagem acumulada). ISSO VALE SEMPRE — a janela de cooldown só
//      remove o jogador do CONJUNTO elegível durante a janela; não zera nem
//      mexe na contagem acumulada dele.
//  (c) Desempate: escolhe a troca de MENOR IMPACTO — a combinação (dentre os
//      empatados em (b)) cujo time resultante em campo tem o MAIOR fit total
//      (`chooseBestSystem`), ou seja, preserva melhor o equilíbrio/sistema
//      tático. Heurística (não é ótimo global): avalia só as combinações
//      dentro do grupo empatado na fronteira de corte.
//
// ATRASADOS (pedido do dono): quem tem `LateArrival` configurado deve ir pro
// banco o MAIS PARA O FIM POSSÍVEL depois que chega (ele já perdeu jogos por
// atraso; não faz sentido a primeira coisa que ele faça ao chegar seja
// sentar). A peça principal disso é a SEMEADURA da contagem acumulada dele
// em `rotation.ts` (`buildTeamSchedule`) no exato momento em que ele fica
// disponível pela 1ª vez: `benchCounts[atrasado] = maior contagem do time
// naquele instante` — com isso o próprio critério (b) já o empurra pro fim,
// SEM ramo especial de seleção aqui. O `lateIds` que este arquivo recebe
// (ver `BenchRoundContext`) serve só pro desempate FINO de empates exatos de
// contagem (ver `priorityOf` abaixo) — sem ele, um empate na contagem
// (raro, mas possível) poderia mandar o atrasado sentar antes de quem está
// no time desde o início, na mesma rodada. Se o banco só puder ser
// preenchido com atrasados, eles sentam normalmente — não é inviabilidade
// nova, é só "não tinha alternativa" (a regra (a) estrita e o desempate (c)
// continuam intocados).

import type { Player } from '../domain/types';
import { chooseBestSystem, type FormationCache } from './formationModel';
import { getCombinations } from './combinatorics';

export interface BenchRoundContext {
  /** Outfielders elegíveis a banco/campo nesta divisão (mesmo conjunto nas 6 rodadas). */
  outfielders: Player[];
  /** Quantos vão pro banco nesta rodada. */
  benchCount: number;
  /** Contagem acumulada de banco por jogador (id -> nº de vezes já sentou antes desta rodada). */
  benchCounts: ReadonlyMap<string, number>;
  /** Ids que sentaram na rodada IMEDIATAMENTE anterior (regra hard: jogam agora, SALVO uso da exceção). */
  benchedLastRound: ReadonlySet<string>;
  /**
   * Outros jogadores de linha que SEMPRE jogam nesta rodada (ex.: goleiros
   * reservas escalados como linha) — usados só pra avaliar o fit do sistema
   * no desempate (c); nunca são candidatos a banco aqui.
   */
  alwaysOnField?: Player[];
  /** Cache de sistema/custo (ver `FormationCache` em formationModel.ts), escopo = 1 execução de balanceamento. */
  cache?: FormationCache;
  /**
   * Checkbox do dono (default false, NÃO persistido — ver `usePlayerStore`):
   * permite sentar 2x seguidas pagando um "crédito" com cooldown (ver topo do
   * arquivo). Sem isso ligado, a regra (a) é ESTRITA e sem exceção alguma.
   */
  allowTwoConsecutive?: boolean;
  /** Rodada atual (0-based) — necessária pra calcular a janela de cooldown da exceção. Default 0. */
  round?: number;
  /**
   * id -> rodada (0-based) em que o jogador gastou o crédito da exceção
   * (sentou pela 2ª vez seguida). Enquanto `round` estiver dentro da janela
   * de `BENCH_EXCEPTION_COOLDOWN_ROUNDS` rodadas SEGUINTES, ele é inelegível.
   * Mantida e atualizada por quem chama (`rotation.ts`), entre rodadas.
   */
  exceptionSpentAtRound?: ReadonlyMap<string, number>;
  /**
   * Ids de jogadores com ATRASO configurado (ver `LateArrival` em
   * domain/types.ts) — vale pra qualquer jogador atrasado deste time,
   * independente de já ter chegado ou não (quem ainda está ausente nem
   * aparece em `outfielders` desta rodada, então o id aqui é inofensivo até
   * ele chegar). Usado SÓ como desempate (b) — ver `priorityOf` abaixo: a
   * peça que realmente empurra o atrasado pro fim da fila é a SEMEADURA da
   * contagem dele em `rotation.ts` (`benchCounts` no momento em que ele
   * chega = o MAIOR valor do time naquele instante). Este campo aqui cobre
   * só o caso de EMPATE exato na contagem — sem ele, um empate poderia
   * mandar o atrasado sentar antes de quem está no time desde o início.
   */
  lateIds?: ReadonlySet<string>;
}

export interface BenchRoundResult {
  benched: Player[];
  /**
   * Ids que, NESTA escolha, sentaram pela 2ª vez seguida (gastaram o crédito
   * da exceção agora). Quem chama deve registrar a rodada atual para eles em
   * `exceptionSpentAtRound` dali em diante (inicia o cooldown).
   */
  spentExceptionIds: string[];
  /**
   * true quando NEM a regra estrita NEM a exceção (se ligada) deram pra
   * fechar o banco desta rodada respeitando "ninguém repete" — a divisão
   * inteira é INVIÁLIDA e deve ser DESCARTADA dos resultados (não é mais um
   * aviso informativo que "segue" — ver `rotation.ts`/`balance.ts`).
   */
  impossible: boolean;
}

/**
 * Duração (em rodadas) do cooldown de inelegibilidade ao banco depois que um
 * jogador gasta o crédito da exceção (senta 2x seguidas). Regra de domínio
 * calibrável pelo dono — nomeada de propósito, não deve virar número mágico
 * espalhado. Motivo do valor: isenção "até o fim da simulação" transferia
 * carga de banco demais pros outros num rodízio de 9 jogos (2 times); 6
 * rodadas compensa sem virar privilégio permanente. Interage com
 * `gamesForTeamCount` (ver rotation.ts): com 3+ times o rodízio inteiro tem
 * só 6 jogos, então na prática o cooldown cobre o resto da simulação mesmo
 * assim — não é tratado como caso especial, é só o horizonte que muda. Com 2
 * times (9 jogos), alguém que gasta o crédito nas rodadas 1–2 fica inelegível
 * nas rodadas 3–8 e volta a poder sentar na rodada 9.
 */
export const BENCH_EXCEPTION_COOLDOWN_ROUNDS = 6;

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

/**
 * Chave de prioridade pro critério (b) — igual à contagem acumulada, EXCETO
 * que um atrasado (`lateIds`) recebe um nudge fracionário (+0,5) que só
 * importa em EMPATE exato de contagem: como as contagens reais são sempre
 * inteiras, o nudge nunca muda a ordem entre jogadores com contagens
 * DIFERENTES, só desempata quando ela é IGUAL — nesse caso o atrasado fica
 * depois (prioridade "pior", ou seja, sentado por último). A peça que faz o
 * trabalho pesado de empurrar o atrasado pro fim é a SEMEADURA da contagem
 * dele em `rotation.ts` no momento em que ele chega (`benchCounts[atrasado]
 * = maior contagem do time naquele instante) — isto aqui é só o desempate
 * fino que a semeadura por si só não cobre (ver `BenchRoundContext.lateIds`).
 */
const priorityOf = (benchCounts: ReadonlyMap<string, number>, lateIds: ReadonlySet<string>, p: Player): number =>
  countOf(benchCounts, p) + (lateIds.has(p.id) ? 0.5 : 0);

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
  cache: FormationCache | undefined,
  lateIds: ReadonlySet<string>,
): Player[] => {
  if (benchCount <= 0) return [];
  // Desempate secundário por `id` (não pela ordem de chegada no array, que
  // pode variar entre execuções independentes por causa do embaralhamento
  // aleatório do gerador de divisões candidatas) — mantém a escolha
  // determinística para o MESMO conjunto de jogadores, independente de qual
  // ordem eles chegaram aqui.
  const sorted = [...pool].sort((a, b) =>
    priorityOf(benchCounts, lateIds, a) - priorityOf(benchCounts, lateIds, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (benchCount >= sorted.length) return sorted;

  const cutoff = priorityOf(benchCounts, lateIds, sorted[benchCount - 1]);
  const below = sorted.filter((p) => priorityOf(benchCounts, lateIds, p) < cutoff);
  const atCutoff = sorted.filter((p) => priorityOf(benchCounts, lateIds, p) === cutoff);
  const remainingSlots = benchCount - below.length;

  if (atCutoff.length <= remainingSlots) return [...below, ...atCutoff];

  const above = sorted.filter((p) => priorityOf(benchCounts, lateIds, p) > cutoff);

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
  const {
    outfielders, benchCount, benchCounts, benchedLastRound, alwaysOnField = [], cache,
    allowTwoConsecutive = false, round = 0, exceptionSpentAtRound = new Map<string, number>(),
    lateIds = new Set<string>(),
  } = ctx;
  if (benchCount <= 0) return { benched: [], spentExceptionIds: [], impossible: false };

  // Janela de cooldown da exceção: jogador inelegível ao banco enquanto
  // `round` estiver dentro das `BENCH_EXCEPTION_COOLDOWN_ROUNDS` rodadas
  // SEGUINTES à rodada em que gastou o crédito.
  const onCooldown = (p: Player): boolean => {
    const spentAt = exceptionSpentAtRound.get(p.id);
    if (spentAt == null) return false;
    const delta = round - spentAt;
    return delta >= 1 && delta <= BENCH_EXCEPTION_COOLDOWN_ROUNDS;
  };

  const cooling = outfielders.filter((p) => onCooldown(p));
  // Regra (a) ESTRITA (sempre a preferida, com ou sem a exceção ligada):
  // elegível a sentar é quem não sentou na rodada anterior e não está em
  // cooldown da exceção.
  const strictEligible = outfielders.filter((p) => !benchedLastRound.has(p.id) && !onCooldown(p));
  // Quem sentou na rodada anterior (regra hard: joga agora) e não está em
  // cooldown — precisa entrar no `stayingRest` do desempate (c) pra avaliação
  // de fit considerar o time de campo COMPLETO (6 jogadores), não só quem
  // sobra depois de tirar os candidatos a banco.
  const mustPlayLastRound = outfielders.filter((p) => benchedLastRound.has(p.id) && !onCooldown(p));

  if (strictEligible.length >= benchCount) {
    const benched = pickByCountThenImpact(
      strictEligible, benchCount, benchCounts, [...mustPlayLastRound, ...cooling, ...alwaysOnField], cache, lateIds,
    );
    return { benched, spentExceptionIds: [], impossible: false };
  }

  // Regra estrita impossível nesta rodada (não sobra gente suficiente que não
  // acabou de sentar / não está em cooldown).
  if (!allowTwoConsecutive) {
    // Sem a exceção ligada, isso invalida a divisão inteira — não cede mais
    // em silêncio, nem com aviso: quem chama precisa descartar.
    return { benched: [], spentExceptionIds: [], impossible: true };
  }

  // Exceção ligada: amplia o pool aceitando quem sentou na rodada anterior (2ª
  // vez seguida — gasta o crédito), mas só o MÍNIMO necessário: todos os
  // estritamente elegíveis são OBRIGATORIAMENTE escalados pro banco (são
  // menos que `benchCount`, não sobra escolha ali); só o restante vem dos
  // repetentes, escolhidos por (b)+(c) como de costume.
  const needed = benchCount - strictEligible.length;
  const repeaters = outfielders.filter((p) => benchedLastRound.has(p.id) && !onCooldown(p));
  if (repeaters.length < needed) {
    // Nem com a exceção dá pra fechar o banco — impossibilidade estrutural
    // (pool total insuficiente). Também inválida.
    return { benched: [], spentExceptionIds: [], impossible: true };
  }

  // ATENÇÃO: `strictEligible` NÃO entra em `stayingRest` aqui — eles TODOS
  // vão pro banco nesta rodada (são menos que `benchCount`, não sobra
  // escolha), então não "ficam em campo". Só `cooling`/`alwaysOnField` são
  // forçados a jogar; os repetentes NÃO escolhidos (fora do `needed`) já são
  // contabilizados como "ficam" pela própria lógica de `pickByCountThenImpact`
  // (o pool de onde ela escolhe É `repeaters`).
  const repeatersChosen = pickByCountThenImpact(
    repeaters, needed, benchCounts, [...cooling, ...alwaysOnField], cache, lateIds,
  );
  const benched = [...strictEligible, ...repeatersChosen];
  return { benched, spentExceptionIds: repeatersChosen.map((p) => p.id), impossible: false };
};
