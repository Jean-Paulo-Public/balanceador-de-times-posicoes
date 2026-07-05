import { useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { FormationType, SimulationResult } from '../../domain/types';
import { FORMATION_LABELS } from '../../domain/formations';
import { generateTeams } from '../../engine/generateTeams';
import { FieldMap } from './FieldMap';
import { Play, ChevronLeft, ChevronRight, AlertTriangle, ShieldAlert } from 'lucide-react';

const MAX_TEAMS = 4;
const suggestTeams = (activePlayersCount: number) => (activePlayersCount <= 17 ? 2 : 3);

const overallColor = (value: number) =>
  value > 75 ? 'var(--secondary)' : value > 50 ? 'var(--star-active)' : 'var(--danger)';

export function SimulationTab() {
  const { players, neverScaleGoalkeepers, setNeverScaleGoalkeepers, maxSixLinePlayers, setMaxSixLinePlayers } = usePlayerStore();

  const activePlayersCount = players.filter(p => p.active).length;

  // `desiredNumTeams` guarda a escolha do usuário. `numTeams` é sempre derivado dela,
  // limitado ao que o elenco atual comporta — nunca sobrescreve a escolha manual do
  // usuário "de verdade": se o elenco voltar a crescer, a escolha original volta a valer.
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
        <p style={{ color: 'var(--text-muted)' }}>Gere as equipes mais equilibradas, com foco na defesa</p>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="glass-panel" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1, minWidth: '200px' }}>
              {activeFormations.map((teamFormation, index) => (
                <div key={index} className="input-group" style={{ minWidth: '180px' }}>
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

            <div className="input-group" style={{ marginBottom: 0, width: '120px' }}>
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
                <p style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '4px' }}>
                  Usando {numTeams} por falta de jogadores.
                </p>
              )}
            </div>

            <div className="input-group" style={{ marginBottom: 0, minWidth: '240px' }}>
              <label style={{ display: 'block', marginBottom: '8px' }}>Opções</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {activePlayersCount} / {requiredPlayers} jogadores ativos (Mínimo de linha atingido)
            </span>
            <button
              className="btn"
              onClick={handleSimulate}
              disabled={activePlayersCount < requiredPlayers || isSimulating}
            >
              <Play size={18} /> {isSimulating ? 'Simulando...' : 'Gerar Times'}
            </button>
          </div>
          {activePlayersCount < requiredPlayers && (
            <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '8px' }}>
              São necessários pelo menos {requiredPlayers} jogadores ativos para preencher as linhas de {numTeams} times (6 por time). Cadastre ou ative mais jogadores!
            </p>
          )}
        </div>

        {results.length > 0 && currentSimulation && isImbalanced && (
          <div style={{
            marginBottom: '20px', padding: '16px', background: 'rgba(255, 165, 0, 0.1)',
            border: '1px solid var(--star-active)', borderRadius: '12px', display: 'flex',
            alignItems: 'center', gap: '12px', color: 'var(--star-active)'
          }}>
            <AlertTriangle size={22} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.92rem', lineHeight: '1.4' }}>
              <strong>Aviso de Equilíbrio:</strong> Os jogadores cadastrados atualmente não são os ideais para a montagem de um time equilibrado (ou defensivamente equilibrado) neste cenário. Recomendamos cadastrar mais goleiros, defensores ou meias para refinar os potes técnicos.
            </span>
          </div>
        )}

        {results.length > 0 && currentSimulation && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <button
                className="btn-secondary"
                style={{ padding: '8px', borderRadius: '50%' }}
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft size={24} />
              </button>

              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)' }}>Cenário {currentIndex + 1}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>de {results.length} simulações</span>
              </div>

              <button
                className="btn-secondary"
                style={{ padding: '8px', borderRadius: '50%' }}
                onClick={() => setCurrentIndex(prev => Math.min(results.length - 1, prev + 1))}
                disabled={currentIndex === results.length - 1}
              >
                <ChevronRight size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {currentSimulation.teams.map((team) => (
                <div key={team.id} className="glass-panel" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{team.name}</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Sistema: {FORMATION_LABELS[team.tacticalSystem as keyof typeof FORMATION_LABELS] ?? team.tacticalSystem}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Overall</div>
                        <div style={{ background: `linear-gradient(135deg, ${overallColor(team.overall)}, transparent)`, padding: '4px 12px', borderRadius: '16px', fontWeight: 'bold' }}>
                          {team.overall}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} title="Quão difícil é fazer gol nesse time">Defesa</div>
                        <div style={{ background: `linear-gradient(135deg, ${overallColor(team.defensiveOverall)}, transparent)`, padding: '4px 12px', borderRadius: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <ShieldAlert size={14} /> {team.defensiveOverall}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ flex: '0 1 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {team.players.map((tp, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', padding: '2px 0' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 500 }}>{tp.player.name}</span>
                              {tp.improvisationPenalty > 0 && (
                                <span title="Posição Improvisada">
                                  <AlertTriangle size={13} color="var(--star-active)" />
                                </span>
                              )}
                              {tp.player.isCaptain && <span title="Capitão" style={{ fontSize: '0.85rem' }}>👑</span>}
                              {tp.roleShort === 'GK' && (
                                <span title="Goleiro">
                                  <ShieldAlert size={13} color="var(--primary)" />
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                OVR: {Math.round((tp.roleScore / 6) * 100)}
                              </span>
                            </div>

                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {(tp.roleShort || '').length > 0 && (
                                <span style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>{tp.roleShort}</span>
                              )}
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{tp.roleLabel || tp.assignedRole}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <FieldMap playersList={team.players} />
                  </div>

                  {team.bench.length > 0 && (
                    <div style={{ marginTop: '14px', padding: '10px 0 0 0', borderTop: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Banco de Reservas
                        </h4>
                        {team.benchOverall !== undefined && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Média do Banco:</span>
                            <span style={{
                              fontSize: '0.75rem', fontWeight: 'bold',
                              background: `linear-gradient(135deg, ${overallColor(team.benchOverall)}, transparent)`,
                              padding: '2px 8px', borderRadius: '10px', color: 'var(--text)'
                            }}>
                              {team.benchOverall}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {team.bench.map((bp, idx) => (
                          <span key={idx} style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '8px', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                            {bp.player.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.70rem' }}>({bp.roleShort || 'LINHA'})</span>
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
          <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', borderColor: 'var(--danger)', marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--danger)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 style={{ color: 'var(--danger)', marginBottom: '12px', marginTop: 0 }}>⚠️ Nenhuma escalação viável encontrada</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', maxWidth: '520px', margin: '0 auto', fontSize: '0.92rem' }}>
              Não há combinações de jogadores válidos suficientes para preencher estritamente as vagas táticas exigidas pelo esquema de linha.
              <strong> Por favor, cadastre, altere o cadastro ou ative mais defensores, meias ou atacantes para viabilizar as equipes.</strong>
            </p>
          </div>
        )}

        {results.length === 0 && !isSimulating && !hasSimulated && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
            <p>Selecione a formação e clique em Gerar Times.</p>
          </div>
        )}
      </div>
    </div>
  );
}
