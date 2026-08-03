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

import type { Player, SimulationResult } from '../domain/types';
import type { LinePosition } from '../domain/positions';
import { effectiveAttributesBase, effectiveGk } from './playerModel';
import { ovr, potencialAtaque, estabilidadeDefensiva, coberturaGol } from './scoring';
import { chooseBestSystem, createFormationCache, type FormationCache, type FormationShape, type FieldZone } from './formationModel';
import { buildTeamSchedule, gamesForTeamCount } from './rotation';
import { generateTeams } from './generateTeams';
import { checkPositionFeasibility, joinNames, type FeasibilityResult } from './feasibility';

// ---------------------------------------------------------------------------
// Jogador resolvido (com atributos garantidos)
// ---------------------------------------------------------------------------

interface RP {
  player: Player;
  attrs: ReturnType<typeof effectiveAttributesBase>;
  gk: number | null;
}

const resolvePlayer = (p: Player): RP => ({
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

interface DivTeam {
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

interface TeamMetrics {
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
}

/** Jogadores aptos ao gol que revezam neste time (reservado + aptos na linha). */
const rotatingGks = (t: DivTeam): RP[] =>
  [t.gk, ...t.line].filter((r): r is RP => !!r && r.player.isGoalkeeper && r.gk != null);

/** Inferência "geral" (jogo-base, sem rotação) — usada pro resumo/tática/roster exibidos. */
const baseInference = (t: DivTeam, cache?: FormationCache) => chooseBestSystem(t.line.map((r) => r.player), cache);

/**
 * Métricas de um time = MÉDIA sobre os 6 jogos do rodízio (Fase 6): reaproveita
 * `buildTeamSchedule` (que já reinfere o sistema por jogo, aplica a fila do
 * goleiro com a regra do Jogo 1, e escalona o banco) sobre a escalação-base.
 */
const teamMetrics = (
  t: DivTeam, neverGk: boolean, allowTwoConsecutiveBench: boolean, cache?: FormationCache, totalGames = 6,
): TeamMetrics => {
  if (t.line.length !== 6) {
    const lineAttrs = t.line.map((r) => r.attrs);
    return {
      geral: mean(lineAttrs.map((a) => ovr(a, 'Geral'))), off: 0, def: 0,
      offDisplay: 0, defDisplay: 0, recuo: 0, pressao: 0,
      cobertura: null, fitQuality: -100, feasible: false, goalkeeperWarning: null,
      benchRuleBroken: false, benchOutfielders: 0, benchSlots: 0,
    };
  }
  const inf = baseInference(t, cache);
  const rot = rotatingGks(t);
  const fielding = !neverGk && rot.length > 0;

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

  const sched = buildTeamSchedule(provisional, totalGames, cache, allowTwoConsecutiveBench);
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

    const defLinha = estabilidadeDefensiva(lineAttrs, 0.6, defF);
    const offPond = potencialAtaque(lineAttrs, 0.5, offF);
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

/** Mapa id do jogador -> índice do time em que ele está (linha, gol ou banco). */
const teamOfIdMap = (teams: DivTeam[]): Map<string, number> => {
  const m = new Map<string, number>();
  teams.forEach((t, i) => {
    [t.gk, ...t.line, ...t.bench].forEach((r) => { if (r) m.set(r.player.id, i); });
  });
  return m;
};

/**
 * Custo de uma divisão: variância ponderada das métricas (médias dos jogos do
 * rodízio) entre os times + penalidades. O nº de jogos vem de
 * `gamesForTeamCount` (9 com 2 times, 6 com 3+), derivado do próprio array.
 */
const divisionCost = (
  teams: DivTeam[], neverGk: boolean, allowTwoConsecutiveBench: boolean, separate: [string, string][] = [], cache?: FormationCache,
): number => {
  const games = gamesForTeamCount(teams.length);
  const ms = teams.map((t) => teamMetrics(t, neverGk, allowTwoConsecutiveBench, cache, games));
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
  teams: DivTeam[], neverGk: boolean, allowTwoConsecutiveBench: boolean, separate: [string, string][], cache?: FormationCache, maxIter = 60,
): void => {
  let cur = divisionCost(teams, neverGk, allowTwoConsecutiveBench, separate, cache);
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
            const nc = divisionCost(teams, neverGk, allowTwoConsecutiveBench, separate, cache);
            teams[i].line[a] = A; // desfaz
            teams[j].line[b] = B;
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
  fieldsGoalkeeper: boolean;
  rotatingGoalkeepers: string[];
  bench: Player[];
  metrics: {
    geral: number; off: number; def: number; recuo: number; pressao: number;
    cobertura: number | null; fitQuality: number; feasible: boolean;
  };
}

export interface BalanceResult {
  teams: BalancedTeam[];
  cost: number;
  gaps: { def: number; off: number; recuo: number; pressao: number; geral: number; cobertura: number | null };
  /** Pares "manter separados" que não deu pra separar sem desequilibrar (nomes "A & B"). */
  separationViolations: string[];
  /** Avisos da fila do goleiro (Jogo 1 sem atacante) — um por time que precisou ceder a regra. */
  goalkeeperWarnings: string[];
}

const round = (n: number): number => Math.round(n);

const buildBalancedTeam = (
  t: DivTeam, neverGk: boolean, allowTwoConsecutiveBench: boolean, cache?: FormationCache, totalGames = 6,
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
  const m = teamMetrics(t, neverGk, allowTwoConsecutiveBench, cache, totalGames);
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
 */
const benchInfeasibilityMessage = (
  teamName: string, n: number, b: number, numTeams: number, activeCount: number, allowTwoConsecutiveBench: boolean,
): string => {
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
  const active = players.filter((p) => p.active);

  // Fase 5: checagem de factibilidade ANTES de tentar montar os times.
  const feasibility = checkPositionFeasibility(active, numTeams);
  if (!feasibility.feasible) {
    lastRunReport = { feasibility, candidatesEvaluated: 0, elapsedMs: 0, benchInfeasibility: null };
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
        benchInfeasibility: null,
      };
      return [];
    }
    divisions.push(basic);
  }

  // Custo + checagem da regra do banco (Fase 6+, NOVA REGRA): uma divisão cuja
  // rotação de banco não cumpre "ninguém repete" (nem com a exceção, se
  // ligada) é EXCLUÍDA aqui — antes mesmo de virar semente pra busca local.
  // `benchRuleBroken` é invariante a trocas de jogadores de LINHA entre times
  // (busca local só troca identidade, nunca o TAMANHO de linha/banco/goleiro
  // de cada time) — por isso é seguro e mais barato decidir isso JÁ na
  // pontuação inicial, sem precisar recalcular depois da busca local.
  interface BenchIssue { teamName: string; n: number; b: number }
  let firstBenchIssue: BenchIssue | null = null;
  const feasibleDivisions: { teams: DivTeam[]; cost: number }[] = [];
  for (const teams of divisions) {
    const games = gamesForTeamCount(teams.length);
    const metrics = teams.map((t) => teamMetrics(t, neverGk, allowTwoConsecutiveBench, cache, games));
    const brokenIdx = metrics.findIndex((m) => m.benchRuleBroken);
    if (brokenIdx !== -1) {
      if (firstBenchIssue === null) {
        firstBenchIssue = { teamName: teams[brokenIdx].name, n: metrics[brokenIdx].benchOutfielders, b: metrics[brokenIdx].benchSlots };
      }
      continue; // divisão excluída: não cumpre a regra do banco (nem com a exceção, se ligada)
    }
    const cost = divisionCost(teams, neverGk, allowTwoConsecutiveBench, separate, cache);
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
    localSearch(teams, neverGk, allowTwoConsecutiveBench, separate, cache);
    const sig = membershipSig(teams);
    if (postSeen.has(sig)) continue;
    postSeen.add(sig);
    out.push(finalize(teams, neverGk, allowTwoConsecutiveBench, separate, cache));
  }

  const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  const issue: BenchIssue | null = firstBenchIssue;
  const benchInfeasibility = out.length === 0 && issue !== null
    ? { message: benchInfeasibilityMessage(issue.teamName, issue.n, issue.b, numTeams, active.length, allowTwoConsecutiveBench) }
    : null;
  lastRunReport = { feasibility, candidatesEvaluated: divisions.length, elapsedMs, benchInfeasibility };
  return out.sort((a, b) => a.cost - b.cost);
};

/** A melhor divisão (conveniência sobre balanceTeamsOptions). */
export const balanceTeams = (
  players: Player[],
  numTeams: number,
  options: BalanceOptions = {},
): BalanceResult | null => balanceTeamsOptions(players, numTeams, options)[0] ?? null;

const finalize = (
  teams: DivTeam[], neverGk: boolean, allowTwoConsecutiveBench: boolean, separate: [string, string][], cache?: FormationCache,
): BalanceResult => {
  const built = teams.map((t) => buildBalancedTeam(t, neverGk, allowTwoConsecutiveBench, cache, gamesForTeamCount(teams.length)));
  const gap = (sel: (b: BalancedTeam) => number): number => {
    const vals = built.map(sel);
    return round(Math.max(...vals) - Math.min(...vals));
  };
  const cobs = built.map((b) => b.metrics.cobertura).filter((x): x is number => x != null);
  const teamOf = teamOfIdMap(teams);
  const nameOf = new Map<string, string>();
  teams.forEach((t) => { [t.gk, ...t.line, ...t.bench].forEach((r) => { if (r) nameOf.set(r.player.id, r.player.name); }); });
  const separationViolations = separate
    .filter(([a, b]) => { const ta = teamOf.get(a); const tb = teamOf.get(b); return ta != null && tb != null && ta === tb; })
    .map(([a, b]) => `${nameOf.get(a) ?? a} & ${nameOf.get(b) ?? b}`);
  const allMetrics = teams.map((t) => teamMetrics(t, neverGk, allowTwoConsecutiveBench, cache, gamesForTeamCount(teams.length)));
  const goalkeeperWarnings = allMetrics
    .map((m) => m.goalkeeperWarning)
    .filter((w): w is string => !!w);
  return {
    teams: built,
    cost: round(divisionCost(teams, neverGk, allowTwoConsecutiveBench, separate, cache) * 100) / 100,
    gaps: {
      def: gap((b) => b.metrics.def),
      off: gap((b) => b.metrics.off),
      recuo: gap((b) => b.metrics.recuo),
      pressao: gap((b) => b.metrics.pressao),
      geral: gap((b) => b.metrics.geral),
      cobertura: cobs.length === built.length ? round(Math.max(...cobs) - Math.min(...cobs)) : null,
    },
    separationViolations,
    goalkeeperWarnings,
  };
};
