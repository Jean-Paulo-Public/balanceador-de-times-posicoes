import { describe, it, expect } from 'vitest';
import type { AttrVector } from '../domain/attributes';
import { ROLES, OVR_WEIGHTS } from '../domain/attributes';
import {
  roleFit, ovr, roleFits, naturalRole, top2Roles, versatility,
  effectiveGkRating, effectiveGkRatingSimple, coberturaGol,
  potencialAtaque, estabilidadeDefensiva,
} from './scoring';

const sum = (o: AttrVector): number => Object.values(o).reduce((a, b) => a + b, 0);

// perfis de exemplo
const finalizador: AttrVector = { FIN: 100, CRI: 40, DRI: 80, DEF: 30, VEL: 80, RCD: 40, INT: 40, MOV: 90, FIS: 50 };
const forteLento: AttrVector = { FIN: 20, CRI: 45, DRI: 35, DEF: 80, VEL: 35, RCD: 75, INT: 75, MOV: 35, FIS: 85 }; // perfil "Jean"

describe('pesos somam 1,00', () => {
  it('todas as funções', () => {
    for (const r of Object.values(ROLES)) expect(sum(r.weights)).toBeCloseTo(1, 9);
  });
  it('todos os OVRs', () => {
    for (const w of Object.values(OVR_WEIGHTS)) expect(sum(w)).toBeCloseTo(1, 9);
  });
});

describe('fit e OVR ficam na escala 0–100', () => {
  it('fit e ovr limitados', () => {
    expect(roleFit(finalizador, 'SA')).toBeGreaterThan(0);
    expect(roleFit(finalizador, 'SA')).toBeLessThanOrEqual(100);
    expect(ovr(forteLento, 'Defesa')).toBeGreaterThan(0);
    expect(ovr(forteLento, 'Defesa')).toBeLessThanOrEqual(100);
  });
});

describe('portão da posição (matriz de improviso)', () => {
  it('DEFENSOR nunca recebe função de ataque, mesmo com atributos de finalizador', () => {
    const roles = roleFits(finalizador, 'DEFENSOR').map((r) => r.role);
    expect(roles).not.toContain('PIVO');
    expect(roles).not.toContain('SA');
    expect(['PIVO', 'SA']).not.toContain(naturalRole(finalizador, 'DEFENSOR').role);
  });
  it('ATACANTE nunca recebe função de defesa', () => {
    const roles = roleFits(finalizador, 'ATACANTE').map((r) => r.role);
    expect(roles).not.toContain('MARC');
    expect(roles).not.toContain('CONS');
  });
  it('MEIA pode qualquer função', () => {
    expect(roleFits(finalizador, 'MEIA')).toHaveLength(7);
  });
});

describe('função natural', () => {
  it('finalizador atacante vira Segundo atacante ou Pivô', () => {
    expect(['SA', 'PIVO']).toContain(naturalRole(finalizador, 'ATACANTE').role);
  });
  it('perfil forte/lento (Jean) como defensor vira Marcador', () => {
    expect(naturalRole(forteLento, 'DEFENSOR').role).toBe('MARC');
  });
  it('top2 devolve duas funções', () => {
    expect(top2Roles(finalizador, 'MEIA')).toHaveLength(2);
  });
  it('versatilidade entre 0 e 1', () => {
    const v = versatility(finalizador, 'MEIA');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('goleiro efetivo no rodízio (média por cenário, peso 1/k)', () => {
  it('k=1 usa só a nota de goleiro', () => {
    expect(effectiveGkRating(85, [])).toBe(85);
  });
  it('k=2 é a média gol/linha', () => {
    expect(effectiveGkRating(80, [60])).toBe(70);
    expect(effectiveGkRating(55, [78])).toBe(66.5);
  });
  it('k=3 divide por 3 (exemplo do design)', () => {
    expect(effectiveGkRating(84, [72, 66])).toBe(74);
  });
  it('versão simples equivale quando o valor de linha é constante', () => {
    expect(effectiveGkRatingSimple(84, 69, 3)).toBeCloseTo((84 + 2 * 69) / 3, 9);
    expect(effectiveGkRatingSimple(90, 50, 1)).toBe(90);
  });
  it('cobertura de gol = média dos aptos', () => {
    expect(coberturaGol([80, 55])).toBe(67.5);
    expect(coberturaGol([])).toBe(0);
  });
});

describe('complementaridade (sinergia)', () => {
  const semCriador: AttrVector[] = [
    { FIN: 90, CRI: 20, DRI: 70, DEF: 30, VEL: 70, RCD: 40, INT: 40, MOV: 80, FIS: 40 },
    { FIN: 88, CRI: 25, DRI: 60, DEF: 30, VEL: 75, RCD: 40, INT: 40, MOV: 80, FIS: 40 },
  ];
  const comCriador: AttrVector[] = [
    { FIN: 90, CRI: 20, DRI: 70, DEF: 30, VEL: 70, RCD: 40, INT: 40, MOV: 80, FIS: 40 },
    { FIN: 50, CRI: 92, DRI: 70, DEF: 40, VEL: 60, RCD: 60, INT: 60, MOV: 70, FIS: 45 },
  ];
  it('ataque rende mais com um criador do que só com finalizadores', () => {
    expect(potencialAtaque(comCriador)).toBeGreaterThan(potencialAtaque(semCriador));
  });
  it('defesa exige marcação E recomposição', () => {
    const soMarca: AttrVector[] = [{ FIN: 20, CRI: 40, DRI: 30, DEF: 90, VEL: 40, RCD: 10, INT: 10, MOV: 30, FIS: 80 }];
    const equilibrado: AttrVector[] = [{ FIN: 20, CRI: 40, DRI: 30, DEF: 75, VEL: 50, RCD: 75, INT: 75, MOV: 40, FIS: 70 }];
    expect(estabilidadeDefensiva(equilibrado)).toBeGreaterThan(estabilidadeDefensiva(soMarca));
  });
});
