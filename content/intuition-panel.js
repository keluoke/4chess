/**
 * Maia-3 Human Intuition Floating Panel (Android Material Design 3 Edition)
 * Designed according to Official Android & Google Material Design Guidelines:
 * 1. M3 Surface Tonal Elevation & 24px Rounded Container
 * 2. Header with Close Button (✕) and Minimize Button (−)
 * 3. Android M3 Floating Action Button (FAB) for Closed State (Restore on 1-Click)
 * 4. M3 Segmented Buttons (Elo Rating Selector: 1100, 1500, 1900, 2200)
 * 5. M3 Filter Chips (Heatmap & Arrow Visual Toggles)
 * 6. M3 Linear Progress & Dual-Engine Status Card
 * 7. Candidate Moves List & Human Intuition Insight Card
 */

export class IntuitionPanel {
  constructor({ onEloChange, onToggleChange, onMoveHover, onModelLoaded, onCdnSave }) {
    this.onEloChange = onEloChange;
    this.onToggleChange = onToggleChange;
    this.onMoveHover = onMoveHover;
    this.onModelLoaded = onModelLoaded;
    this.onCdnSave = onCdnSave;

    this.container = null;
    this.fab = null;
    this.isMinimized = false;
    this.isClosed = localStorage.getItem('maia3_panel_closed') === 'true';
    this.currentElo = 1500;
    this.currentData = null;
    this.currentTurn = 'w';
    this.latency = 0;

    this.showHeatmap = true;
    this.showArrows = true;
    this.opacity = 0.55;

    this.init();
  }

  init() {
    // 1. Remove any legacy instances
    const oldPanel = document.getElementById('maia3-intuition-panel');
    if (oldPanel) oldPanel.remove();
    const oldFab = document.getElementById('maia3-fab');
    if (oldFab) oldFab.remove();

    // 2. Create M3 Panel Container
    this.container = document.createElement('div');
    this.container.id = 'maia3-intuition-panel';
    this.container.className = 'maia-panel-root';

    // 3. Create M3 Floating Action Button (FAB)
    this.fab = document.createElement('div');
    this.fab.id = 'maia3-fab';
    this.fab.className = 'maia-m3-fab';
    this.fab.setAttribute('role', 'button');
    this.fab.setAttribute('tabindex', '0');
    this.fab.title = '打开 Maia 3 人类直觉面板 (点击恢复)';
    this.fab.innerHTML = `
      <span class="maia-fab-icon">🧠</span>
      <span class="maia-fab-label">Maia 3</span>
      <span id="maia-fab-elo" class="maia-fab-badge">${this.currentElo}</span>
    `;

    // 4. Restore Panel Position
    const savedPos = localStorage.getItem('maia3_panel_pos');
    if (savedPos) {
      try {
        const { left, top } = JSON.parse(savedPos);
        if (typeof left === 'number' && typeof top === 'number' &&
            left >= 0 && left < window.innerWidth - 100 &&
            top >= 0 && top < window.innerHeight - 50) {
          this.container.style.left = `${left}px`;
          this.container.style.top = `${top}px`;
          this.container.style.right = 'auto';
        }
      } catch (e) {}
    }

    // 5. Restore FAB Position
    const savedFabPos = localStorage.getItem('maia3_fab_pos');
    if (savedFabPos) {
      try {
        const { left, top } = JSON.parse(savedFabPos);
        if (typeof left === 'number' && typeof top === 'number') {
          this.fab.style.left = `${left}px`;
          this.fab.style.top = `${top}px`;
          this.fab.style.right = 'auto';
        }
      } catch (e) {}
    }

    // 6. Set Visibility State (Closed vs Open)
    if (this.isClosed) {
      this.container.style.display = 'none';
      this.fab.style.display = 'flex';
    } else {
      this.container.style.display = 'block';
      this.fab.style.display = 'none';
    }

    this.renderSkeleton();

    // 7. Mount both to DOM
    const mount = () => {
      const parent = document.body || document.documentElement;
      if (parent) {
        if (!parent.contains(this.container)) parent.appendChild(this.container);
        if (!parent.contains(this.fab)) parent.appendChild(this.fab);
      }
    };
    mount();
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', mount);
    }

    this.setupDraggable();
    this.setupFabEvents();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <!-- Android M3 Top App Bar (Header) -->
      <div class="maia-header" id="maia-drag-handle">
        <div class="maia-title-box">
          <div class="maia-m3-avatar">🧠</div>
          <div class="maia-title-text-group">
            <span class="maia-title">Maia 3</span>
            <span class="maia-subtitle">人类直觉预测器 · Android M3</span>
          </div>
        </div>
        <div class="maia-header-actions">
          <span id="maia-turn-pill" class="maia-turn-tag turn-white">⚪ 白方行棋</span>
          <button id="maia-btn-min" class="maia-m3-icon-btn" title="折叠 / 展开" aria-label="最小化">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
          </button>
          <button id="maia-btn-close" class="maia-m3-icon-btn maia-btn-close" title="关闭面板 (收起为浮动小球)" aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>

      <!-- Android M3 Sheet Body -->
      <div class="maia-body" id="maia-panel-body">
        <!-- Dual Engine Status Card (M3 Elevated Card) -->
        <div class="maia-dual-status-box">
          <div class="maia-status-row">
            <div class="maia-status-item">
              <span class="maia-status-dot status-loading" id="dot-maia"></span>
              <span class="maia-status-title">🧠 Maia 3 直觉:</span>
              <span id="label-maia-status" class="maia-status-val">正在连接...</span>
            </div>
            <div class="maia-status-item">
              <span class="maia-status-dot status-loading" id="dot-sf"></span>
              <span class="maia-status-title">🐟 Stockfish 引擎:</span>
              <span id="label-sf-status" class="maia-status-val">启动中...</span>
            </div>
          </div>

          <!-- Cloudflare CDN Progress Card (M3 Linear Progress) -->
          <div id="maia-cdn-progress-card" class="cdn-progress-card" style="display: none;">
            <div class="cdn-progress-header">
              <span id="cdn-status-label" class="cdn-label">⚡ Cloudflare CDN 传输中...</span>
              <span id="cdn-speed-label" class="cdn-speed">-- MB/s</span>
            </div>
            <div class="cdn-progress-track">
              <div id="cdn-bar-fill" class="cdn-bar-fill" style="width: 0%;"></div>
            </div>
            <div class="cdn-progress-meta">
              <span id="cdn-bytes-label">0 MB / 28.0 MB</span>
              <span>💡 一次下载永久缓存，后续 0ms 秒开</span>
            </div>
          </div>

          <!-- CDN Custom Config Drawer Toggle -->
          <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 2px;">
            <button id="btn-toggle-cdn-drawer" style="background: none; border: none; color: #94a3b8; font-size: 10px; cursor: pointer; padding: 2px 0;">⚙️ CDN / 模型配置</button>
          </div>

          <div id="cdn-config-drawer" style="display: none; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.1);">
            <div style="font-size: 10.5px; color: #cbd5e1; margin-bottom: 5px; font-weight: 600;">快速预设模型:</div>
            <div style="display: flex; gap: 4px; margin-bottom: 6px;">
              <button type="button" class="cdn-preset-btn" data-url="https://weights.4chess.cc/maia3_model.bin" style="flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; border-radius: 8px; font-size: 9.5px; padding: 4px 0; cursor: pointer;">5M (28M)</button>
              <button type="button" class="cdn-preset-btn" data-url="https://weights.4chess.cc/maia3_23m.bin" style="flex: 1; background: rgba(168,199,250,0.18); border: 1px solid #7cacf8; color: #d3e3fd; border-radius: 8px; font-size: 9.5px; padding: 4px 0; cursor: pointer; font-weight: 700;">23M (104M)</button>
              <button type="button" class="cdn-preset-btn" data-url="https://weights.4chess.cc/maia3_79m_fp16.bin" style="flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; border-radius: 8px; font-size: 9.5px; padding: 4px 0; cursor: pointer;">79M (159M)</button>
            </div>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="cdn-url-input" placeholder="https://weights.4chess.cc/maia3_23m.bin" value="https://weights.4chess.cc/maia3_23m.bin" style="flex: 1; background: #141218; border: 1px solid rgba(255,255,255,0.15); color: #f8fafc; padding: 5px 8px; border-radius: 8px; font-size: 10px; font-family: monospace;">
              <button id="cdn-save-btn" style="background: #0842a0; color: #d3e3fd; border: 1px solid rgba(168,199,250,0.3); border-radius: 8px; padding: 4px 10px; font-size: 10.5px; cursor: pointer; font-weight: 700;">保存</button>
            </div>
            <div style="font-size: 9.5px; color: #94a3b8; margin-top: 4px;">各模型独立本地缓存，首次下载后离线 0ms 秒开</div>
          </div>
        </div>

        <!-- Android M3 Segmented Buttons (Elo Rating Selector) -->
        <div class="maia-section">
          <div class="maia-section-header">
            <span class="maia-label">目标棋手等级分 (Elo)</span>
            <span id="maia-elo-val" class="maia-elo-pill">1500</span>
          </div>
          <div class="maia-elo-segmented">
            <button class="maia-segmented-btn" data-elo="1100">
              <span class="seg-check"></span><span class="seg-label">1100 (初阶)</span>
            </button>
            <button class="maia-segmented-btn active" data-elo="1500">
              <span class="seg-check">✓</span><span class="seg-label">1500 (中阶)</span>
            </button>
            <button class="maia-segmented-btn" data-elo="1900">
              <span class="seg-check"></span><span class="seg-label">1900 (进阶)</span>
            </button>
            <button class="maia-segmented-btn" data-elo="2200">
              <span class="seg-check"></span><span class="seg-label">2200 (大师)</span>
            </button>
          </div>
          <input type="range" id="maia-elo-slider" min="600" max="2600" step="50" value="1500" class="maia-slider" />
        </div>

        <!-- Android M3 Filter Chips (Visual Toggles) -->
        <div class="maia-toggles-row">
          <label class="maia-m3-chip" id="chip-heatmap">
            <input type="checkbox" id="maia-chk-heatmap" checked />
            <span>🔥 意图热力图</span>
          </label>
          <label class="maia-m3-chip" id="chip-arrows">
            <input type="checkbox" id="maia-chk-arrows" checked />
            <span>🏹 直觉箭头</span>
          </label>
        </div>

        <!-- Candidate Moves List -->
        <div class="maia-section">
          <div class="maia-section-header">
            <span id="maia-moves-header-text" class="maia-label">候选着法预测</span>
            <span id="maia-inference-time" class="maia-meta-text">Inference: -- ms</span>
          </div>
          <div id="maia-moves-container" class="maia-moves-list">
            <div class="maia-placeholder">⏳ 正在同步棋盘状态与行棋方...</div>
          </div>
        </div>

        <!-- Human Intuition Insight Banner (M3 Assist Banner) -->
        <div id="maia-insight-card" class="maia-insight-box">
          <div id="maia-insight-badge" class="maia-insight-tag">💡 直觉研判</div>
          <div id="maia-insight-text" class="maia-insight-content">
            观察棋局中，Maia 3 正在实时分析人类直觉倾向...
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  setupFabEvents() {
    if (!this.fab) return;

    let isDraggingFab = false;
    let hasMoved = false;
    let startX, startY, origLeft, origTop;

    this.fab.addEventListener('mousedown', (e) => {
      isDraggingFab = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.fab.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

      const onMouseMove = (moveEvent) => {
        if (!isDraggingFab) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
        }

        const newLeft = Math.max(10, Math.min(window.innerWidth - rect.width - 10, origLeft + dx));
        const newTop = Math.max(10, Math.min(window.innerHeight - rect.height - 10, origTop + dy));

        this.fab.style.left = `${newLeft}px`;
        this.fab.style.top = `${newTop}px`;
        this.fab.style.right = 'auto';
      };

      const onMouseUp = () => {
        if (!isDraggingFab) return;
        isDraggingFab = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (hasMoved) {
          const rect = this.fab.getBoundingClientRect();
          localStorage.setItem('maia3_fab_pos', JSON.stringify({ left: rect.left, top: rect.top }));
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Restore panel on click (if not dragged)
    this.fab.addEventListener('click', (e) => {
      if (!hasMoved) {
        this.open();
      }
    });

    this.fab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this.open();
      }
    });
  }

  close() {
    this.isClosed = true;
    this.container.style.display = 'none';
    if (this.fab) {
      this.fab.style.display = 'flex';
      const eloBadge = this.fab.querySelector('#maia-fab-elo');
      if (eloBadge) eloBadge.textContent = this.currentElo;
    }
    localStorage.setItem('maia3_panel_closed', 'true');
  }

  open() {
    this.isClosed = false;
    this.container.style.display = 'block';
    if (this.fab) {
      this.fab.style.display = 'none';
    }
    localStorage.setItem('maia3_panel_closed', 'false');
  }

  isPanelClosed() {
    return this.isClosed;
  }

  bindEvents() {
    // 1. Close Button (✕)
    const closeBtn = this.container.querySelector('#maia-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // 2. Minimize / Expand Button (− / +)
    const minBtn = this.container.querySelector('#maia-btn-min');
    const body = this.container.querySelector('#maia-panel-body');
    if (minBtn && body) {
      minBtn.addEventListener('click', () => {
        this.isMinimized = !this.isMinimized;
        body.style.display = this.isMinimized ? 'none' : 'block';
        minBtn.innerHTML = this.isMinimized ?
          `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>` :
          `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>`;
      });
    }

    // 3. Elo Segmented Buttons & Slider
    const segBtns = this.container.querySelectorAll('.maia-segmented-btn');
    const eloSlider = this.container.querySelector('#maia-elo-slider');
    const eloVal = this.container.querySelector('#maia-elo-val');

    const updateActiveEloButton = (elo) => {
      segBtns.forEach(btn => {
        const isMatch = parseInt(btn.dataset.elo, 10) === elo;
        btn.classList.toggle('active', isMatch);
        const check = btn.querySelector('.seg-check');
        if (check) check.textContent = isMatch ? '✓' : '';
      });
    };

    segBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const elo = parseInt(btn.dataset.elo, 10);
        this.currentElo = elo;
        updateActiveEloButton(elo);
        if (eloSlider) eloSlider.value = elo;
        if (eloVal) eloVal.textContent = elo;
        if (this.fab) {
          const eloBadge = this.fab.querySelector('#maia-fab-elo');
          if (eloBadge) eloBadge.textContent = elo;
        }
        if (this.onEloChange) this.onEloChange(elo);
      });
    });

    if (eloSlider) {
      eloSlider.addEventListener('input', (e) => {
        const elo = parseInt(e.target.value, 10);
        this.currentElo = elo;
        if (eloVal) eloVal.textContent = elo;
        updateActiveEloButton(elo);
        if (this.fab) {
          const eloBadge = this.fab.querySelector('#maia-fab-elo');
          if (eloBadge) eloBadge.textContent = elo;
        }
        if (this.onEloChange) this.onEloChange(elo);
      });
    }

    // 4. M3 Filter Chips (Toggles)
    const chkHeatmap = this.container.querySelector('#maia-chk-heatmap');
    const chkArrows = this.container.querySelector('#maia-chk-arrows');

    const updateToggles = () => {
      this.showHeatmap = chkHeatmap ? chkHeatmap.checked : true;
      this.showArrows = chkArrows ? chkArrows.checked : true;
      if (this.onToggleChange) {
        this.onToggleChange({
          showHeatmap: this.showHeatmap,
          showArrows: this.showArrows,
          opacity: this.opacity
        });
      }
    };

    if (chkHeatmap) chkHeatmap.addEventListener('change', updateToggles);
    if (chkArrows) chkArrows.addEventListener('change', updateToggles);

    // 5. CDN Drawer & Config
    const toggleCdnBtn = this.container.querySelector('#btn-toggle-cdn-drawer');
    const cdnDrawer = this.container.querySelector('#cdn-config-drawer');
    const cdnInput = this.container.querySelector('#cdn-url-input');
    const cdnSaveBtn = this.container.querySelector('#cdn-save-btn');

    if (toggleCdnBtn && cdnDrawer) {
      toggleCdnBtn.addEventListener('click', () => {
        const isHidden = cdnDrawer.style.display === 'none';
        cdnDrawer.style.display = isHidden ? 'block' : 'none';
        toggleCdnBtn.textContent = isHidden ? '▲ 收起设置' : '⚙️ CDN / 模型配置';
      });
    }

    // Load saved CDN URL
    if (typeof chrome !== 'undefined' && chrome.storage?.local && cdnInput) {
      chrome.storage.local.get(['cloudflareCdnUrl'], (res) => {
        cdnInput.value = res?.cloudflareCdnUrl || 'https://weights.4chess.cc/maia3_23m.bin';
      });
    }

    // Preset buttons
    this.container.querySelectorAll('.cdn-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (cdnInput) {
          cdnInput.value = btn.getAttribute('data-url');
          if (cdnSaveBtn) cdnSaveBtn.click();
        }
      });
    });

    if (cdnSaveBtn && cdnInput) {
      cdnSaveBtn.addEventListener('click', async () => {
        const val = cdnInput.value.trim();
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ cloudflareCdnUrl: val });
        }
        const originalText = cdnSaveBtn.textContent;
        cdnSaveBtn.textContent = '已保存 ✔';
        cdnSaveBtn.style.background = '#10b981';
        setTimeout(() => {
          cdnSaveBtn.textContent = originalText;
          cdnSaveBtn.style.background = '#0842a0';
        }, 1500);

        if (this.onCdnSave) {
          this.onCdnSave(val);
        }
      });
    }
  }

  updateEngineStatus(status) {
    if (!this.container || !status) return;

    // 1. Update Maia-3 Status Dot & Text
    const dotMaia = this.container.querySelector('#dot-maia');
    const labelMaia = this.container.querySelector('#label-maia-status');
    const cdnCard = this.container.querySelector('#maia-cdn-progress-card');
    const cdnStatusLabel = this.container.querySelector('#cdn-status-label');
    const cdnSpeedLabel = this.container.querySelector('#cdn-speed-label');
    const cdnBarFill = this.container.querySelector('#cdn-bar-fill');
    const cdnBytesLabel = this.container.querySelector('#cdn-bytes-label');

    if (status.maia) {
      const { state, percent, speed, loadedMB, totalMB, source } = status.maia;
      if (state === 'ready') {
        if (dotMaia) dotMaia.className = 'maia-status-dot status-ready';
        if (labelMaia) labelMaia.textContent = `就绪 (${source || '纯本地'})`;
        if (cdnCard) cdnCard.style.display = 'none';
      } else if (state === 'downloading') {
        if (dotMaia) dotMaia.className = 'maia-status-dot status-loading';
        if (labelMaia) labelMaia.textContent = `下载中 ${percent}%`;
        if (cdnCard) {
          cdnCard.style.display = 'block';
          if (cdnStatusLabel) cdnStatusLabel.textContent = `⚡ ${source || 'Cloudflare CDN'} 传输中 (${percent}%)`;
          if (cdnSpeedLabel) cdnSpeedLabel.textContent = speed ? `${speed} MB/s` : '-- MB/s';
          if (cdnBarFill) cdnBarFill.style.width = `${percent}%`;
          if (cdnBytesLabel) cdnBytesLabel.textContent = `${loadedMB} MB / ${totalMB} MB`;
        }
      } else if (state === 'error') {
        if (dotMaia) dotMaia.className = 'maia-status-dot status-error';
        if (labelMaia) labelMaia.textContent = '加载失败 (点击下方配置)';
        if (cdnCard) cdnCard.style.display = 'none';
      } else {
        if (dotMaia) dotMaia.className = 'maia-status-dot status-loading';
        if (labelMaia) labelMaia.textContent = source || '正在连接...';
        if (cdnCard) cdnCard.style.display = 'none';
      }
    }

    // 2. Update Stockfish Status Dot & Text
    const dotSf = this.container.querySelector('#dot-sf');
    const labelSf = this.container.querySelector('#label-sf-status');
    if (status.stockfish) {
      const { state } = status.stockfish;
      if (state === 'ready') {
        if (dotSf) dotSf.className = 'maia-status-dot status-ready';
        if (labelSf) labelSf.textContent = '就绪 (WASM 毫秒级)';
      } else if (state === 'error') {
        if (dotSf) dotSf.className = 'maia-status-dot status-error';
        if (labelSf) labelSf.textContent = '启动异常';
      } else {
        if (dotSf) dotSf.className = 'maia-status-dot status-loading';
        if (labelSf) labelSf.textContent = '启动中...';
      }
    }
  }

  setupDraggable() {
    const handle = this.container.querySelector('#maia-drag-handle');
    if (!handle) return;
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL' || e.target.tagName === 'INPUT' || e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.container.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

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
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const rect = this.container.getBoundingClientRect();
        localStorage.setItem('maia3_panel_pos', JSON.stringify({ left: rect.left, top: rect.top }));
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  update(predictionData, latencyMs = 0) {
    this.currentData = predictionData;
    this.latency = latencyMs;

    if (!predictionData) return;

    if (this.fab) {
      const eloBadge = this.fab.querySelector('#maia-fab-elo');
      if (eloBadge) eloBadge.textContent = this.currentElo;
    }

    if (predictionData.status) {
      this.updateEngineStatus(predictionData.status);
    }

    const turnPill = this.container.querySelector('#maia-turn-pill');
    const isWhite = predictionData.turn === 'w';
    if (turnPill) {
      turnPill.textContent = isWhite ? '⚪ 白方行棋' : '⚫ 黑方行棋';
      turnPill.className = `maia-turn-tag ${isWhite ? 'turn-white' : 'turn-black'}`;
    }

    const movesHeader = this.container.querySelector('#maia-moves-header-text');
    const movesContainer = this.container.querySelector('#maia-moves-container');
    const insightBox = this.container.querySelector('#maia-insight-card');
    const insightBadge = this.container.querySelector('#maia-insight-badge');
    const insightText = this.container.querySelector('#maia-insight-text');
    const timeEl = this.container.querySelector('#maia-inference-time');

    // 1. If Maia-3 engine is NOT ready yet: check if Stockfish has preliminary result
    if (!predictionData.isAvailable) {
      const sf = predictionData.stockfish;
      if (sf && sf.bestMove) {
        if (timeEl) timeEl.textContent = `Stockfish: ${latencyMs.toFixed(0)} ms · Maia 载入中`;
        if (movesHeader) movesHeader.textContent = isWhite ? '白方最佳着法 (Stockfish 17)' : '黑方最佳着法 (Stockfish 17)';
        
        if (movesContainer) {
          movesContainer.innerHTML = `
            <div class="maia-move-row top-pick" style="border-left: 3px solid #10b981;">
              <div class="maia-move-main">
                <span class="maia-move-rank">#1</span>
                <span class="maia-move-san" style="color: #10b981;">${sf.bestMove.san} <span style="font-size: 10px; color: #10b981;">(🐟 Stockfish 引擎最优)</span></span>
                <span class="maia-move-prob" style="color: #10b981; font-weight: 700;">${sf.score}</span>
              </div>
              <div class="maia-progress-bar">
                <div class="maia-progress-fill" style="width: 100%; background-color: #10b981;"></div>
              </div>
            </div>
            <div style="margin-top: 10px; padding: 10px 12px; background: rgba(168, 199, 250, 0.08); border: 1px dashed rgba(168, 199, 250, 0.25); border-radius: 12px; text-align: center;">
              <div style="font-size: 11px; color: #a8c7fa; font-weight: 700;">🧠 Maia-3 人类直觉候选着法传输中...</div>
              <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Stockfish 17 现已独立完成运算，Maia-3 传输完毕后将呈现人机直觉热力图对比</div>
            </div>
          `;
        }

        if (insightBox && insightBadge && insightText) {
          insightBox.style.display = 'block';
          insightBadge.textContent = '🐟 Stockfish 实时建议';
          insightBadge.className = 'maia-insight-tag tag-consensus';
          insightBox.className = 'maia-insight-box alert-consensus';
          insightText.innerHTML = `Stockfish 17 建议走 <strong>${sf.bestMove.san}</strong> (评估评分: ${sf.score})。<br><span style="color: #94a3b8; font-size: 10.5px;">Maia-3 权重正从 Cloudflare CDN 传输中，就绪后将立即呈现人类直觉热力图。</span>`;
        }
      } else {
        if (timeEl) timeEl.textContent = '载入中...';
        if (movesContainer) {
          const maiaState = predictionData.status?.maia;
          const isError = maiaState?.state === 'error';
          movesContainer.innerHTML = `
            <div style="padding: 16px 12px; text-align: center; background: rgba(168, 199, 250, 0.08); border: 1px dashed rgba(168, 199, 250, 0.3); border-radius: 14px;">
              <div style="font-size: 24px; margin-bottom: 6px;">${isError ? '⚠️' : '🧠'}</div>
              <div style="font-weight: 700; color: #a8c7fa; margin-bottom: 6px;">
                ${isError ? 'Maia-3 模型未就绪' : '正在载入 Maia-3 神经网络'}
              </div>
              <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.5; margin-bottom: 10px;">
                ${isError ? '无法从默认源载入模型，请点击上方“⚙️ CDN / 模型配置”切换您的 R2 节点。' : (maiaState?.status || '正在从 Cloudflare CDN 传输模型至本地...')}
              </div>
              <button id="maia-retry-btn" style="background: #0842a0; color: #d3e3fd; border: 1px solid rgba(168,199,250,0.3); padding: 5px 14px; border-radius: 9999px; cursor: pointer; font-size: 11.5px; font-weight: 700;">🔄 重新初始化引擎</button>
            </div>
          `;
          const retryBtn = movesContainer.querySelector('#maia-retry-btn');
          if (retryBtn) {
            retryBtn.addEventListener('click', () => {
              if (this.onModelLoaded) this.onModelLoaded();
            });
          }
        }
        if (insightBox) insightBox.style.display = 'none';
      }
      return;
    }

    // 2. Maia-3 IS READY: Full Comparative Display
    if (insightBox) insightBox.style.display = 'block';

    if (movesHeader) {
      movesHeader.textContent = isWhite ? '白方候选着法 (向上进攻)' : '黑方候选着法 (向下进攻)';
    }

    if (timeEl) {
      timeEl.textContent = `${latencyMs.toFixed(0)} ms (${predictionData.backend})`;
    }

    // Human vs Stockfish Comparative Insight Banner
    if (predictionData.comparison) {
      const { badge, summary, agreed } = predictionData.comparison;
      insightBadge.textContent = badge;
      insightBadge.className = `maia-insight-tag ${agreed ? 'tag-consensus' : 'tag-trap'}`;
      insightBox.className = `maia-insight-box ${agreed ? 'alert-consensus' : 'alert-trap'}`;
      
      let sfHtml = '';
      if (predictionData.stockfish && predictionData.stockfish.bestMove) {
        const sf = predictionData.stockfish;
        sfHtml = `
          <div class="maia-sf-row">
            <span>🐟 Stockfish 17 最佳: <strong>${sf.bestMove.san}</strong></span>
            <span class="maia-sf-eval">${sf.score}</span>
          </div>
        `;
      }
      insightText.innerHTML = `${summary}${sfHtml}`;
    } else if (predictionData.analysis) {
      insightBadge.textContent = '💡 直觉研判';
      insightBadge.className = 'maia-insight-tag tag-neutral';
      insightBox.className = 'maia-insight-box alert-neutral';
      insightText.textContent = predictionData.analysis.commentary;
    }

    // Maia Human Candidates Move List
    if (!predictionData.moves || predictionData.moves.length === 0) {
      movesContainer.innerHTML = `<div class="maia-placeholder">局面绝杀或无合法着法</div>`;
      return;
    }

    const topMoves = predictionData.moves.slice(0, 4);
    movesContainer.innerHTML = '';

    topMoves.forEach((move, idx) => {
      const row = document.createElement('div');
      row.className = `maia-move-row ${idx === 0 ? 'top-pick' : ''}`;
      row.dataset.uci = move.uci;

      const isSfMatch = predictionData.stockfish?.bestMove?.uci === move.uci;
      const colors = ['#f5c042', '#38bdf8', '#a855f7', '#94a3b8'];
      const barColor = isSfMatch ? '#10b981' : (colors[idx] || '#94a3b8');

      row.innerHTML = `
        <div class="maia-move-main">
          <span class="maia-move-rank">#${idx + 1}</span>
          <span class="maia-move-san">${move.san} ${isSfMatch ? '<span style="font-size: 10px; color: #10b981; font-weight: 700;">(🐟 最佳)</span>' : ''}</span>
          <span class="maia-move-prob">${move.prob}%</span>
        </div>
        <div class="maia-progress-bar">
          <div class="maia-progress-fill" style="width: ${move.prob}%; background-color: ${barColor};"></div>
        </div>
      `;

      row.addEventListener('mouseenter', () => {
        if (this.onMoveHover) this.onMoveHover(move.uci);
      });
      row.addEventListener('mouseleave', () => {
        if (this.onMoveHover) this.onMoveHover(null);
      });

      movesContainer.appendChild(row);
    });
  }
}
