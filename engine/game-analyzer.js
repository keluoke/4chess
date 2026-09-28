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
   * Parse PGN string into array of SAN moves
   */
  static parsePgn(pgnText) {
    if (!pgnText || typeof pgnText !== 'string') return [];

    // Strip comments {...}
    let clean = pgnText.replace(/\{[^}]*\}/g, '');
    // Strip metadata headers [...]
    clean = clean.replace(/\[[^\]]*\]/g, '');
    // Strip variations (...)
    clean = clean.replace(/\([^)]*\)/g, '');
    // Strip game termination markers
    clean = clean.replace(/(1-0|0-1|1\/2-1\/2|\*)/g, '');

    const tokens = clean.trim().split(/\s+/);
    const moves = [];
    let ply = 0;

    for (const token of tokens) {
      if (!token) continue;
      // Skip pure move numbers like "1.", "12...", "1..."
      if (/^\d+\.*$/.test(token)) continue;

      // Extract SAN
      const san = token.replace(/^\d+\.*[\.\s]*/, '').trim();
      if (san && !san.startsWith('$')) {
        ply++;
        moves.push({
          ply,
          moveNumber: Math.floor((ply - 1) / 2) + 1,
          turn: ((ply - 1) % 2 === 0) ? 'w' : 'b',
          san,
          element: null
        });
      }
    }

    return moves;
  }

  /**
   * Multi-tiered move extraction from Lichess / Chess.com:
   * Tier 1: Expansive DOM move elements & attributes
   * Tier 2: Board Web Component & in-page PGN textarea
   * Tier 3: Chess.com API fetch for /game/live/:id and /game/daily/:id
   * Tier 4: Lichess Game Export API
   */
  static async extractPageMoves(platform) {
    // ------------------------------------------------------------------
    // Tier 1: Search for Move elements in DOM (Clickable nodes)
    // ------------------------------------------------------------------
    const domSelectors = [
      '[data-ply]',
      '.vertical-move-list .node',
      '.vertical-move-list .move-node',
      '.move-list-wrapper .node',
      '.move-list-wrapper .move-node',
      '.keyboard-move-list .node',
      'wc-vertical-move-list .node',
      '.main-line-row .node',
      '.main-line-row span.node',
      '.main-line-row span[class*="node"]',
      '.move-text-component',
      '.node[data-whole-move-number]',
      '.move-list-row .move-item',
      '.analyse__moves move',
      '.analyse__moves u',
      'rm6 move',
      '.tview2 u'
    ];

    if (typeof document !== 'undefined') {
      const foundEls = Array.from(document.querySelectorAll(domSelectors.join(', ')));
      if (foundEls.length > 0) {
        const candidateMoves = [];
        const seenPlys = new Set();

        foundEls.forEach((el, idx) => {
          const plyAttr = el.getAttribute('data-ply');
          const ply = plyAttr ? parseInt(plyAttr, 10) : (candidateMoves.length + 1);
          if (seenPlys.has(ply)) return;

          const raw = el.textContent.replace(/\d+[\.\s]+/g, '').trim();
          const san = raw.split(/\s+/)[0];
          // Validate standard chess notation (e.g. e4, Bxe5, O-O, etc.)
          if (san && /^[a-hA-HKQRNB][a-h1-8x+#=\-]*$|^O-O(-O)?\+?#?$/i.test(san)) {
            seenPlys.add(ply);
            candidateMoves.push({
              ply,
              moveNumber: Math.floor((ply - 1) / 2) + 1,
              turn: ((ply - 1) % 2 === 0) ? 'w' : 'b',
              san,
              element: el
            });
          }
        });

        if (candidateMoves.length > 0) {
          console.log(`[GameAnalyzer] Found ${candidateMoves.length} moves via DOM selectors!`);
          return candidateMoves;
        }
      }

      // ------------------------------------------------------------------
      // Tier 2: Check Board Web Component & In-Page PGN
      // ------------------------------------------------------------------
      const boardEl = document.querySelector('wc-chess-board, chess-board');
      if (boardEl) {
        if (typeof boardEl.game?.getPGN === 'function') {
          const pgn = boardEl.game.getPGN();
          const moves = GameAnalyzer.parsePgn(pgn);
          if (moves.length > 0) return moves;
        }
        if (typeof boardEl.getPGN === 'function') {
          const pgn = boardEl.getPGN();
          const moves = GameAnalyzer.parsePgn(pgn);
          if (moves.length > 0) return moves;
        }
      }

      // In-page PGN textareas or share attributes
      const pgnElements = document.querySelectorAll('textarea.share-menu-tab-pgn-textarea, textarea.copyable, .copyables textarea, [pgn-headers], [pgn]');
      for (const el of pgnElements) {
        const rawPgn = el.value || el.getAttribute('pgn') || el.textContent;
        if (rawPgn && rawPgn.includes('1.')) {
          const moves = GameAnalyzer.parsePgn(rawPgn);
          if (moves.length > 0) return moves;
        }
      }

      // ------------------------------------------------------------------
      // Tier 3: Chess.com API Fallback for /game/live/:id and /game/daily/:id
      // ------------------------------------------------------------------
      const chesscomMatch = window.location.pathname.match(/\/game\/(?:live|daily)\/(\d+)/);
      if (chesscomMatch && chesscomMatch[1]) {
        const gameId = chesscomMatch[1];
        console.log(`[GameAnalyzer] Querying Chess.com Public API for game ID ${gameId}...`);

        let username = null;
        const metaDesc = document.querySelector('meta[name="description"]')?.content;
        if (metaDesc) {
          const uMatch = metaDesc.match(/([a-zA-Z0-9_\-]+)\s*\(\d+\)\s*vs\s*([a-zA-Z0-9_\-]+)\s*\(\d+\)/);
          if (uMatch) {
            username = uMatch[2] || uMatch[1];
          }
        }

        if (!username) {
          const userEl = document.querySelector('.user-username-component, [data-test-element="user-tagline-username"]');
          if (userEl) username = userEl.textContent.trim();
        }

        if (!username && window.context?.user?.username) {
          username = window.context.user.username;
        }

        if (username) {
          try {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const apiUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${month}`;

            const resp = await fetch(apiUrl, {
              headers: { 'User-Agent': 'MaiaExtension/1.0 (contact@4chess.cc)' }
            });
            if (resp.ok) {
              const data = await resp.json();
              const targetGame = data.games?.find(g => g.url && g.url.includes(gameId));
              if (targetGame && targetGame.pgn) {
                const moves = GameAnalyzer.parsePgn(targetGame.pgn);
                if (moves.length > 0) {
                  console.log(`[GameAnalyzer] ✅ Successfully retrieved ${moves.length} moves from Chess.com API!`);
                  return moves;
                }
              }
            }
          } catch (apiErr) {
            console.warn('[GameAnalyzer] Chess.com API fetch notice:', apiErr);
          }
        }
      }

      // ------------------------------------------------------------------
      // Tier 4: Lichess Game Export API
      // ------------------------------------------------------------------
      const lichessMatch = window.location.pathname.match(/^\/([a-zA-Z0-9]{8,12})(?:\/|$)/);
      if (lichessMatch && lichessMatch[1] && window.location.hostname.includes('lichess')) {
        const gameId = lichessMatch[1];
        try {
          const resp = await fetch(`https://lichess.org/game/export/${gameId}?moves=true&pgnInJson=true`, {
            headers: { 'Accept': 'application/json' }
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.pgn) {
              const moves = GameAnalyzer.parsePgn(data.pgn);
              if (moves.length > 0) return moves;
            }
          }
        } catch (lErr) {
          console.warn('[GameAnalyzer] Lichess export notice:', lErr);
        }
      }
    }

    return [];
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
    if (!moveItem) return false;

    // 1. Direct DOM Element click
    if (moveItem.element && typeof moveItem.element.click === 'function') {
      try {
        moveItem.element.click();
        moveItem.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
      } catch (e) {}
    }

    // 2. Query DOM for [data-ply="X"]
    const plyEl = document.querySelector(`[data-ply="${moveItem.ply}"]`);
    if (plyEl && typeof plyEl.click === 'function') {
      try {
        plyEl.click();
        plyEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
      } catch (e) {}
    }

    // 3. Query DOM by move sequence index in .vertical-move-list or .main-line-row
    const allNodes = Array.from(document.querySelectorAll('.vertical-move-list .node, .move-list-wrapper .node, [data-ply], .main-line-row .node'));
    if (allNodes.length >= moveItem.ply) {
      const targetNode = allNodes[moveItem.ply - 1];
      if (targetNode && typeof targetNode.click === 'function') {
        try {
          targetNode.click();
          targetNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return true;
        } catch (e) {}
      }
    }

    // 4. Lichess specific jump
    if (window.location.hostname.includes('lichess')) {
      const lichessMoves = document.querySelectorAll('.analyse__moves move, rm6 move, .tview2 u');
      if (lichessMoves[moveItem.ply - 1]) {
        lichessMoves[moveItem.ply - 1].click();
        return true;
      }
    }

    // 5. Chess.com URL / State Update fallback (?move=X)
    if (window.location.hostname.includes('chess.com')) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('move', String(moveItem.ply));
        window.history.pushState({}, '', url.toString());
        // Trigger keyboard step navigation
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        return true;
      } catch (e) {}
    }

    return false;
  }
}
