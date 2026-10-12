/**
 * Maia-3 Human Intuition Floating Panel (WeChat Mini-Program / WeUI Edition)
 * Designed according to Official WeChat Mini-Program & WeUI Design Guidelines:
 * 1. Iconic Top-Right Capsule (微信小程序双键胶囊: ••• 和 ⊙)
 * 2. Classic WeChat Floating Ball (微信浮窗 / 边缘停靠悬浮球)
 * 3. WeUI Cell Groups (weui-cells 规范布局)
 * 4. Zero-Overflow Segmented Tabs & Native WeChat Switches (weui-switch)
 * 5. High Information Density & Zero Lag Experience
 */
import { MAIA_VARIANTS } from '../engine/engine-variants.js';
import { readEnginePreferences } from '../engine/engine-preferences.js';

let appearanceListenerInstalled = false;

const I18N = {
  zh: {
    panelTitle: '歧路 Diverge',
    white: '⚪ 白方',
    black: '⚫ 黑方',
    whiteThinking: '⚪ 白方 · 研判中',
    blackThinking: '⚫ 黑方 · 研判中',
    btnMore: '设置 (语言/模型/视觉)',
    btnClose: '收起悬浮窗',
    drawerTitle: '复盘偏好',
    lblLang: '界面语言',
    lblModelSpec: 'Maia 模型',
    maiaEngine: 'Maia 3',
    sfEngine: 'Stockfish 19',
    notStarted: '未启动',
    connecting: '正在连接...',
    starting: '启动中...',
    readyWasm: '就绪 (WASM)',
    readyLocal: '就绪 (本地 CPU)',
    initError: '启动异常',
    eloTitle: '人类直觉等级',
    eloDesc: {
      1100: '1100 · 初学棋手直觉',
      1500: '1500 · 进阶棋手直觉',
      1900: '1900 · 俱乐部高手直觉',
      2200: '2200 · 大师段位直觉'
    },
    boardVisuals: '棋盘显示',
    heatmap: 'Maia 落点偏好热力图',
    arrows: 'Maia 候选箭头',
    sfArrows: 'Stockfish 最佳箭头',
    dualIntro: 'Stockfish 看好不好，Maia 看常不常见',
    maiaLegend: '金色实线 · Maia 预测',
    sfLegend: '绿色虚线 · 引擎最佳',
    consensusLegend: '青色 · 两者首选一致',
    heatmapHelp: '暖色越深，Maia 越常选择这个落点；是相对强度，不是胜率或危险程度。',
    guide: '使用指南与图例 ↗',
    about: '关于 · 署名与许可 ↗',
    collapsedTitle: '悬浮窗已收起',
    collapsedHelp: '保留侧栏覆盖。展开后查看双引擎对比。',
    expand: '展开分析',
    sfWebOnly: '插件内运行 SF19 Lite；标准版在全盘分析网页版使用。',
    modelHelp: '首次使用下载所选模型，各版本缓存独立；对局中只保存选择，结束后加载。',
    modelSaved: '已保存；允许分析时加载所选模型。',
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
    deltaLoss: '相对引擎首选的评分变化；负值表示较弱',
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
    lblModelSpec: 'Maia model',
    maiaEngine: 'Maia 3',
    sfEngine: 'Stockfish 19',
    notStarted: 'Not Started',
    connecting: 'Connecting...',
    starting: 'Starting...',
    readyWasm: 'Ready (WASM)',
    readyLocal: 'Ready (Local CPU)',
    initError: 'Init Error',
    eloTitle: 'Intuition Rating (ELO)',
    eloDesc: {
      1100: '1100 · Beginner Intuition',
      1500: '1500 · Intermediate Intuition',
      1900: '1900 · Advanced Intuition',
      2200: '2200 · Master Intuition'
    },
    boardVisuals: 'Visual Overlays',
    heatmap: 'Maia destination heatmap',
    arrows: 'Maia candidate arrows',
    sfArrows: 'Stockfish best-move arrow',
    dualIntro: 'Stockfish: move quality · Maia: human likelihood',
    maiaLegend: 'Gold solid · Maia prediction',
    sfLegend: 'Green dashed · Engine best',
    consensusLegend: 'Cyan · Both favor the same move',
    heatmapHelp: 'Warmer squares are more common Maia destinations. Relative intensity, not win probability or danger.',
    guide: 'Guide & visual legend ↗',
    about: 'About · Credits & licenses ↗',
    collapsedTitle: 'Panel collapsed',
    collapsedHelp: 'Sidebar cover remains. Expand to compare both engines.',
    expand: 'Expand analysis',
    sfWebOnly: 'The extension runs SF19 Lite. Standard runs in the web review studio.',
    modelHelp: 'Downloads on first use; each model is cached separately. During a live game, selection is saved and loading waits until it ends.',
    modelSaved: 'Saved; the selected model loads when analysis is permitted.',
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
    deltaLoss: 'Score change from the engine best; negative means weaker',
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
    this.isHidden = false;
    try { this.isHidden = sessionStorage.getItem('maia3_panel_hidden') === 'true'; } catch {}
    this.enginePreferences = { maiaVariant: '5m', stockfishVariant: 'lite' };
    this.isFairPlayLocked = false;
    this.currentElo = 1900;
    this.lang = (navigator.language && navigator.language.startsWith('zh')) ? 'zh' : 'en';

    this.currentData = null;
    this.currentTurn = 'w';
    this.latency = 0;
    this.lastReviewResult = null;
    this.reviewFilter = 'all';

    this.showHeatmap = false;
    this.showArrows = true;
    this.showStockfishArrows = true;
    this.opacity = 0.55;

    this.init();
    readEnginePreferences().then(prefs => this.setEnginePreferences(prefs));
    this._getStorage(['showHeatmap', 'showArrows', 'showStockfishArrows'], saved => {
      for (const key of ['showHeatmap', 'showArrows', 'showStockfishArrows']) if (typeof saved[key] === 'boolean') this[key] = saved[key];
      this.syncStudyChrome();
      this.onToggleChange?.({ showHeatmap: this.showHeatmap, showArrows: this.showArrows, showStockfishArrows: this.showStockfishArrows });
    });

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
            this.userPositioned = true;
            this.fitPanel();
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

    this.container.style.display = this.isHidden ? 'none' : 'flex';
    this.container.dataset.collapsed = String(this.isClosed);
    this.fab.style.display = 'none';

    this.renderSkeleton();
    if (globalThis.chrome?.storage?.local) {
      const applyAppearance = (theme) => {
        document.querySelectorAll('#maia3-intuition-panel, #maia-wechat-float').forEach(element => {
          if (theme === 'light' || theme === 'dark') element.dataset.theme = theme;
          else delete element.dataset.theme;
        });
      };
      chrome.storage.local.get('diverge_ui_theme', result => applyAppearance(result.diverge_ui_theme));
      if (!appearanceListenerInstalled && chrome.storage.onChanged?.addListener) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes.diverge_ui_theme) applyAppearance(changes.diverge_ui_theme.newValue);
        });
        appearanceListenerInstalled = true;
      }
    }

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
    this.fitPanel();
    this.layoutObserver = new MutationObserver(() => { if (!this.userPositioned) this.fitPanel(); });
    this.layoutObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', () => this.fitPanel());
    window.addEventListener('scroll', () => { if (!this.userPositioned) this.fitPanel(); }, { passive: true });
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
          <button type="button" id="weui-btn-more" class="weui-capsule-btn" title="${this.t('btnMore')}" aria-label="${this.t('btnMore')}">
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--weui-BG-1)"/><circle cx="15" cy="17" r="3" fill="var(--weui-BG-1)"/></svg>
          </button>
          <div class="weui-capsule-divider"></div>
          <button type="button" id="weui-btn-close" class="weui-capsule-btn" title="${this.t('btnClose')}" aria-label="${this.t('btnClose')}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" fill="none"/>
              <circle cx="12" cy="12" r="3.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="diverge-collapsed-summary"><strong id="compact-title"></strong><p id="compact-help"></p><button type="button" id="maia-restore" data-dg-text="expand"></button><a href="https://4chess.cc/guide/" target="_blank" rel="noopener" data-dg-text="guide"></a></div>
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
              <input type="checkbox" id="maia-chk-heatmap" class="weui-switch" />
            </div>
            <div class="weui-cell" style="padding: 7px 10px; border-top: 0.5px solid var(--weui-BORDER);">
              <div class="weui-cell__bd" id="lbl-arrows" style="font-size: 11.5px;">${this.t('arrows')}</div>
              <input type="checkbox" id="maia-chk-arrows" class="weui-switch" checked />
            </div>
            <div class="weui-cell"><div class="weui-cell__bd" data-dg-text="sfArrows"></div><input type="checkbox" id="maia-chk-sf-arrows" class="weui-switch" checked /></div>
          </div>
          <p class="diverge-help" data-dg-text="heatmapHelp"></p>
        </div>

        <div class="weui-drawer-item"><label for="maia-sf-select">Stockfish</label><select id="maia-sf-select"><option value="lite">SF19 Lite</option><option value="standard">SF19 Standard · Web</option></select><p class="diverge-help" data-dg-text="sfWebOnly"></p></div>
        <!-- Maia model variants -->
        <div class="weui-drawer-item">
          <div class="weui-drawer-label" id="lbl-model-spec">${this.t('lblModelSpec')}</div>
          <div class="diverge-model-options">
            <button type="button" class="weui-preset-btn" data-model="5m">5M · 28 MB</button>
            <button type="button" class="weui-preset-btn" data-model="23m">23M · 104 MB</button>
            <button type="button" class="weui-preset-btn" data-model="79m">79M · 159 MB</button>
          </div>
          <p class="diverge-help" data-dg-text="modelHelp"></p>
          <div id="model-switch-hint" role="status" class="diverge-help"></div>
          <a class="diverge-guide-link" href="https://4chess.cc/guide/" target="_blank" rel="noopener" data-dg-text="guide"></a>
          <a class="diverge-guide-link" href="https://4chess.cc/guide/#about" target="_blank" rel="noopener" data-dg-text="about"></a>
        </div>
      </div>

      <!-- WeChat Mini-Program Page Body -->
      <div class="weui-page__bd" id="maia-panel-body">
        <!-- Dual Engine Status Group -->
        <div class="weui-cells diverge-engine-status">
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
        <div id="maia-cdn-progress-card" class="weui-cells diverge-download" style="display: none; padding: 10px 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 5px;">
            <span id="cdn-status-label" style="color: var(--weui-BRAND); font-weight: 600;">⚡ CDN 传输中...</span>
            <span id="cdn-speed-label" style="color: var(--weui-FG-HALF);">-- MB/s</span>
          </div>
          <div class="weui-progress-track" style="height: 5px; margin-bottom: 5px;">
            <div id="cdn-bar-fill" class="weui-progress-bar" style="width: 0%; background: var(--weui-BRAND);"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--weui-FG-2);">
            <span id="cdn-bytes-label">0 / 28.0 MB</span>
            <span id="lbl-cdn-cache-tag">${this.lang === 'zh' ? '完成后缓存在浏览器' : 'Cached after download'}</span>
          </div>
        </div>

        <section class="diverge-visual-legend"><strong data-dg-text="dualIntro"></strong><span class="legend-maia" data-dg-text="maiaLegend"></span><span class="legend-sf" data-dg-text="sfLegend"></span><span class="legend-consensus" data-dg-text="consensusLegend"></span><p data-dg-text="heatmapHelp"></p><a href="https://4chess.cc/guide/#dual-engines" target="_blank" rel="noopener" data-dg-text="guide"></a></section>
        <!-- Candidate Moves List Group -->
        <div class="diverge-candidates">
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
    this.syncStudyChrome();
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
    this.container.dataset.collapsed = 'true';
    sessionStorage.setItem('maia3_panel_closed', 'true');
    this.syncStudyChrome();
  }

  hide() {
    this.isHidden = true;
    this.container.style.display = 'none';
    sessionStorage.setItem('maia3_panel_hidden', 'true');
  }

  open() {
    this.isClosed = this.isHidden = false;
    this.container.style.display = 'flex';
    this.container.dataset.collapsed = 'false';
    sessionStorage.setItem('maia3_panel_closed', 'false');
    sessionStorage.setItem('maia3_panel_hidden', 'false');
    this.fitPanel();
  }

  isPanelClosed() { return this.isHidden; }

  setEnginePreferences(prefs) {
    this.enginePreferences = prefs;
    const select = this.container.querySelector('#maia-sf-select');
    if (select) select.value = prefs.stockfishVariant;
    this.container.querySelectorAll('[data-model]').forEach(btn => btn.classList.toggle('active', btn.dataset.model === prefs.maiaVariant));
    this.syncStudyChrome();
  }

  syncStudyChrome() {
    if (!this.container) return;
    this.container.querySelectorAll('[data-dg-text]').forEach(el => { el.textContent = this.t(el.dataset.dgText); });
    const title = this.container.querySelector('#compact-title');
    if (title) title.textContent = this.t(this.isFairPlayLocked ? 'fairPlayTitle' : 'collapsedTitle');
    const help = this.container.querySelector('#compact-help');
    if (help) help.textContent = this.t(this.isFairPlayLocked ? 'fairPlayUnlockTip' : 'collapsedHelp');
    const name = this.container.querySelector('#lbl-engine-maia');
    if (name) name.textContent = MAIA_VARIANTS[this.enginePreferences.maiaVariant]?.name || 'Maia-3';
    const sf = this.container.querySelector('#lbl-engine-sf');
    if (sf) sf.textContent = 'Stockfish 19 Lite';
    const modelHint = this.container.querySelector('#model-switch-hint');
    if (modelHint?.dataset.saved) modelHint.textContent = this.t('modelSaved');
    const standardOption = this.container.querySelector('#maia-sf-select option[value="standard"]');
    if (standardOption) standardOption.textContent = this.lang === 'zh' ? 'SF19 标准版 · 网页版' : 'SF19 Standard · Web';
    for (const [id, key] of [['maia-chk-heatmap', 'showHeatmap'], ['maia-chk-arrows', 'showArrows'], ['maia-chk-sf-arrows', 'showStockfishArrows']]) {
      const field = this.container.querySelector('#' + id); if (field) field.checked = this[key];
    }
    this.container.querySelectorAll('a[href*="4chess.cc/guide"]').forEach(link => {
      const url = new URL(link.href); url.searchParams.set('lang', this.lang); link.href = url.href;
    });
  }

  fitPanel() {
    if (!this.container) return;
    let width = 300, height = 600;
    if (!this.userPositioned && location.hostname.includes('chess.com')) {
      const board = document.querySelector('wc-chess-board, chess-board, .board-layout-chessboard')?.getBoundingClientRect();
      const ad = [...document.querySelectorAll('[id^="google_ads_iframe"], [id^="div-gpt-ad"], [data-ad-slot], .ad-slot, .ad-container, .board-layout-ad')].find(el => {
        const r = el.getBoundingClientRect(); return r.width >= 250 && r.width <= 420 && r.height >= 200 && r.height <= 800 && r.right <= innerWidth && r.top < innerHeight && (!board || r.left >= board.right - 8);
      });
      if (ad) {
        this.container.dataset.adCover = 'true';
        const r = ad.getBoundingClientRect(); width = r.width; height = r.height;
        this.container.style.left = Math.max(12, r.left) + 'px';
        this.container.style.top = Math.max(12, r.top) + 'px';
        this.container.style.right = 'auto';
      }
    }
    width = Math.min(width, innerWidth - 24); height = Math.min(height, innerHeight - 24);
    this.container.style.setProperty('--diverge-panel-width', width + 'px');
    this.container.style.setProperty('--diverge-panel-height', height + 'px');
    const r = this.container.getBoundingClientRect();
    this.container.style.top = Math.max(12, Math.min(r.top, innerHeight - height - 12)) + 'px';
    if (this.container.style.left) this.container.style.left = Math.max(12, Math.min(parseFloat(this.container.style.left), innerWidth - width - 12)) + 'px';
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
      this.showStockfishArrows = this.container.querySelector('#maia-chk-sf-arrows')?.checked !== false;
      this._setStorage({ showHeatmap: this.showHeatmap, showArrows: this.showArrows, showStockfishArrows: this.showStockfishArrows });
      if (this.onToggleChange) {
        this.onToggleChange({
          showHeatmap: this.showHeatmap,
          showArrows: this.showArrows,
          showStockfishArrows: this.showStockfishArrows,
          opacity: this.opacity
        });
      }
    };

    if (chkHeatmap) chkHeatmap.addEventListener('change', updateToggles);
    if (chkArrows) chkArrows.addEventListener('change', updateToggles);
    this.container.querySelector('#maia-chk-sf-arrows')?.addEventListener('change', updateToggles);

    const saveModels = async changes => {
      this.enginePreferences = { ...this.enginePreferences, ...changes };
      if (globalThis.chrome?.storage?.local) await chrome.storage.local.set(this.enginePreferences);
      this.setEnginePreferences(this.enginePreferences);
      const hint = this.container.querySelector('#model-switch-hint');
      hint.dataset.saved = 'true';
      hint.textContent = this.t('modelSaved');
    };
    this.container.querySelectorAll('[data-model]').forEach(btn => btn.addEventListener('click', () => saveModels({ maiaVariant: btn.dataset.model, cloudflareCdnUrl: MAIA_VARIANTS[btn.dataset.model].url })));
    this.container.querySelector('#maia-sf-select').addEventListener('change', event => saveModels({ stockfishVariant: event.target.value }));
    this.container.querySelector('#maia-restore').addEventListener('click', () => this.open());

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
    this.lastEngineStatus = status;

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
          const sourceLabel = source === 'IndexedDB 缓存' ? (this.lang === 'zh' ? '缓存' : 'Cache') : source;
          labelMaia.textContent = this.lang === 'zh' ? `就绪 (${sourceLabel || '本地'})` : `Ready (${sourceLabel || 'Local'})`;
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
          if (cdnStatusLabel) cdnStatusLabel.textContent = this.lang === 'zh' ? `⚡ CDN 传输中 (${percent}%)` : `⚡ Downloading (${percent}%)`;
          if (cdnSpeedLabel) cdnSpeedLabel.textContent = speed ? `${speed} MB/s` : '-- MB/s';
          if (cdnBarFill) cdnBarFill.style.width = `${percent}%`;
          if (cdnBytesLabel) cdnBytesLabel.textContent = `${loadedMB} / ${totalMB} MB`;
        }
      } else if (state === 'error') {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-error';
        if (labelMaia) {
          labelMaia.textContent = this.lang === 'zh' ? '加载失败 · 查看设置' : 'Load failed · Settings';
          labelMaia.className = 'weui-cell__ft';
        }
        if (cdnCard) cdnCard.style.display = 'none';
      } else {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-loading';
        if (labelMaia) {
          labelMaia.textContent = status.maia.stage === 'cache' ? (this.lang === 'zh' ? '读取缓存中…' : 'Reading cache…') : status.maia.stage === 'preparing' ? (this.lang === 'zh' ? '初始化模型…' : 'Preparing model…') : this.t('connecting');
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

  formatWhiteScore(sf, turn = this.currentTurn) {
    if (!sf) return '';
    const score = sf.score || sf.scoreText;
    if (!score || score === '?') return '';
    const isBlack = turn === 'b';

    if (sf.isMate || String(score).startsWith('M') || String(score).startsWith('#')) {
      const match = String(score).match(/[-+]?\d+/);
      if (match) {
        let m = parseInt(match[0], 10);
        if (isBlack) m = -m;
        return `M${m > 0 ? '+' : ''}${m}`;
      }
      return score;
    }

    let cp = sf.scoreCp;
    if (typeof cp !== 'number') {
      const num = parseFloat(score);
      if (!isNaN(num)) cp = Math.round(num * 100);
      else return score;
    }

    const whiteCp = isBlack ? -cp : cp;
    const pawns = (whiteCp / 100).toFixed(2);
    return whiteCp > 0 ? `+${pawns}` : pawns;
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
    this.syncStudyChrome();
    const txtPanelTitle = this.container.querySelector('#txt-panel-title');
    if (txtPanelTitle) txtPanelTitle.textContent = this.t('panelTitle');

    const btnMore = this.container.querySelector('#weui-btn-more');
    if (btnMore) { btnMore.title = this.t('btnMore'); btnMore.setAttribute('aria-label', this.t('btnMore')); }

    const btnClose = this.container.querySelector('#weui-btn-close');
    if (btnClose) { btnClose.title = this.t('btnClose'); btnClose.setAttribute('aria-label', this.t('btnClose')); }

    const txtDrawerTitle = this.container.querySelector('#txt-drawer-title');
    if (txtDrawerTitle) txtDrawerTitle.textContent = this.t('drawerTitle');

    const lblLang = this.container.querySelector('#lbl-lang');
    if (lblLang) lblLang.textContent = this.t('lblLang');

    const lblModelSpec = this.container.querySelector('#lbl-model-spec');
    if (lblModelSpec) lblModelSpec.textContent = this.lang === 'zh' ? 'Maia 模型' : 'Maia model';

    const lblEngineMaia = this.container.querySelector('#lbl-engine-maia');
    if (lblEngineMaia) lblEngineMaia.textContent = this.t('maiaEngine');

    const lblEngineSf = this.container.querySelector('#lbl-engine-sf');
    if (lblEngineSf) lblEngineSf.textContent = this.t('sfEngine');

    const lblCdnCacheTag = this.container.querySelector('#lbl-cdn-cache-tag');
    if (lblCdnCacheTag) lblCdnCacheTag.textContent = this.lang === 'zh' ? '完成后缓存在浏览器' : 'Cached after download';

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
    if (turnPill && !this.isFairPlayLocked) {
      const isWhite = this.currentTurn === 'w';
      turnPill.textContent = isWhite ? this.t('white') : this.t('black');
    }

    if (this.fab) {
      const fabTitle = this.fab.querySelector('.weui-float-title');
      if (fabTitle) fabTitle.textContent = this.t('floatTitle');
    }
    this.syncStudyChrome();
    if (this.lastEngineStatus) this.updateEngineStatus(this.lastEngineStatus);
    if (this.isFairPlayLocked) {
      this.isFairPlayLocked = false;
      this.setFairPlayLocked(true);
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
        this.userPositioned = true;
        this._setStorage({ maia3_panel_pos: { left: rect.left, top: rect.top } });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  setFairPlayLocked(isLocked) {
    if (this.isFairPlayLocked === isLocked) return;
    this.isFairPlayLocked = isLocked;
    if (this.container) this.container.dataset.fairPlayLocked = String(isLocked);

    if (!this.container) return;

    const movesContainer = this.container.querySelector('#maia-moves-container');
    const movesHeader = this.container.querySelector('#maia-moves-header-text');
    const timeEl = this.container.querySelector('#maia-inference-time');
    const insightBox = this.container.querySelector('#maia-insight-card');
    const turnPill = this.container.querySelector('#maia-turn-pill');

    this.syncStudyChrome();
    if (isLocked) {
      this.currentData = null;
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
        triggerBtn.disabled = true;
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
            <div style="font-size: 13.5px; font-weight: 700; color: var(--weui-FG-0); margin-bottom: 6px;">
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
        triggerBtn.disabled = false;
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
      const maiaFailed = predictionData.status?.maia?.state === 'error';
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
                  <span class="weui-move-prob" style="color: var(--weui-BRAND);">${this.formatWhiteScore(sf, predictionData.turn)}</span>
                </div>
              </div>
              <div class="weui-progress-track">
                <div class="weui-progress-bar" style="width: 100%; background: var(--weui-BRAND);"></div>
              </div>
            </div>
            <div style="padding: 10px 12px; text-align: center; color: var(--weui-FG-1); font-size: 11px;">
              ${maiaFailed ? (this.lang === 'zh' ? 'Maia 加载失败，Stockfish 仍可使用。' : 'Maia failed to load; Stockfish is still available.') : (this.lang === 'zh' ? '🧠 Maia-3 人类直觉载入中，完毕后将呈现人机共识对比...' : '🧠 Maia-3 intuition loading, consensus comparison will appear once ready...')}
            </div>
          `;
          if (maiaFailed) {
            const retry = document.createElement('button');
            retry.type = 'button'; retry.className = 'weui-btn-primary';
            retry.textContent = this.lang === 'zh' ? '重试 Maia 下载' : 'Retry Maia download';
            retry.addEventListener('click', () => this.onModelLoaded?.());
            movesContainer.appendChild(retry);
          }
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
          const whiteScore = this.formatWhiteScore(sf, predictionData.turn);
          const evalText = document.createTextNode(` (${this.lang === 'zh' ? '评估' : 'Eval'}: ${whiteScore})。`);
          const br = document.createElement('br');
          const subSpan = document.createElement('span');
          subSpan.style.cssText = 'color: var(--weui-FG-1); font-size: 11px;';
          subSpan.textContent = this.lang === 'zh' ? 'Maia 就绪后加入直觉候选；热力图可在设置中开启。' : 'Maia candidates appear when ready; enable the destination heatmap in Settings.';
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
              <div style="font-weight: 600; color: var(--weui-FG-0); margin-bottom: 4px;">
                ${isError ? (this.lang === 'zh' ? 'Maia-3 模型未就绪' : 'Maia-3 Not Ready') : (this.lang === 'zh' ? '正在载入神经网络' : 'Loading Neural Network')}
              </div>
              <div style="font-size: 11px; color: var(--weui-FG-1); line-height: 1.4; margin-bottom: 8px;">
                ${isError ? (this.lang === 'zh' ? '无法载入模型，请打开右上角设置后重试。' : 'Failed to load model. Open Settings and retry.') : (maiaState?.status || (this.lang === 'zh' ? '正在传输模型至本地...' : 'Streaming model to local...'))}
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
      const backendText = this.lang === 'zh' ? '浏览器 CPU' : 'Browser CPU';
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
        rightSpan.textContent = `${evalPrefix} ${this.formatWhiteScore(sf, predictionData.turn)}`;

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

    const topMoves = predictionData.moves.slice(0, 3);
    movesContainer.innerHTML = '';

    topMoves.forEach((move, idx) => {
      const row = document.createElement('div');
      row.className = `weui-move-item ${idx === 0 ? 'top-pick' : ''}`;
      row.dataset.uci = move.uci;

      const isSfMatch = predictionData.stockfish?.bestMove?.uci === move.uci || move.isBest;
      const barColor = isSfMatch ? 'var(--dg-blue)' : 'var(--dg-gold)';

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

      const evalBeforeStr = this.formatWhiteScore({ score: blunderInfo.evalBefore, scoreCp: blunderInfo.evalBeforeCp }, blunderInfo.turn);
      const opponentTurn = blunderInfo.turn === 'w' ? 'b' : 'w';
      const evalAfterStr = this.formatWhiteScore({ score: blunderInfo.evalAfter, scoreCp: blunderInfo.evalAfterCp }, opponentTurn);

      const lossUnit = document.createTextNode(isZh
        ? ` 兵 (局势变动: ${evalBeforeStr} ➔ ${evalAfterStr})`
        : ` (${evalBeforeStr} ➔ ${evalAfterStr})`);

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
