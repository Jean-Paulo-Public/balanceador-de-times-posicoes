import { describe, it, expect } from 'vitest';
import type { Player } from '../domain/types';
import type { BalancedTeam, BalancedSlot } from './balance';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled, type LinePosition } from '../domain/positions';
import { buildTeamSchedule, applyGame1GoalkeeperRule } from './rotation';

/** Vetor UNIFORME (0–100): fixture direta de atributos, sem estrela nem derivação. */
const flatAttrs = (overall: number): AttrVector => {
  const v = clampAttr(overall);
  return { FIN: v, CRI: v, DRI: v, DEF: v, VEL: v, RCD: v, INT: v, MOV: v, FIS: v };
};

let idc = 0;
const P = (name: string, position: Player['position'], overall: number, o: Partial<Player> = {}): Player => ({
  id: `${name}-${++idc}`, name, active: true, isGoalkeeper: false, position,
  attributes: flatAttrs(overall), gk: null, acceptedPositions: allEnabled([BOX_TO_BOX]), ...o,
});
const GK = (name: string, overall: number, o: Partial<Player> = {}): Player =>
  P(name, 'DEFENSOR', overall, { isGoalkeeper: true, gk: clampAttr(overall), ...o });
const only = (pos: LinePosition) => allEnabled([pos]);

const slot = (p: Player): BalancedSlot => ({ player: p, role: 'VOLANTE', zone: 'MEI', fit: 60, x: 50, y: 50 });
const team = (over: Partial<BalancedTeam>): BalancedTeam => ({
  id: 1, name: 'T', formation: 'REFERENCIA', slots: [], goalkeeper: null, fieldsGoalkeeper: false,
  rotatingGoalkeepers: [], bench: [],
  metrics: { geral: 60, off: 60, def: 60, recuo: 60, pressao: 60, cobertura: null, fitQuality: 60, feasible: true },
  ...over,
});

describe('buildTeamSchedule (rodízio de 6 jogos)', () => {
  it('2 goleiros + banco (2, regra hard): 6 jogos, fila de goleiro best-first, ninguém repete banco em rodadas seguidas', () => {
    const gk1 = GK('GK1', 80);
    const gk2 = GK('GK2', 60);
    const line = [gk2, P('L1', 'MEIA', 80), P('L2', 'MEIA', 40), P('L3', 'ATACANTE', 60), P('L4', 'DEFENSOR', 80), P('L5', 'MEIA', 60)];
    const bench = [P('B1', 'MEIA', 20), P('B2', 'ATACANTE', 100)];
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
    // banco de 2 (<= HARD_NO_REPEAT_MAX_BENCH_SIZE): regra hard — ninguém repete banco em rodadas consecutivas.
    for (let i = 1; i < sch.games.length; i++) {
      const prevBench = new Set(sch.games[i - 1].benchNames);
      const curBench = new Set(sch.games[i].benchNames);
      for (const name of curBench) expect(prevBench.has(name)).toBe(false);
    }
    expect(sch.benchWarning).toBeNull();
  });

  it('banco grande (3, > limiar): repetir banco em rodadas seguidas é permitido, mas a contagem acumulada fica equilibrada', () => {
    // fieldsGoalkeeper=false -> outfielders = roster inteiro; onField=6; com 9
    // outfielders o banco fica com 3 (> HARD_NO_REPEAT_MAX_BENCH_SIZE=2).
    const line = [
      P('L1', 'MEIA', 80), P('L2', 'MEIA', 60), P('L3', 'MEIA', 60),
      P('L4', 'DEFENSOR', 80), P('L5', 'DEFENSOR', 60), P('L6', 'ATACANTE', 60),
    ];
    const bench = [P('B1', 'MEIA', 60), P('B2', 'ATACANTE', 60), P('B3', 'DEFENSOR', 60)];
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6,
    );
    expect(sch.constant).toBe(false);
    expect(sch.games.every((g) => g.benchNames.length === 3)).toBe(true);
    expect(sch.benchWarning).toBeNull();
    // Ao longo de 6 jogos x 3 vagas de banco / 9 jogadores, a distribuição
    // acumulada de idas ao banco deve ficar equilibrada (diferença pequena).
    const benchCounts = new Map<string, number>();
    for (const g of sch.games) for (const name of g.benchNames) benchCounts.set(name, (benchCounts.get(name) ?? 0) + 1);
    const values = [...benchCounts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it('times com bancos de tamanhos DIFERENTES na mesma simulação aplicam sua PRÓPRIA regra (limiar é por time)', () => {
    // Time pequeno: banco de 2 (regra hard). Time grande: banco de 4 (regra relaxada).
    const smallLine = [
      P('S1', 'MEIA', 80), P('S2', 'MEIA', 60), P('S3', 'MEIA', 60),
      P('S4', 'DEFENSOR', 80), P('S5', 'DEFENSOR', 60), P('S6', 'ATACANTE', 60),
    ];
    const smallBench = [P('SB1', 'MEIA', 60), P('SB2', 'ATACANTE', 60)];
    const smallTeam = team({ slots: smallLine.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench: smallBench });
    const smallSchedule = buildTeamSchedule(smallTeam, 6);
    expect(smallSchedule.games.every((g) => g.benchNames.length === 2)).toBe(true);
    for (let i = 1; i < smallSchedule.games.length; i++) {
      const prevBench = new Set(smallSchedule.games[i - 1].benchNames);
      for (const name of smallSchedule.games[i].benchNames) expect(prevBench.has(name)).toBe(false);
    }

    const bigLine = [
      P('G1', 'MEIA', 80), P('G2', 'MEIA', 60), P('G3', 'MEIA', 60),
      P('G4', 'DEFENSOR', 80), P('G5', 'DEFENSOR', 60), P('G6', 'ATACANTE', 60),
    ];
    const bigBench = [P('GB1', 'MEIA', 60), P('GB2', 'ATACANTE', 60), P('GB3', 'DEFENSOR', 60), P('GB4', 'MEIA', 40)];
    const bigTeam = team({ slots: bigLine.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench: bigBench });
    const bigSchedule = buildTeamSchedule(bigTeam, 6);
    expect(bigSchedule.games.every((g) => g.benchNames.length === 4)).toBe(true);
    // banco grande: repetição em rodadas seguidas é permitida — não exigimos ausência de repetição.
    const anyRepeatInBigTeam = bigSchedule.games.slice(1).some((g, i) => {
      const prevBench = new Set(bigSchedule.games[i].benchNames);
      return g.benchNames.some((name) => prevBench.has(name));
    });
    // Não é garantido que aconteça em toda simulação, mas a regra PERMITE — o
    // que importa é que nenhum warning de inviabilidade dispare (a regra hard
    // nem se aplica a este time).
    expect(bigSchedule.benchWarning).toBeNull();
    void anyRepeatInBigTeam;
  });

  it('1 goleiro e sem banco: constante ("Jogo 1 ao 6")', () => {
    const gk = GK('GK', 80);
    const line = [P('C1', 'DEFENSOR', 60), P('C2', 'MEIA', 60), P('C3', 'MEIA', 60), P('C4', 'MEIA', 60), P('C5', 'ATACANTE', 60), P('C6', 'ATACANTE', 60)];
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
    const atacante = GK('Atacante-GK', 100, { acceptedPositions: only("PIVO") });
    const zagueiro = GK('Zagueiro-GK', 60, { acceptedPositions: only("FIXO") });
    const lateral = GK('Lateral-GK', 80, { acceptedPositions: only("LATERAL") });
    // fila best-first original: atacante(100), lateral(80), zagueiro(60)
    const { queue, warning } = applyGame1GoalkeeperRule([atacante, lateral, zagueiro]);
    expect(warning).toBeNull();
    expect(queue[0].name).toBe('Lateral-GK'); // primeiro não-atacante vai pra frente
    expect(queue.slice(1).map((p) => p.name)).toEqual(['Atacante-GK', 'Zagueiro-GK']); // ordem relativa preservada
  });

  it('sem mudança quando o melhor já é não-atacante', () => {
    const zagueiro = GK('Zagueiro-GK', 100, { acceptedPositions: only("FIXO") });
    const atacante = GK('Atacante-GK', 80, { acceptedPositions: only("PIVO") });
    const { queue, warning } = applyGame1GoalkeeperRule([zagueiro, atacante]);
    expect(warning).toBeNull();
    expect(queue.map((p) => p.name)).toEqual(['Zagueiro-GK', 'Atacante-GK']);
  });

  it('avisa explicitamente quando TODOS os goleiros aptos são atacantes', () => {
    const a1 = GK('A1', 100, { acceptedPositions: only("PIVO") });
    const a2 = GK('A2', 80, { acceptedPositions: only("SEGUNDO_ATACANTE") });
    const { queue, warning } = applyGame1GoalkeeperRule([a1, a2]);
    expect(warning).not.toBeNull();
    expect(queue.map((p) => p.name)).toEqual(['A1', 'A2']); // não reordena, mas avisa
  });

  it('fila vazia não gera aviso', () => {
    expect(applyGame1GoalkeeperRule([])).toEqual({ queue: [], warning: null });
  });
});
