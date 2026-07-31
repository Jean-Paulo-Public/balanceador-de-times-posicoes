// Algoritmo húngaro (Kuhn-Munkres) para o PROBLEMA DE ATRIBUIÇÃO — ótimo e
// polinomial (O(n^3)), sem dependência externa. Substitui a força bruta por
// permutações (6! = 720) usada antes em formationModel.ts: o solver da Fase 6
// chama isso 6 jogos × N sistemas × muitas divisões candidatas, então a
// complexidade importa.
//
// Implementação clássica (potenciais de Kuhn-Munkres / "shortest augmenting
// path"), adaptada de cp-algorithms.com/graph/hungarian-algorithm.html.
// Minimiza o custo total de uma matriz quadrada `cost[linha][coluna]`.

/** Custo "proibitivo": usado pra marcar uma célula (jogador×vaga) inviável. */
export const INFEASIBLE_COST = 1_000_000;

export interface HungarianResult {
  /** assignment[linha] = coluna atribuída a essa linha (índices 0-based). */
  assignment: number[];
  /** Soma dos custos das células escolhidas. */
  totalCost: number;
  /** false se alguma célula escolhida tinha custo >= INFEASIBLE_COST (nenhuma atribuição válida existe). */
  feasible: boolean;
}

/**
 * Resolve o problema de atribuição (custo mínimo) numa matriz quadrada n×n.
 * `cost[i][j]` = custo de atribuir a linha i à coluna j. Usa índices 1-based
 * internamente (padrão do algoritmo clássico) e devolve 0-based.
 */
export const hungarianSolve = (cost: number[][]): HungarianResult => {
  const n = cost.length;
  if (n === 0) return { assignment: [], totalCost: 0, feasible: true };
  for (const row of cost) {
    if (row.length !== n) throw new Error('hungarianSolve espera uma matriz de custo QUADRADA (n×n).');
  }

  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0); // p[j] = linha (1-based) atribuída à coluna j
  const way = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else { minv[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) assignment[p[j] - 1] = j - 1;
  }
  let totalCost = 0;
  let feasible = true;
  for (let i = 0; i < n; i++) {
    const c = cost[i][assignment[i]];
    totalCost += c;
    if (c >= INFEASIBLE_COST) feasible = false;
  }
  return { assignment, totalCost, feasible };
};

/** Referência de força bruta (só para teste — O(n!), nunca usar em produção). */
export const bruteForceAssignment = (cost: number[][]): HungarianResult => {
  const n = cost.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  let best: number[] | null = null;
  let bestCost = Infinity;
  const permute = (arr: number[], k: number): void => {
    if (k === arr.length) {
      let total = 0;
      for (let i = 0; i < n; i++) total += cost[i][arr[i]];
      if (total < bestCost) { bestCost = total; best = [...arr]; }
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      permute(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  permute(idx, 0);
  const assignment = best ?? [];
  const feasible = assignment.every((j, i) => cost[i][j] < INFEASIBLE_COST);
  return { assignment, totalCost: bestCost, feasible };
};
