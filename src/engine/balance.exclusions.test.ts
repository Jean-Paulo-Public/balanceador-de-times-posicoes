import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import {
  balanceTeamsOptions, getLastBalanceRunReport,
  derivedExclusionPairs, exclusionPairBroken,
} from './balance';

/**
 * PRNG determinístico — mesmo mulberry32 dos outros arquivos de teste, SÓ AQUI,
 * pra tornar `generateTeams`/`localSearch` reproduzíveis.
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
  return { FIN: v, CRI: v, DRI: v, DEF: v, VEL: v, RCD: v, INT: v, MOV: v, FIS: v, OFE: v };
};

let idc = 0;
const P = (position: Position, overall: number, o: Partial<Player> = {}): Player => ({
  id: `p${++idc}`, name: `${position}${idc}`, active: true, isGoalkeeper: false,
  position, attributes: flatAttrs(overall), gk: null,
  acceptedPositions: allEnabled([BOX_TO_BOX]), ...o,
});

// 14 jogadores = 2 times de 7 (2 goleiros + 12 de linha), sem banco — mesmo
// pool de balance.goodMarker.test.ts/balance.veteranDistribution.test.ts.
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
// Fixtures mínimas de DivTeam (estruturais — mesmo padrão dos outros
// arquivos: bastam `gk`/`line`/`bench`, cada RP com o id que interessa).
// -----------------------------------------------------------------------
type FakeRP = { player: Player; attrs: AttrVector; gk: number | null };
const rpWithId = (id: string): FakeRP => ({
  player: {
    id, name: id, active: true, isGoalkeeper: false, position: 'MEIA',
    attributes: flatAttrs(50), gk: null, acceptedPositions: allEnabled([BOX_TO_BOX]),
  },
  attrs: flatAttrs(50),
  gk: null,
});

const filler = (prefix: string, n: number): FakeRP[] => Array(n).fill(0).map((_, i) => rpWithId(`${prefix}${i}`));

describe('exclusionPairBroken — par no mesmo time quebra, separados não', () => {
  it('par no MESMO time (linha) quebra', () => {
    const teams = [
      { id: 1, name: 'Time 1', gk: null, line: [rpWithId('a'), rpWithId('b'), ...filler('x', 4)], bench: [] },
      { id: 2, name: 'Time 2', gk: null, line: filler('y', 6), bench: [] },
    ];
    expect(exclusionPairBroken(teams, [['a', 'b']])).toBe(true);
  });

  it('par em times DIFERENTES não quebra', () => {
    const teams = [
      { id: 1, name: 'Time 1', gk: null, line: [rpWithId('a'), ...filler('x', 5)], bench: [] },
      { id: 2, name: 'Time 2', gk: null, line: [rpWithId('b'), ...filler('y', 5)], bench: [] },
    ];
    expect(exclusionPairBroken(teams, [['a', 'b']])).toBe(false);
  });

  it('lista de pares vazia nunca quebra nada', () => {
    const teams = [
      { id: 1, name: 'Time 1', gk: null, line: [rpWithId('a'), rpWithId('b'), ...filler('x', 4)], bench: [] },
      { id: 2, name: 'Time 2', gk: null, line: filler('y', 6), bench: [] },
    ];
    expect(exclusionPairBroken(teams, [])).toBe(false);
  });

  it('par cujo id não está em NENHUM time (removido/inativo) não quebra', () => {
    const teams = [
      { id: 1, name: 'Time 1', gk: null, line: [rpWithId('a'), ...filler('x', 5)], bench: [] },
      { id: 2, name: 'Time 2', gk: null, line: filler('y', 6), bench: [] },
    ];
    expect(exclusionPairBroken(teams, [['a', 'fantasma']])).toBe(false);
  });

  it('conta o ELENCO COMPLETO (goleiro reservado e banco entram, não só a linha)', () => {
    const t1 = { id: 1, name: 'Time 1', gk: rpWithId('a'), line: filler('x', 6), bench: [rpWithId('b')] };
    const t2 = { id: 2, name: 'Time 2', gk: rpWithId('c'), line: filler('y', 6), bench: [rpWithId('d')] };
    // 'a' é o goleiro RESERVADO do time 1, 'b' está no BANCO do time 1 — mesmo
    // time, tem de quebrar mesmo nenhum dos dois estando na linha.
    expect(exclusionPairBroken([t1, t2], [['a', 'b']])).toBe(true);
    // 'a' (goleiro do time 1) e 'd' (banco do time 2) — times diferentes.
    expect(exclusionPairBroken([t1, t2], [['a', 'd']])).toBe(false);
  });

  it('múltiplos pares: basta UM quebrar pra função devolver true', () => {
    const teams = [
      { id: 1, name: 'Time 1', gk: null, line: [rpWithId('a'), rpWithId('b'), ...filler('x', 4)], bench: [] },
      { id: 2, name: 'Time 2', gk: null, line: [rpWithId('c'), rpWithId('d'), ...filler('y', 4)], bench: [] },
    ];
    // 'a'&'b' juntos (quebra); 'c'&'d' juntos também, mas já bastava o primeiro.
    expect(exclusionPairBroken(teams, [['e', 'f'], ['a', 'b']])).toBe(true);
    // nenhum dos pares de fato colide.
    expect(exclusionPairBroken(teams, [['a', 'c'], ['b', 'd']])).toBe(false);
  });
});

describe('derivedExclusionPairs — deriva o par SIMÉTRICO a partir do cadastro', () => {
  it('cadastrado só de UM lado já vale nos dois sentidos', () => {
    const a = P('DEFENSOR', 50);
    const b = P('MEIA', 50);
    a.excludedTeammateIds = [b.id];
    const pairs = derivedExclusionPairs([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].slice().sort()).toEqual([a.id, b.id].slice().sort());
  });

  it('id apontando pra jogador FORA do elenco ativo (removido/inativo) não conta', () => {
    const a = P('DEFENSOR', 50);
    const bId = 'fantasma-removido';
    a.excludedTeammateIds = [bId];
    expect(derivedExclusionPairs([a])).toEqual([]);
  });

  it('auto-exclusão (id do próprio jogador) é ignorada por defesa extra', () => {
    const a = P('DEFENSOR', 50);
    a.excludedTeammateIds = [a.id];
    expect(derivedExclusionPairs([a])).toEqual([]);
  });

  it('DEDUP: os dois lados cadastrando um do outro gera só UM par', () => {
    const a = P('DEFENSOR', 50);
    const b = P('MEIA', 50);
    a.excludedTeammateIds = [b.id];
    b.excludedTeammateIds = [a.id];
    expect(derivedExclusionPairs([a, b])).toHaveLength(1);
  });

  it('sem excludedTeammateIds cadastrado em ninguém = lista vazia', () => {
    expect(derivedExclusionPairs([P('DEFENSOR', 50), P('MEIA', 50)])).toEqual([]);
  });

  it('vários pares distintos são todos derivados', () => {
    const a = P('DEFENSOR', 50);
    const b = P('MEIA', 50);
    const c = P('ATACANTE', 50);
    a.excludedTeammateIds = [b.id];
    b.excludedTeammateIds = [c.id];
    const pairs = derivedExclusionPairs([a, b, c]);
    expect(pairs).toHaveLength(2);
  });
});

describe('balanceTeamsOptions — exclusão do cadastro integrada ao pipeline real', () => {
  it('com exclusão FACTÍVEL, NENHUM resultado coloca o par junto', () => {
    withSeededRandom(7);
    const players = pool2();
    players[3].excludedTeammateIds = [players[7].id];
    const out = balanceTeamsOptions(players, 2, { candidates: 20 });
    expect(out.length).toBeGreaterThan(0);
    expect(getLastBalanceRunReport()?.exclusionsIgnored).toBe(false);
    for (const res of out) {
      const teamOfId = new Map<string, number>();
      res.teams.forEach((t, i) => {
        const all = [...t.slots.map((s) => s.player), ...(t.goalkeeper ? [t.goalkeeper] : []), ...t.bench];
        all.forEach((p) => teamOfId.set(p.id, i));
      });
      expect(teamOfId.get(players[3].id)).not.toBe(teamOfId.get(players[7].id));
      expect(res.excludedPairsViolations).toEqual([]);
    }
  });

  it('com exclusão IMPOSSÍVEL de cumprir (3 mutuamente excluídos em 2 times), o fallback devolve resultados', () => {
    withSeededRandom(11);
    const players = pool2();
    // Triângulo de exclusão: em 2 times, algum par SEMPRE cai junto (pombos e
    // casas) — não existe divisão que respeite os 3 pares simultaneamente.
    players[3].excludedTeammateIds = [players[7].id, players[11].id];
    players[7].excludedTeammateIds = [players[11].id];
    const out = balanceTeamsOptions(players, 2, { candidates: 20 });
    expect(out.length).toBeGreaterThan(0); // NUNCA fica vazio por causa da exclusão
    expect(getLastBalanceRunReport()?.exclusionsIgnored).toBe(true);
    // Pigeonhole garante que TODO resultado tem pelo menos um par junto.
    for (const res of out) {
      expect(res.excludedPairsViolations.length).toBeGreaterThan(0);
    }
  });

  it('sem NENHUMA exclusão cadastrada, nada muda (sem regressão)', () => {
    withSeededRandom(3);
    const out = balanceTeamsOptions(pool2(), 2, { candidates: 10 });
    expect(out.length).toBeGreaterThan(0);
    const report = getLastBalanceRunReport();
    expect(report?.exclusionsIgnored).toBe(false);
    for (const res of out) {
      expect(res.excludedPairsViolations).toEqual([]);
    }
  });

  it('o FALLBACK da exclusão NÃO afrouxa as outras regras hard (veteranos continuam espalhados 1 e 1)', () => {
    withSeededRandom(5);
    const players = pool2();
    // Força o fallback (triângulo impossível em 2 times).
    players[3].excludedTeammateIds = [players[7].id, players[11].id];
    players[7].excludedTeammateIds = [players[11].id];
    // 2 veteranos, pessoas diferentes das do triângulo — têm de continuar
    // espalhados 1 e 1 mesmo com a exclusão desligada pelo fallback.
    players[4].veteran = true;
    players[9].veteran = true;
    const out = balanceTeamsOptions(players, 2, { candidates: 20 });
    expect(out.length).toBeGreaterThan(0);
    expect(getLastBalanceRunReport()?.exclusionsIgnored).toBe(true);
    for (const res of out) {
      const counts = res.teams.map((t) => {
        const all = [...t.slots.map((s) => s.player), ...(t.goalkeeper ? [t.goalkeeper] : []), ...t.bench];
        return all.filter((p) => p.veteran).length;
      });
      expect(counts.sort()).toEqual([1, 1]);
    }
  });
});
