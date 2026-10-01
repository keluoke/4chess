import { JSDOM } from 'jsdom';
import { FairPlayGuard } from '../content/fair-play-guard.js';

function runScenario(name, html, url, expectedLocked) {
  const dom = new JSDOM(html, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;

  const actualLocked = FairPlayGuard.isLiveGameInProgress();
  const passed = actualLocked === expectedLocked;

  if (passed) {
    console.log(`✅ [DOM PASS] ${name} -> locked: ${actualLocked}`);
  } else {
    console.error(`❌ [DOM FAIL] ${name} -> expected: ${expectedLocked}, actual: ${actualLocked}`);
    throw new Error(`DOM test failed: ${name}`);
  }
  return dom;
}

console.log('--- 1. Testing Real Sanitized HTML DOM Fixtures (JSDOM Engine) ---\n');

// 1. Chess.com Live Game in Progress
runScenario(
  'Chess.com Live Game (active clock + resign button in real DOM tree)',
  `<!DOCTYPE html>
  <html>
    <head><title>Play Chess Online - Chess.com</title></head>
    <body class="theme-dark">
      <div id="board-layout-main" class="board-layout-main">
        <div class="board-layout-player bottom">
          <div class="clock-component clock-bottom clock-running">
            <span class="time">04:32</span>
          </div>
        </div>
        <div class="board-layout-sidebar">
          <div class="game-controls-component">
            <button class="game-controls-button" aria-label="Resign" type="button">
              <span class="icon-font-chess flag"></span>
            </button>
            <button class="game-controls-button" aria-label="Draw" type="button">
              <span class="icon-font-chess half-point"></span>
            </button>
          </div>
        </div>
      </div>
    </body>
  </html>`,
  'https://www.chess.com/play/online',
  true
);

// 2. Chess.com Game Concluded with Modal
runScenario(
  'Chess.com Game Concluded with Game Over Modal',
  `<!DOCTYPE html>
  <html>
    <body>
      <div class="clock-component clock-bottom">
        <span class="time">02:15</span>
      </div>
      <div class="game-over-modal visible">
        <div class="game-over-dialog-content">
          <div class="game-over-header">White Won by Checkmate</div>
          <button class="ui_v5-button-component ui_v5-button-primary" aria-label="Game Review">
            Game Review
          </button>
        </div>
      </div>
    </body>
  </html>`,
  'https://www.chess.com/game/live/1029384756',
  false
);

// 3. Chess.com Modal Dismissed (Move list has 1-0 result, clock stopped)
runScenario(
  'Chess.com Modal Dismissed (Final board inspection, move list 1-0)',
  `<!DOCTYPE html>
  <html>
    <body>
      <div class="clock-component clock-bottom">
        <span class="time">00:00</span>
      </div>
      <div class="vertical-move-list">
        <div class="node">1. e4 e5</div>
        <div class="node">2. Nf3 Nc6</div>
        <div class="game-result">1-0</div>
      </div>
      <div class="game-controls-component">
        <button class="ui_v5-button-component" aria-label="Rematch">Rematch</button>
        <button class="ui_v5-button-component" aria-label="Game Review">Game Review</button>
      </div>
    </body>
  </html>`,
  'https://www.chess.com/play/online',
  false
);

// 4. Chess.com Refreshed Completed Game Page
runScenario(
  'Chess.com Refreshed Completed Game (/play/online with 0-1 outcome)',
  `<!DOCTYPE html>
  <html>
    <body>
      <div class="board-layout-sidebar">
        <div class="move-list-wrapper">
          <span class="move-list-result">0-1</span>
        </div>
        <button class="ui_v5-button-primary" aria-label="Game Review">Game Review</button>
      </div>
    </body>
  </html>`,
  'https://www.chess.com/play/online/game/10928374',
  false
);

// 5. Lichess Live Game in Progress
runScenario(
  'Lichess Live Game (active .rclock-running + resign button)',
  `<!DOCTYPE html>
  <html>
    <body>
      <div class="round__app">
        <div class="rclock rclock-bottom rclock-running">
          <div class="time">02:45</div>
        </div>
        <div class="game__controls">
          <button class="fbt resign" data-hint="Resign"></button>
          <button class="fbt draw-yes" data-hint="Offer draw"></button>
        </div>
      </div>
    </body>
  </html>`,
  'https://lichess.org/aBcDeFgH',
  true
);

// 6. Lichess Concluded Game (.result-wrap)
runScenario(
  'Lichess Concluded Game (.result-wrap with White victory)',
  `<!DOCTYPE html>
  <html>
    <body>
      <div class="round__app">
        <div class="rclock rclock-bottom">
          <div class="time">01:10</div>
        </div>
        <div class="result-wrap">
          <p class="status">White is victorious</p>
          <p class="result">1-0</p>
        </div>
      </div>
    </body>
  </html>`,
  'https://lichess.org/aBcDeFgH',
  false
);

// 7. Lichess Chinese Localization Concluded Game
runScenario(
  'Lichess Concluded Game (Chinese locale: 黑方离开对局 • 白方胜)',
  `<!DOCTYPE html>
  <html>
    <body>
      <div class="result-wrap">
        <p class="status">黑方离开对局 • 白方胜</p>
        <p class="result">1-0</p>
      </div>
    </body>
  </html>`,
  'https://lichess.org/NKf48lZ4',
  false
);

// 8. Lichess Analysis Board (Whitelisted analysis mode)
runScenario(
  'Lichess Analysis Board (/analysis with interactive move list)',
  `<!DOCTYPE html>
  <html>
    <body>
      <div class="analyse__app">
        <div class="analyse__moves">
          <move>e4</move>
          <move>e5</move>
        </div>
      </div>
    </body>
  </html>`,
  'https://lichess.org/analysis',
  false
);

console.log('\n--- 2. Testing Dynamic Full Game Lifecycle State Machine ---');

// Full Lifecycle Test on a single dynamic document:
// Pre-Game -> Live In-Progress -> Concluded -> Modal Dismissed -> Page Refresh -> New Game
const lifecycleDom = new JSDOM(
  `<!DOCTYPE html>
  <html>
    <body>
      <div id="game-container">
        <!-- Initially in lobby/idle state -->
        <div class="lobby-banner">Finding opponent...</div>
      </div>
    </body>
  </html>`,
  { url: 'https://www.chess.com/play/online' }
);

globalThis.window = lifecycleDom.window;
globalThis.document = lifecycleDom.window.document;
globalThis.location = lifecycleDom.window.location;

// Step 1: Pre-game / Lobby on /play/online -> must be fail-safe locked under iron law
if (!FairPlayGuard.isLiveGameInProgress()) {
  throw new Error('Lifecycle Step 1 (Lobby /play/online) must be fail-safe locked');
}
console.log('✅ [Lifecycle Step 1] Pre-Game / Lobby on /play/online -> fail-safe locked (engine idle, visual clear)');

// Step 2: Opponent found! Live Clock starts running, Resign button appears
const container = document.getElementById('game-container');
container.innerHTML = `
  <div class="clock-component clock-running"><span class="time">03:00</span></div>
  <button class="game-controls-button" aria-label="Resign"></button>
`;
if (!FairPlayGuard.isLiveGameInProgress()) {
  throw new Error('Lifecycle Step 2 (Live Game) must be locked');
}
console.log('✅ [Lifecycle Step 2] Live Game In-Progress (clock running, resign active) -> locked (100% fail-safe)');

// Step 3: Game Concludes! Clock stops, Game Over Modal pops up
container.innerHTML = `
  <div class="clock-component"><span class="time">01:42</span></div>
  <div class="game-over-modal">
    <div class="header">Game Over - 1-0</div>
    <button aria-label="Game Review">Game Review</button>
  </div>
`;
if (FairPlayGuard.isLiveGameInProgress()) {
  throw new Error('Lifecycle Step 3 (Game Over Modal) must be unlocked');
}
console.log('✅ [Lifecycle Step 3] Game Concluded with Modal -> instantly unlocked for review');

// Step 4: User dismisses the modal to view the final board position
container.innerHTML = `
  <div class="clock-component"><span class="time">01:42</span></div>
  <div class="vertical-move-list">
    <div class="node">1. e4 e5</div>
    <div class="game-result">1-0</div>
  </div>
  <button aria-label="Rematch">Rematch</button>
`;
if (FairPlayGuard.isLiveGameInProgress()) {
  throw new Error('Lifecycle Step 4 (Modal Dismissed) must remain unlocked');
}
console.log('✅ [Lifecycle Step 4] Modal Dismissed -> remains unlocked (no re-lock trap)');

// Step 5: User refreshes page (game result in move list, clock stopped)
container.innerHTML = `
  <div class="vertical-move-list">
    <div class="game-result">1-0</div>
  </div>
  <button aria-label="Game Review">Game Review</button>
`;
if (FairPlayGuard.isLiveGameInProgress()) {
  throw new Error('Lifecycle Step 5 (Refreshed Page) must remain unlocked');
}
console.log('✅ [Lifecycle Step 5] Page Refreshed -> remains unlocked (persistent review)');

// Step 6: User starts a new game! Clock starts running, new resign button appears
container.innerHTML = `
  <div class="clock-component clock-running"><span class="time">03:00</span></div>
  <button class="game-controls-button" aria-label="Resign"></button>
`;
if (!FairPlayGuard.isLiveGameInProgress()) {
  throw new Error('Lifecycle Step 6 (New Game) must immediately re-lock');
}
console.log('✅ [Lifecycle Step 6] New Live Game Started -> instantly re-locked (seamless safety)');

console.log('\n🎉 All Real DOM Fixture and Dynamic Lifecycle tests passed successfully!');
