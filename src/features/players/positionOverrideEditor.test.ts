import { describe, it, expect } from 'vitest';
import { emptyAttrs } from '../../domain/attributes';
import {
  setPositionOverrideAttr, removePositionOverrideAttr, clearPositionOverrides, overriddenPositionsOf,
} from './positionOverrideEditor';
import { ALL_LINE_POSITIONS } from '../../domain/positions';

const base = emptyAttrs(50); // FIN=CRI=...=50

describe('setPositionOverrideAttr', () => {
  it('cria uma sobrescrita quando o valor difere da base', () => {
    const result = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    expect(result).toEqual({ PIVO: { FIN: 80 } });
  });

  it('não persiste sobrescrita igual à base (nem cria entrada)', () => {
    const result = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 50, base);
    expect(result).toBeUndefined();
  });

  it('remove a sobrescrita se o valor for setado de volta igual à base', () => {
    const withOverride = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    const reverted = setPositionOverrideAttr(withOverride, 'PIVO', 'FIN', 50, base);
    expect(reverted).toBeUndefined();
  });

  it('remove só a posição/atributo afetado, preservando outras sobrescritas', () => {
    let overrides = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    overrides = setPositionOverrideAttr(overrides, 'PIVO', 'FIS', 70, base);
    overrides = setPositionOverrideAttr(overrides, 'ALA', 'VEL', 90, base);
    expect(overrides).toEqual({ PIVO: { FIN: 80, FIS: 70 }, ALA: { VEL: 90 } });

    const revertedFin = setPositionOverrideAttr(overrides, 'PIVO', 'FIN', 50, base);
    expect(revertedFin).toEqual({ PIVO: { FIS: 70 }, ALA: { VEL: 90 } });
  });

  it('clampeia o valor 0–100', () => {
    const result = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 150, base);
    expect(result).toEqual({ PIVO: { FIN: 100 } });
  });
});

describe('removePositionOverrideAttr', () => {
  it('remove um atributo sobrescrito e limpa a posição se ficar vazia', () => {
    const overrides = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    expect(removePositionOverrideAttr(overrides, 'PIVO', 'FIN')).toBeUndefined();
  });

  it('mantém a posição se ainda restar outro atributo sobrescrito', () => {
    let overrides = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    overrides = setPositionOverrideAttr(overrides, 'PIVO', 'FIS', 70, base);
    expect(removePositionOverrideAttr(overrides, 'PIVO', 'FIN')).toEqual({ PIVO: { FIS: 70 } });
  });

  it('é no-op se a posição ou o atributo não tinha sobrescrita', () => {
    const overrides = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    expect(removePositionOverrideAttr(overrides, 'ALA', 'FIN')).toBe(overrides);
    expect(removePositionOverrideAttr(overrides, 'PIVO', 'FIS')).toBe(overrides);
    expect(removePositionOverrideAttr(undefined, 'PIVO', 'FIN')).toBeUndefined();
  });
});

describe('clearPositionOverrides', () => {
  it('remove todas as sobrescritas de uma posição', () => {
    let overrides = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    overrides = setPositionOverrideAttr(overrides, 'PIVO', 'FIS', 70, base);
    overrides = setPositionOverrideAttr(overrides, 'ALA', 'VEL', 90, base);
    expect(clearPositionOverrides(overrides, 'PIVO')).toEqual({ ALA: { VEL: 90 } });
  });

  it('devolve undefined se a posição removida era a única', () => {
    const overrides = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    expect(clearPositionOverrides(overrides, 'PIVO')).toBeUndefined();
  });

  it('é no-op se a posição não tinha sobrescrita', () => {
    const overrides = setPositionOverrideAttr(undefined, 'PIVO', 'FIN', 80, base);
    expect(clearPositionOverrides(overrides, 'ALA')).toBe(overrides);
  });
});

describe('overriddenPositionsOf', () => {
  it('lista vazia quando não há sobrescritas', () => {
    expect(overriddenPositionsOf(undefined, ALL_LINE_POSITIONS)).toEqual([]);
  });

  it('lista as posições com sobrescrita, na ordem do catálogo', () => {
    let overrides = setPositionOverrideAttr(undefined, 'ALA', 'VEL', 90, base);
    overrides = setPositionOverrideAttr(overrides, 'PIVO', 'FIN', 80, base);
    // PIVO vem antes de ALA em ALL_LINE_POSITIONS, mesmo tendo sido inserido depois.
    expect(overriddenPositionsOf(overrides, ALL_LINE_POSITIONS)).toEqual(['PIVO', 'ALA']);
  });
});
