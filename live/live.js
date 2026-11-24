import { BoardUI } from '../analysis/board-ui.js?v=20261124-divergence-cards';
import { ChessBoard } from '../engine/chess-core.js';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { intuitionKind } from '../engine/review-policy.js';
import { RATINGS, probabilities, renderMaiaTrendPlot } from '../analysis/maia-elo-trend.js?v=20261124-intuition-labels';
import { engineExperienceHint, getSavedPreferences, initializePreferences, savePreferences, subscribePreferences } from '../engine/engine-preferences.js';
import { MAIA_VARIANTS } from '../engine/engine-variants.js';
import { copyShareLink } from '../analysis/share-export.js?v=20261124-divergence-cards';

const copy = {
  zh: {
    studio: '分析工作台', round: '轮次', moves: '实战着法', engines: '双引擎对比', rating: '段位',
    first: '第一步', previous: '上一步', next: '下一步', latest: '回到最新', share: '分享棋王战瞬间',
    flip: '翻转棋盘', reviewGame: '在工作台复盘本局', reviewPosition: '在工作台分析此局面',
    trend: 'Maia 分段趋势', chart: '曲线', trendData: '采样数据', targetDepth: '目标',
    schedule: '赛程与比分', game: '第 {n} 局', countdown: '距开赛还有 {h} 小时 {m} 分', minutes: '距开赛还有 {m} 分',
    engineIdle: '未启动', engineStarting: '正在启动', engineCache: '正在检查缓存', engineReady: '已就绪', engineError: '加载失败',
    engineDownloading: '下载中', enginePreparing: '正在装载模型', engineCacheSource: 'IndexedDB 缓存', engineBundled: '站内资源',
    copyGame: '复制本局链接', copyMove: '复制本步链接', copyLink: '复制链接', copyImage: '复制图片',
    linkCopied: '已复制直达链接', shareLink: '分享链接', close: '关闭', landscape: '16:9 横版', portrait: '3:4 竖版', download: '下载 PNG',
    trendRetry: '重试缺失档位', trendProgress: 'Maia 走法选择概率 · 已完成 {count}/{total} 档',
    sourceLead: '转播数据', delay: '着法和时钟以转播为准，可能晚于现场。',
    analyze: '启用双引擎', retry: '重试分析', pause: '暂停双引擎', analysisIdle: '启用后，在本机分析已播出的着法。',
    engineBusy: '正在分析实战着法…', engineFailed: '双引擎暂不可用。', partial: 'Maia-3 暂不可用。',
    branchBusy: '正在分析试走局面…',
    branch: '试走变化', history: '正在回看', live: '转播中', finished: '本局已结束', cancelled: '本局取消',
    scheduled: '尚未开赛', waiting: '等待官方着法', loading: '正在连接 Lichess 转播',
    stale: '转播更新暂缓 · 显示最近收到的棋谱', unavailable: '暂时无法连接转播，将自动重试',
    newMove: '新着法已更新 · 回到最新', waitingMove: '等待第一步', white: '白方', black: '黑方',
    trap: '直觉陷阱', beyond: '神之一手', precise: '精准突破', card: '棋王战瞬间',
    of: ' / ', scan: '扫码回到转播', score: '赛况总比分', unknown: '—',
    shareFailed: '暂时无法生成战报卡。'
  },
  en: {
    studio: 'Analysis studio', round: 'Game', moves: 'Moves played', engines: 'Compare engines', rating: 'Rating',
    first: 'Start position', previous: 'Previous move', next: 'Next move', latest: 'Latest move', share: 'Share this moment',
    flip: 'Flip board', reviewGame: 'Review this game in the studio', reviewPosition: 'Analyze this position in the studio',
    trend: 'Maia rating trends', chart: 'Chart', trendData: 'Samples', targetDepth: 'Target',
    schedule: 'Schedule and results', game: 'Game {n}', countdown: 'Starts in {h} h {m} min', minutes: 'Starts in {m} min',
    engineIdle: 'Not started', engineStarting: 'Starting', engineCache: 'Checking cache', engineReady: 'Ready', engineError: 'Could not load',
    engineDownloading: 'Downloading', enginePreparing: 'Loading model', engineCacheSource: 'IndexedDB cache', engineBundled: 'Site assets',
    copyGame: 'Copy game link', copyMove: 'Copy move link', copyLink: 'Copy link', copyImage: 'Copy image',
    linkCopied: 'Direct link copied', shareLink: 'Share link', close: 'Close', landscape: '16:9 Landscape', portrait: '3:4 Portrait', download: 'Download PNG',
    trendRetry: 'Retry missing ratings', trendProgress: 'Maia move probability · {count}/{total} rating bands',
    sourceLead: 'Broadcast by', delay: 'Moves and clock readings may be delayed.',
    analyze: 'Enable engines', retry: 'Retry analysis', pause: 'Pause engines', analysisIdle: 'Analyze moves already broadcast on this device.',
    engineBusy: 'Analyzing the move played…', engineFailed: 'Engine analysis is unavailable.', partial: 'Maia-3 is unavailable.',
    branchBusy: 'Analyzing the variation…',
    branch: 'Variation', history: 'Reviewing', live: 'On air', finished: 'Game finished', cancelled: 'Cancelled',
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

const state = {
  event: null, round: params.get('round'), snapshot: null, cursor: 0, follow: !params.has('ply'),
  initialPly: /^\d+$/.test(params.get('ply') || '') ? Number(params.get('ply')) : null,
  branch: null, unseen: false, stale: false, busy: false, roundKey: 0,
  engines: null, engineEnabled: false, analysisKey: '', requestedKey: '', analysis: null, analyzing: false, requestVersion: 0,
  settings: { maiaVariant: '23m', stockfishVariant: 'lite', depth: 18, elo: 2600 }
};
const board = new BoardUI($('event-board'), {
  brilliantArrows: true,
  onMove(move, fen) {
    state.boardFen = fen;
    state.boardMove = move.uci;
    if (!state.snapshot || !analysisAllowed()) {
      paintBoard();
      return;
    }
    const history = state.branch ? [...state.branch.history, state.branch.fen]
      : [state.snapshot.initialFen || ChessBoard.INITIAL_FEN, ...state.snapshot.moves.slice(0, state.cursor).map(item => item.fen)];
    state.branch = { fen, move, history: history.slice(-7) };
    state.follow = false;
    cancelAnalysis();
    paintControls();
    void analyzeMove();
  }
});

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
  $('language').textContent = lang === 'en' ? '中文' : 'EN';
  $('round-rail').setAttribute('aria-label', t('schedule'));
  paint();
}

const RESULTS = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½' };
const currentRound = () => state.event?.rounds.find(round => round.id === state.round);
const selectRound = id => { state.initialPly = null; chooseRound(id); };
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
  if (status === 'scheduled' && round?.startsAt) {
    const remaining = Math.ceil((round.startsAt - Date.now()) / 60000);
    notice = remaining > 0 ? t(remaining >= 60 ? 'countdown' : 'minutes')
      .replace('{h}', Math.floor(remaining / 60)).replace('{m}', remaining % 60) : t('waiting');
  } else if (status === 'waiting' || status === 'live') notice = t(status);
  if ($('round-countdown').textContent !== notice) $('round-countdown').textContent = notice;
}

function paintRoundHeading() {
  const round = currentRound();
  $('round-heading').hidden = !round;
  if (!round) return;
  const result = RESULTS[state.snapshot?.result] || RESULTS[round.result];
  const status = state.snapshot?.status || round.status;
  $('round-title').textContent = roundName(round) + (result ? ' · ' + result : status === 'finished' || status === 'cancelled' ? ' · ' + t(status) : '');
  const [white, black] = roundPlayers(round).map(player => playerName(player));
  $('round-players').textContent = white && black ? `${white} (${t('white')}) vs ${black} (${t('black')})` : '';
  const time = $('round-time');
  time.textContent = roundTime(round.startsAt);
  if (round.startsAt) time.dateTime = new Date(round.startsAt).toISOString();
  else time.removeAttribute('datetime');
  paintCountdown();
}

function paintEvent() {
  const event = state.event;
  if (!event) return;
  $('title').textContent = lang === 'en' ? event.titleEn : event.title;
  document.title = $('title').textContent + ' · Diverge';
  const score = $('match-score');
  score.setAttribute('aria-label', t('score'));
  score.replaceChildren();
  for (const [index, player] of event.players.entries()) {
    if (index) score.append('–');
    const amount = document.createElement('strong');
    amount.textContent = event.scoreIncomplete ? '—' : event.score[player.id];
    score.append(playerName(player), amount);
  }

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
  const fen = state.branch?.fen || played?.fen || state.snapshot?.initialFen || ChessBoard.INITIAL_FEN;
  if (state.boardFen !== fen || state.boardMove !== hint?.uci) {
    state.boardFen = fen;
    state.boardMove = hint?.uci;
    board.setPosition(fen, hint ? { from: hint.uci.slice(0, 2), to: hint.uci.slice(2, 4) } : null);
  }
  const recent = moves.slice(0, state.cursor);
  const [white, black] = roundPlayers(currentRound());
  for (const [side, turn, player] of [['white', 'w', white], ['black', 'b', black]]) {
    $(side + '-name').textContent = (playerName(player) || t(side)) + (player?.rating ? ' · ' + player.rating : '');
    const lastClock = recent.findLast(move => move.turn === turn && Number.isFinite(move.clk));
    $(side + '-clock').textContent = clock(lastClock?.clk);
    $(side + '-seat').dataset.toMove = String(state.snapshot?.status === 'live' && !state.branch && !state.stale &&
      state.cursor === moves.length && state.snapshot.fen?.split(' ')[1] === turn);
  }
}

function paintMoves() {
  const stack = $('event-moves');
  const previous = stack.scrollTop;
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
  stack.scrollTop = state.follow ? stack.scrollHeight : previous;
}

function paintControls() {
  const length = state.snapshot?.moves.length || 0;
  const round = state.event?.rounds.find(item => item.id === state.round);
  const status = $('event-status');
  status.dataset.state = state.stale ? 'stale' : '';
  status.textContent = t(state.stale ? (state.snapshot || state.event ? 'stale' : 'unavailable')
    : state.snapshot?.status || round?.status || 'loading');
  $('source').href = state.snapshot?.source || round?.source || state.event?.source || $('source').href;
  $('ply-note').textContent = state.branch ? t('branch')
    : length ? state.cursor + t('of') + length : t('waitingMove');
  $('new-move').hidden = !state.unseen;
  $('new-move').textContent = t('newMove');
  $('previous').disabled = state.cursor === 0 && !state.branch;
  $('first').disabled = $('previous').disabled;
  $('next').disabled = state.cursor === length && !state.branch;
  $('latest').disabled = state.follow && !state.branch;
  $('copy-live-link').disabled = !round;
  $('copy-live-link').textContent = t(state.cursor ? 'copyMove' : 'copyGame');
  paintRoundHeading();
  paintWorkbenchLink();
  paintAnalysis();
}

function paintWorkbenchLink() {
  const link = $('workbench-game');
  const snapshot = state.snapshot;
  const pgn = snapshot?.status === 'finished' && FairPlayGuard.verifyConcludedGame(snapshot.pgn).ok ? snapshot.pgn : null;
  const canReviewPosition = snapshot?.moves.length || state.branch;
  const input = pgn ? { pgn } : canReviewPosition ? { fen: state.boardFen } : null;
  link.hidden = !input || !analysisAllowed();
  if (link.hidden) {
    link.removeAttribute('href');
    return;
  }
  link.href = '/analysis/#' + new URLSearchParams({ ...input, orientation: board.orientation, lang });
  link.textContent = t(pgn ? 'reviewGame' : 'reviewPosition');
}

function paint() {
  paintEvent();
  paintBoard();
  paintMoves();
  paintControls();
}

function cancelAnalysis() {
  closeTrend();
  state.requestVersion++;
  state.requestedKey = '';
  state.analysisKey = '';
  state.analysis = null;
  if (state.analyzing) state.engines?.cancel();
}

function closeTrend() {
  state.trend = null;
  $('live-trend').hidden = true;
  $('trend-toggle').setAttribute('aria-expanded', 'false');
}

function showTrendView(table) {
  $('trend-chart').hidden = table;
  $('trend-data').hidden = !table;
  $('trend-chart-view').setAttribute('aria-pressed', String(!table));
  $('trend-data-view').setAttribute('aria-pressed', String(table));
}

function renderTrend(trend) {
  const { position, samples } = trend;
  const count = RATINGS.filter(elo => samples.has(elo)).length;
  $('trend-status').textContent = t('trendProgress').replace('{count}', count).replace('{total}', RATINGS.length);
  $('trend-retry').hidden = trend.running || count === RATINGS.length;
  $('trend-chart').replaceChildren(renderMaiaTrendPlot($('trend-data').querySelector('table'), position.series, samples, position.elo));
}

async function sampleTrend(trend) {
  if (trend.running) return;
  const obsolete = () => state.trend !== trend || !analysisAllowed() || !foreground();
  trend.running = true;
  renderTrend(trend);
  try {
    for (const elo of [...RATINGS].sort((a, b) => Math.abs(a - trend.position.elo) - Math.abs(b - trend.position.elo))) {
      if (obsolete()) return;
      if (trend.samples.has(elo)) continue;
      const moves = await state.engines.sampleMaia(trend.position, elo, obsolete);
      if (obsolete()) return;
      const sample = probabilities(moves);
      if (sample.size) trend.samples.set(elo, sample);
      renderTrend(trend);
    }
  } catch (error) {
    if (!obsolete()) console.debug('Broadcast Maia trend unavailable', error);
  } finally {
    trend.running = false;
    if (!obsolete()) renderTrend(trend);
  }
}

function paintAnalysis() {
  const result = state.analysis;
  $('trend-toggle').hidden = !result?.trend;
  if (state.trend) renderTrend(state.trend);
  $('engine-lines').hidden = !result;
  $('moment').hidden = !state.snapshot?.moves[state.cursor - 1] || !!state.branch || !analysisAllowed();
  $('analyze').disabled = !state.preferencesReady || !analysisAllowed();
  $('analyze').textContent = t(state.engineEnabled ? (result || state.analyzing || !state.requestedKey ? 'pause' : 'retry') : 'analyze');
  const kind = result?.moment && intuitionKind(result.moment);
  $('intuition-tag').hidden = !kind;
  $('intuition-tag').textContent = kind ? t(kind) : '';
  $('engine-note').textContent = !state.engineEnabled ? t('analysisIdle')
    : state.analyzing ? t(state.branch ? 'branchBusy' : 'engineBusy') : result ? (result.maiaReady ? '' : t('partial'))
      : state.requestedKey ? t('engineFailed') : t('waitingMove');
  if (result) {
    const moment = result.moment;
    $('sf-line').textContent = [moment?.bestSan ?? result.bestSan, result.score, result.depth ? 'D' + result.depth : ''].filter(Boolean).join(' · ') || '—';
    const probability = Number.isFinite(moment?.humanRawProbability) ? (100 * moment.humanRawProbability).toFixed(1) + '%' : '';
    $('maia-line').textContent = [moment?.maiaTopSan ?? result.maiaTopSan, probability && moment.san + ' ' + probability].filter(Boolean).join(' · ') || '—';
  }
  paintEngineStatus();
}

function paintEngineStatus() {
  const { stockfishVariant, maiaVariant, depth } = state.settings;
  const sfName = stockfishVariant === 'standard' ? (lang === 'zh' ? 'Stockfish 19 标准版' : 'Stockfish 19 Standard') : 'Stockfish 19 Lite';
  const maiaName = MAIA_VARIANTS[maiaVariant].name;
  $('sf-edition').textContent = `${sfName} · ${t('targetDepth')} D${depth}`;
  $('maia-edition').textContent = maiaName;
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
    progress.hidden = phase !== 'downloading';
    progress.setAttribute('aria-label', name);
    if (percent === null) progress.removeAttribute('value');
    else progress.value = percent;
  }
}

function applyPreferences() {
  const saved = getSavedPreferences();
  const stockfishVariant = saved.stockfishVariant || 'lite';
  const settings = {
    maiaVariant: saved.maiaVariant || '23m', stockfishVariant,
    depth: stockfishVariant === 'standard' ? saved.studio_max_depth ?? 22 : 18,
    elo: saved.defaultElo ?? 2600
  };
  const previous = state.settings;
  state.settings = settings;
  state.preferencesReady = true;
  $('live-sf').disabled = $('live-maia').disabled = $('event-elo').disabled = false;
  $('live-sf').value = settings.stockfishVariant;
  $('live-maia').value = settings.maiaVariant;
  const elo = $('event-elo');
  if (!Array.from(elo.options).some(option => Number(option.value) === settings.elo)) elo.add(new Option(String(settings.elo)));
  elo.value = String(settings.elo);
  if (Object.keys(settings).some(key => settings[key] !== previous[key])) {
    cancelAnalysis();
    if (state.engines && (settings.stockfishVariant !== previous.stockfishVariant || settings.maiaVariant !== previous.maiaVariant)) {
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
    void analyzeMove();
  }
  paintAnalysis();
}

async function analyzeMove() {
  const moves = state.snapshot?.moves || [];
  const branch = state.branch;
  const move = branch ? null : moves[state.cursor - 1];
  if ((!move && !branch) || !state.engineEnabled || !analysisAllowed() || !foreground()) return;
  const elo = state.settings.elo;
  const fenBefore = branch?.fen ?? moves[state.cursor - 2]?.fen ?? state.snapshot.initialFen;
  const history = branch?.history ?? [state.snapshot.initialFen, ...moves.slice(0, state.cursor - 1).map(move => move.fen)]
    .slice(Math.max(0, state.cursor - 8), state.cursor - 1);
  const key = JSON.stringify([state.round, state.cursor, fenBefore, move?.uci, elo, history]);
  if (state.requestedKey === key) return;
  closeTrend();
  const version = ++state.requestVersion;
  state.requestedKey = key;
  state.analysisKey = '';
  state.analysis = null;
  if (state.analyzing) {
    state.engines?.cancel();
    return;
  }
  state.analyzing = true;
  paintAnalysis();
  const obsolete = () => state.requestVersion !== version || !foreground() || !analysisAllowed();
  try {
    if (!state.engines) {
      const { LiveEngines } = await import('./engines.js?v=20261124-match');
      if (obsolete()) return;
      const owner = new LiveEngines(state.settings, () => { if (state.engines === owner) paintEngineStatus(); }, state.reusableStockfish);
      state.engines = owner;
      state.reusableStockfish = null;
    }
    const result = await state.engines.inspect({ move, fenBefore, history, elo }, obsolete, partial => {
      if (obsolete()) return;
      state.analysis = partial;
      paintAnalysis();
    });
    if (result && !obsolete()) {
      state.analysisKey = key;
      state.analysis = result;
    }
  } catch (error) {
    console.debug('Broadcast analysis unavailable', error);
  } finally {
    state.analyzing = false;
    if (state.requestedKey && state.requestVersion !== version) {
      state.requestedKey = '';
      void analyzeMove();
    }
    paintAnalysis();
  }
}

function jump(ply, follow = false) {
  state.cursor = Math.max(0, Math.min(ply, state.snapshot?.moves.length || 0));
  state.follow = follow;
  state.branch = null;
  if (follow) state.unseen = false;
  cancelAnalysis();
  paint();
  void analyzeMove();
}

function chooseRound(round) {
  if (round === state.round && state.snapshot) return;
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
    if (state.follow && mainlineChanged && (board.gesture || board.selectedSq || board.promotionPicker)) {
      state.follow = false;
    }
    state.snapshot = next;
    if (state.initialPly !== null) {
      state.cursor = Math.min(state.initialPly, next.moves.length);
      state.initialPly = null;
      state.follow = false;
    } else if (state.follow) {
      state.cursor = next.moves.length;
    } else if (mainlineChanged) {
      state.unseen = true;
      if (!state.branch) state.cursor = Math.min(state.cursor, next.moves.length);
    }
    // A correction can replace the occupied mainline position. Keep a trial branch separate.
    paint();
    if (state.follow && !state.branch) void analyzeMove();
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
$('latest').onclick = $('new-move').onclick = () => jump(state.snapshot?.moves.length || 0, true);
$('flip-board').onclick = () => {
  board.flip();
  const blackAtBottom = board.orientation === 'black';
  board.container.before($(blackAtBottom ? 'white-seat' : 'black-seat'));
  board.container.after($(blackAtBottom ? 'black-seat' : 'white-seat'));
  paintWorkbenchLink();
};
$('language').onclick = () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  paintLanguage();
};
$('event-elo').onchange = () => void savePreferences({ defaultElo: Number($('event-elo').value) });
$('live-sf').onchange = () => void savePreferences({ stockfishVariant: $('live-sf').value });
$('live-maia').onchange = () => void savePreferences({ maiaVariant: $('live-maia').value });
$('trend-toggle').onclick = () => {
  if (state.trend) { closeTrend(); return; }
  const position = state.analysis?.trend;
  if (!position || !analysisAllowed() || !foreground()) return;
  const trend = state.trend = { position, samples: new Map([[position.elo, probabilities(position.moves)]]) };
  $('trend-legend').replaceChildren(...position.series.map(move => {
    const item = document.createElement('li');
    item.className = 'trend-' + move.role;
    item.textContent = move.san;
    return item;
  }));
  $('live-trend').hidden = false;
  $('trend-toggle').setAttribute('aria-expanded', 'true');
  showTrendView(false);
  void sampleTrend(trend);
};
$('trend-chart-view').onclick = () => showTrendView(false);
$('trend-data-view').onclick = () => showTrendView(true);
$('trend-retry').onclick = () => { if (state.trend) void sampleTrend(state.trend); };
$('analyze').onclick = () => {
  if (!analysisAllowed()) return;
  const failed = state.requestedKey && !state.analysis && !state.analyzing;
  state.engineEnabled = failed || !state.engineEnabled;
  cancelAnalysis();
  paintAnalysis();
  void analyzeMove();
};
function liveLink(round = state.round, ply = state.cursor, locale = lang) {
  const query = new URLSearchParams({ event: eventId, round, lang: locale });
  if (ply) query.set('ply', String(ply));
  return 'https://4chess.cc/live/?' + query;
}

$('copy-live-link').onclick = async () => {
  if (!currentRound()) return;
  const copied = await copyShareLink(liveLink(), $('live-link-field'));
  $('live-link-status').textContent = copied ? t('linkCopied') : '';
};

let shareModal;
$('moment').onclick = async () => {
  const snapshot = state.snapshot;
  const played = snapshot?.moves[state.cursor - 1];
  if (!played || state.branch || !analysisAllowed()) return;
  const round = state.round;
  const cardLang = lang;
  const orientation = board.orientation;
  const elo = state.settings.elo;
  const analysis = state.analysis?.moment;
  const evaluated = analysis?.ply === played.ply ? analysis : null;
  const move = evaluated ?? { ...played, fenBefore: snapshot.moves[played.ply - 2]?.fen || snapshot.initialFen };
  const link = liveLink(round, played.ply, cardLang);
  const [white, black] = roundPlayers(currentRound()).map(player => playerName(player, cardLang));
  try {
    const { ShareCardModal } = await import('../analysis/share-card.js?v=20261124-intuition-labels');
    shareModal ||= new ShareCardModal(null, { format: 'portrait', allowed: analysisAllowed });
    await shareModal.open(move, {
      lang: cardLang, elo, orientation, white, black, link, linkCopied: t('linkCopied', cardLang),
      filename: format => 'diverge-wcc-' + round + '-' + played.ply + '-' + format + '.png',
      decorate(spec) {
        spec.badge = [t('card', cardLang), snapshot.roundName, spec.kind ? t(spec.kind, cardLang) : ''].filter(Boolean).join(' · ');
        if (!evaluated) {
          spec.headline = (move.moveNumber + (move.turn === 'w' ? '. ' : '… ')) + move.san;
          spec.subline = [white, black].filter(Boolean).join(' vs ');
        }
        spec.watermark = '4chess.cc/live · Lichess Broadcast';
        spec.targetUrl = link;
        spec.scanLabel = t('scan', cardLang);
      }
    });
  } catch {
    $('engine-note').textContent = t('shareFailed');
  }
};

document.addEventListener('visibilitychange', () => {
  clearTimeout(state.eventTimer);
  clearTimeout(state.roundTimer);
  if (foreground()) {
    void pollEvent();
    void pollRound();
    if (state.engineEnabled) void analyzeMove();
  } else {
    if (state.trend?.running) closeTrend();
    if (state.analyzing) cancelAnalysis();
  }
});
subscribePreferences(applyPreferences);
void initializePreferences().then(applyPreferences, applyPreferences);
paintLanguage();
setInterval(() => { if (foreground()) paintCountdown(); }, 1000);
void pollEvent();
