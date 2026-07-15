import type { Position } from './types';

/** Escala de estrelas: 0 a 5, em passos de 0,5. */
export const MIN_RATING = 0;
export const MAX_RATING = 5;
export const RATING_STEP = 0.5;

/** Valor padrão de estrelas para um jogador novo. */
export const DEFAULT_RATING = 3;

/** Prende um valor de estrela na escala válida (0..5) e no passo de 0,5. */
export const clampRating = (value: number): number => {
  if (Number.isNaN(value)) return DEFAULT_RATING;
  const stepped = Math.round(value / RATING_STEP) * RATING_STEP;
  return Math.max(MIN_RATING, Math.min(MAX_RATING, stepped));
};

/** Arredonda uma média de estrelas para BAIXO no passo de 0,5 (usado só na exibição). */
export const floorToHalf = (value: number): number =>
  Math.max(MIN_RATING, Math.min(MAX_RATING, Math.floor(value / RATING_STEP) * RATING_STEP));

export const posToLabel = (pos: Position): string => {
  switch (pos) {
    case 'DEFENSOR': return 'Defensor';
    case 'MEIA': return 'Meia';
    case 'ATACANTE': return 'Atacante';
    default: return 'Jogador';
  }
};
