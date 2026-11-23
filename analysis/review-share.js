import { t, getLang } from './i18n.js?v=20261123-checkup-challenge';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { parseFenBoard, parseUciSquares, drawShareBoard, prepareShareBoards } from './share-card.js?v=20261123-checkup-challenge';
import { encodeReviewSnapshot, makeReviewSnapshot, publicGameLink, restoreReviewSnapshot } from './review-snapshot.js?v=20261123-checkup-challenge';
import { canvasPng, copyPng, downloadPng, drawShareQr, shareQr, showCopyField } from './share-export.js?v=20261123-checkup-challenge';

const VIEWER = 'https://4chess.cc/analysis/shared.html';
const byId = id => document.getElementById(id);
const scoreLabel = value => value === null ? '—' : value.toFixed(1) + '%';
const fit = (ctx, text, x, y, width = 952) => ctx.fillText(text, x, y, width);

function qrSpec(snapshotUrl, source) {
  // Keep ample pixels per module after chat apps resize the report image.
  const target = snapshotUrl && snapshotUrl.length <= 230 ? snapshotUrl : source;
  if (!target) return null;
  return { qr: shareQr(target), snapshot: target === snapshotUrl };
}

function drawChart(ctx, report, x, y, width, height) {
  const scores = [report.initial, ...report.plies.map(move => move.score)];
  const xAt = index => x + width * index / (scores.length - 1);
  const yAt = cp => y + height / 2 - Math.max(-450, Math.min(450, cp)) * height / 960;
  ctx.strokeStyle = '#9faea5';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, yAt(0)); ctx.lineTo(x + width, yAt(0)); ctx.stroke();
  ctx.strokeStyle = '#216458';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  scores.forEach((score, index) => {
    if (!score) return;
    if (index && scores[index - 1]) ctx.lineTo(xAt(index), yAt(score.cp));
    else ctx.moveTo(xAt(index), yAt(score.cp));
  });
  ctx.stroke();
  report.keyPlies.slice(0, 2).forEach(ply => {
    const score = scores[ply];
    if (!score) return;
    const markerX = xAt(ply), markerY = yAt(score.cp);
    ctx.fillStyle = '#a46717';
    ctx.beginPath(); ctx.arc(markerX, markerY, 9, 0, 2 * Math.PI); ctx.fill();
    ctx.font = '600 22px system-ui';
    fit(ctx, String(report.plies[ply - 1].number), Math.min(x + width - 31, Math.max(x, markerX - 10)),
      markerY < y + 34 ? markerY + 15 : markerY - 34, 36);
  });
}

async function drawReport(canvas, report, url, isCurrent) {
  const pieces = await prepareShareBoards();
  if (!isCurrent()) return false;
  const comparisons = report.plies.filter(move => move.kind && move.best.length &&
      (move.kind === 'trap' ? move.played[0]?.uci !== move.best[0].uci : move.maia[0]?.uci !== move.best[0].uci && move.maia.length))
    .sort((a, b) => (b.kind === 'trap' ? b.playedLoss : b.maiaLoss) - (a.kind === 'trap' ? a.playedLoss : a.maiaLoss) || a.ply - b.ply).slice(0, 2);
  const qr = qrSpec(url, report.source);
  const footer = 724 + comparisons.length * 316;
  canvas.width = 1080;
  canvas.height = footer + (qr ? 230 : 118);
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#f4f7ef';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#173a32';
  ctx.fillRect(0, 0, canvas.width, 366);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e2ebe3';
  ctx.font = '550 24px system-ui';
  fit(ctx, 'Diverge · ' + t('reviewShareTitle'), 60, 46);
  ctx.font = '700 43px system-ui';
  fit(ctx, (report.white || t('reviewWhite')) + '  ' + report.result + '  ' + (report.black || t('reviewBlack')), 60, 92);
  ctx.font = '500 26px system-ui';
  fit(ctx, report.opening || t('accuracyLabel'), 60, 164);
  if (report.maiaCoverage && report.maiaCoverage < report.plies.length) {
    ctx.font = '500 18px system-ui';
    fit(ctx, 'Maia · ' + t('accuracySamples', { valid: report.maiaCoverage, total: report.plies.length }), 60, 199);
  }
  for (const [i, side] of ['reviewWhite', 'reviewBlack'].entries()) {
    const x = i ? 550 : 60;
    ctx.font = '500 24px system-ui';
    ctx.fillStyle = '#cbdcd2';
    fit(ctx, t(side), x, 232, 420);
    ctx.font = '650 60px system-ui';
    ctx.fillStyle = '#f6faf6';
    fit(ctx, scoreLabel(report.accuracy[i]), x, 265, 420);
  }
  const tally = [t('snapshotMistakes', { count: report.plies.filter(move => ['inaccuracy','mistake','blunder'].includes(move.quality)).length })];
  if (report.maiaCoverage) {
    tally.push(t('reviewConfirmedBeyond', { count: report.plies.filter(move => move.kind === 'beyond').length }),
      t('snapshotPrecise', { count: report.plies.filter(move => move.kind === 'precise').length }),
      t('reviewConfirmedTraps', { count: report.plies.filter(move => move.kind === 'trap').length }));
  }
  ctx.fillStyle = '#27493d';
  ctx.font = '550 27px system-ui';
  fit(ctx, tally.join(' · '), 60, 397);
  drawChart(ctx, report, 60, 459, 960, 177);
  const turn = report.plies[report.keyPlies[0] - 1];
  ctx.fillStyle = '#193b31';
  ctx.font = '500 26px system-ui';
  fit(ctx, turn ? t('snapshotKeyMove', { move: turn.number + (turn.turn === 'w' ? '. ' : '… ') + turn.san }) : t('snapshotPlies', { count: report.plies.length }), 60, 657);

  comparisons.forEach((move, index) => {
    const y = 704 + index * 316;
    const isTrap = move.kind === 'trap';
    const human = isTrap ? move.played[0] : move.maia[0];
    const probability = isTrap ? move.playedProb : move.maiaProb;
    const best = move.best[0];
    const amount = isTrap ? move.playedLoss : move.maiaLoss;
    const arrows = [{ ...parseUciSquares(best.uci), color: '#285fb9' }, { ...parseUciSquares(human.uci), color: '#dd9b26' }];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(60, y, 960, 282);
    drawShareBoard(ctx, { board: parseFenBoard(move.fenBefore), orientation: 'white', arrows }, pieces, 78, y + 18, 246);
    ctx.fillStyle = '#16382f';
    ctx.font = '650 30px system-ui';
    fit(ctx, move.number + (move.turn === 'w' ? '. ' : '… ') + move.san + ' · ' + t('snapshotKind_' + move.kind), 360, y + 30, 630);
    ctx.font = '550 29px system-ui';
    ctx.fillStyle = '#285fb9';
    fit(ctx, 'Stockfish · ' + best.san, 360, y + 94, 630);
    ctx.fillStyle = '#865015';
    fit(ctx, (isTrap ? t('snapshotPlayed') : 'Maia') + ' · ' + human.san +
      (probability !== null ? ' · ' + probability.toFixed(1) + '%' : ''), 360, y + 145, 630);
    ctx.font = '500 25px system-ui';
    ctx.fillStyle = '#365248';
    const lossText = amount === null ? '' : t(isTrap ? 'snapshotPlayedLoss' : 'snapshotMaiaLoss', { loss: (amount / 100).toFixed(2) });
    fit(ctx, [report.elo && ('Maia Elo ' + report.elo), lossText].filter(Boolean).join(' · '), 360, y + 201, 630);
  });
  ctx.fillStyle = '#284a3c';
  ctx.font = '650 29px system-ui';
  fit(ctx, '4chess.cc · Diverge', 60, footer + 25, 690);
  if (qr) {
    drawShareQr(ctx, qr.qr, 1020, footer + 14, 180);
    ctx.font = '500 20px system-ui';
    ctx.fillStyle = '#284a3c';
    ctx.textAlign = 'right';
    fit(ctx, t(qr.snapshot ? 'snapshotQrReview' : 'snapshotQrOriginal'), 1020, footer + 203, 330);
  }
  return true;
}

export class ReviewShare {
  constructor(app) {
    this.app = app;
    this.button = byId('review-share-open');
    this.dialog = byId('review-share-dialog');
    this.canvas = byId('review-share-preview');
    this.anonymize = byId('review-share-anonymize');
    this.download = byId('review-share-png');
    this.copy = byId('review-share-copy');
    this.image = byId('review-share-image');
    this.text = byId('review-share-text');
    this.field = byId('review-share-field');
    this.status = byId('review-share-status');
    this.version = 0;
    this.button.onclick = () => { if (this.allowed()) { this.dialog.showModal(); void this.prepare(); } };
    byId('review-share-close').onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => { this.version++; });
    this.anonymize.onchange = () => { void this.prepare(); };
    this.download.onclick = () => this.savePng();
    this.copy.onclick = () => { void this.copyLink(); };
    this.image.onclick = () => { void this.copyImage(); };
    this.text.onclick = () => { void this.copySummary(); };
  }

  allowed() {
    const { reviewResult, moves, sessionInput, scanSourceLocked } = this.app;
    return !scanSourceLocked && !FairPlayGuard.isLiveGameInProgress() && !new URLSearchParams(location.hash.slice(1)).has('scan') &&
      !!reviewResult?.allMoves.length && reviewResult.allMoves.length === moves.length && !reviewResult.isPartial && !moves.isPartial &&
      FairPlayGuard.verifyConcludedGame(sessionInput?.pgn || sessionInput).ok;
  }

  sync() {
    this.button.hidden = !this.allowed();
    if (this.button.hidden && this.dialog.open) this.dialog.close();
  }

  async prepare() {
    const version = ++this.version, epoch = this.app.gameEpoch;
    const current = () => version === this.version && epoch === this.app.gameEpoch && this.dialog.open && this.allowed();
    this.download.disabled = this.copy.disabled = this.image.disabled = this.text.disabled = true;
    this.blob = this.summary = null;
    this.field.hidden = true;
    this.url = null;
    this.canvas.hidden = true;
    this.status.textContent = t('reviewSharePreparing');
    try {
      const tags = this.app.pgnTags;
      const input = this.app.sessionInput;
      const game = {
        result: FairPlayGuard.verifyConcludedGame(input.pgn || input).result,
        white: input.white || tags.white, black: input.black || tags.black,
        opening: [tags.eco, tags.opening && tags.opening !== '?' ? tags.opening :
          this.app.reviewResult.allMoves.findLast(move => move.isBookMove && move.openingName)?.openingName].filter(Boolean).join(' · '),
        source: [tags.link, tags.site, input.publicGameUrl].map(publicGameLink).find(Boolean)
      };
      const snapshot = makeReviewSnapshot({ report: this.app.reviewResult, game, anonymize: this.anonymize.checked });
      const report = restoreReviewSnapshot(snapshot);
      let url = null;
      try { url = VIEWER + '#' + new URLSearchParams({ review: await encodeReviewSnapshot(snapshot), lang: getLang() }).toString(); }
      catch { /* PNG export also works without browser compression support. */ }
      if (!(await drawReport(this.canvas, report, url, current)) || !current()) return;
      const blob = await canvasPng(this.canvas);
      if (!current()) return;
      this.blob = blob;
      this.summary = [
        (report.white || t('reviewWhite')) + ' ' + report.result + ' ' + (report.black || t('reviewBlack')),
        t('reviewShareSummaryScores', { white: scoreLabel(report.accuracy[0]), black: scoreLabel(report.accuracy[1]) }),
        [t('snapshotPlies', { count: report.plies.length }), t('snapshotMistakes', {
          count: report.plies.filter(move => ['inaccuracy', 'mistake', 'blunder'].includes(move.quality)).length
        })].join(' · ')
      ].join('\n');
      this.url = url;
      this.canvas.hidden = false;
      this.download.disabled = this.image.disabled = !blob;
      this.text.disabled = false;
      this.copy.disabled = !url;
      const qr = qrSpec(url, report.source);
      this.status.textContent = !url ? t('snapshotLinkUnavailable') : qr?.snapshot ? '' :
        t(qr ? 'snapshotQrOriginalHint' : 'snapshotNoQr');
    } catch {
      if (current()) this.status.textContent = t('reviewShareError');
    }
  }

  savePng() {
    if (this.blob && this.dialog.open && this.allowed()) downloadPng(this.blob, 'diverge-game-review.png');
  }

  async copyImage() {
    if (!this.blob || !this.dialog.open || !this.allowed()) return;
    const version = this.version;
    try {
      await copyPng(this.blob);
      if (version === this.version && this.allowed()) this.status.textContent = t('shareExportCopied');
    } catch {
      if (version === this.version && this.allowed()) this.status.textContent = t('shareCardCopyUnsupported');
    }
  }

  async copySummary() {
    if (this.summary && !this.text.disabled) await this.copyText(this.summary, 'shareExportCopied');
  }

  async copyLink() {
    if (this.url && !this.copy.disabled) await this.copyText(this.url, 'snapshotCopied');
  }

  async copyText(value, success) {
    if (!this.dialog.open || !this.allowed()) return;
    const version = this.version;
    try {
      await navigator.clipboard.writeText(value);
      if (version === this.version && this.allowed()) this.status.textContent = t(success);
    } catch {
      if (version === this.version && this.allowed()) showCopyField(this.field, value);
    }
  }
}
