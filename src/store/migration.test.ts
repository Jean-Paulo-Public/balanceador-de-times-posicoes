import { describe, it, expect } from 'vitest';
import { normalizePlayer, normalizePlayers } from './migration';

describe('normalizePlayer — shape atual', () => {
  it('preserva campos válidos e as flags', () => {
    const p = normalizePlayer({
      id: 'x', name: 'Fulano', active: false, isCaptain: true, isGoalkeeper: true,
      position: 'ATACANTE', rating: 4.5, pivotFriendly: true, recompoePouco: true,
    });
    expect(p).toEqual({
      id: 'x', name: 'Fulano', active: false, isCaptain: true, isGoalkeeper: true,
      position: 'ATACANTE', rating: 4.5, pivotFriendly: true, recompoePouco: true,
    });
  });

  it('aplica defaults quando faltam campos (flags falsas, rating padrão, meia)', () => {
    const p = normalizePlayer({ name: 'Sem Nada' });
    expect(p.active).toBe(true);
    expect(p.isCaptain).toBe(false);
    expect(p.isGoalkeeper).toBe(false);
    expect(p.position).toBe('MEIA');
    expect(p.rating).toBe(3);
    expect(p.pivotFriendly).toBe(false);
    expect(p.recompoePouco).toBe(false);
    expect(typeof p.id).toBe('string');
  });

  it('prende o rating na escala 0–5 em passos de 0,5', () => {
    expect(normalizePlayer({ rating: 9 }).rating).toBe(5);
    expect(normalizePlayer({ rating: -2 }).rating).toBe(0);
    expect(normalizePlayer({ rating: 3.3 }).rating).toBe(3.5);
    expect(normalizePlayer({ rating: 3.2 }).rating).toBe(3);
  });

  it('posição inválida vira MEIA', () => {
    expect(normalizePlayer({ position: 'ZAGUEIRO' as unknown as string }).position).toBe('MEIA');
  });

  it('normalizePlayers converte a lista e ignora entrada não-array', () => {
    expect(normalizePlayers([{ name: 'A', rating: 5 }, { name: 'B' }])).toHaveLength(2);
    expect(normalizePlayers(null)).toEqual([]);
  });
});
