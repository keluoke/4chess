import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { checkupReplayUrl, fetchRecentGamesPage, suggestCheckupPlayer } from './checkup-archives.js?v=20261124-checkup-cards-r2';
import { accountKey, normalizeAccount, normalizeAlias } from './study-store.js?v=20261124-checkup-cards-r2';
import { getLang, t } from './i18n.js?v=20261124-intuition-labels';

const CACHE_TTL_MS = 3 * 60_000;
const PAGE_SIZE = 20;
const LAST_TARGET_KEY = 'diverge_recent_games_last';
const SPEED_ORDER = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];

function readLastTarget() {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_TARGET_KEY) || 'null');
    return normalizeAccount(raw?.platform, raw?.username);
  } catch {
    return null;
  }
}

function saveLastTarget(platform, username) {
  const account = normalizeAccount(platform, username);
  if (!account) return;
  try { localStorage.setItem(LAST_TARGET_KEY, JSON.stringify(account)); } catch {}
}

export function resolveRecentGamesTarget(app, { lastTarget = null } = {}) {
  const profile = app?.mistakeBank?.activeProfile || null;
  const game = app?.checkupGame || null;
  if (game && ['chesscom', 'lichess'].includes(game.platform)) {
    const players = [game.white, game.black].map(normalizeAlias).filter(Boolean);
    const linked = (profile?.accounts || []).find(acc =>
      acc.platform === game.platform && players.includes(normalizeAlias(acc.username))
    );
    if (linked) return { platform: linked.platform, username: linked.username };
    const suggested = suggestCheckupPlayer(game, profile);
    const normalized = normalizeAccount(game.platform, suggested);
    if (normalized) return normalized;
  }
  const firstAccount = (profile?.accounts || []).find(acc => normalizeAccount(acc?.platform, acc?.username));
  if (firstAccount) return { platform: firstAccount.platform, username: firstAccount.username };
  const fallback = normalizeAccount(lastTarget?.platform, lastTarget?.username);
  return fallback || null;
}

export function gameOutcomeForPlayer(game, username) {
  const meta = game?.meta || {};
  const userKey = normalizeAlias(username);
  const whiteKey = normalizeAlias(meta.white);
  const blackKey = normalizeAlias(meta.black);
  const side = userKey && userKey === whiteKey ? 'w'
    : userKey && userKey === blackKey ? 'b'
    : null;
  const result = meta.result || '*';
  let outcome = 'neutral';
  if (side && result === '1/2-1/2') outcome = 'draw';
  else if (side === 'w') outcome = result === '1-0' ? 'win' : result === '0-1' ? 'loss' : 'neutral';
  else if (side === 'b') outcome = result === '0-1' ? 'win' : result === '1-0' ? 'loss' : 'neutral';
  return {
    side,
    outcome,
    orientation: side === 'b' ? 'black' : 'white'
  };
}

function formatGameDate(game) {
  const playedAt = game?.meta?.playedAt;
  if (Number.isFinite(playedAt) && playedAt > 0) {
    try {
      return new Intl.DateTimeFormat(getLang() === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short', day: 'numeric'
      }).format(new Date(playedAt));
    } catch {}
  }
  const raw = String(game?.meta?.date || '').trim();
  return raw && raw !== '????.??.??' ? raw.replaceAll('.', '-') : '';
}

function speedLabel(speed) {
  if (!speed) return '';
  const key = `checkupSpeed_${speed}`;
  const label = t(key);
  return label === key ? speed : label;
}

function describeFetchError(error, platform) {
  const msg = String(error?.message || '');
  if (msg.includes('404')) return t('recentGamesErrorNotFound');
  if (msg.includes('429')) return t('recentGamesErrorRateLimit');
  const label = platform === 'lichess' ? 'Lichess' : 'Chess.com';
  return t('recentGamesErrorGeneric', { platform: label });
}

export class RecentGamesPicker {
  constructor(app) {
    this.app = app;
    this.activeTab = 'paste';
    this.platform = 'lichess';
    this.activeUsername = '';
    this.speedFilter = 'all';
    this.outcomeFilter = 'all';
    this.cache = new Map();
    this.controller = null;
    this.loading = false;
    this.loadingMore = false;
    this.statusMessage = '';
    this.statusTone = '';

    this.tabPaste = document.getElementById('import-tab-paste');
    this.tabAccount = document.getElementById('import-tab-account');
    this.panelPaste = document.getElementById('import-panel-paste');
    this.panelAccount = document.getElementById('import-panel-account');
    this.chips = document.getElementById('recent-games-chips');
    this.platformButtons = [...document.querySelectorAll('[data-recent-platform]')];
    this.usernameInput = document.getElementById('recent-games-username');
    this.fetchBtn = document.getElementById('btn-recent-games-fetch');
    this.refreshBtn = document.getElementById('btn-recent-games-refresh');
    this.bindBtn = document.getElementById('btn-recent-games-bind');
    this.statusEl = document.getElementById('recent-games-status');
    this.filtersEl = document.getElementById('recent-games-filters');
    this.listEl = document.getElementById('recent-games-list');
    this.moreBtn = document.getElementById('btn-recent-games-more');
    this.cancelBtn = document.getElementById('btn-cancel-recent-games');
    this.homeSummary = document.getElementById('home-recent-games-summary');

    this.bindEvents();
    this.syncHomeEntry();
  }

  bindEvents() {
    this.tabPaste?.addEventListener('click', () => this.setTab('paste'));
    this.tabAccount?.addEventListener('click', () => this.setTab('account', { autoLoad: true }));
    for (const btn of this.platformButtons) {
      btn.addEventListener('click', () => this.setPlatform(btn.dataset.recentPlatform));
    }
    this.fetchBtn?.addEventListener('click', () => this.loadGames({ forceRefresh: true }));
    this.refreshBtn?.addEventListener('click', () => this.loadGames({ forceRefresh: true }));
    this.usernameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.loadGames({ forceRefresh: true });
      }
    });
    this.moreBtn?.addEventListener('click', () => this.loadMore());
    this.bindBtn?.addEventListener('click', () => this.bindCurrentAccount());
    this.cancelBtn?.addEventListener('click', () => this.app.closePgnModal({ cancel: true }));
  }

  onModalOpen(tab = 'paste') {
    this.setTab(tab === 'account' ? 'account' : 'paste', { focus: true, autoLoad: tab === 'account' });
  }

  cancelPending() {
    this.controller?.abort();
    this.controller = null;
    this.loading = false;
    this.loadingMore = false;
    this.syncButtons();
  }

  setTab(tab = 'paste', { focus = true, autoLoad = false } = {}) {
    this.activeTab = tab === 'account' ? 'account' : 'paste';
    const isAccount = this.activeTab === 'account';
    this.tabPaste?.setAttribute('aria-selected', String(!isAccount));
    this.tabAccount?.setAttribute('aria-selected', String(isAccount));
    if (this.tabPaste) this.tabPaste.tabIndex = isAccount ? -1 : 0;
    if (this.tabAccount) this.tabAccount.tabIndex = isAccount ? 0 : -1;
    if (this.panelPaste) this.panelPaste.hidden = isAccount;
    if (this.panelAccount) this.panelAccount.hidden = !isAccount;

    if (!isAccount) {
      if (focus) this.app.el?.pgnInput?.focus();
      return;
    }

    const target = resolveRecentGamesTarget(this.app, { lastTarget: readLastTarget() });
    if (target && (!this.usernameInput?.value.trim() || this.app.checkupGame)) {
      this.setPlatform(target.platform, { silent: true });
      if (this.usernameInput) this.usernameInput.value = target.username;
      this.activeUsername = target.username;
    } else {
      this.setPlatform(this.platform, { silent: true });
    }

    this.renderChips();
    this.renderCurrentState();
    if (autoLoad && this.usernameInput?.value.trim()) {
      void this.loadGames({ forceRefresh: false });
    }
    if (focus) {
      this.usernameInput?.focus();
    }
  }

  setPlatform(platform, { silent = false } = {}) {
    this.platform = platform === 'chesscom' ? 'chesscom' : 'lichess';
    for (const btn of this.platformButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.recentPlatform === this.platform));
    }
    if (!silent) {
      this.speedFilter = 'all';
      this.outcomeFilter = 'all';
      this.statusMessage = '';
      this.statusTone = '';
      this.renderChips();
      this.renderCurrentState();
    }
  }

  cacheKey(platform = this.platform, username = this.usernameInput?.value || this.activeUsername) {
    const account = normalizeAccount(platform, username);
    return account ? accountKey(account) : '';
  }

  getCached(key) {
    if (!key) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  collectQuickTargets() {
    const seen = new Set();
    const items = [];
    const push = (platform, username, source) => {
      const account = normalizeAccount(platform, username);
      if (!account) return;
      const key = accountKey(account);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ ...account, source });
    };
    const game = this.app?.checkupGame;
    if (game && ['chesscom', 'lichess'].includes(game.platform)) {
      const suggested = suggestCheckupPlayer(game, this.app?.mistakeBank?.activeProfile);
      if (suggested) push(game.platform, suggested, 'game');
      push(game.platform, game.white, 'game');
      push(game.platform, game.black, 'game');
    }
    for (const acc of this.app?.mistakeBank?.activeProfile?.accounts || []) {
      push(acc.platform, acc.username, 'profile');
    }
    return items;
  }

  renderChips() {
    if (!this.chips) return;
    const items = this.collectQuickTargets();
    this.chips.replaceChildren();
    if (!items.length) {
      this.chips.hidden = true;
      return;
    }
    const label = document.createElement('span');
    label.className = 'recent-games-chips-label';
    label.textContent = t('recentGamesQuickPick');
    this.chips.append(label);
    const activeKey = this.cacheKey();
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-header recent-games-chip';
      const key = accountKey(item);
      btn.setAttribute('aria-pressed', String(key === activeKey));
      btn.textContent = `${item.platform === 'lichess' ? 'Lichess' : 'Chess.com'} · ${item.username}`;
      btn.addEventListener('click', () => {
        this.setPlatform(item.platform, { silent: true });
        if (this.usernameInput) this.usernameInput.value = item.username;
        this.activeUsername = item.username;
        this.speedFilter = 'all';
        this.outcomeFilter = 'all';
        this.renderChips();
        void this.loadGames({ forceRefresh: false });
      });
      this.chips.append(btn);
    }
    this.chips.hidden = false;
  }

  async loadGames({ forceRefresh = false } = {}) {
    const raw = this.usernameInput?.value.trim() || '';
    const account = normalizeAccount(this.platform, raw);
    if (!account) {
      this.statusMessage = t('recentGamesUsernameRequired');
      this.statusTone = 'error';
      this.renderCurrentState();
      this.usernameInput?.focus();
      return;
    }
    this.activeUsername = account.username;
    const key = accountKey(account);
    if (!forceRefresh) {
      const cached = this.getCached(key);
      if (cached) {
        this.statusMessage = '';
        this.statusTone = '';
        this.renderChips();
        this.renderCurrentState();
        return;
      }
    }

    this.cancelPending();
    const controller = this.controller = new AbortController();
    this.loading = true;
    this.statusMessage = t('recentGamesLoading');
    this.statusTone = '';
    this.syncButtons();
    this.renderCurrentState();

    try {
      const page = await fetchRecentGamesPage(account.platform, account.username, {
        limit: PAGE_SIZE,
        signal: controller.signal
      });
      if (controller.signal.aborted || this.controller !== controller) return;
      this.cache.set(key, {
        platform: account.platform,
        username: account.username,
        games: page.games,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        fetchedAt: Date.now()
      });
      saveLastTarget(account.platform, account.username);
      this.speedFilter = 'all';
      this.outcomeFilter = 'all';
      this.statusMessage = page.games.length ? '' : t('recentGamesEmpty');
      this.statusTone = '';
      this.syncHomeEntry();
      this.renderChips();
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      this.statusMessage = describeFetchError(error, account.platform);
      this.statusTone = 'error';
    } finally {
      if (this.controller === controller) this.controller = null;
      this.loading = false;
      this.syncButtons();
      this.renderCurrentState();
    }
  }

  async loadMore() {
    const key = this.cacheKey(this.platform, this.activeUsername || this.usernameInput?.value);
    const entry = this.getCached(key);
    if (!entry || !entry.hasMore || !entry.nextCursor || this.loading || this.loadingMore) return;

    const controller = this.controller = new AbortController();
    this.loadingMore = true;
    this.syncButtons();
    try {
      const page = await fetchRecentGamesPage(entry.platform, entry.username, {
        limit: PAGE_SIZE,
        cursor: entry.nextCursor,
        signal: controller.signal
      });
      if (controller.signal.aborted || this.controller !== controller) return;
      const seen = new Set(entry.games.map(g => g.gameId || g.pgn));
      const merged = [...entry.games];
      for (const game of page.games) {
        const id = game.gameId || game.pgn;
        if (!seen.has(id)) {
          seen.add(id);
          merged.push(game);
        }
      }
      this.cache.set(key, {
        ...entry,
        games: merged,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        fetchedAt: Date.now()
      });
    } catch (error) {
      if (error?.name !== 'AbortError' && !controller.signal.aborted) {
        this.statusMessage = describeFetchError(error, entry.platform);
        this.statusTone = 'error';
      }
    } finally {
      if (this.controller === controller) this.controller = null;
      this.loadingMore = false;
      this.syncButtons();
      this.renderCurrentState();
    }
  }

  async bindCurrentAccount() {
    const account = normalizeAccount(this.platform, this.activeUsername || this.usernameInput?.value);
    if (!account || !this.app?.mistakeBank?.allowed() || !this.app?.studyProfiles) return;
    await this.app.studyProfiles.change(async () => {
      const linked = await this.app.studyProfiles.linkAccount(account);
      if (linked) {
        const label = `${account.platform === 'lichess' ? 'Lichess' : 'Chess.com'} · ${account.username}`;
        this.app.showToast(t('checkupAccountSaved', { account: label }));
      }
    });
    this.renderChips();
    this.syncBindButton();
    this.syncHomeEntry();
  }

  syncButtons() {
    if (this.fetchBtn) this.fetchBtn.disabled = this.loading || this.loadingMore;
    if (this.refreshBtn) this.refreshBtn.disabled = this.loading || this.loadingMore;
    if (this.moreBtn) {
      this.moreBtn.disabled = this.loading || this.loadingMore;
      this.moreBtn.textContent = t(this.loadingMore ? 'recentGamesLoadingMore' : 'recentGamesLoadMore');
    }
  }

  syncBindButton() {
    if (!this.bindBtn) return;
    const account = normalizeAccount(this.platform, this.activeUsername || this.usernameInput?.value);
    const key = this.cacheKey(this.platform, account?.username);
    const entry = this.getCached(key);
    const profile = this.app?.mistakeBank?.activeProfile;
    const allowed = !!this.app?.mistakeBank?.allowed() && !!profile && !!account && !!entry?.games?.length;
    const alreadyBound = allowed && (profile.accounts || []).some(acc => accountKey(acc) === accountKey(account));
    this.bindBtn.hidden = !allowed || alreadyBound;
    this.bindBtn.textContent = t('recentGamesBind');
  }

  renderFilters(entry) {
    if (!this.filtersEl) return;
    this.filtersEl.replaceChildren();
    if (!entry?.games?.length) {
      this.filtersEl.hidden = true;
      return;
    }

    const speedsPresent = SPEED_ORDER.filter(speed =>
      entry.games.some(g => g.meta?.timeClass === speed)
    );
    const speedGroup = document.createElement('div');
    speedGroup.className = 'recent-games-filter-group';
    speedGroup.setAttribute('role', 'group');
    for (const [id, text] of [['all', t('recentGamesFilterAll')], ...speedsPresent.map(s => [s, speedLabel(s)])]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-header';
      btn.textContent = text;
      btn.setAttribute('aria-pressed', String(this.speedFilter === id));
      btn.addEventListener('click', () => {
        this.speedFilter = id;
        this.renderCurrentState();
      });
      speedGroup.append(btn);
    }

    const outcomeGroup = document.createElement('div');
    outcomeGroup.className = 'recent-games-filter-group';
    outcomeGroup.setAttribute('role', 'group');
    for (const [id, text] of [
      ['all', t('recentGamesFilterAll')],
      ['win', t('checkupResult_win')],
      ['draw', t('checkupResult_draw')],
      ['loss', t('checkupResult_loss')]
    ]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-header';
      btn.textContent = text;
      btn.setAttribute('aria-pressed', String(this.outcomeFilter === id));
      btn.addEventListener('click', () => {
        this.outcomeFilter = id;
        this.renderCurrentState();
      });
      outcomeGroup.append(btn);
    }

    this.filtersEl.append(speedGroup, outcomeGroup);
    this.filtersEl.hidden = false;
  }

  renderCurrentState() {
    this.syncButtons();
    this.syncBindButton();
    const key = this.cacheKey(this.platform, this.activeUsername || this.usernameInput?.value);
    const entry = this.getCached(key);

    if (this.statusEl) {
      let msg = this.statusMessage;
      if (!msg && entry?.games?.length) {
        msg = t('recentGamesCount', { count: entry.games.length });
      }
      this.statusEl.textContent = msg;
      this.statusEl.dataset.tone = this.statusTone || '';
      this.statusEl.hidden = !msg;
    }

    this.renderFilters(entry);

    if (!this.listEl) return;
    this.listEl.replaceChildren();
    if (!entry?.games?.length) {
      if (this.moreBtn) this.moreBtn.hidden = true;
      return;
    }

    const filtered = entry.games.filter(game => {
      if (this.speedFilter !== 'all' && game.meta?.timeClass !== this.speedFilter) return false;
      if (this.outcomeFilter !== 'all') {
        const { outcome } = gameOutcomeForPlayer(game, entry.username);
        if (outcome !== this.outcomeFilter) return false;
      }
      return true;
    });

    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'recent-games-empty';
      empty.textContent = t('recentGamesNoFilterMatch');
      this.listEl.append(empty);
    } else {
      const currentGame = this.app?.checkupGame;
      for (const game of filtered) {
        const { side, outcome, orientation } = gameOutcomeForPlayer(game, entry.username);
        const isCurrent = !!currentGame &&
          currentGame.platform === entry.platform &&
          !!currentGame.gameId &&
          currentGame.gameId === game.gameId;

        const row = document.createElement('button');
        row.type = 'button';
        row.className = `recent-game-item${isCurrent ? ' is-current' : ''}`;
        if (game.gameId) row.dataset.gameId = game.gameId;

        const badge = document.createElement('span');
        badge.className = `recent-game-outcome recent-game-outcome-${outcome}`;
        badge.textContent = outcome === 'neutral'
          ? (game.meta?.result || '*')
          : t(`checkupResult_${outcome}`);

        const body = document.createElement('span');
        body.className = 'recent-game-body';

        const title = document.createElement('strong');
        title.className = 'recent-game-title';
        if (side) {
          const opponent = side === 'w' ? game.meta?.black : game.meta?.white;
          const oppRating = side === 'w' ? game.meta?.blackRating : game.meta?.whiteRating;
          const colorIcon = side === 'w' ? '⚪' : '⚫';
          title.textContent = `${colorIcon} ${opponent || '—'}${oppRating ? ` (${oppRating})` : ''}`;
        } else {
          title.textContent = `${game.meta?.white || '—'} vs ${game.meta?.black || '—'}`;
        }

        const sub = document.createElement('small');
        sub.className = 'recent-game-meta';
        const openingText = game.meta?.opening || game.meta?.eco || '';
        const dateText = formatGameDate(game);
        const speedText = speedLabel(game.meta?.timeClass);
        sub.textContent = [speedText, openingText, dateText].filter(Boolean).join(' · ');

        body.append(title, sub);

        const action = document.createElement('span');
        action.className = 'recent-game-action';
        action.textContent = isCurrent ? t('recentGamesCurrent') : t('recentGamesAnalyze');

        row.append(badge, body, action);
        row.addEventListener('click', () => this.openGame(entry.platform, game, orientation));
        this.listEl.append(row);
      }
    }

    if (this.moreBtn) {
      this.moreBtn.hidden = !entry.hasMore;
    }
  }

  openGame(platform, game, orientation) {
    if (!game?.pgn || !FairPlayGuard.verifyConcludedGame(game.pgn).ok) return;
    const opened = this.app.startNewSession({
      pgn: game.pgn,
      white: game.meta?.white || null,
      black: game.meta?.black || null,
      result: game.meta?.result || null,
      orientation,
      checkupSource: platform,
      publicGameUrl: checkupReplayUrl(platform, game.gameId),
      autoReview: true
    });
    if (opened) {
      this.app.closePgnModal();
    }
  }

  syncCurrentGame() {
    if (this.app?.el?.pgnModal?.classList.contains('open') && this.activeTab === 'account') {
      this.renderCurrentState();
    }
  }

  syncHomeEntry() {
    if (!this.homeSummary) return;
    const accounts = this.app?.mistakeBank?.activeProfile?.accounts || [];
    if (accounts.length) {
      const label = accounts
        .map(acc => `${acc.platform === 'lichess' ? 'Lichess' : 'Chess.com'} · ${acc.username}`)
        .join(' / ');
      this.homeSummary.textContent = t('homeRecentGamesLinked', { accounts: label });
      return;
    }
    const last = readLastTarget();
    if (last) {
      const label = `${last.platform === 'lichess' ? 'Lichess' : 'Chess.com'} · ${last.username}`;
      this.homeSummary.textContent = t('homeRecentGamesLinked', { accounts: label });
      return;
    }
    this.homeSummary.textContent = t('homeRecentGamesSummary');
  }

  onProfileChanged() {
    this.syncHomeEntry();
    if (this.app?.el?.pgnModal?.classList.contains('open') && this.activeTab === 'account') {
      this.renderChips();
      this.syncBindButton();
    }
  }

  refreshAfterLanguageChange() {
    this.syncHomeEntry();
    if (this.app?.el?.pgnModal?.classList.contains('open')) {
      this.renderChips();
      this.renderCurrentState();
    }
  }
}
