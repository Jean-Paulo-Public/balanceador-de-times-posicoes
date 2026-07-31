import { describe, it, expect } from 'vitest';
import { parseImportedPlayers } from './importExport';
import type { Player } from '../../domain/types';
import { emptyAttrs } from '../../domain/attributes';
import { deriveAttributesFromStar, deriveGkFromStar } from '../../domain/deriveAttributes';

const basePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'abc-123',
  name: 'Fulano',
  active: true,
  isGoalkeeper: false,
  position: 'MEIA',
  rating: 4,
  attributes: deriveAttributesFromStar(4, 'MEIA'),
  gk: null,
  ...overrides,
});

describe('parseImportedPlayers — round-trip', () => {
  it('preserva attributes/gk/handicapPct ao exportar e reimportar (array puro)', () => {
    const attrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45, FIS: 58 };
    const player = basePlayer({ attributes: attrs, gk: 42, handicapPct: 20 });
    const json = JSON.stringify([player]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.attributes).toEqual(attrs);
    expect(imported.gk).toBe(42);
    expect(imported.handicapPct).toBe(20);
    expect(imported.id).toBe('abc-123');
    expect(imported.name).toBe('Fulano');
  });

  it('aceita o formato { players: [...] }', () => {
    const attrs = emptyAttrs(60);
    const player = basePlayer({ attributes: attrs });
    const json = JSON.stringify({ players: [player] });
    const [imported] = parseImportedPlayers(json);
    expect(imported.attributes).toEqual(attrs);
  });
});

describe('parseImportedPlayers — attributes inválidos/parciais', () => {
  it('attributes parcial (faltando chave) é descartado — deriva da estrela em vez de inventar valor por chave', () => {
    const partial = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45 }; // falta FIS
    const json = JSON.stringify([basePlayer({ attributes: partial as never, rating: 3.5 })]);
    const [imported] = parseImportedPlayers(json);
    // não preserva o parcial (não inventa FIS) — cai no fallback determinístico da estrela.
    expect(imported.attributes).toEqual(deriveAttributesFromStar(3.5, 'MEIA'));
  });

  it('attributes ausente deriva da estrela (fallback determinístico, não um valor arbitrário)', () => {
    const json = JSON.stringify([basePlayer({ attributes: undefined, rating: 2.5 })]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.attributes).toEqual(deriveAttributesFromStar(2.5, 'MEIA'));
  });

  it('attributes com tipo errado (não-objeto) é descartado e deriva da estrela', () => {
    const json = JSON.stringify([{ ...basePlayer(), attributes: 'nope' }]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.attributes).toEqual(deriveAttributesFromStar(4, 'MEIA'));
  });

  it('clampeia valores de attributes fora de 0–100 quando o vetor é válido (9 chaves)', () => {
    const attrs = { FIN: 500, CRI: -30, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45, FIS: 58 };
    const json = JSON.stringify([basePlayer({ attributes: attrs })]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.attributes.FIN).toBe(100);
    expect(imported.attributes.CRI).toBe(0);
  });
});

describe('parseImportedPlayers — gk', () => {
  it('gk null é preservado (não é reinterpretado como ausente)', () => {
    const json = JSON.stringify([basePlayer({ gk: null, isGoalkeeper: true })]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.gk).toBeNull();
  });

  it('gk ausente deriva da estrela (goleiro apto ganha nota; não-goleiro fica null)', () => {
    const jsonGk = JSON.stringify([{ ...basePlayer({ isGoalkeeper: true, rating: 4.5 }), gk: undefined }]);
    const [importedGk] = parseImportedPlayers(jsonGk);
    expect(importedGk.gk).toBe(deriveGkFromStar(4.5, true));

    const jsonNonGk = JSON.stringify([{ ...basePlayer({ isGoalkeeper: false }), gk: undefined }]);
    const [importedNonGk] = parseImportedPlayers(jsonNonGk);
    expect(importedNonGk.gk).toBeNull();
  });

  it('gk fora de 0–100 é clampeado', () => {
    const json = JSON.stringify([basePlayer({ gk: 150 })]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.gk).toBe(100);
  });
});
