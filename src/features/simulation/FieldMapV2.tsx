// Mapinha posicional (modelo v3): desenha as vagas do sistema tático inferido
// usando as coordenadas x/y de cada jogador. Mostra a formação de UM JOGO do
// rodízio por vez (Fase 7) — as 4 fases de jogo (Geral/Defendendo/Pressão/
// Fase final) do modelo v2 foram REMOVIDAS e substituídas pelos 6 jogos reais
// do rodízio (goleiro e banco variam por jogo — ver docs, mini-wiki "Rodízio").

import type { BalancedSlot } from '../../engine';
import type { LinePosition } from '../../domain/positions';

const ROLE_SHORT: Record<LinePosition, string> = {
  FIXO: 'FIX', LATERAL: 'LAT', VOLANTE: 'VOL', ALA: 'ALA',
  MEIA_ATACANTE: 'MA', SEGUNDO_ATACANTE: 'SA', PIVO: 'PIV',
};

function Chip({ x, y, label, role, gk = false }: { x: number; y: number; label: string; role: string; gk?: boolean }) {
  const first = label.split(' ')[0];
  return (
    <div style={{ position: 'absolute', left: `${x}%`, bottom: `${y}%`, transform: 'translate(-50%, 50%)', textAlign: 'center', pointerEvents: 'none' }}>
      <div
        title={label}
        style={{
          background: gk ? 'rgba(255,193,7,0.85)' : 'rgba(0,0,0,0.6)',
          color: gk ? '#1a1a1a' : '#fff',
          fontSize: '0.62rem', fontWeight: 600, padding: '1px 5px', borderRadius: 7,
          whiteSpace: 'nowrap', maxWidth: 74, overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {first}
      </div>
      <div style={{ fontSize: '0.52rem', color: '#e6ffee', marginTop: 1 }}>{role}</div>
    </div>
  );
}

interface FieldMapV2Props {
  slots: BalancedSlot[];
  goalkeeperName?: string | null;
  /** Rótulo mostrado acima do campinho — ex.: "Jogo 1", "Jogo 1 ao 6". */
  label: string;
}

export function FieldMapV2({ slots, goalkeeperName, label }: FieldMapV2Props) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 120, maxWidth: 190 }}>
      <div style={{ fontSize: '0.72rem', textAlign: 'center', marginBottom: 4, color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div
        style={{
          // 160% (era 128%): campo mais alto pra afastar os chips na vertical —
          // com 128% a defesa e o goleiro ficavam amontoados um sobre o outro.
          position: 'relative', width: '100%', paddingBottom: '160%', borderRadius: 8,
          background: 'linear-gradient(to top, #1d7a3d, #2fa159)',
          border: '1px solid rgba(255,255,255,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(255,255,255,0.25)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.22)' }} />
        {goalkeeperName && <Chip x={50} y={11} label={goalkeeperName} role="GOL" gk />}
        {slots.map((s, i) => (
          <Chip key={i} x={s.x} y={s.y + 6} label={s.player.name} role={ROLE_SHORT[s.role] ?? s.role} />
        ))}
      </div>
    </div>
  );
}
