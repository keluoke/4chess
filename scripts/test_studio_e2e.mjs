import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT_HTTP = 8790;
const PORT_CDP = 9447;
const EXT_PATH = '/Volumes/AI/coding/simoextension';

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0].split('#')[0];
  if (reqPath === '/') reqPath = '/analysis/index.html';
  const filePath = path.join(EXT_PATH, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('404: ' + reqPath);
  }
});
await new Promise(r => server.listen(PORT_HTTP, r));
console.log(`[E2E Server] Serving on http://127.0.0.1:${PORT_HTTP}`);

// Launch Chrome
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=' + PORT_CDP,
  '--user-data-dir=/tmp/test_e2e_' + Date.now(),
  '--no-first-run',
  '--no-default-browser-check',
  `http://127.0.0.1:${PORT_HTTP}/analysis/index.html`
]);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let targets = null;
for (let i = 0; i < 30; i++) {
  await sleep(200);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`);
    targets = await res.json();
    if (targets && targets.length > 0) break;
  } catch (e) {}
}

const target = targets.find(t => t.url.includes(`127.0.0.1:${PORT_HTTP}`));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));

let msgId = 1;
const send = (method, params = {}) => {
  return new Promise((resolve) => {
    const id = msgId++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
};

await send('Runtime.enable');
await send('Console.enable');

ws.addEventListener('message', (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
    console.log(`[Studio Console]`, text);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    console.error(`[Studio Exception]`, msg.params.exceptionDetails);
  }
});

// Wait 12 seconds for the review to complete
console.log('[E2E Test] Awaiting review execution...');
await sleep(12000);

// Verify State & Test Interactivity
const testResult = await send('Runtime.evaluate', {
  expression: `(() => {
    const app = window.__maiaStudioApp;
    if (!app) return { error: 'App not initialized' };

    // 1. Check Initial Review State
    const blunderCards = document.querySelectorAll('.blunder-card');
    const moveRows = document.querySelectorAll('.notation-row');
    const chartDots = document.querySelectorAll('#eval-dots-group circle');
    const chartArea = document.querySelector('#eval-area-path')?.getAttribute('d');

    // 2. Test Clicking Move 15 in Notation Table
    const move15 = document.querySelector('#move-ply-15');
    if (move15) move15.click();
    const plyAfterClick = app.currentPly;
    const statusTextAfterMove = document.getElementById('board-status-text')?.textContent;

    // 3. Test Clicking "🎯 走棋前决策" on First Blunder Card
    let drillBeforeFen = null;
    let drillAfterFen = null;
    let arrowsDecisionCount = 0;
    let arrowsResultCount = 0;

    const firstCard = blunderCards[0];
    if (firstCard) {
      const decBtn = firstCard.querySelector('.btn-drill-decision');
      if (decBtn) {
        decBtn.click();
        drillBeforeFen = app.boardUI.chess.getFen();
        arrowsDecisionCount = app.boardUI.arrows.length;
      }

      const resBtn = firstCard.querySelector('.btn-drill-result');
      if (resBtn) {
        resBtn.click();
        drillAfterFen = app.boardUI.chess.getFen();
        arrowsResultCount = app.boardUI.arrows.length;
      }
    }

    return {
      success: true,
      totalMoves: app.moves.length,
      totalPositions: app.positions.length,
      blunderCount: blunderCards.length,
      notationRowCount: moveRows.length,
      chartDotsCount: chartDots.length,
      hasChartArea: !!chartArea,
      plyAfterClick,
      statusTextAfterMove,
      drillBeforeFen,
      drillAfterFen,
      fensDifferent: drillBeforeFen !== drillAfterFen,
      arrowsDecisionCount,
      arrowsResultCount,
      stockfishReady: app.stockfish.isReady
    };
  })()`,
  returnByValue: true
});

console.log('[E2E Test Report]:', JSON.stringify(testResult?.result?.value, null, 2));

ws.close();
chrome.kill();
server.close();
console.log('[E2E Test] Completed.');
