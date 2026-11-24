import { BoardUI } from '../analysis/board-ui.js?v=20261124-divergence-cards';
import { ChessBoard } from '../engine/chess-core.js';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { intuitionKind } from '../engine/review-policy.js';
import { RATINGS, probabilities, renderMaiaTrendPlot } from '../analysis/maia-elo-trend.js?v=20261124-intuition-labels';

const copy = {
  zh: {
    studio: '分析工作台', round: '轮次', moves: '实战着法', engines: '双引擎对比', rating: '段位',
    first: '第一步', previous: '上一步', next: '下一步', latest: '回到最新', share: '分享棋王战瞬间',
    flip: '翻转棋盘', reviewGame: '在工作台复盘本局', reviewPosition: '在工作台分析此局面',
    sfEdition: 'Stockfish 19 标准版 · 目标 D22', trend: 'Maia 分段趋势', chart: '曲线', trendData: '采样数据',
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
    sfEdition: 'Stockfish 19 Standard · Target D22', trend: 'Maia rating trends', chart: 'Chart', trendData: 'Samples',
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
  engines: null, engineEnabled: false, analysisKey: '', requestedKey: '', analysis: null, analyzing: false, requestVersion: 0
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
  paint();
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

  const select = $('round-select');
  select.replaceChildren(...event.rounds.map(round => {
    const option = document.createElement('option');
    option.value = round.id;
    const scheduled = round.status === 'scheduled' && round.startsAt
      ? ' · ' + new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(round.startsAt) : '';
    option.textContent = round.name + scheduled + (round.status === 'cancelled' ? ' · ' + t('cancelled') : '');
    return option;
  }));
  select.disabled = !event.rounds.length;
  select.value = state.round;
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
  for (const [side, turn] of [['white', 'w'], ['black', 'b']]) {
    const player = state.snapshot?.[side];
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
    for (const elo of RATINGS) {
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
  $('moment').hidden = !result?.moment;
  $('analyze').disabled = !analysisAllowed();
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
}

async function analyzeMove() {
  const moves = state.snapshot?.moves || [];
  const branch = state.branch;
  const move = branch ? null : moves[state.cursor - 1];
  if ((!move && !branch) || !state.engineEnabled || !analysisAllowed() || !foreground()) return;
  const elo = Number($('event-elo').value);
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
      const { LiveEngines } = await import('./engines.js?v=20261124-trend');
      if (obsolete()) return;
      state.engines = new LiveEngines();
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

$('round-select').onchange = event => {
  state.initialPly = null;
  chooseRound(event.target.value);
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
$('event-elo').onchange = () => { cancelAnalysis(); void analyzeMove(); };
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
$('moment').onclick = async () => {
  if (!state.analysis?.moment || !analysisAllowed()) return;
  const key = state.analysisKey;
  const result = state.analysis;
  const cardLang = lang;
  const orientation = board.orientation;
  const { round, snapshot } = state;
  try {
    const [{ buildShareCardSpec, renderShareCardCanvas }, { canvasPng, downloadPng }] = await Promise.all([
      import('../analysis/share-card.js?v=20261124-intuition-labels'), import('../analysis/share-export.js?v=20261124-divergence-cards')
    ]);
    const spec = buildShareCardSpec(result.moment, {
      lang: cardLang, orientation, elo: Number($('event-elo').value),
      white: playerName(snapshot.white, cardLang), black: playerName(snapshot.black, cardLang)
    });
    spec.badge = [t('card', cardLang), snapshot.roundName, spec.kind ? t(spec.kind, cardLang) : ''].filter(Boolean).join(' · ');
    spec.watermark = '4chess.cc/live · Lichess Broadcast';
    spec.targetUrl = 'https://4chess.cc/live/?' + new URLSearchParams({ event: eventId, round, ply: result.moment.ply, lang: cardLang });
    spec.scanLabel = t('scan', cardLang);
    const canvas = await renderShareCardCanvas(spec, document.createElement('canvas'), {
      isCurrent: () => state.analysisKey === key && analysisAllowed()
    });
    if (!canvas) return;
    const png = await canvasPng(canvas);
    if (png && state.analysisKey === key && analysisAllowed()) downloadPng(png, 'diverge-wcc-' + round + '-' + result.moment.ply + '.png');
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
paintLanguage();
void pollEvent();
