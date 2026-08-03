import type { ReactNode } from 'react';
import type { Player } from '../../domain/types';
import { usePlayerStore } from '../../store/usePlayerStore';
import { posToLabel } from '../../domain/types';
import { baseOverallOf, isInjured, isPivot, effectiveAttributesBase, effectiveGk } from '../../engine';
import { BOX_TO_BOX, LINE_POSITIONS, type LinePosition } from '../../domain/positions';
import { Shield, Users, Swords, Edit, Trash2, ShieldAlert, Shuffle } from 'lucide-react';
import { computeDisplayOvrs, OVR_DISPLAY_ITEMS } from './ovrDisplay';
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
  const { togglePlayerActive, deletePlayer, updatePlayer } = usePlayerStore();
  const visual = POSITION_VISUAL[player.position];
  const displayOvrs = computeDisplayOvrs(effectiveAttributesBase(player), effectiveGk(player));

  const toggleInjury = () => {
    if (isInjured(player)) {
      updatePlayer(player.id, { handicapPct: 0 });
      return;
    }
    const input = window.prompt('Lesão: reduzir TODOS os atributos temporariamente. Informe a % de redução (1–100):', '30');
    if (input == null) return;
    const pct = Math.max(0, Math.min(100, Math.round(Number(input))));
    if (Number.isFinite(pct) && pct > 0) updatePlayer(player.id, { handicapPct: pct });
  };

  return (
    <div className={`${styles.card} animate-fade-in`}>
      <div className={styles.accentBar} style={{ background: visual.color }} />

      <div className={`${styles.main} ${!player.active ? styles.inactive : ''}`}>
        <div className={styles.nameRow}>
          <span className={`${styles.name} ${!player.active ? styles.nameStrike : ''}`}>{player.name}</span>
          {player.isGoalkeeper && <span title="Goleiro (Emergência)"><ShieldAlert size={16} color="var(--color-info)" /></span>}
        </div>

        <div className={styles.metaRow}>
          <span className={`chip ${visual.chip}`}>{visual.icon} {posToLabel(player.position)}</span>
          {isPivot(player) && <span className="chip chip-accent">Pivô</span>}
        </div>

        <div className={styles.positionsRow}>
          {player.acceptedPositions.some((e) => e.enabled && e.position === BOX_TO_BOX) ? (
            <span className={`${styles.posChip} ${styles.posChipBoxToBox}`} title="Coringa: joga em qualquer posição, o sistema decide">
              <Shuffle size={11} /> Coringa (qualquer posição)
            </span>
          ) : (
            player.acceptedPositions
              .filter((e): e is { position: LinePosition; enabled: boolean } => e.position !== BOX_TO_BOX)
              .map((e, i) => (
                <span
                  key={e.position}
                  className={`${styles.posChip} ${e.enabled ? styles.posChipEnabled : styles.posChipDisabled}`}
                  title={e.enabled ? `${i + 1}ª preferência` : `${i + 1}ª preferência — desativada (não entra no balanceador)`}
                >
                  {LINE_POSITIONS[e.position].label}
                </span>
              ))
          )}
        </div>

        <div className={styles.overalls}>
          <div className={styles.ovrRow}>
            {OVR_DISPLAY_ITEMS.map((item) => {
              const value = displayOvrs[item.key];
              return (
                <span
                  key={item.key}
                  className={`${styles.ovrChip} ${item.key === 'geral' ? styles.ovrChipPrimary : ''}`}
                  title={item.fullLabel}
                  aria-label={item.fullLabel}
                >
                  <span className={styles.ovrAbbr}>{item.abbr}</span>
                  <span className={styles.ovrValue}>{value == null ? '—' : value}</span>
                </span>
              );
            })}
          </div>
          {isInjured(player) && (
            <span className={styles.overallLabel} style={{ marginLeft: '8px', color: 'var(--color-danger)' }}>
              lesão −{player.handicapPct}% (base {baseOverallOf(player)})
            </span>
          )}
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
        <button
          className={styles.iconBtn}
          title={isInjured(player) ? `Remover lesão (−${player.handicapPct}%)` : 'Marcar lesão (reduz atributos)'}
          style={{ color: isInjured(player) ? 'var(--color-danger)' : undefined }}
          onClick={toggleInjury}
        >
          🩹
        </button>
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
