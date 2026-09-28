/**
 * Maia 3 - Full Game Analyzer & Blunder Review Engine
 * Evaluates the entire game with Stockfish 19 WASM, calculates centipawn loss (Δ)
 * per move, and ranks critical turning points (Blunders / Mistakes) with quick jump navigation
 * and Maia human intuition trap detection.
 */

import { ChessBoard } from './chess-core.js';

export class GameAnalyzer {
  constructor(stockfishEngine, maiaEngine) {
    this.stockfish = stockfishEngine;
    this.maiaEngine = maiaEngine;
    this.isAnalyzing = false;
    this.isCancelled = false;
    this.lastReviewResult = null;
  }

  cancel() {
    this.isCancelled = true;
    this.isAnalyzing = false;
  }

  /**
   * Scrapes played moves from Lichess or Chess.com DOM
   */
  static extractPageMoves(platform) {
    const moves = [];

    if (platform === 'lichess') {
      const container = document.querySelector('.analyse__moves, .tview2, rm6');
      if (container) {
        const moveEls = Array.from(container.querySelectorAll('move, u'));
        moveEls.forEach((el, idx) => {
          const raw = el.textContent.replace(/\d+[\.\s]+/g, '').trim();
          const san = raw.split(/\s+/)[0];
          if (san && !san.startsWith('*') && !['1-0', '0-1', '1/2-1/2'].includes(san)) {
            moves.push({
              ply: idx + 1,
              moveNumber: Math.floor(idx / 2) + 1,
              turn: (idx % 2 === 0) ? 'w' : 'b',
              san,
              element: el
            });
          }
        });
      }
    } else if (platform === 'chesscom') {
      const container = document.querySelector('.vertical-move-list, .move-list-wrapper, .keyboard-move-list');
      if (container) {
        const moveEls = Array.from(container.querySelectorAll('.node, .move-node, [data-ply]'));
        moveEls.forEach((el, idx) => {
          const plyAttr = el.getAttribute('data-ply');
          const ply = plyAttr ? parseInt(plyAttr, 10) : (idx + 1);
          const raw = el.textContent.replace(/\d+[\.\s]+/g, '').trim();
          const san = raw.split(/\s+/)[0];
          if (san && !san.startsWith('*') && !['1-0', '0-1', '1/2-1/2'].includes(san)) {
            moves.push({
              ply,
              moveNumber: Math.floor((ply - 1) / 2) + 1,
              turn: ((ply - 1) % 2 === 0) ? 'w' : 'b',
              san,
              element: el
            });
          }
        });
      }
    }

    return moves;
  }

  /**
   * Replays moves to construct position chain
   */
  static buildPositionChain(moves) {
    const chess = new ChessBoard();
    const positions = [{
      ply: 0,
      turn: 'w',
      fen: chess.getFen(),
      san: 'Start',
      moveEl: null
    }];

    for (let i = 0; i < moves.length; i++) {
      const mItem = moves[i];
      const legals = chess.getLegalMoves();
      const cleanSan = mItem.san.replace(/[+#?!]/g, '');
      const matched = legals.find(m => {
        const mClean = m.san.replace(/[+#?!]/g, '');
        return mClean === cleanSan || m.uci === cleanSan || mClean.toLowerCase() === cleanSan.toLowerCase();
      });

      if (!matched) {
        console.warn(`[GameAnalyzer] Move replay stopped at ply ${i + 1}: ${mItem.san}`);
        break;
      }

      chess.makeMove(matched);
      positions.push({
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        turn: (i % 2 === 0) ? 'w' : 'b',
        san: mItem.san,
        fen: chess.getFen(),
        moveEl: mItem.element
      });
    }

    return positions;
  }

  /**
   * Run full game analysis
   */
  async analyzeGame(moves, options = {}) {
    if (this.isAnalyzing) return null;
    this.isAnalyzing = true;
    this.isCancelled = false;

    const {
      depth = 8,
      elo = 1500,
      onProgress = null
    } = options;

    try {
      if (!moves || moves.length === 0) {
        throw new Error('未检测到可分析的棋局步数 (No moves detected)');
      }

      const positions = GameAnalyzer.buildPositionChain(moves);
      if (positions.length <= 1) {
        throw new Error('棋步解析失败，无法构建局面 (Failed to parse moves)');
      }

      const totalPositions = positions.length;
      const evals = [];

      // Step 1: Evaluate each position with Stockfish 19
      for (let i = 0; i < totalPositions; i++) {
        if (this.isCancelled) {
          this.isAnalyzing = false;
          return null;
        }

        if (onProgress) {
          onProgress({
            phase: 'evaluating',
            current: i + 1,
            total: totalPositions,
            percent: Math.round(((i + 1) / totalPositions) * 85),
            currentMove: positions[i].san
          });
        }

        const evalRes = await this.stockfish.evaluate(positions[i].fen, depth, 1500);
        evals.push(evalRes || {
          scoreCp: 0,
          score: '0.00',
          bestMove: { san: '?' }
        });
      }

      // Step 2: Compute centipawn loss per move
      let blundersCount = 0;
      let mistakesCount = 0;
      let inaccuraciesCount = 0;
      let totalLossWhite = 0;
      let countWhite = 0;
      let totalLossBlack = 0;
      let countBlack = 0;

      const analyzedMoves = [];

      for (let i = 1; i < positions.length; i++) {
        const posBefore = positions[i - 1];
        const posAfter = positions[i];
        const evalBefore = evals[i - 1];
        const evalAfter = evals[i];

        const turn = posAfter.turn; // 'w' or 'b' (side that made this move)
        const playedSan = posAfter.san;
        const bestSan = evalBefore?.bestMove?.san || '?';

        // Check if played move is the best move
        const isBest = (playedSan.replace(/[+#?!]/g, '') === bestSan.replace(/[+#?!]/g, ''));
        
        let lossCp = 0;
        if (!isBest && evalBefore && evalAfter) {
          // Both scores are from side-to-move's perspective
          lossCp = Math.max(0, evalBefore.scoreCp + evalAfter.scoreCp);
        }

        if (turn === 'w') {
          totalLossWhite += lossCp;
          countWhite++;
        } else {
          totalLossBlack += lossCp;
          countBlack++;
        }

        let severity = 'good';
        if (lossCp >= 200) {
          severity = 'blunder'; // 大漏 >= 2.00 兵
          blundersCount++;
        } else if (lossCp >= 100) {
          severity = 'mistake'; // 失误 >= 1.00 兵
          mistakesCount++;
        } else if (lossCp >= 40) {
          severity = 'inaccuracy'; // 疑问手 >= 0.40 兵
          inaccuraciesCount++;
        }

        const lossPawns = (lossCp / 100).toFixed(2);

        analyzedMoves.push({
          ply: posAfter.ply,
          moveNumber: posAfter.moveNumber,
          turn,
          san: playedSan,
          bestSan,
          lossCp,
          lossPawns: `-${lossPawns}`,
          severity,
          evalBefore: evalBefore.score,
          evalAfter: evalAfter.score,
          fenBefore: posBefore.fen,
          fenAfter: posAfter.fen,
          element: posAfter.moveEl,
          isHumanTrap: false,
          humanProbability: null
        });
      }

      // Step 3: Rank critical moments by lossCp descending
      const keyMoments = analyzedMoves
        .filter(m => m.lossCp >= 40)
        .sort((a, b) => b.lossCp - a.lossCp);

      // Step 4: Check Maia human intuition trap on top 5 critical moments
      if (this.maiaEngine && keyMoments.length > 0) {
        const topMomentsToCheck = keyMoments.slice(0, 5);
        for (let j = 0; j < topMomentsToCheck.length; j++) {
          if (this.isCancelled) break;
          const moment = topMomentsToCheck[j];

          if (onProgress) {
            onProgress({
              phase: 'intuition',
              current: j + 1,
              total: topMomentsToCheck.length,
              percent: 85 + Math.round(((j + 1) / topMomentsToCheck.length) * 15),
              currentMove: moment.san
            });
          }

          try {
            const pred = await this.maiaEngine.predict(moment.fenBefore, elo);
            if (pred && pred.moves) {
              const cleanPlayed = moment.san.replace(/[+#?!]/g, '');
              const matched = pred.moves.find(m => m.san.replace(/[+#?!]/g, '') === cleanPlayed || m.uci === cleanPlayed);
              if (matched) {
                moment.isHumanTrap = true;
                moment.humanProbability = matched.probability;
              }
            }
          } catch (e) {
            console.warn('[GameAnalyzer] Maia prediction error on key moment:', e);
          }
        }
      }

      const result = {
        totalMoves: positions.length - 1,
        blundersCount,
        mistakesCount,
        inaccuraciesCount,
        acplWhite: countWhite > 0 ? Math.round(totalLossWhite / countWhite) : 0,
        acplBlack: countBlack > 0 ? Math.round(totalLossBlack / countBlack) : 0,
        allMoves: analyzedMoves,
        keyMoments
      };

      this.lastReviewResult = result;
      this.isAnalyzing = false;
      return result;
    } catch (err) {
      this.isAnalyzing = false;
      throw err;
    }
  }

  /**
   * Jump to a specific move on the board
   */
  static jumpToMove(moveItem) {
    if (moveItem?.element) {
      try {
        moveItem.element.click();
        moveItem.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
      } catch (e) {
        console.warn('[GameAnalyzer] Failed to click move element:', e);
      }
    }
    return false;
  }
}
