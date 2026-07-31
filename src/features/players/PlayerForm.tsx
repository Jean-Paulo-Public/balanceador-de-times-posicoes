import { useState, type ReactNode } from 'react';
import {
  Shield, Users, Swords, ArrowUp, ArrowDown, Info, AlertTriangle,
  SlidersHorizontal, ChevronDown, ChevronUp, X, Trash2, Pencil,
} from 'lucide-react';
import type { Player, Position, AttributeOverrides } from '../../domain/types';
import type { AttrVector, AttributeKey } from '../../domain/attributes';
import { ATTRIBUTE_META, ALL_ATTRIBUTE_KEYS, ATTR_DEFAULT, GK_DEFAULT, ATTR_PRESETS, clampAttr, emptyAttrs } from '../../domain/attributes';
import {
  ALL_LINE_POSITIONS, LINE_POSITIONS, BOX_TO_BOX, hasEnabledBoxToBox,
  type LinePosition, type PositionPreferenceEntry,
} from '../../domain/positions';
import { deriveAttributesFromStar, deriveGkFromStar } from '../../domain/deriveAttributes';
import { describePlayerProfile } from '../../domain/playerProfile';
import { suggestPositions, hasNoEnabledAmongBestPositions } from '../../engine';
import { usePlayerStore } from '../../store/usePlayerStore';
import { clampRating } from '../../domain/playerAttributes';
import { setPositionOverrideAttr, removePositionOverrideAttr, clearPositionOverrides, overriddenPositionsOf } from './positionOverrideEditor';
import { computeDisplayOvrs, OVR_DISPLAY_ITEMS, parseManualAttrInput } from './ovrDisplay';
import styles from './PlayerForm.module.css';

/** Lista default pra jogador novo: BOX_TO_BOX habilitado (coringa) + as 7 posições desabilitadas em ordem-catálogo. */
const defaultAcceptedPositions = (): PositionPreferenceEntry[] => [
  { position: BOX_TO_BOX, enabled: true },
  ...ALL_LINE_POSITIONS.map((position) => ({ position, enabled: false })),
];

/** Índice da entrada BOX_TO_BOX (sempre existe — é adicionada se faltar). */
const withBoxToBox = (list: PositionPreferenceEntry[]): PositionPreferenceEntry[] =>
  list.some((e) => e.position === BOX_TO_BOX) ? list : [{ position: BOX_TO_BOX, enabled: false }, ...list];

interface PlayerFormProps {
  onClose: () => void;
  editingPlayer?: Player;
}

const POSITION_OPTIONS: { value: Position; label: string; icon: ReactNode }[] = [
  { value: 'DEFENSOR', label: 'Defensor', icon: <Shield size={16} /> },
  { value: 'MEIA', label: 'Meia', icon: <Users size={16} /> },
  { value: 'ATACANTE', label: 'Atacante', icon: <Swords size={16} /> },
];

const POSITION_HELP: Record<Position, string> = {
  DEFENSOR: 'Defensor de origem — entra primeiro na zaga na hora de montar o time.',
  MEIA: 'Meia de origem — completa o meio-campo do time.',
  ATACANTE: 'Atacante de origem — entra primeiro no ataque (cada time aceita no máximo 4).',
};

export function PlayerForm({ onClose, editingPlayer }: PlayerFormProps) {
  const { addPlayer, updatePlayer } = usePlayerStore();

  const [name, setName] = useState(editingPlayer?.name || '');
  const [isGoalkeeper, setIsGoalkeeper] = useState(editingPlayer?.isGoalkeeper || false);
  const [position, setPosition] = useState<Position>(editingPlayer?.position || 'DEFENSOR');
  const [attributes, setAttributes] = useState<AttrVector>(() =>
    editingPlayer?.attributes
      ? { ...editingPlayer.attributes }
      : editingPlayer
        ? deriveAttributesFromStar(editingPlayer.rating, editingPlayer.position)
        : emptyAttrs(ATTR_DEFAULT),
  );
  const [gk, setGk] = useState<number | null>(
    editingPlayer?.gk ?? (editingPlayer ? deriveGkFromStar(editingPlayer.rating, editingPlayer.isGoalkeeper) : null),
  );
  const [acceptedPositions, setAcceptedPositions] = useState<PositionPreferenceEntry[]>(() =>
    editingPlayer ? withBoxToBox([...editingPlayer.acceptedPositions]) : defaultAcceptedPositions(),
  );
  const setAttr = (k: AttributeKey, v: number) => setAttributes((prev) => ({ ...prev, [k]: clampAttr(v) }));

  const boxToBox = hasEnabledBoxToBox(acceptedPositions);
  const setBoxToBox = (enabled: boolean) =>
    setAcceptedPositions((prev) => prev.map((e) => (e.position === BOX_TO_BOX ? { ...e, enabled } : e)));
  const toggleLinePosition = (pos: LinePosition, enabled: boolean) =>
    setAcceptedPositions((prev) => prev.map((e) => (e.position === pos ? { ...e, enabled } : e)));
  const moveLinePosition = (pos: LinePosition, dir: -1 | 1) =>
    setAcceptedPositions((prev) => {
      const boxEntry = prev.find((e) => e.position === BOX_TO_BOX)!;
      const line = prev.filter((e) => e.position !== BOX_TO_BOX);
      const i = line.findIndex((e) => e.position === pos);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= line.length) return prev;
      [line[i], line[j]] = [line[j], line[i]];
      return [boxEntry, ...line];
    });
  const linePrefs = acceptedPositions.filter((e): e is { position: LinePosition; enabled: boolean } => e.position !== BOX_TO_BOX);

  const [showProfileInfo, setShowProfileInfo] = useState(false);

  // Modo "Manual": troca os presets rápidos por um input numérico inteiro
  // (0–100) por atributo. `manualDrafts` guarda o TEXTO digitado (pode ficar
  // temporariamente inválido/vazio enquanto o usuário edita) — só o que passa
  // por `parseManualAttrInput` é commitado no estado real do atributo.
  const [manualMode, setManualMode] = useState(false);
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});

  const manualDraftFor = (key: string, value: number): string => manualDrafts[key] ?? String(value);

  const handleManualChange = (key: string, raw: string, onSet: (v: number) => void) => {
    setManualDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = parseManualAttrInput(raw);
    if (parsed !== null) onSet(parsed);
  };

  const handleManualBlur = (key: string, value: number) => {
    // Ao sair do campo, se o texto ficou inválido (ex.: vazio, decimal), volta
    // a refletir o valor realmente commitado — nunca deixa lixo exibido.
    setManualDrafts((prev) => ({ ...prev, [key]: String(value) }));
  };

  const toggleManualMode = () => {
    setManualMode((v) => !v);
    setManualDrafts({});
  };

  // Exceções de atributo por posição (modelo v3.1 — ver domain/types.ts e
  // engine/playerModel.ts). Mapa ESPARSO: só posições/atributos que diferem
  // da base. Colapsado por padrão — a UI só abre uma posição/atributo quando
  // o próprio usuário pede (`openAttrsByPosition`), inclusive pra sobrescritas
  // já salvas do jogador em edição (não abre tudo sozinho).
  const [positionOverrides, setPositionOverrides] = useState<AttributeOverrides | undefined>(
    editingPlayer?.positionOverrides ? { ...editingPlayer.positionOverrides } : undefined,
  );
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [openAttrsByPosition, setOpenAttrsByPosition] = useState<Partial<Record<LinePosition, AttributeKey[]>>>(() => {
    const init: Partial<Record<LinePosition, AttributeKey[]>> = {};
    if (editingPlayer?.positionOverrides) {
      for (const pos of Object.keys(editingPlayer.positionOverrides) as LinePosition[]) {
        init[pos] = Object.keys(editingPlayer.positionOverrides[pos] ?? {}) as AttributeKey[];
      }
    }
    return init;
  });

  const savedOverriddenPositions = overriddenPositionsOf(positionOverrides, ALL_LINE_POSITIONS);
  const openPositions = ALL_LINE_POSITIONS.filter((pos) => openAttrsByPosition[pos] !== undefined);
  const closedPositions = ALL_LINE_POSITIONS.filter((pos) => openAttrsByPosition[pos] === undefined);

  const addOverridePosition = (pos: LinePosition) =>
    setOpenAttrsByPosition((prev) => (prev[pos] ? prev : { ...prev, [pos]: [] }));

  const removeOverridePosition = (pos: LinePosition) => {
    setOpenAttrsByPosition((prev) => {
      const next = { ...prev };
      delete next[pos];
      return next;
    });
    setPositionOverrides((prev) => clearPositionOverrides(prev, pos));
  };

  const addOverrideAttr = (pos: LinePosition, attr: AttributeKey) =>
    setOpenAttrsByPosition((prev) => ({ ...prev, [pos]: [...(prev[pos] ?? []), attr] }));

  const removeOverrideAttr = (pos: LinePosition, attr: AttributeKey) => {
    setOpenAttrsByPosition((prev) => ({ ...prev, [pos]: (prev[pos] ?? []).filter((a) => a !== attr) }));
    setPositionOverrides((prev) => removePositionOverrideAttr(prev, pos, attr));
  };

  const setOverrideValue = (pos: LinePosition, attr: AttributeKey, value: number) =>
    setPositionOverrides((prev) => setPositionOverrideAttr(prev, pos, attr, value, attributes));

  const displayOvrs = computeDisplayOvrs(attributes, isGoalkeeper ? (gk ?? GK_DEFAULT) : null);
  const overall = displayOvrs.geral;

  // Jogador "rascunho" com os valores ATUAIS do formulário — só pra alimentar a
  // sugestão de posições (CAPACIDADE, ver domain/playerProfile.ts). Usa as
  // exceções de atributo EM EDIÇÃO (não só as já salvas), pra o painel de
  // perfil/fit refletir ao vivo o que o usuário está mexendo agora. Preserva
  // handicapPct do jogador em edição (o form não o edita).
  const draftPlayer: Player = {
    id: editingPlayer?.id ?? 'draft',
    name,
    active: editingPlayer?.active ?? true,
    isGoalkeeper,
    position,
    rating: clampRating(overall / 20),
    attributes,
    gk: isGoalkeeper ? (gk ?? GK_DEFAULT) : null,
    acceptedPositions,
    positionOverrides,
    handicapPct: editingPlayer?.handicapPct,
  };
  const profile = describePlayerProfile(attributes);
  const positionSuggestions = suggestPositions(draftPlayer);
  const noEnabledAmongBest = hasNoEnabledAmongBestPositions(draftPlayer);

  const attrRows: { key: string; label: string; value: number; onSet: (v: number) => void }[] = [
    ...ALL_ATTRIBUTE_KEYS.map((k) => ({ key: k as string, label: ATTRIBUTE_META[k].label, value: attributes[k], onSet: (v: number) => setAttr(k, v) })),
    ...(isGoalkeeper ? [{ key: 'GOL', label: 'Goleiro (GOL)', value: gk ?? GK_DEFAULT, onSet: (v: number) => setGk(clampAttr(v)) }] : []),
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name,
      active: editingPlayer ? editingPlayer.active : true,
      isGoalkeeper,
      position,
      rating: clampRating(overall / 20),
      attributes,
      gk: isGoalkeeper ? (gk ?? GK_DEFAULT) : null,
      acceptedPositions,
      positionOverrides,
    };

    if (editingPlayer) {
      updatePlayer(editingPlayer.id, payload);
    } else {
      addPlayer(payload);
    }
    onClose();
  };

  return (
    <div className={`glass-panel animate-fade-in ${styles.panel}`}>
      <h2 className={styles.title}>{editingPlayer ? 'Editar Jogador' : 'Novo Jogador'}</h2>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label>Nome do Jogador</label>
          <input
            type="text"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Joãozinho"
            required
          />
        </div>

        <div className={styles.checkRow}>
          <label className="checkbox-group">
            <input type="checkbox" checked={isGoalkeeper} onChange={e => setIsGoalkeeper(e.target.checked)} />
            Consegue jogar no Gol? (Emergência)
          </label>
        </div>

        <div className="input-group">
          <label>Posição Principal</label>
          <div className={styles.segmented}>
            {POSITION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.segmentBtn} ${position === opt.value ? styles[`segmentBtnActive${opt.value}`] : ''}`}
                onClick={() => setPosition(opt.value)}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
          <p className={styles.helpText}>{POSITION_HELP[position]}</p>
        </div>

        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <label style={{ margin: 0 }}>Atributos (0–100)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className={styles.ovrRow}>
                {OVR_DISPLAY_ITEMS.map((item) => {
                  const value = displayOvrs[item.key];
                  return (
                    <span
                      key={item.key}
                      className={`${styles.ovrChip} ${item.key === 'geral' ? styles.ovrChipPrimary : ''}`}
                      title={item.fullLabel}
                      aria-label={item.fullLabel}
                    >
                      <span className={styles.ovrAbbr}>{item.abbr}</span>
                      <span className={styles.ovrValue}>{value == null ? '—' : value}</span>
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                className={`btn ${manualMode ? '' : 'btn-secondary'}`}
                aria-pressed={manualMode}
                title={manualMode ? 'Sair do modo manual (voltar aos botões rápidos)' : 'Digitar valores manualmente (inteiros de 0 a 100)'}
                style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={toggleManualMode}
              >
                <Pencil size={16} /> Manual
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={showProfileInfo ? 'Ocultar perfil do jogador' : 'Ver perfil do jogador'}
                title="Como o jogador é e quais as posições ideais, segundo os atributos"
                style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                onClick={() => setShowProfileInfo((v) => !v)}
              >
                <Info size={16} />
              </button>
            </div>
          </div>
          <p className={styles.helpText}>
            É por esses atributos (e o Overall) que os times são equilibrados.
            {manualMode
              ? ' Modo manual: digite o valor de cada atributo (inteiro de 0 a 100).'
              : ' Use os botões pra preencher rápido.'}
          </p>

          {showProfileInfo && (
            <div className={styles.noticeBox}>
              <p style={{ margin: 0, marginBottom: 8, color: 'var(--color-text)', lineHeight: 1.5 }}>
                {profile.archetype && <strong>{profile.archetype}. </strong>}
                {profile.balanced ? (
                  'Perfil equilibrado, sem ponto forte marcante.'
                ) : (
                  <>
                    {profile.highlights.length > 0 && (
                      <>Se destaca em {profile.highlights.map((h) => `${h.label} (${h.value})`).join(', ')}. </>
                    )}
                    {profile.weaknesses.length > 0 && (
                      <>Ponto fraco: {profile.weaknesses.map((w) => `${w.label} (${w.value})`).join(', ')}. </>
                    )}
                  </>
                )}
              </p>

              <p style={{ margin: 0, marginBottom: 6, fontWeight: 700, fontSize: '0.9rem' }}>Posições ideais (pelos atributos)</p>
              <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
                {positionSuggestions.slice(0, 4).map((s, i) => (
                  <div key={s.position} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span>{i + 1}º {LINE_POSITIONS[s.position].label}</span>
                    <strong>{Math.round(s.fit)}</strong>
                  </div>
                ))}
              </div>

              {noEnabledAmongBest && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--color-accent)', marginBottom: 10 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
                    Nenhuma das posições habilitadas abaixo está entre as melhores dele pelos atributos —
                    o balanceamento pode ficar ruim sem motivo aparente. Vale revisar a lista de posições aceitas.
                  </span>
                </div>
              )}

              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                Isto descreve a CAPACIDADE do jogador (o que os atributos dizem) — é diferente da lista de
                posições aceitas abaixo, que descreve a VONTADE dele (onde aceita jogar). Esta sugestão é só
                informativa: não altera a lista de posições aceitas.
              </p>
            </div>
          )}
          <div style={{ display: 'grid', gap: '12px', marginTop: '6px' }}>
            {attrRows.map(({ key, label, value, onSet }) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
                <input
                  type="range" min={0} max={100} step={1} value={value}
                  disabled
                  aria-disabled="true"
                  aria-label={`${label} — somente leitura, ${manualMode ? 'use o campo numérico abaixo' : 'use os botões abaixo'} para alterar`}
                  className={styles.readonlySlider}
                  onChange={() => {}}
                  style={{ width: '100%' }}
                />
                {manualMode ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={`input-field ${styles.manualInput}`}
                    value={manualDraftFor(key, value)}
                    onChange={(e) => handleManualChange(key, e.target.value, onSet)}
                    onBlur={() => handleManualBlur(key, value)}
                    aria-label={`${label} (valor manual, inteiro 0–100)`}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                    {ATTR_PRESETS.map((p) => (
                      <button
                        type="button" key={p.label} className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '0.78rem' }}
                        onClick={() => onSet(p.value)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="input-group">
          <button
            type="button"
            className={styles.overridesHeader}
            onClick={() => setOverridesOpen((v) => !v)}
          >
            <span className={styles.overridesHeaderLeft}>
              <SlidersHorizontal size={16} />
              Exceções de atributo por posição
              {savedOverriddenPositions.length > 0 && (
                <span className={styles.overridesBadge}>
                  {savedOverriddenPositions.map((pos) => LINE_POSITIONS[pos].label).join(', ')}
                </span>
              )}
            </span>
            {overridesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {overridesOpen && (
            <div className={styles.overridesBody}>
              <p className={styles.helpText} style={{ margin: 0 }}>
                Alguns jogadores mudam de nível dependendo de onde jogam — ex.: finaliza melhor perto do gol.
                Aqui você sobrescreve o valor de um atributo só numa posição específica, sem mexer na base.
              </p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                Isto é CAPACIDADE (&quot;ele realmente joga melhor ali&quot;) — diferente da lista de posições
                aceitas abaixo, que é VONTADE (&quot;ele prefere jogar ali&quot;). Não infle o atributo só pra
                empurrar o solver pra posição que ele quer: isso faz o balanceador acertar pelo motivo errado e
                torna a penalidade de preferência decorativa.
              </p>

              {openPositions.map((pos) => {
                const openAttrs = openAttrsByPosition[pos] ?? [];
                const remainingAttrs = ALL_ATTRIBUTE_KEYS.filter((a) => !openAttrs.includes(a));
                return (
                  <div key={pos} className={styles.overridePositionCard}>
                    <div className={styles.overridePositionHeader}>
                      <strong>{LINE_POSITIONS[pos].label}</strong>
                      <button
                        type="button" className="btn btn-secondary" style={{ padding: '2px 8px' }}
                        title="Remover todas as exceções desta posição"
                        onClick={() => removeOverridePosition(pos)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {openAttrs.length === 0 && (
                      <p className={styles.helpText} style={{ marginBottom: 8 }}>
                        Nenhum atributo sobrescrito ainda — adicione um abaixo.
                      </p>
                    )}

                    {openAttrs.map((attr) => {
                      const baseValue = attributes[attr];
                      const value = positionOverrides?.[pos]?.[attr] ?? baseValue;
                      const diff = value - baseValue;
                      return (
                        <div key={attr} className={styles.overrideAttrRow}>
                          <span className={styles.overrideAttrLabel}>{ATTRIBUTE_META[attr].label}</span>
                          <span className={styles.overrideBaseValue}>Base: {baseValue}</span>
                          <input
                            type="range" min={0} max={100} step={1} value={value}
                            onChange={(e) => setOverrideValue(pos, attr, Number(e.target.value))}
                            style={{ flex: 1 }}
                          />
                          <strong style={{ minWidth: 28, textAlign: 'right' }}>{value}</strong>
                          <span className={styles.overrideDiff}>
                            {diff !== 0 ? (diff > 0 ? `+${diff}` : `${diff}`) : ''}
                          </span>
                          <button
                            type="button" className="btn btn-secondary" style={{ padding: '2px 6px' }}
                            aria-label={`Remover exceção de ${ATTRIBUTE_META[attr].label} em ${LINE_POSITIONS[pos].label}`}
                            title="Remover esta exceção (volta ao valor base)"
                            onClick={() => removeOverrideAttr(pos, attr)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}

                    {remainingAttrs.length > 0 && (
                      <select
                        className="input-field"
                        value=""
                        style={{ marginTop: 6 }}
                        onChange={(e) => {
                          const attr = e.target.value as AttributeKey;
                          if (attr) addOverrideAttr(pos, attr);
                        }}
                      >
                        <option value="">+ Sobrescrever atributo...</option>
                        {remainingAttrs.map((a) => (
                          <option key={a} value={a}>{ATTRIBUTE_META[a].label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}

              {closedPositions.length > 0 && (
                <select
                  className="input-field"
                  value=""
                  onChange={(e) => {
                    const pos = e.target.value as LinePosition;
                    if (pos) addOverridePosition(pos);
                  }}
                >
                  <option value="">+ Criar exceção numa posição...</option>
                  {closedPositions.map((pos) => (
                    <option key={pos} value={pos}>{LINE_POSITIONS[pos].label}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="input-group">
          <label>Posições de linha aceitas</label>
          <label className="checkbox-group" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={boxToBox} onChange={(e) => setBoxToBox(e.target.checked)} />
            Joga em qualquer posição (o sistema decide) — BOX_TO_BOX
          </label>
          <p className={styles.helpText}>
            {boxToBox
              ? 'Coringa: o balanceador escolhe livremente a melhor posição pra este jogador em cada time/jogo.'
              : 'Marque as posições que ele aceita jogar e ordene por preferência (setas). Índice 1 = preferência máxima.'}
          </p>
          <div style={{ display: 'grid', gap: 6, opacity: boxToBox ? 0.45 : 1, pointerEvents: boxToBox ? 'none' : 'auto' }}>
            {linePrefs.map((e, i) => (
              <div key={e.position} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
                <span style={{ minWidth: 18, color: 'var(--color-text-muted)' }}>{i + 1}º</span>
                <label className="checkbox-group" style={{ flex: 1 }}>
                  <input
                    type="checkbox" checked={e.enabled}
                    onChange={(ev) => toggleLinePosition(e.position, ev.target.checked)}
                  />
                  {LINE_POSITIONS[e.position].label}
                </label>
                <button
                  type="button" className="btn-secondary" aria-label="Subir"
                  disabled={i === 0} onClick={() => moveLinePosition(e.position, -1)}
                  style={{ padding: '2px 6px' }}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button" className="btn-secondary" aria-label="Descer"
                  disabled={i === linePrefs.length - 1} onClick={() => moveLinePosition(e.position, 1)}
                  style={{ padding: '2px 6px' }}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" style={{ flex: 2 }}>{editingPlayer ? 'Salvar Alterações' : 'Cadastrar Jogador'}</button>
        </div>
      </form>
    </div>
  );
}
