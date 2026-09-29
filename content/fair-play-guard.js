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
    // 1. Active In-Game Controls (Absolute Highest Priority - Immediate Lock)
    // Under NO circumstances may whitelist or completion indicators override active game controls!
    // ------------------------------------------------------------------
    if (host.includes('lichess.org')) {
      const hasResignBtn = document.querySelector(
        'button.resign, .game__controls .resign, button[data-action="resign"], [data-hint*="Resign" i], [data-hint*="认输" i]'
      );
      const hasDrawBtn = document.querySelector(
        'button.draw-yes, .game__controls .draw-yes, button[data-action="draw-yes"]'
      );
      const hasCanMove = document.querySelector('cg-board.can-move, .your-turn');
      const isBroadcastRelay = path.startsWith('/broadcast');
      const hasRunningClock = !isBroadcastRelay && document.querySelector('.rclock-running, .rclock .running');

      if (hasResignBtn || hasDrawBtn || hasCanMove || hasRunningClock) {
        return true; // LIVE GAME ACTIVE!
      }
    }

    if (host.includes('chess.com')) {
      const hasAbortBtn = document.querySelector(
        'button[aria-label*="Abort" i], button[aria-label*="放弃" i], button[aria-label*="取消" i], ' +
        '[data-cy="abort-button"], button.game-controls-abort, .abort-button-component, ' +
        '.game-controls-button[aria-label*="Abort" i], .game-controls-button[aria-label*="放弃" i]'
      );
      const hasResignBtn = document.querySelector(
        'button[aria-label*="Resign" i], button[aria-label*="认输" i], .resign-button-component, ' +
        'button.game-controls-resign, [data-cy="resign-button"], .game-controls-button[aria-label*="Resign" i], ' +
        '.game-controls-button[aria-label*="认输" i], button.resign'
      );
      const hasDrawBtn = document.querySelector(
        'button[aria-label*="Draw" i], button[aria-label*="和棋" i], button[aria-label*="Offer Draw" i], ' +
        'button[aria-label*="提议和棋" i], .draw-button-component, [data-cy="draw-button"], ' +
        '.game-controls-button[aria-label*="Draw" i], .game-controls-button[aria-label*="和棋" i], button.draw-yes'
      );
      const hasCanMove = document.querySelector('wc-chess-board[can-move], chess-board[can-move]');
      const isEventRelay = path.startsWith('/events');
      const hasRunningClock = !isEventRelay && document.querySelector(
        '.clock-player-turn.clock-running, .clock-running, .clock-component.clock-running'
      );

      if (hasAbortBtn || hasResignBtn || hasDrawBtn || hasCanMove || hasRunningClock) {
        return true; // LIVE GAME ACTIVE!
      }
    }

    // ------------------------------------------------------------------
    // 2. Whitelisted Safe Environments (Analysis, Study, Lessons - /tv EXCLUDED)
    // ------------------------------------------------------------------
    if (host.includes('lichess.org')) {
      if (path.startsWith('/analysis') ||
          path.startsWith('/study') ||
          path.startsWith('/broadcast') ||
          path.startsWith('/editor') ||
          path.startsWith('/practice') ||
          path.startsWith('/training') ||
          path.startsWith('/learn') ||
          path.startsWith('/puzzle')) {
        return false; // Whitelisted safe (non-game analysis/study/puzzle/relay)
      }
    }

    if (host.includes('chess.com')) {
      if (path.startsWith('/analysis') ||
          path.startsWith('/events') ||
          path.startsWith('/puzzles') ||
          path.startsWith('/library') ||
          path.startsWith('/lessons') ||
          path.startsWith('/explorer') ||
          path.startsWith('/classroom') ||
          path.startsWith('/vision') ||
          path.startsWith('/drills')) {
        return false; // Whitelisted safe (non-game analysis/lessons/drills/events)
      }
    }

    // ------------------------------------------------------------------
    // 3. Trusted Game-Over / Concluded Evidence Check (Post-Game Archives)
    // ------------------------------------------------------------------
    if (host.includes('lichess.org')) {
      const resultEl = document.querySelector('.result-wrap .result, .crosstable__match');
      const statusText = document.querySelector('.game__meta .status')?.textContent || '';
      const isStatusConcluded = /checkmate|time out|resigns|drawn|stalemate|abandoned|rules infraction|victory|defeat/i.test(statusText);

      if (resultEl || isStatusConcluded) {
        return false; // Concluded historical match
      }

      // Fail-Safe: On a Lichess game path without confirmed conclusion, assume live game!
      if (/^\/[a-zA-Z0-9]{8,12}/.test(path)) {
        return true;
      }
    }

    if (host.includes('chess.com')) {
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      const isMetaConcluded = /won by|drawn by|won on time|won on disconnection|resignation|checkmate/i.test(metaDesc);

      const gameOverEl = document.querySelector(
        '.game-over-modal, .game-result-component, .live-game-over-component, ' +
        '[data-cy="game-review-button"], .game-review-buttons-review, .game-over-dialog, ' +
        '.game-over-header-component, [data-cy="game-over-modal"], .game-over-player-component'
      );

      if (isMetaConcluded || gameOverEl) {
        return false; // Concluded historical match
      }

      // Daily or Live game paths without verified conclusion:
      // Fail-Safe: Must be locked!
      if (path.startsWith('/game/live/') || path.startsWith('/game/daily/') || path.startsWith('/play') || path.startsWith('/live')) {
        return true;
      }
    }

    // ------------------------------------------------------------------
    // 4. Default Fail-Safe Principle:
    // If we are on a chess site and cannot 100% prove the game is over, LOCK!
    // ------------------------------------------------------------------
    if (host.includes('chess.com') || host.includes('lichess.org')) {
      return true;
    }

    return false;
  }

  /**
   * Start 0ms instant DOM mutation watcher for Fair Play lockdown
   */
  static startObserver(onChange) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (this._observer) this._observer.disconnect();

    this.lastState = FairPlayGuard.isLiveGameInProgress();

    const check = () => {
      const current = FairPlayGuard.isLiveGameInProgress();
      if (current !== this.lastState) {
        this.lastState = current;
        if (onChange) onChange(current);
      }
    };

    this._observer = new MutationObserver(check);
    const target = document.body || document.documentElement;
    if (target) {
      this._observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-label', 'data-cy']
      });
    }

    window.addEventListener('popstate', check);
    check();
  }
}

if (typeof window !== 'undefined') {
  window.FairPlayGuard = FairPlayGuard;
}
