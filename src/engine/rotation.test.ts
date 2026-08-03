import { describe, it, expect } from 'vitest';
import type { Player } from '../domain/types';
import type { BalancedTeam, BalancedSlot } from './balance';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled, type LinePosition } from '../domain/positions';
import { buildTeamSchedule, applyGame1GoalkeeperRule, gamesForTeamCount } from './rotation';

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
  it('2 goleiros + banco (2): 6 jogos, fila de goleiro best-first, ninguém repete banco em rodadas seguidas', () => {
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
    // regra estrita — ninguém repete banco em rodadas consecutivas.
    for (let i = 1; i < sch.games.length; i++) {
      const prevBench = new Set(sch.games[i - 1].benchNames);
      const curBench = new Set(sch.games[i].benchNames);
      for (const name of curBench) expect(prevBench.has(name)).toBe(false);
    }
    expect(sch.benchRuleBroken).toBe(false);
  });

  it('banco GRANDE (regra antiga relaxava aqui — NOVA regra estrita NÃO relaxa por tamanho): ninguém repete banco mesmo com banco de 3', () => {
    // fieldsGoalkeeper=false -> outfielders = roster inteiro; onField=6; com 9
    // outfielders o banco fica com 3. N=9 >= 2*B=6, então a regra estrita É
    // satisfazível — e a NOVA regra exige que ela seja sempre respeitada,
    // banco grande ou não.
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
    expect(sch.benchRuleBroken).toBe(false);
    // Regra estrita: NINGUÉM repete banco em rodadas seguidas, mesmo com banco de 3.
    for (let i = 1; i < sch.games.length; i++) {
      const prevBench = new Set(sch.games[i - 1].benchNames);
      const curBench = new Set(sch.games[i].benchNames);
      for (const name of curBench) expect(prevBench.has(name)).toBe(false);
    }
    // Ao longo de 6 jogos x 3 vagas de banco / 9 jogadores, a distribuição
    // acumulada de idas ao banco deve ficar equilibrada (diferença pequena).
    const benchCounts = new Map<string, number>();
    for (const g of sch.games) for (const name of g.benchNames) benchCounts.set(name, (benchCounts.get(name) ?? 0) + 1);
    const values = [...benchCounts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it('times com bancos de tamanhos DIFERENTES na mesma simulação aplicam a MESMA regra estrita (sem limiar por time)', () => {
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
    expect(smallSchedule.benchRuleBroken).toBe(false);

    // Time "grande" (banco de 4, N=10 line+bench outfielders): N >= 2*B(4)=8 —
    // ainda satisfazível pela regra estrita, então TAMBÉM não deve repetir.
    const bigLine = [
      P('G1', 'MEIA', 80), P('G2', 'MEIA', 60), P('G3', 'MEIA', 60),
      P('G4', 'DEFENSOR', 80), P('G5', 'DEFENSOR', 60), P('G6', 'ATACANTE', 60),
    ];
    const bigBench = [P('GB1', 'MEIA', 60), P('GB2', 'ATACANTE', 60), P('GB3', 'DEFENSOR', 60), P('GB4', 'MEIA', 40)];
    const bigTeam = team({ slots: bigLine.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench: bigBench });
    const bigSchedule = buildTeamSchedule(bigTeam, 6);
    expect(bigSchedule.games.every((g) => g.benchNames.length === 4)).toBe(true);
    for (let i = 1; i < bigSchedule.games.length; i++) {
      const prevBench = new Set(bigSchedule.games[i - 1].benchNames);
      for (const name of bigSchedule.games[i].benchNames) expect(prevBench.has(name)).toBe(false);
    }
    expect(bigSchedule.benchRuleBroken).toBe(false);
  });

  it('divisão IMPOSSÍVEL (N < 2*B) sem a exceção ligada: `benchRuleBroken=true` (a divisão deve ser descartada por `balance.ts`)', () => {
    // 5 de linha + 3 de banco = 8 outfielders, banco de 3 por rodada -> N=8,
    // B=3 -> 2*B=6 <= 8? Não serve pra forçar; precisamos de N < 2*B.
    // Usamos banco de 4: N = 5(linha) + 4(banco) = 9 outfielders, B=4,
    // 2*B=8 <= 9 — ainda satisfazível. Forçamos via fieldsGoalkeeper=false e
    // um roster pequeno: 6 de linha + 5 de banco = 11 outfielders, banco=5 ->
    // 2*B=10 <= 11, ainda ok. Precisamos B tal que N < 2B: com onField=6 e
    // roster de tamanho n, B = n-6, então N=n, precisa n < 2*(n-6) => n > 12.
    // Ex.: n=13 -> B=7, 2B=14 > 13 — IMPOSSÍVEL.
    const line = [
      P('L1', 'MEIA', 60), P('L2', 'MEIA', 60), P('L3', 'MEIA', 60),
      P('L4', 'DEFENSOR', 60), P('L5', 'DEFENSOR', 60), P('L6', 'ATACANTE', 60),
    ];
    const bench = Array.from({ length: 7 }, (_, i) => P(`B${i}`, 'MEIA', 60));
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6,
    );
    expect(sch.benchOutfielders).toBe(13);
    expect(sch.benchSlots).toBe(7);
    expect(sch.benchRuleBroken).toBe(true);
  });

  it('a mesma divisão impossível (N < 2*B) fica VIÁVEL quando a exceção do checkbox está ligada', () => {
    // Mesmo roster do teste anterior (N=13, B=7 — o deficit MÍNIMO possível
    // pra um time de 6-a-side): com a exceção ligada, o cooldown de 6 rodadas
    // acumula um "repetente novo" a cada rodada (ver benchRotation.ts) — pra
    // um deficit persistente e um elenco desse tamanho, isso eventualmente
    // volta a travar (ver `benchRuleBroken` do teste seguinte com 9 jogos);
    // aqui usamos um horizonte CURTO (5 rodadas) só pra provar que a exceção
    // realmente FLEXIBILIZA a regra (sem ela, `impossible` já trava na 2ª
    // rodada — ver teste anterior).
    const line = [
      P('L1', 'MEIA', 60), P('L2', 'MEIA', 60), P('L3', 'MEIA', 60),
      P('L4', 'DEFENSOR', 60), P('L5', 'DEFENSOR', 60), P('L6', 'ATACANTE', 60),
    ];
    const bench = Array.from({ length: 7 }, (_, i) => P(`B${i}`, 'MEIA', 60));
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      5,
      undefined,
      true, // allowTwoConsecutive
    );
    expect(sch.benchRuleBroken).toBe(false);
    expect(sch.games).toHaveLength(5);
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

describe('buildTeamSchedule + exceção do checkbox — janela de cooldown de 6 rodadas (2 times, 9 jogos)', () => {
  // NOTA: a duração EXATA de 6 rodadas do cooldown (spend → isento → volta a
  // ser elegível) é coberta em detalhe, de forma determinística, em
  // `benchRotation.test.ts` (testes de `chooseBenchGroup` diretamente — a
  // MESMA função que este arquivo chama a cada rodada). Aqui, a integração
  // com `buildTeamSchedule`/`gamesForTeamCount(2)` (9 jogos) é validada com um
  // roster REAL de 6-a-side (N=13, B=7 — o deficit mínimo possível pra esse
  // formato): o cooldown faz um "repetente novo" se acumular a cada rodada
  // (ver benchRotation.ts), então pra um deficit estrutural PERSISTENTE e um
  // elenco desse tamanho (13 jogadores), a exceção segura a rotação só até a
  // 5ª rodada — na 6ª (Jogo 6, índice 5) o pool de repetentes se esgota de
  // novo e a divisão volta a ficar inviável (`benchRuleBroken=true`), o que é
  // o comportamento CORRETO da Regra 2: o checkbox é um alívio limitado, não
  // uma solução permanente pra um elenco estruturalmente pequeno demais.
  it('com deficit estrutural persistente (N=13, B=7), a exceção segura a rotação por algumas rodadas mas a divisão volta a ficar inviável depois (não é solução permanente)', () => {
    const line = [
      P('L1', 'MEIA', 60), P('L2', 'MEIA', 60), P('L3', 'MEIA', 60),
      P('L4', 'DEFENSOR', 60), P('L5', 'DEFENSOR', 60), P('L6', 'ATACANTE', 60),
    ];
    const bench = Array.from({ length: 7 }, (_, i) => P(`B${i}`, 'MEIA', 60));
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      gamesForTeamCount(2), // 9 jogos
      undefined,
      true, // allowTwoConsecutive
    );
    expect(sch.games).toHaveLength(9);

    // Jogos 1–5 (índices 0–4): a exceção segura a rotação — ninguém repete
    // banco em rodadas SEM contar com o crédito, e quem gasta o crédito
    // (aparece no banco em 2 jogos seguidos) fica de fora do banco enquanto
    // durar o cooldown dentro dessa janela computável.
    const bench0 = new Set(sch.games[0].benchNames);
    const bench1 = sch.games[1].benchNames;
    const spender = bench1.find((name) => bench0.has(name));
    expect(spender).toBeDefined(); // a regra estrita sozinha não fecha o banco de 7 com só 13 outfielders — precisa da exceção já na 2ª rodada.
    for (let i = 2; i <= 4; i++) {
      expect(sch.games[i].benchNames).not.toContain(spender);
    }

    // Eventualmente (deficit persistente + cooldown de 6 rodadas acumulando
    // repetentes) a divisão volta a ficar inviável — a exceção NÃO é uma
    // solução permanente pra um elenco pequeno com deficit estrutural.
    expect(sch.benchRuleBroken).toBe(true);
  });
});

describe('gamesForTeamCount (9 jogos só com 2 times)', () => {
  it('2 times => 9 jogos; 3 ou mais => 6', () => {
    expect(gamesForTeamCount(2)).toBe(9);
    expect(gamesForTeamCount(3)).toBe(6);
    expect(gamesForTeamCount(4)).toBe(6);
  });

  it('o rodízio realmente produz 9 jogos quando pedido (e os 3 extras não são cópias)', () => {
    const line = [
      P('L1', 'MEIA', 80), P('L2', 'MEIA', 60), P('L3', 'MEIA', 60),
      P('L4', 'DEFENSOR', 80), P('L5', 'DEFENSOR', 60), P('L6', 'ATACANTE', 60),
    ];
    const bench = [P('B1', 'MEIA', 60), P('B2', 'ATACANTE', 60), P('B3', 'DEFENSOR', 60)];
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      gamesForTeamCount(2),
    );
    expect(sch.games).toHaveLength(9);
    expect(sch.games.map((g) => g.game)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Os jogos 7–9 entram na conta de idas ao banco como qualquer outro: com 9
    // rodadas × 3 vagas / 9 jogadores, a distribuição fica exatamente 3 cada.
    const counts = new Map<string, number>();
    for (const g of sch.games) for (const n of g.benchNames) counts.set(n, (counts.get(n) ?? 0) + 1);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
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
