import type { TeamSlotPlayer } from '../../domain/types';
import styles from './FieldMap.module.css';

interface FieldMapProps {
  playersList: TeamSlotPlayer[];
}

// Ordem de cima (ataque) para baixo (goleiro), como numa vista tática de campo.
const ROWS: { area: string; isGK: boolean }[] = [
  { area: 'ATA', isGK: false },
  { area: 'MEI', isGK: false },
  { area: 'DEF', isGK: false },
  { area: 'GK', isGK: true },
];

export function FieldMap({ playersList }: FieldMapProps) {
  const hasGoalkeeper = playersList.some(p => p.roleShort === 'GK');
  const rows = ROWS.filter(r => !r.isGK || hasGoalkeeper);

  return (
    <div className={styles.wrapper}>
      <span className={styles.caption}>Posicionamento tático</span>
      <div className={styles.pitch}>
        <div className={styles.pitchLines} />
        <div className={styles.centerLine} />
        <div className={styles.centerCircle} />
        {rows.map(row => {
          const playersInRow = playersList.filter(p => p.roleShort === row.area);
          return (
            <div key={row.area} className={styles.row}>
              {playersInRow.length > 0 ? (
                playersInRow.map((p, idx) => {
                  // Atacante que não é "pivô de referência" fica alguns pixels mais atrás
                  // dentro da própria linha de ataque: evidencia que ele não é a referência
                  // de área pra bola aérea, e sim um segundo atacante que vem de trás pra finalizar.
                  const isNonPivotAtacante = row.area === 'ATA' && !p.player.pivotFriendly;
                  return (
                    <span
                      key={idx}
                      className={`${styles.playerChip} ${row.isGK ? styles.gkChip : ''} ${isNonPivotAtacante ? styles.secondStriker : ''}`}
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
    </div>
  );
}
