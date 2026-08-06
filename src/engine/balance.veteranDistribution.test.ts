import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import { balanceTeams, balanceTeamsOptions, getLastBalanceRunReport, veteranDistributionBroken, veteranInfeasibilityMessage, effectiveVeteranCount } from './balance';
import { gamesForTeamCount, buildTeamSchedule } from './rotation';

/**
 * PRNG determinístico — mesmo mulberry32 usado em balance.test.ts, SÓ NESTE
 * ARQUIVO DE TESTE, pra tornar `generateTeams`/`localSearch` reproduzíveis
 * (o motor usa `Math.random` de verdade em produção).
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
const withSeededRandom = (seed = 42): void => { Math.random = mulberry32(seed); };
beforeEach(() => { realRandom = Math.random; });
afterEach(() => { Math.random = realRandom; });

const flatAttrs = (overall: number): AttrVector => {
  const v = clampAttr(overall);
  return { FIN: v, CRI: v, DRI: v, DEF: v, VEL: v, RCD: v, INT: v, MOV: v, FIS: v };
};

let idc = 0;
const P = (position: Position, overall: number, o: Partial<Player> = {}): Player => ({
  id: `p${++idc}`, name: `${position}${idc}`, active: true, isGoalkeeper: false,
  position, attributes: flatAttrs(overall), gk: null,
  acceptedPositions: allEnabled([BOX_TO_BOX]), ...o,
});

// 14 jogadores = 2 times de 7 (2 goleiros + 12 de linha), sem banco — mesmo
// pool de balance.test.ts.
const pool2 = (): Player[] => {
  idc = 0;
  return [
    P('DEFENSOR', 80, { isGoalkeeper: true, gk: 80 }), P('DEFENSOR', 70, { isGoalkeeper: true, gk: 70 }),
    P('DEFENSOR', 80), P('DEFENSOR', 60), P('DEFENSOR', 90), P('DEFENSOR', 50),
    P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90), P('MEIA', 40),
    P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80),
  ];
};

// 21 jogadores = 3 times de 7 (3 goleiros + 18 de linha), sem banco.
const pool3 = (): Player[] => {
  idc = 0;
  return [
    P('DEFENSOR', 80, { isGoalkeeper: true, gk: 80 }), P('DEFENSOR', 70, { isGoalkeeper: true, gk: 70 }), P('DEFENSOR', 65, { isGoalkeeper: true, gk: 65 }),
    P('DEFENSOR', 80), P('DEFENSOR', 60), P('DEFENSOR', 90), P('DEFENSOR', 50), P('DEFENSOR', 55), P('DEFENSOR', 75),
    P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90), P('MEIA', 40), P('MEIA', 65),
    P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80), P('ATACANTE', 55), P('ATACANTE', 65), P('ATACANTE', 75),
  ];
};

// -----------------------------------------------------------------------
// Fixtures mínimas de DivTeam (estruturais — não importam o tipo, que não é
// exportado; bastam os campos que `veteranDistributionBroken` de fato lê:
// `gk`/`line`/`bench`, cada RP com `player.veteran`).
// -----------------------------------------------------------------------
type FakeRP = { player: Player; attrs: AttrVector; gk: number | null };
const rp = (veteran: boolean): FakeRP => ({
  player: { id: `v${Math.random()}`, name: 'X', active: true, isGoalkeeper: false, position: 'MEIA', attributes: flatAttrs(50), gk: null, acceptedPositions: allEnabled([BOX_TO_BOX]), veteran },
  attrs: flatAttrs(50),
  gk: null,
});
/** Time fake com `n` veteranos e `nonVeteran` não-veteranos, todos na linha. */
const fakeTeam = (id: number, veteranCount: number, nonVeteranCount: number) => ({
  id, name: `Time ${id}`, gk: null,
  line: [...Array(veteranCount).fill(0).map(() => rp(true)), ...Array(nonVeteranCount).fill(0).map(() => rp(false))],
  bench: [],
});

/** Veterano cadastrado SÓ como pivô (nenhuma outra posição habilitada). */
const rpPivotOnly = (): FakeRP => ({
  player: {
    id: `pv${Math.random()}`, name: 'PivoOnly', active: true, isGoalkeeper: false, position: 'ATACANTE',
    attributes: flatAttrs(50), gk: null, acceptedPositions: allEnabled(['PIVO']), veteran: true,
  },
  attrs: flatAttrs(50),
  gk: null,
});

/** Time fake com veteranos comuns + `pivotOnly` veteranos pivô-only. */
const fakeTeamWithPivotOnly = (id: number, veteranCount: number, pivotOnly: number, nonVeteranCount: number) => ({
  id, name: `Time ${id}`, gk: null,
  line: [
    ...Array(veteranCount).fill(0).map(() => rp(true)),
    ...Array(pivotOnly).fill(0).map(() => rpPivotOnly()),
    ...Array(nonVeteranCount).fill(0).map(() => rp(false)),
  ],
  bench: [],
});

describe('veteranDistributionBroken — formalização exata do pedido do dono (floor/ceil)', () => {
  it('V=2, T=2 → 1 e 1 (nunca 2 e 0)', () => {
    expect(veteranDistributionBroken([fakeTeam(1, 1, 5), fakeTeam(2, 1, 5)])).toBe(false);
    expect(veteranDistributionBroken([fakeTeam(1, 2, 4), fakeTeam(2, 0, 6)])).toBe(true);
  });

  it('V=3, T=2 → 2 e 1 (cada time com no mínimo 1)', () => {
    expect(veteranDistributionBroken([fakeTeam(1, 2, 4), fakeTeam(2, 1, 5)])).toBe(false);
    expect(veteranDistributionBroken([fakeTeam(1, 1, 5), fakeTeam(2, 2, 4)])).toBe(false);
    expect(veteranDistributionBroken([fakeTeam(1, 3, 3), fakeTeam(2, 0, 6)])).toBe(true);
  });

  it('V=5, T=2 → 3 e 2 (cada time com no mínimo 2)', () => {
    expect(veteranDistributionBroken([fakeTeam(1, 3, 3), fakeTeam(2, 2, 4)])).toBe(false);
    expect(veteranDistributionBroken([fakeTeam(1, 2, 4), fakeTeam(2, 3, 3)])).toBe(false);
    expect(veteranDistributionBroken([fakeTeam(1, 4, 2), fakeTeam(2, 1, 5)])).toBe(true);
    expect(veteranDistributionBroken([fakeTeam(1, 5, 1), fakeTeam(2, 0, 6)])).toBe(true);
  });

  it('T=3 (ex.: V=4 → 2/1/1, nunca 2/2/0)', () => {
    expect(veteranDistributionBroken([fakeTeam(1, 2, 4), fakeTeam(2, 1, 5), fakeTeam(3, 1, 5)])).toBe(false);
    expect(veteranDistributionBroken([fakeTeam(1, 2, 4), fakeTeam(2, 2, 4), fakeTeam(3, 0, 6)])).toBe(true);
  });

  it('zero veteranos = sem restrição nenhuma (comportamento de hoje, sem regressão)', () => {
    expect(veteranDistributionBroken([fakeTeam(1, 0, 6), fakeTeam(2, 0, 6)])).toBe(false);
    expect(veteranDistributionBroken([fakeTeam(1, 0, 6), fakeTeam(2, 0, 6), fakeTeam(3, 0, 6)])).toBe(false);
  });
});

describe('veteranInfeasibilityMessage', () => {
  it('cita os números reais (V, T e a distribuição exigida)', () => {
    const msg = veteranInfeasibilityMessage(2, 2);
    expect(msg).toContain('2 veterano(s) ativo(s)');
    expect(msg).toContain('2 times');
    expect(msg).toContain('exatamente 1 veterano(s) por time');
    expect(msg).toContain('Desconsiderar veteranos');
  });

  it('faixa entre lo e hi quando a divisão exata não é inteira', () => {
    const msg = veteranInfeasibilityMessage(3, 2);
    expect(msg).toContain('entre 1 e 2 veteranos por time');
  });
});

describe('balanceTeamsOptions — regra de veteranos integrada ao pipeline real', () => {
  it('divisão inicial (raw) já concentrando veteranos é EXCLUÍDA — nada sobra, mensagem cita os números reais (seed determinístico)', () => {
    withSeededRandom(9);
    const players = pool2();
    players[11].veteran = true;
    players[12].veteran = true;
    const out = balanceTeamsOptions(players, 2, { candidates: 1, ignoreVeteranDistribution: false });
    expect(out).toHaveLength(0);
    const report = getLastBalanceRunReport();
    expect(report?.veteranInfeasibility?.message).toContain('2 veterano(s) ativo(s) para 2 times');
    expect(report?.veteranInfeasibility?.message).toContain('exatamente 1 veterano(s) por time');
    expect(report?.benchInfeasibility).toBeNull();
  });

  it('com "Desconsiderar veteranos" marcado, a MESMA divisão concentrada volta a ser aceita', () => {
    withSeededRandom(9);
    const players = pool2();
    players[11].veteran = true;
    players[12].veteran = true;
    const out = balanceTeamsOptions(players, 2, { candidates: 1, ignoreVeteranDistribution: true });
    expect(out.length).toBeGreaterThan(0);
    const report = getLastBalanceRunReport();
    expect(report?.veteranInfeasibility).toBeNull();
  });

  it('a busca local NUNCA sai de uma divisão válida (1-1) pra uma concentrada quando a regra está ATIVA', () => {
    withSeededRandom(1);
    const players = pool2();
    players[11].veteran = true;
    players[12].veteran = true;
    const out = balanceTeamsOptions(players, 2, { candidates: 1, ignoreVeteranDistribution: false });
    expect(out).toHaveLength(1);
    const counts = out[0].teams.map((t) => {
      const all = [...t.slots.map((s) => s.player), t.goalkeeper, ...t.bench].filter((p): p is Player => !!p);
      return all.filter((p) => p.veteran).length;
    });
    expect(counts.sort()).toEqual([1, 1]);
  });

  it('sem a regra (checkbox marcado), a MESMA semente pode concentrar os veteranos — prova que a busca local só respeita a regra quando ela está ativa', () => {
    withSeededRandom(1);
    const players = pool2();
    players[11].veteran = true;
    players[12].veteran = true;
    const out = balanceTeamsOptions(players, 2, { candidates: 1, ignoreVeteranDistribution: true });
    expect(out).toHaveLength(1);
    const counts = out[0].teams.map((t) => {
      const all = [...t.slots.map((s) => s.player), t.goalkeeper, ...t.bench].filter((p): p is Player => !!p);
      return all.filter((p) => p.veteran).length;
    });
    expect(counts.sort()).toEqual([0, 2]);
  });

  it('distribuição correta em toda divisão retornada com T=3 (roster maior, candidatos generosos)', () => {
    withSeededRandom(7);
    const players = pool3();
    // 4 veteranos ativos, 3 times -> cada time com 1 ou 2 (floor=1, ceil=2).
    players[3].veteran = true;
    players[9].veteran = true;
    players[15].veteran = true;
    players[18].veteran = true;
    const out = balanceTeamsOptions(players, 3, { candidates: 15 });
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) {
      const counts = r.teams.map((t) => {
        const all = [...t.slots.map((s) => s.player), t.goalkeeper, ...t.bench].filter((p): p is Player => !!p);
        return all.filter((p) => p.veteran).length;
      });
      const total = counts.reduce((a, b) => a + b, 0);
      expect(total).toBe(4);
      for (const c of counts) {
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(2);
      }
    }
  });

  it('zero veteranos marcados = nenhuma exclusão por essa regra (sem regressão no comportamento de hoje)', () => {
    withSeededRandom(42);
    const res = balanceTeams(pool2(), 2, { candidates: 10 });
    expect(res).not.toBeNull();
    const report = getLastBalanceRunReport();
    expect(report?.veteranInfeasibility).toBeNull();
  });

  it(
    'a regra é sobre o ELENCO COMPLETO (não por jogo): uma divisão com distribuição correta continua ' +
    'válida mesmo que, numa rodada específica do rodízio, os veteranos em campo fiquem desbalanceados',
    () => {
      withSeededRandom(42);
      const players = pool2();
      // pool com 2 jogadores extra pra dar banco a cada time (16 jogadores no total).
      players.push(P('ATACANTE', 55), P('ATACANTE', 65));
      players[6].veteran = true; // MEIA80
      players[9].veteran = true; // MEIA90
      const res = balanceTeams(players, 2, { candidates: 40 });
      expect(res).not.toBeNull();

      // 1) nível ELENCO: cada time tem exatamente 1 veterano (a regra vale).
      const eshapeCounts = res!.teams.map((t) => {
        const all = [...t.slots.map((s) => s.player), t.goalkeeper, ...t.bench].filter((p): p is Player => !!p);
        return all.filter((p) => p.veteran).length;
      });
      expect(eshapeCounts.sort()).toEqual([1, 1]);

      // 2) nível JOGO: o rodízio de banco pode, numa rodada, benquear o
      // veterano de um time enquanto o do outro joga — desbalanceando o
      // "em campo" momentaneamente. Isso é ESPERADO e não deveria (e não
      // deve) invalidar a divisão: a regra dos veteranos nunca olha pra
      // dentro do rodízio, só pra composição final dos times.
      const games = gamesForTeamCount(res!.teams.length);
      const perGameVetCounts = res!.teams.map((t) => {
        const sched = buildTeamSchedule(t, games);
        return sched.games.map((g) => g.slots.filter((s) => s.player.veteran).length);
      });
      const anyGameImbalanced = perGameVetCounts[0].some((c, i) => c !== perGameVetCounts[1][i]);
      expect(anyGameImbalanced).toBe(true); // prova que existe desbalanço por jogo...
      // ...e ainda assim a divisão inteira foi aceita (não é null, é o `res` de cima).
    },
  );
});

describe('veterano cadastrado SÓ como pivô (regra do dono)', () => {
  // Caso real: gente que joga de segundo atacante/meia-atacante e só "quebra um
  // galho" no pivô acaba marcada apenas como PIVO. Esse veterano só CONTA para a
  // distribuição quando o TOTAL de veteranos é <= o nº de TIMES, ou MÚLTIPLO do
  // nº de times. Nesses dois casos a divisão já sai limpa sozinha (no máximo 1
  // por time, ou exatamente V/T em cada). Fora deles algum time levaria um
  // veterano A MAIS — e é aí que o pivô sai da conta, pra que o time DELE seja o
  // que aguenta o extra (ele fica na área e não corre o campo).
  // O total é o BRUTO (antes da exclusão), senão a condição seria circular.

  it('total 3 em 2 times (3 > 2 e 3 % 2 != 0): pivô-only é IGNORADO', () => {
    const teams = [fakeTeamWithPivotOnly(1, 1, 1, 4), fakeTeamWithPivotOnly(2, 1, 0, 5)];
    expect(effectiveVeteranCount(teams)).toBe(2); // 3 brutos - 1 pivô-only
    // Os 2 veteranos que CORREM ficam 1 em cada; o pivô acompanha um deles.
    expect(veteranDistributionBroken(teams)).toBe(false);
    // E o cenário que o dono quer evitar — os 2 que correm juntos, e o outro time
    // só com o pivô — é REJEITADO: os 2 comuns viram 2 contra 0.
    const bad = [fakeTeamWithPivotOnly(1, 2, 0, 4), fakeTeamWithPivotOnly(2, 0, 1, 5)];
    expect(veteranDistributionBroken(bad)).toBe(true);
  });

  it('total 4 em 2 times (múltiplo de 2): pivô-only CONTA', () => {
    const teams = [fakeTeamWithPivotOnly(1, 2, 0, 4), fakeTeamWithPivotOnly(2, 1, 1, 4)];
    expect(effectiveVeteranCount(teams)).toBe(4); // nenhum ignorado
    expect(veteranDistributionBroken(teams)).toBe(false); // 2 e 2

    const bad = [fakeTeamWithPivotOnly(1, 3, 0, 3), fakeTeamWithPivotOnly(2, 0, 1, 5)];
    expect(veteranDistributionBroken(bad)).toBe(true); // 3 e 1, lo=hi=2
  });

  it('total 2 em 3 times (2 <= 3): pivô-only CONTA', () => {
    const teams = [
      fakeTeamWithPivotOnly(1, 1, 0, 5), fakeTeamWithPivotOnly(2, 0, 1, 5), fakeTeamWithPivotOnly(3, 0, 0, 6),
    ];
    expect(effectiveVeteranCount(teams)).toBe(2); // nenhum ignorado (2 <= 3 times)
    expect(veteranDistributionBroken(teams)).toBe(false); // 1, 1, 0 com lo=0 hi=1
  });

  it('total 4 em 3 times (4 > 3 e 4 % 3 != 0): pivô-only é IGNORADO', () => {
    const teams = [
      fakeTeamWithPivotOnly(1, 1, 1, 4), fakeTeamWithPivotOnly(2, 1, 0, 5), fakeTeamWithPivotOnly(3, 1, 0, 5),
    ];
    expect(effectiveVeteranCount(teams)).toBe(3); // 4 brutos - 1 pivô-only
    expect(veteranDistributionBroken(teams)).toBe(false); // 1, 1, 1 — o pivô acompanha o time 1
  });

  it('total 6 em 3 times (múltiplo de 3): pivô-only CONTA', () => {
    const teams = [
      fakeTeamWithPivotOnly(1, 1, 1, 4), fakeTeamWithPivotOnly(2, 2, 0, 4), fakeTeamWithPivotOnly(3, 2, 0, 4),
    ];
    expect(effectiveVeteranCount(teams)).toBe(6);
    expect(veteranDistributionBroken(teams)).toBe(false); // 2, 2, 2
  });

  it('veterano com PIVO + outra posição habilitada NÃO é pivô-only (conta sempre)', () => {
    const rpPivoEAla: FakeRP = {
      player: {
        id: 'pa1', name: 'PivoEAla', active: true, isGoalkeeper: false, position: 'ATACANTE',
        attributes: flatAttrs(50), gk: null, acceptedPositions: allEnabled(['PIVO', 'ALA']), veteran: true,
      },
      attrs: flatAttrs(50), gk: null,
    };
    const teams = [
      { id: 1, name: 'T1', gk: null, line: [rp(true), rp(true), rpPivoEAla, rp(false), rp(false), rp(false)], bench: [] },
      { id: 2, name: 'T2', gk: null, line: [rp(true), rp(false), rp(false), rp(false), rp(false), rp(false)], bench: [] },
    ];
    // Total 4 e nenhum pivô-only -> nada é ignorado; 3 contra 1 com lo=hi=2 viola.
    expect(effectiveVeteranCount(teams)).toBe(4);
    expect(veteranDistributionBroken(teams)).toBe(true);
  });
});
