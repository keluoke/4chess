/**
 * Stockfish Sandbox Bridge (runs inside extension origin iframe)
 * Spawns Stockfish WebAssembly Worker without any host-page CSP or cross-origin restrictions.
 */

(function() {
  let worker = null;
  let currentReqId = null;
  let lastInfo = null;

  function initWorker() {
    try {
      worker = new Worker('../lib/stockfish.js');

      worker.onmessage = function(e) {
        const line = typeof e.data === 'string' ? e.data : '';
        if (!line) return;

        if (line === 'readyok') {
          window.parent.postMessage({ type: 'STOCKFISH_READY' }, '*');
          return;
        }

        // Parse evaluation info lines:
        // info depth 10 seldepth 12 score cp 35 nodes 2415 pv e2e4 e7e5 ...
        if (line.startsWith('info') && line.includes('score')) {
          const depthMatch = line.match(/\bdepth (\d+)/);
          const cpMatch = line.match(/\bscore cp (-?\d+)/);
          const mateMatch = line.match(/\bscore mate (-?\d+)/);
          const pvMatch = line.match(/\bpv (.+)$/);

          const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
          let scoreText = '0.00';
          let scoreCp = 0;
          let isMate = false;

          if (mateMatch) {
            const m = parseInt(mateMatch[1], 10);
            scoreText = `M${m > 0 ? '+' : ''}${m}`;
            scoreCp = m > 0 ? 10000 - m * 100 : -10000 - m * 100;
            isMate = true;
          } else if (cpMatch) {
            scoreCp = parseInt(cpMatch[1], 10);
            const pawns = (scoreCp / 100).toFixed(2);
            scoreText = scoreCp > 0 ? `+${pawns}` : pawns;
          }

          const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

          lastInfo = {
            depth,
            scoreText,
            scoreCp,
            isMate,
            pv
          };
        }

        // Parse bestmove line:
        // bestmove e2e4 ponder e7e5
        if (line.startsWith('bestmove')) {
          const parts = line.split(/\s+/);
          const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;

          window.parent.postMessage({
            type: 'STOCKFISH_RESULT',
            id: currentReqId,
            bestMove,
            scoreText: lastInfo ? lastInfo.scoreText : '0.00',
            scoreCp: lastInfo ? lastInfo.scoreCp : 0,
            isMate: lastInfo ? lastInfo.isMate : false,
            depth: lastInfo ? lastInfo.depth : 0,
            pv: lastInfo ? lastInfo.pv : []
          }, '*');

          currentReqId = null;
        }
      };

      worker.postMessage('uci');
      worker.postMessage('isready');
    } catch (err) {
      console.error('[Stockfish Sandbox] Failed to initialize worker:', err);
      window.parent.postMessage({ type: 'STOCKFISH_ERROR', error: err.message }, '*');
    }
  }

  window.addEventListener('message', function(e) {
    const data = e.data;
    if (!data || !worker) return;

    if (data.type === 'EVALUATE') {
      currentReqId = data.id;
      lastInfo = null;

      const fen = data.fen;
      const depth = data.depth || 10;

      worker.postMessage('stop');
      worker.postMessage('ucinewgame');
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    } else if (data.type === 'STOP') {
      worker.postMessage('stop');
      currentReqId = null;
    }
  });

  initWorker();
})();
