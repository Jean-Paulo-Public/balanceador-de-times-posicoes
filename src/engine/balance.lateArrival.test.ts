import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import {
  balanceTeamsOptions, getLastBalanceRunReport,
  lateArrivalDistributionBroken, lateArrivalInfeasibilityMessage,
} from './balance';

/**
 * PRNG determinístico — mesmo mulberry32 usado em balance.veteranDistribution.test.ts,
 * SÓ NESTE ARQUIVO DE TESTE, pra tornar `generateTeams`/`localSearch` reproduzíveis.
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
// pool de balance.veteranDistribution.test.ts.
const pool2 = (): Player[] => {
  idc = 0;
  return [
    P('DEFENSOR', 80, { isGoalkeeper: true, gk: 80 }), P('DEFENSOR', 70, { isGoalkeeper: true, gk: 70 }),
    P('DEFENSOR', 80), P('DEFENSOR', 60), P('DEFENSOR', 90), P('DEFENSOR', 50),
    P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90), P('MEIA', 40),
    P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80),
  ];
};

// -----------------------------------------------------------------------
// Fixtures mínimas de DivTeam (estruturais — bastam os campos que
// `lateArrivalDistributionBroken` de fato lê: `gk`/`line`/`bench`, cada RP
// com `player.id`).
// -----------------------------------------------------------------------
type FakeRP = { player: Player; attrs: AttrVector; gk: number | null };
let ridc = 0;
const rp = (id?: string): FakeRP => ({
  player: {
    id: id ?? `r${++ridc}`, name: id ?? `r${ridc}`, active: true, isGoalkeeper: false,
    position: 'MEIA', attributes: flatAttrs(50), gk: null, acceptedPositions: allEnabled([BOX_TO_BOX]),
  },
  attrs: flatAttrs(50),
  gk: null,
});
/** Time fake com jogadores late-arrival identificados por `lateIds`, mais `normalCount` jogadores comuns. */
const fakeTeamLate = (id: number, lateIds: string[], normalCount: number) => ({
  id, name: `Time ${id}`, gk: null,
  line: [...lateIds.map((lid) => rp(lid)), ...Array(normalCount).fill(0).map(() => rp())],
  bench: [],
});

describe('lateArrivalDistributionBroken — floor/ceil entre times (mesma arquitetura da regra de veteranos)', () => {
  it('A=2, T=2 → 1 e 1 (nunca 2 e 0)', () => {
    const map = new Map([['a1', 2], ['a2', 2]]);
    expect(lateArrivalDistributionBroken([fakeTeamLate(1, ['a1'], 5), fakeTeamLate(2, ['a2'], 5)], map)).toBe(false);
    expect(lateArrivalDistributionBroken([fakeTeamLate(1, ['a1', 'a2'], 4), fakeTeamLate(2, [], 6)], map)).toBe(true);
  });

  it('A=3, T=2 → 2 e 1 (cada time com no mínimo 1)', () => {
    const map = new Map([['a1', 1], ['a2', 1], ['a3', 1]]);
    expect(lateArrivalDistributionBroken([fakeTeamLate(1, ['a1', 'a2'], 4), fakeTeamLate(2, ['a3'], 5)], map)).toBe(false);
    expect(lateArrivalDistributionBroken([fakeTeamLate(1, ['a1', 'a2', 'a3'], 3), fakeTeamLate(2, [], 6)], map)).toBe(true);
  });

  it('A=4, T=3 → 2/1/1 (nunca 2/2/0)', () => {
    const map = new Map([['a1', 1], ['a2', 1], ['a3', 1], ['a4', 1]]);
    expect(lateArrivalDistributionBroken(
      [fakeTeamLate(1, ['a1', 'a2'], 4), fakeTeamLate(2, ['a3'], 5), fakeTeamLate(3, ['a4'], 5)], map,
    )).toBe(false);
    expect(lateArrivalDistributionBroken(
      [fakeTeamLate(1, ['a1', 'a2'], 4), fakeTeamLate(2, ['a3', 'a4'], 4), fakeTeamLate(3, [], 6)], map,
    )).toBe(true);
  });

  it('zero atrasados marcados = sem restrição nenhuma (comportamento de hoje, sem regressão)', () => {
    const empty = new Map<string, number>();
    expect(lateArrivalDistributionBroken([fakeTeamLate(1, [], 6), fakeTeamLate(2, [], 6)], empty)).toBe(false);
  });

  it('ids marcados que não correspondem a ninguém em time nenhum não contam (total efetivo = 0)', () => {
    const map = new Map([['ghost', 3]]);
    expect(lateArrivalDistributionBroken([fakeTeamLate(1, [], 6), fakeTeamLate(2, [], 6)], map)).toBe(false);
  });
});

describe('lateArrivalInfeasibilityMessage', () => {
  it('cita os números reais (A, T e a distribuição exigida)', () => {
    const msg = lateArrivalInfeasibilityMessage(2, 2);
    expect(msg).toContain('2 jogador(es) marcado(s) como atrasado(s)');
    expect(msg).toContain('2 times');
    expect(msg).toContain('exatamente 1 atrasado(s) por time');
    expect(msg).toContain('Não jogará os primeiros jogos');
  });

  it('faixa entre lo e hi quando a divisão exata não é inteira', () => {
    const msg = lateArrivalInfeasibilityMessage(3, 2);
    expect(msg).toContain('entre 1 e 2 atrasados por time');
  });
});

describe('balanceTeamsOptions — regra de atrasados integrada ao pipeline real', () => {
  it('divisão inicial (raw) já concentrando atrasados é EXCLUÍDA — mensagem cita os números reais (seed determinístico)', () => {
    withSeededRandom(9);
    const players = pool2();
    const out = balanceTeamsOptions(players, 2, {
      candidates: 1,
      lateArrivals: [{ playerId: players[11].id, games: 2 }, { playerId: players[12].id, games: 1 }],
    });
    expect(out).toHaveLength(0);
    const report = getLastBalanceRunReport();
    expect(report?.lateArrivalInfeasibility?.message).toContain('2 jogador(es) marcado(s) como atrasado(s) para 2 times');
    expect(report?.lateArrivalInfeasibility?.message).toContain('exatamente 1 atrasado(s) por time');
    expect(report?.veteranInfeasibility).toBeNull();
    expect(report?.benchInfeasibility).toBeNull();
  });

  it('a busca local (`localSearch`) NUNCA sai de uma distribuição válida (1-1) pra uma concentrada', () => {
    withSeededRandom(2);
    const players = pool2();
    // Banco extra (mesmo padrão do teste de "distribuição correta" abaixo) —
    // sem isso, a ausência de um titular sem NENHUM banco causa `lineShortfall`
    // (não dá pra fechar 6 de linha), o que teria uma causa DIFERENTE
    // (rotação/linha) e não a de distribuição — não é o que este teste quer
    // isolar.
    players.push(P('ATACANTE', 55), P('ATACANTE', 65));
    const out = balanceTeamsOptions(players, 2, {
      candidates: 1,
      lateArrivals: [{ playerId: players[11].id, games: 2 }, { playerId: players[12].id, games: 1 }],
    });
    expect(out).toHaveLength(1);
    const counts = out[0].teams.map((t) => {
      const all = [...t.slots.map((s) => s.player), t.goalkeeper, ...t.bench].filter((p): p is Player => !!p);
      return all.filter((p) => p.id === players[11].id || p.id === players[12].id).length;
    });
    expect(counts.sort()).toEqual([1, 1]);
  });

  it('distribuição correta em toda divisão retornada com T=2 (roster com banco, candidatos generosos)', () => {
    withSeededRandom(7);
    const players = pool2();
    players.push(P('ATACANTE', 55), P('ATACANTE', 65)); // banco pra cada time
    const out = balanceTeamsOptions(players, 2, {
      candidates: 30,
      lateArrivals: [{ playerId: players[6].id, games: 1 }, { playerId: players[9].id, games: 2 }],
    });
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) {
      const counts = r.teams.map((t) => {
        const all = [...t.slots.map((s) => s.player), t.goalkeeper, ...t.bench].filter((p): p is Player => !!p);
        return all.filter((p) => p.id === players[6].id || p.id === players[9].id).length;
      });
      expect(counts.sort()).toEqual([1, 1]);
    }
  });

  it('zero atrasados marcados = nenhuma exclusão por essa regra (sem regressão no comportamento de hoje)', () => {
    withSeededRandom(42);
    const out = balanceTeamsOptions(pool2(), 2, { candidates: 10 });
    expect(out.length).toBeGreaterThan(0);
    const report = getLastBalanceRunReport();
    expect(report?.lateArrivalInfeasibility).toBeNull();
  });
});
