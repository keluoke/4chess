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
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.1) {
        return false;
      }
      // Check physical layout only if layout engine is active (avoids false-negatives on JSDOM and position:fixed modals)
      const hasLayout = typeof document !== 'undefined' && ((document.body?.offsetWidth || 0) > 0 || (document.documentElement?.clientWidth || 0) > 0);
      if (hasLayout && style.position !== 'fixed' && el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) {
        return false;
      }
    } catch (e) {
      if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    }
    return true;
  }

  static phase() {
    if (!this.isLiveGameInProgress()) return 'study';
    if (this.visibleMatch('.clock-running, .rclock-running, .rclock .running, .rclock.running, button.resign, button[aria-label="Resign" i], [data-cy="resign-button"], button[aria-label="Abort" i], button[data-action="resign"]')) return 'live';
    return document.querySelector('wc-chess-board, chess-board, cg-board, .main-board') ? 'unknown' : 'lobby';
  }

  static visibleMatch(selector) {
    const elements = document.querySelectorAll ? [...document.querySelectorAll(selector)] : [document.querySelector(selector)];
    return elements.find(el => this.isVisibleAndActive(el)) || null;
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
      const resignBtn = FairPlayGuard.visibleMatch(
        'button.resign, .game__controls .resign, button[data-action="resign"], [data-hint*="Resign" i], [data-hint*="认输" i]'
      );
      const drawBtn = FairPlayGuard.visibleMatch(
        'button.draw-yes, .game__controls .draw-yes, button[data-action="draw-yes"]'
      );
      const hasRunningClock = document.querySelector('.rclock-running, .rclock .running, .clock-running, .rclock.running');

      const hasResignBtn = FairPlayGuard.isVisibleAndActive(resignBtn);
      const hasDrawBtn = FairPlayGuard.isVisibleAndActive(drawBtn);

      if (hasResignBtn || hasDrawBtn || hasRunningClock) {
        return true; // LIVE GAME ACTIVE!
      }
    }

    if (host.includes('chess.com')) {
      const abortBtn = FairPlayGuard.visibleMatch(
        'button[aria-label="Abort" i], button[aria-label="放弃" i], button[aria-label="取消" i], ' +
        '[data-cy="abort-button"], button.game-controls-abort, .abort-button-component, ' +
        '.game-controls-button[aria-label="Abort" i], .game-controls-button[aria-label="放弃" i]'
      );
      const resignBtn = FairPlayGuard.visibleMatch(
        'button[aria-label="Resign" i], button[aria-label="认输" i], .resign-button-component, ' +
        'button.game-controls-resign, [data-cy="resign-button"], .game-controls-button[aria-label="Resign" i], ' +
        '.game-controls-button[aria-label="认输" i], button.resign'
      );
      const drawBtn = FairPlayGuard.visibleMatch(
        'button[aria-label="Draw" i], button[aria-label="和棋" i], button[aria-label="Offer Draw" i], ' +
        'button[aria-label="提议和棋" i], button[aria-label*="Offer draw" i], .draw-button-component, [data-cy="draw-button"], ' +
        '.game-controls-button[aria-label="Draw" i], .game-controls-button[aria-label="和棋" i], button.draw-yes'
      );
      const hasRunningClock = document.querySelector(
        '.clock-player-turn.clock-running, .clock-running, .clock-component.clock-running, .clock.clock-running'
      );

      const hasAbortBtn = FairPlayGuard.isVisibleAndActive(abortBtn);
      const hasResignBtn = FairPlayGuard.isVisibleAndActive(resignBtn);
      const hasDrawBtn = FairPlayGuard.isVisibleAndActive(drawBtn);

      if (hasAbortBtn || hasResignBtn || hasDrawBtn || hasRunningClock) {
        return true; // LIVE GAME ACTIVE!
      }
    }

    // ------------------------------------------------------------------
    // 2. Whitelisted Safe Environments (Analysis, Study, Lessons - STRICT ONLY)
    // /tv, /broadcast, /events are deliberately excluded to ensure no active games run engine
    // ------------------------------------------------------------------
    if (host.includes('lichess.org')) {
      if (path.startsWith('/analysis') ||
          path.startsWith('/study') ||
          path.startsWith('/editor') ||
          path.startsWith('/practice') ||
          path.startsWith('/training') ||
          path.startsWith('/learn') ||
          path.startsWith('/puzzle')) {
        return false; // Whitelisted safe non-game analysis/study/puzzle
      }
    }

    if (host.includes('chess.com')) {
      if (path.startsWith('/analysis') ||
          path.startsWith('/puzzles') ||
          path.startsWith('/library') ||
          path.startsWith('/lessons') ||
          path.startsWith('/explorer') ||
          path.startsWith('/classroom') ||
          path.startsWith('/vision') ||
          path.startsWith('/drills')) {
        return false; // Whitelisted safe non-game analysis/lessons/drills
      }
    }

    // ------------------------------------------------------------------
    // 3. Trusted Game-Over / Concluded Evidence Check (Post-Game Archives)
    // Evidence must be explicitly bound to the current concluded game and visible.
    // Generic dialogs, links to /analysis, or new-game buttons do NOT qualify.
    // ------------------------------------------------------------------
    if (host.includes('lichess.org')) {
      const hasRunningClock = document.querySelector('.rclock-running, .rclock .running, .clock-running, .rclock.running');
      if (hasRunningClock) {
        return true;
      }

      // 1. Result elements or match status text
      const resultEl = FairPlayGuard.visibleMatch('.result-wrap .result, .result-wrap');
      const statusEl = FairPlayGuard.visibleMatch('.game__meta .status');
      const statusText = ((statusEl?.textContent || '') + ' ' + (resultEl?.textContent || '')).trim();

      const isStatusConcluded = /\bcheckmate\b|\bmate\b|time\s*out|timeout|time\s*forfeit|resign|drawn?|stalemate|abandoned|left the game|rules infraction|cheat|victor|defeat|\bwon\b|\blost\b|获胜|胜出|认输|超时|将死|和棋|离开对局|违规|1-0|0-1|1\/2/i.test(statusText);

      // 2. Dedicated Computer analysis container (only after game conclusion)
      const hasComputerAnalysis = document.querySelector('.computer-analysis');

      if ((resultEl && isStatusConcluded) || (statusEl && isStatusConcluded) || (hasComputerAnalysis && isStatusConcluded)) {
        return false; // Concluded historical match or post-game computer analysis!
      }

      // Fail-Safe: On any Lichess game path without confirmed conclusion, assume live game!
      if (/^\/[a-zA-Z0-9]{8,12}/.test(path)) {
        return true;
      }
    }

    if (host.includes('chess.com')) {
      const hasRunningClock = document.querySelector(
        '.clock-player-turn.clock-running, .clock-running, .clock-component.clock-running, .clock.clock-running'
      );
      if (hasRunningClock) {
        return true;
      }

      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      const isMetaConcluded = /won by|drawn by|won on time|won on disconnection|resignation|checkmate/i.test(metaDesc);

      // 1. Specific Game over modals and player result banners (must be visible and active!)
      // Excludes generic .board-dialog-component to avoid false-unlocks on promotion/settings dialogs
      const gameOverEl = FairPlayGuard.visibleMatch(
        '.game-over-modal, [data-cy="game-over-modal"], ' +
        '.game-over-dialog, [data-cy="game-over-dialog"], ' +
        '.game-over-header-component, [class*="game-over-header"], ' +
        '.game-over-player-component, [class*="game-over-player"], ' +
        '.game-over-message-component, [class*="game-over-message"], ' +
        '.live-game-over-component, [class*="live-game-over"], ' +
        '.game-result-component, [class*="game-result"]'
      );
      const isGameOverVisible = FairPlayGuard.isVisibleAndActive(gameOverEl);

      // 2. Move list termination result node (e.g. 1-0, 0-1, 1/2-1/2, ½-½)
      const moveListResult = FairPlayGuard.visibleMatch(
        '.move-list-result, [class*="move-list-result"], ' +
        '.vertical-move-list-result, [class*="vertical-move-list"] [class*="result"], ' +
        '.game-result, [class*="game-result"], .vertical-move-list'
      );
      const isMoveListConcluded = moveListResult && FairPlayGuard.isVisibleAndActive(moveListResult) &&
        /(?:^|\s)(?:1-0|0-1|1\/2-1\/2|½-½)\s*$/i.test(moveListResult.textContent || '');

      // 3. Post-game action controls (Game Review, Rematch, Play Again - present only after match concludes)
      const postGameActionBtn = FairPlayGuard.visibleMatch(
        '[data-cy="game-review-button"], button.game-review-buttons-review, ' +
        'button.game-review-button-component, [class*="game-review-button"], ' +
        'button[aria-label*="Game Review" i], button[aria-label*="对局复盘" i], button[aria-label*="复盘" i], ' +
        '[data-cy="new-game-button"], button.new-game-button-component, ' +
        '[data-cy="rematch-button"], button[aria-label*="Rematch" i], ' +
        'button[aria-label*="再来一局" i], button[aria-label*="新对局" i], ' +
        '.game-over-buttons-component, [class*="game-over-buttons"], ' +
        'a[href*="/analysis/game/live/"], a[href*="/analysis/game/daily/"]'
      );
      const hasPostGameAction = FairPlayGuard.isVisibleAndActive(postGameActionBtn);

      // 4. Status text conclusion check
      const statusText = ((isGameOverVisible ? gameOverEl?.textContent : '') + ' ' + (moveListResult?.textContent || '')).trim();
      const isStatusConcluded = /checkmate|resignation|resigned|time out|timeout|drawn|stalemate|agreed|abandoned|insufficient material|won by|won on|drawn by|game over|winner|victory|defeat|获胜|胜出|认输|超时|和棋|绝杀|对局结束/i.test(statusText);

      // Immediate Unlock for legitimately concluded matches:
      // Works whether modal is open, dismissed by user clicking X, or after page refresh!
      if (isGameOverVisible && (isStatusConcluded || isMoveListConcluded)) {
        return false;
      }
      if (isMoveListConcluded) {
        return false;
      }
      if (hasPostGameAction && (isStatusConcluded || isMoveListConcluded || isMetaConcluded)) {
        return false;
      }
      if (isMetaConcluded) {
        return false;
      }

      // On game archive or daily game paths:
      const isGamePath = path.startsWith('/game/live/') || path.startsWith('/game/daily/');
      if (isGamePath) {
        return true;
      }

      // In live arena (/play, /live) without confirmed conclusion evidence:
      // Fail-safe locked (matchmaking, pre-game, or waiting for opponent)
      const isPlayArena = path.startsWith('/play') || path.startsWith('/live');
      if (isPlayArena) {
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

    this._observer = new MutationObserver(runCheck);
    const target = document.body || document.documentElement;
    if (target) {
      this._observer.observe(target, {
        characterData: true,
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-label', 'data-cy', 'disabled', 'aria-disabled', 'hidden']
      });
    }

    window.addEventListener('popstate', runCheck);
    runCheck();
  }

  /**
   * Strictly verify if game data / PGN / platform API response represents a legitimately concluded game.
   * Serves as the immutable boundary gatekeeper for PWA imports, URL fetches, and standalone analysis.
   * Fail-Safe Principle: If conclusion cannot be verified beyond 100% doubt, returns { ok: false, isLive: true, reason: '...' }.
   */
  static verifyConcludedGame(data) {
    const denied = reason => ({ ok: false, isLive: true, reason });
    if (!data) return denied('对局数据为空，无法验证完赛状态');
    const record = typeof data === 'object' ? (data.game || data) : {};
    if (record.isFinished === false) return denied('对局尚未结束 (isFinished: false)');
    const status = String(record.status?.name || record.status || '').toLowerCase();
    if (['started', 'created', 'in_progress', 'live', 'playing', 'unknown'].includes(status)) {
      return denied(`对局仍在进行或状态未知 (${status})`);
    }
    const pgn = typeof data === 'string' ? data : (record.pgn || '');
    const results = [record.result, record.pgnHeaders?.Result, record.headers?.Result].filter(v => v !== undefined && v !== null);
    if (pgn) {
      const result = pgn.match(/\[Result\s+"([^"]+)"\]/i)?.[1];
      if (result !== undefined) results.push(result);
      const termination = pgn.match(/\[Termination\s+"([^"]+)"\]/i)?.[1] || '';
      if (/unterminated|live|ongoing/i.test(termination)) return denied('终局描述为未完赛');
      // Movetext may provide the outcome when a PGN omits the Result header.
      const end = pgn.replace(/\{[^}]*\}/g, '').trim().match(/(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)\s*$/)?.[1];
      if (end) results.push(end);
    }
    const outcomes = results.map(v => String(v).trim());
    if (!outcomes.length || outcomes.some(v => !['1-0', '0-1', '1/2-1/2'].includes(v)) || new Set(outcomes).size !== 1) {
      return denied('缺少明确且一致的完赛结果');
    }
    return { ok: true, isLive: false, reason: null, result: outcomes[0] };
  }

}

if (typeof window !== 'undefined') {
  window.FairPlayGuard = FairPlayGuard;
}
