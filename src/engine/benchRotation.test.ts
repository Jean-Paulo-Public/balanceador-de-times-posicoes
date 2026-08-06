import { describe, it, expect } from 'vitest';
import type { Player } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import { chooseBenchGroup, BENCH_EXCEPTION_COOLDOWN_ROUNDS } from './benchRotation';

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

const counts = (players: Player[], value = 0): Map<string, number> =>
  new Map(players.map((p) => [p.id, value]));

describe('chooseBenchGroup — regra (a) ESTRITA, SEM EXCEÇÃO DE TAMANHO (nova regra)', () => {
  it('banco de 1: quem sentou na rodada anterior não pode sentar de novo', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id]);
    const { benched, impossible, spentExceptionIds } = chooseBenchGroup({
      outfielders: players,
      benchCount: 1,
      benchCounts: counts(players),
      benchedLastRound,
    });
    expect(impossible).toBe(false);
    expect(spentExceptionIds).toEqual([]);
    expect(benched.map((p) => p.id)).not.toContain(players[0].id);
  });

  it('banco de 2: regra estrita vale igual — ninguém do banco anterior repete', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id, players[1].id]);
    const { benched, impossible } = chooseBenchGroup({
      outfielders: players,
      benchCount: 2,
      benchCounts: counts(players),
      benchedLastRound,
    });
    expect(impossible).toBe(false);
    expect(benched.map((p) => p.id).sort()).toEqual([players[2].id, players[3].id].sort());
  });

  it('banco GRANDE (regra antiga relaxava aqui — NOVA regra NÃO relaxa): ninguém repete banco mesmo com banco de 3+', () => {
    // Cenário que na regra ANTIGA (limiar 2) seria relaxado: banco de 3,
    // A/B/C sentaram na rodada anterior E têm a MENOR contagem acumulada.
    // Na regra NOVA, isso NÃO importa: eles não podem sentar de novo — ponto.
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60), P('E', 'MEIA', 60), P('F', 'MEIA', 60)];
    const benchCounts = counts(players);
    benchCounts.set(players[0].id, 0);
    benchCounts.set(players[1].id, 0);
    benchCounts.set(players[2].id, 0);
    benchCounts.set(players[3].id, 3);
    benchCounts.set(players[4].id, 3);
    benchCounts.set(players[5].id, 3);
    const benchedLastRound = new Set([players[0].id, players[1].id, players[2].id]);
    const { benched, impossible } = chooseBenchGroup({
      outfielders: players,
      benchCount: 3,
      benchCounts,
      benchedLastRound,
    });
    expect(impossible).toBe(false);
    // Estritamente elegíveis são D, E e F (não sentaram na rodada anterior) —
    // exatamente o banco necessário, mesmo tendo contagem acumulada maior.
    expect(benched.map((p) => p.id).sort()).toEqual([players[3].id, players[4].id, players[5].id].sort());
  });

  it('banco grande também nunca dispara impossibilidade quando dá pra cumprir a regra estrita', () => {
    const players = Array.from({ length: 9 }, (_, i) => P(`P${i}`, 'MEIA', 60));
    const benchedLastRound = new Set(players.slice(0, 3).map((p) => p.id));
    const { impossible } = chooseBenchGroup({
      outfielders: players,
      benchCount: 3,
      benchCounts: counts(players),
      benchedLastRound,
    });
    expect(impossible).toBe(false);
  });

  it('regra estrita impossível de cumprir SEM a exceção ligada: `impossible=true`, banco vazio (divisão deve ser descartada por quem chama)', () => {
    // banco de 2, mas só 1 elegível a sentar (2 sentaram na rodada anterior, banco só cabe 2 —
    // cenário artificial pra forçar strictEligible.length < benchCount).
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id, players[1].id]);
    const { benched, impossible, spentExceptionIds } = chooseBenchGroup({
      outfielders: players,
      benchCount: 2,
      benchCounts: counts(players),
      benchedLastRound,
    });
    expect(impossible).toBe(true);
    expect(benched).toEqual([]);
    expect(spentExceptionIds).toEqual([]);
  });
});

describe('chooseBenchGroup — exceção do checkbox (allowTwoConsecutive)', () => {
  it('quando a regra estrita FECHA sozinha, a exceção NÃO é usada mesmo estando ligada (não gasta crédito sem necessidade)', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id, players[1].id]);
    const { benched, spentExceptionIds, impossible } = chooseBenchGroup({
      outfielders: players,
      benchCount: 2,
      benchCounts: counts(players),
      benchedLastRound,
      allowTwoConsecutive: true,
    });
    expect(impossible).toBe(false);
    expect(spentExceptionIds).toEqual([]);
    expect(benched.map((p) => p.id).sort()).toEqual([players[2].id, players[3].id].sort());
  });

  it('quando a regra estrita NÃO fecha, a exceção permite sentar 2x seguidas (paga o crédito, marcado em `spentExceptionIds`)', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id, players[1].id]);
    const { benched, spentExceptionIds, impossible } = chooseBenchGroup({
      outfielders: players,
      benchCount: 2,
      benchCounts: counts(players),
      benchedLastRound,
      allowTwoConsecutive: true,
      round: 1,
    });
    expect(impossible).toBe(false);
    expect(benched).toHaveLength(2);
    // C (não sentou) é obrigatório; o outro vem de A/B (repetentes) — só 1
    // precisa gastar o crédito (só falta 1 vaga além do estritamente elegível).
    expect(spentExceptionIds).toHaveLength(1);
    expect([players[0].id, players[1].id]).toContain(spentExceptionIds[0]);
  });

  it('mesmo com a exceção ligada, se o pool total (estritos + repetentes) não fecha o banco, `impossible=true`', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60)];
    const benchedLastRound = new Set([players[0].id, players[1].id]); // ambos sentaram — 0 estritos, 2 repetentes
    const { impossible } = chooseBenchGroup({
      outfielders: players,
      benchCount: 3, // mais vagas de banco do que gente no time inteiro
      benchCounts: counts(players),
      benchedLastRound,
      allowTwoConsecutive: true,
      round: 1,
    });
    expect(impossible).toBe(true);
  });

  it('constante de cooldown é nomeada e vale 6 rodadas', () => {
    expect(BENCH_EXCEPTION_COOLDOWN_ROUNDS).toBe(6);
  });

  it('quem gastou o crédito fica inelegível ao banco durante a janela de cooldown, mesmo sentando na rodada anterior', () => {
    // A gastou o crédito na rodada 2 (spentAt=2). Na rodada 3 (delta=1, dentro
    // da janela de 6), ele deve ficar de fora do pool de banco mesmo sem ter
    // "acabado de sentar" oficialmente nesta chamada (é o cooldown que barra).
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60)];
    const exceptionSpentAtRound = new Map([[players[0].id, 2]]);
    const { benched, impossible } = chooseBenchGroup({
      outfielders: players,
      benchCount: 2,
      benchCounts: counts(players),
      benchedLastRound: new Set(),
      allowTwoConsecutive: true,
      round: 3,
      exceptionSpentAtRound,
    });
    expect(impossible).toBe(false);
    expect(benched.map((p) => p.id)).not.toContain(players[0].id);
  });

  it('depois que a janela de cooldown (6 rodadas) expira, o jogador volta a ser elegível normalmente', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60)];
    const exceptionSpentAtRound = new Map([[players[0].id, 2]]);
    const benchCounts = counts(players);
    // A tem a MENOR contagem acumulada — se estiver elegível, deve ser escolhido por (b).
    benchCounts.set(players[0].id, 0);
    benchCounts.set(players[1].id, 5);
    benchCounts.set(players[2].id, 5);
    benchCounts.set(players[3].id, 5);
    // round=9: delta = 9-2 = 7 > BENCH_EXCEPTION_COOLDOWN_ROUNDS(6) — fora da janela.
    const { benched, impossible } = chooseBenchGroup({
      outfielders: players,
      benchCount: 1,
      benchCounts,
      benchedLastRound: new Set(),
      allowTwoConsecutive: true,
      round: 9,
      exceptionSpentAtRound,
    });
    expect(impossible).toBe(false);
    expect(benched.map((p) => p.id)).toEqual([players[0].id]);
  });

  it('simulação de 9 rodadas (2 times) reproduzindo o loop de rotation.ts: quem gasta o crédito fica de fora do banco pelas 6 rodadas SEGUINTES e depois volta a ser elegível', () => {
    // Roster grande o bastante pra o deficit estrutural (que existe sempre
    // que a exceção é necessária) não se acumular tão rápido a ponto de
    // esgotar o pool de repetentes dentro de só 9 rodadas (ver
    // rotation.test.ts para o caso REALISTA de elenco pequeno de 6-a-side,
    // onde esse esgotamento eventualmente acontece de novo — Regra 2). Aqui o
    // objetivo é isolar e comprovar SÓ a duração da janela de cooldown, sem
    // esse efeito colateral de escala atrapalhar a leitura do teste.
    const outfielders = Array.from({ length: 99 }, (_, i) => P(`P${i}`, 'MEIA', 60));
    const benchCounts = counts(outfielders);
    let benchedLastRound = new Set<string>();
    const exceptionSpentAtRound = new Map<string, number>();
    const games: { benchNames: string[] }[] = [];
    for (let round = 0; round < 9; round++) {
      const { benched, spentExceptionIds, impossible } = chooseBenchGroup({
        outfielders, benchCount: 50, benchCounts, benchedLastRound,
        allowTwoConsecutive: true, round, exceptionSpentAtRound,
      });
      expect(impossible).toBe(false); // as 9 rodadas fecham o banco normalmente com este roster
      for (const id of spentExceptionIds) exceptionSpentAtRound.set(id, round);
      for (const p of benched) benchCounts.set(p.id, (benchCounts.get(p.id) ?? 0) + 1);
      benchedLastRound = new Set(benched.map((p) => p.id));
      games.push({ benchNames: benched.map((p) => p.name) });
    }

    // Acha quem sentou nos Jogos 1 E 2 (rodadas 0 e 1) — é quem gastou o
    // crédito na 2ª rodada (regra estrita sozinha não fecha o banco de 50 com
    // só 99 outfielders — precisa da exceção já na 2ª rodada).
    const bench0 = new Set(games[0].benchNames);
    const spender = games[1].benchNames.find((name) => bench0.has(name));
    expect(spender).toBeDefined();

    // Isento pelas 6 rodadas SEGUINTES (Jogos 3 a 8, índices 2 a 7) — a
    // isenção NÃO é até o fim da simulação, é só por essa janela.
    for (let i = 2; i <= 7; i++) {
      expect(games[i].benchNames).not.toContain(spender);
    }
    // Passada a janela, volta a ser elegível — pode (não é garantido, mas é
    // permitido) aparecer de novo no banco no Jogo 9 (índice 8).
    void games[8];
  });
});

describe('chooseBenchGroup — regra (b) contagem acumulada equilibrada', () => {
  it('sempre escolhe quem tem MENOS idas ao banco até ali', () => {
    const players = [P('A', 'MEIA', 60), P('B', 'MEIA', 60), P('C', 'MEIA', 60), P('D', 'MEIA', 60), P('E', 'MEIA', 60), P('F', 'MEIA', 60)];
    const benchCounts = counts(players);
    benchCounts.set(players[0].id, 4); // já sentou muito — não deve sentar de novo
    benchCounts.set(players[1].id, 0); // nunca sentou — prioridade
    benchCounts.set(players[2].id, 1);
    benchCounts.set(players[3].id, 2);
    benchCounts.set(players[4].id, 3);
    benchCounts.set(players[5].id, 3);
    const { benched } = chooseBenchGroup({
      outfielders: players,
      benchCount: 3,
      benchCounts,
      benchedLastRound: new Set(),
    });
    // Os 3 com MENOR contagem acumulada (B=0, C=1, D=2) devem ser os escalados pro banco.
    expect(benched.map((p) => p.id).sort()).toEqual([players[1].id, players[2].id, players[3].id].sort());
  });

  it('ao longo de várias rodadas simuladas, a contagem de banco fica equilibrada entre os elegíveis', () => {
    const players = Array.from({ length: 9 }, (_, i) => P(`P${i}`, 'MEIA', 60));
    const benchCounts = counts(players);
    let benchedLastRound = new Set<string>();
    const rounds = 12;
    for (let r = 0; r < rounds; r++) {
      const { benched } = chooseBenchGroup({
        outfielders: players,
        benchCount: 3,
        benchCounts,
        benchedLastRound,
      });
      for (const p of benched) benchCounts.set(p.id, (benchCounts.get(p.id) ?? 0) + 1);
      benchedLastRound = new Set(benched.map((p) => p.id));
    }
    const values = [...benchCounts.values()];
    // 12 rodadas x 3 vagas de banco / 9 jogadores = 4 idas ao banco em média cada.
    // (b) deve manter isso bem distribuído — sem ninguém muito destoante.
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });
});

describe('chooseBenchGroup — regra (c) desempate por menor impacto', () => {
  const flatAttrs = { FIN: 50, CRI: 50, DRI: 50, DEF: 50, VEL: 50, RCD: 50, INT: 50, MOV: 50, FIS: 50, OFE: 50 };

  it('entre 2 empatados em (b), prefere bancar o intercambiável — não o especialista difícil de repor', () => {
    // fixoForte (perfil DEF/FIS puxado, especialista) e generico (perfil neutro,
    // fácil de substituir por qualquer um dos outros 4 "genéricos" da linha)
    // empatam em contagem acumulada (0) e disputam a ÚLTIMA vaga de banco.
    // O time SEM o especialista perde muito mais fit do que o time sem o
    // genérico (que tem substitutos igualmente bons na própria linha).
    const fixoForte = P('FixoForte', 'DEFENSOR', 100, {
      attributes: { FIN: 0, CRI: 5, DRI: 5, DEF: 95, VEL: 10, RCD: 90, INT: 10, MOV: 10, FIS: 95, OFE: 50 },
    });
    const generico = P('Generico', 'MEIA', 60, { attributes: flatAttrs });
    // 5 outros de linha (não 4): com banco de 1, o campo tem 6 vagas — roster
    // total de outfielders precisa ser 6 (campo) + 1 (banco) = 7.
    const outrosNaLinha = Array.from({ length: 5 }, (_, i) => P(`X${i}`, 'MEIA', 60, { attributes: flatAttrs }));
    const outfielders = [fixoForte, generico, ...outrosNaLinha];
    const benchCounts = counts(outfielders); // todos em 0 — mas só fixoForte/generico ficam no grupo empatado na fronteira
    const { benched, impossible } = chooseBenchGroup({
      outfielders,
      benchCount: 1,
      benchCounts,
      benchedLastRound: new Set(outrosNaLinha.map((p) => p.id)), // os 4 "genéricos extra" sentaram na rodada anterior — jogam agora (regra a)
    });
    expect(impossible).toBe(false);
    expect(benched.map((p) => p.id)).toEqual([generico.id]);
  });
});
