import type { Player } from '../types';
import { usePlayerStore } from '../store/usePlayerStore';
import { Shield, ShieldHalf, Swords, Edit, Trash2, ShieldAlert } from 'lucide-react';

interface PlayerCardProps {
  player: Player;
  onEdit: (player: Player) => void;
}

export function PlayerCard({ player, onEdit }: PlayerCardProps) {
  const { togglePlayerActive, deletePlayer } = usePlayerStore();

  const getPositionLabel = () => {
    switch (player.position) {
      case 'DEFENSOR': return { label: 'Defensor', icon: <Shield size={16} />, color: 'var(--primary)' };
      case 'MEIA_DEFENSIVO': return { label: 'Volante', icon: <ShieldHalf size={16} />, color: 'var(--secondary)' };
      case 'MEIA_OFENSIVO': return { label: 'Meia Ofensivo', icon: <Swords size={16} />, color: 'var(--accent)' };
      case 'ATACANTE': return { label: 'Atacante', icon: <Swords size={16} />, color: 'var(--danger)' };
    }
  };

  const getOveralls = () => {
    const s = player.stats;
    const avg = (arr: (number | undefined)[]) => {
      const valid = arr.filter((n): n is number => n !== undefined);
      return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 1;
    };
    const toOverall = (val: number) => Math.round((val / 6) * 100);

    let mainStars = 1;
    let secStars = 1;

    if (player.position === 'DEFENSOR') {
      mainStars = avg([s.def_posicionamentoMarcacao, s.def_interceptacao]);
      secStars = avg([s.def_sec_protecaoVisaoPasse, s.def_sec_sairPressao]);
    } else if (player.position === 'MEIA_DEFENSIVO') {
      mainStars = avg([s.mei_def_sairPressao, s.mei_def_posicionamentoMarcacao, s.mei_def_interceptacao, s.mei_protecaoVisaoPasse]);
      secStars = avg([s.mei_of_finalizacao, s.mei_of_dribleArrancada, s.mei_of_passeGolTabela]);
    } else if (player.position === 'MEIA_OFENSIVO') {
      mainStars = avg([s.mei_of_finalizacao, s.mei_of_dribleArrancada, s.mei_of_passeGolTabela, s.mei_protecaoVisaoPasse]);
      secStars = avg([s.mei_def_sairPressao, s.mei_def_posicionamentoMarcacao, s.mei_def_interceptacao]);
    } else if (player.position === 'ATACANTE') {
      mainStars = avg([s.ata_corpoPosicionamento, s.ata_finalizacaoPassePivo]);
      secStars = avg([s.ata_sec_dribleArrancada, s.ata_sec_passeGolTabela]);
    }

    return {
      main: toOverall(mainStars),
      sec: toOverall(secStars)
    };
  };

  const pos = getPositionLabel();
  const ovr = getOveralls();

  return (
    <div className="glass-panel animate-fade-in" style={{ marginBottom: '16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', backgroundColor: pos.color }}></div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', textDecoration: !player.active ? 'line-through' : 'none', opacity: !player.active ? 0.5 : 1 }}>
              {player.name}
            </h3>
            {player.isCaptain && <span title="Capitão" style={{ fontSize: '1.2rem' }}>👑</span>}
            {player.isGoalkeeper && <span title="Goleiro (Emergência)"><ShieldAlert size={18} color="var(--primary)" /></span>}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: pos.color, fontSize: '0.85rem', fontWeight: 600 }}>
            {pos.icon} {pos.label}
          </div>

          <div style={{ marginTop: '8px', display: 'flex', gap: '12px', opacity: !player.active ? 0.5 : 1 }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OVR Principal</div>
              <div style={{ fontWeight: 'bold', color: ovr.main >= 80 ? 'var(--secondary)' : ovr.main >= 60 ? 'var(--star-active)' : 'white' }}>
                {ovr.main}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OVR Improviso</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {ovr.sec}
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
            if(window.confirm('Excluir jogador?')) deletePlayer(player.id);
          }}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
