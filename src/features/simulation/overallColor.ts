/**
 * Cor do "badge" de overall (Overall geral ou Defesa), usada tanto nos cards
 * detalhados de time (`SimulationTab.tsx`) quanto na lista resumida de times
 * (`TeamRosterList.tsx`) — centralizado aqui pra manter as duas visões com a
 * mesma régua de cores.
 */
export const overallColor = (value: number): string =>
  value > 75 ? 'var(--color-primary)' : value > 50 ? 'var(--color-accent)' : 'var(--color-danger)';
