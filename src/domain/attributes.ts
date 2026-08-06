// Catálogo de atributos, funções e OVRs — modelo v2 (notas 0–100).
// Ver docs/Design_v2_Atributos_Funcoes_Sinergia.md.
//
// Este módulo é PURAMENTE ADITIVO: define os metadados e os pesos do novo
// modelo (atributos/funções/sinergia) sem ainda substituir o modelo de estrela
// única. O motor passa a consumir isto ao longo da Fase 1.

import type { Position } from './types';

/**
 * As 10 dimensões: 9 de linha (0–100) + 1 de ofensividade contextual.
 * GOL é tratado à parte (pode ser nulo).
 *
 * REC ("Recomposição") foi removido e dividido em dois atributos-base:
 *  - RCD (Recomposição Defensiva) — recuo puro pra marcar.
 *  - INT (Intensidade) — pressão de meio-campo/ataque, saída de bola adversária.
 * Ver comentários em ATTRIBUTE_META abaixo para o porquê da separação.
 *
 * OFE (Ofensividade inteligente) é um novo atributo que descreve capacidade de
 * reconhecer espaço, driblar quando pode, chutar quando é melhor opção — atacar com
 * inteligência situacional.
 */
export type AttributeKey =
  | 'FIN' | 'CRI' | 'DRI' | 'DEF' | 'VEL' | 'RCD' | 'INT' | 'MOV' | 'FIS' | 'OFE';

export const ALL_ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  'FIN', 'CRI', 'DRI', 'DEF', 'VEL', 'RCD', 'INT', 'MOV', 'FIS', 'OFE',
] as const;

/** Vetor de atributos de um jogador (também usado como vetor de pesos). */
export interface AttrVector {
  FIN: number; CRI: number; DRI: number; DEF: number;
  VEL: number; RCD: number; INT: number; MOV: number; FIS: number; OFE: number;
}

export const ATTR_MIN = 0;
export const ATTR_MAX = 100;
export const ATTR_DEFAULT = 50;
/** Nota padrão de goleiro para quem é marcado como apto ao gol. */
export const GK_DEFAULT = 50;

/** Prende uma nota na escala 0–100 (inteiro). */
export const clampAttr = (v: number): number => {
  if (Number.isNaN(v)) return ATTR_DEFAULT;
  return Math.max(ATTR_MIN, Math.min(ATTR_MAX, Math.round(v)));
};

/** Cria um vetor completo de atributos com um valor default. */
export const emptyAttrs = (value: number = ATTR_DEFAULT): AttrVector => ({
  FIN: value, CRI: value, DRI: value, DEF: value,
  VEL: value, RCD: value, INT: value, MOV: value, FIS: value, OFE: value,
});

export interface AttributeMeta {
  key: AttributeKey;
  label: string;
  help: string;
}

export const ATTRIBUTE_META: Record<AttributeKey, AttributeMeta> = {
  FIN: { key: 'FIN', label: 'Finalização', help: 'Chute e finalização, de dentro e de fora.' },
  CRI: { key: 'CRI', label: 'Criação', help: 'Passe, visão, saída de bola, último passe.' },
  DRI: { key: 'DRI', label: 'Drible & Domínio', help: '1v1, condução e controle em espaço curto.' },
  DEF: { key: 'DEF', label: 'Defesa', help: 'Marcação, desarme, antecipação, posicionamento.' },
  VEL: { key: 'VEL', label: 'Velocidade', help: 'Ritmo e aceleração (pique).' },
  // RCD é atributo-BASE (o usuário digita o valor direto no slider) — não há
  // fórmula nem pesos internos aqui. Isso é DE PROPÓSITO: o dono quer VEL fora
  // da conta ("o jogador veloz geralmente faz corpo mole ao voltar pra
  // marcar"), e como não existe derivação, não há como VEL vazar pra dentro
  // deste número. NÃO tente "derivar" RCD de outros atributos depois — o
  // ponto inteiro é ele ser puro e digitado à mão.
  RCD: { key: 'RCD', label: 'Recomposição Defensiva', help: 'Recuo puro pra marcar — o quanto o jogador efetivamente volta e se sacrifica na defesa. NÃO é influenciado por velocidade.' },
  // INT é meio-campo/pressão à FRENTE — explicitamente SEM o componente de
  // recuo defensivo (isso é RCD, acima). São dois traços distintos.
  INT: { key: 'INT', label: 'Intensidade', help: 'Pressão no meio-campo e no ataque — marcar a saída de bola do adversário no campo dele. Não é o recuo defensivo (isso é Recomposição Defensiva).' },
  MOV: { key: 'MOV', label: 'Mobilidade', help: 'Desmarque, ocupação de espaço, movimento sem bola.' },
  FIS: { key: 'FIS', label: 'Físico/Força', help: 'Proteção de bola, dividida, duelo, jogo aéreo.' },
  OFE: { key: 'OFE', label: 'Ofensividade', help: 'Ataque com inteligência situacional — reconhecer espaço, driblar quando pode, chutar quando é a melhor opção. Capacidade de atacar de forma contextualizada.' },
};

/**
 * Presets rápidos (botões de nível) para preencher qualquer atributo, incluindo
 * extremos. Clicar o mesmo rótulo em TODAS as 10 linhas de atributo iguala os
 * 10 ao mesmo valor — como os pesos de cada OVR somam 1,00 (ver OVR_WEIGHTS),
 * isso faz o overall resultante dar exatamente esse valor (ex.: "Baixa" em
 * todos os atributos -> overall 35).
 */
export const ATTR_PRESETS: { label: string; value: number }[] = [
  { label: 'Nenhum', value: 0 },
  { label: 'Mínimo', value: 10 },
  { label: 'Muito baixa', value: 20 },
  { label: 'Baixa', value: 35 },
  { label: 'Média', value: 50 },
  { label: 'Alta', value: 75 },
  { label: 'Muito alta', value: 85 },
  { label: 'Máx', value: 100 },
];

// ---------------------------------------------------------------------------
// Funções (roles)
// ---------------------------------------------------------------------------

export type RoleKey = 'GOL' | 'MARC' | 'CONS' | 'B2B' | 'ARM' | 'ALA' | 'PIVO' | 'SA';
export type LineRoleKey = Exclude<RoleKey, 'GOL'>;

/** Zona tática de cada função de linha. */
export type Zone = 'DEF' | 'MEI' | 'ATA';

export const ROLE_ZONE: Record<LineRoleKey, Zone> = {
  MARC: 'DEF', CONS: 'DEF',
  B2B: 'MEI', ARM: 'MEI', ALA: 'MEI',
  PIVO: 'ATA', SA: 'ATA',
};

/** Helper para escrever um vetor de pesos [FIN,CRI,DRI,DEF,VEL,RCD,INT,MOV,FIS,OFE]. */
const w = (
  FIN: number, CRI: number, DRI: number, DEF: number,
  VEL: number, RCD: number, INT: number, MOV: number, FIS: number, OFE: number,
): AttrVector => ({ FIN, CRI, DRI, DEF, VEL, RCD, INT, MOV, FIS, OFE });

export interface RoleMeta {
  key: LineRoleKey;
  label: string;
  /** Pesos por atributo (somam 1,00). */
  weights: AttrVector;
}

// Pesos verificados: cada linha soma 1,00 (ver Seção 4.1 do design).
// O antigo peso único de REC foi dividido entre RCD (recuo puro) e INT
// (pressão à frente), pela intenção de cada função: MARC/CONS (zona DEF) ficam
// com RCD dominante; ARM/ALA (zona MEI, mais ofensivos) ficam com INT
// dominante; B2B (coringa de transição) fica com os dois quase equilibrados.
export const ROLES: Record<LineRoleKey, RoleMeta> = {
  // VEL .13 → .03 e FIS .15 → .10, com DEF subindo pra .51: marcar não é correr
  // nem ser forte. Mesma calibragem aplicada em `LINE_POSITIONS.FIXO` — antes
  // existia um OVR 'Defesa' com estes mesmos pesos, hoje removido (ver nota em
  // OVR_WEIGHTS abaixo); este papel e o FIXO são o que restou dela.
  MARC: { key: 'MARC', label: 'Marcador',         weights: w(.00, .07, .04, .51, .03, .16, .04, .05, .10, 0) },
  CONS: { key: 'CONS', label: 'Construtor',       weights: w(.03, .40, .13, .24, .04, .04, .02, .04, .06, 0) },
  B2B:  { key: 'B2B',  label: 'Box-to-box',       weights: w(.07, .18, .08, .20, .12, .11, .11, .07, .06, 0) },
  ARM:  { key: 'ARM',  label: 'Armador',          weights: w(.08, .36, .22, .04, .06, .01, .04, .15, .04, 0) },
  ALA:  { key: 'ALA',  label: 'Ala/Corredor',     weights: w(.10, .12, .12, .07, .26, .05, .12, .12, .04, 0) },
  PIVO: { key: 'PIVO', label: 'Pivô',             weights: w(.30, .17, .09, .05, .03, .02, .04, .12, .18, 0) },
  SA:   { key: 'SA',   label: 'Segundo atacante', weights: w(.30, .08, .17, .04, .16, .01, .06, .16, .02, 0) },
};

export const ALL_LINE_ROLES: readonly LineRoleKey[] = [
  'MARC', 'CONS', 'B2B', 'ARM', 'ALA', 'PIVO', 'SA',
] as const;

/**
 * Portão da posição (matriz de improviso) — funções permitidas por posição de
 * origem. DEFENSOR nunca ataca; ATACANTE nunca defende; MEIA em qualquer zona.
 * Vale MESMO que os atributos digam o contrário (Seção 4 do design).
 */
export const ALLOWED_ROLES: Record<Position, LineRoleKey[]> = {
  DEFENSOR: ['MARC', 'CONS', 'B2B', 'ARM', 'ALA'],
  MEIA: ['MARC', 'CONS', 'B2B', 'ARM', 'ALA', 'PIVO', 'SA'],
  ATACANTE: ['B2B', 'ARM', 'ALA', 'PIVO', 'SA'],
};

/** Zonas de campo permitidas por posição de origem (matriz de improviso). */
export const ALLOWED_ZONES: Record<Position, Zone[]> = {
  DEFENSOR: ['DEF', 'MEI'],
  MEIA: ['DEF', 'MEI', 'ATA'],
  ATACANTE: ['MEI', 'ATA'],
};

// ---------------------------------------------------------------------------
// OVRs contextuais (derivados)
// ---------------------------------------------------------------------------

// O OVR 'Intensidade' que existia aqui foi REMOVIDO: agora que INT é um
// atributo-BASE com o mesmo nome, manter um OVR também chamado "Intensidade"
// seria confusão garantida (dois números diferentes com o mesmo rótulo). O
// chip de listagem que mostrava esse OVR passou a mostrar o atributo RCD
// direto (ver src/features/players/ovrDisplay.ts).
export type OvrKey = 'Geral' | 'ATA' | 'Construcao' | 'Mobilidade';

// Pesos verificados: cada linha soma 1,00 (ver Seção 5 do design). O antigo
// peso único de REC foi dividido entre RCD e INT pela intenção de cada OVR:
// Defesa é "solidez pura de marcação" -> RCD dominante; Mobilidade é
// movimento/pressão sem bola -> INT dominante; Geral/Construção ficam quase
// equilibrados entre os dois.
// ATA agora inclui OFE (Ofensividade inteligente) com peso 0.32, redistribuindo
// os outros pesos por fator 0.68 para manter soma = 1,00.
export const OVR_WEIGHTS: Record<OvrKey, AttrVector> = {
  // OFE entrou no Geral com a MESMA regra de três usada no ATA (decisão do dono):
  // o grupo "não-defensivo" (FIN, CRI, DRI, VEL, INT, MOV, FIS) somava .78; ele
  // encolheu por fator .68 e o OFE ficou com 32% desse grupo (.32 × .78 = .2496).
  // DEF (.16) e RCD (.06) NÃO foram tocados — o grupo continua somando .78 e o
  // vetor inteiro, 1,00. Efeito prático: com OFE 50 (neutro) o OVR de todo mundo
  // fica igual ao de antes; só quem tem ofensividade acima/abaixo da média se move.
  // NOTA: com .2496 o OFE virou o MAIOR peso do Geral (acima de CRI e DEF, ambos
  // .16). O dono está ciente de que isso dilui o peso relativo da defesa e optou
  // por não antecipar ajuste — se incomodar, o conserto é subir DEF aqui.
  Geral:       w(.102, .1088, .0816, .16, .068, .06, .034, .0612, .0748, .2496),
  ATA:         w(.2176, .102, .1156, .00, .068, .00, .0204, .102, .0544, .32),
  // NÃO existe mais um OVR 'Defesa'. Ele alimentava o chip DEF da listagem, que
  // virou o ATRIBUTO de marcação PURO ("conte somente a DEF no chip") — e o
  // balanceador nunca usou este vetor: o eixo defensivo do time é a
  // `estabilidadeDefensiva` (geométrica, com os 2 melhores DEF, a recomposição
  // e o goleiro). Ficou sem consumidor e foi removido em vez de virar peso
  // morto que alguém ajustaria achando que muda algo. As calibragens que
  // moravam aqui (VEL .13→.03 e FIS .15→.10, "ser rápido/forte não é defender")
  // seguem vivas em `ROLES.MARC` e em `LINE_POSITIONS.FIXO`.
  Construcao:  w(.03, .44, .17, .11, .03, .02, .03, .09, .08, 0),
  Mobilidade:  w(.10, .07, .12, .04, .28, .03, .12, .19, .05, 0),
};

export const OVR_LABELS: Record<OvrKey, string> = {
  Geral: 'Geral', ATA: 'Ataque',
  Construcao: 'Construção', Mobilidade: 'Mobilidade',
};
