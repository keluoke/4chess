import { ChessBoard } from '../engine/chess-core.js';
import { t, getLang } from './i18n.js?v=20261123-checkup-social';
import { drawShareBoard, parseFenBoard, parseUciSquares, prepareShareBoards } from './share-card.js?v=20261123-checkup-social';
import { CHECKUP_ELOS, summarizeCheckupOverview } from './checkup-insights.js?v=20261123-checkup-social';
import { checkupPercent, overviewSummary } from './checkup-overview.js?v=20261123-checkup-social';
import { canvasPng, CHECKUP_URL, copyPng, downloadPng, drawShareQr, shareQr, showCopyField } from './share-export.js?v=20261123-checkup-social';

const outcomes = ['win', 'draw', 'loss'];
const tones = ['#167b58', '#657a73', '#b95755'];
const score = record => checkupPercent(record.points, record.count);
const byId = id => document.getElementById(id);
const pct = value => (value * 100).toFixed(1) + '%';
const scoreLine = data => t(data.count === 1 ? 'checkupShareScoreOne' : 'checkupShareScoreLine',
  { count: data.count, score: score(data.total) });

function overviewOpenings(openings) {
  const rank = openings.filter(opening => opening.count >= 3)
    .sort((a, b) => b.points / b.count - a.points / a.count || b.count - a.count || a.eco.localeCompare(b.eco));
  const best = rank[0], worst = rank.at(-1);
  return [best, best && worst.points / worst.count < best.points / best.count ? worst : null].map(opening => {
    if (!opening) return null;
    const { eco, side, name, count, points } = opening;
    return { eco, side, name, count, points };
  });
}

export function overviewCardData(games, account, speed, speedLabel) {
  const result = summarizeCheckupOverview(games, speed);
  const { count, total, colors, pressure, openings } = result;
  return { kind: 'overview', title: t('checkupShareOverview'), label: t('checkupOverviewCardLabel'), name: account.username,
    scope: speedLabel, summary: overviewSummary(result), count, total, colors, pressure,
    openings: overviewOpenings(openings) };
}

export function diagnosticCardData(report, rolling, topicsFor) {
  const games = report.gameCount === 1 ? t('checkupShareOneGame') : t('checkupOverviewGameCount', { count: report.gameCount });
  const traps = report.traps || report.topTraps || [];
  const phases = Object.entries(report.phaseTraps || {}).sort((a, b) => b[1] - a[1]);
  const hits = phases.length ? phases.reduce((sum, [, n]) => sum + n, 0) : traps.length;
  const topics = new Map();
  for (const trap of report.traps || []) {
    for (const topic of topicsFor(trap)) topics.set(topic, (topics.get(topic) || 0) + 1);
  }
  const common = [...topics].sort((a, b) => b[1] - a[1])[0]?.[0];
  const theme = common ? t('checkupShareTheme', { topic: t('checkupTopic_' + common) })
    : phases[0]?.[1] ? t('checkupSharePhase', { phase: t('bankPhase_' + phases[0][0]) }) : '';
  const trap = traps.find(item => item.fenBefore && (item.bestUci || item.verifiedBestUci) && (item.playedUci || item.uci));
  const highlight = !trap && report.highlights?.find(move => move.fenBefore && move.uci);
  let position;
  if (trap) {
    position = { fen: trap.fenBefore, first: trap.bestUci || trap.verifiedBestUci,
      second: trap.playedUci || trap.uci, firstSan: trap.bestSan, secondSan: trap.playedSan, trap: true };
  } else if (highlight) {
    const board = new ChessBoard(highlight.fenBefore);
    const legal = board.getLegalMoves();
    const alternative = legal.find(move => board.moveToSan(move, legal) === highlight.evidence?.alternative);
    position = { fen: highlight.fenBefore, first: highlight.uci, second: alternative?.uci,
      firstSan: highlight.san, secondSan: highlight.evidence?.alternative };
  }
  return {
    kind: 'report', title: t('checkupShareReport'), label: t('checkupDiagnosticCardLabel'), name: report.playerName,
    scope: rolling ? t('checkupWindowCoverage', { count: report.gameCount }) : t('checkupShareBatchScope', { games }),
    sample: report.eloSampleCount, elo: report.closestElo, fit: report.eloFit || {}, position, theme,
    summary: t(hits === 1 ? 'checkupShareTrapOne' : 'checkupShareTrapSummary', { games, hits })
  };
}

function wdl(record) {
  return outcomes.map(kind => t('checkupOutcome_' + kind, { count: record[kind] })).join('  ·  ');
}

function pressureLines(pressure) {
  return [
    t('checkupShareTimeLoss', { count: pressure.timeoutLosses }),
    pressure.observed ? t('checkupShareClockShare', { value: checkupPercent(pressure.low, pressure.observed) }) : t('checkupClockUnavailable')
  ];
}

function color(side) {
  return t(side === 'w' ? 'checkupColorWhite' : 'checkupColorBlack');
}

export function summarizeCheckupCard(data, anonymous) {
  const name = !anonymous && data.name ? ' · ' + data.name : '';
  if (data.kind === 'report') {
    const fit = data.elo == null ? t('checkupNoEloFit') : t('checkupShareMaia', { elo: data.elo });
    return [fit + name, [data.scope, data.summary, data.theme].filter(Boolean).join(' · '), CHECKUP_URL].join('\n');
  }
  return [scoreLine(data) + name + ' · ' + wdl(data.total),
    data.summary || pressureLines(data.pressure).join(' · '), CHECKUP_URL].join('\n');
}

function text(ctx, value, x, y, size, color = '#17362d', weight = 600, max = 860) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.fillText(String(value), x, y, max);
}

function panel(ctx, x, y, w, h, fill = '#fbfcf7') {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();
}

function fillBar(ctx, x, y, w, height, segments) {
  ctx.fillStyle = '#dce7df';
  ctx.fillRect(x, y, w, height);
  for (const [fraction, tone] of segments) {
    if (fraction <= 0) continue;
    ctx.fillStyle = tone;
    ctx.fillRect(x, y, w * fraction, height);
    x += w * fraction;
  }
}

function drawFit(ctx, data, x, y, w, h) {
  panel(ctx, x, y, w, h);
  text(ctx, t('checkupShareFit'), x + 19, y + 14, 22);
  if (data.elo == null) {
    text(ctx, t('checkupNoEloFit'), x + 19, y + 61, 18, '#52675f', 500, w - 38);
    return;
  }
  const max = Math.max(.001, ...CHECKUP_ELOS.map(elo => data.fit[elo] || 0));
  const step = (h - 58) / 4;
  CHECKUP_ELOS.forEach((elo, index) => {
    const top = y + 49 + index * step;
    const value = data.fit[elo] || 0;
    text(ctx, elo, x + 20, top, 19);
    fillBar(ctx, x + 78, top + 7, w - 168, 9, [[value / max, elo === data.elo ? '#167b58' : '#738c7f']]);
    text(ctx, pct(value), x + w - 79, top, 18);
  });
}

function drawPosition(ctx, item, pieceImages, x, y, size) {
  const board = parseFenBoard(item.fen);
  const arrows = [item.first, item.second].map((uci, index) => {
    const squares = parseUciSquares(uci);
    return squares && { ...squares, color: index ? '#dd9b26' : '#285fb9' };
  }).filter(Boolean);
  drawShareBoard(ctx, { board, orientation: board.turn === 'b' ? 'black' : 'white', arrows }, pieceImages, x, y, size);
}

function drawDiagnostic(ctx, data, portrait, images) {
  const boxWidth = portrait ? 856 : 522;
  const y = portrait ? 128 : 109;
  text(ctx, data.elo === null || data.elo === undefined ? t('checkupNoEloFit') :
    t('checkupShareMaia', { elo: data.elo }), 52, y, portrait ? 76 : 57, '#edf4e9', 740, boxWidth);
  text(ctx, [data.scope, data.sample && t('checkupShareFitCount', { count: data.sample })].filter(Boolean).join(' · '),
    54, y + (portrait ? 104 : 75), 21, '#d4e5d7', 500, boxWidth);
  text(ctx, data.summary, 54, y + (portrait ? 143 : 112), 26, '#edf4e9', 650, boxWidth);
  if (data.theme) text(ctx, data.theme, 54, y + (portrait ? 181 : 149), 22, '#f0c281', 540, boxWidth);
  drawFit(ctx, data, 52, portrait ? 365 : 315, boxWidth, portrait ? 230 : 203);
  if (data.position) {
    const at = portrait ? { x: 62, y: 649, size: 386, tx: 484, ty: 742, w: 420 }
      : { x: 653, y: 91, size: 345, tx: 650, ty: 454, w: 325 };
    if (portrait) panel(ctx, 52, 619, 856, 456);
    drawPosition(ctx, data.position, images, at.x, at.y, at.size);
    text(ctx, t(data.position.trap ? 'checkupSharePrompt' : 'checkupHighlights'), at.tx, at.ty, 29,
      portrait ? '#17362d' : '#edf4e9', 700, at.w);
    const legend = (label, move, y, dark, light) => {
      if (move) text(ctx, label + ' · ' + move, at.tx, y, 19, portrait ? dark : light, 600, at.w);
    };
    legend('Stockfish', data.position.firstSan, at.ty + 46, '#285fb9', '#a9c5ff');
    legend(data.position.trap ? t('snapshotPlayed') : 'Maia', data.position.secondSan, at.ty + 75, '#865015', '#f0c281');
  } else if (portrait) {
    panel(ctx, 52, 619, 856, 160);
    text(ctx, data.elo == null ? t('checkupShareFit') : t('checkupShareNoPosition'), 74, 666, 27);
  }
}

function drawOverview(ctx, data, portrait) {
  const width = portrait ? 856 : 518;
  const y = portrait ? 128 : 109;
  text(ctx, scoreLine(data),
    52, y, portrait ? 63 : 47, '#edf4e9', 740, width);
  text(ctx, data.scope, 54, y + (portrait ? 96 : 67), 21, '#d4e5d7', 500, width);
  text(ctx, data.summary || pressureLines(data.pressure)[0], 54, y + (portrait ? 132 : 102), 25, '#edf4e9', 650, width);
  fillBar(ctx, 54, portrait ? 325 : 255, width - 4, 13, outcomes.map((key, i) => [data.count ? data.total[key] / data.count : 0, tones[i]]));
  text(ctx, wdl(data.total), 54, portrait ? 351 : 282, 21, '#d4e5d7', 500, width);
  const sidesY = portrait ? 423 : 333;
  const sideW = (width - 12) / 2;
  ['w', 'b'].forEach((side, index) => {
    const x = 52 + index * (sideW + 12);
    const record = data.colors[side];
    panel(ctx, x, sidesY, sideW, portrait ? 161 : 151);
    text(ctx, color(side), x + 17, sidesY + 13, 22);
    text(ctx, score(record), x + 17, sidesY + 42, 47);
    text(ctx, wdl(record), x + 17, sidesY + 103, 18, '#52675f', 560, sideW - 34);
  });
  const x = portrait ? 52 : 602;
  const sectionY = portrait ? 627 : 91;
  const w = portrait ? 856 : 465;
  panel(ctx, x, sectionY, w, portrait ? 215 : 202);
  text(ctx, t('checkupOverviewOpenings'), x + 18, sectionY + 16, 23);
  data.openings.forEach((opening, index) => {
    if (!opening) return;
    const row = sectionY + 55 + index * 62;
    text(ctx, [t(index ? 'checkupOpeningWorst' : 'checkupOpeningBest'), color(opening.side)].join(' · '),
      x + 18, row, 17, index ? '#aa4c4a' : '#146b49');
    text(ctx, [opening.eco, opening.name, score(opening)].filter(Boolean).join(' · '), x + 18, row + 23, 20, '#17362d', 650, w - 36);
  });
  if (!data.openings[0]) text(ctx, t('checkupOpeningFew'), x + 18, sectionY + 60, 20, '#52675f', 500, w - 36);
  const clockY = sectionY + (portrait ? 243 : 217);
  panel(ctx, x, clockY, w, 127);
  text(ctx, t('checkupOverviewPressure'), x + 18, clockY + 15, 23);
  pressureLines(data.pressure).forEach((line, index) => text(ctx, line, x + 18, clockY + 51 + 30 * index, 19, '#52675f', 550, w - 36));
}

async function drawCanvas(canvas, data, portrait, anonymous, current) {
  const images = data.position ? await prepareShareBoards() : null;
  if (!current()) return false;
  const width = portrait ? 960 : 1120, height = portrait ? 1280 : 630;
  canvas.width = portrait ? 1080 : 1280;
  canvas.height = portrait ? 1440 : 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.textBaseline = 'top';
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#162f2a');
  bg.addColorStop(1, '#254a40');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#dfb371';
  ctx.fillRect(52, 43, 38, 4);
  text(ctx, 'Diverge  /  ' + data.label, 52, 59, 24, '#dceadd', 650, width * .52);
  if (!anonymous && data.name) {
    ctx.textAlign = 'right';
    text(ctx, data.name, width - 52, 59, 23, '#dceadd', 550, width * .38);
    ctx.textAlign = 'left';
  }
  if (data.kind === 'report') drawDiagnostic(ctx, data, portrait, images);
  else drawOverview(ctx, data, portrait);
  const qrSize = portrait ? 132 : 85;
  const footer = height - qrSize - 25;
  drawShareQr(ctx, shareQr(CHECKUP_URL + '&lang=' + getLang()), width - 52, footer, qrSize);
  text(ctx, t('challengeSelfTest'), 52, footer + (portrait ? 31 : 29), portrait ? 23 : 20, '#edf4e9', 650, width - qrSize - 123);
  text(ctx, '4chess.cc', 52, footer + (portrait ? 64 : 55), 15, '#c7d9cb', 500);
  return true;
}

export class CheckupShare {
  constructor(allowed) {
    this.allowed = allowed;
    for (const id of ['dialog', 'title', 'canvas', 'options', 'anonymous', 'image', 'png', 'text', 'link', 'field', 'status']) {
      this[id] = byId('checkup-share-' + id);
    }
    this.version = 0;
    this.format = 'portrait';
    this.formats = [...this.dialog.querySelectorAll('[data-checkup-share-format]')];
    for (const button of this.formats) button.onclick = () => {
      this.format = button.dataset.checkupShareFormat;
      void this.render();
    };
    byId('checkup-share-close').onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => {
      if (this.dialog.open) return;
      this.version++;
      this.data = this.url = this.blob = null;
    });
    this.anonymous.onchange = () => { void this.render(); };
    this.png.onclick = () => {
      if (this.blob && this.allowed()) downloadPng(this.blob, 'diverge-' + this.data.kind + '.png');
    };
    this.image.onclick = () => this.copy('image');
    this.text.onclick = () => this.copy('text');
    this.link.onclick = () => this.copy('link');
  }

  open(data, url = null) {
    if (!this.allowed() || this.dialog.open) return;
    this.data = data;
    this.url = url;
    this.anonymous.checked = true;
    this.format = 'portrait';
    this.dialog.showModal();
    void this.render();
  }

  async render() {
    const gen = ++this.version;
    const current = () => this.version === gen && this.dialog.open && this.allowed();
    const data = this.data;
    if (!current() || !data) return;
    this.title.textContent = data.title;
    this.options.hidden = Boolean(this.url);
    this.link.hidden = !this.url;
    this.canvas.hidden = true;
    this.png.hidden = this.image.hidden = this.text.hidden = Boolean(this.url);
    this.png.disabled = this.image.disabled = this.text.disabled = true;
    this.blob = null;
    this.field.hidden = true;
    if (this.url) {
      this.field.value = this.url;
      this.field.hidden = false;
      this.status.textContent = t('challengeShareHint');
      return;
    }
    for (const button of this.formats) button.setAttribute('aria-pressed', String(button.dataset.checkupShareFormat === this.format));
    this.status.textContent = t('reviewSharePreparing');
    this.text.disabled = false;
    try {
      if (!await drawCanvas(this.canvas, data, this.format === 'portrait', this.anonymous.checked, current) || !current()) return;
      const blob = await canvasPng(this.canvas);
      if (!current() || !blob) return;
      this.blob = blob;
      this.canvas.hidden = false;
      this.png.disabled = this.image.disabled = false;
      this.status.textContent = '';
    } catch {
      if (current()) this.status.textContent = t('reviewShareError');
    }
  }

  async copy(kind) {
    const version = this.version;
    const current = () => version === this.version && this.dialog.open && this.allowed();
    if (!current() || !this.data || (kind === 'image' && !this.blob)) return;
    const value = kind === 'link' ? this.url : kind === 'text' && summarizeCheckupCard(this.data, this.anonymous.checked);
    try {
      await (kind === 'image' ? copyPng(this.blob) : navigator.clipboard.writeText(value));
      if (current()) this.status.textContent = t('shareExportCopied');
    } catch {
      if (!current()) return;
      if (kind === 'image') this.status.textContent = t('shareCardCopyUnsupported');
      else showCopyField(this.field, value);
    }
  }
}
