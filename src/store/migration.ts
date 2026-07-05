import type { Player, PlayerStats, Position } from '../domain/types';
import { normalizeStats } from '../domain/playerAttributes';

/**
 * Migração do modelo antigo (4 posições: DEFENSOR, MEIA_DEFENSIVO, MEIA_OFENSIVO,
 * ATACANTE) para o modelo atual (3 posições: DEFENSOR, MEIA, ATACANTE) com os novos
 * atributos (3 ofensivos + 3 defensivos por posição + recomposição defensiva).
 *
 * É um mapeamento best-effort: preserva nome, posição, capitão e goleiro de
 * emergência; os atributos com equivalente direto são migrados, os demais caem
 * no valor padrão (3) via normalizeStats. Nenhum jogador é perdido no processo.
 */

type LegacyPosition = 'DEFENSOR' | 'MEIA_DEFENSIVO' | 'MEIA_OFENSIVO' | 'ATACANTE';

interface LegacyPlayer {
  id?: string;
  name?: string;
  active?: boolean;
  isCaptain?: boolean;
  isGoalkeeper?: boolean;
  position?: LegacyPosition | Position;
  stats?: Record<string, number | boolean | undefined>;
  pivotFriendly?: boolean;
}

const mapPosition = (position: LegacyPosition | Position | undefined): Position => {
  if (position === 'MEIA_DEFENSIVO' || position === 'MEIA_OFENSIVO') return 'MEIA';
  if (position === 'DEFENSOR' || position === 'ATACANTE' || position === 'MEIA') return position;
  return 'MEIA';
};

const LEGACY_STAT_MAP: Record<string, keyof PlayerStats> = {
  def_posicionamentoMarcacao: 'def_marcacaoPosicionamento',
  def_interceptacao: 'def_interceptacaoDesarme',
  def_sec_protecaoVisaoPasse: 'def_protecaoDeBola',
  def_sec_sairPressao: 'def_apoioConstrucao',

  mei_def_posicionamentoMarcacao: 'meia_marcacaoPosicionamento',
  mei_def_interceptacao: 'meia_interceptacaoDesarme',
  mei_def_sairPressao: 'meia_saidaDePressao',
  mei_protecaoVisaoPasse: 'meia_visaoPasse',
  mei_of_dribleArrancada: 'meia_dribleArrancada',
  mei_of_finalizacao: 'meia_finalizacao',

  ata_finalizacaoPassePivo: 'ata_finalizacao',
  ata_sec_dribleArrancada: 'ata_dribleArrancada',
  ata_sec_passeGolTabela: 'ata_passeGolTabela',
  ata_corpoPosicionamento: 'ata_protecaoBolaPivo',

  geral_recomposicaoVelocidadeVigor: 'geral_recomposicaoDefensiva',

  gk_posicionamentoSaida: 'gk_posicionamentoSaida',
  gk_defesaReflexo: 'gk_defesaReflexo',
  gk_posicionamentoAereo: 'gk_posicionamentoAereo',
  gk_saidaPrecisa: 'gk_saidaPrecisa',
};

const migrateStats = (legacyStats: LegacyPlayer['stats']): PlayerStats => {
  const migrated: Partial<PlayerStats> = {};
  if (legacyStats) {
    for (const [oldKey, newKey] of Object.entries(LEGACY_STAT_MAP)) {
      const value = legacyStats[oldKey];
      if (typeof value === 'number') migrated[newKey] = value;
    }
  }
  return normalizeStats(migrated);
};

export const migratePlayer = (legacy: LegacyPlayer): Player => ({
  id: legacy.id || crypto.randomUUID(),
  name: legacy.name || 'Jogador',
  active: legacy.active ?? true,
  isCaptain: legacy.isCaptain ?? false,
  isGoalkeeper: legacy.isGoalkeeper ?? false,
  position: mapPosition(legacy.position),
  stats: migrateStats(legacy.stats),
  pivotFriendly: legacy.pivotFriendly ?? false,
});

export const migratePlayers = (legacyPlayers: unknown): Player[] => {
  if (!Array.isArray(legacyPlayers)) return [];
  return legacyPlayers.map(p => migratePlayer(p as LegacyPlayer));
};
