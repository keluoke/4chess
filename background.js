/**
 * Maia-3 Service Worker (Manifest V3)
 * Handles extension lifecycle, storage initialization, and secure background API requests.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Maia-3 Extension] Installed successfully.');
  // Initialize default user settings in chrome.storage.local
  chrome.storage.local.set({
    defaultElo: 1500,
    preferredBackend: 'webgpu',
    showHeatmap: true,
    showArrows: true,
    heatmapOpacity: 0.55
  });
});

// Handle background requests (bypasses webpage CSP & forbidden headers)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FETCH_CHESSCOM_GAME_PGN') {
    handleFetchChesscomGame(msg.gameId, msg.usernames || [])
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

async function handleFetchChesscomGame(gameId, usernames) {
  const headers = { 'User-Agent': 'ChessIntuitionExtension/1.0 (contact@4chess.cc)' };
  const usersToTry = new Set((usernames || []).filter(Boolean));

  // Strategy 1: Check live game callback (returns direct PGN or reveals player usernames)
  try {
    const cbRes = await fetch(`https://www.chess.com/callback/live/game/${gameId}`, { headers });
    if (cbRes.ok) {
      const cbData = await cbRes.json();
      if (cbData.players) {
        if (cbData.players.top?.username) usersToTry.add(cbData.players.top.username);
        if (cbData.players.bottom?.username) usersToTry.add(cbData.players.bottom.username);
      }
      const pgn = cbData.game?.pgn || cbData.pgn;
      if (pgn) {
        return { ok: true, pgn, source: 'chesscom-callback' };
      }
    }
  } catch (e) {
    console.warn('[Background] Live callback notice:', e);
  }

  // Strategy 2: Query user monthly archives (fast & reliable)
  for (const user of usersToTry) {
    if (!user) continue;
    try {
      const archRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`, { headers });
      if (archRes.ok) {
        const archData = await archRes.json();
        // Check newest archives first (last 2 months)
        const recentArchives = (archData.archives || []).slice(-2).reverse();
        for (const archUrl of recentArchives) {
          const gRes = await fetch(archUrl, { headers });
          if (gRes.ok) {
            const gData = await gRes.json();
            const g = gData.games?.find(x => x.url && x.url.includes(gameId));
            if (g && g.pgn) {
              return { ok: true, pgn: g.pgn, source: 'chesscom-api' };
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Background] Archive fetch error for', user, e);
    }
  }

  // Strategy 3: Check daily game callback
  try {
    const dailyRes = await fetch(`https://www.chess.com/callback/daily/game/${gameId}`, { headers });
    if (dailyRes.ok) {
      const dailyData = await dailyRes.json();
      const pgn = dailyData.game?.pgn || dailyData.pgn;
      if (pgn) {
        return { ok: true, pgn, source: 'chesscom-daily-callback' };
      }
    }
  } catch (e) {
    console.warn('[Background] Daily callback notice:', e);
  }

  return { ok: false, error: '未能在 Chess.com 归档中找到该对局记录 (Game not found in archives)' };
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
