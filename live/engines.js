import { ChessBoard } from '../engine/chess-core.js';
import { MaiaEngine } from '../engine/maia-engine.js';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js';
import { whiteEvaluation } from '../engine/position-lines.js';
import { errorSeverity, expectedScore, positiveIntuition, qualifiesTrap } from '../engine/review-policy.js';

const VERIFIED_MIN_DEPTH = 18;
const usable = (result, depth) => Number.isFinite(result?.scoreCp)
  && !result.isBound && (result.terminal || result.depth >= depth);
const chance = move => move?.rawProb ?? (Number.isFinite(move?.prob) ? move.prob / 100 : null);

export class LiveEngines {
  constructor({ stockfishVariant, maiaVariant, depth }, onStatus, stockfish = null) {
    this.depth = depth;
    this.stockfish = stockfish ?? new StockfishInBrowser({ variant: stockfishVariant });
    this.stockfish.onDownloadProgress = onStatus;
    this.maia = new MaiaEngine(onStatus, this.stockfish, { variant: maiaVariant });
    this.positions = new Map();
  }

  cancel() {
    this.stockfish.stop();
  }

  dispose(keepStockfish) {
    this.maia.dispose();
    this.stockfish.onDownloadProgress = null;
    this.stockfish.onReadyCallback = null;
    if (!keepStockfish) this.stockfish.reset();
  }

  status() {
    const sf = this.stockfish;
    const maia = this.maia.status.maia;
    return {
      sf: {
        state: sf.isReady ? 'ready' : sf.initPromise ? (sf.downloadProgress ? 'downloading' : 'starting') : sf.lastError ? 'error' : 'idle',
        percent: sf.downloadProgress?.percent, source: sf.variant === 'lite' ? 'bundled' : sf.downloadSource
      },
      maia: { ...maia, source: maia.source?.includes('IndexedDB') ? 'cache' : maia.source?.includes('CDN') ? 'cdn' : null }
    };
  }

  async sampleMaia({ fen, history }, elo, obsolete) {
    if (obsolete()) return [];
    const prediction = await this.maia.predict(fen, elo, null, obsolete, history);
    return obsolete() ? [] : prediction?.moves ?? [];
  }

  get budget() {
    return this.depth === 22 ? 7000 : this.depth === 20 ? 4000 : 3200;
  }

  async evaluate({ fen, history, elo }, obsolete, onStockfish) {
    const key = JSON.stringify([fen, history, elo, this.depth]);
    if (this.positions.has(key)) return this.positions.get(key);
    const terminal = !new ChessBoard(fen).getLegalMoves().length;
    const maiaReady = !terminal && this.maia.initialize().then(() => true, () => false);
    const budget = this.budget;
    const result = await this.stockfish.evaluate(fen, this.depth, budget + 1000, 2, budget);
    if (obsolete()) return null;
    if (result) onStockfish?.(result);
    const prediction = await maiaReady && !obsolete() ? await this.maia.predict(fen, elo, result, obsolete, history) : null;
    if (obsolete()) return null;
    const entry = { result, prediction };
    if (result && (prediction?.isMaiaReady || result.terminal)) {
      this.positions.set(key, entry);
      if (this.positions.size > 12) this.positions.delete(this.positions.keys().next().value);
    }
    return entry;
  }

  async inspect(position, obsolete, onStockfish) {
    const displayStockfish = result => ({
      evaluation: whiteEvaluation(result, position.fen), depth: result?.depth,
      stockfish: result?.bestMove, terminal: result?.terminal
    });
    const entry = await this.evaluate(position, obsolete, result => onStockfish?.(displayStockfish(result)));
    if (!entry || obsolete()) return null;
    const { result, prediction } = entry;
    if (!result && !prediction?.isMaiaReady) return null;
    const likely = prediction?.isMaiaReady ? prediction.moves?.[0] : null;
    const series = new Map();
    for (const [candidate, role] of [[result?.bestMove, 'sf'], [likely, 'maia']]) {
      if (candidate?.uci && !series.has(candidate.uci)) {
        series.set(candidate.uci, { uci: candidate.uci, label: candidate.san, san: candidate.san, role });
      }
    }
    const trend = likely ? { ...position, series: [...series.values()], moves: prediction.moves } : null;
    return { ...displayStockfish(result), maia: likely, maiaReady: !!prediction?.isMaiaReady, trend };
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
