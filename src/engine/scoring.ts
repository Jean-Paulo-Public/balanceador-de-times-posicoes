// Motor de pontuação do modelo v2: fit por função, OVRs contextuais,
// complementaridade (sinergia) e nota efetiva do goleiro no rodízio.
// Funções PURAS sobre vetores de atributos — testáveis isoladamente e
// independentes do tipo Player (que ainda vai ganhar `attributes`/`gk`).
//
// Ver docs/Design_v2_Atributos_Funcoes_Sinergia.md (Seções 4, 5, 7, 8).

import type { Position } from '../domain/types';
import type { AttrVector, LineRoleKey, OvrKey } from '../domain/attributes';
import { ALL_ATTRIBUTE_KEYS, ROLES, OVR_WEIGHTS, ALLOWED_ROLES } from '../domain/attributes';

// ---------------------------------------------------------------------------
// Base: produto escalar atributos · pesos
// ---------------------------------------------------------------------------

/** Σ attr[a]·peso[a] sobre os 8 atributos. Resultado na escala 0–100. */
export const weightedScore = (attrs: AttrVector, weights: AttrVector): number => {
  let s = 0;
  for (const k of ALL_ATTRIBUTE_KEYS) s += attrs[k] * weights[k];
  return s;
};

/** Aptidão de um jogador numa função (0–100). */
export const roleFit = (attrs: AttrVector, role: LineRoleKey): number =>
  weightedScore(attrs, ROLES[role].weights);

/** OVR contextual (0–100). */
export const ovr = (attrs: AttrVector, key: OvrKey): number =>
  weightedScore(attrs, OVR_WEIGHTS[key]);

// ---------------------------------------------------------------------------
// Função natural (respeitando o PORTÃO da posição / matriz de improviso)
// ---------------------------------------------------------------------------

export const allowedRolesFor = (position: Position): LineRoleKey[] => ALLOWED_ROLES[position];

export interface RoleFitResult { role: LineRoleKey; fit: number; }

/** Aptidões em ordem decrescente, SÓ entre as funções permitidas pela posição. */
export const roleFits = (attrs: AttrVector, position: Position): RoleFitResult[] =>
  allowedRolesFor(position)
    .map((role) => ({ role, fit: roleFit(attrs, role) }))
    .sort((a, b) => b.fit - a.fit);

/** A função de maior aptidão permitida (a "função natural"). */
export const naturalRole = (attrs: AttrVector, position: Position): RoleFitResult =>
  roleFits(attrs, position)[0];

export const top2Roles = (attrs: AttrVector, position: Position): RoleFitResult[] =>
  roleFits(attrs, position).slice(0, 2);

/** Versatilidade 0..~1 (0 = especialista puro, ~1 = coringa). */
export const versatility = (attrs: AttrVector, position: Position): number => {
  const fits = roleFits(attrs, position);
  if (fits.length < 2 || fits[0].fit <= 0) return 0;
  return 1 - (fits[0].fit - fits[1].fit) / fits[0].fit;
};

// ---------------------------------------------------------------------------
// Goleiro: nota efetiva no rodízio gol/linha (Seção 7.1)
// ---------------------------------------------------------------------------

/**
 * Nota efetiva de um goleiro-apto = média por cenário:
 * 1 cenário no gol (usa GOL) + (k-1) cenários na linha (um por cada OUTRO
 * goleiro-apto que vai pro gol; o valor de linha pode mudar em cada um).
 *   efetiva = ( GOL + Σ valoresDeLinhaPorCenário ) / k,  com k = cenários = 1 + (k-1)
 * `lineScenarioValues` tem tamanho (k-1); vazio => k=1 (fica 100% no gol).
 */
export const effectiveGkRating = (gk: number, lineScenarioValues: number[]): number => {
  const k = lineScenarioValues.length + 1;
  const soma = lineScenarioValues.reduce((a, b) => a + b, 0);
  return (gk + soma) / k;
};

/** Versão simplificada quando o valor de linha é o mesmo em todos os cenários. */
export const effectiveGkRatingSimple = (gk: number, lineBest: number, k: number): number => {
  if (k <= 1) return gk;
  return (gk + (k - 1) * lineBest) / k;
};

/** Cobertura de gol do time = média dos GOL dos aptos (cada um pesa 1/k). */
export const coberturaGol = (gkValuesDosAptos: number[]): number =>
  gkValuesDosAptos.length
    ? gkValuesDosAptos.reduce((a, b) => a + b, 0) / gkValuesDosAptos.length
    : 0;

// ---------------------------------------------------------------------------
// Sinergia: complementaridade (Seção 8.1) — produto, não soma
// ---------------------------------------------------------------------------

const topN = (vals: number[], n: number): number[] =>
  [...vals].sort((a, b) => b - a).slice(0, n);
const mean = (vals: number[]): number =>
  vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

/**
 * Potencial de ataque ≈ (finalização_efetiva)^α · (criação_efetiva)^(1-α), α=0,5.
 * Se ninguém cria, tende a 0 mesmo com grandes finalizadores ("não recebe bola").
 */
export const potencialAtaque = (outfield: AttrVector[], alpha = 0.5): number => {
  if (outfield.length === 0) return 0;
  const finEf = mean(topN(outfield.map((a) => a.FIN), 2));
  const criEf = Math.max(...outfield.map((a) => a.CRI));
  return Math.pow(finEf, alpha) * Math.pow(criEf, 1 - alpha);
};

/**
 * Estabilidade defensiva ≈ (defesa_efetiva)^β · (recomposição_efetiva)^(1-β), β=0,6.
 * Marcar sem recompor (ou o contrário) dá defesa frágil. Usa RCD (recuo
 * defensivo puro), não INT — esta métrica é sobre solidez de marcação, não
 * sobre pressão à frente.
 */
export const estabilidadeDefensiva = (outfield: AttrVector[], beta = 0.6): number => {
  if (outfield.length === 0) return 0;
  const defEf = mean(topN(outfield.map((a) => a.DEF), 2));
  const recEf = mean(outfield.map((a) => a.RCD));
  return Math.pow(defEf, beta) * Math.pow(recEf, 1 - beta);
};
