/**
 * Stockfish Sandbox Bridge (runs inside extension origin iframe)
 * Spawns Stockfish WebAssembly Worker without any host-page CSP or cross-origin restrictions.
 */

(function() {
  let worker = null;
  let engineName = 'Stockfish 19 Lite WASM';
  const multiPvMap = new Map();
  let lastInfo = null;

  // Authenticated MessagePort Boundary
  let authenticatedPort = null;
  let isPortAuthenticated = false;
  const pendingOutbox = [];

  function sendToParent(msg) {
    if (authenticatedPort && isPortAuthenticated) {
      try {
        authenticatedPort.postMessage(msg);
      } catch (e) {
        console.warn('[Stockfish Sandbox] Failed to post message to port:', e);
      }
    } else {
      pendingOutbox.push(msg);
    }
  }

  function flushPendingOutbox() {
    if (authenticatedPort && isPortAuthenticated) {
      while (pendingOutbox.length > 0) {
        const msg = pendingOutbox.shift();
        try {
          authenticatedPort.postMessage(msg);
        } catch (e) {}
      }
    }
  }

  // UCI Synchronization & Request Queue State
  let activeRequest = null;
  let queuedRequest = null;
  let isSearching = false;
  let isStopping = false;

  function executeSearch(req) {
    if (!worker) return;
    isSearching = true;
    isStopping = false;
    activeRequest = req;
    lastInfo = null;
    multiPvMap.clear();

    if (req.multipv > 1) {
      worker.postMessage(`setoption name MultiPV value ${req.multipv}`);
    } else {
      worker.postMessage('setoption name MultiPV value 1');
    }
    worker.postMessage(`position fen ${req.fen}`);
    worker.postMessage(`go depth ${req.depth}`);
  }

  function initWorker() {
    let initialized = false;
    let readyTimer = null;

    const sf19Url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL('lib/stockfish-19.js#stockfish.wasm')
      : '../lib/stockfish-19.js#stockfish.wasm';

    function tryWorker(scriptUrl, name) {
      try {
        const w = new Worker(scriptUrl);
        w.onerror = function(err) {
          console.error(`[Stockfish Sandbox] Worker error on ${name}:`, err);
          sendToParent({
            type: 'STOCKFISH_ERROR',
            error: err?.message || 'Stockfish 19 Lite WASM Worker execution failed'
          });
        };

        w.onmessage = function(e) {
          const line = typeof e.data === 'string' ? e.data : '';
          if (!line) return;

          if (line.startsWith('id name ')) {
            engineName = line.replace('id name ', '').trim();
          }

          if (line === 'readyok') {
            if (readyTimer) {
              clearTimeout(readyTimer);
              readyTimer = null;
            }
            if (!initialized) {
              initialized = true;
              sendToParent({ type: 'STOCKFISH_READY', engineName });
            }
            return;
          }

          // Parse evaluation info lines
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
          if (line.startsWith('bestmove')) {
            const parts = line.split(/\s+/);
            const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;

            if (isStopping) {
              clearTimeout(stopWatchdog);
              isStopping = false;
              isSearching = false;
              activeRequest = null;
              multiPvMap.clear();
              lastInfo = null;

              if (queuedRequest) {
                const next = queuedRequest;
                queuedRequest = null;
                executeSearch(next);
              }
              return;
            }

            if (isSearching && activeRequest) {
              const best = multiPvMap.get(1) || lastInfo;
              const resId = activeRequest.id;
              const resFen = activeRequest.fen;
              activeRequest = null;
              isSearching = false;

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

              sendToParent({
                type: 'STOCKFISH_RESULT',
                id: resId,
                fen: resFen,
                bestMove,
                scoreText: best ? best.scoreText : (lastInfo ? lastInfo.scoreText : '0.00'),
                scoreCp: best ? best.scoreCp : (lastInfo ? lastInfo.scoreCp : 0),
                isMate: best ? best.isMate : (lastInfo ? lastInfo.isMate : false),
                depth: best ? best.depth : (lastInfo ? lastInfo.depth : 0),
                pv: best ? best.pv : (lastInfo ? lastInfo.pv : []),
                lines
              });

              multiPvMap.clear();

              if (queuedRequest) {
                const next = queuedRequest;
                queuedRequest = null;
                executeSearch(next);
              }
            } else {
              // Residual bestmove from an aborted/stopping search: discard!
              multiPvMap.clear();
              lastInfo = null;
            }
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

    readyTimer = setTimeout(() => {
      if (!initialized) {
        console.error('[Stockfish Sandbox] Stockfish 19 Lite WASM 引擎就绪等待超时 (15000ms)');
        sendToParent({
          type: 'STOCKFISH_ERROR',
          error: 'Stockfish 19 Lite WASM 引擎就绪等待超时 (15000ms)'
        });
      }
    }, 15000);

    worker = tryWorker(sf19Url, 'Stockfish 19 Lite WASM');
  }

  let stopWatchdog = null;
  function triggerStop() {
    if (!isSearching) {
      isStopping = false;
      activeRequest = null;
      return;
    }
    isStopping = true;
    activeRequest = null;
    try { worker.postMessage('stop'); } catch (e) {}
    clearTimeout(stopWatchdog);
    stopWatchdog = setTimeout(() => {
      if (isStopping && isSearching) {
        console.warn('[Stockfish Sandbox] Worker failed to stop within 2500ms, terminating hung worker and restarting...');
        try { worker.terminate(); } catch (e) {}
        isStopping = false;
        isSearching = false;
        activeRequest = null;
        multiPvMap.clear();
        lastInfo = null;
        if (readyTimer) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        initWorker();
        if (queuedRequest) {
          const next = queuedRequest;
          queuedRequest = null;
          setTimeout(() => executeSearch(next), 60);
        }
      }
    }, 2500);
  }

  // Secure Handshake: ONLY accept INIT_AUTH_PORT from window message with single-use token
  window.addEventListener('message', function(e) {
    const data = e.data;
    if (!data || data.type !== 'INIT_AUTH_PORT') return;
    if (!e.ports || !e.ports[0]) return;

    const candidatePort = e.ports[0];
    const token = data.token;

    function activatePort() {
      if (authenticatedPort && authenticatedPort !== candidatePort) {
        try { authenticatedPort.close(); } catch (e) {}
      }
      authenticatedPort = candidatePort;
      isPortAuthenticated = true;
      setupPortListener(authenticatedPort);
      flushPendingOutbox();
      if (initialized) {
        sendToParent({ type: 'STOCKFISH_READY', engineName });
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'VERIFY_SANDBOX_TOKEN', token }, function(res) {
        if (res && res.ok) {
          activatePort();
        } else {
          console.warn('[Stockfish Sandbox] ❌ Sandbox token verification failed, rejecting port');
          try { candidatePort.close(); } catch (err) {}
        }
      });
    } else {
      activatePort();
    }
  });

  function setupPortListener(port) {
    port.onmessage = function(e) {
      const data = e.data;
      if (!data || !worker) return;
      if (data.type !== 'EVALUATE' && data.type !== 'STOP') return;

      if (data.type === 'EVALUATE') {
        const req = {
          id: data.id,
          fen: data.fen,
          depth: data.depth || 6,
          multipv: data.multipv || 1
        };

        if (!isSearching && !isStopping) {
          executeSearch(req);
        } else {
          queuedRequest = req;
          triggerStop();
        }
      } else if (data.type === 'STOP') {
        queuedRequest = null;
        triggerStop();
      }
    };
  }

  initWorker();

  // Notify parent that sandbox is ready to receive authenticated port
  function pingParent() {
    if (!isPortAuthenticated && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SANDBOX_READY_FOR_PORT' }, '*');
    }
  }
  pingParent();
  const pingTimer = setInterval(() => {
    if (isPortAuthenticated) {
      clearInterval(pingTimer);
    } else {
      pingParent();
    }
  }, 80);
})();
