import type { Player, Position } from '../domain/types';
import type { AttrVector, AttributeKey } from '../domain/attributes';
import { clampAttr } from '../domain/attributes';
import { BOX_TO_BOX, allEnabled } from '../domain/positions';

/**
 * Roster de teste "de brincadeira": jogadores reais e conhecidos do futebol
 * mundial, só para dar um clima mais divertido a quem está testando o app
 * (não é uma avaliação real de habilidade de ninguém, é só um easter egg).
 */
interface FunPlayerSeed {
  name: string;
  position: Position;
  /** Overall alvo (0–100). */
  overall: number;
  isGoalkeeper?: boolean;
  pivotFriendly?: boolean;
  recompoePouco?: boolean;
  boaSaidaDeBola?: boolean;
  veloz?: boolean;
}

// Offsets por posição de origem (mesma ideia de "perfil por posição" que
// existia na derivação legada a partir da estrela, mantida aqui só como
// semente de sabor pro roster de brincadeira — não é fórmula de domínio).
const POS_OFFSETS: Record<Position, AttrVector> = {
  DEFENSOR: { FIN: -18, CRI: 2, DRI: -10, DEF: 12, VEL: 0, RCD: 6, INT: 6, MOV: -8, FIS: 8, OFE: 0 },
  MEIA: { FIN: -6, CRI: 8, DRI: 2, DEF: -2, VEL: 0, RCD: 6, INT: 6, MOV: 4, FIS: 0, OFE: 0 },
  ATACANTE: { FIN: 14, CRI: -6, DRI: 6, DEF: -16, VEL: 4, RCD: -6, INT: -6, MOV: 10, FIS: 2, OFE: 0 },
};

const seedAttributes = (overall: number, position: Position, seed: FunPlayerSeed): AttrVector => {
  const off = POS_OFFSETS[position];
  const a: AttrVector = {
    FIN: overall + off.FIN, CRI: overall + off.CRI, DRI: overall + off.DRI, DEF: overall + off.DEF,
    VEL: overall + off.VEL, RCD: overall + off.RCD, INT: overall + off.INT, MOV: overall + off.MOV, FIS: overall + off.FIS,
    OFE: overall + off.OFE,
  };
  if (seed.veloz) a.VEL += 15;
  if (seed.boaSaidaDeBola) a.CRI += 12;
  if (seed.recompoePouco) { a.DEF -= 4; a.RCD -= 15; a.INT -= 15; a.MOV += 6; }
  if (seed.pivotFriendly) { a.FIN += 6; a.CRI += 4; a.MOV -= 4; a.FIS += 8; }
  (Object.keys(a) as AttributeKey[]).forEach((k) => { a[k] = clampAttr(a[k]); });
  return a;
};

const FUN_ROSTER_SEED: FunPlayerSeed[] = [
  // Goleiros (posição de origem Defensor; entram no gol quando reservados)
  { name: 'Alisson Becker', position: 'DEFENSOR', overall: 100, isGoalkeeper: true, boaSaidaDeBola: true },
  { name: 'Ederson', position: 'DEFENSOR', overall: 90, isGoalkeeper: true, boaSaidaDeBola: true },
  { name: 'Manuel Neuer', position: 'DEFENSOR', overall: 100, isGoalkeeper: true, boaSaidaDeBola: true },
  { name: 'Thibaut Courtois', position: 'DEFENSOR', overall: 90, isGoalkeeper: true },
  { name: 'Ter Stegen', position: 'DEFENSOR', overall: 90, isGoalkeeper: true, boaSaidaDeBola: true },

  // Defensores
  { name: 'Virgil van Dijk', position: 'DEFENSOR', overall: 100, boaSaidaDeBola: true },
  { name: 'Marquinhos', position: 'DEFENSOR', overall: 90, boaSaidaDeBola: true },
  { name: 'Éder Militão', position: 'DEFENSOR', overall: 80, veloz: true },
  { name: 'Thiago Silva', position: 'DEFENSOR', overall: 90 },
  { name: 'David Alaba', position: 'DEFENSOR', overall: 80, boaSaidaDeBola: true },
  { name: 'Sergio Ramos', position: 'DEFENSOR', overall: 90 },

  // Meias
  { name: 'Kevin De Bruyne', position: 'MEIA', overall: 100, boaSaidaDeBola: true },
  { name: 'Luka Modrić', position: 'MEIA', overall: 100, boaSaidaDeBola: true },
  { name: 'Toni Kroos', position: 'MEIA', overall: 90, boaSaidaDeBola: true },
  { name: 'Casemiro', position: 'MEIA', overall: 90 },
  { name: 'Pedri', position: 'MEIA', overall: 80, boaSaidaDeBola: true },
  { name: 'Jude Bellingham', position: 'MEIA', overall: 90, pivotFriendly: true, veloz: true },
  { name: 'Kaká', position: 'MEIA', overall: 90, pivotFriendly: true, recompoePouco: true, veloz: true },
  { name: 'Zinédine Zidane', position: 'MEIA', overall: 100, recompoePouco: true },

  // Atacantes
  { name: 'Erling Haaland', position: 'ATACANTE', overall: 100, pivotFriendly: true },
  { name: 'Kylian Mbappé', position: 'ATACANTE', overall: 100, veloz: true },
  { name: 'Lionel Messi', position: 'ATACANTE', overall: 100, recompoePouco: true },
  { name: 'Cristiano Ronaldo', position: 'ATACANTE', overall: 100, pivotFriendly: true },
  { name: 'Vinícius Jr.', position: 'ATACANTE', overall: 90, veloz: true },
  { name: 'Karim Benzema', position: 'ATACANTE', overall: 90, pivotFriendly: true },
  { name: 'Neymar Jr.', position: 'ATACANTE', overall: 90, recompoePouco: true, veloz: true },
  { name: 'Ronaldinho Gaúcho', position: 'ATACANTE', overall: 90, recompoePouco: true },
];

export const buildFunRoster = (): Player[] =>
  FUN_ROSTER_SEED.map((seed) => {
    const overall = clampAttr(seed.overall);
    const isGoalkeeper = seed.isGoalkeeper ?? false;
    return {
      id: crypto.randomUUID(),
      name: seed.name,
      active: true,
      isGoalkeeper,
      position: seed.position,
      // Semeia os atributos v2 direto no overall alvo + traços do roster de
      // brincadeira (não deriva de estrela — não existe mais essa escala).
      attributes: seedAttributes(overall, seed.position, seed),
      gk: isGoalkeeper ? clampAttr(overall + 5) : null,
      acceptedPositions: allEnabled([BOX_TO_BOX]),
    };
  });
