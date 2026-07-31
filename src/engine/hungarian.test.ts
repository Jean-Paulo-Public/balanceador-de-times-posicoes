import { describe, it, expect } from 'vitest';
import { hungarianSolve, bruteForceAssignment, INFEASIBLE_COST } from './hungarian';

/** PRNG determinístico (mulberry32) — nunca Math.random() em teste. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('hungarianSolve — casos pequenos com ótimo conhecido à mão', () => {
  it('2x2 trivial', () => {
    // Melhor: (0,1)+(1,0) = 1+1 = 2, contra (0,0)+(1,1) = 4+4 = 8.
    const cost = [
      [4, 1],
      [1, 4],
    ];
    const r = hungarianSolve(cost);
    expect(r.totalCost).toBe(2);
    expect(r.feasible).toBe(true);
  });

  it('3x3 com solução ótima única conhecida', () => {
    // Matriz clássica de livro-texto: ótimo = 1+4+2 = 7? calculemos à mão:
    // linhas: pessoa, colunas: tarefa
    const cost = [
      [9, 2, 7],
      [6, 4, 3],
      [5, 8, 1],
    ];
    // Combinações possíveis (6 permutações):
    // 0,1,2 -> 9+4+1=14; 0,2,1 -> 9+3+8=20; 1,0,2 -> 2+6+1=9;
    // 1,2,0 -> 2+3+5=10; 2,0,1 -> 7+6+8=21; 2,1,0 -> 7+4+5=16
    // ótimo = 9 (linha0->col1, linha1->col0, linha2->col2)
    const r = hungarianSolve(cost);
    expect(r.totalCost).toBe(9);
    expect(r.assignment).toEqual([1, 0, 2]);
  });

  it('detecta inviabilidade quando uma célula é proibitiva e não há alternativa', () => {
    const cost = [
      [INFEASIBLE_COST, INFEASIBLE_COST],
      [5, 3],
    ];
    const r = hungarianSolve(cost);
    expect(r.feasible).toBe(false);
  });

  it('encontra solução viável evitando células proibitivas quando existe alternativa', () => {
    const cost = [
      [INFEASIBLE_COST, 2],
      [3, INFEASIBLE_COST],
    ];
    const r = hungarianSolve(cost);
    expect(r.feasible).toBe(true);
    expect(r.totalCost).toBe(5); // (0,1)+(1,0) = 2+3
  });
});

describe('hungarianSolve vs força bruta — instâncias aleatórias-mas-determinísticas', () => {
  const seeds = [1, 42, 1234, 987654, 7];
  for (const seed of seeds) {
    it(`bate com força bruta numa matriz 5x5 (seed ${seed})`, () => {
      const rnd = mulberry32(seed);
      const n = 5;
      const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rnd() * 100)));
      const h = hungarianSolve(cost);
      const b = bruteForceAssignment(cost);
      expect(h.totalCost).toBe(b.totalCost);
    });

    it(`bate com força bruta numa matriz 6x6 (seed ${seed})`, () => {
      const rnd = mulberry32(seed * 31 + 1);
      const n = 6;
      const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rnd() * 100)));
      const h = hungarianSolve(cost);
      const b = bruteForceAssignment(cost);
      expect(h.totalCost).toBe(b.totalCost);
    });
  }

  it('bate com força bruta numa matriz 6x6 com custos proibitivos misturados (seed fixa)', () => {
    const rnd = mulberry32(2026);
    const n = 6;
    const cost = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => (rnd() < 0.2 ? INFEASIBLE_COST : Math.floor(rnd() * 100))));
    const h = hungarianSolve(cost);
    const b = bruteForceAssignment(cost);
    expect(h.totalCost).toBe(b.totalCost);
    expect(h.feasible).toBe(b.feasible);
  });
});

describe('hungarianSolve — matriz vazia', () => {
  it('devolve resultado vazio sem erro', () => {
    const r = hungarianSolve([]);
    expect(r.assignment).toEqual([]);
    expect(r.totalCost).toBe(0);
    expect(r.feasible).toBe(true);
  });

  it('lança erro se a matriz não for quadrada', () => {
    expect(() => hungarianSolve([[1, 2, 3], [4, 5, 6]])).toThrow();
  });
});
