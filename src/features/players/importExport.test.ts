import { describe, it, expect } from 'vitest';
import { parseImportedPlayers } from './importExport';
import type { Player } from '../../domain/types';
import { emptyAttrs } from '../../domain/attributes';

const VALID_ATTRS = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45, FIS: 58 };

const basePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'abc-123',
  name: 'Fulano',
  active: true,
  isGoalkeeper: false,
  position: 'MEIA',
  attributes: VALID_ATTRS,
  gk: null,
  acceptedPositions: [{ position: 'BOX_TO_BOX', enabled: true }],
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

  it('clampeia valores de attributes fora de 0–100 quando o vetor é válido (9 chaves)', () => {
    const attrs = { FIN: 500, CRI: -30, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45, FIS: 58 };
    const json = JSON.stringify([basePlayer({ attributes: attrs })]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.attributes.FIN).toBe(100);
    expect(imported.attributes.CRI).toBe(0);
  });

  it('gk null é preservado (não é reinterpretado como ausente)', () => {
    const json = JSON.stringify([basePlayer({ gk: null, isGoalkeeper: true })]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.gk).toBeNull();
  });

  it('gk fora de 0–100 é clampeado', () => {
    const json = JSON.stringify([basePlayer({ gk: 150 })]);
    const [imported] = parseImportedPlayers(json);
    expect(imported.gk).toBe(100);
  });
});

describe('parseImportedPlayers — REJEIÇÃO de formato antigo/inválido (sem fallback pela estrela)', () => {
  it('attributes ausente é REJEITADO com erro explícito nomeando o jogador (não deriva de nada)', () => {
    const json = JSON.stringify([{ ...basePlayer(), attributes: undefined }]);
    expect(() => parseImportedPlayers(json)).toThrow(/Fulano/);
    expect(() => parseImportedPlayers(json)).toThrow(/formato antigo ou inválido/i);
  });

  it('attributes parcial (faltando 1 das 9 chaves) é REJEITADO', () => {
    const partial = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45 }; // falta FIS
    const json = JSON.stringify([basePlayer({ attributes: partial as never })]);
    expect(() => parseImportedPlayers(json)).toThrow(/formato antigo ou inválido/i);
  });

  it('attributes no formato ANTIGO (estrela/v7, com REC em vez de RCD+INT) é REJEITADO', () => {
    const legacyAttrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, REC: 50, MOV: 45, FIS: 58 };
    const json = JSON.stringify([basePlayer({ attributes: legacyAttrs as never })]);
    expect(() => parseImportedPlayers(json)).toThrow(/formato antigo ou inválido/i);
  });

  it('attributes com tipo errado (não-objeto) é REJEITADO', () => {
    const json = JSON.stringify([{ ...basePlayer(), attributes: 'nope' }]);
    expect(() => parseImportedPlayers(json)).toThrow(/formato antigo ou inválido/i);
  });

  it('gk ausente (mesmo com attributes válidos) é REJEITADO — não há mais derivação de nota de goleiro', () => {
    const json = JSON.stringify([{ ...basePlayer(), gk: undefined }]);
    expect(() => parseImportedPlayers(json)).toThrow(/formato antigo ou inválido/i);
  });

  it('nomeia o índice quando o jogador não tem nome (Jogador N)', () => {
    const json = JSON.stringify([{ attributes: undefined, gk: null }]);
    expect(() => parseImportedPlayers(json)).toThrow(/Jogador 1/);
  });
});
