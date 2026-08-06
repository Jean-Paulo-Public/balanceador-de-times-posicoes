import type { AttributeOverrides, Player, Position } from '../domain/types';
import type { AttrVector, AttributeKey } from '../domain/attributes';
import { ALL_ATTRIBUTE_KEYS, clampAttr } from '../domain/attributes';
import { ALL_LINE_POSITIONS, BOX_TO_BOX, type LinePosition, type PositionPreference, type PositionPreferenceEntry } from '../domain/positions';

/**
 * Validação ESTRITA de um jogador no shape ATUAL (v9 — sem `rating`, sem
 * escala de estrela, sem derivação a partir de nada). Não existe mais cadeia
 * de migração incremental (v5→v6→v7→v8): o PORTÃO de versão do store
 * (`usePlayerStore.ts`) já descarta TODO o estado persistido que não seja
 * exatamente da versão atual, então o único trabalho daqui é validar um
 * registro que JÁ deveria estar no shape atual (dado corrompido/editado à mão
 * no localStorage, ou um JSON importado).
 *
 * ESTRITO de propósito: um registro malformado é DESCARTADO (devolve `null`),
 * nunca "consertado" inventando valor. Em particular, `attributes` e `gk`
 * têm de validar por inteiro — não há mais fallback de derivação a partir de
 * uma estrela (essa escala não existe mais no domínio).
 */

const VALID_POSITIONS: Position[] = ['DEFENSOR', 'MEIA', 'ATACANTE'];

interface RawPlayer {
  id?: unknown;
  name?: unknown;
  active?: unknown;
  isGoalkeeper?: unknown;
  position?: unknown;
  attributes?: unknown;
  gk?: unknown;
  handicapPct?: unknown;
  acceptedPositions?: unknown;
  positionOverrides?: unknown;
  positionOrderIndifferent?: unknown;
  veteran?: unknown;
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
 * Devolve `undefined` (e quem chama DESCARTA o registro inteiro — NÃO existe
 * default de coringa; ver a nota do bug em `normalizePlayer`) quando:
 *  - entrada bruta não é array, ou é array vazio;
 *  - todas as entradas eram malformadas (lista filtrada ficou vazia);
 *  - NENHUMA entrada restante está habilitada (estado inválido — jogador sem
 *    posição jogável nunca é aceito silenciosamente).
 * `BOX_TO_BOX` só existe num jogador se ELE estiver gravado assim no dado: é
 * escolha manual do usuário no cadastro, nunca inferida aqui.
 */
export const parseAcceptedPositions = (x: unknown): PositionPreferenceEntry[] | undefined => {
  if (!Array.isArray(x) || x.length === 0) return undefined;
  const out: PositionPreferenceEntry[] = [];
  for (const item of x) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue; // descarta entrada malformada
    const { position, enabled } = item as { position?: unknown; enabled?: unknown };
    if (!isValidPositionValue(position)) continue; // descarta
    // BUG CORRIGIDO: aqui o BOX_TO_BOX tinha `enabled` FORÇADO a `true`
    // ("coringa nunca é desabilitado"). Mas o PlayerForm grava a entrada do
    // coringa com `enabled: false` exatamente para dizer "este jogador NÃO é
    // coringa" — ela existe na lista só pra preservar a ordem. Com o valor
    // forçado, toda reidratação do localStorage transformava o ELENCO INTEIRO em
    // coringa e o sistema de posições era ignorado por completo. O `enabled`
    // gravado é respeitado como em qualquer outra entrada.
    out.push({ position, enabled: typeof enabled === 'boolean' ? enabled : true });
  }
  if (out.length === 0) return undefined;
  if (!out.some((e) => e.enabled)) return undefined; // todas desabilitadas = sem posição jogável
  return out;
};

/**
 * Valida um `attributes` bruto: só é aceito se for um objeto com as 9 chaves
 * numéricas de AttrVector — TODAS presentes. Se faltar ou vier de tipo
 * inválido, devolve `undefined` — quem chama DESCARTA o registro inteiro
 * (não há mais fallback de derivação).
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
 * `positionOrderIndifferent` bruto: campo COSMÉTICO/opcional (mesmo padrão de
 * `handicapPct`/`positionOverrides`) — NÃO segue a regra estrita de
 * `attributes`/`gk`/`acceptedPositions` (tipo errado nunca descarta o
 * jogador, só omite o campo). Aceita apenas `boolean`; qualquer outro tipo
 * (string, number, objeto etc.) devolve `undefined` — campo ausente/`false`.
 */
export const parsePositionOrderIndifferent = (x: unknown): boolean | undefined =>
  typeof x === 'boolean' ? x : undefined;

/**
 * `veteran` bruto: campo COSMÉTICO/opcional, EXATAMENTE o mesmo padrão de
 * `parsePositionOrderIndifferent` — NÃO segue a regra estrita de
 * `attributes`/`gk`/`acceptedPositions` (tipo errado nunca descarta o
 * jogador, só omite o campo). Aceita apenas `boolean`; qualquer outro tipo
 * devolve `undefined` — campo ausente/`false`.
 */
export const parseVeteran = (x: unknown): boolean | undefined =>
  typeof x === 'boolean' ? x : undefined;

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

/**
 * Valida um jogador bruto no shape ATUAL. Devolve `null` (DESCARTA o registro
 * inteiro) quando `attributes` ou `gk` não validam — são os dois campos cuja
 * ausência antes disparava a derivação a partir da estrela; agora não há pra
 * onde cair, então o registro malformado simplesmente não entra no roster.
 * Campos cosméticos (`id`/`name`/`active`/`isGoalkeeper`/`position`) seguem
 * com default sensato quando ausentes — isso não é "inventar dado de
 * balanceamento", é só a política de import/normalização de sempre.
 */
export const normalizePlayer = (raw: RawPlayer | Player | null | undefined): Player | null => {
  const r = (raw ?? {}) as RawPlayer;

  const attributes = parseAttrVector(r.attributes);
  if (!attributes) return null; // sem atributos v2 válidos — descartado, não consertado

  const parsedGk = parseGk(r.gk);
  if (parsedGk === undefined) return null; // gk ausente/inválido — descartado

  // BUG CORRIGIDO: aqui havia `parseAcceptedPositions(...) ?? [{ BOX_TO_BOX }]`.
  // Como isto roda em TODA reidratação do localStorage, qualquer dado gravado por
  // versão anterior (em que `acceptedPositions` não existia) caía no default e o
  // ELENCO INTEIRO virava coringa em silêncio — o sintoma "depois de um tempo sem
  // entrar, todos os jogadores viraram coringa". Isso violava a regra do dono:
  // nenhum jogador vira BOX_TO_BOX sem ele marcar isso no cadastro. Agora o campo
  // é ESTRITO como `attributes` e `gk`: não validou, descarta o registro.
  const acceptedPositions = parseAcceptedPositions(r.acceptedPositions);
  if (!acceptedPositions) return null;

  const player: Player = {
    id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
    name: typeof r.name === 'string' && r.name ? r.name : 'Jogador',
    active: typeof r.active === 'boolean' ? r.active : true,
    isGoalkeeper: asBool(r.isGoalkeeper),
    position: asPosition(r.position),
    attributes,
    gk: parsedGk,
    acceptedPositions,
  };
  const handicapPct = parseHandicapPct(r.handicapPct);
  if (handicapPct !== undefined) player.handicapPct = handicapPct;
  const positionOverrides = parsePositionOverrides(r.positionOverrides);
  if (positionOverrides !== undefined) player.positionOverrides = positionOverrides;
  const positionOrderIndifferent = parsePositionOrderIndifferent(r.positionOrderIndifferent);
  if (positionOrderIndifferent !== undefined) player.positionOrderIndifferent = positionOrderIndifferent;
  const veteran = parseVeteran(r.veteran);
  if (veteran !== undefined) player.veteran = veteran;
  return player;
};

/** Valida a lista inteira, DESCARTANDO (filtrando) cada registro malformado individualmente. */
export const normalizePlayers = (players: unknown): Player[] => {
  if (!Array.isArray(players)) return [];
  return players
    .map((p) => normalizePlayer(p as RawPlayer))
    .filter((p): p is Player => p !== null);
};
