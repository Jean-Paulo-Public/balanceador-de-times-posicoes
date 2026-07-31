import { describe, it, expect } from 'vitest';
import { computeDisplayOvrs, parseManualAttrInput, OVR_DISPLAY_ITEMS } from './ovrDisplay';
import { emptyAttrs } from '../../domain/attributes';

describe('computeDisplayOvrs', () => {
  it('com atributos neutros (todos 50), todos os OVRs de linha dão 50', () => {
    const attrs = emptyAttrs(50);
    const result = computeDisplayOvrs(attrs, null);
    expect(result.geral).toBe(50);
    expect(result.ofensivo).toBe(50);
    expect(result.recomposicao).toBe(50);
    expect(result.intensidade).toBe(50);
    expect(result.defensivo).toBe(50);
  });

  it('goleiro null quando o jogador não tem nota de goleiro', () => {
    const result = computeDisplayOvrs(emptyAttrs(50), null);
    expect(result.goleiro).toBeNull();
  });

  it('goleiro reflete a nota passada, arredondada', () => {
    const result = computeDisplayOvrs(emptyAttrs(50), 77.6);
    expect(result.goleiro).toBe(78);
  });

  it('atributos puxados pra ataque dão OFE bem maior que DEF', () => {
    const attrs = { ...emptyAttrs(50), FIN: 100, CRI: 100, DRI: 100, MOV: 100, DEF: 0, RCD: 0, INT: 0 };
    const result = computeDisplayOvrs(attrs, null);
    expect(result.ofensivo).toBeGreaterThan(result.defensivo);
  });

  it('recomposicao é o atributo RCD direto, não um OVR combinado', () => {
    const attrs = { ...emptyAttrs(50), RCD: 77, INT: 10, DEF: 10, VEL: 10 };
    const result = computeDisplayOvrs(attrs, null);
    expect(result.recomposicao).toBe(77);
  });

  it('intensidade é o atributo INT direto, não um OVR combinado', () => {
    const attrs = { ...emptyAttrs(50), INT: 83, RCD: 10, DEF: 10, VEL: 10 };
    const result = computeDisplayOvrs(attrs, null);
    expect(result.intensidade).toBe(83);
  });

  it('intensidade arredonda o valor do atributo INT', () => {
    const attrs = { ...emptyAttrs(50), INT: 66.4 };
    expect(computeDisplayOvrs(attrs, null).intensidade).toBe(66);
    const attrs2 = { ...emptyAttrs(50), INT: 66.6 };
    expect(computeDisplayOvrs(attrs2, null).intensidade).toBe(67);
  });

  it('OVR_DISPLAY_ITEMS tem as 6 chaves na ordem esperada com siglas de 3 letras', () => {
    expect(OVR_DISPLAY_ITEMS.map((i) => i.key)).toEqual(['geral', 'ofensivo', 'recomposicao', 'intensidade', 'defensivo', 'goleiro']);
    for (const item of OVR_DISPLAY_ITEMS) expect(item.abbr).toHaveLength(3);
  });
});

describe('parseManualAttrInput', () => {
  it('aceita inteiros simples', () => {
    expect(parseManualAttrInput('42')).toBe(42);
    expect(parseManualAttrInput('0')).toBe(0);
    expect(parseManualAttrInput('100')).toBe(100);
  });

  it('clampa fora da faixa 0-100', () => {
    expect(parseManualAttrInput('150')).toBe(100);
    expect(parseManualAttrInput('007')).toBe(7);
  });

  it('rejeita decimais (retorna null, não arredonda silenciosamente)', () => {
    expect(parseManualAttrInput('12.5')).toBeNull();
    expect(parseManualAttrInput('12,5')).toBeNull();
  });

  it('rejeita texto vazio, não numérico ou negativo', () => {
    expect(parseManualAttrInput('')).toBeNull();
    expect(parseManualAttrInput('   ')).toBeNull();
    expect(parseManualAttrInput('abc')).toBeNull();
    expect(parseManualAttrInput('-5')).toBeNull();
    expect(parseManualAttrInput('NaN')).toBeNull();
  });
});
