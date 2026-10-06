/**
 * Diverge Studio Internationalization (i18n) Module
 * Supports seamless bilingual switching (zh-CN & en-US)
 * Persists user preference to localStorage and chrome.storage.local
 */

const STORAGE_KEY = 'maia3_lang';

export const DICTIONARY = {
  zh: {
    // Header & Meta
    appTitle: '歧路 Diverge · 全盘分析',
    studioName: '歧路 Diverge',
    studioBadge: '棋谱研究室',
    whitePlayer: '⚪ 白方',
    blackPlayer: '⚫ 黑方',
    btnImportPgn: '导入 PGN',
    btnReanalyze: '重新分析',
    btnLangToggle: 'English',

    // Board Column
    boardHeading: '棋盘',
    boardSubheading: '点击或拖动棋子，试演其他可能',
    branchBannerText: '🌿 试演分支局面 · 探索其他可能',
    btnExitBranch: '返回对局',
    btnFirst: '开局首步 (Home)',
    btnPrev: '上一步 (Left Arrow)',
    btnPlay: '自动播放/暂停',
    btnNext: '下一步 (Right Arrow)',
    btnLast: '终局末步 (End)',
    btnFlip: '翻转黑白视角 (快捷键: F)',
    btnSound: '行棋音效开关 (快捷键: M)',
    startingPosition: '开局局面',
    moveIndicator: '第 {move} 步 ({side} {san})',
    branchMoveIndicator: '🌿 分支走法: {move}',

    // Progress Banner
    analyzingFullGame: '正在分析棋局...',
    evaluatingEngine: '引擎评估中 ({current}/{total}) · {move}',
    analyzingIntuition: '人类直觉盲区分析 ({current}/{total}) · {move}',
    preparingEngine: '正在准备引擎评估...',
    launchingEngines: '⚡ 正在分析全盘对局...',
    startingEngines: '正在启动计算与直觉引擎...',

    // Eval Chart
    evalChartTitle: '局面走势',
    chartLegendBeyond: '✨ 妙手',
    chartLegendTrap: '🫤 俗手',
    chartLegendBlunder: '大漏',
    chartLegendMistake: '失误',
    chartLegendInaccuracy: '疑问手',
    chartWhiteAdvantage: '白方局势: ',
    chartMove: '第 {move} 步 ({side} {san})',

    // Analysis / Perspective Column
    perspectiveEyebrow: 'A DIFFERENT PERSPECTIVE',
    compareTitle: '比较三种选择',
    compareSubtitle: '实战、人类直觉与引擎推荐，在这里相遇。',
    divergenceBadgeDefault: '局面研判',
    cardEngineBest: '引擎推荐',
    cardIntuition: '直觉预判',
    cardPlayed: '实战着法',
    engineToolsTitle: '直觉等级与引擎状态',
    eloLabel: '直觉 ELO:',
    eloBeginner: '1100 (初学)',
    eloIntermediate: '1500 (进阶)',
    eloClub: '1900 (俱乐部)',
    eloMaster: '2200 (大师)',
    evalScore: '评估 {score}',
    evalResult: '结果 {score}',
    evalLabel: '评估',
    evalResultLabel: '结果',
    probLabel: '概率',
    pawnsUnit: '兵',
    lossVersusBest: '相比最佳着法的损耗',
    probText: '概率 {prob}%',
    statusCalculating: '计算中...',

    // Move Classification Badges
    badgeOpening: '♟️ 开局',
    badgeBeyond: '✨ 妙手 · 优于人类直觉走法',
    badgeTrap: '🫤 俗手 · 自然但吃亏的选择',
    badgeBook: '📖 开局理论着法',
    badgeBlunder: '⚠️ 大漏',
    badgeMistake: '⚠️ 失误',
    badgeInaccuracy: '⚡ 疑问手',
    badgeNormal: '✓ 正常',
    badgeRealtime: '⚡ 实时分析中',
    badgeBranch: '🌿 分支试演',

    // Played Move Tags
    tagEngineBest: '= 引擎一选 ✨',
    tagTrap: '= 俗手 🫤',
    tagIntuition: '= 直觉',
    tagEngine: '= 引擎',
    tagBook: '📖 理论着法',

    // Review Column
    reviewHeading: '回看关键选择',
    accuracyLabel: '引擎精度',
    accuracyTooltip: '基于预期得分损失的指数精度映射：单步精度 A_i = 100 * exp(-5.11 * ΔQ)，反映局面损失严重程度',
    tabKeyMoments: '关键步 ({count})',
    tabNotation: '记谱 ({count})',
    filterAll: '全部 ({count})',
    filterBeyond: '✨ 妙手 ({count})',
    filterTrap: '🫤 俗手 ({count})',
    loadingGameData: '正在加载棋局数据...',
    noBeyondDetected: '本盘未检测到实战走出更优选择的妙手',
    noTrapDetected: '本盘未检测到实战采用自然但明显吃亏选择的俗手',
    noKeyMoments: '👏 本盘棋未检测到显著的妙手或俗手瞬间。',

    // Moments List Details
    beyondTitle: '✨ 妙手：你走出了引擎首选。相比人类直觉的自然走法，这步保留了更多优势。',
    beyondText: '✨ 妙手',
    beyondComboText: '组合延续',
    beyondIntuitionBreak: '突破直觉',
    naturalIntuitionTop: '自然直觉首选: ',
    betterThanIntuition: ' · 优于直觉 +{pawns} 兵',
    playedEngineBest: '实战走出引擎首选，优于自然直觉',
    trapTitle: '🫤 俗手：这步人类直觉的优先选择，看起来很自然，但会明显损失优势。',
    trapText: '🫤 俗手',
    lossPawns: '损耗 -{loss} 兵',
    bestMoveIs: '最佳走法: ',
    trapTopTendency: '直觉一选 ({prob}% 倾向)',
    trapHumanTendency: '人类自然走法 ({prob}% 倾向)',
    trapProne: '易受人类直觉惯性诱导',
    blunderText: '大漏 ??',
    mistakeText: '失误 ?',
    inaccuracyText: '疑问手 ?!',
    coverageTooltip: '计算覆盖率: {pct}%',

    // Empty Hero View
    heroTitle: '从一盘棋开始',
    heroSubtitle: '回看实战选择，找到妙手与直觉容易错过的机会。',
    btnImportCompleted: '导入已完赛对局',
    btnTestSound: '试听行棋音效',
    chipFischer: '♟️ 菲舍尔世纪之局 (1956)',
    chipKasparov: '♟️ 卡斯帕罗夫不朽之局 (1999)',
    tipDragDrop: '⚡ 支持直接拖放 .pgn 棋谱文件或文本',
    tipPwa: '📱 PWA 模式下可直接在系统文件管理器“以此应用打开”',

    // PGN Import Modal & Overlay
    dragDropTitle: '释放以载入 PGN 棋谱',
    dragDropSubtitle: '支持 .pgn 棋谱文件与文本拖拽',
    modalEyebrow: 'A NEW PERSPECTIVE',
    modalTitle: '从一盘棋开始',
    modalDesc: '导入已完赛对局，回看直觉之外的选择。',
    modalPlaceholder: '在此粘贴：\n1. PGN 棋谱文本 或 FEN 局面\n2. Lichess 对局网址 (如 https://lichess.org/aBcDeFgH)\n3. Chess.com 对局网址 (如 https://www.chess.com/game/live/12345678)\n或直接将本地 .pgn 文件拖拽至窗口任意位置',
    modalSampleLabel: '示例:',
    sampleFischerBtn: '菲舍尔世纪之局',
    sampleKasparovBtn: '卡斯帕罗夫对局',
    btnUploadPgn: '📁 选择 PGN 文件',
    btnCancel: '取消',
    btnSubmitPgn: '智能解析并载入',

    // Audio & Controls
    btnSoundMute: '行棋音效：开启 (点击静音，快捷键: M)',
    btnSoundUnmute: '行棋音效：静音 (点击开启，快捷键: M)',
    soundEnabled: '🔊 行棋音效已开启',
    soundMuted: '🔇 行棋音效已静音',
    btnPlayStart: '自动播放',
    btnPlayPause: '暂停播放',
    freeAnalysisBoard: '自由局面分析',

    // Toasts & Alerts
    toastLoadedFen: '♟️ 已载入 FEN 局面',
    toastLoadedPgn: '♟️ 成功载入 PGN 棋谱{label}',
    toastUnrecognizedInput: '⚠️ 未能识别该内容，请确认是否为有效 PGN 文本或对局链接',
    toastFetchingLichess: '🔍 正在从 Lichess 获取对局 ({gameId})...',
    toastFairPlayReview: '🔒 公平竞技保护：{reason}。请在完赛后再行导入复盘。',
    toastFairPlay: '🔒 公平竞技保护：{reason}',
    toastLoadedLichess: '✅ 成功载入 Lichess 完赛对局 ({gameId})',
    toastFailedLichess: '❌ 未能从 Lichess 获取该对局，请确认对局公开且已完赛',
    toastFetchingChesscom: '🔍 正在从 Chess.com 获取对局 ({gameId})...',
    toastLoadedChesscom: '✅ 成功载入 Chess.com 完赛对局 ({gameId})',
    toastFailedChesscom: '⚠️ 未能从 Chess.com 获取该对局，建议在完赛后直接在对局页点击扩展或复制 PGN',

    // Errors & Notifications
    errorParseMove: '未能解析出有效走法数据',
    errorIllegalFen: 'PGN 中的起始 FEN 格式非法，已拒绝加载。',
    errorBuildChain: '未能从该棋谱构建出有效局面链。',
    errorTruncated: '{count} (已截断)',
    errorAnalysisFailed: '⚠️ 棋局分析未能完成: {error}',
    errorReviewError: '⚠️ 复盘分析出错: {error}',
    btnRetryAnalysis: '重试分析',
    errorPartialPgn: '⚠️ 棋谱在第 {ply} 步 ("{san}") 存在非法走法，后续未加载'
  },

  en: {
    // Header & Meta
    appTitle: 'Diverge · Game Review Studio',
    studioName: 'Diverge',
    studioBadge: 'Review Studio',
    whitePlayer: '⚪ White',
    blackPlayer: '⚫ Black',
    btnImportPgn: 'Import PGN',
    btnReanalyze: 'Re-analyze',
    btnLangToggle: '中文',

    // Board Column
    boardHeading: 'Chessboard',
    boardSubheading: 'Click or drag pieces to explore alternatives',
    branchBannerText: '🌿 Exploration Branch · Exploring possibilities',
    btnExitBranch: 'Back to Game',
    btnFirst: 'First Move (Home)',
    btnPrev: 'Previous Move (Left Arrow)',
    btnPlay: 'Play / Pause',
    btnNext: 'Next Move (Right Arrow)',
    btnLast: 'Last Move (End)',
    btnFlip: 'Flip Board (Key: F)',
    btnSound: 'Sound Toggle (Key: M)',
    startingPosition: 'Starting Position',
    moveIndicator: 'Move {move} ({side} {san})',
    branchMoveIndicator: '🌿 Branch Move: {move}',

    // Progress Banner
    analyzingFullGame: 'Analyzing game...',
    evaluatingEngine: 'Engine evaluation ({current}/{total}) · {move}',
    analyzingIntuition: 'Maia intuition analysis ({current}/{total}) · {move}',
    preparingEngine: 'Preparing engine evaluation...',
    launchingEngines: '⚡ Analyzing full game...',
    startingEngines: 'Starting engine & intuition models...',

    // Eval Chart
    evalChartTitle: 'Evaluation Trend',
    chartLegendBeyond: '✨ Brilliant',
    chartLegendTrap: '🫤 Inaccuracy',
    chartLegendBlunder: 'Blunder',
    chartLegendMistake: 'Mistake',
    chartLegendInaccuracy: 'Inaccuracy',
    chartWhiteAdvantage: 'White Advantage: ',
    chartMove: 'Move {move} ({side} {san})',

    // Analysis / Perspective Column
    perspectiveEyebrow: 'A DIFFERENT PERSPECTIVE',
    compareTitle: 'Compare Three Perspectives',
    compareSubtitle: 'Played move, human intuition, and engine best in one place.',
    divergenceBadgeDefault: 'Position Review',
    cardEngineBest: 'Engine Best',
    cardIntuition: 'Intuition',
    cardPlayed: 'Played Move',
    engineToolsTitle: 'Intuition Rating & Engine Status',
    eloLabel: 'Intuition Elo:',
    eloBeginner: '1100 (Beginner)',
    eloIntermediate: '1500 (Intermediate)',
    eloClub: '1900 (Club)',
    eloMaster: '2200 (Master)',
    evalScore: 'Eval {score}',
    evalResult: 'Result {score}',
    evalLabel: 'Eval',
    evalResultLabel: 'Result',
    probLabel: 'Prob',
    pawnsUnit: 'pawns',
    lossVersusBest: 'Loss versus best move',
    probText: 'Prob {prob}%',
    statusCalculating: 'Calculating...',

    // Move Classification Badges
    badgeOpening: '♟️ Opening',
    badgeBeyond: '✨ Brilliant · Beyond Human Intuition',
    badgeTrap: '🫤 Inaccuracy · Natural but Costly',
    badgeBook: '📖 Opening Theory',
    badgeBlunder: '⚠️ Blunder',
    badgeMistake: '⚠️ Mistake',
    badgeInaccuracy: '⚡ Inaccuracy',
    badgeNormal: '✓ Good',
    badgeRealtime: '⚡ Real-time Analysis',
    badgeBranch: '🌿 Branch Replay',

    // Played Move Tags
    tagEngineBest: '= Engine Best ✨',
    tagTrap: '= Inaccuracy 🫤',
    tagIntuition: '= Intuition',
    tagEngine: '= Engine',
    tagBook: '📖 Book Move',

    // Review Column
    reviewHeading: 'Review Key Moments',
    accuracyLabel: 'Accuracy',
    accuracyTooltip: 'Expected score drop accuracy: A_i = 100 * exp(-5.11 * ΔQ)',
    tabKeyMoments: 'Key Moments ({count})',
    tabNotation: 'Notation ({count})',
    filterAll: 'All ({count})',
    filterBeyond: '✨ Brilliant ({count})',
    filterTrap: '🫤 Inaccuracy ({count})',
    loadingGameData: 'Loading game data...',
    noBeyondDetected: 'No brilliant moves detected in this game.',
    noTrapDetected: 'No inaccurate intuition traps detected in this game.',
    noKeyMoments: '👏 No notable divergence moments detected in this game.',

    // Moments List Details
    beyondTitle: '✨ Brilliant: Top engine choice that retains far greater advantage than natural intuition.',
    beyondText: '✨ Brilliant',
    beyondComboText: 'Combo Follow-up',
    beyondIntuitionBreak: 'Beyond Intuition',
    naturalIntuitionTop: 'Natural intuition: ',
    betterThanIntuition: ' · Over intuition +{pawns} pawns',
    playedEngineBest: 'Played engine best, outperforming natural intuition',
    trapTitle: '🫤 Inaccuracy: Natural human choice that looks appealing, but incurs a loss of advantage.',
    trapText: '🫤 Inaccuracy',
    lossPawns: 'Loss -{loss} pawns',
    bestMoveIs: 'Best move: ',
    trapTopTendency: 'Top intuition pick ({prob}% tendency)',
    trapHumanTendency: 'Natural human move ({prob}% tendency)',
    trapProne: 'Prone to human intuition bias',
    blunderText: 'Blunder ??',
    mistakeText: 'Mistake ?',
    inaccuracyText: 'Inaccuracy ?!',
    coverageTooltip: 'Engine coverage: {pct}%',

    // Empty Hero View
    heroTitle: 'Start with a Game',
    heroSubtitle: 'Review your moves to uncover brilliant choices and missed opportunities.',
    btnImportCompleted: 'Import Completed Game',
    btnTestSound: 'Test Chess Sounds',
    chipFischer: '♟️ Fischer: Game of the Century (1956)',
    chipKasparov: '♟️ Kasparov: Pearl of Wijk aan Zee (1999)',
    tipDragDrop: '⚡ Drag & drop .pgn files or text anywhere',
    tipPwa: '📱 In PWA mode, open directly via system file manager',

    // PGN Import Modal & Overlay
    dragDropTitle: 'Drop to Load PGN Game',
    dragDropSubtitle: 'Supports .pgn files and raw PGN text',
    modalEyebrow: 'A NEW PERSPECTIVE',
    modalTitle: 'Start with a Game',
    modalDesc: 'Import a completed game to explore moves beyond intuition.',
    modalPlaceholder: 'Paste here:\n1. PGN game text or FEN\n2. Lichess game URL (e.g. https://lichess.org/aBcDeFgH)\n3. Chess.com game URL (e.g. https://www.chess.com/game/live/12345678)\nOr drag & drop a local .pgn file anywhere onto the window',
    modalSampleLabel: 'Examples:',
    sampleFischerBtn: "Fischer's Century",
    sampleKasparovBtn: "Kasparov's Immortal",
    btnUploadPgn: '📁 Select PGN File',
    btnCancel: 'Cancel',
    btnSubmitPgn: 'Parse & Load',

    // Audio & Controls
    btnSoundMute: 'Sound: Enabled (Click to mute, key: M)',
    btnSoundUnmute: 'Sound: Muted (Click to enable, key: M)',
    soundEnabled: '🔊 Sound effects enabled',
    soundMuted: '🔇 Sound effects muted',
    btnPlayStart: 'Auto-play',
    btnPlayPause: 'Pause auto-play',
    freeAnalysisBoard: 'Free Board Analysis',

    // Toasts & Alerts
    toastLoadedFen: '♟️ Loaded FEN position',
    toastLoadedPgn: '♟️ Successfully loaded PGN game{label}',
    toastUnrecognizedInput: '⚠️ Unrecognized input. Please provide valid PGN or game link.',
    toastFetchingLichess: '🔍 Fetching game from Lichess ({gameId})...',
    toastFairPlayReview: '🔒 Fair Play Protection: {reason}. Please review after game conclusion.',
    toastFairPlay: '🔒 Fair Play Protection: {reason}',
    toastLoadedLichess: '✅ Successfully loaded Lichess game ({gameId})',
    toastFailedLichess: '❌ Failed to fetch Lichess game. Ensure game is public and concluded.',
    toastFetchingChesscom: '🔍 Fetching game from Chess.com ({gameId})...',
    toastLoadedChesscom: '✅ Successfully loaded Chess.com game ({gameId})',
    toastFailedChesscom: '⚠️ Failed to fetch Chess.com game. Try copying PGN or reviewing after game ends.',

    // Errors & Notifications
    errorParseMove: 'Could not parse valid move data',
    errorIllegalFen: 'Illegal starting FEN format in PGN, loading aborted.',
    errorBuildChain: 'Could not construct valid position chain from moves.',
    errorTruncated: '{count} (truncated)',
    errorAnalysisFailed: '⚠️ Game analysis could not complete: {error}',
    errorReviewError: '⚠️ Analysis error: {error}',
    btnRetryAnalysis: 'Retry Analysis',
    errorPartialPgn: '⚠️ Illegal move at ply {ply} ("{san}"), remaining moves not loaded'
  }
};

let currentLang = 'zh';
const listeners = new Set();

export function getLang() {
  return currentLang;
}

export function t(key, params = {}) {
  const dict = DICTIONARY[currentLang] || DICTIONARY.zh;
  let text = dict[key] || DICTIONARY.zh[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyTranslations() {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';

  // Update elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated && translated !== key) {
      el.textContent = translated;
    }
  });

  // Update elements with data-i18n-title
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    const translated = t(key);
    if (translated && translated !== key) {
      el.title = translated;
    }
  });

  // Update elements with data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translated = t(key);
    if (translated && translated !== key) {
      el.placeholder = translated;
    }
  });

  // Update document title
  document.title = t('appTitle');

  // Update language toggle button text and ensure click binding
  const langBtn = document.getElementById('btn-lang-toggle');
  if (langBtn) {
    langBtn.textContent = currentLang === 'zh' ? 'English' : '中文';
    langBtn.setAttribute('aria-label', currentLang === 'zh' ? 'Switch to English' : '切换为中文');
    if (!langBtn.__i18nBound) {
      langBtn.__i18nBound = true;
      langBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleLanguage();
      });
    }
  }

  // Update theme toggle buttons to reflect language
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    const isDark = (document.body.dataset.theme || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    const isEn = currentLang === 'en';
    button.textContent = isDark ? (isEn ? 'Light' : '浅色') : (isEn ? 'Dark' : '深色');
    button.setAttribute('aria-label', isEn ? `Switch to ${isDark ? 'light' : 'dark'} theme` : `切换为${isDark ? '浅色' : '深色'}界面`);
  });

  // Notify registered callbacks
  listeners.forEach((fn) => {
    try {
      fn(currentLang);
    } catch (e) {
      console.warn('[i18n] listener error:', e);
    }
  });
}

export function setLanguage(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {}
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: lang });
    } catch (e) {}
  }
  applyTranslations();
}

export function toggleLanguage() {
  const next = currentLang === 'zh' ? 'en' : 'zh';
  setLanguage(next);
  return next;
}

export function initI18n() {
  // 1. Check URL param: ?lang=en or #...&lang=en
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const urlLang = searchParams.get('lang') || hashParams.get('lang');
  if (urlLang === 'zh' || urlLang === 'en') {
    currentLang = urlLang;
  } else {
    // 2. Check localStorage
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (e) {}
    if (saved === 'zh' || saved === 'en') {
      currentLang = saved;
    } else {
      // 3. Fallback to browser language
      const navLang = navigator.language || navigator.userLanguage || '';
      currentLang = navLang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }
  }

  // Bind toggle click as early as possible
  const langBtn = document.getElementById('btn-lang-toggle');
  if (langBtn && !langBtn.__i18nBound) {
    langBtn.__i18nBound = true;
    langBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleLanguage();
    });
  }

  // Check chrome.storage.local asynchronously if available
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const extLang = res?.[STORAGE_KEY];
      if ((extLang === 'zh' || extLang === 'en') && extLang !== currentLang) {
        currentLang = extLang;
        applyTranslations();
      }
    });
  }

  applyTranslations();
}
