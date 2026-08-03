// Exporta uma imagem (PNG) de um "Power Ranking" — jogadores agrupados em
// faixas de nível pra um atributo (ou nota de goleiro). Reaproveita a mesma
// abordagem de src/features/simulation/fieldMapImage.ts (canvas 2D, escala
// 2x pra nitidez, fonte sans-serif, devolve um Blob pra quem chama decidir
// como baixar/compartilhar).

import type { PowerRankingData } from './powerRanking';

const truncate = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const W = 640;
const PAD = 20;
const TITLE_H = 44;
const BAND_HEADER_H = 30;
const ROW_H = 24;
const BAND_GAP = 10;

/** Altura de uma faixa: cabeçalho + N linhas de jogador. */
const bandHeight = (band: PowerRankingData['bands'][number]): number =>
  BAND_HEADER_H + band.players.length * ROW_H;

/**
 * Constrói a imagem de um power ranking. A altura do canvas é CALCULADA a
 * partir do número de faixas e de jogadores (nunca fixa) — elenco maior gera
 * canvas mais alto, sem cortar texto nem sobrar espaço vazio.
 */
export const buildPowerRankingImage = async (data: PowerRankingData): Promise<Blob> => {
  const bandsHeight = data.bands.reduce((sum, band) => sum + bandHeight(band) + BAND_GAP, 0) - BAND_GAP;
  const H = PAD * 2 + TITLE_H + Math.max(bandsHeight, ROW_H);

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(truncate(data.title, 46), PAD, PAD + 22);
  ctx.fillStyle = '#93e6b0';
  ctx.font = '11px sans-serif';
  const totalPlayers = data.bands.reduce((n, b) => n + b.players.length, 0);
  ctx.fillText(`${totalPlayers} jogador${totalPlayers === 1 ? '' : 'es'} ativo${totalPlayers === 1 ? '' : 's'}`, PAD, PAD + 38);

  let y = PAD + TITLE_H;
  const BAND_COLORS: Record<string, string> = {
    Nenhum: '#5a6472', 'Muito baixa': '#c0563a', Baixa: '#d98a3d',
    Média: '#d6c33d', Alta: '#7fc24d', 'Muito alta': '#3fae6a', Máx: '#2f9e9e',
  };

  for (const band of data.bands) {
    const bh = bandHeight(band);
    ctx.fillStyle = BAND_COLORS[band.label] ?? '#4a6b8a';
    ctx.fillRect(PAD, y, 6, bh - 4);

    ctx.fillStyle = '#ffd9a8';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${band.label} (${band.players.length})`, PAD + 14, y + 18);

    let rowY = y + BAND_HEADER_H;
    band.players.forEach((p, i) => {
      if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(PAD + 14, rowY, W - PAD * 2 - 14, ROW_H);
      }
      ctx.fillStyle = '#e8edf0';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(truncate(p.name, 40), PAD + 20, rowY + 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(p.value), W - PAD - 10, rowY + 16);
      rowY += ROW_H;
    });

    y += bh + BAND_GAP;
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png');
  });
};

/** Nome de arquivo previsível e distinto por ranking (ex.: "power-ranking-finalizacao.png"). */
export const powerRankingFileName = (data: PowerRankingData): string => {
  const slug = data.title
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `power-ranking-${slug}.png`;
};
