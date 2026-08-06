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
 * Pesos (expoentes) dos 3 fatores do potencial de ataque. Média geométrica de
 * 3 termos exige que os expoentes somem 1,00 — senão a escala 0–100 quebra
 * (∛(100×100×100) = 100, mas √(100×100×100) ≈ 1000 se um expoente sobrar).
 * Hoje os 3 pesam igual (1/3 cada); nomeados em constantes pra poder calibrar
 * sem tocar na fórmula.
 */
export const OFF_FIN_WEIGHT = 1 / 3;
export const OFF_CRI_WEIGHT = 1 / 3;
export const OFF_OFE_WEIGHT = 1 / 3;

/**
 * Potencial de ataque ≈ (finalização_efetiva)^wFin · (criação_efetiva)^wCri ·
 * (ofensividade_efetiva)^wOfe, com wFin+wCri+wOfe = 1,00 (hoje 1/3 cada).
 *
 * Se ninguém cria (ou ninguém tem finalização, ou ninguém tem ofensividade),
 * o produto zera mesmo com grandes finalizadores — é assim de propósito
 * ("não recebe bola" / "não tem quem ofereça perigo"), mas agora um time sem
 * NENHUM jogador ofensivo também zera o eixo inteiro. Não há piso artificial.
 *
 * A ofensividade usa a MÉDIA DOS 2 MELHORES OFE (igual à finalização), não o
 * máximo: ofensividade é algo que vários atacantes somam ao time (múltiplas
 * ameaças), diferente da criação, que usa o MÁXIMO porque um único armador já
 * basta pra municiar o ataque inteiro.
 */
export const potencialAtaque = (outfield: AttrVector[], zoneFactors?: readonly number[]): number => {
  if (outfield.length === 0) return 0;
  const f = (i: number) => zoneFactors?.[i] ?? 1;
  // O fator da ZONA escala os atributos ANTES das agregações (top-2 / máximo).
  // Tem de ser antes: o campo é grande, e um jogador escalado no fixo contribui
  // pouco pro ataque — se o fator entrasse depois, o melhor CRI do time
  // continuaria sendo dele independente da vaga que ocupa.
  const finEf = mean(topN(outfield.map((a, i) => a.FIN * f(i)), 2));
  const criEf = Math.max(...outfield.map((a, i) => a.CRI * f(i)));
  const ofeEf = mean(topN(outfield.map((a, i) => a.OFE * f(i)), 2));
  return (
    Math.pow(finEf, OFF_FIN_WEIGHT) *
    Math.pow(criEf, OFF_CRI_WEIGHT) *
    Math.pow(ofeEf, OFF_OFE_WEIGHT)
  );
};

/**
 * Estabilidade defensiva ≈ (defesa_efetiva)^β · (recomposição_efetiva)^(1-β), β=0,5.
 * Marcar sem recompor (ou o contrário) dá defesa frágil. Usa RCD (recuo
 * defensivo puro), não INT — esta métrica é sobre solidez de marcação, não
 * sobre pressão à frente.
 *
 * β caiu de 0,6 para 0,5 (decisão do dono): "se o cara não volta pra recompor
 * ele atrapalha muito defensivamente, muito mesmo". Agora marcação e
 * recomposição pesam IGUAL neste eixo. Como é PRODUTO e não soma, recomposição
 * baixa já derrubava o eixo inteiro; o que mudou é o quanto ela derruba.
 */
export const DEF_STABILITY_BETA = 0.5;

export const estabilidadeDefensiva = (
  outfield: AttrVector[], beta = DEF_STABILITY_BETA, zoneFactors?: readonly number[],
): number => {
  if (outfield.length === 0) return 0;
  const f = (i: number) => zoneFactors?.[i] ?? 1;
  // Mesma lógica invertida do ataque: um pivô plantado na área adversária
  // contribui pouco pra solidez defensiva, mesmo que tenha DEF alta.
  const defEf = mean(topN(outfield.map((a, i) => a.DEF * f(i)), 2));
  const recEf = mean(outfield.map((a, i) => a.RCD * f(i)));
  return Math.pow(defEf, beta) * Math.pow(recEf, 1 - beta);
};
