// Funções PURAS de apoio ao editor de "exceções de atributo por posição"
// (modelo v3.1, `Player.positionOverrides` — ver src/domain/types.ts) no
// PlayerForm. Mantêm o mapa ESPARSO nos dois eixos em qualquer edição:
//  - só sobrevivem posições com pelo menos um atributo sobrescrito;
//  - dentro de uma posição, só sobrevivem atributos cujo valor sobrescrito
//    DIFERE do valor base atual do formulário (nunca persiste "exceção" igual
//    à base — isso seria lixo silencioso no dado salvo).
// Isoladas do componente (que é só orquestração de estado/UI) pra poderem ser
// testadas sem renderizar React.

import type { AttributeOverrides } from '../../domain/types';
import type { AttrVector, AttributeKey } from '../../domain/attributes';
import { clampAttr } from '../../domain/attributes';
import type { LinePosition } from '../../domain/positions';

/**
 * Define o valor sobrescrito de UM atributo numa posição. Se o valor
 * (clampeado 0–100) for igual ao base atual desse atributo, a sobrescrita é
 * REMOVIDA em vez de gravada (evita persistir uma "exceção" que não exceciona
 * nada). Se a posição ficar sem nenhum atributo sobrescrito, a posição inteira
 * é removida do mapa. Se o mapa inteiro ficar vazio, devolve `undefined`
 * (campo ausente — mesmo formato que `parsePositionOverrides` em
 * src/store/migration.ts espera).
 */
export const setPositionOverrideAttr = (
  overrides: AttributeOverrides | undefined,
  position: LinePosition,
  attr: AttributeKey,
  value: number,
  base: AttrVector,
): AttributeOverrides | undefined => {
  const clamped = clampAttr(value);
  const next: AttributeOverrides = { ...(overrides ?? {}) };
  const posOverride = { ...(next[position] ?? {}) };

  if (clamped === base[attr]) {
    delete posOverride[attr];
  } else {
    posOverride[attr] = clamped;
  }

  if (Object.keys(posOverride).length === 0) {
    delete next[position];
  } else {
    next[position] = posOverride;
  }

  return Object.keys(next).length === 0 ? undefined : next;
};

/** Remove a sobrescrita de UM atributo numa posição (volta ao valor base). */
export const removePositionOverrideAttr = (
  overrides: AttributeOverrides | undefined,
  position: LinePosition,
  attr: AttributeKey,
): AttributeOverrides | undefined => {
  if (!overrides?.[position] || !(attr in overrides[position]!)) return overrides;
  const posOverride = { ...overrides[position] };
  delete posOverride[attr];
  const next: AttributeOverrides = { ...overrides };
  if (Object.keys(posOverride).length === 0) delete next[position];
  else next[position] = posOverride;
  return Object.keys(next).length === 0 ? undefined : next;
};

/** Remove TODAS as sobrescritas de uma posição (o jogador volta a usar a base nela). */
export const clearPositionOverrides = (
  overrides: AttributeOverrides | undefined,
  position: LinePosition,
): AttributeOverrides | undefined => {
  if (!overrides?.[position]) return overrides;
  const next: AttributeOverrides = { ...overrides };
  delete next[position];
  return Object.keys(next).length === 0 ? undefined : next;
};

/** Posições que hoje têm ao menos uma sobrescrita salva, na ordem do catálogo (`ALL_LINE_POSITIONS`). */
export const overriddenPositionsOf = (
  overrides: AttributeOverrides | undefined,
  allPositions: readonly LinePosition[],
): LinePosition[] => (overrides ? allPositions.filter((pos) => !!overrides[pos]) : []);
