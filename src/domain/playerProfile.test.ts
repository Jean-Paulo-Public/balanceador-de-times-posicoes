import { describe, it, expect } from 'vitest';
import { describePlayerProfile, PROFILE_HIGHLIGHT_THRESHOLD, PROFILE_WEAKNESS_THRESHOLD } from './playerProfile';
import { emptyAttrs } from './attributes';
import type { AttrVector } from './attributes';

describe('describePlayerProfile', () => {
  it('perfil mediano (tudo 50): sem destaques, sem pontos fracos, sem arquétipo', () => {
    const p = describePlayerProfile(emptyAttrs(50));
    expect(p.highlights).toEqual([]);
    expect(p.weaknesses).toEqual([]);
    expect(p.archetype).toBeNull();
    expect(p.balanced).toBe(true);
  });

  it('destaques ficam ordenados do maior pro menor e usam rótulo legível (não a sigla)', () => {
    const attrs: AttrVector = { ...emptyAttrs(50), FIN: 90, DRI: 70 };
    const p = describePlayerProfile(attrs);
    expect(p.highlights.map((h) => h.key)).toEqual(['FIN', 'DRI']);
    expect(p.highlights[0].label).toBe('Finalização');
    expect(p.highlights[0].value).toBe(90);
    expect(p.balanced).toBe(false);
  });

  it('pontos fracos ficam ordenados do menor pro maior', () => {
    const attrs: AttrVector = { ...emptyAttrs(50), DEF: 10, FIS: 30 };
    const p = describePlayerProfile(attrs);
    expect(p.weaknesses.map((w) => w.key)).toEqual(['DEF', 'FIS']);
    expect(p.weaknesses[0].label).toBe('Defesa');
  });

  it('limiares: valor exatamente no limiar de destaque conta, um a menos não conta', () => {
    const noHighlight: AttrVector = { ...emptyAttrs(50), VEL: PROFILE_HIGHLIGHT_THRESHOLD - 1 };
    expect(describePlayerProfile(noHighlight).highlights).toEqual([]);

    const withHighlight: AttrVector = { ...emptyAttrs(50), VEL: PROFILE_HIGHLIGHT_THRESHOLD };
    expect(describePlayerProfile(withHighlight).highlights.map((h) => h.key)).toEqual(['VEL']);
  });

  it('limiares: valor exatamente no limiar de ponto fraco conta, um a mais não conta', () => {
    const noWeakness: AttrVector = { ...emptyAttrs(50), RCD: PROFILE_WEAKNESS_THRESHOLD + 1 };
    expect(describePlayerProfile(noWeakness).weaknesses).toEqual([]);

    const withWeakness: AttrVector = { ...emptyAttrs(50), RCD: PROFILE_WEAKNESS_THRESHOLD };
    expect(describePlayerProfile(withWeakness).weaknesses.map((w) => w.key)).toEqual(['RCD']);
  });

  it('arquétipo "Driblador veloz": DRI + VEL em destaque', () => {
    const attrs: AttrVector = { ...emptyAttrs(50), DRI: 85, VEL: 80 };
    expect(describePlayerProfile(attrs).archetype).toBe('Driblador veloz');
  });

  it('arquétipo "Passador de saída de bola": CRI + DEF em destaque', () => {
    const attrs: AttrVector = { ...emptyAttrs(50), CRI: 85, DEF: 80 };
    expect(describePlayerProfile(attrs).archetype).toBe('Passador de saída de bola');
  });

  it('arquétipo "Referência de área": FIN + FIS em destaque', () => {
    const attrs: AttrVector = { ...emptyAttrs(50), FIN: 85, FIS: 80 };
    expect(describePlayerProfile(attrs).archetype).toBe('Referência de área');
  });

  it('arquétipo "Defensor físico": DEF + FIS em destaque, sem FIN em destaque', () => {
    const attrs: AttrVector = { ...emptyAttrs(50), DEF: 85, FIS: 80 };
    expect(describePlayerProfile(attrs).archetype).toBe('Defensor físico');
  });

  it('arquétipo "Camisa 10 que recompõe": CRI + RCD em destaque', () => {
    const attrs: AttrVector = { ...emptyAttrs(50), CRI: 85, RCD: 80 };
    expect(describePlayerProfile(attrs).archetype).toBe('Camisa 10 que recompõe');
  });

  it('um único destaque isolado não forma arquétipo', () => {
    const attrs: AttrVector = { ...emptyAttrs(50), VEL: 90 };
    const p = describePlayerProfile(attrs);
    expect(p.highlights.map((h) => h.key)).toEqual(['VEL']);
    expect(p.archetype).toBeNull();
  });

  it('primeira regra que casa vence quando mais de um par de destaques está presente', () => {
    // FIN+FIS (Referência de área) e DEF+FIS (Defensor físico) ambos casariam;
    // "Referência de área" vem primeiro na lista de arquétipos.
    const attrs: AttrVector = { ...emptyAttrs(50), FIN: 90, DEF: 90, FIS: 90 };
    expect(describePlayerProfile(attrs).archetype).toBe('Referência de área');
  });
});
