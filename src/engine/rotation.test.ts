import { describe, it, expect } from 'vitest';
import type { Player } from '../domain/types';
import type { BalancedTeam, BalancedSlot } from './balance';
import { deriveAttributesFromStar, deriveGkFromStar } from '../domain/deriveAttributes';
import { BOX_TO_BOX, allEnabled, type LinePosition } from '../domain/positions';
import { buildTeamSchedule, applyGame1GoalkeeperRule } from './rotation';

let idc = 0;
const P = (name: string, position: Player['position'], rating: number, o: Partial<Player> = {}): Player => ({
  id: `${name}-${++idc}`, name, active: true, isGoalkeeper: false, position, rating,
  attributes: deriveAttributesFromStar(rating, position), gk: null, acceptedPositions: allEnabled([BOX_TO_BOX]), ...o,
});
const GK = (name: string, rating: number, o: Partial<Player> = {}): Player =>
  P(name, 'DEFENSOR', rating, { isGoalkeeper: true, gk: deriveGkFromStar(rating, true), ...o });
const only = (pos: LinePosition) => allEnabled([pos]);

const slot = (p: Player): BalancedSlot => ({ player: p, role: 'VOLANTE', zone: 'MEI', fit: 60, x: 50, y: 50 });
const team = (over: Partial<BalancedTeam>): BalancedTeam => ({
  id: 1, name: 'T', formation: 'REFERENCIA', slots: [], goalkeeper: null, fieldsGoalkeeper: false,
  rotatingGoalkeepers: [], bench: [],
  metrics: { geral: 60, off: 60, def: 60, recuo: 60, pressao: 60, cobertura: null, fitQuality: 60, feasible: true },
  ...over,
});

describe('buildTeamSchedule (rodízio de 6 jogos)', () => {
  it('2 goleiros + banco: 6 jogos, fila de goleiro best-first, banco worst-first', () => {
    const gk1 = GK('GK1', 4);
    const gk2 = GK('GK2', 3);
    const line = [gk2, P('L1', 'MEIA', 4), P('L2', 'MEIA', 2), P('L3', 'ATACANTE', 3), P('L4', 'DEFENSOR', 4), P('L5', 'MEIA', 3)];
    const bench = [P('B1', 'MEIA', 1), P('B2', 'ATACANTE', 5)];
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: gk1, fieldsGoalkeeper: true, rotatingGoalkeepers: ['GK1', 'GK2'], bench }),
      6,
    );
    expect(sch.constant).toBe(false);
    expect(sch.games).toHaveLength(6);
    expect(sch.games.every((g) => g.slots.length === 6)).toBe(true);
    expect(sch.games.every((g) => !g.benchNames.includes(gk1.name) && !g.benchNames.includes(gk2.name))).toBe(true);
    expect(sch.games.every((g) => g.benchNames.length === 2)).toBe(true);
    // fila alterna entre os 2 goleiros aptos ao longo dos jogos
    const goalieNames = new Set(sch.games.map((g) => g.goalkeeperName));
    expect(goalieNames.size).toBe(2);
  });

  it('1 goleiro e sem banco: constante ("Jogo 1 ao 6")', () => {
    const gk = GK('GK', 4);
    const line = [P('C1', 'DEFENSOR', 3), P('C2', 'MEIA', 3), P('C3', 'MEIA', 3), P('C4', 'MEIA', 3), P('C5', 'ATACANTE', 3), P('C6', 'ATACANTE', 3)];
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: gk, fieldsGoalkeeper: true, rotatingGoalkeepers: ['GK'], bench: [] }),
      6,
    );
    expect(sch.constant).toBe(true);
    expect(sch.games).toHaveLength(1);
  });
});

describe('applyGame1GoalkeeperRule (Fase 6 — Jogo 1 nunca escala um atacante no gol)', () => {
  it('move o primeiro não-atacante pra frente da fila, preservando a ordem dos demais', () => {
    const atacante = GK('Atacante-GK', 5, { acceptedPositions: only("PIVO") });
    const zagueiro = GK('Zagueiro-GK', 3, { acceptedPositions: only("FIXO") });
    const lateral = GK('Lateral-GK', 4, { acceptedPositions: only("LATERAL") });
    // fila best-first original: atacante(5), lateral(4), zagueiro(3)
    const { queue, warning } = applyGame1GoalkeeperRule([atacante, lateral, zagueiro]);
    expect(warning).toBeNull();
    expect(queue[0].name).toBe('Lateral-GK'); // primeiro não-atacante vai pra frente
    expect(queue.slice(1).map((p) => p.name)).toEqual(['Atacante-GK', 'Zagueiro-GK']); // ordem relativa preservada
  });

  it('sem mudança quando o melhor já é não-atacante', () => {
    const zagueiro = GK('Zagueiro-GK', 5, { acceptedPositions: only("FIXO") });
    const atacante = GK('Atacante-GK', 4, { acceptedPositions: only("PIVO") });
    const { queue, warning } = applyGame1GoalkeeperRule([zagueiro, atacante]);
    expect(warning).toBeNull();
    expect(queue.map((p) => p.name)).toEqual(['Zagueiro-GK', 'Atacante-GK']);
  });

  it('avisa explicitamente quando TODOS os goleiros aptos são atacantes', () => {
    const a1 = GK('A1', 5, { acceptedPositions: only("PIVO") });
    const a2 = GK('A2', 4, { acceptedPositions: only("SEGUNDO_ATACANTE") });
    const { queue, warning } = applyGame1GoalkeeperRule([a1, a2]);
    expect(warning).not.toBeNull();
    expect(queue.map((p) => p.name)).toEqual(['A1', 'A2']); // não reordena, mas avisa
  });

  it('fila vazia não gera aviso', () => {
    expect(applyGame1GoalkeeperRule([])).toEqual({ queue: [], warning: null });
  });
});
