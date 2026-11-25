import { buildShareCardSpec, drawShareBoard, prepareShareBoards, wrapTextLines } from '../analysis/share-card.js?v=20261125-live-poster';
import { drawShareQr, shareQr } from '../analysis/share-export.js?v=20261124-divergence-cards';
import { RATINGS, TREND_TICKS, trendX, trendY } from '../analysis/maia-trend-geometry.js';

const WIDTH = 1080;
const HEIGHT = 1560;
const ink = '#193129';
const muted = '#5b665e';
const paper = '#fffef8';
const theme = {
  light: '#e9ede0', dark: '#91ab94', frame: paper, coordinate: '#244134',
  stockfish: '#276a4b', maia: '#996119', played: '#a9453f'
};

function box(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function label(ctx, text, x, y, size, weight = 500, color = ink, width) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  if (width === undefined) ctx.fillText(text, x, y);
  else ctx.fillText(text, x, y, width);
}

function drawLegend(ctx, lines) {
  let x = 86;
  for (const { text, role } of lines) {
    const color = role === 'sf' ? theme.stockfish : theme.maia;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 6, 1011, 6, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, text, x + 20, 998, 23, 650, color, 407);
    x += 455;
  }
}

function drawChart(ctx, poster) {
  box(ctx, 62, 1044, 956, 286, 21, '#f4f5ee');
  label(ctx, poster.chartTitle, 88, 1062, 28, 750, 430);
  ctx.textAlign = 'right';
  label(ctx, poster.chartNote, 990, 1069, 19, 550, muted, 450);
  ctx.textAlign = 'left';
  const x = elo => 170 + (trendX(elo) - trendX(600)) * 2.03;
  const y = probability => 1122 + (trendY(probability) - trendY(100)) * 1.35;
  ctx.strokeStyle = '#d4dfd2';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 7]);
  for (const tick of TREND_TICKS) {
    ctx.beginPath();
    ctx.moveTo(x(600), y(tick));
    ctx.lineTo(x(2600), y(tick));
    ctx.stroke();
    label(ctx, tick + '%', 92, y(tick) - 9, 17, 550, muted);
  }
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  for (const elo of RATINGS) label(ctx, String(elo), x(elo), 1296, 17, 550, muted);
  const groups = poster.series.map(({ role, uci }) => ({
    color: role === 'sf' ? theme.stockfish : theme.maia,
    points: RATINGS.map(elo => {
      const probability = poster.samples.get(elo).get(uci);
      return { x: x(elo), y: y(probability), probability };
    })
  }));
  for (const { color, points } of groups) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1], next = points[i];
      const middle = (previous.x + next.x) / 2;
      ctx.bezierCurveTo(middle, previous.y, middle, next.y, next.x, next.y);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const index of [0, RATINGS.length - 1]) {
    const ends = groups.map(group => ({ ...group.points[index], color: group.color })).sort((a, b) => b.y - a.y);
    ends.forEach((point, i) => {
      const collision = i > 0 && ends[0].y - point.y < 23;
      label(ctx, point.probability.toFixed(1) + '%', point.x, point.y - (collision ? 39 : 24), 17, 750, point.color);
    });
  }
  ctx.textAlign = 'left';
  if (poster.blind) {
    const point = groups[0].points[2];
    const noteX = point.x - 64;
    const preferredY = point.y - 51;
    ctx.font = '700 17px system-ui, sans-serif';
    const noteWidth = Math.min(260, ctx.measureText(poster.blindNote).width);
    // Each cubic segment stays within its endpoints' height range.
    const spans = groups.flatMap(({ points }) => points.slice(1).flatMap((right, index) => {
      const left = points[index];
      if (right.x < noteX - 6 || left.x > noteX + noteWidth + 6) return [];
      return [{ top: Math.min(left.y, right.y), bottom: Math.max(left.y, right.y) }];
    }));
    const overlaps = spans.some(({ top, bottom }) => top < preferredY + 23 && bottom > preferredY - 6);
    const noteY = overlaps ? Math.min(...spans.map(span => span.top)) - 26 : preferredY;
    ctx.strokeStyle = theme.stockfish;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - 7);
    ctx.lineTo(point.x, Math.max(point.y - 28, noteY + 23));
    ctx.stroke();
    label(ctx, poster.blindNote, noteX, noteY, 17, 700, theme.stockfish, 260);
  }
}

export async function renderLivePoster(canvas, poster, current) {
  const pieces = await prepareShareBoards();
  if (!current()) return false;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f5f4ee';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  box(ctx, 22, 22, WIDTH - 44, HEIGHT - 44, 28, paper);
  label(ctx, poster.event, 73, 61, 24, 650, muted, poster.badge ? 706 : 925);
  if (poster.badge) {
    ctx.font = '750 20px system-ui, sans-serif';
    const badgeWidth = Math.min(216, ctx.measureText(poster.badge).width + 34);
    box(ctx, 1006 - badgeWidth, 53, badgeWidth, 38, 19, poster.blind ? '#f5dfc5' : '#e7eee1');
    label(ctx, poster.badge, 1022 - badgeWidth, 61, 20, 750, poster.blind ? '#883f25' : theme.stockfish, badgeWidth - 32);
  }
  let headlineSize = 55;
  ctx.font = `770 ${headlineSize}px system-ui, sans-serif`;
  let lines = wrapTextLines(ctx, poster.headline, 934);
  while (lines.length > 2 && headlineSize > 34) {
    headlineSize -= 3;
    ctx.font = `770 ${headlineSize}px system-ui, sans-serif`;
    lines = wrapTextLines(ctx, poster.headline, 934);
  }
  const headlineTop = lines.length > 1 ? 103 : 126;
  lines.slice(0, 2).forEach((text, i) => label(ctx, text, 72, headlineTop + i * (headlineSize + 6), headlineSize, 770, ink, 934));
  label(ctx, poster.subtitle, 74, lines.length > 1 ? 226 : 203, 23, 550, muted, 930);

  const size = 716, x = (WIDTH - size) / 2, y = 266;
  ctx.save();
  ctx.shadowColor = '#223e3830';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 11;
  box(ctx, x - 4, y - 4, size + 8, size + 8, 24, paper);
  ctx.restore();
  const spec = buildShareCardSpec(poster.move, { lang: poster.lang, orientation: poster.orientation, theme });
  drawShareBoard(ctx, spec, pieces, x, y, size);
  drawLegend(ctx, poster.legend);
  drawChart(ctx, poster);

  ctx.strokeStyle = '#e1e6da';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 1360);
  ctx.lineTo(1008, 1360);
  ctx.stroke();
  label(ctx, '4chess.cc/live', 73, 1391, 44, 780, theme.stockfish);
  label(ctx, poster.scan, 74, 1447, 23, 650, ink, 710);
  label(ctx, 'Lichess Broadcast', 74, 1490, 21, 550, muted);
  drawShareQr(ctx, shareQr(poster.link), 1008, 1376, 154);
  return true;
}
