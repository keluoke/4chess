import { ChessBoard } from '../engine/chess-core.js';
import { t, getLang } from './i18n.js?v=20261123-fit-report-zh';
import { drawShareBoard, parseFenBoard, parseUciSquares, prepareShareBoards, readStudioShareBoard } from './share-card.js?v=20261123-fit-report-zh';
import { summarizeCheckupOverview } from './checkup-insights.js?v=20261123-fit-report-zh';
import { CHECKUP_CLOSE_LOG_GAP, checkupFitBands } from './checkup-fit.js?v=20261123-fit-report-zh';
import {
  checkupFitBandLabel, checkupFitHeadline, checkupFitScope, checkupFitStatusLabel, densityText, lowClockRate
} from './checkup-fit-view.js?v=20261123-fit-report-zh';
import { checkupPercent, overviewSummary } from './checkup-overview.js?v=20261123-fit-report-zh';
import { canvasPng, CHECKUP_URL, copyPng, downloadPng, drawShareQr, shareQr, showCopyField } from './share-export.js?v=20261123-fit-report-zh';

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
  return { name: account.username, scope: speedLabel, summary: overviewSummary(result), count, total, colors, pressure,
    openings: overviewOpenings(openings) };
}

function reportCardData(report, rolling, topicsFor, speedLabel) {
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
  const intuition = report.intuition || report;
  const stability = report.stability;
  const rate = lowClockRate(stability);
  const pressure = rate ? t('checkupStabilityClockShare', { ...stability, rate }) : '';
  const density = stability?.density == null ? ''
    : stability.hits ? t('checkupStabilityShare', { value: densityText(stability.density) }) : t('checkupStabilityNoTraps');
  return {
    name: report.playerName,
    scope: rolling ? t('checkupWindowCoverage', { count: report.gameCount }) : t('checkupShareBatchScope', { games }),
    fitScope: intuition.isFitWindow ? checkupFitScope(intuition, speedLabel) : '',
    sample: intuition.eloSampleCount, elo: intuition.closestElo, position, theme,
    clearLead: !intuition.fit || intuition.fit.logLead >= CHECKUP_CLOSE_LOG_GAP,
    bands: intuition.fit?.bands || checkupFitBands(intuition.fitMethod),
    fit: intuition.fit?.weights || intuition.eloFit || {}, relativeFit: Boolean(intuition.fit),
    headline: checkupFitHeadline(intuition),
    fitStatus: checkupFitStatusLabel(intuition.fit),
    bandLabel: checkupFitBandLabel(intuition),
    density, pressure,
    summary: t(hits === 1 ? 'checkupShareTrapOne' : 'checkupShareTrapSummary', { games, hits })
  };
}

export function checkupCardData({ report, rolling = false, topicsFor = () => [], speedLabel = value => value,
  overview, notice = '' } = {}) {
  return {
    ...(report ? reportCardData(report, rolling, topicsFor, speedLabel) : { name: overview?.name }),
    kind: 'profile', title: t('checkupShareProfileTitle'), overview, notice
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
  const overview = data.overview;
  const name = !anonymous && data.name ? ' · ' + data.name : '';
  const first = data.headline ? [data.headline + name, data.fitScope, data.fitStatus].filter(Boolean).join(' · ')
    : scoreLine(overview) + name;
  const stats = overview && [data.headline && scoreLine(overview), overview.scope, wdl(overview.total), overview.summary]
    .filter(Boolean).join(' · ');
  const second = [data.scope, data.density || data.summary, data.pressure || (!overview && data.theme), stats]
    .filter(Boolean).join(' · ');
  return [first, second, CHECKUP_URL].join('\n');
}

const ink = '#192e23', muted = '#4d6355', green = '#146b49', line = '#d6e2d8', paper = '#eef3ed';
const font = 'Inter, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

function type(ctx, value, x, y, width, { size = 22, weight = 500, tone = ink, minimum = size } = {}) {
  if (!value) return;
  let label = String(value);
  ctx.fillStyle = tone;
  ctx.font = `${weight} ${size}px ${font}`;
  while (ctx.measureText(label).width > width && size > minimum) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${font}`;
  }
  if (ctx.measureText(label).width > width) {
    const chars = Array.from(label);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
    label = chars.join('').trimEnd() + '…';
  }
  ctx.fillText(label, x, y);
}

function panel(ctx, x, y, w, h, fill = '#ffffff') {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();
}

function fillBar(ctx, x, y, w, height, segments) {
  panel(ctx, x, y, w, height, '#dae5dc');
  ctx.save();
  ctx.clip();
  for (const [fraction, tone] of segments) {
    if (fraction <= 0) continue;
    ctx.fillStyle = tone;
    ctx.fillRect(x, y, w * fraction, height);
    x += w * fraction;
  }
  ctx.restore();
}

function drawFit(ctx, data, x, y, width, portrait, full = false) {
  const height = full ? 275 : portrait ? 218 : 178;
  panel(ctx, x, y, width, height);
  type(ctx, t(data.relativeFit ? 'checkupFitWeights' : 'checkupShareLegacyFit'), x + 19, y + 15, width - 38,
    { size: portrait ? 22 : 18, weight: 650 });
  const max = data.relativeFit ? 1 : Math.max(.001, ...data.bands.map(elo => data.fit[elo] || 0));
  const step = (height - 53) / data.bands.length;
  data.bands.forEach((elo, index) => {
    const top = y + 48 + index * step;
    const value = (data.relativeFit ? data.fit[index] : data.fit[elo]) || 0;
    type(ctx, elo, x + 20, top, 58, { size: 16, weight: 620 });
    fillBar(ctx, x + 74, top + 6, width - 163, 7, [[value / max, data.clearLead && elo === data.elo ? green : '#798e80']]);
    ctx.textAlign = 'right';
    type(ctx, pct(value), x + width - 20, top, 65, { size: 16, weight: 620 });
    ctx.textAlign = 'left';
  });
  return height;
}

function drawPosition(ctx, item, pieces, theme, x, y, width, size, portrait, wide) {
  const padding = portrait ? 20 : 13;
  const board = parseFenBoard(item.fen);
  const label = t(item.trap ? 'checkupSharePrompt' : 'checkupHighlights');
  const colors = [theme?.stockfish || '#2e6086', (item.trap ? theme?.played : theme?.maia) || '#966033'];
  const arrows = [item.first, item.second].flatMap((uci, index) => {
    const squares = parseUciSquares(uci);
    return squares ? [{ ...squares, color: colors[index] }] : [];
  });
  panel(ctx, x, y, width, size + (wide ? 48 : portrait ? 126 : 94));
  const top = y + (wide ? 24 : portrait ? 60 : 44);
  const left = wide ? x + 24 : x + (width - size) / 2;
  drawShareBoard(ctx, { board, orientation: board.turn === 'b' ? 'black' : 'white', arrows, theme }, pieces, left, top, size);
  const names = ['Stockfish', item.trap ? t('snapshotPlayed') : 'Maia'];
  const moves = [item.firstSan, item.secondSan];
  if (wide) {
    const right = left + size + 36;
    const available = x + width - right - 24;
    type(ctx, label, right, y + 83, available, { size: 27, weight: 680, minimum: 20 });
    moves.forEach((move, i) => {
      if (!move) return;
      const row = y + 154 + i * 119;
      panel(ctx, right, row + 6, 10, 10, colors[i]);
      type(ctx, names[i], right + 19, row, available - 19, { size: 20, weight: 620, tone: muted });
      type(ctx, move, right, row + 31, available, { size: 43, weight: 680 });
    });
    return;
  }
  type(ctx, label, x + padding, y + padding, width - 2 * padding, { size: portrait ? 23 : 18, weight: 650 });
  moves.forEach((move, i) => {
    if (!move) return;
    const row = top + size + 12 + i * (portrait ? 24 : 18);
    panel(ctx, x + padding, row + 4, 8, 8, colors[i]);
    type(ctx, names[i] + '  ' + move, x + padding + 16, row, width - 2 * padding - 16,
      { size: portrait ? 17 : 14, weight: 600 });
  });
}

function drawStability(ctx, data, x, y, width, portrait) {
  const p = portrait ? 20 : 16;
  const column = width - 2 * p;
  const size = portrait ? 22 : 16;
  panel(ctx, x, y, width, portrait ? 160 : 117);
  type(ctx, t('checkupStabilityTitle'), x + p, y + 13, column, { size, weight: 680 });
  type(ctx, data.density || data.summary, x + p, y + (portrait ? 51 : 42), column,
    { size: portrait ? 23 : 18, weight: 650, minimum: portrait ? 18 : 14, tone: green });
  type(ctx, data.scope, x + p, y + (portrait ? 89 : 67), column, { size: portrait ? 17 : 14, tone: muted });
  type(ctx, data.pressure || data.theme, x + p, y + (portrait ? 117 : 88), column,
    { size: portrait ? 17 : 14, tone: muted });
}

function drawOverview(ctx, data, x, y, width, landscape, standalone) {
  const small = landscape ? 16 : 19;
  const extra = standalone ? 36 : 0;
  const p = 20;
  panel(ctx, x, y, width, landscape ? 306 : 199 + extra + (standalone ? 35 : 0));
  const column = width - 2 * p;
  const split = landscape ? 0 : Math.min(360, width * .42);
  type(ctx, t('checkupOverviewRecord'), x + p, y + 18, column, { size: small + 2, weight: 650, tone: green });
  type(ctx, scoreLine(data), x + p, y + 46, column - split, { size: standalone ? 47 : landscape ? 29 : 35, minimum: 23, weight: 700 });
  type(ctx, data.scope, x + p, y + 89 + extra, column - split, { size: small, tone: muted });
  fillBar(ctx, x + p, y + 121 + extra, column - split, 9,
    outcomes.map((key, i) => [data.count ? data.total[key] / data.count : 0, tones[i]]));
  type(ctx, wdl(data.total), x + p, y + 141 + extra, column - split, { size: small, tone: muted });
  const between = x + width - p - split;
  ['w', 'b'].forEach((side, index) => {
    const start = landscape ? x + p + index * column / 2 : between + index * split / 2 + 20;
    const top = y + (landscape ? 172 : 45 + extra / 2);
    type(ctx, color(side), start, top, landscape ? column / 2 : split / 2 - 14, { size: small, tone: muted });
    type(ctx, data.colors[side]?.count ? score(data.colors[side]) : t('checkupShareNoGamesSide'),
      start, top + 22, landscape ? column / 2 : split / 2 - 14,
      { size: 27, weight: 690, minimum: 17 });
  });
  const featured = data.openings[0];
  const left = landscape ? x + p : between + 20;
  const available = landscape ? column : split - 20;
  if (featured) {
    type(ctx, [t('checkupOpeningBest'), featured.eco, featured.name].filter(Boolean).join(' · '),
      left, y + (landscape ? 237 : 111 + extra), available, { size: small - 1 });
  }
  const pressure = data.pressure;
  if (pressure.observed || pressure.timeoutLosses) {
    const parts = [pressure.timeoutLosses && t('checkupShareTimeLoss', { count: pressure.timeoutLosses }),
      pressure.observed && t('checkupShareClockShare', { value: checkupPercent(pressure.low, pressure.observed) })];
    type(ctx, parts.filter(Boolean).join(' · '), left, y + (landscape ? 265 : 146 + extra), available,
      { size: small - 1, tone: muted });
  }
}

function drawProfileHeader(ctx, data, portrait, width, pad, anonymous) {
  const right = width - pad;
  const glow = ctx.createLinearGradient(0, 0, width, portrait ? 280 : 195);
  glow.addColorStop(0, '#dce9df');
  glow.addColorStop(1, paper);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, portrait ? 290 : 199);
  type(ctx, 'Diverge', pad, portrait ? 47 : 29, 140, { size: portrait ? 27 : 24, weight: 760, tone: green });
  ctx.textAlign = 'right';
  type(ctx, !anonymous && data.name ? data.name : t('checkupShareProfileTitle'), right, portrait ? 50 : 32, width * .47,
    { size: portrait ? 23 : 19, weight: 620, tone: muted });
  ctx.textAlign = 'left';
  ctx.fillStyle = line;
  ctx.fillRect(pad, portrait ? 90 : 66, width - 2 * pad, 1);
  const label = data.headline ? t('checkupShareMoveProfile') : t('checkupOverviewRecord');
  type(ctx, label, pad, portrait ? 121 : 83, 380, { size: portrait ? 26 : 21, weight: 630, tone: muted });
  const title = data.headline ? data.bandLabel || t('checkupShareFitPending') : score(data.overview.total);
  type(ctx, title, pad, portrait ? 150 : 105, width - 2 * pad,
    { size: portrait ? 83 : 59, weight: 710, minimum: portrait ? 50 : 38 });
  const meta = data.headline ? [data.fitScope || data.scope, data.fitStatus,
    data.sample && t('checkupShareFitCount', { count: data.sample })] : [data.overview.scope, scoreLine(data.overview)];
  type(ctx, meta.filter(Boolean).join(' · '), pad, portrait ? 245 : 170, width - 2 * pad,
    { size: portrait ? 22 : 18, weight: 540, tone: muted });
}

async function drawCanvas(canvas, data, portrait, anonymous, current) {
  const pieces = data.position ? await prepareShareBoards() : null;
  if (!current()) return false;
  const theme = pieces && readStudioShareBoard(canvas.ownerDocument.getElementById('board-container'));
  const width = portrait ? 960 : 1120, height = portrait ? 1280 : 630;
  const pad = portrait ? 52 : 42;
  const content = width - 2 * pad;
  canvas.width = portrait ? 1080 : 1280;
  canvas.height = portrait ? 1440 : 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  drawProfileHeader(ctx, data, portrait, width, pad, anonymous);

  const y = portrait ? 308 : 209, gap = portrait ? 22 : 16;
  const showPosition = Boolean(data.position && pieces);
  const side = portrait ? (content - gap) / 2 : 282;
  const detailX = showPosition ? pad + side + gap : pad;
  const full = portrait && !showPosition;
  const detailWidth = portrait ? (full ? content : side)
    : (data.overview && data.headline ? 336 : width - pad - detailX);
  const wideBoard = portrait && showPosition && !data.overview;
  if (wideBoard) {
    drawPosition(ctx, data.position, pieces, theme, pad, y, content, 462, true, true);
    if (data.elo != null) drawFit(ctx, data, pad, y + 510 + gap, side, true);
    drawStability(ctx, data, data.elo != null ? pad + side + gap : pad, y + 510 + gap,
      data.elo != null ? side : content, true);
  } else if (showPosition) {
    drawPosition(ctx, data.position, pieces, theme, pad, y, side, side - (portrait ? 44 : 66), portrait, false);
  }
  let contentBottom = y;
  if (data.headline && !wideBoard) {
    const fitHeight = data.elo != null ? drawFit(ctx, data, detailX, y, detailWidth, portrait, full) : 0;
    const stabilityY = fitHeight ? y + fitHeight + gap : y;
    drawStability(ctx, data, detailX, stabilityY, detailWidth, portrait);
    contentBottom = stabilityY + (portrait ? 160 : 117);
  }
  if (data.overview) {
    const overviewX = portrait || !data.headline ? pad : detailX + detailWidth + gap;
    const overviewY = portrait ? (showPosition ? 850 : data.headline ? contentBottom + gap : 360) : y;
    drawOverview(ctx, data.overview, overviewX, overviewY, width - pad - overviewX,
      !portrait && !!data.headline, !data.headline);
  }

  const qrSize = portrait ? 106 : 86;
  const qrY = height - qrSize - (portrait ? 34 : 8);
  ctx.fillStyle = line;
  ctx.fillRect(pad, qrY - 14, content, 1);
  drawShareQr(ctx, shareQr(CHECKUP_URL + '&lang=' + getLang()), width - pad - qrSize, qrY, qrSize);
  type(ctx, t('challengeSelfTest'), pad, qrY + (portrait ? 22 : 12), content - qrSize - 16,
    { size: portrait ? 23 : 18, weight: 650 });
  type(ctx, '4chess.cc', pad, qrY + (portrait ? 59 : 40), content - qrSize - 16,
    { size: portrait ? 19 : 15, tone: muted });
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
      this.status.textContent = data.notice || '';
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
