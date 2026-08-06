import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import { ALL_SYSTEMS } from './formationModel';
import {
  balanceTeams, balanceTeamsOptions, getLastBalanceRunReport, resolvePlayer, teamMetrics, W,
  type DivTeam,
} from './balance';
import { buildTeamSchedule, clampLateArrivals, gamesForTeamCount } from './rotation';

/**
 * PRNG determinístico (mulberry32) usado SÓ NESTE ARQUIVO DE TESTE para
 * stubar `Math.random` — nunca no código de produção (`generateTeams.ts` usa
 * `Math.random` diretamente para embaralhar candidatas/goleiros; ver
 * diagnóstico de performance). Com a semente fixa, duas chamadas de
 * `balanceTeams` na mesma sub-suíte percorrem a MESMA amostra de divisões
 * candidatas — o que permite voltar a comparar métricas por IGUALDADE EXATA
 * em vez de tolerância: sem isso, o "empate quase perfeito" entre divisões
 * candidatas poderia fazer um teste de acoplamento (ex.: goleiro afetando
 * `off`) passar mesmo com um vazamento real de até poucos pontos.
 */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

let realRandom: () => number;
const withSeededRandom = (seed = 42): void => {
  const rng = mulberry32(seed);
  Math.random = rng;
};
beforeEach(() => { realRandom = Math.random; });
afterEach(() => { Math.random = realRandom; });

/** Vetor UNIFORME (0–100): fixture direta de atributos, sem estrela nem derivação. */
const flatAttrs = (overall: number): AttrVector => {
  const v = clampAttr(overall);
  return { FIN: v, CRI: v, DRI: v, DEF: v, VEL: v, RCD: v, INT: v, MOV: v, FIS: v, OFE: v };
};

let idc = 0;
const P = (position: Position, overall: number, o: Partial<Player> = {}): Player => ({
  id: `p${++idc}`, name: `${position}${idc}`, active: true, isGoalkeeper: false,
  position, attributes: flatAttrs(overall), gk: null,
  acceptedPositions: allEnabled([BOX_TO_BOX]), ...o,
});

// 14 jogadores = 2 times de 7 (2 goleiros + 12 de linha), sem banco.
// Overalls (0–100) equivalentes às antigas estrelas 0–5 (×20): 4=80, 3.5=70,
// 3=60, 4.5=90, 2.5=50, 2=40.
const pool = (): Player[] => {
  idc = 0;
  return [
    P('DEFENSOR', 80, { isGoalkeeper: true, gk: 80 }), P('DEFENSOR', 70, { isGoalkeeper: true, gk: 70 }),
    P('DEFENSOR', 80), P('DEFENSOR', 60), P('DEFENSOR', 90), P('DEFENSOR', 50),
    P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90), P('MEIA', 40),
    P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80),
  ];
};

describe('nota de goleiro desacoplada do resto', () => {
  // A nota de goleiro é INDEPENDENTE: não afeta nenhuma outra métrica e não é
  // afetada por nenhuma outra. Só entra na nota do time (`geral`) no jogo em que
  // o jogador está escalado no gol.
  const poolComGk = (nota: number): Player[] => {
    idc = 0;
    return [
      P('DEFENSOR', 80, { isGoalkeeper: true, gk: nota }), P('DEFENSOR', 70, { isGoalkeeper: true, gk: nota }),
      P('DEFENSOR', 80), P('DEFENSOR', 60), P('DEFENSOR', 90), P('DEFENSOR', 50),
      P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90), P('MEIA', 40),
      P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80),
    ];
  };

  const media = (r: { teams: { metrics: Record<string, unknown> }[] }, k: string) =>
    r.teams.reduce((s, t) => s + (t.metrics[k] as number), 0) / r.teams.length;

  // Compara os CONJUNTOS de valores (não por índice de time): a rotina de
  // banco (Fase 6) depende do encaixe real do sistema tático
  // (`chooseBestSystem`) pra decidir quem senta, e o vencedor entre divisões
  // candidatas quase-empatadas pode, em tese, variar por time físico. Com
  // `Math.random` SEMEADO (`withSeededRandom`, só neste teste) as duas
  // chamadas de `balanceTeams` abaixo percorrem a MESMA amostra de divisões
  // candidatas — por isso a comparação agora é por IGUALDADE EXATA (não por
  // tolerância): sem a semente, um "quase empate" na busca poderia mascarar
  // um vazamento real de acoplamento entre a nota de goleiro e estes eixos.
  const sortedOf = (r: { teams: { metrics: Record<string, unknown> }[] }, k: string) =>
    [...r.teams.map((t) => t.metrics[k] as number)].sort((a, b) => a - b);

  it('a nota de goleiro entra SÓ no eixo defensivo — nunca no geral nem no ataque', () => {
    withSeededRandom();
    const ruim = balanceTeams(poolComGk(10), 2)!;
    withSeededRandom();
    const bom = balanceTeams(poolComGk(95), 2)!;
    // Defesa sobe com goleiro melhor (goleiro vale 1/3 do eixo).
    expect(media(bom, 'def')).toBeGreaterThan(media(ruim, 'def'));
    // Ataque NÃO: nenhum goleiro do elenco joga bem com os pés.
    expect(sortedOf(bom, 'off')).toEqual(sortedOf(ruim, 'off'));
    // `geral` e `recuo` são exclusivamente dos 6 de linha.
    expect(sortedOf(bom, 'geral')).toEqual(sortedOf(ruim, 'geral'));
    expect(sortedOf(bom, 'recuo')).toEqual(sortedOf(ruim, 'recuo'));
  });

  it('goleiro pesa 1/3 do eixo defensivo (impacto mediano, não decisivo)', () => {
    const ruim = balanceTeams(poolComGk(20), 2)!;
    const bom = balanceTeams(poolComGk(80), 2)!;
    // 60 pontos de goleiro × 1/3 ≈ 20 pontos de `def`. Faixa larga de propósito:
    // o que importa é a ORDEM DE GRANDEZA — mediano, não decisivo nem irrelevante.
    const delta = media(bom, 'def') - media(ruim, 'def');
    expect(delta).toBeGreaterThan(10);
    expect(delta).toBeLessThan(30);
  });

  it('sem goleiro do elenco (emprestado), a nota de goleiro não entra na conta', () => {
    withSeededRandom();
    const ruim = balanceTeams(poolComGk(10), 2, { neverScaleGoalkeepers: true })!;
    withSeededRandom();
    const bom = balanceTeams(poolComGk(95), 2, { neverScaleGoalkeepers: true })!;
    expect(sortedOf(bom, 'def')).toEqual(sortedOf(ruim, 'def'));
    expect(sortedOf(bom, 'geral')).toEqual(sortedOf(ruim, 'geral'));
  });
});

describe('W (pesos do custo multi-métrica)', () => {
  it('somam 1,00', () => {
    const sum = W.def + W.geral + W.off + W.recuo + W.pressao + W.fitQuality;
    expect(sum).toBeCloseTo(1, 9);
  });
});

describe('balanceTeams', () => {
  it('monta 2 times com sistema tático, mapinha e métricas', () => {
    const res = balanceTeams(pool(), 2);
    expect(res).not.toBeNull();
    expect(res!.teams).toHaveLength(2);
    for (const t of res!.teams) {
      expect(ALL_SYSTEMS).toContain(t.formation);
      expect(t.slots).toHaveLength(6);
      expect(t.metrics.feasible).toBe(true);
      for (const s of t.slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('não perde nem duplica jogador', () => {
    const players = pool();
    const res = balanceTeams(players, 2)!;
    const ids = new Set<string>();
    for (const t of res.teams) {
      for (const s of t.slots) ids.add(s.player.id);
      if (t.goalkeeper) ids.add(t.goalkeeper.id);
      for (const b of t.bench) ids.add(b.id);
    }
    expect(ids.size).toBe(players.length);
  });

  it('gaps são números não-negativos (times parelhos)', () => {
    const res = balanceTeams(pool(), 2)!;
    expect(res.gaps.def).toBeGreaterThanOrEqual(0);
    expect(res.gaps.geral).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(res.cost)).toBe(true);
  });

  it('com goleiro escalado, cobertura é calculada; sem escalar (emprestado), é null', () => {
    const comGk = balanceTeams(pool(), 2)!;
    expect(comGk.teams.every((t) => t.fieldsGoalkeeper)).toBe(true);
    expect(comGk.teams.every((t) => t.metrics.cobertura != null)).toBe(true);

    const emprestado = balanceTeams(pool(), 2, { neverScaleGoalkeepers: true })!;
    expect(emprestado.teams.every((t) => !t.fieldsGoalkeeper)).toBe(true);
    expect(emprestado.teams.every((t) => t.metrics.cobertura === null)).toBe(true);
  });

  it('mantém um par "separados" em times diferentes (ou avisa a violação)', () => {
    const players = pool();
    const [a, b] = [players[6].id, players[7].id]; // dois meias
    const res = balanceTeams(players, 2, { separatePairs: [[a, b]] })!;
    const teamOf = (id: string) =>
      res.teams.findIndex((t) => t.slots.some((s) => s.player.id === id) || t.goalkeeper?.id === id || t.bench.some((x) => x.id === id));
    const separated = teamOf(a) !== teamOf(b);
    expect(separated || res.separationViolations.length > 0).toBe(true);
    if (separated) expect(res.separationViolations).toHaveLength(0);
  });

  it('cada jogador que só joga de PIVO nunca fica sem vaga (nenhum time recebe 2 pivôs)', () => {
    const players = pool();
    for (const t of balanceTeams(players, 2)!.teams) {
      const pivoCount = t.slots.filter((s) => s.role === 'PIVO').length;
      expect(pivoCount).toBeLessThanOrEqual(1);
    }
  });
});

describe('balanceTeams — Fase 5: infactibilidade nomeando jogadores', () => {
  it('devolve [] quando 3 jogadores só jogam de PIVO e há 2 times, e o relatório nomeia os jogadores', () => {
    const players = [
      ...pool(),
      P('ATACANTE', 80, { name: 'Guto', acceptedPositions: allEnabled(["PIVO"]) }),
      P('ATACANTE', 60, { name: 'Tayrone', acceptedPositions: allEnabled(["PIVO"]) }),
      P('ATACANTE', 70, { name: 'Fulano', acceptedPositions: allEnabled(["PIVO"]) }),
    ];
    const res = balanceTeams(players, 2, { candidates: 5 });
    expect(res).toBeNull();
    const report = getLastBalanceRunReport();
    expect(report?.feasibility.feasible).toBe(false);
    expect(report?.feasibility.message).toContain('Guto');
    expect(report?.feasibility.message).toContain('Tayrone');
    expect(report?.feasibility.message).toContain('Fulano');
  });
});

describe('balanceTeams — Fase 6: custo é a média das métricas de 6 jogos', () => {
  it('reporta tempo medido e nº de candidatos avaliados', () => {
    const res = balanceTeams(pool(), 2, { candidates: 10 });
    expect(res).not.toBeNull();
    const report = getLastBalanceRunReport();
    expect(report).not.toBeNull();
    expect(report!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(report!.candidatesEvaluated).toBeGreaterThan(0);
  });
});

// Bug relatado pelo dono (testado por ele localmente): "Ele está revezando
// goleiro e ficando com 5 na linha." Causa raiz: `fielding` (dentro de
// `teamMetrics`) bastava alguém apto ao gol EXISTIR pra revezar goleiro
// PRÓPRIO — sem checar o TAMANHO do elenco. Um time só reveza goleiro do
// PRÓPRIO elenco com pelo menos 7 jogadores (goleiro reservado + 6 de linha +
// banco); com 6, os 6 são TODOS de linha e o goleiro vem EMPRESTADO de fora —
// ver `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER` em rotation.ts.
describe('balanceTeams — goleiro próprio só reveza com elenco de 7+ (bug "5 na linha")', () => {
  // 12 jogadores / 2 times = 6 de linha cada, SEM banco e SEM goleiro
  // reservado (12 = 2×6 não deixa ninguém pra reservar) — reproduz
  // exatamente o cenário do bug: cada time tem exatamente 6 no elenco total,
  // e um deles é apto ao gol.
  const poolSeisComUmGoleiro = (): Player[] => {
    idc = 0;
    return [
      P('DEFENSOR', 80, { isGoalkeeper: true, gk: 80 }),
      P('DEFENSOR', 70), P('DEFENSOR', 60), P('DEFENSOR', 90),
      P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90),
      P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80), P('ATACANTE', 50),
    ];
  };

  it('time com 6 no elenco: TODOS os 6 vão pra linha, `fieldsGoalkeeper` é false, e NENHUM jogo tem menos de 6 na linha', () => {
    const res = balanceTeams(poolSeisComUmGoleiro(), 2)!;
    expect(res).not.toBeNull();
    for (const t of res.teams) {
      // elenco de 6 (6 de linha, sem banco, sem goleiro reservado) — a
      // condição exata do bug relatado.
      expect(t.slots.length + t.bench.length + (t.goalkeeper ? 1 : 0)).toBe(6);
      expect(t.fieldsGoalkeeper).toBe(false);
      expect(t.metrics.cobertura).toBeNull();

      const sched = buildTeamSchedule(t, gamesForTeamCount(2));
      expect(sched.benchRuleBroken).toBe(false);
      for (const g of sched.games) {
        expect(g.slots.length).toBe(6); // nunca menos de 6 na linha
        expect(g.benchNames).toHaveLength(0); // sem banco possível com só 6 no elenco
      }
    }
  });

  it('a nota de goleiro NÃO influencia o eixo defensivo do time de 6 (goleiro emprestado não entra na conta)', () => {
    // `Math.random` SEMEADO (mesmo padrão de "nota de goleiro desacoplada do
    // resto" acima): sem isso, as duas chamadas de `balanceTeams` poderiam
    // percorrer amostras de divisões candidatas diferentes e produzir `def`
    // diferente por um motivo QUE NÃO É a nota de goleiro (mascarando ou
    // simulando um vazamento que não existe).
    withSeededRandom();
    const ruim = balanceTeams(poolSeisComUmGoleiro(), 2)!;
    const comGoleiroMelhor = poolSeisComUmGoleiro();
    comGoleiroMelhor[0] = { ...comGoleiroMelhor[0], gk: 5 }; // pior nota de goleiro possível
    withSeededRandom();
    const comGoleiroPior = balanceTeams(comGoleiroMelhor, 2)!;
    // Mesma composição de linha (mesmos atributos de campo) nos dois casos —
    // só a nota de goleiro mudou, e ela não deveria mexer em `def`.
    const defsRuim = ruim.teams.map((t) => t.metrics.def).sort((a, b) => a - b);
    const defsPior = comGoleiroPior.teams.map((t) => t.metrics.def).sort((a, b) => a - b);
    expect(defsPior).toEqual(defsRuim);
  });
});

describe('balanceTeams — elenco de 7 continua revezando goleiro próprio normalmente (sem regressão)', () => {
  // 14 jogadores / 2 times = 7 cada (6 de linha + 1 goleiro reservado, sem
  // banco) — MESMO pool usado no resto deste arquivo (`pool()`), que já
  // cobre esse caso, mas aqui a asserção é ESPECÍFICA sobre o comportamento
  // que não pode regredir com a correção do bug dos times de 6.
  it('time com 7 no elenco e goleiro apto: reveza goleiro próprio (fieldsGoalkeeper=true, cobertura calculada)', () => {
    const res = balanceTeams(pool(), 2)!;
    for (const t of res.teams) {
      expect(t.slots.length + t.bench.length + (t.goalkeeper ? 1 : 0)).toBe(7);
      expect(t.fieldsGoalkeeper).toBe(true);
      expect(t.metrics.cobertura).not.toBeNull();
      const sched = buildTeamSchedule(t, gamesForTeamCount(2));
      for (const g of sched.games) expect(g.slots.length).toBe(6);
    }
  });
});

// Verificação DIRETA (sem passar pela busca de divisões, pra não haver
// confusão entre "composição de time diferente" e "nota de goleiro
// diferente"): a nota de goleiro só pode pesar no eixo `def` nas rodadas em
// que aquele goleiro está de fato ESCALADO NO GOL — nas rodadas de goleiro
// EMPRESTADO (por atraso, ver `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`), a nota
// dele fica de fora por completo daquela rodada específica.
describe('teamMetrics — nota de goleiro fica de fora do eixo defensivo nas rodadas de goleiro EMPRESTADO por atraso', () => {
  // Time de 7 (1 goleiro reservado + 6 de linha, sem banco) com 1 ÚNICO
  // goleiro apto — o mesmo goleiro que carrega o atraso. Enquanto ausente
  // (jogos 1–2), o time fica com só 6 disponíveis: goleiro EMPRESTADO, nota
  // dele fora da conta. A partir do jogo 3 ele é o único apto e joga TODAS
  // as rodadas restantes no gol.
  const buildTime = (gkRating: number): DivTeam => {
    idc = 0;
    const gkPlayer = P('DEFENSOR', 70, { isGoalkeeper: true, gk: gkRating });
    const line = [
      P('DEFENSOR', 80), P('DEFENSOR', 60), P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('ATACANTE', 90),
    ];
    return {
      id: 1, name: 'T', gk: resolvePlayer(gkPlayer), line: line.map(resolvePlayer), bench: [],
    };
  };

  it('SEM atraso: a nota de goleiro pesa em TODAS as 6 rodadas (diferença de def = 1/3 da diferença de nota, nas 6 rodadas)', () => {
    const defRuim = teamMetrics(buildTime(5), false, false, undefined, 6).def;
    const defBom = teamMetrics(buildTime(95), false, false, undefined, 6).def;
    // 90 de diferença de nota × 1/3 de peso, em TODAS as 6 rodadas = 30.
    expect(defBom - defRuim).toBeCloseTo(30, 5);
  });

  it('COM atraso de 2 jogos: a diferença de def cai pra 4/6 do valor sem atraso (nota só pesa nas rodadas com goleiro PRÓPRIO em campo)', () => {
    const lateArrivals = new Map([[buildTime(0).gk!.player.id, 2]]);
    const defRuim = teamMetrics(buildTime(5), false, false, undefined, 6, lateArrivals).def;
    const defBom = teamMetrics(buildTime(95), false, false, undefined, 6, lateArrivals).def;
    // Só 4 das 6 rodadas têm goleiro próprio (as 2 primeiras são emprestadas
    // por atraso) — a diferença cai proporcionalmente: (4/6) × 30 = 20.
    expect(defBom - defRuim).toBeCloseTo(20, 5);
  });
});

// Bug relatado pelo dono (2ª volta, reprodução EXATA do caso real dele):
// elenco de 21 jogadores ativos, 3 times, exatamente 7 por time. Um jogador
// (o "Léo" do relato) está marcado no filtro "Não jogará os primeiros jogos"
// com 2 jogos de ausência. A 1ª correção (limiar do ELENCO COMPLETO, ver
// `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`) não bastou: o elenco de 7 passava no
// limiar mesmo em rodadas onde só 6 estavam DISPONÍVEIS por causa do atraso,
// e o time voltava a jogar com 5 na linha. A correção definitiva torna a
// decisão "reveza goleiro próprio?" POR RODADA (ver rotation.ts).
describe('balanceTeamsOptions — reprodução EXATA do caso do dono: 21 jogadores, 3 times, 1 atrasado 2 jogos', () => {
  // 21 = 3 goleiros (1 por time) + 18 de linha (6 por time) — fecha 7 por
  // time SEM banco, exatamente como o relato ("exatamente 7 por time").
  const pool21 = (): Player[] => {
    idc = 0;
    return [
      P('DEFENSOR', 80, { isGoalkeeper: true, gk: 80 }),
      P('DEFENSOR', 70, { isGoalkeeper: true, gk: 70 }),
      P('DEFENSOR', 65, { isGoalkeeper: true, gk: 65 }),
      P('DEFENSOR', 80), P('DEFENSOR', 60), P('DEFENSOR', 90), P('DEFENSOR', 50), P('DEFENSOR', 75), P('DEFENSOR', 55),
      P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90), P('MEIA', 40), P('MEIA', 65),
      P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80), P('ATACANTE', 70), P('ATACANTE', 55), P('ATACANTE', 85),
    ];
  };

  it('rodadas 1 e 2 (ausência do Léo): time dele tem 6 na linha + goleiro emprestado; rodada 3+: volta a revezar goleiro próprio com 6 na linha + 1 no gol; NENHUMA rodada com menos de 6 na linha', () => {
    withSeededRandom(7);
    const players = pool21();
    const leo = players[3]; // um jogador de linha qualquer — o relato não exige que seja goleiro
    const out = balanceTeamsOptions(players, 3, {
      candidates: 40,
      lateArrivals: [{ playerId: leo.id, games: 2 }],
    });
    expect(out.length).toBeGreaterThan(0);
    const division = out[0];
    for (const t of division.teams) {
      // exatamente 7 por time, sem banco — a condição exata do relato.
      expect(t.slots.length + t.bench.length + (t.goalkeeper ? 1 : 0)).toBe(7);
      expect(t.bench).toHaveLength(0);
    }
    const rosterIdsOf = (t: (typeof division.teams)[number]) =>
      [...t.slots.map((s) => s.player.id), ...(t.goalkeeper ? [t.goalkeeper.id] : []), ...t.bench.map((b) => b.id)];
    const leoTeam = division.teams.find((t) => rosterIdsOf(t).includes(leo.id));
    expect(leoTeam).toBeDefined();

    const totalGames = gamesForTeamCount(3);
    const lateMap = clampLateArrivals([{ playerId: leo.id, games: 2 }], totalGames);
    const sched = buildTeamSchedule(leoTeam!, totalGames, undefined, false, lateMap);

    expect(sched.benchRuleBroken).toBe(false);
    expect(sched.lineShortfall).toBeNull();
    // NENHUMA rodada, em NENHUM caminho, com menos de 6 na linha.
    for (const g of sched.games) expect(g.slots.length).toBe(6);
    // Rodadas 1 e 2 (índices 0-1): Léo ausente, goleiro EMPRESTADO.
    expect(sched.games[0].goalkeeperName).toBeNull();
    expect(sched.games[1].goalkeeperName).toBeNull();
    expect(sched.games[0].slots.some((s) => s.player.id === leo.id)).toBe(false);
    expect(sched.games[1].slots.some((s) => s.player.id === leo.id)).toBe(false);
    // Rodada 3 em diante: Léo chegou, elenco de 7 disponível de novo — volta
    // a revezar goleiro PRÓPRIO.
    for (const g of sched.games.slice(2)) expect(g.goalkeeperName).not.toBeNull();
    expect(sched.games[2].arrivals).toEqual([leo.name]);
  });

  it('times SEM nenhum atrasado (os outros 2 times da mesma divisão) continuam revezando goleiro próprio em TODAS as rodadas — sem regressão', () => {
    withSeededRandom(7);
    const players = pool21();
    const leo = players[3];
    const out = balanceTeamsOptions(players, 3, {
      candidates: 40,
      lateArrivals: [{ playerId: leo.id, games: 2 }],
    });
    expect(out.length).toBeGreaterThan(0);
    const division = out[0];
    const rosterIdsOf = (t: (typeof division.teams)[number]) =>
      [...t.slots.map((s) => s.player.id), ...(t.goalkeeper ? [t.goalkeeper.id] : []), ...t.bench.map((b) => b.id)];
    const otherTeams = division.teams.filter((t) => !rosterIdsOf(t).includes(leo.id));
    expect(otherTeams).toHaveLength(2);
    const totalGames = gamesForTeamCount(3);
    for (const t of otherTeams) {
      expect(t.fieldsGoalkeeper).toBe(true);
      const sched = buildTeamSchedule(t, totalGames);
      for (const g of sched.games) {
        expect(g.slots.length).toBe(6);
        expect(g.goalkeeperName).not.toBeNull();
      }
    }
  });
});
