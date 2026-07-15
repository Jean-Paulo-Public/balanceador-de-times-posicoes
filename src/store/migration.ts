import type { Player, Position } from '../domain/types';
import { clampRating, DEFAULT_RATING } from '../domain/playerAttributes';

/**
 * Normalização de jogadores carregados/importados: garante o shape atual
 * (posição válida, rating na escala 0–5, flags booleanas). Não há mais
 * retrocompatibilidade com o modelo antigo de atributos.
 */

const VALID_POSITIONS: Position[] = ['DEFENSOR', 'MEIA', 'ATACANTE'];

interface RawPlayer {
  id?: unknown;
  name?: unknown;
  active?: unknown;
  isCaptain?: unknown;
  isGoalkeeper?: unknown;
  position?: unknown;
  rating?: unknown;
  pivotFriendly?: unknown;
  recompoePouco?: unknown;
  boaSaidaDeBola?: unknown;
  veloz?: unknown;
}

const asPosition = (value: unknown): Position =>
  typeof value === 'string' && VALID_POSITIONS.includes(value as Position) ? (value as Position) : 'MEIA';

const asBool = (value: unknown): boolean => (typeof value === 'boolean' ? value : false);

export const normalizePlayer = (raw: RawPlayer | Player): Player => {
  const r = (raw ?? {}) as RawPlayer;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
    name: typeof r.name === 'string' && r.name ? r.name : 'Jogador',
    active: typeof r.active === 'boolean' ? r.active : true,
    isCaptain: asBool(r.isCaptain),
    isGoalkeeper: asBool(r.isGoalkeeper),
    position: asPosition(r.position),
    rating: typeof r.rating === 'number' ? clampRating(r.rating) : DEFAULT_RATING,
    pivotFriendly: asBool(r.pivotFriendly),
    recompoePouco: asBool(r.recompoePouco),
    boaSaidaDeBola: asBool(r.boaSaidaDeBola),
    veloz: asBool(r.veloz),
  };
};

export const normalizePlayers = (players: unknown): Player[] => {
  if (!Array.isArray(players)) return [];
  return players.map(p => normalizePlayer(p as RawPlayer));
};
