import { ChessBoard } from '../engine/chess-core.js';
import { MaiaEngine } from '../engine/maia-engine.js';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js';
import { errorSeverity, expectedScore, positiveIntuition, qualifiesTrap } from '../engine/review-policy.js';

const DEPTH = 22;
const VERIFIED_MIN_DEPTH = 18;
const usable = (result, depth) => Number.isFinite(result?.scoreCp)
  && !result.isBound && (result.terminal || result.depth >= depth);
const chance = move => move?.rawProb ?? (Number.isFinite(move?.prob) ? move.prob / 100 : null);

export class LiveEngines {
  constructor() {
    this.stockfish = new StockfishInBrowser({ variant: 'standard' });
    this.maia = new MaiaEngine(null, this.stockfish, { variant: '79m' });
  }

  cancel() {
    this.stockfish.stop();
  }

  async sampleMaia({ fen, history }, elo, obsolete) {
    if (obsolete()) return [];
    const prediction = await this.maia.predict(fen, elo, null, obsolete, history);
    return obsolete() ? [] : prediction?.moves ?? [];
  }

  async inspect({ move, fenBefore, history, elo }, obsolete, onStockfish) {
    const maiaReady = this.maia.initialize().then(() => true, () => false);
    const result = await this.stockfish.evaluate(fenBefore, DEPTH, 8000, 2, 7000);
    if (obsolete()) return null;
    if (result) onStockfish?.({ score: result.score, depth: result.depth, bestSan: result.bestMove?.san });
    const prediction = await maiaReady && !obsolete() ? await this.maia.predict(fenBefore, elo, result, obsolete, history) : null;
    if (obsolete()) return null;
    const likely = prediction?.moves?.[0];
    const series = new Map();
    for (const [candidate, role] of [[result?.bestMove, 'sf'], [likely, 'maia'], [move, 'played']]) {
      if (candidate?.uci && !series.has(candidate.uci)) {
        series.set(candidate.uci, { uci: candidate.uci, label: candidate.san, san: candidate.san, role });
      }
    }
    const trend = likely ? { fen: fenBefore, history, elo, series: [...series.values()], moves: prediction.moves } : null;
    const display = { score: result?.score, depth: result?.depth, bestSan: result?.bestMove?.san,
      maiaTopSan: likely?.san, maiaReady: !!prediction?.isMaiaReady, trend };
    if (!move) return display;
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
    display.moment = moment;
    if (!usable(result, VERIFIED_MIN_DEPTH) || !likely || !Number.isFinite(probability)) return display;
    if (new ChessBoard(fenBefore).getLegalMoves().length <= 1 || obsolete()) return display;

    const depth = Math.min(DEPTH, result.depth);
    const scores = new Map((result.lines || [])
      .filter(line => usable(line, depth))
      .map(line => [line.uci, line.scoreCp]));
    scores.set(result.bestMove.uci, result.scoreCp);
    const scoreFor = async (uci, nextFen) => {
      if (scores.has(uci)) return scores.get(uci);
      if (obsolete()) return null;
      const score = await this.stockfish.evaluate(nextFen, depth - 1, 5000, 1, 4000);
      return usable(score, depth - 1) ? -score.scoreCp : null;
    };
    const played = await scoreFor(move.uci, move.fen);
    if (!Number.isFinite(played) || obsolete()) return display;
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
    return display;
  }
}
