import { useState, useRef, type ChangeEvent } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { PlayerCard } from './PlayerCard';
import { PlayerForm } from './PlayerForm';
import { exportPlayersAsJson, parseImportedPlayers, pickAndImportPlayersFile, supportsNativeFilePicker } from './importExport';
import { UserPlus, Users, Sparkles, Save, FolderOpen } from 'lucide-react';
import type { Player } from '../../domain/types';
import styles from './PlayersTab.module.css';

export function PlayersTab() {
  const { players, setPlayers, generateTestPlayersOnEmpty, setGenerateTestPlayersOnEmpty, generateTestRoster } = usePlayerStore();
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>(undefined);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canPickFolder = supportsNativeFilePicker();

  // Fallback para navegadores sem File System Access API (Firefox, Safari...):
  // dispara o <input type="file"> escondido e lê o arquivo escolhido.
  const handleFallbackImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = await file.text();
      setPlayers(parseImportedPlayers(rawText));
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erro ao importar arquivo JSON.');
    }
  };

  const handleImportClick = async () => {
    if (!canPickFolder) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const imported = await pickAndImportPlayersFile();
      if (imported) {
        setPlayers(imported);
        setImportError(null);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erro ao importar arquivo JSON.');
    }
  };

  const handleGenerateTestRoster = () => {
    if (players.length > 0 && !window.confirm('Isso substitui todos os jogadores cadastrados pelo elenco de teste. Continuar?')) {
      return;
    }
    generateTestRoster();
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
        <p>Gerencie os jogadores do racha</p>
        <span className={styles.savedHint}>
          <Save size={12} /> Salvo automaticamente no seu navegador
        </span>
      </div>

      <div style={{ padding: '20px' }}>
        {!showForm ? (
          <>
            <div className={styles.headerRow}>
              <div className={styles.headerTitle}>
                <Users color="var(--color-primary)" size={22} />
                <h2>Jogadores</h2>
              </div>
              <span className="chip chip-primary">{activeCount} de linha ativos</span>
            </div>

            <div className={styles.actionsRow}>
              <button className="btn" onClick={() => exportPlayersAsJson(players)}>
                Exportar (JSON)
              </button>
              <button className="btn btn-secondary" onClick={handleImportClick}>
                Importar (JSON)
              </button>
              <button className="btn btn-ghost" onClick={handleGenerateTestRoster} title="Preenche o elenco com craques reais só para testar o app">
                <Sparkles size={16} /> Elenco de teste
              </button>
            </div>
            {canPickFolder && (
              <p className={styles.pickerHint}>
                <FolderOpen size={13} /> Exportar/Importar abre o seletor de pastas do sistema — escolha sua pasta do Google Drive (ou OneDrive) sincronizada para salvar direto lá.
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleFallbackImportFile}
            />
            <label className="checkbox-group">
              <input
                type="checkbox"
                checked={generateTestPlayersOnEmpty}
                onChange={(e) => setGenerateTestPlayersOnEmpty(e.target.checked)}
              />
              <span>Repor o elenco de teste automaticamente se a lista ficar vazia</span>
            </label>
            {importError && <div className={styles.errorBox}>{importError}</div>}

            <button className={`btn ${styles.addButton}`} onClick={() => setShowForm(true)}>
              <UserPlus size={20} /> Adicionar Jogador
            </button>

            {players.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Nenhum jogador cadastrado ainda.</p>
                <p>Comece adicionando a galera do racha, ou clique em "Elenco de teste" para brincar com craques de verdade!</p>
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
