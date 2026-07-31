import { describe, it, expect } from 'vitest';
import { normalizePlayer, normalizePlayers } from './migration';
import { deriveAttributesFromStar, deriveGkFromStar } from '../domain/deriveAttributes';

describe('normalizePlayer — shape v6 (attributes/gk sempre presentes)', () => {
  it('jogador legado puro (só rating + flags antigas) ganha attributes/gk coerentes derivados da estrela', () => {
    const p = normalizePlayer({
      id: 'x', name: 'Fulano', active: false, isGoalkeeper: true,
      position: 'ATACANTE', rating: 4.5, pivotFriendly: true, recompoePouco: true,
      boaSaidaDeBola: true, veloz: true,
    });
    expect(p.id).toBe('x');
    expect(p.name).toBe('Fulano');
    expect(p.active).toBe(false);
    expect(p.isGoalkeeper).toBe(true);
    expect(p.position).toBe('ATACANTE');
    expect(p.rating).toBe(4.5);
    // attributes/gk coerentes: batem com a mesma derivação usada pela migração.
    expect(p.attributes).toEqual(deriveAttributesFromStar(4.5, 'ATACANTE', {
      pivotFriendly: true, recompoePouco: true, boaSaidaDeBola: true, veloz: true,
    }));
    expect(p.gk).toBe(deriveGkFromStar(4.5, true));
    // as flags legadas não existem mais no shape do Player.
    expect((p as Record<string, unknown>).pivotFriendly).toBeUndefined();
    expect((p as Record<string, unknown>).recompoePouco).toBeUndefined();
    expect((p as Record<string, unknown>).boaSaidaDeBola).toBeUndefined();
    expect((p as Record<string, unknown>).veloz).toBeUndefined();
  });

  it('jogador já v2 (com attributes válidos) preserva os atributos intactos, sem re-derivar', () => {
    const attrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 48, MOV: 45, FIS: 58 };
    const p = normalizePlayer({
      id: 'y', name: 'Ciclano', position: 'MEIA', rating: 3, isGoalkeeper: true,
      attributes: attrs, gk: 77,
      // flags antigas presentes mas devem ser ignoradas — attributes já existe.
      pivotFriendly: true,
    });
    expect(p.attributes).toEqual(attrs);
    expect(p.gk).toBe(77);
  });

  it('jogador v2 não-goleiro com gk explicitamente null preserva o null (não deriva)', () => {
    const attrs = { FIN: 50, CRI: 50, DRI: 50, DEF: 50, VEL: 50, RCD: 50, INT: 50, MOV: 50, FIS: 50 };
    const p = normalizePlayer({ name: 'Sem Gol', attributes: attrs, gk: null, isGoalkeeper: false });
    expect(p.gk).toBeNull();
  });

  it('aplica defaults quando faltam campos (rating padrão, meia, goleiro falso)', () => {
    const p = normalizePlayer({ name: 'Sem Nada' });
    expect(p.active).toBe(true);
    expect(p.isGoalkeeper).toBe(false);
    expect(p.position).toBe('MEIA');
    expect(p.rating).toBe(3);
    expect(p.attributes).toEqual(deriveAttributesFromStar(3, 'MEIA', {}));
    expect(p.gk).toBeNull();
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

describe('normalizePlayer — v8 (REC dividido em RCD + INT)', () => {
  it('jogador salvo no formato antigo (attributes com REC, sem RCD/INT) não quebra: cai no fallback derivado da estrela, com os 9 atributos válidos', () => {
    const legacyAttrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, REC: 50, MOV: 45, FIS: 58 };
    const p = normalizePlayer({
      id: 'z', name: 'Formato Antigo', position: 'MEIA', rating: 3.5,
      attributes: legacyAttrs, gk: null,
    });
    // não preserva o vetor antigo (não tem RCD/INT) — deriva um novo válido.
    expect(p.attributes).toEqual(deriveAttributesFromStar(3.5, 'MEIA', {}));
    expect(Number.isFinite(p.attributes.RCD)).toBe(true);
    expect(Number.isFinite(p.attributes.INT)).toBe(true);
    expect((p.attributes as Record<string, unknown>).REC).toBeUndefined();
  });

  it('jogador já no formato novo (com RCD/INT) passa intacto', () => {
    const attrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 33, INT: 77, MOV: 45, FIS: 58 };
    const p = normalizePlayer({ id: 'w', name: 'Formato Novo', attributes: attrs, gk: null });
    expect(p.attributes).toEqual(attrs);
  });
});

describe('normalizePlayer — v7 (acceptedPositions / migração para BOX_TO_BOX)', () => {
  const BTB = [{ position: 'BOX_TO_BOX', enabled: true }];

  it('jogador sem acceptedPositions recebe [BOX_TO_BOX] (default de migração)', () => {
    const p = normalizePlayer({ name: 'Legado', rating: 3 });
    expect(p.acceptedPositions).toEqual(BTB);
  });

  it('preserva uma lista ordenada válida já existente', () => {
    const list = [
      { position: 'SEGUNDO_ATACANTE', enabled: true }, { position: 'PIVO', enabled: true },
      { position: 'MEIA_ATACANTE', enabled: true }, { position: 'ALA', enabled: true },
    ];
    const p = normalizePlayer({ name: 'Jean', acceptedPositions: list });
    expect(p.acceptedPositions).toEqual(list);
  });

  it('lista de posição única (Guto/Tayrone: só jogam de PIVO) é preservada', () => {
    const p = normalizePlayer({ name: 'Guto', acceptedPositions: [{ position: 'PIVO', enabled: true }] });
    expect(p.acceptedPositions).toEqual([{ position: 'PIVO', enabled: true }]);
  });

  it('lista com item inválido tem só esse item descartado (preserva o resto)', () => {
    const p = normalizePlayer({ name: 'Ruim', acceptedPositions: [{ position: 'PIVO', enabled: true }, { position: 'ATACANTE_FALSO', enabled: true }] });
    expect(p.acceptedPositions).toEqual([{ position: 'PIVO', enabled: true }]);
  });

  it('array vazio cai no default [BOX_TO_BOX]', () => {
    const p = normalizePlayer({ name: 'Vazio', acceptedPositions: [] });
    expect(p.acceptedPositions).toEqual(BTB);
  });

  it('todas as entradas desabilitadas cai no default [BOX_TO_BOX] (sem posição jogável)', () => {
    const p = normalizePlayer({ name: 'SemPosicao', acceptedPositions: [{ position: 'PIVO', enabled: false }] });
    expect(p.acceptedPositions).toEqual(BTB);
  });
});
