// Lightweight Mock DOM for testing FairPlayGuard in pure Node.js

function createMockEnv(url, elements = {}) {
  const urlObj = new URL(url);
  const elementsMap = new Map();

  function parseElement(selector, props = {}) {
    const el = {
      disabled: props.disabled || false,
      getAttribute: (attr) => props.attributes?.[attr] || (attr === 'aria-label' ? props.ariaLabel : null),
      textContent: props.textContent || '',
      offsetWidth: props.hidden ? 0 : (props.offsetWidth ?? 100),
      offsetHeight: props.hidden ? 0 : (props.offsetHeight ?? 30),
      offsetParent: props.hidden ? null : {},
      closest: (sel) => props.closestHidden ? {} : null
    };
    return el;
  }

  // Register selectors
  for (const [sel, props] of Object.entries(elements)) {
    elementsMap.set(sel, parseElement(sel, props));
  }

  const mockDocument = {
    querySelector: (selector) => {
      // Split comma-separated selector lists
      const parts = selector.split(',').map(s => s.trim());
      for (const part of parts) {
        for (const [key, el] of elementsMap.entries()) {
          // Direct match
          if (part === key) return el;

          // Attribute matches like button[aria-label="Resign" i]
          if (part.includes('aria-label="Resign"')) {
            if (el.getAttribute('aria-label')?.toLowerCase() === 'resign') return el;
          }
          if (part.includes('aria-label="Abort"')) {
            if (el.getAttribute('aria-label')?.toLowerCase() === 'abort') return el;
          }
          if (part.includes('aria-label="Draw"')) {
            if (el.getAttribute('aria-label')?.toLowerCase() === 'draw') return el;
          }
          if (part.includes('aria-label*="Rematch"')) {
            if (el.getAttribute('aria-label')?.toLowerCase().includes('rematch')) return el;
          }
          if (part.includes('class*="game-over"')) {
            if (key.includes('game-over')) return el;
          }
          if (part.includes('class*="game-result"')) {
            if (key.includes('game-result')) return el;
          }
          if (part.includes('class*="board-dialog"')) {
            if (key.includes('board-dialog')) return el;
          }
          if (part.includes('class*="move-list-result"')) {
            if (key.includes('move-list-result')) return el;
          }
        }
      }
      return null;
    }
  };

  const mockWindow = {
    location: {
      hostname: urlObj.hostname,
      pathname: urlObj.pathname,
      href: url
    },
    getComputedStyle: (el) => ({
      display: el.offsetParent === null ? 'none' : 'block',
      visibility: 'visible',
      opacity: '1'
    })
  };

  return { mockWindow, mockDocument };
}

async function testScenario(name, { url, elements, expectedLocked }) {
  const { mockWindow, mockDocument } = createMockEnv(url, elements);
  global.window = mockWindow;
  global.document = mockDocument;

  const { FairPlayGuard } = await import(`../content/fair-play-guard.js?t=${Date.now()}_${Math.random()}`);
  const isLocked = FairPlayGuard.isLiveGameInProgress();

  if (isLocked === expectedLocked) {
    console.log(`✅ [PASS] ${name} -> locked: ${isLocked}`);
    return true;
  } else {
    console.error(`❌ [FAIL] ${name} -> expected locked: ${expectedLocked}, but got: ${isLocked}`);
    return false;
  }
}

async function runAll() {
  let passed = 0;
  let total = 0;

  // Scenario 1: Chess.com Live Game in Progress
  total++;
  if (await testScenario('Chess.com Live Game (clock running, resign button active)', {
    url: 'https://www.chess.com/play/online',
    elements: {
      '.clock-running': { textContent: '05:20' },
      'button.game-controls-resign': { ariaLabel: 'Resign' },
      'wc-chess-board[can-move]': {}
    },
    expectedLocked: true
  })) passed++;

  // Scenario 2: Chess.com Game Over Modal Mounted (Clock stopped, modal visible)
  total++;
  if (await testScenario('Chess.com Game Concluded with Modal', {
    url: 'https://www.chess.com/play/online',
    elements: {
      'button.game-controls-resign': { ariaLabel: 'Resign', disabled: true, hidden: true },
      '.game-over-modal': { textContent: 'White won by checkmate' },
      '[data-cy="game-review-button"]': {}
    },
    expectedLocked: false
  })) passed++;

  // Scenario 3: Chess.com Game Over with Modal Closed (user clicked X, but move list has 1-0 and new-game button)
  total++;
  if (await testScenario('Chess.com Game Concluded, Modal Dismissed (Move list 1-0)', {
    url: 'https://www.chess.com/game/live/123456789',
    elements: {
      '.move-list-result': { textContent: '1-0' },
      '[data-cy="new-game-button"]': {}
    },
    expectedLocked: false
  })) passed++;

  // Scenario 4: Chess.com Board Dialog Component
  total++;
  if (await testScenario('Chess.com Game Concluded with Board Dialog', {
    url: 'https://www.chess.com/play/online',
    elements: {
      '.board-dialog-component': { textContent: 'Black won on time' },
      'button.game-review-buttons-review': {}
    },
    expectedLocked: false
  })) passed++;

  // Scenario 5: Chess.com Analysis Board
  total++;
  if (await testScenario('Chess.com Analysis Board (/analysis)', {
    url: 'https://www.chess.com/analysis',
    elements: {},
    expectedLocked: false
  })) passed++;

  // Scenario 6: Lichess Live Game in Progress
  total++;
  if (await testScenario('Lichess Live Game (clock running, resign button active)', {
    url: 'https://lichess.org/abcd1234',
    elements: {
      '.rclock-running': { textContent: '03:00' },
      'button.resign': {}
    },
    expectedLocked: true
  })) passed++;

  // Scenario 7: Lichess Game Over
  total++;
  if (await testScenario('Lichess Game Concluded (.result-wrap)', {
    url: 'https://lichess.org/abcd1234',
    elements: {
      '.result-wrap .result': { textContent: '0-1' },
      '.game__meta .status': { textContent: 'Black won by checkmate' }
    },
    expectedLocked: false
  })) passed++;

  // Scenario 8: Lichess Analysis Board
  total++;
  if (await testScenario('Lichess Analysis Board (/analysis)', {
    url: 'https://lichess.org/analysis',
    elements: {},
    expectedLocked: false
  })) passed++;

  console.log(`\n[Test Results]: ${passed}/${total} scenarios passed.`);
  if (passed === total) {
    console.log('🎉 All Fair Play Guard tests passed successfully!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAll();
