// Semente de atributos v2 a partir do modelo legado (estrela 0–5 + posição + flags).
// Usada na migração e como fallback quando um Player ainda não tem `attributes`.
// Ver docs/Design_v2_Atributos_Funcoes_Sinergia.md (Seção 15.1).

import type { Position } from './types';
import type { AttrVector, AttributeKey } from './attributes';
import { clampAttr } from './attributes';

interface LegacyFlags {
  veloz?: boolean;
  boaSaidaDeBola?: boolean;
  recompoePouco?: boolean;
  pivotFriendly?: boolean;
}

// RCD/INT herdam o mesmo offset que REC tinha antes da divisão (não há dado
// pra diferenciá-los na derivação legada estrela->atributos).
const POS_OFFSETS: Record<Position, AttrVector> = {
  DEFENSOR: { FIN: -18, CRI: 2, DRI: -10, DEF: 12, VEL: 0, RCD: 6, INT: 6, MOV: -8, FIS: 8 },
  MEIA: { FIN: -6, CRI: 8, DRI: 2, DEF: -2, VEL: 0, RCD: 6, INT: 6, MOV: 4, FIS: 0 },
  ATACANTE: { FIN: 14, CRI: -6, DRI: 6, DEF: -16, VEL: 4, RCD: -6, INT: -6, MOV: 10, FIS: 2 },
};

const clampStar = (rating: number): number => Math.max(0, Math.min(5, rating));

/** Deriva os 8 atributos (0–100) a partir de estrela + posição + flags legadas. */
export const deriveAttributesFromStar = (
  rating: number,
  position: Position,
  flags: LegacyFlags = {},
): AttrVector => {
  const base = 100 * (clampStar(rating) / 5);
  const off = POS_OFFSETS[position];
  const a: AttrVector = {
    FIN: base + off.FIN, CRI: base + off.CRI, DRI: base + off.DRI, DEF: base + off.DEF,
    VEL: base + off.VEL, RCD: base + off.RCD, INT: base + off.INT, MOV: base + off.MOV, FIS: base + off.FIS,
  };
  if (flags.veloz) a.VEL += 15;
  if (flags.boaSaidaDeBola) a.CRI += 12;
  // `recompoePouco` era "volta pra marcar pouco E sem fôlego na pressão" —
  // afeta os dois atributos novos que nasceram de REC.
  if (flags.recompoePouco) { a.DEF -= 4; a.RCD -= 15; a.INT -= 15; a.MOV += 6; }
  if (flags.pivotFriendly) { a.FIN += 6; a.CRI += 4; a.MOV -= 4; a.FIS += 8; }
  (Object.keys(a) as AttributeKey[]).forEach((k) => { a[k] = clampAttr(a[k]); });
  return a;
};

/** Nota de goleiro derivada da estrela (ou null se não joga no gol). */
export const deriveGkFromStar = (rating: number, isGoalkeeper: boolean): number | null =>
  isGoalkeeper ? clampAttr(100 * (clampStar(rating) / 5) + 5) : null;
