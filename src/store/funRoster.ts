import type { Player, Position } from '../domain/types';
import { createStats } from '../domain/playerAttributes';

/**
 * Roster de teste "de brincadeira": jogadores reais e conhecidos do futebol
 * mundial, só para dar um clima mais divertido a quem está testando o app
 * (não é uma avaliação real de habilidade de ninguém, é só um easter egg).
 *
 * `recomposicao` baixa é usada de propósito em alguns craques mais "de show"
 * para ilustrar o atributo geral_recomposicaoDefensiva — combina com o
 * conceito de "não corre atrás da jogada".
 */
interface FunPlayerSeed {
  name: string;
  position: Position;
  level: number;
  isGoalkeeper?: boolean;
  recomposicao?: number;
}

const FUN_ROSTER_SEED: FunPlayerSeed[] = [
  // Goleiros
  { name: 'Alisson Becker', position: 'DEFENSOR', level: 6, isGoalkeeper: true },
  { name: 'Ederson', position: 'DEFENSOR', level: 5, isGoalkeeper: true },
  { name: 'Manuel Neuer', position: 'DEFENSOR', level: 6, isGoalkeeper: true },
  { name: 'Thibaut Courtois', position: 'DEFENSOR', level: 5, isGoalkeeper: true },
  { name: 'Ter Stegen', position: 'DEFENSOR', level: 5, isGoalkeeper: true },

  // Defensores
  { name: 'Virgil van Dijk', position: 'DEFENSOR', level: 6, recomposicao: 6 },
  { name: 'Marquinhos', position: 'DEFENSOR', level: 5, recomposicao: 5 },
  { name: 'Éder Militão', position: 'DEFENSOR', level: 4, recomposicao: 5 },
  { name: 'Thiago Silva', position: 'DEFENSOR', level: 5, recomposicao: 5 },
  { name: 'David Alaba', position: 'DEFENSOR', level: 4 },
  { name: 'Sergio Ramos', position: 'DEFENSOR', level: 5 },

  // Meias
  { name: 'Kevin De Bruyne', position: 'MEIA', level: 6 },
  { name: 'Luka Modrić', position: 'MEIA', level: 6 },
  { name: 'Toni Kroos', position: 'MEIA', level: 5 },
  { name: 'Casemiro', position: 'MEIA', level: 5, recomposicao: 6 },
  { name: 'Pedri', position: 'MEIA', level: 4 },
  { name: 'Jude Bellingham', position: 'MEIA', level: 5 },
  { name: 'Kaká', position: 'MEIA', level: 5, recomposicao: 2 },
  { name: 'Zinédine Zidane', position: 'MEIA', level: 6, recomposicao: 2 },

  // Atacantes
  { name: 'Erling Haaland', position: 'ATACANTE', level: 6 },
  { name: 'Kylian Mbappé', position: 'ATACANTE', level: 6 },
  { name: 'Lionel Messi', position: 'ATACANTE', level: 6, recomposicao: 2 },
  { name: 'Cristiano Ronaldo', position: 'ATACANTE', level: 6, recomposicao: 3 },
  { name: 'Vinícius Jr.', position: 'ATACANTE', level: 5 },
  { name: 'Karim Benzema', position: 'ATACANTE', level: 5, recomposicao: 3 },
  { name: 'Neymar Jr.', position: 'ATACANTE', level: 5, recomposicao: 2 },
  { name: 'Ronaldinho Gaúcho', position: 'ATACANTE', level: 5, recomposicao: 1 },
];

export const buildFunRoster = (): Player[] =>
  FUN_ROSTER_SEED.map((seed) => ({
    id: crypto.randomUUID(),
    name: seed.name,
    active: true,
    isCaptain: false,
    isGoalkeeper: seed.isGoalkeeper ?? false,
    position: seed.position,
    stats: {
      ...createStats(seed.level),
      ...(seed.recomposicao !== undefined ? { geral_recomposicaoDefensiva: seed.recomposicao } : {}),
    },
  }));
