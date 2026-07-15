import type { TeamSlotPlayer } from '../../domain/types';
import styles from './FieldMap.module.css';

interface FieldMapProps {
  playersList: TeamSlotPlayer[];
  /** Reservas — desenhadas abaixo do goleiro, fora do campo. */
  bench?: TeamSlotPlayer[];
  /** Versão menor (usada como referência dentro da Lista de Times) — mesmo
   * desenho, só com o wrapper mais estreito e os chips menores, sem legenda. */
  compact?: boolean;
}

// Ordem de cima (ataque) para baixo (goleiro), como numa vista tática de campo.
const ROWS: { area: string; isGK: boolean }[] = [
  { area: 'ATA', isGK: false },
  { area: 'MEI', isGK: false },
  { area: 'DEF', isGK: false },
  { area: 'GK', isGK: true },
];

/** Recuo geral (linha de ataque, meio e defesa — nunca o goleiro), pra não
 * deixar o time com cara de "muito avançado" no campinho. */
const LINE_BACK_OFFSET = 6;

export function FieldMap({ playersList, bench = [], compact = false }: FieldMapProps) {
  const hasGoalkeeper = playersList.some(p => p.roleShort === 'GK');
  const rows = ROWS.filter(r => !r.isGK || hasGoalkeeper);

  return (
    <div className={`${styles.wrapper} ${compact ? styles.wrapperCompact : ''}`}>
      {!compact && <span className={styles.caption}>Posicionamento tático</span>}
      <div className={`${styles.pitch} ${compact ? styles.pitchCompact : ''}`}>
        <div className={styles.pitchLines} />
        <div className={styles.centerLine} />
        <div className={styles.centerCircle} />
        {rows.map(row => {
          const playersInRow = playersList.filter(p => p.roleShort === row.area);
          return (
            <div key={row.area} className={styles.row}>
              {playersInRow.length > 0 ? (
                playersInRow.map((p, idx) => {
                  const offsetY = row.isGK ? 0 : LINE_BACK_OFFSET;
                  return (
                    <span
                      key={idx}
                      className={`${styles.playerChip} ${compact ? styles.playerChipCompact : ''} ${row.isGK ? styles.gkChip : ''}`}
                      style={offsetY ? { transform: `translateY(${offsetY}px)` } : undefined}
                      title={p.player.name}
                    >
                      {p.player.name}
                    </span>
                  );
                })
              ) : (
                <span className={styles.emptySlot}>—</span>
              )}
            </div>
          );
        })}
      </div>

      {bench.length > 0 && (
        <div className={`${styles.benchArea} ${compact ? styles.benchAreaCompact : ''}`}>
          <span className={styles.benchLabel}>Banco</span>
          <div className={styles.benchChips}>
            {bench.map((p, idx) => (
              <span
                key={idx}
                className={`${styles.benchChip} ${compact ? styles.benchChipCompact : ''}`}
                title={p.player.name}
              >
                {p.player.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
