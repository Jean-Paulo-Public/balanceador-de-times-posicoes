import { useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { PlayerCard } from './PlayerCard';
import { PlayerForm } from './PlayerForm';
import { UserPlus, Users } from 'lucide-react';
import type { Player } from '../types';

export function PlayersTab() {
  const { players } = usePlayerStore();
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>(undefined);

  const handleEdit = (player: Player) => {
    setEditingPlayer(player);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingPlayer(undefined);
  };

  const activeCount = players.filter(p => p.active && !p.isGoalkeeper).length;

  return (
    <div className="animate-fade-in">
      <div className="header-top">
        <h1>Balanceador</h1>
        <p style={{ color: 'var(--text-muted)' }}>Gerencie os jogadores do racha</p>
      </div>

      <div style={{ padding: '20px' }}>
        {!showForm ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users color="var(--primary)" />
                <h2 style={{ margin: 0 }}>Jogadores</h2>
              </div>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {activeCount} de linha ativos
              </span>
            </div>

            <button 
              className="btn" 
              style={{ width: '100%', marginBottom: '24px' }}
              onClick={() => setShowForm(true)}
            >
              <UserPlus size={20} /> Adicionar Jogador
            </button>

            {players.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
                <p>Nenhum jogador cadastrado ainda.</p>
                <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>Comece adicionando a galera do racha!</p>
              </div>
            ) : (
              <div>
                {players.map(player => (
                  <PlayerCard key={player.id} player={player} onEdit={handleEdit} />
                ))}
              </div>
            )}
          </>
        ) : (
          <PlayerForm onClose={closeForm} editingPlayer={editingPlayer} />
        )}
      </div>
    </div>
  );
}
