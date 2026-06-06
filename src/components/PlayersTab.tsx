import { useState, useRef, type ChangeEvent } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { PlayerCard } from './PlayerCard';
import { PlayerForm } from './PlayerForm';
import { UserPlus, Users } from 'lucide-react';
import type { Player } from '../types';

export function PlayersTab() {
  const { players, setPlayers } = usePlayerStore();
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>(undefined);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const validPositions = ['DEFENSOR', 'MEIA_DEFENSIVO', 'MEIA_OFENSIVO', 'ATACANTE'] as const;
  const isValidPosition = (position: unknown): position is Player['position'] =>
    typeof position === 'string' && validPositions.includes(position as Player['position']);

  const handleExportPlayers = () => {
    const json = JSON.stringify(players, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'players.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as unknown;
      const rawPlayers = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && 'players' in parsed && Array.isArray((parsed as any).players)
        ? (parsed as any).players
        : null;

      if (!rawPlayers) {
        throw new Error('JSON inválido: use um array de jogadores ou um objeto com campo players.');
      }

      const importedPlayers = rawPlayers.map((source: any, index: number) => {
        const player = { ...source };
        return {
          ...player,
          id: typeof player.id === 'string' && player.id ? player.id : crypto.randomUUID(),
          name: typeof player.name === 'string' ? player.name : `Jogador ${index + 1}`,
          active: typeof player.active === 'boolean' ? player.active : true,
          isCaptain: typeof player.isCaptain === 'boolean' ? player.isCaptain : false,
          isGoalkeeper: typeof player.isGoalkeeper === 'boolean' ? player.isGoalkeeper : false,
          position: isValidPosition(player.position) ? player.position : 'DEFENSOR',
          stats: typeof player.stats === 'object' && player.stats ? player.stats : {},
        } as Player;
      });

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
                onClick={handleExportPlayers}
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
