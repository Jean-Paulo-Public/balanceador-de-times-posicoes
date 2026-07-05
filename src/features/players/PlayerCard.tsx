import type { ReactNode } from 'react';
import type { Player } from '../../domain/types';
import { usePlayerStore } from '../../store/usePlayerStore';
import { posToLabel } from '../../domain/playerAttributes';
import { scoreNativePosition, scoreMeiaRole, scoreDefensorRole, scoreAtacanteRole } from '../../engine/scoring';
import { Shield, Users, Swords, Edit, Trash2, ShieldAlert } from 'lucide-react';

interface PlayerCardProps {
  player: Player;
  onEdit: (player: Player) => void;
}

const POSITION_VISUAL: Record<Player['position'], { icon: ReactNode; color: string }> = {
  DEFENSOR: { icon: <Shield size={16} />, color: 'var(--primary)' },
  MEIA: { icon: <Users size={16} />, color: 'var(--secondary)' },
  ATACANTE: { icon: <Swords size={16} />, color: 'var(--danger)' },
};

const toOverall = (val: number) => Math.round((val / 6) * 100);

export function PlayerCard({ player, onEdit }: PlayerCardProps) {
  const { togglePlayerActive, deletePlayer } = usePlayerStore();
  const visual = POSITION_VISUAL[player.position];

  const mainOverall = toOverall(scoreNativePosition(player));
  const secondaryLabel = player.position === 'MEIA' ? 'OVR Versatilidade' : 'OVR Improviso (Meia)';
  const secondaryOverall = player.position === 'MEIA'
    ? toOverall((scoreDefensorRole(player) + scoreAtacanteRole(player)) / 2)
    : toOverall(scoreMeiaRole(player));

  return (
    <div className="glass-panel animate-fade-in" style={{ marginBottom: '16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', backgroundColor: visual.color }}></div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', textDecoration: !player.active ? 'line-through' : 'none', opacity: !player.active ? 0.5 : 1 }}>
              {player.name}
            </h3>
            {player.isCaptain && <span title="Capitão" style={{ fontSize: '1.2rem' }}>👑</span>}
            {player.isGoalkeeper && <span title="Goleiro (Emergência)"><ShieldAlert size={18} color="var(--primary)" /></span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: visual.color, fontSize: '0.85rem', fontWeight: 600 }}>
            {visual.icon} {posToLabel(player.position)}
          </div>

          <div style={{ marginTop: '8px', display: 'flex', gap: '12px', opacity: !player.active ? 0.5 : 1 }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OVR Principal</div>
              <div style={{ fontWeight: 'bold', color: mainOverall >= 80 ? 'var(--secondary)' : mainOverall >= 60 ? 'var(--star-active)' : 'white' }}>
                {mainOverall}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{secondaryLabel}</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {secondaryOverall}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', alignSelf: 'center' }}>
          <label className="checkbox-group" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={player.active}
              onChange={() => togglePlayerActive(player.id)}
              title="Ativo/Inativo"
            />
          </label>
          <button className="btn-secondary" style={{ padding: '6px', borderRadius: '8px', border: 'none' }} onClick={() => onEdit(player)}>
            <Edit size={18} />
          </button>
          <button className="btn-secondary" style={{ padding: '6px', borderRadius: '8px', border: 'none', color: 'var(--danger)' }} onClick={() => {
            if (window.confirm('Excluir jogador?')) deletePlayer(player.id);
          }}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
