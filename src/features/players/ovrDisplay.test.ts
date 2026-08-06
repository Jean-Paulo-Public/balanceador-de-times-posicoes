import { describe, it, expect } from 'vitest';
import { computeDisplayOvrs, parseManualAttrInput, OVR_DISPLAY_ITEMS } from './ovrDisplay';
import { emptyAttrs, type AttrVector } from '../../domain/attributes';

describe('computeDisplayOvrs', () => {
  it('com atributos neutros (todos 50), todos os OVRs de linha dão 50', () => {
    const attrs = emptyAttrs(50);
    const result = computeDisplayOvrs(attrs, null);
    expect(result.geral).toBe(50);
    expect(result.ofensivo).toBe(50);
    expect(result.recomposicao).toBe(50);
    expect(result.intensidade).toBe(50);
    // O DEF descarta o RCD e REESCALA — num jogador uniforme isso devolve o
    // mesmo 50, que é o sinal de que a reescala está certa (tirar um atributo
    // que vale a média não pode mudar a média).
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

  it('OVR_DISPLAY_ITEMS tem as 7 chaves na ordem esperada com siglas de 3 letras', () => {
    expect(OVR_DISPLAY_ITEMS.map((i) => i.key)).toEqual(['geral', 'ofensivo', 'recomposicao', 'intensidade', 'ofensividade', 'defensivo', 'goleiro']);
    for (const item of OVR_DISPLAY_ITEMS) expect(item.abbr).toHaveLength(3);
  });

  it('cada sigla de chip é única (sem colisão entre overall e atributo-base)', () => {
    const abbrs = OVR_DISPLAY_ITEMS.map((i) => i.abbr);
    expect(new Set(abbrs).size).toBe(abbrs.length);
  });
});

describe('OVR ATA inclui o atributo OFE com peso 0,32 (verificações numéricas do design)', () => {
  it('jogador de referência com OFE 100 dá ATA 67', () => {
    const attrs: AttrVector = {
      FIN: 50, CRI: 20, DRI: 50, DEF: 20, VEL: 35, RCD: 35, INT: 75, MOV: 85, FIS: 75, OFE: 100,
    };
    expect(computeDisplayOvrs(attrs, null).ofensivo).toBe(67);
  });

  it('o mesmo jogador com OFE 50 dá ATA 51', () => {
    const attrs: AttrVector = {
      FIN: 50, CRI: 20, DRI: 50, DEF: 20, VEL: 35, RCD: 35, INT: 75, MOV: 85, FIS: 75, OFE: 50,
    };
    expect(computeDisplayOvrs(attrs, null).ofensivo).toBe(51);
  });

  it('todos os atributos em 50 (incluindo OFE) dão ATA 50', () => {
    expect(computeDisplayOvrs(emptyAttrs(50), null).ofensivo).toBe(50);
  });

  it('todos em 0 e OFE 100 dão ATA 32 (só o peso do OFE conta)', () => {
    const attrs: AttrVector = { ...emptyAttrs(0), OFE: 100 };
    expect(computeDisplayOvrs(attrs, null).ofensivo).toBe(32);
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

describe('chip DEF ignora a recomposição (RCD zerado + reescala)', () => {
  // O RCD tem chip PRÓPRIO; contá-lo também no DEF mostrava o mesmo sinal duas
  // vezes. O RCD é zerado e o resultado reescalado por 1/(1 - peso do RCD),
  // então o chip mede só marcação/físico/resto — na mesma régua 0–100.
  const base: AttrVector = { FIN: 50, CRI: 20, DRI: 50, DEF: 20, VEL: 35, RCD: 35, INT: 75, MOV: 85, FIS: 75, OFE: 50 };

  it('mudar SÓ o RCD não altera o chip DEF', () => {
    const a = computeDisplayOvrs({ ...base, RCD: 0 }, null).defensivo;
    const b = computeDisplayOvrs({ ...base, RCD: 100 }, null).defensivo;
    expect(a).toBe(b);
  });

  it('o chip RCD continua refletindo o valor real (os dois números são independentes)', () => {
    expect(computeDisplayOvrs({ ...base, RCD: 0 }, null).recomposicao).toBe(0);
    expect(computeDisplayOvrs({ ...base, RCD: 100 }, null).recomposicao).toBe(100);
  });

  it('mudar a marcação (DEF) continua alterando o chip DEF', () => {
    const fraco = computeDisplayOvrs({ ...base, DEF: 20 }, null).defensivo;
    const forte = computeDisplayOvrs({ ...base, DEF: 100 }, null).defensivo;
    expect(forte).toBeGreaterThan(fraco);
  });

  it('jogador com tudo no máximo continua dando 100 (a escala segue 0–100)', () => {
    const max: AttrVector = { FIN: 100, CRI: 100, DRI: 100, DEF: 100, VEL: 100, RCD: 100, INT: 100, MOV: 100, FIS: 100, OFE: 100 };
    expect(computeDisplayOvrs(max, null).defensivo).toBe(100);
  });
});

describe('chip DEF é o atributo de marcação PURO', () => {
  // Decisão do dono: "conte somente a DEF no chip". Deixou de ser overall
  // combinado — nada de recomposição, físico ou reescala. É o valor digitado.
  const base: AttrVector = { FIN: 50, CRI: 20, DRI: 50, DEF: 20, VEL: 35, RCD: 35, INT: 75, MOV: 85, FIS: 75, OFE: 51 };

  it('mostra exatamente o atributo DEF', () => {
    expect(computeDisplayOvrs(base, null).defensivo).toBe(20);
    expect(computeDisplayOvrs({ ...base, DEF: 100 }, null).defensivo).toBe(100);
    expect(computeDisplayOvrs({ ...base, DEF: 0 }, null).defensivo).toBe(0);
  });

  it('nenhum outro atributo influencia o chip DEF', () => {
    const alvo = computeDisplayOvrs(base, null).defensivo;
    for (const k of ['RCD', 'FIS', 'CRI', 'MOV', 'VEL', 'INT', 'DRI', 'FIN', 'OFE'] as const) {
      expect(computeDisplayOvrs({ ...base, [k]: 0 }, null).defensivo).toBe(alvo);
      expect(computeDisplayOvrs({ ...base, [k]: 100 }, null).defensivo).toBe(alvo);
    }
  });
});
