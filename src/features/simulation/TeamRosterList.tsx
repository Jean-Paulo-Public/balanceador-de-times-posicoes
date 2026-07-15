import type { Team } from '../../domain/types';
import { buildTeamSections, formationLabelFor } from './rosterText';
import { floorToHalf } from '../../domain/playerAttributes';
import { StarRating } from '../../components/StarRating';
import { FieldMap } from './FieldMap';
import styles from './TeamRosterList.module.css';

interface TeamRosterListProps {
  teams: Team[];
}

/** Lista textual dos times (Goleiro/Defensores/Meias/Atacantes/Banco), pensada
 * pra dar uma visão rápida de quem está em cada time, sem precisar abrir o
 * campinho tático de cada um. Mostra também a formação e o overall em estrelas
 * no canto superior direito, e o campinho compacto numa coluna à direita. */
export function TeamRosterList({ teams }: TeamRosterListProps) {
  return (
    <div className={styles.grid}>
      {teams.map(team => {
        const sections = buildTeamSections(team);
        return (
          <div key={team.id} className={`glass-panel ${styles.teamBlock}`}>
            <div className={styles.teamBlockHeader}>
              <div>
                <h4 className={styles.teamTitle}>{team.name}</h4>
                <span className={styles.teamSystem}>{formationLabelFor(team)}</span>
              </div>
              <div className={styles.badges}>
                <div className={styles.badge}>
                  <div className={styles.badgeLabel}>Overall</div>
                  <div className={styles.badgeStars}>
                    <StarRating label="" value={floorToHalf(team.overall)} readOnly size={14} />
                    <span className={styles.badgeStarsValue}>{team.overall.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.teamBlockBody}>
              <div className={styles.sectionsColumn}>
                {sections.map(section => (
                  <div key={section.label} className={styles.section}>
                    <span className={styles.sectionLabel}>{section.label}:</span>
                    <ul className={styles.list}>
                      {section.names.map(name => <li key={name}>{name}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              <div className={styles.compactFieldWrapper}>
                <FieldMap playersList={team.players} bench={team.bench} compact />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
