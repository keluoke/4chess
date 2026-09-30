/**
 * Maia-3 Human Intuition Floating Panel (WeChat Mini-Program / WeUI Edition)
 * Designed according to Official WeChat Mini-Program & WeUI Design Guidelines:
 * 1. Iconic Top-Right Capsule (微信小程序双键胶囊: ••• 和 ⊙)
 * 2. Classic WeChat Floating Ball (微信浮窗 / 边缘停靠悬浮球)
 * 3. WeUI Cell Groups (weui-cells 规范布局)
 * 4. Zero-Overflow Segmented Tabs & Native WeChat Switches (weui-switch)
 * 5. High Information Density & Zero Lag Experience
 */

const I18N = {
  zh: {
    panelTitle: '歧路 Diverge',
    white: '⚪ 白方',
    black: '⚫ 黑方',
    whiteThinking: '⚪ 白方 · 研判中',
    blackThinking: '⚫ 黑方 · 研判中',
    btnMore: '设置 (语言/模型/视觉)',
    btnClose: '收起为微信浮窗',
    drawerTitle: '⚙️ 设置 / Settings',
    lblLang: '🌐 界面语言 / Language:',
    lblModelSpec: '⚡ 快速切换模型规格:',
    maiaEngine: 'Maia 3',
    sfEngine: 'Stockfish 19',
    notStarted: '未启动',
    connecting: '正在连接...',
    starting: '启动中...',
    readyWasm: '就绪 (WASM)',
    readyLocal: '就绪 (本地GPU)',
    initError: '启动异常',
    eloTitle: '直觉等级分 (ELO)',
    eloDesc: {
      1100: '1100 · 初学棋手直觉',
      1500: '1500 · 进阶棋手直觉',
      1900: '1900 · 俱乐部高手直觉',
      2200: '2200 · 大师段位直觉'
    },
    boardVisuals: '视觉辅助',
    heatmap: '意图热力图',
    arrows: '直觉走法建议',
    candidates: '人类直觉候选着法',
    whiteCandidates: '白方候选着法',
    blackCandidates: '黑方候选着法',
    thinking: '计算中...',
    consensus: '共识',
    engineBest: '🐟 引擎最优',
    noLegalMoves: '局面绝杀或无合法着法',
    readingState: '⏳ 正在读取局面...',
    consensusBadge: '🎯 人机高度共识',
    divergenceBadge: '⚠️ 人机着法分歧',
    intuitionBadge: '🫤 人类直觉首选',
    evalLabel: '局面',
    deltaLoss: '直觉损耗',
    floatTitle: '歧路 Diverge',
    btnStandaloneStudio: '全盘分析',
    fairPlayTitle: '对局进行中 · 公平竞技保护',
    fairPlayDesc: '为恪守国际象棋反作弊守则，在实时对局进行期间严禁提供任何引擎建议、直觉箭头与意图热力图。',
    fairPlayUnlockTip: '✓ 对局结束后将自动解锁全盘分析与局面研判',
    fairPlayLocked: '对局中 · 已锁定'
  },
  en: {
    panelTitle: 'Diverge',
    white: '⚪ White',
    black: '⚫ Black',
    whiteThinking: '⚪ White · Thinking',
    blackThinking: '⚫ Black · Thinking',
    btnMore: 'Settings (Language / Elo / Visuals / Model)',
    btnClose: 'Minimize to Floating Ball',
    drawerTitle: '⚙️ Settings',
    lblLang: 'Language:',
    lblModelSpec: 'Model Weights (Auto Switch):',
    maiaEngine: 'Maia 3',
    sfEngine: 'Stockfish 19',
    notStarted: 'Not Started',
    connecting: 'Connecting...',
    starting: 'Starting...',
    readyWasm: 'Ready (WASM)',
    readyLocal: 'Ready (Local GPU)',
    initError: 'Init Error',
    eloTitle: 'Intuition Rating (ELO)',
    eloDesc: {
      1100: '1100 · Beginner Intuition',
      1500: '1500 · Intermediate Intuition',
      1900: '1900 · Advanced Intuition',
      2200: '2200 · Master Intuition'
    },
    boardVisuals: 'Visual Overlays',
    heatmap: 'Attention Heatmap',
    arrows: 'Intuition Arrows',
    candidates: 'Candidate Moves',
    whiteCandidates: 'White Candidates',
    blackCandidates: 'Black Candidates',
    thinking: 'Thinking...',
    consensus: 'Best',
    engineBest: '🐟 Engine Best',
    noLegalMoves: 'Checkmate or no legal moves',
    readingState: '⏳ Reading position...',
    consensusBadge: '🎯 High Consensus',
    divergenceBadge: '⚠️ Engine Divergence',
    intuitionBadge: '🫤 Human Intuition',
    evalLabel: 'Eval',
    deltaLoss: 'Intuition Loss',
    floatTitle: 'Diverge',
    btnStandaloneStudio: 'Full Game Analysis',
    fairPlayTitle: 'Live Game Active · Fair Play Guard',
    fairPlayDesc: 'Per Fair Play Anti-Cheat rules, engine assistance, candidate arrows, and attention heatmaps are strictly disabled during live matches.',
    fairPlayUnlockTip: '✓ Unlocks automatically upon game conclusion',
    fairPlayLocked: 'Live Match · Locked'
  }
};

export class IntuitionPanel {
  constructor({ onEloChange, onToggleChange, onMoveHover, onModelLoaded, onCdnSave, onAnalyzeGame, onCancelReview, onJumpToMove, onSelectBlunder, onClearBlunderDrill, onOpenStandaloneAnalysis }) {
    this.onEloChange = onEloChange;
    this.onToggleChange = onToggleChange;
    this.onMoveHover = onMoveHover;
    this.onModelLoaded = onModelLoaded;
    this.onCdnSave = onCdnSave;
    this.onAnalyzeGame = onAnalyzeGame;
    this.onCancelReview = onCancelReview;
    this.onJumpToMove = onJumpToMove;
    this.onSelectBlunder = onSelectBlunder;
    this.onClearBlunderDrill = onClearBlunderDrill;
    this.onOpenStandaloneAnalysis = onOpenStandaloneAnalysis;
    this.activeDrill = null;

    this.container = null;
    this.fab = null;
    let closedPref = false;
    try {
      closedPref = sessionStorage.getItem('maia3_panel_closed') === 'true';
    } catch (e) {}
    this.isClosed = closedPref;
    this.isFairPlayLocked = false;
    this.currentElo = 1900;
    this.lang = (navigator.language && navigator.language.startsWith('zh')) ? 'zh' : 'en';

    this.currentData = null;
    this.currentTurn = 'w';
    this.latency = 0;
    this.lastReviewResult = null;
    this.reviewFilter = 'all';

    this.showHeatmap = true;
    this.showArrows = true;
    this.opacity = 0.55;

    this.init();

    // Asynchronously synchronize preferences from chrome.storage.local (avoiding host localStorage pollution)
    this._getStorage(['defaultElo', 'maia3_target_elo', 'maia3_lang', 'maia3_panel_pos', 'maia3_fab_pos'], (res) => {
      const val = res?.defaultElo || res?.maia3_target_elo;
      if (val && val !== this.currentElo) {
        this.setElo(val, false);
      }
      if (res?.maia3_lang && res.maia3_lang !== this.lang) {
        this.setLanguage(res.maia3_lang);
      }
      if (res?.maia3_panel_pos && this.container) {
        try {
          const { left, top } = typeof res.maia3_panel_pos === 'string' ? JSON.parse(res.maia3_panel_pos) : res.maia3_panel_pos;
          if (typeof left === 'number' && typeof top === 'number' &&
              left >= 0 && left < window.innerWidth - 100 &&
              top >= 0 && top < window.innerHeight - 50) {
            this.container.style.left = `${left}px`;
            this.container.style.top = `${top}px`;
            this.container.style.right = 'auto';
          }
        } catch (e) {}
      }
      if (res?.maia3_fab_pos && this.fab) {
        try {
          const { left, top } = typeof res.maia3_fab_pos === 'string' ? JSON.parse(res.maia3_fab_pos) : res.maia3_fab_pos;
          if (typeof left === 'number' && typeof top === 'number') {
            this.fab.style.left = `${left}px`;
            this.fab.style.top = `${top}px`;
            this.fab.style.right = 'auto';
          }
        } catch (e) {}
      }
      // Purge any legacy keys left in host page localStorage
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        try {
          localStorage.removeItem('maia3_target_elo');
          localStorage.removeItem('maia3_lang');
          localStorage.removeItem('maia3_panel_pos');
          localStorage.removeItem('maia3_fab_pos');
          localStorage.removeItem('maia3_panel_closed');
        } catch (e) {}
      }
    });
  }

  _getStorage(keys, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(keys, callback);
    } else {
      const res = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        try {
          const val = localStorage.getItem(k);
          if (val !== null) res[k] = val;
        } catch (e) {}
      }
      callback(res);
    }
  }

  _setStorage(items) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set(items);
      try {
        for (const k of Object.keys(items)) {
          localStorage.removeItem(k);
        }
      } catch (e) {}
    } else {
      try {
        for (const [k, v] of Object.entries(items)) {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
      } catch (e) {}
    }
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
    this.fab.title = this.lang === 'zh' ? '打开 歧路 Diverge 悬浮面板 (点击恢复)' : 'Open Diverge Panel';
    this.fab.innerHTML = `
      <span class="weui-float-dot"></span>
      <span class="weui-float-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="weui-fork-icon">
          <path d="M12 21v-8"></path>
          <path d="M12 13c0-4.5-6-4.5-6-9"></path>
          <path d="M12 13c0-4.5 6-4.5 6-9"></path>
          <polyline points="3 7 6 4 9 7"></polyline>
          <polyline points="15 7 18 4 21 7"></polyline>
        </svg>
      </span>
      <span class="weui-float-title">${this.t('floatTitle')}</span>
      <span id="weui-float-elo" class="weui-float-badge">${this.currentElo}</span>
    `;

    // 4. Restore Panel Position (synchronous fallback when chrome.storage unavailable)
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      try {
        const savedPos = localStorage.getItem('maia3_panel_pos');
        if (savedPos) {
          const { left, top } = JSON.parse(savedPos);
          if (typeof left === 'number' && typeof top === 'number' &&
              left >= 0 && left < window.innerWidth - 100 &&
              top >= 0 && top < window.innerHeight - 50) {
            this.container.style.left = `${left}px`;
            this.container.style.top = `${top}px`;
            this.container.style.right = 'auto';
          }
        }
      } catch (e) {}
    }

    // 5. Restore Floating Ball Position (synchronous fallback when chrome.storage unavailable)
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      try {
        const savedFabPos = localStorage.getItem('maia3_fab_pos');
        if (savedFabPos) {
          const { left, top } = JSON.parse(savedFabPos);
          if (typeof left === 'number' && typeof top === 'number') {
            this.fab.style.left = `${left}px`;
            this.fab.style.top = `${top}px`;
            this.fab.style.right = 'auto';
          }
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

    // 7. Mount both to DOM inside document.body
    const mount = () => {
      if (document.body) {
        if (!document.body.contains(this.container)) {
          document.body.appendChild(this.container);
        }
        if (!document.body.contains(this.fab)) {
          document.body.appendChild(this.fab);
        }
      } else if (document.documentElement) {
        if (!document.documentElement.contains(this.container)) {
          document.documentElement.appendChild(this.container);
        }
        if (!document.documentElement.contains(this.fab)) {
          document.documentElement.appendChild(this.fab);
        }
      }
    };
    mount();
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          document.body.appendChild(this.container);
          document.body.appendChild(this.fab);
        }
      });
    }

    this.setupDraggable();
    this.setupFabEvents();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <!-- WeChat Mini-Program Top Bar & Capsule (顶部导航条与经典小程序胶囊) -->
      <div class="weui-navbar" id="maia-drag-handle">
        <div class="weui-navbar__left">
          <span class="weui-navbar__icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="weui-fork-icon">
              <path d="M12 21v-8"></path>
              <path d="M12 13c0-4.5-6-4.5-6-9"></path>
              <path d="M12 13c0-4.5 6-4.5 6-9"></path>
              <polyline points="3 7 6 4 9 7"></polyline>
              <polyline points="15 7 18 4 21 7"></polyline>
            </svg>
          </span>
          <span class="weui-navbar__title" id="txt-panel-title">${this.t('panelTitle')}</span>
          <span id="maia-turn-pill" class="weui-turn-tag turn-white">${this.t('white')}</span>
        </div>
        <!-- Iconic WeChat Mini-Program Capsule (小程序双键胶囊) -->
        <div class="weui-capsule">
          <button type="button" id="weui-btn-more" class="weui-capsule-btn" title="${this.t('btnMore')}">
            <span class="weui-capsule-dots">•••</span>
          </button>
          <div class="weui-capsule-divider"></div>
          <button type="button" id="weui-btn-close" class="weui-capsule-btn" title="${this.t('btnClose')}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" fill="none"/>
              <circle cx="12" cy="12" r="3.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Settings Dropdown Drawer (隐藏在设置胶囊内) -->
      <div id="cdn-config-drawer" class="weui-drawer-overlay" style="display: none; max-height: 480px; overflow-y: auto;">
        <div class="weui-drawer-header">
          <span class="weui-drawer-title" id="txt-drawer-title">${this.t('drawerTitle')}</span>
          <button type="button" id="weui-btn-drawer-close" class="weui-drawer-close">✕</button>
        </div>

        <!-- 1. Language Toggle -->
        <div class="weui-drawer-item">
          <div class="weui-drawer-label" id="lbl-lang">${this.t('lblLang')}</div>
          <div class="weui-segmented-bar" style="height: 28px;">
            <button type="button" class="weui-segment ${this.lang === 'zh' ? 'active' : ''}" data-lang="zh">简体中文</button>
            <button type="button" class="weui-segment ${this.lang === 'en' ? 'active' : ''}" data-lang="en">English</button>
          </div>
        </div>

        <!-- 2. Elo Rating Selector -->
        <div class="weui-drawer-item">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="weui-drawer-label" id="lbl-elo-title">${this.t('eloTitle')}</div>
            <span id="maia-elo-val" style="color: var(--weui-BRAND); font-weight: 700; font-size: 12px;">${this.currentElo}</span>
          </div>
          <div class="weui-segmented-bar" style="height: 28px;">
            <button type="button" class="weui-segment ${this.currentElo === 1100 ? 'active' : ''}" data-elo="1100">1100</button>
            <button type="button" class="weui-segment ${this.currentElo === 1500 ? 'active' : ''}" data-elo="1500">1500</button>
            <button type="button" class="weui-segment ${this.currentElo === 1900 ? 'active' : ''}" data-elo="1900">1900</button>
            <button type="button" class="weui-segment ${this.currentElo === 2200 ? 'active' : ''}" data-elo="2200">2200</button>
          </div>
          <div id="maia-elo-desc" class="weui-cell-desc" style="padding: 2px 2px 0 2px;">${this.t('eloDesc')[this.currentElo] || ''}</div>
          <input type="range" id="maia-elo-slider" min="600" max="2600" step="50" value="${this.currentElo}" class="weui-slider" />
        </div>

        <!-- 3. Visual Overlays (意图热力图 & 直觉走法建议藏入设置) -->
        <div class="weui-drawer-item">
          <div class="weui-drawer-label" id="lbl-visuals-title">${this.t('boardVisuals')}</div>
          <div class="weui-cells" style="margin-top: 2px; border-radius: 8px; overflow: hidden; background: var(--weui-BG-3);">
            <div class="weui-cell" style="padding: 7px 10px;">
              <div class="weui-cell__bd" id="lbl-heatmap" style="font-size: 11.5px;">${this.t('heatmap')}</div>
              <input type="checkbox" id="maia-chk-heatmap" class="weui-switch" checked />
            </div>
            <div class="weui-cell" style="padding: 7px 10px; border-top: 0.5px solid var(--weui-BORDER);">
              <div class="weui-cell__bd" id="lbl-arrows" style="font-size: 11.5px;">${this.t('arrows')}</div>
              <input type="checkbox" id="maia-chk-arrows" class="weui-switch" checked />
            </div>
          </div>
        </div>

        <!-- 4. Model Spec (5M & 23M, background auto-switch) -->
        <div class="weui-drawer-item">
          <div class="weui-drawer-label" id="lbl-model-spec">${this.t('lblModelSpec')}</div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="weui-preset-btn active" data-url="https://weights.4chess.cc/maia3_model.bin" style="flex: 1; padding: 7px 0; text-align: center; border-radius: 6px; font-size: 11.5px; font-weight: 600;">5M (28M)</button>
            <button type="button" class="weui-preset-btn" data-url="https://weights.4chess.cc/maia3_23m.bin" style="flex: 1; padding: 7px 0; text-align: center; border-radius: 6px; font-size: 11.5px; font-weight: 600;">23M (104M)</button>
          </div>
          <div id="model-switch-hint" style="font-size: 10px; color: var(--weui-FG-2); margin-top: 5px; text-align: center;">${this.lang === 'zh' ? '✓ 点击在后台自动切换模型' : '✓ Click to switch model in background'}</div>
        </div>
      </div>

      <!-- WeChat Mini-Program Page Body -->
      <div class="weui-page__bd" id="maia-panel-body">
        <!-- Dual Engine Status Group -->
        <div class="weui-cells">
          <div class="weui-cell">
            <div class="weui-cell__bd">
              <span class="weui-status-dot status-idle" id="dot-maia"></span>
              <span id="lbl-engine-maia">${this.t('maiaEngine')}</span>
            </div>
            <span id="label-maia-status" class="weui-cell__ft">${this.t('notStarted')}</span>
          </div>
          <div class="weui-cell">
            <div class="weui-cell__bd">
              <span class="weui-status-dot status-idle" id="dot-sf"></span>
              <span id="lbl-engine-sf">${this.t('sfEngine')}</span>
            </div>
            <span id="label-sf-status" class="weui-cell__ft">${this.t('notStarted')}</span>
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
            <span id="lbl-cdn-cache-tag">${this.lang === 'zh' ? '永久本地缓存 (0ms)' : 'Local Cache (0ms)'}</span>
          </div>
        </div>

        <!-- Candidate Moves List Group -->
        <div>
          <div class="weui-cells__title" style="display: flex; justify-content: space-between; align-items: center;">
            <span id="maia-moves-header-text">${this.t('candidates')}</span>
            <span id="maia-inference-time" style="font-size: 10px; color: var(--weui-FG-2);">0 ms</span>
          </div>
          <div class="weui-cells">
            <div id="maia-moves-container" class="weui-moves-list">
              <div style="padding: 12px; text-align: center; color: var(--weui-FG-2); font-size: 11.5px;">${this.t('readingState')}</div>
            </div>
          </div>
        </div>

        <!-- Human Intuition Insight Banner -->
        <div id="maia-insight-card" class="weui-insight-box" style="display: none;">
          <div class="weui-insight-header">
            <span id="maia-insight-badge" class="weui-insight-badge">${this.t('intuitionBadge')}</span>
          </div>
          <div id="maia-insight-text">
            ...
          </div>
        </div>

        <!-- Full Game Analysis Studio Entry Button (全盘分析按钮，置于悬浮窗最下方) -->
        <div class="weui-review-entry" style="margin-top: 2px; margin-bottom: 2px;">
          <button type="button" id="btn-trigger-standalone" class="weui-btn-review" style="width: 100%; height: 38px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12.5px; font-weight: 600; border-radius: 8px; background: rgba(7, 193, 96, 0.12); border: 0.5px solid rgba(7, 193, 96, 0.35); color: var(--weui-BRAND); cursor: pointer; transition: all 0.15s ease;" title="${this.lang === 'zh' ? '在独立工作台中全盘分析' : 'Open in Full Game Analysis'}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            <span id="lbl-btn-standalone">${this.t('btnStandaloneStudio')}</span>
          </button>
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
          this._setStorage({ maia3_fab_pos: { left: rect.left, top: rect.top } });
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
    try {
      sessionStorage.setItem('maia3_panel_closed', 'true');
    } catch (e) {}
  }

  open() {
    this.isClosed = false;
    this.container.style.display = 'block';
    if (this.fab) {
      this.fab.style.display = 'none';
    }
    try {
      sessionStorage.setItem('maia3_panel_closed', 'false');
    } catch (e) {}
  }

  isPanelClosed() {
    return this.isClosed;
  }

  setElo(elo, triggerCallback = true) {
    const val = parseInt(elo, 10);
    if (isNaN(val)) return;
    this.currentElo = val;
    this._setStorage({ defaultElo: val, maia3_target_elo: val });
    if (this.container) {
      const eloVal = this.container.querySelector('#maia-elo-val');
      const eloSlider = this.container.querySelector('#maia-elo-slider');
      const eloDesc = this.container.querySelector('#maia-elo-desc');
      const segments = this.container.querySelectorAll('[data-elo]');
      if (eloVal) eloVal.textContent = val;
      if (eloSlider) eloSlider.value = val;
      if (eloDesc) {
        const descMap = this.t('eloDesc');
        eloDesc.textContent = descMap[val] || (this.lang === 'zh' ? `当前: ${val} 等级分直觉` : `Target: ${val} Elo Intuition`);
      }
      segments.forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.elo, 10) === val);
      });
    }
    if (this.fab) {
      const eloBadge = this.fab.querySelector('#weui-float-elo');
      if (eloBadge) eloBadge.textContent = val;
    }
    if (triggerCallback && this.onEloChange) {
      this.onEloChange(val);
    }
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
    const drawerCloseBtn = this.container.querySelector('#weui-btn-drawer-close');
    if (moreBtn && cdnDrawer) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = cdnDrawer.style.display === 'none';
        cdnDrawer.style.display = isHidden ? 'flex' : 'none';
      });
    }
    if (drawerCloseBtn && cdnDrawer) {
      drawerCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cdnDrawer.style.display = 'none';
      });
    }

    // Language Segmented Control in Drawer
    const langBtns = this.container.querySelectorAll('[data-lang]');
    langBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedLang = btn.dataset.lang;
        this.setLanguage(selectedLang);
      });
    });

    // 3. Elo Segmented Tabs & Slider (Inside Settings Drawer)
    const segments = this.container.querySelectorAll('.weui-segment[data-elo]');
    const eloSlider = this.container.querySelector('#maia-elo-slider');
    const eloVal = this.container.querySelector('#maia-elo-val');
    const eloDesc = this.container.querySelector('#maia-elo-desc');

    const updateActiveEloButton = (elo) => {
      segments.forEach(btn => {
        const isMatch = parseInt(btn.dataset.elo, 10) === elo;
        btn.classList.toggle('active', isMatch);
      });
      if (eloDesc) {
        const descMap = this.t('eloDesc');
        eloDesc.textContent = descMap[elo] || (this.lang === 'zh' ? `当前: ${elo} 等级分直觉` : `Target: ${elo} Elo Intuition`);
      }
    };

    segments.forEach(btn => {
      btn.addEventListener('click', () => {
        const elo = parseInt(btn.dataset.elo, 10);
        this.setElo(elo);
      });
    });

    if (eloSlider) {
      eloSlider.addEventListener('input', (e) => {
        const elo = parseInt(e.target.value, 10);
        this.setElo(elo);
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
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['cloudflareCdnUrl'], (res) => {
        const url = res?.cloudflareCdnUrl || 'https://weights.4chess.cc/maia3_model.bin';
        this.container.querySelectorAll('.weui-preset-btn').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-url') === url);
        });
      });
    }

    // Preset buttons: auto switch in background on click
    this.container.querySelectorAll('.weui-preset-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.container.querySelectorAll('.weui-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const url = btn.getAttribute('data-url');
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ cloudflareCdnUrl: url });
        }
        const hintEl = this.container.querySelector('#model-switch-hint');
        if (hintEl) {
          const originalText = hintEl.textContent;
          hintEl.textContent = this.lang === 'zh' ? '✓ 模型已在后台切换' : '✓ Model switched in background';
          hintEl.style.color = 'var(--weui-BRAND)';
          setTimeout(() => {
            hintEl.textContent = originalText;
            hintEl.style.color = 'var(--weui-FG-2)';
          }, 1500);
        }
        if (this.onCdnSave) {
          this.onCdnSave(url);
        }
      });
    });

    // 6. Standalone Game Review Button
    const triggerStandaloneBtn = this.container.querySelector('#btn-trigger-standalone');
    if (triggerStandaloneBtn) {
      triggerStandaloneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onOpenStandaloneAnalysis) {
          this.onOpenStandaloneAnalysis();
        }
      });
    }
  }



  clearBlunderDrill() {
    this.activeDrill = null;
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
      if (state === 'uninitialized') {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-idle';
        if (labelMaia) {
          labelMaia.textContent = this.t('notStarted');
          labelMaia.className = 'weui-cell__ft';
        }
        if (cdnCard) cdnCard.style.display = 'none';
      } else if (state === 'ready') {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-ready';
        if (labelMaia) {
          labelMaia.textContent = this.lang === 'zh' ? `就绪 (${source || '本地'})` : `Ready (${source || 'Local'})`;
          labelMaia.className = 'weui-cell__ft status-green';
        }
        if (cdnCard) cdnCard.style.display = 'none';
      } else if (state === 'downloading') {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-loading';
        if (labelMaia) {
          labelMaia.textContent = this.lang === 'zh' ? `下载中 ${percent}%` : `Downloading ${percent}%`;
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
          labelMaia.textContent = this.lang === 'zh' ? '加载失败 (点•••配置)' : 'Load Failed (Click •••)';
          labelMaia.className = 'weui-cell__ft';
        }
        if (cdnCard) cdnCard.style.display = 'none';
      } else {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-loading';
        if (labelMaia) {
          labelMaia.textContent = source || this.t('connecting');
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
      if (state === 'uninitialized') {
        if (dotSf) dotSf.className = 'weui-status-dot status-idle';
        if (labelSf) {
          labelSf.textContent = this.t('notStarted');
          labelSf.className = 'weui-cell__ft';
        }
      } else if (state === 'ready') {
        if (dotSf) dotSf.className = 'weui-status-dot status-ready';
        if (labelSf) {
          labelSf.textContent = this.t('readyWasm');
          labelSf.className = 'weui-cell__ft status-green';
        }
      } else if (state === 'error') {
        if (dotSf) dotSf.className = 'weui-status-dot status-error';
        if (labelSf) {
          labelSf.textContent = this.t('initError');
          labelSf.className = 'weui-cell__ft';
        }
      } else {
        if (dotSf) dotSf.className = 'weui-status-dot status-loading';
        if (labelSf) {
          labelSf.textContent = this.t('starting');
          labelSf.className = 'weui-cell__ft';
        }
      }
    }
  }

  t(key) {
    const dict = I18N[this.lang] || I18N.zh;
    return dict[key] || '';
  }

  _appendFormattedText(container, text) {
    if (!container || !text) return;
    const parts = String(text).split(/(<strong>.*?<\/strong>)/g);
    for (const part of parts) {
      if (!part) continue;
      const strongMatch = part.match(/^<strong>(.*?)<\/strong>$/);
      if (strongMatch) {
        const strongEl = document.createElement('strong');
        strongEl.textContent = strongMatch[1];
        container.appendChild(strongEl);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  setLanguage(lang) {
    this.lang = lang;
    this._setStorage({ maia3_lang: lang });

    const langBtns = this.container.querySelectorAll('[data-lang]');
    langBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    this.applyLanguage();

    if (this.currentData) {
      this.update(this.currentData, this.latency);
    }
  }

  applyLanguage() {
    if (!this.container) return;
    const txtPanelTitle = this.container.querySelector('#txt-panel-title');
    if (txtPanelTitle) txtPanelTitle.textContent = this.t('panelTitle');

    const btnMore = this.container.querySelector('#weui-btn-more');
    if (btnMore) btnMore.title = this.t('btnMore');

    const btnClose = this.container.querySelector('#weui-btn-close');
    if (btnClose) btnClose.title = this.t('btnClose');

    const txtDrawerTitle = this.container.querySelector('#txt-drawer-title');
    if (txtDrawerTitle) txtDrawerTitle.textContent = this.t('drawerTitle');

    const lblLang = this.container.querySelector('#lbl-lang');
    if (lblLang) lblLang.textContent = this.t('lblLang');

    const lblModelSpec = this.container.querySelector('#lbl-model-spec');
    if (lblModelSpec) lblModelSpec.textContent = this.t('lblModelSpec');

    const lblEngineMaia = this.container.querySelector('#lbl-engine-maia');
    if (lblEngineMaia) lblEngineMaia.textContent = this.t('maiaEngine');

    const lblEngineSf = this.container.querySelector('#lbl-engine-sf');
    if (lblEngineSf) lblEngineSf.textContent = this.t('sfEngine');

    const lblCdnCacheTag = this.container.querySelector('#lbl-cdn-cache-tag');
    if (lblCdnCacheTag) lblCdnCacheTag.textContent = this.lang === 'zh' ? '永久本地缓存 (0ms)' : 'Local Cache (0ms)';

    const lblEloTitle = this.container.querySelector('#lbl-elo-title');
    if (lblEloTitle) lblEloTitle.textContent = this.t('eloTitle');

    const eloDesc = this.container.querySelector('#maia-elo-desc');
    if (eloDesc) {
      const descMap = this.t('eloDesc');
      eloDesc.textContent = descMap[this.currentElo] || (this.lang === 'zh' ? `当前: ${this.currentElo} 等级分直觉` : `Target: ${this.currentElo} Elo Intuition`);
    }

    const lblVisualsTitle = this.container.querySelector('#lbl-visuals-title');
    if (lblVisualsTitle) lblVisualsTitle.textContent = this.t('boardVisuals');

    const lblHeatmap = this.container.querySelector('#lbl-heatmap');
    if (lblHeatmap) lblHeatmap.textContent = this.t('heatmap');

    const lblArrows = this.container.querySelector('#lbl-arrows');
    if (lblArrows) lblArrows.textContent = this.t('arrows');

    const lblBtnStandalone = this.container.querySelector('#lbl-btn-standalone');
    if (lblBtnStandalone) lblBtnStandalone.textContent = this.t('btnStandaloneStudio');

    const triggerBtn = this.container.querySelector('#btn-trigger-standalone');
    if (triggerBtn) {
      triggerBtn.title = this.lang === 'zh' ? '在独立工作台中全盘分析' : 'Open in Full Game Analysis';
    }

    const turnPill = this.container.querySelector('#maia-turn-pill');
    if (turnPill) {
      const isWhite = this.currentTurn === 'w';
      turnPill.textContent = isWhite ? this.t('white') : this.t('black');
    }

    if (this.fab) {
      const fabTitle = this.fab.querySelector('.weui-float-title');
      if (fabTitle) fabTitle.textContent = this.t('floatTitle');
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
        this._setStorage({ maia3_panel_pos: { left: rect.left, top: rect.top } });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  setFairPlayLocked(isLocked) {
    if (this.isFairPlayLocked === isLocked) return;
    this.isFairPlayLocked = isLocked;

    if (!this.container) return;

    const movesContainer = this.container.querySelector('#maia-moves-container');
    const movesHeader = this.container.querySelector('#maia-moves-header-text');
    const timeEl = this.container.querySelector('#maia-inference-time');
    const insightBox = this.container.querySelector('#maia-insight-card');
    const turnPill = this.container.querySelector('#maia-turn-pill');

    if (isLocked) {
      if (insightBox) insightBox.style.display = 'none';
      if (movesHeader) movesHeader.textContent = this.lang === 'zh' ? '公平竞技保护 (Fair Play)' : 'Fair Play Guard';
      if (timeEl) timeEl.textContent = this.t('fairPlayLocked');
      if (turnPill) {
        turnPill.replaceChildren();
        const lockSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        lockSvg.setAttribute('width', '11');
        lockSvg.setAttribute('height', '11');
        lockSvg.setAttribute('viewBox', '0 0 24 24');
        lockSvg.setAttribute('fill', 'none');
        lockSvg.setAttribute('stroke', 'currentColor');
        lockSvg.setAttribute('stroke-width', '2.2');
        lockSvg.setAttribute('stroke-linecap', 'round');
        lockSvg.setAttribute('stroke-linejoin', 'round');
        lockSvg.style.cssText = 'display: inline-block; vertical-align: -1px; margin-right: 3px;';
        lockSvg.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>';
        turnPill.appendChild(lockSvg);
        turnPill.appendChild(document.createTextNode(this.lang === 'zh' ? '对局中' : 'Live'));
        turnPill.className = 'weui-turn-tag';
      }

      const triggerBtn = this.container.querySelector('#btn-trigger-standalone');
      if (triggerBtn) {
        triggerBtn.style.opacity = '0.5';
        triggerBtn.style.pointerEvents = 'none';
      }

      if (movesContainer) {
        movesContainer.innerHTML = `
          <div class="weui-fair-play-banner" style="padding: 24px 14px; text-align: center;">
            <div class="weui-fair-play-lock-box" style="margin-bottom: 12px; display: flex; justify-content: center; align-items: center;">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(7, 193, 96, 0.08); border: 1px solid rgba(7, 193, 96, 0.22); display: flex; align-items: center; justify-content: center;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--weui-BRAND)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2.5" ry="2.5"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  <circle cx="12" cy="16.5" r="1.3" fill="var(--weui-BRAND)" stroke="none"></circle>
                </svg>
              </div>
            </div>
            <div style="font-size: 13.5px; font-weight: 700; color: #FFF; margin-bottom: 6px;">
              ${this.t('fairPlayTitle')}
            </div>
            <div style="font-size: 11px; color: var(--weui-FG-HALF); line-height: 1.5; margin-bottom: 12px;">
              ${this.t('fairPlayDesc')}
            </div>
            <div style="display: inline-block; padding: 4px 10px; background: rgba(7, 193, 96, 0.12); border: 0.5px solid rgba(7, 193, 96, 0.35); border-radius: 4px; font-size: 10.5px; color: var(--weui-BRAND);">
              ${this.t('fairPlayUnlockTip')}
            </div>
          </div>
        `;
      }
    } else {
      const triggerBtn = this.container.querySelector('#btn-trigger-standalone');
      if (triggerBtn) {
        triggerBtn.style.opacity = '1';
        triggerBtn.style.pointerEvents = 'auto';
      }
      if (movesContainer && movesContainer.querySelector('.weui-fair-play-banner')) {
        movesContainer.innerHTML = '';
      }
      if (this.currentData) {
        this.update(this.currentData, this.latency);
      }
    }
  }

  setEvaluating(fen = null) {
    if (this.isFairPlayLocked) return;
    this.currentData = null;
    let turn = 'w';
    if (fen && typeof fen === 'string') {
      const parts = fen.split(' ');
      if (parts.length > 1 && (parts[1] === 'w' || parts[1] === 'b')) {
        turn = parts[1];
      }
    }
    this.currentTurn = turn;
    const isWhite = turn === 'w';

    const turnPill = this.container.querySelector('#maia-turn-pill');
    if (turnPill) {
      turnPill.textContent = isWhite ? this.t('whiteThinking') : this.t('blackThinking');
      turnPill.className = `weui-turn-tag ${isWhite ? 'turn-white' : 'turn-black'}`;
    }

    const timeEl = this.container.querySelector('#maia-inference-time');
    if (timeEl) {
      timeEl.innerHTML = `<span class="weui-eval-spinner"></span> ${this.t('thinking')}`;
    }

    const movesHeader = this.container.querySelector('#maia-moves-header-text');
    if (movesHeader) {
      movesHeader.textContent = isWhite ? this.t('whiteCandidates') : this.t('blackCandidates');
    }

    const movesContainer = this.container.querySelector('#maia-moves-container');
    if (movesContainer) {
      movesContainer.innerHTML = `
        <div class="weui-skeleton-wrapper">
          <div class="weui-move-skeleton">
            <div class="weui-skeleton-line">
              <span class="weui-skel-rank"></span>
              <span class="weui-skel-name"></span>
              <span class="weui-skel-val"></span>
            </div>
            <div class="weui-skel-bar" style="width: 75%;"></div>
          </div>
          <div class="weui-move-skeleton">
            <div class="weui-skeleton-line">
              <span class="weui-skel-rank"></span>
              <span class="weui-skel-name" style="width: 44px;"></span>
              <span class="weui-skel-val" style="width: 30px;"></span>
            </div>
            <div class="weui-skel-bar" style="width: 45%;"></div>
          </div>
          <div class="weui-move-skeleton">
            <div class="weui-skeleton-line">
              <span class="weui-skel-rank"></span>
              <span class="weui-skel-name" style="width: 36px;"></span>
              <span class="weui-skel-val" style="width: 25px;"></span>
            </div>
            <div class="weui-skel-bar" style="width: 28%;"></div>
          </div>
        </div>
      `;
    }

    const insightBox = this.container.querySelector('#maia-insight-card');
    if (insightBox) {
      insightBox.style.display = 'none';
    }
  }

  update(predictionData, latencyMs = 0) {
    if (this.isFairPlayLocked) return;
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
    this.currentTurn = predictionData.turn || 'w';
    if (turnPill) {
      turnPill.textContent = isWhite ? this.t('white') : this.t('black');
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
        if (movesHeader) movesHeader.textContent = isWhite ? (this.lang === 'zh' ? '白方最佳 (Stockfish WASM)' : 'White Best (Stockfish WASM)') : (this.lang === 'zh' ? '黑方最佳 (Stockfish WASM)' : 'Black Best (Stockfish WASM)');
        
        if (movesContainer) {
          movesContainer.innerHTML = `
            <div class="weui-move-item top-pick">
              <div class="weui-move-main">
                <div class="weui-move-left">
                  <span class="weui-rank-tag rank-1">1</span>
                  <span class="weui-move-san" style="color: var(--weui-BRAND);">${sf.bestMove.san} <span style="font-size: 10px; color: var(--weui-BRAND);">(${this.t('engineBest')})</span></span>
                </div>
                <div class="weui-move-right">
                  <span class="weui-delta-tag tag-best">0.00</span>
                  <span class="weui-move-prob" style="color: var(--weui-BRAND);">${sf.score}</span>
                </div>
              </div>
              <div class="weui-progress-track">
                <div class="weui-progress-bar" style="width: 100%; background: var(--weui-BRAND);"></div>
              </div>
            </div>
            <div style="padding: 10px 12px; text-align: center; color: var(--weui-FG-1); font-size: 11px;">
              ${this.lang === 'zh' ? '🧠 Maia-3 人类直觉载入中，完毕后将呈现人机共识对比...' : '🧠 Maia-3 intuition loading, consensus comparison will appear once ready...'}
            </div>
          `;
        }

        if (insightBox && insightBadge && insightText) {
          insightBox.style.display = 'block';
          insightBadge.textContent = this.lang === 'zh' ? '🐟 Stockfish 建议' : '🐟 Stockfish Advice';
          insightBadge.className = 'weui-insight-badge';
          insightBox.className = 'weui-insight-box';
          insightText.replaceChildren();

          const recText = document.createTextNode(this.lang === 'zh' ? '建议走 ' : 'Recommended ');
          const moveStrong = document.createElement('strong');
          moveStrong.textContent = sf.bestMove.san;
          const evalText = document.createTextNode(` (${this.lang === 'zh' ? '评估评分' : 'Eval'}: ${sf.score})。`);
          const br = document.createElement('br');
          const subSpan = document.createElement('span');
          subSpan.style.cssText = 'color: var(--weui-FG-1); font-size: 11px;';
          subSpan.textContent = this.lang === 'zh' ? 'Maia-3 载入就绪后将立即呈现人类直觉热力图。' : 'Attention heatmap will display once Maia-3 is ready.';
          insightText.append(recText, moveStrong, evalText, br, subSpan);
        }
      } else {
        if (timeEl) timeEl.textContent = this.lang === 'zh' ? '载入中...' : 'Loading...';
        if (movesContainer) {
          const maiaState = predictionData.status?.maia;
          const isError = maiaState?.state === 'error';
          movesContainer.innerHTML = `
            <div style="padding: 16px 12px; text-align: center;">
              <div style="font-size: 20px; margin-bottom: 4px;">${isError ? '⚠️' : '🧠'}</div>
              <div style="font-weight: 600; color: #FFF; margin-bottom: 4px;">
                ${isError ? (this.lang === 'zh' ? 'Maia-3 模型未就绪' : 'Maia-3 Not Ready') : (this.lang === 'zh' ? '正在载入神经网络' : 'Loading Neural Network')}
              </div>
              <div style="font-size: 11px; color: var(--weui-FG-1); line-height: 1.4; margin-bottom: 8px;">
                ${isError ? (this.lang === 'zh' ? '无法载入模型，请点击右上角 ••• 切换节点。' : 'Failed to load model. Click ••• to switch CDN.') : (maiaState?.status || (this.lang === 'zh' ? '正在传输模型至本地...' : 'Streaming model to local...'))}
              </div>
              <button id="maia-retry-btn" class="weui-btn-primary" style="font-size: 11px; padding: 4px 12px;">${this.lang === 'zh' ? '重试初始化' : 'Retry'}</button>
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
      movesHeader.textContent = isWhite ? this.t('whiteCandidates') : this.t('blackCandidates');
    }

    if (timeEl) {
      const backendText = predictionData.backend?.includes('本地') ? 'GPU 8ms' : (this.lang === 'zh' ? '浏览器' : 'Browser');
      timeEl.textContent = `${latencyMs.toFixed(0)} ms (${backendText})`;
    }

    // Human vs Stockfish Comparative Insight Banner
    if (predictionData.comparison) {
      const comp = predictionData.comparison;
      const badge = this.lang === 'zh' ? comp.badge : (comp.badgeEn || comp.badge);
      const summary = this.lang === 'zh' ? comp.summary : (comp.summaryEn || comp.summary);
      insightBadge.textContent = badge;
      insightBadge.className = `weui-insight-badge ${comp.agreed ? '' : 'badge-trap'}`;
      insightBox.className = `weui-insight-box ${comp.agreed ? '' : 'alert-trap'}`;
      
      insightText.replaceChildren();
      const summaryEl = document.createElement('span');
      this._appendFormattedText(summaryEl, summary);
      insightText.appendChild(summaryEl);

      if (predictionData.stockfish && predictionData.stockfish.bestMove) {
        const sf = predictionData.stockfish;
        const sfLabel = this.lang === 'zh' ? '🐟 顶级引擎建议' : '🐟 Engine Best';
        const evalPrefix = this.lang === 'zh' ? '局面' : 'Eval';

        const miniRow = document.createElement('div');
        miniRow.className = 'weui-sf-mini-row';
        miniRow.style.cssText = 'margin-top: 6px; padding-top: 4px; border-top: 0.5px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 11px;';

        const leftSpan = document.createElement('span');
        leftSpan.textContent = `${sfLabel}: `;
        const sfStrong = document.createElement('strong');
        sfStrong.textContent = sf.bestMove.san;
        leftSpan.appendChild(sfStrong);

        if (comp.deltaText) {
          const deltaSpan = document.createElement('span');
          const isBlunder = parseFloat(comp.deltaText) <= -1.0;
          deltaSpan.className = `weui-delta-tag ${isBlunder ? 'tag-blunder' : 'tag-slight'}`;
          deltaSpan.style.marginLeft = '6px';
          deltaSpan.title = this.t('deltaLoss');
          deltaSpan.textContent = `Δ ${comp.deltaText}`;
          leftSpan.appendChild(deltaSpan);
        }

        const rightSpan = document.createElement('span');
        rightSpan.className = 'weui-sf-eval';
        rightSpan.style.cssText = 'color: var(--weui-BRAND); font-weight: 700;';
        rightSpan.textContent = `${evalPrefix} ${sf.score}`;

        miniRow.append(leftSpan, rightSpan);
        insightText.appendChild(miniRow);
      }
    } else if (predictionData.analysis) {
      insightBadge.textContent = this.t('intuitionBadge');
      insightBadge.className = 'weui-insight-badge';
      insightBox.className = 'weui-insight-box';
      insightText.replaceChildren();
      this._appendFormattedText(insightText, predictionData.analysis.commentary);
    }

    // Maia Human Candidates Move List
    if (!predictionData.moves || predictionData.moves.length === 0) {
      const msg = (predictionData.isReading || !predictionData.fen)
        ? this.t('readingState')
        : this.t('noLegalMoves');
      movesContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--weui-FG-2); font-size: 11.5px;">${msg}</div>`;
      return;
    }

    const topMoves = predictionData.moves.slice(0, 4);
    movesContainer.innerHTML = '';

    topMoves.forEach((move, idx) => {
      const row = document.createElement('div');
      row.className = `weui-move-item ${idx === 0 ? 'top-pick' : ''}`;
      row.dataset.uci = move.uci;

      const isSfMatch = predictionData.stockfish?.bestMove?.uci === move.uci || move.isBest;
      const barColor = isSfMatch ? 'var(--weui-BRAND)' : (idx === 0 ? 'var(--weui-BRAND)' : 'rgba(255, 255, 255, 0.35)');

      const mainDiv = document.createElement('div');
      mainDiv.className = 'weui-move-main';

      const leftDiv = document.createElement('div');
      leftDiv.className = 'weui-move-left';

      const rankTag = document.createElement('span');
      rankTag.className = `weui-rank-tag ${idx === 0 ? 'rank-1' : ''}`;
      rankTag.textContent = `${idx + 1}`;

      const sanSpan = document.createElement('span');
      sanSpan.className = 'weui-move-san';
      sanSpan.textContent = `${move.san} `;
      if (isSfMatch) {
        const matchTag = document.createElement('span');
        matchTag.style.cssText = 'font-size: 9.5px; color: var(--weui-BRAND); font-weight: 700;';
        matchTag.textContent = `(${this.t('consensus')})`;
        sanSpan.appendChild(matchTag);
      }
      leftDiv.append(rankTag, sanSpan);

      const rightDiv = document.createElement('div');
      rightDiv.className = 'weui-move-right';

      if (move.deltaText !== undefined) {
        const deltaTag = document.createElement('span');
        if (move.deltaText === '0.00' || isSfMatch) {
          deltaTag.className = 'weui-delta-tag tag-best';
          deltaTag.title = `${this.lang === 'zh' ? '引擎最佳' : 'Best'} (Δ 0.00)`;
          deltaTag.textContent = '0.00';
        } else {
          const numDelta = parseFloat(move.deltaText);
          const isBlunder = numDelta <= -1.0;
          deltaTag.className = `weui-delta-tag ${isBlunder ? 'tag-blunder' : 'tag-slight'}`;
          deltaTag.title = `${this.t('deltaLoss')} Δ: ${move.deltaText}`;
          deltaTag.textContent = `Δ ${move.deltaText}`;
        }
        rightDiv.appendChild(deltaTag);
      }

      const probSpan = document.createElement('span');
      probSpan.className = 'weui-move-prob';
      probSpan.textContent = `${move.prob}%`;
      rightDiv.appendChild(probSpan);

      mainDiv.append(leftDiv, rightDiv);

      const trackDiv = document.createElement('div');
      trackDiv.className = 'weui-progress-track';
      const barDiv = document.createElement('div');
      barDiv.className = 'weui-progress-bar';
      barDiv.style.width = `${move.prob}%`;
      barDiv.style.background = barColor;
      trackDiv.appendChild(barDiv);

      row.append(mainDiv, trackDiv);

      row.addEventListener('mouseenter', () => {
        if (this.onMoveHover) this.onMoveHover(move.uci);
      });
      row.addEventListener('mouseleave', () => {
        if (this.onMoveHover) this.onMoveHover(null);
      });

      movesContainer.appendChild(row);
    });
  }

  showCustomInsight({ badge, text, isTrap = false, blunderInfo = null }) {
    if (!this.container) return;
    const insightCard = this.container.querySelector('#maia-insight-card');
    const badgeEl = this.container.querySelector('#maia-insight-badge');
    const textEl = this.container.querySelector('#maia-insight-text');
    if (!insightCard || !badgeEl || !textEl) return;

    badgeEl.textContent = badge;
    badgeEl.className = `weui-insight-badge ${isTrap ? 'badge-trap' : ''}`;
    insightCard.className = `weui-insight-box ${isTrap ? 'alert-trap' : ''}`;
    insightCard.style.display = 'block';

    textEl.replaceChildren();

    if (blunderInfo) {
      const isZh = this.lang === 'zh';
      const sideText = blunderInfo.turn === 'w' ? (isZh ? '白方' : 'White') : (isZh ? '黑方' : 'Black');
      const probText = blunderInfo.humanProbability ? `${blunderInfo.humanProbability}%` : null;

      const line1 = document.createElement('div');
      const label1 = document.createTextNode(isZh ? '实战' : 'Played by ');
      const sideEl = document.createElement('strong');
      sideEl.textContent = sideText;
      const labelMid = document.createTextNode(isZh ? '走棋: ' : ': ');
      const playedEl = document.createElement('strong');
      playedEl.style.color = '#FA5151';
      playedEl.textContent = blunderInfo.san || '';

      line1.append(label1, sideEl, labelMid, playedEl);

      if (probText) {
        const probSpan = document.createElement('span');
        probSpan.textContent = ` (${isZh ? '直觉概率 ' : 'Intuition: '}`;
        const probStrong = document.createElement('strong');
        probStrong.textContent = probText;
        probSpan.appendChild(probStrong);
        probSpan.appendChild(document.createTextNode(')'));
        line1.appendChild(probSpan);
      }

      const recLabel = document.createTextNode(isZh ? '，而引擎推荐最优走法为 ' : ', while Engine recommends ');
      const bestEl = document.createElement('strong');
      bestEl.style.color = 'var(--weui-BRAND)';
      bestEl.textContent = blunderInfo.bestSan || '';
      line1.append(recLabel, bestEl);
      line1.appendChild(document.createTextNode('。'));

      const line2 = document.createElement('div');
      line2.style.marginTop = '3px';
      line2.style.fontSize = '11px';
      line2.style.color = 'var(--weui-FG-1)';

      const lossLabel = document.createTextNode(isZh ? '局面损耗: ' : 'Centipawn loss: ');
      const lossEl = document.createElement('strong');
      lossEl.style.color = '#FA5151';
      lossEl.textContent = `${blunderInfo.lossPawns || 0}`;
      const lossUnit = document.createTextNode(isZh
        ? ` 兵 (局势变动: ${blunderInfo.evalBefore || '0.00'} ➔ ${blunderInfo.evalAfter || '0.00'})`
        : ` (${blunderInfo.evalBefore || '0.00'} ➔ ${blunderInfo.evalAfter || '0.00'})`);

      line2.append(lossLabel, lossEl, lossUnit);
      textEl.append(line1, line2);
    } else if (text instanceof Node) {
      textEl.appendChild(text);
    } else if (typeof text === 'string') {
      this._appendFormattedText(textEl, text);
    }
  }

  showToast(msg, duration = 3000) {
    if (!this.container) return;
    let toast = this.container.querySelector('#maia-panel-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'maia-panel-toast';
      toast.style.cssText = `
        position: absolute;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(17, 24, 39, 0.94);
        color: #ffffff;
        font-size: 11px;
        padding: 7px 15px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow: 0 4px 18px rgba(0,0,0,0.45);
        pointer-events: none;
        z-index: 10000;
        transition: opacity 0.25s ease, transform 0.25s ease;
        text-align: center;
        max-width: 85%;
        line-height: 1.4;
      `;
      this.container.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(8px)';
      }
    }, duration);
  }
}
