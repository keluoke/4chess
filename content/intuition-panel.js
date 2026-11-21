/**
 * Floating study panel: engine quality and Maia predictions on permitted boards.
 * Compact summaries, explicit minimize/collapse/hide, and keyboard preview share
 * the same fair-play lock as every analysis entry point.
 */
import { engineLines, whiteEvaluation, comparableScoreDelta } from '../engine/position-lines.js';
import { FairPlayGuard } from './fair-play-guard.js';
import { MAIA_VARIANTS } from '../engine/engine-variants.js';
import { readEnginePreferences, engineExperienceHint } from '../engine/engine-preferences.js';

let appearanceListenerInstalled = false;

const I18N = {
  zh: {
    panelTitle: '歧路 Diverge',
    white: '⚪ 白方',
    black: '⚫ 黑方',
    whiteThinking: '⚪ 白方 · 研判中',
    blackThinking: '⚫ 黑方 · 研判中',
    btnMore: '设置 (语言/模型/视觉)',
    btnClose: '最小化到侧边入口',
    drawerTitle: '复盘偏好',
    lblLang: '界面语言',
    lblModelSpec: 'Maia 模型',
    maiaEngine: 'Maia 3',
    sfEngine: 'SF19 Lite · 悬浮窗',
    notStarted: '未启动',
    connecting: '正在连接...',
    starting: '启动中...',
    readyWasm: '就绪 (WASM)',
    readyLocal: '就绪 (本地 CPU)',
    initError: '启动异常',
    eloTitle: '模拟棋手等级',
    eloDesc: {
      1100: '1100 · 初学棋手直觉',
      1500: '1500 · 进阶棋手直觉',
      1900: '1900 · 俱乐部高手直觉',
      2200: '2200 · 高等级棋手直觉'
    },
    boardVisuals: '棋盘显示',
    heatmap: 'Maia 落点偏好热力图',
    arrows: 'Maia 候选箭头',
    sfArrows: 'Stockfish 最佳箭头',
    dualIntro: '引擎看质量，Maia 看人类偏好',
    maiaLegend: '金色实线 · M Maia 预测',
    sfLegend: '蓝色实线 · ★ 引擎最佳',
    consensusLegend: '绿色 ★ M · 两者首选一致',
    heatmapHelp: '暖色越深，Maia 越常选择这个落点；是相对强度，不是胜率或危险程度。',
    guide: '使用指南与图例 ↗',
    about: '关于 · 署名与许可 ↗',
    collapsedTitle: '悬浮窗已收起',
    collapsedHelp: '保留侧栏覆盖。展开后查看双引擎对比。',
    expand: '展开分析',
    sfWebPreference: '网页版复盘引擎',
    visualLegend: '数值与箭头说明',
    sfWebOnly: '此选项只影响网页版全盘复盘。悬浮窗始终使用 SF19 Lite。',
    modelHelp: '首次使用下载所选模型，各版本缓存独立；对局中只保存选择，结束后加载。',
    modelSaved: '已保存；允许分析时加载所选模型。',
    candidates: '人类直觉候选着法',
    whiteCandidates: '白方候选着法',
    blackCandidates: '黑方候选着法',
    thinking: '计算中...',
    consensus: '共识',
    engineBest: '★ 引擎最优',
    noLegalMoves: '局面绝杀或无合法着法',
    readingState: '⏳ 正在读取局面...',
    consensusBadge: '★ M 人机高度共识',
    divergenceBadge: '⚠️ 人机着法分歧',
    intuitionBadge: 'M Maia 直觉首选',
    evalLabel: '白方评分',
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
    sfEngine: 'SF19 Lite · Panel',
    notStarted: 'Not Started',
    connecting: 'Connecting...',
    starting: 'Starting...',
    readyWasm: 'Ready (WASM)',
    readyLocal: 'Ready (Local CPU)',
    initError: 'Init Error',
    eloTitle: 'Simulated player rating',
    eloDesc: {
      1100: '1100 · Beginner Intuition',
      1500: '1500 · Intermediate Intuition',
      1900: '1900 · Advanced Intuition',
      2200: '2200 · Higher-rated intuition'
    },
    boardVisuals: 'Visual Overlays',
    heatmap: 'Maia destination heatmap',
    arrows: 'Maia candidate arrows',
    sfArrows: 'Stockfish best-move arrow',
    dualIntro: 'Stockfish quality · Maia likelihood',
    maiaLegend: 'Gold solid · M Maia prediction',
    sfLegend: 'Blue solid · ★ Engine best',
    consensusLegend: 'Green ★ M · Both favor the same move',
    heatmapHelp: 'Warmer squares are more common Maia destinations. Relative intensity, not win probability or danger.',
    guide: 'Guide & visual legend ↗',
    about: 'About · Credits & licenses ↗',
    collapsedTitle: 'Panel collapsed',
    collapsedHelp: 'Sidebar cover remains. Expand to compare both engines.',
    expand: 'Expand analysis',
    sfWebPreference: 'Web review engine',
    visualLegend: 'Scores & arrow guide',
    sfWebOnly: 'This choice applies to the web review studio. The floating panel always uses SF19 Lite.',
    modelHelp: 'Downloads on first use; each model is cached separately. During a live game, selection is saved and loading waits until it ends.',
    modelSaved: 'Saved; the selected model loads when analysis is permitted.',
    candidates: 'Candidate Moves',
    whiteCandidates: 'White Candidates',
    blackCandidates: 'Black Candidates',
    thinking: 'Thinking...',
    consensus: 'Best',
    engineBest: '★ Engine Best',
    noLegalMoves: 'Checkmate or no legal moves',
    readingState: '⏳ Reading position...',
    consensusBadge: '★ M High Consensus',
    divergenceBadge: '⚠️ Engine Divergence',
    intuitionBadge: 'M Maia Intuition',
    evalLabel: 'White eval',
    deltaLoss: 'Score change from the engine best; negative means weaker',
    floatTitle: 'Diverge',
    btnStandaloneStudio: 'Full Game Analysis',
    fairPlayTitle: 'Live Game Active · Fair Play Guard',
    fairPlayDesc: 'Per Fair Play Anti-Cheat rules, engine assistance, candidate arrows, and attention heatmaps are strictly disabled during live matches.',
    fairPlayUnlockTip: '✓ Unlocks automatically upon game conclusion',
    fairPlayLocked: 'Live Match · Locked'
  }
};

Object.assign(I18N.zh, {
  waiting: '等待棋盘 · 未启动', unknown: '正在确认对局状态 · 分析暂停',
  reading: '允许分析 · 正在读取局面', concluded: '对局已结束 · 正在读取局面',
  protectedHelp: '对局结束后自动恢复复盘。', unknownHelp: '确认已完赛或进入分析台后自动恢复。',
  waitingHelp: '打开分析台或已完赛棋谱即可开始。',
  positionLabel: '当前局面', prediction: 'Maia 预测', likelihood: '选择率', loss: '评分变化',
  probabilityHelp: '选择率是 Maia 对目标等级棋手的预测，不是胜率或该局面的实测统计。',
  scoreHelp: '评分以兵为单位，正值对白方有利。Δ 是当前行棋方相对引擎首选的评分差。— 表示尚无评分。',
  preview: '预览箭头', previewHelp: '悬停、聚焦或点击候选可预览箭头；再次点击取消。',
  expandDetails: '展开详情', displaySettings: '棋盘显示', resetPosition: '恢复默认位置',
  collapseContent: '收起内容（保留侧栏）', hidePanel: '隐藏面板（从扩展菜单恢复）',
  dragHint: '拖动标题可移动面板；可在设置中恢复默认位置。',
  languageHelp: '语言与帮助', modelGroup: '模型与性能', webAdvanced: '网页版复盘偏好',
  lightModel: '轻量', balancedModel: '均衡', largeModel: '更大模型',
  retry: '重试', retryMaia: '重试 Maia 下载', retrySf: '重试引擎', switchLight: '切换轻量 5M',
  downloadingHelp: '首次下载，完成后缓存在浏览器；下次无需重复下载。',
  loadingModel: '正在准备直觉预测', sfOnly: '引擎结果可用 · 直觉预测尚未就绪',
  maiaOnly: '仅直觉预测 · 暂无质量评分', failedMaia: '直觉模型加载失败',
  failedSf: '质量引擎启动失败', retrying: '正在重试…',
  applied: '已应用', selected: '已选择', cached: '已缓存',
  openPosition: '在工作台打开当前局面', openGame: '免费全盘分析', freePosition: '免费局面深析',
  extracting: '正在提取棋谱…', opening: '正在打开工作台…',
  openFailed: '未能打开工作台，请重试。', noMoves: '未能取得完整的完赛棋谱。可以重试，或打开当前局面。',
  saveFailed: '设置保存失败，请重试。',
  importGame: '导入 PGN / 打开工作台',
  sameChoice: '双引擎一致', differentChoice: '首选不同 · 评分待确认', closeChoice: '首选不同 · 评分接近',
  notableChoice: '直觉着法存在评分损失', humanChoice: 'Maia 预测首选',
  compactLocked: '分析已暂停', compactLoading: '正在准备分析…',
  engines: '引擎详情', selectRating: '调整模拟棋手等级',
  positionOpened: '已在新标签页打开当前局面', gameOpened: '已在新标签页打开全盘分析',
  studioOpened: '已打开工作台，可导入 PGN',
  sfLines: 'Stockfish 19 Lite', maiaLines: 'Maia 人类直觉', outsideTop: '未进引擎前三 · 暂无评分',
  evaluationPending: '暂无可比评分', theme: '主题', systemTheme: '跟随系统', lightTheme: '浅色', darkTheme: '深色',
  customElo: '自定义等级分…', strongGap: '本次搜索中领先次优 {gap} 兵。',
  sharedFirst: '{move} 是引擎首选，Maia 预测选择率 {prob}%。',
  comparedMoves: 'Maia 首选 {maia}，引擎首选 {sf}。',
  moveLoss: '{move} 较引擎首选低 {gap} 兵。', estimatedLoss: '补算估计 {move} 较引擎首选低约 {gap} 兵。',
  mateDifference: '请对照将杀评分和续着。', higherRank: '引擎第 {rank} 位',
  partialSearch: '正在比较…'
});
Object.assign(I18N.en, {
  waiting: 'Waiting for a board · Not started', unknown: 'Verifying game state · Analysis paused',
  reading: 'Analysis permitted · Reading position', concluded: 'Game ended · Reading position',
  protectedHelp: 'Review resumes automatically when the game ends.', unknownHelp: 'Resumes after a verified game end or on an analysis board.',
  waitingHelp: 'Open an analysis board or a completed game to begin.',
  positionLabel: 'Current position', prediction: 'Maia prediction', likelihood: 'Choice %', loss: 'Score Δ',
  probabilityHelp: 'Maia predicts choices at the target rating. This is not win probability or observed statistics for this position.',
  scoreHelp: 'Scores are in pawns, positive for White. Δ is relative to the engine’s best move for the side to move. — means unscored.',
  preview: 'Preview arrow', previewHelp: 'Hover, focus or click a candidate to preview. Click again to clear.',
  expandDetails: 'Expand details', displaySettings: 'Board display', resetPosition: 'Reset position',
  collapseContent: 'Collapse content (keep sidebar)', hidePanel: 'Hide (restore from extension menu)',
  dragHint: 'Drag the title to move the panel. Reset its position in Settings.',
  languageHelp: 'Language & help', modelGroup: 'Model & performance', webAdvanced: 'Web review preferences',
  lightModel: 'Light', balancedModel: 'Balanced', largeModel: 'Larger model',
  retry: 'Retry', retryMaia: 'Retry Maia download', retrySf: 'Retry engine', switchLight: 'Switch to light 5M',
  downloadingHelp: 'First download; cached in your browser for later visits.',
  loadingModel: 'Preparing intuition predictions', sfOnly: 'Engine available · Intuition not ready',
  maiaOnly: 'Intuition only · Quality score unavailable', failedMaia: 'Intuition model failed to load',
  failedSf: 'Quality engine failed to start', retrying: 'Retrying…',
  applied: 'Applied', selected: 'Selected', cached: 'Cached',
  openPosition: 'Open position in studio', openGame: 'Free Full Game Analysis', freePosition: 'Free Deep Analysis',
  extracting: 'Extracting game…', opening: 'Opening studio…',
  openFailed: 'Could not open the studio. Please retry.', noMoves: 'Could not load the complete finished game. Retry or open the current position.',
  saveFailed: 'Could not save preferences. Please retry.',
  importGame: 'Import PGN / Open studio',
  sameChoice: 'Both engines agree', differentChoice: 'Different choices · Score pending', closeChoice: 'Different choices · Similar scores',
  notableChoice: 'Intuition move loses evaluation', humanChoice: 'Maia predicted choice',
  compactLocked: 'Analysis paused', compactLoading: 'Preparing analysis…',
  engines: 'Engine details', selectRating: 'Change simulated player rating',
  positionOpened: 'Opened current position in a new tab', gameOpened: 'Opened full game analysis in a new tab',
  studioOpened: 'Opened the studio for PGN import',
  sfLines: 'Stockfish 19 Lite', maiaLines: 'Maia Human Intuition', outsideTop: 'Outside the engine’s top three · Unscored',
  evaluationPending: 'Comparable scores unavailable', theme: 'Theme', systemTheme: 'System', lightTheme: 'Light', darkTheme: 'Dark',
  customElo: 'Custom rating…', strongGap: 'Leads the second choice by {gap} pawns in this search.',
  sharedFirst: '{move} is the engine’s first choice. Maia predicts a {prob}% choice rate.',
  comparedMoves: 'Maia favors {maia}. The engine favors {sf}.',
  moveLoss: '{move} trails the engine’s top move by {gap} pawns.', estimatedLoss: 'A follow-up search puts {move} about {gap} pawns behind.',
  mateDifference: 'See the mate scores and continuations.', higherRank: 'Engine rank {rank}',
  partialSearch: 'Comparing…'
});

export class IntuitionPanel {
  constructor({ onEloChange, onToggleChange, onMoveHover, onModelLoaded, onRetryEngine, onCdnSave, onOpenStandaloneAnalysis }) {
    this.onEloChange = onEloChange;
    this.onToggleChange = onToggleChange;
    this.onMoveHover = onMoveHover;
    this.onModelLoaded = onModelLoaded;
    this.onRetryEngine = onRetryEngine;
    this.onCdnSave = onCdnSave;
    this.onOpenStandaloneAnalysis = onOpenStandaloneAnalysis;

    this.container = null;
    this.fab = null;
    let closedPref = false;
    try {
      closedPref = sessionStorage.getItem('maia3_panel_closed') === 'true';
    } catch (e) {}
    this.isClosed = closedPref;
    try { this.isMinimized = sessionStorage.getItem('maia3_panel_minimized') === 'true'; } catch {}
    this.isHidden = false;
    try { this.isHidden = sessionStorage.getItem('maia3_panel_hidden') === 'true'; } catch {}
    this.enginePreferences = { maiaVariant: '5m', stockfishVariant: 'lite' };
    this.isFairPlayLocked = false;
    this.currentElo = 1900;
    this.lang = (navigator.language && navigator.language.startsWith('zh')) ? 'zh' : 'en';

    this.currentData = null;
    this.viewState = 'reading';
    this.fairPlayPhase = 'study';
    this.actionMode = 'game';
    this.retryingEngines = new Set();
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

    this.container.style.display = this.isHidden || this.isMinimized ? 'none' : 'flex';
    this.container.dataset.collapsed = String(this.isClosed);
    this.fab.style.display = this.isMinimized && !this.isHidden ? 'flex' : 'none';

    this.renderSkeleton();
    if (globalThis.chrome?.storage?.local) {
      const applyAppearance = (theme) => {
        const select = document.getElementById('panel-theme');
        if (select) select.value = theme === 'light' || theme === 'dark' ? theme : 'system';
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
    this.sizeObserver = new ResizeObserver(() => this.syncPanelSize());
    this.sizeObserver.observe(this.container);
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
          <span class="weui-navbar__title" id="txt-panel-title" title="${this.t('dragHint')}">${this.t('panelTitle')}</span>
          <span id="panel-engine-dot" class="weui-status-dot status-idle" role="img"></span>
          <span id="maia-turn-pill" class="weui-turn-tag turn-white">${this.t('white')}</span>
        </div>
        <!-- Iconic WeChat Mini-Program Capsule (小程序双键胶囊) -->
        <div class="weui-capsule">
          <button type="button" id="panel-display" class="weui-capsule-btn" aria-controls="cdn-config-drawer">?</button>
          <button type="button" id="weui-btn-more" class="weui-capsule-btn" title="${this.t('btnMore')}" aria-label="${this.t('btnMore')}">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9.5 3h5l.7 2.8 2 .9 2.6-1.4 2.5 4.4-1.9 2.2.1 2.1 1.9 2.3-2.5 4.3-2.7-1-2 .9-.7 2.7h-5l-.7-2.7-2-.9-2.7 1-2.5-4.3 1.9-2.3.1-2.1-1.9-2.2 2.5-4.4 2.6 1.4 2-.9z" transform="translate(1 1) scale(.9)"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <div class="weui-capsule-divider"></div>
          <button type="button" id="weui-btn-close" class="weui-capsule-btn" title="${this.t('btnClose')}" aria-label="${this.t('btnClose')}">
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 16h14"/></svg>
          </button>
        </div>
      </div>

      <div class="diverge-collapsed-summary"><strong id="compact-title"></strong><p id="compact-help"></p><button type="button" id="maia-restore" data-dg-text="expand"></button><a href="https://4chess.cc/guide/" target="_blank" rel="noopener" data-dg-text="guide"></a></div>
      <!-- Settings Dropdown Drawer (隐藏在设置胶囊内) -->
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

        <!-- 2. Elo Rating Selector -->
        <div class="weui-drawer-item">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="weui-drawer-label" id="lbl-elo-title">${this.t('eloTitle')}</div>
            <span id="maia-elo-val" style="color: var(--dg-green); font-weight: 700; font-size: 12px;">${this.currentElo}</span>
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
          <div class="weui-drawer-label" id="lbl-visuals-title" tabindex="-1">${this.t('boardVisuals')}</div>
          <div class="weui-cells" style="margin-top: 2px; border-radius: 8px; overflow: hidden; background: var(--dg-paper);">
            <div class="weui-cell" style="padding: 7px 10px;">
              <div class="weui-cell__bd" id="lbl-heatmap" style="font-size: 11.5px;">${this.t('heatmap')}</div>
              <input type="checkbox" id="maia-chk-heatmap" class="weui-switch" />
            </div>
            <div class="weui-cell" style="padding: 7px 10px; border-top: 0.5px solid var(--dg-line);">
              <div class="weui-cell__bd" id="lbl-arrows" style="font-size: 11.5px;">${this.t('arrows')}</div>
              <input type="checkbox" id="maia-chk-arrows" class="weui-switch" checked />
            </div>
            <div class="weui-cell"><div class="weui-cell__bd" data-dg-text="sfArrows"></div><input type="checkbox" id="maia-chk-sf-arrows" class="weui-switch" checked /></div>
          </div>
          <p class="diverge-help" data-dg-text="heatmapHelp"></p>
        </div>


        <!-- Maia model variants -->
        <div class="weui-drawer-item">
          <div class="weui-drawer-label" id="lbl-model-spec">${this.t('lblModelSpec')}</div>
          <div class="diverge-model-options">
            <button type="button" class="weui-preset-btn" data-model="5m"><strong>5M</strong><small>28 MiB</small></button>
            <button type="button" class="weui-preset-btn" data-model="23m"><strong>23M</strong><small>104 MiB</small></button>
            <button type="button" class="weui-preset-btn" data-model="79m"><strong>79M</strong><small>159 MiB</small></button>
          </div>
          <p class="diverge-help" data-dg-text="modelHelp"></p>
          <p class="diverge-help" id="engine-experience-hint" role="note" aria-live="polite"></p>
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
            <span id="cdn-status-label" style="color: var(--dg-green); font-weight: 600;">⚡ CDN 传输中...</span>
            <span id="cdn-speed-label" style="color: var(--dg-muted);">-- MB/s</span>
          </div>
          <div class="weui-progress-track" style="height: 5px; margin-bottom: 5px;">
            <div id="cdn-bar-fill" class="weui-progress-bar" style="width: 0%; background: var(--dg-green);"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--dg-muted);">
            <span id="cdn-bytes-label">0 / 28.0 MB</span>
            <span id="lbl-cdn-cache-tag">${this.lang === 'zh' ? '完成后缓存在浏览器' : 'Cached after download'}</span>
          </div>
        </div>


        <div id="panel-recovery" class="diverge-recovery" aria-live="polite" hidden></div>
        <div id="maia-insight-card" class="weui-insight-box" style="display:none">
          <div class="weui-insight-header">
            <span id="maia-insight-badge" class="weui-insight-badge" role="status"></span>
            <span class="weui-sf-eval" id="panel-white-score" hidden></span>
          </div>
          <div id="maia-insight-text"></div>
        </div>
        <section id="panel-stockfish" class="diverge-lines" aria-labelledby="panel-sf-title" hidden>
          <h3 class="diverge-list-title sf-title" id="panel-sf-title" data-dg-text="sfLines"></h3>
          <div id="panel-sf-lines" class="weui-moves-list"></div>
        </section>
        <section class="diverge-lines diverge-candidates" aria-labelledby="maia-moves-header-text">
          <div class="diverge-list-heading">
            <h3 class="diverge-list-title maia-title" id="maia-moves-header-text">${this.t('candidates')}</h3>
            <select id="panel-rating"></select>
          </div>
          <span id="maia-inference-time" class="diverge-load-label" role="status"></span>
          <div id="maia-moves-container" class="weui-moves-list">
            <p class="diverge-empty-state">${this.t('readingState')}</p>
          </div>
        </section>
      </div>
      <div class="weui-review-entry">
        <button type="button" id="btn-trigger-standalone" class="weui-btn-review">
          <span id="lbl-btn-standalone"></span><span aria-hidden="true">→</span>
        </button>
        <div id="panel-action-recovery" role="alert" hidden></div>
      </div>
    `;

    const body = this.container.querySelector('#maia-panel-body');
    const drawer = this.container.querySelector('#cdn-config-drawer');
    const [language, rating, visuals, models] = drawer.querySelectorAll(':scope > .weui-drawer-item');
    const legend = document.createElement('section');
    legend.className = 'weui-drawer-item diverge-visual-legend';
    legend.innerHTML = `<h3 data-dg-text="visualLegend"></h3>
      <span class="legend-consensus" data-dg-text="consensusLegend"></span>
      <p data-dg-text="probabilityHelp"></p><p data-dg-text="scoreHelp"></p>
      <a href="https://4chess.cc/guide/#dual-engines" target="_blank" rel="noopener" data-dg-text="guide"></a>`;
    const appearance = document.createElement('div');
    appearance.className = 'weui-drawer-item';
    appearance.innerHTML = `<label for="panel-theme" data-dg-text="theme"></label>
      <select id="panel-theme"><option value="system" data-dg-text="systemTheme"></option>
      <option value="light" data-dg-text="lightTheme"></option><option value="dark" data-dg-text="darkTheme"></option></select>`;
    drawer.append(visuals, legend, rating, models, appearance, language);
    const compact = document.createElement('section');
    compact.className = 'diverge-compact-position';
    compact.innerHTML = '<strong id="panel-compact-title"></strong><p id="panel-compact-detail"></p><button type="button" id="panel-expand" data-dg-text="expandDetails"></button>';
    body.before(compact);
    const engineDetails = document.createElement('div');
    engineDetails.className = 'weui-drawer-item diverge-engine-details';
    const summary = document.createElement('strong');
    summary.id = 'panel-engine-summary';
    engineDetails.append(summary, this.container.querySelector('.diverge-engine-status'));
    drawer.append(engineDetails);
    const positions = document.createElement('div'); positions.className = 'weui-drawer-item diverge-position-controls';
    positions.innerHTML = '<p class="diverge-help" data-dg-text="dragHint"></p><button type="button" id="panel-reset" data-dg-text="resetPosition"></button><button type="button" id="panel-collapse" data-dg-text="collapseContent" hidden></button>';
    drawer.append(positions);
    this.container.querySelector('#maia-elo-slider').setAttribute('aria-labelledby', 'lbl-elo-title');
    this.container.querySelectorAll('[data-elo], [data-lang], [data-model]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
    for (const [id, label] of [['maia-chk-heatmap', 'lbl-heatmap'], ['maia-chk-arrows', 'lbl-arrows'], ['maia-chk-sf-arrows', 'lbl-sf-arrows']]) {
      const oldLabel = this.container.querySelector('#' + label) || this.container.querySelector('[data-dg-text="sfArrows"]');
      const text = document.createElement('label'); text.id = label; text.htmlFor = id; text.className = oldLabel.className;
      text.textContent = oldLabel.textContent; if (oldLabel.dataset.dgText) text.dataset.dgText = oldLabel.dataset.dgText;
      oldLabel.replaceWith(text);
    }
    this.container.querySelector('#weui-btn-more').setAttribute('aria-controls', 'cdn-config-drawer');
    for (const id of ['weui-btn-more', 'panel-display']) this.container.querySelector('#' + id).setAttribute('aria-expanded', 'false');
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-labelledby', 'txt-drawer-title');
    this.container.querySelector('#maia-insight-badge').setAttribute('role', 'status');
    this.bindEvents();
    this.applyLanguage();
  }

  setupFabEvents() {
    if (!this.fab) return;

    let isDraggingFab = false;
    let hasMoved = false;
    let startX, startY, origLeft, origTop;

    this.fab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
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
        window.removeEventListener('pointermove', onMouseMove);
        window.removeEventListener('pointerup', onMouseUp);
        window.removeEventListener('pointercancel', onMouseUp);

        if (hasMoved) {
          const rect = this.fab.getBoundingClientRect();
          this._setStorage({ maia3_fab_pos: { left: rect.left, top: rect.top } });
        }
      };

      window.addEventListener('pointermove', onMouseMove);
      window.addEventListener('pointerup', onMouseUp);
      window.addEventListener('pointercancel', onMouseUp);
    });

    // Restore panel on click (if not dragged)
    this.fab.addEventListener('click', () => {
      if (!hasMoved) {
        this.open();
      }
    });

    this.fab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.open();
      }
    });
  }

  setSettings(open, focusTarget = null) {
    const drawer = this.container.querySelector('#cdn-config-drawer');
    if (open && drawer.style.display === 'none') this.drawerOpener = document.activeElement;
    drawer.style.display = open ? 'flex' : 'none';
    for (const id of ['weui-btn-more', 'panel-display'])
      this.container.querySelector('#' + id).setAttribute('aria-expanded', String(open));
    if (open) this.clearMovePreview();
    for (const child of this.container.children) {
      if (child !== drawer && !child.classList.contains('weui-navbar')) child.inert = open;
    }
    if (open) {
      const target = focusTarget ? drawer.querySelector(focusTarget) : drawer.querySelector('button');
      target?.focus(); target?.scrollIntoView({ block: 'nearest' });
    } else if (drawer.contains(document.activeElement)) {
      const opener = this.container.contains(this.drawerOpener) ? this.drawerOpener : this.container.querySelector('#weui-btn-more');
      opener?.focus({ preventScroll: true });
    }
  }

  close() {
    this.setSettings(false);
    this.clearMovePreview();
    this.isClosed = true;
    this.container.dataset.collapsed = 'true';
    sessionStorage.setItem('maia3_panel_closed', 'true');
    this.syncStudyChrome();
  }

  hide() {
    this.setSettings(false);
    this.clearMovePreview();
    this.isHidden = true;
    this.container.style.display = 'none';
    this.fab.style.display = 'none';
    sessionStorage.setItem('maia3_panel_hidden', 'true');
  }

  open() {
    this.isClosed = this.isHidden = this.isMinimized = false;
    this.fab.style.display = 'none';
    this.container.style.display = 'flex';
    this.container.dataset.collapsed = 'false';
    sessionStorage.setItem('maia3_panel_closed', 'false');
    sessionStorage.setItem('maia3_panel_hidden', 'false');
    sessionStorage.setItem('maia3_panel_minimized', 'false');
    this.fitPanel();
    this.syncPanelSize();
  }

  minimize() {
    this.setSettings(false);
    this.clearMovePreview();
    this.isMinimized = true;
    this.container.style.display = 'none';
    this.fab.style.display = 'flex';
    sessionStorage.setItem('maia3_panel_minimized', 'true');
    this.fitFab();
    this.fab.focus();
  }

  fitFab() {
    if (!this.fab || this.fab.style.display === 'none') return;
    const r = this.fab.getBoundingClientRect();
    this.fab.style.left = `${Math.max(8, Math.min(r.left, innerWidth - r.width - 8))}px`;
    this.fab.style.top = `${Math.max(8, Math.min(r.top, innerHeight - r.height - 8))}px`;
    this.fab.style.right = 'auto';
  }

  resetPosition() {
    this.userPositioned = false;
    this.expandedForSpace = false;
    this.container.style.left = ''; this.container.style.right = '20px'; this.container.style.top = '60px';
    this.fab.style.left = ''; this.fab.style.right = '18px'; this.fab.style.top = '75px';
    this._setStorage({ maia3_panel_pos: null, maia3_fab_pos: null });
    this.fitPanel(); this.fitFab();
  }

  syncPanelSize() {
    if (!this.container || this.container.style.display === 'none') return;
    const height = this.container.getBoundingClientRect().height;
    this.container.dataset.compact = String(height < 420);
    this.container.dataset.summaryOnly = String(height < 320);
    this.syncCompactSummary();
  }

  isPanelClosed() { return this.isHidden || this.isMinimized; }

  setEnginePreferences(prefs) {
    this.enginePreferences = prefs;
    this.container.querySelectorAll('[data-model]').forEach(btn => btn.classList.toggle('active', btn.dataset.model === prefs.maiaVariant));
    this.syncStudyChrome();
  }

  syncStudyChrome() {
    if (!this.container) return;
    const experience = this.container.querySelector('#engine-experience-hint');
    if (experience) { experience.textContent = engineExperienceHint(this.enginePreferences, this.lang, true); experience.hidden = !experience.textContent; }
    this.container.querySelectorAll('[data-dg-text]').forEach(el => { el.textContent = this.t(el.dataset.dgText); });
    const title = this.container.querySelector('#compact-title');
    if (title) title.textContent = this.isFairPlayLocked ? this.protectionCopy().title : this.t('collapsedTitle');
    const help = this.container.querySelector('#compact-help');
    if (help) help.textContent = this.isFairPlayLocked ? this.protectionCopy().help : this.t('collapsedHelp');
    const name = this.container.querySelector('#lbl-engine-maia');
    if (name) name.textContent = MAIA_VARIANTS[this.enginePreferences.maiaVariant]?.name || 'Maia-3';
    const sf = this.container.querySelector('#lbl-engine-sf');
    if (sf) sf.textContent = this.t('sfEngine');
    const modelHint = this.container.querySelector('#model-switch-hint');
    if (modelHint?.dataset.saved) modelHint.textContent = this.t('modelSaved');
    const collapseBtn = this.container.querySelector('#panel-collapse');
    if (collapseBtn) collapseBtn.hidden = this.container.dataset.adCover !== 'true';
    for (const [id, key] of [['maia-chk-heatmap', 'showHeatmap'], ['maia-chk-arrows', 'showArrows'], ['maia-chk-sf-arrows', 'showStockfishArrows']]) {
      const field = this.container.querySelector('#' + id); if (field) field.checked = this[key];
    }
    this.container.querySelectorAll('[data-model], [data-elo], [data-lang]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
    const rating = this.container.querySelector('#panel-rating');
    if (rating) {
      const choices = [...new Set([1100, 1500, 1900, 2200, this.currentElo])].sort((a, b) => a - b);
      rating.replaceChildren(...choices.map(value => new Option(`${value} Elo`, value)), new Option(this.t('customElo'), 'custom'));
      rating.value = this.currentElo;
      rating.setAttribute('aria-label', this.t('selectRating'));
    }
    if (this.fab) { this.fab.title = this.t('expand'); this.fab.setAttribute('aria-label', this.t('expand')); }
    this.syncCompactSummary();
    this.syncAction();
    this.container.querySelectorAll('a[href*="4chess.cc/guide"]').forEach(link => {
      const url = new URL(link.href); url.searchParams.set('lang', this.lang); link.href = url.href;
    });
  }

  fitPanel() {
    if (!this.container) return;
    let width = 320, height = 460;
    delete this.container.dataset.adCover;
    if (!this.userPositioned && !this.expandedForSpace && location.hostname.includes('chess.com')) {
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
    const collapseBtn = this.container.querySelector('#panel-collapse');
    if (collapseBtn) collapseBtn.hidden = this.container.dataset.adCover !== 'true';
    if (this.isClosed && this.container.dataset.adCover !== 'true') {
      this.isClosed = false;
      this.container.dataset.collapsed = 'false';
    }
    this.syncPanelSize();
    this.fitFab();
  }

  setElo(elo, triggerCallback = true, persist = true) {
    const parsed = parseInt(elo, 10);
    if (isNaN(parsed)) return;
    const val = Math.max(600, Math.min(2600, parsed));
    this.currentElo = val;
    if (persist) this._setStorage({ defaultElo: this.currentElo, maia3_target_elo: this.currentElo });
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
        b.setAttribute('aria-pressed', String(parseInt(b.dataset.elo, 10) === val));
      });
    }
    if (this.fab) {
      const eloBadge = this.fab.querySelector('#weui-float-elo');
      if (eloBadge) eloBadge.textContent = val;
    }
    if (triggerCallback && this.onEloChange) {
      clearTimeout(this.eloTimer);
      this.pendingElo = undefined;
      this.onEloChange(val);
    }
    this.syncStudyChrome();
  }

  bindEvents() {
    // 1. WeChat Capsule Close Button (⊙) -> Minimizes to WeChat Floating Ball
    const closeBtn = this.container.querySelector('#weui-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.minimize();
      });
    }

    // 2. WeChat Capsule More Button (•••) -> Toggles Settings Drawer
    const moreBtn = this.container.querySelector('#weui-btn-more');
    const cdnDrawer = this.container.querySelector('#cdn-config-drawer');
    const drawerCloseBtn = this.container.querySelector('#weui-btn-drawer-close');
    if (moreBtn && cdnDrawer) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setSettings(cdnDrawer.style.display === 'none');
      });
    }
    if (drawerCloseBtn && cdnDrawer) {
      drawerCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setSettings(false);
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
        this.setElo(elo, false, false);
        clearTimeout(this.eloTimer);
        this.pendingElo = elo;
        this.eloTimer = setTimeout(() => this.commitElo(), 220);
      });
      // Keyboard range changes emit `change` per key; only pointer release or
      // blur commits immediately. Keyboard edits share the short debounce.
      eloSlider.addEventListener('pointerup', () => this.commitElo());
      eloSlider.addEventListener('blur', () => this.commitElo());
    }

    // 4. WeChat Switches (Toggles)
    for (const [id, key] of [['maia-chk-heatmap', 'showHeatmap'], ['maia-chk-arrows', 'showArrows'], ['maia-chk-sf-arrows', 'showStockfishArrows']]) {
      this.container.querySelector('#' + id)?.addEventListener('change', event => {
        this[key] = event.target.checked;
        this._setStorage({ [key]: this[key] });
        this.onToggleChange?.({ [key]: this[key], opacity: this.opacity });
      });
    }

    this.container.querySelectorAll('[data-model]').forEach(btn => btn.addEventListener('click', () => this.saveModels({ maiaVariant: btn.dataset.model, cloudflareCdnUrl: MAIA_VARIANTS[btn.dataset.model].url })));
    this.container.querySelector('#maia-restore').addEventListener('click', () => this.open());
    const rating = this.container.querySelector('#panel-rating');
    rating.addEventListener('change', () => {
      if (rating.value === 'custom') {
        rating.value = this.currentElo;
        this.setSettings(true, '#maia-elo-slider');
      } else this.setElo(rating.value);
    });
    this.container.querySelector('#panel-display').addEventListener('click', () => this.setSettings(true, '#lbl-visuals-title'));
    const theme = this.container.querySelector('#panel-theme');
    theme.addEventListener('change', () => {
      for (const element of [this.container, this.fab]) {
        if (theme.value === 'system') delete element.dataset.theme;
        else element.dataset.theme = theme.value;
      }
      this._setStorage({ diverge_ui_theme: theme.value });
    });
    this.container.querySelector('#panel-reset').addEventListener('click', () => this.resetPosition());
    this.container.querySelector('#panel-collapse')?.addEventListener('click', () => this.close());
    this.container.querySelector('#panel-expand').addEventListener('click', () => {
      this.expandedForSpace = true; this.open(); this.container.querySelector('#weui-btn-more').focus();
    });
    this.container.addEventListener('keydown', event => {
      const drawerOpen = cdnDrawer.style.display !== 'none';
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (drawerOpen) this.setSettings(false); else this.clearMovePreview();
      }
      if (event.key === 'Tab' && drawerOpen) {
        const targets = [...cdnDrawer.querySelectorAll('button, input, select, a[href]')].filter(el => !el.disabled && el.checkVisibility());
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && (document.activeElement === first || !cdnDrawer.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !cdnDrawer.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    });

    // 6. Standalone Game Review Button
    const triggerStandaloneBtn = this.container.querySelector('#btn-trigger-standalone');
    if (triggerStandaloneBtn) {
      triggerStandaloneBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.openStandalone();
      });
    }
  }

  commitElo() {
    clearTimeout(this.eloTimer);
    if (this.pendingElo === undefined) return;
    const value = this.pendingElo; this.pendingElo = undefined;
    this.setElo(value);
  }

  async saveModels(changes) {
    try {
      const next = { ...this.enginePreferences, ...changes };
      if (globalThis.chrome?.storage?.local) await chrome.storage.local.set(next);
      this.setEnginePreferences(next);
      const hint = this.container.querySelector('#model-switch-hint');
      hint.dataset.saved = 'true';
      this.syncEngineSummary();
    } catch { this.showToast(this.t('saveFailed')); }
  }

  clearMovePreview() {
    this.pinnedMove = null;
    this.pinnedSource = null;
    this.previewMove(null);
  }

  previewMove(uci, source = this.pinnedSource) {
    if (uci && (!this.currentData?.fen || this.isFairPlayLocked || FairPlayGuard.isLiveGameInProgress())) return;
    for (const row of this.container.querySelectorAll('.weui-move-item')) {
      row.classList.toggle('is-preview', !!uci && row.dataset.uci === uci);
      row.setAttribute('aria-pressed', String(row.dataset.uci === this.pinnedMove));
    }
    this.onMoveHover?.(uci, source, this.currentData?.fen);
  }

  bindMovePreview(row, move, source) {
    row.tabIndex = 0;
    row.dataset.engine = source;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-pressed', String(this.pinnedMove === move.uci));
    row.setAttribute('aria-label', `${this.t('preview')} ${move.san}`);
    row.addEventListener('mouseenter', () => this.previewMove(move.uci, source));
    row.addEventListener('mouseleave', () => this.previewMove(this.pinnedMove));
    row.addEventListener('focus', () => this.previewMove(move.uci, source));
    row.addEventListener('blur', () => this.previewMove(this.pinnedMove));
    const activate = () => {
      if (this.isFairPlayLocked || FairPlayGuard.isLiveGameInProgress()) return;
      this.pinnedMove = this.pinnedMove === move.uci && this.pinnedSource === source ? null : move.uci;
      this.pinnedSource = this.pinnedMove ? source : null;
      this.previewMove(this.pinnedMove);
    };
    row.addEventListener('click', activate);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activate(); }
    });
  }

  setPositionContext(fen, mode = 'auto') {
    this.positionFen = fen;
    this.actionMode = mode;
    this.syncAction();
  }

  syncAction() {
    const button = this.container?.querySelector('#btn-trigger-standalone');
    if (!button) return;
    const key = this.actionBusy || (this.actionMode === 'position' ? 'freePosition' : 'openGame');
    this.container.querySelector('#lbl-btn-standalone').textContent = this.t(key);
    button.disabled = this.isFairPlayLocked || !!this.actionBusy;
    button.setAttribute('aria-busy', String(!!this.actionBusy));
    button.title = this.t(key);
  }

  setActionBusy(state) { this.actionBusy = state; this.syncAction(); }

  async openStandalone(mode = this.actionMode) {
    if (this.actionBusy || this.isFairPlayLocked || FairPlayGuard.isLiveGameInProgress()) return;
    this.container.querySelector('#panel-action-recovery').hidden = true;
    this.setActionBusy(mode === 'position' ? 'opening' : 'extracting');
    try {
      await this.onOpenStandaloneAnalysis?.(mode);
    } catch (error) {
      if (!this.isFairPlayLocked) {
        const recovery = this.container.querySelector('#panel-action-recovery');
        recovery.replaceChildren(); recovery.hidden = false;
        const text = document.createElement('p'); text.textContent = error?.message || this.t('openFailed'); recovery.append(text);
        for (const [key, target] of [['retry', mode], ['openPosition', 'position'], ['importGame', 'empty']]) {
          if (target === 'position' && !this.positionFen) continue;
          const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = this.t(key);
          retry.addEventListener('click', () => this.openStandalone(target)); recovery.append(retry);
        }
      }
    } finally { this.setActionBusy(null); }
  }
  protectionCopy() {
    const live = this.fairPlayPhase === 'live';
    return {
      title: this.t(live ? 'fairPlayTitle' : this.fairPlayPhase === 'lobby' ? 'waiting' : 'unknown'),
      help: this.t(live ? 'protectedHelp' : this.fairPlayPhase === 'lobby' ? 'waitingHelp' : 'unknownHelp')
    };
  }

  syncCompactSummary() {
    const title = this.container?.querySelector('#panel-compact-title');
    if (!title) return;
    let heading, detail;
    if (this.isFairPlayLocked) ({ title: heading, help: detail } = this.protectionCopy());
    else {
      const data = this.currentData;
      const top = data?.isAvailable ? data.moves?.[0] : null;
      const sf = data?.stockfish?.bestMove;
      heading = top ? `${this.t('prediction')}: ${top.san} · ${top.prob}%` : sf ? `SF19 Lite: ${sf.san}` : this.t(this.lastEngineStatus?.maia?.state === 'error' ? 'failedMaia' : this.lastEngineStatus?.stockfish?.state === 'error' ? 'failedSf' : this.viewState === 'thinking' || this.viewState === 'loading' ? 'compactLoading' : this.viewState === 'concluded' ? 'concluded' : 'reading');
      if (top || sf) heading = `${this.t(this.currentTurn === 'b' ? 'black' : 'white')} · ${heading}`;
      detail = top && sf ? `SF19 Lite: ${sf.san} · ${this.t('evalLabel')} ${this.formatWhiteScore(data.stockfish, data.turn) || '—'}` : sf ? this.t('sfOnly') : top ? this.t('maiaOnly') : this.t('expandDetails');
    }
    if (title.textContent !== heading) title.textContent = heading;
    const description = this.container.querySelector('#panel-compact-detail');
    if (description.textContent !== detail) description.textContent = detail;
    const expand = this.container.querySelector('#panel-expand');
    if (expand.textContent !== this.t('expandDetails')) expand.textContent = this.t('expandDetails');
  }

  syncEngineSummary() {
    const summary = this.container.querySelector('#panel-engine-summary');
    if (!summary) return;
    const stateText = name => {
      if (this.isFairPlayLocked) return this.t('notStarted');
      const state = this.lastEngineStatus?.[name]?.state;
      return state === 'ready' ? (this.lang === 'zh' ? '就绪' : 'Ready') : state === 'error' ? (this.lang === 'zh' ? '失败' : 'Failed') : state === 'uninitialized' || !state ? this.t('notStarted') : state === 'downloading' ? `${this.lastEngineStatus[name].percent || 0}%` : this.t('starting');
    };
    summary.textContent = `Maia ${stateText('maia')} · SF ${stateText('stockfish')}`;
    summary.title = this.t('engines');
    const dot = this.container.querySelector('#panel-engine-dot');
    const states = ['maia', 'stockfish'].map(name => this.lastEngineStatus?.[name]?.state || 'uninitialized');
    const appearance = this.isFairPlayLocked ? 'idle' : states.includes('error') ? 'error' :
      states.every(state => state === 'ready') ? 'ready' :
      states.some(state => state !== 'uninitialized' && state !== 'ready') ? 'loading' : 'idle';
    dot.className = `weui-status-dot status-${appearance}`;
    dot.title = `${summary.textContent} · ${MAIA_VARIANTS[this.enginePreferences.maiaVariant]?.name || 'Maia'} · Stockfish 19 Lite`;
    dot.setAttribute('aria-label', dot.title);
    this.container.dataset.initializing = String(appearance === 'loading' && !states.includes('downloading'));
    if (this.container.dataset.initializing === 'true')
      this.container.querySelector('#maia-inference-time').title = summary.textContent;
    const hint = this.container.querySelector('#model-switch-hint');
    if (hint?.dataset.saved && !this.isFairPlayLocked) {
      const state = this.lastEngineStatus?.maia;
      const model = MAIA_VARIANTS[this.enginePreferences.maiaVariant];
      if (state?.modelKey && state.modelKey !== model?.key) hint.textContent = this.t('modelSaved');
      else if (state?.state === 'error') hint.textContent = [this.t('failedMaia'), state.error].filter(Boolean).join(' · ');
      else hint.textContent = state?.state === 'ready' ? `${this.t('applied')} · ${MAIA_VARIANTS[this.enginePreferences.maiaVariant]?.name || 'Maia'}${state.source === 'IndexedDB 缓存' ? ` · ${this.t('cached')}` : ''}` : state?.state === 'downloading' ? `${this.t('selected')} · ${state.percent == null ? state.loadedMB + ' MiB' : state.percent + '%'}` : this.t('modelSaved');
    }
  }

  renderRecovery() {
    const area = this.container.querySelector('#panel-recovery');
    if (!area) return;
    // Do not replace focused recovery controls on every download/status notification.
    const errors = ['maia', 'stockfish'].filter(name => this.lastEngineStatus?.[name]?.state === 'error');
    const signature = `${this.lang}/${this.isFairPlayLocked}/${errors.join(',')}/${[...this.retryingEngines].join(',')}/${this.enginePreferences.maiaVariant}`;
    if (area.dataset.signature === signature) return;
    area.dataset.signature = signature;
    area.replaceChildren();
    area.hidden = this.isFairPlayLocked || errors.length === 0;
    if (area.hidden) return;
    for (const name of errors) {
      const text = document.createElement('p'); text.textContent = this.t(name === 'maia' ? 'failedMaia' : 'failedSf'); area.append(text);
      const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.retryEngine = name;
      retry.textContent = this.t(this.retryingEngines.has(name) ? 'retrying' : name === 'maia' ? 'retryMaia' : 'retrySf');
      retry.disabled = this.retryingEngines.has(name);
      retry.addEventListener('click', () => this.retryEngine(name)); area.append(retry);
    }
    if (errors.includes('maia') && this.enginePreferences.maiaVariant !== '5m') {
      const light = document.createElement('button'); light.type = 'button'; light.textContent = this.t('switchLight');
      light.addEventListener('click', () => this.saveModels({ maiaVariant: '5m', cloudflareCdnUrl: MAIA_VARIANTS['5m'].url })); area.append(light);
    }
  }

  async retryEngine(name) {
    if (this.isFairPlayLocked || FairPlayGuard.isLiveGameInProgress() || this.retryingEngines.has(name)) return;
    this.retryingEngines.add(name); this.renderRecovery();
    try { await (this.onRetryEngine ? this.onRetryEngine(name) : this.onModelLoaded?.()); }
    catch { if (!this.isFairPlayLocked) this.showToast(this.t(name === 'maia' ? 'failedMaia' : 'failedSf')); }
    finally { this.retryingEngines.delete(name); this.renderRecovery(); }
  }

  updateEngineStatus(status) {
    if (!this.container || !status) return;
    this.lastEngineStatus = { ...this.lastEngineStatus, ...status };

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
      if (labelMaia) labelMaia.title = status.maia.error || '';
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
        const progress = percent == null ? loadedMB + ' MiB' : percent + '%';
        if (dotMaia) dotMaia.className = 'weui-status-dot status-loading';
        if (labelMaia) {
          labelMaia.textContent = this.lang === 'zh' ? `下载中 ${progress}` : `Downloading ${progress}`;
          labelMaia.className = 'weui-cell__ft';
        }
        if (cdnCard) {
          cdnCard.style.display = 'block';
          if (cdnStatusLabel) cdnStatusLabel.textContent = this.lang === 'zh' ? `CDN 传输中 (${progress})` : `Downloading (${progress})`;
          if (cdnSpeedLabel) cdnSpeedLabel.textContent = speed ? `${speed} MB/s` : '-- MB/s';
          if (cdnBarFill) cdnBarFill.style.width = `${percent ?? 0}%`;
          if (cdnBytesLabel) cdnBytesLabel.textContent = `${loadedMB} / ${totalMB} MB`;
        }
      } else if (state === 'error') {
        if (dotMaia) dotMaia.className = 'weui-status-dot status-error';
        if (labelMaia) {
          labelMaia.textContent = this.t('failedMaia');
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
    if (this.isFairPlayLocked && cdnCard) cdnCard.style.display = 'none';
    this.syncEngineSummary();
    this.renderRecovery();
    this.syncCompactSummary();
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
    this.container.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    const labels = {
      'txt-panel-title': 'panelTitle', 'txt-drawer-title': 'drawerTitle', 'lbl-lang': 'lblLang',
      'lbl-model-spec': 'lblModelSpec', 'lbl-elo-title': 'eloTitle', 'lbl-visuals-title': 'boardVisuals',
      'lbl-heatmap': 'heatmap', 'lbl-arrows': 'arrows', 'lbl-cdn-cache-tag': 'downloadingHelp'
    };
    for (const [id, key] of Object.entries(labels)) {
      const field = this.container.querySelector('#' + id); if (field) field.textContent = this.t(key);
    }
    for (const [id, key] of [['weui-btn-more', 'btnMore'], ['weui-btn-close', 'btnClose'], ['panel-display', 'visualLegend']]) {
      const button = this.container.querySelector('#' + id); button.title = this.t(key); button.setAttribute('aria-label', this.t(key));
    }
    const close = this.container.querySelector('#weui-btn-drawer-close');
    close.setAttribute('aria-label', this.lang === 'zh' ? '关闭设置' : 'Close settings');
    this.container.querySelector('#txt-panel-title').title = this.t('dragHint');
    this.container.querySelector('#maia-elo-desc').textContent = this.t('eloDesc')[this.currentElo] || `${this.currentElo} Elo`;
    for (const [variant, key] of [['5m', 'lightModel'], ['23m', 'balancedModel'], ['79m', 'largeModel']]) {
      const button = this.container.querySelector(`[data-model="${variant}"]`);
      const size = { '5m': '28 MiB', '23m': '104 MiB', '79m': '159 MiB' }[variant];
      button.querySelector('small').textContent = `${this.t(key)}\n${size}`;
      button.title = this.t(key); button.setAttribute('aria-label', `${this.t(key)} Maia ${variant.toUpperCase()}, ${button.querySelector('small').textContent}`);
    }
    this.syncStudyChrome();
    if (this.lastEngineStatus) this.updateEngineStatus(this.lastEngineStatus);
    if (this.isFairPlayLocked) {
      this.fairPlayPhase = null;
      this.setFairPlayLocked(true);
    } else if (this.viewState === 'thinking') {
      this.setEvaluating(this.lastFen);
    } else if (!this.currentData) {
      this.container.querySelector('#maia-turn-pill').textContent = this.t(this.viewState === 'concluded' ? 'concluded' : 'reading');
      this.container.querySelector('#maia-moves-header-text').textContent = this.t('positionLabel');
      this.container.querySelector('#maia-inference-time').textContent = '';
      this.container.querySelector('#maia-moves-container').textContent = this.t('readingState');
    }
    this.syncEngineSummary(); this.renderRecovery(); this.syncCompactSummary();
  }

  setupDraggable() {
    const handle = this.container.querySelector('#maia-drag-handle');
    if (!handle) return;
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
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
        window.removeEventListener('pointermove', onMouseMove);
        window.removeEventListener('pointerup', onMouseUp);
        window.removeEventListener('pointercancel', onMouseUp);

        const rect = this.container.getBoundingClientRect();
        this.userPositioned = true;
        this._setStorage({ maia3_panel_pos: { left: rect.left, top: rect.top } });
      };

      window.addEventListener('pointermove', onMouseMove);
      window.addEventListener('pointerup', onMouseUp);
      window.addEventListener('pointercancel', onMouseUp);
    });
  }

  setFairPlayLocked(isLocked) {
    const detected = isLocked ? FairPlayGuard.phase() : 'study';
    const phase = isLocked && detected === 'study' ? 'live' : detected;
    if (this.isFairPlayLocked === isLocked && this.fairPlayPhase === phase && this.container?.dataset.fairPlayLocked === String(isLocked)) return;
    const wasLocked = this.isFairPlayLocked;
    this.fairPlayPhase = phase;
    this.isFairPlayLocked = isLocked;
    this.container.dataset.fairPlayLocked = String(isLocked);
    this.clearMovePreview();
    if (isLocked) {
      this.currentData = null;
      this.container.dataset.loading = 'false';
      this.container.querySelector('#panel-stockfish').hidden = true;
      this.container.querySelector('#panel-sf-lines').replaceChildren();
      this.container.querySelector('#panel-white-score').textContent = '';
      this.container.querySelector('#maia-insight-text').replaceChildren();
      this.container.querySelector('#maia-insight-badge').textContent = '';
      this.viewState = phase;
      clearTimeout(this.eloTimer); this.pendingElo = undefined;
      this.container.querySelector('#maia-insight-card').style.display = 'none';
      this.container.querySelector('#maia-cdn-progress-card').style.display = 'none';
      this.container.querySelector('#panel-action-recovery').hidden = true;
      this.container.querySelector('#maia-moves-header-text').textContent = this.t('positionLabel');
      this.container.querySelector('#maia-inference-time').textContent = '';
      const pill = this.container.querySelector('#maia-turn-pill');
      pill.textContent = phase === 'live' ? `🛡️ ${this.lang === 'zh' ? '对局中' : 'Live'}` : this.t(phase === 'lobby' ? 'notStarted' : 'compactLocked');
      pill.title = this.protectionCopy().title;
      const area = this.container.querySelector('#maia-moves-container');
      const banner = document.createElement('div'); banner.className = 'weui-fair-play-banner';
      const title = document.createElement('strong'); title.textContent = this.protectionCopy().title;
      const help = document.createElement('p'); help.textContent = this.protectionCopy().help;
      banner.append(title, help); area.replaceChildren(banner);
    } else if (wasLocked || !this.currentData) {
      this.viewState = wasLocked && ['live', 'unknown'].includes(this.previousProtectionPhase) ? 'concluded' : 'reading';
      this.container.querySelector('#maia-turn-pill').textContent = this.t(this.viewState === 'concluded' ? 'concluded' : 'reading');
      this.container.querySelector('#maia-inference-time').textContent = '';
      this.container.querySelector('#maia-moves-header-text').textContent = this.t('positionLabel');
      const reading = document.createElement('p'); reading.className = 'diverge-empty-state'; reading.textContent = this.t('readingState');
      this.container.querySelector('#maia-moves-container').replaceChildren(reading);
    }
    if (isLocked) this.previousProtectionPhase = phase;
    this.syncStudyChrome(); this.syncEngineSummary(); this.renderRecovery();
  }

  setEvaluating(fen = null) {
    if (this.isFairPlayLocked) return;
    this.viewState = 'thinking';
    this.lastFen = fen;
    this.clearMovePreview();
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

    this.container.dataset.loading = 'true';
    this.container.querySelector('#panel-stockfish').hidden = false;
    for (const id of ['panel-sf-lines', 'maia-moves-container']) {
      const area = this.container.querySelector('#' + id);
      this.fillPendingRows(area);
    }
    this.container.querySelector('#maia-insight-card').style.display = 'none';
    this.container.querySelector('#maia-insight-badge').textContent = '';
    this.container.querySelector('#maia-insight-text').replaceChildren();
    this.container.querySelector('#panel-white-score').textContent = '';
    this.syncCompactSummary();
  }

  fillPendingRows(area) {
    area.replaceChildren(...Array.from({ length: 3 }, () => {
      const row = document.createElement('div');
      row.className = 'diverge-line-skeleton';
      row.setAttribute('aria-hidden', 'true');
      return row;
    }));
  }

  comparisonText(key, values) {
    return this.t(key).replace(/\{(\w+)\}/g, (_, field) => values[field]);
  }

  renderVerdict(data, lines, top) {
    const insight = this.container.querySelector('#maia-insight-card');
    const badge = this.container.querySelector('#maia-insight-badge');
    const text = this.container.querySelector('#maia-insight-text');
    const score = this.container.querySelector('#panel-white-score');
    const sf = data.stockfish;
    const best = sf?.bestMove;
    const evaluation = data.fen && !sf?.isBound ? whiteEvaluation(sf, data.fen) : null;
    score.hidden = !evaluation;
    score.textContent = evaluation ? `${this.t('evalLabel')} ${evaluation.text}` : '';
    score.title = this.t('scoreHelp');
    insight.style.display = top || best || sf?.terminal ? 'block' : 'none';
    insight.className = 'weui-insight-box';
    badge.className = 'weui-insight-badge';
    if (!top || !best) {
      badge.textContent = this.t(top ? 'humanChoice' : sf?.terminal ? 'noLegalMoves' : best ? 'sfLines' : 'positionLabel');
      text.textContent = this.t(top ? 'maiaOnly' : best ? 'sfOnly' : '');
      return;
    }

    const root = lines.find(line => line.uci === best.uci);
    const rank = lines.find(line => line.uci === top.uci);
    const gap = comparableScoreDelta(root, lines.find(line => line.multipv === 2));
    const delta = comparableScoreDelta(root, rank);
    const estimate = data.maiaTopEstimate?.uci === top.uci ? data.maiaTopEstimate.deltaCp : null;
    const agreed = best.uci === top.uci;
    badge.textContent = this.t(agreed ? 'sameChoice' :
      delta === null ? 'differentChoice' : delta >= -30 ? 'closeChoice' : 'notableChoice');
    if (!agreed && delta !== null && delta <= -100) {
      insight.classList.add('alert-trap');
      badge.classList.add('badge-trap');
    }
    if (agreed) {
      text.textContent = gap !== null && gap <= -150
        ? `${top.san} · ${this.comparisonText('strongGap', { gap: (-gap / 100).toFixed(2) })}`
        : this.comparisonText('sharedFirst', { move: top.san, prob: top.prob });
    } else if (delta !== null || Number.isFinite(estimate)) {
      const value = delta ?? estimate;
      text.textContent = this.comparisonText(delta === null ? 'estimatedLoss' : 'moveLoss',
        { move: top.san, gap: (-value / 100).toFixed(2) });
    } else {
      const note = sf.isMate || rank?.isMate ? this.t('mateDifference') :
        lines.length === 3 && !rank ? this.t('outsideTop') : this.t('evaluationPending');
      text.textContent = `${this.comparisonText('comparedMoves', { maia: top.san, sf: best.san })} ${note}`;
    }
  }

  update(predictionData, latencyMs = 0) {
    if (this.isFairPlayLocked || FairPlayGuard.isLiveGameInProgress() || !predictionData) return;
    const focused = this.container.querySelector('.weui-move-item:focus');
    const data = this.currentData = predictionData;
    this.latency = latencyMs;
    this.viewState = data.isAvailable ? 'ready' : data.stockfish?.bestMove ? 'partial' : 'loading';
    this.currentTurn = data.fen?.split(' ')[1] || data.turn || 'w';
    if (data.status) this.updateEngineStatus(data.status);
    const sf = data.stockfish;
    const moves = data.isAvailable ? (data.moves || []).slice(0, 3) : [];
    const top = moves[0];
    const lines = data.fen ? engineLines(sf, data.fen) : [];
    const root = lines.find(line => line.uci === sf?.bestMove?.uci);
    const consensus = top?.uci === sf?.bestMove?.uci ? top?.uci : null;
    this.container.dataset.loading = String(!!(data.waitingForStockfish || data.waitingForMaia));
    this.container.dataset.maiaAvailable = String(!!data.isAvailable);
    this.container.querySelector('#maia-turn-pill').textContent = this.t(this.currentTurn === 'w' ? 'white' : 'black');
    this.container.querySelector('#maia-moves-header-text').textContent = this.t('maiaLines');
    const time = this.container.querySelector('#maia-inference-time');
    time.textContent = this.container.dataset.loading === 'true' ? this.t('partialSearch') : ''; time.title = `${Math.round(latencyMs)} ms`;
    this.renderVerdict(data, lines, top);

    const sfArea = this.container.querySelector('#panel-sf-lines');
    const maiaArea = this.container.querySelector('#maia-moves-container');
    sfArea.replaceChildren();
    maiaArea.replaceChildren();
    this.container.querySelector('#panel-stockfish').hidden = !lines.length && !data.waitingForStockfish;
    if (!lines.length && data.waitingForStockfish) this.fillPendingRows(sfArea);
    if (!moves.length && data.waitingForMaia) this.fillPendingRows(maiaArea);
    const badge = () => {
      const tag = document.createElement('small');
      tag.className = 'diverge-match-tag';
      tag.textContent = this.t('consensus');
      return tag;
    };
    for (const line of lines) {
      const first = line.variation[0];
      if (!first) continue;
      const row = document.createElement('div');
      row.className = 'weui-move-item diverge-sf-line';
      row.dataset.uci = first.uci;
      const score = document.createElement('span');
      score.className = 'diverge-line-score';
      score.textContent = line.isBound ? '—' : line.evaluation?.text ?? '—';
      score.title = this.t('scoreHelp');
      const san = document.createElement('strong');
      san.className = 'weui-move-san';
      san.textContent = first.san;
      const pv = document.createElement('span');
      pv.className = 'diverge-pv';
      const replies = line.variation.slice(1, 4);
      for (const reply of replies) {
        const step = document.createElement('span');
        step.textContent = reply.san;
        pv.append(step);
      }
      pv.title = line.variation.map(move => move.label).join(' ');
      row.append(score, san, pv);
      if (first.uci === consensus) row.append(badge());
      this.bindMovePreview(row, first, 'sf');
      sfArea.append(row);
    }
    for (const move of moves) {
      const row = document.createElement('div');
      row.className = 'weui-move-item diverge-maia-line';
      row.dataset.uci = move.uci;
      const main = document.createElement('div'); main.className = 'weui-move-main';
      const left = document.createElement('div'); left.className = 'weui-move-left';
      const san = document.createElement('strong'); san.className = 'weui-move-san'; san.textContent = move.san;
      left.append(san);
      const comparable = lines.find(line => line.uci === move.uci);
      if (move.uci === consensus) left.append(badge());
      else if (comparable) {
        const rank = document.createElement('small');
        rank.className = 'diverge-engine-rank';
        rank.title = this.comparisonText('higherRank', { rank: comparable.multipv });
        rank.setAttribute('aria-label', rank.title);
        rank.textContent = `SF #${comparable.multipv}`;
        left.append(rank);
      }
      const right = document.createElement('div'); right.className = 'weui-move-right';
      const delta = document.createElement('span'); delta.className = 'weui-delta-tag';
      const exact = sf?.bestMove?.uci === move.uci && !sf?.isMate && !sf?.isBound
        ? 0 : comparableScoreDelta(root, comparable);
      const estimate = data.maiaTopEstimate?.uci === move.uci ? data.maiaTopEstimate.deltaCp : null;
      const value = exact ?? estimate;
      delta.textContent = Number.isFinite(value) ? `${exact === null ? '≈ ' : ''}Δ ${(value / 100).toFixed(2)}` : '—';
      if (exact !== null && exact <= -100) delta.classList.add('tag-blunder');
      delta.title = this.t('scoreHelp');
      const probability = document.createElement('span'); probability.className = 'weui-move-prob'; probability.textContent = `${move.prob}%`; probability.title = this.t('probabilityHelp');
      right.append(delta, probability); main.append(left, right);
      const track = document.createElement('div'); track.className = 'weui-progress-track'; track.setAttribute('aria-hidden', 'true');
      const bar = document.createElement('div'); bar.className = 'weui-progress-bar'; bar.style.width = `${Math.max(0, Math.min(100, Number(move.prob) || 0))}%`; track.append(bar);
      row.append(main, track);
      this.bindMovePreview(row, move, 'maia');
      maiaArea.append(row);
    }
    if (!moves.length && !data.waitingForMaia) {
      const message = document.createElement('p'); message.className = 'diverge-empty-state';
      message.textContent = data.isAvailable || sf?.terminal ? this.t(data.fen && !data.isReading ? 'noLegalMoves' : 'readingState') : this.t(this.lastEngineStatus?.maia?.state === 'error' ? 'failedMaia' : 'loadingModel');
      maiaArea.append(message);
    }
    const rows = [...this.container.querySelectorAll('.weui-move-item')];
    if (this.pinnedMove && !rows.some(row => row.dataset.uci === this.pinnedMove && row.dataset.engine === this.pinnedSource)) this.clearMovePreview();
    this.previewMove(this.pinnedMove);
    if (focused) rows.find(row => row.dataset.uci === focused.dataset.uci && row.dataset.engine === focused.dataset.engine)?.focus({ preventScroll: true });
    this.renderRecovery(); this.syncStudyChrome(); this.syncEngineSummary();
  }

  showCustomInsight({ badge, text, isTrap = false, blunderInfo = null }) {
    if (this.isFairPlayLocked) return;
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
      playedEl.style.color = 'var(--dg-red)';
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
      bestEl.style.color = 'var(--dg-green)';
      bestEl.textContent = blunderInfo.bestSan || '';
      line1.append(recLabel, bestEl);
      line1.appendChild(document.createTextNode('。'));

      const line2 = document.createElement('div');
      line2.style.marginTop = '3px';
      line2.style.fontSize = '11px';
      line2.style.color = 'var(--dg-muted)';

      const lossLabel = document.createTextNode(isZh ? '局面损耗: ' : 'Centipawn loss: ');
      const lossEl = document.createElement('strong');
      lossEl.style.color = 'var(--dg-red)';
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
      toast.setAttribute('role', 'status');
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
