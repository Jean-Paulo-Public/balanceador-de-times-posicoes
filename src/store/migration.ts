import type { AttributeOverrides, Player, Position } from '../domain/types';
import type { AttrVector, AttributeKey } from '../domain/attributes';
import { clampRating, DEFAULT_RATING } from '../domain/playerAttributes';
import { ALL_ATTRIBUTE_KEYS, clampAttr } from '../domain/attributes';
import { deriveAttributesFromStar, deriveGkFromStar } from '../domain/deriveAttributes';
import { ALL_LINE_POSITIONS, BOX_TO_BOX, type LinePosition, type PositionPreference, type PositionPreferenceEntry } from '../domain/positions';

/**
 * Normalização de jogadores carregados/importados: garante o shape v6 atual
 * — `attributes`/`gk` sempre presentes. Quando o jogador já tem `attributes`
 * v2 válidos, eles são preservados intactos (nunca re-derivados). Quando o
 * jogador é puramente legado (só rating + posição + as 4 flags antigas —
 * `pivotFriendly`/`recompoePouco`/`boaSaidaDeBola`/`veloz`), os atributos e a
 * nota de goleiro são semeados a partir da estrela via
 * `deriveAttributesFromStar`/`deriveGkFromStar`, e as flags são descartadas —
 * elas não existem mais no shape de `Player` (ver domain/types.ts).
 */

const VALID_POSITIONS: Position[] = ['DEFENSOR', 'MEIA', 'ATACANTE'];

interface RawPlayer {
  id?: unknown;
  name?: unknown;
  active?: unknown;
  isGoalkeeper?: unknown;
  position?: unknown;
  rating?: unknown;
  pivotFriendly?: unknown;
  recompoePouco?: unknown;
  boaSaidaDeBola?: unknown;
  veloz?: unknown;
  attributes?: unknown;
  gk?: unknown;
  handicapPct?: unknown;
  acceptedPositions?: unknown;
  positionOverrides?: unknown;
}

const isValidPositionValue = (v: unknown): v is PositionPreference =>
  typeof v === 'string' && (v === BOX_TO_BOX || (ALL_LINE_POSITIONS as readonly string[]).includes(v));

/**
 * Valida a lista ORDENADA de preferência bruta (modelo v3 + toggle v3.2):
 * array de entradas `{ position, enabled }`. DESCARTA entradas malformadas
 * individualmente (posição desconhecida, item que não é objeto, etc.) em vez
 * de invalidar a lista inteira — preserva a ORDEM das entradas restantes.
 * `BOX_TO_BOX` nunca é desabilitado (não expõe toggle): `enabled` recebido
 * pra ela é ignorado e forçado a `true`.
 * Casos que caem no default `[{ position: BOX_TO_BOX, enabled: true }]`:
 *  - entrada bruta não é array, ou é array vazio;
 *  - todas as entradas eram malformadas (lista filtrada ficou vazia);
 *  - NENHUMA entrada restante está habilitada (estado inválido — jogador sem
 *    posição jogável nunca é aceito silenciosamente).
 */
export const parseAcceptedPositions = (x: unknown): PositionPreferenceEntry[] | undefined => {
  if (!Array.isArray(x) || x.length === 0) return undefined;
  const out: PositionPreferenceEntry[] = [];
  for (const item of x) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue; // descarta entrada malformada
    const { position, enabled } = item as { position?: unknown; enabled?: unknown };
    if (!isValidPositionValue(position)) continue; // descarta
    const isBox = position === BOX_TO_BOX;
    out.push({ position, enabled: isBox ? true : (typeof enabled === 'boolean' ? enabled : true) });
  }
  if (out.length === 0) return undefined;
  if (!out.some((e) => e.enabled)) return undefined; // todas desabilitadas = sem posição jogável
  return out;
};

/**
 * Valida um `attributes` bruto: só é aceito se for um objeto com as 8 chaves
 * numéricas de AttrVector — TODAS presentes. Se faltar ou vier de tipo
 * inválido, devolve `undefined` (não inventa/preenche default por chave) para
 * que o motor derive via `deriveAttributesFromStar`.
 */
export const parseAttrVector = (x: unknown): AttrVector | undefined => {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  const out = {} as AttrVector;
  for (const k of ALL_ATTRIBUTE_KEYS) {
    const v = o[k];
    if (typeof v !== 'number' || Number.isNaN(v)) return undefined;
    out[k] = clampAttr(v);
  }
  return out;
};

/** `gk` bruto: number (clamp 0–100), `null` (aceito), ou `undefined` (ausente/inválido). */
export const parseGk = (x: unknown): number | null | undefined => {
  if (typeof x === 'number' && !Number.isNaN(x)) return clampAttr(x);
  if (x === null) return null;
  return undefined;
};

/** `handicapPct` bruto: number clampeado 0–100, ou `undefined` se ausente/inválido. */
export const parseHandicapPct = (x: unknown): number | undefined =>
  typeof x === 'number' && !Number.isNaN(x) ? Math.max(0, Math.min(100, Math.round(x))) : undefined;

/**
 * Valida um `positionOverrides` bruto (modelo v3.1 — exceções de atributo por
 * posição de linha): mapa ESPARSO posição → atributos parciais. DESCARTA
 * entradas malformadas em vez de invalidar o mapa inteiro:
 *  - chave de posição desconhecida -> essa entrada é ignorada (não invalida o resto);
 *  - dentro de uma posição válida, só sobrevivem as chaves de atributo válidas
 *    com valor numérico (clampeadas 0–100); chaves de atributo inválidas são
 *    descartadas individualmente;
 *  - se uma posição ficar sem nenhum atributo válido, ela é descartada;
 *  - se o mapa inteiro ficar vazio, devolve `undefined` (campo ausente — o
 *    caso comum, sem exceções).
 */
export const parsePositionOverrides = (x: unknown): AttributeOverrides | undefined => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
  const validPositions = new Set<string>(ALL_LINE_POSITIONS);
  const validAttrs = new Set<string>(ALL_ATTRIBUTE_KEYS);
  const out: AttributeOverrides = {};
  for (const [posKey, rawAttrs] of Object.entries(x as Record<string, unknown>)) {
    if (!validPositions.has(posKey)) continue;
    if (!rawAttrs || typeof rawAttrs !== 'object' || Array.isArray(rawAttrs)) continue;
    const filtered: Partial<AttrVector> = {};
    for (const [attrKey, v] of Object.entries(rawAttrs as Record<string, unknown>)) {
      if (!validAttrs.has(attrKey)) continue;
      if (typeof v !== 'number' || Number.isNaN(v)) continue;
      filtered[attrKey as AttributeKey] = clampAttr(v);
    }
    if (Object.keys(filtered).length > 0) out[posKey as LinePosition] = filtered;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const asPosition = (value: unknown): Position =>
  typeof value === 'string' && VALID_POSITIONS.includes(value as Position) ? (value as Position) : 'MEIA';

const asBool = (value: unknown): boolean => (typeof value === 'boolean' ? value : false);

export const normalizePlayer = (raw: RawPlayer | Player): Player => {
  const r = (raw ?? {}) as RawPlayer;
  const isGoalkeeper = asBool(r.isGoalkeeper);
  const position = asPosition(r.position);
  const rating = typeof r.rating === 'number' ? clampRating(r.rating) : DEFAULT_RATING;

  // Preserva atributos v2 já válidos intactos; só semeia (deriva da estrela +
  // flags legadas) quando o jogador ainda não tem `attributes`/`gk` v2.
  const attributes = parseAttrVector(r.attributes) ?? deriveAttributesFromStar(rating, position, {
    pivotFriendly: asBool(r.pivotFriendly),
    recompoePouco: asBool(r.recompoePouco),
    boaSaidaDeBola: asBool(r.boaSaidaDeBola),
    veloz: asBool(r.veloz),
  });
  // `??` não serve aqui: `null` é um valor v2 válido (não joga no gol) que não
  // pode ser confundido com "ausente" (que dispararia a derivação da estrela).
  const parsedGk = parseGk(r.gk);
  const gk = parsedGk !== undefined ? parsedGk : deriveGkFromStar(rating, isGoalkeeper);

  const player: Player = {
    id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
    name: typeof r.name === 'string' && r.name ? r.name : 'Jogador',
    active: typeof r.active === 'boolean' ? r.active : true,
    isGoalkeeper,
    position,
    rating,
    attributes,
    gk,
    acceptedPositions: parseAcceptedPositions(r.acceptedPositions) ?? [{ position: BOX_TO_BOX, enabled: true }],
  };
  const handicapPct = parseHandicapPct(r.handicapPct);
  if (handicapPct !== undefined) player.handicapPct = handicapPct;
  const positionOverrides = parsePositionOverrides(r.positionOverrides);
  if (positionOverrides !== undefined) player.positionOverrides = positionOverrides;
  return player;
};

export const normalizePlayers = (players: unknown): Player[] => {
  if (!Array.isArray(players)) return [];
  return players.map(p => normalizePlayer(p as RawPlayer));
};
