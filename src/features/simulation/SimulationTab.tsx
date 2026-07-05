import { useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { FormationType, SimulationResult } from '../../domain/types';
import { FORMATION_LABELS } from '../../domain/formations';
import { generateTeams } from '../../engine/generateTeams';
import { FieldMap } from './FieldMap';
import { Play, ChevronLeft, ChevronRight, AlertTriangle, ShieldAlert } from 'lucide-react';
import styles from './SimulationTab.module.css';

const MAX_TEAMS = 4;
const suggestTeams = (activePlayersCount: number) => (activePlayersCount <= 17 ? 2 : 3);

const overallColor = (value: number) =>
  value > 75 ? 'var(--color-primary)' : value > 50 ? 'var(--color-accent)' : 'var(--color-danger)';

export function SimulationTab() {
  const { players, neverScaleGoalkeepers, setNeverScaleGoalkeepers, maxSixLinePlayers, setMaxSixLinePlayers } = usePlayerStore();

  const activePlayersCount = players.filter(p => p.active).length;

  const [desiredNumTeams, setDesiredNumTeams] = useState<number>(() => suggestTeams(activePlayersCount));
  const [teamFormations, setTeamFormations] = useState<FormationType[]>(() => Array(MAX_TEAMS).fill('QUALQUER'));
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);

  const maxFeasibleTeams = Math.max(1, Math.floor(activePlayersCount / 6));
  const numTeams = Math.min(desiredNumTeams, maxFeasibleTeams);
  const requiredPlayers = numTeams * 6;
  const activeFormations = teamFormations.slice(0, numTeams);

  const handleSimulate = () => {
    setIsSimulating(true);
    setHasSimulated(true);
    setTimeout(() => {
      const simResults = generateTeams(players, activeFormations, numTeams, 3000, neverScaleGoalkeepers, maxSixLinePlayers);
      setResults(simResults);
      setCurrentIndex(0);
      setIsSimulating(false);
    }, 100);
  };

  const currentSimulation = results[currentIndex];
  const isImbalanced = currentSimulation && (currentSimulation.equilibrium > 100 || currentSimulation.defensiveEquilibrium > 100);

  return (
    <div className="animate-fade-in">
      <div className="header-top">
        <h1>Simular Partidas</h1>
        <p>Gere as equipes mais equilibradas, com foco na defesa</p>
      </div>

      <div style={{ padding: '20px' }}>
        <div className={`glass-panel ${styles.controlsPanel}`}>
          <div className={styles.controlsGrid}>
            <div className={styles.formationsGroup}>
              {activeFormations.map((teamFormation, index) => (
                <div key={index} className={`input-group ${styles.formationField}`}>
                  <label>Formação Time {index + 1}</label>
                  <select
                    className="input-field"
                    value={teamFormation}
                    onChange={(e) => setTeamFormations(prev => {
                      const next = [...prev];
                      next[index] = e.target.value as FormationType;
                      return next;
                    })}
                  >
                    <option value="QUALQUER">Qualquer uma</option>
                    <option value="OFENSIVA">{FORMATION_LABELS.OFENSIVA}</option>
                    <option value="EQUILIBRADA">{FORMATION_LABELS.EQUILIBRADA}</option>
                    <option value="DEFENSIVA">{FORMATION_LABELS.DEFENSIVA}</option>
                  </select>
                </div>
              ))}
            </div>

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

        {results.length > 0 && currentSimulation && isImbalanced && (
          <div className={styles.imbalanceBanner}>
            <AlertTriangle size={22} style={{ flexShrink: 0 }} />
            <span className={styles.imbalanceText}>
              <strong style={{ color: 'var(--color-accent)' }}>Aviso de Equilíbrio:</strong> os jogadores cadastrados atualmente não são os ideais para a montagem de um time equilibrado (ou defensivamente equilibrado) neste cenário. Recomendamos cadastrar mais goleiros, defensores ou meias para refinar os potes técnicos.
            </span>
          </div>
        )}

        {results.length > 0 && currentSimulation && (
          <div>
            <div className={styles.scenarioNav}>
              <button className={`btn-secondary ${styles.navBtn}`} onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} disabled={currentIndex === 0}>
                <ChevronLeft size={24} />
              </button>

              <div className={styles.scenarioTitle}>
                <h3>Cenário {currentIndex + 1}</h3>
                <span className={styles.scenarioSubtitle}>de {results.length} simulações</span>
              </div>

              <button className={`btn-secondary ${styles.navBtn}`} onClick={() => setCurrentIndex(prev => Math.min(results.length - 1, prev + 1))} disabled={currentIndex === results.length - 1}>
                <ChevronRight size={24} />
              </button>
            </div>

            <div className={styles.teamsList}>
              {currentSimulation.teams.map((team) => (
                <div key={team.id} className={`glass-panel ${styles.teamCard}`}>
                  <div className={styles.teamHeader}>
                    <div>
                      <h3 className={styles.teamName}>{team.name}</h3>
                      <span className={styles.teamSystem}>
                        Sistema: {FORMATION_LABELS[team.tacticalSystem as keyof typeof FORMATION_LABELS] ?? team.tacticalSystem}
                      </span>
                    </div>
                    <div className={styles.teamBadges}>
                      <div className={styles.badge}>
                        <div className={styles.badgeLabel}>Overall</div>
                        <div className={styles.badgeValue} style={{ background: overallColor(team.overall) }}>{team.overall}</div>
                      </div>
                      <div className={styles.badge}>
                        <div className={styles.badgeLabel} title="Quão difícil é fazer gol nesse time">Defesa</div>
                        <div className={styles.badgeValue} style={{ background: overallColor(team.defensiveOverall) }}>
                          <ShieldAlert size={13} /> {team.defensiveOverall}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.teamBody}>
                    <div className={styles.playersColumn}>
                      {team.players.map((tp, idx) => (
                        <div key={idx} className={styles.playerRow}>
                          <div>
                            <div className={styles.playerNameRow}>
                              <span className={styles.playerName}>{tp.player.name}</span>
                              {tp.improvisationPenalty > 0 && (
                                <span title="Posição Improvisada"><AlertTriangle size={13} color="var(--color-accent)" /></span>
                              )}
                              {tp.player.isCaptain && <span title="Capitão" style={{ fontSize: '0.85rem' }}>👑</span>}
                              {tp.roleShort === 'GK' && (
                                <span title="Goleiro"><ShieldAlert size={13} color="var(--color-info)" /></span>
                              )}
                            </div>
                            <div className={styles.playerOvr}>OVR: {Math.round((tp.roleScore / 6) * 100)}</div>
                            <div className={styles.playerRoleRow}>
                              {(tp.roleShort || '').length > 0 && <span className={styles.roleTag}>{tp.roleShort}</span>}
                              <span className={styles.roleLabel}>{tp.roleLabel || tp.assignedRole}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <FieldMap playersList={team.players} />
                  </div>

                  {team.bench.length > 0 && (
                    <div className={styles.benchSection}>
                      <div className={styles.benchHeader}>
                        <h4 className={styles.benchTitle}>Banco de Reservas</h4>
                        {team.benchOverall !== undefined && (
                          <div className={styles.benchAvg}>
                            <span className={styles.benchAvgLabel}>Média do Banco:</span>
                            <span className={styles.benchAvgValue} style={{ background: overallColor(team.benchOverall) }}>{team.benchOverall}</span>
                          </div>
                        )}
                      </div>
                      <div className={styles.benchList}>
                        {team.bench.map((bp, idx) => (
                          <span key={idx} className={styles.benchChip}>
                            {bp.player.name} <span className={styles.benchChipRole}>({bp.roleShort || 'LINHA'})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length === 0 && !isSimulating && hasSimulated && activePlayersCount >= requiredPlayers && (
          <div className={`glass-panel ${styles.stateCard}`} style={{ borderColor: 'var(--color-danger)' }}>
            <div className={styles.stateIcon} style={{ color: 'var(--color-danger)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 className={styles.stateTitle} style={{ color: 'var(--color-danger)' }}>⚠️ Nenhuma escalação viável encontrada</h3>
            <p className={styles.stateText}>
              Não há combinações de jogadores válidos suficientes para preencher estritamente as vagas táticas exigidas pelo esquema de linha.
              <strong> Por favor, cadastre, altere o cadastro ou ative mais defensores, meias ou atacantes para viabilizar as equipes.</strong>
            </p>
          </div>
        )}

        {results.length === 0 && !isSimulating && !hasSimulated && (
          <div className={styles.placeholderState}>
            <p>Selecione a formação e clique em Gerar Times.</p>
          </div>
        )}
      </div>
    </div>
  );
}
