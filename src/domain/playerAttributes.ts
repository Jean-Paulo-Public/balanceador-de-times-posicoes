import type { PlayerStats, Position } from './types';

/** Valor padrão de estrelas para todo atributo novo/não preenchido. */
export const DEFAULT_STAR_VALUE = 3;

/** Metadados de exibição de cada atributo (usados pelo formulário de cadastro). */
export interface AttributeMeta {
  key: keyof PlayerStats;
  label: string;
}

export const DEFENSOR_DEFENSIVE_ATTRS: AttributeMeta[] = [
  { key: 'def_marcacaoPosicionamento', label: 'Marcação / Posicionamento / Bote' },
  { key: 'def_interceptacaoDesarme', label: 'Interceptação / Desarme' },
  { key: 'def_jogoAereoCobertura', label: 'Jogo aéreo / Cobertura' },
];

export const DEFENSOR_OFFENSIVE_ATTRS: AttributeMeta[] = [
  { key: 'def_saidaBolaPasse', label: 'Saída de bola / Passe' },
  { key: 'def_protecaoDeBola', label: 'Proteção de bola' },
  { key: 'def_apoioConstrucao', label: 'Apoio à construção (sobe no ataque)' },
];

export const MEIA_DEFENSIVE_ATTRS: AttributeMeta[] = [
  { key: 'meia_marcacaoPosicionamento', label: 'Marcação / Posicionamento' },
  { key: 'meia_interceptacaoDesarme', label: 'Interceptação / Desarme' },
  { key: 'meia_saidaDePressao', label: 'Sair da pressão' },
];

export const MEIA_OFFENSIVE_ATTRS: AttributeMeta[] = [
  { key: 'meia_visaoPasse', label: 'Visão de jogo / Passe' },
  { key: 'meia_dribleArrancada', label: 'Drible / Arrancada' },
  { key: 'meia_finalizacao', label: 'Finalização' },
];

export const ATACANTE_OFFENSIVE_ATTRS: AttributeMeta[] = [
  { key: 'ata_finalizacao', label: 'Finalização' },
  { key: 'ata_dribleArrancada', label: 'Drible / Arrancada' },
  { key: 'ata_passeGolTabela', label: 'Passe para gol / Tabela' },
];

export const ATACANTE_DEFENSIVE_ATTRS: AttributeMeta[] = [
  { key: 'ata_pressaoRecomposicao', label: 'Pressão / Recomposição' },
  { key: 'ata_desarmeMarcacao', label: 'Desarme / Marcação' },
  { key: 'ata_protecaoBolaPivo', label: 'Proteção de bola (pivô)' },
];

export const GERAL_ATTR: AttributeMeta = {
  key: 'geral_recomposicaoDefensiva',
  label: 'Recomposição defensiva / Vigor físico',
};

export const GOALKEEPER_ATTRS: AttributeMeta[] = [
  { key: 'gk_defesaReflexo', label: 'Defesa / Reflexo' },
  { key: 'gk_saidaPrecisa', label: 'Saída de bola precisa / Passe' },
  { key: 'gk_posicionamentoSaida', label: 'Posicionamento em contra-ataques / Saída na bola' },
  { key: 'gk_posicionamentoAereo', label: 'Posicionamento aéreo / Domínio da área' },
];

/** Todos os pares ofensivo/defensivo por posição, na ordem em que aparecem no formulário. */
export const ATTRS_BY_POSITION: Record<Position, { defensive: AttributeMeta[]; offensive: AttributeMeta[] }> = {
  DEFENSOR: { defensive: DEFENSOR_DEFENSIVE_ATTRS, offensive: DEFENSOR_OFFENSIVE_ATTRS },
  MEIA: { defensive: MEIA_DEFENSIVE_ATTRS, offensive: MEIA_OFFENSIVE_ATTRS },
  ATACANTE: { defensive: ATACANTE_DEFENSIVE_ATTRS, offensive: ATACANTE_OFFENSIVE_ATTRS },
};

export const ALL_ATTRIBUTE_KEYS: (keyof PlayerStats)[] = [
  ...DEFENSOR_DEFENSIVE_ATTRS, ...DEFENSOR_OFFENSIVE_ATTRS,
  ...MEIA_DEFENSIVE_ATTRS, ...MEIA_OFFENSIVE_ATTRS,
  ...ATACANTE_OFFENSIVE_ATTRS, ...ATACANTE_DEFENSIVE_ATTRS,
  GERAL_ATTR,
  ...GOALKEEPER_ATTRS,
].map(a => a.key);

export const createStats = (value: number = DEFAULT_STAR_VALUE): PlayerStats => {
  const stats = {} as PlayerStats;
  for (const key of ALL_ATTRIBUTE_KEYS) {
    (stats[key] as number) = value;
  }
  return stats;
};

export const defaultStats: PlayerStats = createStats(DEFAULT_STAR_VALUE);

/** Garante que todo atributo conhecido exista no objeto de stats (preenchendo com o padrão). */
export const normalizeStats = (stats: Partial<PlayerStats> | undefined | null): PlayerStats => ({
  ...defaultStats,
  ...(stats || {}),
});

export const posToLabel = (pos: Position): string => {
  switch (pos) {
    case 'DEFENSOR': return 'Defensor';
    case 'MEIA': return 'Meia';
    case 'ATACANTE': return 'Atacante';
    default: return 'Jogador';
  }
};
