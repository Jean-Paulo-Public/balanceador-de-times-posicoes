// Escalonador do rodízio de 6 jogos por time (para o mapinha exportado E para
// o custo médio de 6 jogos usado no balanceamento — Fase 6).
//
// Regras (pedido do Jean):
//  - Goleiros formam uma FILA (round-robin): um goleiro só volta ao gol depois
//    que todos os outros goleiros passaram. Ordem da fila: PRIMEIRO critério —
//    quem tem ATRASO configurado (`LateArrival`) vai pro FIM da fila (quem
//    chega mais tarde — mais jogos de ausência — fica ainda mais pro fim);
//    entre não-atrasados (e entre atrasados, no empate de atraso), melhores
//    goleiros primeiro (nota de goleiro). DEPOIS disso — e com PRECEDÊNCIA
//    sobre o critério de atraso — o Jogo 1 nunca pode ser um ATACANTE
//    (PIVO/SEGUNDO_ATACANTE/MEIA_ATACANTE): acha o primeiro não-atacante da
//    fila (já ordenada com atrasados no fim) e move pra frente, preservando a
//    ordem relativa dos demais. Como os não-atrasados já vêm antes dos
//    atrasados nessa fila, a busca "da frente pra trás" naturalmente prefere
//    um não-atrasado não-atacante quando existe um — só puxa um atrasado pra
//    frente se TODOS os não-atrasados aptos forem atacantes (sem alternativa
//    melhor). Se não existir nenhum não-atacante apto, avisa explicitamente
//    (não escala um atacante em silêncio). A ausência por atraso em si (não
//    poder ser goleiro enquanto ausente) já é coberta pela disponibilidade
//    POR RODADA abaixo — nunca é um caminho separado.
//  - A decisão "este time reveza o PRÓPRIO goleiro?" é avaliada POR RODADA,
//    não mais do elenco inteiro (ver `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`
//    abaixo) — um mesmo time pode revezar goleiro próprio em algumas rodadas
//    e usar goleiro emprestado em outras dentro da MESMA simulação, conforme
//    quantos estão disponíveis (não-ausentes por atraso) em cada rodada.
//  - Banco: prioridade (a) HARD e SEM EXCEÇÃO DE TAMANHO — ninguém fica dois
//    jogos seguidos no banco, ponto (a antiga regra condicional ao tamanho do
//    banco foi REMOVIDA); (b) entre os elegíveis a sentar, vão pro banco os
//    que sentaram MENOS vezes até ali (contagem acumulada); (c) desempate por
//    MENOR IMPACTO (maior fit total do time resultante). Lógica pura em
//    `benchRotation.ts` (`chooseBenchGroup`) — se a regra (a) travar NUMA
//    RODADA, a divisão inteira é INVIÁLIDA (`benchRuleBroken`), a menos que a
//    exceção do checkbox esteja ligada (`allowTwoConsecutive`, ver
//    `benchRotation.ts`). Não relaxa mais em silêncio nem com aviso — quem
//    chama (`balance.ts`) precisa DESCARTAR a divisão dos resultados.
//  - A formação (sistema tático) é reinferida a cada jogo via `chooseBestSystem`
//    (húngaro) — cada jogo pode escolher um sistema diferente pra quem está em
//    campo naquele jogo.

import type { Player, LateArrival } from '../domain/types';
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
  /**
   * Nomes de quem, NESTE jogo, joga pela PRIMEIRA VEZ depois de ficar ausente
   * por atraso (ver `LateArrival` em domain/types.ts). NÃO é "voltou do
   * banco" — ele nem estava relacionado nos jogos anteriores (não aparecia em
   * `benchNames`), então essa lista é a única indicação de que ele chegou.
   * Vazio na esmagadora maioria dos jogos (só marca a rodada exata da
   * chegada, uma vez por atrasado).
   */
  arrivals: string[];
}

export interface TeamSchedule {
  games: GameLineup[];
  /** true = o time não tem como variar (1 goleiro e sem banco) → mostrar "Jogo 1 ao 6". */
  constant: boolean;
  /** Aviso explícito quando a regra "Jogo 1 sem atacante no gol" não pôde ser satisfeita. */
  goalkeeperWarning: string | null;
  /**
   * true quando, em alguma rodada, a regra "ninguém fica 2 jogos seguidos no
   * banco" (e a exceção do checkbox, se ligada) NÃO pôde ser cumprida — a
   * divisão inteira é INVIÁLIDA e deve ser DESCARTADA (não é mais um aviso
   * informativo que "segue" — ver `chooseBenchGroup` em benchRotation.ts).
   */
  benchRuleBroken: boolean;
  /** Nº de jogadores de linha disponíveis pro rodízio de banco deste time (outfielders) — só pra compor a mensagem de bloqueio quando `benchRuleBroken`. */
  benchOutfielders: number;
  /** Vagas de banco por rodada deste time — idem. */
  benchSlots: number;
  /**
   * Detalhe de uma rodada em que nem dava pra fechar os 6 de linha porque
   * atrasados ainda ausentes deixaram gente de menos disponível — dispara a
   * MESMA invalidez de `benchRuleBroken` (a divisão é descartada do mesmo
   * jeito, ver `balance.ts`), mas com números PRÓPRIOS pra mensagem de
   * bloqueio poder distinguir a causa (atraso vs. regra estrita do banco).
   * `null` quando não houve esse tipo de falta (inclusive quando
   * `benchRuleBroken` é true por outro motivo).
   */
  lineShortfall: { round: number; available: number; needed: number } | null;
}

/**
 * Constrói o mapa jogador -> nº de jogos de ausência a partir da config bruta
 * do usuário (ver `LateArrival` em domain/types.ts), já GRAMPEADO ao total de
 * jogos do rodízio desta simulação: nunca deixa um jogador com `games >=
 * totalGames` (isso o zeraria da pelada inteira sem aviso — o pedido do dono
 * foi EXPLÍCITO em não aceitar isso em silêncio) e descarta entradas
 * inválidas (não inteiras ou < 1). Chamado tanto por `balance.ts` (pra
 * calcular o custo) quanto pela UI (pra exibir o MESMO rodízio que foi
 * balanceado — ver `SimulationTab`/`fieldMapImage.ts`).
 */
export const clampLateArrivals = (
  lateArrivals: readonly LateArrival[] | undefined, totalGames: number,
): Map<string, number> => {
  const m = new Map<string, number>();
  for (const la of lateArrivals ?? []) {
    if (!Number.isInteger(la.games) || la.games < 1) continue;
    const clamped = Math.min(la.games, Math.max(0, totalGames - 1));
    if (clamped >= 1) m.set(la.playerId, clamped);
  }
  return m;
};

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

/**
 * Quantos jogos o rodízio simula, conforme o nº de times (regra do dono):
 * com apenas DOIS times a pelada rende mais jogos, então simula 9; com 3 ou
 * mais, segue em 6. Os 3 jogos extras entram na MÉDIA das métricas igual aos
 * outros — não são um apêndice de exibição.
 * Exportada para a UI usar exatamente a mesma regra do custo (senão os
 * campinhos mostrariam um nº de jogos diferente do que foi balanceado).
 */
export const gamesForTeamCount = (numTeams: number): number => (numTeams === 2 ? 9 : 6);

/**
 * Nº mínimo de jogadores DISPONÍVEIS (não ausentes por atraso) pra um time
 * revezar o PRÓPRIO goleiro NUMA RODADA — pedido explícito do dono. Com MENOS
 * que isso disponível NAQUELA RODADA (na prática, 6 disponíveis), os 6 vão
 * TODOS pra linha e o goleiro vem EMPRESTADO de fora (do time que está de
 * fora, no modo de 3 times) SÓ NAQUELA RODADA: tirar um deles pra jogar no
 * gol deixaria o time com só 5 na linha, que é exatamente o bug relatado
 * ("revezando goleiro e ficando com 5 na linha").
 *
 * *** MUDANÇA DE DESIGN (2ª correção do mesmo bug) ***: a 1ª correção fixou
 * este limiar como uma regra do ELENCO COMPLETO (goleiro reservado + 6 de
 * linha + banco, ignorando quem está ausente por atraso numa rodada
 * específica) — comentário antigo dizia explicitamente "a regra dos 7 é do
 * elenco, não da rodada". ISSO ESTAVA ERRADO: o bug reapareceu quando um
 * jogador com `LateArrival` deixava o time com só 6 disponíveis EM RODADAS
 * ESPECÍFICAS, mesmo com elenco de 7+ no total — o elenco "achava" que podia
 * revezar goleiro próprio, mas naquela rodada faltava gente pra sustentar
 * goleiro + 6 de linha ao mesmo tempo, e o time voltava a jogar com 5 na
 * linha (mesmo sintoma, causa diferente).
 *
 * A regra CORRETA (esta versão): a decisão é POR RODADA, usando quem está
 * DISPONÍVEL NAQUELA RODADA especificamente (ver `buildTeamSchedule`
 * abaixo, variável `fieldedThisRound`). O elenco completo ainda importa,
 * mas só como CAPACIDADE ESTRUTURAL (`capacityFielded` = elenco tem 7+ E
 * tem goleiro apto E o dono não marcou "nunca escalar goleiro próprio") — é
 * um teto: sem essa capacidade, o time NUNCA reveza goleiro próprio, ponto.
 * COM essa capacidade, cada rodada decide por si: >=7 disponíveis reveza
 * normalmente, ==6 disponíveis empresta só naquela rodada, <6 é
 * inviabilidade real (`lineShortfall`, já existente). Consequência
 * ESPERADA (não é bug): o MESMO time pode revezar goleiro próprio em
 * algumas rodadas e usar goleiro emprestado em outras.
 *
 * `teamMetrics` (balance.ts, `canFieldOwnGoalkeeper`) usa este limiar só pra
 * calcular `capacityFielded`/`team.fieldsGoalkeeper` (a CAPACIDADE, não o
 * que acontece em cada rodada — ver comentário de `fieldsGoalkeeper` em
 * balance.ts). `buildTeamSchedule` abaixo é o único lugar que decide o que
 * de fato acontece EM CADA RODADA, e reconfere a capacidade sozinho por
 * segurança (é chamado com um `BalancedTeam` já pronto vindo de fora — UI em
 * `SimulationTab.tsx`, exportação de imagem em `fieldMapImage.ts` — então
 * não deve confiar cegamente em `team.fieldsGoalkeeper` sem checar o
 * tamanho do elenco de novo).
 */
export const MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER = 7;

export const buildTeamSchedule = (
  team: BalancedTeam, totalGames = 6, cache?: FormationCache, allowTwoConsecutive = false,
  /**
   * id -> nº de jogos de ausência (ver `LateArrival`/`clampLateArrivals`
   * acima). Só os ids presentes no roster DESTE time importam — ids de fora
   * são ignorados silenciosamente (é assim que um jogador removido/desativado
   * referenciado no filtro não quebra nada).
   */
  lateArrivals?: ReadonlyMap<string, number>,
): TeamSchedule => {
  const roster: Player[] = [
    ...team.slots.map((s) => s.player),
    ...(team.goalkeeper ? [team.goalkeeper] : []),
    ...team.bench,
  ];
  const n = roster.length;
  // Ids com ATRASO configurado (qualquer valor, mesmo já vencido) — usado (1)
  // pra jogar quem tem atraso pro FIM da fila de goleiros (abaixo) e (2) como
  // desempate fino no critério (b) do banco (ver `benchRotation.ts`); a
  // semeadura da contagem de banco (o mecanismo PRINCIPAL de empurrar o
  // atrasado pro fim do banco) é feita mais abaixo, rodada a rodada.
  const lateIds = new Set<string>(lateArrivals ? [...lateArrivals.keys()] : []);
  const lateGamesOf = (p: Player): number => lateArrivals?.get(p.id) ?? 0;

  // CAPACIDADE ESTRUTURAL do time (elenco completo) — mesmo que
  // `team.fieldsGoalkeeper` já devesse vir correto de `balance.ts`, reconfere
  // o tamanho do elenco aqui também (defesa própria, ver comentário de
  // `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER` acima), em vez de confiar
  // cegamente no booleano de quem chamou. Isto é só o TETO: NÃO decide se uma
  // rodada específica reveza goleiro próprio (isso é `fieldedThisRound`,
  // calculado dentro do laço abaixo com quem está disponível NAQUELA
  // rodada) — só decide se o time tem, em tese, corpo pra isso quando todos
  // estão presentes.
  const capacityFielded = team.fieldsGoalkeeper && n >= MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER;
  const keepersBestFirst = capacityFielded
    ? roster.filter((p) => p.isGoalkeeper).sort((a, b) => {
      const lateA = lateGamesOf(a);
      const lateB = lateGamesOf(b);
      // Critério do dono, com PRECEDÊNCIA sobre a nota de goleiro: quem tem
      // atraso configurado vai pro FIM da fila (não faz sentido a primeira
      // coisa que ele faça ao chegar seja ir pro gol); entre dois atrasados,
      // quem chega MAIS TARDE (mais jogos de ausência) fica ainda mais pro
      // fim. Não-atrasados (lateGames=0) sempre vêm primeiro.
      if (lateA !== lateB) return lateA - lateB;
      // Empate em atraso (ambos não-atrasados, ou mesmo nº de jogos de
      // ausência): critério de sempre, melhor goleiro primeiro.
      return (effectiveGk(b) ?? 0) - (effectiveGk(a) ?? 0);
    })
    : [];
  // `applyGame1GoalkeeperRule` escaneia da FRENTE pra trás em busca do 1º
  // não-atacante — como os não-atrasados já vêm antes dos atrasados na fila
  // acima, ela naturalmente PREFERE um não-atrasado não-atacante quando
  // existe um (só alcança um atrasado se TODOS os não-atrasados aptos forem
  // atacantes). Ordem de precedência final: (1) regra do Jogo 1 (nunca
  // atacante) > (2) não-atrasado antes de atrasado > (3) melhor goleiro
  // primeiro. Nenhuma mudança necessária nela mesma pra isso funcionar.
  const { queue: keepers, warning: goalkeeperWarning } = applyGame1GoalkeeperRule(keepersBestFirst);
  const k = keepers.length;
  // Baseline SEM ausência por atraso (elenco completo) — só pra exibir
  // `benchOutfielders`/`benchSlots` (informativos, ver `TeamSchedule`) e pro
  // fast-path "constante" abaixo; a decisão real por rodada usa a
  // disponibilidade daquela rodada, calculada dentro do laço.
  const baseFielded = capacityFielded && k > 0;
  const outfielders = baseFielded ? roster.filter((p) => !p.isGoalkeeper) : [...roster];
  const onField = baseFielded ? 7 : 6;
  const benchCount = Math.max(0, n - onField);

  const baseLineup: GameLineup = {
    game: 1,
    formation: team.formation,
    feasible: team.metrics.feasible,
    slots: team.slots,
    goalkeeperName: team.goalkeeper?.name ?? null,
    goalkeeperId: team.goalkeeper?.id ?? null,
    benchNames: team.bench.map((b) => b.name),
    arrivals: [],
  };

  // Rodada (0-based) em que `p` ainda está AUSENTE por atraso — não é banco,
  // é "não estava lá" (ver comentário de `LateArrival`): fica fora do goleiro
  // em fila, fora do pool de banco/linha e fora da contagem de justiça do
  // banco enquanto isso for true.
  const isLateAbsent = (p: Player, round: number): boolean => {
    const games = lateArrivals?.get(p.id);
    return games != null && round < games;
  };
  const hasAnyLateArrival = roster.some((p) => isLateAbsent(p, 0));

  // Sem variação possível: 1 goleiro (ou nenhum), sem banco e ninguém atrasado
  // (um atrasado sempre introduz variação entre rodadas, mesmo sem banco —
  // inclusive porque agora ele pode fazer o time OSCILAR entre goleiro
  // próprio e emprestado de rodada pra rodada).
  if (k <= 1 && benchCount === 0 && !hasAnyLateArrival) {
    return {
      games: [baseLineup], constant: true, goalkeeperWarning,
      benchRuleBroken: false, benchOutfielders: outfielders.length, benchSlots: benchCount, lineShortfall: null,
    };
  }

  const games: GameLineup[] = [];
  const benchCounts = new Map<string, number>(outfielders.map((p) => [p.id, 0]));
  // Fila de goleiros: turnos JÁ TOMADOS por jogador (fairness real, não mera
  // posição num índice fixo — necessário porque o conjunto de goleiros
  // DISPONÍVEIS muda de rodada pra rodada com atrasados). Quem tem MENOS
  // turnos tomados vai pro gol; empate desfeito pela ordem de `keepers`
  // (não-atrasados e melhores primeiro, regra do Jogo 1 já aplicada) — ver
  // `pickGoalie` abaixo. Sem nenhum atrasado, isto reproduz EXATAMENTE o
  // round-robin `keepers[g % k]` de antes (mesma sequência, sem regressão).
  const gkTurnsTaken = new Map<string, number>();
  const keeperOrderIndex = new Map<string, number>(keepers.map((p, i) => [p.id, i]));
  const pickGoalie = (available: Player[]): Player | null => {
    if (available.length === 0) return null;
    const currentMax = gkTurnsTaken.size ? Math.max(...gkTurnsTaken.values()) : 0;
    for (const p of available) if (!gkTurnsTaken.has(p.id)) gkTurnsTaken.set(p.id, currentMax);
    let best = available[0];
    for (const p of available) {
      const bt = gkTurnsTaken.get(best.id) ?? 0;
      const pt = gkTurnsTaken.get(p.id) ?? 0;
      const bIdx = keeperOrderIndex.get(best.id) ?? 0;
      const pIdx = keeperOrderIndex.get(p.id) ?? 0;
      if (pt < bt || (pt === bt && pIdx < bIdx)) best = p;
    }
    gkTurnsTaken.set(best.id, (gkTurnsTaken.get(best.id) ?? 0) + 1);
    return best;
  };
  let benchedLastRound = new Set<string>();
  const exceptionSpentAtRound = new Map<string, number>();
  let benchRuleBroken = false;
  let lineShortfall: TeamSchedule['lineShortfall'] = null;
  for (let g = 0; g < totalGames; g++) {
    // Jogadores que fazem sua PRIMEIRA aparição nesta rodada (ausentes justo
    // até a rodada anterior) — indicação PRÓPRIA de "chegada", nunca
    // confundida com "saiu do banco" (ele não estava em `benchNames` em
    // rodada nenhuma).
    const arrivingPlayers = roster.filter((p) => lateArrivals?.get(p.id) === g);
    const arrivals = arrivingPlayers.map((p) => p.name);
    // SEMEADURA da contagem de banco de quem chega agora (pedido do dono,
    // mecanismo PRINCIPAL de empurrar o atrasado pro fim do rodízio de
    // banco): no exato instante em que ele fica disponível, a contagem dele
    // passa a valer o MAIOR valor de `benchCounts` do time NAQUELE momento —
    // é semeadura, não penalidade: a partir daqui ele soma normalmente, como
    // qualquer um, a cada vez que realmente senta. Feita só UMA VEZ (esta
    // rodada é exatamente a rodada de chegada dele — `arrivingPlayers` só o
    // contém aqui), nunca re-semeada depois. Precisa ocorrer ANTES de
    // `chooseBenchGroup` desta mesma rodada, pra já valer nela.
    for (const p of arrivingPlayers) {
      const currentMax = benchCounts.size ? Math.max(...benchCounts.values()) : 0;
      benchCounts.set(p.id, currentMax);
    }

    // Disponibilidade REAL desta rodada (o que importa pra decidir goleiro
    // próprio x emprestado — ver `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`).
    const availableRoster = roster.filter((p) => !isLateAbsent(p, g));
    const availableCount = availableRoster.length;
    const keepersAvailRaw = capacityFielded ? keepers.filter((p) => !isLateAbsent(p, g)) : [];
    // Decisão POR RODADA (não mais do elenco inteiro): só reveza o goleiro
    // PRÓPRIO nesta rodada se, além da CAPACIDADE estrutural do time
    // (`capacityFielded`), houver pelo menos `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`
    // disponíveis JÁ NESTA RODADA e algum goleiro apto de fato presente.
    // Com exatamente 6 disponíveis (efeito comum de atraso: elenco tem 7+,
    // mas alguém está ausente nesta rodada específica), os 6 vão TODOS pra
    // linha e o gol vem EMPRESTADO só NESTA rodada — o mesmo time pode
    // voltar a revezar o goleiro próprio numa rodada seguinte em que volte a
    // ter 7+ presentes (esperado, não é bug).
    const fieldedThisRound = capacityFielded && availableCount >= MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER && keepersAvailRaw.length > 0;
    const keepersAvail = fieldedThisRound ? keepersAvailRaw : [];
    const goalie = fieldedThisRound ? pickGoalie(keepersAvail) : null;
    const lineKeepers = fieldedThisRound ? keepersAvail.filter((p) => p !== goalie) : [];
    const outfieldersAvail = fieldedThisRound
      ? availableRoster.filter((p) => !keepersAvail.some((kp) => kp.id === p.id))
      : availableRoster;
    const neededFromOutfielders = 6 - lineKeepers.length;

    // Baseline SEM atraso nenhum (mesma conta que o código já fazia antes
    // desta feature existir, com `k`/`outfielders` cheios, usando a
    // CAPACIDADE — não a disponibilidade por rodada) — usada só pra saber se
    // uma eventual falta de gente pra fechar a linha é CAUSADA pelo atraso,
    // ou se já era uma condição degenerada preexistente (roster sem corpo
    // suficiente pra sustentar goleiro interno + 6 de linha, algo que o
    // motor de geração de divisões evita na prática). Sem essa distinção,
    // esta checagem NOVA acabaria reportando `lineShortfall` (e descartando a
    // divisão) em casos que NADA têm a ver com atraso — regressão que não
    // pode acontecer (zero atrasados tem de dar EXATAMENTE o resultado de
    // antes).
    const baseLineKeepersCount = baseFielded ? Math.max(0, k - 1) : 0;
    const baseNeededFromOutfielders = 6 - baseLineKeepersCount;
    const preexistingShortfall = outfielders.length < baseNeededFromOutfielders;

    if (!preexistingShortfall && outfieldersAvail.length < neededFromOutfielders) {
      // Nem sequer dá pra fechar os 6 de linha nesta rodada — só acontece com
      // MENOS de 6 disponíveis no total (ver prova no comentário de
      // `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`: com `fieldedThisRound` true a
      // conta sempre fecha; com false, `neededFromOutfielders` é 6 e isto só
      // dispara se `availableCount < 6`). É uma inviabilidade REAL (mesma
      // categoria de `benchRuleBroken`: a divisão é descartada — ver
      // `balance.ts`), mas com números PRÓPRIOS pra mensagem de bloqueio
      // distinguir a causa.
      benchRuleBroken = true;
      if (!lineShortfall) {
        lineShortfall = { round: g, available: outfieldersAvail.length + lineKeepers.length, needed: 6 };
      }
      games.push({ ...baseLineup, game: g + 1, benchNames: [], arrivals });
      continue;
    }
    const benchCountThisRound = Math.max(0, outfieldersAvail.length - neededFromOutfielders);
    const { benched, spentExceptionIds, impossible } = chooseBenchGroup({
      outfielders: outfieldersAvail,
      benchCount: benchCountThisRound,
      benchCounts,
      benchedLastRound,
      alwaysOnField: lineKeepers,
      cache,
      allowTwoConsecutive,
      round: g,
      exceptionSpentAtRound,
      lateIds,
    });
    if (impossible) {
      // Divisão inviável — não faz sentido manter o estado de banco coerente
      // daqui pra frente (será descartada por `balance.ts`); registra um
      // jogo-placeholder só pra manter o array no tamanho esperado.
      benchRuleBroken = true;
      games.push({ ...baseLineup, game: g + 1, arrivals });
      continue;
    }
    for (const id of spentExceptionIds) exceptionSpentAtRound.set(id, g);
    const benchedSet = new Set(benched.map((p) => p.id));
    // Só quem REALMENTE sentou (dentre os disponíveis nesta rodada) soma na
    // contagem de justiça — um atrasado ausente nunca passa por aqui (não
    // está em `outfieldersAvail`), então seu `benchCounts` fica intacto
    // (0, ou semeado no valor do time no momento da chegada) enquanto durar
    // a ausência (pedido explícito do dono).
    for (const p of benched) benchCounts.set(p.id, (benchCounts.get(p.id) ?? 0) + 1);
    benchedLastRound = benchedSet;
    const lineOutfielders = outfieldersAvail.filter((p) => !benchedSet.has(p.id));
    const linePlayers = [...lineKeepers, ...lineOutfielders].slice(0, 6);
    if (linePlayers.length !== 6) {
      // Com os invariantes de hoje (decisão de goleiro por RODADA, sempre
      // exigindo `availableCount >= 7` pra `fieldedThisRound`, e
      // `lineShortfall` acima cobrindo `availableCount < 6`), a conta de
      // `neededFromOutfielders` + `lineKeepers.length` sempre fecha em 6 —
      // provado no comentário de `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`. Por
      // isso, ao contrário de uma versão antiga deste código, NÃO degrada em
      // silêncio se ainda assim divergir: sinaliza a MESMA invalidez de
      // `benchRuleBroken` (a divisão é descartada por `balance.ts`, nunca só
      // penalizada no custo) — só alcançável por um bug real não previsto.
      benchRuleBroken = true;
      games.push({ ...baseLineup, game: g + 1, arrivals });
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
      arrivals,
    });
  }
  // Colapsa se, na prática, todos os jogos ficaram idênticos (sem variação real).
  const sig = (g: GameLineup): string =>
    [g.goalkeeperName ?? '', ...g.slots.map((s) => s.player.name).sort(), '#', ...[...g.benchNames].sort()].join('|');
  const allSame = games.every((g) => sig(g) === sig(games[0]));
  const scheduleResult = {
    goalkeeperWarning, benchRuleBroken, benchOutfielders: outfielders.length, benchSlots: benchCount, lineShortfall,
  };
  if (allSame) return { games: [games[0]], constant: true, ...scheduleResult };
  return { games, constant: false, ...scheduleResult };
};
