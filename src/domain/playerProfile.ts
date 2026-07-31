// Descrição estruturada do PERFIL de um jogador a partir dos atributos —
// "como o jogador é", em dados, pra a UI (PlayerForm) montar o texto em
// português. Função PURA: só olha o vetor de atributos, nada de posição
// cadastrada/preferência (isso é VONTADE, um conceito diferente — ver
// `suggestPositions`/`hasNoEnabledAmongBestPositions` em
// src/engine/playerModel.ts, que descrevem CAPACIDADE por posição).
//
// Barata o bastante pra recalcular a cada arrasto de slider no cadastro (8
// comparações + 5 checagens de arquétipo, nada de laço sobre jogadores/times).

import type { AttrVector, AttributeKey } from './attributes';
import { ATTR_DEFAULT, ATTRIBUTE_META } from './attributes';

/**
 * Limiares (0–100), calibrados contra o vetor neutro (todos ATTR_DEFAULT=50):
 * um atributo só vira "destaque" ou "ponto fraco" quando está NITIDAMENTE
 * longe da média, não só um pouco acima/abaixo. Ajuste aqui se a calibração
 * não bater com o "sentimento" real do elenco.
 */
export const PROFILE_HIGHLIGHT_THRESHOLD = 66;
export const PROFILE_WEAKNESS_THRESHOLD = 34;

/** Sanity check de calibração: os dois limiares têm que enquadrar o neutro (50) no meio. */
if (PROFILE_WEAKNESS_THRESHOLD >= ATTR_DEFAULT || PROFILE_HIGHLIGHT_THRESHOLD <= ATTR_DEFAULT) {
  throw new Error('playerProfile: limiares de destaque/ponto fraco mal calibrados contra ATTR_DEFAULT');
}

export interface AttributeHighlight {
  key: AttributeKey;
  /** Rótulo legível em português (ex. "Finalização"), nunca a sigla crua. */
  label: string;
  value: number;
}

export interface PlayerProfileDescription {
  /** Atributos bem acima da média (>= PROFILE_HIGHLIGHT_THRESHOLD), do maior pro menor. */
  highlights: AttributeHighlight[];
  /** Atributos bem abaixo da média (<= PROFILE_WEAKNESS_THRESHOLD), do menor pro maior. */
  weaknesses: AttributeHighlight[];
  /** Rótulo de arquétipo quando o padrão de destaques é claro; null se não há padrão nítido. */
  archetype: string | null;
  /** true quando não há nenhum destaque nem ponto fraco — perfil equilibrado/mediano. */
  balanced: boolean;
}

/**
 * Arquétipos reconhecíveis — cada um exige um PAR específico de atributos
 * entre os DESTAQUES do jogador (ambos >= PROFILE_HIGHLIGHT_THRESHOLD).
 * ORDEM IMPORTA: a primeira regra cujo par esteja inteiro nos destaques
 * vence (um jogador pode, em teoria, casar mais de uma — ex. FIN+FIS+DEF
 * todos em alta bateria em "Referência de área" antes de "Defensor físico").
 * Lista enxuta de propósito — o dono pediu estes rótulos especificamente;
 * novos arquétipos devem ser acrescentados aqui, não espalhados pela UI.
 */
interface ArchetypeRule {
  label: string;
  keys: readonly [AttributeKey, AttributeKey];
}

const ARCHETYPES: readonly ArchetypeRule[] = [
  { label: 'Driblador veloz', keys: ['DRI', 'VEL'] },
  { label: 'Passador de saída de bola', keys: ['CRI', 'DEF'] },
  { label: 'Referência de área', keys: ['FIN', 'FIS'] },
  { label: 'Defensor físico', keys: ['DEF', 'FIS'] },
  { label: 'Camisa 10 que recompõe', keys: ['CRI', 'RCD'] },
];

const toHighlight = (key: AttributeKey, attrs: AttrVector): AttributeHighlight => ({
  key, label: ATTRIBUTE_META[key].label, value: attrs[key],
});

/** Descreve o perfil de um jogador a partir dos atributos atuais (0–100 cada). */
export const describePlayerProfile = (attrs: AttrVector): PlayerProfileDescription => {
  const keys = Object.keys(ATTRIBUTE_META) as AttributeKey[];

  const highlights = keys
    .filter((k) => attrs[k] >= PROFILE_HIGHLIGHT_THRESHOLD)
    .map((k) => toHighlight(k, attrs))
    .sort((a, b) => b.value - a.value);

  const weaknesses = keys
    .filter((k) => attrs[k] <= PROFILE_WEAKNESS_THRESHOLD)
    .map((k) => toHighlight(k, attrs))
    .sort((a, b) => a.value - b.value);

  const highlightKeys = new Set(highlights.map((h) => h.key));
  const archetype = ARCHETYPES.find((a) => a.keys.every((k) => highlightKeys.has(k)))?.label ?? null;

  return {
    highlights,
    weaknesses,
    archetype,
    balanced: highlights.length === 0 && weaknesses.length === 0,
  };
};
