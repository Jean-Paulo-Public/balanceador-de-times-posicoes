import { useState } from 'react';
import { ChevronDown, ChevronUp, Star } from 'lucide-react';
import { buildScenarioSummaries, type ScenarioLike } from './scenarioSummary';
import styles from './ScenarioList.module.css';

interface ScenarioListProps {
  results: ScenarioLike[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Nº de divisões candidatas internas avaliadas pelo motor (não é o nº de cenários mostrados). */
  candidatesEvaluated?: number | null;
}

/**
 * Lista/resumo comparável de TODOS os cenários devolvidos pela simulação
 * (não só o cenário atual) — índice, custo e gaps de cada um, com destaque
 * pro selecionado e pro de menor custo. Clicar num item seleciona o cenário.
 */
export function ScenarioList({ results, selectedIndex, onSelect, candidatesEvaluated }: ScenarioListProps) {
  const [expanded, setExpanded] = useState(false);
  const summaries = buildScenarioSummaries(results);
  if (summaries.length <= 1) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.toggleRow}>
        <button
          type="button"
          className={`btn-secondary ${styles.toggleBtn}`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {expanded ? 'Ocultar todos os cenários' : `Ver todos os ${summaries.length} cenários`}
        </button>
        {candidatesEvaluated != null && candidatesEvaluated > 0 && (
          <span className={styles.reportHint}>
            {summaries.length} cenário{summaries.length === 1 ? '' : 's'} apresentado{summaries.length === 1 ? '' : 's'} · {candidatesEvaluated} combinações avaliadas pelo algoritmo
          </span>
        )}
      </div>

      {expanded && (
        <div className={styles.list}>
          {summaries.map((s) => {
            const selected = s.index === selectedIndex;
            const classNames = [
              styles.item,
              selected ? styles.itemSelected : '',
              s.isBest ? styles.itemBest : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={s.index}
                type="button"
                className={classNames}
                onClick={() => onSelect(s.index)}
                aria-current={selected}
              >
                <span className={styles.itemIndex}>#{s.index + 1}</span>
                <span className={styles.itemCost}>Custo {s.cost}</span>
                <span className={styles.itemGaps}>
                  <span>Def {s.def}</span>
                  <span>Atq {s.off}</span>
                  <span>Recuo {s.recuo}</span>
                  <span>Pressão {s.pressao}</span>
                  <span>Overall {s.geral}</span>
                  {s.cobertura != null && <span>Gol {s.cobertura}</span>}
                </span>
                {s.isBest && (
                  <span className={styles.bestBadge}><Star size={12} /> Melhor</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
