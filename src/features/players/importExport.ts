import type { Player, Position } from '../../domain/types';
import { normalizeStats } from '../../domain/playerAttributes';

const VALID_POSITIONS: Position[] = ['DEFENSOR', 'MEIA', 'ATACANTE'];
const DEFAULT_FILE_NAME = 'jogadores-balanceador.json';
const JSON_PICKER_TYPES: FilePickerAcceptTypeOption[] = [
  { description: 'JSON', accept: { 'application/json': ['.json'] } },
];

const isValidPosition = (position: unknown): position is Position =>
  typeof position === 'string' && VALID_POSITIONS.includes(position as Position);

/**
 * A File System Access API (showSaveFilePicker/showOpenFilePicker) só existe em
 * navegadores baseados em Chromium (Chrome, Edge...). Em outros navegadores caímos
 * de volta no fluxo clássico de download / <input type="file">.
 */
export const supportsNativeFilePicker = (): boolean =>
  typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const downloadJson = (json: string, fileName: string): void => {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

/**
 * Exporta os jogadores como JSON. Em navegadores com suporte, abre o seletor
 * nativo de "Salvar como" — o usuário pode escolher qualquer pasta do
 * computador, inclusive uma pasta do Google Drive (ou OneDrive) sincronizada
 * localmente. Sem suporte, cai no download tradicional (vai para a pasta de
 * Downloads, como antes).
 */
export const exportPlayersAsJson = async (players: Player[]): Promise<void> => {
  const json = JSON.stringify(players, null, 2);

  if (supportsNativeFilePicker()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: DEFAULT_FILE_NAME,
        types: JSON_PICKER_TYPES,
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (error) {
      if (isAbortError(error)) return; // usuário cancelou o seletor — não é erro
      // qualquer outro problema com a API nativa: cai pro download clássico abaixo
    }
  }

  downloadJson(json, DEFAULT_FILE_NAME);
};

interface RawPlayerLike {
  id?: unknown;
  name?: unknown;
  active?: unknown;
  isCaptain?: unknown;
  isGoalkeeper?: unknown;
  position?: unknown;
  stats?: unknown;
  pivotFriendly?: unknown;
}

/**
 * Converte um JSON importado (array de jogadores, ou objeto { players: [...] })
 * em jogadores válidos. Sempre normaliza `stats`, preenchendo qualquer atributo
 * ausente com o valor padrão.
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
      pivotFriendly: typeof raw.pivotFriendly === 'boolean' ? raw.pivotFriendly : false,
    };
  });
};

/**
 * Abre o seletor nativo de arquivo (quando suportado) e já devolve os jogadores
 * importados. Devolve `null` quando a API não é suportada (o chamador deve usar
 * o fallback de `<input type="file">`) ou quando o usuário cancela o seletor.
 */
export const pickAndImportPlayersFile = async (): Promise<Player[] | null> => {
  if (!supportsNativeFilePicker()) return null;

  let handle: FileSystemFileHandle;
  try {
    [handle] = await window.showOpenFilePicker({
      types: JSON_PICKER_TYPES,
      multiple: false,
    });
  } catch (error) {
    if (isAbortError(error)) return null; // usuário cancelou o seletor
    throw error;
  }

  const file = await handle.getFile();
  const rawText = await file.text();
  return parseImportedPlayers(rawText);
};
