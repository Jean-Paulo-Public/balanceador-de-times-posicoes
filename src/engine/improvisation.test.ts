import { describe, it, expect } from 'vitest';
import { isImprovisationAllowed, getImprovisationBonus, getRoleLabels } from './improvisation';
import { makePlayer } from './testFixtures';

describe('isImprovisationAllowed', () => {
  it('Defensor pode improvisar como Meia, mas nunca como Atacante', () => {
    expect(isImprovisationAllowed('DEFENSOR', 'MEIA')).toBe(true);
    expect(isImprovisationAllowed('DEFENSOR', 'ATACANTE')).toBe(false);
  });

  it('Atacante pode improvisar como Meia, mas nunca como Defensor', () => {
    expect(isImprovisationAllowed('ATACANTE', 'MEIA')).toBe(true);
    expect(isImprovisationAllowed('ATACANTE', 'DEFENSOR')).toBe(false);
  });

  it('Meia pode improvisar em qualquer posição', () => {
    expect(isImprovisationAllowed('MEIA', 'DEFENSOR')).toBe(true);
    expect(isImprovisationAllowed('MEIA', 'ATACANTE')).toBe(true);
  });
});

describe('getImprovisationBonus', () => {
  it('dá bônus só para Meia com pivotFriendly disputando vaga de Atacante', () => {
    const pivotMeia = makePlayer('MEIA', 4, { pivotFriendly: true });
    expect(getImprovisationBonus(pivotMeia, 'ATACANTE')).toBeGreaterThan(0);
  });

  it('não dá bônus para Meia sem pivotFriendly', () => {
    const meia = makePlayer('MEIA', 4, { pivotFriendly: false });
    expect(getImprovisationBonus(meia, 'ATACANTE')).toBe(0);
  });

  it('não dá bônus para Meia pivô disputando vaga de Defensor (bônus é só pra virar Atacante)', () => {
    const pivotMeia = makePlayer('MEIA', 4, { pivotFriendly: true });
    expect(getImprovisationBonus(pivotMeia, 'DEFENSOR')).toBe(0);
  });

  it('não dá bônus para Defensor/Atacante mesmo que o campo pivotFriendly esteja (indevidamente) true', () => {
    const defensor = makePlayer('DEFENSOR', 4, { pivotFriendly: true });
    expect(getImprovisationBonus(defensor, 'ATACANTE')).toBe(0);
  });

  it('o bônus é pequeno o bastante para não superar uma diferença de nível real', () => {
    const pivotMeia = makePlayer('MEIA', 3);
    const bonus = getImprovisationBonus({ ...pivotMeia, pivotFriendly: true }, 'ATACANTE');
    // Uma estrela de diferença já costuma valer mais que o bônus de pivô.
    expect(bonus).toBeLessThan(1);
  });
});

describe('getRoleLabels', () => {
  it('usa sufixo "(pivô)" quando isPivotFit é true', () => {
    const { roleLabel } = getRoleLabels('ATACANTE', true, false, true);
    expect(roleLabel).toBe('Atacante (pivô)');
  });

  it('usa sufixo "(improvisado)" quando isPivotFit é false', () => {
    const { roleLabel } = getRoleLabels('ATACANTE', true, false, false);
    expect(roleLabel).toBe('Atacante (improvisado)');
  });

  it('não usa sufixo quando o jogador é nativo na posição', () => {
    const { roleLabel } = getRoleLabels('ATACANTE', false);
    expect(roleLabel).toBe('Atacante');
  });
});
