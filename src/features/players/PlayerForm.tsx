import { useState } from 'react';
import type { Player, PlayerStats, Position } from '../../domain/types';
import { usePlayerStore } from '../../store/usePlayerStore';
import { StarRating } from '../../components/StarRating';
import {
  ATTRS_BY_POSITION,
  GERAL_ATTR,
  GOALKEEPER_ATTRS,
  ALL_ATTRIBUTE_KEYS,
  normalizeStats,
} from '../../domain/playerAttributes';

interface PlayerFormProps {
  onClose: () => void;
  editingPlayer?: Player;
}

const POSITION_HELP: Record<Position, string> = {
  DEFENSOR: 'Defensores são muito bons para marcar e proteger a área, mas não tão bons com finalização e drible. Podem improvisar como Meia.',
  MEIA: 'Meias equilibram ataque e defesa e podem improvisar em qualquer posição — são a peça mais flexível do time.',
  ATACANTE: 'Atacantes são bons de finalização, drible e passe para o gol, mas não tão bons em defesa. Podem improvisar como Meia.',
};

export function PlayerForm({ onClose, editingPlayer }: PlayerFormProps) {
  const { addPlayer, updatePlayer } = usePlayerStore();

  const [name, setName] = useState(editingPlayer?.name || '');
  const [isCaptain, setIsCaptain] = useState(editingPlayer?.isCaptain || false);
  const [isGoalkeeper, setIsGoalkeeper] = useState(editingPlayer?.isGoalkeeper || false);
  const [position, setPosition] = useState<Position>(editingPlayer?.position || 'DEFENSOR');
  const [stats, setStats] = useState<PlayerStats>(normalizeStats(editingPlayer?.stats));

  const updateStat = (key: keyof PlayerStats, value: number) => {
    setStats(prev => ({ ...prev, [key]: value }));
  };

  const updateAllStats = (value: number) => {
    setStats(() => {
      const next = {} as PlayerStats;
      for (const key of ALL_ATTRIBUTE_KEYS) (next[key] as number) = value;
      return next;
    });
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
    const sum = keys.reduce((acc, key) => acc + (stats[key] ?? 0), 0);
    return (sum / keys.length).toFixed(1);
  };

  const allStatsAreDefault = Object.values(stats).every((value) => value === 3);
  const { defensive, offensive } = ATTRS_BY_POSITION[position];

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
            <option value="DEFENSOR">Defensor</option>
            <option value="MEIA">Meia</option>
            <option value="ATACANTE">Atacante</option>
          </select>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
            {POSITION_HELP[position]}
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', margin: '20px 0', paddingTop: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Atributos do Jogador</h3>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
              <p style={{ fontSize: '0.9rem', color: '#ffffff', margin: 0, lineHeight: '1.4' }}>
                <strong>Observação:</strong> Reserve 6 estrelas para quando o jogador for praticamente perfeito naquilo.
              </p>
            </div>
            {allStatsAreDefault && (
              <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '10px', background: 'rgba(0, 123, 255, 0.08)', border: '1px solid rgba(0, 123, 255, 0.2)', color: 'var(--primary)', fontWeight: 700 }}>
                Definir estrelas em todos os atributos
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.4', fontWeight: 400 }}>
                  para atribuição rápida, depois ajuste de acordo com cada atributo
                </p>
                <StarRating label="" value={3} onChange={v => updateAllStats(v)} />
              </div>
            )}
            <div style={{ padding: '12px', background: 'rgba(255,165,0,0.08)', borderRadius: '8px', border: '1px solid rgba(255,165,0,0.25)' }}>
              <StarRating
                label={`${GERAL_ATTR.label} (peso alto na média geral e no equilíbrio defensivo)`}
                value={stats.geral_recomposicaoDefensiva!}
                onChange={v => updateStat('geral_recomposicaoDefensiva', v)}
              />
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                Pense em jogadores mais velhos ou com pouco compromisso tático: mesmo sendo tecnicamente bons,
                marcam pouco e recompõem devagar. Essa nota pesa mais do que as demais no equilíbrio entre os times.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ color: 'var(--primary)', margin: 0 }}>Aspectos Defensivos</h4>
              <span style={{ fontSize: '0.8rem', background: 'var(--primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                Média: {getAvg(defensive.map(a => a.key))}
              </span>
            </div>
            {defensive.map(attr => (
              <StarRating key={attr.key} label={attr.label} value={stats[attr.key]!} onChange={v => updateStat(attr.key, v)} />
            ))}
          </div>

          <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ color: 'var(--secondary)', margin: 0 }}>Aspectos Ofensivos</h4>
              <span style={{ fontSize: '0.8rem', background: 'var(--secondary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', color: 'black' }}>
                Média: {getAvg(offensive.map(a => a.key))}
              </span>
            </div>
            {offensive.map(attr => (
              <StarRating key={attr.key} label={attr.label} value={stats[attr.key]!} onChange={v => updateStat(attr.key, v)} />
            ))}
          </div>

          {isGoalkeeper && (
            <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(0,100,200,0.2)', borderRadius: '8px', border: '1px solid rgba(0,150,255,0.3)' }}>
              <h4 style={{ color: '#00A8FF', marginBottom: '8px' }}>⚽ Atributos de Goleiro</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.4' }}>
                Avalie os atributos específicos de goleiro (usados quando ele entrar no gol).
              </p>
              {GOALKEEPER_ATTRS.map(attr => (
                <StarRating key={attr.key} label={attr.label} value={stats[attr.key]!} onChange={v => updateStat(attr.key, v)} />
              ))}
            </div>
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
