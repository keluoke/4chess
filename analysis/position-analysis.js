import { ChessBoard } from '../engine/chess-core.js?v=20261014-scan1';
import { t } from './i18n.js?v=20261014-scan1';

// All displayed evaluations share White's perspective, regardless of orientation.
export function whiteEvaluation(result, fen) {
  if (!result || !Number.isFinite(result.scoreCp)) return null;
  const cp = (fen.split(' ')[1] === 'b' ? -1 : 1) * result.scoreCp;
  if (result.isMate) {
    const match = String(result.scoreText ?? result.score ?? '').match(/(?:M|#)([+-]?\d+)/);
    const distance = match ? Math.abs(Number(match[1])) : Math.max(0, Math.round((10000 - Math.abs(cp)) / 100));
    return { cp, isMate: true, text: `${cp < 0 ? '-' : '+'}M${distance}` };
  }
  return { cp, isMate: false, text: `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}` };
}

export function reviewEvaluation(move, after = false) {
  const prefix = after ? 'evalAfter' : 'evalBefore';
  if (!move || !move[prefix] || move[prefix] === '?') return null;
  return whiteEvaluation({ scoreCp: move[`${prefix}Cp`], score: move[prefix], isMate: /^[M#]/.test(move[prefix]) }, after ? move.fenAfter : move.fenBefore);
}

export function legalVariation(fen, pv = [], limit = 12) {
  const board = new ChessBoard(fen);
  if (!board.isValid) return [];
  const moves = [];
  for (const uci of pv.slice(0, limit)) {
    const move = board.getLegalMoves().find(m => m.uci === uci);
    if (!move) break;
    const number = board.fullMoves;
    const prefix = board.turn === 'w' ? `${number}. ` : moves.length === 0 ? `${number}… ` : '';
    board.makeMove(move);
    moves.push({ uci, san: move.san, label: `${prefix}${move.san}`, fen: board.getFen() });
  }
  return moves;
}

export function engineLines(result, fen) {
  if (!result) return [];
  const legal = new Set(new ChessBoard(fen).getLegalMoves().map(m => m.uci));
  const lines = result.lines?.length ? result.lines : [{ ...result, uci: result.bestMove?.uci, multipv: 1 }];
  const seen = new Set();
  return [...lines].sort((a, b) => a.multipv - b.multipv).filter(line => {
    if (!legal.has(line.uci) || seen.has(line.uci)) return false;
    seen.add(line.uci);
    return true;
  }).slice(0, 3).map(line => ({
    ...line,
    evaluation: whiteEvaluation(line, fen),
    variation: legalVariation(fen, line.pv?.[0] === line.uci ? line.pv : [line.uci])
  }));
}

export class PositionAnalysis {
  constructor(app) {
    this.app = app;
    this.generation = 0;
    this.cache = new Map();
    this.searchCount = 0;
  }

  cancel() {
    this.generation++;
    clearTimeout(this.timer);
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
    const ply = app.isReviewingMove ? app.currentPly - 1 : app.currentPly;
    const fen = app.isBranching ? app.branchFen : app.positions[ply]?.fen;
    if (!fen) return null;
    const history = app.isBranching ? (app.branchHistory || []) : app.positions.slice(Math.max(0, ply - 7), ply).map(p => p.fen);
    const depth = Number(app.el.positionDepth.value);
    return { fen, ply, history, depth, elo: app.currentElo, epoch: app.gameEpoch, key: `${fen}|${app.currentElo}|${depth}|${app.stockfish.engineKey}|${app.maiaEngine.modelKey}|${history.join(';')}` };
  }

  refresh({ calculate = true } = {}) {
    this.cancel();
    if (this.app.scanSourceLocked) return;
    const ctx = this.context();
    if (!ctx) return;
    const generation = this.generation;
    let entry = this.cache.get(ctx.key);
    if (!entry) {
      entry = { sf: null, prediction: null, maiaEvaluations: new Map() };
      this.cache.set(ctx.key, entry);
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    }
    if (!this.app.isBranching) {
      const next = this.app.reviewResult?.allMoves?.find(m => m.ply === ctx.ply + 1 && m.fenBefore === ctx.fen);
      const previous = this.app.reviewResult?.allMoves?.find(m => m.ply === ctx.ply && m.fenAfter === ctx.fen);
      entry.reportEvaluation = reviewEvaluation(next) || reviewEvaluation(previous, true);
      if (!entry.prediction && next?._predMoves?.length) entry.prediction = { moves: next._predMoves };
    }
    this.active = { ctx, entry, generation };
    this.render();
    if (!calculate || (!this.app.moves.length && !this.app.hasAnalysisInput)) return;
    if (this.app.analyzer.isAnalyzing) return; // Full-game review owns the engine until completion.
    this.timer = setTimeout(() => { this.pending = this.compute(this.active); }, 140);
  }

  current(snapshot) {
    return snapshot && snapshot.generation === this.generation && snapshot.ctx.epoch === this.app.gameEpoch && snapshot.ctx.elo === this.app.currentElo && !this.app.analyzer.isAnalyzing;
  }

  async search(snapshot, fen, depth, multipv = 1) {
    if (!this.current(snapshot)) return null;
    this.searchCount++;
    try { return await this.app.stockfish.evaluate(fen, depth, depth > 10 ? 12000 : 6000, multipv); }
    finally { this.searchCount--; }
  }

  async compute(snapshot) {
    if (!this.current(snapshot)) return;
    const { ctx, entry } = snapshot;
    const board = new ChessBoard(ctx.fen);
    if (!board.getLegalMoves().length) { this.render(); return; }
    // Maia initialization and Stockfish search are independent. Each result can render as it arrives.
    const predict = async () => {
      if (entry.prediction?.moves?.length && !this.app.settings.heatmap) return;
      try {
        await this.app.maiaEngine.initialize();
        if (!this.current(snapshot)) return;
        const prediction = await this.app.maiaEngine.predict(ctx.fen, ctx.elo, null, () => !this.current(snapshot), ctx.history);
        if (!this.current(snapshot)) return;
        entry.prediction = prediction?.moves?.length ? prediction : null;
        entry.maiaFailed = !entry.prediction;
      } catch { if (this.current(snapshot)) entry.maiaFailed = true; }
      if (this.current(snapshot)) { this.app.updateEngineStatus(); this.render(); }
    };
    const maiaTask = predict();
    try {
      if (!entry.sf) {
        await this.app.stockfish.initialize();
        if (!this.current(snapshot)) { await maiaTask; return; }
        const result = await this.search(snapshot, ctx.fen, ctx.depth, 3);
        if (!this.current(snapshot)) { await maiaTask; return; }
        entry.sf = result;
        entry.sfFailed = !entry.sf;
        this.app.updateEngineStatus(); this.render();
      }
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
          const result = await this.search(snapshot, variation[0].fen, ctx.depth - 1);
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
    if (!this.active) { this.renderGauge(null); return; }
    const { ctx, entry } = this.active;
    const board = new ChessBoard(ctx.fen);
    const legal = board.getLegalMoves();
    const terminal = !legal.length;
    let evaluation = whiteEvaluation(entry.sf, ctx.fen) || entry.reportEvaluation;
    if (terminal) evaluation = board.inCheck() ? { cp: board.turn === 'w' ? -10000 : 10000, isMate: true, text: board.turn === 'w' ? '-M0' : '+M0' } : { cp: 0, isMate: false, text: '0.00' };
    this.renderGauge(evaluation);
    const app = this.app;
    const lines = engineLines(entry.sf, ctx.fen);
    const pending = app.analyzer.isAnalyzing ? 'candidatesAfterReview' : 'statusCalculating';
    this.renderLoadingStatuses();
    const engineContainer = document.getElementById('engine-candidate-lines');
    const maiaContainer = document.getElementById('maia-candidate-lines');
    engineContainer.replaceChildren(); maiaContainer.replaceChildren();
    const placeholder = (container, key) => { const el = document.createElement('div'); el.className = 'candidate-placeholder'; el.textContent = t(key); container.append(el); };
    if (!lines.length) placeholder(engineContainer, terminal ? 'noLegalMoves' : entry.sfFailed ? 'positionUnavailable' : (!app.moves.length && !app.hasAnalysisInput) ? 'engineNotStarted' : pending);
    lines.forEach(line => this.renderRow(engineContainer, line.evaluation, line.variation, null, 'blue'));
    const valid = new Set(legal.map(m => m.uci));
    const moves = (entry.prediction?.moves || []).filter(m => valid.has(m.uci)).slice(0, 3);
    if (!moves.length) placeholder(maiaContainer, terminal ? 'noLegalMoves' : entry.maiaFailed ? 'intuitionUnavailable' : (!app.moves.length && !app.hasAnalysisInput) ? 'engineNotStarted' : pending);
    moves.forEach(move => {
      const match = lines.find(line => line.uci === move.uci);
      this.renderRow(maiaContainer, match?.evaluation || entry.maiaEvaluations.get(move.uci), match?.variation || legalVariation(ctx.fen, [move.uci]), app.settings.probability && Number.isFinite(move.prob) ? `${move.prob.toFixed(1)}%` : null, 'gold');
    });
    this.renderOverlays(lines, moves);
  }

  renderLoadingStatuses() {
    if (!this.active) return;
    const { ctx, entry } = this.active, app = this.app;
    const sfLoading = app.stockfish.initPromise && !app.stockfish.isReady;
    const sfStatus = entry.sf ? t('candidateDepth', { depth: entry.sf.depth }) : entry.sfFailed ? t('engineFailed') : sfLoading ? (app.stockfish.downloadProgress ? t('modelDownloading', { percent: app.stockfish.downloadProgress.percent }) : t('engineStarting')) : t(app.stockfish.isReady ? 'engineReady' : 'engineNotStarted');
    document.getElementById('candidate-engine-status').textContent = `${app.stockfish.variant === 'standard' ? 'SF19' : 'SF19 Lite'} · ${sfStatus}`;
    const progress = app.maiaEngine.status?.maia;
    const maiaStatus = entry.prediction?.moves?.length ? t('probLabel') : entry.maiaFailed ? t('engineFailed') : app.maiaEngine.isLoading ? (progress?.state === 'downloading' ? t('modelDownloading', { percent: progress.percent || 0 }) : t('engineStarting')) : t(app.maiaEngine.isReady ? 'engineReady' : 'engineNotStarted');
    document.getElementById('candidate-maia-status').textContent = `${app.maiaEngine.modelName || 'Maia-3'} · ${ctx.elo} · ${maiaStatus}`;
  }

  renderRow(container, evaluation, variation, probability, color) {
    if (!variation.length) return;
    const row = document.createElement('div'); row.className = 'candidate-line';
    const score = document.createElement('span'); score.className = 'candidate-score'; score.textContent = evaluation?.text || '—'; score.title = t('whitePerspectiveScore', { score: score.textContent }); row.append(score);
    const moves = document.createElement('div'); moves.className = 'candidate-variation';
    variation.forEach((move, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'candidate-move'; button.textContent = move.label;
      button.title = t('previewCandidate', { move: move.san });
      button.onclick = () => this.app.previewCandidate(this.active.ctx, variation.slice(0, index + 1));
      moves.append(button);
    });
    moves.onmouseenter = () => { if (this.app.settings.arrows && (color === 'gold' ? this.app.settings.maiaArrows !== false : this.app.settings.sfArrows !== false)) this.app.boardUI.setArrows([{ from: variation[0].uci.slice(0, 2), to: variation[0].uci.slice(2, 4), color }]); };
    moves.onmouseleave = () => this.renderOverlays();
    row.append(moves);
    if (probability) { const prob = document.createElement('span'); prob.className = 'candidate-probability'; prob.textContent = probability; row.append(prob); }
    if (color === 'gold' && variation.length > 1) row.title = t('engineContinuation');
    container.append(row);
  }

  renderOverlays(lines, moves) {
    this.clearOverlays();
    if (!this.active) return;
    const { ctx, entry } = this.active;
    lines ||= engineLines(entry.sf, ctx.fen);
    moves ||= (entry.prediction?.moves || []).slice(0, 3);
    if (this.app.settings.arrows) {
      const arrows = [];
      if (lines[0] && this.app.settings.sfArrows !== false) arrows.push({ from: lines[0].uci.slice(0, 2), to: lines[0].uci.slice(2, 4), color: 'blue' });
      if (this.app.settings.maiaArrows !== false && moves[0]?.uci && (moves[0].uci !== lines[0]?.uci || this.app.settings.sfArrows === false)) arrows.push({ from: moves[0].uci.slice(0, 2), to: moves[0].uci.slice(2, 4), color: 'gold' });
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
