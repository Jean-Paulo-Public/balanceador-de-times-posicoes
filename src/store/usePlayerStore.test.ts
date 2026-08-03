import { describe, it, expect } from 'vitest';
import { migrateStorage } from './usePlayerStore';

const VALID_ATTRS = { FIN: 70, CRI: 60, DRI: 55, DEF: 40, VEL: 65, RCD: 50, INT: 44, MOV: 45, FIS: 58 };
const CURRENT_VERSION = 9;

describe('migrateStorage — PORTÃO SIMPLES de versão (sem cadeia de migração incremental)', () => {
  it('dado de versão ANTIGA (< atual) é DESCARTADO por inteiro: devolve estado vazio válido, não quebra', () => {
    const oldPersisted = {
      players: [{ id: 'x', name: 'Fulano', rating: 4.5, position: 'ATACANTE', pivotFriendly: true }],
      neverScaleGoalkeepers: true,
      generateTestPlayersOnEmpty: true,
      maxSixLinePlayers: true,
      separatePairs: [['a', 'b']],
    };
    const result = migrateStorage(oldPersisted, CURRENT_VERSION - 1);
    expect(result.players).toEqual([]);
    expect(result.neverScaleGoalkeepers).toBe(false);
    expect(result.generateTestPlayersOnEmpty).toBe(false);
    expect(result.maxSixLinePlayers).toBe(false);
    expect(result.separatePairs).toEqual([]);
  });

  it('dado de versão FUTURA (> atual, ex.: rollback do app) também é descartado — o portão é EXATO, não "<"', () => {
    const result = migrateStorage({ players: [{ id: 'y' }] }, CURRENT_VERSION + 1);
    expect(result.players).toEqual([]);
  });

  it('dado JÁ na versão atual passa adiante intacto (sem conversão nenhuma)', () => {
    const current = {
      players: [{ id: 'z', name: 'Ciclano', attributes: VALID_ATTRS, gk: null }],
      neverScaleGoalkeepers: true,
      generateTestPlayersOnEmpty: false,
      maxSixLinePlayers: false,
      separatePairs: [],
    };
    const result = migrateStorage(current, CURRENT_VERSION);
    expect(result).toBe(current);
  });

  it('estado descartado nunca tem campo undefined/NaN chegando adiante (shape sempre válido)', () => {
    const result = migrateStorage(undefined, 1);
    expect(Array.isArray(result.players)).toBe(true);
    expect(typeof result.neverScaleGoalkeepers).toBe('boolean');
    expect(typeof result.generateTestPlayersOnEmpty).toBe('boolean');
    expect(typeof result.maxSixLinePlayers).toBe('boolean');
    expect(Array.isArray(result.separatePairs)).toBe(true);
  });
});
