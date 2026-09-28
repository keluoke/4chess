/**
 * Stockfish Sandbox Bridge (runs inside extension origin iframe)
 * Spawns Stockfish WebAssembly Worker without any host-page CSP or cross-origin restrictions.
 */

(function() {
  let worker = null;
  let currentReqId = null;
  let lastInfo = null;
  let engineName = 'Stockfish 19 Lite WASM';
  const multiPvMap = new Map();

  function initWorker() {
    let initialized = false;

    function tryWorker(scriptUrl, name) {
      try {
        const w = new Worker(scriptUrl);
        w.onerror = function(err) {
          console.warn(`[Stockfish Sandbox] Worker error on ${name}:`, err);
          if (!initialized && scriptUrl.includes('stockfish-19')) {
            console.log('[Stockfish Sandbox] Falling back to stockfish.js...');
            try { w.terminate(); } catch (e) {}
            worker = tryWorker('../lib/stockfish.js', 'Stockfish WASM');
          }
        };

        w.onmessage = function(e) {
          const line = typeof e.data === 'string' ? e.data : '';
          if (!line) return;

          if (line.startsWith('id name ')) {
            engineName = line.replace('id name ', '').trim();
          }

          if (line === 'readyok') {
            initialized = true;
            window.parent.postMessage({ type: 'STOCKFISH_READY', engineName }, '*');
            return;
          }

          // Parse evaluation info lines:
          // info depth 10 seldepth 12 multipv 1 score cp 35 nodes 2415 pv e2e4 e7e5 ...
          if (line.startsWith('info') && line.includes('score')) {
            const depthMatch = line.match(/\bdepth (\d+)/);
            const multipvMatch = line.match(/\bmultipv (\d+)/);
            const cpMatch = line.match(/\bscore cp (-?\d+)/);
            const mateMatch = line.match(/\bscore mate (-?\d+)/);
            const pvMatch = line.match(/\bpv (.+)$/);

            const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
            const multipv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;
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
            const moveUci = pv[0] || null;

            multiPvMap.set(multipv, {
              multipv,
              uci: moveUci,
              scoreText,
              scoreCp,
              isMate,
              depth,
              pv
            });

            if (multipv === 1) {
              lastInfo = {
                depth,
                scoreText,
                scoreCp,
                isMate,
                pv
              };
            }
          }

          // Parse bestmove line:
          // bestmove e2e4 ponder e7e5
          if (line.startsWith('bestmove')) {
            const parts = line.split(/\s+/);
            const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;

            if (currentReqId !== null) {
              const best = multiPvMap.get(1) || lastInfo;
              const resId = currentReqId;
              currentReqId = null;

              const lines = [];
              for (const [idx, item] of multiPvMap.entries()) {
                if (item.uci) {
                  const deltaCp = best ? (item.scoreCp - best.scoreCp) : 0;
                  const deltaText = (deltaCp / 100).toFixed(2);
                  lines.push({
                    multipv: idx,
                    uci: item.uci,
                    scoreText: item.scoreText,
                    scoreCp: item.scoreCp,
                    deltaCp,
                    deltaText,
                    isMate: item.isMate
                  });
                }
              }

              window.parent.postMessage({
                type: 'STOCKFISH_RESULT',
                id: resId,
                bestMove,
                scoreText: best ? best.scoreText : (lastInfo ? lastInfo.scoreText : '0.00'),
                scoreCp: best ? best.scoreCp : (lastInfo ? lastInfo.scoreCp : 0),
                isMate: best ? best.isMate : (lastInfo ? lastInfo.isMate : false),
                depth: best ? best.depth : (lastInfo ? lastInfo.depth : 0),
                pv: best ? best.pv : (lastInfo ? lastInfo.pv : []),
                lines
              }, '*');
            }

            multiPvMap.clear();
          }
        };

        w.postMessage('uci');
        w.postMessage('setoption name MultiPV value 1');
        w.postMessage('isready');
        return w;
      } catch (err) {
        console.warn(`[Stockfish Sandbox] Failed to start ${name}:`, err);
        return null;
      }
    }

    worker = tryWorker('../lib/stockfish-19.js#stockfish.wasm,worker', 'Stockfish 19 Lite WASM');
    if (!worker) {
      worker = tryWorker('../lib/stockfish.js', 'Stockfish WASM');
    }
  }

  window.addEventListener('message', function(e) {
    const data = e.data;
    if (!data || !worker) return;

    if (data.type === 'EVALUATE') {
      currentReqId = data.id;
      lastInfo = null;
      multiPvMap.clear();

      const fen = data.fen;
      const depth = data.depth || 6;
      const multipv = data.multipv || 1;

      if (multipv > 1) {
        worker.postMessage(`setoption name MultiPV value ${multipv}`);
      } else {
        worker.postMessage('setoption name MultiPV value 1');
      }
      worker.postMessage('stop');
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    } else if (data.type === 'STOP') {
      currentReqId = null;
      worker.postMessage('stop');
    }
  });

  initWorker();
})();
