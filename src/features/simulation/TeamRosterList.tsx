import type { Team } from '../../domain/types';
import { buildTeamSections, formationLabelFor } from './rosterText';
import { overallColor } from './overallColor';
import styles from './TeamRosterList.module.css';

interface TeamRosterListProps {
  teams: Team[];
}

/** Lista textual dos times (Goleiro/Defensores/Meias/Atacantes/Banco), pensada
 * pra dar uma visão rápida de quem está em cada time, sem precisar abrir o
 * campinho tático de cada um. Mostra também a formação e os badges de
 * Overall/Defesa no canto superior direito, iguais aos do campinho detalhado. */
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
                  <div className={styles.badgeValue} style={{ background: overallColor(team.overall) }}>{team.overall}</div>
                </div>
                <div className={styles.badge}>
                  <div className={styles.badgeLabel} title="Quão difícil é fazer gol nesse time">Defesa</div>
                  <div className={styles.badgeValue} style={{ background: overallColor(team.defensiveOverall) }}>{team.defensiveOverall}</div>
                </div>
              </div>
            </div>
            {sections.map(section => (
              <div key={section.label} className={styles.section}>
                <span className={styles.sectionLabel}>{section.label}:</span>
                <ul className={styles.list}>
                  {section.names.map(name => <li key={name}>{name}</li>)}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
