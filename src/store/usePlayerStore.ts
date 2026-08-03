import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Player } from '../domain/types';
import { normalizePlayers } from './migration';
import { buildFunRoster } from './funRoster';

interface PlayerState {
  players: Player[];
  neverScaleGoalkeepers: boolean;
  generateTestPlayersOnEmpty: boolean;
  maxSixLinePlayers: boolean;
  separatePairs: [string, string][];
  addPlayer: (player: Omit<Player, 'id'>) => void;
  updatePlayer: (id: string, player: Partial<Player>) => void;
  deletePlayer: (id: string) => void;
  togglePlayerActive: (id: string) => void;
  setNeverScaleGoalkeepers: (value: boolean) => void;
  setGenerateTestPlayersOnEmpty: (value: boolean) => void;
  setMaxSixLinePlayers: (value: boolean) => void;
  addSeparatePair: (a: string, b: string) => void;
  removeSeparatePair: (a: string, b: string) => void;
  setPlayers: (players: Player[]) => void;
  generateTestRoster: () => void;
}

/**
 * PORTÃO SIMPLES de versão (sem cadeia de migração incremental): o app ainda
 * não foi lançado, não há usuário nem dado real a preservar, e o dono decidiu
 * remover TODA retrocompatibilidade. Se o dado persistido não é EXATAMENTE
 * desta versão, ele é DESCARTADO por inteiro — sem conversão, sem semeadura,
 * sem default de posição — e o app recomeça com estado vazio (`INITIAL_STATE`
 * abaixo). O requisito que continua valendo é que abrir com dado velho NUNCA
 * quebre o app: descartar é um caminho explícito e limpo, nunca crash, NaN ou
 * campo undefined chegando no solver.
 *
 * A VALIDAÇÃO de dado já NESTA versão continua existindo e é ESTRITA (ver
 * `normalizePlayer`/`normalizePlayers` em migration.ts): um registro
 * malformado (ex.: `attributes`/`gk` inválidos) é descartado individualmente,
 * nunca "consertado" inventando valor.
 */
const CURRENT_STORAGE_VERSION = 9;

type PersistablePlayerState = Pick<
  PlayerState,
  'players' | 'neverScaleGoalkeepers' | 'generateTestPlayersOnEmpty' | 'maxSixLinePlayers' | 'separatePairs'
>;

const INITIAL_STATE: PersistablePlayerState = {
  // Por padrão a lista vem vazia — nada de jogador fake sem o usuário pedir.
  players: [],
  neverScaleGoalkeepers: false,
  generateTestPlayersOnEmpty: false,
  maxSixLinePlayers: false,
  separatePairs: [],
};

/**
 * PORTÃO SIMPLES de versão, extraído como função pura pra ser testável sem
 * precisar simular localStorage/zustand: dado persistido que não é EXATAMENTE
 * `CURRENT_STORAGE_VERSION` é descartado por inteiro (devolve `INITIAL_STATE`
 * — estado vazio, nunca crash/NaN/undefined); dado já na versão certa passa
 * adiante intacto (ainda vai ser validado estritamente por `normalizePlayers`
 * em `onRehydrateStorage`).
 */
export const migrateStorage = (persistedState: unknown, version: number): PersistablePlayerState => {
  if (version !== CURRENT_STORAGE_VERSION) return { ...INITIAL_STATE };
  return persistedState as PersistablePlayerState;
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      addPlayer: (player) =>
        set((state) => ({
          players: [...state.players, { ...player, id: crypto.randomUUID() }],
        })),
      updatePlayer: (id, updatedFields) =>
        set((state) => ({
          players: state.players.map((p) =>
            p.id === id ? { ...p, ...updatedFields } : p
          ),
        })),
      deletePlayer: (id) =>
        set((state) => ({
          players: state.players.filter((p) => p.id !== id),
        })),
      togglePlayerActive: (id) =>
        set((state) => ({
          players: state.players.map((p) =>
            p.id === id ? { ...p, active: !p.active } : p
          ),
        })),
      setNeverScaleGoalkeepers: (value) => set(() => ({ neverScaleGoalkeepers: value })),
      setGenerateTestPlayersOnEmpty: (value) => set(() => ({ generateTestPlayersOnEmpty: value })),
      setMaxSixLinePlayers: (value) => set(() => ({ maxSixLinePlayers: value })),
      addSeparatePair: (a, b) =>
        set((state) => {
          if (a === b) return {};
          const exists = state.separatePairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
          return exists ? {} : { separatePairs: [...state.separatePairs, [a, b] as [string, string]] };
        }),
      removeSeparatePair: (a, b) =>
        set((state) => ({
          separatePairs: state.separatePairs.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))),
        })),
      setPlayers: (players) => set(() => ({ players: normalizePlayers(players) })),
      generateTestRoster: () => set(() => ({ players: buildFunRoster() })),
    }),
    {
      name: 'balanceador-times-storage',
      version: CURRENT_STORAGE_VERSION,
      // PORTÃO SIMPLES: qualquer versão diferente da atual descarta o dado
      // persistido por completo e devolve o estado inicial vazio (ver
      // `migrateStorage`, exportada separadamente pra ser testável).
      migrate: migrateStorage,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Valida ESTRITAMENTE o que sobreviveu ao portão (dado já na versão
        // atual pode ainda estar corrompido — ex.: editado à mão no
        // localStorage). Registros malformados são descartados, não
        // consertados (ver normalizePlayers em migration.ts).
        state.players = normalizePlayers(state.players ?? []);
        if (!state.players.length && state.generateTestPlayersOnEmpty) {
          state.players = buildFunRoster();
        }
      },
    }
  )
);
