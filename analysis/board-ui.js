/**
 * Dedicated Interactive Chessboard Component for Maia-3 Analysis Studio
 * 100% self-contained, responsive, zero external framework dependency.
 * Supports drag-and-drop, click-to-move, legal move hints, flip, and vector SVG arrow overlay.
 */

import { ChessBoard } from '../engine/chess-core.js';
import { CHESS_PIECES_SVG } from './chess-pieces.js';

export class BoardUI {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.orientation = options.orientation || 'white';
    this.onMove = options.onMove || null; // callback(fromSq, toSq, promotion)
    this.onSelectSquare = options.onSelectSquare || null;

    this.chess = new ChessBoard();
    this.selectedSq = null;
    this.legalMovesForSelected = [];
    this.lastMove = null; // { from, to }

    this.isDragging = false;
    this.dragPiece = null;
    this.dragStartSq = null;
    this.dragFloatingEl = null;

    this.arrows = []; // [{ from, to, color, dashed, width, label }]
    this.annotations = new Map();
    this.highlights = []; // [{ square, color }]

    this.initDOM();
    this.bindEvents();
    this.render();
  }

  initDOM() {
    this.container.innerHTML = '';
    this.container.classList.add('maia-board-wrapper');

    // Board table
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'maia-chessboard';
    this.container.appendChild(this.boardEl);

    // SVG Overlay layer for arrows
    this.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgOverlay.setAttribute('class', 'maia-board-svg-overlay');
    this.boardEl.appendChild(this.svgOverlay);

    // Marker definitions for arrows
    this.svgOverlay.innerHTML = `
      <defs>
        <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--brand-green)"/>
        </marker>
        <marker id="arrow-gold" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--brand-gold)"/>
        </marker>
        <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--brand-red)"/>
        </marker>
        <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--brand-blue)"/>
        </marker>
      </defs>
      <g id="maia-svg-arrows-group"></g>
      <g class="study-annotations"></g>
    `;

    // 64 Squares Grid
    this.squareEls = {};
    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const fileChar = String.fromCharCode(97 + f);
        const rankChar = String(r + 1);
        const sq = fileChar + rankChar;
        const isLight = (r + f) % 2 !== 0;

        const sqDiv = document.createElement('div');
        sqDiv.className = `maia-square ${isLight ? 'light' : 'dark'}`;
        sqDiv.dataset.square = sq;

        // Coordinate labels on edges
        if (f === 0) {
          const rankLbl = document.createElement('span');
          rankLbl.className = 'coord coord-rank';
          rankLbl.textContent = rankChar;
          sqDiv.appendChild(rankLbl);
        }
        if (r === 0) {
          const fileLbl = document.createElement('span');
          fileLbl.className = 'coord coord-file';
          fileLbl.textContent = fileChar;
          sqDiv.appendChild(fileLbl);
        }

        this.boardEl.appendChild(sqDiv);
        this.squareEls[sq] = sqDiv;
      }
    }
  }

  flip() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.render();
  }

  setOrientation(color) {
    if (this.orientation !== color) {
      this.orientation = color;
      this.render();
    }
  }

  setPosition(fen, lastMove = null) {
    this.cancelGesture();
    this.closePromotion();
    this.chess.load(fen);
    if (lastMove && typeof lastMove === 'object') {
      const from = (typeof lastMove.from === 'number') ? ChessBoard.indexToSquare(lastMove.from) : lastMove.from;
      const to = (typeof lastMove.to === 'number') ? ChessBoard.indexToSquare(lastMove.to) : lastMove.to;
      this.lastMove = { from, to };
    } else {
      this.lastMove = null;
    }
    this.selectedSq = null;
    this.legalMovesForSelected = [];
    this.render();
  }

  setArrows(arrows) {
    this.arrows = arrows || [];
    this.renderArrows();
    this.drawAnnotations();
  }

  clearArrows() {
    this.arrows = [];
    this.renderArrows();
  }

  render() {
    const isBlack = this.orientation === 'black';

    // 1. Position squares based on orientation
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = String.fromCharCode(97 + f) + (r + 1);
        const sqDiv = this.squareEls[sq];
        if (!sqDiv) continue;

        const displayCol = isBlack ? (7 - f) : f;
        const displayRow = isBlack ? r : (7 - r);

        sqDiv.style.left = `${(displayCol / 8) * 100}%`;
        sqDiv.style.top = `${(displayRow / 8) * 100}%`;
        sqDiv.style.width = '12.5%';
        sqDiv.style.height = '12.5%';

        // Reset classes
        sqDiv.classList.remove('selected', 'last-move-from', 'last-move-to', 'check');

        // Check highlight
        if (this.chess.inCheck ? this.chess.inCheck() : (this.chess.isCheck && this.chess.isCheck())) {
          const kingPiece = this.chess.turn === 'w' ? 'K' : 'k';
          const p = this.chess.board[r * 8 + f];
          if (p && (p.color === 'w' ? 'K' : 'k') === kingPiece && p.type === 'k') {
            sqDiv.classList.add('check');
          }
        }

        // Selected square
        if (this.selectedSq === sq) {
          sqDiv.classList.add('selected');
        }

        // Last move highlight
        if (this.lastMove) {
          if (this.lastMove.from === sq) sqDiv.classList.add('last-move-from');
          if (this.lastMove.to === sq) sqDiv.classList.add('last-move-to');
        }

        // Piece rendering
        const piece = this.chess.board[r * 8 + f];
        let pieceEl = sqDiv.querySelector('.maia-piece');

        if (piece) {
          const pieceSym = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
          if (!pieceEl) {
            pieceEl = document.createElement('div');
            pieceEl.className = 'maia-piece';
            sqDiv.appendChild(pieceEl);
          }
          pieceEl.innerHTML = CHESS_PIECES_SVG[pieceSym] || '';
          pieceEl.dataset.piece = pieceSym;
          pieceEl.style.display = 'block';
        } else if (pieceEl) {
          pieceEl.style.display = 'none';
        }

        // Legal move hint dots
        let hintDot = sqDiv.querySelector('.legal-hint-dot');
        const isLegal = this.legalMovesForSelected.some(m => m.toSq === sq);
        if (isLegal) {
          if (!hintDot) {
            hintDot = document.createElement('div');
            hintDot.className = piece ? 'legal-hint-ring' : 'legal-hint-dot';
            sqDiv.appendChild(hintDot);
          }
          hintDot.style.display = 'block';
        } else if (hintDot) {
          hintDot.style.display = 'none';
        }
      }
    }

    this.renderArrows();
  }

  getSquareCenterPercent(sq) {
    if (typeof sq === 'number') {
      sq = ChessBoard.indexToSquare(sq);
    }
    if (!sq || typeof sq !== 'string' || sq.length < 2) return { x: 0, y: 0 };
    const f = sq.charCodeAt(0) - 97;
    const r = parseInt(sq[1], 10) - 1;
    const isBlack = this.orientation === 'black';

    const col = isBlack ? (7 - f) : f;
    const row = isBlack ? r : (7 - r);

    return {
      x: (col + 0.5) * 12.5,
      y: (row + 0.5) * 12.5
    };
  }

  renderArrows() {
    this.drawAnnotations();
    const group = this.svgOverlay.querySelector('#maia-svg-arrows-group');
    if (!group) return;
    group.innerHTML = '';

    if (!this.arrows || this.arrows.length === 0) return;

    for (const arrow of this.arrows) {
      if (!arrow.from || !arrow.to) continue;

      const p1 = this.getSquareCenterPercent(arrow.from);
      const p2 = this.getSquareCenterPercent(arrow.to);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;

      // Shorten end slightly so marker doesn't poke out of square
      const shorten = 3.2; // percent
      const endX = p2.x - (dx / len) * shorten;
      const endY = p2.y - (dy / len) * shorten;

      let strokeColor = 'var(--brand-green)';
      let markerId = 'arrow-green';
      if (arrow.color === 'gold' || arrow.color === 'yellow' || arrow.color === '#F59E0B') {
        strokeColor = 'var(--brand-gold)';
        markerId = 'arrow-gold';
      } else if (arrow.color === 'red' || arrow.color === '#EF4444') {
        strokeColor = 'var(--brand-red)';
        markerId = 'arrow-red';
      } else if (arrow.color === 'blue') {
        strokeColor = 'var(--brand-blue)';
        markerId = 'arrow-blue';
      }

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${p1.x}%`);
      line.setAttribute('y1', `${p1.y}%`);
      line.setAttribute('x2', `${endX}%`);
      line.setAttribute('y2', `${endY}%`);
      line.setAttribute('stroke', strokeColor);
      line.setAttribute('stroke-width', arrow.width || '4.5');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('marker-end', `url(#${markerId})`);

      if (arrow.dashed) {
        line.setAttribute('stroke-dasharray', '6 5');
      }

      line.style.opacity = arrow.opacity || '0.9';
      group.appendChild(line);
    }

    // Second pass: Render labels grouped by destination square to prevent overlapping
    const targetMap = new Map();
    for (const arrow of this.arrows) {
      if (!arrow.to || !arrow.label) continue;
      if (!targetMap.has(arrow.to)) {
        targetMap.set(arrow.to, []);
      }
      targetMap.get(arrow.to).push(arrow);
    }

    for (const [toSq, targetArrows] of targetMap.entries()) {
      const p2 = this.getSquareCenterPercent(toSq);
      const count = targetArrows.length;

      targetArrows.forEach((arrow, idx) => {
        let labelColor = 'var(--brand-green)';
        if (arrow.color === 'gold' || arrow.color === 'yellow' || arrow.color === '#F59E0B') {
          labelColor = 'var(--brand-gold)';
        } else if (arrow.color === 'red' || arrow.color === '#EF4444') {
          labelColor = 'var(--brand-red)';
        } else if (arrow.color === 'blue') {
          labelColor = 'var(--brand-blue)';
        }

        // Stagger vertical offset so multiple labels landing on the same square stay perfectly legible
        let offsetY = -3.0; // percent
        if (count === 2) {
          offsetY = idx === 0 ? -4.0 : 3.6;
        } else if (count >= 3) {
          offsetY = idx === 0 ? -4.4 : (idx === 1 ? 0 : 4.4);
        }

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', `${p2.x}%`);
        text.setAttribute('y', `${p2.y + offsetY}%`);
        text.setAttribute('fill', labelColor);
        text.setAttribute('font-size', count > 2 ? '10px' : '11px');
        text.setAttribute('font-weight', '700');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('paint-order', 'stroke');
        text.setAttribute('stroke', 'var(--dg-surface)');
        text.setAttribute('stroke-width', '3.5px');
        text.textContent = arrow.label;
        group.appendChild(text);
      });
    }
  }

  bindEvents() {
    this.boardEl.addEventListener('click', (e) => {
      if (performance.now() < (this.suppressClickUntil || 0) && e.detail !== 0) return;
      if (e.target.closest('.promotion-picker')) return;
      const sqEl = e.target.closest('.maia-square');
      if (!sqEl) return;
      const sq = sqEl.dataset.square;
      this.handleSquareClick(sq);
    });
    this.boardEl.addEventListener('contextmenu', event => event.preventDefault());
    this.boardEl.addEventListener('dragstart', event => event.preventDefault());
    this.boardEl.addEventListener('pointerdown', event => {
      if (event.target.closest('.promotion-picker') || this.promotionPicker || ![0, 2].includes(event.button)) return;
      const square = this.squareAtPoint(event.clientX, event.clientY);
      if (!square) return;
      event.preventDefault();
      this.gesture = { id: event.pointerId, button: event.button, from: square, x: event.clientX, y: event.clientY, moved: false };
      this.boardEl.setPointerCapture(event.pointerId);
    });
    this.boardEl.addEventListener('pointermove', event => {
      const gesture = this.gesture;
      if (!gesture || gesture.id !== event.pointerId) return;
      const to = this.squareAtPoint(event.clientX, event.clientY);
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) gesture.moved = true;
      if (gesture.button === 2) {
        this.drawAnnotations(to ? { from: gesture.from, to } : null);
      } else if (gesture.moved) {
        const piece = this.chess.board[ChessBoard.squareToIndex(gesture.from)];
        if (!piece || piece.color !== this.chess.turn) return;
        if (!this.dragFloatingEl) {
          this.selectedSq = gesture.from;
          this.legalMovesForSelected = this.chess.getLegalMoves().filter(move => move.fromSq === gesture.from);
          this.render();
          this.dragFloatingEl = this.squareEls[gesture.from].querySelector('.maia-piece').cloneNode(true);
          this.dragFloatingEl.classList.add('study-drag-piece');
          this.dragFloatingEl.style.width = this.dragFloatingEl.style.height = `${this.boardEl.getBoundingClientRect().width / 8}px`;
          document.body.append(this.dragFloatingEl);
        }
        this.dragFloatingEl.style.left = `${event.clientX}px`;
        this.dragFloatingEl.style.top = `${event.clientY}px`;
      }
    });
    this.boardEl.addEventListener('pointerup', event => {
      const gesture = this.gesture;
      if (!gesture || gesture.id !== event.pointerId) return;
      const to = this.squareAtPoint(event.clientX, event.clientY);
      this.suppressClickUntil = performance.now() + 300;
      this.cancelGesture();
      if (!to) { this.render(); return; }
      if (gesture.button === 2) {
        const annotations = this.annotations.get(this.chess.getFen()) || [];
        const index = annotations.findIndex(arrow => arrow.from === gesture.from && arrow.to === to);
        if (index >= 0) annotations.splice(index, 1); else annotations.push({ from: gesture.from, to });
        this.annotations.set(this.chess.getFen(), annotations);
        this.drawAnnotations();
      } else if (gesture.moved) {
        this.moveTo(gesture.from, to);
      } else this.handleSquareClick(to);
    });
    this.boardEl.addEventListener('pointercancel', () => { this.cancelGesture(); this.drawAnnotations(); });
    this.boardEl.addEventListener('lostpointercapture', () => { this.cancelGesture(); this.drawAnnotations(); });
  }

  squareAtPoint(x, y) {
    const rect = this.boardEl.getBoundingClientRect();
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return null;
    let file = Math.floor((x - rect.left) / rect.width * 8);
    let rank = 7 - Math.floor((y - rect.top) / rect.height * 8);
    if (this.orientation === 'black') { file = 7 - file; rank = 7 - rank; }
    return ChessBoard.indexToSquare(rank * 8 + file);
  }

  cancelGesture() {
    this.gesture = null;
    this.dragFloatingEl?.remove();
    this.dragFloatingEl = null;
  }

  drawAnnotations(preview = null) {
    const group = this.svgOverlay.querySelector('.study-annotations');
    group.replaceChildren();
    for (const annotation of [...(this.annotations.get(this.chess.getFen()) || []), ...(preview ? [preview] : [])]) {
      const from = this.getSquareCenterPercent(annotation.from), to = this.getSquareCenterPercent(annotation.to);
      const element = document.createElementNS('http://www.w3.org/2000/svg', annotation.from === annotation.to ? 'circle' : 'line');
      if (annotation.from === annotation.to) {
        for (const [key, val] of Object.entries({ cx: `${from.x}%`, cy: `${from.y}%`, r: '5%', fill: 'none' })) element.setAttribute(key, val);
      } else {
        for (const [key, val] of Object.entries({ x1: `${from.x}%`, y1: `${from.y}%`, x2: `${to.x}%`, y2: `${to.y}%`, 'marker-end': 'url(#arrow-red)' })) element.setAttribute(key, val);
      }
      element.setAttribute('stroke', 'var(--brand-red)'); element.setAttribute('stroke-width', '3'); element.setAttribute('opacity', preview === annotation ? '.5' : '.8');
      group.append(element);
    }
  }

  clearAnnotations(all = false) {
    if (all) this.annotations.clear(); else this.annotations.delete(this.chess.getFen());
    this.drawAnnotations();
  }

  moveTo(from, to) {
    const moves = this.chess.getLegalMoves().filter(move => move.fromSq === from && move.toSq === to);
    if (moves.length > 1 && moves.some(move => move.promo)) this.choosePromotion(moves);
    else if (moves[0]) this.executeMove(moves[0]);
    else this.render();
  }

  closePromotion() { this.promotionPicker?.remove(); this.promotionPicker = null; }

  choosePromotion(moves) {
    this.closePromotion();
    const picker = document.createElement('div'); picker.className = 'promotion-picker'; picker.setAttribute('role', 'dialog'); picker.setAttribute('aria-label', this.promotionLabel || 'Choose promotion');
    for (const move of moves) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.promotion = move.promo; button.setAttribute('aria-label', move.promo.toUpperCase());
      button.innerHTML = CHESS_PIECES_SVG[this.chess.turn === 'w' ? move.promo.toUpperCase() : move.promo];
      button.onclick = event => { event.stopPropagation(); this.closePromotion(); this.executeMove(move); };
      picker.append(button);
    }
    this.boardEl.append(picker); this.promotionPicker = picker; picker.querySelector('button').focus();
  }

  handleSquareClick(sq) {
    // 1. If destination clicked for previously selected piece
    if (this.selectedSq) {
      const matchedMove = this.legalMovesForSelected.find(m => m.toSq === sq);
      if (matchedMove) {
        this.moveTo(this.selectedSq, sq);
        return;
      }
    }

    // 2. Select piece on square
    const idx = ChessBoard.squareToIndex(sq);
    const piece = this.chess.board[idx];

    if (piece && piece.color === this.chess.turn) {
      this.selectedSq = sq;
      const allLegals = this.chess.getLegalMoves();
      this.legalMovesForSelected = allLegals.filter(m => m.fromSq === sq);
    } else {
      this.selectedSq = null;
      this.legalMovesForSelected = [];
    }

    this.render();
    if (this.onSelectSquare) {
      this.onSelectSquare(sq);
    }
  }

  executeMove(move) {
    this.chess.makeMove(move);
    this.lastMove = { from: move.fromSq, to: move.toSq };
    this.selectedSq = null;
    this.legalMovesForSelected = [];
    this.render();

    if (this.onMove) {
      this.onMove(move, this.chess.getFen());
    }
  }
}
