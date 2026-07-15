import type { SimulationResult, Team, TeamSlotPlayer } from '../../domain/types';
import { formationLabelFor } from './rosterText';
import { floorToHalf } from '../../domain/playerAttributes';

/**
 * Desenha as propostas de times num único canvas: cada proposta é uma linha
 * (times lado a lado, com título "Proposta N" em cima), empilhadas uma embaixo
 * da outra, formando uma imagem retangular. As reservas aparecem abaixo do
 * goleiro, fora do campo, em cada campinho.
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
/** Recua o time inteiro (todas as linhas, incluindo o goleiro) alguns pixels. */
const TEAM_BACK_SHIFT = 6;

/** Título "Proposta N" acima de cada linha de propostas. */
const TITLE_HEIGHT = 26;
/** Espaço vertical entre uma proposta e a seguinte. */
const PROPOSAL_GAP = 24;

/** Área de banco (abaixo do campo). */
const BENCH_LABEL_H = 13;
const BENCH_CHIP_H = 15;
const BENCH_CHIP_GAP = 4;
const BENCH_ROW_GAP = 3;
const BENCH_TOP_PAD = 6;

const ROWS: string[] = ['ATA', 'MEI', 'DEF', 'GK'];

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const overallColorHex = (value: number): string => {
  if (value > 3.75) return cssVar('--color-primary', '#34d399');
  if (value > 2.5) return cssVar('--color-accent', '#ffb703');
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

const shortName = (name: string, max: number): string => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

const drawBadge = (ctx: CanvasRenderingContext2D, x: number, topY: number, label: string, value: number) => {
  const width = 52;
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
  ctx.fillText(`★ ${floorToHalf(value).toFixed(1)}`, x + width / 2, topY + 11 + height / 2 + 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
};

/** Quebra os chips de banco em linhas, respeitando a largura do campo. */
const layoutBenchRows = (ctx: CanvasRenderingContext2D, bench: TeamSlotPlayer[], maxWidth: number) => {
  const rows: { label: string; w: number }[][] = [];
  let row: { label: string; w: number }[] = [];
  let rowW = 0;
  ctx.font = '8px sans-serif';
  for (const bp of bench) {
    const label = shortName(bp.player.name, 12);
    const w = Math.ceil(ctx.measureText(label).width) + 12;
    if (row.length && rowW + BENCH_CHIP_GAP + w > maxWidth) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    rowW += (row.length ? BENCH_CHIP_GAP : 0) + w;
    row.push({ label, w });
  }
  if (row.length) rows.push(row);
  return rows;
};

const benchAreaHeight = (rows: { label: string; w: number }[][]): number =>
  rows.length ? BENCH_LABEL_H + rows.length * BENCH_CHIP_H + (rows.length - 1) * BENCH_ROW_GAP : 0;

const drawBench = (ctx: CanvasRenderingContext2D, x: number, topY: number, width: number, bench: TeamSlotPlayer[]) => {
  if (bench.length === 0) return;
  ctx.fillStyle = cssVar('--color-text-muted', '#9ca3af');
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('BANCO', x, topY);

  const rows = layoutBenchRows(ctx, bench, width);
  let ry = topY + BENCH_LABEL_H;
  for (const row of rows) {
    const totalW = row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * BENCH_CHIP_GAP;
    let cx = x + width / 2 - totalW / 2;
    for (const c of row) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      roundedRectPath(ctx, cx, ry, c.w, BENCH_CHIP_H, BENCH_CHIP_H / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = cssVar('--color-text-muted', '#9ca3af');
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.label, cx + c.w / 2, ry + BENCH_CHIP_H / 2 + 1);
      cx += c.w + BENCH_CHIP_GAP;
    }
    ry += BENCH_CHIP_H + BENCH_ROW_GAP;
  }
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

  const badgeWidth = 52;
  const badgeX = x + PITCH_WIDTH - badgeWidth;
  drawBadge(ctx, badgeX, y, 'OVERALL', team.overall);

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
    const rowCenterY = rowsAreaTop + rowHeight * idx + rowHeight / 2 + TEAM_BACK_SHIFT;
    const playersInRow = team.players.filter(tp => tp.roleShort === role);
    if (playersInRow.length === 0) return;

    const chipWidth = Math.min(66, (PITCH_WIDTH - 20) / playersInRow.length - CHIP_GAP);
    const totalWidth = playersInRow.length * chipWidth + (playersInRow.length - 1) * CHIP_GAP;
    let chipX = x + PITCH_WIDTH / 2 - totalWidth / 2;

    playersInRow.forEach(tp => {
      const chipY = rowCenterY - CHIP_HEIGHT / 2;

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
      ctx.fillText(shortName(tp.player.name, 11), chipX + chipWidth / 2, chipY + CHIP_HEIGHT / 2 + 1);

      chipX += chipWidth + CHIP_GAP;
    });
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
};

/** Gera um PNG com as propostas de times empilhadas, pronto pra compartilhar/baixar. */
export const buildFieldMapsImage = (proposals: SimulationResult[]): Promise<Blob> => {
  const valid = proposals.filter(p => p.teams.length > 0);
  if (valid.length === 0) return Promise.reject(new Error('Nenhuma proposta para exportar.'));

  const numTeams = Math.max(...valid.map(p => p.teams.length));
  const totalWidth = PADDING * 2 + numTeams * PITCH_WIDTH + (numTeams - 1) * GAP;

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) return Promise.reject(new Error('Canvas 2D não suportado neste navegador.'));

  const benchHeights = valid.map(p =>
    Math.max(0, ...p.teams.map(t => benchAreaHeight(layoutBenchRows(measureCtx, t.bench, PITCH_WIDTH))))
  );
  const proposalHeights = valid.map((_, i) =>
    TITLE_HEIGHT + HEADER_HEIGHT + PITCH_HEIGHT + (benchHeights[i] > 0 ? BENCH_TOP_PAD + benchHeights[i] : 0)
  );
  const totalHeight =
    PADDING * 2 + proposalHeights.reduce((a, b) => a + b, 0) + PROPOSAL_GAP * Math.max(0, valid.length - 1);

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth * EXPORT_SCALE;
  canvas.height = totalHeight * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D não suportado neste navegador.'));
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);

  ctx.fillStyle = cssVar('--color-surface', '#111827');
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  let cursorY = PADDING;
  valid.forEach((proposal, i) => {
    ctx.fillStyle = cssVar('--color-primary', '#34d399');
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(proposal.title ?? `Proposta ${i + 1}`, PADDING, cursorY);

    const teamsTop = cursorY + TITLE_HEIGHT;
    proposal.teams.forEach((team, t) => {
      const x = PADDING + t * (PITCH_WIDTH + GAP);
      drawTeamPitch(ctx, x, teamsTop, team);
      if (team.bench.length > 0) {
        drawBench(ctx, x, teamsTop + HEADER_HEIGHT + PITCH_HEIGHT + BENCH_TOP_PAD, PITCH_WIDTH, team.bench);
      }
    });

    cursorY += proposalHeights[i] + PROPOSAL_GAP;
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao gerar a imagem das propostas.'));
    }, 'image/png');
  });
};
