import type { ReactNode } from 'react';
import type { Player } from '../../domain/types';
import { usePlayerStore } from '../../store/usePlayerStore';
import { posToLabel } from '../../domain/playerAttributes';
import { scoreNativePosition, scoreMeiaRole, scoreDefensorRole, scoreAtacanteRole } from '../../engine/scoring';
import { Shield, Users, Swords, Edit, Trash2, ShieldAlert } from 'lucide-react';
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

const toOverall = (val: number) => Math.round((val / 6) * 100);

export function PlayerCard({ player, onEdit }: PlayerCardProps) {
  const { togglePlayerActive, deletePlayer } = usePlayerStore();
  const visual = POSITION_VISUAL[player.position];

  const mainOverall = toOverall(scoreNativePosition(player));
  const secondaryLabel = player.position === 'MEIA' ? 'Versatilidade' : 'Improviso (Meia)';
  const secondaryOverall = player.position === 'MEIA'
    ? toOverall((scoreDefensorRole(player) + scoreAtacanteRole(player)) / 2)
    : toOverall(scoreMeiaRole(player));

  return (
    <div className={`${styles.card} animate-fade-in`}>
      <div className={styles.accentBar} style={{ background: visual.color }} />

      <div className={`${styles.main} ${!player.active ? styles.inactive : ''}`}>
        <div className={styles.nameRow}>
          <span className={`${styles.name} ${!player.active ? styles.nameStrike : ''}`}>{player.name}</span>
          {player.isCaptain && <span title="Capitão">👑</span>}
          {player.isGoalkeeper && <span title="Goleiro (Emergência)"><ShieldAlert size={16} color="var(--color-info)" /></span>}
        </div>

        <div className={styles.metaRow}>
          <span className={`chip ${visual.chip}`}>{visual.icon} {posToLabel(player.position)}</span>
        </div>

        <div className={styles.overalls}>
          <div className={styles.overallBox}>
            <div className={styles.overallLabel}>OVR Principal</div>
            <div className={styles.overallValue} style={{ color: mainOverall >= 80 ? 'var(--color-primary)' : mainOverall >= 60 ? 'var(--color-accent)' : 'var(--color-text)' }}>
              {mainOverall}
            </div>
          </div>
          <div className={styles.overallBox}>
            <div className={styles.overallLabel}>{secondaryLabel}</div>
            <div className={styles.overallValue} style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
              {secondaryOverall}
            </div>
          </div>
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
