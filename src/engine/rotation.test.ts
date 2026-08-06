import { describe, it, expect } from 'vitest';
import type { Player } from '../domain/types';
import type { BalancedTeam, BalancedSlot } from './balance';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled, type LinePosition } from '../domain/positions';
import { buildTeamSchedule, applyGame1GoalkeeperRule, gamesForTeamCount, clampLateArrivals } from './rotation';

/** Vetor UNIFORME (0–100): fixture direta de atributos, sem estrela nem derivação. */
const flatAttrs = (overall: number): AttrVector => {
  const v = clampAttr(overall);
  return { FIN: v, CRI: v, DRI: v, DEF: v, VEL: v, RCD: v, INT: v, MOV: v, FIS: v, OFE: v };
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

  it('defesa própria: elenco de 6 (sem banco, sem goleiro reservado) NUNCA reveza goleiro próprio, mesmo se `fieldsGoalkeeper` vier true por engano', () => {
    // Bug relatado pelo dono ("revezando goleiro e ficando com 5 na linha"):
    // a causa raiz foi corrigida em `balance.ts` (`fielding` agora exige
    // elenco >= MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER), mas este teste cobre a
    // defesa PRÓPRIA de `buildTeamSchedule` (é chamado com um `BalancedTeam`
    // já pronto vindo de fora — UI/exportação de imagem — então não deve
    // confiar cegamente em `team.fieldsGoalkeeper` sem reconferir o tamanho
    // do elenco): mesmo passando `fieldsGoalkeeper: true` (valor ERRADO) num
    // time de 6, o rodízio nunca escala o goleiro do elenco nem produz menos
    // de 6 na linha.
    const gkApto = GK('GK-Apto', 80);
    const line = [gkApto, P('L1', 'MEIA', 60), P('L2', 'MEIA', 60), P('L3', 'DEFENSOR', 60), P('L4', 'DEFENSOR', 60), P('L5', 'ATACANTE', 60)];
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: true, rotatingGoalkeepers: ['GK-Apto'], bench: [] }),
      6,
    );
    for (const g of sch.games) {
      expect(g.slots.length).toBe(6);
      expect(g.goalkeeperName).toBeNull();
      expect(g.benchNames).toHaveLength(0);
    }
    expect(sch.benchRuleBroken).toBe(false);
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

describe('clampLateArrivals', () => {
  it('sem entradas = mapa vazio', () => {
    expect(clampLateArrivals(undefined, 6).size).toBe(0);
    expect(clampLateArrivals([], 6).size).toBe(0);
  });

  it('rejeita games não-inteiro e < 1', () => {
    const m = clampLateArrivals(
      [
        { playerId: 'a', games: 2.5 },
        { playerId: 'b', games: 0 },
        { playerId: 'c', games: -1 },
        { playerId: 'd', games: 2 },
      ],
      6,
    );
    expect(m.has('a')).toBe(false);
    expect(m.has('b')).toBe(false);
    expect(m.has('c')).toBe(false);
    expect(m.get('d')).toBe(2);
  });

  it('limita a totalGames - 1 (nunca zera o jogador da pelada inteira em silêncio)', () => {
    const m = clampLateArrivals([{ playerId: 'a', games: 100 }], 6);
    expect(m.get('a')).toBe(5);
  });

  it('com totalGames=1, o clamp zera o valor e a entrada é descartada (0 não é ausência válida)', () => {
    const m = clampLateArrivals([{ playerId: 'a', games: 3 }], 1);
    expect(m.has('a')).toBe(false);
  });

  it('valor dentro do limite passa intacto', () => {
    const m = clampLateArrivals([{ playerId: 'a', games: 3 }], 6);
    expect(m.get('a')).toBe(3);
  });
});

describe('buildTeamSchedule + atrasados (LateArrival) — não é banco, é ausência', () => {
  const buildLateRoster = () => {
    const line = [
      P('L1', 'MEIA', 80), P('L2', 'MEIA', 60), P('L3', 'MEIA', 60),
      P('L4', 'DEFENSOR', 80), P('L5', 'DEFENSOR', 60), P('L6', 'ATACANTE', 60),
    ];
    const bench = [P('B1', 'MEIA', 60), P('B2', 'ATACANTE', 60), P('B3', 'DEFENSOR', 60)];
    return { line, bench };
  };

  it('atrasado NÃO é escalado nas N primeiras rodadas e ENTRA exatamente na rodada N+1 (`arrivals`)', () => {
    const { line, bench } = buildLateRoster();
    const lateArrivals = new Map([[bench[0].id, 2]]); // B1 ausente nos jogos 1 e 2, entra no jogo 3
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6, undefined, false, lateArrivals,
    );
    expect(sch.games[0].arrivals).toEqual([]);
    expect(sch.games[1].arrivals).toEqual([]);
    expect(sch.games[2].arrivals).toEqual(['B1']);
    expect(sch.games.slice(3).every((g) => g.arrivals.length === 0)).toBe(true);
    // Nunca escalado (linha nem banco) enquanto ausente.
    expect(sch.games[0].slots.some((s) => s.player.name === 'B1')).toBe(false);
    expect(sch.games[1].slots.some((s) => s.player.name === 'B1')).toBe(false);
    expect(sch.games[0].benchNames).not.toContain('B1');
    expect(sch.games[1].benchNames).not.toContain('B1');
  });

  it('nas rodadas de ausência, o nome dele NÃO está em `benchNames` (contagem acumulada de banco continua ZERO)', () => {
    const { line, bench } = buildLateRoster();
    const lateArrivals = new Map([[bench[0].id, 2]]);
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6, undefined, false, lateArrivals,
    );
    const benchAppearancesWhileAbsent = sch.games.slice(0, 2).filter((g) => g.benchNames.includes('B1')).length;
    expect(benchAppearancesWhileAbsent).toBe(0);
  });

  it('a ausência do atrasado NÃO dispara a regra estrita do banco — a divisão continua válida', () => {
    const { line, bench } = buildLateRoster();
    const lateArrivals = new Map([[bench[0].id, 2]]);
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6, undefined, false, lateArrivals,
    );
    expect(sch.benchRuleBroken).toBe(false);
    expect(sch.lineShortfall).toBeNull();
  });

  it('depois de entrar, a regra estrita do banco (ninguém repete 2 rodadas seguidas) continua valendo pra TODO MUNDO', () => {
    const { line, bench } = buildLateRoster();
    const lateArrivals = new Map([[bench[0].id, 2]]);
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6, undefined, false, lateArrivals,
    );
    // A partir da rodada de chegada (índice 2), a regra estrita se aplica a
    // TODO MUNDO, inclusive quem chegou — nunca repete banco em rodadas seguidas.
    for (let i = 3; i < sch.games.length; i++) {
      const prevBench = new Set(sch.games[i - 1].benchNames);
      for (const name of sch.games[i].benchNames) expect(prevBench.has(name)).toBe(false);
    }
    // MUDANÇA DE COMPORTAMENTO (pedido do dono): quem chega atrasado é a
    // ÚLTIMA escolha pro banco, enquanto houver alternativa elegível. Neste
    // roster (9 outfielders no total, banco de 3 por rodada — B1 é o único
    // atrasado, sobram sempre 8 não-atrasados de sobra) NUNCA falta
    // alternativa, então B1 nunca precisa sentar — ver o teste de roster
    // APERTADO abaixo pra cobrir o caso em que ele é forçado.
    const benchedAfterArrival = sch.games.slice(2).some((g) => g.benchNames.includes('B1'));
    expect(benchedAfterArrival).toBe(false);
  });

  it('atrasado é a ÚLTIMA escolha pro banco: logo após chegar, senta OUTRO enquanto houver alternativa (roster com sobra de não-atrasados)', () => {
    const { line, bench } = buildLateRoster();
    const lateArrivals = new Map([[bench[0].id, 2]]); // B1 chega no jogo 3 (índice 2)
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6, undefined, false, lateArrivals,
    );
    // Nas rodadas imediatamente seguintes à chegada, com 8 não-atrasados
    // disputando 3 vagas de banco, sempre existe alternativa — B1 nunca é
    // escolhido.
    expect(sch.games[2].benchNames).not.toContain('B1');
    expect(sch.games[3].benchNames).not.toContain('B1');
    // E, ao final, a contagem TOTAL de banco dos outros continua justa entre
    // si (a exclusão de B1 do pool não quebra a justiça (b) dos demais).
    const counts = new Map<string, number>();
    for (const g of sch.games) for (const name of g.benchNames) counts.set(name, (counts.get(name) ?? 0) + 1);
    const nonLateCounts = [...counts.entries()].filter(([name]) => name !== 'B1').map(([, c]) => c);
    expect(Math.max(...nonLateCounts) - Math.min(...nonLateCounts)).toBeLessThanOrEqual(1);
  });

  it('atrasado SEM alternativa suficiente: quando o banco só fecha com ele, ele senta (não é inviabilidade) — e as idas dele se concentram nas ÚLTIMAS rodadas possíveis', () => {
    // Roster APERTADO (pedido do dono, teste de concentração no fim): 6 de
    // linha + 1 banco NÃO atrasado + 1 banco ATRASADO (chega no jogo 3,
    // índice 2) — outfielders=8, benchCount=2. Com só 1 não-atrasado extra
    // (fora dos 6 de linha, que também são outfielders aqui — fieldsGoalkeeper
    // false), a partir da rodada de chegada o pool de não-atrasados
    // frequentemente não fecha as 2 vagas sozinho (regra estrita exclui quem
    // sentou na rodada anterior), forçando o atrasado a entrar — mas ele é
    // SEMPRE a última escolha: só senta quando não sobra não-atrasado
    // elegível.
    const line = [
      P('L1', 'MEIA', 80), P('L2', 'MEIA', 60), P('L3', 'MEIA', 60),
      P('L4', 'DEFENSOR', 80), P('L5', 'DEFENSOR', 60), P('L6', 'ATACANTE', 60),
    ];
    const bench = [P('B1', 'MEIA', 60), P('B2', 'ATACANTE', 60)];
    const lateArrivals = new Map([[bench[1].id, 2]]); // B2 chega no jogo 3 (índice 2)
    const totalGames = 9;
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      totalGames, undefined, false, lateArrivals,
    );
    expect(sch.benchRuleBroken).toBe(false); // forçar o atrasado no banco NÃO é inviabilidade
    // Ele nunca senta ENQUANTO ausente (jogos 1–2, índices 0–1).
    expect(sch.games[0].benchNames).not.toContain('B2');
    expect(sch.games[1].benchNames).not.toContain('B2');
    // Alguma rodada eventualmente força B2 (pool apertado) — sem isso o
    // teste não estaria cobrindo o caso "sem alternativa" pedido.
    const benchB2Rounds = sch.games
      .map((g, i) => (g.benchNames.includes('B2') ? i : -1))
      .filter((i) => i >= 0);
    expect(benchB2Rounds.length).toBeGreaterThan(0);
    // Concentração no fim (greedy por rodada, sem lookahead — ver comentário
    // em `benchRotation.ts`): a PRIMEIRA vez que B2 senta não é logo depois
    // de chegar (rodada 2) — outro senta primeiro enquanto há alternativa.
    expect(benchB2Rounds[0]).toBeGreaterThan(2);
    // A concentração no fim é MÁXIMA neste roster apertado: a única vez que
    // B2 senta é na ÚLTIMA rodada possível do rodízio (9 jogos, índice 8) —
    // greedy sem lookahead ainda assim empurra ele até o limite.
    expect(benchB2Rounds).toEqual([totalGames - 1]);
    // A contagem TOTAL dele no fim não fica absurdamente menor que a dos
    // outros — a semeadura o EQUIPARA (não o isenta): ele entra já valendo o
    // maior valor do time no momento da chegada. Não fica ISENTO (>0), e a
    // diferença pro topo não é descolada da realidade de quem chegou 2 jogos
    // depois de todo mundo (ele só teve 7 das 9 rodadas disponíveis).
    const counts = new Map<string, number>();
    for (const g of sch.games) for (const name of g.benchNames) counts.set(name, (counts.get(name) ?? 0) + 1);
    const allCounts = [...counts.values()];
    expect(counts.get('B2') ?? 0).toBeGreaterThan(0);
    expect(Math.max(...allCounts) - (counts.get('B2') ?? 0)).toBeLessThanOrEqual(2);
  });

  it('um time SEM atrasados produz exatamente o mesmo resultado de antes (sem regressão)', () => {
    const { line, bench } = buildLateRoster();
    const withoutMap = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6,
    );
    const withEmptyMap = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench }),
      6, undefined, false, new Map(),
    );
    expect(withEmptyMap.games.map((g) => g.benchNames)).toEqual(withoutMap.games.map((g) => g.benchNames));
    expect(withEmptyMap.games.every((g) => g.arrivals.length === 0)).toBe(true);
  });
});

// Bug relatado pelo dono (2ª volta do mesmo sintoma "5 na linha"): elenco
// real de 21 jogadores / 3 times = 7 cada. Um jogador (aqui "Leo") está
// marcado com 2 jogos de ausência. A 1ª correção (limiar do ELENCO COMPLETO)
// não bastou porque ela olhava só pro tamanho do elenco (7, que passa o
// limiar), ignorando que em rodadas específicas só 6 estão DISPONÍVEIS por
// causa do atraso — o time seguia revezando goleiro próprio e sobrava com 5
// na linha. A correção AGORA é por rodada: `MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER`
// passa a ser checado contra quem está disponível NAQUELA rodada.
describe('buildTeamSchedule — reprodução exata do bug relatado (elenco 7, 1 atrasado 2 jogos)', () => {
  const buildTeamDeSete = () => {
    const gk1 = GK('Leo', 70); // o atrasado é justamente um goleiro apto, pior caso
    const gk2 = GK('Rui', 60);
    const line = [
      gk2, P('L1', 'MEIA', 80), P('L2', 'MEIA', 70), P('L3', 'MEIA', 60),
      P('L4', 'DEFENSOR', 80), P('L5', 'DEFENSOR', 60),
    ];
    const bench: Player[] = [];
    return { gk1, line, bench };
  };

  it('jogos 1 e 2 (ausência do Leo): 6 disponíveis, TODOS na linha, goleiro emprestado — NUNCA menos de 6 na linha', () => {
    const { gk1, line, bench } = buildTeamDeSete();
    const lateArrivals = new Map([[gk1.id, 2]]);
    const sch = buildTeamSchedule(
      team({
        slots: line.map(slot), goalkeeper: gk1, fieldsGoalkeeper: true,
        rotatingGoalkeepers: ['Leo', 'Rui'], bench,
      }),
      6, undefined, false, lateArrivals,
    );
    for (const g of sch.games.slice(0, 2)) {
      expect(g.slots.length).toBe(6); // nunca 5 na linha — o bug original
      expect(g.goalkeeperName).toBeNull(); // goleiro emprestado nestas 2 rodadas
      expect(g.slots.some((s) => s.player.name === 'Leo')).toBe(false); // Leo nem em campo (ausente)
    }
  });

  it('jogo 3 em diante (Leo chegou, 7 disponíveis): volta a revezar goleiro próprio, 6 na linha + 1 no gol', () => {
    const { gk1, line, bench } = buildTeamDeSete();
    const lateArrivals = new Map([[gk1.id, 2]]);
    const sch = buildTeamSchedule(
      team({
        slots: line.map(slot), goalkeeper: gk1, fieldsGoalkeeper: true,
        rotatingGoalkeepers: ['Leo', 'Rui'], bench,
      }),
      6, undefined, false, lateArrivals,
    );
    for (const g of sch.games.slice(2)) {
      expect(g.slots.length).toBe(6);
      expect(g.goalkeeperName).not.toBeNull(); // goleiro PRÓPRIO revezando de novo
    }
    // Chegada registrada exatamente no jogo 3 (índice 2).
    expect(sch.games[2].arrivals).toEqual(['Leo']);
  });

  it('NENHUMA rodada, em NENHUM caminho, tem menos de 6 na linha', () => {
    const { gk1, line, bench } = buildTeamDeSete();
    const lateArrivals = new Map([[gk1.id, 2]]);
    const sch = buildTeamSchedule(
      team({
        slots: line.map(slot), goalkeeper: gk1, fieldsGoalkeeper: true,
        rotatingGoalkeepers: ['Leo', 'Rui'], bench,
      }),
      6, undefined, false, lateArrivals,
    );
    expect(sch.games).toHaveLength(6);
    for (const g of sch.games) expect(g.slots.length).toBe(6);
    expect(sch.benchRuleBroken).toBe(false);
    expect(sch.lineShortfall).toBeNull();
  });

  it('regressão — MESMO time de 7 SEM atrasado nenhum: revezamento de goleiro próprio em TODAS as rodadas, sem regressão', () => {
    const { gk1, line, bench } = buildTeamDeSete();
    const sch = buildTeamSchedule(
      team({
        slots: line.map(slot), goalkeeper: gk1, fieldsGoalkeeper: true,
        rotatingGoalkeepers: ['Leo', 'Rui'], bench,
      }),
      6,
    );
    for (const g of sch.games) {
      expect(g.slots.length).toBe(6);
      expect(g.goalkeeperName).not.toBeNull();
    }
  });

  it('regressão — time de 6 (sem banco, sem goleiro reservado) continua igual a hoje: nunca reveza goleiro próprio', () => {
    const line = [
      GK('GK-Unico', 80), P('L1', 'MEIA', 60), P('L2', 'MEIA', 60),
      P('L3', 'DEFENSOR', 60), P('L4', 'DEFENSOR', 60), P('L5', 'ATACANTE', 60),
    ];
    const sch = buildTeamSchedule(
      team({ slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: false, rotatingGoalkeepers: [], bench: [] }),
      6,
    );
    for (const g of sch.games) {
      expect(g.slots.length).toBe(6);
      expect(g.goalkeeperName).toBeNull();
    }
  });
});

describe('fila de goleiros — atrasado vai pro FIM (pedido do dono, com precedência da regra do Jogo 1)', () => {
  it('goleiro atrasado só aparece no gol nas ÚLTIMAS rodadas do rodízio (nunca logo após chegar, havendo alternativa) e nunca durante a ausência', () => {
    // 3 goleiros aptos, todos DISPONÍVEIS o tempo todo exceto GK3 (atrasado 2
    // jogos) — sem banco, elenco de 9 (3 goleiros + 6 de linha) pra garantir
    // capacidade estrutural (>=7) com sobra.
    const gk1 = GK('GK1-Melhor', 90);
    const gk2 = GK('GK2-Bom', 80);
    const gk3 = GK('GK3-Atrasado', 100); // de propósito, o MELHOR goleiro — não deveria adiantar nada
    const line = [
      gk1, gk2, gk3, P('L1', 'MEIA', 60), P('L2', 'MEIA', 60), P('L3', 'DEFENSOR', 60),
      P('L4', 'DEFENSOR', 60), P('L5', 'ATACANTE', 60), P('L6', 'ATACANTE', 60),
    ];
    const lateArrivals = new Map([[gk3.id, 2]]); // GK3 chega no jogo 3 (índice 2)
    const sch = buildTeamSchedule(
      team({
        slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: true,
        rotatingGoalkeepers: ['GK1-Melhor', 'GK2-Bom', 'GK3-Atrasado'], bench: [],
      }),
      6, undefined, false, lateArrivals,
    );
    // Nunca no gol enquanto ausente (jogos 1–2, índices 0–1).
    expect(sch.games[0].goalkeeperName).not.toBe('GK3-Atrasado');
    expect(sch.games[1].goalkeeperName).not.toBe('GK3-Atrasado');
    // Logo após chegar (jogo 3, índice 2) — havendo alternativa (GK1/GK2
    // disponíveis) — NÃO é ele quem abre no gol.
    expect(sch.games[2].goalkeeperName).not.toBe('GK3-Atrasado');
    // Ele só aparece no gol (se aparecer) nas rodadas finais do rodízio.
    const gk3Rounds = sch.games
      .map((g, i) => (g.goalkeeperName === 'GK3-Atrasado' ? i : -1))
      .filter((i) => i >= 0);
    for (const r of gk3Rounds) expect(r).toBeGreaterThanOrEqual(sch.games.length - 2);
  });

  it('regra do Jogo 1 tem PRECEDÊNCIA sobre o critério de atraso: se o único não-atacante apto é o atrasado, ele pode abrir mesmo assim (mas só quando disponível)', () => {
    // Só 2 goleiros aptos: um atacante (não-atrasado) e um não-atacante
    // (atrasado). A regra do Jogo 1 preferiria o não-atacante, mas ele está
    // ausente no jogo 1 — então, NESSA rodada específica, o atacante (única
    // alternativa disponível) tem que jogar no gol; a fila só reflete a
    // PREFERÊNCIA de ordem, a disponibilidade por rodada decide quem de fato
    // está lá.
    // Elenco de 8 (e não 7): a ausência de 1 jogador no jogo 1 tem de deixar
    // 7 disponíveis (>= MIN_ROSTER_TO_ROTATE_OWN_GOALKEEPER) — senão o time
    // simplesmente EMPRESTA o goleiro naquela rodada (ver bug principal
    // acima) e este teste não estaria isolando a regra de precedência que
    // quer cobrir.
    const atacanteGk = GK('Atacante-GK', 60, { acceptedPositions: only('PIVO') });
    const zagueiroGkAtrasado = GK('Zagueiro-GK-Atrasado', 90, { acceptedPositions: only('FIXO') });
    const line = [
      atacanteGk, zagueiroGkAtrasado, P('L1', 'MEIA', 60), P('L2', 'MEIA', 60),
      P('L3', 'DEFENSOR', 60), P('L4', 'DEFENSOR', 60), P('L5', 'ATACANTE', 60), P('L6', 'ATACANTE', 60),
    ];
    const lateArrivals = new Map([[zagueiroGkAtrasado.id, 1]]); // ausente só no jogo 1
    const sch = buildTeamSchedule(
      team({
        slots: line.map(slot), goalkeeper: null, fieldsGoalkeeper: true,
        rotatingGoalkeepers: ['Atacante-GK', 'Zagueiro-GK-Atrasado'], bench: [],
      }),
      6, undefined, false, lateArrivals,
    );
    expect(sch.goalkeeperWarning).toBeNull(); // não é "sem alternativa" — o não-atacante existe, só está ausente
    expect(sch.games[0].goalkeeperName).toBe('Atacante-GK'); // única alternativa disponível no jogo 1
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
