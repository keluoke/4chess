import { ChessBoard } from '../engine/chess-core.js';
import { MaiaEngine } from '../engine/maia-engine.js?v=20261124-mobile';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js';
import { engineLines, legalVariation, whiteEvaluation } from '../engine/position-lines.js';
import { errorSeverity, expectedScore, positiveIntuition, qualifiesTrap } from '../engine/review-policy.js';
import { maiaTrendSeries } from '../analysis/maia-elo-trend.js?v=20261125-trend-lines';

const VERIFIED_MIN_DEPTH = 18;
const usable = (result, depth) => Number.isFinite(result?.scoreCp)
  && !result.isBound && (result.terminal || result.depth >= depth);
const chance = move => move?.rawProb ?? (Number.isFinite(move?.prob) ? move.prob / 100 : null);

export class LiveEngines {
  constructor({ stockfishVariant, maiaVariant, depth, maiaMode }, onStatus, stockfish = null) {
    this.depth = depth;
    this.stockfish = stockfish ?? new StockfishInBrowser({ variant: stockfishVariant });
    this.stockfish.onDownloadProgress = onStatus;
    this.maia = maiaMode === 'off' ? null
      : new MaiaEngine(onStatus, this.stockfish, { variant: maiaVariant, cacheOnly: maiaMode === 'cache' });
    this.positions = new Map();
  }

  cancel() {
    this.stockfish.stop();
  }

  dispose(keepStockfish) {
    this.maia?.dispose();
    this.stockfish.onDownloadProgress = null;
    this.stockfish.onReadyCallback = null;
    if (!keepStockfish) this.stockfish.reset();
  }

  status() {
    const sf = this.stockfish;
    const maia = this.maia?.status.maia;
    return {
      sf: {
        state: sf.isReady ? 'ready' : sf.initPromise ? (sf.downloadProgress ? 'downloading' : 'starting') : sf.lastError ? 'error' : 'idle',
        percent: sf.downloadProgress?.percent, source: sf.variant === 'lite' ? 'bundled' : sf.downloadSource
      },
      maia: maia && { ...maia, source: maia.source?.includes('IndexedDB') ? 'cache' : maia.source?.includes('CDN') ? 'cdn' : null }
    };
  }

  async sampleMaia({ fen, history }, elo, obsolete) {
    if (!this.maia || obsolete()) return [];
    const prediction = await this.maia.predict(fen, elo, null, obsolete, history);
    return obsolete() ? [] : prediction?.moves ?? [];
  }

  get budget() {
    return this.depth === 22 ? 7000 : this.depth === 20 ? 4000 : 3200;
  }

  positionKey({ fen, history, elo }) {
    return JSON.stringify([fen, history, elo, this.depth]);
  }

  async evaluate({ fen, history, elo }, obsolete, onStockfish) {
    const key = this.positionKey({ fen, history, elo });
    if (this.positions.has(key)) return this.positions.get(key);
    const terminal = !new ChessBoard(fen).getLegalMoves().length;
    const maiaReady = !terminal && this.maia?.initialize().then(() => true, () => false);
    const budget = this.budget;
    const result = await this.stockfish.evaluate(fen, this.depth, budget + 1000, 3, budget);
    if (obsolete()) return null;
    if (result) onStockfish?.(result);
    const prediction = await maiaReady && !obsolete() ? await this.maia.predict(fen, elo, result, obsolete, history) : null;
    if (obsolete()) return null;
    const entry = { result, prediction, maiaEvaluations: new Map() };
    if (result && (!this.maia || prediction?.isMaiaReady || result.terminal)) {
      this.positions.set(key, entry);
      if (this.positions.size > 12) this.positions.delete(this.positions.keys().next().value);
    }
    return entry;
  }

  async inspect(position, obsolete, onStockfish) {
    const displayStockfish = result => ({
      evaluation: whiteEvaluation(result, position.fen), depth: result?.depth,
      stockfish: result?.bestMove, terminal: result?.terminal, stockfishLines: engineLines(result, position.fen)
    });
    const entry = await this.evaluate(position, obsolete, result => onStockfish?.(displayStockfish(result)));
    if (!entry || obsolete()) return null;
    const { result, prediction } = entry;
    if (!result && !prediction?.isMaiaReady) return null;
    const legal = new Map(new ChessBoard(position.fen).getLegalMoves().map(move => [move.uci, move.san]));
    const maiaLines = prediction?.isMaiaReady ? (prediction.moves || [])
      .filter(move => legal.has(move.uci)).slice(0, 3).map(move => ({ ...move, san: legal.get(move.uci) })) : [];
    const likely = maiaLines[0];
    const display = displayStockfish(result);
    const trend = likely ? { ...position, series: maiaTrendSeries(maiaLines, display.stockfishLines[0]), moves: prediction.moves } : null;
    const matches = new Map(display.stockfishLines.map(line => [line.uci, line.evaluation]));
    const maiaEvaluations = new Map(maiaLines.flatMap(move => {
      const score = matches.get(move.uci) ?? entry.maiaEvaluations.get(move.uci);
      return score ? [[move.uci, score]] : [];
    }));
    return { ...display, maia: likely, maiaLines, maiaEvaluations, maiaReady: !!prediction?.isMaiaReady, trend };
  }

  async fillMaiaEvaluations(position, display, obsolete, publish) {
    const entry = this.positions.get(this.positionKey(position));
    const depth = Math.min(16, this.depth - 2);
    for (const move of display.maiaLines) {
      if (obsolete()) return;
      if (display.stockfishLines.some(line => line.uci === move.uci) || display.maiaEvaluations.has(move.uci)) continue;
      const child = legalVariation(position.fen, [move.uci])[0];
      if (!child) continue;
      const chess = new ChessBoard(child.fen);
      const terminal = !chess.getLegalMoves().length;
      const isMate = terminal && chess.inCheck();
      const result = terminal ? { scoreCp: isMate ? -10000 : 0, isMate, score: isMate ? 'M0' : '0.00' }
        : await this.stockfish.evaluate(child.fen, depth, 1700, 1, 1200);
      if (obsolete()) return;
      const evaluation = result && !result.isBound && whiteEvaluation(result, child.fen);
      if (!evaluation) continue;
      const score = terminal ? evaluation : { ...evaluation, approximate: true };
      entry?.maiaEvaluations.set(move.uci, score);
      display.maiaEvaluations.set(move.uci, score);
      publish();
    }
  }

  async classify(move, before, after, obsolete) {
    const entry = await this.evaluate(before, obsolete);
    if (!entry || obsolete()) return null;
    const { fen: fenBefore } = before;
    const { result, prediction } = entry;
    const likely = prediction?.isMaiaReady ? prediction.moves?.[0] : null;
    const rank = prediction?.moves?.findIndex(candidate => candidate.uci === move.uci) ?? -1;
    const probability = rank >= 0 ? chance(prediction.moves[rank]) : null;
    const moment = {
      ...move, fenBefore,
      bestUci: result?.bestMove?.uci,
      bestSan: result?.bestMove?.san,
      humanRawProbability: probability,
      maiaTopUci: likely?.uci, maiaTopSan: likely?.san,
      maiaTopRawProb: chance(likely)
    };
    if (!result?.bestMove || !usable(result, VERIFIED_MIN_DEPTH) || !likely || !Number.isFinite(probability)) return moment;
    if (new ChessBoard(fenBefore).getLegalMoves().length <= 1 || obsolete()) return moment;

    const depth = Math.min(this.depth, result.depth);
    const budget = this.budget;
    const scores = new Map((result.lines || [])
      .filter(line => usable(line, depth))
      .map(line => [line.uci, line.scoreCp]));
    scores.set(result.bestMove.uci, result.scoreCp);
    const scoreFor = async (uci, nextFen) => {
      if (scores.has(uci)) return scores.get(uci);
      if (obsolete()) return null;
      const cached = uci === move.uci && after.fen === nextFen
        ? this.positions.get(JSON.stringify([after.fen, after.history, after.elo, this.depth]))?.result : null;
      const score = usable(cached, depth - 1) ? cached : await this.stockfish.evaluate(nextFen, depth - 1, budget, 1, budget - 500);
      return usable(score, depth - 1) ? -score.scoreCp : null;
    };
    const played = await scoreFor(move.uci, move.fen);
    if (!Number.isFinite(played) || obsolete()) return moment;
    const lossCp = Math.max(0, result.scoreCp - played);
    const scoreLoss = (expectedScore(result.scoreCp) - expectedScore(played)) * 100;
    const stableBest = result.bestMove.uci === move.uci;
    let classification = !stableBest && qualifiesTrap({ lossCp, scoreLoss, probability, rank: rank + 1 })
      ? 'intuition_trap' : null;
    if (!classification && likely.uci !== move.uci && lossCp <= 15) {
      const board = new ChessBoard(fenBefore);
      const alternative = board.getLegalMoves().find(candidate => candidate.uci === likely.uci);
      if (alternative) {
        board.makeMove(alternative);
        const alternate = await scoreFor(likely.uci, board.getFen());
        if (Number.isFinite(alternate) && !obsolete()) {
          classification = positiveIntuition({
            lossCp, maiaAdvantageCp: played - alternate,
            maiaESL: (expectedScore(played) - expectedScore(alternate)) * 100,
            probability, maiaProbability: chance(likely), stableBest
          });
        }
      }
    }
    Object.assign(moment, {
      lossCp, verifiedLossCp: lossCp, severity: errorSeverity(lossCp),
      divergenceType: classification, divergenceStatus: classification ? 'confirmed' : 'unconfirmed'
    });
    return moment;
  }
}
