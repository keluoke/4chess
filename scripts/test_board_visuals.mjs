import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/board-visuals-20261110');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/ui/theme.css"><link rel="stylesheet" href="/ui/chessboard.css"><link rel="stylesheet" href="/analysis/analysis.css"><style>
body{margin:0;padding:32px;background:var(--dg-paper);color:var(--dg-ink);font:14px system-ui}.compare{display:flex;gap:32px}.board{width:480px!important;height:480px!important;max-width:none;flex-shrink:0}h2{font-size:16px;font-weight:600;margin:0 0 14px}p{color:var(--dg-muted)}.host{position:relative;overflow:hidden;border-radius:12px}.host .maia-square{pointer-events:none}svg{display:block}
</style></head><body class="diverge-ui" data-theme="light"><h1 style="font-size:24px">统一棋盘视觉</h1><p>绿色 ★ 引擎最佳　·　金色 M Maia 首选　·　整格落点热力图</p><div class="compare"><section><h2>Chess.com / Lichess 页面分析</h2><div class="board host"></div></section><section><h2>全盘分析工作台</h2><div class="board studio"></div></section></div></body></html>`;
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 710 }, deviceScaleFactor: 1.25, reducedMotion: 'reduce' });
  await context.route('https://**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/analysis/visual-fixture') return route.fulfill({ body: html, contentType: 'text/html' });
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
        studio.setArrows([{ from: 'e2', to: 'e4', color: 'gold' }, { from: 'd2', to: 'd4', color: 'green' }]);
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
  console.log('PASS: matching board arrows, light/dark colors, full-cell heatmaps at fractional sizes and both orientations, compact badges, independent toggles and live-game clearing on both platform fixtures.');
} finally { await browser.close(); }
