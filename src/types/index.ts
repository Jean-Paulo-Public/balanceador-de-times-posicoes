export type Position = 'DEFENSOR' | 'MEIA_DEFENSIVO' | 'MEIA_OFENSIVO' | 'ATACANTE';

export interface PlayerStats {
  // Comum aos Meias
  mei_protecaoVisaoPasse?: number;

  // Aspectos Ofensivos (Meias)
  mei_of_finalizacao?: number;
  mei_of_dribleArrancada?: number;
  mei_of_passeGolTabela?: number;

  // Aspectos Defensivos (Meias)
  mei_def_sairPressao?: number;
  mei_def_posicionamentoMarcacao?: number;
  mei_def_interceptacao?: number;

  // Defensores
  def_posicionamentoMarcacao?: number;
  def_interceptacao?: number;
  def_sec_protecaoVisaoPasse?: number;
  def_sec_sairPressao?: number;

  // Atacantes
  ata_corpoPosicionamento?: number;
  ata_finalizacaoPassePivo?: number;
  ata_sec_dribleArrancada?: number;
  ata_sec_passeGolTabela?: number;
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

export type FormationType = 'EQUILIBRADA' | 'OFENSIVA' | 'DEFENSIVA' | 'QUALQUER';

export interface Team {
  id: number;
  name: string;
  overall: number;
  tacticalSystem?: string;
  players: {  
    player: Player;
    assignedRole: string;
    improvisationPenalty: number;
    roleScore: number;
    roleLabel?: string; // Human readable label (e.g. "Meia atacante (improvisado)")
    roleShort?: string; // Short code (DEF, MD, MEI, MA, ATA, GK)
    isCrownFallback?: boolean;
  }[];
}

export interface SimulationResult {
  id: string;
  teams: Team[];
  bench: Player[];
  scoreDeviation: number; // Menor é melhor (mais equilibrado)
  totalImprov: number;
}

export const predeploy = 'npm run build';
export const deploy = 'gh-pages -d dist';

export default defineConfig({
  base: '/balanceador-de-times-posicoes/',
});
