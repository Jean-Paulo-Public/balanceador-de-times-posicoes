import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Player } from '../domain/types';
import { clampRating } from '../domain/playerAttributes';
import { normalizePlayers, normalizePlayer } from './migration';
import { buildFunRoster } from './funRoster';

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
  generateTestRoster: () => void;
}

const CURRENT_STORAGE_VERSION = 4;

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      // Por padrão a lista vem vazia — nada de jogador fake sem o usuário pedir.
      players: [],
      neverScaleGoalkeepers: false,
      generateTestPlayersOnEmpty: false,
      maxSixLinePlayers: false,
      addPlayer: (player) =>
        set((state) => ({
          players: [...state.players, { ...player, id: crypto.randomUUID(), rating: clampRating(player.rating) }],
        })),
      updatePlayer: (id, updatedFields) =>
        set((state) => ({
          players: state.players.map((p) =>
            p.id === id
              ? { ...p, ...updatedFields, rating: clampRating(updatedFields.rating ?? p.rating) }
              : p
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
      setPlayers: (players) => set(() => ({ players: normalizePlayers(players) })),
      generateTestRoster: () => set(() => ({ players: buildFunRoster() })),
    }),
    {
      name: 'balanceador-times-storage',
      version: CURRENT_STORAGE_VERSION,
      migrate: (persistedState, version) => {
        const state = persistedState as PlayerState;
        if (version < CURRENT_STORAGE_VERSION) {
          return { ...state, players: normalizePlayers(state.players) };
        }
        return state;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.players?.length && state.generateTestPlayersOnEmpty) {
          state.players = buildFunRoster();
          return;
        }
        // Garante que todo jogador está no shape novo (rating válido + flags).
        state.players = (state.players ?? []).map((p) => normalizePlayer(p));
      },
    }
  )
);
