/**
 * Maia 3 - Full Game Analyzer & Blunder Review Engine
 * Evaluates the entire game with Stockfish 19 WASM, calculates centipawn loss (Δ)
 * per move, and ranks critical turning points (Blunders / Mistakes) with quick jump navigation
 * and Maia human intuition trap detection.
 */

import { ChessBoard } from './chess-core.js';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { OpeningBook } from './opening-book.js';

export class GameAnalyzer {
  constructor(stockfishEngine, maiaEngine) {
    this.stockfish = stockfishEngine;
    this.maiaEngine = maiaEngine;
    this.isAnalyzing = false;
    this.isCancelled = false;
    this.lastReviewResult = null;
    this._runCounter = 0;
    this._currentRunId = 0;
  }

  cancel() {
    this.isCancelled = true;
    this._currentRunId = ++this._runCounter;
    this.isAnalyzing = false;
    if (this.stockfish?.stop) {
      try { this.stockfish.stop(); } catch (e) {}
    }
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

    // Extract metadata headers before stripping
    const whiteMatch = pgnText.match(/\[White\s+"([^"]+)"\]/i);
    const blackMatch = pgnText.match(/\[Black\s+"([^"]+)"\]/i);
    const whiteEloMatch = pgnText.match(/\[WhiteElo\s+"([^"]+)"\]/i);
    const blackEloMatch = pgnText.match(/\[BlackElo\s+"([^"]+)"\]/i);
    const resultMatch = pgnText.match(/\[Result\s+"([^"]+)"\]/i);

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
    if (whiteMatch) moves.white = whiteMatch[1].trim();
    if (blackMatch) moves.black = blackMatch[1].trim();
    if (whiteEloMatch) moves.whiteElo = whiteEloMatch[1].trim();
    if (blackEloMatch) moves.blackElo = blackEloMatch[1].trim();
    if (resultMatch) moves.result = resultMatch[1].trim();
    moves.rawPgn = pgnText;

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
   * Reconstructs standard PGN text from array of move objects and headers
   */
  static movesToPgn(moves, headers = {}) {
    if (!moves || moves.length === 0) return '';
    let pgn = '';
    const defHeaders = {
      Event: 'Live Chess',
      Site: 'Chess.com',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: 'White',
      Black: 'Black',
      Result: '*',
      ...headers
    };
    for (const [k, v] of Object.entries(defHeaders)) {
      if (v !== undefined && v !== null) {
        pgn += `[${k} "${v}"]\n`;
      }
    }
    pgn += '\n';
    for (let i = 0; i < moves.length; i++) {
      if (i % 2 === 0) {
        pgn += `${Math.floor(i / 2) + 1}. `;
      }
      pgn += `${moves[i].san} `;
    }
    pgn += defHeaders.Result || '*';
    return pgn.trim();
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
      window.dispatchEvent(new CustomEvent('__MAIA_PAGE_DATA_REQ__'));

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
      const NON_GAME_PATHS = new Set([
        'analysis', 'training', 'practice', 'puzzles', 'study', 'editor',
        'learn', 'tournament', 'broadcast', 'insights', 'streamer', 'patron',
        'stat', 'class', 'inbox', 'forum', 'team', 'player', 'coach'
      ]);
      if (lichessMatch && lichessMatch[1] && !NON_GAME_PATHS.has(lichessMatch[1].toLowerCase())) {
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
          let moves = [];
          if (mainData.pgn) {
            moves = GameAnalyzer.parsePgn(mainData.pgn);
          }
          if ((!moves || moves.length === 0) && mainData.moveList) {
            moves = GameAnalyzer.tcnToSanMoves(mainData.moveList);
          }
          if ((!moves || moves.length === 0) && mainData.movesAttr) {
            moves = GameAnalyzer.uciMovesToSanMoves(mainData.movesAttr);
          }
          if (moves && moves.length > 0) {
            if (mainData.white) moves.white = mainData.white;
            if (mainData.black) moves.black = mainData.black;
            if (mainData.result) moves.result = mainData.result;
            if (mainData.pgn) moves.rawPgn = mainData.pgn;
            console.log(`[GameAnalyzer] ✅ Retrieved ${moves.length} moves from Main World Bridge (White: ${moves.white || '?'}, Black: ${moves.black || '?'})!`);
            return moves;
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
            if (cbData.game?.pgn) {
              const moves = GameAnalyzer.parsePgn(cbData.game.pgn);
              if (moves.length > 0) {
                console.log(`[GameAnalyzer] ✅ Retrieved ${moves.length} moves from ${t} callback PGN!`);
                return moves;
              }
            }
            if (cbData.game?.moveList) {
              const moves = GameAnalyzer.tcnToSanMoves(cbData.game.moveList);
              if (moves.length > 0) {
                const cbWhite = cbData.players?.bottom?.color === 'white' ? cbData.players?.bottom?.username : cbData.players?.top?.username || cbData.game?.whiteUser || cbData.game?.pgnHeaders?.White;
                const cbBlack = cbData.players?.bottom?.color === 'black' ? cbData.players?.bottom?.username : cbData.players?.top?.username || cbData.game?.blackUser || cbData.game?.pgnHeaders?.Black;
                if (cbWhite) moves.white = cbWhite;
                if (cbBlack) moves.black = cbBlack;
                console.log(`[GameAnalyzer] ✅ Decoded ${moves.length} moves from ${t} callback!`);
                return moves;
              }
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
        from: matched.fromSq || ChessBoard.indexToSquare(matched.from),
        to: matched.toSq || ChessBoard.indexToSquare(matched.to),
        fen: chess.getFen(),
        moveEl: mItem.element
      });
    }

    positions.isPartial = isPartial;
    positions.stoppedAtPly = stoppedAtPly;
    positions.unparsedSan = unparsedSan;

    return positions;
  }

  static SCHEMA_VERSION = 6;
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
        if (m && m[1]) return `v6_lichess_${m[1]}_${hash.slice(0, 10)}`;
      }
      // Chess.com game ID (e.g. /game/live/184446398482 or /analysis/game/live/184446398482)
      if (href.includes('chess.com')) {
        const m = window.location.pathname.match(/\b(\d{8,15})\b/);
        if (m && m[1]) return `v6_chesscom_${m[1]}_${hash.slice(0, 10)}`;
      }
    }

    // Universal fallback: deterministic 64-bit hash over moves sequence & params
    if (moves && moves.length > 0) {
      return `v6_game_${moves.length}_${hash.slice(0, 12)}`;
    }

    return null;
  }

  /**
   * Validates whether a cached review has complete schema and core metrics
   */
  static isValidReviewCache(res) {
    if (!res || typeof res !== 'object') return false;
    if ((res.schemaVersion || 0) < GameAnalyzer.SCHEMA_VERSION) return false;
    if (res.accuracyWhite === undefined || res.accuracyBlack === undefined) return false;
    if (res.beyondIntuitionCount === undefined || res.intuitionTrapsCount === undefined) return false;
    const hasMaia = res.allMoves && res.allMoves.some(m => m.maiaTopSan != null);
    if (!hasMaia && res.allMoves && res.allMoves.length > 0) return false;
    return true;
  }

  /**
   * Purges invalid/stale cache entry from memory and disk
   */
  static async invalidateCache(storageKey) {
    GameAnalyzer.memoryCache.delete(storageKey);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.remove([storageKey]);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(storageKey);
      }
    } catch (e) {}
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
        const mem = GameAnalyzer.memoryCache.get(storageKey);
        if (GameAnalyzer.isValidReviewCache(mem)) {
          return mem;
        } else {
          await GameAnalyzer.invalidateCache(storageKey);
        }
      }

      // L2: Persistent chrome.storage.local
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = await new Promise(resolve => {
          chrome.storage.local.get([storageKey], resolve);
        });
        if (data && data[storageKey] && data[storageKey].result) {
          const res = data[storageKey].result;
          if (GameAnalyzer.isValidReviewCache(res)) {
            GameAnalyzer.memoryCache.set(storageKey, res);
            console.log(`[GameAnalyzer] ⚡ Loaded review from persistent cache for ${cacheKey}`);
            return res;
          } else {
            console.log(`[GameAnalyzer] Stale/incompatible review cache found for ${cacheKey}, discarding...`);
            await GameAnalyzer.invalidateCache(storageKey);
            return null;
          }
        }
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.result) {
            const res = parsed.result;
            if (GameAnalyzer.isValidReviewCache(res)) {
              GameAnalyzer.memoryCache.set(storageKey, res);
              return res;
            } else {
              console.log(`[GameAnalyzer] Stale/incompatible review cache found in localStorage for ${cacheKey}, discarding...`);
              await GameAnalyzer.invalidateCache(storageKey);
              return null;
            }
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
        schemaVersion: GameAnalyzer.SCHEMA_VERSION,
        totalMoves: result.totalMoves,
        isPartial: !!result.isPartial,
        blundersCount: result.blundersCount,
        mistakesCount: result.mistakesCount,
        inaccuraciesCount: result.inaccuraciesCount,
        beyondIntuitionCount: result.beyondIntuitionCount || 0,
        intuitionTrapsCount: result.intuitionTrapsCount || 0,
        beyondWhiteCount: result.beyondWhiteCount || 0,
        beyondBlackCount: result.beyondBlackCount || 0,
        trapWhiteCount: result.trapWhiteCount || 0,
        trapBlackCount: result.trapBlackCount || 0,
        bookMovesCount: result.bookMovesCount || 0,
        accuracyWhite: result.accuracyWhite,
        accuracyBlack: result.accuracyBlack,
        coverageRateWhite: result.coverageRateWhite,
        coverageRateBlack: result.coverageRateBlack,
        postBookAccuracyWhite: result.postBookAccuracyWhite,
        postBookAccuracyBlack: result.postBookAccuracyBlack,
        maxLossWhite: result.maxLossWhite,
        maxLossBlack: result.maxLossBlack,
        acplWhite: result.acplWhite,
        acplBlack: result.acplBlack,
        elo: result.elo,
        depth: result.depth,
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
    if (this.isAnalyzing) {
      this.cancel();
      await new Promise(r => setTimeout(r, 20));
    }
    const runId = ++this._runCounter;
    this._currentRunId = runId;
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
        if (this.isCancelled || this._currentRunId !== runId) {
          this.isAnalyzing = false;
          return null;
        }

        // Live game lockdown check
        if (FairPlayGuard?.isLiveGameInProgress && FairPlayGuard.isLiveGameInProgress()) {
          this.isCancelled = true;
          this.isAnalyzing = false;
          throw new Error('公平竞技保护生效中：检测到棋盘处于实时对局进行状态，已中止复盘分析');
        }

        if (onProgress) {
          onProgress({
            phase: 'evaluating',
            current: i + 1,
            total: totalPositions,
            percent: Math.min(50, Math.max(1, Math.round(((i + 1) / totalPositions) * 50))),
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

      // Step 2: Compute centipawn loss, legal moves, opening book lookup, and move accuracy per move
      let blundersCount = 0;
      let mistakesCount = 0;
      let inaccuraciesCount = 0;
      let totalLossWhite = 0;
      let countWhite = 0;
      let totalLossBlack = 0;
      let countBlack = 0;
      let maxLossWhite = 0;
      let maxLossBlack = 0;

      const analyzedMoves = [];

      // Helper: convert centipawns to expected win score Q in [0, 1]
      // Standard logistic sigmoid: Q(cp) = 1 / (1 + exp(-0.00368208 * cp))
      const cpToWinScore = (cp) => {
        const clamped = Math.max(-1000, Math.min(1000, cp || 0));
        return 1 / (1 + Math.exp(-0.00368208 * clamped));
      };

      for (let i = 1; i < positions.length; i++) {
        const posBefore = positions[i - 1];
        const posAfter = positions[i];
        const evalBefore = evals[i - 1];
        const evalAfter = evals[i];

        const turn = posAfter.turn; // side that made this move ('w' or 'b')
        const playedSan = posAfter.san;
        const bestSan = evalBefore?.bestMove?.san || '?';

        // Check legal moves in the position before the move
        let legalMovesCount = 0;
        let isOnlyLegalMove = false;
        try {
          const chessPos = new ChessBoard(posBefore.fen);
          if (chessPos.isValid) {
            const legals = chessPos.getLegalMoves();
            legalMovesCount = legals.length;
            isOnlyLegalMove = legalMovesCount === 1;
          }
        } catch (e) {}

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
            if (lossCp > maxLossWhite) maxLossWhite = lossCp;
          } else {
            totalLossBlack += lossCp;
            countBlack++;
            if (lossCp > maxLossBlack) maxLossBlack = lossCp;
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

        // Query opening book for theoretical status and known traps
        const bookLookup = OpeningBook.lookup(posBefore.fen, playedSan, lossCp);

        // Compute per-move engine accuracy A_i = 100 * exp(-k * d_i)
        // where d_i = max(0, Q_best - Q_played), and k = 5.11 (10% score loss -> 60 score)
        let moveAccuracy = null;
        let expectedScoreLoss = null;
        if (evalBefore && evalAfter) {
          const cpBefore = Math.max(-1000, Math.min(1000, evalBefore.scoreCp || 0));
          // evalAfter is from opponent's perspective, so from mover's perspective it's -evalAfter.scoreCp
          const cpAfterMover = Math.max(-1000, Math.min(1000, -(evalAfter.scoreCp || 0)));
          const qBest = cpToWinScore(cpBefore);
          const qPlayed = cpToWinScore(cpAfterMover);
          const d_i = Math.max(0, qBest - qPlayed);
          expectedScoreLoss = Math.round(d_i * 1000) / 10; // in %
          const k = 5.11;
          moveAccuracy = Math.min(100, Math.max(0, Math.round(100 * Math.exp(-k * d_i) * 10) / 10));
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
          accuracy: moveAccuracy,
          expectedScoreLoss,
          legalMovesCount,
          isOnlyLegalMove,
          isBookMove: bookLookup.isBookMove,
          isOpeningTrap: bookLookup.isOpeningTrap,
          openingName: bookLookup.openingName,
          eco: bookLookup.eco,
          bookFrequency: bookLookup.bookFrequency,
          sampleCount: bookLookup.sampleCount,
          bookStatus: bookLookup.bookStatus,
          bookStatusText: bookLookup.statusText,
          evalBefore: evalBefore ? evalBefore.score : '?',
          evalAfter: evalAfter ? evalAfter.score : '?',
          evalBeforeCp: evalBefore?.scoreCp ?? 0,
          evalAfterCp: evalAfter?.scoreCp ?? 0,
          fenBefore: posBefore.fen,
          fenAfter: posAfter.fen,
          element: posAfter.moveEl,
          isHumanTrap: false,
          isBeyondIntuition: false,
          divergenceType: null, // 'beyond_intuition' | 'intuition_trap' | null
          divergenceStatus: null, // 'confirmed' | 'unconfirmed' | 'downgraded'
          divergenceNote: '',
          humanProbability: null,
          humanRawProbability: null,
          maiaTopSan: null,
          maiaTopUci: null,
          maiaTopProb: null,
          maiaTopRawProb: null,
          _predMoves: []
        });
      }

      // Step 3: Maia intuition prediction for ALL moves
      // Guarantees comprehensive human intuition modeling across the whole game
      // without sampling bias or gaps in intuition score calculation.
      if (this.maiaEngine && analyzedMoves.length > 0) {
        if (!this.maiaEngine.isReady) {
          if (onProgress) {
            onProgress({
              phase: 'intuition',
              current: 0,
              total: analyzedMoves.length,
              percent: 50,
              currentMove: '等待直觉引擎就绪...'
            });
          }
          try {
            console.log('[GameAnalyzer] Awaiting Maia engine initialization before intuition analysis...');
            await this.maiaEngine.initialize();
          } catch (e) {
            console.warn('[GameAnalyzer] Maia initialization error before intuition analysis:', e);
          }
        }

        const totalToPredict = analyzedMoves.length;
        for (let j = 0; j < totalToPredict; j++) {
          if (this.isCancelled || this._currentRunId !== runId) break;
          const mv = analyzedMoves[j];

          if (onProgress && j % 2 === 0) {
            onProgress({
              phase: 'intuition',
              current: j + 1,
              total: totalToPredict,
              percent: Math.min(95, 50 + Math.round(((j + 1) / totalToPredict) * 45)),
              currentMove: mv.san
            });
          }

          try {
            const historyFens = positions.slice(Math.max(0, j - 7), j).map(p => p.fen);
            const pred = await this.maiaEngine.predict(mv.fenBefore, elo, null, null, historyFens);
            if (pred && pred.moves && pred.moves.length > 0) {
              mv._predMoves = pred.moves;
              const top1 = pred.moves[0];
              const top2 = pred.moves.length > 1 ? pred.moves[1] : null;

              mv.maiaTopSan = top1.san || null;
              mv.maiaTopUci = top1.uci || null;
              mv.maiaTopProb = typeof top1.prob === 'number' ? top1.prob : null;
              mv.maiaTopRawProb = typeof top1.rawProb === 'number' ? top1.rawProb : (top1.prob ? top1.prob / 100 : 0.01);

              mv.maiaTop2San = top2?.san || null;
              mv.maiaTop2Uci = top2?.uci || null;
              mv.maiaTop2Prob = typeof top2?.prob === 'number' ? top2.prob : null;

              const cleanPlayed = mv.san.replace(/[+#?!]/g, '');
              const cleanBest = (mv.bestSan || '').replace(/[+#?!]/g, '');
              const cleanMaia = (top1.san || '').replace(/[+#?!]/g, '');
              const cleanMaia2 = top2 ? (top2.san || '').replace(/[+#?!]/g, '') : null;

              // Check if actual played move matches Maia predictions
              const matchedIdx = pred.moves.findIndex(m => m.san.replace(/[+#?!]/g, '') === cleanPlayed || m.uci === cleanPlayed);
              const matchedMove = matchedIdx !== -1 ? pred.moves[matchedIdx] : null;
              const matchedProb = matchedMove && typeof matchedMove.prob === 'number' ? matchedMove.prob : 0;
              const matchedRawProb = matchedMove && typeof matchedMove.rawProb === 'number' ? matchedMove.rawProb : (matchedProb > 0 ? matchedProb / 100 : 0.0001);

              mv.humanProbability = matchedProb;
              mv.humanRawProbability = matchedRawProb;

              const isMaiaTop1 = (cleanPlayed === cleanMaia || matchedIdx === 0);
              const isMaiaTop2 = (!isMaiaTop1 && (cleanPlayed === cleanMaia2 || matchedIdx === 1));
              const isMaiaTop1Or2 = isMaiaTop1 || isMaiaTop2;

              // Flag if intuition diverges from engine best
              mv.isIntuitionDivergence = !!(cleanMaia && cleanBest && cleanMaia !== cleanBest);

              // --- Candidate Archetype Filtering ---

              // Candidate 1: 妙手候选 (实战是引擎一选，且与 Maia 一选不同)
              const isEngineBest = cleanBest && (cleanPlayed === cleanBest || (typeof mv.lossCp === 'number' && mv.lossCp <= 5));
              if (isEngineBest && !mv.isBookMove && !mv.isOnlyLegalMove) {
                if (cleanMaia && cleanMaia !== cleanPlayed) {
                  mv.isBeyondIntuitionCandidate = true;
                  mv._candidateMaiaSan = cleanMaia;
                  mv._candidateMaiaUci = top1.uci || null;
                  mv._candidateTopTxt = top1.prob ? `${Math.round(top1.prob)}%` : '';
                  mv._candidateProbTxt = matchedProb > 0 ? `${Math.round(matchedProb)}%` : '罕见走法';
                }
              }

              // Candidate 2: 俗手候选 (实战是 Maia 一选或二选，或开局直觉陷阱，初筛有明显损失)
              if ((isMaiaTop1Or2 || mv.isOpeningTrap) && (mv.lossCp >= 40 || mv.isOpeningTrap) && !mv.isOnlyLegalMove) {
                mv.isHumanTrapCandidate = true;
                mv._candidateRankTxt = isMaiaTop1 ? '直觉一选' : (isMaiaTop2 ? '直觉二选' : '开局谱招');
                mv._candidateProbTxt = matchedProb > 0 ? `直觉概率 ${Math.round(matchedProb)}%` : '';
              }
            }
          } catch (e) {
            console.warn('[GameAnalyzer] Maia prediction error on ply', mv.ply, ':', e);
          }
        }
      }

      // Step 4: Secondary Deep Verification Pass (二次加深复核 - d12 with multipv 4)
      // 实打实比较三种走法：搜索引擎一选、实战走法、Maia一选
      const candidateList = analyzedMoves
        .filter(m => m.isBeyondIntuitionCandidate || m.isHumanTrapCandidate)
        .sort((a, b) => a.ply - b.ply);

      for (const cm of candidateList) {
        if (this.isCancelled || this._currentRunId !== runId) break;
        try {
          // Deeper evaluation with depth 12 and multipv 4
          const deepEval = await this.stockfish.evaluate(cm.fenBefore, 12, 3500, 4);
          if (deepEval && deepEval.bestMove) {
            const deepBestSan = (deepEval.bestMove.san || '').replace(/[+#?!]/g, '');
            const deepBestUci = deepEval.bestMove.uci;
            const deepBestScoreCp = deepEval.scoreCp || 0;
            const cleanPlayed = cm.san.replace(/[+#?!]/g, '');
            const cleanMaia = (cm.maiaTopSan || '').replace(/[+#?!]/g, '');

            // Build map of evaluated moves: uci -> lossCp
            const deepLossMap = new Map();
            if (deepBestUci) deepLossMap.set(deepBestUci, 0);

            if (deepEval.lines) {
              for (const l of deepEval.lines) {
                if (l.uci) {
                  deepLossMap.set(l.uci, Math.abs(l.deltaCp));
                }
              }
            }

            // Targeted Deep Eval Helper: evaluate move by stepping from fenBefore
            const evaluateMoveTargeted = async (targetUci, targetCleanSan) => {
              try {
                let targetFen = null;
                const chess = new ChessBoard(cm.fenBefore);
                if (chess.isValid) {
                  const legals = chess.getLegalMoves();
                  const match = legals.find(m => 
                    (targetUci && m.uci === targetUci) || 
                    (targetCleanSan && m.san.replace(/[+#?!]/g, '') === targetCleanSan)
                  );
                  if (match) {
                    chess.makeMove(match);
                    targetFen = chess.getFen();
                    if (!targetUci) targetUci = match.uci;
                  }
                }
                if (targetFen && targetUci) {
                  const subEval = await this.stockfish.evaluate(targetFen, 10, 2500, 1);
                  if (subEval) {
                    const loss = Math.max(0, deepBestScoreCp + (subEval.scoreCp || 0));
                    deepLossMap.set(targetUci, loss);
                    return loss;
                  }
                }
              } catch (e) {
                console.warn('[GameAnalyzer] Targeted eval error:', e);
              }
              return null;
            };

            // 1. 实打实确保实战走法已评估
            if (!deepLossMap.has(cm.uci)) {
              if (cm.fenAfter) {
                const playedEval = await this.stockfish.evaluate(cm.fenAfter, 10, 2500, 1);
                if (playedEval) {
                  deepLossMap.set(cm.uci, Math.max(0, deepBestScoreCp + (playedEval.scoreCp || 0)));
                } else if (cm.lossCp !== null) {
                  deepLossMap.set(cm.uci, cm.lossCp);
                }
              } else {
                await evaluateMoveTargeted(cm.uci, cleanPlayed);
              }
            }
            const deepLossCp = deepLossMap.has(cm.uci) ? deepLossMap.get(cm.uci) : (cm.lossCp || 0);

            // 2. 实打实确保 Maia 一选已评估
            if (cm.maiaTopUci && !deepLossMap.has(cm.maiaTopUci)) {
              await evaluateMoveTargeted(cm.maiaTopUci, cleanMaia);
            }
            const maiaLossCp = (cm.maiaTopUci && deepLossMap.has(cm.maiaTopUci))
              ? deepLossMap.get(cm.maiaTopUci)
              : null;

            // 3. 复核判定 妙手 (实战＝Stockfish一选，且Stockfish评估收益超过Maia一选: maiaLossCp > 0)
            const isStillDeepBest = (deepBestSan === cleanPlayed || deepBestUci === cm.uci || deepLossCp === 0);
            if (cm.isBeyondIntuitionCandidate && !cm.isBookMove && !cm.isOnlyLegalMove) {
              if (isStillDeepBest && maiaLossCp !== null && maiaLossCp > 0) {
                // 连续组合去重：检查同方上一有效决策步是否已是妙手
                const prevSameSideMove = analyzedMoves
                  .slice(0, cm.ply - 1)
                  .reverse()
                  .find(m => m.turn === cm.turn && !m.isBookMove && !m.isOnlyLegalMove);
                const isCombo = prevSameSideMove && prevSameSideMove.isBeyondIntuition && (cm.ply - prevSameSideMove.ply <= 2);

                cm.isBeyondIntuition = true;
                cm.isCombinationFollowup = !!isCombo;
                cm.divergenceType = 'beyond_intuition';
                cm.divergenceStatus = 'confirmed';
                if (isCombo) {
                  cm.divergenceNote = `✨ 妙手组合延续：走出引擎首选 ${cleanPlayed}。相比人类直觉的自然走法 ${cleanMaia} (损耗 -${(maiaLossCp / 100).toFixed(2)} 兵)，这步稳固并兑现了突破直觉的战术优势。`;
                } else {
                  cm.divergenceNote = `✨ 妙手：你走出了引擎首选 ${cleanPlayed}。相比人类直觉的自然走法 ${cleanMaia} (损耗 -${(maiaLossCp / 100).toFixed(2)} 兵)，这步保留了更多优势。`;
                }
              } else {
                console.log(`[GameAnalyzer] Ply ${cm.ply} (${cleanPlayed}) 妙手未通过加深复核 (是否深搜首选: ${isStillDeepBest}, 实战损耗: ${deepLossCp}cp, Maia首选损耗: ${maiaLossCp ?? '未测'}cp <= 0)，已取消`);
                cm.divergenceStatus = 'downgraded';
              }
            }

            // 4. 复核判定 俗手 (实战＝Maia一选或二选，且相对Stockfish一选明显吃亏 >= 50cp)
            if (!cm.isBeyondIntuition && cm.isHumanTrapCandidate && !cm.isOnlyLegalMove) {
              if (!isStillDeepBest && deepLossCp >= 50) {
                cm.isHumanTrap = true;
                cm.divergenceType = 'intuition_trap';
                cm.divergenceStatus = 'confirmed';
                cm.divergenceNote = `🫤 俗手：这步属于人类直觉的优先选择 (${cm._candidateRankTxt || '自然走法'})，看起来很自然，但经深度复核会明显损失优势 (-${(deepLossCp / 100).toFixed(2)} 兵)，最佳应走 ${deepBestSan}。`;
              } else {
                console.log(`[GameAnalyzer] Ply ${cm.ply} (${cleanPlayed}) 俗手经复核损耗仅 ${deepLossCp}cp < 50cp，未达显著吃亏门槛，已降级`);
                cm.divergenceStatus = 'downgraded';
              }
            }
          } else {
            console.warn(`[GameAnalyzer] Ply ${cm.ply} 深搜复核无响应或超时，证据不足，标记为待确认`);
            cm.divergenceStatus = 'unconfirmed';
            cm.divergenceNote = '深搜复核超时，证据不足未予确认';
          }
        } catch (err) {
          console.warn('[GameAnalyzer] Deep verification error on ply', cm.ply, err);
          cm.divergenceStatus = 'unconfirmed';
        }
      }

      // Step 5: Score Calculation & Aggregation
      // 1. Engine Accuracy Scores (Overall & Post-Book)
      const whiteDecisionMoves = analyzedMoves.filter(m => m.turn === 'w' && !m.isOnlyLegalMove);
      const blackDecisionMoves = analyzedMoves.filter(m => m.turn === 'b' && !m.isOnlyLegalMove);

      const validAccWhite = whiteDecisionMoves.filter(m => typeof m.accuracy === 'number' && !isNaN(m.accuracy));
      const validAccBlack = blackDecisionMoves.filter(m => typeof m.accuracy === 'number' && !isNaN(m.accuracy));

      const accuracyWhite = validAccWhite.length > 0 
        ? Math.round((validAccWhite.reduce((acc, m) => acc + m.accuracy, 0) / validAccWhite.length) * 10) / 10 
        : null;
      const accuracyBlack = validAccBlack.length > 0 
        ? Math.round((validAccBlack.reduce((acc, m) => acc + m.accuracy, 0) / validAccBlack.length) * 10) / 10 
        : null;

      const coverageRateWhite = whiteDecisionMoves.length > 0
        ? Math.round((validAccWhite.length / whiteDecisionMoves.length) * 1000) / 10
        : 0;
      const coverageRateBlack = blackDecisionMoves.length > 0
        ? Math.round((validAccBlack.length / blackDecisionMoves.length) * 1000) / 10
        : 0;

      // Post-Book Accuracy (单列“离谱后精度”)
      const postBookWhite = whiteDecisionMoves.filter(m => !m.isBookMove);
      const postBookBlack = blackDecisionMoves.filter(m => !m.isBookMove);
      const validPostWhite = postBookWhite.filter(m => typeof m.accuracy === 'number' && !isNaN(m.accuracy));
      const validPostBlack = postBookBlack.filter(m => typeof m.accuracy === 'number' && !isNaN(m.accuracy));

      const postBookAccuracyWhite = validPostWhite.length > 0
        ? Math.round((validPostWhite.reduce((acc, m) => acc + m.accuracy, 0) / validPostWhite.length) * 10) / 10
        : null;
      const postBookAccuracyBlack = validPostBlack.length > 0
        ? Math.round((validPostBlack.reduce((acc, m) => acc + m.accuracy, 0) / validPostBlack.length) * 10) / 10
        : null;

      // 2. Confirmed Key Moments (✨ 妙手 & 🫤 俗手)
      const keyMoments = analyzedMoves
        .filter(m => m.divergenceType === 'beyond_intuition' || m.divergenceType === 'intuition_trap')
        .sort((a, b) => a.ply - b.ply);

      const beyondIntuitionCount = analyzedMoves.filter(m => m.divergenceType === 'beyond_intuition' && !m.isCombinationFollowup).length;
      const intuitionTrapsCount = analyzedMoves.filter(m => m.divergenceType === 'intuition_trap').length;
      const beyondWhiteCount = analyzedMoves.filter(m => m.turn === 'w' && m.divergenceType === 'beyond_intuition' && !m.isCombinationFollowup).length;
      const beyondBlackCount = analyzedMoves.filter(m => m.turn === 'b' && m.divergenceType === 'beyond_intuition' && !m.isCombinationFollowup).length;
      const trapWhiteCount = analyzedMoves.filter(m => m.turn === 'w' && m.divergenceType === 'intuition_trap').length;
      const trapBlackCount = analyzedMoves.filter(m => m.turn === 'b' && m.divergenceType === 'intuition_trap').length;
      const bookMovesCount = analyzedMoves.filter(m => m.isBookMove).length;

      if (this.isCancelled || this._currentRunId !== runId) {
        this.isAnalyzing = false;
        return null;
      }

      const result = {
        schemaVersion: GameAnalyzer.SCHEMA_VERSION,
        runId,
        gameKey: cacheKey,
        elo,
        depth,
        totalMoves: positions.length - 1,
        isPartial: !!positions.isPartial,
        stoppedAtPly: positions.stoppedAtPly || null,
        unparsedSan: positions.unparsedSan || null,
        rawTotalMoves: moves.length,
        blundersCount,
        mistakesCount,
        inaccuraciesCount,
        beyondIntuitionCount,
        intuitionTrapsCount,
        beyondWhiteCount,
        beyondBlackCount,
        trapWhiteCount,
        trapBlackCount,
        bookMovesCount,
        accuracyWhite,
        accuracyBlack,
        coverageRateWhite,
        coverageRateBlack,
        postBookAccuracyWhite,
        postBookAccuracyBlack,
        maxLossWhite: (maxLossWhite / 100).toFixed(2),
        maxLossBlack: (maxLossBlack / 100).toFixed(2),
        acplWhite: countWhite > 0 ? Math.round(totalLossWhite / countWhite) : 0,
        acplBlack: countBlack > 0 ? Math.round(totalLossBlack / countBlack) : 0,
        allMoves: analyzedMoves,
        keyMoments
      };

      if (this._currentRunId === runId) {
        this.lastReviewResult = result;
        this.isAnalyzing = false;
      }

      if (onProgress && this._currentRunId === runId) {
        onProgress({
          phase: 'done',
          current: totalPositions,
          total: totalPositions,
          percent: 100
        });
      }

      // Save to Persistent Cache ONLY if complete, not cancelled, and no engine evaluation failures occurred
      if (cacheKey && !positions.isPartial && evalFailures === 0 && this._currentRunId === runId) {
        await GameAnalyzer.saveCachedReview(cacheKey, result);
      }

      return (this._currentRunId === runId) ? result : null;
    } catch (err) {
      if (this._currentRunId === runId) {
        this.isAnalyzing = false;
      }
      throw err;
    }
  }

  /**
   * Jump to a specific move on the board (Lichess & Chess.com) with true board verification
   * @param {Object} moveItem - The blunder or move object
   * @param {number|null} targetPly - Explicit ply to jump to (defaults to decision point before move: moveItem.ply - 1)
   * @param {string|null} targetFen - Target FEN to verify board arrival
   */
  static async jumpToMove(moveItem, targetPly = null, targetFen = null) {
    if (!moveItem) return { ok: false, reason: 'no_move_item' };
    const ply = (targetPly !== null && typeof targetPly === 'number')
      ? targetPly
      : Math.max(0, (moveItem.ply || 1) - 1);

    const isChesscom = typeof window !== 'undefined' && window.location.hostname.includes('chess.com');
    const isLichess = typeof window !== 'undefined' && window.location.hostname.includes('lichess');

    // Helper: dispatch full synthetic pointer/mouse events across shadow DOM boundaries
    const dispatchSyntheticClick = (el) => {
      if (!el) return;
      const optsDown = { bubbles: true, cancelable: true, composed: true, view: window, buttons: 1, button: 0 };
      const optsUp = { bubbles: true, cancelable: true, composed: true, view: window, buttons: 0, button: 0 };
      try { el.dispatchEvent(new PointerEvent('pointerdown', optsDown)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mousedown', optsDown)); } catch (e) {}
      try { el.dispatchEvent(new PointerEvent('pointerup', optsUp)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mouseup', optsUp)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('click', optsUp)); } catch (e) {}
      try { if (typeof el.click === 'function') el.click(); } catch (e) {}
    };

    // Expected board piece placement for verification
    const expectedFen = targetFen || (targetPly === moveItem.ply ? moveItem.fenAfter : moveItem.fenBefore);
    const expectedBoard = expectedFen ? expectedFen.split(' ')[0] : null;

    // Direct DOM element click if available and matches
    if (targetPly === null && moveItem.element && typeof document !== 'undefined' && document.contains(moveItem.element)) {
      dispatchSyntheticClick(moveItem.element);
      moveItem.element.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }

    // 1. Dispatch Main World Controller Request Event (CustomEvent + postMessage)
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('__MAIA_JUMP_REQ__', { detail: { ply } }));
        window.postMessage({ type: '__MAIA_JUMP_REQ__', ply }, '*');
      } catch (e) {}
    }

    // 2. DOM-level fallback navigation
    if (isLichess) {
      if (ply === 0) {
        const firstBtn = document.querySelector('.analyse__controls .first, button[data-act="first"]');
        if (firstBtn) dispatchSyntheticClick(firstBtn);
      } else {
        const lichessMoves = Array.from(document.querySelectorAll('.analyse__moves move, rm6 move, .tview2 u, .analyse__moves u'));
        if (lichessMoves[ply - 1]) {
          dispatchSyntheticClick(lichessMoves[ply - 1]);
          lichessMoves[ply - 1].scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        }
      }
    } else if (isChesscom) {
      if (ply === 0) {
        const firstBtn = document.querySelector('button[data-cy="nav-first"], button[aria-label*="First" i], button.chevron-first, .board-controls-first, [class*="chevron-first"], [data-tab="first"]');
        if (firstBtn) dispatchSyntheticClick(firstBtn);
      } else {
        const plySelectors = [
          `[data-ply="${ply}"]`,
          `wc-vertical-move-list [data-ply="${ply}"]`,
          `.vertical-move-list [data-ply="${ply}"]`,
          `.move-list-wrapper [data-ply="${ply}"]`,
          `.main-line-row [data-ply="${ply}"]`
        ];
        let found = false;
        for (const sel of plySelectors) {
          const el = document.querySelector(sel);
          if (el) {
            dispatchSyntheticClick(el);
            el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            found = true;
            break;
          }
        }
        if (!found) {
          const moveContainers = document.querySelectorAll('wc-vertical-move-list, .vertical-move-list, .move-list-wrapper, .keyboard-move-list, .main-line-row');
          for (const container of moveContainers) {
            const nodes = Array.from(container.querySelectorAll('.node, [class*="move-node"], [class*="node-text"]')).filter(el => {
              if (el.classList.contains('node-number') || el.classList.contains('move-number') || el.classList.contains('round-number')) return false;
              const text = (el.textContent || '').trim();
              if (/^\d+\.?$/.test(text)) return false;
              return text.length > 0 || el.querySelector('[class*="piece"], [data-piece]');
            });
            if (nodes.length >= ply && nodes[ply - 1]) {
              dispatchSyntheticClick(nodes[ply - 1]);
              nodes[ply - 1].scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
              found = true;
              break;
            }
          }
        }
      }
    }

    // 3. Verification Loop: Wait up to 500ms to confirm board actually reaches target state
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { ok: true, ply };
    }

    const t0 = Date.now();
    while (Date.now() - t0 < 500) {
      // Check FEN match
      if (expectedBoard && window.__MAIA_CURRENT_FEN__) {
        if (window.__MAIA_CURRENT_FEN__.split(' ')[0] === expectedBoard) {
          return { ok: true, ply, fen: window.__MAIA_CURRENT_FEN__ };
        }
      }

      // Check DOM move highlight match
      if (isChesscom) {
        const activeNode = document.querySelector(`[data-ply="${ply}"].selected, [data-ply="${ply}"][class*="selected"], [data-ply="${ply}"][class*="highlight"]`);
        if (activeNode) {
          return { ok: true, ply, method: 'dom-selected' };
        }
      } else if (isLichess) {
        const activeMove = document.querySelector('.analyse__moves move.active, rm6 move.active, .tview2 u.active');
        if (activeMove) {
          const allMoves = Array.from(document.querySelectorAll('.analyse__moves move, rm6 move, .tview2 u'));
          const idx = allMoves.indexOf(activeMove);
          if (idx !== -1 && idx === ply - 1) {
            return { ok: true, ply, method: 'lichess-active' };
          }
        }
      }

      await new Promise(r => setTimeout(r, 35));
    }

    // Board did not update after 500ms
    return { ok: false, reason: 'board_did_not_change', ply };
  }
}
