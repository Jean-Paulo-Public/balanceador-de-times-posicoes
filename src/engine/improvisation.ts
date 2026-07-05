import type { Player, Position } from '../domain/types';
import { posToLabel } from '../domain/playerAttributes';
import type { RoleFamily } from '../domain/formations';

/**
 * Matriz única e simples de improviso:
 * - Defensor  -> nativo Defensor, pode improvisar como Meia. Nunca como Atacante.
 * - Atacante  -> nativo Atacante, pode improvisar como Meia. Nunca como Defensor.
 * - Meia      -> nativo Meia, pode improvisar em qualquer vaga (Defensor ou Atacante).
 */
export const isImprovisationAllowed = (playerPosition: Position, roleFamily: RoleFamily): boolean => {
  if (roleFamily === playerPosition) return true; // nunca deveria cair aqui (já é nativo), mas é seguro.
  if (playerPosition === 'MEIA') return true;
  if (roleFamily === 'MEIA') return playerPosition === 'DEFENSOR' || playerPosition === 'ATACANTE';
  return false; // Defensor->Atacante ou Atacante->Defensor: não permitido.
};

/**
 * Bônus pequeno (numa escala de estrelas 1-6) aplicado só na hora de escolher
 * QUEM entre os Meias disponíveis vira Atacante por improviso. Existe pra dar
 * prioridade ao Meia marcado como "Facilidade em ser pivô" sobre outro Meia
 * qualquer, sem porém se sobrepor a uma diferença de nível real e grande —
 * por isso o valor é deliberadamente pequeno.
 */
const PIVOT_IMPROVISATION_BONUS = 0.4;

export const getImprovisationBonus = (player: Player, roleFamily: RoleFamily): number => {
  if (roleFamily === 'ATACANTE' && player.position === 'MEIA' && player.pivotFriendly) {
    return PIVOT_IMPROVISATION_BONUS;
  }
  return 0;
};

export const getRoleLabels = (
  family: RoleFamily,
  improvised: boolean,
  isGoalkeeperRole: boolean = false,
  isPivotFit: boolean = false
): { roleShort: string; roleLabel: string } => {
  if (isGoalkeeperRole) return { roleShort: 'GK', roleLabel: 'Goleiro' };

  const suffix = improvised ? (isPivotFit ? ' (pivô)' : ' (improvisado)') : '';
  if (family === 'DEFENSOR') return { roleShort: 'DEF', roleLabel: `Defensor${suffix}` };
  if (family === 'ATACANTE') return { roleShort: 'ATA', roleLabel: `Atacante${suffix}` };
  return { roleShort: 'MEI', roleLabel: `Meia${suffix}` };
};

export { posToLabel };
