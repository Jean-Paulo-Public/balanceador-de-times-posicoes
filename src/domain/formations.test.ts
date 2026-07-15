import { describe, it, expect } from 'vitest';
import { chooseFormation } from './formations';

describe('chooseFormation', () => {
  it('2+ defensores e 2+ atacantes -> 2-2-2 (OFENSIVA)', () => {
    expect(chooseFormation(2, 2)).toBe('OFENSIVA');
    expect(chooseFormation(3, 2)).toBe('OFENSIVA');
  });

  it('2+ defensores e menos de 2 atacantes -> 2-3-1 (DEFENSIVA)', () => {
    expect(chooseFormation(2, 1)).toBe('DEFENSIVA');
    expect(chooseFormation(2, 0)).toBe('DEFENSIVA');
    expect(chooseFormation(4, 1)).toBe('DEFENSIVA');
  });

  it('menos de 2 defensores -> 1-4-1 (EQUILIBRADA), inclusive com 2+ atacantes', () => {
    expect(chooseFormation(1, 1)).toBe('EQUILIBRADA');
    expect(chooseFormation(0, 0)).toBe('EQUILIBRADA');
    expect(chooseFormation(1, 3)).toBe('EQUILIBRADA'); // o buraco: 1 zagueiro + 3 atacantes
    expect(chooseFormation(0, 5)).toBe('EQUILIBRADA');
  });
});
