import { describe, expect, it } from 'vitest';
import { teamDisplayLabel } from './teamLabel';

describe('teamDisplayLabel', () => {
  it('mapeia os times 1-3 para os rótulos coloridos pedidos pelo dono', () => {
    expect(teamDisplayLabel({ id: 1, name: 'Time 1' })).toBe('Time Azul');
    expect(teamDisplayLabel({ id: 2, name: 'Time 2' })).toBe('Time Amarelo');
    expect(teamDisplayLabel({ id: 3, name: 'Time 3' })).toBe('Time Vermelho');
  });

  it('cai de volta pro nome interno quando o id não tem cor mapeada (Time 4 e além)', () => {
    expect(teamDisplayLabel({ id: 4, name: 'Time 4' })).toBe('Time 4');
    expect(teamDisplayLabel({ id: 5, name: 'Time 5' })).toBe('Time 5');
  });
});
