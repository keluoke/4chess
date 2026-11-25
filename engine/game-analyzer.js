/**
 * Maia 3 - Full Game Analyzer & Blunder Review Engine
 * Evaluates the entire game with Stockfish 19 WASM, calculates centipawn loss (Δ)
 * per move, and ranks critical turning points (Blunders / Mistakes) with quick jump navigation
 * and Maia human intuition trap detection.
 */

import { expectedScore, isKeyMoment, errorSeverity, moveQuality, isLessLikelyChoice, positiveIntuition, isHighTendency, qualifiesTrap } from './review-policy.js?v=20261117-review-policy';
import { ChessBoard } from './chess-core.js';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { decodeTcn, tcnToSanMoves, movesToPgn, withPgnTermination } from './chess-notation.js';
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
  static parsePgn(pgnText, { clocks = false } = {}) {
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

    // Keep the main line while skipping nested RAVs and both PGN comment forms.
    let clean = '', variation = 0, brace = false, lineComment = false, header = false, quoted = false, escaped = false;
    let comment = '';
    for (const char of pgnText) {
      if (lineComment) { if (char === '\n' || char === '\r') { lineComment = false; clean += ' '; } continue; }
      if (brace) {
        if (char === '}') {
          brace = false;
          const time = comment.match(/\[%clk\s+((?:\d+:)?[0-5]?\d:[0-5]?\d(?:\.\d+)?)\]/i)?.[1];
          if (time) clean += ` @clk=${time.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0)} `;
          comment = '';
        } else if (clocks && !variation) {
          comment += char;
        }
        continue;
      }
      if (header) {
        if (escaped) escaped = false;
        else if (quoted && char === '\\') escaped = true;
        else if (char === '"') quoted = !quoted;
        else if (char === ']' && !quoted) header = false;
        continue;
      }
      if (char === '{') { brace = true; clean += ' '; continue; }
      if (char === ';') { lineComment = true; continue; }
      if (char === '[') { header = true; continue; }
      if (char === '(') { variation++; clean += ' '; continue; }
      if (char === ')') { variation = Math.max(0, variation - 1); continue; }
      if (!variation) clean += char;
    }
    clean = clean.replace(/(1-0|0-1|1\/2-1\/2|\*)/g, '');

    const tokens = clean.trim().split(/\s+/);
    const moves = [];
    let ply = 0;

    for (const token of tokens) {
      if (!token) continue;
      if (clocks && /^@clk=\d+(?:\.\d+)?$/.test(token)) {
        if (moves.length) moves.at(-1).clockSeconds = Number(token.slice(5));
        continue;
      }
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
    moves.result = resultMatch?.[1]?.trim() || pgnText.trim().match(/(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)\s*$/)?.[1] || '*';
    moves.rawPgn = pgnText;

    return moves;
  }

  /**
   * Decode Chess.com TCN (Trickle Chess Notation) string into move coordinates
   */
  static decodeTcn(text) { return decodeTcn(text); }
  static tcnToSanMoves(text) { return tcnToSanMoves(text); }
  static movesToPgn(moves, headers) { return movesToPgn(moves, headers); }

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

  /** Parse only game routes. Lichess player links can append a private four-character suffix. */
  static gameSource({ hostname, pathname }) {
    if (hostname === 'lichess.org' || hostname.endsWith('.lichess.org')) {
      const match = pathname.match(/^\/(?:game\/)?([A-Za-z0-9]{8}(?:[A-Za-z0-9]{4})?)(?:\/(?:white|black))?(?:\/analysis)?\/?$/);
      const id = match?.[1];
      if (id && !['analysis', 'training', 'practice', 'broadcast', 'insights', 'streamer'].includes(id.toLowerCase())) {
        return { platform: 'lichess', id: id.slice(0, 8) };
      }
    }
    if (hostname === 'chess.com' || hostname.endsWith('.chess.com')) {
      const match = pathname.match(/^\/(?:analysis\/game\/|game\/|play\/online\/game\/)(?:(live|daily)\/)?(\d{8,16})(?:\/(?:review|analysis))?\/?$/);
      if (match) return { platform: 'chesscom', id: match[2], type: match[1] || 'live' };
    }
    return null;
  }

  static async extractFinishedGame(source) {
    const lichess = source.platform === 'lichess';
    const exportUrl = `https://lichess.org/game/export/${source.id}`;
    const sources = lichess ? [
      { url: `${exportUrl}?moves=true&pgnInJson=true` },
      { url: exportUrl, raw: true }
    ] : [
      { url: `/callback/${source.type}/game/${source.id}` },
      { url: `https://4chess.cc/api/chesscom?id=${source.id}&type=${source.type}` }
    ];

    for (const { url, raw } of sources) {
      try {
        const response = await fetch(url, {
          headers: { Accept: raw ? 'application/x-chess-pgn' : 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) continue;
        const data = raw ? { pgn: await response.text() } : await response.json();
        const game = data.game ? { ...data.game, pgn: data.game.pgn || data.pgn } : data;
        if (!game.pgn && !game.moveList) continue;
        const conclusion = FairPlayGuard.verifyConcludedGame(game);
        if (!conclusion.ok) return [];

        let pgn = game.pgn;
        if (!pgn && !lichess) {
          const moves = GameAnalyzer.tcnToSanMoves(game.moveList);
          if (!moves.length || moves.length * 2 !== game.moveList.length) continue;
          pgn = GameAnalyzer.movesToPgn(moves, { ...game.pgnHeaders, Result: conclusion.result });
        }
        const moves = GameAnalyzer.parsePgn(withPgnTermination(pgn, game.status));
        if (moves.length && !GameAnalyzer.buildPositionChain(moves).isPartial) return moves;
      } catch (error) {
        console.debug('[GameAnalyzer] Game export unavailable:', error.message);
      }
    }
    return [];
  }

  /** Prefer the platform's complete record when the page identifies a game. */
  static async extractPageMoves() {
    if (typeof window === 'undefined' || FairPlayGuard.isLiveGameInProgress()) return [];
    const source = GameAnalyzer.gameSource(window.location);
    if (source) return GameAnalyzer.extractFinishedGame(source);

    // ------------------------------------------------------------------
    // Chess.com Main World Script Bridge
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
    // Chess.com <chess-board moves="..."> attribute
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
    // Search for move elements in the DOM (with figurine icon recovery)
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
      // In-page PGN textareas
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
      // SAN is case-sensitive: Bxc3 (bishop) and bxc3 (pawn) are different moves.
      const cleanSan = mItem.san.replace(/[+#?!]/g, '');
      const matched = legals.find(m => {
        const mClean = m.san.replace(/[+#?!]/g, '');
        return mClean === cleanSan || m.uci === cleanSan;
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

  static SCHEMA_VERSION = 11;
  static REVIEW_POLICY_VERSION = 2;
  static DEFAULT_DEPTH = 12;

  static winScore(cp) {
    return expectedScore(cp);
  }

  static moveAccuracy(cpBefore, cpAfterMover, isBest = false) {
    const before = GameAnalyzer.winScore(cpBefore), after = GameAnalyzer.winScore(cpAfterMover);
    if (before === null || after === null) return null;
    const loss = isBest ? 0 : Math.max(0, before - after);
    return { accuracy: 100 * Math.exp(-5.11 * loss), expectedScoreLoss: loss * 100 };
  }

  // Inspired by Lichess's documented volatility + harmonic aggregation:
  // https://lichess.org/page/accuracy . Diverge retains its own per-move mapping.
  // Use one White-perspective timeline, including forced moves, for volatility.
  static accuracyWeights(whiteScores, verifiedScores = new Map()) {
    const size = Math.max(2, Math.min(8, Math.floor((whiteScores.length - 1) / 10)));
    return whiteScores.slice(1).map((_, index) => {
      const start = Math.max(0, index + 2 - size);
      const window = whiteScores.slice(start, start + size);
      const verified = verifiedScores.get(index);
      if (verified) window.splice(index - start, 2, ...verified);
      if (window.some(q => q === null || !Number.isFinite(q))) return 0.5;
      const mean = window.reduce((sum, q) => sum + q, 0) / window.length;
      const deviation = Math.sqrt(window.reduce((sum, q) => sum + (q - mean) ** 2, 0) / window.length);
      return Math.max(0.5, Math.min(12, deviation * 100));
    });
  }

  static aggregateAccuracy(moves) {
    const valid = moves.filter(m => Number.isFinite(m.accuracy));
    if (!valid.length) return null;
    let sum = 0, weights = 0, reciprocal = 0;
    for (const move of valid) {
      const weight = Number.isFinite(move.accuracyWeight) && move.accuracyWeight > 0 ? move.accuracyWeight : 0.5;
      sum += move.accuracy * weight;
      weights += weight;
      reciprocal += move.accuracy === 0 ? Infinity : 1 / move.accuracy;
    }
    return Math.round((sum / weights + valid.length / reciprocal) / 2 * 10) / 10;
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
    const { depth = GameAnalyzer.DEFAULT_DEPTH, elo = 1900, engineKey = 'sf19lite', modelKey = 'maia3-5m' } = options;
    const startFen = moves?.startFen || 'start';
    const moveSans = (moves || []).map(m => m.san || '').join(',');
    const policy = options.reviewMode ? '|adaptive-v1:' + options.reviewMode : '';
    const hash = GameAnalyzer.hashString(`${startFen}|${moveSans}|${depth}|${elo}|${engineKey}|${modelKey}${policy}`);

    if (typeof window !== 'undefined') {
      const href = window.location.href;
      // Lichess game ID: 8 characters (e.g. lichess.org/38uTqNdksSRF -> lichess_38uTqNdk)
      if (href.includes('lichess.org')) {
        const m = window.location.pathname.match(/^\/([a-zA-Z0-9]{8})/);
        if (m && m[1]) return `v${GameAnalyzer.SCHEMA_VERSION}_lichess_${m[1]}_${hash.slice(0, 10)}`;
      }
      // Chess.com game ID (e.g. /game/live/184446398482 or /analysis/game/live/184446398482)
      if (href.includes('chess.com')) {
        const m = window.location.pathname.match(/\b(\d{8,15})\b/);
        if (m && m[1]) return `v${GameAnalyzer.SCHEMA_VERSION}_chesscom_${m[1]}_${hash.slice(0, 10)}`;
      }
    }

    // Universal fallback: deterministic 64-bit hash over moves sequence & params
    if (moves && moves.length > 0) {
      return `v${GameAnalyzer.SCHEMA_VERSION}_game_${moves.length}_${hash.slice(0, 12)}`;
    }

    return null;
  }

  /**
   * Validates whether a cached review has complete schema and core metrics
   */
  static isValidReviewCache(res) {
    if (!res || typeof res !== 'object') return false;
    if (res.schemaVersion !== GameAnalyzer.SCHEMA_VERSION) return false;
    if (!res.engineOnly && res.reviewPolicyVersion !== GameAnalyzer.REVIEW_POLICY_VERSION) return false;
    if (res.accuracyWhite === undefined || res.accuracyBlack === undefined) return false;
    if (res.beyondIntuitionCount === undefined || res.intuitionTrapsCount === undefined) return false;
    if (!Array.isArray(res.allMoves)) return false;
    const hasMaia = res.allMoves.some(m => m.maiaTopSan != null);
    if (!hasMaia && res.allMoves.length > 0 && !(res.engineOnly && res.engineGameKey && res.positionEvaluations?.length === res.totalMoves + 1)) return false;
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
    const storageKey = `maia3_review_${cacheKey}`;
    const remember = result => {
      // The engine-only search and accuracy inputs predate this policy and are still reusable.
      const current = result.reviewPolicyVersion === GameAnalyzer.REVIEW_POLICY_VERSION ? result : {
        ...result, reviewPolicyVersion: GameAnalyzer.REVIEW_POLICY_VERSION, keyMoments: result.allMoves.filter(isKeyMoment)
      };
      GameAnalyzer.memoryCache.set(storageKey, current);
      return current;
    };
    try {
      // L1: Memory Cache
      if (GameAnalyzer.memoryCache.has(storageKey)) {
        const mem = GameAnalyzer.memoryCache.get(storageKey);
        if (GameAnalyzer.isValidReviewCache(mem)) return remember(mem);
        await GameAnalyzer.invalidateCache(storageKey);
      }

      // L2: Persistent chrome.storage.local
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = await new Promise(resolve => {
          chrome.storage.local.get([storageKey], resolve);
        });
        if (data && data[storageKey] && data[storageKey].result) {
          const res = data[storageKey].result;
          if (GameAnalyzer.isValidReviewCache(res)) {
            console.log(`[GameAnalyzer] ⚡ Loaded review from persistent cache for ${cacheKey}`);
            return remember(res);
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
              return remember(res);
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
        reviewPolicyVersion: result.reviewPolicyVersion,
        totalMoves: result.totalMoves,
        engineOnly: !!result.engineOnly,
        engineGameKey: result.engineGameKey,
        positionEvaluations: result.positionEvaluations,
        ...(result.reviewMode ? { reviewMode: result.reviewMode, scoreVerifications: result.scoreVerifications } : {}),
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
        depthMin: result.depthMin,
        depthMax: result.depthMax,
        engineKey: result.engineKey,
        modelKey: result.modelKey,
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
    }
    const runId = ++this._runCounter;
    this._currentRunId = runId;
    this.isAnalyzing = true;
    this.isCancelled = false;
    const invalid = () => this.isCancelled || this._currentRunId !== runId || FairPlayGuard.isLiveGameInProgress();
    let verificationStartup;
    const evaluate = async (fen, targetDepth, timeoutMs, multipv, budget = null, moveTime = null) => {
      if (invalid()) return null;
      if (options.waitForTurn) await options.waitForTurn(invalid);
      if (invalid()) return null;
      if (!budget) {
        const result = await this.stockfish.evaluate(fen, targetDepth, timeoutMs, multipv, moveTime);
        return invalid() ? null : result;
      }
      // Waiting for foreground work or first-time engine initialization is outside the search budget.
      if (!this.stockfish.isReady) {
        verificationStartup ||= this.stockfish.initialize();
        await verificationStartup;
        if (!this.stockfish.isReady || invalid()) return null;
        if (options.waitForTurn) await options.waitForTurn(invalid);
      }
      if (invalid()) return null;
      const limit = Math.floor(Math.min(timeoutMs, budget.remaining));
      if (limit <= 0) return null;
      const started = performance.now();
      const result = await this.stockfish.evaluate(fen, targetDepth, limit, multipv, Math.max(1, limit - 60));
      budget.remaining -= performance.now() - started;
      return invalid() ? null : result;
    };

    const {
      depth = GameAnalyzer.DEFAULT_DEPTH,
      elo = 1900,
      forceRefresh = false,
      onProgress = null,
      engineOnly = false,
      baseReview = null,
      waitForTurn = null,
      reviewMode = null
    } = options;

    const engineGameKey = GameAnalyzer.getGameKey(moves, { depth, elo: 0, engineKey: this.stockfish.engineKey, modelKey: 'engine-only', reviewMode });
    const cacheKey = engineOnly ? engineGameKey : GameAnalyzer.getGameKey(moves, { depth, elo, engineKey: this.stockfish.engineKey, modelKey: this.maiaEngine.modelKey, reviewMode });

    // 1. Instant Cache Hit Check (0ms response)
    if (!forceRefresh && cacheKey) {
      const cached = await GameAnalyzer.getCachedReview(cacheKey);
      if (invalid()) return null;
      // A refreshed score pass must not be overwritten by an older enriched
      // report, even when the game, depth and selected model are identical.
      const sameBase = !baseReview || engineOnly || (
        cached?.engineGameKey === baseReview.engineGameKey &&
        JSON.stringify(cached?.positionEvaluations) === JSON.stringify(baseReview.positionEvaluations) &&
        JSON.stringify(cached?.scoreVerifications) === JSON.stringify(baseReview.scoreVerifications)
      );
      if (cached && sameBase) {
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
      const reusable = baseReview?.engineGameKey === engineGameKey &&
        baseReview?.schemaVersion === GameAnalyzer.SCHEMA_VERSION &&
        baseReview?.positionEvaluations?.length === totalPositions ? baseReview.positionEvaluations : null;
      const evals = [];
      let evalFailures = 0;
      let consecutiveFailures = 0;

      // Step 0: Pre-flight check - ensure Stockfish is initialized and ready
      if (!reusable && this.stockfish && !this.stockfish.isReady) {
        console.log('[GameAnalyzer] Awaiting Stockfish engine initialization before review...');
        const ready = await this.stockfish.initialize();
        if (invalid()) return null;
        if (!ready || !this.stockfish.isReady) {
          throw new Error('Stockfish WebAssembly 引擎初始化超时或未就绪，无法开始复盘分析');
        }
      }

      const scanPercent = engineOnly ? (reviewMode ? 85 : 100) : 50;
      // Step 1: Evaluate each position with Stockfish 19
      for (let i = 0; i < totalPositions; i++) {
        if (invalid()) {
          if (this._currentRunId === runId) this.isAnalyzing = false;
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
            percent: Math.max(1, Math.round((i + 1) / totalPositions * scanPercent)),
            currentMove: positions[i].san
          });
        }

        // Full-game evaluation with the requested depth, bounded time and one principal variation.
        let evalRes = reusable ? reusable[i] : await evaluate(positions[i].fen, depth, 3500, 1, null, reviewMode ? 3200 : null);
        if (!Number.isFinite(evalRes?.scoreCp)) evalRes = null;
        // A cancelled review must not stop a newer foreground position search.
        if (invalid()) return null;
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
      const analyzedMoves = [];

      const whiteScores = evals.map((evaluation, i) => {
        if (!evaluation) return null;
        const whiteCp = positions[i].fen.split(' ')[1] === 'w' ? evaluation.scoreCp : -evaluation.scoreCp;
        return GameAnalyzer.winScore(whiteCp);
      });

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
        const isBest = evalBefore?.bestMove?.uci && posAfter.uci
          ? evalBefore.bestMove.uci === posAfter.uci
          : bestSan !== '?' && playedSan.replace(/[+#?!]/g, '') === bestSan.replace(/[+#?!]/g, '');

        if (evalBefore && evalAfter) {
          if (!isBest) {
            // Clamp scores to [-1000, 1000] to handle checkmates smoothly
            const cpBefore = Math.max(-1000, Math.min(1000, evalBefore.scoreCp || 0));
            const cpAfter = Math.max(-1000, Math.min(1000, evalAfter.scoreCp || 0));
            lossCp = Math.max(0, cpBefore + cpAfter);
          }

          severity = errorSeverity(lossCp);
        } else {
          severity = 'unknown';
        }

        // Query opening book for theoretical status and known traps
        const bookLookup = OpeningBook.lookup(posBefore.fen, playedSan, lossCp);

        // Best-move identity avoids penalizing the engine's own choice due to search noise.
        const quality = evalBefore && evalAfter
          ? GameAnalyzer.moveAccuracy(evalBefore.scoreCp, -evalAfter.scoreCp, isBest)
          : null;
        const moveAccuracy = quality?.accuracy ?? null;
        const expectedScoreLoss = quality ? Math.round(quality.expectedScoreLoss * 10) / 10 : null;

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
          knownOpeningTrap: bookLookup.isOpeningTrap && !!bookLookup.trapNote,
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
          evalBeforeIsMate: !!evalBefore?.isMate,
          evalAfterIsMate: !!evalAfter?.isMate,
          fenBefore: posBefore.fen,
          fenAfter: posAfter.fen,
          element: posAfter.moveEl,
          isHumanTrap: false,
          isBeyondIntuition: false,
          divergenceType: null, // 'beyond_intuition' | 'precise_intuition' | 'intuition_trap' | null
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

      const sameDecisiveAdvantage = move => {
        const before = move.evalBeforeCp, after = -move.evalAfterCp;
        return Math.abs(before) > 600 && Math.abs(after) > 600 && Math.sign(before) === Math.sign(after);
      };
      const scoreVerifications = reusable ? (baseReview.scoreVerifications || []) : [];
      if (reviewMode && !reusable) {
        const deep = reviewMode === 'deep';
        const depthCap = deep ? 18 : 16;
        const minimum = depthCap - 2;
        const budget = { remaining: deep ? 10000 : 2200 };
        const candidates = analyzedMoves.filter(move => {
          if (move.isOnlyLegalMove || move.isBookMove || move.expectedScoreLoss == null) return false;
          return !sameDecisiveAdvantage(move) && (move.expectedScoreLoss >= 6 || (move.evalBeforeIsMate && !move.evalAfterIsMate));
        }).sort((a, b) => b.expectedScoreLoss - a.expectedScoreLoss || a.ply - b.ply).slice(0, deep ? 12 : 5);

        for (const [index, move] of candidates.entries()) {
          if (invalid()) return null;
          if (budget.remaining < 180) break;
          onProgress?.({ phase: 'scoring', current: index + 1, total: candidates.length,
            percent: scanPercent + Math.floor((engineOnly ? 14 : 0) * index / candidates.length) });
          const perMove = Math.min(budget.remaining, deep ? 2700 : 950);
          const started = budget.remaining;
          const root = await evaluate(move.fenBefore, depthCap, Math.floor(perMove / 2), 1, budget);
          if (invalid()) return null;
          if (!root?.bestMove?.uci || !Number.isFinite(root.scoreCp) || !(root.depth >= minimum) || root.isBound ||
              (root.pv?.length && root.pv[0] !== root.bestMove.uci)) continue;
          const isBest = root.bestMove.uci === move.uci;
          const after = isBest
            ? { scoreCp: -root.scoreCp, isMate: root.isMate }
            : await evaluate(move.fenAfter, root.depth - 1, perMove - (started - budget.remaining), 1, budget);
          if (invalid()) return null;
          if (!Number.isFinite(after?.scoreCp) || after.isBound ||
              (!isBest && !after.terminal && !(after.depth >= root.depth - 1))) continue;
          scoreVerifications.push({ ply: move.ply, depth: root.depth, best: root.bestMove,
            beforeCp: root.scoreCp, afterCp: after.scoreCp, beforeMate: root.isMate, afterMate: after.isMate });
        }
      }

      // Use the verified pair for this move. The chart retains one shared score per position.
      const verifiedWhiteScores = new Map();
      const scoreText = (cp, mate) => mate
        ? 'M' + (cp > 0 ? '+' : '-') + Math.round((10000 - Math.abs(cp)) / 100)
        : (cp > 0 ? '+' : '') + (cp / 100).toFixed(2);
      const clamp = cp => Math.max(-1000, Math.min(1000, cp));
      for (const verification of scoreVerifications) {
        const move = analyzedMoves[verification.ply - 1];
        if (!move) continue;
        const { beforeCp, afterCp, beforeMate, afterMate, best } = verification;
        const isBest = move.uci === best.uci;
        const lossCp = isBest ? 0 : Math.max(0, clamp(beforeCp) + clamp(afterCp));
        const quality = GameAnalyzer.moveAccuracy(beforeCp, -afterCp, isBest);
        Object.assign(move, {
          bestMove: best, bestUci: best.uci, bestSan: best.san,
          lossCp, lossPawns: '-' + (lossCp / 100).toFixed(2), severity: errorSeverity(lossCp),
          accuracy: quality.accuracy, expectedScoreLoss: Math.round(quality.expectedScoreLoss * 10) / 10,
          evalBefore: scoreText(beforeCp, beforeMate), evalAfter: scoreText(afterCp, afterMate),
          evalBeforeCp: beforeCp, evalAfterCp: afterCp, evalBeforeIsMate: !!beforeMate, evalAfterIsMate: !!afterMate,
          scoreVerificationDepth: verification.depth
        });
        const sign = move.turn === 'w' ? 1 : -1;
        verifiedWhiteScores.set(verification.ply - 1, [expectedScore(sign * beforeCp), expectedScore(-sign * afterCp)]);
      }
      const weights = GameAnalyzer.accuracyWeights(whiteScores, verifiedWhiteScores);
      analyzedMoves.forEach((move, i) => { move.accuracyWeight = weights[i]; });

      // Step 3: Maia intuition prediction for ALL moves
      // Guarantees comprehensive human intuition modeling across the whole game
      // without sampling bias or gaps in intuition score calculation.
      if (!engineOnly && this.maiaEngine && analyzedMoves.length > 0) {
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
          if (invalid()) break;
          if (waitForTurn) await waitForTurn(invalid);
          if (invalid()) return null;
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
            const pred = await this.maiaEngine.predict(mv.fenBefore, elo, null, invalid, historyFens);
            if (invalid()) return null;
            if (pred && pred.moves && pred.moves.length > 0) {
              mv._predMoves = pred.moves;
              const top1 = pred.moves[0];
              const top2 = pred.moves.length > 1 ? pred.moves[1] : null;

              mv.maiaTopSan = top1.san || null;
              mv.maiaTopUci = top1.uci || null;
              mv.maiaTopProb = typeof top1.prob === 'number' ? top1.prob : null;
              mv.maiaTopRawProb = Number.isFinite(top1.rawProb) ? top1.rawProb : (Number.isFinite(top1.prob) ? top1.prob / 100 : null);

              mv.maiaTop2San = top2?.san || null;
              mv.maiaTop2Uci = top2?.uci || null;
              mv.maiaTop2Prob = typeof top2?.prob === 'number' ? top2.prob : null;

              const matchedIndex = pred.moves.findIndex(move => move.uci === mv.uci);
              const matchedMove = pred.moves[matchedIndex];
              mv.humanProbability = matchedMove?.prob ?? null;
              mv.humanRawProbability = Number.isFinite(matchedMove?.rawProb) ? matchedMove.rawProb
                : Number.isFinite(matchedMove?.prob) ? matchedMove.prob / 100 : null;
              mv.humanChoiceRank = matchedIndex < 0 ? null : matchedIndex + 1;
              mv.isIntuitionDivergence = !!(mv.maiaTopUci && mv.bestUci && mv.maiaTopUci !== mv.bestUci);

              if (['unknown', 'forced'].includes(moveQuality(mv))) continue;
              mv.isBeyondIntuitionCandidate = mv.ply > 10 && !mv.isBookMove && mv.lossCp <= 20 &&
                !!mv.maiaTopUci && mv.maiaTopUci !== mv.uci && isLessLikelyChoice(mv.humanRawProbability, mv.maiaTopRawProb);
              mv.isHumanTrapCandidate = (mv.lossCp >= 40 || mv.isOpeningTrap) &&
                (mv.knownOpeningTrap || isHighTendency(mv.humanRawProbability, mv.humanChoiceRank));
            }
          } catch (e) {
            console.warn('[GameAnalyzer] Maia prediction error on ply', mv.ply, ':', e);
          }
        }
      }

      // Step 4: Compare the two root lines and look up only the missing alternatives.
      const candidateList = analyzedMoves.filter(move =>
        (move.isBeyondIntuitionCandidate || move.isHumanTrapCandidate) && (!reviewMode || !sameDecisiveAdvantage(move)));
      const targetDepth = reviewMode === 'deep' ? 18 : reviewMode === 'quick' ? 16 : Math.max(12, depth + 3);
      const minimumDepth = reviewMode ? targetDepth - 2 : Math.max(12, depth + 2);
      const intuitionBudget = { remaining: reviewMode === 'deep' ? 16000 : reviewMode === 'quick' ? 8000 : Infinity };
      if (reviewMode) candidateList.sort((a, b) => b.expectedScoreLoss - a.expectedScoreLoss || a.ply - b.ply);
      for (const [index, move] of candidateList.entries()) {
        if (invalid()) return null;
        if (intuitionBudget.remaining < 180) break;
        onProgress?.({ phase: 'verifying', current: index + 1, total: candidateList.length, percent: 95 });
        move.divergenceStatus = 'unconfirmed';
        const allocated = Math.min(6000, intuitionBudget.remaining);
        const budget = { remaining: allocated };
        try {
          const root = await evaluate(move.fenBefore, targetDepth, 4200, 2, budget);
          move.verificationDepth = root?.depth ?? 0;
          if (!root?.bestMove?.uci || !Number.isFinite(root.scoreCp) || !(root.depth >= minimumDepth) || root.isBound ||
              (root.pv?.length && root.pv[0] !== root.bestMove.uci)) continue;
          const verificationDepth = Math.min(root.depth, targetDepth);
          move.reviewStoryBestUci = root.bestMove.uci;

          const scores = new Map([[root.bestMove.uci, root.scoreCp]]);
          let playedPv;
          for (const line of root.lines || []) {
            if (line.uci && line.depth >= verificationDepth && Number.isFinite(line.scoreCp) && !line.isBound && !scores.has(line.uci)) {
              scores.set(line.uci, line.scoreCp);
              if (line.uci === move.uci && line.pv?.[0] === move.uci) playedPv = line.pv.slice(0, 3);
            }
          }

          const choices = [[move.uci, move.fenAfter]];
          if (move.isBeyondIntuitionCandidate && !scores.has(move.maiaTopUci)) {
            const board = new ChessBoard(move.fenBefore);
            const alternative = board.getLegalMoves().find(legal => legal.uci === move.maiaTopUci);
            if (alternative) {
              board.makeMove(alternative);
              choices.push([move.maiaTopUci, board.getFen()]);
            }
          }

          const missing = choices.filter(([uci]) => !scores.has(uci));
          for (const [i, [uci, fen]] of missing.entries()) {
            const result = await evaluate(fen, verificationDepth - 1, budget.remaining / (missing.length - i), 1, budget);
            if (invalid()) return null;
            if (Number.isFinite(result?.scoreCp) && !result.isBound && (result.terminal || result.depth >= verificationDepth - 1)) {
              scores.set(uci, -result.scoreCp);
              if (uci === move.uci && result.pv?.[0] === result.bestMove?.uci && result.pv?.length) {
                playedPv = [uci, ...result.pv.slice(0, 2)];
              }
            }
          }

          const runnerUp = root.lines?.find(line => line.multipv === 2 && line.uci !== root.bestMove.uci &&
            line.depth === root.depth && !line.isBound && Number.isFinite(line.scoreCp) && line.scoreCp <= root.scoreCp);
          const intuitionScore = move.maiaTopUci === root.bestMove.uci ? root.scoreCp : scores.get(move.maiaTopUci);
          if (runnerUp && Number.isFinite(intuitionScore)) {
            // A narrow position needs a gap to the actual runner-up as well as to Maia's first choice.
            const floor = expectedScore(root.scoreCp) - expectedScore(Math.max(runnerUp.scoreCp, intuitionScore));
            move.narrowChoice = { narrow: floor >= 0.08, found: move.uci === root.bestMove.uci };
          }
          const playedScore = scores.get(move.uci);
          if (!Number.isFinite(playedScore)) continue;
          const lossCp = Math.max(0, root.scoreCp - playedScore);
          const scoreLoss = Math.max(0, expectedScore(root.scoreCp) - expectedScore(playedScore)) * 100;
          move.verifiedLossCp = lossCp;
          move.verifiedExpectedScoreLoss = scoreLoss;
          const stableBest = root.bestMove.uci === move.uci;
          move.divergenceStatus = 'downgraded';

          if (move.isBeyondIntuitionCandidate) {
            const maiaScore = scores.get(move.maiaTopUci);
            if (!Number.isFinite(maiaScore)) { move.divergenceStatus = 'unconfirmed'; continue; }
            move.maiaLossCp = Math.max(0, root.scoreCp - maiaScore);
            move.maiaAdvantageCp = playedScore - maiaScore;
            move.maiaESL = (expectedScore(playedScore) - expectedScore(maiaScore)) * 100;
            const kind = positiveIntuition({
              lossCp, maiaAdvantageCp: move.maiaAdvantageCp, maiaESL: move.maiaESL,
              probability: move.humanRawProbability, maiaProbability: move.maiaTopRawProb, stableBest
            });
            if (kind) {
              move.divergenceType = kind;
              move.divergenceStatus = 'confirmed';
              if (kind === 'beyond_intuition') {
                const previous = analyzedMoves[move.ply - 3];
                move.isBeyondIntuition = true;
                move.isCombinationFollowup = !!(previous?.turn === move.turn && previous.isBeyondIntuition);
              }
            }
          } else if (move.isHumanTrapCandidate && !stableBest && qualifiesTrap({
            lossCp, scoreLoss, probability: move.humanRawProbability, rank: move.humanChoiceRank, knownOpeningTrap: move.knownOpeningTrap
          })) {
            move.isHumanTrap = true;
            move.divergenceType = 'intuition_trap';
            move.divergenceStatus = 'confirmed';
            move.verifiedBestSan = root.bestMove.san;
            move.verifiedBestUci = root.bestMove.uci;
            move.verifiedBestPv = root.pv?.slice(0, 3);
            move.verifiedPlayedPv = playedPv;
          }
        } catch (err) {
          console.warn('[GameAnalyzer] Deep verification error on ply', move.ply, err);
          move.divergenceStatus = 'unconfirmed';
        } finally {
          intuitionBudget.remaining -= allocated - budget.remaining;
        }
      }

      // Step 5: Score Calculation & Aggregation
      // 1. Engine Accuracy Scores (Overall & Post-Book)
      const whiteDecisionMoves = analyzedMoves.filter(m => m.turn === 'w' && !m.isOnlyLegalMove);
      const blackDecisionMoves = analyzedMoves.filter(m => m.turn === 'b' && !m.isOnlyLegalMove);

      const validAccWhite = whiteDecisionMoves.filter(m => typeof m.accuracy === 'number' && !isNaN(m.accuracy));
      const validAccBlack = blackDecisionMoves.filter(m => typeof m.accuracy === 'number' && !isNaN(m.accuracy));

      const accuracyWhite = GameAnalyzer.aggregateAccuracy(validAccWhite);
      const accuracyBlack = GameAnalyzer.aggregateAccuracy(validAccBlack);

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

      const postBookAccuracyWhite = GameAnalyzer.aggregateAccuracy(validPostWhite);
      const postBookAccuracyBlack = GameAnalyzer.aggregateAccuracy(validPostBlack);

      // 2. Key moments include serious mistakes independent of Maia availability.
      const keyMoments = analyzedMoves
        .filter(isKeyMoment)
        .sort((a, b) => a.ply - b.ply);

      const beyondIntuitionCount = analyzedMoves.filter(m => m.divergenceType === 'beyond_intuition' && !m.isCombinationFollowup).length;
      const intuitionTrapsCount = analyzedMoves.filter(m => m.divergenceType === 'intuition_trap').length;
      const beyondWhiteCount = analyzedMoves.filter(m => m.turn === 'w' && m.divergenceType === 'beyond_intuition' && !m.isCombinationFollowup).length;
      const beyondBlackCount = analyzedMoves.filter(m => m.turn === 'b' && m.divergenceType === 'beyond_intuition' && !m.isCombinationFollowup).length;
      const trapWhiteCount = analyzedMoves.filter(m => m.turn === 'w' && m.divergenceType === 'intuition_trap').length;
      const trapBlackCount = analyzedMoves.filter(m => m.turn === 'b' && m.divergenceType === 'intuition_trap').length;
      const bookMovesCount = analyzedMoves.filter(m => m.isBookMove).length;

      if (invalid()) {
        if (this._currentRunId === runId) this.isAnalyzing = false;
        return null;
      }

      const lossesFor = turn => analyzedMoves.filter(move => move.turn === turn && move.severity !== 'unknown').map(move => move.lossCp);
      const whiteLosses = lossesFor('w'), blackLosses = lossesFor('b');
      const acpl = losses => losses.length ? Math.round(losses.reduce((sum, loss) => sum + loss, 0) / losses.length) : 0;
      const countSeverity = severity => analyzedMoves.filter(move => move.severity === severity).length;
      const depths = evals.filter(e => e && !e.terminal && Number.isFinite(e.depth)).map(e => e.depth);
      const result = {
        engineOnly,
        engineGameKey,
        positionEvaluations: evals,
        ...(reviewMode ? { reviewMode, scoreVerifications } : {}),
        depthMin: depths.length ? Math.min(...depths) : null,
        depthMax: depths.length ? Math.max(...depths) : null,
        schemaVersion: GameAnalyzer.SCHEMA_VERSION,
        reviewPolicyVersion: GameAnalyzer.REVIEW_POLICY_VERSION,
        runId,
        gameKey: cacheKey,
        elo,
        depth,
        engineKey: this.stockfish.engineKey || 'sf19lite',
        modelKey: this.maiaEngine.modelKey || 'maia3-5m',
        totalMoves: positions.length - 1,
        isPartial: !!positions.isPartial,
        stoppedAtPly: positions.stoppedAtPly || null,
        unparsedSan: positions.unparsedSan || null,
        rawTotalMoves: moves.length,
        blundersCount: countSeverity('blunder'),
        mistakesCount: countSeverity('mistake'),
        inaccuraciesCount: countSeverity('inaccuracy'),
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
        maxLossWhite: (Math.max(0, ...whiteLosses) / 100).toFixed(2),
        maxLossBlack: (Math.max(0, ...blackLosses) / 100).toFixed(2),
        acplWhite: acpl(whiteLosses),
        acplBlack: acpl(blackLosses),
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
      if (cacheKey && !positions.isPartial && evalFailures === 0 && (engineOnly || analyzedMoves.every(m => m._predMoves?.length)) && this._currentRunId === runId) {
        await GameAnalyzer.saveCachedReview(cacheKey, result);
      }

      return (this._currentRunId === runId) ? result : null;
    } finally {
      if (this._currentRunId === runId) {
        this.isAnalyzing = false;
      }
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
