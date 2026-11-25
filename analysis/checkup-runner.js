import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { accountKey, checkupReportMatchesAccount, normalizeAccount, normalizeAlias, trapId } from './study-store.js?v=20261124-checkup-cards-r2';
import { getLang, t } from './i18n.js?v=20261124-intuition-labels';
import {
  MAX_LOCAL_GAMES, checkupReplayUrl, checkupSourceType, detectBatchPlayer, fetchChesscomRecentGames,
  fetchLichessRecentGames, parsePgnMeta, splitMultiPgn, suggestCheckupPlayer
} from './checkup-archives.js?v=20261124-checkup-cards-r2';
import { checkupEvidenceBase, runIntuitionCheckup } from './checkup-analysis.js?v=20261124-checkup-cards-r2';
import {
  CHECKUP_ELOS, OVERVIEW_GAME_LIMIT, buildCheckupFitWindow, buildCheckupWindow,
  checkupFitForSpeed, checkupReportStability, checkupTrend, prepareCheckupOverview
} from './checkup-insights.js?v=20261124-checkup-cards-r2';
import { renderCheckupOverview, renderOverviewSpeeds } from './checkup-overview.js?v=20261124-intuition-labels';
import { CheckupShare, checkupCardData, checkupChallengeCard, overviewCardData } from './checkup-share.js?v=20261125-checkup-polish';
import { checkupFitBands } from './checkup-fit.js?v=20261124-checkup-cards-r2';
import {
  checkupFitScope, checkupPositionView, checkupReportDateRange, checkupScoreSummary, renderCheckupFit,
  renderCheckupFitSummary, renderCheckupMiniBoard, renderCheckupStability, withCheckupFit
} from './checkup-fit-view.js?v=20261125-checkup-polish';

// Keep the original module entry points available to existing callers.
export {
  checkupGameContext, checkupSourceType, detectBatchPlayer, fetchChesscomRecentGames, fetchLichessRecentGames,
  parsePgnMeta, splitMultiPgn, suggestCheckupPlayer
} from './checkup-archives.js?v=20261124-checkup-cards-r2';
export { runIntuitionCheckup } from './checkup-analysis.js?v=20261124-checkup-cards-r2';
export { CHECKUP_ELOS } from './checkup-insights.js?v=20261124-checkup-cards-r2';

const TRAP_TOPICS = ['tempting', 'recapture', 'endgameAdvantage'];

function checkupTrapTopics(trap) {
  return Array.isArray(trap.topics) ? trap.topics : trap.humanProb >= 0.40 ? ['tempting'] : [];
}

export function selectCheckupHistory(history = [], { source = 'lichess', gameContext = null, suggestedPlayer = '' } = {}) {
  const list = Array.isArray(history) ? history : [];
  const scoped = list.filter(item => checkupSourceType(item?.sourceLabel) === source);
  if (source !== 'local' && (gameContext || suggestedPlayer)) {
    const targetKey = normalizeAlias(suggestedPlayer);
    const matched = targetKey
      ? scoped.filter(item => normalizeAlias(item?.playerName) === targetKey)
      : [];
    return {
      primary: matched[0] || null,
      scopedHistory: matched,
      fallbackReport: matched.length ? null : (list[0] || null)
    };
  }
  return {
    primary: scoped[0] || null,
    scopedHistory: scoped,
    fallbackReport: scoped.length ? null : (list[0] || null)
  };
}

export function formatRelativeTime(createdAt) {
  if (!Number.isFinite(createdAt)) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if (diffMin < 1) return t('checkupJustNow');
  if (diffMin < 60) return t('checkupMinutesAgo', { n: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('checkupHoursAgo', { n: diffHr });
  return t('checkupDaysAgo', { n: Math.floor(diffHr / 24) });
}

function formatSourceBadge(sourceLabel = '') {
  const type = checkupSourceType(sourceLabel);
  if (type === 'lichess') return 'Lichess';
  if (type === 'chesscom') return 'Chess.com';
  return t('checkupSourceLocal');
}

export class IntuitionCheckup {
  source = 'lichess';
  openGeneration = 0;
  fileReadGeneration = 0;
  running = false;
  fetching = false;
  updatingProfile = false;
  pendingBatch = null;
  latestReport = null;
  history = [];
  scopedHistory = [];
  fallbackReport = null;
  view = 'settings';
  reportScope = 'rolling';
  overviewCache = new Map();

  constructor(app) {
    this.app = app;
    this.supported = typeof location === 'undefined' || location.protocol !== 'chrome-extension:';
    this.button = document.getElementById('btn-intuition-checkup');
    this.dialog = document.getElementById('checkup-dialog');
    this.closeBtn = document.getElementById('btn-close-checkup');
    this.profileSelect = document.getElementById('checkup-profile-select');
    this.profileName = document.getElementById('checkup-profile-name');
    this.newProfileBtn = document.getElementById('btn-checkup-new-profile');
    this.fitMethodSelect = document.getElementById('checkup-fit-method');
    this.screenEloSelect = document.getElementById('checkup-screen-elo');
    for (const rating of CHECKUP_ELOS) this.screenEloSelect?.add(new Option(String(rating), String(rating)));
    this.accountList = document.getElementById('checkup-accounts');
    this.btnSaveAccount = document.getElementById('btn-checkup-save-account');
    this.sourceTabs = [...document.querySelectorAll('#checkup-dialog [data-checkup-source]')];
    this.usernameRow = document.getElementById('checkup-username-row');
    this.usernameInput = document.getElementById('checkup-username');
    this.playerChoices = document.getElementById('checkup-player-choices');
    this.localRow = document.getElementById('checkup-local-row');
    this.localFilesInput = document.getElementById('checkup-pgn-files');
    this.btnSelectFiles = document.getElementById('btn-checkup-files');
    this.localPgnInput = document.getElementById('checkup-pgn-text');
    this.btnFetch = document.getElementById('btn-checkup-fetch');
    this.confirmBox = document.getElementById('checkup-confirm-box');
    this.confirmPrompt = document.getElementById('checkup-confirm-prompt');
    this.confirmNameInput = document.getElementById('checkup-confirm-name');
    this.btnStart = document.getElementById('btn-checkup-start');
    this.progressBox = document.getElementById('checkup-progress-box');
    this.progressText = document.getElementById('checkup-progress-text');
    this.progressBar = document.getElementById('checkup-progress-bar');
    this.btnCancelRun = document.getElementById('btn-checkup-cancel');
    this.eta = document.getElementById('checkup-eta');
    this.progressDetails = document.getElementById('checkup-progress-details');
    this.stopDialog = document.getElementById('checkup-stop-dialog');
    this.stopMessage = document.getElementById('checkup-stop-message');
    this.historyHintEl = document.getElementById('checkup-history-hint');
    this.reportBox = document.getElementById('checkup-report-box');
    this.statusEl = document.getElementById('checkup-status');
    this.viewTabs = [...document.querySelectorAll('[data-checkup-view]')];
    this.reportTools = document.getElementById('checkup-report-tools');
    this.reportEmpty = document.getElementById('checkup-report-empty');
    this.replayBanner = document.getElementById('checkup-replay-banner');
    this.overviewSection = document.getElementById('checkup-overview-section');
    this.overviewAccount = document.getElementById('checkup-overview-account');
    this.overviewButton = document.getElementById('btn-checkup-overview');
    this.overviewShare = document.getElementById('btn-checkup-overview-share');
    this.overviewSpeeds = document.getElementById('checkup-overview-speeds');
    this.overviewStatus = document.getElementById('checkup-overview-status');
    this.overviewBody = document.getElementById('checkup-overview-body');

    if (!this.supported) {
      if (this.button) this.button.hidden = true;
      return;
    }
    this.share = new CheckupShare(() => this.allowed() && !this.busy && this.dialog.open &&
      this.activeProfileId === this.app.mistakeBank?.activeProfile?.id);
    this.bindEvents();
    this.syncVisibility();
  }

  allowed() {
    return this.supported && !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
  }

  get ownsEngines() {
    return this.running;
  }

  get busy() {
    return this.running || this.fetching || this.updatingProfile;
  }

  syncVisibility() {
    if (this.button) this.button.hidden = !this.allowed();
    this.app.checkupReminders?.render();
    this.syncReplayBanner();
  }

  syncReplayBanner() {
    const back = this.replayReturn;
    const button = this.replayBanner?.querySelector('button');
    if (button) {
      const label = back?.overview ? 'checkupOverviewBack' : 'checkupReplayBack';
      button.dataset.i18n = label;
      button.textContent = t(label);
    }
    if (this.replayBanner) this.replayBanner.hidden = !back || !this.allowed() ||
      this.app.gameEpoch !== back.epoch || this.app.mistakeBank?.activeProfile?.id !== back.profileId;
  }

  setView(view, focus = false) {
    const openOverview = view === 'overview';
    const resolved = openOverview ? 'report' : view;
    this.view = resolved;
    for (const tab of this.viewTabs) {
      const selected = tab.dataset.checkupView === resolved;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
    if (this.dialog) {
      this.dialog.dataset.view = resolved;
      this.dialog.scrollTop = 0;
    }
    if (openOverview && !this.overviewSection.open) {
      this.overviewSection.open = true;
    } else if (resolved === 'report' && this.overviewSection.open) {
      this.refreshOverviewAccounts();
      this.activateOverview();
    }
    if (focus && resolved === 'report' && this.latestReport) this.reportBox?.focus({ preventScroll: true });
  }

  bindEvents() {
    if (this.button) {
      this.button.hidden = !this.allowed();
      this.button.onclick = () => this.open();
    }
    for (const [index, tab] of this.viewTabs.entries()) {
      tab.onclick = () => this.setView(tab.dataset.checkupView);
      tab.onkeydown = event => {
        const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (!delta) return;
        event.preventDefault();
        const target = this.viewTabs[(index + delta + this.viewTabs.length) % this.viewTabs.length];
        this.setView(target.dataset.checkupView);
        target.focus();
      };
    }
    const replayBack = document.getElementById('btn-checkup-replay-back');
    if (replayBack) replayBack.onclick = () => this.open();
    if (this.overviewSection) {
      this.overviewSection.addEventListener('toggle', () => {
        if (!this.overviewSection.open || this.view !== 'report' || !this.dialog.open || this.busy) return;
        this.refreshOverviewAccounts();
        this.activateOverview();
      });
    }
    if (this.overviewButton) this.overviewButton.onclick = () => this.loadOverview();
    if (this.overviewAccount) this.overviewAccount.onchange = () => this.activateOverview();
    if (this.closeBtn) this.closeBtn.onclick = () => this.requestStop({ close: true });
    if (this.profileSelect) this.profileSelect.onchange = () => this.switchProfile(this.profileSelect.value);
    if (this.newProfileBtn) this.newProfileBtn.onclick = () => this.changeProfile(() => this.app.studyProfiles.createProfile());
    document.getElementById('btn-checkup-continue')?.addEventListener('click', () => this.stopDialog.close());
    document.getElementById('btn-checkup-stop-confirm')?.addEventListener('click', () => {
      const close = this.closeAfterConfirmation;
      this.stopDialog.close();
      this.closeWhenStopped = close;
      this.cancelRun();
    });
    if (this.btnSaveAccount) {
      this.btnSaveAccount.onclick = () => this.updateAccount(this.source, this.usernameInput.value);
    }
    if (this.dialog) {
      this.dialog.addEventListener('click', event => {
        const more = this.reportTools?.querySelector('.checkup-report-more[open]');
        if (more && !more.contains(event.target)) more.open = false;
        if (event.target === this.dialog) {
          const rect = this.dialog.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            if (!this.running) this.close();
          }
        }
      });
      this.dialog.addEventListener('cancel', event => {
        event.preventDefault();
        this.requestStop({ close: true });
      });
      this.dialog.addEventListener('close', () => {
        this.lastRunReportId = null;
        if (this.share.dialog.open) this.share.dialog.close();
        this.overviewController?.abort();
        this.overviewController = null;
        this.overviewPendingKey = null;
        if (this.updatingProfile && this.app.studyProfiles?.editor.open) this.app.studyProfiles.editor.close();
        if (this.stopDialog?.open) this.stopDialog.close();
        this.openGeneration++;
        this.fileReadGeneration++;
        this.cancelRun();
        this.button?.focus({ preventScroll: true });
      });
      this.dialog.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      });
      this.dialog.addEventListener('drop', async event => {
        event.preventDefault();
        event.stopPropagation();
        const files = [...(event.dataTransfer?.files || [])];
        if (files.length) {
          await this.readFilesForBatch(files, { autoPrepare: true });
          return;
        }
        const text = event.dataTransfer?.getData('text');
        if (text) await this.receiveDroppedPgn(text);
      });
    }
    for (const tab of this.sourceTabs) {
      tab.onclick = () => {
        const source = tab.dataset.checkupSource;
        if (this.busy || source === this.source) return;
        this.source = source;
        this.pendingBatch = null;
        if (this.usernameInput) {
          this.usernameInput.value = this.suggestUsername(this.app.mistakeBank?.activeProfile);
        }
        this.setStatus('');
        this.applyHistoryContext();
        this.renderSourceControls();
        this.renderReport(this.latestReport);
      };
    }
    if (this.usernameInput) {
      this.usernameInput.oninput = () => {
        this.setStatus('');
        this.applyHistoryContext();
        this.renderSourceControls();
        this.renderReport(this.latestReport);
      };
    }
    if (this.btnSelectFiles && this.localFilesInput) {
      this.btnSelectFiles.onclick = () => this.localFilesInput.click();
      this.localFilesInput.onchange = async event => {
        const files = [...(event.target.files || [])];
        this.localFilesInput.value = '';
        if (!files.length) return;
        await this.readFilesForBatch(files, { autoPrepare: this.view === 'report' });
      };
    }
    if (this.btnFetch) this.btnFetch.onclick = () => this.prepareBatch();
    if (this.btnStart) this.btnStart.onclick = () => this.startRun();
    if (this.btnCancelRun) this.btnCancelRun.onclick = () => this.requestStop();
  }

  async readFilesForBatch(files, { autoPrepare = false } = {}) {
    if (this.busy || !this.allowed() || !files?.length) return;
    const generation = this.openGeneration;
    const readToken = ++this.fileReadGeneration;
    const profileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    const texts = await Promise.all([...files].slice(0, MAX_LOCAL_GAMES).map(file => file.text()));
    const currentProfileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    if (readToken !== this.fileReadGeneration || generation !== this.openGeneration || profileId !== currentProfileId || this.busy || !this.allowed()) {
      return;
    }
    this.source = 'local';
    this.pendingBatch = null;
    if (this.localPgnInput) this.localPgnInput.value = texts.join('\n\n').trim();
    this.setView('settings');
    this.renderSourceControls();
    if (autoPrepare) {
      await this.prepareBatch();
      if (this.dialog.open && this.view === 'settings' && this.pendingBatch) this.confirmNameInput?.focus();
    }
  }

  async receiveDroppedPgn(text) {
    if (this.busy || !this.allowed()) return;
    this.fileReadGeneration++;
    this.source = 'local';
    this.pendingBatch = null;
    if (this.localPgnInput) this.localPgnInput.value = String(text || '').trim();
    this.setView('settings');
    this.renderSourceControls();
    await this.prepareBatch();
  }

  async open({ account, view } = {}) {
    if (!this.allowed() || !this.dialog || this.running || this.fetching) return;
    const generation = ++this.openGeneration;
    const epoch = this.app.gameEpoch;
    this.fileReadGeneration++;
    const bank = this.app.mistakeBank;
    await bank?.ready;
    if (!this.dialog.open) await bank?.refreshState();
    if (generation !== this.openGeneration || epoch !== this.app.gameEpoch || !this.allowed()) return;
    const profile = bank?.activeProfile;
    const profileId = profile?.id || 'default';
    const gameChanged = this.gameContext !== this.app.checkupGame;
    const profileChanged = this.activeProfileId !== profileId;
    if (gameChanged || profileChanged) {
      this.lastRunReportId = null;
      this.fitSpeedSelection = null;
      this.latestReport = null;
      this.pendingBatch = null;
      this.setStatus('');
      if (profileChanged && this.localPgnInput) this.localPgnInput.value = '';
      if (this.screenEloSelect) this.screenEloSelect.value = '';
      if (this.fitMethodSelect) this.fitMethodSelect.value = 'standard';
      if (this.confirmNameInput) this.confirmNameInput.value = '';
      this.gameContext = this.app.checkupGame;
      this.source = this.gameContext?.platform || profile?.accounts?.[0]?.platform || 'lichess';
      if (this.usernameInput) this.usernameInput.value = this.suggestUsername(profile);
    }
    if (account && profile?.accounts?.some(item => accountKey(item) === accountKey(account))) {
      this.source = account.platform;
      this.usernameInput.value = account.username;
    }
    this.activeProfileId = profileId;
    if (this.pendingBatch && this.pendingBatch.profileId !== profileId) {
      this.pendingBatch = null;
    }
    const loadedHistory = profile ? await this.app.mistakeBank.store.listCheckups(profile.id) : [];
    const currentProfileId = this.app.mistakeBank?.activeProfile?.id || 'default';
    if (generation !== this.openGeneration || epoch !== this.app.gameEpoch || currentProfileId !== profileId || !this.allowed()) return;
    this.history = loadedHistory;
    this.reportScope = 'rolling';
    const replay = this.replayReturn;
    const canReturn = !account && !view && replay?.epoch === epoch && replay.profileId === profileId;
    const returnReport = canReturn ? loadedHistory.find(item => item.id === replay.reportId) : null;
    const returnOverview = canReturn && replay.overview && this.overviewCache.has(replay.overview.key);
    if (returnReport) {
      this.source = checkupSourceType(returnReport.sourceLabel);
      if (this.usernameInput) this.usernameInput.value = returnReport.playerName;
    }
    this.applyHistoryContext();
    if (returnReport) {
      this.latestReport = returnReport;
      this.reportScope = replay.scope;
      this.fitSpeedSelection = replay.fitSpeedSelection;
    }
    this.renderAccounts();
    this.renderSourceControls();
    this.renderReport(this.latestReport);
    if (returnReport && replay.expanded && this.reportBox) {
      for (const details of this.reportBox.querySelectorAll('[data-report-section]')) {
        details.open = replay.expanded.includes(details.dataset.reportSection);
      }
    }
    const opening = !this.dialog.open;
    if (opening) {
      if (this.overviewSection && !returnOverview && view !== 'overview') this.overviewSection.open = false;
      this.dialog.showModal();
    }
    if (view) {
      this.setView(view);
    } else if (returnOverview) {
      this.overviewRestore = replay.overview;
      this.setView('overview');
    } else if (opening) {
      this.setView(!account && (this.latestReport || this.fallbackReport) ? 'report' : 'settings', !!this.latestReport && !account);
    } else if (returnReport) {
      this.setView('report', true);
    } else {
      this.setView(this.view);
    }
    this.syncReplayBanner();
    this.app.checkupReminders?.refresh();
  }

  switchProfile(id) {
    if (id === this.activeProfileId) return;
    return this.changeProfile(() => this.app.mistakeBank.selectProfile(id));
  }

  async changeProfile(operation, account) {
    if (this.busy || !this.allowed() || !this.dialog?.open) return;
    const generation = ++this.openGeneration;
    this.updatingProfile = true;
    this.renderSourceControls();
    this.renderReport(null);
    try {
      await operation();
      if (generation === this.openGeneration && this.dialog.open) await this.open({ account });
    } catch {
      if (generation === this.openGeneration) {
        this.renderAccounts();
        this.setStatus(t('checkupAccountError'));
      }
    } finally {
      this.updatingProfile = false;
      this.renderSourceControls();
      this.renderReport(this.latestReport);
      if (this.view === 'report' && this.overviewSection?.open && this.dialog.open) {
        this.refreshOverviewAccounts();
        this.activateOverview();
      }
    }
  }

  async updateAccount(platform, username, { remove = false } = {}) {
    const bank = this.app.mistakeBank;
    const id = this.activeProfileId;
    const account = normalizeAccount(platform, username);
    if (!account || !id || !bank || this.busy || !this.dialog?.open || !this.allowed()) return;
    const generation = this.openGeneration;
    this.updatingProfile = true;
    this.renderSourceControls();
    try {
      if (remove) await bank.updateProfileAccount(id, platform, username, { remove });
      else {
        const report = this.history.find(item => item.id === this.lastRunReportId);
        const reportId = checkupReportMatchesAccount(report, account) ? report.id : null;
        if (!await this.app.studyProfiles.linkAccount(account, { reportId })) return;
      }
      if (generation !== this.openGeneration || !this.allowed()) return;
      if (bank.activeProfile?.id !== id) {
        await this.open({ account });
        return;
      }
      this.renderAccounts();
      const key = remove ? 'checkupAccountRemoved' : 'checkupAccountSaved';
      this.setStatus(t(key, { account: this.accountLabel(account) }));
    } catch {
      if (generation === this.openGeneration) this.setStatus(t('checkupAccountError'));
    } finally {
      this.updatingProfile = false;
      this.renderSourceControls();
    }
  }

  requestStop({ close = false } = {}) {
    if (!this.running) {
      if (close) this.close();
      else this.cancelRun();
      return;
    }
    if (this.cancelled || this.stopDialog.open) return;
    this.closeAfterConfirmation = close;
    this.renderStopMessage();
    this.stopDialog.showModal();
  }

  renderStopMessage() {
    if (!this.stopMessage) return;
    const { completedGames: completed = 0, totalGames: total } = this.progress || {};
    this.stopMessage.textContent = t(total ? 'checkupStopProgress' : 'checkupStopStarting', { completed, total });
  }

  close() {
    if (this.stopDialog?.open) this.stopDialog.close();
    this.openGeneration++;
    this.cancelRun();
    if (this.dialog?.open) this.dialog.close();
  }

  applyHistoryContext() {
    const profile = this.app.mistakeBank?.activeProfile;
    const suggestedPlayer = this.usernameInput ? this.usernameInput.value.trim() : this.suggestUsername(profile);
    const selection = selectCheckupHistory(this.history, {
      source: this.source,
      gameContext: this.gameContext,
      suggestedPlayer
    });
    this.latestReport = selection.primary;
    this.scopedHistory = selection.scopedHistory;
    this.fallbackReport = selection.fallbackReport;
  }

  suggestUsername(profile) {
    if (this.gameContext?.platform === this.source) return suggestCheckupPlayer(this.gameContext, profile);
    const preferred = profile?.accounts?.find(account => account.platform === this.source);
    return preferred?.username || (!this.gameContext && !profile?.accounts?.length ? profile?.aliases?.[0] : '') || '';
  }

  accountLabel(account) {
    return `${formatSourceBadge(account.platform)} · ${account.username}`;
  }

  refreshOverviewAccounts() {
    const profile = this.app.mistakeBank?.activeProfile;
    const selected = this.overviewProfileId === profile?.id ? this.overviewAccount.value : '';
    this.overviewProfileId = profile?.id;
    const current = normalizeAccount(this.source, this.usernameInput?.value);
    const reported = this.latestReport && normalizeAccount(checkupSourceType(this.latestReport.sourceLabel), this.latestReport.playerName);
    const replayKey = this.replayReturn?.profileId === profile?.id && this.replayReturn?.epoch === this.app.gameEpoch
      ? this.replayReturn.overview?.key : null;
    const replayAccount = this.overviewCache.get(replayKey)?.account;
    const candidates = [...(profile?.accounts || []), current, reported, replayAccount].filter(Boolean);
    const unique = new Map(candidates.map(account => [accountKey(account), account]));
    this.overviewAccounts = unique;
    this.overviewAccount.replaceChildren(...[...unique].map(([key, account]) => new Option(this.accountLabel(account), key)));
    if (replayAccount && this.overviewRestore?.key === replayKey) this.overviewAccount.value = accountKey(replayAccount);
    else if (unique.has(selected)) this.overviewAccount.value = selected;
    else if (current || reported) this.overviewAccount.value = accountKey(current || reported);
  }

  overviewKey() {
    const profileId = this.app.mistakeBank?.activeProfile?.id;
    return profileId && this.overviewAccount.value ? JSON.stringify([profileId, this.overviewAccount.value]) : '';
  }

  activateOverview() {
    this.renderOverview();
    const key = this.overviewKey();
    if (key && !this.overviewCache.has(key)) this.loadOverview();
  }

  async loadOverview() {
    const key = this.overviewKey();
    const bank = this.app.mistakeBank;
    const profileId = bank?.activeProfile?.id;
    const account = this.overviewAccounts?.get(this.overviewAccount.value);
    if (!key || !account || this.busy || !this.dialog.open || !this.allowed()) return;
    if (this.overviewPendingKey === key && this.overviewController) return;
    this.overviewController?.abort();
    const controller = this.overviewController = new AbortController();
    this.overviewPendingKey = key;
    const previous = this.overviewCache.get(key);
    const state = previous?.state || { speed: '', side: 'w', expanded: new Set() };
    const current = () => this.overviewController === controller && this.dialog.open && this.allowed() &&
      bank.activeProfile?.id === profileId;
    this.renderOverview();
    try {
      const games = await this.fetchOverviewGames(account, profileId, controller.signal);
      if (!current()) return;
      const speeds = [...new Set(games.map(game => game.meta.timeClass).filter(Boolean))];
      if (state.speed && !speeds.includes(state.speed)) state.speed = '';
      this.saveOverviewCache(key, { games, account, state, speeds });
    } catch (error) {
      if (current() && error?.name !== 'AbortError') {
        this.saveOverviewCache(key, { ...previous, account, state, error: error.message });
      }
    } finally {
      if (this.overviewController === controller) {
        this.overviewController = null;
        this.overviewPendingKey = null;
        if (this.dialog.open && this.view === 'report' && this.overviewSection?.open && this.overviewKey() === key) this.renderOverview();
      }
    }
  }

  async fetchOverviewGames(account, profileId, signal) {
    const options = { max: OVERVIEW_GAME_LIMIT, signal };
    const archived = account.platform === 'lichess'
      ? await fetchLichessRecentGames(account.username, { ...options, clocks: true })
      : await fetchChesscomRecentGames(account.username, options);
    if (signal.aborted) return [];
    const profile = await this.app.mistakeBank.store.get('profiles', profileId);
    if (signal.aborted) return [];
    const reviews = Object.fromEntries(archived.map(game => [
      game.gameId, profile?.checkupReviews?.[`${account.platform}:${game.gameId}`]
    ]));
    return prepareCheckupOverview(archived, account.username, reviews);
  }

  saveOverviewCache(key, entry) {
    this.overviewCache.delete(key);
    this.overviewCache.set(key, entry);
    if (this.overviewCache.size > 12) this.overviewCache.delete(this.overviewCache.keys().next().value);
  }

  renderOverview() {
    const key = this.overviewKey();
    const cached = this.overviewCache.get(key);
    const loading = !!this.overviewController && this.overviewPendingKey === key;
    this.overviewShare.hidden = !cached?.games?.length;
    this.overviewShare.title = t('checkupShareProfile');
    this.overviewShare.onclick = () => {
      if (this.overviewKey() !== key || !cached?.games?.length) return;
      const { speed } = cached.state;
      const overview = overviewCardData(cached.games, cached.account, speed, speed ? this.speedLabel(speed) : t('checkupAllSpeeds'));
      this.share.open(checkupCardData({ overview }));
    };
    this.overviewAccount.disabled = !key || this.busy;
    this.renderSourceControls();
    const buttonLabel = t(cached?.games ? 'checkupOverviewRefresh' : cached?.error ? 'checkupOverviewRetry' : 'checkupOverviewLoad');
    this.overviewButton.title = buttonLabel;
    this.overviewButton.dataset.i18nAria = cached?.games ? 'checkupOverviewRefresh' : cached?.error ? 'checkupOverviewRetry' : 'checkupOverviewLoad';
    this.overviewButton.setAttribute('aria-label', buttonLabel);
    this.overviewButton.dataset.loading = String(loading);
    this.overviewBody.setAttribute('aria-busy', String(loading));
    this.overviewStatus.textContent = !key ? t('checkupOverviewNoAccount')
      : loading ? t(cached?.games ? 'checkupOverviewRefreshing' : 'checkupOverviewLoading')
      : cached?.error ? t('checkupFetchFailed', { error: cached.error })
      : !cached ? '' : !cached.games?.length ? t('checkupNoGames') : '';
    this.overviewStatus.hidden = !this.overviewStatus.textContent;
    if (!cached?.games?.length) {
      this.overviewSpeeds.replaceChildren();
      this.overviewSpeeds.hidden = true;
      this.overviewBody.replaceChildren();
      return;
    }
    renderOverviewSpeeds(this.overviewSpeeds, cached.speeds, cached.state, value => this.speedLabel(value), value => {
      cached.state.speed = value;
      cached.state.expanded.clear();
      this.renderOverview();
    });
    const openGame = (game, button) => this.openReplay({
      pgn: game.pgn, white: game.meta.white, black: game.meta.black,
      orientation: game.side === 'w' ? 'white' : 'black', platform: cached.account.platform, gameId: game.gameId
    }, null, {
      profileId: this.activeProfileId,
      overview: {
        key, scrollTop: this.dialog.scrollTop, detail: button.closest('details').dataset.detail,
        matchIndex: [...button.parentElement.children].indexOf(button)
      }
    });
    renderCheckupOverview(this.overviewBody, cached.games, cached.state, { openGame, speedLabel: value => this.speedLabel(value) });
    if (this.overviewRestore?.key === key) {
      const { scrollTop, detail, matchIndex } = this.overviewRestore;
      this.overviewRestore = null;
      const row = [...this.overviewBody.querySelectorAll('details')].find(item => item.dataset.detail === detail);
      if (row) {
        row.open = true;
        row.querySelectorAll('button')[matchIndex]?.focus({ preventScroll: true });
      }
      this.dialog.scrollTop = scrollTop;
    }
  }

  speedLabel(value) {
    if (!value) return t('checkupUnknownSpeed');
    const key = `checkupSpeed_${value}`;
    const label = t(key);
    return label === key ? value : label;
  }

  renderAccounts() {
    const bank = this.app.mistakeBank;
    if (bank) bank.renderProfilePicker(this.profileSelect, this.profileName);
    if (!this.accountList) return;
    const accounts = bank?.activeProfile?.accounts || [];
    this.accountList.hidden = !accounts.length;
    this.accountList.replaceChildren();
    for (const account of accounts) {
      const label = this.accountLabel(account);
      const row = document.createElement('li');
      row.dataset.account = accountKey(account);
      const identity = document.createElement('button');
      identity.type = 'button';
      identity.className = 'checkup-account-identity';
      identity.setAttribute('aria-label', t('checkupSelectAccount', { account: label }));
      identity.setAttribute('aria-pressed', 'false');
      const name = document.createElement('strong');
      name.className = 'checkup-account-name';
      name.textContent = label;
      const selectAccount = () => {
        if (this.busy || !this.allowed()) return false;
        this.source = account.platform;
        this.usernameInput.value = account.username;
        this.pendingBatch = null;
        this.reportScope = 'rolling';
        this.setStatus('');
        this.applyHistoryContext();
        this.renderSourceControls();
        this.renderReport(this.latestReport);
        return true;
      };
      identity.onclick = selectAccount;
      const run = document.createElement('button');
      run.type = 'button';
      run.className = 'btn-header checkup-account-run';
      run.onclick = () => {
        if (!selectAccount()) return;
        const { record, pending } = this.app.checkupReminders?.accountState(account) || {};
        const existingMethod = this.latestReport && (this.latestReport.fitMethod || 'standard');
        this.prepareBatch({ onlyNew: !!(pending?.length || record?.lastDiagnosedAt || this.latestReport),
          fitMethod: existingMethod || undefined });
      };
      const unlink = document.createElement('button');
      unlink.type = 'button';
      unlink.className = 'btn-header';
      unlink.textContent = t('checkupRemoveAccount');
      unlink.setAttribute('aria-label', t('checkupRemoveAccountLabel', { account: label }));
      unlink.onclick = () => this.updateAccount(account.platform, account.username, { remove: true });
      const status = document.createElement('span');
      status.className = 'checkup-account-status';
      status.id = `checkup-account-status-${account.platform}-${account.username.toLowerCase()}`;
      identity.setAttribute('aria-describedby', status.id);
      const ignore = document.createElement('button');
      ignore.type = 'button';
      ignore.className = 'btn-header checkup-ignore';
      ignore.hidden = true;
      ignore.textContent = t('checkupIgnore');
      ignore.setAttribute('aria-label', t('checkupIgnoreAccount', { account: label }));
      ignore.onclick = async () => {
        if (this.busy || !this.allowed()) return;
        ignore.disabled = true;
        try {
          await this.app.checkupReminders?.ignore(account);
        } catch {
          this.setStatus(t('checkupAccountError'));
        } finally {
          ignore.disabled = this.busy;
        }
      };
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn-header checkup-view-report';
      view.textContent = t('checkupViewReport');
      view.setAttribute('aria-label', `${t('checkupViewReport')} · ${label}`);
      view.onclick = () => {
        if (!selectAccount()) return;
        this.setView('report', true);
      };
      identity.append(name, status);
      row.append(identity, run, view, ignore);
      if (accounts.length > 1) {
        const move = document.createElement('button');
        move.type = 'button';
        move.className = 'btn-header';
        move.textContent = t('studyMoveProfile');
        move.setAttribute('aria-label', t('studyMoveAccount', { account: label }));
        move.onclick = () => this.changeProfile(() => this.app.studyProfiles.createProfile({ account, move: true }), account);
        row.append(move);
      }
      row.append(unlink);
      this.accountList.append(row);
    }
    this.renderAccountStatus();
  }

  renderAccountStatus() {
    if (!this.accountList) return;
    const accounts = this.app.mistakeBank?.activeProfile?.accounts || [];
    const states = new Map(accounts.map(account => [
      accountKey(account), { account, ...this.app.checkupReminders?.accountState(account) }
    ]));
    const rows = [...this.accountList.children];
    for (const row of rows) {
      const state = states.get(row.dataset.account);
      if (!state) continue;
      const { account, record, pending } = state;
      const count = pending?.length || 0;
      const status = row.querySelector('.checkup-account-status');
      const checked = record?.checkedAt;
      const report = this.history.find(item => checkupReportMatchesAccount(item, account));
      const diagnosed = Math.max(record?.lastDiagnosedAt || 0, report?.createdAt || 0);
      status.dataset.pending = String(count > 0);
      const recent = diagnosed ? t('checkupLastDiagnosis', { when: formatRelativeTime(diagnosed) }) : '';
      status.textContent = count ? t('checkupAccountPending', { count })
        : checked ? [t('checkupCaughtUp'), recent].filter(Boolean).join(' · ')
        : recent || t('checkupAwaitingCheck');
      row.querySelector('.checkup-ignore').hidden = count === 0;
      row.querySelector('.checkup-view-report').hidden = !report;
      const run = row.querySelector('.checkup-account-run');
      const action = count ? 'checkupRunNew' : diagnosed ? 'checkupFindNew' : 'checkupRunFirst';
      run.textContent = t(action);
      run.classList.add('btn-primary');
      run.setAttribute('aria-label', `${t(action)} · ${this.accountLabel(account)}`);
    }
    const count = row => states.get(row.dataset.account)?.pending?.length || 0;
    const ordered = [...rows].sort((a, b) => Number(count(b) > 0) - Number(count(a) > 0));
    const focused = this.accountList.contains(document.activeElement) ? document.activeElement : null;
    ordered.forEach((row, index) => {
      if (this.accountList.children[index] !== row) this.accountList.insertBefore(row, this.accountList.children[index]);
    });
    const nextFocus = focused?.hidden ? focused.closest('li').querySelector('.checkup-account-identity') : focused;
    if (nextFocus && document.activeElement !== nextFocus) nextFocus.focus({ preventScroll: true });
  }

  renderSourceControls() {
    const busy = this.busy;
    if (this.profileSelect) this.profileSelect.disabled = busy;
    if (this.newProfileBtn) this.newProfileBtn.disabled = busy;
    if (this.screenEloSelect) this.screenEloSelect.disabled = busy;
    if (this.fitMethodSelect) this.fitMethodSelect.disabled = busy;
    if (this.btnCancelRun) {
      this.btnCancelRun.disabled = this.running && this.cancelled;
      this.btnCancelRun.textContent = t(this.running ? 'checkupStop' : 'btnCancel');
    }
    for (const button of this.accountList?.querySelectorAll('button') || []) button.disabled = busy;
    const account = normalizeAccount(this.source, this.usernameInput?.value);
    for (const row of this.accountList?.children || []) {
      const selected = String(!!account && row.dataset.account === accountKey(account));
      row.dataset.selected = selected;
      row.querySelector('.checkup-account-identity').setAttribute('aria-pressed', selected);
    }
    for (const tab of this.sourceTabs) {
      tab.setAttribute('aria-pressed', String(tab.dataset.checkupSource === this.source));
      tab.disabled = busy;
    }
    const isLocal = this.source === 'local';
    if (this.usernameRow) this.usernameRow.hidden = isLocal;
    if (this.localRow) this.localRow.hidden = !isLocal;
    if (this.confirmBox) this.confirmBox.hidden = busy || !this.pendingBatch;
    if (this.progressBox) this.progressBox.hidden = !this.running && !this.fetching;
    if (this.reportBox) this.reportBox.hidden = busy || !this.latestReport;
    if (this.reportEmpty) this.reportEmpty.hidden = busy || !!this.latestReport || !!this.fallbackReport;
    if (this.reportTools) this.reportTools.hidden = busy;
    if (this.overviewSection) this.overviewSection.hidden = busy;
    for (const button of this.reportTools?.querySelectorAll('button') || []) {
      button.disabled = busy || button.hasAttribute('aria-busy');
    }
    if (this.overviewButton) this.overviewButton.disabled = busy || !this.overviewAccount?.value || (!!this.overviewController && this.overviewPendingKey === this.overviewKey());
    if (this.usernameInput) this.usernameInput.disabled = busy;
    if (this.localPgnInput) this.localPgnInput.disabled = busy;
    if (this.btnSelectFiles) this.btnSelectFiles.disabled = busy;
    if (this.btnSaveAccount) {
      const accounts = this.app.mistakeBank?.activeProfile?.accounts || [];
      this.btnSaveAccount.hidden = isLocal;
      this.btnSaveAccount.disabled = busy || !account || accounts.some(item => accountKey(item) === accountKey(account));
      this.btnSaveAccount.textContent = account ? t('checkupSaveNamedAccount', { player: account.username }) : t('checkupSaveAccount');
    }
    if (this.btnFetch) {
      this.btnFetch.disabled = busy;
      const hasReport = account && this.history.some(item => checkupReportMatchesAccount(item, account));
      this.btnFetch.textContent = t(isLocal ? 'checkupParseLocal' : hasReport ? 'checkupRerunWindow' : 'checkupFetchGames');
      this.btnFetch.classList.toggle('btn-primary', isLocal || !hasReport);
    }
    if (this.playerChoices) {
      this.playerChoices.replaceChildren();
      this.playerChoices.hidden = busy || this.gameContext?.platform !== this.source;
      if (!this.playerChoices.hidden) {
        for (const name of new Set([this.gameContext.white, this.gameContext.black].filter(Boolean))) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn-header';
          button.textContent = t('checkupChoosePlayer', { player: name });
          button.onclick = () => {
            this.usernameInput.value = name;
            this.usernameInput.oninput();
            this.usernameInput.focus();
          };
          this.playerChoices.append(button);
        }
        this.playerChoices.hidden = !this.playerChoices.childElementCount;
      }
    }
    this.renderProgress();
  }

  renderProgress() {
    if (!this.progressText || !this.progress) return;
    const { phase, gameIndex, totalGames, analyzedMoves, workDone, completedGames = 0 } = this.progress;
    if (this.progressDetails) this.progressDetails.hidden = !this.running;
    if (this.stopDialog?.open) this.renderStopMessage();
    if (this.eta) {
      let estimate = '';
      if (this.running && phase !== 'cancelling') {
        if (completedGames && completedGames < totalGames) {
          const remaining = Math.max(1, Math.ceil(this.averageGameMs * (totalGames - workDone) / 1000));
          estimate = t('checkupEta', { seconds: remaining });
        } else if (totalGames && !completedGames) {
          estimate = t('checkupEtaAfterFirst', { count: totalGames });
        }
      }
      this.eta.hidden = !estimate;
      if (this.eta.textContent !== estimate) this.eta.textContent = estimate;
    }
    const stockfish = this.app.stockfish?.downloadProgress;
    const maia = this.app.maiaEngine?.status?.maia;
    let label;
    let downloadPercent;
    if (phase === 'stockfish' && Number.isFinite(stockfish?.percent)) {
      downloadPercent = Math.round(stockfish.percent);
      label = t('checkupDownloadingStockfish', { percent: downloadPercent });
    } else if (phase === 'maia' && maia?.stage === 'download') {
      if (Number.isFinite(maia.percent)) downloadPercent = Math.round(maia.percent);
      label = downloadPercent === undefined
        ? t('checkupDownloadingMaiaUnknown') : t('checkupDownloadingMaia', { percent: downloadPercent });
    } else if (phase === 'maia' && maia?.stage === 'preparing') {
      label = t('checkupPreparingMaia');
    } else {
      const key = {
        fetching: 'checkupFetching', stockfish: 'checkupStartingStockfish', maia: 'checkupStartingMaia',
        fitting: 'checkupFitting', analyzing: 'checkupProgress', verifying: 'checkupVerifying', cancelling: 'checkupCancelling'
      }[phase];
      label = t(key, { current: gameIndex, total: totalGames, moves: analyzedMoves });
    }
    if (this.progressText.textContent !== label) this.progressText.textContent = label;
    if (this.progressBar) {
      if (Number.isFinite(workDone)) {
        this.progressBar.max = totalGames;
        this.progressBar.value = workDone;
      } else if (downloadPercent !== undefined) {
        this.progressBar.max = 100;
        this.progressBar.value = downloadPercent;
      } else {
        this.progressBar.removeAttribute('value');
      }
    }
  }

  setStatus(text = '') {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  async prepareBatch({ onlyNew = false, fitMethod = this.fitMethodSelect?.value } = {}) {
    if (this.busy || !this.allowed()) return;
    const generation = this.openGeneration;
    const source = this.source;
    const startProfileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    const controller = this.abortController = new AbortController();
    const current = () => this.abortController === controller && generation === this.openGeneration
      && startProfileId === (this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default') && this.allowed();
    this.setStatus('');
    this.pendingBatch = null;
    try {
      let games = [];
      let sourceLabel = 'local-pgn-batch';
      let suggestedName = '';
      if (source === 'local') {
        const raw = this.localPgnInput?.value?.trim() || '';
        const chunks = splitMultiPgn(raw).slice(0, MAX_LOCAL_GAMES);
        games = chunks
          .map(pgn => ({ pgn, meta: parsePgnMeta(pgn) }))
          .filter(item => FairPlayGuard.verifyConcludedGame(item.pgn).ok);
        const profile = this.app.mistakeBank?.activeProfile;
        suggestedName = detectBatchPlayer(games, profile).suggestedName;
      } else {
        const username = this.usernameInput?.value?.trim() || '';
        if (!username) {
          this.setStatus(t('checkupNeedUsername'));
          return;
        }
        this.fetching = true;
        this.progress = { phase: 'fetching' };
        this.renderSourceControls();
        games = source === 'lichess'
          ? await fetchLichessRecentGames(username, { signal: controller.signal, clocks: true })
          : await fetchChesscomRecentGames(username, { signal: controller.signal });
        sourceLabel = `${source}:${username}`;
        suggestedName = username;
      }

      if (!current()) return;

      if (!games.length) {
        this.setStatus(t('checkupNoGames'));
        this.renderSourceControls();
        return;
      }

      if (source !== 'local') {
        const archives = games;
        const windowIds = archives.map(game => game.gameId);
        let reusedScreen;
        const account = onlyNew && normalizeAccount(source, suggestedName);
        if (account) {
          const state = await this.app.mistakeBank?.store.loadCheckupProfile(startProfileId);
          if (!current()) return;
          if (state) this.history = state.reports;
          const reports = this.history.filter(item => checkupReportMatchesAccount(item, account));
          const evidenceBase = checkupEvidenceBase(this.app.stockfish, this.app.maiaEngine, fitMethod);
          const compatible = reports.find(item => item.evidenceKey?.startsWith(evidenceBase + '|'));
          if (!this.screenEloSelect?.value && compatible) reusedScreen = { elo: compatible.screenElo };
          const record = state?.profile?.checkupReminders?.[accountKey(account)];
          const known = new Set([...(record?.baseline || []), ...(record?.diagnosed || []),
            ...reports.flatMap(report => report.analyzedGameIds || [])]);
          games = games.filter(game => !game.gameId || !known.has(game.gameId));
          if (!games.length) {
            this.applyHistoryContext();
            this.latestReport = reports.find(item => !item.partial) || reports[0] || null;
            if (compatible && this.latestReport?.evidenceKey === compatible.evidenceKey) {
              const rolling = buildCheckupWindow(windowIds, compatible.evidenceKey, reports, Date.now(), archives);
              this.latestReport = { ...this.latestReport, rolling };
              this.latestReport.fitWindow = buildCheckupFitWindow(this.latestReport, reports, windowIds);
              await this.app.mistakeBank.store.put('checkups', this.latestReport);
              if (!current()) return;
              this.history = this.history.map(report => report.id === this.latestReport.id ? this.latestReport : report);
              this.scopedHistory = this.scopedHistory.map(report => report.id === this.latestReport.id ? this.latestReport : report);
            }
            this.fallbackReport = null;
            this.reportScope = 'rolling';
            this.renderReport(this.latestReport);
            this.setView('report', true);
            this.setStatus(t('checkupNoNewGames'));
            return;
          }
        }
        this.fetching = false;
        await this.startRun({ games, sourceLabel, profileId: startProfileId, windowIds, archives, reusedScreen, fitMethod }, suggestedName);
        return;
      }
      this.pendingBatch = { games, sourceLabel, profileId: startProfileId };
      if (this.confirmPrompt) {
        this.confirmPrompt.textContent = t('checkupConfirmPerspective', { count: games.length });
      }
      if (this.confirmNameInput) {
        this.confirmNameInput.value = suggestedName;
      }
      this.setStatus('');
      this.renderSourceControls();
    } catch (err) {
      if (current() && err?.name !== 'AbortError') {
        this.setStatus(t('checkupFetchFailed', { error: err.message }));
      }
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
        this.fetching = false;
        this.renderSourceControls();
      }
    }
  }

  async startRun(batch = this.pendingBatch, targetPlayer = this.confirmNameInput?.value?.trim() || '') {
    if (this.busy || !this.allowed() || !batch) return;
    const activeId = () => this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    if (batch.profileId !== activeId()) return;
    if (!targetPlayer) {
      this.setStatus(t('checkupNeedPlayerName'));
      return;
    }
    this.running = true;
    this.cancelled = false;
    this.closeWhenStopped = false;
    this.analysisStartedAt = null;
    this.averageGameMs = 0;
    const controller = this.runController = new AbortController();
    const runGeneration = ++this.openGeneration;
    const current = () => this.allowed() && runGeneration === this.openGeneration && batch.profileId === activeId();
    this.progress = { phase: 'stockfish' };
    this.renderSourceControls();
    this.setStatus('');
    let restoreReview;
    try {
      restoreReview = this.app.pauseForCheckup?.();
      const report = await runIntuitionCheckup({
        games: batch.games,
        targetPlayer,
        profileId: batch.profileId,
        sourceLabel: batch.sourceLabel,
        elo: Number(this.screenEloSelect?.value) || undefined,
        reusedScreen: batch.reusedScreen,
        fitMethod: batch.fitMethod || this.fitMethodSelect?.value,
        defaultElo: this.app.profileDefaultElo?.() || 1900,
        stockfish: this.app.stockfish,
        maiaEngine: this.app.maiaEngine,
        signal: controller.signal,
        isCancelled: () => this.cancelled || !current(),
        onProgress: progress => {
          if (!current() || this.cancelled) return;
          if (progress.phase === 'analyzing' && this.analysisStartedAt === null) this.analysisStartedAt = performance.now();
          if (progress.completedGames > (this.progress.completedGames || 0)) {
            this.averageGameMs = (performance.now() - this.analysisStartedAt) / progress.completedGames;
          }
          this.progress = progress;
          this.renderProgress();
        }
      });

      if (!current()) return;

      if (report.gameCount > 0) {
        const account = normalizeAccount(checkupSourceType(report.sourceLabel), report.playerName);
        if (account && batch.windowIds?.some(Boolean)) {
          const reports = this.history.filter(item => checkupReportMatchesAccount(item, account));
          report.rolling = buildCheckupWindow(batch.windowIds, report.evidenceKey, [report, ...reports], report.createdAt, batch.archives);
          report.fitWindow = buildCheckupFitWindow(report, reports, batch.windowIds);
        }
        if (!current()) return;
        const savedRecord = report;
        this.reportScope = 'rolling';
        this.history = [savedRecord, ...this.history.filter(item => item.id !== report.id)];
        this.applyHistoryContext();
        if (!this.scopedHistory.some(item => item.id === savedRecord.id)) {
          this.scopedHistory = [savedRecord, ...this.scopedHistory];
        }
        this.latestReport = savedRecord;
        this.fallbackReport = null;
        if (this.app.mistakeBank?.store) {
          await this.app.mistakeBank.store.saveCheckup(savedRecord);
          if (current()) this.lastRunReportId = savedRecord.id;
          await this.app.checkupReminders?.reload(batch.profileId);
          this.app.checkupReminders?.syncBackground();
        }
        if (!current()) return;
        this.renderReport(savedRecord);
        this.setView('report');
        this.setStatus(report.partial ? t('checkupCancelledPartial') : t('checkupDone'));
      } else if (this.cancelled || report.partial) {
        this.setStatus(t('checkupCancelledEmpty'));
      } else {
        this.setStatus(t('checkupNoMatchedSide', { player: targetPlayer }));
      }
    } catch (err) {
      this.closeWhenStopped = false;
      if (current()) this.setStatus(t('checkupRunFailed', { error: err.message }));
    } finally {
      this.runController = null;
      this.running = false;
      if (this.stopDialog?.open) this.stopDialog.close();
      if (this.closeWhenStopped && current()) this.close();
      this.renderSourceControls();
      restoreReview?.();
    }
  }

  cancelRun() {
    this.cancelled = true;
    this.abortController?.abort();
    this.abortController = null;
    if (this.fetching) {
      this.fetching = false;
      this.setStatus(t('checkupFetchCancelled'));
    }
    if (this.running) {
      this.progress = { ...this.progress, phase: 'cancelling' };
      this.runController?.abort();
      this.app.stockfish?.stop?.();
    }
    this.renderSourceControls();
  }

  renderReport(report) {
    if (this.historyHintEl) {
      this.historyHintEl.replaceChildren();
      const showFallback = !report && this.fallbackReport && !this.busy;
      this.historyHintEl.hidden = !showFallback;
      if (showFallback) {
        const item = this.fallbackReport;
        const time = formatRelativeTime(item.createdAt);
        const label = `${item.playerName} (${formatSourceBadge(item.sourceLabel)}${time ? ` · ${time}` : ''})`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-header checkup-history-btn';
        btn.textContent = t('checkupHistoryView', { label });
        btn.onclick = () => {
          this.latestReport = item;
          this.reportScope = 'rolling';
          this.renderReport(item);
        };
        this.historyHintEl.append(btn);
      }
    }

    if (!this.reportBox) return;
    const archivedReport = report;
    report = report ? this.displayedReport(report) : null;
    this.reportBox.replaceChildren();
    this.renderReportTools(archivedReport, report);
    if (this.reportEmpty) this.reportEmpty.hidden = this.busy || !!report || !!this.fallbackReport;
    if (!report) {
      this.reportBox.hidden = true;
      return;
    }
    this.reportBox.hidden = this.busy;

    const summary = document.createElement('div');
    summary.className = 'checkup-summary-card';

    const metaRow = document.createElement('div');
    metaRow.className = 'checkup-report-meta';
    const overview = document.createElement('div');
    overview.className = 'checkup-report-context';
    const rolling = report.rolling && this.reportScope === 'rolling';
    const fit = report.intuition || report;
    const timeClasses = new Set((report.games || []).map(game => game.timeClass || ''));
    const speed = timeClasses.values().next().value;
    const speedLabel = timeClasses.size > 1 ? t('checkupReportMixedSpeed') : speed && this.speedLabel(speed);
    const source = [formatSourceBadge(report.sourceLabel), speedLabel].filter(Boolean).join(' ');
    const coverage = rolling ? (report.isFullWindow ? 'checkupSummaryWindow' : 'checkupSummaryWindowPartial')
      : report.gameCount === 1 ? 'checkupSummaryBatchOne' : 'checkupSummaryBatch';
    const appendMetaChips = (container, parts) => {
      parts.filter(Boolean).forEach((part, index) => {
        const chip = document.createElement('span');
        chip.className = 'checkup-meta-chip';
        chip.textContent = index ? `· ${part}` : part;
        if (index) container.append(' ');
        container.append(chip);
      });
    };
    const title = document.createElement('strong');
    title.className = 'checkup-report-byline';
    appendMetaChips(title, [report.playerName, source, t(coverage, { games: report.gameCount, moves: report.analyzedMoves })]);
    overview.append(title);
    const dateRange = checkupReportDateRange(report.games);
    const fitScope = fit.isFitWindow && fit.fitGameCount !== report.gameCount
      ? checkupFitScope(fit, value => this.speedLabel(value)) : '';
    const extra = [dateRange || formatRelativeTime(report.createdAt), fitScope].filter(Boolean);
    if (extra.length) {
      const context = document.createElement('p');
      context.className = 'checkup-report-context-detail';
      appendMetaChips(context, extra);
      overview.append(context);
    }
    metaRow.append(overview);

    summary.append(metaRow);

    const profile = document.createElement('div');
    profile.className = 'checkup-profile-grid';
    const metrics = document.createElement('dl');
    metrics.className = 'checkup-summary-metrics';
    const score = checkupScoreSummary(report);
    for (const metric of score.metrics) {
      const item = document.createElement('div');
      if (metric.type) item.className = `checkup-summary-${metric.type}`;
      const label = document.createElement('dt');
      label.textContent = metric.label;
      const value = document.createElement('dd');
      value.textContent = metric.value;
      if (metric.detail) {
        const detail = document.createElement('small');
        detail.textContent = metric.detail;
        value.append(detail);
      }
      item.append(label, value);
      metrics.append(item);
    }
    profile.append(renderCheckupFitSummary(fit, value => this.speedLabel(value), {
      playerName: report.playerName,
      gameCount: fit.fitGameCount || report.gameCount
    }));
    if (metrics.children.length) profile.append(metrics);
    summary.append(profile);
    if (score.story || score.clock) {
      const story = document.createElement('p');
      story.className = 'checkup-summary-story';
      story.textContent = [score.story, score.clock && `${t('checkupClockErrorRate')} ${score.clock}`].filter(Boolean).join(' · ');
      summary.append(story);
    }
    const featured = (report.traps || report.topTraps || []).slice(0, 3);
    const highlight = report.highlights?.find(move => move.fenBefore && move.uci);
    const trap = featured.find(move => move.fenBefore);
    const move = highlight || trap;
    const position = checkupPositionView(move, move === trap, report.screenElo);
    if (position) {
      const card = document.createElement('article');
      card.className = 'checkup-key-position';
      const copy = document.createElement('div');
      const heading = document.createElement('h3');
      heading.textContent = position.title;
      const story = document.createElement('p');
      story.textContent = position.story;
      copy.append(heading, story);
      const game = report.games?.[move.gameIndex];
      if (game?.pgn) copy.append(this.reportButton(t('checkupOpenMove'), () => this.openReportGame(report, game, move)));
      card.append(renderCheckupMiniBoard(position.fen, position.played), copy);
      summary.append(card);
    }
    if (report.stability.density == null) {
      const action = this.reportRerunAction(report);
      const note = document.createElement('p');
      note.className = 'checkup-elo-note';
      note.textContent = t(report.stability.missingCoverage ? 'checkupStabilityLegacy' : 'checkupStabilityNotScreened');
      summary.append(note, this.reportButton(t(action.label), action.run));
    }
    this.reportBox.append(summary);

    this.renderReportTraps(report, featured);
    this.renderReportGames(report, archivedReport);
    const details = this.reportDetails(t('checkupStatisticsDetails'), 'checkup-statistics');
    const breakdown = document.createElement('div');
    breakdown.className = 'checkup-breakdown';
    breakdown.append(renderCheckupFit(fit, {
      openMove: (game, move) => this.openReportGame(report, game, move), viewCount: report.gameCount
    }), renderCheckupStability(report));
    details.append(breakdown);
    this.renderHighlights(report, details);
    this.reportBox.append(details);
  }

  reportDetails(label, style = '') {
    const details = document.createElement('details');
    details.className = `checkup-report-details ${style}`;
    details.dataset.reportSection = style;
    const summary = document.createElement('summary');
    summary.textContent = label;
    details.append(summary);
    return details;
  }

  displayedReport(report) {
    const rolling = this.reportScope === 'rolling' ? report.rolling : null;
    const display = rolling ? withCheckupFit({ ...report, ...rolling, fit: rolling.fit,
      highlights: rolling.highlights || [], topTraps: [], isFullWindow: rolling.gameCount === 10 }) : withCheckupFit(report);
    const reviews = this.app.mistakeBank?.activeProfile?.id === report.profileId
      ? this.app.mistakeBank.activeProfile.checkupReviews : undefined;
    const stability = checkupReportStability(display, reviews);
    if (!rolling) return { ...display, stability };
    const fitWindow = report.fitWindow || buildCheckupFitWindow(report, this.history, rolling.windowIds || []);
    if (!fitWindow.games.length) return { ...display, stability };
    const preferred = this.fitSpeedSelection?.reportId === report.id ? this.fitSpeedSelection.speed : undefined;
    const intuition = checkupFitForSpeed(fitWindow.games, report.fitMethod, preferred);
    return { ...display, intuition: { ...intuition, isFitWindow: true }, stability };
  }

  reportRerunAction(report) {
    const platform = checkupSourceType(report.sourceLabel);
    const account = normalizeAccount(platform, report.playerName);
    const online = checkupReportMatchesAccount(report, account);
    const target = normalizeAlias(report.playerName);
    const games = platform === 'local' && target ? (report.games || []).flatMap(({ pgn }) => {
      if (typeof pgn !== 'string' || !FairPlayGuard.verifyConcludedGame(pgn).ok) return [];
      const meta = parsePgnMeta(pgn);
      return [meta.white, meta.black].some(name => normalizeAlias(name) === target) ? [{ pgn, meta }] : [];
    }) : [];
    const saved = games.length > 0 && games.length === report.gameCount && games.length <= MAX_LOCAL_GAMES;

    return {
      label: online ? 'checkupRerunWindow' : saved ? 'checkupRerunSaved' : 'checkupRerunImport',
      run: () => {
        if (this.busy || !this.allowed() || !this.dialog.open || this.latestReport?.id !== report.id ||
            this.app.mistakeBank?.activeProfile?.id !== report.profileId) return;
        const fitMethod = report.fitMethod || 'standard';
        if (this.fitMethodSelect) this.fitMethodSelect.value = fitMethod;
        if (this.screenEloSelect) this.screenEloSelect.value = report.screenEloSource === 'manual' &&
          CHECKUP_ELOS.includes(report.screenElo) ? String(report.screenElo) : '';
        if (!online && !saved) {
          this.localFilesInput?.click();
          return;
        }
        this.pendingBatch = null;
        this.dialog.scrollTop = 0;
        if (online) {
          this.source = account.platform;
          this.usernameInput.value = account.username;
          return this.prepareBatch({ onlyNew: false, fitMethod });
        }
        this.source = 'local';
        return this.startRun({ games, sourceLabel: 'local-pgn-batch', profileId: report.profileId, fitMethod }, report.playerName);
      }
    };
  }

  renderReportTools(archivedReport, report) {
    if (!this.reportTools) return;
    this.reportTools.replaceChildren();
    if (!report) return;
    const account = normalizeAccount(checkupSourceType(report.sourceLabel), report.playerName);
    const share = this.reportButton(t('checkupShareDiagnosis'), () => {
      if (this.busy || !this.dialog.open || !this.allowed() ||
        this.app.mistakeBank?.activeProfile?.id !== report.profileId) return;
      const traps = report.traps || report.topTraps || [];
      let challenge;
      for (const trap of traps) {
        challenge = this.reportChallenge(report, trap);
        if (challenge) break;
      }
      this.share.open(checkupCardData({ report, speedLabel: value => this.speedLabel(value), challenge }));
    }, 'btn-primary');
    share.disabled = this.busy;
    this.reportTools.append(share);

    const menu = this.reportDetails(t('checkupReportMore'), 'checkup-report-more');
    const controls = document.createElement('div');
    controls.className = 'checkup-more-controls';
    if (account && report.stability.density != null) {
      const update = this.reportButton(t('checkupFindNew'), () => {
        if (this.busy || !this.allowed()) return;
        this.source = account.platform;
        this.usernameInput.value = account.username;
        this.prepareBatch({ onlyNew: true, fitMethod: report.fitMethod || 'standard' });
      });
      update.disabled = this.busy;
      controls.append(update);
    }
    if (archivedReport.rolling) {
      const view = document.createElement('select');
      view.className = 'btn-header';
      view.add(new Option(t('checkupWindowScope'), 'rolling'));
      view.add(new Option(t('checkupBatchScope', { count: archivedReport.gameCount }), 'batch'));
      view.value = this.reportScope;
      view.onchange = () => {
        this.reportScope = view.value;
        this.renderReport(archivedReport);
        this.focusReportOption('.checkup-scope-select');
      };
      view.classList.add('checkup-scope-select');
      controls.append(this.reportOption(t('checkupReportScope'), view));
    }
    const fit = report.intuition || report;
    if (fit.speeds?.length > 1) {
      const mode = document.createElement('select');
      mode.className = 'btn-header checkup-fit-speed';
      for (const value of fit.speeds) mode.add(new Option(this.speedLabel(value), value));
      mode.value = fit.speed;
      mode.onchange = () => {
        this.fitSpeedSelection = { reportId: report.id, speed: mode.value };
        this.renderReport(archivedReport);
        this.focusReportOption('.checkup-fit-speed');
      };
      controls.append(this.reportOption(t('checkupFitSpeed'), mode));
    }
    const switcherList = this.scopedHistory.length > 1 ? this.scopedHistory : this.history;
    if (switcherList.length > 1) {
      const select = document.createElement('select');
      select.className = 'btn-header';
      select.setAttribute('aria-label', t('checkupHistorySelect'));
      for (const item of switcherList.slice(0, 8)) {
        const opt = document.createElement('option');
        opt.value = item.id;
        const rel = formatRelativeTime(item.createdAt);
        const scope = item.rolling ? (item.rolling.gameCount === 10 ? t('checkupHistoryRecentWindow')
          : t('checkupWindowCoverage', { count: item.rolling.gameCount })) : t(item.gameCount === 1 ? 'checkupHistoryOne' : 'checkupBatchScope', { count: item.gameCount });
        const samePlayer = normalizeAlias(item.playerName) === normalizeAlias(report.playerName);
        const sameSource = checkupSourceType(item.sourceLabel) === checkupSourceType(report.sourceLabel);
        opt.textContent = [!samePlayer && item.playerName, !sameSource && formatSourceBadge(item.sourceLabel), scope, rel]
          .filter(Boolean).join(' · ');
        opt.title = [item.playerName, formatSourceBadge(item.sourceLabel), scope, rel].filter(Boolean).join(' · ');
        if (item.id === report.id) opt.selected = true;
        select.append(opt);
      }
      select.onchange = () => {
        const picked = switcherList.find(item => item.id === select.value);
        if (picked) {
          this.latestReport = picked;
          this.reportScope = 'rolling';
          this.renderReport(picked);
          this.reportTools.querySelector('summary')?.focus();
        }
      };
      select.classList.add('checkup-history-select');
      controls.append(this.reportOption(t('checkupHistorySelect'), select));
    }
    if (this.app.mistakeBank?.store) {
      controls.append(this.reportButton(t('checkupDeleteReport'), async () => {
        await this.app.mistakeBank.store.deleteCheckup(report.id);
        this.history = this.history.filter(item => item.id !== report.id);
        this.applyHistoryContext();
        this.renderReport(this.latestReport);
      }, 'checkup-delete-action'));
    }
    if (controls.children.length) {
      menu.append(controls);
      this.reportTools.append(menu);
    }
  }

  reportOption(name, select) {
    const label = document.createElement('label');
    label.append(name, select);
    return label;
  }

  focusReportOption(selector) {
    const field = this.reportTools.querySelector(selector);
    if (!field) return;
    field.closest('details').open = true;
    field.focus({ preventScroll: true });
  }

  reportChallenge(report, trap) {
    const game = report.games?.[trap.gameIndex];
    if (game?.pgn && !FairPlayGuard.verifyConcludedGame(game.pgn).ok) return null;
    return checkupChallengeCard(trap);
  }

  renderHighlights(report, container) {
    if (!report.highlights?.length) return;
    const section = document.createElement('section');
    section.className = 'checkup-insight-section';
    const heading = document.createElement('h3');
    heading.className = 'checkup-report-section-title';
    heading.textContent = t('checkupHighlights');
    section.append(heading);
    const cards = document.createElement('div');
    cards.className = 'checkup-highlight-grid';
    for (const move of report.highlights) {
      const game = report.games?.[move.gameIndex];
      const article = document.createElement('article');
      article.className = 'checkup-highlight-card';
      article.dataset.kind = move.kind;
      const label = document.createElement('small');
      label.textContent = t(`checkupHighlight_${move.kind}`);
      const san = document.createElement('strong');
      san.textContent = `${move.moveNumber}${move.turn === 'w' ? '. ' : '… '}${move.san}`;
      const why = document.createElement('p');
      const evidence = move.evidence;
      why.textContent = evidence ? t('checkupHighlightWhy', {
        elo: report.screenElo, played: (evidence.probability * 100).toFixed(1),
        expected: (evidence.maiaProbability * 100).toFixed(1), alternative: evidence.alternative,
        advantage: evidence.advantage.toFixed(1)
      }) : t('checkupHighlightVerified');
      article.append(label, san, why);
      if (game?.pgn) article.append(this.reportButton(t('checkupOpenMove'), () => this.openReportGame(report, game, move), 'checkup-review-move'));
      cards.append(article);
    }
    section.append(cards);
    container.append(section);
  }

  renderTrends(report, container) {
    if (!report.rolling || !report.evidenceKey) return;
    const account = normalizeAccount(checkupSourceType(report.sourceLabel), report.playerName);
    const history = this.history.filter(item => checkupReportMatchesAccount(item, account));
    if (checkupTrend(history, report.evidenceKey).length < 2) return;
    const section = document.createElement('section');
    section.className = 'checkup-insight-section';
    const title = document.createElement('h3');
    title.className = 'checkup-report-section-title';
    title.textContent = t('checkupTrendTitle');
    const mode = document.createElement('select');
    mode.className = 'btn-header';
    mode.setAttribute('aria-label', t('checkupTimeClass'));
    const classes = [...new Set(history.flatMap(item => (item.rolling?.games || []).map(game => game.timeClass)).filter(Boolean))];
    mode.add(new Option(t('checkupAllSpeeds'), ''));
    for (const value of classes) mode.add(new Option(this.speedLabel(value), value));
    const charts = document.createElement('div');
    charts.className = 'checkup-charts';
    const update = () => {
      charts.replaceChildren();
      const points = checkupTrend(history, report.evidenceKey, mode.value);
      if (points.length < 2) {
        charts.textContent = t('checkupTrendFew');
        return;
      }
      for (const [metric, label] of [['elo', 'checkupTrendElo'], ['density', 'checkupTrendDensity']]) {
        charts.append(this.renderTrendChart(points, metric, t(label), report.fitMethod));
      }
    };
    mode.onchange = update;
    section.append(title, mode, charts);
    update();
    container.append(section);
  }

  renderTrendChart(points, metric, title, fitMethod) {
    const bands = checkupFitBands(fitMethod);
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = title;
    figure.append(caption);
    const valid = points.filter(point => Number.isFinite(point[metric]));
    if (!valid.length) {
      figure.append(document.createTextNode(t('checkupTrendFew')));
      return figure;
    }
    const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chart.setAttribute('viewBox', '0 0 300 84');
    chart.setAttribute('role', 'img');
    const format = value => metric === 'density' ? value.toFixed(1) : String(value);
    chart.setAttribute('aria-label', `${title} · ${valid.map(point => `${format(point[metric])} (${t('checkupWindowCoverage', { count: point.count })})`).join(' / ')}`);
    const elo = metric === 'elo';
    const lo = elo ? bands[0] : 0;
    const hi = elo ? bands.at(-1) : Math.max(1, Math.ceil(Math.max(...valid.map(point => point.density))));
    const yFor = value => 75 - 48 * (value - lo) / (hi - lo);
    const svg = (name, attrs, content = '') => {
      const node = document.createElementNS(chart.namespaceURI, name);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      node.textContent = content;
      return node;
    };
    for (const tick of elo ? bands : [0, hi / 2, hi]) {
      const y = yFor(tick);
      chart.append(svg('line', { x1: 31, x2: 294, y1: y, y2: y, class: 'checkup-chart-guide' }),
        svg('text', { x: 25, y, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, String(tick)));
    }
    let path = '';
    let previous = false;
    const markers = [];
    for (const [i, point] of points.entries()) {
      if (!Number.isFinite(point[metric])) {
        previous = false;
        continue;
      }
      const x = 44 + i * 239 / (points.length - 1);
      const y = yFor(point[metric]);
      path += `${previous ? 'L' : 'M'}${x} ${y} `;
      previous = true;
      const dot = svg('circle', { cx: x, cy: y, r: 3 });
      dot.append(svg('title', {}, `${new Date(point.time).toLocaleDateString()} · ${format(point[metric])} · ${t('checkupWindowCoverage', { count: point.count })}`));
      markers.push(dot);
      if (point === valid[0] || (point === valid.at(-1))) {
        const leading = x < 65;
        const trailing = x > 264;
        const overlap = valid.length > 1 && points.indexOf(valid.at(-1)) - points.indexOf(valid[0]) < (points.length - 1) * 0.15;
        const labelY = overlap && point !== valid[0] && y < 61 ? y + 14 : y - 7;
        markers.push(svg('text', { x: leading ? x - 6 : trailing ? x + 6 : x, y: labelY,
          'text-anchor': leading ? 'start' : trailing ? 'end' : 'middle', class: 'checkup-chart-endpoint'
        }, format(point[metric])));
      }
    }
    chart.append(svg('path', { d: path }), ...markers);
    const last = valid.at(-1);
    const note = document.createElement('small');
    note.textContent = t('checkupWindowCoverage', { count: last.count });
    figure.append(chart, note);
    return figure;
  }

  reportButton(label, action, classes = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn-header ${classes}`.trim();
    button.textContent = label;
    button.onclick = action;
    return button;
  }

  async saveReportTraps(report, traps, { practice = false } = {}) {
    const bank = this.app.mistakeBank;
    const profileId = bank?.activeProfile?.id;
    const generation = this.openGeneration;
    const current = () => this.allowed() && !this.busy && this.dialog?.open &&
      this.openGeneration === generation && bank?.activeProfile?.id === profileId;
    if (!bank || !profileId || !current() || this.savingTraps || (report.profileId && report.profileId !== profileId)) return;
    this.savingTraps = true;
    try {
      let added = 0;
      const queue = [];
      for (const trap of traps) {
        if (!current()) return;
        const scoped = { ...trap, profileId, id: trapId(profileId, trap.fenBefore, trap.playedUci || trap.uci) };
        const saved = await bank.store.upsertTrap(scoped);
        if (saved?.record) queue.push(saved.record);
        if (saved?.added) added++;
      }
      await bank.refreshState();
      if (!current()) return;
      if (practice && queue.length) {
        this.close();
        await bank.startPracticeQueue(queue);
      } else {
        this.app.showToast?.(t('bankSavedBatchToast', { count: added }));
      }
    } catch {
      if (current()) this.setStatus(t('checkupTrapSaveError'));
    } finally {
      this.savingTraps = false;
    }
  }

  openReportGame(report, game, trap) {
    const focusMove = trap ? { ply: trap.ply, uci: trap.playedUci || trap.uci, fenBefore: trap.fenBefore } : null;
    this.openReplay(game, focusMove, {
      reportId: report.id, profileId: report.profileId, scope: this.reportScope, fitSpeedSelection: this.fitSpeedSelection,
      expanded: [...this.reportBox.querySelectorAll('[data-report-section][open]')].map(details => details.dataset.reportSection)
    });
  }

  openReplay(game, focusMove, returnTo) {
    if (this.busy || !this.allowed() || !this.dialog?.open || this.activeProfileId !== returnTo.profileId ||
        this.app.mistakeBank?.activeProfile?.id !== returnTo.profileId) return;
    if (typeof game?.pgn !== 'string' || !FairPlayGuard.verifyConcludedGame(game.pgn).ok) return;
    const opened = this.app.startNewSession({
      pgn: game.pgn, white: game.white, black: game.black, orientation: game.orientation,
      publicGameUrl: checkupReplayUrl(game.platform, game.gameId), checkupSource: game.platform,
      focusMove, autoReview: false
    });
    if (opened) {
      this.replayReturn = { ...returnTo, epoch: this.app.gameEpoch };
      this.syncReplayBanner();
    } else {
      this.setStatus(t('checkupReplayUnavailable'));
    }
  }

  renderTrapRows(report, traps, compact = false) {
    const list = document.createElement('div');
    list.className = 'checkup-top-traps';
    for (const trap of traps) {
      const row = document.createElement('div');
      row.className = 'checkup-trap-row';
      const main = document.createElement('div');
      main.className = 'checkup-trap-main';
      const title = document.createElement('strong');
      title.textContent = `${trap.moveNumber}${trap.turn === 'w' ? '. ' : '… '}${trap.playedSan} → ${trap.bestSan}`;
      const opponent = [trap.source?.white, trap.source?.black].find(name => name && normalizeAlias(name) !== normalizeAlias(report.playerName));
      const detail = document.createElement('small');
      const repeats = trap.occurrences?.length || 0;
      detail.textContent = [
        t(`bankPhase_${trap.phase || 'middlegame'}`),
        t('checkupTrapLoss', { loss: (trap.eslLoss || 0).toFixed(1) }),
        !compact && opponent && t('checkupTrapOpponent', { opponent }),
        !compact && trap.source?.date, !compact && repeats > 1 && t('checkupTrapRepeats', { count: repeats })
      ].filter(Boolean).join(' · ');
      main.append(title, detail);
      const topics = checkupTrapTopics(trap);
      if (!compact && topics.length) {
        const labels = document.createElement('small');
        labels.className = 'checkup-trap-topics';
        labels.textContent = topics.map(topic => t(`checkupTopic_${topic}`)).join(' · ');
        main.append(labels);
      }
      row.append(main);
      const actions = document.createElement('div');
      actions.className = 'checkup-trap-actions';
      const game = report.games?.[trap.gameIndex];
      if (game?.pgn) {
        const jump = this.reportButton(t('checkupOpenMove'), () => this.openReportGame(report, game, trap), 'checkup-trap-practice-btn');
        jump.setAttribute('aria-label', `${jump.textContent} · ${title.textContent}`);
        actions.append(jump);
      }
      const challenge = compact ? null : this.reportChallenge(report, trap);
      if (challenge) actions.append(this.reportButton(t('challengeShare'), () => {
        this.share.open(challenge);
      }, 'checkup-trap-practice-btn'));
      if (!compact || !game?.pgn) actions.append(this.reportButton(t('checkupTrapPracticeOne'),
        () => this.saveReportTraps(report, [trap], { practice: true }), 'checkup-trap-practice-btn'));
      row.append(actions);
      list.append(row);
    }
    return list;
  }

  renderReportTraps(report, featured) {
    const traps = report.traps || report.topTraps || [];
    if (!featured.length) return;
    const section = document.createElement('section');
    section.className = 'checkup-featured-traps';
    section.setAttribute('aria-labelledby', 'checkup-featured-title');
    const header = document.createElement('div');
    header.className = 'checkup-featured-header';
    const title = document.createElement('h3');
    title.id = 'checkup-featured-title';
    title.textContent = t('checkupFeaturedTraps');
    header.append(title, this.reportButton(t('checkupPracticeTop', { count: featured.length }),
      () => this.saveReportTraps(report, featured, { practice: true }), 'btn-primary checkup-practice-featured'));
    section.append(header, this.renderTrapRows(report, featured, true));

    const details = this.reportDetails(t('checkupTrapDetails', { count: traps.length }), 'checkup-all-traps');
    details.ontoggle = () => {
      if (!details.open) return;
      details.ontoggle = null;
      details.append(this.renderTrapRows(report, traps));
    };
    const actions = document.createElement('div');
    actions.className = 'checkup-report-actions';
    actions.append(this.reportButton(t('checkupSaveAll', { count: traps.length }),
      () => this.saveReportTraps(report, traps)));
    for (const topic of TRAP_TOPICS) {
      const matching = traps.filter(trap => checkupTrapTopics(trap).includes(topic));
      if (!matching.length) continue;
      actions.append(this.reportButton(t('checkupPracticeTopic', {
        topic: t(`checkupTopic_${topic}`), count: matching.length
      }), () => this.saveReportTraps(report, matching, { practice: true })));
    }
    details.append(actions);
    section.append(details);
    this.reportBox.append(section);
  }

  renderReportGames(report, archivedReport) {
    if (!report.games?.length) return;
    const details = this.reportDetails(t('checkupGamesAndTrends', { count: report.games.length }), 'checkup-games-trends');
    const rows = document.createElement('div');
    rows.className = 'checkup-top-traps';
    for (const game of report.games) {
      const row = document.createElement('div');
      row.className = 'checkup-trap-row';
      const main = document.createElement('div');
      main.className = 'checkup-trap-main';
      const title = document.createElement('strong');
      title.textContent = `${game.white || t('whitePlayer')} – ${game.black || t('blackPlayer')} · ${game.result}`;
      const detail = document.createElement('small');
      detail.textContent = [game.date, t('checkupGameDetails', { moves: game.analyzedMoves, traps: game.trapCount })]
        .filter(Boolean).join(' · ');
      main.append(title, detail);
      row.append(main);
      if (game.pgn) row.append(this.reportButton(t('checkupOpenGame'), () => this.openReportGame(report, game), 'checkup-trap-practice-btn'));
      rows.append(row);
    }
    details.append(rows);
    this.renderTrends(archivedReport, details);
    this.reportBox.append(details);
  }
}
