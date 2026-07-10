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

/**
 * Penalidade pequena (preferência, não bloqueio) aplicada a um Atacante marcado
 * como "pivô" quando ele é cogitado pra recuar pra vaga de Meia. Ele é a
 * referência de área do time (bola aérea, jogo de costas pro gol), não quem
 * deveria vir de trás ajudar a construir — por isso o motor prefere escalar
 * ali outro jogador (um Atacante sem essa marcação, um Defensor, etc.), a
 * menos que a diferença de nível torne isso claramente pior pro time (nesse
 * caso o pivô ainda pode acabar recuando mesmo assim). Simétrico ao bônus do
 * Meia pivô pro ataque, só que em sentido contrário.
 */
const PIVOT_AVOID_MEIA_PENALTY = -0.4;

export const getImprovisationBonus = (player: Player, roleFamily: RoleFamily): number => {
  if (roleFamily === 'ATACANTE' && player.position === 'MEIA' && player.pivotFriendly) {
    return PIVOT_IMPROVISATION_BONUS;
  }
  if (roleFamily === 'MEIA' && player.position === 'ATACANTE' && player.pivotFriendly) {
    return PIVOT_AVOID_MEIA_PENALTY;
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
