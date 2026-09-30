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

  // Scenario 3b: Chess.com /play/online with Modal Dismissed (Move list 1-0 and Review Button) -> MUST UNLOCK!
  total++;
  if (await testScenario('Chess.com /play/online with Modal Dismissed (Move list 1-0)', {
    url: 'https://www.chess.com/play/online',
    elements: {
      '.move-list-result': { textContent: '1-0' },
      '[data-cy="game-review-button"]': {}
    },
    expectedLocked: false
  })) passed++;

  // Scenario 3c: Chess.com /play/online Refreshed Concluded Game (Move list 0-1, clock stopped) -> MUST UNLOCK!
  total++;
  if (await testScenario('Chess.com /play/online Refreshed Concluded Game (Move list 0-1)', {
    url: 'https://www.chess.com/play/online',
    elements: {
      '.move-list-result': { textContent: '0-1' }
    },
    expectedLocked: false
  })) passed++;

  // Scenario 4: Chess.com Generic Board Dialog (e.g. promo or settings dialog) -> MUST REMAIN LOCKED
  total++;
  if (await testScenario('Chess.com Generic Board Dialog (must remain locked)', {
    url: 'https://www.chess.com/play/online',
    elements: {
      '.board-dialog-component': { textContent: 'Select promotion piece' }
    },
    expectedLocked: true
  })) passed++;

  // Scenario 5: Chess.com Game Concluded with Game-Over Dialog
  total++;
  if (await testScenario('Chess.com Game Concluded with Game Over Dialog', {
    url: 'https://www.chess.com/play/online',
    elements: {
      '.game-over-dialog': { textContent: 'Black won on time' }
    },
    expectedLocked: false
  })) passed++;

  // Scenario 6: Chess.com /events with running clock -> MUST BE LOCKED!
  total++;
  if (await testScenario('Chess.com /events with running clock (must be locked)', {
    url: 'https://www.chess.com/events/2026-speed-chess-championship',
    elements: {
      '.clock-running': { textContent: '01:45' }
    },
    expectedLocked: true
  })) passed++;

  // Scenario 7: Chess.com Stale/Hidden Game Over Modal on /play/online -> MUST BE LOCKED!
  total++;
  if (await testScenario('Chess.com Stale/Hidden Game Over Modal on /play/online (must be locked)', {
    url: 'https://www.chess.com/play/online',
    elements: {
      '.game-over-modal': { textContent: 'White won by checkmate', hidden: true }
    },
    expectedLocked: true
  })) passed++;

  // Scenario 8: Chess.com Delayed Loading on /play/online (empty DOM) -> MUST BE LOCKED!
  total++;
  if (await testScenario('Chess.com Delayed Loading on /play/online (fail-safe locked)', {
    url: 'https://www.chess.com/play/online',
    elements: {},
    expectedLocked: true
  })) passed++;

  // Scenario 9: Chess.com Analysis Board (interactive board must NOT be falsely locked)
  total++;
  if (await testScenario('Chess.com Analysis Board (/analysis)', {
    url: 'https://www.chess.com/analysis',
    elements: {
      'wc-chess-board[can-move]': {}
    },
    expectedLocked: false
  })) passed++;

  // Scenario 10: Lichess Live Game in Progress
  total++;
  if (await testScenario('Lichess Live Game (clock running, resign button active)', {
    url: 'https://lichess.org/abcd1234',
    elements: {
      '.rclock-running': { textContent: '03:00' },
      'button.resign': {}
    },
    expectedLocked: true
  })) passed++;

  // Scenario 11: Lichess /broadcast with running clock -> MUST BE LOCKED!
  total++;
  if (await testScenario('Lichess /broadcast with running clock (must be locked)', {
    url: 'https://lichess.org/broadcast/candidates-2026/round-1/12345678',
    elements: {
      '.rclock-running': { textContent: '12:30' }
    },
    expectedLocked: true
  })) passed++;

  // Scenario 12: Lichess Live Game with Navbar <a href="/analysis"> -> MUST REMAIN LOCKED!
  total++;
  if (await testScenario('Lichess Live Game with Navbar a[href*="/analysis"] (must be locked)', {
    url: 'https://lichess.org/abcd1234',
    elements: {
      'a[href*="/analysis"]': { textContent: 'Analysis Board' }
    },
    expectedLocked: true
  })) passed++;

  // Scenario 13: Lichess Game Over
  total++;
  if (await testScenario('Lichess Game Concluded (.result-wrap)', {
    url: 'https://lichess.org/abcd1234',
    elements: {
      '.result-wrap .result': { textContent: '0-1' },
      '.game__meta .status': { textContent: 'Black won by checkmate' }
    },
    expectedLocked: false
  })) passed++;

  // Scenario 14: Lichess Analysis Board
  total++;
  if (await testScenario('Lichess Analysis Board (/analysis)', {
    url: 'https://lichess.org/analysis',
    elements: {},
    expectedLocked: false
  })) passed++;

  // Scenario 15: Lichess Game Over with "Black left the game • White is victorious" (NKf48lZ4)
  total++;
  if (await testScenario('Lichess Concluded: Black left the game • White is victorious (NKf48lZ4)', {
    url: 'https://lichess.org/NKf48lZ4/black#20',
    elements: {
      '.game__meta .status': { textContent: 'Black left the game • White is victorious' },
      '.round__side time.timeago': { textContent: '3 weeks ago' }
    },
    expectedLocked: false
  })) passed++;

  // Scenario 16: Lichess Computer Analysis Tab (Request Computer Analysis page)
  total++;
  if (await testScenario('Lichess Computer Analysis Page (.computer-analysis)', {
    url: 'https://lichess.org/NKf48lZ4/black#20',
    elements: {
      '.computer-analysis': {},
      '.game__meta .status': { textContent: 'White won by resignation' }
    },
    expectedLocked: false
  })) passed++;

  // Scenario 17: Lichess Concluded in Chinese language
  total++;
  if (await testScenario('Lichess Concluded in Chinese (黑方离开对局 • 白方胜)', {
    url: 'https://lichess.org/12345678',
    elements: {
      '.game__meta .status': { textContent: '黑方离开对局 • 白方胜' }
    },
    expectedLocked: false
  })) passed++;

  // --- Platform Import Boundary Verification Tests (P0 Gatekeeper) ---
  const { FairPlayGuard } = await import('../content/fair-play-guard.js');

  // Scenario 18: Lichess Live Game Import Boundary (status: started, Result: *)
  total++;
  const lichessLive = FairPlayGuard.verifyConcludedGame({
    id: 'rQcbeYAC',
    status: 'started',
    pgn: '[Event "rated bullet game"]\n[Result "*"]\n[Termination "Unterminated"]\n\n1. d4 Nf6'
  });
  if (!lichessLive.ok && lichessLive.isLive) {
    console.log('✅ [PASS] Lichess Live Game Import -> strictly rejected & locked');
    passed++;
  } else {
    console.error('❌ [FAIL] Lichess Live Game Import was not locked:', lichessLive);
  }

  // Scenario 19: Lichess Concluded Game Import Boundary (status: timeout, Result: 1-0)
  total++;
  const lichessConcluded = FairPlayGuard.verifyConcludedGame({
    id: 'NKf48lZ4',
    status: 'timeout',
    pgn: '[Event "rated blitz game"]\n[Result "1-0"]\n[Termination "Time forfeit"]\n\n1. e4 d6'
  });
  if (lichessConcluded.ok) {
    console.log('✅ [PASS] Lichess Concluded Game Import -> verified & accepted');
    passed++;
  } else {
    console.error('❌ [FAIL] Lichess Concluded Game Import rejected:', lichessConcluded);
  }

  // Scenario 20: Chess.com Active Live Game Import Boundary (isFinished: false)
  total++;
  const chesscomLive = FairPlayGuard.verifyConcludedGame({
    isFinished: false,
    status: 'in_progress',
    pgn: '[Event "Live Chess"]\n[Result "*"]\n\n1. e4 e5'
  });
  if (!chesscomLive.ok && chesscomLive.isLive) {
    console.log('✅ [PASS] Chess.com Live Game Import (isFinished: false) -> strictly rejected & locked');
    passed++;
  } else {
    console.error('❌ [FAIL] Chess.com Live Game Import was not locked:', chesscomLive);
  }

  // Scenario 21: Chess.com Concluded Game Import Boundary (isFinished: true, Result: 0-1)
  total++;
  const chesscomConcluded = FairPlayGuard.verifyConcludedGame({
    isFinished: true,
    status: 'finished',
    pgn: '[Event "Live Chess"]\n[Result "0-1"]\n[Termination "won by resignation"]\n\n1. e4 e5 2. Nf3'
  });
  if (chesscomConcluded.ok) {
    console.log('✅ [PASS] Chess.com Concluded Game Import (isFinished: true) -> verified & accepted');
    passed++;
  } else {
    console.error('❌ [FAIL] Chess.com Concluded Game Import rejected:', chesscomConcluded);
  }

  // Scenario 22: Fail-Safe for Incomplete / Ongoing PGN with Result: *
  total++;
  const unfinishedPgn = FairPlayGuard.verifyConcludedGame(
    '[Event "Casual Game"]\n[Result "*"]\n\n1. d4 d5'
  );
  if (!unfinishedPgn.ok && unfinishedPgn.isLive) {
    console.log('✅ [PASS] Ongoing PGN with Result: * -> fail-safe locked');
    passed++;
  } else {
    console.error('❌ [FAIL] Ongoing PGN with Result: * was not locked:', unfinishedPgn);
  }

  console.log(`\n[Test Results]: ${passed}/${total} scenarios passed.`);
  if (passed === total) {
    console.log('🎉 All Fair Play Guard tests passed successfully!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAll();
