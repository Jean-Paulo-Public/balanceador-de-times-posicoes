import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampRating } from '../domain/playerAttributes';
import { deriveAttributesFromStar, deriveGkFromStar } from '../domain/deriveAttributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';

let counter = 0;

/**
 * Atalhos pra fixtures de teste equivalentes às flags legadas (pivotFriendly,
 * veloz, boaSaidaDeBola, recompoePouco), agora expressos como atributos v2 —
 * ver `isPivot`/`isFast`/`hasGoodBuildUp`/`hasLowRecovery` em playerModel.ts.
 */
export interface TestTraits {
  /** Referência de área nata (equivalente a `pivotFriendly`). */
  pivot?: boolean;
  /** Bem veloz (equivalente a `veloz`). */
  fast?: boolean;
  /** Boa saída de bola (equivalente a `boaSaidaDeBola`). */
  goodBuildUp?: boolean;
  /** Recompõe pouco (equivalente a `recompoePouco`). */
  lowRecovery?: boolean;
}

const applyTraits = (attrs: AttrVector, traits: TestTraits | undefined): AttrVector => {
  if (!traits) return attrs;
  let out = attrs;
  // Perfil completo (não incremental) pra garantir isPivot() com folga acima do limiar.
  if (traits.pivot) out = { FIN: 90, CRI: 55, DRI: 50, DEF: 20, VEL: 40, RCD: 40, INT: 40, MOV: 20, FIS: 85 };
  if (traits.fast) out = { ...out, VEL: 90 };
  if (traits.goodBuildUp) out = { ...out, CRI: 90 };
  if (traits.lowRecovery) out = { ...out, RCD: 5 };
  return out;
};

export const makePlayer = (
  position: Position,
  rating: number = 3,
  overrides: Partial<Player> & { traits?: TestTraits } = {}
): Player => {
  counter += 1;
  const { traits, ...rest } = overrides;
  const r = clampRating(rating);
  const attributes = applyTraits(deriveAttributesFromStar(r, position), traits);
  return {
    id: `test-${counter}`,
    name: `${position}-${counter}`,
    active: true,
    isGoalkeeper: false,
    position,
    rating: r,
    attributes,
    gk: null,
    acceptedPositions: allEnabled([BOX_TO_BOX]),
    ...rest,
  };
};

export const makeGoalkeeper = (rating: number = 4, overrides: Partial<Player> = {}): Player =>
  makePlayer('MEIA', rating, { isGoalkeeper: true, gk: deriveGkFromStar(rating, true), ...overrides });

/** Nota variada mas dentro da escala 0–5. */
const variedRating = (i: number): number => clampRating(1.5 + (i % 8) * 0.5);

/** Pool fácil: bastante opção em todas as posições, notas variadas mas nunca escassas. */
export const buildBalancedPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper(3 + (i % 3) * 0.5));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', variedRating(i)));
  for (let i = 0; i < numTeams * 5; i++) players.push(makePlayer('MEIA', variedRating(i)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('ATACANTE', variedRating(i)));
  return players;
};

/** Pool difícil: quase nenhum Defensor de origem — o mínimo de 1 zagueiro por time vai ceder. */
export const buildFewDefendersPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  const nativeDefenders = Math.max(1, Math.ceil(numTeams / 2));
  for (let i = 0; i < nativeDefenders; i++) players.push(makePlayer('DEFENSOR', variedRating(i)));
  for (let i = 0; i < numTeams * 7; i++) players.push(makePlayer('MEIA', variedRating(i)));
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('ATACANTE', variedRating(i)));
  return players;
};

/** Pool difícil: nenhum (ou quase nenhum) Meia de origem. */
export const buildFewMeiasPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', variedRating(i)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('ATACANTE', variedRating(i)));
  return players;
};

/** Pool difícil: quase nenhum Atacante de origem. */
export const buildFewAtacantesPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  const nativeAttackers = Math.max(1, Math.ceil(numTeams / 2));
  for (let i = 0; i < nativeAttackers; i++) players.push(makePlayer('ATACANTE', variedRating(i)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', variedRating(i)));
  for (let i = 0; i < numTeams * 4; i++) players.push(makePlayer('MEIA', variedRating(i)));
  return players;
};

/** Pool exatamente no limite: após reservar goleiros, sobram exatamente 6 de linha por time. */
export const buildMinimalPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 3));
  for (let i = 0; i < numTeams * 4; i++) players.push(makePlayer('MEIA', 3));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('ATACANTE', 3));
  return players;
};

/**
 * Pool desnivelado: a qualidade está concentrada em poucos jogadores (metade
 * excelente, metade péssima), testando se o motor espalha bem esse desnível.
 */
export const buildSkewedPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 5)); // elite
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 1)); // fracos
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('MEIA', 5));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('MEIA', 1));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('ATACANTE', 5));
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('ATACANTE', 1));
  return players;
};

/** Pool sem nenhum atacante de origem: força o improviso de meia no ataque. */
export const buildNoAttackerPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('DEFENSOR', variedRating(i)));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('MEIA', 4, { traits: { pivot: true } }));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('MEIA', 3.5, { traits: { lowRecovery: true } }));
  for (let i = 0; i < numTeams * 4; i++) players.push(makePlayer('MEIA', variedRating(i)));
  return players;
};

export const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
