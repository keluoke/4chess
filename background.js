/**
 * Maia-3 Service Worker (Manifest V3)
 * Handles extension lifecycle, storage initialization, and secure background API requests.
 */

import { ChessBoard } from './engine/chess-core.js';

const TCN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=";
const TCN_PROMO_PIECES = "qnrbkp";

function decodeTcn(tcnString) {
  if (!tcnString || typeof tcnString !== 'string') return [];
  const moves = [];

  for (let i = 0; i < tcnString.length; i += 2) {
    const code1 = TCN_ALPHABET.indexOf(tcnString[i]);
    let code2 = TCN_ALPHABET.indexOf(tcnString[i + 1]);
    if (code1 === -1 || code2 === -1) continue;

    const move = {};
    if (code2 > 63) {
      const promoIndex = Math.floor((code2 - 64) / 3);
      move.promotion = TCN_PROMO_PIECES[promoIndex];
      const offset = ((code2 - 1) % 3) - 1;
      code2 = code1 + (code1 < 16 ? -8 : 8) + offset;
    }
    if (code1 > 75) {
      const dropIndex = code1 - 79;
      move.drop = TCN_PROMO_PIECES[dropIndex];
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

function tcnToSanMoves(tcnString) {
  const tcnMoves = decodeTcn(tcnString);
  if (!tcnMoves || tcnMoves.length === 0) return [];

  const chess = new ChessBoard();
  const moves = [];

  for (let i = 0; i < tcnMoves.length; i++) {
    const mv = tcnMoves[i];
    const uci = mv.from + mv.to + (mv.promotion || '');
    const legals = chess.getLegalMoves();
    const found = legals.find(m => m.uci === uci || (m.fromSq === mv.from && m.toSq === mv.to));
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

function movesToPgn(moves, headers = {}) {
  let pgn = '';
  for (const [k, v] of Object.entries(headers)) {
    pgn += `[${k} "${v}"]\n`;
  }
  pgn += '\n';
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) {
      pgn += `${Math.floor(i / 2) + 1}. `;
    }
    pgn += `${moves[i].san} `;
  }
  if (headers.Result) {
    pgn += headers.Result;
  }
  return pgn.trim();
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Maia-3 Extension] Installed successfully.');
  // Initialize default user settings in chrome.storage.local
  chrome.storage.local.set({
    defaultElo: 1900,
    preferredBackend: 'webgpu',
    showHeatmap: true,
    showArrows: true,
    heatmapOpacity: 0.55
  });
});

// Handle background requests (bypasses webpage CSP & forbidden headers)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FETCH_CHESSCOM_GAME_PGN') {
    handleFetchChesscomGame(msg.gameId, msg.usernames || [], msg.gameType || 'live')
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (msg.type === 'FETCH_LICHESS_GAME_PGN') {
    handleFetchLichessGame(msg.gameId)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function handleFetchChesscomGame(gameId, usernames = [], gameType = 'live') {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  // Strategy 1: Check live/daily game callback (fast & directly provides TCN moveList)
  for (const type of [gameType, 'live', 'daily']) {
    try {
      const cbRes = await fetch(`https://www.chess.com/callback/${type}/game/${gameId}`, { headers });
      if (cbRes.ok) {
        const cbData = await cbRes.json();
        if (cbData.game?.moveList) {
          const moves = tcnToSanMoves(cbData.game.moveList);
          if (moves.length > 0) {
            const pgn = movesToPgn(moves, cbData.game.pgnHeaders || {});
            return { ok: true, pgn, moves, source: `chesscom-${type}-callback-tcn` };
          }
        }
        const directPgn = cbData.game?.pgn || cbData.pgn;
        if (directPgn) {
          return { ok: true, pgn: directPgn, source: `chesscom-${type}-callback` };
        }
      }
    } catch (e) {
      console.warn(`[Background] ${type} callback notice:`, e);
    }
  }

  return { ok: false, error: '未能在 Chess.com 找到该对局数据 (Game not found)' };
}

async function handleFetchLichessGame(gameId) {
  try {
    const resp = await fetch(`https://lichess.org/game/export/${gameId}?moves=true&pgnInJson=true`, {
      headers: { 'Accept': 'application/json' }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.pgn) {
        return { ok: true, pgn: data.pgn, source: 'lichess-export' };
      }
    }
  } catch (e) {
    console.warn('[Background] Lichess export error:', e);
  }
  return { ok: false, error: '未能在 Lichess 找到该对局导出数据' };
}
