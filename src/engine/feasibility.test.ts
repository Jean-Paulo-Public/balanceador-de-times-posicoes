import { describe, it, expect } from 'vitest';
import type { Player } from '../domain/types';
import { deriveAttributesFromStar } from '../domain/deriveAttributes';
import { allEnabled, type PositionPreference } from '../domain/positions';
import { checkPositionFeasibility } from './feasibility';

let idc = 0;
const P = (name: string, positions: PositionPreference[]): Player => ({
  id: `p${++idc}`, name, active: true, isGoalkeeper: false, position: 'MEIA', rating: 3,
  attributes: deriveAttributesFromStar(3, 'MEIA'), gk: null, acceptedPositions: allEnabled(positions),
});

describe('checkPositionFeasibility (Fase 5)', () => {
  it('factível quando ninguém está "preso" a uma única posição além da capacidade', () => {
    const players = [P('A', ['BOX_TO_BOX']), P('B', ['BOX_TO_BOX']), P('C', ['PIVO'])];
    const r = checkPositionFeasibility(players, 2);
    expect(r.feasible).toBe(true);
    expect(r.message).toBeNull();
  });

  it('infactível: 3 jogadores só jogam de PIVO e há 2 times (nomeando os jogadores)', () => {
    const players = [P('Guto', ['PIVO']), P('Tayrone', ['PIVO']), P('Fulano', ['PIVO'])];
    const r = checkPositionFeasibility(players, 2);
    expect(r.feasible).toBe(false);
    expect(r.message).toContain('Guto');
    expect(r.message).toContain('Tayrone');
    expect(r.message).toContain('Fulano');
    expect(r.message).toContain('pivô');
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].position).toBe('PIVO');
    expect(r.violations[0].count).toBe(3);
  });

  it('exatamente 1 pivô-exclusivo por time é OK (não excede)', () => {
    const players = [P('Guto', ['PIVO']), P('Tayrone', ['PIVO'])];
    const r = checkPositionFeasibility(players, 2);
    expect(r.feasible).toBe(true);
  });

  it('generaliza pra outras posições (FIXO tem só 1 vaga por time em todo sistema)', () => {
    const players = [P('X', ['FIXO']), P('Y', ['FIXO']), P('Z', ['FIXO'])];
    const r = checkPositionFeasibility(players, 2);
    expect(r.feasible).toBe(false);
    expect(r.violations.some((v) => v.position === 'FIXO')).toBe(true);
  });

  it('jogador com posição secundária (não-singleton) não conta como "só joga de X"', () => {
    const players = [P('A', ['PIVO', 'LATERAL']), P('B', ['PIVO']), P('C', ['PIVO'])];
    const r = checkPositionFeasibility(players, 2);
    // só B e C são "só pivô" (2), dentro da capacidade de 2 times.
    expect(r.feasible).toBe(true);
  });
});
