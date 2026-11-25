import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { ChessBoard } from '../engine/chess-core.js';
import { intuitionKind } from '../engine/review-policy.js?v=20261120-review';
import { whiteEvaluation } from '../engine/position-lines.js';
import { RATINGS, maiaTrendSeries, probabilities } from './maia-elo-trend.js?v=20261125-position-poster';
import { canvasPng, copyPng, copyShareLink, downloadPng } from './share-export.js?v=20261124-divergence-cards';
import { getLang, t } from './i18n.js?v=20261124-intuition-labels';

const copy = {
  zh: {
    starting: '正在请不同段位的棋手看看这步棋…', drawing: '正在把从新手到大师的选择画成海报…',
    failed: '人类视角暂未算齐，可重试或保存局面。',
    chart: '人类视角 · 各段位会怎么选', ranges: '从 600 到 2600 分的直觉变化 · Maia 预测',
    empty: '暂无各段位的选着预测', scan: '扫码在 4chess.cc 试走这个局面',
    engine: '引擎首选', human: '人类直觉', blind: '全分段盲区', blindNote: '几乎没人想到',
    even: '均势', white: '白优', black: '黑优', whiteMate: '白方有将杀', blackMate: '黑方有将杀',
    anchor: '局面分析', source: 'Diverge · 单步复盘'
  },
  en: {
    starting: 'Seeing how players across ratings read this move…', drawing: 'Drawing the rating curve onto your card…',
    failed: 'The rating curve is incomplete. Retry or save the position as shown.',
    chart: 'Human perspective · Moves by rating', ranges: 'From 600 to 2600 Elo · Maia predictions',
    empty: 'Rating predictions unavailable', scan: 'Scan to try this position on 4chess.cc',
    engine: 'Engine pick', human: 'Human instinct', blind: 'Across-rating blind spot', blindNote: 'Almost nobody finds it',
    even: 'Even', white: 'White is ahead', black: 'Black is ahead', whiteMate: 'White has mate', blackMate: 'Black has mate',
    anchor: 'Position analysis', source: 'Diverge · Move review'
  }
};
const byId = id => document.getElementById(id);

export class PositionPosterDialog {
  constructor(app) {
    this.app = app;
    this.dialog = byId('share-card-dialog');
    this.canvas = byId('share-card-canvas');
    this.status = byId('share-card-status');
    this.placeholder = byId('position-poster-placeholder');
    this.progress = byId('position-poster-progress');
    this.retry = byId('position-poster-retry');
    this.download = byId('btn-share-card-download');
    this.copy = byId('btn-share-card-copy');
    this.link = byId('btn-share-card-link');
    this.field = byId('share-card-link-field');
    byId('btn-close-share-card').onclick = () => this.close();
    this.dialog.addEventListener('close', () => {
      if (!this.dialog.open) this.session = null;
    });
    this.retry.onclick = () => void this.renderPreview();
    this.download.onclick = () => {
      if (this.current(this.session) && this.session.blob) downloadPng(this.session.blob, 'diverge-position.png');
    };
    this.copy.onclick = async () => {
      const session = this.session;
      if (!this.current(session) || !session.blob) return;
      try {
        await copyPng(session.blob);
        if (this.current(session)) this.status.textContent = t('shareCardCopied');
      } catch {
        if (this.current(session)) this.status.textContent = t('shareCardCopyUnsupported');
      }
    };
    this.link.onclick = async () => {
      const session = this.session;
      if (!this.current(session)) return;
      if (await copyShareLink(session.link, this.field) && this.current(session)) this.status.textContent = t('snapshotCopied');
    };
  }

  allowed() {
    return !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
  }

  current(session) {
    return !!session && this.session === session && this.dialog.open && this.allowed() &&
      session.epoch === this.app.gameEpoch && session.engine === this.app.maiaEngine;
  }

  close() {
    this.session = null;
    if (this.dialog.open) this.dialog.close();
  }

  open(move, context = {}) {
    if (!this.allowed()) return;
    const fen = move?.fenBefore || move?.fen;
    if (!fen || !new ChessBoard(fen).isValid) return;
    const { app } = this;
    const index = move.ply - 1;
    const owned = app.positions[index]?.fen === fen;
    const history = owned
      ? app.positions.slice(Math.max(0, index - 7), index).map(position => position.fen) : [];
    const white = context.white || (owned && app.pgnTags?.white);
    const black = context.black || (owned && app.pgnTags?.black);
    this.session = {
      move, fen, history, elo: context.elo ?? app.currentElo, orientation: context.orientation || app.boardUI.orientation,
      engine: app.maiaEngine, epoch: app.gameEpoch,
      names: [white, black].filter(Boolean).join(' vs '), mover: fen.split(' ')[1] === 'b' ? black : white
    };
    this.field.hidden = true;
    if (!this.dialog.open) this.dialog.showModal();
    void this.renderPreview();
  }

  async renderPreview() {
    const session = this.session;
    if (!this.current(session)) return;
    const generation = session.generation = (session.generation ?? 0) + 1;
    const current = () => this.current(session) && session.generation === generation;
    const lang = getLang(), words = copy[lang] ?? copy.en;
    const { fen, move, history, engine, elo, orientation } = session;
    const board = new ChessBoard(fen);
    const legal = new Map(board.getLegalMoves().map(candidate => [candidate.uci, candidate.san]));
    const link = session.link = 'https://4chess.cc/analysis/#' +
      new URLSearchParams({ fen, orientation, lang, elo }).toString().replaceAll('%2F', '/');
    this.field.hidden = true;
    session.blob = null;
    this.canvas.hidden = this.retry.hidden = this.copy.disabled = this.download.disabled = true;
    this.placeholder.hidden = this.progress.hidden = false;
    this.progress.value = 0;
    this.status.textContent = words.starting;
    const active = this.app.positionAnalysis;
    const samples = active.eloTrend.samplesFor(engine, { fen, history });
    const bestUci = move.verifiedBestUci || move.bestUci;
    const best = legal.has(bestUci) ? { uci: bestUci, san: legal.get(bestUci) } : null;
    const fills = candidate => candidate && candidate.map(([uci, prob]) => ({ uci, san: legal.get(uci), prob }))
      .filter(move => move.san).sort((a, b) => b.prob - a.prob);
    const sample = async rating => {
      if (samples.has(rating)) return samples.get(rating);
      const report = this.app.reviewResult;
      const recorded = report?.elo === rating && report.modelKey === engine.modelKey &&
        report.allMoves[move.ply - 1] === move ? move._predMoves : null;
      if (!recorded?.length && !engine.isReady) await engine.initialize();
      if (!current()) return;
      const prediction = recorded?.length ? recorded
        : (await active.predictMaia(engine, fen, rating, null, () => !current(), history, 1))?.moves;
      if (!current()) return;
      const values = probabilities(prediction ?? []);
      if (values.size) samples.set(rating, values);
      return values;
    };
    let maia, series = [], incomplete = false;
    try {
      if (legal.size) {
        const base = fills([...(await sample(elo) ?? [])]);
        if (!current()) return;
        maia = base[0];
        const candidates = maiaTrendSeries(base, best);
        for (const [index, rating] of RATINGS.entries()) {
          if (!current()) return;
          const values = await sample(rating);
          if (!candidates.length || !candidates.every(candidate => Number.isFinite(values?.get(candidate.uci)))) {
            samples.delete(rating);
            throw new Error('Missing rating distribution');
          }
          if (!current()) return;
          this.progress.value = index + 1;
          if (index >= 2) this.status.textContent = words.drawing;
        }
        series = candidates;
      }
    } catch {
      incomplete = true;
    }
    if (!current()) return;
    try {
      const { renderPositionPoster } = await import('./position-poster.js?v=20261125-position-poster');
      const moveNumber = board.fullMoves + (board.turn === 'w' ? '. ' : '… ');
      const san = move.san || move.playedSan;
      const cp = Number.isFinite(move.evalBeforeCp) && move.evalBefore && move.evalBefore !== '?'
        ? whiteEvaluation({ scoreCp: move.evalBeforeCp, isMate: move.evalBeforeIsMate, score: move.evalBefore }, fen) : null;
      const outlook = cp ? words[cp.isMate ? (cp.cp > 0 ? 'whiteMate' : 'blackMate')
        : cp.cp > 0 ? 'white' : cp.cp < 0 ? 'black' : 'even'] + ' ' + cp.text : '';
      const blind = series.length > 0 && best && RATINGS.every(rating => samples.get(rating)?.get(best.uci) < 3);
      const kind = intuitionKind(move) || (move.divergenceType === 'intuition_trap' && move.divergenceStatus === 'confirmed' &&
        Number.isFinite(move.eslLoss) ? 'trap' : null);
      const poster = {
        lang, orientation, event: words.source,
        headline: san ? [moveNumber + san, session.mover].filter(Boolean).join(' · ') : words.anchor,
        badge: blind ? words.blind : kind ? t('reviewQuality_' + kind, {}, lang) : '',
        subtitle: [session.names, outlook].filter(Boolean).join(' · '),
        move: { fen, bestUci: best?.uci, bestSan: best?.san, maiaTopUci: maia?.uci, maiaTopSan: maia?.san },
        series, samples, blind, blindUci: best?.uci, blindNote: words.blindNote,
        chartTitle: words.chart, chartNote: words.ranges, chartUnavailable: words.empty,
        brand: '4chess.cc/analysis', source: 'Stockfish · Maia-3', scan: words.scan,
        qrLink: link.length <= 230 ? link : null,
        legend: [
          best && { role: 'sf', text: words.engine + ' ' + best.san },
          maia && { role: 'maia', text: words.human + ' ' + maia.san }
        ].filter(Boolean)
      };
      if (!await renderPositionPoster(this.canvas, poster, current) || !current()) return;
      const blob = await canvasPng(this.canvas);
      if (!current()) return;
      session.blob = blob;
      this.canvas.hidden = false;
      this.copy.disabled = this.download.disabled = !blob;
      this.status.textContent = incomplete ? words.failed : '';
    } catch {
      if (current()) this.status.textContent = t('reviewShareError');
    } finally {
      if (current()) {
        this.retry.hidden = !incomplete;
        this.placeholder.hidden = this.progress.hidden = true;
      }
    }
  }
}
