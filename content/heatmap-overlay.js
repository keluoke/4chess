/**
 * Board Overlay for Maia-3 Human Intuition Heatmap & Arrows
 * Injects an SVG canvas over the chessboard to render:
 * 1. 64-square attention heatmap with smooth thermal gradient
 * 2. Unambiguous directed intuition arrows pointing precisely from origin to destination
 * 3. Tactical trap warning rings
 */

export class HeatmapOverlay {
  constructor() {
    this.svg = null;
    this.boardEl = null;
    this.orientation = 'white';
    this.showHeatmap = true;
    this.showArrows = true;
    this.heatmapOpacity = 0.55;
    this.currentData = null;
    this.activeHoverMove = null;
  }

  attach(boardEl, orientation = 'white') {
    this.orientation = orientation;
    if (this.boardEl === boardEl && this.svg && boardEl.contains(this.svg)) {
      return;
    }
    this.boardEl = boardEl;

    const computedStyle = window.getComputedStyle(boardEl);
    if (computedStyle.position === 'static') {
      boardEl.style.position = 'relative';
    }

    const existing = boardEl.querySelector('#maia3-board-overlay');
    if (existing) existing.remove();

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.id = 'maia3-board-overlay';
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.style.position = 'absolute';
    this.svg.style.top = '0';
    this.svg.style.left = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.pointerEvents = 'none';
    this.svg.style.zIndex = '15';
    this.svg.style.transition = 'opacity 0.2s ease';

    // SVG Arrow Markers with orient="auto" (Standard, non-inverting)
    this.svg.innerHTML = `
      <defs>
        <!-- Arrowhead Marker 1 (Gold / Amber) -->
        <marker id="maia-arrow-gold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#f59e0b" />
        </marker>
        <!-- Arrowhead Marker 2 (Cyan / Teal) -->
        <marker id="maia-arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#06b6d4" />
        </marker>
        <!-- Arrowhead Marker 3 (Purple / Violet) -->
        <marker id="maia-arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#a855f7" />
        </marker>
        <!-- Arrowhead Marker Stockfish (Emerald Green) -->
        <marker id="maia-arrow-sf" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#10b981" />
        </marker>
        <!-- Arrowhead Marker Consensus (Glowing Cyan) -->
        <marker id="maia-arrow-consensus" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#06b6d4" />
        </marker>
        <!-- Arrowhead Marker Highlight -->
        <marker id="maia-arrow-highlight" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ec4899" />
        </marker>
      </defs>
      <g id="maia-heatmap-layer"></g>
      <g id="maia-arrows-layer"></g>
      <g id="maia-sf-arrows-layer"></g>
      <g id="maia-traps-layer"></g>
    `;

    boardEl.appendChild(this.svg);
  }

  setOrientation(orientation) {
    this.orientation = orientation;
    if (this.currentData) {
      this.render(this.currentData);
    }
  }

  setToggles({ showHeatmap, showArrows, opacity }) {
    if (showHeatmap !== undefined) this.showHeatmap = showHeatmap;
    if (showArrows !== undefined) this.showArrows = showArrows;
    if (opacity !== undefined) this.heatmapOpacity = opacity;

    if (this.currentData) {
      this.render(this.currentData);
    }
  }

  setHoverMove(moveUci) {
    this.activeHoverMove = moveUci;
    if (this.currentData) {
      this.render(this.currentData);
    }
  }

  /**
   * Converts square index (0..63) to SVG canvas coordinates
   * sqIdx = rank * 8 + file (a1 = 0, h1 = 7, a8 = 56, h8 = 63)
   */
  squareToCoords(sqIdx) {
    if (typeof sqIdx === 'string') {
      const f = sqIdx.charCodeAt(0) - 97;
      const r = parseInt(sqIdx[1], 10) - 1;
      sqIdx = r * 8 + f;
    }
    const f = sqIdx % 8;
    const r = Math.floor(sqIdx / 8);

    let col = f;
    let row = 7 - r; // White orientation: rank 8 is top row 0

    if (this.orientation === 'black') {
      col = 7 - f;
      row = r; // Black orientation: rank 1 is top row 0
    }

    const sqSize = 100;
    const x = col * sqSize;
    const y = row * sqSize;
    return {
      x,
      y,
      cx: x + sqSize / 2,
      cy: y + sqSize / 2,
      size: sqSize
    };
  }

  render(predictionData) {
    if (!this.svg) return;
    this.currentData = predictionData;

    const heatmapGroup = this.svg.querySelector('#maia-heatmap-layer');
    const arrowsGroup = this.svg.querySelector('#maia-arrows-layer');
    const sfArrowsGroup = this.svg.querySelector('#maia-sf-arrows-layer');
    const trapsGroup = this.svg.querySelector('#maia-traps-layer');

    heatmapGroup.innerHTML = '';
    arrowsGroup.innerHTML = '';
    if (sfArrowsGroup) sfArrowsGroup.innerHTML = '';
    trapsGroup.innerHTML = '';

    // If Stockfish has bestMove, draw Stockfish arrow immediately regardless of Maia state
    if (this.showArrows && predictionData?.stockfish?.bestMove && sfArrowsGroup && !predictionData.isAvailable) {
      const bm = predictionData.stockfish.bestMove;
      this.drawArrow(sfArrowsGroup, {
        from: bm.fromSq !== undefined ? bm.fromSq : bm.from,
        to: bm.toSq !== undefined ? bm.toSq : bm.to,
        color: '#10b981',
        width: 7.5,
        dashed: true,
        marker: 'maia-arrow-sf',
        label: `🐟 ${bm.san} (${predictionData.stockfish.score})`,
        opacity: 0.90
      });
    }

    // If Maia-3 engine is not available, return after drawing Stockfish
    if (!predictionData || !predictionData.isAvailable) {
      return;
    }

    // 1. Render Square Heatmap
    if (this.showHeatmap && predictionData.heatmap) {
      this.renderHeatmapSquares(heatmapGroup, predictionData.heatmap);
    }

    // 2. Render Dual Move Arrows (Maia Human + Stockfish Objective)
    if (this.showArrows) {
      this.renderDualArrows(arrowsGroup, sfArrowsGroup, predictionData);
    }

    // 3. Render Tactical Trap Indicator
    if (predictionData.analysis && predictionData.analysis.isTacticalTrap && predictionData.moves?.[0]) {
      this.renderTrapWarning(trapsGroup, predictionData.moves[0]);
    }
  }

  renderHeatmapSquares(group, heatmap) {
    for (let i = 0; i < 64; i++) {
      const val = heatmap[i];
      if (val < 0.15) continue;

      const { x, y, size } = this.squareToCoords(i);
      const alpha = Math.min(0.80, val * this.heatmapOpacity);
      let r, g, b;

      if (val < 0.5) {
        const t = val / 0.5;
        r = Math.round(99 + t * (245 - 99));
        g = Math.round(102 + t * (158 - 102));
        b = Math.round(241 - t * (241 - 11));
      } else {
        const t = (val - 0.5) / 0.5;
        r = Math.round(245 + t * (239 - 245));
        g = Math.round(158 - t * (158 - 68));
        b = Math.round(11 + t * (68 - 11));
      }

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x + 4);
      rect.setAttribute('y', y + 4);
      rect.setAttribute('width', size - 8);
      rect.setAttribute('height', size - 8);
      rect.setAttribute('rx', '10');
      rect.setAttribute('ry', '10');
      rect.setAttribute('fill', `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`);
      rect.style.transition = 'all 0.25s ease';

      group.appendChild(rect);
    }
  }

  renderDualArrows(maiaGroup, sfGroup, data) {
    const moves = data.moves || [];
    const sf = data.stockfish;
    const topMove = moves[0];
    const isConsensus = sf && sf.bestMove && topMove && (topMove.uci === sf.bestMove.uci);

    if (isConsensus) {
      // 1. Single Glowing Consensus Arrow (Maia == Stockfish)
      this.drawArrow(maiaGroup, {
        from: topMove.from,
        to: topMove.to,
        color: '#06b6d4',
        width: 9.0,
        marker: 'maia-arrow-consensus',
        label: `🎯 ${topMove.san} (${topMove.prob}%)`,
        opacity: 0.95
      });
      // Other human moves
      moves.slice(1, 3).forEach((m, idx) => {
        this.drawArrow(maiaGroup, {
          from: m.from,
          to: m.to,
          color: idx === 0 ? '#f59e0b' : '#a855f7',
          width: 5.0,
          marker: idx === 0 ? 'maia-arrow-gold' : 'maia-arrow-purple',
          label: `${m.prob}%`,
          opacity: 0.65
        });
      });
    } else {
      // 2. Maia Human Top Move (Gold Arrow)
      if (topMove) {
        this.drawArrow(maiaGroup, {
          from: topMove.from,
          to: topMove.to,
          color: '#f59e0b',
          width: 8.5,
          marker: 'maia-arrow-gold',
          label: `🧠 ${topMove.san} (${topMove.prob}%)`,
          opacity: 0.92
        });
      }

      // 3. Stockfish Objective Best Move (Emerald Green Arrow)
      if (sf && sf.bestMove && sfGroup) {
        const bm = sf.bestMove;
        this.drawArrow(sfGroup, {
          from: bm.fromSq !== undefined ? bm.fromSq : bm.from,
          to: bm.toSq !== undefined ? bm.toSq : bm.to,
          color: '#10b981',
          width: 7.5,
          marker: 'maia-arrow-sf',
          dashed: '7 4',
          label: `🐟 ${bm.san} (${sf.score})`,
          opacity: 0.92,
          isStockfish: true
        });
      }

      // Other human candidates
      moves.slice(1, 3).forEach(m => {
        this.drawArrow(maiaGroup, {
          from: m.from,
          to: m.to,
          color: '#a855f7',
          width: 4.5,
          marker: 'maia-arrow-purple',
          label: `${m.prob}%`,
          opacity: 0.60
        });
      });
    }
  }

  drawArrow(group, { from, to, color, width, marker, label, opacity = 0.9, dashed = null, isStockfish = false }) {
    const fromCoords = this.squareToCoords(from);
    const toCoords = this.squareToCoords(to);

    const dx = toCoords.cx - fromCoords.cx;
    const dy = toCoords.cy - fromCoords.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const normX = dx / dist;
    const normY = dy / dist;

    // Start circle at origin square
    const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    startCircle.setAttribute('cx', fromCoords.cx);
    startCircle.setAttribute('cy', fromCoords.cy);
    startCircle.setAttribute('r', isStockfish ? '5' : '6');
    startCircle.setAttribute('fill', color);
    startCircle.setAttribute('opacity', opacity);
    group.appendChild(startCircle);

    // Line offset
    const startX = fromCoords.cx + normX * 12;
    const startY = fromCoords.cy + normY * 12;
    const endX = toCoords.cx - normX * 22;
    const endY = toCoords.cy - normY * 22;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', startX);
    line.setAttribute('y1', startY);
    line.setAttribute('x2', endX);
    line.setAttribute('y2', endY);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', width);
    line.setAttribute('stroke-linecap', 'round');
    if (dashed) line.setAttribute('stroke-dasharray', dashed);
    line.setAttribute('marker-end', `url(#${marker})`);
    line.setAttribute('opacity', opacity);
    group.appendChild(line);

    // Label pill on destination square
    if (label) {
      const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const badgeX = toCoords.cx;
      const badgeY = toCoords.cy + (isStockfish ? 16 : -14);

      const rectWidth = Math.max(55, label.length * 7.5 + 16);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', badgeX - rectWidth / 2);
      rect.setAttribute('y', badgeY - 11);
      rect.setAttribute('width', rectWidth);
      rect.setAttribute('height', '22');
      rect.setAttribute('rx', '11');
      rect.setAttribute('fill', '#0f172a');
      rect.setAttribute('stroke', color);
      rect.setAttribute('stroke-width', '1.6');
      rect.setAttribute('opacity', '0.95');

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', badgeX);
      text.setAttribute('y', badgeY + 4.5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#ffffff');
      text.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
      text.setAttribute('font-size', '10.5');
      text.setAttribute('font-weight', '700');
      text.textContent = label;

      badgeGroup.appendChild(rect);
      badgeGroup.appendChild(text);
      group.appendChild(badgeGroup);
    }
  }

  renderTrapWarning(group, topMove) {
    if (!topMove) return;
    const { cx, cy } = this.squareToCoords(topMove.to);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', '38');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#ef4444');
    circle.setAttribute('stroke-width', '3.5');
    circle.setAttribute('stroke-dasharray', '6 4');
    circle.setAttribute('opacity', '0.85');

    group.appendChild(circle);
  }

  clear() {
    this.currentData = null;
    this.activeHoverMove = null;
    if (!this.svg) return;
    const heatmapGroup = this.svg.querySelector('#maia-heatmap-layer');
    const arrowsGroup = this.svg.querySelector('#maia-arrows-layer');
    const sfArrowsGroup = this.svg.querySelector('#maia-sf-arrows-layer');
    const trapsGroup = this.svg.querySelector('#maia-traps-layer');
    if (heatmapGroup) heatmapGroup.innerHTML = '';
    if (arrowsGroup) arrowsGroup.innerHTML = '';
    if (sfArrowsGroup) sfArrowsGroup.innerHTML = '';
    if (trapsGroup) trapsGroup.innerHTML = '';
  }
}
