import { describe, it, expect } from 'vitest';
import { generateTeams, generateProposals, pickImprovisedAttacker } from './generateTeams';
import { isPivot, isFast, hasGoodBuildUp, hasLowRecovery, overallOf } from './playerModel';
import type { SimulationResult, Team, Player } from '../domain/types';
import {
  makePlayer,
  makeGoalkeeper,
  buildBalancedPool,
  buildMinimalPool,
  buildSkewedPool,
  buildNoAttackerPool,
  spread,
  type TestTraits,
} from './testFixtures';

const SIMS = 250;

const lineOf = (team: Team) => team.players.filter(tp => tp.roleShort !== 'GK');
const attackersByPosition = (team: Team) => lineOf(team).filter(tp => tp.player.position === 'ATACANTE');
const defendersByPosition = (team: Team) => lineOf(team).filter(tp => tp.player.position === 'DEFENSOR');
const midfieldersByPosition = (team: Team) => lineOf(team).filter(tp => tp.player.position === 'MEIA');
const roleCount = (team: Team, role: string) => team.players.filter(tp => tp.roleShort === role).length;
const countTrait = (team: Team, pred: (p: Player) => boolean) =>
  [...team.players, ...team.bench].filter(tp => pred(tp.player)).length;
const lineTrait = (team: Team, pred: (p: Player) => boolean) => lineOf(team).filter(tp => pred(tp.player)).length;

const allPlayerIds = (result: SimulationResult): string[] =>
  result.teams.flatMap(t => [...t.players, ...t.bench].map(tp => tp.player.id));

describe('generateTeams — regras básicas', () => {
  it('devolve cenários e cada time tem exatamente 6 de linha (limitado a 6)', () => {
    const results = generateTeams(buildBalancedPool(2), 2, { numSimulations: SIMS, maxSixLinePlayers: true });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) for (const team of r.teams) expect(lineOf(team).length).toBe(6);
  });

  it('não perde nem duplica jogador (cada ativo aparece uma vez por cenário)', () => {
    const pool = buildBalancedPool(2);
    const activeIds = pool.filter(p => p.active).map(p => p.id).sort();
    const results = generateTeams(pool, 2, { numSimulations: SIMS, maxSixLinePlayers: true });
    for (const r of results) expect(allPlayerIds(r).sort()).toEqual(activeIds);
  });

  it('devolve vazio quando não há jogadores suficientes', () => {
    expect(generateTeams([makePlayer('MEIA', 60)], 2, { numSimulations: SIMS })).toEqual([]);
  });
});

describe('generateTeams — teto de 4 atacantes', () => {
  it('nunca escala mais de 4 atacantes de origem em nenhum time', () => {
    const pool = [
      makeGoalkeeper(80), makeGoalkeeper(80),
      ...Array.from({ length: 10 }, () => makePlayer('ATACANTE', 80)),
      ...Array.from({ length: 3 }, () => makePlayer('DEFENSOR', 80)),
      ...Array.from({ length: 3 }, () => makePlayer('MEIA', 80)),
    ];
    const results = generateTeams(pool, 2, { numSimulations: SIMS });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) for (const team of r.teams) {
      expect(attackersByPosition(team).length).toBeLessThanOrEqual(4);
    }
  });
});

describe('generateTeams — mínimos', () => {
  it('com enforcePositionMin, cada time tem >=1 def, >=1 meia e >=1 atacante de origem', () => {
    const results = generateTeams(buildBalancedPool(2), 2, { numSimulations: SIMS, maxSixLinePlayers: true, enforcePositionMin: true });
    for (const r of results) for (const team of r.teams) {
      expect(defendersByPosition(team).length).toBeGreaterThanOrEqual(1);
      expect(midfieldersByPosition(team).length).toBeGreaterThanOrEqual(1);
      expect(attackersByPosition(team).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('todo time tem SEMPRE pelo menos 1 defensor em campo, mesmo sem enforcePositionMin', () => {
    const results = generateTeams(buildBalancedPool(2), 2, { numSimulations: SIMS, maxSixLinePlayers: true, enforcePositionMin: false });
    for (const r of results) for (const team of r.teams) expect(roleCount(team, 'DEF')).toBeGreaterThanOrEqual(1);
  });
});

describe('generateTeams — arranjo do campinho', () => {
  it('os melhores zagueiros vão pra zaga e os melhores atacantes pro ataque', () => {
    const results = generateTeams(buildBalancedPool(2), 2, { numSimulations: SIMS });
    for (const r of results.slice(0, 20)) for (const team of r.teams) {
      const defStarters = team.players.filter(tp => tp.roleShort === 'DEF' && tp.player.position === 'DEFENSOR');
      const defInMid = midfieldersByPosition(team).filter(tp => tp.player.position === 'DEFENSOR');
      if (defStarters.length && defInMid.length) {
        expect(Math.min(...defStarters.map(tp => overallOf(tp.player))))
          .toBeGreaterThanOrEqual(Math.max(...defInMid.map(tp => overallOf(tp.player))));
      }
      const ataStarters = team.players.filter(tp => tp.roleShort === 'ATA' && tp.player.position === 'ATACANTE');
      const ataInMid = lineOf(team).filter(tp => tp.roleShort === 'MEI' && tp.player.position === 'ATACANTE');
      if (ataStarters.length && ataInMid.length) {
        expect(Math.min(...ataStarters.map(tp => overallOf(tp.player))))
          .toBeGreaterThanOrEqual(Math.max(...ataInMid.map(tp => overallOf(tp.player))));
      }
    }
  });

  it('a quantidade de vagas de zaga/ataque forma um layout coerente (def+mei+ata=6, def<=2, ata<=2)', () => {
    // O rótulo de formação legado (tacticalSystem) foi removido do modelo de
    // domínio — a formação exibida ao usuário agora é a inferida pelo v2
    // (formationModel.ts). Aqui só garantimos que o arranjo interno de vagas
    // do gerador de candidatas continua coerente (6 de linha, no máx. 2 def/ata).
    const results = generateTeams(buildBalancedPool(2), 2, { numSimulations: SIMS, maxSixLinePlayers: true });
    for (const r of results.slice(0, 30)) for (const team of r.teams) {
      const def = roleCount(team, 'DEF');
      const mei = roleCount(team, 'MEI');
      const ata = roleCount(team, 'ATA');
      expect(def + mei + ata).toBe(6);
      expect(def).toBeLessThanOrEqual(2);
      expect(ata).toBeLessThanOrEqual(2);
    }
  });
});

describe('generateTeams — improviso de atacante (meia sobe)', () => {
  it('sem atacante de origem, um meia é improvisado no ataque', () => {
    const results = generateTeams(buildNoAttackerPool(2), 2, { numSimulations: SIMS, maxSixLinePlayers: true });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) for (const team of r.teams) {
      const ataSlots = team.players.filter(tp => tp.roleShort === 'ATA');
      expect(ataSlots.length).toBeGreaterThanOrEqual(1);
      expect(ataSlots.every(tp => tp.improvised && tp.player.position === 'MEIA')).toBe(true);
    }
  });
});

describe('pickImprovisedAttacker — prioridade dos traços (v2)', () => {
  const mid = (overall: number, overrides: Partial<Player> & { traits?: TestTraits } = {}) =>
    makePlayer('MEIA', overall, overrides);

  it('pivô tem prioridade mesmo sobre um meia de overall maior', () => {
    const pivotCandidate = mid(80, { traits: { pivot: true } });
    const chosen = pickImprovisedAttacker([
      mid(100), pivotCandidate, mid(60, { traits: { lowRecovery: true } }),
    ]);
    expect(chosen && isPivot(chosen)).toBe(true);
    expect(chosen?.id).toBe(pivotCandidate.id);
  });

  it('com vários pivôs, escolhe o de maior overall', () => {
    const melhorPivot = mid(90, { traits: { pivot: true } });
    const chosen = pickImprovisedAttacker([
      mid(60, { traits: { pivot: true } }), melhorPivot,
    ]);
    expect(chosen?.id).toBe(melhorPivot.id);
  });

  it('sem pivô, usa quem "recompõe pouco"', () => {
    const chosen = pickImprovisedAttacker([mid(100), mid(60, { traits: { lowRecovery: true } })]);
    expect(chosen && hasLowRecovery(chosen)).toBe(true);
  });

  it('sem traço nenhum, escolhe o de maior overall', () => {
    // 50 (não 40): num vetor UNIFORME, overall <= 40 dispararia hasLowRecovery
    // (RCD <= 40) e mudaria de ramo — aqui o alvo é o fallback "sem traço".
    const chosen = pickImprovisedAttacker([mid(50), mid(80)]);
    expect(chosen && overallOf(chosen)).toBe(80);
  });
});

describe('generateTeams — improviso de defesa (meia > atacante)', () => {
  it('sem zagueiro de origem, o improvisado na zaga é um meia (preferência sobre atacante)', () => {
    const pool: Player[] = [
      makeGoalkeeper(80), makeGoalkeeper(80),
      ...Array.from({ length: 10 }, (_, i) => makePlayer('MEIA', 40 + (i % 4) * 10)),
      ...Array.from({ length: 4 }, () => makePlayer('ATACANTE', 80)),
    ];
    const results = generateTeams(pool, 2, { numSimulations: SIMS, maxSixLinePlayers: true, enforcePositionMin: false });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) for (const team of r.teams) {
      const defSlots = team.players.filter(tp => tp.roleShort === 'DEF');
      expect(defSlots.length).toBeGreaterThanOrEqual(1);
      expect(defSlots.every(tp => tp.improvised && tp.player.position === 'MEIA')).toBe(true);
    }
  });
});

describe('generateTeams — spreadTraits (saída/veloz/pivô, modelo v2)', () => {
  const traitPool = (): Player[] => [
    makeGoalkeeper(80), makeGoalkeeper(80),
    makePlayer('DEFENSOR', 80, { traits: { goodBuildUp: true } }),
    makePlayer('DEFENSOR', 80, { traits: { goodBuildUp: true } }),
    makePlayer('DEFENSOR', 70, { traits: { fast: true } }),
    makePlayer('DEFENSOR', 70, { traits: { fast: true } }),
    makePlayer('MEIA', 80, { traits: { pivot: true } }),
    makePlayer('MEIA', 70, { traits: { pivot: true } }),
    makePlayer('MEIA', 60, { traits: { pivot: true } }),
    makePlayer('MEIA', 60, { traits: { pivot: true } }),
    makePlayer('MEIA', 60), makePlayer('MEIA', 50),
    makePlayer('ATACANTE', 80), makePlayer('ATACANTE', 70),
    makePlayer('ATACANTE', 60), makePlayer('ATACANTE', 50),
  ];

  it('espalha 1 "boa saída de bola" e 1 "veloz" por time (quando há o suficiente)', () => {
    const results = generateTeams(traitPool(), 2, { numSimulations: SIMS, maxSixLinePlayers: true, spreadTraits: true });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) for (const team of r.teams) {
      expect(lineTrait(team, hasGoodBuildUp)).toBeGreaterThanOrEqual(1);
      expect(lineTrait(team, isFast)).toBeGreaterThanOrEqual(1);
    }
  });

  it('limita os pivôs a ceil(pivôs/times) por time', () => {
    // 4 pivôs, 2 times -> teto 2 por time.
    const results = generateTeams(traitPool(), 2, { numSimulations: SIMS, maxSixLinePlayers: true, spreadTraits: true });
    for (const r of results) for (const team of r.teams) {
      expect(lineTrait(team, isPivot)).toBeLessThanOrEqual(2);
    }
  });

  it('com 2 pivôs e 2 times, no máximo 1 pivô por time', () => {
    const pool: Player[] = [
      makeGoalkeeper(80), makeGoalkeeper(80),
      makePlayer('DEFENSOR', 80), makePlayer('DEFENSOR', 70), makePlayer('DEFENSOR', 60), makePlayer('DEFENSOR', 50),
      makePlayer('MEIA', 80, { traits: { pivot: true } }), makePlayer('MEIA', 70, { traits: { pivot: true } }),
      makePlayer('MEIA', 60), makePlayer('MEIA', 60),
      makePlayer('ATACANTE', 80), makePlayer('ATACANTE', 70), makePlayer('ATACANTE', 60), makePlayer('ATACANTE', 50),
    ];
    const results = generateTeams(pool, 2, { numSimulations: SIMS, maxSixLinePlayers: true, spreadTraits: true });
    for (const r of results) for (const team of r.teams) {
      expect(lineTrait(team, isPivot)).toBeLessThanOrEqual(1);
    }
  });
});

describe('generateTeams — equilíbrio por overall', () => {
  it('o melhor cenário mantém as médias de overall próximas', () => {
    const results = generateTeams(buildBalancedPool(3), 3, { numSimulations: 400, maxSixLinePlayers: true });
    expect(results.length).toBeGreaterThan(0);
    // Limiares (0–100) equivalentes aos antigos 0,6/0,75 na escala de estrela
    // 0–5 (×20 — mesma conversão de escala usada em todo o arquivo).
    expect(spread(results[0].teams.map(t => t.overall))).toBeLessThanOrEqual(12);
  });

  it('espalha os craques num elenco desnivelado', () => {
    const results = generateTeams(buildSkewedPool(2), 2, { numSimulations: 400, maxSixLinePlayers: true });
    expect(results.length).toBeGreaterThan(0);
    expect(spread(results[0].teams.map(t => t.overall))).toBeLessThanOrEqual(15);
  });
});

describe('generateTeams — goleiros', () => {
  it('elenco mínimo ainda gera times', () => {
    expect(generateTeams(buildMinimalPool(2), 2, { numSimulations: SIMS }).length).toBeGreaterThan(0);
  });

  it('com "nunca escalar goleiros", ninguém entra como GK', () => {
    const results = generateTeams(buildBalancedPool(2), 2, { numSimulations: SIMS, neverScaleGoalkeepers: true });
    for (const r of results) for (const team of r.teams) expect(roleCount(team, 'GK')).toBe(0);
  });
});

describe('generateProposals — 3 propostas', () => {
  it('gera até 3 propostas distintas e tituladas, todas válidas', () => {
    const proposals = generateProposals(buildBalancedPool(3), 3, { numSimulations: 300 });
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    expect(proposals.length).toBeLessThanOrEqual(3);
    expect(proposals.map(p => p.title)).toEqual(['Proposta 1', 'Proposta 2', 'Proposta 3'].slice(0, proposals.length));

    const membership = (r: SimulationResult) =>
      r.teams.map(t => [...t.players, ...t.bench].map(tp => tp.player.id).sort().join(',')).sort().join('|');
    if (proposals.length >= 2) expect(membership(proposals[0])).not.toBe(membership(proposals[1]));

    for (const p of proposals) for (const team of p.teams) {
      expect(attackersByPosition(team).length).toBeLessThanOrEqual(4);
      expect(roleCount(team, 'DEF')).toBeGreaterThanOrEqual(1);
    }
  });

  it('Proposta 1 espalha boa saída de bola por time (1 cada, com 2 para 2 times)', () => {
    const base = buildBalancedPool(2);
    // marca exatamente 2 defensores com boa saída de bola (CRI bem acima da média)
    let marked = 0;
    const pool = base.map(p => {
      if (p.position === 'DEFENSOR' && !p.isGoalkeeper && marked < 2) {
        marked++;
        return { ...p, attributes: { ...p.attributes, CRI: 90 } };
      }
      return p;
    });
    const proposals = generateProposals(pool, 2, { numSimulations: 500 });
    for (const team of proposals[0].teams) {
      expect(countTrait(team, hasGoodBuildUp)).toBeGreaterThanOrEqual(1);
    }
  });
});
