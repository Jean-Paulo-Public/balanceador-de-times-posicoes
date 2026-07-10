import type { Team } from '../../domain/types';
import { formationLabelFor } from './rosterText';

/**
 * Desenha os campinhos táticos de vários times lado a lado num único canvas,
 * pra poder exportar como uma imagem só (ex.: anexo no WhatsApp). Redesenha o
 * campinho manualmente em vez de "printar" o DOM — evita depender de uma lib
 * de screenshot (tipo html2canvas) só pra isso, e garante que o resultado
 * fique nítido em qualquer resolução de tela.
 */

const PITCH_WIDTH = 190;
const PITCH_HEIGHT = Math.round((PITCH_WIDTH * 4) / 3);
const HEADER_HEIGHT = 58;
const GAP = 22;
const PADDING = 18;
const STRIPE_HEIGHT = 34;
const CHIP_HEIGHT = 18;
const CHIP_GAP = 5;
const EXPORT_SCALE = 2;

const ROWS: string[] = ['ATA', 'MEI', 'DEF', 'GK'];

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const overallColorHex = (value: number): string => {
  if (value > 75) return cssVar('--color-primary', '#34d399');
  if (value > 50) return cssVar('--color-accent', '#ffb703');
  return cssVar('--color-danger', '#ef4444');
};

const roundedRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawBadge = (ctx: CanvasRenderingContext2D, x: number, topY: number, label: string, value: number) => {
  const width = 42;
  const height = 20;
  ctx.textAlign = 'center';

  ctx.fillStyle = cssVar('--color-text-muted', '#9ca3af');
  ctx.font = '8px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + width / 2, topY);

  ctx.fillStyle = overallColorHex(value);
  roundedRectPath(ctx, x, topY + 11, width, height, height / 2);
  ctx.fill();

  ctx.fillStyle = '#04170a';
  ctx.font = 'bold 11px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + width / 2, topY + 11 + height / 2 + 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
};

const drawTeamPitch = (ctx: CanvasRenderingContext2D, x: number, y: number, team: Team) => {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = cssVar('--color-primary', '#34d399');
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(team.name, x, y);

  ctx.font = '10px sans-serif';
  ctx.fillStyle = cssVar('--color-text-muted', '#9ca3af');
  ctx.fillText(formationLabelFor(team), x, y + 19);

  const badgeWidth = 42;
  const badgeGap = 6;
  const badge2X = x + PITCH_WIDTH - badgeWidth;
  const badge1X = badge2X - badgeWidth - badgeGap;
  drawBadge(ctx, badge1X, y, 'OVERALL', team.overall);
  drawBadge(ctx, badge2X, y, 'DEFESA', team.defensiveOverall);

  const pitchY = y + HEADER_HEIGHT;

  ctx.save();
  roundedRectPath(ctx, x, pitchY, PITCH_WIDTH, PITCH_HEIGHT, 10);
  ctx.clip();
  let stripeY = pitchY;
  let stripeIdx = 0;
  while (stripeY < pitchY + PITCH_HEIGHT) {
    ctx.fillStyle = stripeIdx % 2 === 0 ? '#1f7a34' : '#1c6f2f';
    ctx.fillRect(x, stripeY, PITCH_WIDTH, STRIPE_HEIGHT);
    stripeY += STRIPE_HEIGHT;
    stripeIdx++;
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  roundedRectPath(ctx, x, pitchY, PITCH_WIDTH, PITCH_HEIGHT, 10);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 6, pitchY + 6, PITCH_WIDTH - 12, PITCH_HEIGHT - 12);

  ctx.beginPath();
  ctx.moveTo(x + 6, pitchY + PITCH_HEIGHT / 2);
  ctx.lineTo(x + PITCH_WIDTH - 6, pitchY + PITCH_HEIGHT / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + PITCH_WIDTH / 2, pitchY + PITCH_HEIGHT / 2, 27, 0, Math.PI * 2);
  ctx.stroke();

  const hasGoalkeeper = team.players.some(tp => tp.roleShort === 'GK');
  const activeRows = ROWS.filter(role => role !== 'GK' || hasGoalkeeper);
  const rowPad = 14;
  const rowsAreaTop = pitchY + rowPad;
  const rowsAreaHeight = PITCH_HEIGHT - rowPad * 2;
  const rowHeight = rowsAreaHeight / activeRows.length;

  activeRows.forEach((role, idx) => {
    const rowCenterY = rowsAreaTop + rowHeight * idx + rowHeight / 2;
    const playersInRow = team.players.filter(tp => tp.roleShort === role);
    if (playersInRow.length === 0) return;

    const chipWidth = Math.min(66, (PITCH_WIDTH - 20) / playersInRow.length - CHIP_GAP);
    const totalWidth = playersInRow.length * chipWidth + (playersInRow.length - 1) * CHIP_GAP;
    let chipX = x + PITCH_WIDTH / 2 - totalWidth / 2;

    playersInRow.forEach(tp => {
      // Mesmo offset visual usado no campinho detalhado: atacante sem "facilidade
      // de pivô" aparece um pouco mais atrás na própria linha de ataque.
      const isSecondStriker = role === 'ATA' && !tp.player.pivotFriendly;
      const chipY = rowCenterY - CHIP_HEIGHT / 2 + (isSecondStriker ? 8 : 0);

      ctx.fillStyle = 'rgba(5, 7, 10, 0.72)';
      roundedRectPath(ctx, chipX, chipY, chipWidth, CHIP_HEIGHT, CHIP_HEIGHT / 2);
      ctx.fill();
      ctx.strokeStyle = role === 'GK' ? 'rgba(56, 189, 248, 0.7)' : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = role === 'GK' ? '#d3f3ff' : '#ffffff';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = tp.player.name.length > 11 ? `${tp.player.name.slice(0, 10)}…` : tp.player.name;
      ctx.fillText(name, chipX + chipWidth / 2, chipY + CHIP_HEIGHT / 2 + 1);

      chipX += chipWidth + CHIP_GAP;
    });
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
};

/** Gera um PNG com os campinhos de todos os times lado a lado, pronto pra
 * compartilhar/baixar. Rejeita se o navegador não suportar canvas 2D. */
export const buildFieldMapsImage = (teams: Team[]): Promise<Blob> => {
  const totalWidth = PADDING * 2 + teams.length * PITCH_WIDTH + (teams.length - 1) * GAP;
  const totalHeight = PADDING * 2 + HEADER_HEIGHT + PITCH_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth * EXPORT_SCALE;
  canvas.height = totalHeight * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D não suportado neste navegador.'));
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);

  ctx.fillStyle = cssVar('--color-surface', '#111827');
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  teams.forEach((team, idx) => {
    const x = PADDING + idx * (PITCH_WIDTH + GAP);
    drawTeamPitch(ctx, x, PADDING, team);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao gerar a imagem dos campinhos.'));
    }, 'image/png');
  });
};
