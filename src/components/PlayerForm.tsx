import { useState } from 'react';
import type { Player, PlayerStats, Position } from '../types';
import { usePlayerStore } from '../store/usePlayerStore';
import { StarRating } from './StarRating';

interface PlayerFormProps {
  onClose: () => void;
  editingPlayer?: Player;
}

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

export function PlayerForm({ onClose, editingPlayer }: PlayerFormProps) {
  const { addPlayer, updatePlayer } = usePlayerStore();
  
  const [name, setName] = useState(editingPlayer?.name || '');
  const [isCaptain, setIsCaptain] = useState(editingPlayer?.isCaptain || false);
  const [isGoalkeeper, setIsGoalkeeper] = useState(editingPlayer?.isGoalkeeper || false);
  const [position, setPosition] = useState<Position>(editingPlayer?.position || 'DEFENSOR');
  
  // Initialize stats with defaults or existing values
  const [stats, setStats] = useState<PlayerStats>({
    ...defaultStats,
    ...(editingPlayer?.stats || {}),
  });

  const updateStat = (key: keyof PlayerStats, value: number) => {
    setStats(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name,
      active: editingPlayer ? editingPlayer.active : true,
      isCaptain,
      isGoalkeeper,
      position,
      stats,
    };

    if (editingPlayer) {
      updatePlayer(editingPlayer.id, payload);
    } else {
      addPlayer(payload);
    }
    onClose();
  };

  const getAvg = (keys: (keyof PlayerStats)[]) => {
    const sum = keys.reduce((acc, key) => acc + (stats[key] || 0), 0);
    return (sum / keys.length).toFixed(1);
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '24px', marginTop: '16px', marginBottom: '32px' }}>
      <h2 style={{ color: 'var(--primary)', marginBottom: '20px' }}>
        {editingPlayer ? 'Editar Jogador' : 'Novo Jogador'}
      </h2>
      
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label>Nome do Jogador</label>
          <input
            type="text"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Joãozinho"
            required
          />
        </div>

        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <label className="checkbox-group">
            <input type="checkbox" checked={isCaptain} onChange={e => setIsCaptain(e.target.checked)} />
            Capitão do Time?
          </label>
          <label className="checkbox-group">
            <input type="checkbox" checked={isGoalkeeper} onChange={e => setIsGoalkeeper(e.target.checked)} />
            Consegue jogar no Gol? (Emergência)
          </label>
        </div>

        <div className="input-group">
          <label>Posição Principal</label>
          <select 
            className="input-field"
            value={position}
            onChange={(e) => setPosition(e.target.value as Position)}
          >
            <option value="DEFENSOR">Defensor (Zagueiro/Lateral)</option>
            <option value="MEIA_DEFENSIVO">Meia Defensivo (Volante)</option>
            <option value="MEIA_OFENSIVO">Meia Ofensivo (Armador)</option>
            <option value="ATACANTE">Atacante (Pivô/Finalizador)</option>
          </select>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
            {position === 'DEFENSOR' && "Defensores são muito bons para defender, mas não tão bons com finalização e drible."}
            {(position === 'MEIA_DEFENSIVO' || position === 'MEIA_OFENSIVO') && "Meias são muito bons em passe sob pressão, sabem defender e atacar, mas não são atacantes de referência."}
            {position === 'ATACANTE' && "Atacantes são bons de corpo, finalização e aproveitam espaços, mas não tão bons em defesa."}
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', margin: '20px 0', paddingTop: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Atributos do Jogador</h3>
          <div style={{ marginBottom: '20px' }}>
            <StarRating
              label="Recomposição defensiva / Velocidade / Vigor Físico"
              value={stats.geral_recomposicaoVelocidadeVigor!}
              onChange={v => updateStat('geral_recomposicaoVelocidadeVigor', v)}
            />
          </div>

          {position === 'DEFENSOR' && (
            <>
              <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <h4 style={{ color: 'var(--primary)', marginBottom: '8px' }}>Status Principal</h4>
                <StarRating label="Posicionamento / Marcação / Bote" value={stats.def_posicionamentoMarcacao!} onChange={v => updateStat('def_posicionamentoMarcacao', v)} />
                <StarRating label="Interceptação / Tirada de bola" value={stats.def_interceptacao!} onChange={v => updateStat('def_interceptacao', v)} />
              </div>
              <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <h4 style={{ color: 'var(--secondary)', marginBottom: '8px' }}>Status Secundário (Improviso Volante)</h4>
                <StarRating label="Proteção de bola / Visão / Passe" value={stats.def_sec_protecaoVisaoPasse!} onChange={v => updateStat('def_sec_protecaoVisaoPasse', v)} />
                <StarRating label="Sair da pressão" value={stats.def_sec_sairPressao!} onChange={v => updateStat('def_sec_sairPressao', v)} />
              </div>
            </>
          )}

          {(position === 'MEIA_DEFENSIVO' || position === 'MEIA_OFENSIVO') && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ color: 'var(--primary)', marginBottom: '8px' }}>Base</h4>
                <StarRating label="Proteção de bola / Visão / Passe" value={stats.mei_protecaoVisaoPasse!} onChange={v => updateStat('mei_protecaoVisaoPasse', v)} />
              </div>
              
              <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ color: position === 'MEIA_OFENSIVO' ? 'var(--primary)' : 'var(--secondary)', margin: 0 }}>
                    Aspectos Ofensivos {position === 'MEIA_OFENSIVO' && '(Principal)'}
                  </h4>
                  <span style={{ fontSize: '0.8rem', background: 'var(--primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                    Média: {getAvg(['mei_of_finalizacao', 'mei_of_dribleArrancada', 'mei_of_passeGolTabela'])}
                  </span>
                </div>
                <StarRating label="Finalização" value={stats.mei_of_finalizacao!} onChange={v => updateStat('mei_of_finalizacao', v)} />
                <StarRating label="Drible / Arrancada / Proteção de bola" value={stats.mei_of_dribleArrancada!} onChange={v => updateStat('mei_of_dribleArrancada', v)} />
                <StarRating label="Passe para gol / Tabela" value={stats.mei_of_passeGolTabela!} onChange={v => updateStat('mei_of_passeGolTabela', v)} />
              </div>

              <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ color: position === 'MEIA_DEFENSIVO' ? 'var(--primary)' : 'var(--secondary)', margin: 0 }}>
                    Aspectos Defensivos {position === 'MEIA_DEFENSIVO' && '(Principal)'}
                  </h4>
                  <span style={{ fontSize: '0.8rem', background: 'var(--secondary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', color: 'black' }}>
                    Média: {getAvg(['mei_def_sairPressao', 'mei_def_posicionamentoMarcacao', 'mei_def_interceptacao'])}
                  </span>
                </div>
                <StarRating label="Sair da pressão" value={stats.mei_def_sairPressao!} onChange={v => updateStat('mei_def_sairPressao', v)} />
                <StarRating label="Posicionamento / Marcação / Bote" value={stats.mei_def_posicionamentoMarcacao!} onChange={v => updateStat('mei_def_posicionamentoMarcacao', v)} />
                <StarRating label="Interceptação / Tirada de bola" value={stats.mei_def_interceptacao!} onChange={v => updateStat('mei_def_interceptacao', v)} />
              </div>
            </>
          )}

          {position === 'ATACANTE' && (
            <>
              <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <h4 style={{ color: 'var(--primary)', marginBottom: '8px' }}>Status Principal</h4>
                <StarRating label="Corpo / Posicionamento / Mobilidade" value={stats.ata_corpoPosicionamento!} onChange={v => updateStat('ata_corpoPosicionamento', v)} />
                <StarRating label="Finalização / Passe de pivô" value={stats.ata_finalizacaoPassePivo!} onChange={v => updateStat('ata_finalizacaoPassePivo', v)} />
              </div>
              <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <h4 style={{ color: 'var(--secondary)', marginBottom: '8px' }}>Status Secundário (Improviso Meia Atacante)</h4>
                <StarRating label="Drible / Arrancada / Proteção de bola" value={stats.ata_sec_dribleArrancada!} onChange={v => updateStat('ata_sec_dribleArrancada', v)} />
                <StarRating label="Passe para gol / Tabela" value={stats.ata_sec_passeGolTabela!} onChange={v => updateStat('ata_sec_passeGolTabela', v)} />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" style={{ flex: 2 }}>{editingPlayer ? 'Salvar Alterações' : 'Cadastrar Jogador'}</button>
        </div>
      </form>
    </div>
  );
}
