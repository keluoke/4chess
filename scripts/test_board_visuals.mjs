import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/board-visuals-20261110');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const reviewPaths = { 'www.chess.com': '/game/187600541178', 'lichess.org': '/AbCd1234' };
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/ui/theme.css"><link rel="stylesheet" href="/ui/chessboard.css"><link rel="stylesheet" href="/analysis/analysis.css"><style>
body{margin:0;padding:32px;background:var(--dg-paper);color:var(--dg-ink);font:14px system-ui}.compare{display:flex;gap:32px}.board{width:480px!important;height:480px!important;max-width:none;flex-shrink:0}h2{font-size:16px;font-weight:600;margin:0 0 14px}p{color:var(--dg-muted)}.host{position:relative;overflow:hidden;border-radius:12px}.host .maia-square{pointer-events:none}svg{display:block}
</style></head><body class="diverge-ui" data-theme="light"><h1 style="font-size:24px">统一棋盘视觉</h1><p>蓝色 ★ 引擎最佳　·　金色 M Maia 首选　·　整格落点热力图</p><div class="compare"><section><h2>Chess.com / Lichess 页面分析</h2><div class="board host"></div></section><section><h2>全盘分析工作台</h2><div class="board studio"></div></section></div></body></html>`;
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 710 }, deviceScaleFactor: 1.25, reducedMotion: 'reduce' });
  await context.route('https://**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/analysis/visual-fixture' || url.pathname === reviewPaths[url.hostname]) {
      return route.fulfill({ body: html, contentType: 'text/html' });
    }
    const file = path.join(root, url.pathname);
    if (!fs.existsSync(file)) return route.abort();
    return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'application/javascript' : 'text/css' });
  });
  for (const host of ['www.chess.com', 'lichess.org']) {
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`https://${host}/analysis/visual-fixture`);
    await page.evaluate(async () => {
      const { HeatmapOverlay } = await import('/content/heatmap-overlay.js');
      const { BoardUI } = await import('/analysis/board-ui.js');
      window.studio = new BoardUI(document.querySelector('.studio'));
      window.overlay = new HeatmapOverlay();
      window.hostBoard = document.querySelector('.host');
      overlay.attach(hostBoard);
      window.prediction = { isAvailable: true, turn: 'w', moves: [{ from: 'e2', to: 'e4', uci: 'e2e4', san: 'e4', prob: 46 }], stockfish: { bestMove: { from: 'd2', to: 'd4', uci: 'd2d4', san: 'd4' }, score: '+0.25' }, heatmap: Array(64).fill(.22) };
      prediction.heatmap[28] = .9; prediction.heatmap[27] = .55;
      window.paint = (orientation = 'white') => {
        studio.setOrientation(orientation);
        hostBoard.querySelectorAll('.maia-square').forEach(el => el.remove());
        for (const square of Object.values(studio.squareEls)) {
          square.classList.add('intuition-heat'); square.style.setProperty('--heat-opacity', String(Math.min(.6, prediction.heatmap[(+square.dataset.square[1] - 1) * 8 + square.dataset.square.charCodeAt(0) - 97] * .6)));
          const clone = square.cloneNode(true); clone.classList.remove('intuition-heat'); hostBoard.prepend(clone);
        }
        overlay.setOrientation(orientation); overlay.render(prediction);
        studio.setArrows([{ from: 'e2', to: 'e4', color: 'gold' }, { from: 'd2', to: 'd4', color: 'blue', role: 'sf' }]);
      };
      paint();
    });
    for (const theme of ['light', 'dark']) for (const orientation of ['white', 'black']) {
      await page.evaluate(({ theme, orientation }) => { document.body.dataset.theme = theme; paint(orientation); }, { theme, orientation });
      const geometry = await page.evaluate(() => {
        const hostSvg = document.querySelector('#maia3-board-overlay');
        const shape = line => ['x1','y1','x2','y2','stroke','stroke-width','opacity'].map(key => line.getAttribute(key));
        const linesMatch = ['sf', 'maia'].every(role => JSON.stringify(shape(hostSvg.querySelector(`line[data-role="${role}"]`))) === JSON.stringify(shape(studio.svgOverlay.querySelector(`line[data-role="${role}"]`))));
        const base = hostBoard.getBoundingClientRect();
        const tiles = [...overlay.heatmapSvg.querySelectorAll('#maia-heatmap-layer rect')].map(rect => rect.getBoundingClientRect());
        return { linesMatch, tiles: tiles.length, covers: tiles.every(tile => Math.abs(tile.width - base.width / 8) < .02 && Math.abs(tile.height - base.height / 8) < .02 && tile.left >= base.left - .02 && tile.right <= base.right + .02 && tile.top >= base.top - .02 && tile.bottom <= base.bottom + .02), badges: [...hostSvg.querySelectorAll('[data-move-badge]')].map(el => el.dataset.moveBadge).sort() };
      });
      assert(geometry.linesMatch, 'Primary arrows share exact colors, geometry and scale');
      assert.equal(geometry.tiles, 64); assert(geometry.covers, 'Heat fills complete cells without an inset in either orientation');
      assert.deepEqual(geometry.badges, ['maia', 'sf']);
      if (host === 'www.chess.com' && orientation === 'white') await page.screenshot({ path: path.join(output, `${theme}.png`), fullPage: true });
    }
    // Fractional responsive dimensions retain edge alignment.
    await page.evaluate(() => { document.querySelectorAll('.board').forEach(el => el.style.setProperty('width', '357.5px', 'important')); document.querySelectorAll('.board').forEach(el => el.style.setProperty('height', '357.5px', 'important')); paint(); });
    assert.equal(await page.evaluate(() => Math.abs(document.querySelector('#maia-heatmap-layer rect').getBoundingClientRect().width * 8 - hostBoard.getBoundingClientRect().width) < .02), true);
    const safety = await page.evaluate(() => {
      prediction.stockfish.bestMove = { ...prediction.moves[0] }; overlay.render(prediction);
      const consensus = !!document.querySelector('[data-move-badge="consensus"]');
      overlay.setToggles({ showArrows: false });
      const sfOnly = !document.querySelector('#maia-arrows-layer line') && !!document.querySelector('#maia-sf-arrows-layer line');
      document.body.insertAdjacentHTML('beforeend', '<div class="clock-running">10:00</div><button aria-label="Resign">Resign</button>');
      overlay.render(prediction);
      const locked = !document.querySelector('#maia3-board-overlay line, #maia-heatmap-layer rect, #maia3-board-overlay [data-move-badge]');
      return { consensus, sfOnly, locked };
    });
    assert.deepEqual(safety, { consensus: true, sfOnly: true, locked: true });
    assert.deepEqual(errors, []); await page.close();
  }

  for (const [host, gamePath] of Object.entries(reviewPaths)) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://' + host + gamePath);
    await page.evaluate(async chessCom => {
      const { HeatmapOverlay } = await import('/content/heatmap-overlay.js');
      const { BoardDetector } = await import('/content/board-detector.js');
      document.body.innerHTML = [
        '<style>',
        '.test-frame { --side: 600px; --grid-x: 37px; --grid-y: 11px; position: relative; width: 674px; height: 626px; }',
        '.board-layout-chessboard, #board-single, .cg-wrap { display: block; position: relative; width: 100%; height: 100%; }',
        'cg-container { position: absolute; inset: 0; }',
        '.grid-reference, cg-board { display: block; position: absolute; left: var(--grid-x); top: var(--grid-y); width: var(--side); height: var(--side); }',
        '.piece { position: absolute; left: calc(var(--grid-x) + var(--col) * var(--side) / 8); top: calc(var(--grid-y) + var(--row) * var(--side) / 8); width: calc(var(--side) / 8); height: calc(var(--side) / 8); }',
        '</style>',
        '<div class="test-frame"></div>',
        chessCom ? '<div class="vertical-move-list">0-1</div>' : '<div class="result-wrap">0-1 Black won</div>'
      ].join('');
      const frame = document.querySelector('.test-frame');
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const data = { fen, isAvailable: true, turn: 'w', heatmap: Array(64).fill(.2),
        moves: [{ from: 'e2', to: 'e4', uci: 'e2e4', prob: 46 }],
        stockfish: { bestMove: { from: 'd2', to: 'd4', uci: 'd2d4', san: 'd4' }, score: '+0.25' } };
      const overlay = new HeatmapOverlay();
      const detector = new BoardDetector(({ orientation }) => {
        overlay.attach(detector.containerEl, orientation, detector.boardEl);
        overlay.render(data);
      });
      detector.extractFen = () => fen;
      let grid, board;
      const addPieces = (black, animate = false) => {
        for (const piece of board.querySelectorAll('.piece')) piece.remove();
        const squares = [[4, 2, 'wk'], [4, 4, 'bk']];
        if (animate) squares.push([2, 3, 'wp']);
        squares.forEach(([file, rank, type], index) => {
          const piece = document.createElement('div');
          piece.className = 'piece ' + type + ' square-' + (file + 1) + (rank + 1);
          piece.style.setProperty('--col', black ? 7 - file : file);
          piece.style.setProperty('--row', black ? rank : 7 - rank);
          if (index === 2) piece.style.transform = 'translateX(22px)';
          board.append(piece);
        });
      };
      const makeBoard = (black, legacy = false) => {
        const wrapper = document.createElement('div');
        wrapper.className = chessCom ? 'board-layout-chessboard' : 'cg-wrap';
        board = document.createElement(chessCom ? legacy ? 'chess-board' : 'wc-chess-board' : 'cg-board');
        if (chessCom) {
          board.id = 'board-single';
          grid = document.createElement('div');
          grid.className = 'grid-reference';
          board.append(grid);
          addPieces(black, true);
          board.classList.toggle('flipped', black);
        } else {
          grid = board;
          wrapper.classList.toggle('orientation-black', black);
          const ground = document.createElement('cg-container');
          ground.append(board);
          wrapper.append(ground);
        }
        if (chessCom) wrapper.append(board);
        frame.replaceChildren(wrapper);
      };
      window.makeBoard = makeBoard;
      window.overlayFixture = { data, overlay, detector, frame };
      makeBoard(false);
      detector.start();

      window.checkAlignment = (black = false) => {
        const box = grid.getBoundingClientRect();
        const cells = [...document.querySelectorAll('#maia-heatmap-layer rect')];
        const arrow = document.querySelector('#maia-arrows-layer line');
        const svg = arrow?.ownerSVGElement;
        if (cells.length !== 64 || !svg || getComputedStyle(svg).visibility !== 'visible') return false;
        const nearly = (a, b) => Math.abs(a - b) <= .3;
        const arrowsAtSource = ['maia', 'sf'].every(engine => {
          const line = document.querySelector(engine === 'maia' ? '#maia-arrows-layer line' : '#maia-sf-arrows-layer line');
          const from = new DOMPoint(Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))).matrixTransform(line.getScreenCTM());
          const expectedCol = engine === 'maia' ? 4 : 3; // e2 and d2
          return nearly(from.x, box.left + (black ? 7 - expectedCol + .5 : expectedCol + .5) * box.width / 8) &&
            nearly(from.y, box.top + (black ? 1.62 : 6.38) * box.height / 8);
        });
        return arrowsAtSource && cells.every((cell, i) => {
          const actual = cell.getBoundingClientRect();
          const col = black ? 7 - i % 8 : i % 8;
          const row = black ? Math.floor(i / 8) : 7 - Math.floor(i / 8);
          return nearly(actual.left, box.left + col * box.width / 8) &&
            nearly(actual.top, box.top + row * box.height / 8) &&
            nearly(actual.width, box.width / 8) && nearly(actual.height, box.height / 8);
        });
      };
      window.flipFixture = () => {
        if (chessCom) {
          addPieces(true);
          board.classList.add('flipped');
        } else board.closest('.cg-wrap').classList.add('orientation-black');
      };
      window.previewIsAligned = () => {
        const box = grid.getBoundingClientRect();
        const lines = [...document.querySelectorAll('#maia3-board-overlay line')];
        if (lines.length !== 1 || !lines[0].closest('#maia-sf-arrows-layer')) return false;
        const line = lines[0];
        const onScreen = (x, y) => new DOMPoint(line[x].baseVal.value, line[y].baseVal.value).matrixTransform(line.getScreenCTM());
        const from = onScreen('x1', 'y1'), to = onScreen('x2', 'y2');
        const inSquare = (point, col, row) => {
          const x = (point.x - box.left) * 8 / box.width, y = (point.y - box.top) * 8 / box.height;
          return x > col && x < col + 1 && y > row && y < row + 1;
        };
        return inSquare(from, 4, 1) && inSquare(to, 4, 3);
      };
      window.useFallbackBoard = () => {
        const wrapper = board.closest('.board-layout-chessboard');
        wrapper.classList.add('flipped');
        wrapper.replaceChildren(grid, ...board.querySelectorAll('.piece'));
        board = wrapper;
      };
    }, host === 'www.chess.com');
    await page.waitForFunction(() => checkAlignment());
    await page.evaluate(() => flipFixture());
    await page.waitForFunction(() => checkAlignment(true));
    await page.evaluate(() => overlayFixture.overlay.setHoverMove('d2d4', 'sf', overlayFixture.data.fen));
    await page.waitForFunction(() => previewIsAligned());
    await page.evaluate(() => {
      const { frame } = overlayFixture;
      frame.style.width = '438.5px';
      frame.style.height = '392px';
      frame.style.setProperty('--side', '357.5px');
      frame.style.setProperty('--grid-x', '53.25px');
      frame.style.setProperty('--grid-y', '18.5px');
      frame.style.transform = 'scale(.9)';
      frame.style.transformOrigin = 'left top';
    });
    await page.waitForFunction(() => previewIsAligned());
    await page.evaluate(() => overlayFixture.overlay.setHoverMove(null));
    await page.waitForFunction(() => checkAlignment(true));
    if (host === 'www.chess.com') {
      await page.evaluate(() => {
        const { overlay, data, detector } = overlayFixture;
        window.hiddenPieces = [...detector.boardEl.querySelectorAll('.piece')];
        hiddenPieces.forEach(el => el.remove());
        overlay.render(data);
      });
      assert.equal(await page.locator('#maia3-heatmap-overlay').evaluate(el => getComputedStyle(el).visibility), 'hidden');
      await page.evaluate(() => overlayFixture.detector.boardEl.append(...hiddenPieces));
      await page.waitForFunction(() => checkAlignment(true));
      await page.evaluate(() => useFallbackBoard());
      await page.waitForFunction(() => checkAlignment(true));
    }
    // Position and FEN stay the same as the site replaces the board element.
    await page.evaluate(() => makeBoard(true, true));
    await page.waitForFunction(() => checkAlignment(true));
    assert.equal(await page.locator('#maia3-board-overlay').count(), 1);
    assert.equal(await page.locator('#maia3-heatmap-overlay').count(), 1);
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="clock-running">10:00</div><button aria-label="Resign">Resign</button>');
      overlayFixture.frame.style.width = '450px';
    });
    // A geometry refresh must clear, rather than reveal, stale output in a live game.
    await page.waitForFunction(() => !document.querySelector('#maia-heatmap-layer rect, #maia3-board-overlay line'));
    await page.evaluate(() => {
      document.querySelector('.clock-running').remove();
      document.querySelector('[aria-label="Resign"]').remove();
      overlayFixture.overlay.render(overlayFixture.data);
    });
    await page.waitForFunction(() => checkAlignment(true));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: both platforms, finished replay, host/piece geometry, wide offset and fractional resizes, flips, preview arrows, board replacement, missing geometry, theme and independent overlays, and live-game clearing.');
} finally { await browser.close(); }
