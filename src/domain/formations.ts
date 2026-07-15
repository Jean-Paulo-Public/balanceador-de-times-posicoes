import type { FormationType } from './types';

/**
 * Layout de um sistema tático em quantidade de vagas por setor (fora o goleiro).
 * Os três somam 6 jogadores de linha.
 */
export interface FormationLayout {
  def: number;
  mei: number;
  ata: number;
}

export const FORMATIONS: Record<FormationType, FormationLayout> = {
  OFENSIVA: { def: 2, mei: 2, ata: 2 }, // 2-2-2
  DEFENSIVA: { def: 2, mei: 3, ata: 1 }, // 2-3-1
  EQUILIBRADA: { def: 1, mei: 4, ata: 1 }, // 1-4-1
};

export const FORMATION_LABELS: Record<FormationType, string> = {
  OFENSIVA: 'Ofensiva (2-2-2)',
  EQUILIBRADA: 'Equilibrada (1-4-1)',
  DEFENSIVA: 'Defensiva (2-3-1)',
};

/**
 * Escolhe a formação que melhor encaixa nas contagens reais de defensores e
 * atacantes de um time, seguindo a regra pedida:
 *  - 2+ defensores e 2+ atacantes  -> 2-2-2 (OFENSIVA)
 *  - 2+ defensores e <2 atacantes  -> 2-3-1 (DEFENSIVA)
 *  - <2 defensores (qualquer nº de atacantes) -> 1-4-1 (EQUILIBRADA)
 *
 * O último caso cobre também "<2 defensores e 2+ atacantes": como nenhuma das
 * três formações tem mais de 2 vagas de ataque e todas precisam de pelo menos
 * 1 defensor, com menos de 2 zagueiros a linha de trás fica com 1 e os
 * atacantes excedentes escorregam pro meio (os melhores ficam no ataque).
 */
export const chooseFormation = (numDefenders: number, numAttackers: number): FormationType => {
  if (numDefenders >= 2 && numAttackers >= 2) return 'OFENSIVA';
  if (numDefenders >= 2) return 'DEFENSIVA';
  return 'EQUILIBRADA';
};
