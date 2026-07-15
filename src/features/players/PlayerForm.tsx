import { useState, type ReactNode } from 'react';
import { Shield, Users, Swords, Target, BatteryLow } from 'lucide-react';
import type { Player, Position } from '../../domain/types';
import { usePlayerStore } from '../../store/usePlayerStore';
import { StarRating } from '../../components/StarRating';
import { DEFAULT_RATING } from '../../domain/playerAttributes';
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
  DEFENSOR: 'Defensor de origem — entra primeiro na zaga na hora de montar o time.',
  MEIA: 'Meia de origem — completa o meio-campo do time.',
  ATACANTE: 'Atacante de origem — entra primeiro no ataque (cada time aceita no máximo 4).',
};

export function PlayerForm({ onClose, editingPlayer }: PlayerFormProps) {
  const { addPlayer, updatePlayer } = usePlayerStore();

  const [name, setName] = useState(editingPlayer?.name || '');
  const [isCaptain, setIsCaptain] = useState(editingPlayer?.isCaptain || false);
  const [isGoalkeeper, setIsGoalkeeper] = useState(editingPlayer?.isGoalkeeper || false);
  const [position, setPosition] = useState<Position>(editingPlayer?.position || 'DEFENSOR');
  const [rating, setRating] = useState<number>(editingPlayer?.rating ?? DEFAULT_RATING);
  const [pivotFriendly, setPivotFriendly] = useState(editingPlayer?.pivotFriendly || false);
  const [recompoePouco, setRecompoePouco] = useState(editingPlayer?.recompoePouco || false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name,
      active: editingPlayer ? editingPlayer.active : true,
      isCaptain,
      isGoalkeeper,
      position,
      rating,
      pivotFriendly,
      recompoePouco,
    };

    if (editingPlayer) {
      updatePlayer(editingPlayer.id, payload);
    } else {
      addPlayer(payload);
    }
    onClose();
  };

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

          <label className="checkbox-group" style={{ marginTop: 'var(--space-3)' }}>
            <input type="checkbox" checked={pivotFriendly} onChange={e => setPivotFriendly(e.target.checked)} />
            <Target size={15} color="var(--color-accent)" /> Facilidade em ser pivô
          </label>
          <p className={styles.helpText}>
            Se o time ficar sem atacante, um meia com essa marcação é o primeiro a ser improvisado no ataque.
          </p>

          <label className="checkbox-group" style={{ marginTop: 'var(--space-2)' }}>
            <input type="checkbox" checked={recompoePouco} onChange={e => setRecompoePouco(e.target.checked)} />
            <BatteryLow size={15} color="var(--color-danger)" /> Recompõe pouco
          </label>
          <p className={styles.helpText}>
            Perfil mais ofensivo, corre menos pra trás. Vira a 2ª opção pra improvisar no ataque quando não há um pivô.
          </p>
        </div>

        <div className={styles.divider}>
          <h3 className={styles.sectionTitle}>Nível do Jogador</h3>

          <div className={styles.noticeBox}>
            <strong style={{ color: 'var(--color-text)' }}>Dica:</strong> use a estrela pra embutir a qualidade do jogador — um zagueiro muito bom marcando ganha estrela alta, mesmo sem ataque. Reserve 5 estrelas para quem é praticamente perfeito. É por essa estrela que os times são equilibrados.
          </div>

          <div className={styles.recomposicaoBox}>
            <StarRating
              label="Estrelas do jogador"
              value={rating}
              onChange={setRating}
            />
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" style={{ flex: 2 }}>{editingPlayer ? 'Salvar Alterações' : 'Cadastrar Jogador'}</button>
        </div>
      </form>
    </div>
  );
}
