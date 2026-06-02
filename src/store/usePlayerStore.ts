import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Player, PlayerStats } from '../types';

const defaultStats: PlayerStats = {
  mei_protecaoVisaoPasse: 3,
  mei_of_finalizacao: 3,
  mei_of_dribleArrancada: 3,
  mei_of_passeGolTabela: 3,
  mei_def_sairPressao: 3,
  mei_def_posicionamentoMarcacao: 3,
  mei_def_interceptacao: 3,
  def_posicionamentoMarcacao: 3,
  def_interceptacao: 3,
  def_sec_protecaoVisaoPasse: 3,
  def_sec_sairPressao: 3,
  ata_corpoPosicionamento: 3,
  ata_finalizacaoPassePivo: 3,
  ata_sec_dribleArrancada: 3,
  ata_sec_passeGolTabela: 3,
  geral_recomposicaoVelocidadeVigor: 3,
};

const normalizePlayerStats = (player: Player): Player => ({
  ...player,
  stats: {
    ...defaultStats,
    ...player.stats,
  },
});

interface PlayerState {
  players: Player[];
  addPlayer: (player: Omit<Player, 'id'>) => void;
  updatePlayer: (id: string, player: Partial<Player>) => void;
  deletePlayer: (id: string) => void;
  togglePlayerActive: (id: string) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      players: [],
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
    }),
    {
      name: 'balanceador-times-storage',
      onRehydrateStorage: () => (state) => {
        if (state?.players?.length) {
          state.players = state.players.map(normalizePlayerStats);
        }
      },
    }
  )
);
