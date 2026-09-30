/**
 * Main World Bridge for Maia-3 Extension
 * Runs in the host page's MAIN execution world via manifest content_scripts world: MAIN.
 * Bypasses inline-script CSP and directly accesses Lichess / Chess.com page controllers.
 */

(function() {
  if (typeof window === 'undefined') return;
  if (window.__MAIA_MAIN_BRIDGE_INITIALIZED__) return;
  window.__MAIA_MAIN_BRIDGE_INITIALIZED__ = true;

  function executeJump(ply) {
    if (typeof ply !== 'number') return;
    try {
      // 1. Lichess Lila Analysis Controller
      if (window.lichess && window.lichess.analysis) {
        if (typeof window.lichess.analysis.jumpToMain === 'function') {
          window.lichess.analysis.jumpToMain(ply);
          return;
        }
        if (typeof window.lichess.analysis.jump === 'function') {
          window.lichess.analysis.jump(ply);
          return;
        }
      }

      // 2. Chess.com Web Component Controllers
      var board = document.querySelector('wc-chess-board') || document.querySelector('chess-board');
      if (board) {
        if (board.game && typeof board.game.goToPly === 'function') {
          board.game.goToPly(ply);
          return;
        }
        if (board.controller && typeof board.controller.goToPly === 'function') {
          board.controller.goToPly(ply);
          return;
        }
        if (board.game && typeof board.game.jumpToPly === 'function') {
          board.game.jumpToPly(ply);
          return;
        }
      }
    } catch (err) {
      console.warn('[Maia-3 Bridge] Jump error:', err);
    }
  }

  function extractGameData() {
    try {
      var b = document.querySelector('wc-chess-board') || document.querySelector('chess-board');
      var g = b ? (b.game || b.controller) : null;
      var pgn = (g && typeof g.getPGN === 'function' ? g.getPGN() : '') ||
                (b && typeof b.getPGN === 'function' ? b.getPGN() : '') ||
                (g && g.getOptions && g.getOptions().pgn ? g.getOptions().pgn : '') || '';
      var moveList = (g && g.moveList) || (g && g.getOptions && g.getOptions().moveList) || '';
      var movesAttr = (b && typeof b.getAttribute === 'function' ? b.getAttribute('moves') : '') || '';

      var white = null;
      var black = null;
      var result = null;

      if (pgn) {
        var wm = pgn.match(/\[White\s+"([^"]+)"\]/i);
        var bm = pgn.match(/\[Black\s+"([^"]+)"\]/i);
        var rm = pgn.match(/\[Result\s+"([^"]+)"\]/i);
        if (wm) white = wm[1].trim();
        if (bm) black = bm[1].trim();
        if (rm) result = rm[1].trim();
      }

      if (!white || !black) {
        try {
          if (g) {
            if (typeof g.getPlayers === 'function') {
              var pls = g.getPlayers();
              if (pls) {
                if (pls.white?.username) white = pls.white.username;
                if (pls.black?.username) black = pls.black.username;
                if (!white && pls.top && pls.bottom) {
                  white = pls.top.color === 'white' ? pls.top.username : pls.bottom.username;
                  black = pls.top.color === 'black' ? pls.top.username : pls.bottom.username;
                }
              }
            }
            if ((!white || !black) && typeof g.getOptions === 'function') {
              var opts = g.getOptions();
              if (opts) {
                white = white || opts.white?.username || opts.headers?.White;
                black = black || opts.black?.username || opts.headers?.Black;
                result = result || opts.headers?.Result || opts.result;
              }
            }
            if ((!white || !black) && g.players) {
              white = white || g.players.white?.username || g.players.white?.name;
              black = black || g.players.black?.username || g.players.black?.name;
            }
          }
        } catch (e) {}
      }

      return { pgn: pgn, moveList: moveList, movesAttr: movesAttr, white: white, black: black, result: result };
    } catch (e) {
      return null;
    }
  }

  window.addEventListener('__MAIA_PAGE_DATA_REQ__', function() {
    var data = extractGameData();
    window.dispatchEvent(new CustomEvent('__MAIA_PAGE_DATA_RES__', { detail: data }));
  });

  // Support both CustomEvent and postMessage for jump
  window.addEventListener('__MAIA_JUMP_REQ__', function(e) {
    var ply = e && e.detail && typeof e.detail.ply === 'number' ? e.detail.ply : null;
    if (ply !== null) executeJump(ply);
  });

  window.addEventListener('message', function(e) {
    if (e.source !== window) return;
    if (e.data && e.data.type === '__MAIA_JUMP_REQ__') {
      var ply = typeof e.data.ply === 'number' ? e.data.ply : null;
      if (ply !== null) executeJump(ply);
    }
  });

  console.log('[Maia-3] Main World Controller & Data Bridge initialized ♟️');
})();
