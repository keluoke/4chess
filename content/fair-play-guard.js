/**
 * Fair Play & Anti-Cheat Protection Guard (公平竞技铁律守卫)
 * 
 * IRON LAW:
 * Under NO circumstances may this extension provide engine analysis, candidate moves,
 * intuition arrows, or attention heatmaps during an active, ongoing chess game on Chess.com or Lichess.
 * 
 * The extension must ONLY operate in:
 * 1. Analysis Board (分析台 / 自由拆解)
 * 2. Study & Explorer (棋谱研究)
 * 3. Concluded / Archived Games (已完赛对局 / 局后复盘)
 */

export class FairPlayGuard {
  /**
   * Returns true if an active live game is currently being played
   */
  static isLiveGameInProgress() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }

    const host = window.location.hostname;
    const path = window.location.pathname;

    // ------------------------------------------------------------------
    // Lichess.org Checks
    // ------------------------------------------------------------------
    if (host.includes('lichess.org')) {
      // 1. Explicit analysis, study, or editor are ALWAYS safe
      if (path.startsWith('/analysis') || path.startsWith('/study') || path.startsWith('/editor') || path.startsWith('/practice')) {
        return false;
      }

      // 2. Check if game is already concluded
      const isConcluded = document.querySelector('.result-wrap, .game__meta .status, .analyse__controls, .crosstable__match');
      if (isConcluded) {
        return false;
      }

      // 3. Active in-game indicators: active resign/draw buttons or ticking clocks
      const hasResignBtn = document.querySelector('button.resign, .game__controls .resign, button[data-action="resign"]');
      const hasDrawBtn = document.querySelector('button.draw-yes, .game__controls .draw-yes');
      const hasRunningClock = document.querySelector('.rclock-running');

      if (hasResignBtn || hasDrawBtn || hasRunningClock) {
        return true; // LIVE GAME ACTIVE!
      }

      return false;
    }

    // ------------------------------------------------------------------
    // Chess.com Checks
    // ------------------------------------------------------------------
    if (host.includes('chess.com')) {
      // 1. Analysis, Explorer, Puzzles, Lessons, Library are ALWAYS safe
      if (path.startsWith('/analysis') ||
          path.startsWith('/puzzles') ||
          path.startsWith('/library') ||
          path.startsWith('/lessons') ||
          path.startsWith('/explorer') ||
          path.startsWith('/classroom')) {
        return false;
      }

      // 2. Archived game records (/game/live/:id and /game/daily/:id)
      if (path.startsWith('/game/live/') || path.startsWith('/game/daily/')) {
        // If an active countdown clock is physically running, it is an active live match
        const hasActiveRunningClock = document.querySelector('.clock-running, .clock-component.clock-running');
        if (hasActiveRunningClock) {
          return true;
        }
        return false; // Concluded historical archive
      }

      // 3. Check if game has already concluded
      // Check meta description for termination text
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      if (/won by|drawn by|won on time|won on disconnection|resignation|checkmate/i.test(metaDesc)) {
        return false; // Concluded game
      }

      // Check Game Over modal or Review buttons
      const isGameOver = document.querySelector(
        '.game-over-modal, .game-result-component, .live-game-over-component, ' +
        '[data-cy="game-review-button"], .game-review-buttons-review, .game-over-dialog, ' +
        '.game-over-header-component, [data-cy="game-over-modal"]'
      );
      if (isGameOver) {
        return false; // Concluded game
      }

      // 4. Check active in-game controls:
      const hasResignBtn = document.querySelector(
        'button[aria-label="Resign"], button[aria-label="认输"], .resign-button-component, ' +
        'button.game-controls-resign, [data-cy="resign-button"], .game-controls-button[aria-label="Resign"], ' +
        '.game-controls-button[aria-label="认输"], button.resign'
      );
      const hasDrawBtn = document.querySelector(
        'button[aria-label="Draw"], button[aria-label="和棋"], button[aria-label="Offer Draw"], ' +
        'button[aria-label="提议和棋"], .draw-button-component, [data-cy="draw-button"], ' +
        '.game-controls-button[aria-label="Draw"], .game-controls-button[aria-label="和棋"], button.draw-yes'
      );
      const hasRunningClock = document.querySelector(
        '.clock-player-turn.clock-running, .clock-running, .clock-component.clock-running'
      );

      // If active play controls exist and no game-over modal, a game is in progress!
      if (hasResignBtn || hasDrawBtn || hasRunningClock) {
        return true; // LIVE GAME ACTIVE!
      }

      return false;
    }

    return false;
  }
}
