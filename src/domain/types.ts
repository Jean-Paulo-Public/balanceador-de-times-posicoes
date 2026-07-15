// Modelo de domínio do Balanceador de Times.
//
// Modelo simplificado: cada jogador tem uma posição de origem (Defensor/Meia/
// Atacante) e UMA nota em estrelas (0 a 5, de meio em meio). A qualidade
// defensiva/ofensiva do jogador é embutida pelo próprio usuário na estrela.
// Marcações booleanas ajudam a distribuir/melhorar o sorteio na Proposta 1:
// `pivotFriendly` (facilidade de ser pivô), `recompoePouco` (perfil ofensivo),
// `boaSaidaDeBola` e `veloz`.

export type Position = 'DEFENSOR' | 'MEIA' | 'ATACANTE';

export interface Player {
  id: string;
  name: string;
  active: boolean;
  isCaptain: boolean;
  /** Consegue jogar no gol (emergência). Um goleiro por time pode ser reservado. */
  isGoalkeeper: boolean;
  position: Position;
  /** Nota única do jogador, de 0 a 5, em passos de 0,5. */
  rating: number;
  /** Facilidade em ser pivô — prioridade pra virar atacante improvisado; espalhado entre os times na P1. */
  pivotFriendly: boolean;
  /** Recompõe pouco (perfil mais ofensivo) — 2ª prioridade pra virar atacante improvisado. */
  recompoePouco: boolean;
  /** Boa saída de bola — espalhado (1 por time, se possível) na Proposta 1. */
  boaSaidaDeBola: boolean;
  /** Jogador veloz — espalhado (1 por time, se possível) na Proposta 1. */
  veloz: boolean;
}

/** Sistemas táticos suportados (usados só como rótulo do arranjo de campo). */
export type FormationType = 'OFENSIVA' | 'EQUILIBRADA' | 'DEFENSIVA';

export interface TeamSlotPlayer {
  player: Player;
  /** Id da vaga (ex.: "Defensor 1", "Meia 2", "Goleiro"). */
  assignedRole: string;
  /** Nota usada para exibição/ordenação — é o próprio rating do jogador. */
  roleScore: number;
  roleLabel?: string;
  /** GK | DEF | MEI | ATA */
  roleShort?: string;
  /** Meia/atacante empurrado pra outra função por falta de gente de origem. */
  improvised?: boolean;
}

export interface Team {
  id: number;
  name: string;
  /** Média das estrelas dos jogadores do time (0 a 5). */
  overall: number;
  /** Média das estrelas do banco (0 a 5), se houver reservas. */
  benchOverall?: number;
  /** Rótulo do sistema tático escolhido pelo arranjo (ex.: "OFENSIVA"). */
  tacticalSystem?: string;
  players: TeamSlotPlayer[];
  bench: TeamSlotPlayer[];
}

export interface SimulationResult {
  id: string;
  /** Título da proposta (ex.: "Proposta 1"), quando exibida numa lista de propostas. */
  title?: string;
  teams: Team[];
  /** Variância das médias de estrela entre os times — quanto menor, mais equilibrado. */
  equilibrium: number;
}
