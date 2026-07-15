import { useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { SimulationResult } from '../../domain/types';
import { generateProposals } from '../../engine/generateTeams';
import { TeamRosterList } from './TeamRosterList';
import { buildRosterText } from './rosterText';
import { buildFieldMapsImage } from './fieldMapImage';
import { Play, AlertTriangle, MessageCircle, Image as ImageIcon } from 'lucide-react';
import styles from './SimulationTab.module.css';

const suggestTeams = (activePlayersCount: number) => (activePlayersCount <= 17 ? 2 : 3);

export function SimulationTab() {
  const { players, neverScaleGoalkeepers, setNeverScaleGoalkeepers, maxSixLinePlayers, setMaxSixLinePlayers } = usePlayerStore();

  const activePlayersCount = players.filter(p => p.active).length;

  const [desiredNumTeams, setDesiredNumTeams] = useState<number>(() => suggestTeams(activePlayersCount));
  const [proposals, setProposals] = useState<SimulationResult[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);

  const maxFeasibleTeams = Math.max(1, Math.floor(activePlayersCount / 6));
  const numTeams = Math.min(desiredNumTeams, maxFeasibleTeams);
  const requiredPlayers = numTeams * 6;

  const handleSimulate = () => {
    setIsSimulating(true);
    setHasSimulated(true);
    setTimeout(() => {
      const generated = generateProposals(players, numTeams, { neverScaleGoalkeepers, maxSixLinePlayers });
      setProposals(generated);
      setIsSimulating(false);
    }, 100);
  };

  const handleExportWhatsApp = () => {
    if (proposals.length === 0) return;
    const text = proposals
      .map(p => `*${p.title}*\n\n${buildRosterText(p.teams)}`)
      .join('\n\n————————————\n\n');
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleExportFieldImage = async () => {
    if (proposals.length === 0 || isExportingImage) return;
    setIsExportingImage(true);
    try {
      const blob = await buildFieldMapsImage(proposals);
      const file = new File([blob], 'propostas-times.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Propostas de Times' });
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'propostas-times.png';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Falha ao exportar as propostas como imagem:', error);
      }
    } finally {
      setIsExportingImage(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="header-top">
        <h1>Simular Partidas</h1>
        <p>Três propostas equilibradas pelas estrelas dos jogadores</p>
      </div>

      <div style={{ padding: '20px' }}>
        <div className={`glass-panel ${styles.controlsPanel}`}>
          <div className={styles.controlsGrid}>
            <div className={`input-group ${styles.teamsField}`}>
              <label>Qtd. de Times</label>
              <select
                className="input-field"
                value={desiredNumTeams}
                onChange={(e) => setDesiredNumTeams(Number(e.target.value))}
              >
                <option value={2}>2 Times</option>
                <option value={3}>3 Times</option>
                <option value={4}>4 Times</option>
              </select>
              {desiredNumTeams > maxFeasibleTeams && (
                <p className={styles.teamsWarning}>Usando {numTeams} por falta de jogadores.</p>
              )}
            </div>

            <div className={`input-group ${styles.optionsField}`}>
              <label style={{ display: 'block', marginBottom: '8px' }}>Opções</label>
              <div className={styles.optionsList}>
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={neverScaleGoalkeepers}
                    onChange={(e) => setNeverScaleGoalkeepers(e.target.checked)}
                  />
                  <span style={{ fontSize: '0.95rem' }}>Nunca escalar goleiros</span>
                </label>

                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={maxSixLinePlayers}
                    onChange={(e) => setMaxSixLinePlayers(e.target.checked)}
                  />
                  <span style={{ fontSize: '0.95rem' }}>Nunca adicionar mais do que 6 jogadores na linha</span>
                </label>
              </div>
            </div>
          </div>

          <div className={styles.footerRow}>
            <span className={styles.footerHint}>
              {activePlayersCount} / {requiredPlayers} jogadores ativos (Mínimo de linha atingido)
            </span>
            <button className="btn" onClick={handleSimulate} disabled={activePlayersCount < requiredPlayers || isSimulating}>
              <Play size={18} /> {isSimulating ? 'Simulando...' : 'Gerar Times'}
            </button>
          </div>
          {activePlayersCount < requiredPlayers && (
            <p className={styles.errorHint}>
              São necessários pelo menos {requiredPlayers} jogadores ativos para preencher as linhas de {numTeams} times (6 por time). Cadastre ou ative mais jogadores!
            </p>
          )}
        </div>

        {proposals.length > 0 && (
          <div className={styles.rosterHeader}>
            <h3 className={styles.rosterTitle}>Propostas de Times</h3>
            <div className={styles.rosterActions}>
              <button className="btn-secondary" onClick={handleExportFieldImage} disabled={isExportingImage}>
                <ImageIcon size={16} /> {isExportingImage ? 'Gerando imagem...' : 'Exportar Propostas (Imagem)'}
              </button>
              <button className="btn-secondary" onClick={handleExportWhatsApp}>
                <MessageCircle size={16} /> Exportar para WhatsApp
              </button>
            </div>
          </div>
        )}

        {proposals.map((proposal) => (
          <div key={proposal.id} className={styles.proposalBlock}>
            <div className={styles.proposalHeader}>
              <h3 className={styles.proposalTitle}>{proposal.title}</h3>
            </div>
            <TeamRosterList teams={proposal.teams} />
          </div>
        ))}

        {proposals.length === 0 && !isSimulating && hasSimulated && activePlayersCount >= requiredPlayers && (
          <div className={`glass-panel ${styles.stateCard}`} style={{ borderColor: 'var(--color-danger)' }}>
            <div className={styles.stateIcon} style={{ color: 'var(--color-danger)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 className={styles.stateTitle} style={{ color: 'var(--color-danger)' }}>⚠️ Nenhuma proposta viável encontrada</h3>
            <p className={styles.stateText}>
              Não foi possível montar os times respeitando o limite de 4 atacantes por time.
              <strong> Cadastre/ative mais jogadores de linha (defensores ou meias) para equilibrar o número de atacantes.</strong>
            </p>
          </div>
        )}

        {proposals.length === 0 && !isSimulating && !hasSimulated && (
          <div className={styles.placeholderState}>
            <p>Escolha a quantidade de times e clique em Gerar Times.</p>
          </div>
        )}
      </div>
    </div>
  );
}
