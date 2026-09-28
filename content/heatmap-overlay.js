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
    this.boardEl = boardEl;
    this.orientation = orientation;

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
        <!-- Arrowhead Marker Highlight -->
        <marker id="maia-arrow-highlight" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ec4899" />
        </marker>
      </defs>
      <g id="maia-heatmap-layer"></g>
      <g id="maia-arrows-layer"></g>
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
    const trapsGroup = this.svg.querySelector('#maia-traps-layer');

    heatmapGroup.innerHTML = '';
    arrowsGroup.innerHTML = '';
    trapsGroup.innerHTML = '';

    // 1. Render Square Heatmap
    if (this.showHeatmap && predictionData.heatmap) {
      this.renderHeatmapSquares(heatmapGroup, predictionData.heatmap);
    }

    // 2. Render Move Arrows
    if (this.showArrows && predictionData.moves) {
      this.renderArrows(arrowsGroup, predictionData.moves);
    }

    // 3. Render Tactical Trap Indicator
    if (predictionData.analysis && predictionData.analysis.isTacticalTrap) {
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

  renderArrows(group, moves) {
    const topMoves = moves.slice(0, 3);
    const styles = [
      { marker: 'maia-arrow-gold', color: '#f59e0b', width: 8.5 },
      { marker: 'maia-arrow-cyan', color: '#06b6d4', width: 6.0 },
      { marker: 'maia-arrow-purple', color: '#a855f7', width: 4.5 }
    ];

    topMoves.forEach((move, idx) => {
      const isHovered = this.activeHoverMove === move.uci;
      const isTop = idx === 0;

      const fromCoords = this.squareToCoords(move.from);
      const toCoords = this.squareToCoords(move.to);

      const dx = toCoords.cx - fromCoords.cx;
      const dy = toCoords.cy - fromCoords.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const normX = dx / dist;
      const normY = dy / dist;

      // Start circle at origin square to clarify direction
      const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      startCircle.setAttribute('cx', fromCoords.cx);
      startCircle.setAttribute('cy', fromCoords.cy);
      startCircle.setAttribute('r', isTop ? '7' : '5');
      startCircle.setAttribute('fill', isHovered ? '#ec4899' : styles[idx].color);
      startCircle.setAttribute('opacity', isTop ? '0.95' : '0.8');
      group.appendChild(startCircle);

      // Line offset
      const startX = fromCoords.cx + normX * 12;
      const startY = fromCoords.cy + normY * 12;
      const endX = toCoords.cx - normX * 22;
      const endY = toCoords.cy - normY * 22;

      const style = isHovered
        ? { marker: 'maia-arrow-highlight', color: '#ec4899', width: 9.5 }
        : styles[idx];

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', startX);
      line.setAttribute('y1', startY);
      line.setAttribute('x2', endX);
      line.setAttribute('y2', endY);
      line.setAttribute('stroke', style.color);
      line.setAttribute('stroke-width', style.width);
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('marker-end', `url(#${style.marker})`);
      line.setAttribute('opacity', isHovered ? '1.0' : (isTop ? '0.92' : '0.75'));

      group.appendChild(line);

      // Percentage pill badge on destination square
      const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const badgeX = toCoords.cx;
      const badgeY = toCoords.cy + (idx === 0 ? 0 : (idx === 1 ? -16 : 16));

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', badgeX - 25);
      rect.setAttribute('y', badgeY - 11);
      rect.setAttribute('width', '50');
      rect.setAttribute('height', '22');
      rect.setAttribute('rx', '11');
      rect.setAttribute('fill', '#0f172a');
      rect.setAttribute('stroke', style.color);
      rect.setAttribute('stroke-width', '1.8');
      rect.setAttribute('opacity', '0.95');

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', badgeX);
      text.setAttribute('y', badgeY + 4.5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#ffffff');
      text.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '700');
      text.textContent = `${move.prob}%`;

      badgeGroup.appendChild(rect);
      badgeGroup.appendChild(text);
      group.appendChild(badgeGroup);
    });
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
    if (!this.svg) return;
    const heatmapGroup = this.svg.querySelector('#maia-heatmap-layer');
    const arrowsGroup = this.svg.querySelector('#maia-arrows-layer');
    const trapsGroup = this.svg.querySelector('#maia-traps-layer');
    if (heatmapGroup) heatmapGroup.innerHTML = '';
    if (arrowsGroup) arrowsGroup.innerHTML = '';
    if (trapsGroup) trapsGroup.innerHTML = '';
  }
}
