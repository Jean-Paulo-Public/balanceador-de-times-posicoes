import type { Player, Position } from '../domain/types';
import { createStats } from '../domain/playerAttributes';

let counter = 0;

export const makePlayer = (
  position: Position,
  level: number = 3,
  overrides: Partial<Player> = {}
): Player => {
  counter += 1;
  return {
    id: `test-${counter}`,
    name: `${position}-${counter}`,
    active: true,
    isCaptain: false,
    isGoalkeeper: false,
    position,
    stats: createStats(level),
    pivotFriendly: false,
    ...overrides,
  };
};

export const makeGoalkeeper = (level: number = 4, overrides: Partial<Player> = {}): Player =>
  makePlayer('MEIA', level, { isGoalkeeper: true, ...overrides });

/** Pool fácil: bastante opção em todas as posições, níveis variados mas nunca escassos. */
export const buildBalancedPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper(3 + (i % 3)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', 2 + (i % 4)));
  for (let i = 0; i < numTeams * 5; i++) players.push(makePlayer('MEIA', 2 + (i % 4)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('ATACANTE', 2 + (i % 4)));
  return players;
};

/** Pool difícil: quase nenhum Defensor nativo — a defesa depende de Meias improvisados. */
export const buildFewDefendersPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  const nativeDefenders = Math.max(1, Math.ceil(numTeams / 2));
  for (let i = 0; i < nativeDefenders; i++) players.push(makePlayer('DEFENSOR', 2 + (i % 5)));
  for (let i = 0; i < numTeams * 7; i++) players.push(makePlayer('MEIA', 1 + (i % 6)));
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('ATACANTE', 2 + (i % 4)));
  return players;
};

/** Pool difícil: nenhum (ou quase nenhum) Meia nativo — Defensor/Atacante têm que cobrir o meio. */
export const buildFewMeiasPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', 1 + (i % 6)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('ATACANTE', 1 + (i % 6)));
  return players;
};

/** Pool difícil: quase nenhum Atacante nativo. */
export const buildFewAtacantesPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  const nativeAttackers = Math.max(1, Math.ceil(numTeams / 2));
  for (let i = 0; i < nativeAttackers; i++) players.push(makePlayer('ATACANTE', 2 + (i % 5)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', 2 + (i % 4)));
  for (let i = 0; i < numTeams * 4; i++) players.push(makePlayer('MEIA', 1 + (i % 6)));
  return players;
};

/** Pool exatamente no limite: numTeams * 6, sem ninguém de sobra pro banco. */
export const buildMinimalPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 3));
  for (let i = 0; i < numTeams * 4; i++) players.push(makePlayer('MEIA', 3));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('ATACANTE', 3));
  return players;
};

/**
 * Pool desnivelado: a qualidade defensiva está concentrada em poucos jogadores
 * (metade excelente, metade péssima), testando se o motor espalha bem esse
 * desnível entre os times em vez de empilhar os bons defensores em um só time.
 */
export const buildSkewedDefensePool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 6)); // elite
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 1)); // péssimos
  for (let i = 0; i < numTeams * 5; i++) players.push(makePlayer('MEIA', 3));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('ATACANTE', 3));
  return players;
};

export const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
