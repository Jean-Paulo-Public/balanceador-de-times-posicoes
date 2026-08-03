import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled, type PositionPreferenceEntry } from '../domain/positions';

let counter = 0;

/**
 * Atalhos pra fixtures de teste equivalentes às flags legadas (pivotFriendly,
 * veloz, boaSaidaDeBola, recompoePouco), agora expressos como atributos v2 —
 * ver `isPivot`/`isFast`/`hasGoodBuildUp`/`hasLowRecovery` em playerModel.ts.
 */
export interface TestTraits {
  /** Referência de área nata (equivalente a `pivotFriendly`). */
  pivot?: boolean;
  /** Bem veloz (equivalente a `veloz`). */
  fast?: boolean;
  /** Boa saída de bola (equivalente a `boaSaidaDeBola`). */
  goodBuildUp?: boolean;
  /** Recompõe pouco (equivalente a `recompoePouco`). */
  lowRecovery?: boolean;
}

/** Vetor UNIFORME (0–100): todos os 9 atributos no mesmo valor — o jeito mais
 * direto de fixture pra um "overall" alvo, já que os pesos de cada OVR somam
 * 1,00 (ver OVR_WEIGHTS em domain/attributes.ts). */
const flatAttrs = (overall: number): AttrVector => {
  const v = clampAttr(overall);
  return { FIN: v, CRI: v, DRI: v, DEF: v, VEL: v, RCD: v, INT: v, MOV: v, FIS: v };
};

const applyTraits = (attrs: AttrVector, overall: number, traits: TestTraits | undefined): AttrVector => {
  if (!traits) return attrs;
  let out = attrs;
  // Perfil de pivô (FIN/FIS puxados) com folga acima do limiar de isPivot(),
  // mas MONOTÔNICO em `overall` (cresce com o overall pedido) — ao contrário
  // de um perfil fixo, isso permite comparar overallOf() entre dois pivôs
  // (ex.: pickImprovisedAttacker escolhendo "o pivô de maior overall").
  if (traits.pivot) {
    const v = clampAttr(overall);
    out = {
      FIN: clampAttr(60 + v * 0.5), CRI: 55, DRI: 50, DEF: 20, VEL: 40,
      RCD: 40, INT: 40, MOV: 20, FIS: clampAttr(50 + v * 0.4),
    };
  }
  if (traits.fast) out = { ...out, VEL: 90 };
  if (traits.goodBuildUp) out = { ...out, CRI: 90 };
  if (traits.lowRecovery) out = { ...out, RCD: 5 };
  return out;
};

/**
 * Fixture de jogador: monta os 9 atributos DIRETO na escala 0–100 (vetor
 * uniforme no valor de `overall`, salvo traços que sobrescrevem alguns
 * atributos — ver `TestTraits`). Sem estrela, sem derivação: overall 0–100 é
 * a única escala.
 */
export const makePlayer = (
  position: Position,
  overall: number = 60,
  overrides: Partial<Player> & { traits?: TestTraits } = {}
): Player => {
  counter += 1;
  const { traits, ...rest } = overrides;
  const attributes = applyTraits(flatAttrs(overall), overall, traits);
  return {
    id: `test-${counter}`,
    name: `${position}-${counter}`,
    active: true,
    isGoalkeeper: false,
    position,
    attributes,
    gk: null,
    acceptedPositions: allEnabled([BOX_TO_BOX]),
    ...rest,
  };
};

export const makeGoalkeeper = (overall: number = 80, overrides: Partial<Player> = {}): Player =>
  makePlayer('MEIA', overall, { isGoalkeeper: true, gk: clampAttr(overall), ...overrides });

/** Overall variado mas dentro da escala 0–100. */
const variedOverall = (i: number): number => clampAttr(30 + (i % 8) * 10);

/** Pool fácil: bastante opção em todas as posições, notas variadas mas nunca escassas. */
export const buildBalancedPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper(60 + (i % 3) * 10));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', variedOverall(i)));
  for (let i = 0; i < numTeams * 5; i++) players.push(makePlayer('MEIA', variedOverall(i)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('ATACANTE', variedOverall(i)));
  return players;
};

/** Pool difícil: quase nenhum Defensor de origem — o mínimo de 1 zagueiro por time vai ceder. */
export const buildFewDefendersPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  const nativeDefenders = Math.max(1, Math.ceil(numTeams / 2));
  for (let i = 0; i < nativeDefenders; i++) players.push(makePlayer('DEFENSOR', variedOverall(i)));
  for (let i = 0; i < numTeams * 7; i++) players.push(makePlayer('MEIA', variedOverall(i)));
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('ATACANTE', variedOverall(i)));
  return players;
};

/** Pool difícil: nenhum (ou quase nenhum) Meia de origem. */
export const buildFewMeiasPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', variedOverall(i)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('ATACANTE', variedOverall(i)));
  return players;
};

/** Pool difícil: quase nenhum Atacante de origem. */
export const buildFewAtacantesPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  const nativeAttackers = Math.max(1, Math.ceil(numTeams / 2));
  for (let i = 0; i < nativeAttackers; i++) players.push(makePlayer('ATACANTE', variedOverall(i)));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('DEFENSOR', variedOverall(i)));
  for (let i = 0; i < numTeams * 4; i++) players.push(makePlayer('MEIA', variedOverall(i)));
  return players;
};

/** Pool exatamente no limite: após reservar goleiros, sobram exatamente 6 de linha por time. */
export const buildMinimalPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 60));
  for (let i = 0; i < numTeams * 4; i++) players.push(makePlayer('MEIA', 60));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('ATACANTE', 60));
  return players;
};

/**
 * Pool desnivelado: a qualidade está concentrada em poucos jogadores (metade
 * excelente, metade péssima), testando se o motor espalha bem esse desnível.
 */
export const buildSkewedPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 100)); // elite
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('DEFENSOR', 20)); // fracos
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('MEIA', 100));
  for (let i = 0; i < numTeams * 3; i++) players.push(makePlayer('MEIA', 20));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('ATACANTE', 100));
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('ATACANTE', 20));
  return players;
};

/** Pool sem nenhum atacante de origem: força o improviso de meia no ataque. */
export const buildNoAttackerPool = (numTeams: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < numTeams; i++) players.push(makeGoalkeeper());
  for (let i = 0; i < numTeams * 2; i++) players.push(makePlayer('DEFENSOR', variedOverall(i)));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('MEIA', 80, { traits: { pivot: true } }));
  for (let i = 0; i < numTeams; i++) players.push(makePlayer('MEIA', 70, { traits: { lowRecovery: true } }));
  for (let i = 0; i < numTeams * 4; i++) players.push(makePlayer('MEIA', variedOverall(i)));
  return players;
};

export const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);

// ---------------------------------------------------------------------------
// Elenco real (dono, agosto/2026) — cópia FIEL do export do app (12 ativos),
// usada pra calibrar o peso da defesa no custo do balanceador (ver
// balance.equilibrioDefensivo.test.ts). Copiada de propósito, e não lida do
// arquivo em runtime — ver instrução da tarefa. Preserva `enabled: false`
// exatamente como cadastrado (são escolha do dono, o balanceador resolve
// DENTRO delas).
// ---------------------------------------------------------------------------

const ap = (entries: [PositionPreferenceEntry['position'], boolean][]): PositionPreferenceEntry[] =>
  entries.map(([position, enabled]) => ({ position, enabled }));

const attrs = (
  FIN: number, CRI: number, DRI: number, DEF: number,
  VEL: number, RCD: number, INT: number, MOV: number, FIS: number,
): AttrVector => ({ FIN, CRI, DRI, DEF, VEL, RCD, INT, MOV, FIS });

/**
 * Os 12 jogadores ativos do elenco real, tal como exportados pelo app em
 * agosto/2026. Defensores bons (DEF/RCD altos): Jon, Jezzel, Rodrigo, Kleber
 * (só 4 no elenco todo). Defensivamente ruins: Torres, Jean, Tony, Celso,
 * Nishi, Bruno. Guto é PIVO-only (não pode ocupar vaga defensiva). Beto tem
 * VOLANTE habilitado (é o "terceiro nome" plausível de um lado).
 */
export const buildElencoRealAgosto2026 = (): Player[] => [
  {
    id: '8fe0f95c-d4e0-411a-b00c-22222983b5b8', name: 'Torres', active: true,
    isGoalkeeper: true, position: 'MEIA',
    attributes: attrs(50, 85, 100, 20, 100, 35, 50, 50, 35), gk: 20,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['ALA', true], ['SEGUNDO_ATACANTE', true], ['MEIA_ATACANTE', true],
      ['PIVO', false], ['VOLANTE', false], ['LATERAL', false], ['FIXO', false],
    ]),
  },
  {
    id: '84496a03-7ef6-4cb8-aaa5-5782f6a25b9b', name: 'Jon', active: true,
    isGoalkeeper: true, position: 'MEIA',
    attributes: attrs(75, 100, 100, 85, 85, 100, 75, 75, 35), gk: 100,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['ALA', true], ['MEIA_ATACANTE', true], ['SEGUNDO_ATACANTE', true],
      ['VOLANTE', true], ['LATERAL', true], ['FIXO', true], ['PIVO', false],
    ]),
  },
  {
    id: '94a29b26-0282-48d6-a9ff-427caacd7486', name: 'Jezzel', active: true,
    isGoalkeeper: true, position: 'DEFENSOR',
    attributes: attrs(0, 50, 75, 100, 75, 100, 0, 100, 35), gk: 85,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['LATERAL', true], ['VOLANTE', true], ['FIXO', true],
      ['ALA', true], ['PIVO', false], ['SEGUNDO_ATACANTE', false], ['MEIA_ATACANTE', false],
    ]),
  },
  {
    id: '6126d858-df31-49bd-b1f6-0b0ea9054c1a', name: 'Guto', active: true,
    isGoalkeeper: true, position: 'ATACANTE',
    attributes: attrs(75, 35, 75, 50, 20, 35, 50, 20, 75), gk: 50,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['PIVO', true], ['SEGUNDO_ATACANTE', false], ['MEIA_ATACANTE', false],
      ['ALA', false], ['VOLANTE', false], ['LATERAL', false], ['FIXO', false],
    ]),
  },
  {
    id: 'c6a9455c-3e38-4755-a6c7-e0d3831064dd', name: 'Jean', active: true,
    isGoalkeeper: false, position: 'ATACANTE',
    attributes: attrs(50, 20, 20, 20, 50, 35, 75, 75, 50), gk: null,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['SEGUNDO_ATACANTE', true], ['PIVO', true], ['MEIA_ATACANTE', true],
      ['ALA', true], ['VOLANTE', false], ['LATERAL', false], ['FIXO', false],
    ]),
  },
  {
    id: '7bede75b-bd9d-4e84-b0a3-2c4dde3255fe', name: 'Tony', active: true,
    isGoalkeeper: false, position: 'MEIA',
    attributes: attrs(75, 75, 50, 35, 50, 20, 50, 85, 0), gk: null,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['MEIA_ATACANTE', true], ['SEGUNDO_ATACANTE', true], ['ALA', true],
      ['PIVO', false], ['VOLANTE', false], ['LATERAL', false], ['FIXO', false],
    ]),
  },
  {
    id: 'bcf95671-b9e6-4ba7-ada5-c89c026e6c61', name: 'Rodrigo', active: true,
    isGoalkeeper: true, position: 'DEFENSOR',
    attributes: attrs(20, 50, 35, 100, 75, 100, 0, 85, 85), gk: 100,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['LATERAL', true], ['VOLANTE', true], ['FIXO', true], ['ALA', true],
      ['MEIA_ATACANTE', true], ['SEGUNDO_ATACANTE', true], ['PIVO', true],
    ]),
  },
  {
    id: '62eaeaa3-6f64-4dd7-ba0f-fc0939aaeec1', name: 'Nishi', active: true,
    isGoalkeeper: true, position: 'MEIA',
    attributes: attrs(20, 20, 85, 35, 75, 20, 20, 35, 35), gk: 20,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['ALA', true], ['MEIA_ATACANTE', true], ['SEGUNDO_ATACANTE', true],
      ['PIVO', false], ['VOLANTE', false], ['LATERAL', false], ['FIXO', false],
    ]),
  },
  {
    id: '9a9c9018-bbf3-4e36-97e7-47d0d7e12a49', name: 'Kleber', active: true,
    isGoalkeeper: true, position: 'DEFENSOR',
    attributes: attrs(20, 20, 85, 100, 50, 100, 0, 0, 75), gk: 100,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['FIXO', true], ['LATERAL', true], ['VOLANTE', true], ['ALA', true],
      ['SEGUNDO_ATACANTE', false], ['MEIA_ATACANTE', false], ['PIVO', false],
    ]),
  },
  {
    id: 'a7739340-5640-4cd8-8a3f-61facc2c490f', name: 'Celso', active: true,
    isGoalkeeper: false, position: 'MEIA',
    attributes: attrs(20, 50, 50, 20, 20, 20, 0, 0, 75), gk: null,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['MEIA_ATACANTE', true], ['ALA', true], ['PIVO', true],
      ['SEGUNDO_ATACANTE', false], ['VOLANTE', false], ['LATERAL', false], ['FIXO', false],
    ]),
  },
  {
    id: 'd84d8214-93e0-4fd5-8947-df79cad52366', name: 'Beto', active: true,
    isGoalkeeper: true, position: 'MEIA',
    attributes: attrs(75, 100, 75, 35, 50, 75, 75, 85, 35), gk: 35,
    acceptedPositions: ap([
      [BOX_TO_BOX, false], ['VOLANTE', true], ['MEIA_ATACANTE', true], ['ALA', true],
      ['PIVO', false], ['SEGUNDO_ATACANTE', false], ['LATERAL', false], ['FIXO', false],
    ]),
  },
  {
    id: '62a90ff8-80a3-4027-a722-ce0f8844d009', name: 'Bruno', active: true,
    isGoalkeeper: true, position: 'MEIA',
    attributes: attrs(20, 35, 50, 35, 50, 35, 35, 35, 35), gk: 50,
    acceptedPositions: ap([
      [BOX_TO_BOX, true], ['PIVO', false], ['SEGUNDO_ATACANTE', false], ['MEIA_ATACANTE', false],
      ['ALA', false], ['VOLANTE', false], ['LATERAL', false], ['FIXO', false],
    ]),
  },
];
