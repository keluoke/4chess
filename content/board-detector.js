/**
 * Board Detector for Lichess & Chess.com
 * Multi-layer detection engine:
 * 1. Direct Page-Context Bridge: injects script to access window.lichess and <wc-chess-board>.game
 * 2. Active Move-List Tracker: reads .tview2 / .move-list-wrapper to determine current move and turn
 * 3. Board DOM & Last-Move Highlights: detects piece on last-move square to determine active turn
 * 4. Piece coordinate grid parser as ultimate fallback
 */

export class BoardDetector {
  constructor(onPositionChange) {
    this.onPositionChange = onPositionChange;
    this.platform = null; // 'lichess' | 'chesscom' | null
    this.boardEl = null;
    this.containerEl = null;
    this.lastFen = '';
    this.orientation = 'white';
    this.observer = null;
    this.debounceTimer = null;

    this.detectPlatform();
    this.injectPageBridge();
  }

  detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('lichess.org')) {
      this.platform = 'lichess';
    } else if (host.includes('chess.com')) {
      this.platform = 'chesscom';
    }
  }

  /**
   * Injects an in-page script into the MAIN world to read window.lichess and wc-chess-board.game
   */
  injectPageBridge() {
    try {
      const script = document.createElement('script');
      script.id = 'maia-page-bridge';
      script.textContent = `
        (function() {
          function queryPageFen() {
            try {
              if (window.lichess && window.lichess.analysis) {
                const a = window.lichess.analysis;
                const node = a.node || (a.tree && a.tree.currentNode);
                if (node && node.fen) return node.fen;
                if (typeof a.getFen === 'function') return a.getFen();
              }
            } catch (e) {}

            try {
              const wc = document.querySelector('wc-chess-board') || document.querySelector('chess-board');
              if (wc && wc.game && typeof wc.game.getFEN === 'function') {
                return wc.game.getFEN();
              }
            } catch (e) {}

            return null;
          }

          function emit() {
            const fen = queryPageFen();
            if (fen && fen !== document.documentElement.dataset.maiaFen) {
              document.documentElement.dataset.maiaFen = fen;
              window.dispatchEvent(new CustomEvent('maia:fen-sync', { detail: { fen } }));
            }
          }

          setInterval(emit, 100);
          emit();
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();

      // Listen for direct sync events
      window.addEventListener('maia:fen-sync', (e) => {
        if (e.detail && e.detail.fen) {
          this.handleNewFen(e.detail.fen);
        }
      });
    } catch (err) {
      console.warn('[Maia-3] Page bridge injection failed:', err);
    }
  }

  start() {
    this.findBoard();
    if (!this.boardEl) {
      const retryInterval = setInterval(() => {
        if (this.findBoard()) {
          clearInterval(retryInterval);
          this.attachObserver();
          this.checkUpdate();
        }
      }, 500);
    } else {
      this.attachObserver();
      this.checkUpdate();
    }
  }

  findBoard() {
    if (this.platform === 'lichess') {
      const cgBoard = document.querySelector('cg-board');
      const cgWrap = document.querySelector('.cg-wrap') || document.querySelector('cg-container');
      if (cgBoard && cgWrap) {
        this.boardEl = cgBoard;
        this.containerEl = cgWrap;
        return true;
      }
    } else if (this.platform === 'chesscom') {
      const board = document.querySelector('wc-chess-board') ||
                    document.querySelector('chess-board') ||
                    document.querySelector('.board-layout-chessboard');
      if (board) {
        this.boardEl = board;
        this.containerEl = board;
        return true;
      }
    }
    return false;
  }

  attachObserver() {
    if (!this.boardEl) return;

    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver(() => {
      this.scheduleUpdate();
    });

    this.observer.observe(this.boardEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'flipped']
    });

    // Also observe move list containers
    const moveLists = document.querySelectorAll('.tview2, .analyse__moves, .vertical-move-list, .move-list-wrapper');
    moveLists.forEach(el => {
      this.observer.observe(el, { childList: true, subtree: true, attributes: true });
    });

    // Watch arrow keys navigation
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'j', 'k', 'h', 'l'].includes(e.key)) {
        setTimeout(() => this.scheduleUpdate(), 60);
        setTimeout(() => this.scheduleUpdate(), 200);
      }
    });
  }

  scheduleUpdate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.checkUpdate();
    }, 40);
  }

  handleNewFen(fen) {
    if (!fen || fen === this.lastFen) return;
    this.lastFen = fen;
    this.detectOrientation();

    if (this.onPositionChange) {
      this.onPositionChange({
        fen,
        orientation: this.orientation,
        platform: this.platform
      });
    }
  }

  checkUpdate() {
    this.detectOrientation();
    const fen = this.extractFen();
    if (fen) {
      this.handleNewFen(fen);
    }
  }

  detectOrientation() {
    if (this.platform === 'lichess') {
      const wrap = document.querySelector('.cg-wrap') || this.containerEl;
      if (wrap) {
        this.orientation = wrap.classList.contains('orientation-black') ? 'black' : 'white';
      }
    } else if (this.platform === 'chesscom') {
      if (this.boardEl) {
        const isFlipped = this.boardEl.classList.contains('flipped') ||
                          this.boardEl.getAttribute('flipped') === 'true';
        this.orientation = isFlipped ? 'black' : 'white';
      }
    }
  }

  /**
   * Determine whose turn it is to move ('w' or 'b')
   */
  detectActiveTurn() {
    // 1. Check Lichess active move list
    if (this.platform === 'lichess') {
      const activeMove = document.querySelector('.tview2 move.active, .analyse__moves move.active');
      if (activeMove) {
        const turnParent = activeMove.closest('turn');
        if (turnParent) {
          const movesInTurn = turnParent.querySelectorAll('move');
          if (movesInTurn.length > 0 && activeMove === movesInTurn[0]) {
            // White just moved in this turn -> It is Black's turn to move!
            return 'b';
          } else if (movesInTurn.length > 1 && activeMove === movesInTurn[1]) {
            // Black just moved -> It is White's turn to move!
            return 'w';
          }
        }
      }

      // Check last-move highlight squares in Chessground
      const lastMoveSquares = document.querySelectorAll('cg-board square.last-move');
      if (lastMoveSquares.length >= 2) {
        const arrivalSquare = Array.from(lastMoveSquares).find(sq => {
          const piece = this.getPieceOnSquareElement(sq);
          return piece !== null;
        });
        if (arrivalSquare) {
          const piece = this.getPieceOnSquareElement(arrivalSquare);
          if (piece && piece.color === 'w') return 'b';
          if (piece && piece.color === 'b') return 'w';
        }
      }
    }

    // 2. Check Chess.com active move list
    if (this.platform === 'chesscom') {
      const selectedNode = document.querySelector('.vertical-move-list .node.selected, .move-list-wrapper .node.selected, .move-node.selected');
      if (selectedNode) {
        if (selectedNode.classList.contains('white-move') || selectedNode.closest('.white')) {
          return 'b';
        }
        if (selectedNode.classList.contains('black-move') || selectedNode.closest('.black')) {
          return 'w';
        }
      }

      // Check highlighted squares on board
      const highlights = document.querySelectorAll('.highlight');
      for (const hl of highlights) {
        const squareClass = Array.from(hl.classList).find(c => c.startsWith('square-'));
        if (squareClass) {
          const pieceOnSq = this.boardEl.querySelector(`.piece.${squareClass}`);
          if (pieceOnSq) {
            const isWhitePiece = Array.from(pieceOnSq.classList).some(c => c.startsWith('w'));
            const isBlackPiece = Array.from(pieceOnSq.classList).some(c => c.startsWith('b'));
            if (isWhitePiece) return 'b';
            if (isBlackPiece) return 'w';
          }
        }
      }
    }

    // Default to white if nothing has been played
    return 'w';
  }

  getPieceOnSquareElement(sqElement) {
    if (!this.boardEl) return null;
    const sqRect = sqElement.getBoundingClientRect();
    const pieces = this.boardEl.querySelectorAll('piece');
    for (const p of pieces) {
      const pRect = p.getBoundingClientRect();
      const dist = Math.abs(pRect.left - sqRect.left) + Math.abs(pRect.top - sqRect.top);
      if (dist < 10) {
        const isWhite = p.classList.contains('white');
        return { color: isWhite ? 'w' : 'b' };
      }
    }
    return null;
  }

  extractFen() {
    // 1. Check data attribute from Page Bridge
    const bridgeFen = document.documentElement.dataset.maiaFen;
    if (bridgeFen && bridgeFen.includes('/')) {
      return bridgeFen.trim();
    }

    // 2. Check URL for FEN parameter
    const urlMatch = window.location.pathname.match(/\/analysis\/(?:standard\/)?([rnbqkpRNBQKP1-8_\/]+(?:_[wb]_.*)?)/);
    if (urlMatch && urlMatch[1]) {
      const rawFen = urlMatch[1].replace(/_/g, ' ');
      if (rawFen.includes('/')) {
        return rawFen;
      }
    }

    // 3. Fallback: Reconstruct FEN from pieces and active turn
    return this.reconstructFenFromPieces();
  }

  reconstructFenFromPieces() {
    const grid = Array.from({ length: 8 }, () => new Array(8).fill(null));

    if (this.platform === 'chesscom') {
      const pieces = this.boardEl.querySelectorAll('.piece');
      if (pieces.length === 0) return null;

      pieces.forEach(pieceEl => {
        const classNames = pieceEl.className;
        const matchType = classNames.match(/\b([wb])([pnbrqk])\b/i);
        const matchSquare = classNames.match(/square-(\d)(\d)/);

        if (matchType && matchSquare) {
          const color = matchType[1].toLowerCase();
          const p = matchType[2].toLowerCase();
          const file = parseInt(matchSquare[1], 10) - 1; // 0..7
          const rank = parseInt(matchSquare[2], 10) - 1; // 0..7

          if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
            grid[rank][file] = color === 'w' ? p.toUpperCase() : p.toLowerCase();
          }
        }
      });
    } else if (this.platform === 'lichess') {
      const pieces = this.boardEl.querySelectorAll('piece');
      if (pieces.length === 0) return null;

      const rect = this.boardEl.getBoundingClientRect();
      const sqW = rect.width / 8;
      const sqH = rect.height / 8;

      pieces.forEach(pieceEl => {
        const classes = pieceEl.className.split(' ');
        const isWhite = classes.includes('white');
        const pieceType = classes.find(c => ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].includes(c));
        if (!pieceType) return;

        const pieceCharMap = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
        const char = pieceCharMap[pieceType];
        const pieceSym = isWhite ? char.toUpperCase() : char.toLowerCase();

        const pRect = pieceEl.getBoundingClientRect();
        const centerX = pRect.left + pRect.width / 2 - rect.left;
        const centerY = pRect.top + pRect.height / 2 - rect.top;

        let f = Math.floor(centerX / sqW);
        let rowFromTop = Math.floor(centerY / sqH);
        let r = this.orientation === 'black' ? rowFromTop : (7 - rowFromTop);
        if (this.orientation === 'black') f = 7 - f;

        if (f >= 0 && f < 8 && r >= 0 && r < 8) {
          grid[r][f] = pieceSym;
        }
      });
    }

    const fenRows = [];
    for (let r = 7; r >= 0; r--) {
      let rowStr = '';
      let emptyCount = 0;
      for (let f = 0; f < 8; f++) {
        const piece = grid[r][f];
        if (!piece) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          rowStr += piece;
        }
      }
      if (emptyCount > 0) rowStr += emptyCount;
      fenRows.push(rowStr);
    }

    const activeTurn = this.detectActiveTurn();
    return `${fenRows.join('/')} ${activeTurn} KQkq - 0 1`;
  }
}
