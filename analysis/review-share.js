import { t, getLang } from './i18n.js?v=20261124-intuition-labels';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { parseFenBoard, parseUciSquares, drawShareBoard, prepareShareBoards, readStudioShareBoard } from './share-card.js?v=20261124-intuition-labels';
import { encodeReviewSnapshot, makeReviewSnapshot, publicGameLink, restoreReviewSnapshot, reviewStoryRows, reviewStoryText,
  STORY_RATINGS, STORY_STREAK } from './review-snapshot.js?v=20261125-poster-focus';
import { canvasPng, copyPng, downloadPng, drawShareQr, shareQr, showCopyField } from './share-export.js?v=20261124-divergence-cards';

const VIEWER = 'https://4chess.cc/analysis/shared.html';
const byId = id => document.getElementById(id);
const scoreLabel = value => value === null ? '—' : value.toFixed(1) + '%';
const fit = (ctx, text, x, y, width = 952) => ctx.fillText(text, x, y, width);

const POSTER_COPY = {
  zh: {
    title: '整盘战报', noBlunders: '零大漏着', trend: '局势走势', details: '查看分析细节',
    engine: '引擎首选', intuition: '人类直觉', predicted: 'Maia 预测 {elo} Elo 棋手有 {prob}% 会走这一步',
    rare: '最冷门的引擎首选', tightrope: '确认 {narrow} 次走钢丝，实战全部走对',
    narrow: '确认 {narrow} 次走钢丝，实战走对 {found} 次',
    preciseDraw: '一场高精度和棋', draw: '双方握手言和', win: '{side}在第 {number} 回合取胜',
    watch: '扫码回看本局', watchHint: '扫码打开棋王战回放。分享链接可查看完整复盘。'
  },
  en: {
    title: 'Game review', noBlunders: 'No blunders', trend: 'Game evaluation', details: 'View analysis details',
    engine: 'Engine pick', intuition: 'Human instinct', predicted: 'Maia predicts {prob}% of {elo} Elo players would play this move',
    rare: 'Least expected engine pick', tightrope: 'Found the best move in all {narrow} confirmed tightrope positions',
    narrow: 'Found the best move in {found} of {narrow} confirmed tightrope positions',
    preciseDraw: 'A high-accuracy draw', draw: 'The game ended in a draw', win: '{side} won on move {number}',
    watch: 'Scan to replay the game', watchHint: 'The QR code opens the broadcast replay. Use the share link for the full review.'
  }
};

function posterText(key, values = {}) {
  return (POSTER_COPY[getLang()] ?? POSTER_COPY.en)[key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}

function qrSpec(snapshotUrl, source, move) {
  const round = source?.match(/^https:\/\/lichess\.org\/broadcast\/fide-world-chess-championship-2026\/[a-z0-9-]+\/([a-zA-Z0-9]{8})(?:\/[a-zA-Z0-9]{8})?$/)?.[1];
  // Keep ample pixels per module after chat apps resize the report image.
  if (snapshotUrl && snapshotUrl.length <= 230) return { code: shareQr(snapshotUrl), kind: 'snapshot' };
  if (round) {
    const query = new URLSearchParams({ event: 'wcc2026', round, lang: getLang() });
    if (move) {
      query.set('ply', move.ply - 1);
      query.set('orientation', move.turn === 'b' ? 'black' : 'white');
    }
    return { code: shareQr('https://4chess.cc/live/?' + query), kind: 'broadcast' };
  }
  return source && source.length <= 230 ? { code: shareQr(source), kind: 'source' } : null;
}

function posterFocus(report, precise) {
  const rank = ply => {
    const index = report.keyPlies.indexOf(ply);
    return index === -1 ? report.keyPlies.length : index;
  };
  const difference = move => move.kind === 'trap' ? move.playedLoss : move.maiaLoss;
  const highlights = report.plies.filter(move => {
    const best = move.best[0];
    if (!best) return false;
    return move.kind === 'trap' ? move.uci !== best.uci
      : move.kind === 'beyond' && move.maia[0] && move.maia[0].uci !== best.uci;
  });
  const move = highlights.sort((a, b) => rank(a.ply) - rank(b.ply) ||
    (difference(b) ?? 0) - (difference(a) ?? 0) || a.ply - b.ply)[0];
  if (move) return { move, title: t('snapshotKind_' + move.kind), trap: move.kind === 'trap' };

  const { rare, coverage } = report.story ?? {};
  if (precise && rare && rare.playedProb <= 5 && rare.maia[0] && rare.maia[0].uci !== rare.best[0].uci) {
    return { move: rare, title: posterText('rare'), trap: false };
  }
  if (coverage?.narrow > 0) {
    return { title: posterText(coverage.found === coverage.narrow ? 'tightrope' : 'narrow', coverage) };
  }
  if (report.result === '1/2-1/2') return { title: posterText(precise ? 'preciseDraw' : 'draw') };
  return { title: posterText('win', {
    side: t(report.result === '1-0' ? 'reviewWhite' : 'reviewBlack'),
    number: report.plies.at(-1).number
  }) };
}

function drawChart(ctx, report, x, y, width, height, highlightedPly) {
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
  const highlight = scores[highlightedPly];
  if (highlight) {
    ctx.fillStyle = '#a46717';
    ctx.beginPath(); ctx.arc(xAt(highlightedPly), yAt(highlight.cp), 9, 0, 2 * Math.PI); ctx.fill();
  }
}

function drawFocus(ctx, focus, report, theme, pieces) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(60, 430, 960, focus.move ? 782 : 120);
  ctx.fillStyle = '#16382f';
  ctx.font = focus.move ? '650 26px system-ui' : '700 39px system-ui';
  fit(ctx, focus.title, 86, focus.move ? 454 : 464, 908);
  const move = focus.move;
  if (!move) return;

  const best = move.best[0];
  const human = focus.trap ? move.played[0] : move.maia[0];
  const role = focus.trap ? 'played' : 'maia';
  const choices = [
    { ...parseUciSquares(best.uci), role: 'stockfish', label: posterText('engine') + ' ' + best.san },
    { ...parseUciSquares(human.uci), role, label: (focus.trap ? t('snapshotPlayed') : posterText('intuition')) + ' ' + human.san }
  ];
  const number = move.number + (move.turn === 'w' ? '. ' : '… ');
  ctx.font = '750 56px system-ui';
  fit(ctx, number + move.san, 83, 490, 908);
  ctx.fillStyle = '#365248';
  ctx.font = '500 25px system-ui';
  if (report.elo !== null && move.playedProb !== null) {
    fit(ctx, posterText('predicted', {
      elo: report.elo, prob: move.playedProb.toFixed(move.playedProb < 1 ? 2 : 1)
    }), 86, 563, 908);
  } else if (focus.trap && move.playedLoss !== null) {
    fit(ctx, t('snapshotPlayedLoss', { loss: (move.playedLoss / 100).toFixed(2) }), 86, 563, 908);
  }
  const board = parseFenBoard(move.fenBefore);
  drawShareBoard(ctx, { board, orientation: move.turn === 'b' ? 'black' : 'white', arrows: choices, theme }, pieces, 270, 622, 540);
  for (const [index, choice] of choices.entries()) {
    const x = 130 + index * 460;
    ctx.fillStyle = theme[choice.role];
    ctx.beginPath(); ctx.arc(x, 1185, 7, 0, 2 * Math.PI); ctx.fill();
    ctx.font = '650 25px system-ui';
    fit(ctx, choice.label, x + 16, 1171, 390);
  }
}

async function drawReport(canvas, report, url, theme, isCurrent) {
  const precise = report.accuracy.every(accuracy => accuracy > 95);
  const focus = posterFocus(report, precise);
  const qr = qrSpec(url, report.source, focus.move);
  const pieces = focus.move ? await prepareShareBoards() : null;
  if (!isCurrent()) return false;

  const footer = focus.move ? 1230 : 570;
  canvas.width = 1080;
  canvas.height = footer + (qr ? 216 : 96);
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#f4f7ef';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#173a32';
  ctx.fillRect(0, 0, canvas.width, 220);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e2ebe3';
  ctx.font = '550 24px system-ui';
  fit(ctx, 'Diverge · ' + posterText('title'), 60, 33);
  ctx.fillStyle = '#f6faf6';
  ctx.font = '750 46px system-ui';
  const result = report.result === '1/2-1/2' ? '½–½' : report.result.replace('-', '–');
  fit(ctx, (report.white || t('reviewWhite')) + '  ' + result + '  ' + (report.black || t('reviewBlack')), 60, 79);
  ctx.fillStyle = '#e2ebe3';
  ctx.font = '550 28px system-ui';
  const white = scoreLabel(report.accuracy[0]), black = scoreLabel(report.accuracy[1]);
  const accuracy = t('reviewShareSummaryScores', { white, black });
  const noBlunders = precise && report.plies.every(move => !['blunder', 'unknown'].includes(move.quality));
  fit(ctx, accuracy + (noBlunders ? ' · ' + posterText('noBlunders') : ''), 60, 155);

  ctx.fillStyle = '#284a3c';
  ctx.font = '650 24px system-ui';
  fit(ctx, posterText('trend'), 60, 250);
  drawChart(ctx, report, 60, 288, 960, 113, focus.move?.ply);
  drawFocus(ctx, focus, report, theme, pieces);

  ctx.fillStyle = '#284a3c';
  ctx.font = '650 29px system-ui';
  fit(ctx, '4chess.cc · Diverge', 60, footer + 25, 690);
  if (qr) {
    ctx.font = '500 20px system-ui';
    const cue = qr.kind === 'broadcast' ? posterText('watch')
      : t(qr.kind === 'snapshot' ? 'snapshotQrReview' : 'snapshotQrOriginal');
    fit(ctx, cue, 60, footer + 69, 690);
    drawShareQr(ctx, qr.code, 1020, footer + 8, 184);
  }
  return { qr };
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
    this.compare = byId('review-share-compare');
    this.compareStatus = byId('review-share-compare-status');
    this.details = byId('review-share-details');
    this.story = byId('review-share-story');
    this.intuitionNote = byId('review-share-intuition-note');
    this.version = 0;
    this.button.onclick = () => { if (this.allowed()) { this.dialog.showModal(); void this.prepare(); } };
    byId('review-share-close').onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => {
      this.version++;
      this.comparison = null;
      this.compareStatus.textContent = '';
      this.details.open = false;
    });
    this.anonymize.onchange = () => { void this.prepare(); };
    this.download.onclick = () => this.savePng();
    this.copy.onclick = () => { void this.copyLink(); };
    this.image.onclick = () => { void this.copyImage(); };
    this.text.onclick = () => { void this.copySummary(); };
    this.compare.onclick = () => {
      if (this.comparison) {
        this.comparison = null;
        this.paintComparison();
      } else void this.compareRatings();
    };
  }

  allowed() {
    const { reviewResult, moves, sessionInput, scanSourceLocked } = this.app;
    return !scanSourceLocked && !FairPlayGuard.isLiveGameInProgress() && !new URLSearchParams(location.hash.slice(1)).has('scan') &&
      !!reviewResult?.allMoves.length && reviewResult.allMoves.length === moves.length && !reviewResult.isPartial && !moves.isPartial &&
      FairPlayGuard.verifyConcludedGame(sessionInput?.pgn || sessionInput).ok;
  }

  syncIntuitionNote() {
    if (!this.intuitionNote) return;
    const complete = this.app.reviewOverview?.hasCompleteIntuition?.(this.app.reviewResult) ?? !this.app.reviewResult?.engineOnly;
    if (!this.dialog.open || !this.app.reviewResult || complete) {
      this.intuitionNote.hidden = true;
      this.intuitionNote.textContent = '';
      return;
    }
    this.intuitionNote.hidden = false;
    const scan = this.app.intuitionReview;
    this.intuitionNote.textContent = scan?.state === 'running'
      ? t('reviewShareIntuitionRunning', { status: scan.statusText() })
      : t('reviewShareIntuitionMissing');
  }

  sync() {
    this.button.hidden = !this.allowed();
    if (this.button.hidden && this.dialog.open) this.dialog.close();
    else if (this.dialog.open && this.preparedReport !== this.app.reviewResult) void this.prepare();
    else this.syncIntuitionNote();
  }

  ratingSplits() {
    const split = this.splitResult;
    return split && split.moves === this.app.moves && split.engine === this.app.maiaEngine ? split.results : null;
  }

  paintComparison() {
    const job = this.comparison;
    const done = !!this.ratingSplits();
    const locale = getLang();
    this.compare.hidden = done;
    this.compare.textContent = reviewStoryText(job ? 'storyStop' : 'storyCompare', locale);
    const status = job ? reviewStoryText('storyComparing', locale, { percent: job.percent })
      : done ? reviewStoryText('storyDone', locale) : '';
    if (this.compareStatus.textContent !== status) this.compareStatus.textContent = status;
  }

  async compareRatings() {
    const { reviewResult: report, gameEpoch, maiaEngine: engine, moves: gameMoves, positionAnalysis } = this.app;
    if (!this.dialog.open || !this.allowed() || this.ratingSplits()) return;
    const job = this.comparison = { percent: 0 };
    const cancelled = () => this.comparison !== job || this.app.gameEpoch !== gameEpoch ||
      this.app.moves !== gameMoves || this.app.maiaEngine !== engine || !this.dialog.open || !this.allowed();
    this.paintComparison();
    try {
      if (!engine.isReady) await engine.initialize();
      if (cancelled()) return;
      if (!engine.isReady) throw new Error('Maia is unavailable');
      const moves = report.allMoves;
      const results = STORY_RATINGS.map(() => null);
      const streaks = STORY_RATINGS.map(() => 0);
      for (const [index, move] of moves.entries()) {
        if (cancelled() || results.every(Boolean)) break;
        const history = moves.slice(Math.max(0, index - 7), index).map(previous => previous.fenBefore);
        for (const [band, elo] of STORY_RATINGS.entries()) {
          if (results[band]) continue;
          const top = move.isOnlyLegalMove ? move.uci
            : elo === report.elo && report.modelKey === engine.modelKey && move.maiaTopUci ? move.maiaTopUci
              : (await positionAnalysis.predictMaia(engine, move.fenBefore, elo, null, cancelled, history, 2))?.moves?.[0]?.uci;
          if (cancelled()) return;
          if (!top) throw new Error('Missing Maia result');
          streaks[band] = top === move.uci ? 0 : streaks[band] + 1;
          if (streaks[band] === STORY_STREAK) results[band] = index + 2 - STORY_STREAK;
        }
        job.percent = Math.floor((index + 1) * 20 / moves.length) * 5;
        this.paintComparison();
      }
      if (cancelled()) return;
      this.splitResult = { moves: gameMoves, engine, results };
      this.comparison = null;
      await this.prepare();
      if (this.dialog.open && this.ratingSplits()) this.details.open = true;
    } catch {
      if (!cancelled()) {
        this.comparison = null;
        this.paintComparison();
        this.compareStatus.textContent = reviewStoryText('storyCompareError', getLang());
      }
    } finally {
      if (this.comparison === job) {
        this.comparison = null;
        this.paintComparison();
      }
    }
  }

  async prepare() {
    const version = ++this.version, epoch = this.app.gameEpoch;
    this.preparedReport = this.app.reviewResult;
    const current = () => version === this.version && epoch === this.app.gameEpoch && this.dialog.open && this.allowed();
    this.download.disabled = this.copy.disabled = this.image.disabled = this.text.disabled = true;
    this.blob = this.summary = null;
    this.field.hidden = true;
    this.url = null;
    this.canvas.hidden = true;
    this.details.hidden = true;
    this.status.textContent = t('reviewSharePreparing');
    this.syncIntuitionNote();
    this.paintComparison();
    try {
      const tags = this.app.pgnTags;
      const input = this.app.sessionInput;
      const game = {
        result: FairPlayGuard.verifyConcludedGame(input.pgn || input).result,
        white: input.white || tags.white, black: input.black || tags.black,
        opening: [tags.eco, tags.opening && tags.opening !== '?' ? tags.opening :
          this.app.reviewResult.allMoves.findLast(move => move.isBookMove && move.openingName)?.openingName].filter(Boolean).join(' · '),
        source: [tags.gameurl, tags.link, tags.broadcasturl, tags.site, input.publicGameUrl].map(publicGameLink).find(Boolean)
      };
      const snapshot = makeReviewSnapshot({ report: this.app.reviewResult, game, anonymize: this.anonymize.checked,
        splits: this.ratingSplits() });
      const report = restoreReviewSnapshot(snapshot);
      let url = null;
      try { url = VIEWER + '#' + new URLSearchParams({ review: await encodeReviewSnapshot(snapshot), lang: getLang() }).toString(); }
      catch { /* PNG export also works without browser compression support. */ }
      const theme = readStudioShareBoard(byId('board-container'));
      const rendered = await drawReport(this.canvas, report, url, theme, current);
      if (!rendered || !current()) return;
      const { qr } = rendered;
      const blob = await canvasPng(this.canvas);
      if (!current()) return;
      this.blob = blob;
      const rows = reviewStoryRows(report, getLang());
      byId('review-share-details-title').textContent = posterText('details');
      this.story.replaceChildren(...rows.map(row => {
        const section = document.createElement('section');
        const title = document.createElement('h3');
        const content = document.createElement('p');
        title.textContent = row.title;
        content.textContent = row.note ? row.text + ' · ' + row.note : row.text;
        section.append(title, content);
        return section;
      }));
      this.details.hidden = !rows.length;
      this.summary = [
        (report.white || t('reviewWhite')) + ' ' + report.result + ' ' + (report.black || t('reviewBlack')),
        t('reviewShareSummaryScores', { white: scoreLabel(report.accuracy[0]), black: scoreLabel(report.accuracy[1]) }),
        [t('snapshotPlies', { count: report.plies.length }), t('snapshotMistakes', {
          count: report.plies.filter(move => ['inaccuracy', 'mistake', 'blunder'].includes(move.quality)).length
        })].join(' · '),
        ...rows.map(row => [row.title, row.text, row.note].filter(Boolean).join(' · '))
      ].join('\n');
      this.url = url;
      this.canvas.hidden = false;
      this.download.disabled = this.image.disabled = !blob;
      this.text.disabled = false;
      this.copy.disabled = !url;
      this.status.textContent = !url ? t('snapshotLinkUnavailable')
        : qr?.kind === 'snapshot' ? '' : qr?.kind === 'broadcast' ? posterText('watchHint')
          : t(qr ? 'snapshotQrOriginalHint' : 'snapshotNoQr');
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
