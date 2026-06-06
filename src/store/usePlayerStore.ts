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
  gk_posicionamentoSaida: 3,
  gk_defesaReflexo: 3,
  gk_posicionamentoAereo: 3,
  gk_saidaPrecisa: 3,
};

const normalizePlayerStats = (player: Player): Player => ({
  ...player,
  stats: {
    ...defaultStats,
    ...player.stats,
  },
});

const getRandomStar = () => Math.floor(Math.random() * 3) + 2;

const createStats = (value: number): PlayerStats => ({
  mei_protecaoVisaoPasse: value,
  mei_of_finalizacao: value,
  mei_of_dribleArrancada: value,
  mei_of_passeGolTabela: value,
  mei_def_sairPressao: value,
  mei_def_posicionamentoMarcacao: value,
  mei_def_interceptacao: value,
  def_posicionamentoMarcacao: value,
  def_interceptacao: value,
  def_sec_protecaoVisaoPasse: value,
  def_sec_sairPressao: value,
  ata_corpoPosicionamento: value,
  ata_finalizacaoPassePivo: value,
  ata_sec_dribleArrancada: value,
  ata_sec_passeGolTabela: value,
  geral_recomposicaoVelocidadeVigor: value,
  gk_posicionamentoSaida: value,
  gk_defesaReflexo: value,
  gk_posicionamentoAereo: value,
  gk_saidaPrecisa: value,
});

const createPlayer = (name: string, position: Player['position'], isGoalkeeper = false): Player => ({
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

  for (let i = 1; i <= 3; i++) {
    players.push(createPlayer(`Goleiro ${i}`, 'DEFENSOR', true));
  }

  for (let i = 1; i <= 3; i++) {
    players.push(createPlayer(`Defensor ${i}`, 'DEFENSOR'));
  }

  for (let i = 1; i <= 6; i++) {
    players.push(createPlayer(`Volante ${i}`, 'MEIA_DEFENSIVO'));
  }

  for (let i = 1; i <= 6; i++) {
    players.push(createPlayer(`Meia Atacante ${i}`, 'MEIA_OFENSIVO'));
  }

  for (let i = 1; i <= 3; i++) {
    players.push(createPlayer(`Atacante ${i}`, 'ATACANTE'));
  }

  return players;
};

interface PlayerState {
  players: Player[];
  neverScaleGoalkeepers: boolean;
  addPlayer: (player: Omit<Player, 'id'>) => void;
  updatePlayer: (id: string, player: Partial<Player>) => void;
  deletePlayer: (id: string) => void;
  togglePlayerActive: (id: string) => void;
  setNeverScaleGoalkeepers: (value: boolean) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      players: getDefaultPlayers(),
      neverScaleGoalkeepers: false,
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
      setNeverScaleGoalkeepers: (value) =>
        set(() => ({ neverScaleGoalkeepers: value })),
    }),
    {
      name: 'balanceador-times-storage',
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        if (!state.players?.length) {
          state.players = getDefaultPlayers();
          return;
        }

        state.players = state.players.map(normalizePlayerStats);
      },
    }
  )
);
