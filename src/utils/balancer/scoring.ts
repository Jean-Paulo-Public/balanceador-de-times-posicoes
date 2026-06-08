import type { Player } from '../../types';

export const getAvg = (arr: (number | undefined)[]) => {
  const valid = arr.filter((n): n is number => n !== undefined);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 1;
};

export const scoreDefensor = (p: Player) => {
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.geral_recomposicaoVelocidadeVigor]);
  if (p.position === 'DEFENSOR') return getAvg([p.stats.def_posicionamentoMarcacao, p.stats.def_interceptacao, p.stats.geral_recomposicaoVelocidadeVigor]);
  return 0.5;
};

export const scoreAtacante = (p: Player) => {
  if (p.position === 'ATACANTE') return getAvg([p.stats.ata_corpoPosicionamento, p.stats.ata_finalizacaoPassePivo, p.stats.geral_recomposicaoVelocidadeVigor]);
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_of_dribleArrancada, p.stats.mei_of_finalizacao, p.stats.geral_recomposicaoVelocidadeVigor]);
  return 0.5;
};

export const scoreMeiaDefensivo = (p: Player) => {
  if (p.position === 'MEIA_DEFENSIVO') return getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);  
  if (p.position === 'DEFENSOR') return getAvg([p.stats.def_sec_sairPressao, p.stats.def_posicionamentoMarcacao, p.stats.def_interceptacao, p.stats.def_sec_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);  
  return 0.5;
};

export const scoreMeia = (p: Player) => {
  if (p.position === 'MEIA_DEFENSIVO' || p.position === 'MEIA_OFENSIVO') {
    const off = getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela, p.stats.geral_recomposicaoVelocidadeVigor]);
    const def = getAvg([p.stats.mei_def_sairPressao, p.stats.mei_def_posicionamentoMarcacao, p.stats.mei_def_interceptacao, p.stats.geral_recomposicaoVelocidadeVigor]);
    const base = getAvg([p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);
    return getAvg([off, def, base]);
  }
  return 0.5;
};

export const scoreMeiaOfensivo = (p: Player) => {
  if (p.position === 'MEIA_OFENSIVO') return getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);
  if (p.position === 'MEIA_DEFENSIVO') return getAvg([p.stats.mei_of_finalizacao, p.stats.mei_of_dribleArrancada, p.stats.mei_of_passeGolTabela, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);
  if (p.position === 'ATACANTE') return getAvg([p.stats.ata_finalizacaoPassePivo, p.stats.ata_sec_dribleArrancada, p.stats.ata_sec_passeGolTabela, p.stats.mei_protecaoVisaoPasse, p.stats.geral_recomposicaoVelocidadeVigor]);
  return 0.5;
};

export const scoreGoalkeeper = (p: Player, forceLowStats: boolean = false) => {
  if (forceLowStats) return 1;
  return getAvg([p.stats.gk_posicionamentoSaida, p.stats.gk_defesaReflexo, p.stats.gk_posicionamentoAereo, p.stats.gk_saidaPrecisa, p.stats.geral_recomposicaoVelocidadeVigor]);
};

export const getLineScoreByPosition = (p: Player, currentRole?: string): number => {
  const role = currentRole?.toLowerCase() || '';
  if (role.includes('defensor') || p.position === 'DEFENSOR') return scoreDefensor(p);
  if (role.includes('volante') || role.includes('meia defensivo') || p.position === 'MEIA_DEFENSIVO') return scoreMeiaDefensivo(p);
  if (role.includes('meia ofensivo') || role.includes('meia atacante') || p.position === 'MEIA_OFENSIVO') return scoreMeiaOfensivo(p);
  if (role.includes('atacante') || p.position === 'ATACANTE') return scoreAtacante(p);
  return scoreMeia(p);
};
