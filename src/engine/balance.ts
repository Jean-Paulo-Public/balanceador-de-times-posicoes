// Balanceador v3 (o coração). Estratégia em duas camadas:
//   1) Reaproveita `generateTeams` (motor atual, testado) para gerar DIVISÕES
//      candidatas viáveis (mínimos por posição, reserva de goleiro, 6 de
//      linha, teto de atacantes) — continua usando a `position` de ORIGEM
//      (Defensor/Meia/Atacante) só pra agrupar QUEM fica com quem.
//   2) Reavalia cada divisão com o MODELO v3 — sistema tático inferido via
//      húngaro (Fase 4) e custo = MÉDIA das métricas ao longo dos 6 JOGOS do
//      rodízio (Fase 6, cada jogo pode reinferir um sistema diferente) —
//      escolhe a de menor custo multi-métrica e melhora com BUSCA LOCAL.
//
// Ver docs/Design_v2_Atributos_Funcoes_Sinergia.md (Seções 7, 8, 9, 11, 12) e
// o pedido da Fase 6 (média de 6 jogos, fila do goleiro, sem penalidade de
// congestionamento de pivô — a restrição de 1 pivô por time é estrutural).

import type { Player, SimulationResult, LateArrival } from '../domain/types';
import { enabledLinePositions, hasEnabledBoxToBox, type LinePosition } from '../domain/positions';
import { teamDisplayLabel } from '../domain/teamLabel';
import { effectiveAttributesBase, effectiveGk } from './playerModel';
import { ovr, potencialAtaque, estabilidadeDefensiva, coberturaGol, DEF_STABILITY_BETA } from './scoring';
import { chooseBestSystem, createFormationCache, type FormationCache, type FormationShape, type FieldZone } from './formationModel';
import { buildTeamSchedule, gamesForTeamCount, clampLateArrivals, MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER } from './rotation';
import { generateTeams } from './generateTeams';
import { checkPositionFeasibility, joinNames, type FeasibilityResult } from './feasibility';

// ---------------------------------------------------------------------------
// Jogador resolvido (com atributos garantidos)
// ---------------------------------------------------------------------------

// Exportado só pra teste (mesmo motivo de `TeamMetrics`/`teamMetrics` acima).
export interface RP {
  player: Player;
  attrs: ReturnType<typeof effectiveAttributesBase>;
  gk: number | null;
}

export const resolvePlayer = (p: Player): RP => ({
  player: p,
  attrs: effectiveAttributesBase(p),
  gk: effectiveGk(p),
});

// ---------------------------------------------------------------------------
// Métricas por time (Seções 5, 7, 8) — agora MÉDIA sobre os 6 jogos (Fase 6)
// ---------------------------------------------------------------------------

const mean = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const variance = (v: number[]): number => {
  if (v.length === 0) return 0;
  const m = mean(v);
  return v.reduce((acc, x) => acc + (x - m) ** 2, 0) / v.length;
};

// Exportado só pra teste (mesmo motivo de `TeamMetrics`/`teamMetrics` acima).
export interface DivTeam {
  id: number;
  name: string;
  gk: RP | null;   // goleiro reservado (quando o motor reserva um)
  line: RP[];      // 6 de linha
  bench: RP[];
}

/**
 * Contribuição de cada zona do campo para os eixos ofensivo e defensivo (pedido
 * do dono: "o campo é grande, quando o Jon está na defesa ele contribui pouco
 * pro ataque"). Espelhados: quem defende contribui 100% atrás e 30% na frente.
 * Meia-atacante fica no MEI (70/70) — contribui "como um meia faz".
 */
const ATTACK_ZONE_FACTOR: Record<FieldZone, number> = { DEF: 0.30, MEI: 0.70, ATA: 1.00 };
const DEFENSE_ZONE_FACTOR: Record<FieldZone, number> = { DEF: 1.00, MEI: 0.70, ATA: 0.30 };

// Exportado só pra teste (ver balance.test.ts, verificação direta de que a
// nota de goleiro fica de fora do eixo defensivo nas rodadas de goleiro
// EMPRESTADO por atraso) — nada de produção importa isto além de
// `teamMetrics`/`buildBalancedTeam` abaixo.
export interface TeamMetrics {
  geral: number;
  /** Ponderado por zona — para o CUSTO (comparação entre times). */
  off: number;
  def: number;
  /**
   * `off`/`def` renormalizados pela média dos fatores aplicados — para EXIBIR.
   * O custo usa os valores ponderados (escala menor); a UI usa estes, de volta
   * na régua 0–100 familiar. Normalizar pela média REAL dos fatores (e não por
   * um percentual fixo) é o que mantém dois times comparáveis quando eles
   * escolhem sistemas diferentes — um DEFENSIVO tem 2 laterais, um OFENSIVO
   * tem 2 alas, e a mistura de fatores muda em cada caso.
   */
  offDisplay: number;
  defDisplay: number;
  /** Recuo defensivo médio da linha (atributo RCD): quem volta pra marcar. */
  recuo: number;
  /** Pressão média da linha (atributo INT): pressão no meio e à frente. */
  pressao: number;
  /**
   * SOMENTE INFORMATIVO (exibido na UI) — média das notas dos goleiros que
   * revezam. NÃO entra no custo do balanceamento: a nota de goleiro é
   * independente e já pesa em `geral`, no jogo em que ele está no gol.
   * null = goleiro emprestado/de fora do elenco.
   */
  cobertura: number | null;
  fitQuality: number;       // qualidade média do encaixe no sistema, MÉDIA dos 6 jogos
  feasible: boolean;
  goalkeeperWarning: string | null;
  /**
   * true quando o rodízio de banco deste time NÃO conseguiu cumprir "ninguém
   * fica 2 jogos seguidos no banco" (e a exceção do checkbox, se ligada)
   * nalguma rodada — Fase 6+, ver `benchRotation.ts`. NÃO confundir com
   * `feasible` acima (que é sobre ENCAIXE DE POSIÇÃO/sistema tático,
   * checado por `chooseBestSystem`/`checkPositionFeasibility` — Fase 5):
   * são dois conceitos de "infactibilidade" independentes, um sobre POSIÇÃO
   * e outro sobre a REGRA DE ROTAÇÃO DO BANCO. Times com isso `true`
   * derrubam a divisão inteira (é EXCLUÍDA de `balanceTeamsOptions`, nunca só
   * penalizada no custo — ver o filtro em `balanceTeamsOptions`).
   */
  benchRuleBroken: boolean;
  /** Nº de jogadores de linha disponíveis pro banco deste time — só pra compor a mensagem de bloqueio quando `benchRuleBroken`. */
  benchOutfielders: number;
  /** Vagas de banco por rodada deste time — idem. */
  benchSlots: number;
  /**
   * Detalhe de uma rodada em que atrasados ainda ausentes deixaram gente de
   * menos pra fechar os 6 de linha (ver `TeamSchedule.lineShortfall` em
   * rotation.ts) — dispara a MESMA invalidez de `benchRuleBroken`, mas com
   * números próprios pra distinguir a causa na mensagem de bloqueio.
   */
  lineShortfall: { round: number; available: number; needed: number } | null;
}

/** Jogadores aptos ao gol que revezam neste time (reservado + aptos na linha). */
const rotatingGks = (t: DivTeam): RP[] =>
  [t.gk, ...t.line].filter((r): r is RP => !!r && r.player.isGoalkeeper && r.gk != null);

/**
 * Tamanho do ELENCO COMPLETO deste time (goleiro reservado + 6 de linha +
 * banco) — é este número, e não a mera existência de alguém apto ao gol, que
 * decide se o time pode revezar o PRÓPRIO goleiro (ver
 * `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER` em rotation.ts).
 */
const fullRosterSize = (t: DivTeam): number => (t.gk ? 1 : 0) + t.line.length + t.bench.length;

/**
 * Decide se o time TEM CAPACIDADE ESTRUTURAL de escalar/revezar goleiro
 * PRÓPRIO nesta divisão — bug relatado pelo dono: "está revezando goleiro e
 * ficando com 5 na linha". Antes desta checagem, `fielding` considerava só
 * "existe alguém apto ao gol" — bastava isso pra tentar tirar um jogador da
 * linha e colocá-lo no gol, mesmo em times de 6 (onde os 6 são TODOS de linha
 * e o goleiro tem de vir EMPRESTADO de fora). A regra correta (pedido do
 * dono): só tem CAPACIDADE de revezar goleiro PRÓPRIO com pelo menos
 * `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER` (7) no elenco completo. Com 6, mesmo
 * alguém apto ao gol existindo (e é comum existir — é assim que o empréstimo
 * funciona quando é a vez do time ficar de fora), o time joga com o gol
 * emprestado e os 6 vão pra linha.
 *
 * *** CORREÇÃO DE DESIGN (2ª volta do mesmo bug, com atrasados) ***: uma
 * versão anterior deste comentário afirmava que esta regra era "do ELENCO
 * ... NUNCA por rodada" — ISSO ESTAVA ERRADO e foi corrigido: o bug
 * reapareceu quando um jogador com `LateArrival` deixava o time com só 6
 * disponíveis EM RODADAS ESPECÍFICAS (elenco de 7+ no total, mas faltando
 * gente bastante numa rodada) — o time revezava goleiro próprio mesmo assim
 * e voltava a jogar com 5 na linha.
 *
 * O que esta função (`canFieldOwnGoalkeeper`) calcula CONTINUA sendo do
 * elenco completo — isso não mudou — mas agora representa só a CAPACIDADE
 * ESTRUTURAL (um teto): "o time tem corpo pra revezar goleiro próprio SE
 * todo mundo estiver presente". A decisão do que de fato acontece EM CADA
 * RODADA (considerando quem está ausente por atraso NAQUELA rodada
 * específica) foi movida pra `buildTeamSchedule` (rotation.ts, variável
 * `fieldedThisRound`) — é ali, não aqui, que mora a regra "por rodada". Ver
 * o comentário de `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER` em rotation.ts para
 * o desenho completo (inclusive por que um mesmo time pode revezar goleiro
 * próprio em algumas rodadas e usar emprestado em outras, na MESMA divisão).
 */
const canFieldOwnGoalkeeper = (t: DivTeam, neverGk: boolean, rot: RP[]): boolean =>
  !neverGk && rot.length > 0 && fullRosterSize(t) >= MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER;

/** Inferência "geral" (jogo-base, sem rotação) — usada pro resumo/tática/roster exibidos. */
const baseInference = (t: DivTeam, cache?: FormationCache) => chooseBestSystem(t.line.map((r) => r.player), cache);

/**
 * Métricas de um time = MÉDIA sobre os 6 jogos do rodízio (Fase 6): reaproveita
 * `buildTeamSchedule` (que já reinfere o sistema por jogo, aplica a fila do
 * goleiro com a regra do Jogo 1, e escalona o banco) sobre a escalação-base.
 */
export const teamMetrics = (
  t: DivTeam, neverGk: boolean, allowTwoConsecutiveBench: boolean, cache?: FormationCache, totalGames = 6,
  lateArrivals?: ReadonlyMap<string, number>,
): TeamMetrics => {
  if (t.line.length !== 6) {
    const lineAttrs = t.line.map((r) => r.attrs);
    return {
      geral: mean(lineAttrs.map((a) => ovr(a, 'Geral'))), off: 0, def: 0,
      offDisplay: 0, defDisplay: 0, recuo: 0, pressao: 0,
      cobertura: null, fitQuality: -100, feasible: false, goalkeeperWarning: null,
      benchRuleBroken: false, benchOutfielders: 0, benchSlots: 0, lineShortfall: null,
    };
  }
  const inf = baseInference(t, cache);
  const rot = rotatingGks(t);
  const fielding = canFieldOwnGoalkeeper(t, neverGk, rot);

  const baseSlots = inf.assignments.map((a) => ({
    player: t.line[a.playerIndex].player,
    role: a.identity as LinePosition,
    zone: a.zone,
    fit: Math.round(a.fit),
    x: a.x,
    y: a.y,
  }));

  const provisional: BalancedTeam = {
    id: t.id, name: t.name, formation: inf.system, slots: baseSlots,
    goalkeeper: t.gk?.player ?? null,
    fieldsGoalkeeper: fielding,
    rotatingGoalkeepers: rot.map((r) => r.player.name),
    bench: t.bench.map((r) => r.player),
    metrics: {
      geral: 0, off: 0, def: 0, recuo: 0, pressao: 0, cobertura: null, fitQuality: 0,
      feasible: inf.feasible,
    },
  };

  const sched = buildTeamSchedule(provisional, totalGames, cache, allowTwoConsecutiveBench, lateArrivals);
  // Nota de goleiro por jogador — a nota do goleiro é INDEPENDENTE: não é
  // afetada por nenhum outro atributo e não afeta nenhuma outra métrica.
  const gkOf = new Map(
    [t.gk, ...t.line, ...t.bench]
      .filter((r): r is RP => !!r && r.gk != null)
      .map((r) => [r.player.id, r.gk as number] as const),
  );

  const gameMetrics = sched.games.map((g) => {
    const attrsOf = new Map(t.line.map((r) => [r.player.id, r.attrs] as const));
    const lineAttrs = g.slots.map((s) => attrsOf.get(s.player.id) ?? effectiveAttributesBase(s.player));
    const fitAvg = g.slots.length ? mean(g.slots.map((s) => s.fit)) : -100;
    // Goleiro ESCALADO NESTE JOGO. Se ninguém do elenco está no gol (goleiro
    // emprestado/de fora), não entra em conta nenhuma — sem eixo global
    // neutralizado, sem penalidade fantasma.
    // `fielding` é obrigatório: com goleiro emprestado o time ainda carrega um
    // `goalkeeper` reservado no objeto, então só o id não basta — sem isso a
    // nota dele entraria num jogo em que ele NÃO está no gol.
    const gkThisGame = fielding && g.goalkeeperId != null ? gkOf.get(g.goalkeeperId) : undefined;
    // A nota de goleiro compõe o EIXO DEFENSIVO (não o `geral`), com peso 1/3
    // contra 2/3 da linha — decisão de domínio do dono: uma zaga boa e um meio
    // que defende cobrem chute de fora e de dentro da área, então goleiro ruim
    // impacta a defesa de forma MEDIANA, não decisiva. Fica só aqui para não
    // contar duas vezes; o `geral` é exclusivamente dos 6 de linha.
    // Fatores de zona da vaga que cada um ocupa NESTE jogo (índices alinhados
    // com `lineAttrs`, que é montado do mesmo `g.slots`).
    const offF = g.slots.map((s) => ATTACK_ZONE_FACTOR[s.zone]);
    const defF = g.slots.map((s) => DEFENSE_ZONE_FACTOR[s.zone]);
    const offMeanF = offF.length ? mean(offF) : 1;
    const defMeanF = defF.length ? mean(defF) : 1;

    const defLinha = estabilidadeDefensiva(lineAttrs, DEF_STABILITY_BETA, defF);
    const offPond = potencialAtaque(lineAttrs, offF);
    // Versões de EXIBIÇÃO: desfazem o encolhimento médio causado pelos fatores,
    // devolvendo o número à régua 0–100. A nota do goleiro NÃO é renormalizada
    // (ela não sofreu fator de zona — goleiro é goleiro), por isso a combinação
    // 2/3 + 1/3 é refeita com a linha já normalizada.
    const defLinhaDisp = defMeanF > 0 ? defLinha / defMeanF : defLinha;
    return {
      // `geral` e `off` são EXCLUSIVAMENTE dos 6 de linha: a nota de goleiro não
      // entra em nenhum dos dois. No ataque isso é explícito (nenhum goleiro do
      // elenco joga bem com os pés — não faz sentido a nota de goleiro melhorar
      // o potencial ofensivo do time).
      geral: mean(lineAttrs.map((a) => ovr(a, 'Geral'))),
      off: offPond,
      def: gkThisGame != null ? (2 / 3) * defLinha + (1 / 3) * gkThisGame : defLinha,
      offDisplay: offMeanF > 0 ? offPond / offMeanF : offPond,
      defDisplay: gkThisGame != null ? (2 / 3) * defLinhaDisp + (1 / 3) * gkThisGame : defLinhaDisp,
      // RCD (recuo) e INT (pressão à frente) entram como EIXOS SEPARADOS, nunca
      // somados numa média única: são perfis opostos e foi exatamente por isso
      // que o antigo atributo REC foi dividido em dois. Um jogador que pressiona
      // muito à frente mas é frouxo voltando tem `pressao` alta e `recuo` baixo,
      // e o balanceador PRECISA enxergar essa diferença — se os dois virassem um
      // número só, ele voltaria a tratá-lo como equivalente a um volante que se
      // sacrifica no recuo. Não existe mais o OVR 'Intensidade' (removido por
      // colidir de nome com o atributo-base INT), então lê-se o atributo direto.
      recuo: mean(lineAttrs.map((a) => a.RCD)),
      pressao: mean(lineAttrs.map((a) => a.INT)),
      fitQuality: g.feasible ? fitAvg : -100,
      feasible: g.feasible,
    };
  });

  return {
    geral: mean(gameMetrics.map((g) => g.geral)),
    off: mean(gameMetrics.map((g) => g.off)),
    def: mean(gameMetrics.map((g) => g.def)),
    offDisplay: mean(gameMetrics.map((g) => g.offDisplay)),
    defDisplay: mean(gameMetrics.map((g) => g.defDisplay)),
    recuo: mean(gameMetrics.map((g) => g.recuo)),
    pressao: mean(gameMetrics.map((g) => g.pressao)),
    cobertura: fielding ? coberturaGol(rot.map((r) => r.gk as number)) : null,
    fitQuality: mean(gameMetrics.map((g) => g.fitQuality)),
    feasible: gameMetrics.every((g) => g.feasible),
    goalkeeperWarning: sched.goalkeeperWarning,
    benchRuleBroken: sched.benchRuleBroken,
    benchOutfielders: sched.benchOutfielders,
    benchSlots: sched.benchSlots,
    lineShortfall: sched.lineShortfall,
  };
};

// Pesos do custo multi-métrica (somam 1,00). Prioridade na defesa (pedido do Jean).
//
// NÃO existe mais eixo `cobertura` no custo. A nota de goleiro entra APENAS no
// eixo `def`, valendo 1/3 dele (2/3 são da linha), e só no JOGO em que aquele
// goleiro está escalado no gol.
//
// CALIBRAGEM (Fase 7 — elenco real, ver balance.equilibrioDefensivo.test.ts):
// o dono relatou um time saindo com Tony+Guto+Jean+Torres juntos (4 jogadores
// que voltam pouco pra marcar) enquanto os únicos 4 defensores realmente bons
// do elenco (Jon/Jezzel/Rodrigo/Kleber) não ficavam 2-2. `def` subiu 0,24→0,26
// e `recuo` DOBROU (0,07→0,14) às custas de `geral` (0,30→0,26) e `off`
// (0,14→0,13) — na direção pedida. Isso sozinho NÃO bastou: no elenco de
// teste, o par de defensores bons que sobra pra dividir com um "terceiro nome"
// médio (Beto ou Bruno) força uma divisão onde a única folga inevitável cai
// no eixo `pressao` (INT) — Jon é o ÚNICO bom defensor com INT alto (75); os
// outros três (Jezzel/Rodrigo/Kleber) têm INT=0, então qualquer separação 2-2
// deles deixa um lado sem ninguém de pressão alta a não ser que um jogador de
// fora (ex.: Jean, Beto) plugue esse buraco — e isso é EXATAMENTE o que
// travava o 3º defensor (Beto/Bruno) de entrar no time certo em qualquer
// combinação razoável de def/recuo/geral/off: aumentar `def`/`recuo` sozinho
// (testado até valores extremos, ver relatório da tarefa) NUNCA virou o
// resultado, porque o `def`/`recuo` das duas divisões candidatas eram quase
// IDÊNTICOS — a decisão real estava sendo tomada pelo eixo `pressao`, que é
// sobre PRESSÃO À FRENTE (meio-campo/ataque, ver INT em domain/attributes.ts),
// não sobre solidez defensiva. Por isso `pressao` caiu de 0,05 para 0,01
// (quase não pesa mais no custo, mas o atributo/eixo continuam existindo e
// sendo exibidos normalmente) — ele não é o que o dono pediu pra equilibrar
// ("contexto defensivo"), e mantê-lo com peso relevante estava, na prática,
// competindo com e vencendo a prioridade de defesa pedida.
// Exportado só pra teste (ver balance.test.ts, "os pesos do custo somam 1,00")
// verificar a invariante sem duplicar os valores — nada de produção importa
// isto além de `divisionCost` abaixo.
export const W = { def: 0.26, geral: 0.22, off: 0.13, recuo: 0.14, pressao: 0.05, fitQuality: 0.20 };
const INFEASIBLE_PENALTY = 1000;
// Penaliza um par "manter separados" que caiu no mesmo time (suave: cede se separar custar muito equilíbrio).
const SEPARATION_PENALTY = 60;
// NOTA (Fase 6): o antigo PIVOT_CONGESTION_PENALTY (40) foi REMOVIDO — com o
// modelo v3, cada sistema tático tem exatamente 1 vaga que aceita PIVO, então
// a restrição "no máximo 1 pivô por time" já é ESTRUTURAL (o húngaro nunca
// escala 2 jogadores na mesma vaga). A penalidade extra só distorcia o custo.

// ---------------------------------------------------------------------------
// Regra de distribuição de veteranos (própria — ver `veteran` em domain/types.ts)
// ---------------------------------------------------------------------------

/**
 * Nº de veteranos alocados a este time nesta divisão — ELENCO COMPLETO
 * (goleiro reservado + 6 de linha + banco), lido direto do `DivTeam` que sai
 * do motor de divisão. DELIBERADAMENTE não passa pelo rodízio de jogos
 * (`buildTeamSchedule`/`chooseBenchGroup`): a conta é feita UMA VEZ, na
 * FORMAÇÃO dos times, não jogo a jogo. Ver `veteranDistributionBroken` abaixo
 * para o porquê isso importa.
 */
const veteransOf = (t: DivTeam): RP[] =>
  [t.gk, ...t.line, ...t.bench].filter((r): r is RP => !!r && !!r.player.veteran);

/**
 * Veterano cadastrado SÓ como pivô (nenhuma outra posição habilitada, e não é
 * coringa). Caso real do dono: gente que joga de segundo atacante/meia-atacante
 * e só "quebra um galho" no pivô acaba marcada apenas como PIVO na lista.
 */
const isPivotOnly = (p: Player): boolean => {
  if (hasEnabledBoxToBox(p.acceptedPositions)) return false;
  const enabled = enabledLinePositions(p.acceptedPositions);
  return enabled.length === 1 && enabled[0] === 'PIVO';
};

/**
 * Um veterano PIVÔ-ONLY só CONTA para a distribuição quando o total de veteranos
 * é <= o nº de TIMES, ou múltiplo do nº de times (regra do dono).
 *
 * O racional: nesses dois casos a distribuição já sai limpa sozinha — com
 * `V <= T` cada time leva no máximo 1 veterano, e com `V` múltiplo de `T` a
 * divisão é exata (`V/T` em cada) — então não há motivo pra tratar o pivô de
 * forma especial. Fora desses casos algum time levaria um veterano A MAIS, e é
 * aí que o pivô sai da conta: ele fica plantado na área e não corre o campo,
 * então o time DELE é quem aguenta o veterano extra. Ignorá-lo aqui deixa os
 * veteranos que CORREM se dividirem igualmente, e o pivô cai onde o custo
 * preferir — resultando exatamente no que o dono quer (nunca dois veteranos
 * "que correm" juntos enquanto o outro time fica só com o pivô).
 * Exemplo: 3 veteranos (2 comuns + 1 pivô) em 2 times → 3 > 2 e 3 % 2 != 0, o
 * pivô é ignorado, os 2 comuns ficam 1 em cada, e o pivô acompanha um deles.
 *
 * O `total` é o nº de veteranos marcados ANTES de qualquer exclusão — se fosse
 * a contagem já filtrada, a condição seria circular (a exclusão dependeria do
 * resultado dela mesma).
 */
const pivotOnlyVeteransCount = (total: number, numTeams: number): boolean =>
  total <= numTeams || total % numTeams === 0;

/**
 * Nº de veteranos que a regra REALMENTE considera nesta divisão (já sem os
 * pivô-only ignorados). É este número que a mensagem de bloqueio deve citar —
 * o total bruto confundiria o usuário, que veria "há 4 veteranos" numa
 * distribuição calculada sobre 3.
 */
export const effectiveVeteranCount = (teams: DivTeam[]): number => {
  const perTeam = teams.map(veteransOf);
  const total = perTeam.reduce((s, v) => s + v.length, 0);
  const includePivotOnly = pivotOnlyVeteransCount(total, teams.length);
  return perTeam.reduce((s, vs) => s + vs.filter((r) => includePivotOnly || !isPivotOnly(r.player)).length, 0);
};

/**
 * Sinal de invalidez por DISTRIBUIÇÃO DE VETERANOS — regra HARD e própria,
 * independente de `feasible` (encaixe de POSIÇÃO/sistema tático, Fase 5) e de
 * `benchRuleBroken` (regra de ROTAÇÃO DO BANCO, Fase 6+): esta é sobre como os
 * jogadores marcados `veteran` ficam distribuídos ENTRE OS TIMES da divisão.
 * Com `V` veteranos ativos e `T` times, cada time só pode ficar com um nº de
 * veteranos entre `floor(V/T)` e `ceil(V/T)` — uma divisão que concentra
 * veteranos num só time viola isso e é EXCLUÍDA em `balanceTeamsOptions`
 * (nunca só penalizada no custo), do mesmo jeito que a regra do banco.
 *
 * IMPORTANTE (pedido explícito do dono): esta regra vale só pra COMPOSIÇÃO DO
 * TIME (elenco completo, `DivTeam[]` antes de qualquer rodízio) — NÃO por
 * jogo. Reaproveita da regra do banco só a ARQUITETURA de invalidez (sinal
 * por divisão + filtro + mensagem no report), nunca o laço por rodada: quem
 * está EM CAMPO num jogo específico do rodízio pode ficar temporariamente
 * desbalanceado (um veterano no banco daquela rodada, por exemplo) sem que
 * isso invalide a divisão — só a distribuição do ELENCO TODO é que precisa
 * bater com `floor(V/T)`/`ceil(V/T)`. Checar por jogo tornaria a restrição
 * muito mais dura do que o pedido (e provavelmente infactível na prática),
 * além de ficar mais caro (dependeria de rodar o rodízio pra saber).
 */
// Exportado só pra teste (ver balance.veteranDistribution.test.ts) — mesmo
// motivo de `W` ser exportado: verificar a regra sem duplicar a fórmula.
export const veteranDistributionBroken = (teams: DivTeam[]): boolean => {
  const perTeam = teams.map(veteransOf);
  const total = perTeam.reduce((s, v) => s + v.length, 0);
  if (total === 0) return false; // sem veteranos marcados = sem restrição (comportamento de hoje)

  // Veterano pivô-only entra na conta só sob a condição do dono:
  // total <= nº de times, ou múltiplo do nº de times.
  const includePivotOnly = pivotOnlyVeteransCount(total, teams.length);
  const counts = perTeam.map((vs) => vs.filter((r) => includePivotOnly || !isPivotOnly(r.player)).length);

  // A distribuição floor/ceil vale sobre o total EFETIVO (após a exclusão) —
  // usar o total bruto exigiria espalhar veteranos que a regra acabou de ignorar.
  const effective = counts.reduce((a, b) => a + b, 0);
  if (effective === 0) return false;
  const t = teams.length;
  const lo = Math.floor(effective / t);
  const hi = Math.ceil(effective / t);
  return counts.some((c) => c < lo || c > hi);
};

/**
 * Mensagem de bloqueio quando NENHUMA divisão candidata cumpre a distribuição
 * equilibrada de veteranos (nem ignorando a regra, quando ela está desligada
 * — se `ignoreVeteranDistribution` estivesse ligado esta função nem seria
 * chamada, ver `balanceTeamsOptions`). Cita os NÚMEROS REAIS (quantos
 * veteranos ativos, quantos times, a distribuição exigida) e as saídas.
 */
// Exportado só pra teste — verificar o texto da mensagem sem duplicá-lo.
export const veteranInfeasibilityMessage = (totalVeterans: number, numTeams: number): string => {
  const lo = Math.floor(totalVeterans / numTeams);
  const hi = Math.ceil(totalVeterans / numTeams);
  const distribution = lo === hi
    ? `exatamente ${lo} veterano(s) por time`
    : `entre ${lo} e ${hi} veteranos por time`;
  const cause =
    `há ${totalVeterans} veterano(s) ativo(s) para ${numTeams} times — a distribuição exigida é ${distribution}, ` +
    `e nenhuma divisão candidata conseguiu cumprir isso sem concentrar veteranos demais num time.`;
  const options = [
    'marque a opção "Desconsiderar veteranos"',
    'mude a quantidade de times',
    'revise quem está marcado como veterano no cadastro',
  ];
  return `Nenhuma divisão respeita a distribuição equilibrada de veteranos: ${cause} Saídas: ${joinNames(options)}.`;
};

// ---------------------------------------------------------------------------
// Regra de distribuição de QUEM MARCA BEM (própria — ver `goodMarker` em
// domain/types.ts) + regra de NÃO-ACÚMULO com veteranos
// ---------------------------------------------------------------------------

/**
 * Jogadores marcados "sabe marcar bem" neste time — ELENCO COMPLETO (goleiro
 * reservado + 6 de linha + banco), exatamente como `veteransOf`: a conta é
 * feita UMA VEZ na FORMAÇÃO dos times, nunca dentro do rodízio de jogos.
 */
const goodMarkersOf = (t: DivTeam): RP[] =>
  [t.gk, ...t.line, ...t.bench].filter((r): r is RP => !!r && !!r.player.goodMarker);

/**
 * Sinal de invalidez por DISTRIBUIÇÃO DE QUEM MARCA BEM — regra HARD, cópia
 * fiel de `veteranDistributionBroken` (floor/ceil sobre o elenco completo,
 * divisão EXCLUÍDA e não penalizada no custo) com UMA diferença deliberada:
 * NÃO existe exceção de "pivô-only" aqui. A exceção do veterano-pivô existe
 * porque pivô não corre o campo, o que é um argumento sobre CARGA FÍSICA; já
 * "sabe marcar bem" é uma habilidade defensiva que o time leva junto
 * independentemente da posição em que o cara joga, então todo marcador conta.
 */
// Exportado só pra teste (mesmo motivo de `veteranDistributionBroken`).
export const goodMarkerDistributionBroken = (teams: DivTeam[]): boolean => {
  const counts = teams.map((t) => goodMarkersOf(t).length);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return false; // ninguém marcado = sem restrição
  const t = teams.length;
  const lo = Math.floor(total / t);
  const hi = Math.ceil(total / t);
  return counts.some((c) => c < lo || c > hi);
};

/**
 * Sinal de invalidez por ACÚMULO DE ÔNUS (pedido explícito do dono) — regra
 * HARD que CRUZA as duas marcações: quando a divisão de marcadores não fecha
 * exata (alguém precisa ficar com um a menos), o time que leva o "a menos" de
 * quem marca bem NÃO pode ser também um time que leva "a mais" de veterano.
 * Sem isso, um mesmo time podia acumular os dois lados ruins do arredondamento
 * (menos marcação E mais veterano) enquanto outro levava os dois bons.
 *
 * Formalização, sem depender de `%` (robusta mesmo quando a regra de veteranos
 * está desligada ou quando a exceção do pivô-only deixou as contagens BRUTAS
 * fora de floor/ceil):
 *  - time "com marcador a menos" = `markers[i] < max(markers)`;
 *  - time "com veterano a mais"  = `vets[i] > min(vets)`;
 *  - viola se ALGUM time é as duas coisas ao mesmo tempo.
 * Com marcadores igualmente divididos ninguém está "a menos" (nenhum `i`
 * satisfaz a primeira condição) e a regra não restringe nada — idem com
 * veteranos igualmente divididos.
 *
 * A contagem de veteranos aqui é a BRUTA (`veteransOf`), INCLUINDO os
 * pivô-only — pedido literal do dono ("incluindo os pivôs"). É de propósito
 * diferente de `effectiveVeteranCount`: aquela exclusão existe só pra decidir
 * QUEM a distribuição de veteranos precisa espalhar; nesta regra o que importa
 * é quantos veteranos o time de fato carrega.
 */
// Exportado só pra teste (mesmo motivo de `veteranDistributionBroken`).
export const markerVeteranStackingBroken = (teams: DivTeam[]): boolean => {
  const markers = teams.map((t) => goodMarkersOf(t).length);
  const vets = teams.map((t) => veteransOf(t).length);
  const maxMarkers = Math.max(...markers);
  const minVets = Math.min(...vets);
  return teams.some((_, i) => markers[i] < maxMarkers && vets[i] > minVets);
};

/**
 * Mensagem de bloqueio quando NENHUMA divisão candidata cumpre a distribuição
 * equilibrada de quem marca bem. Cita os NÚMEROS REAIS, no mesmo formato de
 * `veteranInfeasibilityMessage`.
 */
// Exportado só pra teste — verificar o texto sem duplicá-lo.
export const goodMarkerInfeasibilityMessage = (totalMarkers: number, numTeams: number): string => {
  const lo = Math.floor(totalMarkers / numTeams);
  const hi = Math.ceil(totalMarkers / numTeams);
  const distribution = lo === hi
    ? `exatamente ${lo} por time`
    : `entre ${lo} e ${hi} por time`;
  const cause =
    `há ${totalMarkers} jogador(es) que marca(m) bem para ${numTeams} times — a distribuição exigida é ` +
    `${distribution}, e nenhuma divisão candidata conseguiu cumprir isso sem concentrar marcação demais num time.`;
  const options = [
    'marque a opção "Desconsiderar quem marca bem"',
    'mude a quantidade de times',
    'revise quem está marcado como "Sabe marcar bem" no cadastro',
  ];
  return `Nenhuma divisão respeita a distribuição equilibrada de quem marca bem: ${cause} Saídas: ${joinNames(options)}.`;
};

/**
 * Mensagem de bloqueio quando toda divisão candidata que respeitava as duas
 * distribuições ainda assim empilhava os dois ônus no mesmo time (ver
 * `markerVeteranStackingBroken`).
 */
// Exportado só pra teste — verificar o texto sem duplicá-lo.
export const markerVeteranStackingMessage = (
  totalMarkers: number, totalVeterans: number, numTeams: number,
): string => {
  const cause =
    `com ${totalMarkers} jogador(es) que marca(m) bem e ${totalVeterans} veterano(s) (contando os pivôs) para ` +
    `${numTeams} times, nenhuma das contas fecha exata — e em toda divisão candidata o time que ficou com um ` +
    `marcador a menos era também o que ficava com um veterano a mais, acumulando os dois ônus no mesmo time.`;
  const options = [
    'marque a opção "Desconsiderar quem marca bem"',
    'marque a opção "Desconsiderar veteranos"',
    'mude a quantidade de times',
    'revise quem está marcado como veterano ou como "Sabe marcar bem" no cadastro',
  ];
  return `Nenhuma divisão evita acumular "menos marcação" e "mais veterano" no mesmo time: ${cause} Saídas: ${joinNames(options)}.`;
};

// ---------------------------------------------------------------------------
// Regra de distribuição de ATRASADOS (própria — ver `LateArrival` em
// domain/types.ts) — MESMA arquitetura da regra de veteranos acima (sinal por
// divisão, checado sobre o ELENCO COMPLETO, UMA vez por divisão candidata,
// nunca dentro do rodízio de jogos), mas SEM a exceção de "pivô-only" (não faz
// sentido aqui: atraso não tem relação com posição jogada) — só floor/ceil
// puro. NÃO CONFUNDIR com `veteranDistributionBroken` nem com
// `benchRuleBroken`/`lineShortfall` (esses dois são sobre o RODÍZIO DE JOGOS,
// checados jogo a jogo dentro de `teamMetrics`/`buildTeamSchedule`) — este é
// um QUARTO conceito de invalidez, independente dos outros três: é sobre como
// os jogadores marcados como "atrasados" (ver `LateArrival`) ficam
// distribuídos ENTRE OS TIMES da divisão, sem olhar pro rodízio.
// ---------------------------------------------------------------------------

/** Jogadores marcados como atrasados neste time (ELENCO COMPLETO: gol + linha + banco). */
const lateArrivalsOf = (t: DivTeam, lateArrivals: ReadonlyMap<string, number>): RP[] =>
  [t.gk, ...t.line, ...t.bench].filter((r): r is RP => !!r && lateArrivals.has(r.player.id));

/**
 * Sinal de invalidez por DISTRIBUIÇÃO DE ATRASADOS — regra HARD e própria
 * (ver comentário acima). Com `A` atrasados (contando só quem de fato está em
 * algum time desta divisão — um id "sobrando" no filtro que não corresponde a
 * ninguém ativo simplesmente não conta) e `T` times, cada time só pode ficar
 * com um nº de atrasados entre `floor(A/T)` e `ceil(A/T)`.
 */
// Exportado só pra teste (mesmo motivo de `veteranDistributionBroken`).
export const lateArrivalDistributionBroken = (teams: DivTeam[], lateArrivals: ReadonlyMap<string, number>): boolean => {
  if (lateArrivals.size === 0) return false; // sem atrasados marcados = sem restrição (comportamento de hoje)
  const counts = teams.map((t) => lateArrivalsOf(t, lateArrivals).length);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return false; // nenhum dos ids marcados está de fato num time desta divisão
  const t = teams.length;
  const lo = Math.floor(total / t);
  const hi = Math.ceil(total / t);
  return counts.some((c) => c < lo || c > hi);
};

/**
 * Mensagem de bloqueio quando NENHUMA divisão candidata cumpre a distribuição
 * equilibrada de atrasados. Cita os NÚMEROS REAIS (quantos atrasados, quantos
 * times, a distribuição exigida).
 */
// Exportado só pra teste — verificar o texto sem duplicá-lo.
export const lateArrivalInfeasibilityMessage = (totalLateArrivals: number, numTeams: number): string => {
  const lo = Math.floor(totalLateArrivals / numTeams);
  const hi = Math.ceil(totalLateArrivals / numTeams);
  const distribution = lo === hi
    ? `exatamente ${lo} atrasado(s) por time`
    : `entre ${lo} e ${hi} atrasados por time`;
  const cause =
    `há ${totalLateArrivals} jogador(es) marcado(s) como atrasado(s) para ${numTeams} times — a distribuição exigida ` +
    `é ${distribution}, e nenhuma divisão candidata conseguiu cumprir isso sem concentrar atrasados demais num time.`;
  const options = [
    'revise quem está marcado como atrasado no filtro "Não jogará os primeiros jogos"',
    'mude a quantidade de times',
  ];
  return `Nenhuma divisão respeita a distribuição equilibrada de atrasados: ${cause} Saídas: ${joinNames(options)}.`;
};

/** Mapa id do jogador -> índice do time em que ele está (linha, gol ou banco). */
const teamOfIdMap = (teams: DivTeam[]): Map<string, number> => {
  const m = new Map<string, number>();
  teams.forEach((t, i) => {
    [t.gk, ...t.line, ...t.bench].forEach((r) => { if (r) m.set(r.player.id, i); });
  });
  return m;
};

// ---------------------------------------------------------------------------
// Regra de EXCLUSÃO DE PARES (própria — ver `excludedTeammateIds` em
// domain/types.ts) — pedido literal do dono: "quando configurada tal jogador
// não vai poder jogar com outro jogador". MESMA arquitetura hard das quatro
// regras acima (sinal por divisão, elenco COMPLETO, filtro no laço + busca
// local + revalidação), com DUAS diferenças deliberadas:
//
//  1. A origem do dado é o CADASTRO do jogador (`Player.excludedTeammateIds`),
//     não uma config da pelada da semana — por isso não existe checkbox de
//     escape na tela de Simular Partidas, nem opção em `BalanceOptions`: a
//     regra fica sempre ativa quando o cadastro tem alguma exclusão relevante
//     no elenco ativo desta simulação.
//  2. NÃO É PARECIDA com `separatePairs`/`SEPARATION_PENALTY` (a opção "Manter
//     separados" da tela de Simular Partidas, configurada ali, na hora):
//     aquela é SOFT — só soma uma penalidade ao custo (`divisionCost`) e o par
//     pode acabar junto se separar custar caro demais (reportado em
//     `separationViolations`). Esta é HARD — uma divisão que junta um par
//     excluído é EXCLUÍDA das candidatas, nunca só penalizada — E TEM
//     FALLBACK AUTOMÁTICO: se, com a regra valendo, `balanceTeamsOptions` não
//     sobrar NENHUM resultado, a regra é desligada e a busca inteira é refeita
//     sem ela (ver o fallback dentro de `balanceTeamsOptions`) — o usuário
//     nunca vê uma mensagem de "impossível formar times" por causa da lista de
//     exclusão; no pior caso, um par excluído acaba junto e a UI avisa (ver
//     `BalanceResult.excludedPairsViolations`/`BalanceRunReport.exclusionsIgnored`).
// ---------------------------------------------------------------------------

/**
 * Deriva o conjunto de pares de exclusão a partir do CADASTRO
 * (`Player.excludedTeammateIds`) — SIMÉTRICO por construção: basta um dos dois
 * lados ter cadastrado o outro pra o par valer nos DOIS SENTIDOS (decisão de
 * design: derivar aqui em vez de gravar nos dois jogadores ao salvar o form,
 * porque gravar nos dois lados criaria dado que pode dessincronizar — ex.:
 * remover a exclusão de um lado sem lembrar de tirar do outro). Um id que
 * aponta pra jogador removido/inativo simplesmente NÃO CONTA: só ids
 * presentes em `activePlayers` formam par. Dedup: o mesmo par nunca aparece
 * duas vezes, mesmo que os dois jogadores tenham cadastrado a exclusão cada
 * um do seu lado.
 */
export const derivedExclusionPairs = (activePlayers: Player[]): [string, string][] => {
  const activeIds = new Set(activePlayers.map((p) => p.id));
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const p of activePlayers) {
    for (const otherId of p.excludedTeammateIds ?? []) {
      if (otherId === p.id || !activeIds.has(otherId)) continue; // auto-exclusão ou jogador fora do elenco ativo: não conta
      const [a, b] = p.id < otherId ? [p.id, otherId] : [otherId, p.id];
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, b]);
    }
  }
  return pairs;
};

/**
 * Sinal de invalidez por PAR EXCLUÍDO NO CADASTRO — regra HARD, mesma
 * arquitetura de `veteranDistributionBroken`/`lateArrivalDistributionBroken`
 * (elenco COMPLETO, checada uma vez por divisão). `pairs` já vem SIMÉTRICO e
 * deduplicado (ver `derivedExclusionPairs`) — aqui só resta olhar se algum dos
 * pares caiu no MESMO time.
 */
// Exportado só pra teste (mesmo motivo de `veteranDistributionBroken`).
export const exclusionPairBroken = (teams: DivTeam[], pairs: [string, string][]): boolean => {
  if (pairs.length === 0) return false;
  const teamOf = teamOfIdMap(teams);
  return pairs.some(([a, b]) => {
    const ta = teamOf.get(a);
    const tb = teamOf.get(b);
    return ta != null && tb != null && ta === tb;
  });
};

/**
 * Custo de uma divisão: variância ponderada das métricas (médias dos jogos do
 * rodízio) entre os times + penalidades. O nº de jogos vem de
 * `gamesForTeamCount` (9 com 2 times, 6 com 3+), derivado do próprio array.
 */
const divisionCost = (
  teams: DivTeam[], neverGk: boolean, allowTwoConsecutiveBench: boolean, separate: [string, string][] = [], cache?: FormationCache,
  lateArrivals?: ReadonlyMap<string, number>,
): number => {
  const games = gamesForTeamCount(teams.length);
  const ms = teams.map((t) => teamMetrics(t, neverGk, allowTwoConsecutiveBench, cache, games, lateArrivals));
  let c = 0;
  c += W.geral * variance(ms.map((m) => m.geral));
  c += W.off * variance(ms.map((m) => m.off));
  c += W.def * variance(ms.map((m) => m.def));
  c += W.recuo * variance(ms.map((m) => m.recuo));
  c += W.pressao * variance(ms.map((m) => m.pressao));
  c += W.fitQuality * variance(ms.map((m) => m.fitQuality));
  // Sem eixo de cobertura: a nota de goleiro já está dentro de `geral`, e só no
  // jogo em que o goleiro está escalado. `m.cobertura` segue existindo apenas
  // como informação exibida na UI — NÃO entra no custo.
  for (const m of ms) if (!m.feasible) c += INFEASIBLE_PENALTY;
  if (separate.length) {
    const teamOf = teamOfIdMap(teams);
    for (const [a, b] of separate) {
      const ta = teamOf.get(a);
      const tb = teamOf.get(b);
      if (ta != null && tb != null && ta === tb) c += SEPARATION_PENALTY;
    }
  }
  return c;
};

// ---------------------------------------------------------------------------
// Busca local: troca de pares de jogadores de linha entre times
// ---------------------------------------------------------------------------

const localSearch = (
  teams: DivTeam[], neverGk: boolean, allowTwoConsecutiveBench: boolean, separate: [string, string][],
  respectVeteranDistribution: boolean, respectGoodMarkerDistribution: boolean,
  respectMarkerVeteranStacking: boolean, respectExclusions: boolean, exclusionPairs: [string, string][],
  cache?: FormationCache, maxIter = 60,
  lateArrivals?: ReadonlyMap<string, number>,
): void => {
  let cur = divisionCost(teams, neverGk, allowTwoConsecutiveBench, separate, cache, lateArrivals);
  for (let iter = 0; iter < maxIter; iter++) {
    let bestDelta = -1e-6;
    let best: [number, number, number, number] | null = null;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        for (let a = 0; a < teams[i].line.length; a++) {
          for (let b = 0; b < teams[j].line.length; b++) {
            const A = teams[i].line[a];
            const B = teams[j].line[b];
            teams[i].line[a] = B;
            teams[j].line[b] = A;
            // A troca de identidade entre times NÃO é invariante pra
            // distribuição de veteranos, nem pra de quem marca bem, nem pro
            // não-acúmulo entre as duas, nem pra de atrasados, nem pra a
            // exclusão de pares do cadastro (diferente de `benchRuleBroken`,
            // que só depende do TAMANHO de linha/banco): mover um
            // veterano/marcador/atrasado/par-excluído de time pode tirar uma
            // divisão que passou no filtro inicial de volta pra um estado que
            // viola a regra. A busca local NUNCA pode sair de um estado válido
            // pra um inválido — por isso qualquer troca que resulte em violação
            // de QUALQUER uma das cinco é descartada aqui, ANTES de sequer
            // comparar custo (todas são hard, nenhuma entra no custo).
            const violatesVeteranRule = respectVeteranDistribution && veteranDistributionBroken(teams);
            const violatesMarkerRule = respectGoodMarkerDistribution && goodMarkerDistributionBroken(teams);
            const violatesStackingRule = respectMarkerVeteranStacking && markerVeteranStackingBroken(teams);
            const violatesLateArrivalRule = !!lateArrivals?.size && lateArrivalDistributionBroken(teams, lateArrivals);
            const violatesExclusionRule =
              respectExclusions && exclusionPairs.length > 0 && exclusionPairBroken(teams, exclusionPairs);
            const nc = divisionCost(teams, neverGk, allowTwoConsecutiveBench, separate, cache, lateArrivals);
            teams[i].line[a] = A; // desfaz
            teams[j].line[b] = B;
            if (
              violatesVeteranRule || violatesMarkerRule || violatesStackingRule
              || violatesLateArrivalRule || violatesExclusionRule
            ) continue;
            const delta = nc - cur;
            if (delta < bestDelta) { bestDelta = delta; best = [i, a, j, b]; }
          }
        }
      }
    }
    if (!best) break;
    const [i, a, j, b] = best;
    const A = teams[i].line[a];
    teams[i].line[a] = teams[j].line[b];
    teams[j].line[b] = A;
    cur += bestDelta;
  }
};

// ---------------------------------------------------------------------------
// Extrai as divisões candidatas do motor atual
// ---------------------------------------------------------------------------

const toDivTeams = (players: Player[], numTeams: number, resolved: Map<string, RP>): DivTeam[] | null => {
  // usa o motor atual só para obter uma divisão viável (quem está com quem)
  const results = generateTeams(players, numTeams, { numSimulations: 1, enforcePositionMin: true, maxSixLinePlayers: true });
  if (results.length === 0) return null;
  return divTeamsFromResult(results[0], resolved);
};

const divTeamsFromResult = (result: SimulationResult, resolved: Map<string, RP>): DivTeam[] =>
  result.teams.map((t) => {
    const gkSlot = t.players.find((tp) => tp.roleShort === 'GK');
    const lineSlots = t.players.filter((tp) => tp.roleShort !== 'GK');
    return {
      id: t.id,
      name: t.name,
      gk: gkSlot ? resolved.get(gkSlot.player.id)! : null,
      line: lineSlots.map((tp) => resolved.get(tp.player.id)!),
      bench: t.bench.map((tp) => resolved.get(tp.player.id)!),
    };
  });

// ---------------------------------------------------------------------------
// Resultado rico (consumido pela UI: sistema tático, mapinhas, métricas)
// ---------------------------------------------------------------------------

export interface BalancedSlot {
  player: Player;
  role: LinePosition;
  zone: FieldZone;
  fit: number;
  x: number;
  y: number;
}

export interface BalancedTeam {
  id: number;
  name: string;
  formation: FormationShape;
  slots: BalancedSlot[];
  goalkeeper: Player | null;
  /**
   * SIGNIFICADO (definido explicitamente, porque agora pode variar por
   * jogo — ver `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`/`buildTeamSchedule` em
   * rotation.ts): CAPACIDADE ESTRUTURAL do time, calculada do ELENCO
   * COMPLETO (goleiro reservado + 6 de linha + banco) como se TODO MUNDO
   * estivesse presente — "este time TEM corpo pra revezar goleiro próprio
   * quando ninguém falta". NÃO é "o goleiro próprio joga em toda rodada
   * desta divisão": com atrasados (`LateArrival`), rodadas específicas em
   * que sobrarem menos de 7 disponíveis usam goleiro EMPRESTADO mesmo com
   * este campo `true` — é esperado, não uma inconsistência. Pra saber o que
   * de fato aconteceu EM CADA JOGO, use `GameLineup.goalkeeperId` (por jogo,
   * `null` = emprestado naquele jogo específico), nunca este campo.
   */
  fieldsGoalkeeper: boolean;
  rotatingGoalkeepers: string[];
  bench: Player[];
  metrics: {
    geral: number; off: number; def: number; recuo: number; pressao: number;
    /**
     * SOMENTE INFORMATIVO (média das notas dos goleiros aptos que revezam
     * NESTE time — ver `TeamMetrics.cobertura` acima para o detalhe
     * completo). Assim como `fieldsGoalkeeper`, é calculado da CAPACIDADE do
     * elenco completo, não "a nota de quem jogou em cada rodada" — pode
     * ficar preenchido mesmo em divisões onde algumas rodadas usam goleiro
     * emprestado por causa de atraso.
     */
    cobertura: number | null; fitQuality: number; feasible: boolean;
  };
}

export interface BalanceResult {
  teams: BalancedTeam[];
  cost: number;
  gaps: { def: number; off: number; recuo: number; pressao: number; geral: number; cobertura: number | null };
  /** Pares "manter separados" que não deu pra separar sem desequilibrar (nomes "A & B"). */
  separationViolations: string[];
  /**
   * Pares EXCLUÍDOS NO CADASTRO (`Player.excludedTeammateIds`) que acabaram no
   * MESMO time NESTE resultado específico (nomes "A & B", mesmo formato de
   * `separationViolations`) — NÃO confundir os dois: aquele é sobre a config
   * SOFT da tela de Simular Partidas, este é sobre a regra HARD do cadastro.
   * Normalmente vazio — só fica preenchido quando o FALLBACK AUTOMÁTICO
   * desligou a regra (ver `exclusionPairBroken`/
   * `BalanceRunReport.exclusionsIgnored`): mesmo com o fallback ligado, a
   * busca local ainda tenta evitar juntar pares excluídos quando o custo
   * permite, então nem todo par excluído necessariamente aparece aqui.
   */
  excludedPairsViolations: string[];
  /** Avisos da fila do goleiro (Jogo 1 sem atacante) — um por time que precisou ceder a regra. */
  goalkeeperWarnings: string[];
}

const round = (n: number): number => Math.round(n);

const buildBalancedTeam = (
  t: DivTeam, neverGk: boolean, allowTwoConsecutiveBench: boolean, cache?: FormationCache, totalGames = 6,
  lateArrivals?: ReadonlyMap<string, number>,
): BalancedTeam => {
  const inf = baseInference(t, cache);
  const slots: BalancedSlot[] = inf.assignments.map((a) => ({
    player: t.line[a.playerIndex].player,
    role: a.identity,
    zone: a.zone,
    fit: round(a.fit),
    x: a.x,
    y: a.y,
  }));
  const rot = rotatingGks(t);
  const m = teamMetrics(t, neverGk, allowTwoConsecutiveBench, cache, totalGames, lateArrivals);
  return {
    id: t.id,
    name: t.name,
    formation: inf.system,
    slots,
    goalkeeper: t.gk?.player ?? null,
    fieldsGoalkeeper: m.cobertura != null,
    rotatingGoalkeepers: rot.map((r) => r.player.name),
    bench: t.bench.map((r) => r.player),
    metrics: {
      // EXIBIÇÃO usa as versões renormalizadas (`offDisplay`/`defDisplay`): o
      // custo compara times na escala ponderada por zona, mas a UI mostra o
      // número na régua 0–100 de sempre. Ver o comentário em `TeamMetrics`.
      geral: round(m.geral), off: round(m.offDisplay), def: round(m.defDisplay),
      recuo: round(m.recuo), pressao: round(m.pressao),
      cobertura: m.cobertura == null ? null : round(m.cobertura), fitQuality: round(m.fitQuality),
      feasible: m.feasible,
    },
  };
};

export interface BalanceOptions {
  neverScaleGoalkeepers?: boolean;
  /** Quantas divisões candidatas do motor atual avaliar (default 80). */
  candidates?: number;
  /** Pares de jogadores (ids) a manter em times diferentes. */
  separatePairs?: [string, string][];
  /** Máximo de opções distintas retornadas por balanceTeamsOptions (default 6). */
  maxOptions?: number;
  /**
   * Checkbox do dono (default false, NÃO persistido — componente local na UI,
   * ver `usePlayerStore`/`SimulationTab`): permite um jogador sentar 2x
   * SEGUIDAS no banco (paga um "crédito" com cooldown de
   * `BENCH_EXCEPTION_COOLDOWN_ROUNDS` rodadas — ver benchRotation.ts) quando a
   * regra estrita "ninguém repete banco" não fecha sozinha. Sem isso, uma
   * divisão que não cumpre a regra estrita é EXCLUÍDA dos resultados.
   */
  allowTwoConsecutiveBench?: boolean;
  /**
   * Checkbox do dono "Desconsiderar veteranos" (default false, NÃO
   * persistido — componente local na UI, mesmo padrão de
   * `allowTwoConsecutiveBench`, ver `SimulationTab`): quando ligado, a regra
   * de distribuição de veteranos (`veteranDistributionBroken`) é IGNORADA por
   * completo — nenhuma divisão é excluída por causa dela.
   */
  ignoreVeteranDistribution?: boolean;
  /**
   * Checkbox do dono "Desconsiderar quem marca bem" (default false, NÃO
   * persistido — mesmo padrão de `ignoreVeteranDistribution`): quando ligado,
   * a distribuição de marcadores (`goodMarkerDistributionBroken`) E a regra de
   * não-acúmulo com veteranos (`markerVeteranStackingBroken`) são IGNORADAS —
   * as duas dependem da marcação "sabe marcar bem", então desligar o conceito
   * desliga as duas.
   *
   * A regra de não-acúmulo também cai quando `ignoreVeteranDistribution` está
   * ligado: ela cruza os dois conceitos, e desligar qualquer um dos lados
   * significa que o usuário não quer aquele lado restringindo nada.
   */
  ignoreGoodMarkerDistribution?: boolean;
  /**
   * Filtro "Não jogará os primeiros jogos" (ver `LateArrival` em
   * domain/types.ts, persistido em `usePlayerStore` no mesmo padrão de
   * `separatePairs`): cada entrada marca um jogador AUSENTE nos primeiros
   * `games` jogos do rodízio (chegou atrasado). Espalhados entre os times
   * pela mesma arquitetura hard de `veteranDistributionBroken` (ver
   * `lateArrivalDistributionBroken` acima) — SEM checkbox de escape (ao
   * contrário de veteranos): não foi pedido um, e a regra em si já é rara de
   * travar (só quando o Nº de atrasados não divide igual entre os times).
   */
  lateArrivals?: LateArrival[];
}

/** Assinatura canônica da divisão (quem está com quem), ignorando ordem/funções. */
const membershipSig = (teams: DivTeam[]): string =>
  teams
    .map((t) => [t.gk, ...t.line, ...t.bench].filter((r): r is RP => !!r).map((r) => r.player.id).sort().join(','))
    .sort()
    .join('|');

export interface BalanceRunReport {
  /** Nomeia jogadores cuja lista de posições torna a divisão infactível (Fase 5). */
  feasibility: FeasibilityResult;
  candidatesEvaluated: number;
  elapsedMs: number;
  /**
   * Motivo pelo qual TODAS as divisões candidatas foram EXCLUÍDAS por não
   * cumprir a regra do banco "ninguém fica 2 jogos seguidos" (nem com a
   * exceção do checkbox, se ligada) — null quando não houve exclusão por esse
   * motivo. NÃO confundir com `feasibility` acima: aquele é sobre ENCAIXE DE
   * POSIÇÃO (Fase 5, checado ANTES de sequer gerar divisões candidatas);
   * este é sobre a REGRA DE ROTAÇÃO DO BANCO (Fase 6+, só detectável DEPOIS
   * de montar e simular o rodízio de cada divisão candidata).
   */
  benchInfeasibility: { message: string } | null;
  /**
   * Motivo pelo qual TODAS as divisões candidatas foram EXCLUÍDAS por não
   * cumprir a distribuição equilibrada de veteranos (nem com o checkbox
   * "Desconsiderar veteranos" — se ligado, esta regra nem é checada, então
   * nunca é a causa) — null quando não houve exclusão por esse motivo. É um
   * TERCEIRO conceito de invalidez, distinto de `feasibility` (posição) e do
   * motivo de `benchInfeasibility` (rotação do banco por jogo): este é sobre
   * a composição do ELENCO de cada time, verificada uma vez por divisão, sem
   * envolver o rodízio de jogos.
   */
  veteranInfeasibility: { message: string } | null;
  /**
   * Motivo pelo qual TODAS as divisões candidatas foram EXCLUÍDAS por não
   * cumprir a distribuição equilibrada de QUEM MARCA BEM
   * (`goodMarkerDistributionBroken`) — null quando não houve exclusão por esse
   * motivo, e sempre null quando "Desconsiderar quem marca bem" está ligado
   * (a regra nem é checada). Conceito irmão de `veteranInfeasibility`, com a
   * mesma arquitetura (composição do ELENCO, uma checagem por divisão, fora do
   * rodízio de jogos).
   */
  goodMarkerInfeasibility: { message: string } | null;
  /**
   * Motivo pelo qual TODAS as divisões candidatas foram EXCLUÍDAS por
   * acumularem "um marcador a menos" e "um veterano a mais" no MESMO time
   * (`markerVeteranStackingBroken`) — null quando não houve exclusão por esse
   * motivo. Distinto de `veteranInfeasibility` e de `goodMarkerInfeasibility`:
   * aqui cada distribuição, isolada, estava correta; o que falhou foi o
   * CRUZAMENTO das duas.
   */
  markerVeteranStackingInfeasibility: { message: string } | null;
  /**
   * Motivo pelo qual TODAS as divisões candidatas foram EXCLUÍDAS por não
   * cumprir a distribuição equilibrada de ATRASADOS (`lateArrivalDistributionBroken`)
   * — null quando não houve exclusão por esse motivo. É um QUARTO conceito de
   * invalidez, distinto dos outros três (`feasibility`/posição,
   * `benchInfeasibility`/rotação do banco por jogo — que TAMBÉM cobre o caso
   * de faltar gente pra fechar a linha por causa de atrasados ainda ausentes,
   * ver `lineShortfall` — e `veteranInfeasibility`/composição de veteranos):
   * este é sobre a composição do ELENCO quanto a QUEM ESTÁ MARCADO COMO
   * ATRASADO, verificada uma vez por divisão, sem envolver o rodízio de jogos.
   */
  lateArrivalInfeasibility: { message: string } | null;
  /**
   * `true` quando o FALLBACK AUTOMÁTICO da lista de exclusão do cadastro
   * (`Player.excludedTeammateIds`, ver `derivedExclusionPairs`/
   * `exclusionPairBroken` em engine/balance.ts) teve que entrar em ação: com a
   * regra valendo, a passagem inicial não sobrou NENHUM resultado, então a
   * busca inteira foi refeita com a regra DESLIGADA. Diferente das cinco
   * infactibilidades acima, isto NUNCA é motivo de bloqueio — a lista de
   * exclusão se auto-desliga em vez de travar a simulação (pedido literal do
   * dono). Quando `true`, o usuário precisa ser avisado (ver
   * `BalanceResult.excludedPairsViolations` pra saber QUAIS pares específicos
   * ficaram juntos em cada resultado exibido).
   */
  exclusionsIgnored: boolean;
}

/** Último relatório de execução (candidatos avaliados, tempo, factibilidade) — Fase 6/5. */
let lastRunReport: BalanceRunReport | null = null;
export const getLastBalanceRunReport = (): BalanceRunReport | null => lastRunReport;

/**
 * Elenco "grande" (mesmo corte usado por `suggestTeams` na UI): acima disso, o
 * dono relatou jogar com 3 times na prática (emprestando goleiro) — por isso,
 * quando o usuário insiste em 2 times com elenco grande, "jogue com 3" é a
 * saída mais provável de resolver a inviabilidade do banco e entra PRIMEIRO
 * na lista de sugestões da mensagem de bloqueio.
 */
const BENCH_MSG_BIG_ROSTER_THRESHOLD = 17;

/**
 * Mensagem de bloqueio quando NENHUMA divisão candidata cumpre "ninguém fica
 * 2 jogos seguidos no banco" (nem com a exceção do checkbox, se ligada) —
 * nomeia os NÚMEROS REAIS da simulação (nº de jogadores de linha disponíveis
 * e vagas de banco por rodada num time concreto que travou) e ordena as
 * saídas sugeridas pela mais provável de resolver.
 *
 * Quando a causa foi `lineShortfall` (atrasados ainda ausentes deixaram gente
 * de menos pra fechar os 6 de linha numa rodada — ver rotation.ts), usa um
 * texto PRÓPRIO que cita a rodada e os números daquela falta específica, em
 * vez do texto genérico da regra estrita do banco (a causa é outra).
 */
const benchInfeasibilityMessage = (
  issue: { teamName: string; n: number; b: number; lineShortfall: { round: number; available: number; needed: number } | null },
  numTeams: number, activeCount: number, allowTwoConsecutiveBench: boolean,
): string => {
  if (issue.lineShortfall) {
    const { round, available, needed } = issue.lineShortfall;
    const cause =
      `no ${issue.teamName}, no jogo ${round + 1} do rodízio só há ${available} jogador(es) disponível(is) ` +
      `(contando quem já chegou) para os ${needed} de linha — os atrasados marcados ainda não entraram nessa rodada.`;
    const options = [
      'reduza a quantidade de jogos de ausência de algum atrasado',
      'marque menos jogadores como atrasados',
      'ative mais jogadores de linha',
    ];
    return `Nenhuma divisão consegue montar os 6 de linha em todas as rodadas: ${cause} Saídas: ${joinNames(options)}.`;
  }
  const { teamName, n, b } = issue;
  const need = 2 * b;
  const cause =
    `no ${teamName} há ${n} jogador(es) de linha disponível(is) para ${b} vaga(s) de banco por rodada — ` +
    `quem senta numa rodada não pode sentar na seguinte, então é preciso gente suficiente pra alternar ` +
    `(pelo menos ${need}, ou seja 2× o banco), e só há ${n}.`;
  const threeTeams = 'jogue com 3 times (o banco de cada time encolhe)';
  const tweakRoster = 'ative ou desative jogadores de linha pra mudar esse número';
  const exceptionHint = 'marque a opção "Permitir jogadores ficarem duas vezes seguidas no banco"';
  const bigRosterOnTwo = numTeams === 2 && activeCount > BENCH_MSG_BIG_ROSTER_THRESHOLD;
  const options: string[] = [];
  if (bigRosterOnTwo) options.push(threeTeams);
  options.push(tweakRoster);
  if (numTeams === 2 && !bigRosterOnTwo) options.push(threeTeams);
  if (!allowTwoConsecutiveBench) options.push(exceptionHint);
  return `Nenhuma divisão cumpre "ninguém fica dois jogos seguidos no banco": ${cause} Saídas: ${joinNames(options)}.`;
};

/**
 * Várias divisões equilibradas DISTINTAS (para o usuário paginar entre opções),
 * ordenadas por custo (a melhor primeiro).
 */
export const balanceTeamsOptions = (
  players: Player[],
  numTeams: number,
  options: BalanceOptions = {},
): BalanceResult[] => {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const neverGk = options.neverScaleGoalkeepers ?? false;
  const separate = options.separatePairs ?? [];
  const maxOptions = options.maxOptions ?? 6;
  const allowTwoConsecutiveBench = options.allowTwoConsecutiveBench ?? false;
  const ignoreVeteranDistribution = options.ignoreVeteranDistribution ?? false;
  const ignoreGoodMarkerDistribution = options.ignoreGoodMarkerDistribution ?? false;
  // As três regras de composição de elenco ligadas às marcações do cadastro,
  // resolvidas UMA vez aqui pra o filtro inicial, a busca local e a revalidação
  // final usarem exatamente os mesmos flags (ver `BalanceOptions`).
  const respectVeterans = !ignoreVeteranDistribution;
  const respectMarkers = !ignoreGoodMarkerDistribution;
  const respectStacking = respectMarkers && respectVeterans;
  const active = players.filter((p) => p.active);

  // Rodízio da simulação (9 com 2 times, 6 com 3+) — usado tanto pro custo
  // quanto pra GRAMPEAR a config de atrasados (ver `clampLateArrivals`).
  const totalGamesForRun = gamesForTeamCount(numTeams);
  const lateArrivalsMap = clampLateArrivals(options.lateArrivals, totalGamesForRun);

  // Pares de EXCLUSÃO DO CADASTRO (ver `Player.excludedTeammateIds` e o bloco
  // de comentário logo acima de `derivedExclusionPairs`) — SEM opção em
  // `BalanceOptions`: não é config da pelada, é sempre derivada do cadastro do
  // elenco ATIVO desta simulação. Calculado UMA vez aqui pra alimentar as duas
  // passagens de `runPass` abaixo (com e sem a regra).
  const exclusionPairs = derivedExclusionPairs(active);

  // Fase 5: checagem de factibilidade ANTES de tentar montar os times.
  const feasibility = checkPositionFeasibility(active, numTeams);
  if (!feasibility.feasible) {
    lastRunReport = {
      feasibility, candidatesEvaluated: 0, elapsedMs: 0,
      benchInfeasibility: null, veteranInfeasibility: null, lateArrivalInfeasibility: null,
      goodMarkerInfeasibility: null, markerVeteranStackingInfeasibility: null, exclusionsIgnored: false,
    };
    return [];
  }

  const resolved = new Map<string, RP>(active.map((p) => [p.id, resolvePlayer(p)]));

  // Cache de memoização de sistema tático (Otimização 1 do diagnóstico de
  // performance): vive SÓ por esta chamada — criado aqui, nunca fora dela.
  // Ver `FormationCache` em formationModel.ts para o porquê do escopo.
  const cache = createFormationCache();

  // Reduz o nº de divisões candidatas quando o elenco é grande (custo por
  // candidata cresce com numTeams pela reinferência de 6 jogos); mantém a
  // qualidade do solver (húngaro é exato) e só corta o Nº de sementes.
  const baseCandidates = options.candidates ?? 80;
  const candidateCount = active.length > 28 ? Math.min(baseCandidates, 40) : baseCandidates;

  const raw = generateTeams(players, numTeams, {
    numSimulations: Math.max(400, candidateCount * 20),
    enforcePositionMin: true,
    neverScaleGoalkeepers: neverGk,
    maxSixLinePlayers: true, // extras vão pro banco; a linha fica sempre com 6
  });

  const divisions: DivTeam[][] = [];
  for (const result of raw.slice(0, candidateCount)) {
    const teams = divTeamsFromResult(result, resolved);
    if (teams.some((t) => t.line.length !== 6)) continue; // fora do formato esperado
    divisions.push(teams);
  }
  if (divisions.length === 0) {
    // fallback: tenta pelo menos uma divisão básica
    const basic = toDivTeams(players, numTeams, resolved);
    if (!basic || basic.some((t) => t.line.length !== 6)) {
      lastRunReport = {
        feasibility, candidatesEvaluated: 0,
        elapsedMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
        benchInfeasibility: null, veteranInfeasibility: null, lateArrivalInfeasibility: null,
        goodMarkerInfeasibility: null, markerVeteranStackingInfeasibility: null, exclusionsIgnored: false,
      };
      return [];
    }
    divisions.push(basic);
  }

  interface BenchIssue { teamName: string; n: number; b: number; lineShortfall: TeamMetrics['lineShortfall'] }
  interface PassResult {
    out: BalanceResult[];
    firstVeteranIssue: number | null;
    firstGoodMarkerIssue: number | null;
    firstStackingIssue: { markers: number; veterans: number } | null;
    firstLateArrivalIssue: number | null;
    firstBenchIssue: BenchIssue | null;
  }
  const totalGoodMarkers = active.filter((p) => p.goodMarker).length;
  const totalRawVeterans = active.filter((p) => p.veteran).length;

  /**
   * Uma passagem completa (filtro das divisões candidatas + busca local +
   * revalidação + finalize) — extraída pra função reutilizável porque a regra
   * de exclusão do cadastro precisa rodar a MESMA passagem DUAS vezes quando a
   * primeira não sobra nenhum resultado: uma vez respeitando `exclusionPairs`
   * (`respectExclusions = true`) e, se necessário, outra vez SEM ela
   * (`respectExclusions = false` — o FALLBACK AUTOMÁTICO pedido pelo dono, ver
   * mais abaixo). As outras quatro regras hard (veteranos, marcadores,
   * acúmulo, atrasados) e a regra de banco continuam valendo IGUAL nas duas
   * passagens — o fallback desliga SÓ a exclusão, nunca as demais.
   */
  const runPass = (respectExclusions: boolean): PassResult => {
    // Custo + checagem da regra do banco (Fase 6+, NOVA REGRA): uma divisão cuja
    // rotação de banco não cumpre "ninguém repete" (nem com a exceção, se
    // ligada) — o que TAMBÉM cobre faltar gente pra fechar a linha por causa de
    // atrasados ainda ausentes (`lineShortfall`, ver rotation.ts) — é EXCLUÍDA
    // aqui, antes mesmo de virar semente pra busca local. `benchRuleBroken` é
    // invariante a trocas de jogadores de LINHA entre times (busca local só
    // troca identidade, nunca o TAMANHO de linha/banco/goleiro de cada time) —
    // por isso é seguro e mais barato decidir isso JÁ na pontuação inicial, sem
    // precisar recalcular depois da busca local.
    let firstBenchIssue: BenchIssue | null = null;
    // Distribuição de veteranos (regra própria — ver `veteranDistributionBroken`
    // acima): checada na COMPOSIÇÃO DO TIME (o `DivTeam` já montado), nunca
    // dentro do rodízio de jogos. `totalVeterans` é igual em toda divisão (é
    // sempre o elenco ATIVO inteiro sendo repartido), então guardar o valor da
    // PRIMEIRA divisão que falhar já basta pra mensagem final.
    let firstVeteranIssue: number | null = null;
    // Distribuição de QUEM MARCA BEM + não-acúmulo com veteranos (regras próprias
    // — ver `goodMarkerDistributionBroken`/`markerVeteranStackingBroken` acima):
    // mesma arquitetura da de veteranos, checadas logo depois dela. Os totais são
    // iguais em toda divisão (é sempre o elenco ATIVO inteiro sendo repartido),
    // então guardar os da PRIMEIRA divisão que falhar já basta pra mensagem.
    let firstGoodMarkerIssue: number | null = null;
    let firstStackingIssue: { markers: number; veterans: number } | null = null;
    // Distribuição de ATRASADOS (regra própria — ver `lateArrivalDistributionBroken`
    // acima): MESMA arquitetura da de veteranos, checada JUNTO (antes do custo
    // e da rotação de banco) — sem checkbox de escape.
    let firstLateArrivalIssue: number | null = null;
    const feasibleDivisions: { teams: DivTeam[]; cost: number }[] = [];
    for (const teams of divisions) {
      if (respectVeterans && veteranDistributionBroken(teams)) {
        if (firstVeteranIssue === null) {
          firstVeteranIssue = effectiveVeteranCount(teams);
        }
        continue; // divisão excluída: concentra veteranos demais num time
      }
      if (respectMarkers && goodMarkerDistributionBroken(teams)) {
        if (firstGoodMarkerIssue === null) firstGoodMarkerIssue = totalGoodMarkers;
        continue; // divisão excluída: concentra marcação demais num time
      }
      if (respectStacking && markerVeteranStackingBroken(teams)) {
        if (firstStackingIssue === null) {
          firstStackingIssue = { markers: totalGoodMarkers, veterans: totalRawVeterans };
        }
        continue; // divisão excluída: mesmo time com marcador a menos E veterano a mais
      }
      if (lateArrivalsMap.size > 0 && lateArrivalDistributionBroken(teams, lateArrivalsMap)) {
        if (firstLateArrivalIssue === null) {
          firstLateArrivalIssue = teams.reduce((s, t) => s + lateArrivalsOf(t, lateArrivalsMap).length, 0);
        }
        continue; // divisão excluída: concentra atrasados demais num time
      }
      // Exclusão do cadastro (ver bloco de comentário acima de
      // `derivedExclusionPairs`): SEM mensagem de bloqueio própria — quando
      // `respectExclusions` é `false` (passagem de fallback) este filtro nem
      // roda, então NUNCA é ele quem deixa `out` vazio no relatório final.
      if (respectExclusions && exclusionPairs.length > 0 && exclusionPairBroken(teams, exclusionPairs)) {
        continue; // divisão excluída: junta um par marcado como incompatível no cadastro
      }
      const games = gamesForTeamCount(teams.length);
      const metrics = teams.map((t) => teamMetrics(t, neverGk, allowTwoConsecutiveBench, cache, games, lateArrivalsMap));
      const brokenIdx = metrics.findIndex((m) => m.benchRuleBroken);
      if (brokenIdx !== -1) {
        if (firstBenchIssue === null) {
          // `teamName` aqui já é o RÓTULO DE EXIBIÇÃO (não o nome interno) — só é
          // usado pra compor a mensagem mostrada ao usuário (`benchInfeasibilityMessage`
          // abaixo); a lógica de balanceamento nunca lê `BenchIssue.teamName`.
          firstBenchIssue = {
            teamName: teamDisplayLabel(teams[brokenIdx]),
            n: metrics[brokenIdx].benchOutfielders,
            b: metrics[brokenIdx].benchSlots,
            lineShortfall: metrics[brokenIdx].lineShortfall,
          };
        }
        continue; // divisão excluída: não cumpre a regra do banco (nem com a exceção, se ligada) ou não fecha a linha por atraso
      }
      const cost = divisionCost(teams, neverGk, allowTwoConsecutiveBench, separate, cache, lateArrivalsMap);
      feasibleDivisions.push({ teams, cost });
    }
    const scored = feasibleDivisions.sort((a, b) => a.cost - b.cost);

    const seeds: DivTeam[][] = [];
    const preSeen = new Set<string>();
    for (const { teams } of scored) {
      if (seeds.length >= maxOptions) break;
      const sig = membershipSig(teams);
      if (preSeen.has(sig)) continue;
      preSeen.add(sig);
      seeds.push(teams);
    }

    // busca local em cada semente; dedupe pós-busca; finaliza
    const out: BalanceResult[] = [];
    const postSeen = new Set<string>();
    for (const teams of seeds) {
      localSearch(
        teams, neverGk, allowTwoConsecutiveBench, separate,
        respectVeterans, respectMarkers, respectStacking, respectExclusions, exclusionPairs, cache, 60, lateArrivalsMap,
      );
      // Cinto e suspensório: `localSearch` já nunca troca pra um estado que
      // viole a distribuição de veteranos/marcadores/atrasados/exclusão nem o
      // não-acúmulo entre as duas primeiras (ver comentário lá), mas revalida
      // aqui antes de publicar o resultado — mais barato que um bug silencioso
      // fazendo uma divisão inválida escapar pra UI.
      if (respectVeterans && veteranDistributionBroken(teams)) continue;
      if (respectMarkers && goodMarkerDistributionBroken(teams)) continue;
      if (respectStacking && markerVeteranStackingBroken(teams)) continue;
      if (lateArrivalsMap.size > 0 && lateArrivalDistributionBroken(teams, lateArrivalsMap)) continue;
      if (respectExclusions && exclusionPairs.length > 0 && exclusionPairBroken(teams, exclusionPairs)) continue;
      const sig = membershipSig(teams);
      if (postSeen.has(sig)) continue;
      postSeen.add(sig);
      out.push(finalize(teams, neverGk, allowTwoConsecutiveBench, separate, cache, lateArrivalsMap, exclusionPairs));
    }

    return { out, firstVeteranIssue, firstGoodMarkerIssue, firstStackingIssue, firstLateArrivalIssue, firstBenchIssue };
  };

  let pass = runPass(true);
  // FALLBACK AUTOMÁTICO (pedido literal do dono): se, com a exclusão do
  // cadastro valendo, NENHUM resultado sobrou, refaz a passagem inteira
  // ignorando só essa regra — nunca bloqueia a simulação por causa dela. Só
  // vale a pena tentar quando existe de fato algum par de exclusão relevante
  // no elenco ativo (`exclusionPairs.length > 0`); do contrário a primeira
  // passagem já é idêntica à segunda e rodar de novo seria desperdício.
  // Se MESMO SEM a exclusão a segunda passagem continuar vazia, usamos o
  // relatório DELA (com a regra desligada) pra reportar a causa REAL do
  // bloqueio — nunca aponta pra exclusão, que já nem estava mais em jogo.
  let exclusionsIgnored = false;
  if (pass.out.length === 0 && exclusionPairs.length > 0) {
    const fallback = runPass(false);
    exclusionsIgnored = fallback.out.length > 0;
    pass = fallback;
  }

  const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  const issue = pass.firstBenchIssue;
  // As cinco causas de exclusão total são checadas na mesma ordem do filtro
  // acima (veterano, marcador, acúmulo marcador×veterano, atrasado, banco/linha)
  // — nunca mais de uma ao mesmo tempo no relatório: se sobrou alguma divisão
  // que passou pelos primeiros filtros mas travou no do banco, os
  // `first*Issue` anteriores podem estar preenchidos de OUTRAS divisões só
  // descartadas por eles, mas `out` só fica vazio se TODAS travarem em algum
  // dos filtros — a mensagem reporta a causa que aparece primeiro na varredura.
  // A exclusão do cadastro NUNCA aparece aqui: ou ela produziu resultado (via
  // fallback, `exclusionsIgnored = true`), ou o bloqueio é de outra regra — ela
  // nunca é, sozinha, a causa reportada ao usuário.
  const blocked = pass.out.length === 0;
  const veteranInfeasibility = blocked && pass.firstVeteranIssue !== null
    ? { message: veteranInfeasibilityMessage(pass.firstVeteranIssue, numTeams) }
    : null;
  const goodMarkerInfeasibility = blocked && veteranInfeasibility === null && pass.firstGoodMarkerIssue !== null
    ? { message: goodMarkerInfeasibilityMessage(pass.firstGoodMarkerIssue, numTeams) }
    : null;
  const markerVeteranStackingInfeasibility =
    blocked && veteranInfeasibility === null && goodMarkerInfeasibility === null && pass.firstStackingIssue !== null
      ? { message: markerVeteranStackingMessage(pass.firstStackingIssue.markers, pass.firstStackingIssue.veterans, numTeams) }
      : null;
  const earlierCause = veteranInfeasibility ?? goodMarkerInfeasibility ?? markerVeteranStackingInfeasibility;
  const lateArrivalInfeasibility = blocked && earlierCause === null && pass.firstLateArrivalIssue !== null
    ? { message: lateArrivalInfeasibilityMessage(pass.firstLateArrivalIssue, numTeams) }
    : null;
  const benchInfeasibility = blocked && earlierCause === null && lateArrivalInfeasibility === null && issue !== null
    ? { message: benchInfeasibilityMessage(issue, numTeams, active.length, allowTwoConsecutiveBench) }
    : null;
  lastRunReport = {
    feasibility, candidatesEvaluated: divisions.length, elapsedMs,
    benchInfeasibility, veteranInfeasibility, lateArrivalInfeasibility,
    goodMarkerInfeasibility, markerVeteranStackingInfeasibility, exclusionsIgnored,
  };
  return pass.out.sort((a, b) => a.cost - b.cost);
};

/** A melhor divisão (conveniência sobre balanceTeamsOptions). */
export const balanceTeams = (
  players: Player[],
  numTeams: number,
  options: BalanceOptions = {},
): BalanceResult | null => balanceTeamsOptions(players, numTeams, options)[0] ?? null;

const finalize = (
  teams: DivTeam[], neverGk: boolean, allowTwoConsecutiveBench: boolean, separate: [string, string][], cache?: FormationCache,
  lateArrivals?: ReadonlyMap<string, number>, exclusionPairs: [string, string][] = [],
): BalanceResult => {
  const built = teams.map((t) => buildBalancedTeam(t, neverGk, allowTwoConsecutiveBench, cache, gamesForTeamCount(teams.length), lateArrivals));
  const gap = (sel: (b: BalancedTeam) => number): number => {
    const vals = built.map(sel);
    return round(Math.max(...vals) - Math.min(...vals));
  };
  const cobs = built.map((b) => b.metrics.cobertura).filter((x): x is number => x != null);
  const teamOf = teamOfIdMap(teams);
  const nameOf = new Map<string, string>();
  teams.forEach((t) => { [t.gk, ...t.line, ...t.bench].forEach((r) => { if (r) nameOf.set(r.player.id, r.player.name); }); });
  const pairViolations = (pairs: [string, string][]): string[] =>
    pairs
      .filter(([a, b]) => { const ta = teamOf.get(a); const tb = teamOf.get(b); return ta != null && tb != null && ta === tb; })
      .map(([a, b]) => `${nameOf.get(a) ?? a} & ${nameOf.get(b) ?? b}`);
  const separationViolations = pairViolations(separate);
  // Pares EXCLUÍDOS NO CADASTRO que acabaram juntos NESTE resultado — mesmo
  // cálculo de `separationViolations`, mas sobre `exclusionPairs` (regra HARD
  // do cadastro, não a config SOFT de "manter separados"). Só fica não-vazio
  // quando este resultado veio da passagem de FALLBACK (regra desligada).
  const excludedPairsViolations = pairViolations(exclusionPairs);
  const allMetrics = teams.map((t) => teamMetrics(t, neverGk, allowTwoConsecutiveBench, cache, gamesForTeamCount(teams.length), lateArrivals));
  const goalkeeperWarnings = allMetrics
    .map((m) => m.goalkeeperWarning)
    .filter((w): w is string => !!w);
  return {
    teams: built,
    cost: round(divisionCost(teams, neverGk, allowTwoConsecutiveBench, separate, cache, lateArrivals) * 100) / 100,
    gaps: {
      def: gap((b) => b.metrics.def),
      off: gap((b) => b.metrics.off),
      recuo: gap((b) => b.metrics.recuo),
      pressao: gap((b) => b.metrics.pressao),
      geral: gap((b) => b.metrics.geral),
      cobertura: cobs.length === built.length ? round(Math.max(...cobs) - Math.min(...cobs)) : null,
    },
    separationViolations,
    excludedPairsViolations,
    goalkeeperWarnings,
  };
};
