import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Player, Position } from '../domain/types';
import { createStats, normalizeStats } from '../domain/playerAttributes';
import { migratePlayers } from './migration';

const getRandomStar = () => Math.floor(Math.random() * 3) + 2;

const createPlayer = (name: string, position: Position, isGoalkeeper = false): Player => ({
  id: crypto.randomUUID(),
  name,
  active: true,
  isCaptain: false,
  isGoalkeeper,
  position,
  stats: createStats(getRandomStar()),
});

const getDefaultPlayers = (): Player[] => {
  const players: Player[] = [];
  for (let i = 1; i <= 3; i++) players.push(createPlayer(`Goleiro ${i}`, 'DEFENSOR', true));
  for (let i = 1; i <= 5; i++) players.push(createPlayer(`Defensor ${i}`, 'DEFENSOR'));
  for (let i = 1; i <= 8; i++) players.push(createPlayer(`Meia ${i}`, 'MEIA'));
  for (let i = 1; i <= 5; i++) players.push(createPlayer(`Atacante ${i}`, 'ATACANTE'));
  return players;
};

interface PlayerState {
  players: Player[];
  neverScaleGoalkeepers: boolean;
  generateTestPlayersOnEmpty: boolean;
  maxSixLinePlayers: boolean;
  addPlayer: (player: Omit<Player, 'id'>) => void;
  updatePlayer: (id: string, player: Partial<Player>) => void;
  deletePlayer: (id: string) => void;
  togglePlayerActive: (id: string) => void;
  setNeverScaleGoalkeepers: (value: boolean) => void;
  setGenerateTestPlayersOnEmpty: (value: boolean) => void;
  setMaxSixLinePlayers: (value: boolean) => void;
  setPlayers: (players: Player[]) => void;
}

const CURRENT_STORAGE_VERSION = 2;

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      players: getDefaultPlayers(),
      neverScaleGoalkeepers: false,
      generateTestPlayersOnEmpty: false,
      maxSixLinePlayers: false,
      addPlayer: (player) =>
        set((state) => ({
          players: [...state.players, { ...player, id: crypto.randomUUID(), stats: normalizeStats(player.stats) }],
        })),
      updatePlayer: (id, updatedFields) =>
        set((state) => ({
          players: state.players.map((p) =>
            p.id === id ? { ...p, ...updatedFields, stats: normalizeStats({ ...p.stats, ...updatedFields.stats }) } : p
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
      setPlayers: (players) => set(() => ({ players: players.map(p => ({ ...p, stats: normalizeStats(p.stats) })) })),
    }),
    {
      name: 'balanceador-times-storage',
      version: CURRENT_STORAGE_VERSION,
      migrate: (persistedState, version) => {
        const state = persistedState as PlayerState;
        if (version < CURRENT_STORAGE_VERSION) {
          return { ...state, players: migratePlayers(state.players) };
        }
        return state;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.players?.length && state.generateTestPlayersOnEmpty) {
          state.players = getDefaultPlayers();
          return;
        }
        state.players = state.players.map((p) => ({ ...p, stats: normalizeStats(p.stats) }));
      },
    }
  )
);
