import { useState, type ReactNode } from 'react';
import { Shield, Users, Swords } from 'lucide-react';
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
import styles from './PlayerForm.module.css';

interface PlayerFormProps {
  onClose: () => void;
  editingPlayer?: Player;
}

const POSITION_OPTIONS: { value: Position; label: string; icon: ReactNode }[] = [
  { value: 'DEFENSOR', label: 'Defensor', icon: <Shield size={16} /> },
  { value: 'MEIA', label: 'Meia', icon: <Users size={16} /> },
  { value: 'ATACANTE', label: 'Atacante', icon: <Swords size={16} /> },
];

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
    <div className={`glass-panel animate-fade-in ${styles.panel}`}>
      <h2 className={styles.title}>{editingPlayer ? 'Editar Jogador' : 'Novo Jogador'}</h2>

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

        <div className={styles.checkRow}>
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
          <div className={styles.segmented}>
            {POSITION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.segmentBtn} ${position === opt.value ? styles[`segmentBtnActive${opt.value}`] : ''}`}
                onClick={() => setPosition(opt.value)}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
          <p className={styles.helpText}>{POSITION_HELP[position]}</p>
        </div>

        <div className={styles.divider}>
          <h3 className={styles.sectionTitle}>Atributos do Jogador</h3>

          <div className={styles.noticeBox}>
            <strong style={{ color: 'var(--color-text)' }}>Observação:</strong> reserve 6 estrelas para quando o jogador for praticamente perfeito naquilo.
          </div>

          {allStatsAreDefault && (
            <div className={styles.quickFillBox}>
              Definir estrelas em todos os atributos
              <p className={styles.quickFillHint}>para atribuição rápida, depois ajuste de acordo com cada atributo</p>
              <StarRating label="" value={3} onChange={v => updateAllStats(v)} />
            </div>
          )}

          <div className={styles.recomposicaoBox}>
            <StarRating
              label={`${GERAL_ATTR.label} (peso alto na média geral e no equilíbrio defensivo)`}
              value={stats.geral_recomposicaoDefensiva!}
              onChange={v => updateStat('geral_recomposicaoDefensiva', v)}
            />
            <p className={styles.recomposicaoHint}>
              Pense em jogadores mais velhos ou com pouco compromisso tático: mesmo sendo tecnicamente bons,
              marcam pouco e recompõem devagar. Essa nota pesa mais do que as demais no equilíbrio entre os times.
            </p>
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <div className={styles.attrCard}>
              <div className={styles.attrCardHeader}>
                <h4 className={styles.attrCardTitleDefensive}>Aspectos Defensivos</h4>
                <span className="chip chip-info">Média: {getAvg(defensive.map(a => a.key))}</span>
              </div>
              {defensive.map(attr => (
                <StarRating key={attr.key} label={attr.label} value={stats[attr.key]!} onChange={v => updateStat(attr.key, v)} />
              ))}
            </div>

            <div className={styles.attrCard}>
              <div className={styles.attrCardHeader}>
                <h4 className={styles.attrCardTitleOffensive}>Aspectos Ofensivos</h4>
                <span className="chip chip-accent">Média: {getAvg(offensive.map(a => a.key))}</span>
              </div>
              {offensive.map(attr => (
                <StarRating key={attr.key} label={attr.label} value={stats[attr.key]!} onChange={v => updateStat(attr.key, v)} />
              ))}
            </div>
          </div>

          {isGoalkeeper && (
            <div className={styles.gkBox}>
              <h4 className={styles.gkTitle}>⚽ Atributos de Goleiro</h4>
              <p className={styles.gkHint}>Avalie os atributos específicos de goleiro (usados quando ele entrar no gol).</p>
              {GOALKEEPER_ATTRS.map(attr => (
                <StarRating key={attr.key} label={attr.label} value={stats[attr.key]!} onChange={v => updateStat(attr.key, v)} />
              ))}
            </div>
          )}
        </div>

        <div className={styles.formActions}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" style={{ flex: 2 }}>{editingPlayer ? 'Salvar Alterações' : 'Cadastrar Jogador'}</button>
        </div>
      </form>
    </div>
  );
}
