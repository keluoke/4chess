/**
 * Maia-3 Human Intuition Floating Panel (WeChat Mini-Program / WeUI Edition)
 * Designed according to Official WeChat Mini-Program & WeUI Design Guidelines:
 * 1. Iconic Top-Right Capsule (微信小程序双键胶囊: ••• 和 ⊙)
 * 2. Classic WeChat Floating Ball (微信浮窗 / 边缘停靠悬浮球)
 * 3. WeUI Cell Groups (weui-cells 规范布局)
 * 4. Zero-Overflow Segmented Tabs & Native WeChat Switches (weui-switch)
 * 5. High Information Density & Zero Lag Experience
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
    const oldFab = document.getElementById('maia-wechat-float');
    if (oldFab) oldFab.remove();

    // 2. Create WeChat Mini-Program Panel Container
    this.container = document.createElement('div');
    this.container.id = 'maia3-intuition-panel';
    this.container.className = 'maia-panel-root';

    // 3. Create Classic WeChat Floating Ball (微信浮窗)
    this.fab = document.createElement('div');
    this.fab.id = 'maia-wechat-float';
    this.fab.className = 'weui-float-ball';
    this.fab.setAttribute('role', 'button');
    this.fab.setAttribute('tabindex', '0');
    this.fab.title = '打开 Maia 3 微信浮窗面板 (点击恢复)';
    this.fab.innerHTML = `
      <span class="weui-float-dot"></span>
      <span class="weui-float-icon">🧠</span>
      <span class="weui-float-title">Maia 3</span>
      <span id="weui-float-elo" class="weui-float-badge">${this.currentElo}</span>
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

    // 5. Restore Floating Ball Position
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
      <!-- WeChat Mini-Program Top Bar & Capsule (顶部导航条与经典小程序胶囊) -->
      <div class="weui-navbar" id="maia-drag-handle">
        <div class="weui-navbar__left">
          <span class="weui-navbar__icon">🧠</span>
          <span class="weui-navbar__title">Maia 3 直觉</span>
          <span id="maia-turn-pill" class="weui-turn-tag turn-white">⚪ 白方</span>
        </div>
        <!-- Iconic WeChat Mini-Program Capsule (小程序双键胶囊) -->
        <div class="weui-capsule">
          <button id="weui-btn-more" class="weui-capsule-btn" title="模型/CDN设置">
            <span class="weui-capsule-dots">•••</span>
          </button>
          <div class="weui-capsule-divider"></div>
          <button id="weui-btn-close" class="weui-capsule-btn" title="收起为微信浮窗">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" fill="none"/>
              <circle cx="12" cy="12" r="3.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- WeChat Mini-Program Page Body -->
      <div class="weui-page__bd" id="maia-panel-body">
        <!-- Dual Engine Status Group -->
        <div class="weui-cells">
          <div class="weui-cell">
            <div class="weui-cell__bd">
              <span class="weui-status-dot status-loading" id="dot-maia"></span>
              <span>Maia 3 直觉</span>
            </div>
            <span id="label-maia-status" class="weui-cell__ft">正在连接...</span>
          </div>
          <div class="weui-cell">
            <div class="weui-cell__bd">
              <span class="weui-status-dot status-loading" id="dot-sf"></span>
              <span>Stockfish 引擎</span>
            </div>
            <span id="label-sf-status" class="weui-cell__ft">启动中...</span>
          </div>
        </div>

        <!-- Cloudflare CDN Progress Card (if downloading) -->
        <div id="maia-cdn-progress-card" class="weui-cells" style="display: none; padding: 10px 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 5px;">
            <span id="cdn-status-label" style="color: var(--weui-BRAND); font-weight: 600;">⚡ CDN 传输中...</span>
            <span id="cdn-speed-label" style="color: var(--weui-FG-HALF);">-- MB/s</span>
          </div>
          <div class="weui-progress-track" style="height: 5px; margin-bottom: 5px;">
            <div id="cdn-bar-fill" class="weui-progress-bar" style="width: 0%; background: var(--weui-BRAND);"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--weui-FG-2);">
            <span id="cdn-bytes-label">0 / 28.0 MB</span>
            <span>永久本地缓存 (0ms)</span>
          </div>
        </div>

        <!-- Drawer for Model / CDN Settings (Triggered by •••) -->
        <div id="cdn-config-drawer" class="weui-cells" style="display: none; padding: 10px 12px;">
          <div style="font-size: 11px; color: var(--weui-FG-HALF); margin-bottom: 6px; font-weight: 600;">快速切换模型规格:</div>
          <div style="display: flex; gap: 5px; margin-bottom: 8px;">
            <button type="button" class="weui-preset-btn" data-url="https://weights.4chess.cc/maia3_model.bin">5M (28M)</button>
            <button type="button" class="weui-preset-btn active" data-url="https://weights.4chess.cc/maia3_23m.bin">23M (104M)</button>
            <button type="button" class="weui-preset-btn" data-url="https://weights.4chess.cc/maia3_79m_fp16.bin">79M (159M)</button>
          </div>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="cdn-url-input" placeholder="https://weights.4chess.cc/maia3_23m.bin" value="https://weights.4chess.cc/maia3_23m.bin" style="flex: 1; background: var(--weui-BG-3); border: 0.5px solid var(--weui-BORDER); color: #FFF; padding: 4px 8px; border-radius: 6px; font-size: 10.5px; font-family: monospace;">
            <button id="cdn-save-btn" class="weui-btn-primary">保存</button>
          </div>
        </div>

        <!-- Elo Rating Selector Group (Zero-Overflow Segmented Tabs) -->
        <div>
          <div class="weui-cells__title">
            <span>目标棋手等级分 (ELO)</span>
            <span id="maia-elo-val" style="color: var(--weui-BRAND); font-weight: 700;">1500</span>
          </div>
          <div class="weui-cells" style="padding: 6px 8px;">
            <div class="weui-segmented-bar">
              <button class="weui-segment" data-elo="1100">1100</button>
              <button class="weui-segment active" data-elo="1500">1500</button>
              <button class="weui-segment" data-elo="1900">1900</button>
              <button class="weui-segment" data-elo="2200">2200</button>
            </div>
            <div id="maia-elo-desc" class="weui-cell-desc">当前: 1500 · 中阶人类直觉</div>
            <input type="range" id="maia-elo-slider" min="600" max="2600" step="50" value="1500" class="weui-slider" />
          </div>
        </div>

        <!-- Visual Toggles Group (WeChat Switches) -->
        <div>
          <div class="weui-cells__title">棋盘视觉辅助</div>
          <div class="weui-cells">
            <div class="weui-cell">
              <div class="weui-cell__bd">🔥 棋盘意图热力图</div>
              <input type="checkbox" id="maia-chk-heatmap" class="weui-switch" checked />
            </div>
            <div class="weui-cell">
              <div class="weui-cell__bd">🏹 人类直觉候选箭头</div>
              <input type="checkbox" id="maia-chk-arrows" class="weui-switch" checked />
            </div>
          </div>
        </div>

        <!-- Candidate Moves List Group -->
        <div>
          <div class="weui-cells__title">
            <span id="maia-moves-header-text">人类直觉候选着法</span>
            <span id="maia-inference-time" style="font-size: 10px; color: var(--weui-FG-2);">Inference: -- ms</span>
          </div>
          <div class="weui-cells">
            <div id="maia-moves-container" class="weui-moves-list">
              <div style="padding: 12px; text-align: center; color: var(--weui-FG-2); font-size: 11.5px;">⏳ 正在读取棋局状态...</div>
            </div>
          </div>
        </div>

        <!-- Human Intuition Insight Banner -->
        <div id="maia-insight-card" class="weui-insight-box">
          <div class="weui-insight-header">
            <span id="maia-insight-badge" class="weui-insight-badge">💡 直觉研判</span>
          </div>
          <div id="maia-insight-text">
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
    this.fab.addEventListener('click', () => {
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
      const eloBadge = this.fab.querySelector('#weui-float-elo');
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
    // 1. WeChat Capsule Close Button (⊙) -> Minimizes to WeChat Floating Ball
    const closeBtn = this.container.querySelector('#weui-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // 2. WeChat Capsule More Button (•••) -> Toggles Settings Drawer
    const moreBtn = this.container.querySelector('#weui-btn-more');
    const cdnDrawer = this.container.querySelector('#cdn-config-drawer');
    if (moreBtn && cdnDrawer) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = cdnDrawer.style.display === 'none';
        cdnDrawer.style.display = isHidden ? 'block' : 'none';
      });
    }

    // 3. Elo Segmented Tabs & Slider
    const segments = this.container.querySelectorAll('.weui-segment');
    const eloSlider = this.container.querySelector('#maia-elo-slider');
    const eloVal = this.container.querySelector('#maia-elo-val');
    const eloDesc = this.container.querySelector('#maia-elo-desc');

    const descMap = {
      1100: '当前: 1100 · 初阶棋手直觉',
      1500: '当前: 1500 · 中阶人类直觉',
      1900: '当前: 1900 · 进阶高手直觉',
      2200: '当前: 2200 · 大师巅峰直觉'
    };

    const updateActiveEloButton = (elo) => {
      segments.forEach(btn => {
        const isMatch = parseInt(btn.dataset.elo, 10) === elo;
        btn.classList.toggle('active', isMatch);
      });
      if (eloDesc) {
        eloDesc.textContent = descMap[elo] || `当前: ${elo} 等级分直觉`;
      }
    };

    segments.forEach(btn => {
      btn.addEventListener('click', () => {
        const elo = parseInt(btn.dataset.elo, 10);
        this.currentElo = elo;
        updateActiveEloButton(elo);
        if (eloSlider) eloSlider.value = elo;
        if (eloVal) eloVal.textContent = elo;
        if (this.fab) {
          const eloBadge = this.fab.querySelector('#weui-float-elo');
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
          const eloBadge = this.fab.querySelector('#weui-float-elo');
          if (eloBadge) eloBadge.textContent = elo;
        }
        if (this.onEloChange) this.onEloChange(elo);
      });
    }

    // 4. WeChat Switches (Toggles)
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
    const cdnInput = this.container.querySelector('#cdn-url-input');
    const cdnSaveBtn = this.container.querySelector('#cdn-save-btn');

    if (typeof chrome !== 'undefined' && chrome.storage?.local && cdnInput) {
      chrome.storage.local.get(['cloudflareCdnUrl'], (res) => {
        cdnInput.value = res?.cloudflareCdnUrl || 'https://weights.4chess.cc/maia3_23m.bin';
      });
    }

    // Preset buttons
    this.container.querySelectorAll('.weui-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.weui-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
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
        cdnSaveBtn.textContent = '已保存';
        cdnSaveBtn.style.opacity = '0.8';
        setTimeout(() => {
          cdnSaveBtn.textContent = originalText;
          cdnSaveBtn.style.opacity = '1';
        }, 1200);

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
        if (dotMaia) dotMaia.className = 'weui-status-dot status-ready';
        if (labelMaia) {
          labelMaia.textContent = `就绪 (${source || '本地'})`;
          labelMaia.className = 'weui-cell__ft status-green';
        }
        if (cdnCard) cdnCard.style.display = 'none';
      } else if (state === 'downloading') {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-loading';
        if (labelMaia) {
          labelMaia.textContent = `下载中 ${percent}%`;
          labelMaia.className = 'weui-cell__ft';
        }
        if (cdnCard) {
          cdnCard.style.display = 'block';
          if (cdnStatusLabel) cdnStatusLabel.textContent = `⚡ CDN 传输中 (${percent}%)`;
          if (cdnSpeedLabel) cdnSpeedLabel.textContent = speed ? `${speed} MB/s` : '-- MB/s';
          if (cdnBarFill) cdnBarFill.style.width = `${percent}%`;
          if (cdnBytesLabel) cdnBytesLabel.textContent = `${loadedMB} / ${totalMB} MB`;
        }
      } else if (state === 'error') {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-error';
        if (labelMaia) {
          labelMaia.textContent = '加载失败 (点•••配置)';
          labelMaia.className = 'weui-cell__ft';
        }
        if (cdnCard) cdnCard.style.display = 'none';
      } else {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-loading';
        if (labelMaia) {
          labelMaia.textContent = source || '正在连接...';
          labelMaia.className = 'weui-cell__ft';
        }
        if (cdnCard) cdnCard.style.display = 'none';
      }
    }

    // 2. Update Stockfish Status Dot & Text
    const dotSf = this.container.querySelector('#dot-sf');
    const labelSf = this.container.querySelector('#label-sf-status');
    if (status.stockfish) {
      const { state } = status.stockfish;
      if (state === 'ready') {
        if (dotSf) dotSf.className = 'weui-status-dot status-ready';
        if (labelSf) {
          labelSf.textContent = '就绪 (WASM)';
          labelSf.className = 'weui-cell__ft status-green';
        }
      } else if (state === 'error') {
        if (dotSf) dotSf.className = 'weui-status-dot status-error';
        if (labelSf) {
          labelSf.textContent = '启动异常';
          labelSf.className = 'weui-cell__ft';
        }
      } else {
        if (dotSf) dotSf.className = 'weui-status-dot status-loading';
        if (labelSf) {
          labelSf.textContent = '启动中...';
          labelSf.className = 'weui-cell__ft';
        }
      }
    }
  }

  setupDraggable() {
    const handle = this.container.querySelector('#maia-drag-handle');
    if (!handle) return;
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
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
      const eloBadge = this.fab.querySelector('#weui-float-elo');
      if (eloBadge) eloBadge.textContent = this.currentElo;
    }

    if (predictionData.status) {
      this.updateEngineStatus(predictionData.status);
    }

    const turnPill = this.container.querySelector('#maia-turn-pill');
    const isWhite = predictionData.turn === 'w';
    if (turnPill) {
      turnPill.textContent = isWhite ? '⚪ 白方' : '⚫ 黑方';
      turnPill.className = `weui-turn-tag ${isWhite ? 'turn-white' : 'turn-black'}`;
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
        if (timeEl) timeEl.textContent = `${latencyMs.toFixed(0)} ms · Stockfish`;
        if (movesHeader) movesHeader.textContent = isWhite ? '白方最佳 (Stockfish 17)' : '黑方最佳 (Stockfish 17)';
        
        if (movesContainer) {
          movesContainer.innerHTML = `
            <div class="weui-move-item top-pick">
              <div class="weui-move-main">
                <div class="weui-move-left">
                  <span class="weui-rank-tag rank-1">1</span>
                  <span class="weui-move-san" style="color: var(--weui-BRAND);">${sf.bestMove.san} <span style="font-size: 10px; color: var(--weui-BRAND);">(🐟 引擎最优)</span></span>
                </div>
                <span class="weui-move-prob" style="color: var(--weui-BRAND);">${sf.score}</span>
              </div>
              <div class="weui-progress-track">
                <div class="weui-progress-bar" style="width: 100%; background: var(--weui-BRAND);"></div>
              </div>
            </div>
            <div style="padding: 10px 12px; text-align: center; color: var(--weui-FG-1); font-size: 11px;">
              🧠 Maia-3 人类直觉载入中，完毕后将呈现人机共识对比...
            </div>
          `;
        }

        if (insightBox && insightBadge && insightText) {
          insightBox.style.display = 'block';
          insightBadge.textContent = '🐟 Stockfish 建议';
          insightBadge.className = 'weui-insight-badge';
          insightBox.className = 'weui-insight-box';
          insightText.innerHTML = `建议走 <strong>${sf.bestMove.san}</strong> (评估评分: ${sf.score})。<br><span style="color: var(--weui-FG-1); font-size: 11px;">Maia-3 载入就绪后将立即呈现人类直觉热力图。</span>`;
        }
      } else {
        if (timeEl) timeEl.textContent = '载入中...';
        if (movesContainer) {
          const maiaState = predictionData.status?.maia;
          const isError = maiaState?.state === 'error';
          movesContainer.innerHTML = `
            <div style="padding: 16px 12px; text-align: center;">
              <div style="font-size: 20px; margin-bottom: 4px;">${isError ? '⚠️' : '🧠'}</div>
              <div style="font-weight: 600; color: #FFF; margin-bottom: 4px;">
                ${isError ? 'Maia-3 模型未就绪' : '正在载入神经网络'}
              </div>
              <div style="font-size: 11px; color: var(--weui-FG-1); line-height: 1.4; margin-bottom: 8px;">
                ${isError ? '无法载入模型，请点击右上角 ••• 切换节点。' : (maiaState?.status || '正在传输模型至本地...')}
              </div>
              <button id="maia-retry-btn" class="weui-btn-primary" style="font-size: 11px; padding: 4px 12px;">重试初始化</button>
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
      movesHeader.textContent = isWhite ? '白方候选着法' : '黑方候选着法';
    }

    if (timeEl) {
      timeEl.textContent = `${latencyMs.toFixed(0)} ms (${predictionData.backend?.includes('本地') ? 'GPU 8ms' : '浏览器'})`;
    }

    // Human vs Stockfish Comparative Insight Banner
    if (predictionData.comparison) {
      const { badge, summary, agreed } = predictionData.comparison;
      insightBadge.textContent = badge;
      insightBadge.className = `weui-insight-badge ${agreed ? '' : 'badge-trap'}`;
      insightBox.className = `weui-insight-box ${agreed ? '' : 'alert-trap'}`;
      
      let sfHtml = '';
      if (predictionData.stockfish && predictionData.stockfish.bestMove) {
        const sf = predictionData.stockfish;
        sfHtml = `
          <div class="weui-sf-mini-row">
            <span>🐟 顶级引擎建议: <strong>${sf.bestMove.san}</strong></span>
            <span class="weui-sf-eval">${sf.score}</span>
          </div>
        `;
      }
      insightText.innerHTML = `${summary}${sfHtml}`;
    } else if (predictionData.analysis) {
      insightBadge.textContent = '💡 直觉研判';
      insightBadge.className = 'weui-insight-badge';
      insightBox.className = 'weui-insight-box';
      insightText.textContent = predictionData.analysis.commentary;
    }

    // Maia Human Candidates Move List
    if (!predictionData.moves || predictionData.moves.length === 0) {
      movesContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--weui-FG-2); font-size: 11.5px;">局面绝杀或无合法着法</div>`;
      return;
    }

    const topMoves = predictionData.moves.slice(0, 4);
    movesContainer.innerHTML = '';

    topMoves.forEach((move, idx) => {
      const row = document.createElement('div');
      row.className = `weui-move-item ${idx === 0 ? 'top-pick' : ''}`;
      row.dataset.uci = move.uci;

      const isSfMatch = predictionData.stockfish?.bestMove?.uci === move.uci;
      const barColor = isSfMatch ? 'var(--weui-BRAND)' : (idx === 0 ? 'var(--weui-BRAND)' : 'rgba(255, 255, 255, 0.35)');

      row.innerHTML = `
        <div class="weui-move-main">
          <div class="weui-move-left">
            <span class="weui-rank-tag ${idx === 0 ? 'rank-1' : ''}">${idx + 1}</span>
            <span class="weui-move-san">${move.san} ${isSfMatch ? '<span style="font-size: 9.5px; color: var(--weui-BRAND); font-weight: 700;">(共识)</span>' : ''}</span>
          </div>
          <span class="weui-move-prob">${move.prob}%</span>
        </div>
        <div class="weui-progress-track">
          <div class="weui-progress-bar" style="width: ${move.prob}%; background: ${barColor};"></div>
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
