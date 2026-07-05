import type { TeamSlotPlayer } from '../../domain/types';

interface FieldMapProps {
  playersList: TeamSlotPlayer[];
}

const LAYOUT = [
  { area: 'GK', label: 'Goleiro', isGK: true },
  { area: 'DEF', label: 'Defesa', isGK: false },
  { area: 'MEI', label: 'Meio-campo', isGK: false },
  { area: 'ATA', label: 'Ataque', isGK: false },
];

export function FieldMap({ playersList }: FieldMapProps) {
  const hasGoalkeeper = playersList.some(p => p.roleShort === 'GK');
  const sections = hasGoalkeeper ? LAYOUT : LAYOUT.filter(s => !s.isGK);

  return (
    <div style={{ flex: '0 1 auto', width: 'max-content', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', alignItems: 'center', margin: '4px 0 0 0', padding: '0 4px' }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Posicionamento tático</span>

      <div style={{ background: 'linear-gradient(180deg, rgba(0,100,0,0.12), rgba(0,130,0,0.22))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '10px', display: 'grid', gap: '6px' }}>
        {sections.map(section => {
          const playersInSection = playersList.filter(p => p.roleShort === section.area);
          return (
            <div key={section.area} style={{ display: 'flex', flexDirection: 'column', gap: '1px', padding: '4px 8px', background: section.isGK ? 'rgba(0, 150, 255, 0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', minHeight: '32px', alignItems: 'center', textAlign: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: section.isGK ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{section.label}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {playersInSection.length > 0 ? playersInSection.map(p => p.player.name).join(', ') : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
