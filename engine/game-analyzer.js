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
   * Decode Chess.com TCN (Trickle Chess Notation) string into move coordinates
   */
  static decodeTcn(tcnString) {
    if (!tcnString || typeof tcnString !== 'string') return [];
    const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=";
    const PROMO_PIECES = "qnrbkp";
    const moves = [];

    for (let i = 0; i < tcnString.length; i += 2) {
      const code1 = ALPHABET.indexOf(tcnString[i]);
      let code2 = ALPHABET.indexOf(tcnString[i + 1]);
      if (code1 === -1 || code2 === -1) continue;

      const move = {};
      if (code2 > 63) {
        const promoIndex = Math.floor((code2 - 64) / 3);
        move.promotion = PROMO_PIECES[promoIndex];
        const offset = ((code2 - 1) % 3) - 1;
        code2 = code1 + (code1 < 16 ? -8 : 8) + offset;
      }
      if (code1 > 75) {
        const dropIndex = code1 - 79;
        move.drop = PROMO_PIECES[dropIndex];
      } else {
        const file = code1 % 8;
        const rank = Math.floor(code1 / 8) + 1;
        move.from = 'abcdefgh'[file] + rank;
      }
      const file = code2 % 8;
      const rank = Math.floor(code2 / 8) + 1;
      move.to = 'abcdefgh'[file] + rank;

      moves.push(move);
    }
    return moves;
  }

  /**
   * Converts Chess.com TCN string into array of validated SAN moves using ChessBoard
   */
  static tcnToSanMoves(tcnString) {
    const tcnMoves = GameAnalyzer.decodeTcn(tcnString);
    if (!tcnMoves || tcnMoves.length === 0) return [];

    const chess = new ChessBoard();
    const moves = [];

    for (let i = 0; i < tcnMoves.length; i++) {
      const mv = tcnMoves[i];
      const uci = mv.from + mv.to + (mv.promotion || '');
      const legals = chess.getLegalMoves();
      const found = legals.find(m => m.uci === uci || (m.fromSq === mv.from && m.toSq === mv.to));
      if (!found) {
        console.warn(`[GameAnalyzer] TCN replay stopped at ply ${i + 1}: ${uci}`);
        break;
      }
      chess.makeMove(found);
      moves.push({
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        turn: (i % 2 === 0) ? 'w' : 'b',
        san: found.san,
        element: null
      });
    }

    return moves;
  }

  /**
   * Multi-tiered move extraction from Lichess / Chess.com:
   * Tier 1: Chess.com Callback API & TCN Decoder (Instant & 100% reliable for /game/live/:id, /game/daily/:id)
   * Tier 2: Board Web Component & in-page PGN textarea
   * Tier 3: DOM move elements & attributes
   * Tier 4: Lichess Game Export API
   */
  static async extractPageMoves(platform) {
    if (typeof window === 'undefined') return [];

    // ------------------------------------------------------------------
    // Tier 1: Chess.com Callback API & TCN Decoder
    // Direct, fast (<30ms), zero dependency, bypasses page DOM delays completely
    // ------------------------------------------------------------------
    const chesscomMatch = window.location.pathname.match(/\/(?:game|analysis\/game)\/(live|daily)\/(\d+)/);
    if (chesscomMatch && chesscomMatch[2]) {
      const gameType = chesscomMatch[1];
      const gameId = chesscomMatch[2];
      console.log(`[GameAnalyzer] ⚡ Querying Chess.com callback for game ID ${gameId}...`);

      try {
        const cbUrl = `/callback/${gameType}/game/${gameId}`;
        const cbRes = await fetch(cbUrl, {
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });
        if (cbRes.ok) {
          const cbData = await cbRes.json();
          if (cbData.game?.moveList) {
            const moves = GameAnalyzer.tcnToSanMoves(cbData.game.moveList);
            if (moves.length > 0) {
              console.log(`[GameAnalyzer] ✅ Successfully decoded ${moves.length} moves from Chess.com TCN callback!`);
              return moves;
            }
          }
          if (cbData.game?.pgn) {
            const moves = GameAnalyzer.parsePgn(cbData.game.pgn);
            if (moves.length > 0) return moves;
          }
        }
      } catch (cbErr) {
        console.warn('[GameAnalyzer] Same-origin callback fetch notice:', cbErr);
      }

      // Background service worker fallback
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const res = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'FETCH_CHESSCOM_GAME_PGN',
              gameId,
              gameType
            }, resolve);
          });
          if (res && res.ok) {
            if (res.moves && res.moves.length > 0) {
              console.log(`[GameAnalyzer] ✅ Retrieved ${res.moves.length} moves via Background TCN!`);
              return res.moves;
            }
            if (res.pgn) {
              const moves = GameAnalyzer.parsePgn(res.pgn);
              if (moves.length > 0) return moves;
            }
          }
        } catch (bgErr) {
          console.warn('[GameAnalyzer] Background messaging fallback notice:', bgErr);
        }
      }
    }
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
      // Tier 4: Lichess Game Export API
      // ------------------------------------------------------------------
      const lichessMatch = window.location.pathname.match(/^\/([a-zA-Z0-9]{8,12})(?:\/|$)/);
      if (lichessMatch && lichessMatch[1] && window.location.hostname.includes('lichess')) {
        const gameId = lichessMatch[1];
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          try {
            const res = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                type: 'FETCH_LICHESS_GAME_PGN',
                gameId
              }, resolve);
            });
            if (res && res.ok && res.pgn) {
              const moves = GameAnalyzer.parsePgn(res.pgn);
              if (moves.length > 0) {
                console.log(`[GameAnalyzer] ✅ Successfully retrieved ${moves.length} moves via Lichess Background API!`);
                return moves;
              }
            }
          } catch (lErr) {
            console.warn('[GameAnalyzer] Lichess background export notice:', lErr);
          }
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
      elo = 1900,
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
   * Jump to a specific move on the board (Lichess & Chess.com)
   * @param {Object} moveItem - The blunder or move object
   * @param {number|null} targetPly - Explicit ply to jump to (defaults to decision point before move: moveItem.ply - 1)
   */
  static jumpToMove(moveItem, targetPly = null) {
    if (!moveItem) return false;
    const ply = (targetPly !== null && typeof targetPly === 'number')
      ? targetPly
      : Math.max(0, (moveItem.ply || 1) - 1);

    const isChesscom = typeof window !== 'undefined' && window.location.hostname.includes('chess.com');
    const isLichess = typeof window !== 'undefined' && window.location.hostname.includes('lichess');

    // Helper: dispatch full synthetic pointer/mouse events across shadow DOM boundaries
    const dispatchSyntheticClick = (el) => {
      if (!el) return;
      const opts = { bubbles: true, cancelable: true, composed: true, view: window, buttons: 1 };
      try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (e) {}
      try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('click', opts)); } catch (e) {}
      try { if (typeof el.click === 'function') el.click(); } catch (e) {}
    };

    // Helper: simulate arrow keys on all board/document event targets
    const dispatchArrow = (dir) => {
      const key = dir === 'left' ? 'ArrowLeft' : 'ArrowRight';
      const keyCode = dir === 'left' ? 37 : 39;
      const targets = [document.body, document.documentElement, document, window];
      const boardEl = document.querySelector('wc-chess-board, chess-board, cg-board');
      if (boardEl) targets.unshift(boardEl);

      for (const t of targets) {
        if (!t) continue;
        try {
          t.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true, view: window }));
          t.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true, view: window }));
        } catch (e) {}
      }
    };

    // -------------------------------------------------------------
    // Platform 1: Lichess
    // -------------------------------------------------------------
    if (isLichess) {
      if (ply === 0) {
        const firstBtn = document.querySelector('.analyse__controls .first, button[data-act="first"]');
        if (firstBtn) {
          dispatchSyntheticClick(firstBtn);
          return true;
        }
      } else {
        const lichessMoves = Array.from(document.querySelectorAll('.analyse__moves move, rm6 move, .tview2 u, .analyse__moves u'));
        if (lichessMoves[ply - 1]) {
          dispatchSyntheticClick(lichessMoves[ply - 1]);
          lichessMoves[ply - 1].scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
          return true;
        }
      }
    }

    // -------------------------------------------------------------
    // Platform 2: Chess.com Multi-Tier Strategy
    // -------------------------------------------------------------
    if (isChesscom) {
      // Tier 1: Check Web Component direct JavaScript API
      const boardEl = document.querySelector('wc-chess-board, chess-board');
      if (boardEl) {
        const targets = [boardEl.game, boardEl.game?.controller, boardEl.controller, boardEl];
        const methodNames = ['goToPly', 'jumpToPly', 'goTo', 'jumpTo', 'seek', 'goToMove'];
        for (const tgt of targets) {
          if (!tgt) continue;
          for (const m of methodNames) {
            if (typeof tgt[m] === 'function') {
              try {
                tgt[m](ply);
                console.log(`[GameAnalyzer] ✅ Jumped to ply ${ply} via ${m}()`);
                return true;
              } catch (e) {}
            }
          }
        }
      }

      // Tier 2: Directly dispatch synthetic click on target move node in DOM
      if (ply === 0) {
        const firstBtn = document.querySelector('button[data-cy="nav-first"], button[aria-label*="First" i], button.chevron-first, .board-controls-first, [class*="chevron-first"], [data-tab="first"]');
        if (firstBtn) {
          dispatchSyntheticClick(firstBtn);
          console.log(`[GameAnalyzer] ✅ Jumped to ply 0 via nav-first button`);
          return true;
        }
      } else {
        const moveSelectors = [
          `[data-ply="${ply}"]`,
          `wc-vertical-move-list [data-ply="${ply}"]`,
          `.vertical-move-list [data-ply="${ply}"]`,
          `.move-list-wrapper [data-ply="${ply}"]`,
          `.main-line-row [data-ply="${ply}"]`
        ];
        for (const sel of moveSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            dispatchSyntheticClick(el);
            el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            console.log(`[GameAnalyzer] ✅ Jumped to ply ${ply} via selector "${sel}"`);
            return true;
          }
        }

        // Sequential index search among all move nodes
        const allNodes = Array.from(document.querySelectorAll('.vertical-move-list .node, .move-list-wrapper .node, .keyboard-move-list .node, [data-ply], .main-line-row .node, wc-vertical-move-list .node'));
        if (allNodes.length >= ply) {
          const targetNode = allNodes[ply - 1];
          if (targetNode) {
            dispatchSyntheticClick(targetNode);
            targetNode.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            console.log(`[GameAnalyzer] ✅ Jumped to ply ${ply} via allNodes[${ply - 1}]`);
            return true;
          }
        }
      }

      // Tier 3: Use navigation buttons (nav-first then N times nav-next)
      const navFirst = document.querySelector('button[data-cy="nav-first"], button[aria-label*="First" i], button.chevron-first, .board-controls-first, [data-tab="first"]');
      const navNext = document.querySelector('button[data-cy="nav-next"], button[aria-label*="Next" i], button.chevron-right, .board-controls-next, [data-tab="next"]');
      if (navFirst && navNext) {
        dispatchSyntheticClick(navFirst);
        if (ply > 0) {
          for (let step = 0; step < ply; step++) {
            dispatchSyntheticClick(navNext);
          }
        }
        console.log(`[GameAnalyzer] ✅ Jumped to ply ${ply} via nav-first + ${ply}x nav-next`);
        return true;
      }

      // Tier 4: Keyboard navigation fallback (ArrowLeft to 0, then ArrowRight x ply)
      for (let k = 0; k < 120; k++) {
        dispatchArrow('left');
      }
      for (let k = 0; k < ply; k++) {
        dispatchArrow('right');
      }

      // Tier 5: URL query parameter & History state sync
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('move', String(ply));
        window.history.pushState({ move: ply }, '', url.toString());
        window.dispatchEvent(new PopStateEvent('popstate', { state: { move: ply } }));
      } catch (e) {}

      return true;
    }

    return false;
  }
}
