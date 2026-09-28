/**
 * Maia-3 Human Intuition Floating & Dockable Panel
 * Sleek glassmorphic UI displaying:
 * - Elo level selector (1100, 1500, 1900, 2200, or continuous slider)
 * - Hardware acceleration badge (WebGPU / WASM)
 * - Top candidate human moves with animated probability bars
 * - Human vs Engine divergence & Blunder trap alerts
 * - Overlay controls (Heatmap, Arrows, Opacity)
 */

export class IntuitionPanel {
  constructor({ onEloChange, onToggleChange, onMoveHover }) {
    this.onEloChange = onEloChange;
    this.onToggleChange = onToggleChange;
    this.onMoveHover = onMoveHover;

    this.container = null;
    this.isMinimized = false;
    this.currentElo = 1500;
    this.currentData = null;
    this.latency = 0;

    this.showHeatmap = true;
    this.showArrows = true;
    this.opacity = 0.55;

    this.init();
  }

  init() {
    // Remove if already exists
    const old = document.getElementById('maia3-intuition-panel');
    if (old) old.remove();

    this.container = document.createElement('div');
    this.container.id = 'maia3-intuition-panel';
    this.container.className = 'maia-panel-root';

    // Restore saved position
    const savedPos = localStorage.getItem('maia3_panel_pos');
    if (savedPos) {
      try {
        const { left, top } = JSON.parse(savedPos);
        this.container.style.left = `${left}px`;
        this.container.style.top = `${top}px`;
        this.container.style.right = 'auto';
      } catch (e) {}
    }

    this.renderSkeleton();
    document.body.appendChild(this.container);
    this.setupDraggable();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <!-- Header -->
      <div class="maia-header" id="maia-drag-handle">
        <div class="maia-title-box">
          <div class="maia-icon-glow">🧠</div>
          <span class="maia-title">Maia 3 · 人类直觉预测器</span>
        </div>
        <div class="maia-header-actions">
          <span id="maia-backend-badge" class="maia-badge badge-gpu">⚡ WebGPU</span>
          <button id="maia-btn-min" class="maia-btn-icon" title="最小化/展开">−</button>
        </div>
      </div>

      <!-- Main Body -->
      <div class="maia-body" id="maia-panel-body">
        <!-- Elo Selector -->
        <div class="maia-section">
          <div class="maia-section-header">
            <span class="maia-label">目标棋手等级分 (Elo)</span>
            <span id="maia-elo-val" class="maia-elo-pill">1500</span>
          </div>
          <div class="maia-elo-presets">
            <button class="maia-elo-btn" data-elo="1100">1100 (初阶)</button>
            <button class="maia-elo-btn active" data-elo="1500">1500 (中阶)</button>
            <button class="maia-elo-btn" data-elo="1900">1900 (进阶)</button>
            <button class="maia-elo-btn" data-elo="2200">2200 (大师)</button>
          </div>
          <input type="range" id="maia-elo-slider" min="600" max="2600" step="50" value="1500" class="maia-slider" />
        </div>

        <!-- Visual Toggles -->
        <div class="maia-toggles-row">
          <label class="maia-toggle-chip">
            <input type="checkbox" id="maia-chk-heatmap" checked />
            <span>🔥 意图热力图</span>
          </label>
          <label class="maia-toggle-chip">
            <input type="checkbox" id="maia-chk-arrows" checked />
            <span>🏹 直觉箭头</span>
          </label>
        </div>

        <!-- Prediction List -->
        <div class="maia-section">
          <div class="maia-section-header">
            <span class="maia-label">人类最可能候选着法</span>
            <span id="maia-inference-time" class="maia-meta-text">Inference: -- ms</span>
          </div>
          <div id="maia-moves-container" class="maia-moves-list">
            <div class="maia-placeholder">等待棋盘输入...</div>
          </div>
        </div>

        <!-- Human Intuition & Discrepancy Insight -->
        <div id="maia-insight-card" class="maia-insight-box">
          <div id="maia-insight-badge" class="maia-insight-tag">💡 直觉分析</div>
          <div id="maia-insight-text" class="maia-insight-content">
            观察棋局中，Maia 3 正在实时分析人类直觉倾向...
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Minimize / Expand
    const minBtn = this.container.querySelector('#maia-btn-min');
    const body = this.container.querySelector('#maia-panel-body');
    minBtn.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      body.style.display = this.isMinimized ? 'none' : 'block';
      minBtn.textContent = this.isMinimized ? '+' : '−';
    });

    // Elo Presets
    const eloBtns = this.container.querySelectorAll('.maia-elo-btn');
    const eloSlider = this.container.querySelector('#maia-elo-slider');
    const eloVal = this.container.querySelector('#maia-elo-val');

    eloBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        eloBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const elo = parseInt(btn.dataset.elo, 10);
        this.currentElo = elo;
        eloSlider.value = elo;
        eloVal.textContent = elo;
        if (this.onEloChange) this.onEloChange(elo);
      });
    });

    // Elo Slider
    eloSlider.addEventListener('input', (e) => {
      const elo = parseInt(e.target.value, 10);
      this.currentElo = elo;
      eloVal.textContent = elo;
      eloBtns.forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.elo, 10) === elo);
      });
      if (this.onEloChange) this.onEloChange(elo);
    });

    // Toggles
    const chkHeatmap = this.container.querySelector('#maia-chk-heatmap');
    const chkArrows = this.container.querySelector('#maia-chk-arrows');

    const updateToggles = () => {
      this.showHeatmap = chkHeatmap.checked;
      this.showArrows = chkArrows.checked;
      if (this.onToggleChange) {
        this.onToggleChange({
          showHeatmap: this.showHeatmap,
          showArrows: this.showArrows,
          opacity: this.opacity
        });
      }
    };

    chkHeatmap.addEventListener('change', updateToggles);
    chkArrows.addEventListener('change', updateToggles);
  }

  setupDraggable() {
    const handle = this.container.querySelector('#maia-drag-handle');
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.container.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

      this.container.style.transition = 'none';

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        const newLeft = Math.max(10, Math.min(window.innerWidth - rect.width - 10, origLeft + dx));
        const newTop = Math.max(10, Math.min(window.innerHeight - rect.height - 10, origTop + dy));

        this.container.style.left = `${newLeft}px`;
        this.container.style.top = `${newTop}px`;
        this.container.style.right = 'auto';
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        this.container.style.transition = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        // Save position
        const rect = this.container.getBoundingClientRect();
        localStorage.setItem('maia3_panel_pos', JSON.stringify({ left: rect.left, top: rect.top }));
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  setBackend(backend) {
    const badge = this.container.querySelector('#maia-backend-badge');
    if (!badge) return;

    if (backend === 'webgpu') {
      badge.textContent = '⚡ WebGPU';
      badge.className = 'maia-badge badge-gpu';
    } else {
      badge.textContent = '⚙️ WASM';
      badge.className = 'maia-badge badge-wasm';
    }
  }

  update(predictionData, latencyMs = 0) {
    this.currentData = predictionData;
    this.latency = latencyMs;

    this.setBackend(predictionData.backend);

    // Latency
    const timeEl = this.container.querySelector('#maia-inference-time');
    if (timeEl) {
      timeEl.textContent = `${latencyMs.toFixed(1)} ms (${predictionData.backend.toUpperCase()})`;
    }

    // Move List
    const movesContainer = this.container.querySelector('#maia-moves-container');
    if (!predictionData.moves || predictionData.moves.length === 0) {
      movesContainer.innerHTML = `<div class="maia-placeholder">${predictionData.summary || '无可选合法着法'}</div>`;
      return;
    }

    const topMoves = predictionData.moves.slice(0, 4);
    movesContainer.innerHTML = '';

    topMoves.forEach((move, idx) => {
      const row = document.createElement('div');
      row.className = `maia-move-row ${idx === 0 ? 'top-pick' : ''}`;
      row.dataset.uci = move.uci;

      const colors = ['#f59e0b', '#06b6d4', '#a855f7', '#6b7280'];
      const barColor = colors[idx] || '#6b7280';

      row.innerHTML = `
        <div class="maia-move-main">
          <span class="maia-move-rank">#${idx + 1}</span>
          <span class="maia-move-san">${move.san}</span>
          <span class="maia-move-prob">${move.prob}%</span>
        </div>
        <div class="maia-progress-bar">
          <div class="maia-progress-fill" style="width: ${move.prob}%; background-color: ${barColor};"></div>
        </div>
      `;

      // Hover to highlight arrow
      row.addEventListener('mouseenter', () => {
        if (this.onMoveHover) this.onMoveHover(move.uci);
      });
      row.addEventListener('mouseleave', () => {
        if (this.onMoveHover) this.onMoveHover(null);
      });

      movesContainer.appendChild(row);
    });

    // Insight card
    const insightBox = this.container.querySelector('#maia-insight-card');
    const insightBadge = this.container.querySelector('#maia-insight-badge');
    const insightText = this.container.querySelector('#maia-insight-text');

    if (predictionData.analysis) {
      const { badgeType, commentary } = predictionData.analysis;
      insightText.textContent = commentary;

      if (badgeType === 'blunder-trap') {
        insightBox.className = 'maia-insight-box alert-trap';
        insightBadge.textContent = '⚠️ 战术陷阱盲区';
        insightBadge.className = 'maia-insight-tag tag-trap';
      } else if (badgeType === 'consensus') {
        insightBox.className = 'maia-insight-box alert-consensus';
        insightBadge.textContent = '🎯 极高人类共识';
        insightBadge.className = 'maia-insight-tag tag-consensus';
      } else if (badgeType === 'tactical') {
        insightBox.className = 'maia-insight-box alert-tactical';
        insightBadge.textContent = '⚖️ 直觉剧烈分歧';
        insightBadge.className = 'maia-insight-tag tag-tactical';
      } else {
        insightBox.className = 'maia-insight-box alert-neutral';
        insightBadge.textContent = '💡 人类直觉着法';
        insightBadge.className = 'maia-insight-tag tag-neutral';
      }
    }
  }
}
