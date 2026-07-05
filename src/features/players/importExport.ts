import type { Player, Position } from '../../domain/types';
import { normalizeStats } from '../../domain/playerAttributes';

const VALID_POSITIONS: Position[] = ['DEFENSOR', 'MEIA', 'ATACANTE'];

const isValidPosition = (position: unknown): position is Position =>
  typeof position === 'string' && VALID_POSITIONS.includes(position as Position);

export const exportPlayersAsJson = (players: Player[]): void => {
  const json = JSON.stringify(players, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'players.json';
  anchor.click();
  URL.revokeObjectURL(url);
};

interface RawPlayerLike {
  id?: unknown;
  name?: unknown;
  active?: unknown;
  isCaptain?: unknown;
  isGoalkeeper?: unknown;
  position?: unknown;
  stats?: unknown;
}

/**
 * Converte um JSON importado (array de jogadores, ou objeto { players: [...] })
 * em jogadores válidos. Sempre normaliza `stats`, preenchendo qualquer atributo
 * ausente com o valor padrão — diferente do comportamento antigo, que deixava
 * atributos faltantes como `undefined`.
 */
export const parseImportedPlayers = (rawText: string): Player[] => {
  const parsed = JSON.parse(rawText) as unknown;
  const rawPlayers = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'players' in parsed && Array.isArray((parsed as { players: unknown }).players)
      ? (parsed as { players: unknown[] }).players
      : null;

  if (!rawPlayers) {
    throw new Error('JSON inválido: use um array de jogadores ou um objeto com campo players.');
  }

  return rawPlayers.map((source, index): Player => {
    const raw = (source ?? {}) as RawPlayerLike;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
      name: typeof raw.name === 'string' && raw.name ? raw.name : `Jogador ${index + 1}`,
      active: typeof raw.active === 'boolean' ? raw.active : true,
      isCaptain: typeof raw.isCaptain === 'boolean' ? raw.isCaptain : false,
      isGoalkeeper: typeof raw.isGoalkeeper === 'boolean' ? raw.isGoalkeeper : false,
      position: isValidPosition(raw.position) ? raw.position : 'MEIA',
      stats: normalizeStats(raw.stats as Player['stats'] | undefined),
    };
  });
};
