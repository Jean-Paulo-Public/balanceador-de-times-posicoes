// Campinho ILUSTRATIVO de um sistema tático (aba wiki, Fase 7). Mostra os
// RÓTULOS DAS POSIÇÕES nas coordenadas x/y já definidas em cada SystemSlotDef
// (src/engine/formationModel.ts) — não inventa layout novo. Vagas polimórficas
// (mais de uma identidade aceitável) mostram as alternativas, ex. "VOL/ALA".
// Reaproveita a mesma linguagem visual do campinho de simulação (FieldMapV2:
// gradiente verde, linha central, círculo central, chip escuro), mas sem
// jogadores — é só ilustração de onde cada posição fica.

import type { SystemDef } from '../../engine';
import type { LinePosition } from '../../domain/positions';
import { LINE_POSITIONS } from '../../domain/positions';
import styles from './SystemFieldDiagram.module.css';

const ROLE_SHORT: Record<LinePosition, string> = {
  FIXO: 'FIX', LATERAL: 'LAT', VOLANTE: 'VOL', ALA: 'ALA',
  MEIA_ATACANTE: 'MA', SEGUNDO_ATACANTE: 'SA', PIVO: 'PIV',
};

const slotShortLabel = (identities: readonly LinePosition[]): string =>
  identities.map((id) => ROLE_SHORT[id]).join('/');

const slotFullTitle = (identities: readonly LinePosition[]): string =>
  identities.map((id) => LINE_POSITIONS[id].label).join(' ou ');

interface SystemFieldDiagramProps {
  system: SystemDef;
}

export function SystemFieldDiagram({ system }: SystemFieldDiagramProps) {
  return (
    <div className={styles.card}>
      <div className={styles.name}>{system.label}</div>
      <div className={styles.field}>
        <div className={styles.midline} />
        <div className={styles.centerCircle} />
        <div
          className={`${styles.chip} ${styles.chipGk}`}
          style={{ left: '50%', bottom: '4%' }}
          title="Goleiro"
        >
          GOL
        </div>
        {system.slots.map((slot) => (
          <div
            key={slot.id}
            className={styles.chip}
            style={{ left: `${slot.x}%`, bottom: `${slot.y}%` }}
            title={slotFullTitle(slot.identities)}
          >
            {slotShortLabel(slot.identities)}
          </div>
        ))}
      </div>
      <p className={styles.description}>{system.description}</p>
    </div>
  );
}
