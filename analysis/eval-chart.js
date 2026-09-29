/**
 * Interactive Evaluation & Winrate Trend Chart (SVG)
 * Plots evaluation swings across all plies with blunder markers and scrub cursor.
 * Clicking anywhere on the chart triggers instantaneous move jump.
 */

export class EvalChart {
  constructor(containerEl, onSelectPly) {
    this.container = containerEl;
    this.onSelectPly = onSelectPly;
    this.data = []; // [{ ply, evalWhite, severity }]
    this.currentPly = 0;
    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="eval-chart-header">
        <span class="eval-chart-title">📈 局面优劣与胜率走势 (Advantage Trend)</span>
        <span class="eval-chart-legend">
          <span class="legend-item"><span class="dot-red"></span> 漏着</span>
          <span class="legend-item"><span class="dot-orange"></span> 疑问</span>
          <span class="legend-item"><span class="dot-blue"></span> 正常</span>
        </span>
      </div>
      <div class="eval-chart-body">
        <svg class="eval-chart-svg" preserveAspectRatio="none" viewBox="0 0 1000 160">
          <defs>
            <linearGradient id="grad-white-adv" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#07C160" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="#07C160" stop-opacity="0.0"/>
            </linearGradient>
            <linearGradient id="grad-black-adv" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#FA5151" stop-opacity="0.0"/>
              <stop offset="100%" stop-color="#FA5151" stop-opacity="0.35"/>
            </linearGradient>
          </defs>
          <line x1="0" y1="80" x2="1000" y2="80" stroke="rgba(255,255,255,0.18)" stroke-dasharray="4 4" stroke-width="1.5"/>
          <path id="eval-area-path" fill="url(#grad-white-adv)"/>
          <path id="eval-line-path" fill="none" stroke="#07C160" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <g id="eval-dots-group"></g>
          <line id="eval-scrub-line" x1="0" y1="0" x2="0" y2="160" stroke="#F59E0B" stroke-width="2.5" stroke-dasharray="2 2" opacity="0"/>
        </svg>
      </div>
    `;

    this.svg = this.container.querySelector('.eval-chart-svg');
    this.linePath = this.container.querySelector('#eval-line-path');
    this.areaPath = this.container.querySelector('#eval-area-path');
    this.dotsGroup = this.container.querySelector('#eval-dots-group');
    this.scrubLine = this.container.querySelector('#eval-scrub-line');

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
      return;
    }

    // Convert centipawns / eval into White advantage: clamp to [-5.0, +5.0]
    this.data = analyzedMoves.map((m, idx) => {
      let cp = 0;
      const evalStr = m.eval || m.evalAfter || m.evalBefore;
      if (evalStr && evalStr !== '?') {
        if (evalStr.startsWith('#') || evalStr.startsWith('M')) {
          cp = evalStr.includes('-') ? -1000 : 1000;
        } else {
          cp = parseFloat(evalStr) * 100;
        }
      }
      // If move was made by White, position after move has Black to move.
      // Stockfish scores evalAfter from the side to move (Black).
      // So White's advantage after White's move is -cp.
      if (m.turn === 'w') {
        cp = -cp;
      }
      // Clamp between -500 and +500 centipawns
      const clamped = Math.max(-500, Math.min(500, cp));
      return {
        ply: m.ply,
        moveNumber: m.moveNumber,
        turn: m.turn,
        san: m.san,
        cp: clamped,
        severity: m.severity || 'normal'
      };
    });

    this.render();
  }

  setCursor(ply) {
    this.currentPly = ply;
    if (this.data.length <= 1) return;

    const idx = this.data.findIndex(d => d.ply === ply);
    if (idx === -1) return;

    const x = (idx / (this.data.length - 1)) * 1000;
    this.scrubLine.setAttribute('x1', x);
    this.scrubLine.setAttribute('x2', x);
    this.scrubLine.style.opacity = '1';
  }

  render() {
    if (this.data.length === 0) {
      this.linePath.setAttribute('d', '');
      this.areaPath.setAttribute('d', '');
      this.dotsGroup.innerHTML = '';
      this.scrubLine.style.opacity = '0';
      return;
    }

    const n = this.data.length;
    const w = 1000;
    const h = 160;
    const midY = 80;

    const points = this.data.map((d, i) => {
      const x = (i / (n - 1 || 1)) * w;
      // y: +500 cp -> 15 (top), -500 cp -> 145 (bottom)
      const y = midY - (d.cp / 500) * 65;
      return { x, y, d };
    });

    // 1. Line path
    let dStr = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      dStr += ` L ${points[i].x} ${points[i].y}`;
    }
    this.linePath.setAttribute('d', dStr);

    // 2. Area path
    const areaStr = `${dStr} L ${points[points.length - 1].x} ${midY} L ${points[0].x} ${midY} Z`;
    this.areaPath.setAttribute('d', areaStr);

    // 3. Dots for blunders and key moments
    this.dotsGroup.innerHTML = '';
    points.forEach(p => {
      if (p.d.severity === 'blunder' || p.d.severity === 'mistake') {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);
        circle.setAttribute('r', p.d.severity === 'blunder' ? '5.5' : '4');
        circle.setAttribute('fill', p.d.severity === 'blunder' ? '#EF4444' : '#F59E0B');
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '1.5');
        circle.style.cursor = 'pointer';

        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `第 ${p.d.moveNumber} 步 (${p.d.turn === 'w' ? '白' : '黑'}方 ${p.d.san}) · ${p.d.severity.toUpperCase()}`;
        circle.appendChild(title);

        this.dotsGroup.appendChild(circle);
      }
    });

    if (this.currentPly) {
      this.setCursor(this.currentPly);
    }
  }
}
