import './scan/controller.js';
/**
 * Maia-3 Service Worker (Manifest V3)
 * Handles extension lifecycle, storage initialization, and secure background API requests.
 */

import { ChessBoard } from './engine/chess-core.js';
import { normalizeEnginePreferences } from './engine/engine-preferences.js';

import { tcnToSanMoves, movesToPgn } from './engine/chess-notation.js';

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Maia-3 Extension] Installed successfully.');
  if (chrome.storage?.session?.setAccessLevel) {
    try {
      chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    } catch (e) {}
  }
  // Initialize default user settings in chrome.storage.local
  const defaults = {
    defaultElo: 1900,
    preferredBackend: 'inbrowser',
    showHeatmap: false,
    showArrows: true,
    heatmapOpacity: 0.55
  };
  const saved = await chrome.storage.local.get(Object.keys(defaults));
  await chrome.storage.local.set(Object.fromEntries(Object.entries(defaults).filter(([key]) => saved[key] === undefined)));
});

if (chrome.storage?.session?.setAccessLevel) {
  try {
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
  } catch (e) {}
}

const sandboxTokens = new Map();

async function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, exp] of sandboxTokens.entries()) {
    if (exp <= now) sandboxTokens.delete(token);
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    try {
      const stored = await chrome.storage.session.get(['active_tokens']);
      if (stored?.active_tokens) {
        const cleaned = {};
        for (const [k, v] of Object.entries(stored.active_tokens)) {
          if (v > now) {
            cleaned[k] = v;
            sandboxTokens.set(k, v);
          }
        }
        await chrome.storage.session.set({ active_tokens: cleaned });
      }
    } catch (e) {}
  }
}

// Serialize persisted token mutations so a token can be consumed only once, even after SW resume.
let tokenOperation = Promise.resolve();
function serializeToken(operation) {
  const result = tokenOperation.then(operation);
  tokenOperation = result.catch(() => {});
  return result;
}

// Handle background requests (bypasses webpage CSP & forbidden headers)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ACQUIRE_SANDBOX_TOKEN') {
    serializeToken(async () => {
      await cleanExpiredTokens();
      const token = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : ('sb_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      const exp = Date.now() + 120000;
      sandboxTokens.set(token, exp);
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        try {
          const stored = await chrome.storage.session.get(['active_tokens']);
          const tokens = stored?.active_tokens || {};
          tokens[token] = exp;
          await chrome.storage.session.set({ active_tokens: tokens });
        } catch (e) {}
      }
      sendResponse({ ok: true, token });
    }).catch(() => sendResponse({ ok: false, error: 'Sandbox token storage unavailable' }));
    return true;
  }

  if (msg.type === 'VERIFY_SANDBOX_TOKEN') {
    serializeToken(async () => {
      await cleanExpiredTokens();
      const token = msg.token;
      let valid = false;
      if (token && sandboxTokens.has(token) && sandboxTokens.get(token) > Date.now()) {
        sandboxTokens.delete(token);
        valid = true;
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        try {
          const stored = await chrome.storage.session.get(['active_tokens']);
          if (stored?.active_tokens && stored.active_tokens[token] > Date.now()) {
            valid = true;
            delete stored.active_tokens[token];
            await chrome.storage.session.set({ active_tokens: stored.active_tokens });
          }
        } catch (e) {}
      }
      if (valid) {
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'Invalid or expired sandbox token' });
      }
    }).catch(() => sendResponse({ ok: false, error: 'Sandbox token storage unavailable' }));
    return true;
  }

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

  if (msg.type === 'OPEN_ANALYSIS_TAB') {
    const gameData = msg.gameData || {};

    // Ensure PGN text is generated if moves are present
    if (!gameData.pgn && gameData.moves && gameData.moves.length > 0) {
      gameData.pgn = movesToPgn(gameData.moves, {
        White: (gameData.white && gameData.white !== '白方') ? gameData.white : (gameData.white || 'White'),
        Black: (gameData.black && gameData.black !== '黑方') ? gameData.black : (gameData.black || 'Black'),
        Result: gameData.result || '*'
      });
    }

    chrome.storage.local.get(['useWebReview', 'webReviewBaseUrl', 'defaultElo', 'maia3_lang', 'maiaVariant', 'stockfishVariant', 'cloudflareCdnUrl'], (settings) => {
      chrome.storage.local.set({ active_analysis_game: gameData }, () => {
        // Default to true: open 4chess.cc web review directly!
        const useWeb = settings?.useWebReview !== false;
        let targetUrl = chrome.runtime.getURL('analysis/index.html');

        if (useWeb && gameData.pgn) {
          let base = (settings?.webReviewBaseUrl || 'https://4chess.cc/analysis').replace(/\/+$/, '');
          if (!base.endsWith('/analysis')) {
            base = `${base}/analysis`;
          }
          const pgnParam = encodeURIComponent(gameData.pgn);
          const elo = settings?.defaultElo || 1900;
          const lang = settings?.maia3_lang || gameData.lang;
          let extra = '';
          if (gameData.white && gameData.white !== '白方') extra += `&white=${encodeURIComponent(gameData.white)}`;
          if (gameData.black && gameData.black !== '黑方') extra += `&black=${encodeURIComponent(gameData.black)}`;
          if (gameData.result && gameData.result !== '*') extra += `&result=${encodeURIComponent(gameData.result)}`;
          if (lang) extra += `&lang=${encodeURIComponent(lang)}`;
          const prefs = normalizeEnginePreferences(settings);
          const sf = prefs.stockfishVariant;
          const maia = prefs.maiaVariant;
          targetUrl = `${base}/?sf=${sf}&maia=${maia}#pgn=${pgnParam}&elo=${elo}${extra}`;
        }

        chrome.tabs.create({ url: targetUrl }, (tab) => {
          sendResponse({ ok: true, tabId: tab?.id, targetUrl });
        });
      });
    });
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
            return {
              ok: true,
              pgn,
              moves,
              isFinished: cbData.game.isFinished,
              status: cbData.game.status,
              source: `chesscom-${type}-callback-tcn`
            };
          }
        }
        const directPgn = cbData.game?.pgn || cbData.pgn;
        if (directPgn) {
          return {
            ok: true,
            pgn: directPgn,
            isFinished: cbData.game?.isFinished,
            status: cbData.game?.status,
            source: `chesscom-${type}-callback`
          };
        }
      }
    } catch (e) {
      console.warn(`[Background] ${type} callback notice:`, e);
    }
  }

  return { ok: false, error: '未能在 Chess.com 找到该对局数据 (Game not found)' };
}

async function handleFetchLichessGame(gameId) {
  const cleanId = (gameId || '').trim().replace(/^https?:\/\/lichess\.org\//, '').split('/')[0].slice(0, 8);
  if (!cleanId || cleanId.length < 8) {
    return { ok: false, error: '无效的 Lichess 对局 ID (Invalid Lichess Game ID)' };
  }

  // Strategy 1: JSON export (contains parsed pgn & moves)
  try {
    const resp = await fetch(`https://lichess.org/game/export/${cleanId}?moves=true&pgnInJson=true`, {
      headers: { 'Accept': 'application/json' }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.pgn) {
        return {
          ok: true,
          pgn: data.pgn,
          movesStr: data.moves,
          status: data.status,
          source: 'lichess-export-json'
        };
      }
    }
  } catch (e) {
    console.warn('[Background] Lichess json export notice:', e);
  }

  // Strategy 2: Plain PGN export fallback
  try {
    const rawResp = await fetch(`https://lichess.org/game/export/${cleanId}`);
    if (rawResp.ok) {
      const pgn = await rawResp.text();
      if (pgn && pgn.includes('1.')) {
        return { ok: true, pgn, source: 'lichess-export-raw' };
      }
    }
  } catch (e) {
    console.warn('[Background] Lichess raw export notice:', e);
  }

  return { ok: false, error: '未能在 Lichess 找到该对局导出数据' };
}
