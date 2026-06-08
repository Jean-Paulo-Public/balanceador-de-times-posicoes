import type { Player } from '../../types';

export function getCombinations<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  function helper(start: number, combo: T[]) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

export const isImprovisationAllowed = (playerPosition: Player['position'], targetRoleId: string): boolean => {
  const role = targetRoleId.toLowerCase();
  if (role.includes('defensor')) return playerPosition === 'MEIA_DEFENSIVO' || playerPosition === 'DEFENSOR';
  if (role.includes('volante') || role.includes('meia defensivo')) return playerPosition === 'MEIA_OFENSIVO';
  if (role.includes('meia ofensivo') || role.includes('meia atacante')) return playerPosition === 'ATACANTE' || playerPosition === 'DEFENSOR' || playerPosition === 'MEIA_DEFENSIVO';
  if (role.includes('atacante')) return playerPosition === 'MEIA_OFENSIVO';
  if (role === 'meia' || role.includes('meia 1') || role.includes('meia 2')) {
    if (playerPosition === 'MEIA_DEFENSIVO' || playerPosition === 'MEIA_OFENSIVO') return true;
  }
  return true;
};

export const posToLabel = (pos: Player['position']) => {
  switch (pos) {
    case 'DEFENSOR': return 'Defensor';
    case 'MEIA_DEFENSIVO': return 'Meia Defensivo';
    case 'MEIA_OFENSIVO': return 'Meia Ofensivo';
    case 'ATACANTE': return 'Atacante';
    default: return 'Jogador';
  }
};

export const getRoleLabels = (player: Player, assignedRole: string, improvised: boolean, isGoalkeeperRole: boolean = false) => {
  const originalPosLabel = posToLabel(player.position);
  const lower = assignedRole.toLowerCase();

  if (lower.includes('goleiro') || isGoalkeeperRole) {
    return { roleShort: 'GK', roleLabel: 'Goleiro' };
  }

  if (player.position === 'ATACANTE' && lower.includes('meia')) {
    return { roleShort: 'MA', roleLabel: 'Meia Atacante (improvisado)' };
  }
  if (lower.includes('defensor')) {
    return { roleShort: 'DEF', roleLabel: `Defensor${improvised ? ' (improvisado)' : ''}` };
  }
  if (lower.includes('volante') || lower.includes('meia defensivo')) {
    return { roleShort: 'MD', roleLabel: `Meia Defensivo${improvised ? ' (improvisado)' : ''}` };
  }
  if (lower.includes('meia ofensivo') || lower.includes('meia of.') || lower.includes('meia atacante') || lower.includes('meia of')) {
    const impro = improvised || player.position === 'ATACANTE';
    return { roleShort: 'MA', roleLabel: `Meia Atacante${impro ? ' (improvisado)' : ''}` };
  }
  
  if (lower === 'meia' || lower.includes('meia 1') || lower.includes('meia 2') || lower.includes('extra')) {
    const isNativeMid = player.position === 'MEIA_DEFENSIVO' || player.position === 'MEIA_OFENSIVO';
    const actualImpro = isNativeMid ? false : improvised;
    return { roleShort: 'MEI', roleLabel: `Meia${actualImpro ? ' (improvisado)' : ''}` };
  }

  if (lower.includes('atacante')) {
    const impro = improvised || player.position !== 'ATACANTE';
    return { roleShort: 'ATA', roleLabel: `Atacante${impro ? ' (improvisado)' : ''}` };
  }

  return { roleShort: 'MEI', roleLabel: originalPosLabel };
};
