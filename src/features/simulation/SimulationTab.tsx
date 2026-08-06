import { useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import {
  balanceTeamsOptions, buildTeamSchedule, clampLateArrivals, gamesForTeamCount, getLastBalanceRunReport,
  type BalanceResult, type BalancedTeam,
} from '../../engine';
import { LINE_POSITIONS, type LinePosition } from '../../domain/positions';
import type { Player } from '../../domain/types';
import { FieldMapV2 } from './FieldMapV2';
import { teamTactics } from './tactics';
import { buildFieldMapsImage } from './fieldMapImage';
import { ScenarioList } from './ScenarioList';
import { formatScenarioPosition } from './scenarioSummary';
import { teamDisplayLabel } from '../../domain';
import { Play, AlertTriangle, MessageCircle, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './SimulationTab.module.css';

const suggestTeams = (activePlayersCount: number) => (activePlayersCount <= 17 ? 2 : 3);
const roleLabel = (r: LinePosition) => LINE_POSITIONS[r].label;

const chip = (label: string, value: number | string) => (
  <span className="chip chip-info" style={{ fontSize: '0.78rem' }}>{label} {value}</span>
);

function TeamBlock({
  team, totalGames, allowTwoConsecutiveBench, lateArrivalsMap,
}: {
  team: BalancedTeam; totalGames: number; allowTwoConsecutiveBench: boolean; lateArrivalsMap: Map<string, number>;
}) {
  const t = team;
  const tactics = teamTactics(t);
  // `totalGames` vem de `gamesForTeamCount` (9 com 2 times, 6 com 3+) — tem de
  // ser o MESMO número usado no custo, senão os campinhos exibem um rodízio
  // diferente do que foi balanceado. `allowTwoConsecutiveBench` precisa ser o
  // MESMO valor usado na simulação (não o estado ATUAL do checkbox, que pode
  // ter mudado depois) — vem do resultado, não da leitura ao vivo do estado.
  // `lateArrivalsMap` idem: já vem GRAMPEADA (ver `clampLateArrivals`) com o
  // MESMO `totalGames` desta simulação, senão o rodízio exibido divergiria do
  // que foi balanceado.
  const schedule = buildTeamSchedule(t, totalGames, undefined, allowTwoConsecutiveBench, lateArrivalsMap);
  // Quem chega atrasado NESTE time (elenco completo: gol + linha + banco) e a
  // partir de qual jogo entra — indicação PRÓPRIA, separada da lista de banco
  // (ver LateArrival em domain/types.ts): ele não aparece em `benchNames`
  // durante a ausência, então esta é a ÚNICA forma de o usuário saber quem
  // ainda não chegou e quando chega.
  const roster: Player[] = [...t.slots.map((s) => s.player), ...(t.goalkeeper ? [t.goalkeeper] : []), ...t.bench];
  const arrivals = roster
    .map((p) => ({ name: p.name, games: lateArrivalsMap.get(p.id) }))
    .filter((x): x is { name: string; games: number } => x.games != null)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className={styles.proposalBlock}>
      <div className={styles.proposalHeader}>
        <h3 className={styles.proposalTitle}>{teamDisplayLabel(t)} — {t.formation}</h3>
        <span className="chip chip-primary" style={{ fontWeight: 700 }}>OVR {t.metrics.geral}</span>
      </div>

      {arrivals.length > 0 && (
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
          Chegam atrasados: {arrivals.map((a) => `${a.name} (a partir do jogo ${a.games + 1})`).join(', ')}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {chip('Ataque', t.metrics.off)}
        {chip('Defesa', t.metrics.def)}
        {chip('Recuo', t.metrics.recuo)}
        {chip('Pressão', t.metrics.pressao)}
        {chip('Gol', t.metrics.cobertura == null ? 'emprestado' : t.metrics.cobertura)}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {schedule.constant
          ? <FieldMapV2 slots={schedule.games[0].slots} goalkeeperName={schedule.games[0].goalkeeperName} label={`Jogo 1 ao ${totalGames}`} />
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
  const {
    players, neverScaleGoalkeepers, setNeverScaleGoalkeepers, separatePairs, addSeparatePair, removeSeparatePair,
    lateArrivals, setLateArrival, removeLateArrival,
  } = usePlayerStore();
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
  // Filtro "Não jogará os primeiros jogos" (atrasados) — mesmo padrão de
  // seleção do "Manter separados" acima (combo + botão Adicionar), mas com um
  // segundo campo numérico (quantos jogos ele perde).
  const [lateSel, setLateSel] = useState('');
  const [lateGames, setLateGames] = useState('1');
  const [lateError, setLateError] = useState<string | null>(null);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [infeasibilityMessage, setInfeasibilityMessage] = useState<string | null>(null);
  const [candidatesEvaluated, setCandidatesEvaluated] = useState<number | null>(null);
  // Checkbox de EXCEÇÃO (regra do dono): permite sentar 2x seguidas no banco
  // (com cooldown, ver benchRotation.ts). Padrão DESMARCADO e NÃO persistido —
  // estado local do componente de propósito: é uma exceção pontual, tem de
  // voltar desmarcada sempre que o app abre (não faz parte do zustand
  // persistido, ao contrário de `neverScaleGoalkeepers`).
  const [allowTwoConsecutiveBench, setAllowTwoConsecutiveBench] = useState(false);
  // Valor de `allowTwoConsecutiveBench` efetivamente usado na ÚLTIMA simulação
  // — precisa ficar "congelado" pro recálculo de exibição do rodízio
  // (`TeamBlock`/`buildTeamSchedule`) continuar batendo com o resultado
  // mostrado, mesmo que o usuário mexa no checkbox depois de já ter simulado.
  const [simAllowTwoConsecutiveBench, setSimAllowTwoConsecutiveBench] = useState(false);
  // Checkbox de ESCAPE (regra do dono): ignora por completo a regra de
  // distribuição de veteranos (ver `veteranDistributionBroken` em
  // engine/balance.ts). Padrão DESMARCADO e NÃO persistido — mesmo padrão de
  // `allowTwoConsecutiveBench` acima (estado local do componente, nunca no
  // zustand persistido): volta desmarcado a cada abertura do app.
  const [ignoreVeteranDistribution, setIgnoreVeteranDistribution] = useState(false);
  const current = results[resultIdx] ?? null;

  const maxFeasibleTeams = Math.max(1, Math.floor(activePlayersCount / 6));
  const numTeams = Math.min(desiredNumTeams, maxFeasibleTeams);
  const requiredPlayers = numTeams * 6;
  // Total de jogos do rodízio PARA A CONFIG ATUAL (9 com 2 times, 6 com 3+) —
  // usado pra validar quantos jogos de ausência fazem sentido cadastrar (ver
  // `handleAddLateArrival` abaixo) e pra exibir o rodízio da última simulação.
  const totalGamesForConfig = gamesForTeamCount(numTeams);
  // `lateArrivals` GRAMPEADO ao rodízio da ÚLTIMA simulação (não o config
  // atual, que pode ter mudado depois — mesmo cuidado de `simAllowTwoConsecutiveBench`
  // abaixo) — usado pra exibir exatamente o mesmo rodízio que foi balanceado.
  const [simTotalGames, setSimTotalGames] = useState(6);

  const handleAddLateArrival = () => {
    setLateError(null);
    if (!lateSel) return;
    const games = Number(lateGames);
    if (!Number.isInteger(games) || games < 1) {
      setLateError('Quantidade de jogos precisa ser um número inteiro de pelo menos 1.');
      return;
    }
    if (games >= totalGamesForConfig) {
      setLateError(
        `Isso deixaria o jogador de fora da pelada inteira (o rodízio atual tem ${totalGamesForConfig} jogos) — ` +
        `use no máximo ${totalGamesForConfig - 1}.`,
      );
      return;
    }
    setLateArrival(lateSel, games);
    setLateSel('');
    setLateGames('1');
  };

  const handleSimulate = () => {
    setIsSimulating(true);
    setHasSimulated(true);
    setSimAllowTwoConsecutiveBench(allowTwoConsecutiveBench);
    setSimTotalGames(totalGamesForConfig);
    setTimeout(() => {
      const out = balanceTeamsOptions(players, numTeams, {
        neverScaleGoalkeepers, separatePairs, allowTwoConsecutiveBench, ignoreVeteranDistribution, lateArrivals,
      });
      const report = getLastBalanceRunReport();
      setResults(out);
      setResultIdx(0);
      // Quatro causas de "lista vazia" possíveis (ver `BalanceRunReport`):
      // encaixe de POSIÇÃO (`feasibility`), distribuição de VETERANOS
      // (`veteranInfeasibility`), distribuição de ATRASADOS
      // (`lateArrivalInfeasibility`) ou regra de ROTAÇÃO DO BANCO
      // (`benchInfeasibility`, que também cobre não fechar a linha por
      // atraso) — nunca mais de uma ao mesmo tempo (a checagem de posição
      // roda ANTES de sequer gerar divisões, e as outras três são mutuamente
      // exclusivas no relatório).
      setInfeasibilityMessage(
        out.length === 0
          ? (report?.feasibility.message ?? report?.veteranInfeasibility?.message
            ?? report?.lateArrivalInfeasibility?.message ?? report?.benchInfeasibility?.message ?? null)
          : null,
      );
      setCandidatesEvaluated(report?.candidatesEvaluated ?? null);
      setIsSimulating(false);
    }, 50);
  };

  // GRAMPEADA ao rodízio da última simulação (`simTotalGames`), igual à usada
  // pelo `TeamBlock` — pra WhatsApp/imagem mostrarem a MESMA config balanceada.
  const simLateArrivalsMap = clampLateArrivals(lateArrivals, simTotalGames);

  const handleExportWhatsApp = () => {
    if (!current) return;
    const text = current.teams
      .map((t) => {
        const head = `*${teamDisplayLabel(t)}* — ${t.formation}`;
        const gk = t.goalkeeper ? `Goleiro: ${t.goalkeeper.name}` : (t.fieldsGoalkeeper ? '' : 'Goleiro: emprestado');
        const line = t.slots.map((s) => `- ${s.player.name} (${roleLabel(s.role)})`).join('\n');
        const bench = t.bench.length ? `\nBanco: ${t.bench.map((b) => b.name).join(', ')}` : '';
        const rosterIds = [...t.slots.map((s) => s.player), ...(t.goalkeeper ? [t.goalkeeper] : []), ...t.bench];
        const arrivals = rosterIds
          .map((p) => ({ name: p.name, games: simLateArrivalsMap.get(p.id) }))
          .filter((x): x is { name: string; games: number } => x.games != null);
        const late = arrivals.length
          ? `\nChegam atrasados: ${arrivals.map((a) => `${a.name} (a partir do jogo ${a.games + 1})`).join(', ')}`
          : '';
        return [head, gk, line].filter(Boolean).join('\n') + bench + late;
      })
      .join('\n\n————————————\n\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleExportFieldImage = async () => {
    if (!current || isExportingImage) return;
    setIsExportingImage(true);
    try {
      const blob = await buildFieldMapsImage(current, simLateArrivalsMap);
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
                <label className="checkbox-group">
                  <input type="checkbox" checked={allowTwoConsecutiveBench} onChange={(e) => setAllowTwoConsecutiveBench(e.target.checked)} />
                  <span style={{ fontSize: '0.95rem' }}>
                    Permitir jogadores ficarem duas vezes seguidas no banco
                  </span>
                </label>
                {allowTwoConsecutiveBench && (
                  <p className={styles.teamsWarning} style={{ marginTop: -4 }}>
                    Exceção pontual: sem isso, uma divisão só é aceita se ninguém repetir banco em rodadas seguidas.
                    Com isso marcado, quem sentar 2x seguidas fica de fora do banco pelas 6 rodadas seguintes.
                  </p>
                )}
                <label className="checkbox-group">
                  <input
                    type="checkbox" checked={ignoreVeteranDistribution}
                    onChange={(e) => setIgnoreVeteranDistribution(e.target.checked)}
                  />
                  <span style={{ fontSize: '0.95rem' }}>Desconsiderar veteranos</span>
                </label>
                {ignoreVeteranDistribution && (
                  <p className={styles.teamsWarning} style={{ marginTop: -4 }}>
                    Escape pontual: sem isso, uma divisão só é aceita se os veteranos ficarem espalhados igualmente
                    entre os times. Com isso marcado, a distribuição de veteranos deixa de valer por completo.
                  </p>
                )}
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

          <div className="input-group" style={{ marginTop: 4 }}>
            <label>Não jogará os primeiros jogos (chega atrasado)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="input-field" style={{ maxWidth: 150 }} value={lateSel} onChange={(e) => setLateSel(e.target.value)}>
                <option value="">Jogador</option>
                {activePlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input
                type="number" className="input-field" style={{ maxWidth: 90 }} min={1} value={lateGames}
                onChange={(e) => setLateGames(e.target.value)}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>jogo(s) de ausência</span>
              <button type="button" className="btn-secondary" disabled={!lateSel} onClick={handleAddLateArrival}>
                Adicionar
              </button>
            </div>
            {lateError && <p className={styles.errorHint} style={{ marginTop: 8 }}>{lateError}</p>}
            {lateArrivals.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {lateArrivals.map((la) => (
                  <span key={la.playerId} className="chip chip-accent" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {nameById.get(la.playerId) ?? '?'} — {la.games} jogo(s)
                    <button type="button" onClick={() => removeLateArrival(la.playerId)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>×</button>
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
            {current.teams.map((t) => (
              <TeamBlock
                key={t.id} team={t} totalGames={simTotalGames}
                allowTwoConsecutiveBench={simAllowTwoConsecutiveBench}
                lateArrivalsMap={simLateArrivalsMap}
              />
            ))}
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
