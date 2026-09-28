/**
 * Board Detector for Lichess & Chess.com
 * Automatically discovers chess board elements, detects orientation (White/Black),
 * listens to move updates via MutationObserver, and extracts accurate FEN strings.
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
  }

  detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('lichess.org')) {
      this.platform = 'lichess';
    } else if (host.includes('chess.com')) {
      this.platform = 'chesscom';
    }
    console.log(`[Maia-3] Detected platform: ${this.platform || 'Generic Chess Board'}`);
  }

  start() {
    this.findBoard();
    // In case board renders asynchronously (SPA navigation)
    if (!this.boardEl) {
      const retryInterval = setInterval(() => {
        if (this.findBoard()) {
          clearInterval(retryInterval);
          this.attachObserver();
          this.checkUpdate();
        }
      }, 800);
    } else {
      this.attachObserver();
      this.checkUpdate();
    }
  }

  findBoard() {
    if (this.platform === 'lichess') {
      const cgBoard = document.querySelector('cg-board');
      const cgContainer = document.querySelector('cg-container') || document.querySelector('.cg-wrap');
      if (cgBoard && cgContainer) {
        this.boardEl = cgBoard;
        this.containerEl = cgContainer;
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

    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver(() => {
      this.scheduleUpdate();
    });

    this.observer.observe(this.boardEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'flipped']
    });

    // Also watch analysis move list / underboard if present
    const underboard = document.querySelector('.analyse__underboard') ||
                       document.querySelector('.vertical-move-list') ||
                       document.querySelector('.play-controller-moves');
    if (underboard) {
      this.observer.observe(underboard, { childList: true, subtree: true, characterData: true });
    }

    // Keyboard navigation listener (Arrow keys in analysis mode)
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'j', 'k'].includes(e.key)) {
        setTimeout(() => this.scheduleUpdate(), 60);
      }
    });

    console.log('[Maia-3] Board observer actively monitoring moves.');
  }

  scheduleUpdate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.checkUpdate();
    }, 50);
  }

  checkUpdate() {
    this.detectOrientation();
    const currentFen = this.extractFen();

    if (currentFen && currentFen !== this.lastFen) {
      this.lastFen = currentFen;
      if (this.onPositionChange) {
        this.onPositionChange({
          fen: currentFen,
          orientation: this.orientation,
          boardRect: this.getBoardRect(),
          platform: this.platform
        });
      }
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

  extractFen() {
    // 1. Try reading directly from Lichess Analysis input
    if (this.platform === 'lichess') {
      const fenInput = document.querySelector('.analyse__underboard input.copyable') ||
                       document.querySelector('input.fen') ||
                       document.querySelector('.analyse__underboard .fen');
      if (fenInput && fenInput.value) {
        return fenInput.value.trim();
      }
    }

    // 2. Try reading from Chess.com FEN inputs
    if (this.platform === 'chesscom') {
      const fenInput = document.querySelector('input[aria-label="FEN"]') ||
                       document.querySelector('.share-menu-fen-input') ||
                       document.querySelector('input[data-cy="fen-input"]');
      if (fenInput && fenInput.value) {
        return fenInput.value.trim();
      }
    }

    // 3. Fallback: Reconstruct FEN directly from DOM piece elements
    return this.reconstructFenFromPieces();
  }

  reconstructFenFromPieces() {
    const grid = Array.from({ length: 8 }, () => new Array(8).fill(null));

    if (this.platform === 'chesscom') {
      const pieces = this.boardEl.querySelectorAll('.piece');
      if (pieces.length === 0) return null;

      pieces.forEach(pieceEl => {
        const classNames = pieceEl.className;
        // Parse piece type e.g. 'wp', 'bn', 'wk'
        const matchType = classNames.match(/\b([wb])([pnbrqk])\b/i);
        // Parse square e.g. 'square-12' (col 1, row 2 = a2)
        const matchSquare = classNames.match(/square-(\d)(\d)/);

        if (matchType && matchSquare) {
          const color = matchType[1].toLowerCase();
          const p = matchType[2].toLowerCase();
          const file = parseInt(matchSquare[1], 10) - 1; // 0..7 (a..h)
          const rank = parseInt(matchSquare[2], 10) - 1; // 0..7 (1..8)

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

        // Calculate square from piece position
        const pRect = pieceEl.getBoundingClientRect();
        const centerX = pRect.left + pRect.width / 2 - rect.left;
        const centerY = pRect.top + pRect.height / 2 - rect.top;

        let f = Math.floor(centerX / sqW);
        let r = Math.floor(centerY / sqH);

        // Adjust for orientation
        if (this.orientation === 'black') {
          f = 7 - f;
        } else {
          r = 7 - r;
        }

        if (f >= 0 && f < 8 && r >= 0 && r < 8) {
          grid[r][f] = pieceSym;
        }
      });
    }

    // Build FEN rows (Rank 8 down to Rank 1)
    let fenRows = [];
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

    // Try to determine whose turn it is
    let activeTurn = 'w';
    if (this.platform === 'lichess') {
      const activeColorEl = document.querySelector('.cg-wrap.turn-black') ||
                            document.querySelector('.cg-wrap.orientation-black');
      if (activeColorEl && activeColorEl.classList.contains('turn-black')) {
        activeTurn = 'b';
      }
    }

    return `${fenRows.join('/')} ${activeTurn} KQkq - 0 1`;
  }

  getBoardRect() {
    if (!this.boardEl) return null;
    return this.boardEl.getBoundingClientRect();
  }
}
