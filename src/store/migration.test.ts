import { describe, it, expect } from 'vitest';
import { normalizePlayer, normalizePlayers, parseAttrVector, parseAcceptedPositions } from './migration';
import { emptyAttrs } from '../domain/attributes';

const VALID_ATTRS = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 48, MOV: 45, FIS: 58 };

describe('normalizePlayer — shape atual (v9, escala ÚNICA 0–100, sem estrela)', () => {
  it('jogador válido (attributes + gk) passa intacto, com defaults sensatos pros campos cosméticos', () => {
    const p = normalizePlayer({
      id: 'x', name: 'Fulano', active: false, isGoalkeeper: true,
      position: 'ATACANTE', attributes: VALID_ATTRS, gk: 88,
    });
    expect(p).not.toBeNull();
    expect(p!.id).toBe('x');
    expect(p!.name).toBe('Fulano');
    expect(p!.active).toBe(false);
    expect(p!.isGoalkeeper).toBe(true);
    expect(p!.position).toBe('ATACANTE');
    expect(p!.attributes).toEqual(VALID_ATTRS);
    expect(p!.gk).toBe(88);
    // não existe mais campo de estrela no shape do Player.
    expect((p as unknown as Record<string, unknown>).rating).toBeUndefined();
  });

  it('jogador v2 (com attributes válidos) preserva os atributos intactos, sem re-derivar', () => {
    const attrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 48, MOV: 45, FIS: 58 };
    const p = normalizePlayer({
      id: 'y', name: 'Ciclano', position: 'MEIA', isGoalkeeper: true,
      attributes: attrs, gk: 77,
    });
    expect(p!.attributes).toEqual(attrs);
    expect(p!.gk).toBe(77);
  });

  it('não-goleiro com gk explicitamente null preserva o null', () => {
    const attrs = { FIN: 50, CRI: 50, DRI: 50, DEF: 50, VEL: 50, RCD: 50, INT: 50, MOV: 50, FIS: 50 };
    const p = normalizePlayer({ name: 'Sem Gol', attributes: attrs, gk: null, isGoalkeeper: false });
    expect(p!.gk).toBeNull();
  });

  it('aplica defaults pros campos cosméticos quando faltam (meia, ativo, sem goleiro)', () => {
    const p = normalizePlayer({ name: 'Sem Nada', attributes: VALID_ATTRS, gk: null });
    expect(p).not.toBeNull();
    expect(p!.active).toBe(true);
    expect(p!.isGoalkeeper).toBe(false);
    expect(p!.position).toBe('MEIA');
    expect(typeof p!.id).toBe('string');
  });

  it('posição inválida vira MEIA (não invalida o registro)', () => {
    const p = normalizePlayer({ position: 'ZAGUEIRO' as unknown as string, attributes: VALID_ATTRS, gk: null });
    expect(p!.position).toBe('MEIA');
  });

  it('normalizePlayers converte a lista e ignora entrada não-array', () => {
    expect(normalizePlayers([
      { name: 'A', attributes: VALID_ATTRS, gk: null },
      { name: 'B', attributes: VALID_ATTRS, gk: 90 },
    ])).toHaveLength(2);
    expect(normalizePlayers(null)).toEqual([]);
  });
});

describe('normalizePlayer — DESCARTE (não conserto) de registro malformado', () => {
  it('sem `attributes` válidos (vetor 0–100 completo), o registro inteiro é DESCARTADO — não deriva de nada', () => {
    expect(normalizePlayer({ id: 'x', name: 'Sem Atributos', gk: null })).toBeNull();
  });

  it('`attributes` parcial (falta 1 das 9 chaves) descarta o registro inteiro', () => {
    const partial = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45 }; // falta FIS
    expect(normalizePlayer({ name: 'Parcial', attributes: partial, gk: null })).toBeNull();
  });

  it('`attributes` no formato ANTIGO (REC em vez de RCD/INT — a escala de estrela/v7) é descartado', () => {
    const legacyAttrs = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, REC: 50, MOV: 45, FIS: 58 };
    expect(normalizePlayer({ name: 'Formato Antigo', attributes: legacyAttrs, gk: null })).toBeNull();
  });

  it('`attributes` com tipo errado (não-objeto) descarta o registro', () => {
    expect(normalizePlayer({ name: 'X', attributes: 'nope', gk: null })).toBeNull();
  });

  it('`gk` ausente/tipo errado descarta o registro (mesmo com attributes válidos)', () => {
    expect(normalizePlayer({ name: 'SemGk', attributes: VALID_ATTRS })).toBeNull();
    expect(normalizePlayer({ name: 'GkErrado', attributes: VALID_ATTRS, gk: 'alto' })).toBeNull();
  });

  it('`gk` null é ACEITO (não é "ausente" — é o estado válido de "não joga no gol")', () => {
    expect(normalizePlayer({ name: 'ComGkNull', attributes: VALID_ATTRS, gk: null })).not.toBeNull();
  });

  it('clampeia valores de attributes fora de 0–100 quando o vetor é válido (9 chaves)', () => {
    const attrs = { FIN: 500, CRI: -30, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45, FIS: 58 };
    const p = normalizePlayer({ name: 'Clamp', attributes: attrs, gk: null });
    expect(p!.attributes.FIN).toBe(100);
    expect(p!.attributes.CRI).toBe(0);
  });

  it('gk fora de 0–100 é clampeado (não descartado)', () => {
    const p = normalizePlayer({ name: 'GkAlto', attributes: VALID_ATTRS, gk: 150 });
    expect(p!.gk).toBe(100);
  });

  it('normalizePlayers filtra (não quebra) quando a lista mistura registros válidos e malformados', () => {
    const result = normalizePlayers([
      { name: 'Valido', attributes: VALID_ATTRS, gk: null },
      { name: 'SemAtributos' },
      { name: 'GkInvalido', attributes: VALID_ATTRS, gk: 'x' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valido');
  });
});

describe('parseAttrVector — validação estrita do vetor 0–100', () => {
  it('aceita um vetor com as 9 chaves numéricas', () => {
    expect(parseAttrVector(emptyAttrs(60))).toEqual(emptyAttrs(60));
  });

  it('rejeita (undefined) qualquer coisa que não seja um objeto completo', () => {
    expect(parseAttrVector(undefined)).toBeUndefined();
    expect(parseAttrVector(null)).toBeUndefined();
    expect(parseAttrVector('nope')).toBeUndefined();
    expect(parseAttrVector({ FIN: 50 })).toBeUndefined();
  });
});

describe('normalizePlayer — acceptedPositions / default BOX_TO_BOX', () => {
  const BTB = [{ position: 'BOX_TO_BOX', enabled: true }];

  it('jogador sem acceptedPositions recebe [BOX_TO_BOX] (default de domínio, não "conserto")', () => {
    const p = normalizePlayer({ name: 'Legado', attributes: VALID_ATTRS, gk: null });
    expect(p!.acceptedPositions).toEqual(BTB);
  });

  it('preserva uma lista ordenada válida já existente', () => {
    const list = [
      { position: 'SEGUNDO_ATACANTE', enabled: true }, { position: 'PIVO', enabled: true },
      { position: 'MEIA_ATACANTE', enabled: true }, { position: 'ALA', enabled: true },
    ];
    const p = normalizePlayer({ name: 'Jean', attributes: VALID_ATTRS, gk: null, acceptedPositions: list });
    expect(p!.acceptedPositions).toEqual(list);
  });

  it('lista de posição única (Guto/Tayrone: só jogam de PIVO) é preservada', () => {
    const p = normalizePlayer({
      name: 'Guto', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: [{ position: 'PIVO', enabled: true }],
    });
    expect(p!.acceptedPositions).toEqual([{ position: 'PIVO', enabled: true }]);
  });

  it('lista com item inválido tem só esse item descartado (preserva o resto)', () => {
    const p = normalizePlayer({
      name: 'Ruim', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: [{ position: 'PIVO', enabled: true }, { position: 'ATACANTE_FALSO', enabled: true }],
    });
    expect(p!.acceptedPositions).toEqual([{ position: 'PIVO', enabled: true }]);
  });

  it('array vazio cai no default [BOX_TO_BOX]', () => {
    const p = normalizePlayer({ name: 'Vazio', attributes: VALID_ATTRS, gk: null, acceptedPositions: [] });
    expect(p!.acceptedPositions).toEqual(BTB);
  });

  it('todas as entradas desabilitadas cai no default [BOX_TO_BOX] (sem posição jogável)', () => {
    const p = normalizePlayer({
      name: 'SemPosicao', attributes: VALID_ATTRS, gk: null,
      acceptedPositions: [{ position: 'PIVO', enabled: false }],
    });
    expect(p!.acceptedPositions).toEqual(BTB);
  });

  it('parseAcceptedPositions exposto isoladamente (mesma função usada acima)', () => {
    expect(parseAcceptedPositions([])).toBeUndefined();
    expect(parseAcceptedPositions([{ position: 'PIVO', enabled: true }])).toEqual([{ position: 'PIVO', enabled: true }]);
  });
});
