// Modelo de domínio do Balanceador de Times.
//
// Modelo v2 (única fonte de verdade): cada jogador tem uma posição de origem
// (Defensor/Meia/Atacante) e 9 atributos 0–100 (FIN/CRI/DRI/DEF/VEL/RCD/INT/MOV/
// FIS — ver src/domain/attributes.ts) que alimentam o balanceador (funções,
// OVRs contextuais, formação inferida). `rating` (estrela 0–5) é um campo
// DERIVADO do overall geral, mantido só para exibição/ordenação — nunca é
// fonte de verdade dos atributos (ver PlayerForm.tsx, que já o recalcula a
// partir do overall a cada edição). Traços como "pivô nato" ou "veloz" não são
// mais flags manuais: são inferidos dos atributos (ver isPivot/isFast/
// hasGoodBuildUp/hasLowRecovery em src/engine/playerModel.ts).

import type { AttrVector } from './attributes';
import type { LinePosition, PositionPreferenceEntry } from './positions';

export type Position = 'DEFENSOR' | 'MEIA' | 'ATACANTE';

/**
 * Exceções de atributo por posição de linha (modelo v3.1) — mapa ESPARSO nos
 * dois eixos: só as posições com exceção aparecem, e dentro delas só os
 * atributos que diferem da base. Valores são ABSOLUTOS (0–100), NÃO delta —
 * ex.: jogador com FIN=60 na base mas FIN=80 quando joga de pivô (melhor
 * finalizador perto do gol):
 *   { PIVO: { FIN: 80 } }
 * Ausente/vazio = sem exceções (caso comum). Ver `attributesForPosition` /
 * `effectiveAttributes` em src/engine/playerModel.ts para a ORDEM de
 * aplicação (base → sobrescrita da posição → handicap de lesão).
 */
export type AttributeOverrides = Partial<Record<LinePosition, Partial<AttrVector>>>;

export interface Player {
  id: string;
  name: string;
  active: boolean;
  /** Consegue jogar no gol (emergência). Um goleiro por time pode ser reservado. */
  isGoalkeeper: boolean;
  position: Position;
  /** Nota única do jogador, de 0 a 5, em passos de 0,5 — DERIVADA do overall (exibição/ordenação). */
  rating: number;
  /** Atributos 0–100 do modelo v2. Fonte de verdade do balanceador. */
  attributes: AttrVector;
  /** Nota de goleiro 0–100 (null se não joga no gol). */
  gk: number | null;
  /** Redução temporária (%) em todos os atributos — ex.: lesão. 0/ausente = sem redução. */
  handicapPct?: number;
  /**
   * Lista ORDENADA de posições de linha aceitas, cada uma com um toggle
   * `enabled` (modelo v3 + v3.2). Índice 0 = preferência máxima. A ordem é
   * preservada mesmo para entradas desabilitadas (reabilitar não recadastra
   * a ordem). `BOX_TO_BOX` = "joga em qualquer posição, o sistema decide" —
   * é o default de migração (v7) pra todo jogador já cadastrado. Nunca vazia,
   * e sempre tem PELO MENOS uma entrada habilitada (ver normalização em
   * src/store/migration.ts).
   */
  acceptedPositions: PositionPreferenceEntry[];
  /** Exceções de atributo por posição de linha (modelo v3.1). Ver `AttributeOverrides`. */
  positionOverrides?: AttributeOverrides;
}

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
