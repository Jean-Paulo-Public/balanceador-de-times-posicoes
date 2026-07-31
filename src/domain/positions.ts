// Catálogo das 7 posições de linha do modelo v3 (Fut7: 1 goleiro + 6 de linha).
// Cada posição tem pesos sobre os 9 atributos existentes (FIN/CRI/DRI/DEF/VEL/
// RCD/INT/MOV/FIS), somando 1,00 — mesmo padrão de ROLES em src/domain/attributes.ts.
//
// Eixo mais importante do modelo: ALA vs VOLANTE. Mesma faixa do campo, CRI e
// DRI trocados de lugar. ALA constrói DRIBLANDO (DRI alto, CRI baixo — não é
// passador); VOLANTE constrói por PASSE na saída de bola (CRI alto, DRI baixo).
//
// "Posições de ataque" (usadas na regra da fila do goleiro, Fase 6): PIVO,
// SEGUNDO_ATACANTE, MEIA_ATACANTE — o goleiro do Jogo 1 não pode ser um deles.

import type { AttrVector } from './attributes';

export type LinePosition =
  | 'PIVO'
  | 'SEGUNDO_ATACANTE'
  | 'MEIA_ATACANTE'
  | 'ALA'
  | 'VOLANTE'
  | 'LATERAL'
  | 'FIXO';

export const ALL_LINE_POSITIONS: readonly LinePosition[] = [
  'PIVO', 'SEGUNDO_ATACANTE', 'MEIA_ATACANTE', 'ALA', 'VOLANTE', 'LATERAL', 'FIXO',
] as const;

/** Valor coringa no cadastro: "joga em qualquer posição, o sistema decide". */
export const BOX_TO_BOX = 'BOX_TO_BOX' as const;

/** Um valor de posição na lista de preferência do jogador (Fase 2). */
export type PositionPreference = LinePosition | typeof BOX_TO_BOX;

/**
 * Uma ENTRADA da lista ordenada de preferência do jogador (Fase 2 + toggle).
 * A ORDEM da lista (índice) é a informação principal e é preservada mesmo
 * para entradas desabilitadas — desabilitar não é apagar: reabilitar devolve
 * a posição ao MESMO lugar do ranking, sem precisar recadastrar a ordem.
 * `enabled` expressa o que o jogador está DISPOSTO a jogar agora; a lista em
 * si (a ordem completa) é o que ele SABE jogar. `BOX_TO_BOX` não expõe toggle
 * (é sempre habilitado — o coringa não tem "desabilitado").
 */
export interface PositionPreferenceEntry {
  position: PositionPreference;
  enabled: boolean;
}

/** true se alguma entrada da lista é o coringa BOX_TO_BOX habilitado. */
export const hasEnabledBoxToBox = (list: readonly PositionPreferenceEntry[]): boolean =>
  list.some((e) => e.enabled && e.position === BOX_TO_BOX);

/**
 * Posições de linha HABILITADAS, na ORDEM ORIGINAL (exclui BOX_TO_BOX e
 * entradas desabilitadas). É a "lista efetiva" usada pelo solver húngaro —
 * tanto pra restrição hard (só estas são candidatas) quanto pra normalizar a
 * penalidade de preferência pela profundidade RELATIVA a este tamanho (ver
 * formationModel.ts) — um jogador com 4 cadastradas mas só 2 habilitadas está
 * apertado agora, não flexível, e a normalização precisa refletir isso.
 */
export const enabledLinePositions = (list: readonly PositionPreferenceEntry[]): LinePosition[] =>
  list
    .filter((e): e is { position: LinePosition; enabled: true } => e.enabled && e.position !== BOX_TO_BOX)
    .map((e) => e.position);

/** Converte uma lista simples (ordem = preferência) em entradas todas habilitadas. */
export const allEnabled = (positions: readonly PositionPreference[]): PositionPreferenceEntry[] =>
  positions.map((position) => ({ position, enabled: true }));

/** Posições "de ataque" — referência p/ regra do goleiro (Fase 6). */
export const ATTACKING_POSITIONS: readonly LinePosition[] = [
  'PIVO', 'SEGUNDO_ATACANTE', 'MEIA_ATACANTE',
];

export const isAttackingPosition = (pos: LinePosition): boolean =>
  (ATTACKING_POSITIONS as readonly string[]).includes(pos);

const w = (
  FIN: number, CRI: number, DRI: number, DEF: number,
  VEL: number, RCD: number, INT: number, MOV: number, FIS: number,
): AttrVector => ({ FIN, CRI, DRI, DEF, VEL, RCD, INT, MOV, FIS });

export interface LinePositionMeta {
  key: LinePosition;
  label: string;
  help: string;
  /** Pesos por atributo (somam 1,00). */
  weights: AttrVector;
}

// O antigo peso único de REC foi dividido entre RCD (recuo defensivo puro) e
// INT (pressão de meio-campo/ataque), pela intenção de cada posição: FIXO,
// LATERAL e VOLANTE são as posições mais defensivas de origem -> RCD
// dominante; MEIA_ATACANTE é quem "recua na defesa" (ver help abaixo) -> RCD
// também pesa bastante nela; ALA e SEGUNDO_ATACANTE pressionam à frente -> INT
// dominante; VOLANTE soma um pouco dos dois (marca E pressiona a saída de
// bola); PIVO tem pouco dos dois (não é papel dele nem recompor nem pressionar).
export const LINE_POSITIONS: Record<LinePosition, LinePositionMeta> = {
  PIVO: {
    key: 'PIVO', label: 'Pivô',
    help: 'Referência de área, joga de costas pro gol. Domina finalização e é forte na proteção de bola/dividida.',
    weights: w(.32, .08, .08, .03, .05, .02, .03, .14, .25),
  },
  SEGUNDO_ATACANTE: {
    key: 'SEGUNDO_ATACANTE', label: 'Segundo Atacante',
    help: 'Vive de movimentação e finalização — ataca o espaço nas costas da defesa.',
    weights: w(.28, .08, .12, .02, .16, .01, .14, .15, .04),
  },
  MEIA_ATACANTE: {
    key: 'MEIA_ATACANTE', label: 'Meia-Atacante',
    help: 'Recua na defesa e entra na boca da área no ataque — criação, movimentação e finalização.',
    weights: w(.20, .24, .10, .04, .07, .10, .12, .09, .04),
  },
  ALA: {
    key: 'ALA', label: 'Ala',
    help: 'Constrói DRIBLANDO e cruzando no terço final. Não é passador — vive do drible, velocidade e movimentação.',
    weights: w(.08, .04, .30, .04, .20, .02, .14, .14, .04),
  },
  VOLANTE: {
    key: 'VOLANTE', label: 'Volante',
    help: 'O cara da saída de bola — meio-campista defensivo que constrói por PASSE, marca e recompõe.',
    weights: w(.03, .32, .06, .22, .02, .12, .14, .05, .04),
  },
  LATERAL: {
    key: 'LATERAL', label: 'Lateral',
    help: 'Quase um fixo, mas sobe pra atacar na fase final — a velocidade paga a subida.',
    weights: w(.02, .06, .06, .28, .18, .16, .06, .04, .14),
  },
  FIXO: {
    key: 'FIXO', label: 'Fixo',
    help: 'Último homem — defesa e força física dominam, referência da zaga.',
    weights: w(.00, .05, .02, .38, .06, .13, .03, .03, .30),
  },
};

/** Fit (0–100) de um jogador (vetor de atributos) numa posição de linha. */
export const linePositionFit = (attrs: AttrVector, pos: LinePosition): number => {
  const weights = LINE_POSITIONS[pos].weights;
  let s = 0;
  const keys: (keyof AttrVector)[] = ['FIN', 'CRI', 'DRI', 'DEF', 'VEL', 'RCD', 'INT', 'MOV', 'FIS'];
  for (const k of keys) s += attrs[k] * weights[k];
  return s;
};
