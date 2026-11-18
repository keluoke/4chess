/**
 * Diverge Studio Internationalization (i18n) Module
 * Supports seamless bilingual switching (zh-CN & en-US)
 * Persists user preference to localStorage and chrome.storage.local
 */

const STORAGE_KEY = 'maia3_lang';

export const DICTIONARY = {
  zh: {
    commentaryToggle: 'Chrome 本地 AI 润色英文点评',
    commentaryHelp: '用本地模型撰写英文战局回顾和关键手短评。',
    commentaryGameTitle: '战局回顾',
    commentaryTitle: '这一步为什么容易走错？',
    commentaryExplain: '解读这一步',
    commentaryTemplateOnly: '当前使用已验证的棋理说明。',
    commentaryChinese: '中文版使用已验证的棋理说明。',
    commentaryChecking: '正在检查浏览器的本地模型…',
    commentaryAvailable: '本地模型可用于英文战局回顾和关键手短评。',
    commentaryDownloadable: '下载 Chrome 本地模型后可生成英文点评。',
    commentaryDownloading: 'Chrome 正在下载本地模型。点击按钮可查看进度。',
    commentaryDownload: '下载 Chrome 本地模型',
    commentaryDownloadProgress: '本地模型下载进度',
    commentaryStarting: '正在准备本地模型…',
    commentaryProgress: '本地模型下载 {percent}%',
    commentaryReady: 'Chrome 本地模型已就绪。',
    commentaryFailed: '本地模型暂未启动。已验证的棋理说明仍可使用。',
    commentaryRetry: '重试启动本地模型',
    commentaryChromeUnavailable: '这个 Chrome 配置暂时无法使用内置模型，当前使用棋理说明。',
    commentaryUnavailable: '当前浏览器无法使用内置模型，当前使用棋理说明。',
    commentarySourceFacts: '已验证的棋理说明',
    commentarySourceAi: 'Chrome 本地 AI · 基于已验证棋理',
    commentaryTendency: '在 {elo} 等级分下，Maia 预测有 {probability}% 的概率会选 {played}。',
    commentaryExplainPlayed: '实战走了 {action}。',
    commentaryExplainReply: 'Stockfish 复核给出的应对是 {action}。实战走法的预期得分低约 {points} 个百分点。',
    commentaryMove: '{san}',
    commentaryCapture: '{san}，吃掉一枚{piece}',
    commentaryCheck: '{san}，将军',
    commentaryCaptureCheck: '{san}，吃掉一枚{piece}并将军',
    commentaryPiece_p: '兵',
    commentaryPiece_n: '马',
    commentaryPiece_b: '象',
    commentaryPiece_r: '车',
    commentaryPiece_q: '后',
    commentaryLoss: 'Stockfish 复核后，这步比搜索首选少了约 {points} 个百分点的预期得分。',
    commentaryAlternative: 'Stockfish 更喜欢 {best}，实战走法的预期得分低约 {points} 个百分点。',
    reviewTimeHeadline: '{loser}超时，{winner}获胜',
    reviewLinkedTurning: '第 {round} 回合走出 {trigger} 后，{side}本可以用 {best} 反击，实战走了 {played}。',
    reviewVerifiedTurning: '第 {round} 回合，{side}实战走了 {played}。Stockfish 复核后更看好 {best}。',
    gameOverview: '复盘总览',
    reviewWinner: '{side}获胜',
    reviewDraw: '双方战平',
    reviewMateHeadline: '{side}在第 {round} 回合将杀取胜',
    reviewComebackHeadline: '{side}从劣势中反超取胜',
    reviewHoldLeadHeadline: '{side}守住后半盘的优势，拿下这局',
    reviewDrawHeadline: '双方战平，整盘难分高下',
    reviewOutcomeTurnHeadline: '{outcome}，{side}第 {round} 回合错过机会',
    reviewWinMissHeadline: '{outcome}，但第 {round} 回合还有更好的走法',
    reviewTurnHeadline: '{side}在第 {round} 回合错过机会',
    reviewPartialHeadline: '这段棋谱的复盘',
    reviewPartialTurnHeadline: '这段棋谱里，{side}在第 {round} 回合错过机会',
    reviewClose: '关闭复盘总览',
    reviewOpenScore: '进入复盘工作台',
    reviewCountdown: '{seconds} 秒后自动进入复盘工作台',
    reviewCountdownSuffix: '秒后自动进入复盘工作台',
    reviewReady: '整盘分析已完成 · 查看总览',
    reviewPartialReady: '已完成部分棋谱分析 · 查看总览',
    reviewScoreMethod: '评分说明',
    reviewWhite: '白方',
    reviewBlack: '黑方',
    reviewPracticeSide: '练习方',
    reviewLoadedPlies: '已载入 {count} 步',
    reviewThroughRound: '第 {round} 回合结束',
    reviewScoredPlies: '这盘棋有 {valid} 步拿到了评分，共载入 {count} 步。',
    reviewBalanced: '双方一直下得很接近。',
    reviewClosingLead: '到了最后几步，{side}一直占优。',
    reviewFinalLead: '最后一个局面，{side}更占优势。',
    reviewLeadChanged: '前半盘{early}一度占优，最后{late}反超。',
    reviewBackToBalance: '这盘棋一度拉开差距，最后又回到均势。',
    reviewConfirmedBeyond: '已确认 {count} 处突破直觉',
    reviewConfirmedTraps: '已确认 {count} 处直觉陷阱',
    reviewLargestSwing: '最值得回看的是第 {round} 回合，{side}在这里错过了更好的走法。',
    reviewInspectRound: '复盘第 {round} 回合',
    reviewPracticeOne: '重走这个局面',
    reviewPracticeTwo: '重走这 2 个局面',
    reviewPracticed: '已重走 {count} 个局面',
    practiceRound: '第 {round} 回合 · {side}走',
    practiceRetry: '再试一次',
    practiceYourMove: '你走的',
    practicePlayedMove: '实战着法',
    practiceBestLine: '引擎建议',
    practiceMaiaMove: 'Maia 首选',
    practiceReply: '对手的应对',
    reviewSelectedMoves: "筛选着法",
    reviewTotal: "已载入着法",
    reviewOverview: "双方复盘总览",
    reviewBoth: "双方",
    reviewSideFilter: "筛选着法方",
    reviewCategory: "着法质量",
    reviewKeyMoves: "关键局面",
    reviewAllMoves: "全部着法",
    reviewReset: "重置筛选",
    reviewIntuitionPending: "直觉尚未完成扫描，数量暂不提供。",
    reviewPartial: "棋谱未完整解析；统计仅覆盖已载入着法。",
    reviewSelected: "{side} · {label} · {count} 步",
    reviewPracticeBatch: "练习所选局面（{count}）",
    reviewNoSelection: "当前筛选下没有对应着法。",
    reviewEvaluationPending: "评估未完成，不计为好棋。",
    reviewForcedHelp: "此局面仅有一个合法着法。",
    reviewLoss: "相比搜索最佳损失 {pawns} 兵",
    reviewTrapReason: "Maia 在所选 {elo} 等级下预测这步的概率为 {probability}%。",
    reviewTrapVerified: "复核损失 {pawns} 兵，预期得分下降 {points} 个百分点。",
    reviewBeyondReason: "Maia 的自然选择 {move} 损失约 {pawns} 兵；实战突破了这一直觉。",
    reviewMaiaGain: "相比 Maia 首选 {move}，实战多保留 {pawns} 兵的优势，预期得分高 {points} 个百分点。",
    reviewTurningPoint: "核心转折",
    reviewQuality_best: "最佳",
    reviewQuality_good: "好棋",
    reviewQuality_inaccuracy: "不精确",
    reviewQuality_mistake: "失误",
    reviewQuality_blunder: "大漏着",
    reviewQuality_forced: "强制着法",
    reviewQuality_unknown: "未完成",
    reviewQuality_book: "开局库着法",
    reviewQuality_beyond: "突破直觉",
    reviewQuality_precise: "精准直觉",
    reviewQuality_trap: "直觉陷阱",
    practiceProgress: "重试 {current} / {total}",
    practiceHint: "给个提示",
    practiceReveal: "查看解析",
    practiceNext: "下一局面",
    practiceFinish: "查看练习小结",
    practiceSkip: "跳过",
    practiceHintFrom: "提示：考虑从 {square} 出发的棋子。",
    practiceNoHint: "当前分析不足以提供可靠提示。",
    practiceAnswer: "当前搜索最佳：{move}。这题记为已查看答案。",
    practiceSummary: "本次练习结果",
    practiceSummaryCounts: "独立找到 {independent} · 提示后找到 {hinted} · 查看答案 {revealed} · 待重试 {remaining}",
    practiceSessionNote: "记录仅保留在本次棋谱会话；完成一次不代表已经掌握。",
    practiceBack: "返回工作台",
    practiceStatus_independent: "独立找到",
    practiceStatus_hinted: "提示后找到",
    practiceStatus_revealed: "已查看答案",
    practiceStatus_hint_used: "已使用提示",
    practiceStatus_skipped: "待重试",
    practiceStatus_attempted: "仍需重试",
    practiceStatus_uncertain: "判断未完成",
    focusMode: "专注",
    resizeBoard: "调整棋盘宽度（方向键调整，双击或 Home 恢复）",
    resizeInsight: "调整直觉栏宽度（方向键调整，双击或 Home 恢复）",
    currentPosition: "当前局面",
    whitePerspective: "白方视角",
    chartOriginal: "实战",
    chartBranch: "我的分支",
    branchStart: "分支起点",
    chartPending: "等待评估",
    chartComparisonLabel: "实战与分支走势，白方视角",
    chartThroughMove: "第 {move} 回合",
    branchComparison: "分支对比",
    branchScoreNote: "走势保留实战作参照，试走不改变对局成绩。",

    gameReview: "棋局复盘",
    intuitionTitle: "Maia 直觉扫描",
    intuitionIdle: "评分完成后独立扫描",
    intuitionScanning: "准备直觉模型…",
    intuitionPaused: "已暂停 · 评分仍可查看",
    intuitionDone: "扫描完成",
    intuitionFailed: "直觉暂不可用，可重试",
    intuitionPartial: "部分局面未完成，可重试",
    intuitionPause: "暂停",
    intuitionResume: "继续",
    intuitionStart: "开始扫描",
    intuitionCount: "预测 {current}/{total}",
    intuitionVerifying: "复核 {current}/{total}",
    intuitionLoading: "模型加载 {percent}%",

    filterMistakes: "明显失误",
    retryMove: "重试这一步",
    retryTurn: "轮到{side} · 独立思考",
    retryPrompt: "在棋盘上走出你的选择。候选、评分与后续棋谱已隐藏。",
    retryChecking: "正在验证你的选择…",
    retryGood: "这步成立。评估与引擎当前的最佳选择相差不超过 0.30 兵。",
    retryAgain: "这步仍有明显损失。可以再试一次，或查看解析。",
    retryUncertain: "本次计算不足以可靠判定。请重试，或查看分析。",

    userBranches: '我的分支',
    reviewPausedForPosition: '全盘分析暂缓 · 优先分析当前局面',
    reviewResumeHint: '返回对局并停止回看后继续全盘分析。',
    choosePromotion: '选择升变棋子',
    clearThoughtArrows: '清除当前局面的思考箭头',
    boardInteractionHelp: '左键点击或拖动走棋。右键拖动画箭头，按住 Shift 右拖走棋并标注 !!，右键单击标记格子。← / → 在全页面回看，输入框与弹窗除外。',
    preferencesConnected: '设置已与插件同步；修改会应用到其他已打开入口。',
    preferencesBrowserOnly: '设置保存在此浏览器；安装新版插件后，可与 popup 和悬浮窗同步。',
    modelDownloading: '下载中 {percent}%',

    engineEdition: "引擎版本",
    intuitionEdition: "直觉版本",
    sfLiteEdition: "SF19 轻量版",
    sfStandardEdition: "SF19 标准版",
    largeModelNote: "SF19 标准版约 95 MB；Maia 5M / 23M / 79M 约 28 / 104 / 159 MB。首次下载后保存在浏览器，切换版本会重新分析。",
    standardWebOnly: "本地扩展页面使用 SF19 Lite；标准版请打开网页版复盘",
    // Compact two-column review studio
    reviewSettings: "分析设置",
    btnClose: "关闭",
    currentPosition: "当前局面",
    engineCandidates: "引擎",
    intuitionCandidates: "直觉",
    reviewGuide: "复盘说明",
    maiaTrendTitle: "Maia 分段趋势",
    maiaTrendProgress: "已完成 {count}/{total} 档",
    maiaTrendPartial: "部分档位未能完成（{count}/{total}）",
    maiaTrendRetry: "重试缺失档位",
    maiaTrendProbability: "Maia 走法选择概率",
    maiaTrendCurrent: "当前 {elo} Elo",
    maiaTrendView: "趋势显示方式",
    maiaTrendChart: "曲线",
    maiaTrendData: "采样数据",
    maiaTrendLegend: "着法图例，选择着法以高亮曲线",
    maiaTrendSettings: "引擎设置",
    maiaTrendApply: "应用并刷新",
    maiaTrendRefreshing: "正在用新设置分析当前局面…",
    maiaTrendRetryPosition: "重试当前局面",
    maiaTrendProbabilitySource: "走法概率 · {model}",
    maiaTrendEvaluationSource: "首选与 Δ 评分 · {engine} · {status}",
    maiaTrendDepth: "主搜索 D{depth}",
    maiaTrendAwaitingScore: "等待评估",
    maiaTrendScoreUnavailable: "评估暂不可用",
    maiaTrendStockfishLite: "Stockfish 19 轻量版",
    maiaTrendStockfishStandard: "Stockfish 19 标准版",
    positionAnalysis: "当前局面分析",
    notationHeading: "记谱",
    keyMovesHeading: "关键步",
    positionStrength: "局面分析强度",
    strengthStandard: "标准",
    strengthDeep: "深入",
    showMaiaArrows: "显示 Maia 候选箭头",
    showStockfishArrows: "显示 Stockfish 最佳着法箭头",
    showIntuitionHeatmap: "显示直觉热力图",
    showIntuitionProbability: "显示直觉概率",
    boardOrientation: "棋盘方向",
    whiteAtBottom: "白方在下",
    blackAtBottom: "黑方在下",
    whitePerspectiveScore: "白方视角得分：{score}",
    candidateDepth: "深度 {depth}",
    engineFailed: "启动失败",
    engineReady: "就绪",
    engineStarting: "启动中",
    engineNotStarted: "未启动",
    candidatesAfterReview: "整盘分析中，完成后显示当前局面候选",
    positionUnavailable: "局面评估暂不可用，切步或重新分析可重试",
    intuitionUnavailable: "直觉预测暂不可用",
    noLegalMoves: "当前局面无合法着法",
    previewCandidate: "试演 {move}",
    engineContinuation: "后续变化由引擎计算，概率仅对应 Maia 首选着法",
    reviewMoveBefore: "回看第 {number} 步 {move} · 走前局面",

    // Header & Meta
    appTitle: '歧路 Diverge · 局面分析与棋局复盘',
    appDescription: '对比 Stockfish 引擎建议与 Maia 人类直觉，探索网页棋图识别的局面、FEN、PGN 和完赛棋局中的分歧。',
    studioName: '歧路 Diverge',
    studioBadge: '分析工作台',
    whitePlayer: '⚪ 白方',
    blackPlayer: '⚫ 黑方',
    btnImportPgn: '导入 PGN',
    btnReanalyze: '重新分析',
    btnLangToggle: 'English',

    // Board Column
    boardHeading: '棋盘',
    branchBannerText: '分支',
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

    // Progress Banner
    evaluatingEngine: '引擎评估中 ({current}/{total}) · {move}',
    analyzingIntuition: '人类直觉盲区分析 ({current}/{total}) · {move}',
    preparingEngine: '正在准备引擎评估...',
    launchingEngines: '⚡ 正在分析全盘对局...',
    startingEngines: '正在启动计算与直觉引擎...',

    // Eval Chart
    evalChartTitle: '局面走势',
    chartWhiteAdvantage: '白方局势: ',

    // Analysis / Perspective Column
    cardEngineBest: '引擎推荐',
    cardPlayed: '实战着法',
    eloLabel: '直觉 ELO:',
    eloBeginner: '1100 (初学)',
    eloIntermediate: '1500 (进阶)',
    eloClub: '1900 (俱乐部)',
    eloMaster: '2200 (大师)',
    evalScore: '评估 {score}',
    evalLabel: '评估',
    probLabel: '概率',
    pawnsUnit: '兵',
    probText: '概率 {prob}%',
    statusCalculating: '计算中...',

    // Branch annotation
    badgeBranch: '🌿 分支试演',

    // Review Column
    accuracyLabel: '引擎精度',
    accuracyScale: '0–100 分',
    accuracySamples: '{valid}/{total} 步有效',
    accuracyAnalysisDetail: '{engine} · 搜索深度 {depth}',
    accuracyTargetDepth: '目标 D{depth}',
    tabKeyMoments: '关键步 ({count})',
    tabNotation: '记谱 ({count})',
    filterAllLabel: '关键局面', filterBeyondLabel: '突破直觉', filterTrapLabel: '直觉陷阱',
    filterAll: '全部 ({count})',
    filterBeyond: '✨ 妙手 ({count})',
    filterTrap: '🫤 俗手 ({count})',

    // Moments List Details
    beyondText: '妙手',
    beyondComboText: '组合延续',
    playedEngineBest: '实战走出引擎首选，优于自然直觉',
    trapText: '俗手',
    lossPawns: '损耗 -{loss} 兵',
    cardEngineBestMove: '引擎首选 {move}',
    blunderText: '大漏 ??',
    mistakeText: '失误 ?',
    inaccuracyText: '疑问手 ?!',
    coverageTooltip: '计算覆盖率: {pct}%',

    // Empty Hero View
    heroTitle: '从一个局面或一盘棋开始',
    heroSubtitle: '导入 FEN 局面或完赛棋谱，探索引擎与人类直觉。网页棋图可先用插件扫描。',
    btnImportCompleted: '导入局面或完赛棋谱',
    chipFischer: '♟️ 菲舍尔世纪之局 (1956)',
    chipKasparov: '♟️ 卡斯帕罗夫不朽之局 (1999)',
    tipDragDrop: '⚡ 支持直接拖放 .pgn 棋谱文件或文本',
    tipPwa: '📱 PWA 模式下可直接在系统文件管理器“以此应用打开”',

    // PGN Import Modal & Overlay
    dragDropTitle: '释放以载入 PGN 棋谱',
    dragDropSubtitle: '支持 .pgn 棋谱文件与文本拖拽',
    modalEyebrow: 'A NEW PERSPECTIVE',
    modalTitle: '从一个局面或一盘棋开始',
    modalDesc: '导入 FEN 局面或已完赛棋谱，对比引擎与人类直觉。',
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
    toastUnrecognizedInput: '⚠️ 未能识别该内容，请确认是否为有效 FEN 局面、PGN 文本或完赛对局链接',
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
    commentaryToggle: 'Write English commentary with Chrome local AI',
    commentaryHelp: 'Use the local model to write a game recap and short notes on key moves.',
    commentaryGameTitle: 'Game recap',
    commentaryTitle: 'Why this move is tempting',
    commentaryExplain: 'Explain this move',
    commentaryTemplateOnly: 'Showing verified chess facts.',
    commentaryChinese: 'Chinese commentary uses verified chess facts.',
    commentaryChecking: 'Checking for a local model…',
    commentaryAvailable: 'The local model is available for game recaps and key-move commentary.',
    commentaryDownloadable: 'Download the Chrome model to enable local English commentary.',
    commentaryDownloading: 'Chrome is downloading the model. Select Download to see the progress.',
    commentaryDownload: 'Download Chrome’s local model',
    commentaryDownloadProgress: 'Local model download progress',
    commentaryStarting: 'Preparing the local model…',
    commentaryProgress: 'Downloading the local model · {percent}%',
    commentaryReady: 'Chrome’s local model is ready.',
    commentaryFailed: 'The local model could not start. Verified commentary is available.',
    commentaryRetry: 'Retry local model setup',
    commentaryChromeUnavailable: 'Chrome’s built-in model is unavailable in this profile. Showing verified commentary.',
    commentaryUnavailable: 'The browser’s built-in model is unavailable. Showing verified commentary.',
    commentarySourceFacts: 'Verified chess facts',
    commentarySourceAi: 'Chrome local AI · based on verified chess facts',
    commentaryTendency: 'At {elo} Elo, Maia gives {played} a {probability}% chance of being chosen.',
    commentaryExplainPlayed: 'The game continued with {action}.',
    commentaryExplainReply: 'Stockfish’s reply is {action}. The played move costs about {points} percentage points of expected score.',
    commentaryMove: '{san}',
    commentaryCapture: '{san}, taking a {piece}',
    commentaryCheck: '{san}, giving check',
    commentaryCaptureCheck: '{san}, taking a {piece} and giving check',
    commentaryPiece_p: 'pawn',
    commentaryPiece_n: 'knight',
    commentaryPiece_b: 'bishop',
    commentaryPiece_r: 'rook',
    commentaryPiece_q: 'queen',
    commentaryLoss: 'In deeper search, the move cost about {points} percentage points of expected score.',
    commentaryAlternative: 'Stockfish prefers {best}, with the played move costing about {points} percentage points of expected score.',
    reviewTimeHeadline: '{loser} ran out of time and {winner} won',
    reviewLinkedTurning: 'After {trigger} on move {round}, {side} could have answered with {best} but played {played}.',
    reviewVerifiedTurning: 'On move {round}, {side} played {played}. A deeper Stockfish search preferred {best}.',
    gameOverview: 'Game overview',
    reviewWinner: '{side} wins',
    reviewDraw: 'The game ends in a draw',
    reviewMateHeadline: '{side} wins by checkmate on move {round}',
    reviewComebackHeadline: '{side} comes from behind to win',
    reviewHoldLeadHeadline: '{side} holds the late advantage and wins',
    reviewDrawHeadline: 'A close game ends in a draw',
    reviewOutcomeTurnHeadline: '{outcome}. {side} missed a chance on move {round}.',
    reviewWinMissHeadline: '{outcome}, but there was a better option on move {round}',
    reviewTurnHeadline: '{side} missed a chance on move {round}',
    reviewPartialHeadline: 'A look at the moves available',
    reviewPartialTurnHeadline: 'In the moves available, {side} missed a chance on move {round}',
    reviewClose: 'Close game overview',
    reviewOpenScore: 'Open Analysis Studio',
    reviewCountdown: 'Opening Analysis Studio in {seconds} seconds',
    reviewCountdownSuffix: 'seconds until Analysis Studio opens',
    reviewReady: 'Game analysis complete · View overview',
    reviewPartialReady: 'Partial analysis ready · View overview',
    reviewScoreMethod: 'How accuracy is scored',
    reviewWhite: 'White',
    reviewBlack: 'Black',
    reviewPracticeSide: 'Practice as',
    reviewLoadedPlies: '{count} moves loaded',
    reviewThroughRound: 'Through move {round}',
    reviewScoredPlies: 'The engine scored {valid} of the {count} moves loaded.',
    reviewBalanced: 'The game stayed close from start to finish.',
    reviewClosingLead: '{side} held the edge through the final few moves.',
    reviewFinalLead: '{side} had the better position at the end.',
    reviewLeadChanged: '{early} had the early edge, but {late} came out ahead on the board.',
    reviewBackToBalance: 'One side pulled ahead, but the position evened out by the end.',
    reviewConfirmedBeyond: 'Beyond intuition · {count}',
    reviewConfirmedTraps: 'Intuition traps · {count}',
    reviewLargestSwing: 'Move {round} is worth a second look. {side} had a better option.',
    reviewInspectRound: 'Review move {round}',
    reviewPracticeOne: 'Replay this position',
    reviewPracticeTwo: 'Replay these 2 positions',
    reviewPracticed: 'Positions revisited · {count}',
    practiceRound: 'Move {round} · {side} to play',
    practiceRetry: 'Try again',
    practiceYourMove: 'Your move',
    practicePlayedMove: 'Played in the game',
    practiceBestLine: 'Engine line',
    practiceMaiaMove: 'Maia’s top choice',
    practiceReply: 'Opponent’s reply',
    reviewSelectedMoves: "Selected moves",
    reviewTotal: "Loaded moves",
    reviewOverview: "Review overview",
    reviewBoth: "Both",
    reviewSideFilter: "Filter by side",
    reviewCategory: "Move quality",
    reviewKeyMoves: "Key moments",
    reviewAllMoves: "All moves",
    reviewReset: "Reset filters",
    reviewIntuitionPending: "Intuition scan is incomplete; counts are not yet available.",
    reviewPartial: "The PGN was only partly parsed; counts cover loaded moves only.",
    reviewSelected: "{side} · {label} · {count} moves",
    reviewPracticeBatch: "Practice selection ({count})",
    reviewNoSelection: "No moves match this selection.",
    reviewEvaluationPending: "Evaluation incomplete; not classified as good.",
    reviewForcedHelp: "Only one legal move was available.",
    reviewLoss: "Loss versus search best: {pawns} pawns",
    reviewTrapReason: "At the selected {elo} rating, Maia predicts this move with {probability}% probability.",
    reviewTrapVerified: "Deeper search found a loss of {pawns} pawns and {points} percentage points of expected score.",
    reviewBeyondReason: "Maia’s natural choice {move} loses about {pawns} pawns; the played move went beyond that intuition.",
    reviewMaiaGain: "Compared with Maia’s top choice {move}, the played move kept {pawns} more pawns of advantage and {points} percentage points of expected score.",
    reviewTurningPoint: "Major turning point",
    reviewQuality_best: "Best",
    reviewQuality_good: "Good",
    reviewQuality_inaccuracy: "Inaccuracy",
    reviewQuality_mistake: "Mistake",
    reviewQuality_blunder: "Blunder",
    reviewQuality_forced: "Forced",
    reviewQuality_unknown: "Incomplete",
    reviewQuality_book: "Opening book",
    reviewQuality_beyond: "Beyond intuition",
    reviewQuality_precise: "Precise intuition",
    reviewQuality_trap: "Intuition trap",
    practiceProgress: "Retry {current} / {total}",
    practiceHint: "Hint",
    practiceReveal: "Show analysis",
    practiceNext: "Next position",
    practiceFinish: "View practice summary",
    practiceSkip: "Skip for now",
    practiceHintFrom: "Hint: consider the piece on {square}.",
    practiceNoHint: "Analysis is insufficient for a reliable hint.",
    practiceAnswer: "Current search best: {move}. This position is recorded as revealed.",
    practiceSummary: "Practice results",
    practiceSummaryCounts: "Independent {independent} · With hints {hinted} · Revealed {revealed} · Retry later {remaining}",
    practiceSessionNote: "Records stay in this game session only. One success does not establish mastery.",
    practiceBack: "Back to Studio",
    practiceStatus_independent: "Found independently",
    practiceStatus_hinted: "Found with hints",
    practiceStatus_revealed: "Answer revealed",
    practiceStatus_hint_used: "Hint used",
    practiceStatus_skipped: "Retry later",
    practiceStatus_attempted: "Needs another try",
    practiceStatus_uncertain: "Unconfirmed",
    focusMode: "Focus",
    resizeBoard: "Resize board (arrow keys; double-click or Home to reset)",
    resizeInsight: "Resize insights (arrow keys; double-click or Home to reset)",
    currentPosition: "Current position",
    whitePerspective: "White’s perspective",
    chartOriginal: "Game",
    chartBranch: "My variation",
    branchStart: "Branch point",
    chartPending: "Awaiting evaluation",
    chartComparisonLabel: "Game and variation evaluations, White’s perspective",
    chartThroughMove: "Move {move}",
    branchComparison: "Compare variation",
    branchScoreNote: "The game remains on the timeline. Exploration does not change game accuracy.",

    gameReview: "Game review",
    intuitionTitle: "Maia intuition scan",
    intuitionIdle: "Scans independently after scoring",
    intuitionScanning: "Preparing intuition model…",
    intuitionPaused: "Paused · Scores remain available",
    intuitionDone: "Scan complete",
    intuitionFailed: "Intuition unavailable. Retry when ready.",
    intuitionPartial: "Some positions incomplete. Retry available.",
    intuitionPause: "Pause",
    intuitionResume: "Resume",
    intuitionStart: "Start scan",
    intuitionCount: "Predicting {current}/{total}",
    intuitionVerifying: "Verifying {current}/{total}",
    intuitionLoading: "Loading model {percent}%",

    filterMistakes: "Major errors",
    retryMove: "Retry this move",
    retryTurn: "{side} to move · Think independently",
    retryPrompt: "Play your choice on the board. Candidates, evaluations and notation are hidden.",
    retryChecking: "Checking your choice…",
    retryGood: "This move works. It evaluates within 0.30 pawns of the engine’s best choice.",
    retryAgain: "This move still loses ground. Try again or show the analysis.",
    retryUncertain: "Insufficient analysis for a reliable verdict. Retry or show analysis.",

    userBranches: 'My variations',
    reviewPausedForPosition: 'Game review paused · Analysing this position first',
    reviewResumeHint: 'Return to the game and pause navigation to resume its review.',
    choosePromotion: 'Choose promotion piece',
    clearThoughtArrows: 'Clear thought arrows for this position',
    boardInteractionHelp: 'Click or drag to move. Right-drag draws an arrow, Shift + right-drag plays the move and marks it with !!, and right-click marks a square. ← / → navigates across the page, except in inputs and dialogs.',
    preferencesConnected: 'Preferences sync with your extension and other open entry points.',
    preferencesBrowserOnly: 'Saved in this browser. Install the updated extension to sync with its popup and floating panel.',
    modelDownloading: 'Downloading {percent}%',

    engineEdition: "Engine version",
    intuitionEdition: "Intuition model",
    sfLiteEdition: "SF19 Lite",
    sfStandardEdition: "SF19 Standard",
    largeModelNote: "SF19 Standard: about 95 MB. Maia 5M / 23M / 79M: about 28 / 104 / 159 MB. Cached in your browser after download. Switching versions starts a new review.",
    standardWebOnly: "Local extension pages use SF19 Lite; open the web studio for Standard",
    // Compact two-column review studio
    reviewSettings: "Analysis settings",
    btnClose: "Close",
    currentPosition: "Position",
    engineCandidates: "Engine",
    intuitionCandidates: "Intuition",
    reviewGuide: "Review guide",
    maiaTrendTitle: "Maia Elo trends",
    maiaTrendProgress: "{count} of {total} ratings complete",
    maiaTrendPartial: "Some ratings could not be sampled ({count}/{total})",
    maiaTrendRetry: "Retry missing ratings",
    maiaTrendProbability: "Maia move probability",
    maiaTrendCurrent: "Current Elo {elo}",
    maiaTrendView: "Trend display",
    maiaTrendChart: "Chart",
    maiaTrendData: "Sampled values",
    maiaTrendLegend: "Move legend. Select a move to highlight its curve",
    maiaTrendSettings: "Engine settings",
    maiaTrendApply: "Apply and refresh",
    maiaTrendRefreshing: "Analysing this position with the new settings…",
    maiaTrendRetryPosition: "Retry this position",
    maiaTrendProbabilitySource: "Move probabilities · {model}",
    maiaTrendEvaluationSource: "Top move and Δ scores · {engine} · {status}",
    maiaTrendDepth: "Root search D{depth}",
    maiaTrendAwaitingScore: "Awaiting evaluation",
    maiaTrendScoreUnavailable: "Evaluation unavailable",
    maiaTrendStockfishLite: "Stockfish 19 Lite",
    maiaTrendStockfishStandard: "Stockfish 19 Standard",
    positionAnalysis: "Current position analysis",
    notationHeading: "Moves",
    keyMovesHeading: "Key moves",
    positionStrength: "Position analysis strength",
    strengthStandard: "Standard",
    strengthDeep: "Deep",
    showMaiaArrows: "Show Maia candidate arrows",
    showStockfishArrows: "Show Stockfish best-move arrow",
    showIntuitionHeatmap: "Show intuition heatmap",
    showIntuitionProbability: "Show move probabilities",
    boardOrientation: "Board orientation",
    whiteAtBottom: "White at bottom",
    blackAtBottom: "Black at bottom",
    whitePerspectiveScore: "White’s perspective: {score}",
    candidateDepth: "Depth {depth}",
    engineFailed: "Failed to start",
    engineReady: "Ready",
    engineStarting: "Starting",
    engineNotStarted: "Not started",
    candidatesAfterReview: "Game review in progress; position candidates follow",
    positionUnavailable: "Position evaluation unavailable; navigate or reanalyze to retry",
    intuitionUnavailable: "Intuition prediction unavailable",
    noLegalMoves: "No legal moves in this position",
    previewCandidate: "Explore {move}",
    engineContinuation: "Continuation calculated by the engine; probability applies to the first Maia move only",
    reviewMoveBefore: "Review {number}. {move} · Before the move",

    // Header & Meta
    appTitle: 'Diverge · Chess Analysis & Game Review',
    appDescription: 'Compare Stockfish analysis with Maia human intuition across webpage chess diagrams, FEN positions, PGN games and personal variations.',
    studioName: 'Diverge',
    studioBadge: 'Analysis Studio',
    whitePlayer: '⚪ White',
    blackPlayer: '⚫ Black',
    btnImportPgn: 'Import PGN',
    btnReanalyze: 'Re-analyze',
    btnLangToggle: '中文',

    // Board Column
    boardHeading: 'Chessboard',
    branchBannerText: 'Branch',
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

    // Progress Banner
    evaluatingEngine: 'Engine evaluation ({current}/{total}) · {move}',
    analyzingIntuition: 'Maia intuition analysis ({current}/{total}) · {move}',
    preparingEngine: 'Preparing engine evaluation...',
    launchingEngines: '⚡ Analyzing full game...',
    startingEngines: 'Starting engine & intuition models...',

    // Eval Chart
    evalChartTitle: 'Evaluation Trend',
    chartWhiteAdvantage: 'White Advantage: ',

    // Analysis / Perspective Column
    cardEngineBest: 'Engine Best',
    cardPlayed: 'Played Move',
    eloLabel: 'Intuition Elo:',
    eloBeginner: '1100 (Beginner)',
    eloIntermediate: '1500 (Intermediate)',
    eloClub: '1900 (Club)',
    eloMaster: '2200 (Master)',
    evalScore: 'Eval {score}',
    evalLabel: 'Eval',
    probLabel: 'Prob',
    pawnsUnit: 'pawns',
    probText: 'Prob {prob}%',
    statusCalculating: 'Calculating...',

    // Branch annotation
    badgeBranch: '🌿 Branch Replay',

    // Review Column
    accuracyLabel: 'Accuracy',
    accuracyScale: '0–100 points',
    accuracySamples: '{valid}/{total} moves evaluated',
    accuracyAnalysisDetail: '{engine} · Search depth {depth}',
    accuracyTargetDepth: 'target D{depth}',
    tabKeyMoments: 'Key Moments ({count})',
    tabNotation: 'Notation ({count})',
    filterAllLabel: 'Key moments', filterBeyondLabel: 'Beyond intuition', filterTrapLabel: 'Intuition trap',
    filterAll: 'All ({count})',
    filterBeyond: '✨ Brilliant ({count})',
    filterTrap: '🫤 Intuition trap ({count})',

    // Moments List Details
    beyondText: 'Brilliant',
    beyondComboText: 'Combo Follow-up',
    playedEngineBest: 'Played engine best, outperforming natural intuition',
    trapText: 'Intuition trap',
    lossPawns: 'Loss -{loss} pawns',
    cardEngineBestMove: 'Engine best {move}',
    blunderText: 'Blunder ??',
    mistakeText: 'Mistake ?',
    inaccuracyText: 'Inaccuracy ?!',
    coverageTooltip: 'Engine coverage: {pct}%',

    // Empty Hero View
    heroTitle: 'Start with a Position or Game',
    heroSubtitle: 'Import a FEN position or finished game to explore engine and human choices. Scan webpage diagrams with the extension.',
    btnImportCompleted: 'Import Position or Game',
    chipFischer: '♟️ Fischer: Game of the Century (1956)',
    chipKasparov: '♟️ Kasparov: Pearl of Wijk aan Zee (1999)',
    tipDragDrop: '⚡ Drag & drop .pgn files or text anywhere',
    tipPwa: '📱 In PWA mode, open directly via system file manager',

    // PGN Import Modal & Overlay
    dragDropTitle: 'Drop to Load PGN Game',
    dragDropSubtitle: 'Supports .pgn files and raw PGN text',
    modalEyebrow: 'A NEW PERSPECTIVE',
    modalTitle: 'Start with a Position or Game',
    modalDesc: 'Import a FEN position or completed game to compare engine analysis and human intuition.',
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
    toastUnrecognizedInput: '⚠️ Unrecognized input. Please provide a valid FEN, PGN or completed-game link.',
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

  const reviewGuide = document.getElementById('studio-review-guide');
  if (reviewGuide) reviewGuide.href = `../guide/index.html?lang=${currentLang}#review-method`;

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

  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
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
  const description = document.querySelector('meta[name=description]');
  if (description) description.content = t('appDescription');

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
