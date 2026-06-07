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

  // --- NOVA PERSISTÊNCIA LOCAL PARA O LIMITE DE LINHA ---
  const [maxSixLinePlayers, setMaxSixLinePlayers] = useState<boolean>(() => {
    const saved = localStorage.getItem('max_six_line_players');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('max_six_line_players', JSON.stringify(maxSixLinePlayers));
  }, [maxSixLinePlayers]);
  // -----------------------------------------------------

  // --- NOVA LOGICA DE CONTAGEM E VALIDAÇÃO FLEXÍVEL ---
  const activePlayers = players.filter(p => p.active);
  const activePlayersCount = activePlayers.length;

  // O mínimo absoluto necessário são 6 jogadores de linha por time solicitado
  const requiredPlayers = numTeams * 6;
  
  // Sugestão de quantidade de times baseada no tamanho do elenco de linha ativo
  const suggestedTeams = activePlayersCount <= 17 ? 2 : 3;
  // -----------------------------------------------------

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
      // Passado o sexto parâmetro contendo o estado booleano para o utilitário balancer
      const simResults = generateTeams(players, teamFormations, numTeams, 3000, neverScaleGoalkeepers, maxSixLinePlayers);
      setResults(simResults);
      setCurrentIndex(0);
      setIsSimulating(false);
    }, 100);
  };

  const currentSimulation = results[currentIndex];
  
  // Validação dinâmica do limite de equilíbrio técnico
  const isImbalanced = currentSimulation && (currentSimulation.equilibrium ?? 0) > 100;

  const renderFieldMap = (playersList: NonNullable<typeof currentSimulation>['teams'][number]['players']) => {
    // Layout base das linhas de jogo
    const layout = [
      { area: 'DEF', label: 'Defesa', roles: ['DEF'], isGK: false },
      { area: 'MD', label: 'Volante', roles: ['MD'], isGK: false },
      { area: 'MEI', label: 'Meia', roles: ['MEI'], isGK: false },
      { area: 'MA', label: 'Meia Ataque', roles: ['MA'], isGK: false },
      { area: 'ATA', label: 'Ataque', roles: ['ATA'], isGK: false },
    ];

    // Verifica se há um goleiro escalado neste time específico
    const hasGoalkeeper = playersList.some(p => p.player.isGoalkeeper);

    // Se houver goleiro, adiciona-o no topo do campinho (antes da defesa)
    if (hasGoalkeeper) {
      layout.unshift({ area: 'GK', label: 'Goleiro', roles: [], isGK: true });
    }

    return (
      <div style={{ flex: '0 1 auto', width: 'max-content', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', alignItems: 'center', margin: '4px 0 0 0', padding: '0 4px' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Posicionamento tático</span>
        
        <div style={{ background: 'linear-gradient(180deg, rgba(0,100,0,0.12), rgba(0,130,0,0.22))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '10px', display: 'grid', gap: '6px' }}>
          {layout.map(section => {
            // Filtra os jogadores baseado se a seção mapeia goleiro nativo ou as posições de linha normais
            const playersInSection = section.isGK 
              ? playersList.filter(p => p.player.isGoalkeeper)
              : playersList.filter(p => section.roles.includes(p.roleShort || ''));

            return (
              <div key={section.area} style={{ display: 'flex', flexDirection: 'column', gap: '1px', padding: '4px 8px', background: section.isGK ? 'rgba(0, 150, 255, 0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', minHeight: '32px', alignItems: 'center', textAlign: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: section.isGK ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{section.label}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
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

                {/* NOVO CHECKBOX INSERIDO */}
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

        {/* ALERTA DE EQUIPES DESEQUILIBRADAS (Equilibrium > 100) */}
        {results.length > 0 && currentSimulation && isImbalanced && (
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            background: 'rgba(255, 165, 0, 0.1)',
            border: '1px solid var(--star-active)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: 'var(--star-active)'
          }}>
            <AlertTriangle size={22} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.92rem', lineHeight: '1.4' }}>
              <strong>Aviso de Equilíbrio:</strong> Os jogadores cadastrados atualmente não são os ideais para a montagem de um time equilibrado neste cenário. Recomendamos cadastrar mais goleiros ou meias para refinar os potes técnicos.
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
                  
                  <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px' }}>
                    {/* Lista de Jogadores Titulares */}
                    <div style={{ flex: '0 1 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {team.players.map((tp, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', padding: '2px 0' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            {/* Linha 1: Nome do Jogador e Badges */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 500 }}>{tp.player.name}</span>
                              {tp.improvisationPenalty > 0 && (
                                <span title="Posição Improvisada">
                                  <AlertTriangle size={13} color="var(--star-active)" />
                                </span>
                              )}
                              {(tp as any).player.isCaptain || (tp as any).isCrownFallback && <span title="Capitão" style={{ fontSize: '0.85rem' }}>👑</span>}
                              {tp.player.isGoalkeeper && (
                                <span title="Goleiro">
                                  <ShieldAlert size={13} color="var(--primary)" />
                                </span>
                              )}
                            </div>
                            
                            {/* Linha 2: OVR */}
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                OVR: {Math.round((tp.roleScore / 6) * 100)}
                              </span>
                            </div>

                            {/* Linha 3: Posições e Funções */}
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

                    {/* Campinho tático */}
                    {renderFieldMap(team.players)}
                  </div>

                  {/* Seção do Banco */}
                  {team.bench && team.bench.length > 0 && (
                    <div style={{ marginTop: '14px', padding: '10px 0 0 0', borderTop: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Banco de Reservas
                        </h4>
                        {team.benchOverall !== undefined && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Média do Banco:</span>
                            <span style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: 'bold',
                              background: `linear-gradient(135deg, ${team.benchOverall > 75 ? 'var(--secondary)' : team.benchOverall > 50 ? 'var(--star-active)' : 'var(--danger)'}, transparent)`,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              color: 'var(--text)'
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
        
        {/* MENSAGEM DE ERRO AMIGÁVEL QUANDO NÃO HÁ COMBINAÇÕES DO MOTOR */}
        {results.length === 0 && !isSimulating && hasSimulated && activePlayersCount >= requiredPlayers && (
          <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', borderColor: 'var(--danger)', marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--danger)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 style={{ color: 'var(--danger)', marginBottom: '12px', marginTop: 0 }}>⚠️ Nenhuma escalação viável encontrada</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', maxWidth: '520px', margin: '0 auto', fontSize: '0.92rem' }}>
              Não há combinações de jogadores válidos suficientes para preencher estritamente as vagas táticas exigidas pelo esquema de linha. 
              <strong> Por favor, cadastre, altere o cadastro ou ative mais meias ( principalmente volantes ), defensores ou goleiros para viabilizar as equipes.</strong>
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