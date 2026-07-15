import { describe, it, expect } from 'vitest';
import { generateTeams, generateProposals, pickImprovisedAttacker } from './generateTeams';
import { FORMATIONS } from '../domain/formations';
import type { SimulationResult, Team, Player } from '../domain/types';
import {
  makePlayer,
  makeGoalkeeper,
  buildBalancedPool,
  buildMinimalPool,
  buildSkewedPool,
  buildNoAttackerPool,
  spread,
} from './testFixtures';

const SIMS = 250;

const lineOf = (team: Team) => team.players.filter(tp => tp.roleShort !== 'GK');
const attackersByPosition = (team: Team) => lineOf(team).filter(tp => tp.player.position === 'ATACANTE');
const defendersByPosition = (team: Team) => lineOf(team).filter(tp => tp.player.position === 'DEFENSOR');
const midfieldersByPosition = (team: Team) => lineOf(team).filter(tp => tp.player.position === 'MEIA');
const roleCount = (team: Team, role: string) => team.players.filter(tp => tp.roleShort === role).length;

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
    expect(generateTeams([makePlayer('MEIA', 3)], 2, { numSimulations: SIMS })).toEqual([]);
  });
});

describe('generateTeams — teto de 4 atacantes', () => {
  it('nunca escala mais de 4 atacantes de origem em nenhum time', () => {
    const pool = [
      makeGoalkeeper(4), makeGoalkeeper(4),
      ...Array.from({ length: 10 }, () => makePlayer('ATACANTE', 4)),
      ...Array.from({ length: 3 }, () => makePlayer('DEFENSOR', 4)),
      ...Array.from({ length: 3 }, () => makePlayer('MEIA', 4)),
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
        expect(Math.min(...defStarters.map(tp => tp.player.rating)))
          .toBeGreaterThanOrEqual(Math.max(...defInMid.map(tp => tp.player.rating)));
      }
      const ataStarters = team.players.filter(tp => tp.roleShort === 'ATA' && tp.player.position === 'ATACANTE');
      const ataInMid = lineOf(team).filter(tp => tp.roleShort === 'MEI' && tp.player.position === 'ATACANTE');
      if (ataStarters.length && ataInMid.length) {
        expect(Math.min(...ataStarters.map(tp => tp.player.rating)))
          .toBeGreaterThanOrEqual(Math.max(...ataInMid.map(tp => tp.player.rating)));
      }
    }
  });

  it('a quantidade de vagas de zaga/ataque bate com a formação escolhida', () => {
    const results = generateTeams(buildBalancedPool(2), 2, { numSimulations: SIMS, maxSixLinePlayers: true });
    for (const r of results.slice(0, 30)) for (const team of r.teams) {
      const layout = FORMATIONS[team.tacticalSystem as keyof typeof FORMATIONS];
      expect(layout).toBeDefined();
      expect(roleCount(team, 'DEF')).toBe(layout.def);
      expect(roleCount(team, 'ATA')).toBe(layout.ata);
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

describe('pickImprovisedAttacker — prioridade das tags', () => {
  const mid = (rating: number, extra: Partial<Player> = {}) => makePlayer('MEIA', rating, extra);

  it('pivô tem prioridade mesmo sobre um meia de mais estrelas', () => {
    const chosen = pickImprovisedAttacker([mid(5), mid(4, { pivotFriendly: true }), mid(3, { recompoePouco: true })]);
    expect(chosen?.pivotFriendly).toBe(true);
    expect(chosen?.rating).toBe(4);
  });

  it('com vários pivôs, escolhe o de mais estrelas', () => {
    const chosen = pickImprovisedAttacker([mid(3, { pivotFriendly: true }), mid(4.5, { pivotFriendly: true })]);
    expect(chosen?.rating).toBe(4.5);
  });

  it('sem pivô, usa quem "recompõe pouco"', () => {
    const chosen = pickImprovisedAttacker([mid(5), mid(3, { recompoePouco: true })]);
    expect(chosen?.recompoePouco).toBe(true);
  });

  it('sem tag nenhuma, escolhe o de mais estrelas', () => {
    const chosen = pickImprovisedAttacker([mid(2), mid(4)]);
    expect(chosen?.rating).toBe(4);
  });
});

describe('generateTeams — improviso de defesa (meia > atacante)', () => {
  it('sem zagueiro de origem, o improvisado na zaga é um meia (preferência sobre atacante)', () => {
    const pool: Player[] = [
      makeGoalkeeper(4), makeGoalkeeper(4),
      ...Array.from({ length: 10 }, (_, i) => makePlayer('MEIA', 2 + (i % 4) * 0.5)),
      ...Array.from({ length: 4 }, () => makePlayer('ATACANTE', 4)),
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

describe('generateTeams — equilíbrio por estrela', () => {
  it('o melhor cenário mantém as médias de estrela próximas', () => {
    const results = generateTeams(buildBalancedPool(3), 3, { numSimulations: 400, maxSixLinePlayers: true });
    expect(results.length).toBeGreaterThan(0);
    expect(spread(results[0].teams.map(t => t.overall))).toBeLessThanOrEqual(0.6);
  });

  it('espalha os craques num elenco desnivelado', () => {
    const results = generateTeams(buildSkewedPool(2), 2, { numSimulations: 400, maxSixLinePlayers: true });
    expect(results.length).toBeGreaterThan(0);
    expect(spread(results[0].teams.map(t => t.overall))).toBeLessThanOrEqual(0.75);
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

  it('Proposta 1 coloca (quando há capitães suficientes) 1 capitão por time', () => {
    const pool = buildBalancedPool(2).map((p, i) => (i % 6 === 0 ? { ...p, isCaptain: true } : p));
    expect(pool.filter(p => p.isCaptain).length).toBeGreaterThanOrEqual(2);
    const proposals = generateProposals(pool, 2, { numSimulations: 400 });
    for (const team of proposals[0].teams) {
      expect(team.players.some(tp => tp.player.isCaptain)).toBe(true);
    }
  });
});
