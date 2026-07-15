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
}

const FUN_ROSTER_SEED: FunPlayerSeed[] = [
  // Goleiros (posição de origem Defensor; entram no gol quando reservados)
  { name: 'Alisson Becker', position: 'DEFENSOR', rating: 5, isGoalkeeper: true },
  { name: 'Ederson', position: 'DEFENSOR', rating: 4.5, isGoalkeeper: true },
  { name: 'Manuel Neuer', position: 'DEFENSOR', rating: 5, isGoalkeeper: true },
  { name: 'Thibaut Courtois', position: 'DEFENSOR', rating: 4.5, isGoalkeeper: true },
  { name: 'Ter Stegen', position: 'DEFENSOR', rating: 4.5, isGoalkeeper: true },

  // Defensores
  { name: 'Virgil van Dijk', position: 'DEFENSOR', rating: 5 },
  { name: 'Marquinhos', position: 'DEFENSOR', rating: 4.5 },
  { name: 'Éder Militão', position: 'DEFENSOR', rating: 4 },
  { name: 'Thiago Silva', position: 'DEFENSOR', rating: 4.5 },
  { name: 'David Alaba', position: 'DEFENSOR', rating: 4 },
  { name: 'Sergio Ramos', position: 'DEFENSOR', rating: 4.5 },

  // Meias
  { name: 'Kevin De Bruyne', position: 'MEIA', rating: 5 },
  { name: 'Luka Modrić', position: 'MEIA', rating: 5 },
  { name: 'Toni Kroos', position: 'MEIA', rating: 4.5 },
  { name: 'Casemiro', position: 'MEIA', rating: 4.5 },
  { name: 'Pedri', position: 'MEIA', rating: 4 },
  { name: 'Jude Bellingham', position: 'MEIA', rating: 4.5, pivotFriendly: true },
  { name: 'Kaká', position: 'MEIA', rating: 4.5, pivotFriendly: true, recompoePouco: true },
  { name: 'Zinédine Zidane', position: 'MEIA', rating: 5, recompoePouco: true },

  // Atacantes
  { name: 'Erling Haaland', position: 'ATACANTE', rating: 5 },
  { name: 'Kylian Mbappé', position: 'ATACANTE', rating: 5 },
  { name: 'Lionel Messi', position: 'ATACANTE', rating: 5, recompoePouco: true },
  { name: 'Cristiano Ronaldo', position: 'ATACANTE', rating: 5 },
  { name: 'Vinícius Jr.', position: 'ATACANTE', rating: 4.5 },
  { name: 'Karim Benzema', position: 'ATACANTE', rating: 4.5 },
  { name: 'Neymar Jr.', position: 'ATACANTE', rating: 4.5, recompoePouco: true },
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
  }));
