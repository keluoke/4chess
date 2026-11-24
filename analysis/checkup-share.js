import { t, getLang } from './i18n.js?v=20261124-checkup-cards';
import { drawShareBoard, parseFenBoard, parseUciSquares, prepareShareBoards, readStudioShareBoard } from './share-card.js?v=20261124-checkup-cards';
import { summarizeCheckupOverview } from './checkup-insights.js?v=20261124-checkup-cards';
import { CHECKUP_CLOSE_LOG_GAP } from './checkup-fit.js?v=20261124-checkup-cards';
import { checkupChallengeUrl } from './challenge-link.js?v=20261124-checkup-cards';
import {
  checkupFitBandLabel, checkupFitScope, checkupFitStatusLabel, checkupRatingLine, checkupScoreSummary
} from './checkup-fit-view.js?v=20261124-checkup-cards';
import { checkupPercent, overviewSummary } from './checkup-overview.js?v=20261124-checkup-cards';
import { canvasPng, CHECKUP_URL, copyPng, downloadPng, drawShareQr, shareQr, showCopyField } from './share-export.js?v=20261124-checkup-cards';

const outcomes = ['win', 'draw', 'loss'];
const tones = ['#167b58', '#657a73', '#b95755'];
const score = record => checkupPercent(record.points, record.count);
const byId = id => document.getElementById(id);
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

export function checkupChallengeCard(trap) {
  const url = checkupChallengeUrl(trap, getLang());
  if (!url) return null;
  const { turn } = parseFenBoard(trap.fenBefore);
  return {
    kind: 'challenge', title: t('checkupChallengeCard'), url,
    story: t(turn === 'w' ? 'checkupChallengeWhite' : 'checkupChallengeBlack'),
    position: { fen: trap.fenBefore, best: trap.bestUci || trap.verifiedBestUci,
      played: trap.playedUci || trap.uci, bestSan: trap.bestSan }
  };
}

export function checkupCardData({ report, speedLabel = value => value, challenge, overview } = {}) {
  if (!report) return { kind: 'profile', title: t('checkupShareProfileTitle'), name: overview.name, overview };
  const intuition = report.intuition || report;
  const { metrics, story } = checkupScoreSummary(report);
  const fit = intuition.fit;
  return {
    kind: 'profile', title: t('checkupShareProfileTitle'), name: report.playerName,
    band: checkupFitBandLabel(intuition),
    rating: checkupRatingLine(intuition, speedLabel),
    fitScope: intuition.isFitWindow ? checkupFitScope(intuition, speedLabel) : '',
    scope: t(report.gameCount === 1 ? 'checkupShareOneGame' : 'checkupOverviewGameCount', { count: report.gameCount }),
    fitStatus: fit?.status === 'limited' ? checkupFitStatusLabel(fit) : '',
    weights: fit?.weights || [],
    lead: fit?.bands && fit.logLead >= CHECKUP_CLOSE_LOG_GAP ? fit.bands.indexOf(intuition.closestElo) : -1,
    metrics, story, challenge
  };
}

function wdl(record) {
  return outcomes.map(kind => t('checkupOutcome_' + kind, { count: record[kind] })).join('  ·  ');
}

function color(side) {
  return t(side === 'w' ? 'checkupColorWhite' : 'checkupColorBlack');
}

export function summarizeCheckupCard(data, anonymous) {
  if (data.kind === 'challenge') return [data.title, data.story, data.url].join('\n');
  const name = !anonymous && data.name ? ' · ' + data.name : '';
  if (data.overview) {
    return [scoreLine(data.overview) + name, [data.overview.scope, wdl(data.overview.total), data.overview.summary]
      .filter(Boolean).join(' · '), CHECKUP_URL].join('\n');
  }
  const headline = data.band ? `${t('checkupSummaryIntuition')} ${data.band}*` : t('checkupNoEloFit');
  const facts = [data.rating, data.scope, ...data.metrics.map(({ label, value }) => `${label} ${value}`), data.fitScope, data.fitStatus].filter(Boolean);
  if (data.band) facts.push(t('checkupFitFootnote'));
  return [headline + name, facts.join(' · '), CHECKUP_URL].join('\n');
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

function drawFooter(ctx, { url, label, subtitle = '4chess.cc', width, height, pad, portrait }) {
  const size = portrait ? 128 : 92;
  const y = height - size - (portrait ? 36 : 18);
  ctx.fillStyle = line;
  ctx.fillRect(pad, y - (portrait ? 16 : 4), width - 2 * pad, 1);
  drawShareQr(ctx, shareQr(url), width - pad, y, size);
  const textWidth = width - size - 2 * pad - 22;
  type(ctx, label, pad, y + (portrait ? 26 : 13), textWidth, { size: portrait ? 30 : 23, weight: 670 });
  type(ctx, subtitle, pad, y + (portrait ? 70 : 47), textWidth, { size: portrait ? 22 : 17, tone: muted });
}

function drawProfile(ctx, data, { width, height, pad, portrait, anonymous }) {
  const content = width - 2 * pad;
  const title = !anonymous && data.name ? data.name : data.title;
  const headerSize = portrait ? 27 : 19;
  type(ctx, 'Diverge', pad, portrait ? 43 : 24, 180, { size: headerSize, weight: 730, tone: green });
  ctx.textAlign = 'right';
  type(ctx, title, width - pad, portrait ? 43 : 24, content * .7, { size: headerSize, tone: muted });
  ctx.textAlign = 'left';

  if (data.overview) {
    type(ctx, score(data.overview.total), pad, portrait ? 130 : 74, content, { size: portrait ? 98 : 63, weight: 730 });
    drawOverview(ctx, data.overview, pad, portrait ? 300 : 176, content, !portrait, true);
    if (portrait) type(ctx, data.overview.summary, pad, 620, content, { size: 26, minimum: 20, tone: muted });
  } else {
    const text = data.band ? t('checkupSummaryIntuition') : t('checkupNoEloFit');
    const bandY = portrait ? 177 : 104;
    type(ctx, text, pad, portrait ? 120 : 71, content, { size: portrait ? 34 : 24, weight: 620, tone: muted });
    if (data.band) {
      const size = portrait ? 132 : 86;
      const bandWidth = content - (portrait ? 40 : 27);
      type(ctx, data.band, pad, bandY, bandWidth, { size, minimum: portrait ? 68 : 45, weight: 740 });
      // The number is the headline. The model is explained below the fit strip.
      const right = pad + Math.min(ctx.measureText(data.band).width, bandWidth);
      type(ctx, '*', right + 5, bandY + 6, portrait ? 32 : 24, { size: portrait ? 33 : 23, tone: muted });
    }
    type(ctx, [data.rating, data.fitStatus].filter(Boolean).join(' · '), pad, portrait ? 333 : 203, content, { size: portrait ? 28 : 21, minimum: 17, tone: muted });
    const insightY = portrait ? 423 : 244;
    type(ctx, data.story, pad, insightY, content, { size: portrait ? 42 : 29, minimum: portrait ? 27 : 21, weight: 680, tone: green });
    type(ctx, [data.scope, data.fitScope].filter(Boolean).join(' · '), pad, insightY + (portrait ? 66 : 43), content,
      { size: portrait ? 24 : 18, tone: muted });

    const y = portrait ? 605 : 327;
    const gap = portrait ? 16 : 10;
    const span = (content - gap * (data.metrics.length - 1)) / Math.max(1, data.metrics.length);
    data.metrics.forEach(({ value, label, detail }, index) => {
      const x = pad + (span + gap) * index;
      const inset = portrait ? 20 : 14;
      const available = span - 2 * inset;
      panel(ctx, x, y, span, portrait ? 190 : 111);
      type(ctx, label, x + inset, y + (portrait ? 23 : 12), available, { size: portrait ? 25 : 17, minimum: 15, tone: muted });
      type(ctx, value, x + inset, y + (portrait ? 65 : 40), available, { size: portrait ? 53 : 32, minimum: 18, weight: 720 });
      type(ctx, detail, x + inset, y + (portrait ? 141 : 79), available, { size: portrait ? 21 : 15, tone: muted });
    });
    if (data.weights.length) {
      const top = portrait ? 855 : 457;
      type(ctx, t('checkupFitWeights'), pad, top, content, { size: portrait ? 24 : 16, tone: muted });
      fillBar(ctx, pad, top + (portrait ? 37 : 25), content, portrait ? 17 : 9,
        data.weights.map((weight, index) => [weight, index === data.lead ? green : index % 2 ? '#93af9e' : '#b8cbbf']));
    }
    if (data.band) {
      type(ctx, t('checkupFitFootnote'), pad, portrait ? 970 : 494, content,
        { size: portrait ? 22 : 16, minimum: 15, tone: muted });
    }
  }
  drawFooter(ctx, { url: CHECKUP_URL + '&lang=' + getLang(), label: t('challengeSelfTest'), width, height, pad, portrait });
}

function drawChallenge(ctx, data, { width, height, pad, portrait, pieces, theme, spoiler }) {
  const size = portrait ? width - 2 * pad : height - 2 * pad;
  const boardY = portrait ? 201 : pad;
  const textX = portrait ? pad : pad + size + 38;
  const textWidth = width - textX - pad;
  const board = parseFenBoard(data.position.fen);
  const arrows = spoiler ? [data.position.best, data.position.played].flatMap((uci, index) => {
    const squares = parseUciSquares(uci);
    return squares ? [{ ...squares, color: index ? theme?.played || '#966033' : theme?.stockfish || '#2e6086' }] : [];
  }) : [];
  drawShareBoard(ctx, { board, orientation: board.turn === 'b' ? 'black' : 'white', arrows, theme },
    pieces, pad, boardY, size);
  type(ctx, 'Diverge', textX, portrait ? 40 : 69, 180, { size: portrait ? 26 : 22, weight: 730, tone: green });
  type(ctx, data.title, textX, portrait ? 77 : 125, textWidth, { size: portrait ? 44 : 37, weight: 710, minimum: 26 });
  const hook = spoiler && data.position.bestSan ? t('checkupChallengeAnswer', { san: data.position.bestSan }) : data.story;
  type(ctx, hook, textX, portrait ? 142 : 199, textWidth, { size: portrait ? 28 : 23, minimum: 16, tone: muted });
  if (portrait) {
    drawFooter(ctx, { url: data.url, label: t('checkupChallengeScan'), width, height, pad, portrait });
  } else {
    type(ctx, t('checkupChallengeScan'), textX, 383, textWidth, { size: 25, weight: 630 });
    type(ctx, '4chess.cc', textX, 424, textWidth, { size: 19, tone: muted });
    drawShareQr(ctx, shareQr(data.url), textX + 111, 474, 111);
  }
}

async function drawCanvas(canvas, data, portrait, anonymous, spoiler, current) {
  const pieces = data.kind === 'challenge' ? await prepareShareBoards() : null;
  if (!current()) return false;
  const theme = pieces && readStudioShareBoard(canvas.ownerDocument.getElementById('board-container'));
  const width = portrait ? 960 : 1120, height = portrait ? 1280 : 630;
  const pad = portrait ? 56 : 42;
  canvas.width = portrait ? 1080 : 1280;
  canvas.height = portrait ? 1440 : 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  if (pieces) drawChallenge(ctx, data, { width, height, pad, portrait, pieces, theme, spoiler });
  else drawProfile(ctx, data, { width, height, pad, portrait, anonymous });
  return true;
}

export class CheckupShare {
  constructor(allowed) {
    this.allowed = allowed;
    for (const id of ['dialog', 'title', 'canvas', 'anonymous', 'spoiler', 'modes', 'image', 'png', 'text', 'link', 'field', 'status']) {
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
      this.data = this.activeData = this.blob = null;
    });
    this.anonymous.onchange = this.spoiler.onchange = () => { void this.render(); };
    for (const button of this.modes.querySelectorAll('button')) {
      button.onclick = () => {
        this.mode = button.dataset.checkupShareMode;
        void this.render();
      };
    }
    this.png.onclick = () => {
      if (this.blob && this.allowed()) downloadPng(this.blob, 'diverge-' + this.activeData.kind + '.png');
    };
    this.image.onclick = () => this.copy('image');
    this.text.onclick = () => this.copy('text');
    this.link.onclick = () => this.copy('link');
  }

  open(data) {
    if (!this.allowed() || this.dialog.open) return;
    this.data = data;
    this.mode = data.kind;
    this.anonymous.checked = true;
    this.spoiler.checked = false;
    this.format = 'portrait';
    this.dialog.showModal();
    void this.render();
  }

  async render() {
    const gen = ++this.version;
    const current = () => this.version === gen && this.dialog.open && this.allowed();
    const data = this.mode === 'challenge' ? this.data?.challenge || this.data : this.data;
    if (!current() || !data) return;
    this.activeData = data;
    const challenge = data.kind === 'challenge';
    this.title.textContent = data.title;
    this.modes.hidden = !this.data.challenge;
    this.modes.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.checkupShareMode === this.mode));
    });
    this.spoiler.closest('label').hidden = !challenge;
    this.anonymous.closest('label').hidden = challenge;
    this.link.hidden = !challenge;
    this.canvas.hidden = true;
    this.png.disabled = this.image.disabled = this.text.disabled = true;
    this.blob = null;
    this.field.hidden = true;
    for (const button of this.formats) button.setAttribute('aria-pressed', String(button.dataset.checkupShareFormat === this.format));
    this.status.textContent = t('reviewSharePreparing');
    this.text.disabled = false;
    try {
      if (!await drawCanvas(this.canvas, data, this.format === 'portrait', this.anonymous.checked, this.spoiler.checked, current) || !current()) return;
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
    const value = kind === 'link' ? this.activeData.url : kind === 'text' && summarizeCheckupCard(this.activeData, this.anonymous.checked);
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
