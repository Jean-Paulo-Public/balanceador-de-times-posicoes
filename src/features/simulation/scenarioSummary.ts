// Lógica PURA de resumo de cenários simulados — extraída pra poder ser testada
// sem ambiente de DOM (o projeto roda vitest em `environment: 'node'` e só
// inclui `src/**/*.test.ts`).
//
// Objetivo: dado o array de `BalanceResult` devolvido por `balanceTeamsOptions`
// (já ordenado por custo, menor primeiro), monta uma lista de resumos prontos
// pra exibir numa lista/tabela comparativa (índice, custo, gaps, qual é o
// melhor) — sem recalcular nada do engine e sem depender do shape completo de
// `BalanceResult` (facilita testar com objetos mínimos).

export interface ScenarioGaps {
  def: number;
  off: number;
  recuo: number;
  pressao: number;
  geral: number;
  cobertura: number | null;
}

export interface ScenarioLike {
  cost: number;
  gaps: ScenarioGaps;
}

export interface ScenarioSummary extends ScenarioGaps {
  /** Índice na lista (0-based) — mesmo índice usado pra selecionar o cenário. */
  index: number;
  cost: number;
  /** true se este é o cenário de MENOR custo (pode haver empate). */
  isBest: boolean;
}

/**
 * Monta o resumo comparável de cada cenário (índice, custo, gaps, se é o
 * melhor). NÃO reordena — assume que `results` já vem ordenado por custo
 * (como `balanceTeamsOptions` devolve, menor custo primeiro).
 */
export const buildScenarioSummaries = (results: ScenarioLike[]): ScenarioSummary[] => {
  if (results.length === 0) return [];
  const minCost = Math.min(...results.map((r) => r.cost));
  return results.map((r, index) => ({
    index,
    cost: r.cost,
    ...r.gaps,
    isBest: r.cost === minCost,
  }));
};

/** Texto "Cenário N de TOTAL" pra exibir na navegação/paginação. */
export const formatScenarioPosition = (index: number, total: number): string =>
  `Cenário ${index + 1} de ${total}`;
