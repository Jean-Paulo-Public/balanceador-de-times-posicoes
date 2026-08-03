import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';
import { ALL_SYSTEMS } from './formationModel';
import { balanceTeams, getLastBalanceRunReport } from './balance';

/**
 * PRNG determinístico (mulberry32) usado SÓ NESTE ARQUIVO DE TESTE para
 * stubar `Math.random` — nunca no código de produção (`generateTeams.ts` usa
 * `Math.random` diretamente para embaralhar candidatas/goleiros; ver
 * diagnóstico de performance). Com a semente fixa, duas chamadas de
 * `balanceTeams` na mesma sub-suíte percorrem a MESMA amostra de divisões
 * candidatas — o que permite voltar a comparar métricas por IGUALDADE EXATA
 * em vez de tolerância: sem isso, o "empate quase perfeito" entre divisões
 * candidatas poderia fazer um teste de acoplamento (ex.: goleiro afetando
 * `off`) passar mesmo com um vazamento real de até poucos pontos.
 */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

let realRandom: () => number;
const withSeededRandom = (seed = 42): void => {
  const rng = mulberry32(seed);
  Math.random = rng;
};
beforeEach(() => { realRandom = Math.random; });
afterEach(() => { Math.random = realRandom; });

/** Vetor UNIFORME (0–100): fixture direta de atributos, sem estrela nem derivação. */
const flatAttrs = (overall: number): AttrVector => {
  const v = clampAttr(overall);
  return { FIN: v, CRI: v, DRI: v, DEF: v, VEL: v, RCD: v, INT: v, MOV: v, FIS: v };
};

let idc = 0;
const P = (position: Position, overall: number, o: Partial<Player> = {}): Player => ({
  id: `p${++idc}`, name: `${position}${idc}`, active: true, isGoalkeeper: false,
  position, attributes: flatAttrs(overall), gk: null,
  acceptedPositions: allEnabled([BOX_TO_BOX]), ...o,
});

// 14 jogadores = 2 times de 7 (2 goleiros + 12 de linha), sem banco.
// Overalls (0–100) equivalentes às antigas estrelas 0–5 (×20): 4=80, 3.5=70,
// 3=60, 4.5=90, 2.5=50, 2=40.
const pool = (): Player[] => {
  idc = 0;
  return [
    P('DEFENSOR', 80, { isGoalkeeper: true, gk: 80 }), P('DEFENSOR', 70, { isGoalkeeper: true, gk: 70 }),
    P('DEFENSOR', 80), P('DEFENSOR', 60), P('DEFENSOR', 90), P('DEFENSOR', 50),
    P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90), P('MEIA', 40),
    P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80),
  ];
};

describe('nota de goleiro desacoplada do resto', () => {
  // A nota de goleiro é INDEPENDENTE: não afeta nenhuma outra métrica e não é
  // afetada por nenhuma outra. Só entra na nota do time (`geral`) no jogo em que
  // o jogador está escalado no gol.
  const poolComGk = (nota: number): Player[] => {
    idc = 0;
    return [
      P('DEFENSOR', 80, { isGoalkeeper: true, gk: nota }), P('DEFENSOR', 70, { isGoalkeeper: true, gk: nota }),
      P('DEFENSOR', 80), P('DEFENSOR', 60), P('DEFENSOR', 90), P('DEFENSOR', 50),
      P('MEIA', 80), P('MEIA', 70), P('MEIA', 60), P('MEIA', 90), P('MEIA', 40),
      P('ATACANTE', 90), P('ATACANTE', 60), P('ATACANTE', 80),
    ];
  };

  const media = (r: { teams: { metrics: Record<string, unknown> }[] }, k: string) =>
    r.teams.reduce((s, t) => s + (t.metrics[k] as number), 0) / r.teams.length;

  // Compara os CONJUNTOS de valores (não por índice de time): a rotina de
  // banco (Fase 6) depende do encaixe real do sistema tático
  // (`chooseBestSystem`) pra decidir quem senta, e o vencedor entre divisões
  // candidatas quase-empatadas pode, em tese, variar por time físico. Com
  // `Math.random` SEMEADO (`withSeededRandom`, só neste teste) as duas
  // chamadas de `balanceTeams` abaixo percorrem a MESMA amostra de divisões
  // candidatas — por isso a comparação agora é por IGUALDADE EXATA (não por
  // tolerância): sem a semente, um "quase empate" na busca poderia mascarar
  // um vazamento real de acoplamento entre a nota de goleiro e estes eixos.
  const sortedOf = (r: { teams: { metrics: Record<string, unknown> }[] }, k: string) =>
    [...r.teams.map((t) => t.metrics[k] as number)].sort((a, b) => a - b);

  it('a nota de goleiro entra SÓ no eixo defensivo — nunca no geral nem no ataque', () => {
    withSeededRandom();
    const ruim = balanceTeams(poolComGk(10), 2)!;
    withSeededRandom();
    const bom = balanceTeams(poolComGk(95), 2)!;
    // Defesa sobe com goleiro melhor (goleiro vale 1/3 do eixo).
    expect(media(bom, 'def')).toBeGreaterThan(media(ruim, 'def'));
    // Ataque NÃO: nenhum goleiro do elenco joga bem com os pés.
    expect(sortedOf(bom, 'off')).toEqual(sortedOf(ruim, 'off'));
    // `geral` e `recuo` são exclusivamente dos 6 de linha.
    expect(sortedOf(bom, 'geral')).toEqual(sortedOf(ruim, 'geral'));
    expect(sortedOf(bom, 'recuo')).toEqual(sortedOf(ruim, 'recuo'));
  });

  it('goleiro pesa 1/3 do eixo defensivo (impacto mediano, não decisivo)', () => {
    const ruim = balanceTeams(poolComGk(20), 2)!;
    const bom = balanceTeams(poolComGk(80), 2)!;
    // 60 pontos de goleiro × 1/3 ≈ 20 pontos de `def`. Faixa larga de propósito:
    // o que importa é a ORDEM DE GRANDEZA — mediano, não decisivo nem irrelevante.
    const delta = media(bom, 'def') - media(ruim, 'def');
    expect(delta).toBeGreaterThan(10);
    expect(delta).toBeLessThan(30);
  });

  it('sem goleiro do elenco (emprestado), a nota de goleiro não entra na conta', () => {
    withSeededRandom();
    const ruim = balanceTeams(poolComGk(10), 2, { neverScaleGoalkeepers: true })!;
    withSeededRandom();
    const bom = balanceTeams(poolComGk(95), 2, { neverScaleGoalkeepers: true })!;
    expect(sortedOf(bom, 'def')).toEqual(sortedOf(ruim, 'def'));
    expect(sortedOf(bom, 'geral')).toEqual(sortedOf(ruim, 'geral'));
  });
});

describe('balanceTeams', () => {
  it('monta 2 times com sistema tático, mapinha e métricas', () => {
    const res = balanceTeams(pool(), 2);
    expect(res).not.toBeNull();
    expect(res!.teams).toHaveLength(2);
    for (const t of res!.teams) {
      expect(ALL_SYSTEMS).toContain(t.formation);
      expect(t.slots).toHaveLength(6);
      expect(t.metrics.feasible).toBe(true);
      for (const s of t.slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('não perde nem duplica jogador', () => {
    const players = pool();
    const res = balanceTeams(players, 2)!;
    const ids = new Set<string>();
    for (const t of res.teams) {
      for (const s of t.slots) ids.add(s.player.id);
      if (t.goalkeeper) ids.add(t.goalkeeper.id);
      for (const b of t.bench) ids.add(b.id);
    }
    expect(ids.size).toBe(players.length);
  });

  it('gaps são números não-negativos (times parelhos)', () => {
    const res = balanceTeams(pool(), 2)!;
    expect(res.gaps.def).toBeGreaterThanOrEqual(0);
    expect(res.gaps.geral).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(res.cost)).toBe(true);
  });

  it('com goleiro escalado, cobertura é calculada; sem escalar (emprestado), é null', () => {
    const comGk = balanceTeams(pool(), 2)!;
    expect(comGk.teams.every((t) => t.fieldsGoalkeeper)).toBe(true);
    expect(comGk.teams.every((t) => t.metrics.cobertura != null)).toBe(true);

    const emprestado = balanceTeams(pool(), 2, { neverScaleGoalkeepers: true })!;
    expect(emprestado.teams.every((t) => !t.fieldsGoalkeeper)).toBe(true);
    expect(emprestado.teams.every((t) => t.metrics.cobertura === null)).toBe(true);
  });

  it('mantém um par "separados" em times diferentes (ou avisa a violação)', () => {
    const players = pool();
    const [a, b] = [players[6].id, players[7].id]; // dois meias
    const res = balanceTeams(players, 2, { separatePairs: [[a, b]] })!;
    const teamOf = (id: string) =>
      res.teams.findIndex((t) => t.slots.some((s) => s.player.id === id) || t.goalkeeper?.id === id || t.bench.some((x) => x.id === id));
    const separated = teamOf(a) !== teamOf(b);
    expect(separated || res.separationViolations.length > 0).toBe(true);
    if (separated) expect(res.separationViolations).toHaveLength(0);
  });

  it('cada jogador que só joga de PIVO nunca fica sem vaga (nenhum time recebe 2 pivôs)', () => {
    const players = pool();
    for (const t of balanceTeams(players, 2)!.teams) {
      const pivoCount = t.slots.filter((s) => s.role === 'PIVO').length;
      expect(pivoCount).toBeLessThanOrEqual(1);
    }
  });
});

describe('balanceTeams — Fase 5: infactibilidade nomeando jogadores', () => {
  it('devolve [] quando 3 jogadores só jogam de PIVO e há 2 times, e o relatório nomeia os jogadores', () => {
    const players = [
      ...pool(),
      P('ATACANTE', 80, { name: 'Guto', acceptedPositions: allEnabled(["PIVO"]) }),
      P('ATACANTE', 60, { name: 'Tayrone', acceptedPositions: allEnabled(["PIVO"]) }),
      P('ATACANTE', 70, { name: 'Fulano', acceptedPositions: allEnabled(["PIVO"]) }),
    ];
    const res = balanceTeams(players, 2, { candidates: 5 });
    expect(res).toBeNull();
    const report = getLastBalanceRunReport();
    expect(report?.feasibility.feasible).toBe(false);
    expect(report?.feasibility.message).toContain('Guto');
    expect(report?.feasibility.message).toContain('Tayrone');
    expect(report?.feasibility.message).toContain('Fulano');
  });
});

describe('balanceTeams — Fase 6: custo é a média das métricas de 6 jogos', () => {
  it('reporta tempo medido e nº de candidatos avaliados', () => {
    const res = balanceTeams(pool(), 2, { candidates: 10 });
    expect(res).not.toBeNull();
    const report = getLastBalanceRunReport();
    expect(report).not.toBeNull();
    expect(report!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(report!.candidatesEvaluated).toBeGreaterThan(0);
  });
});
