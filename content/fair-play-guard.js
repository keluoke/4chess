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
   * Helper to check if a control element is actually visible, enabled, and interactive
   */
  static isVisibleAndActive(el) {
    if (!el) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest('[hidden], [aria-hidden="true"], .hidden')) return false;
    if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.1) {
        return false;
      }
    } catch (e) {}
    return true;
  }

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
      const resignBtn = document.querySelector(
        'button.resign, .game__controls .resign, button[data-action="resign"], [data-hint*="Resign" i], [data-hint*="认输" i]'
      );
      const drawBtn = document.querySelector(
        'button.draw-yes, .game__controls .draw-yes, button[data-action="draw-yes"]'
      );
      const hasCanMove = document.querySelector('cg-board.can-move, .your-turn');
      const isBroadcastRelay = path.startsWith('/broadcast');
      const hasRunningClock = !isBroadcastRelay && document.querySelector('.rclock-running, .rclock .running');

      const hasResignBtn = FairPlayGuard.isVisibleAndActive(resignBtn);
      const hasDrawBtn = FairPlayGuard.isVisibleAndActive(drawBtn);

      if (hasResignBtn || hasDrawBtn || hasCanMove || hasRunningClock) {
        return true; // LIVE GAME ACTIVE!
      }
    }

    if (host.includes('chess.com')) {
      const abortBtn = document.querySelector(
        'button[aria-label="Abort" i], button[aria-label="放弃" i], button[aria-label="取消" i], ' +
        '[data-cy="abort-button"], button.game-controls-abort, .abort-button-component, ' +
        '.game-controls-button[aria-label="Abort" i], .game-controls-button[aria-label="放弃" i]'
      );
      const resignBtn = document.querySelector(
        'button[aria-label="Resign" i], button[aria-label="认输" i], .resign-button-component, ' +
        'button.game-controls-resign, [data-cy="resign-button"], .game-controls-button[aria-label="Resign" i], ' +
        '.game-controls-button[aria-label="认输" i], button.resign'
      );
      const drawBtn = document.querySelector(
        'button[aria-label="Draw" i], button[aria-label="和棋" i], button[aria-label="Offer Draw" i], ' +
        'button[aria-label="提议和棋" i], button[aria-label*="Offer draw" i], .draw-button-component, [data-cy="draw-button"], ' +
        '.game-controls-button[aria-label="Draw" i], .game-controls-button[aria-label="和棋" i], button.draw-yes'
      );
      const canMoveEl = document.querySelector('wc-chess-board, chess-board');
      const canMoveVal = canMoveEl ? canMoveEl.getAttribute('can-move') : null;
      const hasCanMove = canMoveVal !== null && canMoveVal !== 'false' && canMoveVal !== '0';
      const isEventRelay = path.startsWith('/events');
      const hasRunningClock = !isEventRelay && document.querySelector(
        '.clock-player-turn.clock-running, .clock-running, .clock-component.clock-running'
      );

      const hasAbortBtn = FairPlayGuard.isVisibleAndActive(abortBtn);
      const hasResignBtn = FairPlayGuard.isVisibleAndActive(resignBtn);
      const hasDrawBtn = FairPlayGuard.isVisibleAndActive(drawBtn);

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
      // 1. Result elements or match crosstable
      const resultEl = document.querySelector('.result-wrap .result, .result-wrap, .crosstable__match, .crosstable');

      // 2. Computer analysis and review underboard elements (e.g. computer analysis tab)
      const hasAnalysisTools = document.querySelector(
        '.computer-analysis, .analyse__tools, .analyse-panels, .analyse__underboard, ' +
        '.ceval, .request-analysis, .future-game-analysis, [data-panel="analysis"], ' +
        '.fbt[data-act="analysis"], a[href*="/analysis"]'
      );

      // 3. Post-game controls & rating changes (only present after match conclusion)
      const hasPostGameMeta = document.querySelector(
        '.game__meta__players good, .game__meta__players bad, .player good, .player bad, ' +
        '.game__meta time.timeago, .round__side time.timeago, .fbt[data-act="rematch"], .fbt[data-act="new-opponent"], ' +
        '[data-hint*="Rematch" i], [data-hint*="再来一局" i]'
      );

      // 4. Status text conclusion check (bilingual: English + Chinese)
      const statusText = (document.querySelector('.game__meta .status, .game__meta')?.textContent || '') +
                         ' ' + (resultEl?.textContent || '');
      const isStatusConcluded = /checkmate|mate|time\s*out|timeout|time\s*forfeit|resign|drawn?|stalemate|abandoned|left the game|rules infraction|cheat|victor|defeat|won|lost|获胜|胜出|胜|赢|负|败|认输|超时|将死|和棋|离开对局|违规|1-0|0-1|1\/2/i.test(statusText);

      if (resultEl || hasAnalysisTools || hasPostGameMeta || isStatusConcluded) {
        return false; // Concluded historical match or post-game computer analysis!
      }

      // Fail-Safe: On a Lichess game path without confirmed conclusion, assume live game!
      if (/^\/[a-zA-Z0-9]{8,12}/.test(path)) {
        return true;
      }
    }

    if (host.includes('chess.com')) {
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      const isMetaConcluded = /won by|drawn by|won on time|won on disconnection|resignation|checkmate/i.test(metaDesc);

      // 1. Game over modals, dialogs, player result banners
      const gameOverEl = document.querySelector(
        '.game-over-modal, [data-cy="game-over-modal"], ' +
        '.game-over-dialog, [data-cy="game-over-dialog"], ' +
        '.board-dialog-component, [class*="board-dialog"], ' +
        '.game-over-header-component, [class*="game-over-header"], ' +
        '.game-over-player-component, [class*="game-over-player"], ' +
        '.game-over-message-component, [class*="game-over-message"], ' +
        '.live-game-over-component, [class*="live-game-over"], ' +
        '.game-result-component, [class*="game-result"]'
      );

      // 2. Post-game action buttons (Game Review, Rematch, New Game)
      const postGameActionBtn = document.querySelector(
        '[data-cy="game-review-button"], button.game-review-buttons-review, ' +
        'button.game-review-button-component, [class*="game-review-button"], ' +
        '[data-cy="new-game-button"], button.new-game-button-component, ' +
        '[data-cy="rematch-button"], button[aria-label*="Rematch" i], ' +
        'button[aria-label*="再来一局" i], button[aria-label*="新对局" i], ' +
        '.game-over-buttons-component, [class*="game-over-buttons"], ' +
        'a[href*="/analysis/game/live/"], a[href*="/analysis/game/daily/"]'
      );

      // 3. Move list termination result node (e.g. 1-0, 0-1, 1/2-1/2)
      const moveListResult = document.querySelector(
        '.move-list-result, [class*="move-list-result"], ' +
        '.vertical-move-list-result, [class*="vertical-move-list"] [class*="result"]'
      );
      const isMoveListConcluded = moveListResult && /1-0|0-1|1\/2/i.test(moveListResult.textContent || '');

      // 4. Status text conclusion check
      const statusText = (gameOverEl?.textContent || '') + ' ' + (moveListResult?.textContent || '');
      const isStatusConcluded = /checkmate|resignation|resigned|time out|timeout|drawn|stalemate|agreed|abandoned|insufficient material|won by|won on|drawn by|game over|获胜|胜出|认输|超时|和棋|绝杀|对局结束/i.test(statusText);

      // Verify that clock is NOT running
      const isEventRelay = path.startsWith('/events');
      const hasRunningClock = !isEventRelay && document.querySelector(
        '.clock-player-turn.clock-running, .clock-running, .clock-component.clock-running'
      );

      if (!hasRunningClock && (isMetaConcluded || gameOverEl || postGameActionBtn || isMoveListConcluded || isStatusConcluded)) {
        return false; // Concluded historical/post-game match!
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
   * Start DOM mutation watcher for Fair Play lockdown
   * Throttles DOM querySelector checks so running clocks don't cause CPU churn.
   */
  static startObserver(onChange) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._throttleTimer) {
      clearTimeout(this._throttleTimer);
      this._throttleTimer = null;
    }

    this.lastState = FairPlayGuard.isLiveGameInProgress();

    const runCheck = () => {
      const current = FairPlayGuard.isLiveGameInProgress();
      if (current !== this.lastState) {
        this.lastState = current;
        if (onChange) onChange(current);
      }
    };

    const throttledCheck = () => {
      if (this._throttleTimer) return;
      this._throttleTimer = setTimeout(() => {
        this._throttleTimer = null;
        runCheck();
      }, 150);
    };

    this._observer = new MutationObserver(throttledCheck);
    const target = document.body || document.documentElement;
    if (target) {
      this._observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-label', 'data-cy']
      });
    }

    window.addEventListener('popstate', runCheck);
    runCheck();
  }
}

if (typeof window !== 'undefined') {
  window.FairPlayGuard = FairPlayGuard;
}
