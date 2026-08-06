// Rótulo de EXIBIÇÃO/EXPORTAÇÃO do time — camada de apresentação apenas.
// Internamente (engine, estado) os times continuam "Time 1".."Time 4" (ver
// `BalancedTeam.id`/`name` em src/engine/balance.ts). Esta é a ÚNICA fonte da
// verdade pro mapeamento id → nome colorido pedido pelo dono; nada de
// espalhar `if`s pelos componentes ou pelo motor.
//
// Mora em `src/domain/` (em vez de `src/features/`) porque tanto a UI
// (`src/features/simulation/`) quanto o motor (`src/engine/`, só nos pontos
// que IMPRIMEM texto pro usuário — nunca na lógica de balanceamento) precisam
// dela, e o motor não deve importar de `src/features/`.
//
// Time 1 → Time Azul · Time 2 → Time Amarelo · Time 3 → Time Vermelho.
// Time 4 (ou qualquer id sem cor mapeada) não tem cor: cai de volta pro nome
// interno (`t.name`, ex. "Time 4").

const TEAM_COLOR_LABEL: Record<number, string> = {
  1: 'Time Azul',
  2: 'Time Amarelo',
  3: 'Time Vermelho',
};

/** Time como ele existe internamente: precisa só de `id` e `name`. */
export interface LabelableTeam {
  id: number;
  name: string;
}

/** Rótulo de exibição/exportação do time — troca de nome, nada mais. */
export const teamDisplayLabel = (team: LabelableTeam): string => TEAM_COLOR_LABEL[team.id] ?? team.name;
