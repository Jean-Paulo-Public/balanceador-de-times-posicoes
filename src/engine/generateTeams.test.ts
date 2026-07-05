import { describe, it, expect } from 'vitest';
import { generateTeams } from './generateTeams';
import {
  buildBalancedPool,
  buildFewDefendersPool,
  buildFewMeiasPool,
  buildFewAtacantesPool,
  buildMinimalPool,
  buildSkewedDefensePool,
  spread,
} from './testFixtures';
import type { Player, FormationType } from '../domain/types';

const SIMULATIONS = 1500;

interface ScenarioMetrics {
  best: ReturnType<typeof generateTeams>[number];
  overallSpread: number;
  defensiveSpread: number;
  totalImprov: number;
}

const runScenario = (
  pool: Player[],
  numTeams: number,
  formation: FormationType | FormationType[] = 'QUALQUER'
): ScenarioMetrics => {
  const results = generateTeams(pool, formation, numTeams, SIMULATIONS);
  expect(results.length).toBeGreaterThan(0);
  const best = results[0];
  const overalls = best.teams.map(t => t.overall);
  const defOveralls = best.teams.map(t => t.defensiveOverall);
  return {
    best,
    overallSpread: spread(overalls),
    defensiveSpread: spread(defOveralls),
    totalImprov: best.totalImprov,
  };
};

describe('generateTeams — cenário fácil (pool balanceado)', () => {
  it('2 times: gera escalação e mantém defesa e geral bem próximos', () => {
    const { overallSpread, defensiveSpread } = runScenario(buildBalancedPool(2), 2);
    expect(overallSpread).toBeLessThanOrEqual(20);
    expect(defensiveSpread).toBeLessThanOrEqual(20);
  });

  it('3 times: gera escalação e mantém defesa e geral bem próximos', () => {
    const { overallSpread, defensiveSpread } = runScenario(buildBalancedPool(3), 3);
    expect(overallSpread).toBeLessThanOrEqual(22);
    expect(defensiveSpread).toBeLessThanOrEqual(22);
  });
});

describe('generateTeams — cenários difíceis', () => {
  it('poucos Defensores nativos: ainda assim distribui a defesa de forma equilibrada (formação DEFENSIVA)', () => {
    const { defensiveSpread, best } = runScenario(buildFewDefendersPool(3), 3, 'DEFENSIVA');
    expect(best.teams.every(t => t.players.filter(p => p.assignedRole !== 'Goleiro').length >= 6)).toBe(true);
    expect(defensiveSpread).toBeLessThanOrEqual(30);
  });

  it('poucos Meias nativos: Defensor/Atacante cobrem o meio-campo sem quebrar a defesa (formação EQUILIBRADA)', () => {
    const { defensiveSpread } = runScenario(buildFewMeiasPool(3), 3, 'EQUILIBRADA');
    expect(defensiveSpread).toBeLessThanOrEqual(30);
  });

  it('poucos Atacantes nativos: Meia cobre o ataque sem comprometer o equilíbrio geral', () => {
    const { overallSpread } = runScenario(buildFewAtacantesPool(3), 3, 'OFENSIVA');
    expect(overallSpread).toBeLessThanOrEqual(30);
  });

  it('elenco mínimo (exatamente numTeams * 6): ainda gera escalação válida', () => {
    const results = generateTeams(buildMinimalPool(2), 'QUALQUER', 2, SIMULATIONS);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].teams.every(t => t.bench.length === 0)).toBe(true);
  });

  it('elenco desnivelado na defesa: não deixa os defensores de elite concentrados em um só time', () => {
    const { defensiveSpread } = runScenario(buildSkewedDefensePool(3), 3, 'DEFENSIVA');
    expect(defensiveSpread).toBeLessThanOrEqual(35);
  });
});

describe('generateTeams — prioridade defensiva', () => {
  it('o equilíbrio defensivo do melhor cenário nunca deveria ser péssimo mesmo com pool difícil', () => {
    const pools = [buildFewDefendersPool(2), buildFewMeiasPool(2), buildFewAtacantesPool(2)];
    for (const pool of pools) {
      const results = generateTeams(pool, 'QUALQUER', 2, SIMULATIONS);
      expect(results.length).toBeGreaterThan(0);
      const defOveralls = results[0].teams.map(t => t.defensiveOverall);
      expect(spread(defOveralls)).toBeLessThanOrEqual(35);
    }
  });
});
