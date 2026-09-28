/**
 * Precision Board Detector for Lichess & Chess.com
 * Accurately determines:
 * 1. Board Orientation ('white' or 'black') from DOM classes before any guessing
 * 2. Active Turn ('w' or 'b') via move-list index, DOM pieces, and game FEN
 * 3. Exact position FEN via replay and DOM reconstruction
 */

import { ChessBoard } from '../engine/chess-core.js';

export class BoardDetector {
  constructor(onPositionChange) {
    this.onPositionChange = onPositionChange;
    this.platform = null;
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
      }, 300);
    } else {
      this.attachObserver();
      this.checkUpdate();
    }
  }

  findBoard() {
    if (this.platform === 'lichess') {
      const cgBoard = document.querySelector('cg-board');
      const cgWrap = document.querySelector('.cg-wrap') || document.querySelector('cg-container') || cgBoard?.parentElement;
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

    // Observe board container for flips and piece movements
    const targetToObserve = this.containerEl || this.boardEl;
    this.observer.observe(targetToObserve, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'flipped']
    });

    // Observe move list
    const moveLists = document.querySelectorAll('.analyse__moves, .tview2, .vertical-move-list, .move-list-wrapper, rm6');
    moveLists.forEach(el => {
      this.observer.observe(el, { childList: true, subtree: true, attributes: true });
    });

    // Listen to keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'j', 'k', 'h', 'l', 'f'].includes(e.key)) {
        this.scheduleUpdate(20);
      }
    });

    // Listen to clicks on move lists and navigation controls for crisp response
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      if (target.closest('.analyse__moves, .tview2, .vertical-move-list, .move-list-wrapper, rm6, .analyse__controls, .keyboard-move-list, [data-cy*="move"], [class*="navigation"]')) {
        this.scheduleUpdate(20);
      }
    }, true);

    // Listen to wheel scrolling over chessboard (Lichess/Chess.com step through moves)
    window.addEventListener('wheel', (e) => {
      const target = this.containerEl || this.boardEl;
      if (target && (e.target === target || target.contains(e.target))) {
        this.scheduleUpdate(25);
      }
    }, { passive: true });
  }

  scheduleUpdate(delay = 20) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.checkUpdate();
    }, delay);
  }

  detectOrientation() {
    if (this.platform === 'lichess') {
      const blackOrientationEl = document.querySelector('.cg-wrap.orientation-black') ||
                                 document.querySelector('.orientation-black') ||
                                 (this.containerEl && this.containerEl.classList.contains('orientation-black'));
      this.orientation = blackOrientationEl ? 'black' : 'white';
    } else if (this.platform === 'chesscom') {
      const isFlipped = document.querySelector('wc-chess-board.flipped') ||
                        document.querySelector('chess-board.flipped') ||
                        document.querySelector('.board-layout-chessboard.flipped') ||
                        document.querySelector('.board.flipped') ||
                        (this.boardEl && (this.boardEl.classList.contains('flipped') || this.boardEl.getAttribute('flipped') === 'true'));
      this.orientation = isFlipped ? 'black' : 'white';
    }
  }

  /**
   * Reads moves from move list and computes the active turn & FEN via replay
   */
  getReplayedPositionFromMoves() {
    let moveEls = [];
    let activeMoveEl = null;

    if (this.platform === 'lichess') {
      const moveContainer = document.querySelector('.analyse__moves, .tview2, rm6');
      if (moveContainer) {
        moveEls = Array.from(moveContainer.querySelectorAll('move, u'));
        activeMoveEl = moveContainer.querySelector('move.active, u.active, .active');
      }
    } else if (this.platform === 'chesscom') {
      const moveContainer = document.querySelector('.vertical-move-list, .move-list-wrapper');
      if (moveContainer) {
        moveEls = Array.from(moveContainer.querySelectorAll('.node, .move-node'));
        activeMoveEl = moveContainer.querySelector('.node.selected, .move-node.selected');
      }
    }

    if (!activeMoveEl || moveEls.length === 0) {
      return null;
    }

    const activeIdx = moveEls.indexOf(activeMoveEl);
    if (activeIdx === -1) return null;

    // In chess:
    // Move 1 (White, idx 0): 1 move played -> Black's turn to move ('b')
    // Move 1... (Black, idx 1): 2 moves played -> White's turn to move ('w')
    const activeTurn = (activeIdx % 2 === 0) ? 'b' : 'w';

    // Replay moves to get accurate FEN
    const chess = new ChessBoard();
    let replaySuccess = true;

    for (let i = 0; i <= activeIdx; i++) {
      const rawText = moveEls[i].textContent.replace(/\d+[\.\s]+/g, '').trim();
      if (!rawText) continue;

      const san = rawText.split(/\s+/)[0];
      const legals = chess.getLegalMoves();
      const matched = legals.find(m => m.san === san || m.uci === san);

      if (matched) {
        chess.makeMove(matched);
      } else {
        replaySuccess = false;
        break;
      }
    }

    if (replaySuccess) {
      return {
        fen: chess.getFen(),
        turn: chess.turn
      };
    }

    return null;
  }

  detectActiveTurn() {
    // 1. Move list replay check
    const replayed = this.getReplayedPositionFromMoves();
    if (replayed) return replayed.turn;

    // 2. Check last-move highlight elements on Lichess
    if (this.platform === 'lichess') {
      const lastMoveSquares = document.querySelectorAll('cg-board square.last-move');
      if (lastMoveSquares.length >= 2) {
        for (const sq of lastMoveSquares) {
          const piece = this.getPieceOnSquare(sq);
          if (piece) {
            // If the arriving piece is white, white just moved -> Black to move!
            return piece.color === 'w' ? 'b' : 'w';
          }
        }
      }
    }

    // 3. Check Chess.com highlights
    if (this.platform === 'chesscom') {
      const highlights = document.querySelectorAll('.highlight');
      for (const hl of highlights) {
        const sqClass = Array.from(hl.classList).find(c => c.startsWith('square-'));
        if (sqClass) {
          const piece = this.boardEl?.querySelector(`.piece.${sqClass}`);
          if (piece) {
            const isWhite = Array.from(piece.classList).some(c => c.startsWith('w'));
            const isBlack = Array.from(piece.classList).some(c => c.startsWith('b'));
            if (isWhite) return 'b';
            if (isBlack) return 'w';
          }
        }
      }
    }

    return 'w';
  }

  getPieceOnSquare(sqElement) {
    if (!this.boardEl) return null;
    const sqRect = sqElement.getBoundingClientRect();
    const pieces = this.boardEl.querySelectorAll('piece');
    for (const p of pieces) {
      const pRect = p.getBoundingClientRect();
      const dist = Math.abs(pRect.left - sqRect.left) + Math.abs(pRect.top - sqRect.top);
      if (dist < 8) {
        return { color: p.classList.contains('white') ? 'w' : 'b' };
      }
    }
    return null;
  }

  checkUpdate() {
    // 1. First, detect the actual orientation from DOM
    this.detectOrientation();

    // 2. Next, extract FEN with verified turn
    const fen = this.extractFen();

    if (fen && (fen !== this.lastFen || this.lastOrientation !== this.orientation)) {
      this.lastFen = fen;
      this.lastOrientation = this.orientation;

      if (this.onPositionChange) {
        this.onPositionChange({
          fen,
          orientation: this.orientation,
          platform: this.platform
        });
      }
    }
  }

  extractFen() {
    // 1. Try replayed move history (most reliable on interactive analysis boards)
    const replayed = this.getReplayedPositionFromMoves();
    if (replayed && replayed.fen) {
      return replayed.fen;
    }

    // 2. Try URL parameter
    const urlMatch = window.location.pathname.match(/\/analysis\/(?:standard\/)?([rnbqkpRNBQKP1-8_\/]+(?:_[wb]_.*)?)/);
    if (urlMatch && urlMatch[1]) {
      const rawFen = urlMatch[1].replace(/_/g, ' ');
      if (rawFen.includes('/')) {
        return rawFen;
      }
    }

    // 3. Fallback: Reconstruct FEN from pieces and verified active turn
    return this.reconstructFenFromPieces();
  }

  reconstructFenFromPieces() {
    const grid = Array.from({ length: 8 }, () => new Array(8).fill(null));

    if (this.platform === 'chesscom') {
      const pieces = this.boardEl?.querySelectorAll('.piece') || [];
      if (pieces.length === 0) return null;

      pieces.forEach(pieceEl => {
        const classNames = pieceEl.className;
        const matchType = classNames.match(/\b([wb])([pnbrqk])\b/i);
        const matchSquare = classNames.match(/square-(\d)(\d)/);

        if (matchType && matchSquare) {
          const color = matchType[1].toLowerCase();
          const p = matchType[2].toLowerCase();
          const file = parseInt(matchSquare[1], 10) - 1;
          const rank = parseInt(matchSquare[2], 10) - 1;

          if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
            grid[rank][file] = color === 'w' ? p.toUpperCase() : p.toLowerCase();
          }
        }
      });
    } else if (this.platform === 'lichess') {
      const pieces = this.boardEl?.querySelectorAll('piece') || [];
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
