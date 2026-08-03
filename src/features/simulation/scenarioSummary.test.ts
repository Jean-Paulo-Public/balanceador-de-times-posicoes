import { describe, it, expect } from 'vitest';
import { buildScenarioSummaries, formatScenarioPosition, type ScenarioLike } from './scenarioSummary';

const zeroGaps = { def: 0, off: 0, recuo: 0, pressao: 0, geral: 0, cobertura: 0 };

const scenario = (cost: number, overrides: Partial<ScenarioLike['gaps']> = {}): ScenarioLike => ({
  cost,
  gaps: { ...zeroGaps, ...overrides },
});

describe('buildScenarioSummaries', () => {
  it('retorna lista vazia quando não há resultados', () => {
    expect(buildScenarioSummaries([])).toEqual([]);
  });

  it('preserva a ordem recebida (não reordena) e numera pelo índice original', () => {
    const out = buildScenarioSummaries([scenario(5), scenario(2), scenario(8)]);
    expect(out.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(out.map((s) => s.cost)).toEqual([5, 2, 8]);
  });

  it('marca isBest apenas no de menor custo', () => {
    const out = buildScenarioSummaries([scenario(5), scenario(2), scenario(8)]);
    expect(out.map((s) => s.isBest)).toEqual([false, true, false]);
  });

  it('marca TODOS os empates de menor custo como isBest', () => {
    const out = buildScenarioSummaries([scenario(3), scenario(3), scenario(9)]);
    expect(out.map((s) => s.isBest)).toEqual([true, true, false]);
  });

  it('copia os gaps de cada cenário sem alterar valores', () => {
    const out = buildScenarioSummaries([scenario(1, { def: 4, off: 2, cobertura: null })]);
    expect(out[0]).toMatchObject({ def: 4, off: 2, cobertura: null });
  });

  it('quando só há um cenário, ele é o melhor', () => {
    const out = buildScenarioSummaries([scenario(7)]);
    expect(out).toEqual([{ index: 0, cost: 7, ...zeroGaps, isBest: true }]);
  });
});

describe('formatScenarioPosition', () => {
  it('formata 1-based a partir de índice 0-based', () => {
    expect(formatScenarioPosition(0, 6)).toBe('Cenário 1 de 6');
    expect(formatScenarioPosition(5, 6)).toBe('Cenário 6 de 6');
  });

  it('funciona com um único cenário', () => {
    expect(formatScenarioPosition(0, 1)).toBe('Cenário 1 de 1');
  });
});
