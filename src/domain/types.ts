// Modelo de domínio do Balanceador de Times.
// Qualquer novo atributo de jogador deve ser adicionado em `PlayerStats` E em
// `src/domain/playerAttributes.ts` (metadados usados pelo formulário e pela migração).

export type Position = 'DEFENSOR' | 'MEIA' | 'ATACANTE';

export interface PlayerStats {
  // --- Defensor ---
  // Principais (defesa)
  def_marcacaoPosicionamento?: number;
  def_interceptacaoDesarme?: number;
  def_jogoAereoCobertura?: number;
  // Secundários (construção / improviso como Meia)
  def_saidaBolaPasse?: number;
  def_protecaoDeBola?: number;
  def_apoioConstrucao?: number;

  // --- Meia ---
  // Defensivos
  meia_marcacaoPosicionamento?: number;
  meia_interceptacaoDesarme?: number;
  meia_saidaDePressao?: number;
  // Ofensivos
  meia_visaoPasse?: number;
  meia_dribleArrancada?: number;
  meia_finalizacao?: number;

  // --- Atacante ---
  // Principais (ataque)
  ata_finalizacao?: number;
  ata_dribleArrancada?: number;
  ata_passeGolTabela?: number;
  // Secundários (recomposição / improviso como Meia)
  ata_pressaoRecomposicao?: number;
  ata_desarmeMarcacao?: number;
  ata_protecaoBolaPivo?: number;

  // Atributo geral, comum a todas as posições. Peso alto na média geral e no
  // cálculo de equilíbrio defensivo — pensado para jogadores mais velhos ou
  // com pouco compromisso tático (recompõem menos, cansam mais rápido).
  geral_recomposicaoDefensiva?: number;

  // Atributos de Goleiro (usados quando isGoalkeeper = true, independente da posição principal)
  gk_posicionamentoSaida?: number;
  gk_defesaReflexo?: number;
  gk_posicionamentoAereo?: number;
  gk_saidaPrecisa?: number;
}

export interface Player {
  id: string;
  name: string;
  active: boolean;
  isCaptain: boolean;
  isGoalkeeper: boolean;
  position: Position;
  stats: PlayerStats;
}

/** Sistemas táticos suportados. QUALQUER sorteia um dos três a cada simulação. */
export type FormationType = 'OFENSIVA' | 'EQUILIBRADA' | 'DEFENSIVA' | 'QUALQUER';

export interface TeamSlotPlayer {
  player: Player;
  assignedRole: string;
  improvisationPenalty: number;
  roleScore: number;
  roleLabel?: string;
  roleShort?: string;
}

export interface Team {
  id: number;
  name: string;
  overall: number;
  benchOverall?: number;
  defensiveOverall: number;
  tacticalSystem?: string;
  players: TeamSlotPlayer[];
  bench: TeamSlotPlayer[];
}

export interface SimulationResult {
  id: string;
  teams: Team[];
  scoreDeviation: number;
  totalImprov: number;
  equilibrium: number;
  defensiveEquilibrium: number;
  benchToTitularDiff: number;
}
