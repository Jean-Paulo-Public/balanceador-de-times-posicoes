import type { Player } from './types';
import { scoreDefensorRole, scoreMeiaRole, scoreAtacanteRole } from '../engine/scoring';

export type RoleFamily = 'DEFENSOR' | 'MEIA' | 'ATACANTE';

export type FormationSlot = {
  id: string;
  family: RoleFamily;
  allowedOriginalPositions: Player['position'][];
  calcScore: (p: Player) => number;
};

const defensorSlot = (id: string): FormationSlot => ({
  id, family: 'DEFENSOR', allowedOriginalPositions: ['DEFENSOR'], calcScore: scoreDefensorRole,
});
const meiaSlot = (id: string): FormationSlot => ({
  id, family: 'MEIA', allowedOriginalPositions: ['MEIA'], calcScore: scoreMeiaRole,
});
const atacanteSlot = (id: string): FormationSlot => ({
  id, family: 'ATACANTE', allowedOriginalPositions: ['ATACANTE'], calcScore: scoreAtacanteRole,
});

/**
 * Três sistemas táticos, cada um com exatamente 6 vagas de linha (fora o goleiro).
 * OFENSIVA = 2-2-2, EQUILIBRADA = 1-4-1, DEFENSIVA = 2-3-1.
 */
export const Formations: Record<'OFENSIVA' | 'EQUILIBRADA' | 'DEFENSIVA', FormationSlot[]> = {
  OFENSIVA: [
    defensorSlot('Defensor 1'), defensorSlot('Defensor 2'),
    meiaSlot('Meia 1'), meiaSlot('Meia 2'),
    atacanteSlot('Atacante 1'), atacanteSlot('Atacante 2'),
  ],
  EQUILIBRADA: [
    defensorSlot('Defensor'),
    meiaSlot('Meia 1'), meiaSlot('Meia 2'), meiaSlot('Meia 3'), meiaSlot('Meia 4'),
    atacanteSlot('Atacante'),
  ],
  DEFENSIVA: [
    defensorSlot('Defensor 1'), defensorSlot('Defensor 2'),
    meiaSlot('Meia 1'), meiaSlot('Meia 2'), meiaSlot('Meia 3'),
    atacanteSlot('Atacante'),
  ],
};

export const FORMATION_LABELS: Record<keyof typeof Formations, string> = {
  OFENSIVA: 'Ofensiva (2-2-2)',
  EQUILIBRADA: 'Equilibrada (1-4-1)',
  DEFENSIVA: 'Defensiva (2-3-1)',
};
