import type { ReactNode } from 'react';
import type { Player } from '../../domain/types';
import { usePlayerStore } from '../../store/usePlayerStore';
import { posToLabel } from '../../domain/playerAttributes';
import { StarRating } from '../../components/StarRating';
import { Shield, Users, Swords, Edit, Trash2, ShieldAlert, Target, BatteryLow, Send, Zap } from 'lucide-react';
import styles from './PlayerCard.module.css';

interface PlayerCardProps {
  player: Player;
  onEdit: (player: Player) => void;
}

const POSITION_VISUAL: Record<Player['position'], { icon: ReactNode; color: string; chip: string }> = {
  DEFENSOR: { icon: <Shield size={15} />, color: 'var(--color-primary)', chip: 'chip-primary' },
  MEIA: { icon: <Users size={15} />, color: 'var(--color-info)', chip: 'chip-info' },
  ATACANTE: { icon: <Swords size={15} />, color: 'var(--color-accent)', chip: 'chip-accent' },
};

export function PlayerCard({ player, onEdit }: PlayerCardProps) {
  const { togglePlayerActive, deletePlayer } = usePlayerStore();
  const visual = POSITION_VISUAL[player.position];

  return (
    <div className={`${styles.card} animate-fade-in`}>
      <div className={styles.accentBar} style={{ background: visual.color }} />

      <div className={`${styles.main} ${!player.active ? styles.inactive : ''}`}>
        <div className={styles.nameRow}>
          <span className={`${styles.name} ${!player.active ? styles.nameStrike : ''}`}>{player.name}</span>
          {player.isCaptain && <span title="Capitão">👑</span>}
          {player.isGoalkeeper && <span title="Goleiro (Emergência)"><ShieldAlert size={16} color="var(--color-info)" /></span>}
          {player.pivotFriendly && <span title="Facilidade em ser pivô"><Target size={15} color="var(--color-accent)" /></span>}
          {player.recompoePouco && <span title="Recompõe pouco"><BatteryLow size={15} color="var(--color-danger)" /></span>}
          {player.boaSaidaDeBola && <span title="Boa saída de bola"><Send size={14} color="var(--color-info)" /></span>}
          {player.veloz && <span title="Jogador veloz"><Zap size={14} color="var(--color-info)" /></span>}
        </div>

        <div className={styles.metaRow}>
          <span className={`chip ${visual.chip}`}>{visual.icon} {posToLabel(player.position)}</span>
          {player.pivotFriendly && <span className="chip chip-accent">Pivô</span>}
        </div>

        <div className={styles.overalls}>
          <StarRating label="" value={player.rating} readOnly size={18} />
          <span className={styles.overallLabel} style={{ marginLeft: '8px' }}>{player.rating}/5</span>
        </div>
      </div>

      <div className={styles.actions}>
        <label className={styles.toggle} title="Ativo/Inativo">
          <input
            type="checkbox"
            checked={player.active}
            onChange={() => togglePlayerActive(player.id)}
          />
          <span className={styles.toggleTrack} />
          <span className={styles.toggleThumb} />
        </label>
        <button className={styles.iconBtn} onClick={() => onEdit(player)}>
          <Edit size={17} />
        </button>
        <button
          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
          onClick={() => {
            if (window.confirm('Excluir jogador?')) deletePlayer(player.id);
          }}
        >
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  );
}
