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

// v7: `acceptedPositions` (lista ordenada de preferência, modelo v3) passa a
// ser obrigatória em todo Player. Jogadores sem a lista (todo cadastro
// anterior) recebem `[BOX_TO_BOX]` — coringa, joga em qualquer posição, o
// sistema decide (ver `normalizePlayer` em migration.ts).
//
// v8: o atributo REC foi removido e dividido em RCD (Recomposição Defensiva)
// e INT (Intensidade) — ver src/domain/attributes.ts. `attributes` salvo no
// formato antigo (8 chaves, com REC) não bate mais com `parseAttrVector`
// (que agora exige as 9 chaves novas) e cai no fallback já existente —
// deriva de novo a partir da estrela via `deriveAttributesFromStar`. Não há
// preservação do valor antigo de REC (decisão do dono: dado descartável,
// sem usuários com backup a proteger); o importante é só que o rehydrate
// NUNCA quebre com dado velho no localStorage (ver normalizePlayer/
// parseAttrVector em migration.ts e os testes de v8 em migration.test.ts).
const CURRENT_STORAGE_VERSION = 8;

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      // Por padrão a lista vem vazia — nada de jogador fake sem o usuário pedir.
      players: [],
      neverScaleGoalkeepers: false,
      generateTestPlayersOnEmpty: false,
      maxSixLinePlayers: false,
      separatePairs: [],
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
