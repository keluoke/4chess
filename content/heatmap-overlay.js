/**
 * Board Overlay for Maia-3 Human Intuition Heatmap & Arrows
 * Injects an SVG canvas over the chessboard to render:
 * 1. 64-square attention heatmap with smooth thermal gradient
 * 2. Weighted intuition arrows for top candidate human moves
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

    // Ensure board element has relative positioning
    const computedStyle = window.getComputedStyle(boardEl);
    if (computedStyle.position === 'static') {
      boardEl.style.position = 'relative';
    }

    // Remove existing overlay if any
    const existing = boardEl.querySelector('#maia3-board-overlay');
    if (existing) existing.remove();

    // Create SVG overlay
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

    // SVG Defs (Markers for arrows, glow filters)
    this.svg.innerHTML = `
      <defs>
        <!-- Arrowhead Marker 1 (Gold / Amber) -->
        <marker id="maia-arrow-gold" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
        </marker>
        <!-- Arrowhead Marker 2 (Cyan / Teal) -->
        <marker id="maia-arrow-cyan" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
        </marker>
        <!-- Arrowhead Marker 3 (Purple / Violet) -->
        <marker id="maia-arrow-purple" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#a855f7" />
        </marker>
        <!-- Arrowhead Marker Highlight -->
        <marker id="maia-arrow-highlight" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#ec4899" />
        </marker>

        <!-- Drop Shadow / Glow Filter -->
        <filter id="maia-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
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
   * Converts square index (0..63) to SVG coordinates [x, y, centerX, centerY]
   */
  squareToCoords(sqIdx) {
    const f = sqIdx % 8;
    const r = Math.floor(sqIdx / 8);

    let col = f;
    let row = 7 - r; // White perspective: rank 8 is row 0

    if (this.orientation === 'black') {
      col = 7 - f;
      row = r;
    }

    const sqSize = 100; // 800 / 8
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

  /**
   * Main render function
   */
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

    // 3. Render Tactical Trap indicator
    if (predictionData.analysis && predictionData.analysis.isTacticalTrap) {
      this.renderTrapWarning(trapsGroup, predictionData.moves[0]);
    }
  }

  renderHeatmapSquares(group, heatmap) {
    for (let i = 0; i < 64; i++) {
      const val = heatmap[i];
      if (val < 0.12) continue; // Skip minimal attention squares for clean visual

      const { x, y, size } = this.squareToCoords(i);

      // Color interpolation: Low attention (cool violet/amber) -> High attention (fiery coral/gold)
      const alpha = Math.min(0.85, val * this.heatmapOpacity);
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
      rect.setAttribute('x', x + 3);
      rect.setAttribute('y', y + 3);
      rect.setAttribute('width', size - 6);
      rect.setAttribute('height', size - 6);
      rect.setAttribute('rx', '10');
      rect.setAttribute('ry', '10');
      rect.setAttribute('fill', `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`);
      rect.style.transition = 'all 0.25s ease';

      group.appendChild(rect);
    }
  }

  renderArrows(group, moves) {
    // Only display top 3 moves to avoid visual clutter
    const topMoves = moves.slice(0, 3);
    const styles = [
      { marker: 'maia-arrow-gold', color: '#f59e0b', width: 9 },
      { marker: 'maia-arrow-cyan', color: '#06b6d4', width: 6.5 },
      { marker: 'maia-arrow-purple', color: '#a855f7', width: 4.5 }
    ];

    topMoves.forEach((move, idx) => {
      const isHovered = this.activeHoverMove === move.uci;
      const isTop = idx === 0;

      const fromCoords = this.squareToCoords(move.from);
      const toCoords = this.squareToCoords(move.to);

      // Trim line ends slightly so arrow heads don't overshoot square centers
      const dx = toCoords.cx - fromCoords.cx;
      const dy = toCoords.cy - fromCoords.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const normX = dx / dist;
      const normY = dy / dist;

      const startX = fromCoords.cx + normX * 18;
      const startY = fromCoords.cy + normY * 18;
      const endX = toCoords.cx - normX * 22;
      const endY = toCoords.cy - normY * 22;

      const style = isHovered
        ? { marker: 'maia-arrow-highlight', color: '#ec4899', width: 10 }
        : styles[idx];

      // Base arrow line
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
      line.style.transition = 'all 0.2s ease';

      group.appendChild(line);

      // Percentage pill badge on destination square
      const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const badgeX = toCoords.cx;
      const badgeY = toCoords.cy + (idx === 0 ? 0 : (idx === 1 ? -18 : 18));

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', badgeX - 25);
      rect.setAttribute('y', badgeY - 12);
      rect.setAttribute('width', '50');
      rect.setAttribute('height', '24');
      rect.setAttribute('rx', '12');
      rect.setAttribute('fill', '#111827');
      rect.setAttribute('stroke', style.color);
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('opacity', '0.95');

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', badgeX);
      text.setAttribute('y', badgeY + 4.5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#ffffff');
      text.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
      text.setAttribute('font-size', '12');
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
    circle.setAttribute('r', '40');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#ef4444');
    circle.setAttribute('stroke-width', '4');
    circle.setAttribute('stroke-dasharray', '6 4');
    circle.setAttribute('opacity', '0.85');

    const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform');
    anim.setAttribute('attributeName', 'transform');
    anim.setAttribute('type', 'rotate');
    anim.setAttribute('from', `0 ${cx} ${cy}`);
    anim.setAttribute('to', `360 ${cx} ${cy}`);
    anim.setAttribute('dur', '6s');
    anim.setAttribute('repeatCount', 'indefinite');
    circle.appendChild(anim);

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
