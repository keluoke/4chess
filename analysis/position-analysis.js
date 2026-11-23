import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { t } from './i18n.js?v=20261123-checkup-window';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { MaiaEloTrend } from './maia-elo-trend.js?v=20261123-checkup-window';

import { engineLines, legalVariation, whiteEvaluation } from '../engine/position-lines.js';
export { engineLines, legalVariation, whiteEvaluation };

export function reviewEvaluation(move, after = false) {
  const prefix = after ? 'evalAfter' : 'evalBefore';
  if (!move || !move[prefix] || move[prefix] === '?') return null;
  return whiteEvaluation({ scoreCp: move[`${prefix}Cp`], score: move[prefix], isMate: /^[M#]/.test(move[prefix]) }, after ? move.fenAfter : move.fenBefore);
}

const AUXILIARY_DEPTH = 10;

export class PositionAnalysis {
  constructor(app) {
    this.app = app;
    this.generation = 0;
    this.cache = new Map();
    this.searchCount = 0;
    this.maiaQueue = [];
    const trend = globalThis.document?.getElementById('maia-elo-trend');
    if (trend) this.eloTrend = new MaiaEloTrend(this, trend, document.getElementById('maia-trend-open'));
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
      else this.app.updateActivePositionAnalysis();
    });
  }

  cancel() {
    this.generation++;
    clearTimeout(this.timer);
    this.eloTrend?.reset();
    if (this.searchCount > 0 && !this.app.analyzer.isAnalyzing) this.app.stockfish.stop();
    this.clearOverlays();
  }

  clearOverlays() {
    this.app.boardUI?.clearArrows();
    for (const el of Object.values(this.app.boardUI?.squareEls || {})) {
      el.classList.remove('intuition-heat');
      el.style.removeProperty('--heat-opacity');
    }
  }

  context() {
    const app = this.app;
    if (app.tempAnalysisFen && !app.isBranching) {
      const depth = app.positionMaxDepth;
      return { fen: app.tempAnalysisFen, ply: 0, history: [], depth, elo: app.currentElo, epoch: app.gameEpoch, temp: true, key: `temp|${app.tempAnalysisFen}|${app.currentElo}|${depth}|${app.stockfish.engineKey}|${app.maiaEngine.modelKey}` };
    }
    const ply = app.isBranching ? app.activeBranch.base.ply + app.activeBranch.cursor : app.isReviewingMove ? app.currentPly - 1 : app.currentPly;
    const fen = app.isBranching ? app.branchFen : app.positions[ply]?.fen;
    if (!fen) return null;
    const history = app.isBranching ? (app.branchHistory || []) : app.positions.slice(Math.max(0, ply - 7), ply).map(p => p.fen);
    const depth = app.positionMaxDepth;
    return { fen, ply, history, depth, elo: app.currentElo, epoch: app.gameEpoch, key: `${fen}|${app.currentElo}|${depth}|${app.stockfish.engineKey}|${app.maiaEngine.modelKey}|${history.join(';')}` };
  }

  refresh({ calculate = true } = {}) {
    this.cancel();
    if (this.app.scanSourceLocked || this.app.practice?.active || FairPlayGuard.isLiveGameInProgress()) return;
    const ctx = this.context();
    if (!ctx) return;
    const generation = this.generation;
    let entry = this.cache.get(ctx.key);
    if (!entry) {
      entry = { sf: null, prediction: null, maiaEvaluations: new Map() };
      this.cache.set(ctx.key, entry);
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    }
    if (!this.app.isBranching && !this.app.tempAnalysisFen) {
      const report = this.app.reviewResult;
      const next = report?.allMoves?.find(m => m.ply === ctx.ply + 1 && m.fenBefore === ctx.fen);
      const previous = report?.allMoves?.find(m => m.ply === ctx.ply && m.fenAfter === ctx.fen);
      entry.reportEvaluation = reviewEvaluation(next) || reviewEvaluation(previous, true);
      if (!entry.prediction && report?.elo === ctx.elo && report.modelKey === this.app.maiaEngine.modelKey && next?._predMoves?.length) {
        entry.prediction = { moves: next._predMoves };
      }
    } else if (this.app.isBranching) {
      entry.reportEvaluation = this.app.activeBranch.evaluations.get(this.app.branchEvaluationKey(ctx.fen, ctx.depth)) || null;
    }
    this.active = { ctx, entry, generation };
    this.render();
    if (!calculate || (!this.app.moves.length && !this.app.hasAnalysisInput && !this.app.tempAnalysisFen)) return;
    if (!this.current(this.active)) return;
    this.timer = setTimeout(() => { void this.compute(this.active); }, 75);
  }

  current(snapshot) {
    return !this.app.scanSourceLocked && !this.app.practice?.active && !this.app.checkup?.ownsEngines &&
      !globalThis.document?.hidden && !FairPlayGuard.isLiveGameInProgress() &&
      snapshot && snapshot.generation === this.generation && snapshot.ctx.epoch === this.app.gameEpoch &&
      snapshot.ctx.elo === this.app.currentElo && !this.app.analyzer.isAnalyzing;
  }

  async search(snapshot, fen, depth, multipv = 1, moveTime = null, onProgress = null) {
    if (!this.current(snapshot)) return null;
    this.searchCount++;
    try {
      const timeout = moveTime ? moveTime + 1000 : 6000;
      return await this.app.stockfish.evaluate(fen, depth, timeout, multipv, moveTime, onProgress);
    } finally { this.searchCount--; }
  }

  get foregroundBusy() { return this.computingGeneration === this.generation; }

  // The Maia Worker handles one active inference. Select queued foreground work
  // before an optional trend sample or the next full-game prediction.
  predictMaia(engine, fen, elo, sf, invalid, history, priority = 0) {
    const canceled = () => engine !== this.app.maiaEngine || this.app.scanSourceLocked || invalid();
    return new Promise((resolve, reject) => {
      this.maiaQueue.push({ engine, fen, elo, sf, canceled, history, priority, resolve, reject });
      this.maiaQueue.sort((a, b) => a.priority - b.priority);
      if (!this.maiaRunning) void this.runMaiaQueue();
    });
  }

  async runMaiaQueue() {
    this.maiaRunning = true;
    try {
      while (this.maiaQueue.length) {
        const { engine, fen, elo, sf, canceled, history, resolve, reject } = this.maiaQueue.shift();
        try {
          const result = canceled() ? null : await engine.predict(fen, elo, sf, canceled, history);
          resolve(canceled() ? null : result);
        } catch (error) { reject(error); }
      }
    } finally {
      this.maiaRunning = false;
    }
  }

  async compute(snapshot) {
    if (!this.current(snapshot)) return;
    this.computingGeneration = snapshot.generation;
    try { await this.computePosition(snapshot); }
    finally { if (this.computingGeneration === snapshot.generation) this.computingGeneration = null; }
  }

  async computePosition(snapshot) {
    if (!this.current(snapshot)) return;
    const { ctx, entry } = snapshot;
    const board = new ChessBoard(ctx.fen);
    if (!board.getLegalMoves().length) { this.render(); await this.evaluateBranchPath(snapshot); return; }
    // Maia initialization and Stockfish search are independent. Each result can render as it arrives.
    const predict = async () => {
      if (entry.prediction?.moves?.length && !this.app.settings.heatmap) return;
      try {
        await this.app.maiaEngine.initialize();
        if (!this.current(snapshot)) return;
        const prediction = await this.predictMaia(this.app.maiaEngine, ctx.fen, ctx.elo, null, () => !this.current(snapshot), ctx.history);
        if (!this.current(snapshot)) return;
        entry.prediction = prediction?.moves?.length ? prediction : null;
        entry.maiaFailed = !entry.prediction;
      } catch { if (this.current(snapshot)) entry.maiaFailed = true; }
      if (this.current(snapshot)) { this.app.updateEngineStatus(); this.render(); }
    };
    const maiaTask = predict();
    try {
      if (!entry.sfComplete) {
        await this.app.stockfish.initialize();
        if (!this.current(snapshot)) { await maiaTask; return; }
        const preview = this.app.reviewPendingResume || this.app.isPlaying;
        const limit = preview ? Math.min(ctx.depth, 12) : ctx.depth;
        const moveTime = preview ? 450 : limit === 22 ? 7000 : 4000;
        const publish = result => {
          if (!this.current(snapshot) || result?.isBound || !(result?.depth > (entry.sf?.depth || 0))) return;
          entry.sf = result;
          this.render();
        };
        let latest;
        const result = await this.search(snapshot, ctx.fen, limit, 3, moveTime, update => {
          latest = update;
          if (update.depth >= 8) publish(update);
        });
        if (!this.current(snapshot)) { await maiaTask; return; }
        publish(latest);
        // A time limit may stop halfway through a MultiPV iteration.
        if (result && (!result.lines || result.lines.every(line => line.depth === result.depth && !line.isBound))) publish(result);
        entry.sfComplete = !!entry.sf && !preview;
        entry.sfFailed = !entry.sf;
        this.app.updateEngineStatus(); this.render();
      }
      // Current position renders first. Fill visited branch nodes without
      // waiting for Maia, using the same cancellable foreground search queue.
      await this.evaluateBranchPath(snapshot);
      await maiaTask;
      if (!this.current(snapshot) || !entry.sf) return;
      const lines = engineLines(entry.sf, ctx.fen);
      for (const move of (entry.prediction?.moves || []).slice(0, 3)) {
        if (!this.current(snapshot)) return;
        if (lines.some(line => line.uci === move.uci) || entry.maiaEvaluations.has(move.uci)) continue;
        const variation = legalVariation(ctx.fen, [move.uci]);
        if (!variation.length) continue;
        const child = new ChessBoard(variation[0].fen);
        let evaluation;
        if (!child.getLegalMoves().length) {
          evaluation = child.inCheck() ? { cp: child.turn === 'w' ? -10000 : 10000, isMate: true, text: child.turn === 'w' ? '-M0' : '+M0' } : { cp: 0, isMate: false, text: '0.00' };
        } else {
          const result = await this.search(snapshot, variation[0].fen, AUXILIARY_DEPTH);
          evaluation = whiteEvaluation(result, variation[0].fen);
        }
        if (!this.current(snapshot)) return;
        if (evaluation) entry.maiaEvaluations.set(move.uci, evaluation);
        this.render();
      }
    } catch (error) {
      if (this.current(snapshot)) { entry.sfFailed = true; this.render(); }
      console.warn('[Studio] Position analysis failed:', error);
    }
  }

  async evaluateBranchPath(snapshot) {
    const app = this.app, branch = app.isBranching && app.activeBranch;
    if (!branch || !this.current(snapshot)) return;
    for (const node of [branch.base, ...branch.moves]) {
      if (!this.current(snapshot) || app.activeBranch !== branch || !app.isBranching) return;
      const key = app.branchEvaluationKey(node.fen, snapshot.ctx.depth);
      if (branch.evaluations.has(key)) continue;
      const board = new ChessBoard(node.fen);
      const terminal = !board.getLegalMoves().length;
      const result = terminal ? null : await this.search(snapshot, node.fen, AUXILIARY_DEPTH);
      if (!this.current(snapshot) || app.activeBranch !== branch || !app.isBranching) return;
      const evaluation = terminal ? (board.inCheck() ? { cp: board.turn === 'w' ? -10000 : 10000, text: board.turn === 'w' ? '-M0' : '+M0', isMate: true } : { cp: 0, text: '0.00' }) : whiteEvaluation(result, node.fen);
      if (evaluation) branch.evaluations.set(key, { ...evaluation, depth: result?.depth });
      app.syncBranchChart();
    }
  }

  renderGauge(evaluation) {
    const app = this.app;
    const gauge = document.getElementById('evaluation-gauge');
    gauge.classList.toggle('flipped', app.boardUI.orientation === 'black');
    const share = evaluation ? 50 + 49 * Math.tanh(evaluation.cp / 400) : 50;
    document.getElementById('gauge-white').style.height = `${share}%`;
    document.getElementById('gauge-black').style.height = `${100 - share}%`;
    const text = evaluation ? (evaluation.isMate ? evaluation.text : `${evaluation.cp > 0 ? '+' : ''}${(evaluation.cp / 100).toFixed(1)}`) : '—';
    document.getElementById('gauge-score-white').textContent = !evaluation || evaluation.cp >= 0 ? text : '';
    document.getElementById('gauge-score-black').textContent = evaluation?.cp < 0 ? text : '';
    gauge.setAttribute('aria-label', t('whitePerspectiveScore', { score: text }));
  }

  render() {
    if (this.app.scanSourceLocked || this.app.practice?.active || FairPlayGuard.isLiveGameInProgress()) { this.eloTrend?.reset(); this.clearOverlays(); return; }
    if (!this.active) { this.eloTrend?.update(null); this.renderGauge(null); this.app.renderPositionHeading?.(null); return; }
    const { ctx, entry } = this.active;
    const board = new ChessBoard(ctx.fen);
    const legal = board.getLegalMoves();
    const terminal = !legal.length;
    let evaluation = whiteEvaluation(entry.sf, ctx.fen) || entry.reportEvaluation;
    if (terminal) evaluation = board.inCheck() ? { cp: board.turn === 'w' ? -10000 : 10000, isMate: true, text: board.turn === 'w' ? '-M0' : '+M0' } : { cp: 0, isMate: false, text: '0.00' };
    this.renderGauge(evaluation);
    const app = this.app;
    app.renderPositionHeading?.(evaluation);
    if (app.isBranching && app.activeBranch && ctx.fen === app.branchFen) {
      if (evaluation && (entry.sf || terminal)) app.activeBranch.evaluations.set(app.branchEvaluationKey(ctx.fen, ctx.depth), { ...evaluation, depth: entry.sf?.depth });
      app.syncBranchChart();
    }
    const lines = engineLines(entry.sf, ctx.fen);
    const pending = app.analyzer.isAnalyzing ? 'candidatesAfterReview' : 'statusCalculating';
    this.renderLoadingStatuses();
    const engineContainer = document.getElementById('engine-candidate-lines');
    const maiaContainer = document.getElementById('maia-candidate-lines');
    const focused = document.activeElement;
    const focusKey = this.renderedGeneration === this.active.generation ? focused?.dataset?.candidateKey : null;
    const focusContainer = focusKey && focused.closest('#engine-candidate-lines, #maia-candidate-lines');
    this.renderedGeneration = this.active.generation;
    engineContainer.replaceChildren(); maiaContainer.replaceChildren();
    const placeholder = (container, key) => { const el = document.createElement('div'); el.className = 'candidate-placeholder'; el.textContent = t(key); container.append(el); };
    if (!lines.length) placeholder(engineContainer, terminal ? 'noLegalMoves' : entry.sfFailed ? 'positionUnavailable' : (!app.moves.length && !app.hasAnalysisInput && !app.tempAnalysisFen) ? 'engineNotStarted' : pending);
    lines.forEach(line => this.renderRow(engineContainer, line.evaluation, line.variation, null, 'blue'));
    const valid = new Set(legal.map(m => m.uci));
    const moves = (entry.prediction?.moves || []).filter(m => valid.has(m.uci)).slice(0, 3);
    if (!moves.length) placeholder(maiaContainer, terminal ? 'noLegalMoves' : entry.maiaFailed ? 'intuitionUnavailable' : (!app.moves.length && !app.hasAnalysisInput && !app.tempAnalysisFen) ? 'engineNotStarted' : pending);
    moves.forEach(move => {
      const match = lines.find(line => line.uci === move.uci);
      this.renderRow(maiaContainer, match?.evaluation || entry.maiaEvaluations.get(move.uci), match?.variation || legalVariation(ctx.fen, [move.uci]), app.settings.probability && Number.isFinite(move.prob) ? `${move.prob.toFixed(1)}%` : null, 'gold');
    });
    if (focusContainer) {
      const buttons = Array.from(focusContainer.querySelectorAll('[data-candidate-key]'));
      const sameLine = focusKey.split(' ')[0];
      (buttons.find(button => button.dataset.candidateKey === focusKey) ||
        buttons.find(button => button.dataset.candidateKey === sameLine) || buttons[0])?.focus({ preventScroll: true });
    }
    this.eloTrend?.update(this.current(this.active) && (app.moves.length || app.hasAnalysisInput || app.tempAnalysisFen) ? this.active : null, moves, lines);
    this.renderOverlays(lines, moves);
  }

  renderLoadingStatuses() {
    if (!this.active) return;
    const { ctx, entry } = this.active, app = this.app;
    const sfLoading = app.stockfish.initPromise && !app.stockfish.isReady;
    const sfStatus = entry.sf ? t('candidateDepth', { depth: entry.sf.depth }) : entry.sfFailed ? t('engineFailed') : sfLoading ? (app.stockfish.downloadProgress ? t('modelDownloading', { percent: app.stockfish.downloadProgress.percent }) : t('engineStarting')) : t(app.stockfish.isReady ? 'engineReady' : 'engineNotStarted');
    document.getElementById('candidate-engine-status').textContent = `${app.stockfish.variant === 'standard' ? 'SF19' : 'SF19 Lite'} · ${sfStatus}`;
    const progress = app.maiaEngine.status?.maia;
    const download = progress?.percent == null ? t('modelDownloadingBytes', { size: progress?.loadedMB || 0 }) : t('modelDownloading', { percent: progress.percent });
    const maiaStatus = entry.prediction?.moves?.length ? t('probLabel') : entry.maiaFailed ? t('engineFailed') : app.maiaEngine.isLoading ? (progress?.state === 'downloading' ? download : t('engineStarting')) : t(app.maiaEngine.isReady ? 'engineReady' : 'engineNotStarted');
    const maiaLabel = document.getElementById('candidate-maia-status');
    maiaLabel.title = progress?.error || '';
    maiaLabel.textContent = `${app.maiaEngine.modelName || 'Maia-3'} · ${ctx.elo} · ${maiaStatus}`;
  }

  renderRow(container, evaluation, variation, probability, color) {
    if (!variation.length) return;
    const row = document.createElement('div'); row.className = 'candidate-line';
    const score = document.createElement('span'); score.className = 'candidate-score'; score.textContent = evaluation?.text || '—'; score.title = t('whitePerspectiveScore', { score: score.textContent }); row.append(score);
    const moves = document.createElement('div'); moves.className = 'candidate-variation';
    variation.forEach((move, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'candidate-move'; button.textContent = move.label;
      button.dataset.candidateKey = variation.slice(0, index + 1).map(item => item.uci).join(' ');
      button.title = t('previewCandidate', { move: move.san });
      button.onclick = () => this.app.previewCandidate(this.active.ctx, variation.slice(0, index + 1));
      moves.append(button);
    });
    moves.onmouseenter = () => {
      const enabled = color === 'gold' ? this.app.settings.maiaArrows : this.app.settings.sfArrows;
      if (!enabled || this.app.scanSourceLocked || this.app.practice?.active || FairPlayGuard.isLiveGameInProgress()) return;
      this.app.boardUI.setArrows([{ from: variation[0].uci.slice(0, 2), to: variation[0].uci.slice(2, 4), color, role: color === 'gold' ? 'maia' : 'sf' }]);
    };
    moves.onmouseleave = () => this.renderOverlays();
    row.append(moves);
    if (probability) { const prob = document.createElement('span'); prob.className = 'candidate-probability'; prob.textContent = probability; row.append(prob); }
    if (color === 'gold' && variation.length > 1) row.title = t('engineContinuation');
    container.append(row);
  }

  renderOverlays(lines, moves) {
    this.clearOverlays();
    if (this.app.scanSourceLocked || this.app.practice?.active || FairPlayGuard.isLiveGameInProgress()) return;
    if (!this.active) return;
    const { ctx, entry } = this.active;
    lines ||= engineLines(entry.sf, ctx.fen);
    moves ||= (entry.prediction?.moves || []).slice(0, 3);
    const { maiaArrows, sfArrows } = this.app.settings;
    if (maiaArrows || sfArrows) {
      const arrows = [];
      const consensus = maiaArrows && sfArrows && moves[0]?.uci === lines[0]?.uci;
      if (sfArrows && lines[0]) arrows.push({ from: lines[0].uci.slice(0, 2), to: lines[0].uci.slice(2, 4), color: consensus ? 'green' : 'blue', role: consensus ? 'consensus' : 'sf' });
      if (maiaArrows && moves[0]?.uci && !consensus) arrows.push({ from: moves[0].uci.slice(0, 2), to: moves[0].uci.slice(2, 4), color: 'gold' });
      this.app.boardUI.setArrows(arrows);
    }
    if (this.app.settings.heatmap && entry.prediction?.heatmap) {
      entry.prediction.heatmap.forEach((weight, index) => {
        const square = this.app.boardUI.squareEls[ChessBoard.indexToSquare(index)];
        if (square && weight > 0) { square.classList.add('intuition-heat'); square.style.setProperty('--heat-opacity', String(Math.min(.6, weight * .6))); }
      });
    }
  }
}
