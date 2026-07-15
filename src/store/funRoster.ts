import type { Player, Position } from '../domain/types';
import { clampRating } from '../domain/playerAttributes';

/**
 * Roster de teste "de brincadeira": jogadores reais e conhecidos do futebol
 * mundial, só para dar um clima mais divertido a quem está testando o app
 * (não é uma avaliação real de habilidade de ninguém, é só um easter egg).
 */
interface FunPlayerSeed {
  name: string;
  position: Position;
  /** Estrela na escala nova (0–5). */
  rating: number;
  isGoalkeeper?: boolean;
  pivotFriendly?: boolean;
  recompoePouco?: boolean;
  boaSaidaDeBola?: boolean;
  veloz?: boolean;
}

const FUN_ROSTER_SEED: FunPlayerSeed[] = [
  // Goleiros (posição de origem Defensor; entram no gol quando reservados)
  { name: 'Alisson Becker', position: 'DEFENSOR', rating: 5, isGoalkeeper: true, boaSaidaDeBola: true },
  { name: 'Ederson', position: 'DEFENSOR', rating: 4.5, isGoalkeeper: true, boaSaidaDeBola: true },
  { name: 'Manuel Neuer', position: 'DEFENSOR', rating: 5, isGoalkeeper: true, boaSaidaDeBola: true },
  { name: 'Thibaut Courtois', position: 'DEFENSOR', rating: 4.5, isGoalkeeper: true },
  { name: 'Ter Stegen', position: 'DEFENSOR', rating: 4.5, isGoalkeeper: true, boaSaidaDeBola: true },

  // Defensores
  { name: 'Virgil van Dijk', position: 'DEFENSOR', rating: 5, boaSaidaDeBola: true },
  { name: 'Marquinhos', position: 'DEFENSOR', rating: 4.5, boaSaidaDeBola: true },
  { name: 'Éder Militão', position: 'DEFENSOR', rating: 4, veloz: true },
  { name: 'Thiago Silva', position: 'DEFENSOR', rating: 4.5 },
  { name: 'David Alaba', position: 'DEFENSOR', rating: 4, boaSaidaDeBola: true },
  { name: 'Sergio Ramos', position: 'DEFENSOR', rating: 4.5 },

  // Meias
  { name: 'Kevin De Bruyne', position: 'MEIA', rating: 5, boaSaidaDeBola: true },
  { name: 'Luka Modrić', position: 'MEIA', rating: 5, boaSaidaDeBola: true },
  { name: 'Toni Kroos', position: 'MEIA', rating: 4.5, boaSaidaDeBola: true },
  { name: 'Casemiro', position: 'MEIA', rating: 4.5 },
  { name: 'Pedri', position: 'MEIA', rating: 4, boaSaidaDeBola: true },
  { name: 'Jude Bellingham', position: 'MEIA', rating: 4.5, pivotFriendly: true, veloz: true },
  { name: 'Kaká', position: 'MEIA', rating: 4.5, pivotFriendly: true, recompoePouco: true, veloz: true },
  { name: 'Zinédine Zidane', position: 'MEIA', rating: 5, recompoePouco: true },

  // Atacantes
  { name: 'Erling Haaland', position: 'ATACANTE', rating: 5, pivotFriendly: true },
  { name: 'Kylian Mbappé', position: 'ATACANTE', rating: 5, veloz: true },
  { name: 'Lionel Messi', position: 'ATACANTE', rating: 5, recompoePouco: true },
  { name: 'Cristiano Ronaldo', position: 'ATACANTE', rating: 5, pivotFriendly: true },
  { name: 'Vinícius Jr.', position: 'ATACANTE', rating: 4.5, veloz: true },
  { name: 'Karim Benzema', position: 'ATACANTE', rating: 4.5, pivotFriendly: true },
  { name: 'Neymar Jr.', position: 'ATACANTE', rating: 4.5, recompoePouco: true, veloz: true },
  { name: 'Ronaldinho Gaúcho', position: 'ATACANTE', rating: 4.5, recompoePouco: true },
];

export const buildFunRoster = (): Player[] =>
  FUN_ROSTER_SEED.map((seed) => ({
    id: crypto.randomUUID(),
    name: seed.name,
    active: true,
    isCaptain: false,
    isGoalkeeper: seed.isGoalkeeper ?? false,
    position: seed.position,
    rating: clampRating(seed.rating),
    pivotFriendly: seed.pivotFriendly ?? false,
    recompoePouco: seed.recompoePouco ?? false,
    boaSaidaDeBola: seed.boaSaidaDeBola ?? false,
    veloz: seed.veloz ?? false,
  }));
