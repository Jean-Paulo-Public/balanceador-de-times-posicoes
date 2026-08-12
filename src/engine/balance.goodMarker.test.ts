import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import {
  balanceTeamsOptions, getLastBalanceRunReport,
  goodMarkerDistributionBroken, goodMarkerInfeasibilityMessage,
  markerVeteranStackingBroken, markerVeteranStackingMessage,
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
// Fixtures mínimas de DivTeam (estruturais — mesmo padrão do arquivo de
// veteranos: bastam `gk`/`line`/`bench`, cada RP com as flags do player).
// -----------------------------------------------------------------------
type FakeRP = { player: Player; attrs: AttrVector; gk: number | null };
const rp = (flags: Pick<Player, 'veteran' | 'goodMarker'>, pivotOnly = false): FakeRP => ({
  player: {
    id: `f${++idc}`, name: 'X', active: true, isGoalkeeper: false, position: 'MEIA',
    attributes: flatAttrs(50), gk: null,
    acceptedPositions: allEnabled(pivotOnly ? ['PIVO'] : [BOX_TO_BOX]),
    ...flags,
  },
  attrs: flatAttrs(50),
  gk: null,
});

/**
 * Time fake declarado pelos NÚMEROS que as regras leem: quantos marcadores,
 * quantos veteranos (comuns), quantos veteranos pivô-only e quantos "neutros".
 * Marcador e veterano são flags independentes aqui (ninguém é os dois) — é o
 * caso que interessa pra regra de não-acúmulo.
 */
const team = (
  id: number,
  { markers = 0, veterans = 0, pivotVeterans = 0, plain = 6 }:
  { markers?: number; veterans?: number; pivotVeterans?: number; plain?: number },
) => ({
  id, name: `Time ${id}`, gk: null,
  line: [
    ...Array(markers).fill(0).map(() => rp({ goodMarker: true })),
    ...Array(veterans).fill(0).map(() => rp({ veteran: true })),
    ...Array(pivotVeterans).fill(0).map(() => rp({ veteran: true }, true)),
    ...Array(plain).fill(0).map(() => rp({})),
  ],
  bench: [],
});

describe('goodMarkerDistributionBroken — mesma formalização floor/ceil do veterano', () => {
  it('M=2, T=2 → 1 e 1 (nunca 2 e 0)', () => {
    expect(goodMarkerDistributionBroken([team(1, { markers: 1 }), team(2, { markers: 1 })])).toBe(false);
    expect(goodMarkerDistributionBroken([team(1, { markers: 2 }), team(2, { markers: 0 })])).toBe(true);
  });

  it('M=3, T=2 → 2 e 1 (cada time com no mínimo 1)', () => {
    expect(goodMarkerDistributionBroken([team(1, { markers: 2 }), team(2, { markers: 1 })])).toBe(false);
    expect(goodMarkerDistributionBroken([team(1, { markers: 1 }), team(2, { markers: 2 })])).toBe(false);
    expect(goodMarkerDistributionBroken([team(1, { markers: 3 }), team(2, { markers: 0 })])).toBe(true);
  });

  it('M=5, T=2 → 3 e 2', () => {
    expect(goodMarkerDistributionBroken([team(1, { markers: 3 }), team(2, { markers: 2 })])).toBe(false);
    expect(goodMarkerDistributionBroken([team(1, { markers: 4 }), team(2, { markers: 1 })])).toBe(true);
  });

  it('T=3 (M=4 → 2/1/1, nunca 2/2/0)', () => {
    expect(goodMarkerDistributionBroken([
      team(1, { markers: 2 }), team(2, { markers: 1 }), team(3, { markers: 1 }),
    ])).toBe(false);
    // M=4 em 3 times: lo=1, hi=2 — qualquer time com 0 (abaixo do piso) ou com
    // 3+ (acima do teto) quebra.
    expect(goodMarkerDistributionBroken([
      team(1, { markers: 2 }), team(2, { markers: 2 }), team(3, { markers: 0 }),
    ])).toBe(true);
    expect(goodMarkerDistributionBroken([
      team(1, { markers: 3 }), team(2, { markers: 1 }), team(3, { markers: 0 }),
    ])).toBe(true);
  });

  it('zero marcadores = sem restrição nenhuma (sem regressão no comportamento de hoje)', () => {
    expect(goodMarkerDistributionBroken([team(1, {}), team(2, {})])).toBe(false);
    expect(goodMarkerDistributionBroken([team(1, {}), team(2, {}), team(3, {})])).toBe(false);
  });

  it('NÃO tem a exceção do pivô-only do veterano: marcador conta sempre', () => {
    // Um marcador cadastrado só como pivô continua contando (a exceção do
    // veterano é sobre carga física, não se aplica a marcação).
    const withPivotMarker = [
      { id: 1, name: 'Time 1', gk: null, line: [rp({ goodMarker: true }, true), rp({ goodMarker: true }), ...Array(4).fill(0).map(() => rp({}))], bench: [] },
      { id: 2, name: 'Time 2', gk: null, line: Array(6).fill(0).map(() => rp({})), bench: [] },
    ];
    expect(goodMarkerDistributionBroken(withPivotMarker)).toBe(true); // 2 e 0 — quebra
  });

  it('conta o ELENCO COMPLETO (goleiro reservado e banco entram na conta, não só a linha)', () => {
    const t1 = { id: 1, name: 'Time 1', gk: rp({ goodMarker: true }), line: Array(6).fill(0).map(() => rp({})), bench: [rp({ goodMarker: true })] };
    const t2 = { id: 2, name: 'Time 2', gk: rp({}), line: Array(6).fill(0).map(() => rp({})), bench: [rp({})] };
    expect(goodMarkerDistributionBroken([t1, t2])).toBe(true); // 2 e 0
  });
});

describe('markerVeteranStackingBroken — o time com marcador a MENOS não leva veterano a MAIS', () => {
  it('M=3/V=3 em 2 times: o time com 1 marcador precisa ficar com 1 veterano', () => {
    // OK: 2 marcadores + 2 veteranos juntos; 1 marcador + 1 veterano no outro.
    expect(markerVeteranStackingBroken([
      team(1, { markers: 2, veterans: 2 }), team(2, { markers: 1, veterans: 1 }),
    ])).toBe(false);
    // VIOLA: o time com 1 marcador (a menos) leva 2 veteranos (a mais).
    expect(markerVeteranStackingBroken([
      team(1, { markers: 2, veterans: 1 }), team(2, { markers: 1, veterans: 2 }),
    ])).toBe(true);
  });

  it('marcadores divididos exato = regra não restringe nada (ninguém está "a menos")', () => {
    expect(markerVeteranStackingBroken([
      team(1, { markers: 2, veterans: 2 }), team(2, { markers: 2, veterans: 1 }),
    ])).toBe(false);
  });

  it('veteranos divididos exato = regra não restringe nada (ninguém está "a mais")', () => {
    expect(markerVeteranStackingBroken([
      team(1, { markers: 2, veterans: 2 }), team(2, { markers: 1, veterans: 2 }),
    ])).toBe(false);
  });

  it('nenhum marcador ou nenhum veterano = sem restrição', () => {
    expect(markerVeteranStackingBroken([team(1, { veterans: 2 }), team(2, { veterans: 1 })])).toBe(false);
    expect(markerVeteranStackingBroken([team(1, { markers: 2 }), team(2, { markers: 1 })])).toBe(false);
  });

  it('conta veterano PIVÔ-ONLY (pedido literal do dono: "incluindo os pivôs")', () => {
    // Time 2 tem 1 marcador (a menos) e 2 veteranos brutos — sendo 1 pivô-only.
    // A exceção do pivô vale só pra distribuição de veteranos; aqui não.
    expect(markerVeteranStackingBroken([
      team(1, { markers: 2, veterans: 1 }), team(2, { markers: 1, veterans: 1, pivotVeterans: 1 }),
    ])).toBe(true);
    // Mesmo elenco com o pivô do outro lado: nada empilhado.
    expect(markerVeteranStackingBroken([
      team(1, { markers: 2, veterans: 1, pivotVeterans: 1 }), team(2, { markers: 1, veterans: 1 }),
    ])).toBe(false);
  });

  it('T=3: basta UM time acumular os dois ônus pra violar', () => {
    // M=4 (2/1/1), V=4 (1/1/2) — o time 3 tem marcador a menos E veterano a mais.
    expect(markerVeteranStackingBroken([
      team(1, { markers: 2, veterans: 1 }), team(2, { markers: 1, veterans: 1 }), team(3, { markers: 1, veterans: 2 }),
    ])).toBe(true);
    // Mesmos totais, veterano extra no time que já tem marcador a mais: OK.
    expect(markerVeteranStackingBroken([
      team(1, { markers: 2, veterans: 2 }), team(2, { markers: 1, veterans: 1 }), team(3, { markers: 1, veterans: 1 }),
    ])).toBe(false);
  });
});

describe('mensagens de bloqueio', () => {
  it('goodMarkerInfeasibilityMessage cita os números reais e o escape', () => {
    const msg = goodMarkerInfeasibilityMessage(2, 2);
    expect(msg).toContain('2 jogador(es) que marca(m) bem');
    expect(msg).toContain('2 times');
    expect(msg).toContain('exatamente 1 por time');
    expect(msg).toContain('Desconsiderar quem marca bem');
  });

  it('goodMarkerInfeasibilityMessage usa faixa quando a divisão não fecha exata', () => {
    expect(goodMarkerInfeasibilityMessage(3, 2)).toContain('entre 1 e 2 por time');
  });

  it('markerVeteranStackingMessage cita os dois totais e deixa claro que inclui pivôs', () => {
    const msg = markerVeteranStackingMessage(3, 3, 2);
    expect(msg).toContain('3 jogador(es) que marca(m) bem');
    expect(msg).toContain('3 veterano(s) (contando os pivôs)');
    expect(msg).toContain('Desconsiderar quem marca bem');
    expect(msg).toContain('Desconsiderar veteranos');
  });
});

describe('balanceTeamsOptions — regras de marcador integradas ao pipeline real', () => {
  it('espalha os marcadores entre os times (nunca todos no mesmo)', () => {
    withSeededRandom(7);
    const players = pool2();
    players[3].goodMarker = true;
    players[7].goodMarker = true;
    players[11].goodMarker = true;
    const out = balanceTeamsOptions(players, 2, { candidates: 20 });
    expect(out.length).toBeGreaterThan(0);
    for (const res of out) {
      const counts = res.teams.map((t) => {
        const all = [...t.slots.map((s) => s.player), ...(t.goalkeeper ? [t.goalkeeper] : []), ...t.bench];
        return all.filter((p) => p.goodMarker).length;
      });
      expect(counts.sort()).toEqual([1, 2]); // 3 em 2 times: nunca 3 e 0
    }
  });

  it('nunca acumula "marcador a menos" e "veterano a mais" no mesmo time', () => {
    withSeededRandom(11);
    const players = pool2();
    // 3 marcadores e 3 veteranos, pessoas diferentes.
    players[2].goodMarker = true;
    players[6].goodMarker = true;
    players[11].goodMarker = true;
    players[3].veteran = true;
    players[7].veteran = true;
    players[12].veteran = true;
    const out = balanceTeamsOptions(players, 2, { candidates: 20 });
    expect(out.length).toBeGreaterThan(0);
    for (const res of out) {
      const per = res.teams.map((t) => {
        const all = [...t.slots.map((s) => s.player), ...(t.goalkeeper ? [t.goalkeeper] : []), ...t.bench];
        return { markers: all.filter((p) => p.goodMarker).length, vets: all.filter((p) => p.veteran).length };
      });
      const maxMarkers = Math.max(...per.map((x) => x.markers));
      const minVets = Math.min(...per.map((x) => x.vets));
      expect(per.some((x) => x.markers < maxMarkers && x.vets > minVets)).toBe(false);
    }
  });

  it('"Desconsiderar quem marca bem" desliga a distribuição E o não-acúmulo', () => {
    withSeededRandom(9);
    const players = pool2();
    players[11].goodMarker = true;
    players[12].goodMarker = true;
    const blocked = balanceTeamsOptions(players, 2, { candidates: 1, ignoreGoodMarkerDistribution: false });
    expect(blocked).toHaveLength(0);
    expect(getLastBalanceRunReport()?.goodMarkerInfeasibility?.message)
      .toContain('2 jogador(es) que marca(m) bem para 2 times');

    withSeededRandom(9);
    const players2 = pool2();
    players2[11].goodMarker = true;
    players2[12].goodMarker = true;
    const freed = balanceTeamsOptions(players2, 2, { candidates: 1, ignoreGoodMarkerDistribution: true });
    expect(freed.length).toBeGreaterThan(0);
    expect(getLastBalanceRunReport()?.goodMarkerInfeasibility).toBeNull();
    expect(getLastBalanceRunReport()?.markerVeteranStackingInfeasibility).toBeNull();
  });

  it('"Desconsiderar veteranos" derruba o não-acúmulo mas MANTÉM a distribuição de marcadores', () => {
    withSeededRandom(11);
    const players = pool2();
    players[2].goodMarker = true;
    players[6].goodMarker = true;
    players[11].goodMarker = true;
    players[3].veteran = true;
    players[7].veteran = true;
    players[12].veteran = true;
    const out = balanceTeamsOptions(players, 2, { candidates: 20, ignoreVeteranDistribution: true });
    expect(out.length).toBeGreaterThan(0);
    for (const res of out) {
      const counts = res.teams.map((t) => {
        const all = [...t.slots.map((s) => s.player), ...(t.goalkeeper ? [t.goalkeeper] : []), ...t.bench];
        return all.filter((p) => p.goodMarker).length;
      });
      expect(counts.sort()).toEqual([1, 2]); // distribuição de marcadores continua valendo
    }
  });

  it('zero marcadores marcados = nenhuma exclusão por essas regras (sem regressão)', () => {
    withSeededRandom(3);
    const out = balanceTeamsOptions(pool2(), 2, { candidates: 10 });
    expect(out.length).toBeGreaterThan(0);
    const report = getLastBalanceRunReport();
    expect(report?.goodMarkerInfeasibility).toBeNull();
    expect(report?.markerVeteranStackingInfeasibility).toBeNull();
  });
});
