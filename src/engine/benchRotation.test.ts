import { describe, it, expect } from 'vitest';
import type { Player } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import { chooseBenchGroup, HARD_NO_REPEAT_MAX_BENCH_SIZE } from './benchRotation';

/** Vetor UNIFORME (0–100): fixture direta de atributos, sem estrela nem derivação. */
const flatAttrs = (overall: number): AttrVector => {
  const v = clampAttr(overall);
  return { FIN: v, CRI: v, DRI: v, DEF: v, VEL: v, RCD: v, INT: v, MOV: v, FIS: v };
};

let idc = 0;
const P = (name: string, position: Player['position'], overall: number, o: Partial<Player> = {}): Player => ({
  id: `${name}-${++idc}`, name, active: true, isGoalkeeper: false, position,
  attributes: flatAttrs(overall), gk: null, acceptedPositions: allEnabled([BOX_TO_BOX]), ...o,
});

const counts = (players: Player[], value = 0): Map<string, number> =>
  new Map(players.map((p) => [p.id, value]));

describe('chooseBenchGroup — regra (a) HARD (banco pequeno, <= limiar)', () => {
  it('limiar é uma constante nomeada (2)', () => {
    expect(HARD_NO_REPEAT_MAX_BENCH_SIZE).toBe(2);
  });

  it('banco de 1: quem sentou na rodada anterior não pode sentar de novo', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id]);
    const { benched, warning } = chooseBenchGroup({
      outfielders: players,
      benchCount: 1,
      benchCounts: counts(players),
      benchedLastRound,
    });
    expect(warning).toBeNull();
    expect(benched.map((p) => p.id)).not.toContain(players[0].id);
  });

  it('banco de 2 (== limiar): regra hard também vale — ninguém do banco anterior repete', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id, players[1].id]);
    const { benched, warning } = chooseBenchGroup({
      outfielders: players,
      benchCount: 2,
      benchCounts: counts(players),
      benchedLastRound,
    });
    expect(warning).toBeNull();
    expect(benched.map((p) => p.id).sort()).toEqual([players[2].id, players[3].id].sort());
  });

  it('banco pequeno impossível de cumprir a regra hard: avisa nomeando quem travou (não falha em silêncio)', () => {
    // banco de 2, mas só 1 elegível a sentar (3 sentaram na rodada anterior, banco só cabe 2 —
    // cenário artificial pra forçar eligible.length < benchCount).
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id, players[1].id]);
    const { benched, warning } = chooseBenchGroup({
      outfielders: players,
      benchCount: 2,
      benchCounts: counts(players),
      benchedLastRound,
    });
    expect(warning).not.toBeNull();
    expect(warning).toContain(players[0].name);
    expect(warning).toContain(players[1].name);
    expect(benched).toHaveLength(2); // cede o mínimo necessário, mas não trava a escalação
  });
});

describe('chooseBenchGroup — regra (a) RELAXADA (banco grande, > limiar)', () => {
  it('banco de 3 (limiar + 1): repetir banco em rodadas seguidas é PERMITIDO', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60), P('E', 'MEIA', 60), P('F', 'MEIA', 60)];
    // A, B e C sentaram na rodada anterior E têm a MENOR contagem acumulada —
    // com banco grande, é permitido que sentem de novo.
    const benchCounts = counts(players);
    benchCounts.set(players[0].id, 0);
    benchCounts.set(players[1].id, 0);
    benchCounts.set(players[2].id, 0);
    benchCounts.set(players[3].id, 3);
    benchCounts.set(players[4].id, 3);
    benchCounts.set(players[5].id, 3);
    const benchedLastRound = new Set([players[0].id, players[1].id, players[2].id]);
    const { benched, warning } = chooseBenchGroup({
      outfielders: players,
      benchCount: 3,
      benchCounts,
      benchedLastRound,
    });
    expect(warning).toBeNull();
    // (b) continua valendo: quem tem MENOS banco acumulado senta de novo — mesmo repetindo.
    expect(benched.map((p) => p.id).sort()).toEqual([players[0].id, players[1].id, players[2].id].sort());
  });

  it('banco grande nunca dispara aviso de inviabilidade da regra (a) — ela nem se aplica', () => {
    const players = Array.from({ length: 9 }, (_, i) => P(`P${i}`, 'MEIA', 60));
    const benchedLastRound = new Set(players.slice(0, 3).map((p) => p.id));
    const { warning } = chooseBenchGroup({
      outfielders: players,
      benchCount: 3,
      benchCounts: counts(players),
      benchedLastRound,
    });
    expect(warning).toBeNull();
  });
});

describe('chooseBenchGroup — regra (b) contagem acumulada equilibrada', () => {
  it('sempre escolhe quem tem MENOS idas ao banco até ali, mesmo com (a) relaxada', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60), P('E', 'MEIA', 60), P('F', 'MEIA', 60)];
    const benchCounts = counts(players);
    benchCounts.set(players[0].id, 4); // já sentou muito — não deve sentar de novo
    benchCounts.set(players[1].id, 0); // nunca sentou — prioridade
    benchCounts.set(players[2].id, 1);
    benchCounts.set(players[3].id, 2);
    benchCounts.set(players[4].id, 3);
    benchCounts.set(players[5].id, 3);
    const { benched } = chooseBenchGroup({
      outfielders: players,
      benchCount: 3, // banco grande (> limiar) — regra (a) relaxada
      benchCounts,
      benchedLastRound: new Set(),
    });
    // Os 3 com MENOR contagem acumulada (B=0, C=1, D=2) devem ser os escalados pro banco.
    expect(benched.map((p) => p.id).sort()).toEqual([players[1].id, players[2].id, players[3].id].sort());
  });

  it('ao longo de várias rodadas simuladas, a contagem de banco fica equilibrada entre os elegíveis (banco grande)', () => {
    const players = Array.from({ length: 9 }, (_, i) => P(`P${i}`, 'MEIA', 60));
    const benchCounts = counts(players);
    let benchedLastRound = new Set<string>();
    const rounds = 12;
    for (let r = 0; r < rounds; r++) {
      const { benched } = chooseBenchGroup({
        outfielders: players,
        benchCount: 3, // banco grande — regra (a) relaxada, (b) segue valendo
        benchCounts,
        benchedLastRound,
      });
      for (const p of benched) benchCounts.set(p.id, (benchCounts.get(p.id) ?? 0) + 1);
      benchedLastRound = new Set(benched.map((p) => p.id));
    }
    const values = [...benchCounts.values()];
    // 12 rodadas x 3 vagas de banco / 9 jogadores = 4 idas ao banco em média cada.
    // (b) deve manter isso bem distribuído — sem ninguém muito destoante.
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });
});

describe('chooseBenchGroup — regra (c) desempate por menor impacto', () => {
  const flatAttrs = { FIN: 50, CRI: 50, DRI: 50, DEF: 50, VEL: 50, RCD: 50, INT: 50, MOV: 50, FIS: 50 };

  it('entre 2 empatados em (b), prefere bancar o intercambiável — não o especialista difícil de repor', () => {
    // fixoForte (perfil DEF/FIS puxado, especialista) e generico (perfil neutro,
    // fácil de substituir por qualquer um dos outros 4 "genéricos" da linha)
    // empatam em contagem acumulada (0) e disputam a ÚLTIMA vaga de banco.
    // O time SEM o especialista perde muito mais fit do que o time sem o
    // genérico (que tem substitutos igualmente bons na própria linha).
    const fixoForte = P('FixoForte', 'DEFENSOR', 100, {
      attributes: { FIN: 0, CRI: 5, DRI: 5, DEF: 95, VEL: 10, RCD: 90, INT: 10, MOV: 10, FIS: 95 },
    });
    const generico = P('Generico', 'MEIA', 60, { attributes: flatAttrs });
    // 5 outros de linha (não 4): com banco de 1, o campo tem 6 vagas — roster
    // total de outfielders precisa ser 6 (campo) + 1 (banco) = 7.
    const outrosNaLinha = Array.from({ length: 5 }, (_, i) => P(`X${i}`, 'MEIA', 60, { attributes: flatAttrs }));
    const outfielders = [fixoForte, generico, ...outrosNaLinha];
    const benchCounts = counts(outfielders); // todos em 0 — mas só fixoForte/generico ficam no grupo empatado na fronteira
    const { benched, warning } = chooseBenchGroup({
      outfielders,
      benchCount: 1,
      benchCounts,
      benchedLastRound: new Set(outrosNaLinha.map((p) => p.id)), // os 4 "genéricos extra" sentaram na rodada anterior — jogam agora (regra a)
    });
    expect(warning).toBeNull();
    expect(benched.map((p) => p.id)).toEqual([generico.id]);
  });
});
