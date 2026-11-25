import { BoardUI } from '../analysis/board-ui.js?v=20261124-perspective';
import { boardShortcut, playNavigationSound } from '../analysis/board-controls.js?v=20261124-controls';
import { soundEffects } from '../analysis/sound-effects.js?v=20261025-v115';
import { ChessBoard } from '../engine/chess-core.js';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { expectedScore, intuitionKind } from '../engine/review-policy.js';
import { RATINGS, probabilities, highlightMaiaTrend, renderMaiaTrendLegend, renderMaiaTrendPlot
} from '../analysis/maia-elo-trend.js?v=20261125-position-poster';
import { engineExperienceHint, getSavedPreferences, initializePreferences, savePreferences, subscribePreferences } from '../engine/engine-preferences.js';
import { MAIA_VARIANTS } from '../engine/engine-variants.js';
import { ModelCache } from '../engine/model-cache.js';
import { modelCacheKeys } from '../engine/model-loader.js?v=20261124-mobile';
import { canvasPng, copyPng, copyShareLink, downloadPng } from '../analysis/share-export.js?v=20261124-divergence-cards';
import { sharedAnalysis } from './shared-analysis.js?v=20261125-live-rounds';

const copy = {
  zh: {
    moves: '实战着法', engines: '双引擎对比', rating: '段位',
    first: '第一步', previous: '上一步', next: '下一步', latest: '回到最新', share: '分享观赛海报',
    flip: '翻转棋盘', reviewGame: '查看整盘复盘报告 →',
    play: '自动播放', pausePlay: '暂停播放', clear: '清除思考箭头', moveSound: '行棋音效',
    mute: '关闭行棋音效', unmute: '开启行棋音效', threeLines: '3 条候选',
    trend: '人类视角', trendSubtitle: '600–2600 Elo 怎么走', chart: '曲线', trendData: '采样数据', targetDepth: '目标',
    trendLegend: '着法图例。★ 为 Stockfish 首选，M 为 Maia 首选。',
    sharedPending: '正在等待云端分析。', sharedSource: '云端 Stockfish D{depth} · Maia 79M · {elo} Elo',
    sharedLocal: '本地分析',
    blindSpot: '全分段盲区：Maia 预测 600–2600 Elo 几乎无人想到 {move}',
    trendPeak: 'Stockfish 首选 {move} 在 {elo} Elo 的预测选着概率最高（{prob}%）。',
    posterStart: '正在请不同段位的棋手看看这步棋…', posterDrawing: '正在把从新手到大师的选择画成海报…',
    posterIncomplete: '还有些棋力的选择没算出来，可以再试一次。', posterTerminal: '这局面已经没有合法着法，可以复制棋谱链接。',
    posterBlindBadge: '全分段盲区', posterBlindNote: '几乎没人想到',
    posterVariation: '如果改走 {move}？', posterUpcoming: '即将开战',
    posterWhiteEdge: '白优', posterBlackEdge: '黑优', posterEqual: '均势',
    posterWhiteMate: '白方有将杀', posterBlackMate: '黑方有将杀',
    posterEngineChoice: '引擎首选', posterHumanChoice: '人类直觉',
    posterChart: '人类视角 · 各段位会怎么选', posterChartNote: '从 600 到 2600 分的直觉变化 · Maia 预测',
    posterScan: '扫码在 4chess.cc 试走这一步', posterScanGame: '扫码回到本局实战',
    posterQrFallback: '变化较长。海报扫码回到实战起点，复制链接可分享完整变化。',
    posterSaved: '已保存海报', posterCopied: '已复制海报',
    posterCopyFail: '复制图片失败，可用「保存图片」。', enablePoster: '启用双引擎',
    quickScore: 'Stockfish 快算评估',
    perspectiveDisabled: '启用 Maia 后查看各段直觉',
    schedule: '赛程与比分', game: '第 {n} 局', countdown: '距开赛 {time}', title: '2026 棋王战',
    mobileTitle: '棋王战', loadMaia: '加载 · {size}', loadMaiaLabel: '加载 {model}，约 {size}', loadingMaia: '加载中…',
    settings: '设置', sfArrows: 'Stockfish 箭头', maiaArrows: 'Maia 箭头', whiteEvaluation: '白方视角评估',
    estimatedClock: '根据最近一次官方时钟估算', startPosition: '开局局面',
    variationUnavailable: '此链接中的试走变化无法在当前棋谱上重现。',
    variationTooLong: '试走变化超过 128 步，可缩短变化后再分享。',
    engineIdle: '未启动', engineStarting: '正在启动', engineCache: '正在检查缓存', engineReady: '已就绪', engineError: '加载失败',
    engineDownloading: '下载中', enginePreparing: '正在装载模型', engineCacheSource: 'IndexedDB 缓存', engineBundled: '站内资源',
    copyLink: '复制链接', copyImage: '复制图片',
    linkCopied: '已复制直达链接', linkCopyManual: '可长按下方链接复制。', shareLink: '分享链接', close: '关闭', download: '保存图片',
    trendRetry: '重试缺失档位', trendProgress: 'Maia 走法选择概率 · 已完成 {count}/{total} 档',
    sourceLead: '转播数据', delay: '着法和时钟以转播为准，可能晚于现场。',
    analyze: '启用双引擎', retry: '重试分析', pause: '暂停双引擎',
    mobileAnalyze: '启用', mobileRetry: '重试', mobilePause: '暂停',
    engineBusy: '正在分析当前局面…', engineFailed: '双引擎暂不可用。', partial: 'Maia-3 暂不可用。',
    branch: '试走变化', returnGame: '返回实战', trendTerminal: '这个局面已无合法着法。',
    live: '转播中', finished: '本局已结束', cancelled: '本局取消',
    scheduled: '尚未开赛', waiting: '等待官方着法', loading: '正在连接 Lichess 转播',
    stale: '转播更新暂缓 · 显示最近收到的棋谱', unavailable: '暂时无法连接转播，将自动重试',
    newMove: '新着法已更新 · 回到最新', waitingMove: '等待第一步', white: '白方', black: '黑方',
    trap: '直觉陷阱', beyond: '神之一手', precise: '精准突破', card: '棋王战瞬间',
    of: ' / ', scan: '扫码回到转播', score: '赛况总比分', unknown: '—',
    shareFailed: '暂时无法生成战报卡。'
  },
  en: {
    moves: 'Moves played', engines: 'Compare engines', rating: 'Rating',
    first: 'Start position', previous: 'Previous move', next: 'Next move', latest: 'Latest move', share: 'Share broadcast poster',
    flip: 'Flip board', reviewGame: 'View the full game review →',
    play: 'Autoplay', pausePlay: 'Pause playback', clear: 'Clear arrows', moveSound: 'Move sounds',
    mute: 'Mute move sounds', unmute: 'Unmute move sounds', threeLines: '3 lines',
    trend: 'Human perspective', trendSubtitle: 'How 600–2600 Elo players might move', chart: 'Chart', trendData: 'Samples', targetDepth: 'Target',
    trendLegend: 'Move legend. ★ marks the Stockfish pick and M marks the Maia pick.',
    sharedPending: 'Waiting for shared analysis.', sharedSource: 'Cloud Stockfish D{depth} · Maia 79M · {elo} Elo',
    sharedLocal: 'Analyze locally',
    blindSpot: 'Across 600–2600 Elo, Maia predicts almost nobody would find {move}',
    trendPeak: 'Stockfish’s {move} is most likely at {elo} Elo ({prob}% predicted).',
    posterStart: 'Seeing how players across ratings read this move…', posterDrawing: 'Drawing the rating curve onto your card…',
    posterIncomplete: 'Some predictions are still missing. Try again to finish your poster.',
    posterTerminal: 'This position has no legal moves. You can still copy its link.',
    posterBlindBadge: 'Across-rating blind spot', posterBlindNote: 'Almost nobody finds it',
    posterVariation: 'What if {move}?', posterUpcoming: 'About to begin',
    posterWhiteEdge: 'White is ahead', posterBlackEdge: 'Black is ahead', posterEqual: 'Even',
    posterWhiteMate: 'White has mate', posterBlackMate: 'Black has mate',
    posterEngineChoice: 'Engine pick', posterHumanChoice: 'Human instinct',
    posterChart: 'Human perspective · Moves by rating', posterChartNote: 'From 600 to 2600 Elo · Maia predictions',
    posterScan: 'Scan to try this move on 4chess.cc', posterScanGame: 'Scan to return to the game position',
    posterQrFallback: 'The QR code opens the game position. Copy the link to share the full variation.',
    posterSaved: 'Poster saved', posterCopied: 'Poster copied',
    posterCopyFail: 'Could not copy the image. Use Save image instead.', enablePoster: 'Enable both engines',
    quickScore: 'Quick Stockfish evaluation',
    perspectiveDisabled: 'Enable Maia to see rating trends',
    schedule: 'Schedule and results', game: 'Game {n}', countdown: 'Starts in {time}', title: '2026 World Championship',
    mobileTitle: 'World Championship', loadMaia: 'Load · {size}', loadMaiaLabel: 'Load {model}, about {size}', loadingMaia: 'Loading…',
    settings: 'Settings', sfArrows: 'Stockfish arrows', maiaArrows: 'Maia arrows', whiteEvaluation: 'Evaluation from White’s perspective',
    estimatedClock: 'Estimated from the latest official clock reading', startPosition: 'Starting position',
    variationUnavailable: 'The linked variation can’t be replayed from the current game score.',
    variationTooLong: 'This variation exceeds 128 plies. Shorten it to share.',
    engineIdle: 'Not started', engineStarting: 'Starting', engineCache: 'Checking cache', engineReady: 'Ready', engineError: 'Could not load',
    engineDownloading: 'Downloading', enginePreparing: 'Loading model', engineCacheSource: 'IndexedDB cache', engineBundled: 'Site assets',
    copyLink: 'Copy link', copyImage: 'Copy image',
    linkCopied: 'Direct link copied', linkCopyManual: 'Select and copy the link below.', shareLink: 'Share link', close: 'Close', download: 'Save image',
    trendRetry: 'Retry missing ratings', trendProgress: 'Maia move probability · {count}/{total} rating bands',
    sourceLead: 'Broadcast by', delay: 'Moves and clock readings may be delayed.',
    analyze: 'Enable engines', retry: 'Retry analysis', pause: 'Pause engines',
    mobileAnalyze: 'Enable', mobileRetry: 'Retry', mobilePause: 'Pause',
    engineBusy: 'Analyzing the current position…', engineFailed: 'Engine analysis is unavailable.', partial: 'Maia-3 is unavailable.',
    branch: 'Variation', returnGame: 'Return to game', trendTerminal: 'This position has no legal moves.',
    live: 'On air', finished: 'Game finished', cancelled: 'Cancelled',
    scheduled: 'Scheduled', waiting: 'Waiting for official moves', loading: 'Connecting to Lichess Broadcast',
    stale: 'Feed delayed · showing the last received moves', unavailable: 'Broadcast unavailable. Retrying automatically.',
    newMove: 'New moves available · go to latest', waitingMove: 'Waiting for the first move', white: 'White', black: 'Black',
    trap: 'Intuition trap', beyond: 'Brilliant move', precise: 'Precise breakthrough', card: 'World Championship moment',
    of: ' / ', scan: 'Scan to watch', score: 'Match score', unknown: '—',
    shareFailed: 'Could not generate the card.'
  }
};
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const eventId = params.get('event') || 'wcc2026';
let lang = params.get('lang') === 'en' ? 'en' : params.get('lang') === 'zh' ? 'zh'
  : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const t = (key, locale = lang) => copy[locale][key];
const foreground = () => !document.hidden;
const analysisAllowed = () => window.top === window && !FairPlayGuard.isLiveGameInProgress();
const initialPly = /^\d{1,6}$/.test(params.get('ply') || '') ? Number(params.get('ply')) : null;
const MAX_SHARED_VARIATION = 128;
// Keep modules at least two pixels wide in the poster's 154 px QR area.
const MAX_POSTER_QR_URL = 230;
const compactLayout = matchMedia('(max-width: 720px)');
const mobileDownloads = compactLayout.matches || matchMedia('(pointer: coarse)').matches;
const maiaSizes = { '5m': '28 MiB', '23m': '104 MiB', '79m': '159 MiB' };
const trendSamples = new Map();

const state = {
  event: null, round: params.get('round'), snapshot: null, cursor: 0, follow: initialPly === null,
  initialPly, initialVariation: params.get('line'), initialBase: params.get('base'),
  branch: null, unseen: false, stale: false, roundKey: 0,
  engines: null, engineEnabled: analysisAllowed(), requestedKey: '', analysis: null, analyzing: false, requestVersion: 0,
  cachedMaia: [],
  settings: { maiaVariant: mobileDownloads ? '5m' : '23m', maiaMode: mobileDownloads ? 'off' : 'download',
    stockfishVariant: 'lite', depth: 18, elo: 2600, sfArrows: true, maiaArrows: true }
};
const board = new BoardUI($('event-board'), {
  orientation: params.get('orientation') === 'black' ? 'black' : 'white',
  brilliantArrows: true,
  touchTapOnly: true,
  onMove(move, fen) {
    state.boardFen = fen;
    state.boardMove = move.uci;
    if (!state.snapshot || !analysisAllowed()) {
      paintBoard();
      return;
    }
    state.branch = extendBranch(state.branch, move, fen);
    state.follow = false;
    stopPlayback();
    soundEffects.playSoundForMove(move.san);
    cancelAnalysis();
    paintClocks();
    paintControls();
    void analyzeMove();
  }
});

const fenAt = ply => state.snapshot?.moves[ply - 1]?.fen || state.snapshot?.initialFen || ChessBoard.INITIAL_FEN;
const historyAt = ply => Array.from({ length: Math.min(7, ply) }, (_, index) => fenAt(Math.max(0, ply - 7) + index));

function extendBranch(branch, move, fen) {
  const baseFen = branch?.baseFen ?? fenAt(state.cursor);
  const history = branch ? [...branch.history, branch.fen].slice(-7) : [...historyAt(state.cursor), baseFen].slice(-7);
  return { baseFen, fen, move, history, line: [...(branch?.line || []), move.uci] };
}

function restoreVariation(line, base, ply) {
  const moves = line.split('.');
  const startingFen = fenAt(ply);
  if (!analysisAllowed() || base !== startingFen || moves.length > MAX_SHARED_VARIATION) return null;
  const trial = new ChessBoard(startingFen);
  let branch = null;
  for (const uci of moves) {
    const move = trial.getLegalMoves().find(candidate => candidate.uci === uci);
    if (!move) return null;
    trial.makeMove(move);
    branch = extendBranch(branch, move, trial.getFen());
  }
  return branch;
}

function playerName(player, locale = lang) {
  return player?.[locale === 'en' ? 'nameEn' : 'name'] || '';
}

function clock(seconds) {
  if (!Number.isFinite(seconds)) return '–:––';
  const value = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(value / 60);
  const sec = String(value % 60).padStart(2, '0');
  return minutes < 60 ? minutes + ':' + sec : Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + sec;
}

function paintLanguage() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  for (const element of document.querySelectorAll('[data-copy]')) element.textContent = t(element.dataset.copy);
  for (const element of document.querySelectorAll('[data-label]')) element.setAttribute('aria-label', t(element.dataset.label));
  for (const [id, keys] of Object.entries({ first: 'Home', previous: 'ArrowLeft J', next: 'ArrowRight K', latest: 'End', 'flip-board': 'F' })) {
    $(id).title = `${$(id).getAttribute('aria-label')} (${keys.replace('ArrowLeft J', '← / J').replace('ArrowRight K', '→ / K')})`;
    $(id).setAttribute('aria-keyshortcuts', keys);
  }
  $('btn-settings').title = t('settings');
  $('language').textContent = lang === 'en' ? '中文' : 'EN';
  $('round-rail').setAttribute('aria-label', t('schedule'));
  paint();
}

function arrangeMoment() {
  const badge = $('intuition-tag');
  if (compactLayout.matches) {
    $('mobile-moment-slot').append(badge);
    $('round-title').closest('.round-strip').append($('new-move'));
    $('trend-mobile-slot').append($('trend-toggle'));
  } else {
    $('ply-note').before(badge);
    $('event-moves').closest('.event-panel').prepend($('new-move'));
    $('trend-desktop-slot').append($('trend-toggle'));
  }
  paint();
}

const RESULTS = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½' };
const currentRound = () => state.event?.rounds.find(round => round.id === state.round);
const selectRound = id => {
  state.initialPly = null;
  state.initialVariation = null;
  chooseRound(id);
};
const roundName = round => round.number ? t('game').replace('{n}', round.number) : round.name;

function roundTime(timestamp) {
  return timestamp ? new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-GB', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(timestamp) : '';
}

function paintRoundRail(rounds) {
  const rail = $('round-rail');
  const key = JSON.stringify([lang, rounds.map(({ id, number, name, status, result, startsAt }) => [id, number, name, status, result, startsAt])]);
  const refresh = key !== state.railKey;
  if (refresh) {
    const focused = rail.contains(document.activeElement) && document.activeElement.dataset.round;
    state.railKey = key;
    rail.replaceChildren(...rounds.map(round => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.round = round.id;
      button.dataset.status = round.status;
      const name = document.createElement('span');
      name.textContent = round.number ? 'G' + round.number : round.name;
      const detail = document.createElement('strong');
      detail.textContent = RESULTS[round.result] || (round.status === 'live' ? 'LIVE' : round.status === 'scheduled' ? roundTime(round.startsAt) : '') || t(round.status);
      button.setAttribute('aria-label', `${roundName(round)} · ${detail.textContent}`);
      button.append(name, detail);
      return button;
    }));
    if (focused) Array.from(rail.children).find(button => button.dataset.round === focused)?.focus({ preventScroll: true });
  }
  if (refresh || state.railRound !== state.round) {
    state.railRound = state.round;
    for (const button of rail.children) {
      if (button.dataset.round === state.round) {
        button.setAttribute('aria-current', 'true');
        const left = button.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
        if (left < rail.scrollLeft) rail.scrollLeft = left;
        else if (left + button.offsetWidth > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = left + button.offsetWidth - rail.clientWidth;
      } else button.removeAttribute('aria-current');
    }
  }
}

function roundPlayers(round) {
  const [first, second] = state.event?.players || [];
  const hasClassicalOrder = eventId === 'wcc2026' && round?.number >= 1 && round.number <= 14;
  const expected = hasClassicalOrder ? (round.number % 2 ? [first, second] : [second, first]) : [];
  return [state.snapshot?.white ?? expected[0], state.snapshot?.black ?? expected[1]];
}

function paintCountdown() {
  const round = currentRound();
  const status = state.snapshot?.status ?? round?.status;
  let notice = '';
  let countingDown = false;
  if (status === 'scheduled' && round?.startsAt) {
    const remaining = Math.ceil((round.startsAt - Date.now()) / 1000);
    const time = [Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60]
      .map(part => String(part).padStart(2, '0')).join(':');
    countingDown = remaining > 0;
    notice = countingDown ? t('countdown').replace('{time}', time) : t('waiting');
  }
  const countdown = $('round-countdown');
  countdown.parentElement.dataset.countingDown = String(countingDown);
  countdown.hidden = !notice;
  if (countdown.textContent !== notice) countdown.textContent = notice;
}

function paintRoundHeading() {
  const round = currentRound();
  $('round-title').hidden = !round;
  const result = RESULTS[state.snapshot?.result] || RESULTS[round?.result];
  const status = state.snapshot?.status || round?.status;
  if (round) $('round-title').textContent = roundName(round) + (result ? ' · ' + result : '');
  const time = $('round-time');
  time.hidden = status !== 'scheduled' || !round?.startsAt;
  if (!time.hidden) {
    time.textContent = roundTime(round.startsAt);
    time.dateTime = new Date(round.startsAt).toISOString();
  }
  paintCountdown();
}

function paintEvent() {
  const shortTitle = t(compactLayout.matches ? 'mobileTitle' : 'title');
  $('title').textContent = shortTitle;
  const event = state.event;
  if (!event) return;
  const title = lang === 'en' ? event.titleEn : event.title;
  $('title').textContent = eventId === 'wcc2026' ? shortTitle : title;
  $('title').title = title;
  document.title = title + ' · Diverge';
  const score = $('match-score');
  const names = event.players.map(player => Object.assign(document.createElement('span'), { className: 'score-full', textContent: playerName(player) }));
  const shortNames = { '14205483': lang === 'zh' ? '辛' : 'SIN', '46616543': lang === 'zh' ? '古' : 'GUK' };
  const short = event.players.map(player => Object.assign(document.createElement('span'), {
    className: 'score-short', textContent: shortNames[player.id] ?? playerName(player)
  }));
  const amounts = event.players.map(player => event.scoreIncomplete ? '—' : event.score[player.id]);
  const result = Object.assign(document.createElement('strong'), { textContent: amounts.join(' – ') });
  score.setAttribute('aria-label', [t('score'), names[0]?.textContent, result.textContent, names[1]?.textContent].filter(Boolean).join(' '));
  if (names.length === 2) score.replaceChildren(names[0], short[0], result, names[1], short[1]);

  paintRoundRail(event.rounds.map(round => {
    const snapshot = round.id === state.round ? state.snapshot : null;
    return snapshot && ['live', 'finished'].includes(snapshot.status) && round.status !== 'cancelled'
      ? { ...round, status: snapshot.status, result: RESULTS[snapshot.result] ? snapshot.result : round.result } : round;
  }));
}

function paintBoard() {
  const moves = state.snapshot?.moves || [];
  const played = moves[state.cursor - 1];
  const hint = state.branch?.move || played;
  const fen = state.branch?.fen || fenAt(state.cursor);
  if (state.boardFen !== fen || state.boardMove !== hint?.uci) {
    state.boardFen = fen;
    state.boardMove = hint?.uci;
    board.setPosition(fen, hint ? { from: hint.uci.slice(0, 2), to: hint.uci.slice(2, 4) } : null);
  }
  const [white, black] = roundPlayers(currentRound());
  for (const [side, player] of [['white', white], ['black', black]]) {
    $(side + '-name').textContent = (playerName(player) || t(side)) + (player?.rating ? ' · ' + player.rating : '');
  }
  paintClocks();
}

function paintClocks() {
  const snapshot = state.snapshot;
  const recent = snapshot?.moves.slice(0, state.cursor) || [];
  const turnToMove = snapshot?.status === 'live' && state.follow && !state.branch && !state.stale
    && state.cursor === snapshot.moves.length ? state.boardFen?.split(' ')[1] : null;
  for (const [side, turn] of [['white', 'w'], ['black', 'b']]) {
    const lastMove = recent.findLast(move => move.turn === turn);
    const lastClock = Number.isFinite(lastMove?.clk) ? lastMove : recent.findLast(move => move.turn === turn && Number.isFinite(move.clk));
    const active = turnToMove === turn;
    const estimated = active && lastClock && lastClock === lastMove && Number.isFinite(snapshot.updatedAt);
    const elapsed = estimated ? Math.max(0, (Date.now() - snapshot.updatedAt) / 1000) : 0;
    const remaining = lastClock ? Math.max(0, lastClock.clk - elapsed) : null;
    const time = $(side + '-clock');
    const text = clock(remaining);
    if (time.textContent !== text) time.textContent = text;
    time.title = estimated ? t('estimatedClock') : '';
    time.dataset.low = String(remaining !== null && remaining < 300);
    $(side + '-seat').dataset.toMove = String(active);
  }
}

function paintMoves() {
  const stack = $('event-moves');
  const previous = stack.scrollTop;
  const previousLeft = stack.scrollLeft;
  stack.dataset.placeholder = t('waitingMove');
  stack.setAttribute('aria-label', t('moves'));
  const nodes = [];
  let row, number;
  for (const move of state.snapshot?.moves || []) {
    if (move.moveNumber !== number) {
      number = move.moveNumber;
      row = document.createElement('div');
      row.className = 'move-row';
      const label = document.createElement('span');
      label.textContent = number + '.';
      row.append(label);
      if (move.turn === 'b') row.append(document.createElement('span'));
      nodes.push(row);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ply = move.ply;
    button.textContent = move.san;
    if (state.cursor === move.ply) button.setAttribute('aria-current', 'step');
    row.append(button);
  }
  stack.replaceChildren(...nodes);
  if (compactLayout.matches) {
    stack.scrollLeft = state.follow ? stack.scrollWidth : previousLeft;
    const active = stack.querySelector('[aria-current="step"]');
    if (!state.follow && active) {
      const button = active.getBoundingClientRect();
      const rail = stack.getBoundingClientRect();
      if (button.left < rail.left) stack.scrollLeft += button.left - rail.left;
      else if (button.right > rail.right) stack.scrollLeft += button.right - rail.right;
    }
  } else stack.scrollTop = state.follow ? stack.scrollHeight : previous;
}

function paintControls() {
  const length = state.snapshot?.moves.length || 0;
  const round = currentRound();
  const status = $('event-status');
  status.dataset.state = state.stale ? 'stale' : '';
  status.textContent = t(state.stale ? (state.snapshot || state.event ? 'stale' : 'unavailable')
    : state.snapshot?.status || round?.status || 'loading');
  $('source').href = state.snapshot?.source || round?.source || state.event?.source || $('source').href;
  $('ply-note').textContent = state.branch ? t('branch')
    : length ? state.cursor + t('of') + length : t('waitingMove');
  $('ply-note').dataset.following = String(state.follow);
  $('return-game').hidden = !state.branch;
  $('new-move').hidden = !state.unseen;
  $('new-move').textContent = t('newMove');
  $('previous').disabled = state.cursor === 0 && !state.branch;
  $('first').disabled = $('previous').disabled;
  $('next').disabled = state.cursor === length && !state.branch;
  $('latest').disabled = state.follow && !state.branch;
  paintPlayback();
  paintSoundToggle();
  $('copy-live-link').disabled = $('moment').disabled = !canSharePosition(round);
  paintRoundHeading();
  paintWorkbenchLink();
  paintAnalysis();
}

function paintPlayback() {
  const playing = Boolean(state.replayTimer);
  const control = $('play');
  control.textContent = playing ? '⏸' : '▶';
  control.title = `${t(playing ? 'pausePlay' : 'play')} (Space)`;
  control.setAttribute('aria-label', control.title);
  control.setAttribute('aria-keyshortcuts', 'Space');
  control.setAttribute('aria-pressed', String(playing));
  control.disabled = !playing && (state.branch || state.cursor >= (state.snapshot?.moves.length ?? 0));
}

function paintSoundToggle() {
  const enabled = soundEffects.enabled;
  $('sound-on').toggleAttribute('hidden', !enabled);
  $('sound-off').toggleAttribute('hidden', enabled);
  $('setting-sound').checked = enabled;
  const button = $('sound');
  button.title = `${t(enabled ? 'mute' : 'unmute')} (M)`;
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-keyshortcuts', 'M');
  button.setAttribute('aria-pressed', String(enabled));
  button.classList.toggle('muted', !enabled);
}

function paintWorkbenchLink() {
  const link = $('workbench-game');
  const snapshot = state.snapshot;
  const pgn = snapshot?.status === 'finished' && FairPlayGuard.verifyConcludedGame(snapshot.pgn).ok ? snapshot.pgn : null;
  link.hidden = !pgn || !analysisAllowed();
  if (link.hidden) {
    link.removeAttribute('href');
    return;
  }
  link.href = '/analysis/#' + new URLSearchParams({ pgn, orientation: board.orientation, lang });
  link.textContent = t('reviewGame');
}

function paint() {
  paintEvent();
  paintBoard();
  paintMoves();
  paintControls();
}

function cancelAnalysis() {
  closeTrend();
  clearTimeout(state.sharedTimer);
  state.sharedRetry = null;
  state.sharedPending = false;
  state.requestVersion++;
  state.requestedKey = '';
  state.analysis = null;
  state.moment = null;
  if (state.analyzing) state.engines?.cancel();
}

function closeTrend() {
  state.trend = null;
  if ($('live-trend').open && displayedTrend) $('live-trend').close();
  displayedTrend = null;
}

function showTrendView(table) {
  $('trend-chart').hidden = table;
  $('trend-data').hidden = !table;
  $('trend-chart-view').setAttribute('aria-pressed', String(!table));
  $('trend-data-view').setAttribute('aria-pressed', String(table));
}

function renderTrend(trend) {
  if (shareSession?.trend === trend) paintPosterProgress(shareSession, trend);
  if (!$('live-trend').open || state.trend !== trend) return;
  const { position, samples } = trend;
  const count = completeBands(trend);
  $('trend-status').textContent = t('trendProgress').replace('{count}', count).replace('{total}', RATINGS.length);
  $('trend-retry').hidden = Boolean(trend.pending) || count === RATINGS.length;
  const conclusion = trendConclusion(trend);
  $('trend-conclusion').textContent = conclusion;
  $('trend-conclusion').hidden = !conclusion;
  $('trend-chart').replaceChildren(renderMaiaTrendPlot($('trend-data').querySelector('table'), position.series, samples, position.elo));
  highlightMaiaTrend($('live-trend'), trend.highlighted ?? null);
}

const engineTrendMove = series => series.find(move => move.role === 'sf' || move.role === 'consensus');

function trendConclusion({ position, samples }, locale = lang) {
  const best = engineTrendMove(position.series);
  if (!best) return '';
  const points = RATINGS.map(elo => ({ elo, probability: samples.get(elo)?.get(best.uci) }));
  if (!points.every(point => Number.isFinite(point.probability))) return '';
  const peak = points.reduce((highest, point) => point.probability > highest.probability ? point : highest);
  return t(peak.probability < 3 ? 'blindSpot' : 'trendPeak', locale)
    .replace('{move}', best.san).replace('{elo}', peak.elo).replace('{prob}', peak.probability.toFixed(1));
}

function trendFor(position) {
  if (state.trend?.position !== position) {
    const key = JSON.stringify([MAIA_VARIANTS[state.settings.maiaVariant].key, position.fen, position.history]);
    const samples = position.samples ?? trendSamples.get(key) ?? new Map();
    if (RATINGS.includes(position.elo) && !samples.has(position.elo)) samples.set(position.elo, probabilities(position.moves));
    if (!position.samples) {
      trendSamples.delete(key);
      trendSamples.set(key, samples);
      if (trendSamples.size > 24) trendSamples.delete(trendSamples.keys().next().value);
    }
    state.trend = { position, samples };
  }
  return state.trend;
}

function completeBand(trend, elo) {
  return trend.position.series.every(move => Number.isFinite(trend.samples.get(elo)?.get(move.uci)));
}

function sampleTrend(trend, requireSeries = false) {
  const obsolete = () => state.trend !== trend || !analysisAllowed() || !foreground();
  if (obsolete()) return;
  if (trend.pending) {
    if (requireSeries && !trend.requiresSeries) return trend.pending.then(() => sampleTrend(trend, true));
    return trend.pending;
  }
  trend.requiresSeries = requireSeries;
  trend.pending = (async () => {
    await state.momentTask;
    for (const elo of [...RATINGS].sort((a, b) => Math.abs(a - trend.position.elo) - Math.abs(b - trend.position.elo))) {
      if (obsolete()) return;
      const saved = trend.samples.get(elo);
      if (saved && (!requireSeries || completeBand(trend, elo))) continue;
      const moves = await state.engines.sampleMaia(trend.position, elo, obsolete);
      if (obsolete()) return;
      const sample = probabilities(moves);
      if (sample.size) trend.samples.set(elo, new Map([...(saved ?? []), ...sample]));
      renderTrend(trend);
    }
  })().catch(error => {
    if (!obsolete()) console.debug('Broadcast Maia trend unavailable', error);
  }).finally(() => {
    trend.pending = null;
    if (!obsolete()) renderTrend(trend);
  });
  renderTrend(trend);
  return trend.pending;
}

function paintEvaluation(result) {
  const evaluation = result?.evaluation;
  const share = (expectedScore(evaluation?.cp) ?? .5) * 100;
  const text = evaluation?.text ?? '—';
  const gauge = $('evaluation-gauge');
  gauge.classList.toggle('flipped', board.orientation === 'black');
  gauge.setAttribute('aria-label', t('whiteEvaluation') + ' ' + text);
  gauge.style.setProperty('--white-share', share + '%');
  $('mobile-gauge-score').textContent = text;
  $('gauge-white').style.height = share + '%';
  $('gauge-black').style.height = 100 - share + '%';
  $('gauge-score-white').textContent = !evaluation || evaluation.cp >= 0 ? text : '';
  $('gauge-score-black').textContent = evaluation?.cp < 0 ? text : '';
  const sf = state.settings.sfArrows && result?.stockfish?.uci;
  const maia = state.settings.maiaArrows && result?.maia?.uci;
  const arrowKey = JSON.stringify([sf, maia]);
  if (state.arrowKey === arrowKey) return;
  state.arrowKey = arrowKey;
  const arrows = [];
  const add = (uci, color, role) => arrows.push({ from: uci.slice(0, 2), to: uci.slice(2, 4), color, role });
  if (sf) add(sf, 'green', sf === maia ? 'consensus' : 'sf');
  if (maia && maia !== sf) add(maia, 'gold', 'maia');
  board.setArrows(arrows);
}

function paintAnalysis() {
  const allowed = analysisAllowed();
  const result = allowed && state.engineEnabled ? state.analysis : null;
  $('trend-toggle').disabled = !allowed || !state.snapshot;
  $('trend-toggle').title = t(result?.trend ? 'trend' : 'perspectiveDisabled');
  if (state.trend) renderTrend(state.trend);
  $('engine-lines').hidden = !result && !compactLayout.matches;
  $('analyze').disabled = !state.preferencesReady || !allowed;
  const control = state.engineEnabled ? (result || state.analyzing || !state.requestedKey ? 'pause' : 'retry') : 'analyze';
  $('analyze').textContent = t(state.sharedPending ? 'sharedLocal' : compactLayout.matches ? 'mobile' + control[0].toUpperCase() + control.slice(1) : control);
  $('analyze').setAttribute('aria-label', t(state.sharedPending ? 'sharedLocal' : control));
  const kind = result && state.moment && intuitionKind(state.moment);
  $('intuition-tag').hidden = !kind;
  const momentText = kind ? state.moment.san + ' · ' + t(kind) : '';
  $('intuition-tag').textContent = kind && compactLayout.matches ? t(kind) : momentText;
  $('intuition-tag').title = momentText;
  $('engine-note').textContent = !state.engineEnabled || !allowed ? ''
    : state.sharedPending ? t('sharedPending') : result?.cloud && result.maiaReady
      ? t('sharedSource').replace('{depth}', result.depth).replace('{elo}', result.cloudElo)
      : result?.maiaReady || result?.terminal ? '' : state.analyzing ? t('engineBusy') : result ? (state.settings.maiaMode === 'off' ? '' : t('partial'))
      : state.requestedKey ? t('engineFailed') : '';
  paintCandidateLines(result);
  const loadMaia = $('load-maia');
  const mode = state.settings.maiaMode;
  const awaitingModel = mobileDownloads && allowed && state.engineEnabled && !state.sharedPending && !result?.maiaReady && !result?.terminal;
  const offerDownload = mode === 'off' || (state.requestedKey && !state.analyzing);
  loadMaia.hidden = !awaitingModel || !state.preferencesReady;
  loadMaia.disabled = !offerDownload || !state.snapshot;
  const size = maiaSizes[state.settings.maiaVariant];
  if (awaitingModel) loadMaia.textContent = offerDownload ? t('loadMaia').replace('{size}', size) : t('loadingMaia');
  loadMaia.setAttribute('aria-label', t('loadMaiaLabel').replace('{model}', MAIA_VARIANTS[state.settings.maiaVariant].name).replace('{size}', size));
  $('maia-candidates').hidden = !loadMaia.hidden;
  paintEvaluation(result);
  paintEngineStatus();
  updateTrendDialog(result);
  updatePoster();
}

function paintCandidateLines(result) {
  const stockfish = result?.stockfishLines ?? [];
  const maia = result?.maiaLines ?? [];
  const row = (score, san, continuation, id, probability) => {
    const item = Object.assign(document.createElement('div'), { className: 'candidate-line' });
    if (id) item.id = id;
    const moves = Object.assign(document.createElement('div'), { className: 'candidate-variation' });
    moves.append(Object.assign(document.createElement('strong'), { textContent: san }));
    for (const move of continuation) moves.append(Object.assign(document.createElement('span'), { textContent: move.label }));
    const number = Object.assign(document.createElement('span'), { className: 'candidate-score', textContent: score?.text ?? '—' });
    if (score?.approximate) {
      number.textContent = '≈' + score.text;
      number.classList.add('approximate');
      number.title = t('quickScore');
      number.setAttribute('aria-label', t('quickScore') + ' ' + score.text);
    }
    item.append(number, moves);
    if (probability !== undefined) item.append(Object.assign(document.createElement('span'), {
      className: 'candidate-probability', textContent: probability
    }));
    return item;
  };
  $('sf-candidates').replaceChildren(...(stockfish.length ? stockfish.map((line, index) =>
    row(line.evaluation, line.variation[0]?.san ?? '—', line.variation.slice(1, 5), !index && 'sf-line')
  ) : [row(result?.evaluation, result?.stockfish?.san ?? '—', [], 'sf-line')]));
  const chances = probabilities(maia);
  $('maia-candidates').replaceChildren(...(maia.length ? maia.map((move, index) => {
    const chance = chances.get(move.uci);
    return row(result.maiaEvaluations?.get(move.uci), move.san, [], !index && 'maia-line', Number.isFinite(chance) ? `${chance.toFixed(1)}%` : '—');
  }) : [row(null, result?.maia?.san ?? '—', [], 'maia-line', '—')]));
  $('show-lines').hidden = stockfish.length < 2 && maia.length < 2;
}

function paintEngineStatus() {
  const { stockfishVariant, maiaVariant, depth } = state.settings;
  const sfName = stockfishVariant === 'standard' ? (lang === 'zh' ? 'Stockfish 19 标准版' : 'Stockfish 19 Standard') : 'Stockfish 19 Lite';
  const maiaName = MAIA_VARIANTS[maiaVariant].name;
  const reached = state.analysis?.depth;
  $('sf-edition').textContent = compactLayout.matches ? 'SF19' : `${sfName} · ${reached ? 'D' + reached : `${t('targetDepth')} D${depth}`}`;
  $('maia-edition').textContent = compactLayout.matches ? 'Maia-3' : maiaName;
  $('engine-hint').textContent = engineExperienceHint(state.settings, lang);
  const status = state.engines?.status?.();
  for (const [slot, name] of [['sf', sfName], ['maia', maiaName]]) {
    const health = status?.[slot];
    const phase = health?.state;
    const label = phase === 'ready' ? 'engineReady' : phase === 'error' ? 'engineError' : phase === 'downloading' ? 'engineDownloading'
      : health?.stage === 'cache' ? 'engineCache' : health?.stage === 'preparing' ? 'enginePreparing'
      : phase === 'starting' || phase === 'loading' ? 'engineStarting' : 'engineIdle';
    const source = health?.source === 'cache' ? t('engineCacheSource') : health?.source === 'cdn' ? 'Cloudflare CDN'
      : health?.source === 'bundled' ? t('engineBundled') : '';
    const percent = Number.isFinite(health?.percent) ? health.percent : null;
    const detail = phase === 'downloading' ? (percent === null ? health.loadedMB && `${health.loadedMB} MiB` : `${percent}%`) : '';
    const text = [name, [t(label), detail].filter(Boolean).join(' '), phase !== 'idle' ? source : ''].filter(Boolean).join(' · ');
    if ($(slot + '-status').textContent !== text) $(slot + '-status').textContent = text;
    const progress = $(slot + '-progress');
    progress.hidden = phase !== 'downloading' || !state.engineEnabled;
    progress.setAttribute('aria-label', name);
    progress.title = text;
    if (percent === null) progress.removeAttribute('value');
    else progress.value = percent;
  }
}

function applyPreferences() {
  const saved = getSavedPreferences();
  if (typeof saved.diverge_sound_enabled === 'boolean' && soundEffects.enabled !== saved.diverge_sound_enabled) {
    soundEffects.enabled = saved.diverge_sound_enabled;
  }
  paintSoundToggle();
  const stockfishVariant = (mobileDownloads ? state.mobileStockfish : saved.stockfishVariant) || 'lite';
  const preferredMaia = state.mobileMaia || saved.maiaVariant || (mobileDownloads ? '5m' : '23m');
  const cached = [preferredMaia, ...Object.keys(MAIA_VARIANTS)].find(variant => state.cachedMaia.includes(variant));
  const maiaVariant = mobileDownloads ? state.mobileMaia || cached || preferredMaia : preferredMaia;
  const maiaMode = !mobileDownloads || state.maiaDownloadVariant === maiaVariant ? 'download'
    : state.cachedMaia.includes(maiaVariant) ? 'cache' : 'off';
  const settings = {
    maiaVariant, maiaMode, stockfishVariant,
    depth: stockfishVariant === 'standard' ? saved.studio_max_depth ?? 22 : 18,
    elo: saved.defaultElo ?? 2600, sfArrows: saved.showStockfishArrows ?? true, maiaArrows: saved.showArrows ?? true
  };
  const previous = state.settings;
  state.settings = settings;
  state.preferencesReady = true;
  $('live-sf').disabled = $('live-maia').disabled = $('event-elo').disabled = false;
  $('live-sf').value = settings.stockfishVariant;
  $('live-maia').value = settings.maiaVariant;
  $('setting-sf-arrows').checked = settings.sfArrows;
  $('setting-maia-arrows').checked = settings.maiaArrows;
  const elo = $('event-elo');
  if (!Array.from(elo.options).some(option => Number(option.value) === settings.elo)) elo.add(new Option(String(settings.elo)));
  elo.value = String(settings.elo);
  if (['maiaVariant', 'maiaMode', 'stockfishVariant', 'depth', 'elo'].some(key => settings[key] !== previous[key])) {
    cancelAnalysis();
    if (state.engines && (settings.stockfishVariant !== previous.stockfishVariant
      || settings.maiaVariant !== previous.maiaVariant || settings.maiaMode !== previous.maiaMode)) {
      const keepStockfish = settings.stockfishVariant === previous.stockfishVariant;
      state.reusableStockfish = keepStockfish ? state.engines.stockfish : null;
      state.engines.dispose?.(keepStockfish);
      state.engines = null;
    }
    if (state.reusableStockfish && state.reusableStockfish.variant !== stockfishVariant) {
      state.reusableStockfish.reset();
      state.reusableStockfish = null;
    }
    if (state.engines) state.engines.depth = settings.depth;
  }
  void analyzeMove();
  paintAnalysis();
}

async function analyzeMove() {
  if (!state.snapshot || !state.preferencesReady || !state.engineEnabled || !analysisAllowed() || !foreground()) return;
  const { cursor, branch } = state;
  if (!branch && !state.snapshot.initialFen) return;
  const move = branch ? null : state.snapshot.moves[cursor - 1];
  const elo = state.settings.elo;
  const position = { fen: branch?.fen ?? fenAt(cursor), history: branch?.history ?? historyAt(cursor), elo };
  const before = move ? { fen: fenAt(cursor - 1), history: historyAt(cursor - 1), elo } : null;
  const mainline = branch ? null : state.snapshot.moves.slice(0, cursor).map(step => step.uci);
  const key = JSON.stringify([state.round, cursor, position, mainline]);
  if (state.requestedKey === key) return;
  closeTrend();
  clearTimeout(state.sharedTimer);
  state.sharedRetry = null;
  state.sharedPending = false;
  const version = ++state.requestVersion;
  state.requestedKey = key;
  state.analysis = null;
  state.moment = null;
  if (state.analyzing) {
    state.engines?.cancel();
    paintAnalysis();
    return;
  }
  state.analyzing = true;
  paintAnalysis();
  const inactive = () => state.requestVersion !== version || !foreground() || !analysisAllowed();
  let sharedReady = false;
  let cacheFallback = false;
  const obsolete = () => inactive() || sharedReady;
  try {
    if (!branch && state.localAnalysisRound !== state.round && eventId === 'wcc2026') {
      const cached = await sharedAnalysis(eventId, state.snapshot, cursor, position);
      if (obsolete()) return;
      if (cached?.display) {
        state.analysis = cached.display;
        state.moment = cached.moment || null;
        return;
      }
      if (cached?.pending) {
        const ready = state.engines?.status();
        cacheFallback = (state.settings.stockfishVariant === 'lite' || ready?.sf.state === 'ready') &&
          (ready?.maia?.state === 'ready' || state.cachedMaia.includes(state.settings.maiaVariant));
        state.sharedPending = !cacheFallback;
        let refreshing = false;
        state.sharedRetry = async () => {
          if (inactive() || refreshing) return;
          clearTimeout(state.sharedTimer);
          refreshing = true;
          const next = await sharedAnalysis(eventId, state.snapshot, cursor, position);
          refreshing = false;
          if (inactive()) return;
          if (next?.display) {
            sharedReady = true;
            state.sharedPending = false;
            state.sharedRetry = null;
            state.analysis = next.display;
            state.moment = next.moment || null;
            if (state.analyzing) state.engines?.cancel();
            paintAnalysis();
          } else if (next?.pending) {
            state.sharedTimer = setTimeout(state.sharedRetry, 8500);
          } else {
            state.sharedRetry = null;
            if (state.sharedPending) {
              state.requestedKey = '';
              void analyzeMove();
            }
          }
        };
        state.sharedTimer = setTimeout(state.sharedRetry, 8500);
        if (!cacheFallback) return;
      }
    }
    if (!cacheFallback && state.settings.maiaMode === 'download' && state.engines?.maia?.cacheOnly &&
        state.engines.status().maia?.state !== 'ready') {
      state.reusableStockfish = state.engines.stockfish;
      state.engines.dispose(true);
      state.engines = null;
    }
    if (!state.engines) {
      const { LiveEngines } = await import('./engines.js?v=20261125-position-poster');
      if (obsolete()) return;
      const settings = cacheFallback ? { ...state.settings, maiaMode: 'cache' } : state.settings;
      const owner = new LiveEngines(settings, () => { if (state.engines === owner) paintEngineStatus(); }, state.reusableStockfish);
      state.engines = owner;
      state.reusableStockfish = null;
    }
    const result = await state.engines.inspect(position, obsolete, partial => {
      if (obsolete()) return;
      state.analysis = partial;
      paintAnalysis();
    });
    if (!result || obsolete()) return;
    state.analysis = result;
    const engines = state.engines;
    const classify = move && (result.maiaReady || (result.terminal && state.settings.maiaMode !== 'off'));
    const momentTask = state.momentTask = classify ? engines.classify(move, before, position, obsolete).then(moment => {
      if (!obsolete()) {
        state.moment = moment;
        paintAnalysis();
        return moment;
      }
    }).catch(error => {
      if (!obsolete()) console.debug('Broadcast move classification unavailable', error);
    }) : null;
    // Classification and the supplementary scores share a single Stockfish queue.
    state.maiaScoreTask = result.maiaReady && Promise.resolve(momentTask).then(() => {
      if (!obsolete()) return engines.fillMaiaEvaluations(position, result, obsolete, () => {
        if (!obsolete()) paintCandidateLines(result);
      });
    }).catch(error => {
      if (!obsolete()) console.debug('Broadcast candidate scores unavailable', error);
    });
    paintAnalysis();
    await momentTask;
    await state.maiaScoreTask;
  } catch (error) {
    console.debug('Broadcast analysis unavailable', error);
  } finally {
    state.maiaScoreTask = null;
    state.momentTask = null;
    state.analyzing = false;
    if (state.requestedKey && state.requestVersion !== version) {
      state.requestedKey = '';
      void analyzeMove();
    }
    paintAnalysis();
  }
}

function jump(ply, follow = false, replay = false) {
  const previous = state.cursor;
  const fromBranch = Boolean(state.branch);
  if (!replay) stopPlayback();
  state.cursor = Math.max(0, Math.min(ply, state.snapshot?.moves.length || 0));
  state.follow = follow;
  state.branch = null;
  if (follow) state.unseen = false;
  if (fromBranch && previous === state.cursor) soundEffects.playMove(0.4);
  else playNavigationSound(previous, state.cursor, state.snapshot?.moves[state.cursor - 1]?.san);
  cancelAnalysis();
  paint();
  void analyzeMove();
}

function stopPlayback() {
  if (!state.replayTimer) return;
  clearInterval(state.replayTimer);
  state.replayTimer = null;
  paintPlayback();
}

function togglePlayback() {
  if (state.replayTimer) return stopPlayback();
  if (state.branch || state.cursor >= (state.snapshot?.moves.length ?? 0)) return;
  state.replayTimer = setInterval(() => {
    const latest = state.snapshot?.moves.length ?? 0;
    const next = state.cursor + 1;
    if (next <= latest) jump(next, next === latest, true);
    if (next >= latest) stopPlayback();
  }, 1200);
  paintPlayback();
}

function chooseRound(round) {
  if (round === state.round && state.snapshot) return;
  stopPlayback();
  state.roundAbort?.abort();
  state.roundKey++;
  state.round = round;
  state.snapshot = null;
  state.roundTag = null;
  state.follow = true;
  state.unseen = false;
  state.branch = null;
  state.cursor = 0;
  cancelAnalysis();
  clearTimeout(state.roundTimer);
  paint();
  if (foreground()) void pollRound();
}

function retryDelay(response, normal) {
  const retry = Number(response?.headers.get('Retry-After'));
  return Math.max(normal, Number.isFinite(retry) && retry > 0 ? Math.min(retry, 120) * 1000 : 0) + Math.random() * 1200;
}

async function pollEvent() {
  if (state.eventBusy || !foreground()) return;
  state.eventBusy = true;
  let response;
  try {
    const headers = state.eventTag ? { 'If-None-Match': state.eventTag } : {};
    response = await fetch('/api/live/event?' + new URLSearchParams({ id: eventId }), {
      headers, cache: 'no-cache', signal: AbortSignal.timeout(7500)
    });
    if (response.ok) {
      state.event = await response.json();
      state.eventTag = response.headers.get('ETag');
      const rounds = state.event.rounds;
      if (!rounds.some(round => round.id === state.round)) {
        if (state.round) {
          state.initialPly = null;
          state.initialVariation = null;
        }
        chooseRound(state.event.activeRoundId || rounds.find(round => round.status === 'scheduled')?.id || rounds.at(-1)?.id);
      } else if (!state.snapshot && state.roundBusy !== state.roundKey) {
        void pollRound();
      }
      paintEvent();
    } else if (response.status !== 304) throw new Error('Event HTTP ' + response.status);
    if (!state.snapshot) state.stale = response.headers.get('X-Stale') === '1';
  } catch {
    if (!state.snapshot) state.stale = true;
  } finally {
    state.eventBusy = false;
    paintControls();
    if (foreground()) state.eventTimer = setTimeout(pollEvent, retryDelay(response, 30000));
  }
}

async function pollRound() {
  if (!state.round || state.roundBusy === state.roundKey || !foreground()) return;
  const key = state.roundKey;
  state.roundBusy = key;
  const controller = new AbortController();
  state.roundAbort = controller;
  const timeout = setTimeout(() => controller.abort(), 7500);
  let response;
  try {
    const query = new URLSearchParams({ event: eventId, id: state.round });
    const headers = state.roundTag ? { 'If-None-Match': state.roundTag } : {};
    response = await fetch('/api/live/round?' + query, { headers, cache: 'no-cache', signal: controller.signal });
    if (key !== state.roundKey) return;
    state.stale = response.headers.get('X-Stale') === '1';
    if (response.status === 304) {
      paintBoard();
      return;
    }
    if (!response.ok) throw new Error('Round HTTP ' + response.status);
    const next = await response.json();
    if (key !== state.roundKey || next.roundId !== state.round) return;
    state.roundTag = response.headers.get('ETag');
    const old = state.snapshot;
    const mainlineChanged = old && (old.moves.length !== next.moves.length ||
      next.moves.some((move, i) => old.moves[i]?.uci !== move.uci));
    if (state.follow && mainlineChanged && (board.gesture || board.selectedSq || board.promotionPicker
      || $('live-trend').open || $('share-card-dialog').open)) {
      state.follow = false;
    }
    state.snapshot = next;
    if (state.initialPly !== null) {
      state.cursor = Math.min(state.initialPly, next.moves.length);
      if (state.initialVariation !== null) {
        state.branch = state.cursor === state.initialPly ? restoreVariation(state.initialVariation, state.initialBase, state.cursor) : null;
        if (!state.branch) $('live-link-status').textContent = t('variationUnavailable');
        state.initialVariation = null;
      }
      state.initialPly = null;
      state.follow = false;
    } else if (state.follow) {
      state.cursor = next.moves.length;
      if (old && state.cursor > old.moves.length && old.moves.every((move, i) => move.uci === next.moves[i]?.uci)
        && foreground() && soundEffects.audioCtx) {
        playNavigationSound(old.moves.length, state.cursor, next.moves.at(-1).san);
      }
    } else if (mainlineChanged) {
      state.unseen = true;
      if (!state.branch) state.cursor = Math.min(state.cursor, next.moves.length);
    }
    // A correction can replace the occupied mainline position. Keep a trial branch separate.
    paint();
    void analyzeMove();
  } catch {
    if (key === state.roundKey) state.stale = true;
  } finally {
    clearTimeout(timeout);
    if (key === state.roundKey) {
      state.roundBusy = null;
      paintBoard();
      paintControls();
      if (foreground()) {
        const pause = state.snapshot?.status === 'finished' ? 60000 : state.snapshot?.status === 'scheduled' ? 15000 : 9500;
        state.roundTimer = setTimeout(pollRound, retryDelay(response, pause));
      }
    }
  }
}

$('round-rail').onclick = event => {
  const button = event.target.closest('[data-round]');
  if (button) selectRound(button.dataset.round);
};
$('round-rail').onkeydown = event => {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  const button = event.target.closest('[data-round]');
  if (!button) return;
  const target = { ArrowLeft: button.previousElementSibling, ArrowRight: button.nextElementSibling,
    Home: $('round-rail').firstElementChild, End: $('round-rail').lastElementChild }[event.key];
  if (target) { event.preventDefault(); target.focus(); }
};
$('event-moves').onclick = event => {
  const ply = event.target.closest('[data-ply]')?.dataset.ply;
  if (ply) jump(Number(ply));
};
$('first').onclick = () => jump(0);
$('previous').onclick = () => jump(state.branch ? state.cursor : state.cursor - 1);
$('next').onclick = () => jump(state.branch ? state.cursor : state.cursor + 1);
$('play').onclick = togglePlayback;
$('clear-notes').onclick = () => board.clearAnnotations();
$('return-game').onclick = () => jump(state.cursor);
function toggleSound() {
  const enabled = soundEffects.toggle();
  paintSoundToggle();
  void savePreferences({ diverge_sound_enabled: enabled });
  if (enabled) soundEffects.playMove();
}
$('sound').onclick = $('setting-sound').onchange = toggleSound;
$('show-lines').onclick = () => {
  const expanded = $('engine-lines').classList.toggle('expanded');
  $('show-lines').setAttribute('aria-expanded', String(expanded));
};
window.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  if (board.promotionPicker) {
    if (event.key === 'Escape') { event.preventDefault(); board.closePromotion(); }
    return;
  }
  if (event.key === 'Escape' && state.branch) { event.preventDefault(); $('return-game').click(); return; }
  const shortcut = boardShortcut(event);
  if (!shortcut) return;
  const button = $({ play: 'play', flip: 'flip-board' }[shortcut] || shortcut);
  event.preventDefault();
  if (!event.repeat || shortcut === 'previous' || shortcut === 'next') button?.click();
});
for (const type of ['pointerup', 'keydown']) {
  window.addEventListener(type, function unlock(event) {
    if (!event.isTrusted) return;
    soundEffects.unlock();
    window.removeEventListener(type, unlock, true);
  }, { capture: true });
}
$('latest').onclick = $('new-move').onclick = () => jump(state.snapshot?.moves.length || 0, true);
function paintBoardOrientation() {
  const blackAtBottom = board.orientation === 'black';
  const frame = $('board-frame');
  frame.closest('.board-column').dataset.orientation = board.orientation;
  frame.before($(blackAtBottom ? 'white-seat' : 'black-seat'));
  frame.after($(blackAtBottom ? 'black-seat' : 'white-seat'));
}
$('flip-board').onclick = () => {
  board.flip();
  paintBoardOrientation();
  paintEvaluation(state.analysis);
  paintWorkbenchLink();
};
$('language').onclick = () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  paintLanguage();
};
$('event-elo').onchange = () => void savePreferences({ defaultElo: Number($('event-elo').value) });
$('live-sf').onchange = () => {
  const stockfishVariant = $('live-sf').value;
  if (mobileDownloads) state.mobileStockfish = stockfishVariant;
  void savePreferences({ stockfishVariant });
};
$('live-maia').onchange = () => {
  const maiaVariant = $('live-maia').value;
  if (mobileDownloads) state.mobileMaia = maiaVariant;
  void savePreferences({ maiaVariant });
};
$('load-maia').onclick = () => {
  if (!state.snapshot || !analysisAllowed()) return;
  state.mobileMaia = state.maiaDownloadVariant = state.settings.maiaVariant;
  cancelAnalysis();
  applyPreferences();
};
$('setting-sf-arrows').onchange = () => void savePreferences({ showStockfishArrows: $('setting-sf-arrows').checked });
$('setting-maia-arrows').onchange = () => void savePreferences({ showArrows: $('setting-maia-arrows').checked });
$('btn-settings').onclick = () => $('live-settings').showModal();
function analysisAction(locale = lang) {
  if (state.sharedPending) return { label: t('sharedLocal', locale), run: () => $('analyze').click() };
  if (!state.engineEnabled) return { label: t('enablePoster', locale), run: () => $('analyze').click() };
  const load = $('load-maia');
  if (!load.hidden && !load.disabled) return { label: load.getAttribute('aria-label'), run: () => load.click() };
  if (state.requestedKey && !state.analyzing) return {
    retry: true, label: t('retry', locale), run: () => { cancelAnalysis(); void analyzeMove(); }
  };
  return null;
}

let trendBoard, displayedTrend;
function updateTrendDialog(result) {
  if (!$('live-trend').open || !analysisAllowed() || !foreground()) return;
  const position = result?.trend;
  const trend = position ? trendFor(position) : null;
  const action = !trend && !result?.terminal && analysisAction();
  $('trend-enable').hidden = !action;
  if (action) $('trend-enable').textContent = action.label;
  $('trend-enable').onclick = action ? action.run : null;
  $('trend-results').hidden = !trend;
  trendBoard ||= new BoardUI($('trend-board'), { interactive: false });
  if (trendBoard.orientation !== board.orientation) trendBoard.flip();
  if (trendBoard.chess.getFen() !== state.boardFen) trendBoard.setPosition(state.boardFen, board.lastMove);
  if (!trend) {
    trendBoard.setArrows([]);
    $('trend-status').textContent = t(result?.terminal ? 'trendTerminal' :
      state.sharedPending ? 'sharedPending' : action ? 'perspectiveDisabled' : 'engineBusy');
    return;
  }
  if (displayedTrend === trend) return;
  displayedTrend = trend;
  const { stockfish, maia } = result;
  const arrow = (uci, color, role) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), color, role });
  const same = stockfish?.uci && stockfish.uci === maia?.uci;
  trendBoard.setArrows([
    stockfish?.uci && arrow(stockfish.uci, 'green', same ? 'consensus' : 'sf'),
    maia?.uci && !same && arrow(maia.uci, 'gold', 'maia')
  ].filter(Boolean));
  renderMaiaTrendLegend($('trend-legend'), position.series, uci => {
    trend.highlighted = trend.highlighted === uci ? null : uci;
    highlightMaiaTrend($('live-trend'), trend.highlighted);
  });
  void sampleTrend(trend);
}
$('trend-toggle').onclick = () => {
  const dialog = $('live-trend');
  if (dialog.open || !state.snapshot || !analysisAllowed() || !foreground()) return;
  stopPlayback();
  displayedTrend = null;
  dialog.showModal();
  showTrendView(false);
  updateTrendDialog(state.engineEnabled ? state.analysis : null);
};
$('trend-chart-view').onclick = () => showTrendView(false);
$('trend-data-view').onclick = () => showTrendView(true);
$('trend-retry').onclick = () => { if (state.trend) void sampleTrend(state.trend, true); };
$('analyze').onclick = () => {
  if (!analysisAllowed()) return;
  if (state.sharedPending) {
    state.localAnalysisRound = state.round;
    cancelAnalysis();
    void analyzeMove();
    return;
  }
  const failed = state.requestedKey && !state.analysis && !state.analyzing;
  state.engineEnabled = failed || !state.engineEnabled;
  cancelAnalysis();
  paintAnalysis();
  void analyzeMove();
};
function canSharePosition(round) {
  return Boolean(round && state.snapshot && state.boardFen && analysisAllowed());
}

function liveLinks() {
  const query = new URLSearchParams({
    event: eventId, round: state.round, lang, ply: String(state.cursor), orientation: board.orientation
  });
  const baseLink = 'https://4chess.cc/live/?' + query;
  if (state.branch) {
    if (state.branch.line.length > MAX_SHARED_VARIATION) return null;
    query.set('line', state.branch.line.join('.'));
    query.set('base', state.branch.baseFen);
  }
  const link = 'https://4chess.cc/live/?' + query;
  return { link, qrLink: link.length <= MAX_POSTER_QR_URL ? link : baseLink };
}

$('copy-live-link').onclick = async () => {
  if (!canSharePosition(currentRound())) return;
  const links = liveLinks();
  if (!links) {
    $('live-link-status').textContent = t('variationTooLong');
    return;
  }
  const copied = await copyShareLink(links.link, $('live-link-field'));
  $('live-link-status').textContent = copied ? t('linkCopied') : '';
};

let shareSession;
const posterImageButtons = ['btn-share-card-copy', 'btn-share-card-download'];
const shareDialogCurrent = share => shareSession === share && $('share-card-dialog').open && analysisAllowed() && foreground();
const posterCurrent = share => shareDialogCurrent(share) && state.boardFen === share.fen;

function posterNotice(share, key, action = null, label = t('retry', share.lang)) {
  $('share-card-status').textContent = t(key, share.lang);
  $('share-card-retry').hidden = !action;
  $('share-card-retry').textContent = label;
  share.action = action;
}

function completeBands(trend) {
  return RATINGS.filter(elo => completeBand(trend, elo)).length;
}

function paintPosterProgress(share, trend) {
  if (!posterCurrent(share) || !share.pending) return;
  const count = completeBands(trend);
  $('share-card-progress').firstElementChild.style.width = (12 + count / RATINGS.length * 76) + '%';
  posterNotice(share, count >= 3 ? 'posterDrawing' : 'posterStart');
}

function posterSpec(share, analysis, trend, moment) {
  const { lang: locale } = share;
  const { stockfish: sf, maia, evaluation } = analysis;
  const chance = probabilities([maia]).get(maia.uci);
  const percent = Number.isFinite(chance) ? Math.round(chance) + '%' : '—';
  const enginePick = engineTrendMove(trend.position.series);
  const blind = !!enginePick && Math.max(...RATINGS.map(elo => trend.samples.get(elo).get(enginePick.uci))) < 3;
  const kind = !share.branch && moment && intuitionKind(moment);
  const score = analysis.maiaEvaluations?.get(maia.uci);
  const maiaScore = score ? (score.approximate ? '≈' : '') + score.text : '—';
  const sfScore = evaluation?.text ?? '—';
  let outlook = '';
  if (Number.isFinite(evaluation?.cp)) {
    const key = evaluation.isMate ? (evaluation.cp > 0 ? 'posterWhiteMate' : 'posterBlackMate')
      : evaluation.cp > 0 ? 'posterWhiteEdge' : evaluation.cp < 0 ? 'posterBlackEdge' : 'posterEqual';
    outlook = t(key, locale) + ' ' + sfScore;
  }
  return {
    ...share,
    move: { fen: share.fen, bestUci: sf.uci, bestSan: sf.san, maiaTopUci: maia.uci, maiaTopSan: maia.san },
    badge: blind ? t('posterBlindBadge', locale) : kind ? t(kind, locale) : '',
    blind, blindUci: enginePick?.uci, blindNote: t('posterBlindNote', locale),
    subtitle: [share.players, outlook].filter(Boolean).join(' · '),
    chartTitle: t('posterChart', locale), chartNote: t('posterChartNote', locale),
    source: analysis.cloud ? 'Lichess Broadcast · Stockfish D' + analysis.depth + ' · Maia 79M' : undefined,
    scan: t(share.qrLink === share.link ? 'posterScan' : 'posterScanGame', locale),
    series: trend.position.series, samples: trend.samples,
    legend: [
      { role: 'sf', text: t('posterEngineChoice', locale) + ' ' + sf.san + ' (' + sfScore + ')' },
      { role: 'maia', text: t('posterHumanChoice', locale) + ' ' + maia.san + ' (' + percent + ', ' + maiaScore + ')' }
    ]
  };
}

function retryPoster(share) {
  share.failed = false;
  updatePoster();
}

function updatePoster() {
  const share = shareSession;
  if (!share || !posterCurrent(share) || share.pending || share.blob || share.failed) return;
  const analysis = state.analysis;
  if (analysis?.terminal) {
    posterNotice(share, 'posterTerminal');
    return;
  }
  if (!state.engineEnabled || !analysis?.trend || !analysis.stockfish || !analysis.maia) {
    const action = analysisAction(share.lang);
    posterNotice(share, state.sharedPending ? 'sharedPending' :
      action?.retry ? 'posterIncomplete' : 'posterStart', action?.run, action?.label);
    return;
  }
  const trend = share.trend = trendFor(analysis.trend);
  const momentTask = state.momentTask ?? state.moment;
  const scoreTask = state.maiaScoreTask;
  const current = () => posterCurrent(share) && state.trend === trend;
  share.pending = true;
  paintPosterProgress(share, trend);
  void (async () => {
    await sampleTrend(trend, true);
    const [moment] = await Promise.all([momentTask, scoreTask]);
    if (!current()) return;
    if (completeBands(trend) !== RATINGS.length) throw new Error('Incomplete forecast');
    const { renderPositionPoster } = await import('../analysis/position-poster.js?v=20261125-position-poster');
    const canvas = $('share-card-canvas');
    if (!await renderPositionPoster(canvas, posterSpec(share, analysis, trend, moment), current) || !current()) return;
    const blob = await canvasPng(canvas);
    if (!blob) throw new Error('PNG encoding failed');
    if (!current()) return;
    share.blob = blob;
    $('share-card-progress').firstElementChild.style.width = '100%';
    $('share-card-placeholder').hidden = true;
    canvas.hidden = false;
    $('share-card-status').textContent = '';
    for (const id of posterImageButtons) $(id).disabled = false;
  })().catch(() => {
    if (!current()) return;
    share.failed = true;
    posterNotice(share, 'posterIncomplete', () => retryPoster(share));
  }).finally(() => {
    share.pending = false;
    if (!current()) updatePoster();
  });
}

$('moment').onclick = () => {
  const round = currentRound();
  if (!canSharePosition(round)) return;
  stopPlayback();
  const links = liveLinks();
  if (!links) {
    $('live-link-status').textContent = t('variationTooLong');
    return;
  }
  const ply = state.cursor;
  const branch = state.branch;
  const played = state.snapshot?.moves[ply - 1];
  const players = roundPlayers(round).map(player => playerName(player));
  const status = state.snapshot?.status ?? round.status;
  const mover = played && (players[played.turn === 'w' ? 0 : 1] || t(played.turn === 'w' ? 'white' : 'black'));
  const headline = branch ? t('posterVariation').replace('{move}', branch.move.san)
    : played ? played.moveNumber + (played.turn === 'w' ? '. ' : '… ') + played.san + ' · ' + mover
      : roundName(round) + ' · ' + t(status === 'scheduled' ? 'posterUpcoming' : 'startPosition');
  shareSession = {
    fen: state.boardFen, orientation: board.orientation, lang, branch: Boolean(branch),
    event: [lang === 'en' ? state.event?.titleEn : state.event?.title, roundName(round)].filter(Boolean).join(' · '),
    headline, players: players.filter(Boolean).join(' vs '), ...links,
    filename: ['diverge-wcc', round.id, String(ply), branch && 'variation', 'poster'].filter(Boolean).join('-') + '.png'
  };
  $('share-card-link-field').hidden = true;
  $('share-card-qr-note').hidden = links.qrLink === links.link;
  $('share-card-copy-status').textContent = '';
  $('share-card-placeholder').hidden = false;
  $('share-card-canvas').hidden = true;
  $('share-card-progress').firstElementChild.style.width = '6%';
  for (const id of posterImageButtons) $(id).disabled = true;
  $('btn-share-card-link').disabled = false;
  $('share-card-dialog').showModal();
  posterNotice(shareSession, 'posterStart');
  updatePoster();
};

$('btn-close-share-card').onclick = () => $('share-card-dialog').close();
$('share-card-dialog').addEventListener('close', () => {
  if (!$('share-card-dialog').open) shareSession = null;
});
$('share-card-retry').onclick = () => shareSession?.action?.();
$('btn-share-card-copy').onclick = async () => {
  const share = shareSession;
  if (!share?.blob || !posterCurrent(share)) return;
  try {
    await copyPng(share.blob);
    if (posterCurrent(share)) posterNotice(share, 'posterCopied');
  } catch {
    if (posterCurrent(share)) posterNotice(share, 'posterCopyFail');
  }
};
$('btn-share-card-download').onclick = () => {
  const share = shareSession;
  if (!share?.blob || !posterCurrent(share)) return;
  downloadPng(share.blob, share.filename);
  posterNotice(share, 'posterSaved');
};
$('btn-share-card-link').onclick = async () => {
  const share = shareSession;
  if (!share || !shareDialogCurrent(share)) return;
  const copied = await copyShareLink(share.link, $('share-card-link-field'));
  if (shareDialogCurrent(share)) $('share-card-copy-status').textContent = t(copied ? 'linkCopied' : 'linkCopyManual', share.lang);
};

document.addEventListener('visibilitychange', () => {
  clearTimeout(state.eventTimer);
  clearTimeout(state.roundTimer);
  clearTimeout(state.sharedTimer);
  if (foreground()) {
    paintClocks();
    paintCountdown();
    void pollEvent();
    void pollRound();
    if (state.sharedRetry) void state.sharedRetry();
    if (state.engineEnabled) void analyzeMove();
    updatePoster();
  } else {
    stopPlayback();
    if (state.trend?.pending) closeTrend();
    if (state.analyzing) cancelAnalysis();
  }
});
subscribePreferences(applyPreferences);
void initializePreferences().then(applyPreferences, applyPreferences);
if (analysisAllowed()) {
  const variants = Object.entries(MAIA_VARIANTS).map(([variant, { url }]) => [variant, modelCacheKeys(url)]);
  void ModelCache.findModelKeys(variants.flatMap(([, keys]) => keys)).then(keys => {
    state.cachedMaia = variants.filter(([, candidates]) => candidates.some(key => keys.includes(key))).map(([variant]) => variant);
    if (state.preferencesReady && state.sharedPending && state.cachedMaia.includes(state.settings.maiaVariant)) {
      state.requestedKey = '';
    }
    if (state.preferencesReady) applyPreferences();
  });
}
compactLayout.addEventListener('change', arrangeMoment);
paintBoardOrientation();
paintLanguage();
arrangeMoment();
setInterval(() => {
  if (!foreground()) return;
  paintCountdown();
  paintClocks();
}, 1000);
void pollEvent();
