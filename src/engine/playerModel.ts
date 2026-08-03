// Atributos "efetivos" de um jogador: parte dos atributos base (0–100, única
// fonte de verdade), aplica a SOBRESCRITA por posição de linha
// (modelo v3.1 — "tem jogadores melhores de finalização mais perto do gol") e
// por fim a redução temporária por lesão (`handicapPct`). Ordem SEMPRE:
// base -> sobrescrita da posição -> lesão (a lesão reduz por último, para que
// o valor específico da posição também caia quando o jogador está machucado).
//
// IMPORTANTE: como os atributos agora podem depender da posição, não existe
// mais um único "effectiveAttributes(player)" implícito. Duas funções
// nomeadas, de propósito explícito:
//  - `effectiveAttributesBase(p)`  — SEM contexto de posição (base + lesão).
//    Use para o que não deve variar por posição de linha: overall exibido no
//    card, traços globais (isPivot/isFast/...).
//  - `effectiveAttributes(p, position)` — NUMA posição de linha específica
//    (modelo v3). Use para pontuar o encaixe numa vaga (o solver húngaro em
//    formationModel.ts usa isso em cada célula da matriz de custo).

import type { Player } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { ALL_ATTRIBUTE_KEYS, clampAttr } from '../domain/attributes';
import { ovr, naturalRole } from './scoring';
import {
  ALL_LINE_POSITIONS, BOX_TO_BOX, enabledLinePositions, hasEnabledBoxToBox,
  isAttackingPosition, linePositionFit, type LinePosition,
} from '../domain/positions';

/** Atributos base do jogador (fonte de verdade — nunca derivados). */
export const baseAttributes = (p: Player): AttrVector => p.attributes;

const factorOf = (p: Player): number =>
  1 - Math.max(0, Math.min(100, p.handicapPct ?? 0)) / 100;

const applyHandicap = (attrs: AttrVector, factor: number): AttrVector => {
  if (factor >= 1) return attrs;
  const out = { ...attrs };
  for (const k of ALL_ATTRIBUTE_KEYS) out[k] = clampAttr(out[k] * factor);
  return out;
};

/**
 * Atributos base COM a sobrescrita por posição (modelo v3.1) já aplicada,
 * mas AINDA sem a redução por lesão. A sobrescrita é ABSOLUTA (não delta) e
 * ESPARSA: só as chaves definidas em `p.positionOverrides[position]` mudam —
 * o resto vem da base. Sem exceção pra essa posição, devolve a base intacta.
 */
export const attributesForPosition = (p: Player, position: LinePosition): AttrVector => {
  const base = baseAttributes(p);
  const override = p.positionOverrides?.[position];
  return override ? { ...base, ...override } : base;
};

/**
 * Atributos efetivos SEM contexto de posição — base + lesão, nada mais.
 * NUNCA use isto pra pontuar o encaixe numa posição de linha (a sobrescrita
 * por posição não entra aqui) — para isso, use `effectiveAttributes(p, position)`.
 */
export const effectiveAttributesBase = (p: Player): AttrVector =>
  applyHandicap(baseAttributes(p), factorOf(p));

/**
 * Atributos efetivos NUMA posição de linha específica (modelo v3.1):
 * base -> sobrescrita da posição -> lesão, NESSA ORDEM. A lesão reduz por
 * ÚLTIMO, de modo que o valor específico da posição também caia quando o
 * jogador está machucado (uma exceção de FIN=80 no pivô com 30% de lesão vira
 * 56, não 80). É o que o solver húngaro (formationModel.ts) usa em cada
 * célula da matriz de custo (jogador × vaga).
 */
export const effectiveAttributes = (p: Player, position: LinePosition): AttrVector =>
  applyHandicap(attributesForPosition(p, position), factorOf(p));

/** Nota de goleiro base (fonte de verdade — nunca derivada). */
export const baseGk = (p: Player): number | null => p.gk;

/** Nota de goleiro após a redução por lesão. */
export const effectiveGk = (p: Player): number | null => {
  const base = baseGk(p);
  return base == null ? null : clampAttr(base * factorOf(p));
};

/** Overall (0–100) efetivo — usado na exibição e como "nota" do jogador. Não varia por posição. */
export const overallOf = (p: Player): number => Math.round(ovr(effectiveAttributesBase(p), 'Geral'));

/** Overall base (sem a redução de lesão, sem sobrescrita de posição). */
export const baseOverallOf = (p: Player): number => Math.round(ovr(baseAttributes(p), 'Geral'));

export const isInjured = (p: Player): boolean => (p.handicapPct ?? 0) > 0;

// ---------------------------------------------------------------------------
// Traços inferidos a partir dos atributos v2 (substituem as flags legadas)
// ---------------------------------------------------------------------------

/**
 * Fit mínimo (0–100) de PIVO pra considerar alguém "referência de área" nata.
 * Calibrado contra o vetor default (todos 50): com atributos neutros o fit de
 * PIVO fica em 50 (pesos somam 1,00). 58 exige um perfil visivelmente puxado
 * pra FIN/FIS/CRI acima da média — na prática, quem o app antigo marcaria com
 * a flag `pivotFriendly`.
 */
const PIVOT_FIT_THRESHOLD = 58;

/**
 * Um jogador é "pivô nato" (referência de área) quando PIVO é a função de
 * maior aptidão entre as permitidas pela posição E o fit é alto o bastante.
 * Substitui a flag legada `pivotFriendly` — usado por generateTeams/balance
 * pra não juntar 2 pivôs no mesmo time. Traço GLOBAL (não varia por posição
 * de linha), por isso usa `effectiveAttributesBase`.
 */
export const isPivot = (p: Player): boolean => {
  const attrs = effectiveAttributesBase(p);
  const best = naturalRole(attrs, p.position);
  return best.role === 'PIVO' && best.fit >= PIVOT_FIT_THRESHOLD;
};

/** Limiares dos traços de linha (0–100), calibrados contra o vetor neutro (50). */
const FAST_VEL_THRESHOLD = 62;
const GOOD_BUILDUP_CRI_THRESHOLD = 62;
const LOW_RECOVERY_RCD_THRESHOLD = 40;

/** Substitui a flag legada `veloz`: VEL bem acima da média. */
export const isFast = (p: Player): boolean => effectiveAttributesBase(p).VEL >= FAST_VEL_THRESHOLD;

/** Substitui a flag legada `boaSaidaDeBola`: CRI bem acima da média. */
export const hasGoodBuildUp = (p: Player): boolean => effectiveAttributesBase(p).CRI >= GOOD_BUILDUP_CRI_THRESHOLD;

/**
 * Substitui a flag legada `recompoePouco`: RCD bem abaixo da média. Usa RCD
 * (recuo defensivo puro), não INT — a flag legada era sobre "voltar pra
 * marcar", que é exatamente o que RCD isola.
 */
export const hasLowRecovery = (p: Player): boolean => effectiveAttributesBase(p).RCD <= LOW_RECOVERY_RCD_THRESHOLD;

// ---------------------------------------------------------------------------
// Posição de linha dominante (modelo v3 — Fase 2/6) e regra do goleiro
// ---------------------------------------------------------------------------

/**
 * A posição de linha "dominante" de um jogador: a de maior preferência na
 * lista ordenada (índice 0), ou — se o jogador é `BOX_TO_BOX` (coringa) — a de
 * maior fit entre as 7 posições, pelos atributos base (sem uma posição ainda
 * decidida, não há sobrescrita pra aplicar). Usada pra decidir se um
 * goleiro-apto "é um atacante" (regra da fila do goleiro, Fase 6), sem
 * precisar rodar o solver completo.
 */
export const dominantLinePosition = (p: Player): LinePosition => {
  const first = p.acceptedPositions.find((e) => e.enabled && e.position !== BOX_TO_BOX);
  if (first) return first.position as LinePosition;
  const attrs = effectiveAttributesBase(p);
  let best: LinePosition = ALL_LINE_POSITIONS[0];
  let bestFit = -Infinity;
  for (const pos of ALL_LINE_POSITIONS) {
    const f = linePositionFit(attrs, pos);
    if (f > bestFit) { bestFit = f; best = pos; }
  }
  return best;
};

/** Um jogador "é um atacante" (PIVO/SEGUNDO_ATACANTE/MEIA_ATACANTE) pela posição dominante. */
export const isAttackerPlayer = (p: Player): boolean => isAttackingPosition(dominantLinePosition(p));

// ---------------------------------------------------------------------------
// Sugestão de posições (cadastro) — MESMA conta que o solver da Fase 4 usa
// ---------------------------------------------------------------------------

export interface PositionSuggestion {
  position: LinePosition;
  /** roleFit (0–100) — mesma fórmula/atributos que a célula do húngaro usaria. */
  fit: number;
}

/**
 * As 7 posições de linha ranqueadas por fit DECRESCENTE, pros atributos
 * ATUAIS do jogador (com a sobrescrita por posição — modelo v3.1 — e a lesão
 * já aplicadas via `effectiveAttributes`). É INFORMATIVA/de CAPACIDADE — não
 * olha `acceptedPositions` (isso é VONTADE, um conceito diferente).
 *
 * CRÍTICO: usa exatamente o mesmo `effectiveAttributes(p, pos)` + `linePositionFit`
 * que `identityCost` em formationModel.ts usa em cada célula da matriz de
 * custo do húngaro — a sugestão no cadastro é literalmente uma prévia do que
 * o solver vai ver, pra nunca divergir da conta real do balanceador.
 *
 * Barata o bastante pra rodar a cada mexida de slider no cadastro (7 posições
 * × 1 produto escalar de 8 atributos cada — a mesma conta que o PlayerForm já
 * faz pro Overall a cada edição).
 */
export const suggestPositions = (p: Player): PositionSuggestion[] =>
  ALL_LINE_POSITIONS
    .map((position) => ({ position, fit: linePositionFit(effectiveAttributes(p, position), position) }))
    .sort((a, b) => b.fit - a.fit);

export interface BestPositionsCriteria {
  /** Quantas das melhores posições (por fit) contam como "as melhores" do jogador. Default 3. */
  topN?: number;
  /** Alternativa/complemento ao topN: qualquer posição com fit >= este limiar também conta. */
  minFit?: number;
}

const bestPositionsOf = (p: Player, criteria: BestPositionsCriteria): Set<LinePosition> => {
  const { topN = 3, minFit } = criteria;
  const ranked = suggestPositions(p);
  const set = new Set<LinePosition>(ranked.slice(0, topN).map((s) => s.position));
  if (minFit != null) for (const s of ranked) if (s.fit >= minFit) set.add(s.position);
  return set;
};

/**
 * true quando NENHUMA posição HABILITADA do jogador está entre as "melhores"
 * dele (critério configurável — top N por fit e/ou fit >= minFit). Serve pro
 * cadastro alertar: "esse jogador está habilitado só em posições onde ele é
 * fraco" — erro provável e difícil de perceber depois, porque o balanceamento
 * fica ruim sem motivo aparente. `BOX_TO_BOX` (coringa, aceita qualquer
 * posição) nunca dispara o aviso.
 */
export const hasNoEnabledAmongBestPositions = (p: Player, criteria: BestPositionsCriteria = {}): boolean => {
  if (hasEnabledBoxToBox(p.acceptedPositions)) return false;
  const enabled = enabledLinePositions(p.acceptedPositions);
  if (enabled.length === 0) return true; // sem nenhuma posição jogável habilitada
  const best = bestPositionsOf(p, criteria);
  return !enabled.some((pos) => best.has(pos));
};
