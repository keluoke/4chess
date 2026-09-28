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
    panelTitle: 'Maia 3 直觉',
    white: '⚪ 白方',
    black: '⚫ 黑方',
    whiteThinking: '⚪ 白方 · 研判中',
    blackThinking: '⚫ 黑方 · 研判中',
    btnMore: '设置 (语言/模型/CDN)',
    btnClose: '收起为微信浮窗',
    drawerTitle: '⚙️ 设置 / Settings',
    lblLang: '🌐 界面语言 / Language:',
    lblModelSpec: '⚡ 快速切换模型规格:',
    lblCdnUrl: '🔗 自定义 CDN 加速节点:',
    btnSave: '保存',
    btnSaved: '已保存',
    maiaEngine: 'Maia 3 直觉',
    sfEngine: 'Stockfish 引擎',
    connecting: '正在连接...',
    starting: '启动中...',
    readyWasm: '就绪 (WASM)',
    readyLocal: '就绪 (本地GPU)',
    initError: '启动异常',
    eloTitle: '目标棋手等级分 (ELO)',
    eloDesc: {
      1100: '当前: 1100 · 初阶棋手直觉',
      1500: '当前: 1500 · 中阶人类直觉',
      1900: '当前: 1900 · 进阶高手直觉',
      2200: '当前: 2200 · 大师巅峰直觉'
    },
    boardVisuals: '棋盘视觉辅助',
    heatmap: '🔥 棋盘意图热力图',
    arrows: '🏹 人类直觉候选箭头',
    candidates: '人类直觉候选着法',
    whiteCandidates: '白方候选着法',
    blackCandidates: '黑方候选着法',
    thinking: '计算中...',
    consensus: '共识',
    engineBest: '🐟 引擎最优',
    noLegalMoves: '局面绝杀或无合法着法',
    readingState: '⏳ 正在读取棋局状态...',
    consensusBadge: '🎯 人机高度共识',
    divergenceBadge: '⚠️ 人机着法分歧',
    intuitionBadge: '💡 人类直觉首选',
    evalLabel: '局面',
    deltaLoss: '直觉损耗',
    floatTitle: 'Maia 3',
    btnAnalyzeGame: '📊 全局棋局复盘 (损耗榜)',
    reviewTitle: '📊 全局复盘 · 关键局面损耗榜',
    reviewRunning: '正在复盘全盘对局...',
    btnCancelReview: '取消复盘',
    analyzedMoves: '共分析步数',
    blunderLabel: '大漏',
    mistakeLabel: '失误',
    inaccuracyLabel: '疑问手',
    filterAll: '全部损耗',
    filterWhite: '仅白棋',
    filterBlack: '仅黑棋',
    jumpToMove: '点击跳转该局面 ➔',
    noBlundersFound: '👏 棋局质量极高！未发现显著局面损耗手。',
    humanTrapBadge: '💡 人类直觉盲区',
    acplWhite: '白方均损',
    acplBlack: '黑方均损',
    playedMove: '实战走棋',
    bestMove: '推荐最优',
    evalChange: '局势变动',
    reviewError: '复盘失败',
    fairPlayTitle: '对局进行中 · 公平竞技保护',
    fairPlayDesc: '为恪守国际象棋反作弊守则，在实时对局进行期间严禁提供任何引擎建议、直觉箭头与意图热力图。',
    fairPlayUnlockTip: '✓ 对局结束后将自动解锁全局复盘与直觉研判',
    fairPlayLocked: '对局中 · 已锁定'
  },
  en: {
    panelTitle: 'Maia 3 Intuition',
    white: '⚪ White',
    black: '⚫ Black',
    whiteThinking: '⚪ White · Thinking',
    blackThinking: '⚫ Black · Thinking',
    btnMore: 'Settings (Language / Model / CDN)',
    btnClose: 'Minimize to Floating Ball',
    drawerTitle: '⚙️ Settings / 设置',
    lblLang: '🌐 Language / 语言:',
    lblModelSpec: '⚡ Switch Model Weight:',
    lblCdnUrl: '🔗 Custom CDN URL:',
    btnSave: 'Save',
    btnSaved: 'Saved',
    maiaEngine: 'Maia 3 Intuition',
    sfEngine: 'Stockfish Engine',
    connecting: 'Connecting...',
    starting: 'Starting...',
    readyWasm: 'Ready (WASM)',
    readyLocal: 'Ready (Local GPU)',
    initError: 'Init Error',
    eloTitle: 'Target Player Elo',
    eloDesc: {
      1100: 'Target: 1100 · Beginner Intuition',
      1500: 'Target: 1500 · Intermediate Intuition',
      1900: 'Target: 1900 · Advanced Intuition',
      2200: 'Target: 2200 · Master Intuition'
    },
    boardVisuals: 'Board Overlays',
    heatmap: '🔥 Attention Heatmap',
    arrows: '🏹 Intuition Arrows',
    candidates: 'Candidate Moves',
    whiteCandidates: 'White Candidates',
    blackCandidates: 'Black Candidates',
    thinking: 'Thinking...',
    consensus: 'Best',
    engineBest: '🐟 Engine Best',
    noLegalMoves: 'Checkmate or no legal moves',
    readingState: '⏳ Detecting board position...',
    consensusBadge: '🎯 High Consensus',
    divergenceBadge: '⚠️ Engine Divergence',
    intuitionBadge: '💡 Human Intuition',
    evalLabel: 'Eval',
    deltaLoss: 'Intuition Loss',
    floatTitle: 'Maia 3',
    btnAnalyzeGame: '📊 Game Review (Blunder List)',
    reviewTitle: '📊 Game Review · Top Loss Moves',
    reviewRunning: 'Analyzing entire game...',
    btnCancelReview: 'Cancel Review',
    analyzedMoves: 'Moves Analyzed',
    blunderLabel: 'Blunders',
    mistakeLabel: 'Mistakes',
    inaccuracyLabel: 'Inaccuracies',
    filterAll: 'All Losses',
    filterWhite: 'White',
    filterBlack: 'Black',
    jumpToMove: 'Jump to Move ➔',
    noBlundersFound: '👏 Clean game! No significant blunders detected.',
    humanTrapBadge: '💡 Human Trap',
    acplWhite: 'White ACPL',
    acplBlack: 'Black ACPL',
    playedMove: 'Played',
    bestMove: 'Best',
    evalChange: 'Eval Swing',
    reviewError: 'Review Failed',
    fairPlayTitle: 'Live Game Active · Fair Play Guard',
    fairPlayDesc: 'Per Fair Play Anti-Cheat rules, engine assistance, candidate arrows, and attention heatmaps are strictly disabled during live matches.',
    fairPlayUnlockTip: '✓ Unlocks automatically upon game conclusion',
    fairPlayLocked: 'Live Game · Locked'
  }
};

export class IntuitionPanel {
  constructor({ onEloChange, onToggleChange, onMoveHover, onModelLoaded, onCdnSave, onAnalyzeGame, onCancelReview, onJumpToMove, onSelectBlunder, onClearBlunderDrill }) {
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
    this.activeDrill = null;

    this.container = null;
    this.fab = null;
    this.isClosed = localStorage.getItem('maia3_panel_closed') === 'true';
    this.isFairPlayLocked = false;

    let storedElo = 1900;
    try {
      storedElo = parseInt(localStorage.getItem('maia3_target_elo'), 10) || 1900;
    } catch (e) {}
    this.currentElo = storedElo;
    this.currentData = null;
    this.currentTurn = 'w';
    this.latency = 0;
    this.lastReviewResult = null;
    this.reviewFilter = 'all';

    let storedLang = 'zh';
    try {
      storedLang = localStorage.getItem('maia3_lang') || (navigator.language?.startsWith('zh') ? 'zh' : 'en');
    } catch(e) {}
    this.lang = storedLang;

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
          <span class="weui-navbar__title" id="txt-panel-title">${this.t('panelTitle')}</span>
          <span id="maia-turn-pill" class="weui-turn-tag turn-white">${this.t('white')}</span>
          <button type="button" id="weui-btn-back-review" class="weui-back-review-btn" style="display: none;" title="${this.lang === 'zh' ? '返回全局复盘损耗榜' : 'Back to Game Review'}">
            <span>⬅️</span>
            <span>${this.lang === 'zh' ? '返回复盘' : 'Review'}</span>
          </button>
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

      <!-- Settings Dropdown Drawer (绝对顶层浮动，独立于列表内容，绝对不被遮挡) -->
      <div id="cdn-config-drawer" class="weui-drawer-overlay" style="display: none;">
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

        <!-- 2. Elo Rating Selector (隐藏在设置菜单内，默认 1900) -->
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

        <!-- 3. Model Spec -->
        <div class="weui-drawer-item">
          <div class="weui-drawer-label" id="lbl-model-spec">${this.t('lblModelSpec')}</div>
          <div style="display: flex; gap: 5px;">
            <button type="button" class="weui-preset-btn" data-url="https://weights.4chess.cc/maia3_model.bin">5M (28M)</button>
            <button type="button" class="weui-preset-btn active" data-url="https://weights.4chess.cc/maia3_23m.bin">23M (104M)</button>
            <button type="button" class="weui-preset-btn" data-url="https://weights.4chess.cc/maia3_79m_fp16.bin">79M (159M)</button>
          </div>
        </div>

        <!-- 4. Custom CDN URL -->
        <div class="weui-drawer-item">
          <div class="weui-drawer-label" id="lbl-cdn-url">${this.t('lbl-cdn-url') || this.t('lblCdnUrl')}</div>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="cdn-url-input" placeholder="https://weights.4chess.cc/maia3_23m.bin" value="https://weights.4chess.cc/maia3_23m.bin" style="flex: 1; background: var(--weui-BG-3); border: 0.5px solid var(--weui-BORDER); color: #FFF; padding: 4px 8px; border-radius: 6px; font-size: 10.5px; font-family: monospace;">
            <button type="button" id="cdn-save-btn" class="weui-btn-primary" style="padding: 4px 10px; font-size: 11px;">${this.t('btnSave')}</button>
          </div>
        </div>
      </div>

      <!-- WeChat Game Review Overlay Drawer -->
      <div id="weui-review-overlay" class="weui-review-overlay" style="display: none;">
        <div class="weui-review-header">
          <div class="weui-review-title">
            <span>📊</span>
            <span id="lbl-review-title">${this.t('reviewTitle')}</span>
          </div>
          <button type="button" class="weui-review-close" id="btn-close-review" title="Close">✕</button>
        </div>
        <div class="weui-review-body" id="weui-review-body">
          <!-- Dynamic Content -->
        </div>
      </div>

      <!-- WeChat Mini-Program Page Body -->
      <div class="weui-page__bd" id="maia-panel-body">
        <!-- Dual Engine Status Group -->
        <div class="weui-cells">
          <div class="weui-cell">
            <div class="weui-cell__bd">
              <span class="weui-status-dot status-loading" id="dot-maia"></span>
              <span id="lbl-engine-maia">${this.t('maiaEngine')}</span>
            </div>
            <span id="label-maia-status" class="weui-cell__ft">${this.t('connecting')}</span>
          </div>
          <div class="weui-cell">
            <div class="weui-cell__bd">
              <span class="weui-status-dot status-loading" id="dot-sf"></span>
              <span id="lbl-engine-sf">${this.t('sfEngine')}</span>
            </div>
            <span id="label-sf-status" class="weui-cell__ft">${this.t('starting')}</span>
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

        <!-- Visual Toggles Group (WeChat Switches) -->
        <div>
          <div class="weui-cells__title" id="lbl-visuals-title">${this.t('boardVisuals')}</div>
          <div class="weui-cells">
            <div class="weui-cell">
              <div class="weui-cell__bd" id="lbl-heatmap">${this.t('heatmap')}</div>
              <input type="checkbox" id="maia-chk-heatmap" class="weui-switch" checked />
            </div>
            <div class="weui-cell">
              <div class="weui-cell__bd" id="lbl-arrows">${this.t('arrows')}</div>
              <input type="checkbox" id="maia-chk-arrows" class="weui-switch" checked />
            </div>
          </div>
        </div>

        <!-- Game Review Entry Button -->
        <div class="weui-review-entry">
          <button type="button" id="btn-trigger-review" class="weui-btn-review">
            <span>📊</span>
            <span id="lbl-btn-review">${this.t('btnAnalyzeGame')}</span>
          </button>
        </div>

        <!-- Blunder Drill Navigation Box (shown during blunder drill inspection) -->
        <div id="maia-blunder-drill-box" style="display: none; margin-bottom: 8px;">
          <div class="weui-drill-nav-bar">
            <button type="button" class="weui-drill-btn" id="drill-btn-prev">◀ ${this.lang === 'zh' ? '上一处' : 'Prev'}</button>
            <button type="button" class="weui-drill-btn drill-title-btn" id="drill-btn-list">📋 ${this.lang === 'zh' ? '损耗榜' : 'Blunders'} (1/1)</button>
            <button type="button" class="weui-drill-btn" id="drill-btn-next">${this.lang === 'zh' ? '下一处' : 'Next'} ▶</button>
            <button type="button" class="weui-drill-btn drill-exit-btn" id="drill-btn-exit" title="${this.lang === 'zh' ? '退出复盘导览' : 'Exit drill'}">✕</button>
          </div>
          <div class="weui-segmented-bar" style="height: 26px; margin-top: 6px;">
            <button type="button" class="weui-segment active" id="drill-view-decision">⚡ ${this.lang === 'zh' ? '走棋前决策 (当前)' : 'Decision Point'}</button>
            <button type="button" class="weui-segment" id="drill-view-result">${this.lang === 'zh' ? '走出后局面' : 'Resulting Board'}</button>
          </div>
          <div class="weui-blunder-drill-card" id="drill-info-card"></div>
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
        this.currentElo = elo;
        try {
          localStorage.setItem('maia3_target_elo', String(elo));
        } catch (e) {}
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
        try {
          localStorage.setItem('maia3_target_elo', String(elo));
        } catch (e) {}
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

    // 6. Game Review Trigger, Back & Close Buttons
    const triggerReviewBtn = this.container.querySelector('#btn-trigger-review');
    const reviewDrawer = this.container.querySelector('#weui-review-overlay');
    const reviewCloseBtn = this.container.querySelector('#btn-close-review');
    const backReviewBtn = this.container.querySelector('#weui-btn-back-review');

    if (triggerReviewBtn && reviewDrawer) {
      triggerReviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (reviewDrawer.style.display === 'flex') {
          reviewDrawer.style.display = 'none';
        } else {
          if (this.lastReviewResult) {
            reviewDrawer.style.display = 'flex';
            if (backReviewBtn) backReviewBtn.style.display = 'none';
            this.renderReviewResults(this.lastReviewResult);
          } else {
            this.startReview();
          }
        }
      });
    }

    if (backReviewBtn && reviewDrawer) {
      backReviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reviewDrawer.style.display = 'flex';
        backReviewBtn.style.display = 'none';
        if (this.lastReviewResult) {
          this.renderReviewResults(this.lastReviewResult);
        }
      });
    }

    if (reviewCloseBtn && reviewDrawer) {
      reviewCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reviewDrawer.style.display = 'none';
        if (this.lastReviewResult && backReviewBtn) {
          backReviewBtn.style.display = 'inline-flex';
        }
      });
    }

    // 7. Blunder Drill Navigation Controls
    const drillPrevBtn = this.container.querySelector('#drill-btn-prev');
    const drillNextBtn = this.container.querySelector('#drill-btn-next');
    const drillListBtn = this.container.querySelector('#drill-btn-list');
    const drillExitBtn = this.container.querySelector('#drill-btn-exit');
    const drillViewDecision = this.container.querySelector('#drill-view-decision');
    const drillViewResult = this.container.querySelector('#drill-view-result');

    if (drillPrevBtn) {
      drillPrevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeDrill && this.activeDrill.index > 0) {
          this.startBlunderDrill(this.activeDrill.results, this.activeDrill.index - 1, this.activeDrill.filteredMoments, this.activeDrill.viewMode);
        }
      });
    }

    if (drillNextBtn) {
      drillNextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeDrill && this.activeDrill.index < this.activeDrill.filteredMoments.length - 1) {
          this.startBlunderDrill(this.activeDrill.results, this.activeDrill.index + 1, this.activeDrill.filteredMoments, this.activeDrill.viewMode);
        }
      });
    }

    if (drillListBtn) {
      drillListBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const drawer = this.container.querySelector('#weui-review-overlay');
        if (drawer) {
          drawer.style.display = 'flex';
          if (this.activeDrill?.results) {
            this.renderReviewResults(this.activeDrill.results);
          }
        }
      });
    }

    if (drillExitBtn) {
      drillExitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearBlunderDrill();
      });
    }

    if (drillViewDecision) {
      drillViewDecision.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeDrill && this.activeDrill.viewMode !== 'decision') {
          this.startBlunderDrill(this.activeDrill.results, this.activeDrill.index, this.activeDrill.filteredMoments, 'decision');
        }
      });
    }

    if (drillViewResult) {
      drillViewResult.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeDrill && this.activeDrill.viewMode !== 'result') {
          this.startBlunderDrill(this.activeDrill.results, this.activeDrill.index, this.activeDrill.filteredMoments, 'result');
        }
      });
    }
  }

  async startReview(forceRefresh = false) {
    if (this.isFairPlayLocked) {
      alert(this.lang === 'zh'
        ? '🛡️ 当前对局仍在进行中！根据公平竞技铁律，严禁在对局中提供任何引擎与复盘服务。请待对局完全结束后再复盘。'
        : '🛡️ Live game active! Per Fair Play rules, engine review is disabled during live games.');
      return;
    }
    const reviewDrawer = this.container.querySelector('#weui-review-overlay');
    const reviewBody = this.container.querySelector('#weui-review-body');
    if (!reviewDrawer || !reviewBody) return;

    reviewDrawer.style.display = 'flex';
    reviewBody.innerHTML = `
      <div class="weui-review-progress-box">
        <div class="weui-review-progress-title">
          <span>⏳</span> <span id="review-phase-title">${this.t('reviewRunning')}</span>
        </div>
        <div class="weui-progress-track" style="height: 6px;">
          <div id="review-bar-fill" class="weui-progress-bar" style="width: 0%; background: var(--weui-BRAND);"></div>
        </div>
        <div class="weui-review-progress-sub" id="review-progress-detail">0% (0 / 0)</div>
        <button type="button" class="weui-review-cancel-btn" id="btn-cancel-review">${this.t('btnCancelReview')}</button>
      </div>
    `;

    const cancelBtn = reviewBody.querySelector('#btn-cancel-review');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (this.onCancelReview) this.onCancelReview();
        reviewDrawer.style.display = 'none';
      });
    }

    try {
      if (!this.onAnalyzeGame) {
        throw new Error(this.lang === 'zh' ? '未配置全局分析器' : 'Review analyzer not configured');
      }
      const results = await this.onAnalyzeGame(forceRefresh);
      if (results) {
        this.lastReviewResult = results;
        this.renderReviewResults(results);
      }
    } catch (err) {
      console.warn('[IntuitionPanel] Review error:', err);
      reviewBody.innerHTML = `
        <div class="weui-review-progress-box">
          <div style="color: var(--weui-RED); font-size: 13px; font-weight: 700;">⚠️ ${this.t('reviewError')}</div>
          <div style="font-size: 11px; color: var(--weui-FG-HALF); line-height: 1.5;">${err.message || (this.lang === 'zh' ? '无法提取当前棋局走法，请确保棋盘处于对局或复盘模式。' : 'Unable to extract game moves from page.')}</div>
          <button type="button" class="weui-btn-primary" style="margin-top: 8px; align-self: center;" id="btn-retry-review">${this.lang === 'zh' ? '重试复盘' : 'Retry'}</button>
        </div>
      `;
      reviewBody.querySelector('#btn-retry-review')?.addEventListener('click', () => this.startReview(true));
    }
  }

  updateReviewProgress(prog) {
    if (!this.container) return;
    const bar = this.container.querySelector('#review-bar-fill');
    const detail = this.container.querySelector('#review-progress-detail');
    const title = this.container.querySelector('#review-phase-title');
    if (bar) bar.style.width = `${prog.percent}%`;
    if (detail) {
      const stepText = prog.currentMove ? `· ${prog.currentMove}` : '';
      detail.textContent = `${prog.percent}% (${prog.current} / ${prog.total}) ${stepText}`;
    }
    if (title && prog.phase === 'intuition') {
      title.textContent = this.lang === 'zh' ? '正在匹配人类直觉盲区...' : 'Detecting human intuition traps...';
    }
  }

  renderReviewResults(results) {
    const reviewBody = this.container.querySelector('#weui-review-body');
    if (!reviewBody || !results) return;

    const filter = this.reviewFilter || 'all';
    const filteredMoments = results.keyMoments.filter(m => {
      if (filter === 'w') return m.turn === 'w';
      if (filter === 'b') return m.turn === 'b';
      return true;
    });

    const isZh = this.lang === 'zh';

    reviewBody.innerHTML = `
      <!-- Stats Overview Grid -->
      <div class="weui-review-stats-grid">
        <div class="weui-stat-card">
          <div class="weui-stat-num stat-blunder">${results.blundersCount}</div>
          <div class="weui-stat-label">${this.t('blunderLabel')}</div>
        </div>
        <div class="weui-stat-card">
          <div class="weui-stat-num stat-mistake">${results.mistakesCount}</div>
          <div class="weui-stat-label">${this.t('mistakeLabel')}</div>
        </div>
        <div class="weui-stat-card">
          <div class="weui-stat-num stat-inaccuracy">${results.inaccuraciesCount}</div>
          <div class="weui-stat-label">${this.t('inaccuracyLabel')}</div>
        </div>
        <div class="weui-stat-card">
          <div class="weui-stat-num stat-acpl" style="font-size: 11px;">${results.acplWhite}/${results.acplBlack}</div>
          <div class="weui-stat-label">${isZh ? '均损(白/黑)' : 'ACPL(W/B)'}</div>
        </div>
      </div>

      <!-- Filter Controls & Re-analyze -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
        <div class="weui-segmented-bar" style="height: 26px; width: 195px;">
          <button type="button" class="weui-segment ${filter === 'all' ? 'active' : ''}" data-review-filter="all">${isZh ? '全部' : 'All'} (${results.keyMoments.length})</button>
          <button type="button" class="weui-segment ${filter === 'w' ? 'active' : ''}" data-review-filter="w">${isZh ? '白棋' : 'White'}</button>
          <button type="button" class="weui-segment ${filter === 'b' ? 'active' : ''}" data-review-filter="b">${isZh ? '黑棋' : 'Black'}</button>
        </div>
        <button type="button" class="weui-review-cancel-btn" style="margin: 0; padding: 3px 8px; font-size: 10px;" id="btn-reanalyze-review">🔄 ${isZh ? '重新分析' : 'Re-run'}</button>
      </div>

      <!-- Blunder List -->
      <div class="weui-moves-list" id="review-blunder-list" style="gap: 8px;">
        ${filteredMoments.length === 0 ? `
          <div style="padding: 20px 10px; text-align: center; color: var(--weui-FG-2); font-size: 11.5px;">
            ${this.t('noBlundersFound')}
          </div>
        ` : filteredMoments.map((item, idx) => {
          const isWhite = item.turn === 'w';
          const movePrefix = isWhite ? `${item.moveNumber}.` : `${item.moveNumber}...`;
          const severityIcon = item.severity === 'blunder' ? '🔴' : (item.severity === 'mistake' ? '🟠' : '🟡');
          const severityClass = `severity-${item.severity}`;
          const isCurrentActive = this.activeDrill && this.activeDrill.currentItem === item;
          const activeStyle = isCurrentActive ? 'outline: 2px solid var(--weui-BRAND); background: rgba(7, 193, 96, 0.08);' : '';
          const trapHtml = item.isHumanTrap ? `
            <div class="weui-blunder-trap-tip">
              💡 ${isZh ? `典型 <strong>${this.currentElo}</strong> 分段人类棋手有 <strong>${item.humanProbability}%</strong> 走出同样这步错棋（直觉盲区）` : `Typical <strong>${this.currentElo}</strong> players make this move <strong>${item.humanProbability}%</strong> of the time (Intuition Trap)`}
            </div>
          ` : '';

          return `
            <div class="weui-blunder-card ${severityClass}" data-moment-idx="${idx}" style="${activeStyle}">
              <div class="weui-blunder-row-top">
                <div class="weui-blunder-move-tag">
                  <span>${severityIcon}</span>
                  <span>${movePrefix} ${item.san}</span>
                </div>
                <div class="weui-blunder-loss-tag">${this.lang === 'zh' ? '损耗' : 'Loss'} ${item.lossPawns}</div>
              </div>
              <div class="weui-blunder-row-moves">
                <span>${isZh ? '实战' : 'Played'}: <span class="move-played-bad">${item.san}</span></span>
                <span style="color: var(--weui-FG-2);">➔</span>
                <span>${isZh ? '最优' : 'Best'}: <span class="move-best-good">${item.bestSan}</span></span>
              </div>
              <div class="weui-blunder-eval-row">
                <span>${isZh ? '局势突变' : 'Eval swing'}: ${item.evalBefore} ➔ ${item.evalAfter}</span>
                <span class="weui-blunder-jump-btn">${this.t('jumpToMove')}</span>
              </div>
              ${trapHtml}
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bind Filter clicks
    reviewBody.querySelectorAll('[data-review-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.reviewFilter = btn.dataset.reviewFilter;
        this.renderReviewResults(results);
      });
    });

    // Bind Re-analyze click (force fresh computation)
    reviewBody.querySelector('#btn-reanalyze-review')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startReview(true);
    });

    // Bind Jump-to-move clicks on blunder cards
    reviewBody.querySelectorAll('.weui-blunder-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const idx = parseInt(card.dataset.momentIdx, 10);
        const item = filteredMoments[idx];
        if (!item) return;

        this.startBlunderDrill(results, idx, filteredMoments, 'decision');
      });
    });
  }

  startBlunderDrill(results, index, filteredMoments = null, viewMode = 'decision') {
    const moments = filteredMoments || results.keyMoments;
    const item = moments[index];
    if (!item) return;

    this.activeDrill = {
      results,
      index,
      filteredMoments: moments,
      currentItem: item,
      viewMode
    };

    // Hide review drawer
    const reviewDrawer = this.container.querySelector('#weui-review-overlay');
    if (reviewDrawer) reviewDrawer.style.display = 'none';

    // Show drill box
    const drillBox = this.container.querySelector('#maia-blunder-drill-box');
    if (drillBox) drillBox.style.display = 'block';

    // Update navigation buttons
    const prevBtn = this.container.querySelector('#drill-btn-prev');
    const nextBtn = this.container.querySelector('#drill-btn-next');
    const listBtn = this.container.querySelector('#drill-btn-list');
    if (prevBtn) prevBtn.disabled = index <= 0;
    if (nextBtn) nextBtn.disabled = index >= moments.length - 1;
    if (listBtn) {
      listBtn.textContent = `📋 ${this.lang === 'zh' ? '损耗榜' : 'Blunders'} (${index + 1}/${moments.length})`;
    }

    // Update perspective buttons
    const viewDecBtn = this.container.querySelector('#drill-view-decision');
    const viewResBtn = this.container.querySelector('#drill-view-result');
    if (viewDecBtn) viewDecBtn.className = `weui-segment ${viewMode === 'decision' ? 'active' : ''}`;
    if (viewResBtn) viewResBtn.className = `weui-segment ${viewMode === 'result' ? 'active' : ''}`;

    // Update info card
    const infoCard = this.container.querySelector('#drill-info-card');
    if (infoCard) {
      const isZh = this.lang === 'zh';
      const isWhite = item.turn === 'w';
      const movePrefix = isWhite ? `${item.moveNumber}.` : `${item.moveNumber}...`;
      const severityIcon = item.severity === 'blunder' ? '🔴' : (item.severity === 'mistake' ? '🟠' : '🟡');
      const sideText = isWhite ? (isZh ? '白棋' : 'White') : (isZh ? '黑棋' : 'Black');

      const trapHtml = item.isHumanTrap ? `
        <div class="weui-blunder-trap-tip">
          💡 ${isZh ? `典型 <strong>${this.currentElo}</strong> 分段人类棋手有 <strong>${item.humanProbability}%</strong> 走出同样这步错棋（直觉盲区）` : `Typical <strong>${this.currentElo}</strong> players make this move <strong>${item.humanProbability}%</strong> of the time`}
        </div>
      ` : '';

      infoCard.className = `weui-blunder-drill-card severity-${item.severity}`;
      infoCard.innerHTML = `
        <div class="weui-blunder-row-top">
          <div class="weui-blunder-move-tag">
            <span>${severityIcon}</span>
            <span>${movePrefix} ${item.san}</span>
            <span style="font-size: 10px; color: var(--weui-FG-HALF); font-weight: 500;">(${sideText})</span>
          </div>
          <div class="weui-blunder-loss-tag">${isZh ? '损耗' : 'Loss'} ${item.lossPawns}</div>
        </div>
        <div class="weui-blunder-row-moves">
          <span>${isZh ? '实战' : 'Played'}: <span class="move-played-bad">${item.san}</span></span>
          <span style="color: var(--weui-FG-2);">➔</span>
          <span>${isZh ? '最优' : 'Best'}: <span class="move-best-good">${item.bestSan}</span></span>
        </div>
        <div class="weui-blunder-eval-row">
          <span>${isZh ? '局势突变' : 'Eval swing'}: ${item.evalBefore} ➔ ${item.evalAfter}</span>
          <span style="font-size: 9.5px; color: var(--weui-FG-HALF);">${viewMode === 'decision' ? (isZh ? '📍 走棋前决策' : '📍 Decision point') : (isZh ? '📍 走出后局面' : '📍 Resulting board')}</span>
        </div>
        <div class="weui-drill-legend">
          <span class="weui-drill-legend-item"><span style="color:#ef4444; font-weight: 700;">❌ 虚线:</span> ${isZh ? '实战错手' : 'Played'}</span>
          <span class="weui-drill-legend-item"><span style="color:#10b981; font-weight: 700;">🐟 实线:</span> ${isZh ? '推荐正着' : 'Best'}</span>
          <span class="weui-drill-legend-item"><span style="color:#f59e0b; font-weight: 700;">🧠 实线:</span> ${isZh ? '人类直觉' : 'Intuition'}</span>
        </div>
        ${trapHtml}
      `;
    }

    if (this.onSelectBlunder) {
      this.onSelectBlunder(results, index, moments, viewMode);
    }
  }

  clearBlunderDrill() {
    this.activeDrill = null;
    const drillBox = this.container.querySelector('#maia-blunder-drill-box');
    if (drillBox) drillBox.style.display = 'none';
    if (this.onClearBlunderDrill) {
      this.onClearBlunderDrill();
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
      if (state === 'ready') {
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

  setLanguage(lang) {
    this.lang = lang;
    try {
      localStorage.setItem('maia3_lang', lang);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ maia3_lang: lang });
      }
    } catch (e) {}

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

    const lblCdnUrl = this.container.querySelector('#lbl-cdn-url');
    if (lblCdnUrl) lblCdnUrl.textContent = this.t('lblCdnUrl');

    const cdnSaveBtn = this.container.querySelector('#cdn-save-btn');
    if (cdnSaveBtn && cdnSaveBtn.textContent !== '已保存' && cdnSaveBtn.textContent !== 'Saved') {
      cdnSaveBtn.textContent = this.t('btnSave');
    }

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

    const lblBtnReview = this.container.querySelector('#lbl-btn-review');
    if (lblBtnReview) lblBtnReview.textContent = this.t('btnAnalyzeGame');

    const lblReviewTitle = this.container.querySelector('#lbl-review-title');
    if (lblReviewTitle) lblReviewTitle.textContent = this.t('reviewTitle');

    const turnPill = this.container.querySelector('#maia-turn-pill');
    if (turnPill) {
      const isWhite = this.currentTurn === 'w';
      turnPill.textContent = isWhite ? this.t('white') : this.t('black');
    }

    if (this.lastReviewResult) {
      const reviewDrawer = this.container.querySelector('#weui-review-overlay');
      if (reviewDrawer && reviewDrawer.style.display === 'flex') {
        this.renderReviewResults(this.lastReviewResult);
      }
    }

    if (this.fab) {
      const fabTitle = this.fab.querySelector('.weui-float-title');
      if (fabTitle) fabTitle.textContent = this.t('floatTitle');
    }

    if (this.activeDrill) {
      this.startBlunderDrill(this.activeDrill.results, this.activeDrill.index, this.activeDrill.filteredMoments, this.activeDrill.viewMode);
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
        turnPill.textContent = this.lang === 'zh' ? '🛡️ 对局中' : '🛡️ Live';
        turnPill.className = 'weui-turn-tag';
      }

      if (movesContainer) {
        movesContainer.innerHTML = `
          <div class="weui-fair-play-banner" style="padding: 24px 14px; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 8px;">🛡️</div>
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
          insightText.innerHTML = `${this.lang === 'zh' ? `建议走 <strong>${sf.bestMove.san}</strong> (评估评分: ${sf.score})。` : `Recommended <strong>${sf.bestMove.san}</strong> (Eval: ${sf.score}).`}<br><span style="color: var(--weui-FG-1); font-size: 11px;">${this.lang === 'zh' ? 'Maia-3 载入就绪后将立即呈现人类直觉热力图。' : 'Attention heatmap will display once Maia-3 is ready.'}</span>`;
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
      
      let sfHtml = '';
      if (predictionData.stockfish && predictionData.stockfish.bestMove) {
        const sf = predictionData.stockfish;
        const sfLabel = this.lang === 'zh' ? '🐟 顶级引擎建议' : '🐟 Engine Best';
        const evalPrefix = this.lang === 'zh' ? '局面' : 'Eval';
        const deltaHtml = comp.deltaText ? `<span class="weui-delta-tag ${parseFloat(comp.deltaText) <= -1.0 ? 'tag-blunder' : 'tag-slight'}" style="margin-left: 6px;" title="${this.t('deltaLoss')}">Δ ${comp.deltaText}</span>` : '';
        sfHtml = `
          <div class="weui-sf-mini-row" style="margin-top: 6px; padding-top: 4px; border-top: 0.5px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
            <span>${sfLabel}: <strong>${sf.bestMove.san}</strong> ${deltaHtml}</span>
            <span class="weui-sf-eval" style="color: var(--weui-BRAND); font-weight: 700;">${evalPrefix} ${sf.score}</span>
          </div>
        `;
      }
      insightText.innerHTML = `${summary}${sfHtml}`;
    } else if (predictionData.analysis) {
      insightBadge.textContent = this.t('intuitionBadge');
      insightBadge.className = 'weui-insight-badge';
      insightBox.className = 'weui-insight-box';
      insightText.textContent = predictionData.analysis.commentary;
    }

    // Maia Human Candidates Move List
    if (!predictionData.moves || predictionData.moves.length === 0) {
      movesContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--weui-FG-2); font-size: 11.5px;">${this.t('noLegalMoves')}</div>`;
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

      let deltaBadge = '';
      if (move.deltaText !== undefined) {
        if (move.deltaText === '0.00' || isSfMatch) {
          deltaBadge = `<span class="weui-delta-tag tag-best" title="${this.lang === 'zh' ? '引擎最佳' : 'Best'} (Δ 0.00)">0.00</span>`;
        } else {
          const numDelta = parseFloat(move.deltaText);
          const isBlunder = numDelta <= -1.0;
          deltaBadge = `<span class="weui-delta-tag ${isBlunder ? 'tag-blunder' : 'tag-slight'}" title="${this.t('deltaLoss')} Δ: ${move.deltaText}">Δ ${move.deltaText}</span>`;
        }
      }

      row.innerHTML = `
        <div class="weui-move-main">
          <div class="weui-move-left">
            <span class="weui-rank-tag ${idx === 0 ? 'rank-1' : ''}">${idx + 1}</span>
            <span class="weui-move-san">${move.san} ${isSfMatch ? `<span style="font-size: 9.5px; color: var(--weui-BRAND); font-weight: 700;">(${this.t('consensus')})</span>` : ''}</span>
          </div>
          <div class="weui-move-right">
            ${deltaBadge}
            <span class="weui-move-prob">${move.prob}%</span>
          </div>
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

  showCustomInsight({ badge, text, isTrap = false }) {
    if (!this.container) return;
    const insightCard = this.container.querySelector('#maia-insight-card');
    const badgeEl = this.container.querySelector('#maia-insight-badge');
    const textEl = this.container.querySelector('#maia-insight-text');
    if (!insightCard || !badgeEl || !textEl) return;

    badgeEl.textContent = badge;
    badgeEl.className = `weui-insight-badge ${isTrap ? 'badge-trap' : ''}`;
    insightCard.className = `weui-insight-box ${isTrap ? 'alert-trap' : ''}`;
    textEl.innerHTML = text;
    insightCard.style.display = 'block';
  }
}
