/**
 * Main World Bridge for Maia-3 Extension
 * Runs in the host page's MAIN execution world via manifest content_scripts world: MAIN.
 * Bypasses inline-script CSP and directly accesses Lichess / Chess.com page controllers.
 */

(function() {
  if (typeof window === 'undefined') return;
  if (window.__MAIA_MAIN_BRIDGE_INITIALIZED__) return;
  window.__MAIA_MAIN_BRIDGE_INITIALIZED__ = true;

  window.addEventListener('__MAIA_JUMP_REQ__', function(e) {
    var ply = e && e.detail && typeof e.detail.ply === 'number' ? e.detail.ply : null;
    if (ply === null) return;

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

      // 2. Chess.com Board & Game Controllers
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
  });

  console.log('[Maia-3] Main World Controller Bridge initialized ♟️');
})();
