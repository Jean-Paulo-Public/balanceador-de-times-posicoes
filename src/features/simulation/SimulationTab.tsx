import { useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { balanceTeamsOptions, buildTeamSchedule, getLastBalanceRunReport, type BalanceResult, type BalancedTeam } from '../../engine';
import { LINE_POSITIONS, type LinePosition } from '../../domain/positions';
import { FieldMapV2 } from './FieldMapV2';
import { teamTactics } from './tactics';
import { buildFieldMapsImage } from './fieldMapImage';
import { ScenarioList } from './ScenarioList';
import { formatScenarioPosition } from './scenarioSummary';
import { Play, AlertTriangle, MessageCircle, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './SimulationTab.module.css';

const suggestTeams = (activePlayersCount: number) => (activePlayersCount <= 17 ? 2 : 3);
const roleLabel = (r: LinePosition) => LINE_POSITIONS[r].label;

const chip = (label: string, value: number | string) => (
  <span className="chip chip-info" style={{ fontSize: '0.78rem' }}>{label} {value}</span>
);

function TeamBlock({ team }: { team: BalancedTeam }) {
  const t = team;
  const tactics = teamTactics(t);
  const schedule = buildTeamSchedule(t, 6);
  return (
    <div className={styles.proposalBlock}>
      <div className={styles.proposalHeader}>
        <h3 className={styles.proposalTitle}>{t.name} — {t.formation}</h3>
        <span className="chip chip-primary" style={{ fontWeight: 700 }}>OVR {t.metrics.geral}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {chip('Ataque', t.metrics.off)}
        {chip('Defesa', t.metrics.def)}
        {chip('Recuo', t.metrics.recuo)}
        {chip('Pressão', t.metrics.pressao)}
        {chip('Gol', t.metrics.cobertura == null ? 'emprestado' : t.metrics.cobertura)}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {schedule.constant
          ? <FieldMapV2 slots={schedule.games[0].slots} goalkeeperName={schedule.games[0].goalkeeperName} label="Jogo 1 ao 6" />
          : schedule.games.map((g) => (
            <FieldMapV2 key={g.game} slots={g.slots} goalkeeperName={g.goalkeeperName} label={`Jogo ${g.game}`} />
          ))}
      </div>

      <div style={{ background: 'var(--color-surface-2, rgba(255,255,255,0.04))', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
        <strong style={{ fontSize: '0.9rem' }}>Como jogar:</strong>
        <p style={{ margin: '4px 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>{tactics.summary}</p>
      </div>

      <div style={{ display: 'grid', gap: 4, marginBottom: t.bench.length ? 10 : 0 }}>
        {t.slots.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', gap: 8 }}>
            <span><strong>{s.player.name}</strong> — {roleLabel(s.role)}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>fit {s.fit}</span>
          </div>
        ))}
        {t.goalkeeper && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', gap: 8 }}>
            <span><strong>{t.goalkeeper.name}</strong> — Goleiro{t.rotatingGoalkeepers.length > 1 ? ' (revezam: ' + t.rotatingGoalkeepers.join(', ') + ')' : ''}</span>
          </div>
        )}
      </div>

      {t.bench.length > 0 && (
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Banco: {t.bench.map((b) => b.name).join(', ')}
        </p>
      )}
    </div>
  );
}

export function SimulationTab() {
  const { players, neverScaleGoalkeepers, setNeverScaleGoalkeepers, separatePairs, addSeparatePair, removeSeparatePair } = usePlayerStore();
  const activePlayersCount = players.filter((p) => p.active).length;
  const activePlayers = players.filter((p) => p.active);
  const nameById = new Map(players.map((p) => [p.id, p.name] as const));

  const [desiredNumTeams, setDesiredNumTeams] = useState<number>(() => suggestTeams(activePlayersCount));
  const [results, setResults] = useState<BalanceResult[]>([]);
  const [resultIdx, setResultIdx] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [selA, setSelA] = useState('');
  const [selB, setSelB] = useState('');
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [infeasibilityMessage, setInfeasibilityMessage] = useState<string | null>(null);
  const [candidatesEvaluated, setCandidatesEvaluated] = useState<number | null>(null);
  const current = results[resultIdx] ?? null;

  const maxFeasibleTeams = Math.max(1, Math.floor(activePlayersCount / 6));
  const numTeams = Math.min(desiredNumTeams, maxFeasibleTeams);
  const requiredPlayers = numTeams * 6;

  const handleSimulate = () => {
    setIsSimulating(true);
    setHasSimulated(true);
    setTimeout(() => {
      const out = balanceTeamsOptions(players, numTeams, { neverScaleGoalkeepers, separatePairs });
      const report = getLastBalanceRunReport();
      setResults(out);
      setResultIdx(0);
      setInfeasibilityMessage(out.length === 0 ? (report?.feasibility.message ?? null) : null);
      setCandidatesEvaluated(report?.candidatesEvaluated ?? null);
      setIsSimulating(false);
    }, 50);
  };

  const handleExportWhatsApp = () => {
    if (!current) return;
    const text = current.teams
      .map((t) => {
        const head = `*${t.name}* — ${t.formation}`;
        const gk = t.goalkeeper ? `Goleiro: ${t.goalkeeper.name}` : (t.fieldsGoalkeeper ? '' : 'Goleiro: emprestado');
        const line = t.slots.map((s) => `- ${s.player.name} (${roleLabel(s.role)})`).join('\n');
        const bench = t.bench.length ? `\nBanco: ${t.bench.map((b) => b.name).join(', ')}` : '';
        return [head, gk, line].filter(Boolean).join('\n') + bench;
      })
      .join('\n\n————————————\n\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleExportFieldImage = async () => {
    if (!current || isExportingImage) return;
    setIsExportingImage(true);
    try {
      const blob = await buildFieldMapsImage(current);
      const file = new File([blob], 'times-mapinhas.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Times' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'times-mapinhas.png';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') console.error('Falha ao exportar imagem:', e);
    } finally {
      setIsExportingImage(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="header-top">
        <h1>Simular Partidas</h1>
        <p>Times equilibrados por atributos, funções e formação</p>
      </div>

      <div style={{ padding: '20px' }}>
        <div className={`glass-panel ${styles.controlsPanel}`}>
          <div className={styles.controlsGrid}>
            <div className={`input-group ${styles.teamsField}`}>
              <label>Qtd. de Times</label>
              <select className="input-field" value={desiredNumTeams} onChange={(e) => setDesiredNumTeams(Number(e.target.value))}>
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
                  <input type="checkbox" checked={neverScaleGoalkeepers} onChange={(e) => setNeverScaleGoalkeepers(e.target.checked)} />
                  <span style={{ fontSize: '0.95rem' }}>Não escalar goleiros (emprestado)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="input-group" style={{ marginTop: 4 }}>
            <label>Manter separados (não jogam bem juntos)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="input-field" style={{ maxWidth: 150 }} value={selA} onChange={(e) => setSelA(e.target.value)}>
                <option value="">Jogador A</option>
                {activePlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="input-field" style={{ maxWidth: 150 }} value={selB} onChange={(e) => setSelB(e.target.value)}>
                <option value="">Jogador B</option>
                {activePlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                type="button" className="btn-secondary" disabled={!selA || !selB || selA === selB}
                onClick={() => { addSeparatePair(selA, selB); setSelA(''); setSelB(''); }}
              >
                Adicionar
              </button>
            </div>
            {separatePairs.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {separatePairs.map(([a, b]) => (
                  <span key={a + b} className="chip chip-accent" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {nameById.get(a) ?? '?'} ✕ {nameById.get(b) ?? '?'}
                    <button type="button" onClick={() => removeSeparatePair(a, b)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.footerRow}>
            <span className={styles.footerHint}>{activePlayersCount} / {requiredPlayers} jogadores ativos</span>
            <button className="btn" onClick={handleSimulate} disabled={activePlayersCount < requiredPlayers || isSimulating}>
              <Play size={18} /> {isSimulating ? 'Balanceando...' : 'Gerar Times'}
            </button>
          </div>
          {activePlayersCount < requiredPlayers && (
            <p className={styles.errorHint}>
              São necessários pelo menos {requiredPlayers} jogadores ativos para {numTeams} times (6 de linha cada). Cadastre ou ative mais jogadores!
            </p>
          )}
        </div>

        {current && (
          <>
            <div className={styles.rosterHeader}>
              <h3 className={styles.rosterTitle}>
                Equilíbrio — gaps: Def {current.gaps.def} · Atq {current.gaps.off} · Recuo {current.gaps.recuo} · Pressão {current.gaps.pressao} · Overall {current.gaps.geral}
                {current.gaps.cobertura != null ? ` · Gol ${current.gaps.cobertura}` : ''}
              </h3>
              <div className={styles.rosterActions}>
                {results.length > 1 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="btn-secondary" aria-label="Cenário anterior"
                      onClick={() => setResultIdx((i) => Math.max(0, i - 1))}
                      disabled={resultIdx === 0}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{formatScenarioPosition(resultIdx, results.length)}</span>
                    <button
                      className="btn-secondary" aria-label="Próximo cenário"
                      onClick={() => setResultIdx((i) => Math.min(results.length - 1, i + 1))}
                      disabled={resultIdx === results.length - 1}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
                <button className="btn-secondary" onClick={handleExportFieldImage} disabled={isExportingImage}>
                  <ImageIcon size={16} /> {isExportingImage ? 'Gerando...' : 'Exportar mapinhas (imagem)'}
                </button>
                <button className="btn-secondary" onClick={handleExportWhatsApp}>
                  <MessageCircle size={16} /> Exportar para WhatsApp
                </button>
              </div>
            </div>
            <ScenarioList
              results={results}
              selectedIndex={resultIdx}
              onSelect={setResultIdx}
              candidatesEvaluated={candidatesEvaluated}
            />
            {current.separationViolations.length > 0 && (
              <p className={styles.errorHint} style={{ marginBottom: 12 }}>
                ⚠️ Não deu pra separar sem desequilibrar muito: {current.separationViolations.join(', ')}.
              </p>
            )}
            {current.goalkeeperWarnings.length > 0 && (
              <p className={styles.errorHint} style={{ marginBottom: 12 }}>
                ⚠️ {current.goalkeeperWarnings.join(' ')}
              </p>
            )}
            {current.benchWarnings.length > 0 && (
              <p className={styles.errorHint} style={{ marginBottom: 12 }}>
                ⚠️ {current.benchWarnings.join(' ')}
              </p>
            )}
            {current.teams.map((t) => <TeamBlock key={t.id} team={t} />)}
          </>
        )}

        {!current && !isSimulating && hasSimulated && activePlayersCount >= requiredPlayers && (
          <div className={`glass-panel ${styles.stateCard}`} style={{ borderColor: 'var(--color-danger)' }}>
            <div className={styles.stateIcon} style={{ color: 'var(--color-danger)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 className={styles.stateTitle} style={{ color: 'var(--color-danger)' }}>
              {infeasibilityMessage ? 'Impossível formar times' : 'Nenhuma divisão viável encontrada'}
            </h3>
            <p className={styles.stateText}>
              {infeasibilityMessage ?? 'Ative mais jogadores de linha (defensores ou meias) para equilibrar as posições.'}
            </p>
          </div>
        )}

        {!current && !isSimulating && !hasSimulated && (
          <div className={styles.placeholderState}>
            <p>Escolha a quantidade de times e clique em Gerar Times.</p>
          </div>
        )}
      </div>
    </div>
  );
}
