import { useState, useRef, type ChangeEvent } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { PlayerCard } from './PlayerCard';
import { PlayerForm } from './PlayerForm';
import { exportPlayersAsJson, parseImportedPlayers } from './importExport';
import { UserPlus, Users } from 'lucide-react';
import type { Player } from '../../domain/types';

export function PlayersTab() {
  const { players, setPlayers, generateTestPlayersOnEmpty, setGenerateTestPlayersOnEmpty } = usePlayerStore();
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>(undefined);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = await file.text();
      const importedPlayers = parseImportedPlayers(rawText);
      setPlayers(importedPlayers);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erro ao importar arquivo JSON.');
    }
  };

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

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <button
                className="btn"
                style={{ flex: 1, minWidth: '180px' }}
                onClick={() => exportPlayersAsJson(players)}
              >
                Exportar jogadores (JSON)
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, minWidth: '180px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                Importar jogadores (JSON)
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <label className="checkbox-group">
              <input
                type="checkbox"
                checked={generateTestPlayersOnEmpty}
                onChange={(e) => setGenerateTestPlayersOnEmpty(e.target.checked)}
              />
              <span>Gerar lista de jogadores de teste quando tiver 0 jogadores cadastrados</span>
            </label>
            {importError && (
              <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>
                {importError}
              </div>
            )}
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
