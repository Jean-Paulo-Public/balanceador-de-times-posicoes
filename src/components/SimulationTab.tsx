import { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import type { FormationType, SimulationResult } from '../types';
import { generateTeams } from '../utils/balancer';
import { Play, ChevronLeft, ChevronRight, AlertTriangle, ShieldAlert } from 'lucide-react';

export function SimulationTab() {
  const { players, neverScaleGoalkeepers, setNeverScaleGoalkeepers } = usePlayerStore();
  const [teamFormations, setTeamFormations] = useState<FormationType[]>(Array(2).fill('QUALQUER'));
  const [numTeams, setNumTeams] = useState<number>(2);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);

  const activePlayersCount = players.filter(p => p.active).length;
  const activeGoalkeepersCount = players.filter(p => p.active && p.isGoalkeeper).length;
  const hasGoalkeeperSlot = !neverScaleGoalkeepers && [2, 3, 4].includes(numTeams) && activeGoalkeepersCount >= numTeams && activePlayersCount >= numTeams * 7;
  const playersPerTeam = hasGoalkeeperSlot ? 7 : 6;
  const requiredPlayers = numTeams * playersPerTeam;
  const suggestedTeams = activePlayersCount <= 17 ? 2 : activePlayersCount <= 23 ? 3 : 4;

  useEffect(() => {
    const s = suggestedTeams;
    if (numTeams !== s) {
      setNumTeams(s);
      setTeamFormations(prev => {
        const next = prev.slice(0, s);
        while (next.length < s) next.push('QUALQUER');
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayersCount]);

  const handleSimulate = () => {
    setIsSimulating(true);
    setHasSimulated(true);
    setTimeout(() => {
      const simResults = generateTeams(players, teamFormations, numTeams, 3000, neverScaleGoalkeepers);
      setResults(simResults);
      setCurrentIndex(0);
      setIsSimulating(false);
    }, 100);
  };

  const currentSimulation = results[currentIndex];
  const renderFieldMap = (players: NonNullable<typeof currentSimulation>['teams'][number]['players']) => {
    const layout = [
      { area: 'DEF', label: 'Defesa', roles: ['DEF'] },
      { area: 'MD', label: 'Volante', roles: ['MD'] },
      { area: 'MEI', label: 'Meia', roles: ['MEI'] },
      { area: 'MA', label: 'Meia Ataque', roles: ['MA'] },
      { area: 'ATA', label: 'Ataque', roles: ['ATA'] },
    ];

    return (
      <div style={{ width: '220px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>Campo</span>
        <div style={{ background: 'linear-gradient(180deg, rgba(0,100,0,0.14), rgba(0,130,0,0.24))', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '18px', padding: '12px', display: 'grid', gap: '8px' }}>
          {layout.map(section => {
            const playersInSection = players.filter(p => section.roles.includes(p.roleShort || ''));
            return (
              <div key={section.area} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', minHeight: '42px', alignItems: 'center', textAlign: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{section.label}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text)' }}>
                  {playersInSection.length > 0 ? playersInSection.map(p => p.player.name).join(', ') : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="header-top">
        <h1>Simular Partidas</h1>
        <p style={{ color: 'var(--text-muted)' }}>Gere as equipes mais equilibradas</p>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="glass-panel" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1, minWidth: '200px' }}>
              {teamFormations.map((teamFormation, index) => (
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
                    <option value="EQUILIBRADA">Equilibrada</option>
                    <option value="OFENSIVA">Ofensiva</option>
                    <option value="DEFENSIVA">Defensiva</option>
                  </select>
                </div>
              ))}
            </div>
            
            <div className="input-group" style={{ marginBottom: 0, width: '120px' }}>
              <label>Qtd. de Times</label>
              <select 
                className="input-field"
                value={numTeams}
                onChange={(e) => {
                  const nextNum = Number(e.target.value);
                  setNumTeams(nextNum);
                  setTeamFormations(prev => {
                    const next = prev.slice(0, nextNum);
                    while (next.length < nextNum) next.push('QUALQUER');
                    return next;
                  });
                }}
              >
                <option value={2}>2 Times</option>
                <option value={3}>3 Times</option>
                <option value={4}>4 Times</option>
              </select>
            </div>

            <div className="input-group" style={{ marginBottom: 0, minWidth: '220px' }}>
              <label style={{ display: 'block', marginBottom: '8px' }}>Opções</label>
              <label className="checkbox-group">
                <input
                  type="checkbox"
                  checked={neverScaleGoalkeepers}
                  onChange={(e) => setNeverScaleGoalkeepers(e.target.checked)}
                />
                <span style={{ fontSize: '0.95rem' }}>Nunca escalar goleiros</span>
              </label>
            </div>
          </div>
          
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: activePlayersCount < requiredPlayers ? 'var(--danger)' : 'var(--text-muted)' }}>
              {activePlayersCount} / {requiredPlayers} jogadores ativos
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
              São necessários exatamente {requiredPlayers} jogadores ativos para formar {numTeams} times completos. Cadastre ou ative mais jogadores!
            </p>
          )}
        </div>

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
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sistema: {team.tacticalSystem}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Overall</span>
                      <div style={{ 
                        background: `linear-gradient(135deg, ${team.overall > 75 ? 'var(--secondary)' : team.overall > 50 ? 'var(--star-active)' : 'var(--danger)'}, transparent)`,
                        padding: '4px 12px', borderRadius: '16px', fontWeight: 'bold'
                      }}>
                        {team.overall}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'nowrap' }}>
                    <div style={{ flex: '1 1 auto', minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {team.players.map((tp, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontWeight: 500 }}>{tp.player.name}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                (OVR: {Math.round((tp.roleScore / 6) * 100)})
                              </span>
                              {tp.improvisationPenalty > 0 && (
                                <span title="Posição Improvisada">
                                  <AlertTriangle size={14} color="var(--star-active)" />
                                </span>
                              )}
                              {(tp.player.isCaptain || (tp as any).isCrownFallback) && <span title="Capitão">👑</span>}
                              {tp.player.isGoalkeeper && (
                                <span title="Goleiro">
                                  <ShieldAlert size={14} color="var(--primary)" />
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                              {(tp.roleShort || '').length > 0 && (
                                <span style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>{tp.roleShort}</span>
                              )}
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tp.roleLabel || tp.assignedRole}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      {renderFieldMap(team.players)}
                    </div>
                  </div>

                  {team.bench && team.bench.length > 0 && (
                    <div style={{ marginTop: '16px', padding: '12px', borderTop: '1px solid var(--border-color)' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>Banco por time</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {team.bench.map((bp, idx) => (
                          <span key={idx} style={{ background: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '10px', fontSize: '0.85rem' }}>
                            {bp.player.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{bp.roleLabel || bp.assignedRole}</span>
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
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
            <p>Não foi possível montar nenhuma formação válida com os jogadores ativos. Pode faltar meia para formar um time equilibrado.</p>
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
