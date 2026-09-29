/**
 * Interactive Evaluation & Winrate Trend Chart (SVG)
 * Modern, sleek advantage chart with smooth spline curves, dual-zone background,
 * reference gridlines, key moment markers, and interactive hover tooltip.
 */

export class EvalChart {
  constructor(containerEl, onSelectPly) {
    this.container = containerEl;
    this.onSelectPly = onSelectPly;
    this.data = []; // [{ ply, moveNumber, turn, san, cp, evalText, severity, lossPawns, isHumanTrap }]
    this.currentPly = 0;
    this.hoverIndex = -1;
    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="eval-chart-header">
        <div class="eval-chart-title-group">
          <span class="eval-chart-title">局面走势</span>
          <span id="eval-chart-cursor-badge" class="eval-chart-badge">0.00</span>
        </div>
        <div class="eval-chart-legend">
          <span class="legend-item"><span class="dot-cyan"></span> ✨ 超越直觉</span>
          <span class="legend-item"><span class="dot-gold"></span> 💡 直觉陷阱</span>
          <span class="legend-item"><span class="dot-red"></span> 大漏</span>
        </div>
      </div>
      <div class="eval-chart-body" id="eval-chart-body">
        <div class="eval-chart-tooltip" id="eval-chart-tooltip"></div>
        <svg class="eval-chart-svg" preserveAspectRatio="none" viewBox="0 0 1000 160">
          <defs>
            <!-- White advantage fill (upward from center) -->
            <linearGradient id="grad-white-adv" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25"/>
              <stop offset="60%" stop-color="#ffffff" stop-opacity="0.08"/>
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0"/>
            </linearGradient>
            <!-- Black advantage fill (downward from center) -->
            <linearGradient id="grad-black-adv" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ef4444" stop-opacity="0.0"/>
              <stop offset="40%" stop-color="#ef4444" stop-opacity="0.06"/>
              <stop offset="100%" stop-color="#ef4444" stop-opacity="0.28"/>
            </linearGradient>
            <!-- Subtle stroke gradient -->
            <linearGradient id="grad-stroke-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#94a3b8"/>
              <stop offset="50%" stop-color="#f8fafc"/>
              <stop offset="100%" stop-color="#cbd5e1"/>
            </linearGradient>
          </defs>

          <!-- Dual Zone Background -->
          <rect x="0" y="0" width="1000" height="80" fill="rgba(255, 255, 255, 0.02)"/>
          <rect x="0" y="80" width="1000" height="80" fill="rgba(0, 0, 0, 0.18)"/>

          <!-- Horizontal Reference Gridlines -->
          <line x1="0" y1="28" x2="960" y2="28" stroke="rgba(255, 255, 255, 0.07)" stroke-dasharray="3 4" stroke-width="1"/>
          <text x="988" y="32" fill="rgba(255, 255, 255, 0.35)" font-size="10" font-family="monospace" text-anchor="end">+3</text>

          <line x1="0" y1="80" x2="960" y2="80" stroke="rgba(255, 255, 255, 0.22)" stroke-width="1.2"/>
          <text x="988" y="84" fill="rgba(255, 255, 255, 0.45)" font-size="10" font-family="monospace" text-anchor="end">0</text>

          <line x1="0" y1="132" x2="960" y2="132" stroke="rgba(255, 255, 255, 0.07)" stroke-dasharray="3 4" stroke-width="1"/>
          <text x="988" y="136" fill="rgba(255, 255, 255, 0.35)" font-size="10" font-family="monospace" text-anchor="end">-3</text>

          <!-- Filled Curve Areas -->
          <path id="eval-white-area" fill="url(#grad-white-adv)"/>
          <path id="eval-black-area" fill="url(#grad-black-adv)"/>

          <!-- Main Smooth Spline Line -->
          <path id="eval-line-path" fill="none" stroke="url(#grad-stroke-line)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

          <!-- Key Moment Marker Dots -->
          <g id="eval-dots-group"></g>

          <!-- Interactive Hover Guide Line -->
          <line id="eval-hover-line" x1="0" y1="0" x2="0" y2="160" stroke="rgba(255, 255, 255, 0.4)" stroke-width="1.5" stroke-dasharray="2 2" opacity="0"/>

          <!-- Active Move Scrub Cursor -->
          <line id="eval-scrub-line" x1="0" y1="0" x2="0" y2="160" stroke="#e6a520" stroke-width="2" opacity="0"/>
          <circle id="eval-scrub-dot" cx="0" cy="80" r="4.5" fill="#e6a520" stroke="#ffffff" stroke-width="1.5" opacity="0"/>
        </svg>
      </div>
    `;

    this.chartBody = this.container.querySelector('#eval-chart-body');
    this.tooltip = this.container.querySelector('#eval-chart-tooltip');
    this.cursorBadge = this.container.querySelector('#eval-chart-cursor-badge');
    this.svg = this.container.querySelector('.eval-chart-svg');
    this.linePath = this.container.querySelector('#eval-line-path');
    this.whiteArea = this.container.querySelector('#eval-white-area');
    this.blackArea = this.container.querySelector('#eval-black-area');
    this.dotsGroup = this.container.querySelector('#eval-dots-group');
    this.hoverLine = this.container.querySelector('#eval-hover-line');
    this.scrubLine = this.container.querySelector('#eval-scrub-line');
    this.scrubDot = this.container.querySelector('#eval-scrub-dot');

    this.bindInteractions();
  }

  bindInteractions() {
    this.svg.addEventListener('mousemove', (e) => {
      if (this.data.length === 0) return;
      const rect = this.svg.getBoundingClientRect();
      const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetIndex = Math.round(xRatio * (this.data.length - 1));
      const item = this.data[targetIndex];
      if (!item) return;

      this.hoverIndex = targetIndex;
      const xSvg = (targetIndex / (this.data.length - 1 || 1)) * 1000;
      this.hoverLine.setAttribute('x1', xSvg);
      this.hoverLine.setAttribute('x2', xSvg);
      this.hoverLine.style.opacity = '1';

      // Tooltip position and content
      const xPx = xRatio * rect.width;
      this.tooltip.style.left = `${xPx}px`;
      this.tooltip.style.top = `20px`;
      this.tooltip.style.display = 'block';

      const isWhite = item.turn === 'w';
      const sideText = isWhite ? '白方' : '黑方';
      const evalSign = item.cp > 0 ? `+${(item.cp / 100).toFixed(2)}` : (item.cp / 100).toFixed(2);
      const evalColor = item.cp > 40 ? '#4ade80' : (item.cp < -40 ? '#f87171' : 'var(--text-muted)');

      this.tooltip.replaceChildren();

      const topRow = document.createElement('div');
      topRow.style.fontWeight = '600';
      topRow.style.marginBottom = '2px';

      topRow.appendChild(document.createTextNode(`第 ${item.moveNumber} 步 (${sideText} `));
      const sanSpan = document.createElement('span');
      sanSpan.textContent = item.san;
      topRow.appendChild(sanSpan);
      topRow.appendChild(document.createTextNode(')'));

      if (item.divergenceType === 'beyond_intuition' || item.isBeyondIntuition) {
        const badge = document.createElement('span');
        badge.style.color = '#00d2ff';
        badge.style.fontWeight = '700';
        badge.textContent = ' · ✨ 超越直觉 (走出引擎一选)';
        topRow.appendChild(badge);
      } else if (item.divergenceType === 'intuition_trap' || item.isHumanTrap) {
        const badge = document.createElement('span');
        badge.style.color = '#f59e0b';
        badge.style.fontWeight = '700';
        badge.textContent = ` · 💡 直觉陷阱 (-${item.lossPawns})`;
        topRow.appendChild(badge);
      } else if (item.severity === 'blunder') {
        const badge = document.createElement('span');
        badge.style.color = '#f87171';
        badge.style.fontWeight = '700';
        badge.textContent = ` · 大漏 (${item.lossPawns})`;
        topRow.appendChild(badge);
      } else if (item.severity === 'mistake') {
        const badge = document.createElement('span');
        badge.style.color = '#fbbf24';
        badge.style.fontWeight = '700';
        badge.textContent = ` · 失误 (${item.lossPawns})`;
        topRow.appendChild(badge);
      }
      this.tooltip.appendChild(topRow);

      const evalRow = document.createElement('div');
      evalRow.style.color = 'var(--text-dim)';
      evalRow.style.fontSize = '10.5px';
      evalRow.appendChild(document.createTextNode('白方局势: '));
      const evalStrong = document.createElement('strong');
      evalStrong.style.color = evalColor;
      evalStrong.textContent = evalSign;
      evalRow.appendChild(evalStrong);
      this.tooltip.appendChild(evalRow);
    });

    this.svg.addEventListener('mouseleave', () => {
      this.hoverLine.style.opacity = '0';
      this.tooltip.style.display = 'none';
      this.hoverIndex = -1;
    });

    this.svg.addEventListener('click', (e) => {
      const rect = this.svg.getBoundingClientRect();
      const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (this.data.length > 0) {
        const targetIndex = Math.round(xRatio * (this.data.length - 1));
        const item = this.data[targetIndex];
        if (item && this.onSelectPly) {
          this.onSelectPly(item.ply);
        }
      }
    });
  }

  setData(analyzedMoves) {
    if (!analyzedMoves || analyzedMoves.length === 0) {
      this.data = [];
      this.render();
      return;
    }

    // Convert centipawns / eval into White advantage: clamp to [-450, +450]
    this.data = analyzedMoves.map((m) => {
      let cp = 0;
      const evalStr = m.eval || m.evalAfter || m.evalBefore;
      if (evalStr && evalStr !== '?') {
        if (evalStr.startsWith('#') || evalStr.startsWith('M')) {
          cp = evalStr.includes('-') ? -900 : 900;
        } else {
          cp = parseFloat(evalStr) * 100;
        }
      }

      // Stockfish scores evalAfter from the side to move.
      // If move was made by White, it is Black's turn next.
      // So White's advantage after White's move is -cp.
      if (m.turn === 'w') {
        cp = -cp;
      }

      // Clamp between -450 and +450 centipawns ([-4.5, +4.5] pawns)
      const clamped = Math.max(-450, Math.min(450, cp));

      return {
        ply: m.ply,
        moveNumber: m.moveNumber,
        turn: m.turn,
        san: m.san,
        cp: clamped,
        evalText: evalStr || '0.00',
        severity: m.severity || 'normal',
        lossPawns: m.lossPawns || '0.00',
        isHumanTrap: !!m.isHumanTrap,
        isBeyondIntuition: !!m.isBeyondIntuition,
        divergenceType: m.divergenceType || null,
        divergenceNote: m.divergenceNote || ''
      };
    });

    this.render();
  }

  setCursor(ply) {
    this.currentPly = ply;
    if (this.data.length <= 1) return;

    const idx = this.data.findIndex(d => d.ply === ply);
    if (idx === -1) return;

    const item = this.data[idx];
    const n = this.data.length;
    const x = (idx / (n - 1 || 1)) * 1000;
    const midY = 80;
    const y = midY - (item.cp / 450) * 58;

    this.scrubLine.setAttribute('x1', x);
    this.scrubLine.setAttribute('x2', x);
    this.scrubLine.style.opacity = '1';

    this.scrubDot.setAttribute('cx', x);
    this.scrubDot.setAttribute('cy', y);
    this.scrubDot.style.opacity = '1';

    // Update cursor badge
    const evalSign = item.cp > 0 ? `+${(item.cp / 100).toFixed(2)}` : (item.cp / 100).toFixed(2);
    if (this.cursorBadge) {
      this.cursorBadge.textContent = evalSign;
      if (item.cp > 50) {
        this.cursorBadge.style.color = '#4ade80';
      } else if (item.cp < -50) {
        this.cursorBadge.style.color = '#f87171';
      } else {
        this.cursorBadge.style.color = 'var(--text-muted)';
      }
    }
  }

  /**
   * Catmull-Rom to Cubic Bézier spline generator for organic, smooth curve
   */
  generateSmoothPath(points) {
    if (points.length <= 1) return points.length === 1 ? `M ${points[0].x} ${points[0].y}` : '';
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  }

  render() {
    if (this.data.length === 0) {
      this.linePath.setAttribute('d', '');
      this.whiteArea.setAttribute('d', '');
      this.blackArea.setAttribute('d', '');
      this.dotsGroup.innerHTML = '';
      this.scrubLine.style.opacity = '0';
      this.scrubDot.style.opacity = '0';
      return;
    }

    const n = this.data.length;
    const w = 1000;
    const midY = 80;

    const points = this.data.map((d, i) => {
      const x = (i / (n - 1 || 1)) * w;
      // y: +450 cp -> ~22 (top), -450 cp -> ~138 (bottom)
      const y = midY - (d.cp / 450) * 58;
      return { x, y, d };
    });

    // 1. Smooth Main Curve
    const curvePath = this.generateSmoothPath(points);
    this.linePath.setAttribute('d', curvePath);

    // 2. Dual Area Fill (White advantage top area, Black advantage bottom area)
    const whiteAreaPoints = points.map(p => ({ x: p.x, y: Math.min(midY, p.y) }));
    const whiteCurve = this.generateSmoothPath(whiteAreaPoints);
    const whiteAreaD = `${whiteCurve} L ${points[points.length - 1].x} ${midY} L ${points[0].x} ${midY} Z`;
    this.whiteArea.setAttribute('d', whiteAreaD);

    const blackAreaPoints = points.map(p => ({ x: p.x, y: Math.max(midY, p.y) }));
    const blackCurve = this.generateSmoothPath(blackAreaPoints);
    const blackAreaD = `${blackCurve} L ${points[points.length - 1].x} ${midY} L ${points[0].x} ${midY} Z`;
    this.blackArea.setAttribute('d', blackAreaD);

    // 3. Render Markers on Key Moments
    this.dotsGroup.innerHTML = '';
    points.forEach(p => {
      const isBeyond = p.d.divergenceType === 'beyond_intuition' || p.d.isBeyondIntuition;
      const isTrap = p.d.divergenceType === 'intuition_trap' || p.d.isHumanTrap;
      const isBlunder = p.d.severity === 'blunder';
      const isMistake = p.d.severity === 'mistake';

      if (isBeyond || isTrap || isBlunder || isMistake) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);

        let color = '#f59e0b';
        let radius = '4.5';
        if (isBeyond) {
          color = '#00d2ff';
          radius = '5.5';
        } else if (isTrap) {
          color = '#f59e0b';
          radius = '5';
        } else if (isBlunder) {
          color = '#ef4444';
          radius = '5';
        } else if (isMistake) {
          color = '#f97316';
          radius = '4';
        }

        circle.setAttribute('r', radius);
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '1.5');
        circle.style.cursor = 'pointer';
        circle.style.transition = 'transform 0.15s ease';

        circle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onSelectPly) this.onSelectPly(p.d.ply);
        });

        this.dotsGroup.appendChild(circle);
      }
    });

    if (this.currentPly) {
      this.setCursor(this.currentPly);
    }
  }
}
