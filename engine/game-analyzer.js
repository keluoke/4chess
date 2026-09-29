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

    // Extract starting FEN if specified via [FEN "..."] header
    let startFen = null;
    const fenMatch = pgnText.match(/\[FEN\s+"([^"]+)"\]/i);
    if (fenMatch && fenMatch[1]) {
      startFen = fenMatch[1].trim();
    }

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

    if (startFen) {
      moves.startFen = startFen;
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
  /**
   * Reads game data from Main World page context via synchronous CustomEvent bridge
   */
  static async fetchMainWorldGameData() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    return new Promise((resolve) => {
      let resolved = false;
      const handler = (e) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('__MAIA_PAGE_DATA_RES__', handler);
        resolve(e.detail || null);
      };
      window.addEventListener('__MAIA_PAGE_DATA_RES__', handler);

      const script = document.createElement('script');
      script.textContent = `
        (function() {
          try {
            const b = document.querySelector('wc-chess-board, chess-board');
            const g = b?.game || b?.controller;
            const pgn = g?.getPGN?.() || b?.getPGN?.() || g?.getOptions?.()?.pgn || '';
            const moveList = g?.moveList || g?.getOptions?.()?.moveList || '';
            const movesAttr = b?.getAttribute?.('moves') || '';
            window.dispatchEvent(new CustomEvent('__MAIA_PAGE_DATA_RES__', {
              detail: { pgn, moveList, movesAttr }
            }));
          } catch (e) {
            window.dispatchEvent(new CustomEvent('__MAIA_PAGE_DATA_RES__', { detail: null }));
          }
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('__MAIA_PAGE_DATA_RES__', handler);
          resolve(null);
        }
      }, 150);
    });
  }

  /**
   * Converts UCI move string ("e2e4 e7e5 g1f3") to SAN move array
   */
  static uciMovesToSanMoves(uciMovesStr) {
    if (!uciMovesStr || typeof uciMovesStr !== 'string') return [];
    const uciList = uciMovesStr.trim().split(/\s+/).filter(Boolean);
    if (uciList.length === 0) return [];
    const chess = new ChessBoard();
    const moves = [];

    for (let i = 0; i < uciList.length; i++) {
      const uci = uciList[i];
      const legals = chess.getLegalMoves();
      const found = legals.find(m => m.uci === uci || (m.fromSq + m.toSq === uci.slice(0, 4)));
      if (!found) break;
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
   * Multi-tiered move extraction from Lichess & Chess.com:
   * Tier 1: Lichess Direct JSON & PGN API (with 8-character ID normalization)
   * Tier 2: Main World Injected Bridge (reads board.game.getPGN() & moveList)
   * Tier 3: Board element attributes (e.g. <chess-board moves="...">)
   * Tier 4: Chess.com Callback API (TCN decode)
   * Tier 5: DOM Move elements with Figurine Icon recovery
   * Tier 6: In-page PGN textareas
   */
  static async extractPageMoves(platform) {
    if (typeof window === 'undefined') return [];

    // ------------------------------------------------------------------
    // Tier 1: Lichess Direct Export API (CORS is open)
    // ------------------------------------------------------------------
    if (window.location.hostname.includes('lichess')) {
      const lichessMatch = window.location.pathname.match(/^\/([a-zA-Z0-9]{8,12})/);
      if (lichessMatch && lichessMatch[1]) {
        const cleanId = lichessMatch[1].slice(0, 8);
        console.log(`[GameAnalyzer] ⚡ Fetching Lichess game data for ID ${cleanId}...`);

        try {
          const resp = await fetch(`https://lichess.org/game/export/${cleanId}?moves=true&pgnInJson=true`, {
            headers: { 'Accept': 'application/json' }
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.pgn) {
              const moves = GameAnalyzer.parsePgn(data.pgn);
              if (moves.length > 0) {
                console.log(`[GameAnalyzer] ✅ Retrieved ${moves.length} moves from Lichess JSON API!`);
                return moves;
              }
            }
          }
        } catch (e) {}

        // Fallback to background worker
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          try {
            const res = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                type: 'FETCH_LICHESS_GAME_PGN',
                gameId: cleanId
              }, resolve);
            });
            if (res && res.ok && res.pgn) {
              const moves = GameAnalyzer.parsePgn(res.pgn);
              if (moves.length > 0) {
                console.log(`[GameAnalyzer] ✅ Retrieved ${moves.length} moves via Lichess Background Worker!`);
                return moves;
              }
            }
          } catch (e) {}
        }
      }
    }

    // ------------------------------------------------------------------
    // Tier 2: Chess.com Main World Script Bridge (Instant & Complete)
    // ------------------------------------------------------------------
    if (window.location.hostname.includes('chess.com')) {
      try {
        const mainData = await GameAnalyzer.fetchMainWorldGameData();
        if (mainData) {
          if (mainData.moveList) {
            const moves = GameAnalyzer.tcnToSanMoves(mainData.moveList);
            if (moves.length > 0) {
              console.log(`[GameAnalyzer] ✅ Retrieved ${moves.length} moves from Main World moveList!`);
              return moves;
            }
          }
          if (mainData.pgn) {
            const moves = GameAnalyzer.parsePgn(mainData.pgn);
            if (moves.length > 0) {
              console.log(`[GameAnalyzer] ✅ Retrieved ${moves.length} moves from Main World PGN!`);
              return moves;
            }
          }
          if (mainData.movesAttr) {
            const moves = GameAnalyzer.uciMovesToSanMoves(mainData.movesAttr);
            if (moves.length > 0) {
              console.log(`[GameAnalyzer] ✅ Retrieved ${moves.length} moves from Main World moves attribute!`);
              return moves;
            }
          }
        }
      } catch (e) {
        console.warn('[GameAnalyzer] Main World Bridge notice:', e);
      }
    }

    // ------------------------------------------------------------------
    // Tier 3: Chess.com <chess-board moves="..."> attribute
    // ------------------------------------------------------------------
    const boardEl = document.querySelector('wc-chess-board, chess-board');
    if (boardEl) {
      const movesAttr = boardEl.getAttribute('moves');
      if (movesAttr) {
        const moves = GameAnalyzer.uciMovesToSanMoves(movesAttr);
        if (moves.length > 0) {
          console.log(`[GameAnalyzer] ✅ Retrieved ${moves.length} moves from board moves attribute!`);
          return moves;
        }
      }
    }

    // ------------------------------------------------------------------
    // Tier 4: Chess.com Callback API & TCN Decoder
    // ------------------------------------------------------------------
    const numMatch = window.location.pathname.match(/\b(\d{8,15})\b/);
    if (numMatch && numMatch[1] && window.location.hostname.includes('chess.com')) {
      const gameId = numMatch[1];
      const gameType = window.location.pathname.includes('daily') ? 'daily' : 'live';
      console.log(`[GameAnalyzer] ⚡ Querying Chess.com callback for game ID ${gameId}...`);

      for (const t of [gameType, 'live', 'daily']) {
        try {
          const cbUrl = `/callback/${t}/game/${gameId}`;
          const cbRes = await fetch(cbUrl, {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
          });
          if (cbRes.ok) {
            const cbData = await cbRes.json();
            if (cbData.game?.moveList) {
              const moves = GameAnalyzer.tcnToSanMoves(cbData.game.moveList);
              if (moves.length > 0) {
                console.log(`[GameAnalyzer] ✅ Decoded ${moves.length} moves from ${t} callback!`);
                return moves;
              }
            }
            if (cbData.game?.pgn) {
              const moves = GameAnalyzer.parsePgn(cbData.game.pgn);
              if (moves.length > 0) return moves;
            }
          }
        } catch (cbErr) {}
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
            if (res.moves && res.moves.length > 0) return res.moves;
            if (res.pgn) {
              const moves = GameAnalyzer.parsePgn(res.pgn);
              if (moves.length > 0) return moves;
            }
          }
        } catch (bgErr) {}
      }
    }

    // ------------------------------------------------------------------
    // Tier 5: Search for Move elements in DOM (with figurine icon recovery)
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

        foundEls.forEach((el) => {
          const plyAttr = el.getAttribute('data-ply');
          const ply = plyAttr ? parseInt(plyAttr, 10) : (candidateMoves.length + 1);
          if (seenPlys.has(ply)) return;

          let raw = el.textContent.replace(/\d+[\.\s]+/g, '').trim();
          let san = raw.split(/\s+/)[0];

          // Figurine / Piece Icon detection
          const iconEl = el.querySelector('[class*="knight"], [class*="bishop"], [class*="rook"], [class*="queen"], [class*="king"], [data-piece]');
          if (iconEl && san && /^[a-h1-8x+#=\-]+$/i.test(san)) {
            const cls = iconEl.className || '';
            const dp = iconEl.getAttribute('data-piece');
            let prefix = '';
            if (dp) prefix = dp.toUpperCase();
            else if (cls.includes('knight')) prefix = 'N';
            else if (cls.includes('bishop')) prefix = 'B';
            else if (cls.includes('rook')) prefix = 'R';
            else if (cls.includes('queen')) prefix = 'Q';
            else if (cls.includes('king')) prefix = 'K';
            if (prefix) san = prefix + san;
          }

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
          console.log(`[GameAnalyzer] ✅ Found ${candidateMoves.length} moves via DOM selectors!`);
          return candidateMoves;
        }
      }

      // ------------------------------------------------------------------
      // Tier 6: In-page PGN textareas
      // ------------------------------------------------------------------
      const pgnElements = document.querySelectorAll('textarea.share-menu-tab-pgn-textarea, textarea.copyable, .copyables textarea, [pgn-headers], [pgn]');
      for (const el of pgnElements) {
        const rawPgn = el.value || el.getAttribute('pgn') || el.textContent;
        if (rawPgn && rawPgn.includes('1.')) {
          const moves = GameAnalyzer.parsePgn(rawPgn);
          if (moves.length > 0) return moves;
        }
      }
    }

    return [];
  }

  /**
   * Replays moves to construct position chain
   */
  static buildPositionChain(moves) {
    const startFen = moves?.startFen || ChessBoard.INITIAL_FEN;
    const chess = new ChessBoard(startFen);
    const positions = [{
      ply: 0,
      moveNumber: chess.fullMoves,
      turn: chess.turn,
      fen: chess.getFen(),
      san: 'Start',
      moveEl: null
    }];

    let isPartial = false;
    let stoppedAtPly = null;
    let unparsedSan = null;

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
        isPartial = true;
        stoppedAtPly = i + 1;
        unparsedSan = mItem.san;
        break;
      }

      const sidePlayed = chess.turn;
      const moveNumber = chess.fullMoves;
      chess.makeMove(matched);
      positions.push({
        ply: i + 1,
        moveNumber,
        turn: sidePlayed,
        san: mItem.san,
        uci: matched.uci || `${matched.fromSq || matched.from}${matched.toSq || matched.to}`,
        from: matched.fromSq || matched.from,
        to: matched.toSq || matched.to,
        fen: chess.getFen(),
        moveEl: mItem.element
      });
    }

    positions.isPartial = isPartial;
    positions.stoppedAtPly = stoppedAtPly;
    positions.unparsedSan = unparsedSan;

    return positions;
  }

  static memoryCache = new Map();

  static hashString(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  /**
   * Generates a stable unique cache key for the current game
   */
  static getGameKey(moves, options = {}) {
    const { depth = 6, elo = 1900 } = options;
    const startFen = moves?.startFen || 'start';
    const moveSans = (moves || []).map(m => m.san || '').join(',');
    const hash = GameAnalyzer.hashString(`${startFen}|${moveSans}|${depth}|${elo}|sf19lite`);

    if (typeof window !== 'undefined') {
      const href = window.location.href;
      // Lichess game ID: 8 characters (e.g. lichess.org/38uTqNdksSRF -> lichess_38uTqNdk)
      if (href.includes('lichess.org')) {
        const m = window.location.pathname.match(/^\/([a-zA-Z0-9]{8})/);
        if (m && m[1]) return `lichess_${m[1]}_${hash.slice(0, 10)}`;
      }
      // Chess.com game ID (e.g. /game/live/184446398482 or /analysis/game/live/184446398482)
      if (href.includes('chess.com')) {
        const m = window.location.pathname.match(/\b(\d{8,15})\b/);
        if (m && m[1]) return `chesscom_${m[1]}_${hash.slice(0, 10)}`;
      }
    }

    // Universal fallback: deterministic 64-bit hash over moves sequence & params
    if (moves && moves.length > 0) {
      return `game_${moves.length}_${hash.slice(0, 12)}`;
    }

    return null;
  }

  /**
   * Retrieves cached review result from persistent storage (L1 memory, L2 chrome.storage)
   */
  static async getCachedReview(cacheKey) {
    if (!cacheKey) return null;
    try {
      const storageKey = `maia3_review_${cacheKey}`;
      // L1: Memory Cache
      if (GameAnalyzer.memoryCache.has(storageKey)) {
        return GameAnalyzer.memoryCache.get(storageKey);
      }

      // L2: Persistent chrome.storage.local
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = await new Promise(resolve => {
          chrome.storage.local.get([storageKey], resolve);
        });
        if (data && data[storageKey] && data[storageKey].result) {
          const res = data[storageKey].result;
          GameAnalyzer.memoryCache.set(storageKey, res);
          console.log(`[GameAnalyzer] ⚡ Loaded review from persistent cache for ${cacheKey}`);
          return res;
        }
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.result) {
            GameAnalyzer.memoryCache.set(storageKey, parsed.result);
            return parsed.result;
          }
        }
      }
    } catch (e) {
      console.warn('[GameAnalyzer] Failed to read cached review:', e);
    }
    return null;
  }

  /**
   * Saves review result to persistent storage (excluding DOM node handles)
   */
  static async saveCachedReview(cacheKey, result) {
    if (!cacheKey || !result) return;
    try {
      const storageKey = `maia3_review_${cacheKey}`;
      const cleanResult = {
        totalMoves: result.totalMoves,
        blundersCount: result.blundersCount,
        mistakesCount: result.mistakesCount,
        inaccuraciesCount: result.inaccuraciesCount,
        acplWhite: result.acplWhite,
        acplBlack: result.acplBlack,
        cachedAt: Date.now(),
        allMoves: (result.allMoves || []).map(m => ({
          ...m,
          element: null
        })),
        keyMoments: (result.keyMoments || []).map(m => ({
          ...m,
          element: null
        }))
      };

      // Save to L1 Memory Cache
      GameAnalyzer.memoryCache.set(storageKey, cleanResult);

      // Save to L2 Persistent Storage
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await new Promise(resolve => {
          chrome.storage.local.set({ [storageKey]: { result: cleanResult } }, resolve);
        });
        console.log(`[GameAnalyzer] 💾 Persisted review to storage for ${cacheKey}`);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify({ result: cleanResult }));
      }
    } catch (e) {
      console.warn('[GameAnalyzer] Failed to save cached review:', e);
    }
  }

  /**
   * Run full game analysis
   */
  async analyzeGame(moves, options = {}) {
    if (this.isAnalyzing) return null;
    this.isAnalyzing = true;
    this.isCancelled = false;

    const {
      depth = 6,
      elo = 1900,
      forceRefresh = false,
      onProgress = null
    } = options;

    const cacheKey = GameAnalyzer.getGameKey(moves, { depth, elo });

    // 1. Instant Cache Hit Check (0ms response)
    if (!forceRefresh && cacheKey) {
      const cached = await GameAnalyzer.getCachedReview(cacheKey);
      if (cached) {
        this.lastReviewResult = cached;
        this.isAnalyzing = false;
        if (onProgress) {
          onProgress({
            phase: 'done',
            current: cached.totalMoves,
            total: cached.totalMoves,
            percent: 100,
            fromCache: true
          });
        }
        return cached;
      }
    }

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
      let evalFailures = 0;
      let consecutiveFailures = 0;

      // Step 0: Pre-flight check - ensure Stockfish is initialized and ready
      if (this.stockfish && !this.stockfish.isReady) {
        console.log('[GameAnalyzer] Awaiting Stockfish engine initialization before review...');
        const ready = await this.stockfish.initialize();
        if (!ready || !this.stockfish.isReady) {
          throw new Error('Stockfish WebAssembly 引擎初始化超时或未就绪，无法开始复盘分析');
        }
      }

      // Step 1: Evaluate each position with Stockfish 19
      for (let i = 0; i < totalPositions; i++) {
        if (this.isCancelled) {
          this.isAnalyzing = false;
          return null;
        }

        // Live game lockdown check
        if (typeof window !== 'undefined' && window.FairPlayGuard && window.FairPlayGuard.isLiveGameInProgress()) {
          this.isCancelled = true;
          this.isAnalyzing = false;
          throw new Error('公平竞技保护生效中，禁止进行复盘分析');
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

        // Fast evaluation with depth 6, 3500ms timeout, and multipv 1
        const evalRes = await this.stockfish.evaluate(positions[i].fen, depth, 3500, 1);
        if (!evalRes) {
          evalFailures++;
          consecutiveFailures++;
          // Reset engine state so timeout doesn't cascade to next move
          if (this.stockfish?.stop) {
            this.stockfish.stop();
          }
          await new Promise(r => setTimeout(r, 20));

          // Early Circuit Breaker: Stop early if engine is permanently dead
          if (consecutiveFailures >= 3) {
            throw new Error(`Stockfish 引擎计算无响应 (已连续失败 ${consecutiveFailures} 步)，已触发熔断保护终止复盘。`);
          }
        } else {
          consecutiveFailures = 0;
        }
        evals.push(evalRes);
      }

      // If failure rate > 30%, fail cleanly instead of masquerading
      if (evalFailures > 0 && (evalFailures / totalPositions) > 0.3) {
        throw new Error(`引擎计算超时或无响应，失败率过高 (${evalFailures}/${totalPositions})，无法生成可信复盘`);
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

        const turn = posAfter.turn; // side that made this move ('w' or 'b')
        const playedSan = posAfter.san;
        const bestSan = evalBefore?.bestMove?.san || '?';

        let lossCp = 0;
        let severity = 'good';

        if (evalBefore && evalAfter) {
          const isBest = (bestSan !== '?') && (playedSan.replace(/[+#?!]/g, '') === bestSan.replace(/[+#?!]/g, ''));
          if (!isBest) {
            // Clamp scores to [-1000, 1000] to handle checkmates smoothly
            const cpBefore = Math.max(-1000, Math.min(1000, evalBefore.scoreCp || 0));
            const cpAfter = Math.max(-1000, Math.min(1000, evalAfter.scoreCp || 0));
            lossCp = Math.max(0, cpBefore + cpAfter);
          }

          if (turn === 'w') {
            totalLossWhite += lossCp;
            countWhite++;
          } else {
            totalLossBlack += lossCp;
            countBlack++;
          }

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
        } else {
          severity = 'unknown';
        }

        const lossPawns = (lossCp / 100).toFixed(2);

        analyzedMoves.push({
          ply: posAfter.ply,
          moveNumber: posAfter.moveNumber,
          turn,
          san: playedSan,
          uci: posAfter.uci || null,
          from: posAfter.from || null,
          to: posAfter.to || null,
          bestSan,
          bestMove: evalBefore?.bestMove || null,
          bestUci: evalBefore?.bestMove?.uci || null,
          lossCp,
          lossPawns: `-${lossPawns}`,
          severity,
          evalBefore: evalBefore ? evalBefore.score : '?',
          evalAfter: evalAfter ? evalAfter.score : '?',
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
              const matchedIdx = pred.moves.findIndex(m => m.san.replace(/[+#?!]/g, '') === cleanPlayed || m.uci === cleanPlayed);
              if (matchedIdx !== -1) {
                const matched = pred.moves[matchedIdx];
                const prob = typeof matched.prob === 'number' ? matched.prob : 0;
                moment.humanProbability = prob;
                // Genuine Human Trap: Maia strongly favors this blunder (Rank #1 or #2, or >= 15% probability)
                if (matchedIdx <= 1 || prob >= 15.0) {
                  moment.isHumanTrap = true;
                }
              }
            }
          } catch (e) {
            console.warn('[GameAnalyzer] Maia prediction error on key moment:', e);
          }
        }
      }

      const result = {
        totalMoves: positions.length - 1,
        isPartial: !!positions.isPartial,
        stoppedAtPly: positions.stoppedAtPly || null,
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

      // Save to Persistent Cache ONLY if complete and no engine evaluation failures occurred
      if (cacheKey && !positions.isPartial && evalFailures === 0) {
        await GameAnalyzer.saveCachedReview(cacheKey, result);
      }

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

    // If original DOM element is available and still connected, directly click it
    if (targetPly === null && moveItem.element && typeof document !== 'undefined' && document.contains(moveItem.element)) {
      dispatchSyntheticClick(moveItem.element);
      moveItem.element.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      return true;
    }

    // -------------------------------------------------------------
    // Platform 1: Lichess
    // -------------------------------------------------------------
    if (isLichess) {
      let lichessJumpTriggered = false;
      // Main World API jump (Lila official controller API: jumpToMain or jump with tree path)
      try {
        const script = document.createElement('script');
        script.textContent = `
          (function() {
            try {
              if (window.lichess && window.lichess.analysis) {
                if (typeof window.lichess.analysis.jumpToMain === 'function') {
                  window.lichess.analysis.jumpToMain(${ply});
                  return;
                }
                if (window.lichess.analysis.tree && typeof window.lichess.analysis.tree.pathAtMain === 'function') {
                  window.lichess.analysis.jump(window.lichess.analysis.tree.pathAtMain(${ply}));
                  return;
                }
                if (typeof window.lichess.analysis.jump === 'function') {
                  window.lichess.analysis.jump(${ply});
                }
              }
            } catch (e) {}
          })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        lichessJumpTriggered = true;
      } catch (e) {}

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

      return lichessJumpTriggered;
    }

    // -------------------------------------------------------------
    // Platform 2: Chess.com Multi-Tier Strategy (Without URL Conflict)
    // -------------------------------------------------------------
    if (isChesscom) {
      let chesscomJumpTriggered = false;
      // Tier 1: Main World Injected Bridge (native chess-board controller API)
      try {
        const script = document.createElement('script');
        script.textContent = `
          (function() {
            try {
              const b = document.querySelector('wc-chess-board, chess-board');
              const targets = [b?.game, b?.game?.controller, b?.controller, b];
              for (const tgt of targets) {
                if (!tgt) continue;
                for (const m of ['goToPly', 'jumpToPly', 'goTo', 'jumpTo', 'seek', 'goToMove']) {
                  if (typeof tgt[m] === 'function') {
                    tgt[m](${ply});
                    return;
                  }
                }
              }
            } catch (e) {}
          })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        chesscomJumpTriggered = true;
      } catch (e) {}

      // Tier 2: Directly dispatch synthetic click on target move node in DOM
      if (ply === 0) {
        const firstBtn = document.querySelector('button[data-cy="nav-first"], button[aria-label*="First" i], button.chevron-first, .board-controls-first, [class*="chevron-first"], [data-tab="first"]');
        if (firstBtn) {
          dispatchSyntheticClick(firstBtn);
          console.log(`[GameAnalyzer] ✅ Jumped to ply 0 via nav-first button`);
          return true;
        }
      } else {
        // Direct data-ply attribute match
        const plySelectors = [
          `[data-ply="${ply}"]`,
          `wc-vertical-move-list [data-ply="${ply}"]`,
          `.vertical-move-list [data-ply="${ply}"]`,
          `.move-list-wrapper [data-ply="${ply}"]`,
          `.main-line-row [data-ply="${ply}"]`
        ];
        for (const sel of plySelectors) {
          const el = document.querySelector(sel);
          if (el) {
            dispatchSyntheticClick(el);
            el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            console.log(`[GameAnalyzer] ✅ Jumped to ply ${ply} via selector "${sel}"`);
            return true;
          }
        }

        // Sequential index matching in move list:
        // Filter out move-number labels (e.g. "1.", "2.", "15.") so array is strictly half-moves [ply1, ply2, ply3, ...]
        const moveContainers = document.querySelectorAll('wc-vertical-move-list, .vertical-move-list, .move-list-wrapper, .keyboard-move-list, .main-line-row');
        for (const container of moveContainers) {
          const nodes = Array.from(container.querySelectorAll('.node, [class*="move-node"], [class*="node-text"]')).filter(el => {
            if (el.classList.contains('node-number') || el.classList.contains('move-number') || el.classList.contains('round-number')) return false;
            const text = (el.textContent || '').trim();
            if (/^\d+\.?$/.test(text)) return false;
            return text.length > 0 || el.querySelector('[class*="piece"], [data-piece]');
          });

          if (nodes.length >= ply) {
            const targetEl = nodes[ply - 1];
            if (targetEl) {
              dispatchSyntheticClick(targetEl);
              targetEl.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
              console.log(`[GameAnalyzer] ✅ Jumped to ply ${ply} via move list node [${ply - 1}]`);
              return true;
            }
          }
        }

        // Global fallback for move nodes across document
        const allMoveNodes = Array.from(document.querySelectorAll('.vertical-move-list .node, .move-list-wrapper .node, wc-vertical-move-list .node, .keyboard-move-list .node, .main-line-row .node')).filter(el => {
          if (el.classList.contains('node-number') || el.classList.contains('move-number') || el.classList.contains('round-number')) return false;
          const text = (el.textContent || '').trim();
          if (/^\d+\.?$/.test(text)) return false;
          return text.length > 0 || el.querySelector('[class*="piece"], [data-piece]');
        });

        if (allMoveNodes.length >= ply) {
          const targetEl = allMoveNodes[ply - 1];
          if (targetEl) {
            dispatchSyntheticClick(targetEl);
            targetEl.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            console.log(`[GameAnalyzer] ✅ Jumped to ply ${ply} via global move node [${ply - 1}]`);
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

      return chesscomJumpTriggered;
    }

    return false;
  }
}
