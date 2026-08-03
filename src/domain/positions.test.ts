import { describe, it, expect } from 'vitest';
import { LINE_POSITIONS, ALL_LINE_POSITIONS, linePositionFit, ATTACKING_POSITIONS, isAttackingPosition } from './positions';
import type { AttrVector } from './attributes';

const sumWeights = (w: AttrVector): number => w.FIN + w.CRI + w.DRI + w.DEF + w.VEL + w.RCD + w.INT + w.MOV + w.FIS;

describe('catálogo de posições de linha (7 posições)', () => {
  it('tem exatamente 7 posições', () => {
    expect(ALL_LINE_POSITIONS.length).toBe(7);
  });

  it('cada posição tem pesos somando 1,00', () => {
    for (const pos of ALL_LINE_POSITIONS) {
      const total = sumWeights(LINE_POSITIONS[pos].weights);
      expect(total).toBeCloseTo(1.0, 6);
    }
  });

  it('posições de ataque são PIVO, SEGUNDO_ATACANTE e MEIA_ATACANTE', () => {
    expect([...ATTACKING_POSITIONS].sort()).toEqual(['MEIA_ATACANTE', 'PIVO', 'SEGUNDO_ATACANTE'].sort());
    expect(isAttackingPosition('PIVO')).toBe(true);
    expect(isAttackingPosition('SEGUNDO_ATACANTE')).toBe(true);
    expect(isAttackingPosition('MEIA_ATACANTE')).toBe(true);
    expect(isAttackingPosition('ALA')).toBe(false);
    expect(isAttackingPosition('VOLANTE')).toBe(false);
    expect(isAttackingPosition('LATERAL')).toBe(false);
    expect(isAttackingPosition('FIXO')).toBe(false);
  });

  it('contraste ALA vs VOLANTE: DRI alto/CRI baixo encaixa melhor em ALA', () => {
    const driblador: AttrVector = { FIN: 50, CRI: 20, DRI: 85, DEF: 30, VEL: 70, RCD: 40, INT: 40, MOV: 60, FIS: 40 };
    const fitAla = linePositionFit(driblador, 'ALA');
    const fitVolante = linePositionFit(driblador, 'VOLANTE');
    expect(fitAla).toBeGreaterThan(fitVolante);
  });

  it('contraste ALA vs VOLANTE: CRI alto/DRI baixo encaixa melhor em VOLANTE', () => {
    const passador: AttrVector = { FIN: 30, CRI: 85, DRI: 20, DEF: 60, VEL: 30, RCD: 60, INT: 60, MOV: 30, FIS: 50 };
    const fitAla = linePositionFit(passador, 'ALA');
    const fitVolante = linePositionFit(passador, 'VOLANTE');
    expect(fitVolante).toBeGreaterThan(fitAla);
  });

  it('PIVO pesa mais em FIN e FIS que os demais atributos', () => {
    const wp = LINE_POSITIONS.PIVO.weights;
    expect(wp.FIN).toBeGreaterThan(wp.CRI);
    expect(wp.FIN).toBeGreaterThan(wp.DRI);
    expect(wp.FIS).toBeGreaterThan(wp.DEF);
  });

  it('FIXO pesa mais em DEF e FIS', () => {
    const wf = LINE_POSITIONS.FIXO.weights;
    expect(wf.DEF).toBeGreaterThan(wf.FIN);
    expect(wf.FIS).toBeGreaterThan(wf.MOV);
  });

  // Guarda contra a regressão em que INT existia mas era decorativo (pesos <= .08
  // em todas as posições): dava pra dar INT 90 a um jogador e o fit dele mal mudava.
  it('INT tem peso relevante nas posições de pressão (não é decorativo)', () => {
    for (const pos of ['ALA', 'VOLANTE', 'SEGUNDO_ATACANTE', 'MEIA_ATACANTE'] as const) {
      expect(LINE_POSITIONS[pos].weights.INT).toBeGreaterThanOrEqual(.10);
    }
  });

  it('INT move o fit de forma perceptível nas posições de pressão', () => {
    const base: AttrVector = { FIN: 50, CRI: 50, DRI: 50, DEF: 50, VEL: 50, RCD: 50, INT: 20, MOV: 50, FIS: 50 };
    const pressiona: AttrVector = { ...base, INT: 90 };
    // 70 pontos de INT com peso >= .10 têm de valer >= 7 pontos de fit.
    expect(linePositionFit(pressiona, 'ALA') - linePositionFit(base, 'ALA')).toBeGreaterThanOrEqual(7);
    expect(linePositionFit(pressiona, 'VOLANTE') - linePositionFit(base, 'VOLANTE')).toBeGreaterThanOrEqual(7);
  });

  // RCD e INT são perfis OPOSTOS e precisam continuar distinguíveis: o cara que
  // pressiona bem à frente mas é frouxo voltando não pode encaixar como lateral.
  it('RCD e INT separam o pressionador do jogador que recompõe', () => {
    const pressionaNaoVolta: AttrVector = { FIN: 50, CRI: 50, DRI: 50, DEF: 40, VEL: 50, RCD: 15, INT: 90, MOV: 50, FIS: 50 };
    const volta: AttrVector = { ...pressionaNaoVolta, RCD: 90, INT: 15 };
    expect(linePositionFit(volta, 'LATERAL')).toBeGreaterThan(linePositionFit(pressionaNaoVolta, 'LATERAL'));
    expect(linePositionFit(pressionaNaoVolta, 'ALA')).toBeGreaterThan(linePositionFit(volta, 'ALA'));
  });

  // Guarda contra a regressão do "pivô virando fixo só porque é forte": o físico
  // é multiplicador da marcação, não substituto. Um jogador forte que não marca
  // não pode ganhar a vaga de último homem de quem marca bem.
  it('físico alto NÃO compensa marcação baixa no FIXO', () => {
    const forteQueNaoMarca: AttrVector = { FIN: 80, CRI: 50, DRI: 50, DEF: 20, VEL: 50, RCD: 35, INT: 50, MOV: 50, FIS: 95 };
    const marcadorMedioFisico: AttrVector = { FIN: 30, CRI: 50, DRI: 50, DEF: 85, VEL: 50, RCD: 75, INT: 50, MOV: 50, FIS: 50 };
    expect(linePositionFit(marcadorMedioFisico, 'FIXO')).toBeGreaterThan(linePositionFit(forteQueNaoMarca, 'FIXO'));
    // ...e o forte finalizador segue sendo melhor PIVO do que fixo.
    expect(linePositionFit(forteQueNaoMarca, 'PIVO')).toBeGreaterThan(linePositionFit(forteQueNaoMarca, 'FIXO'));
  });

  it('no FIXO, marcação pesa bem mais que físico', () => {
    const wf = LINE_POSITIONS.FIXO.weights;
    expect(wf.DEF).toBeGreaterThan(wf.FIS * 2.5);
  });
});
