import type { Player, Position } from '../domain/types';
import type { AttrVector } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';

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
