import type { Player } from '../domain/types';

type WeightedStat = [value: number | undefined, weight: number];

/** Média ponderada, ignorando atributos ausentes (undefined). Cai para 1 se nada for válido. */
export const weightedAvg = (pairs: WeightedStat[]): number => {
  let sum = 0;
  let weight = 0;
  for (const [value, w] of pairs) {
    if (value === undefined) continue;
    sum += value * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 1;
};

export const getAvg = (arr: (number | undefined)[]): number =>
  weightedAvg(arr.map((v): WeightedStat => [v, 1]));

/** Peso do atributo geral de recomposição defensiva nas notas de escalação em linha. */
const RECOMPOSICAO_WEIGHT_LINHA = 2;
/** Peso ainda maior dentro da métrica dedicada de força defensiva do time (anti-goleada). */
const RECOMPOSICAO_WEIGHT_DEFESA = 3;

/** Nota de um jogador para a vaga de Defensor (nativo, ou Meia improvisado). */
export const scoreDefensorRole = (p: Player): number => {
  const s = p.stats;
  if (p.position === 'DEFENSOR') {
    return weightedAvg([
      [s.def_marcacaoPosicionamento, 1], [s.def_interceptacaoDesarme, 1], [s.def_jogoAereoCobertura, 1],
      [s.def_saidaBolaPasse, 0.4], [s.def_protecaoDeBola, 0.4], [s.def_apoioConstrucao, 0.4],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_LINHA],
    ]);
  }
  if (p.position === 'MEIA') {
    return weightedAvg([
      [s.meia_marcacaoPosicionamento, 1], [s.meia_interceptacaoDesarme, 1], [s.meia_saidaDePressao, 0.6],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_LINHA],
    ]);
  }
  // Atacante não pode ser improvisado como Defensor — não deveria chegar aqui.
  return 1;
};

/** Nota de um jogador para a vaga de Meia (nativo, ou Defensor/Atacante improvisados). */
export const scoreMeiaRole = (p: Player): number => {
  const s = p.stats;
  if (p.position === 'MEIA') {
    return weightedAvg([
      [s.meia_marcacaoPosicionamento, 1], [s.meia_interceptacaoDesarme, 1], [s.meia_saidaDePressao, 1],
      [s.meia_visaoPasse, 1], [s.meia_dribleArrancada, 1], [s.meia_finalizacao, 1],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_LINHA],
    ]);
  }
  if (p.position === 'DEFENSOR') {
    return weightedAvg([
      [s.def_saidaBolaPasse, 1], [s.def_protecaoDeBola, 1], [s.def_apoioConstrucao, 1],
      [s.def_marcacaoPosicionamento, 0.5], [s.def_interceptacaoDesarme, 0.5],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_LINHA],
    ]);
  }
  if (p.position === 'ATACANTE') {
    return weightedAvg([
      [s.ata_dribleArrancada, 1], [s.ata_passeGolTabela, 1], [s.ata_finalizacao, 0.6],
      [s.ata_pressaoRecomposicao, 0.6],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_LINHA],
    ]);
  }
  return 1;
};

/** Nota de um jogador para a vaga de Atacante (nativo, ou Meia improvisado). */
export const scoreAtacanteRole = (p: Player): number => {
  const s = p.stats;
  if (p.position === 'ATACANTE') {
    return weightedAvg([
      [s.ata_finalizacao, 1], [s.ata_dribleArrancada, 1], [s.ata_passeGolTabela, 1],
      [s.ata_pressaoRecomposicao, 0.3], [s.ata_desarmeMarcacao, 0.3], [s.ata_protecaoBolaPivo, 0.3],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_LINHA],
    ]);
  }
  if (p.position === 'MEIA') {
    return weightedAvg([
      [s.meia_finalizacao, 1], [s.meia_dribleArrancada, 1], [s.meia_visaoPasse, 0.6],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_LINHA],
    ]);
  }
  // Defensor não pode ser improvisado como Atacante — não deveria chegar aqui.
  return 1;
};

/** Nota geral do jogador na sua posição de origem (para telas de listagem/cadastro). */
export const scoreNativePosition = (p: Player): number => {
  if (p.position === 'DEFENSOR') return scoreDefensorRole(p);
  if (p.position === 'ATACANTE') return scoreAtacanteRole(p);
  return scoreMeiaRole(p);
};

/**
 * Contribuição defensiva "real" do jogador, independente do papel para o qual foi
 * escalado. Usada apenas para medir o quão exposta (goleável) a defesa de um time
 * está — dá peso ainda maior à recomposição defensiva do que as notas de escalação.
 */
export const defensiveContribution = (p: Player): number => {
  const s = p.stats;
  if (p.position === 'DEFENSOR') {
    return weightedAvg([
      [s.def_marcacaoPosicionamento, 1], [s.def_interceptacaoDesarme, 1], [s.def_jogoAereoCobertura, 1],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_DEFESA],
    ]);
  }
  if (p.position === 'MEIA') {
    return weightedAvg([
      [s.meia_marcacaoPosicionamento, 1], [s.meia_interceptacaoDesarme, 1], [s.meia_saidaDePressao, 0.7],
      [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_DEFESA],
    ]);
  }
  return weightedAvg([
    [s.ata_desarmeMarcacao, 1], [s.ata_pressaoRecomposicao, 1],
    [s.geral_recomposicaoDefensiva, RECOMPOSICAO_WEIGHT_DEFESA],
  ]);
};

export const scoreGoalkeeper = (p: Player): number => {
  const s = p.stats;
  return weightedAvg([
    [s.gk_posicionamentoSaida, 1], [s.gk_defesaReflexo, 1], [s.gk_posicionamentoAereo, 1], [s.gk_saidaPrecisa, 1],
  ]);
};
