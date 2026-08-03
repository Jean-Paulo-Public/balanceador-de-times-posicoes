// Exporta os mapinhas (formação GERAL por jogo) como PNG para compartilhar.
// Layout: times lado a lado (colunas); os 6 jogos do rodízio empilhados na
// vertical (linhas), com o banco de cada time no topo. Times sem variação
// mostram "Jogo 1 ao 6" e o resto fica preto. Ver Design v2, Seção 13.

import { buildTeamSchedule, gamesForTeamCount, type BalanceResult } from '../../engine';

const ROLE_SHORT: Record<string, string> = {
  FIXO: 'FIX', LATERAL: 'LAT', VOLANTE: 'VOL', ALA: 'ALA',
  MEIA_ATACANTE: 'MAT', SEGUNDO_ATACANTE: 'SA', PIVO: 'PIV',
};

interface Cell { x: number; y: number; label: string; role: string }

const truncate = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const drawField = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  title: string, subtitle: string, gkName: string | null, cells: Cell[],
): void => {
  const titleH = subtitle ? 28 : 17;
  ctx.fillStyle = '#cfead8';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(truncate(title, 26), x + w / 2, y + 11);
  if (subtitle) {
    ctx.fillStyle = '#ffd9a8';
    ctx.font = '8px sans-serif';
    ctx.fillText(truncate(subtitle, 44), x + w / 2, y + 22);
  }

  const fx = x;
  const fy = y + titleH;
  const fw = w;
  const fh = h - titleH;
  ctx.fillStyle = '#1f7a3d';
  ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.strokeRect(fx + 2, fy + 2, fw - 4, fh - 4);
  ctx.beginPath();
  ctx.moveTo(fx, fy + fh / 2);
  ctx.lineTo(fx + fw, fy + fh / 2);
  ctx.stroke();

  const place = (px: number, py: number, label: string, role: string, gk = false): void => {
    const cx = fx + (px / 100) * fw;
    const cy = fy + fh - (py / 100) * fh;
    const text = label.split(' ')[0];
    ctx.font = '9px sans-serif';
    const tw = ctx.measureText(text).width + 6;
    ctx.fillStyle = gk ? 'rgba(255,193,7,0.92)' : 'rgba(0,0,0,0.62)';
    ctx.fillRect(cx - tw / 2, cy - 7, tw, 12);
    ctx.fillStyle = gk ? '#111' : '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, cy + 2);
    ctx.fillStyle = '#dfe9e1';
    ctx.font = '7px sans-serif';
    ctx.fillText(role, cx, cy + 10);
  };

  if (gkName) place(50, 15, gkName, 'GOL', true);
  for (const c of cells) place(c.x, c.y, c.label, ROLE_SHORT[c.role] ?? c.role, false);
};

export const buildFieldMapsImage = async (result: BalanceResult): Promise<Blob> => {
  const teams = result.teams;
  const totalGames = gamesForTeamCount(teams.length);
  const schedules = teams.map((t) => buildTeamSchedule(t, totalGames));
  // Só gera uma linha por jogo se ALGUM time varia (banco/goleiros pra revezar).
  // Se ninguém varia, gera 1 linha só ("Jogo 1 ao N") — nada de linhas de
  // células pretas. `totalGames` é 9 com 2 times e 6 com 3+ (nunca fixo em 6,
  // senão a exportação perderia os 3 jogos extras do caso de 2 times).
  const anyVariation = schedules.some((s) => !s.constant);
  const rows = anyVariation ? totalGames : 1;
  const cols = teams.length;
  const cellW = 190;
  const cellH = 224;
  const headerH = 48;
  const gap = 6;
  const pad = 12;
  const W = pad * 2 + cols * cellW + (cols - 1) * gap;
  const H = pad * 2 + headerH + rows * cellH + (rows - 1) * gap;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, 0, W, H);

  // Cabeçalho: nome do time + banco.
  teams.forEach((t, c) => {
    const cx = pad + c * (cellW + gap) + cellW / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(truncate(t.name, 24), cx, pad + 16);
    ctx.fillStyle = '#93e6b0';
    ctx.font = '9px sans-serif';
    const benchTxt = t.bench.length ? 'Banco: ' + t.bench.map((b) => b.name.split(' ')[0]).join(', ') : 'Sem banco';
    ctx.fillText(truncate(benchTxt, 34), cx, pad + 32);
  });

  const first = (nm: string): string => nm.split(' ')[0];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = pad + c * (cellW + gap);
      const y = pad + headerH + r * (cellH + gap);
      const sch = schedules[c];
      let game: (typeof sch.games)[number] | null = null;
      let title = '';
      let subtitle = '';
      if (sch.constant) {
        if (r === 0) { game = sch.games[0]; title = `Jogo 1 ao ${totalGames}`; }
      } else {
        game = sch.games[r] ?? null;
        title = 'Jogo ' + (r + 1);
        if (game && r > 0) {
          const prev = sch.games[r - 1];
          const cur = game;
          const entra = prev.benchNames.filter((nm) => !cur.benchNames.includes(nm)).map(first);
          const sai = cur.benchNames.filter((nm) => !prev.benchNames.includes(nm)).map(first);
          if (sai.length || entra.length) subtitle = `Sai: ${sai.join(', ') || '—'}  Entra: ${entra.join(', ') || '—'}`;
        }
      }
      if (!game) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, cellW, cellH);
        continue;
      }
      const cells: Cell[] = game.slots.map((s) => ({
        x: s.x,
        // zaga sobe um pouco (descola do goleiro); 2º atacante recua um pouco em relação ao pivô.
        y: s.zone === 'DEF' ? s.y + 7 : s.role === 'SEGUNDO_ATACANTE' ? s.y - 8 : s.y,
        label: s.player.name,
        role: s.role,
      }));
      drawField(ctx, x, y, cellW, cellH, `${title} · ${game.formation}`, subtitle, game.goalkeeperName, cells);
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png');
  });
};
