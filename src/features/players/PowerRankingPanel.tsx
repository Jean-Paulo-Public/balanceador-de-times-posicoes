// Painel de exportação do "Power Ranking" — uma imagem por atributo (+ nota
// de goleiro), jogadores ativos agrupados em faixas de nível (ver
// src/features/players/powerRanking.ts pra lógica pura e powerRankingImage.ts
// pro desenho em canvas). UI = listagem com checkbox (um por atributo/GK) +
// "marcar/desmarcar todos" + botão único que exporta tudo de uma vez, cada um
// como um arquivo PNG com nome distinto.

import { useState } from 'react';
import type { Player } from '../../domain/types';
import { ALL_ATTRIBUTE_KEYS, ATTRIBUTE_META, type AttributeKey } from '../../domain/attributes';
import { buildAttributePowerRanking, buildGoalkeeperPowerRanking, hasEligibleGoalkeepers } from './powerRanking';
import { buildPowerRankingImage, powerRankingFileName } from './powerRankingImage';
import { BarChart3 } from 'lucide-react';
import styles from './PowerRankingPanel.module.css';

type RankingOption = { id: AttributeKey | 'GK'; label: string };

// Pequena pausa entre downloads em sequência: alguns navegadores bloqueiam ou
// atrapalham vários `<a download>` disparados no mesmo tick.
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

interface PowerRankingPanelProps {
  players: Player[];
}

export function PowerRankingPanel({ players }: PowerRankingPanelProps) {
  const showGk = hasEligibleGoalkeepers(players);
  const options: RankingOption[] = [
    ...ALL_ATTRIBUTE_KEYS.map((key) => ({ id: key, label: ATTRIBUTE_META[key].label })),
    ...(showGk ? [{ id: 'GK' as const, label: 'Nota de Goleiro' }] : []),
  ];

  const [selected, setSelected] = useState<Set<AttributeKey | 'GK'>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const allSelected = options.length > 0 && options.every((o) => selected.has(o.id));

  const toggleOne = (id: AttributeKey | 'GK') => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(options.map((o) => o.id)));
  };

  const handleExport = async () => {
    if (selected.size === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const chosen = options.filter((o) => selected.has(o.id));
      for (let i = 0; i < chosen.length; i++) {
        const option = chosen[i];
        const data = option.id === 'GK'
          ? buildGoalkeeperPowerRanking(players)
          : buildAttributePowerRanking(players, option.id);
        if (data.bands.length === 0) continue; // ninguém ativo nesse atributo (elenco vazio)
        const blob = await buildPowerRankingImage(data);
        downloadBlob(blob, powerRankingFileName(data));
        if (i < chosen.length - 1) await wait(250);
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <BarChart3 size={18} color="var(--color-primary)" />
        <h3>Power Ranking</h3>
      </div>
      <p className={styles.hint}>
        Exporta uma imagem por atributo com os jogadores ativos agrupados por faixa de nível (nenhum, muito baixa, baixa, média, alta, muito alta, máx).
      </p>

      <label className={styles.selectAll}>
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        <span>Marcar/desmarcar todos</span>
      </label>

      <div className={styles.optionsGrid}>
        {options.map((option) => (
          <label key={option.id} className={styles.option}>
            <input
              type="checkbox"
              checked={selected.has(option.id)}
              onChange={() => toggleOne(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      <button
        className="btn"
        onClick={handleExport}
        disabled={selected.size === 0 || isExporting}
      >
        {isExporting ? 'Exportando…' : `Exportar ${selected.size || ''} imagem${selected.size === 1 ? '' : 's'}`.trim()}
      </button>
    </div>
  );
}
