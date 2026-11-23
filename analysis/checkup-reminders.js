import {
  CHECKUP_FAILURE_MS, CHECKUP_REFRESH_MS, checkupProbeDue, fetchCheckupObservation,
  checkupSubscriptionKey, isCheckupReminderToken, markCheckupGames, mergeCheckupObservation, mergeCheckupSnapshot, pendingCheckupGameIds
} from '../engine/checkup-watch.js?v=20261123-checkup-social';
import { accountKey, checkupReportMatchesAccount, normalizeAccount } from './study-store.js?v=20261123-checkup-social';
import { formatRelativeTime } from './checkup-runner.js?v=20261123-checkup-social';
import { t } from './i18n.js?v=20261123-checkup-social';

const STALE_DIAGNOSIS_MS = 7 * 86400_000;

function backgroundRequest(payload = {}) {
  return new Promise(resolve => {
    const id = crypto.randomUUID();
    const finish = value => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = event => {
      if (event.source === window && event.origin === location.origin &&
        event.data?.type === 'DIVERGE_CHECKUP_SYNC_RESULT' && event.data.id === id) finish(event.data.result);
    };
    const timer = setTimeout(() => finish(null), 1200);
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'DIVERGE_CHECKUP_SYNC', id, ...payload }, location.origin);
  });
}

export class CheckupReminders {
  generation = 0;
  pending = new Map();
  profile = null;
  lastDiagnosedAt = 0;
  extensionAvailable = false;
  backgroundQueue = Promise.resolve();
  toggling = false;

  constructor(app) {
    this.app = app;
    this.bank = app.mistakeBank;
    this.button = app.checkup.button;
    this.dot = document.getElementById('checkup-new-dot');
    this.note = document.getElementById('checkup-reminder-note');
    this.backgroundControl = document.getElementById('checkup-background-control');
    this.backgroundToggle = document.getElementById('checkup-background-toggle');
    this.backgroundTip = document.getElementById('checkup-background-tip');
    this.reminderOffer = document.getElementById('checkup-background-offer');
    this.acceptOffer = document.getElementById('checkup-background-enable');
    this.dismissOffer = document.getElementById('checkup-background-dismiss');
    if (!app.checkup.supported) return;
    if (location.origin === 'https://4chess.cc') {
      this.connection = backgroundRequest().then(result => {
        this.extensionAvailable = result?.ok === true;
        this.render();
      });
      this.backgroundToggle.onchange = () => this.setBackground(this.backgroundToggle.checked);
      this.acceptOffer.onclick = () => this.setBackground(true);
      this.dismissOffer.onclick = () => this.setBackground(false);
    }
    setInterval(() => { if (!document.hidden) this.refresh(); }, CHECKUP_REFRESH_MS);
  }

  profileChanged() {
    if (this.profile?.id !== this.bank.activeProfile?.id) this.lastDiagnosedAt = 0;
    this.profile = this.bank.activeProfile;
    this.render();
    this.refresh();
  }

  offerAfterLink(profile) {
    if (!this.connection || profile.accounts.length !== 1 || profile.backgroundCheckup !== undefined) return;
    this.offerProfileId = profile.id;
    this.render();
  }

  async openFromReminder(token) {
    if (!this.connection || !isCheckupReminderToken(token)) return;
    const { checkup } = this.app;
    const epoch = this.app.gameEpoch;
    const generation = checkup.openGeneration;
    const canOpen = () => checkup.allowed() && this.app.gameEpoch === epoch &&
      checkup.openGeneration === generation && !document.querySelector('dialog[open]');
    await this.bank.ready;
    await this.connection;
    if (!canOpen()) return;
    const result = this.extensionAvailable ? await backgroundRequest({ reminder: token }) : null;
    const target = result?.target;
    const account = normalizeAccount(target?.platform, target?.username);
    const profile = account && await this.bank.store.get('profiles', target.profileId);
    const linked = profile?.accounts?.find(item => accountKey(item) === accountKey(account));
    if (!canOpen()) return;
    if (profile?.backgroundCheckup && linked) {
      if (profile.id !== this.bank.activeProfile?.id) await this.bank.selectProfile(profile.id);
      if (canOpen() && profile.id === this.bank.activeProfile?.id) await checkup.open({ account: linked });
    } else {
      await checkup.open();
    }
  }

  async refresh() {
    const id = this.bank.activeProfile?.id;
    if (!id || !this.app.checkup.allowed()) return;
    const generation = ++this.generation;
    const current = () => generation === this.generation && id === this.bank.activeProfile?.id && this.app.checkup.allowed();
    try {
      const profile = await this.loadProfile(id, current);
      if (!current()) return;
      await this.syncBackground();
      if (!current()) return;
      let updated = false;
      for (const account of profile?.accounts || []) {
        if (!current()) return;
        if (document.hidden) break;
        updated = await this.probe(id, account) || updated;
      }
      if (!current()) return;
      const saved = await this.bank.store.get('profiles', id);
      if (!current()) return;
      this.profile = saved;
      this.render();
      if (updated && saved?.backgroundCheckup) this.syncBackground();
    } catch (error) {
      console.warn('[Checkup reminders] Could not refresh:', error);
    }
  }

  accountState(account) {
    const active = this.bank.activeProfile;
    const profile = this.profile?.id === active?.id ? this.profile : active;
    const record = profile?.checkupReminders?.[accountKey(account)];
    return { record, pending: pendingCheckupGameIds(record) };
  }

  async loadProfile(id, current) {
    const { profile, reports } = await this.bank.store.loadCheckupProfile(id);
    if (!current()) return;
    this.profile = profile;
    this.lastDiagnosedAt = reports.find(report =>
      profile?.accounts?.some(account => checkupReportMatchesAccount(report, account)))?.createdAt || 0;
    this.render();
    return profile;
  }

  async reload(id) {
    if (id !== this.bank.activeProfile?.id || !this.app.checkup.allowed()) return;
    const generation = ++this.generation;
    await this.loadProfile(id, () => generation === this.generation &&
      id === this.bank.activeProfile?.id && this.app.checkup.allowed());
  }

  async ignore(account) {
    const id = this.bank.activeProfile?.id;
    const { pending } = this.accountState(account);
    if (!id || !pending.length || !this.app.checkup.allowed()) return;
    await this.bank.store.updateCheckupReminder(id, account, current => markCheckupGames(current, account.platform, pending));
    await this.reload(id);
    this.syncBackground();
  }

  async recordReview(profileId, game) {
    if (!profileId || !game?.gameId || !this.app.checkup.allowed()) return;
    const profile = await this.bank.store.get('profiles', profileId);
    if (!this.app.checkup.allowed()) return;
    const players = new Set([game.white, game.black].map(name => name?.toLowerCase()).filter(Boolean));
    const matched = profile?.accounts?.filter(account =>
      account.platform === game.platform && players.has(account.username.toLowerCase())) || [];
    const results = await Promise.all(matched.map(account => this.bank.store.updateCheckupReminder(profileId, account,
      current => current.diagnosed?.includes(game.gameId) ? current : markCheckupGames(current, game.platform, [game.gameId]))));
    if (results.some(Boolean)) {
      await this.reload(profileId);
      this.syncBackground();
    }
  }

  async setBackground(enabled) {
    const profile = this.profile;
    if (!profile || !this.extensionAvailable || !this.app.checkup.allowed() || this.toggling) return;
    this.toggling = true;
    this.render();
    try {
      const saved = await this.bank.store.setBackgroundCheckup(profile.id, enabled);
      if (this.profile?.id === profile.id && saved) this.profile = saved;
      if (saved && this.offerProfileId === profile.id) this.offerProfileId = null;
      if (!saved || !await this.syncBackground()) this.app.showToast(t('checkupBackgroundSyncError'));
    } catch {
      this.app.showToast(t('checkupAccountError'));
    } finally {
      this.toggling = false;
      this.render();
      this.refresh();
    }
  }

  syncBackground() {
    if (!this.connection) return Promise.resolve(false);
    const sync = async () => {
      await this.connection;
      if (!this.extensionAvailable) return false;
      const profiles = await this.bank.store.listProfiles();
      const subscriptions = profiles.filter(profile => profile.backgroundCheckup).flatMap(profile =>
        (profile.accounts || []).map(account => ({
          ...account,
          profileId: profile.id,
          state: profile.checkupReminders?.[accountKey(account)]
        }))
      );
      const result = await backgroundRequest({ subscriptions });
      if (!result?.ok || !Array.isArray(result.subscriptions)) return false;
      const original = new Map(subscriptions.map(item => [checkupSubscriptionKey(item), item]));
      for (const item of result.subscriptions) {
        const subscription = item && typeof item.username === 'string' && original.get(checkupSubscriptionKey(item));
        if (!subscription || !item.state) continue;
        await this.bank.store.updateCheckupReminder(subscription.profileId, subscription,
          current => mergeCheckupSnapshot(current, item.state));
      }
      return true;
    };
    this.backgroundQueue = this.backgroundQueue
      .then(() => navigator.locks?.request('diverge-checkup-background', sync) || sync())
      .catch(error => {
        console.warn('[Checkup reminders] Extension sync failed:', error);
        return false;
      });
    return this.backgroundQueue;
  }

  probe(profileId, account) {
    const key = accountKey(account);
    const flight = JSON.stringify([profileId, key]);
    if (this.pending.has(flight)) return this.pending.get(flight);
    const run = async () => {
      if (document.hidden || profileId !== this.bank.activeProfile?.id || !this.app.checkup.allowed()) return;
      const profile = await this.bank.store.get('profiles', profileId);
      if (!profile?.accounts?.some(item => accountKey(item) === key) ||
        !checkupProbeDue(profile.checkupReminders?.[key], CHECKUP_REFRESH_MS)) return;
      let observation;
      const startedAt = Date.now();
      try {
        observation = await fetchCheckupObservation(account);
      } catch (error) {
        await this.bank.store.updateCheckupReminder(profileId, account, previous => previous.checkedAt > startedAt ? previous : ({
          ...previous, retryAt: Math.max(previous.retryAt || 0, Date.now() + CHECKUP_FAILURE_MS, error.retryAt || 0)
        }));
        return;
      }
      await this.bank.store.updateCheckupReminder(profileId, account, previous => mergeCheckupObservation(previous, observation));
      return true;
    };
    const lock = navigator.locks?.request('diverge-checkup-archive', run) || run();
    const pending = lock.finally(() => this.pending.delete(flight));
    this.pending.set(flight, pending);
    return pending;
  }

  render() {
    if (!this.button || !this.dot || !this.note) return;
    const allowed = this.app.checkup.allowed() && this.profile && this.profile.id === this.bank.activeProfile?.id;
    const accounts = allowed ? this.profile.accounts || [] : [];
    const accountsWithState = accounts.map(account => ({ account, ...this.accountState(account) }));
    const pending = accountsWithState.filter(item => item.pending.length);
    const count = pending.reduce((sum, item) => sum + item.pending.length, 0);
    const details = pending.map(({ account, pending }) =>
      `${this.app.checkup.accountLabel(account)} ${t('checkupAccountPending', { count: pending.length })}`).join(' · ');
    const latest = Math.max(this.lastDiagnosedAt, ...accountsWithState.map(item => item.record?.lastDiagnosedAt || 0));
    const lastDiagnosis = latest ? t('checkupLastDiagnosis', { when: formatRelativeTime(latest) }) : '';
    const message = details || lastDiagnosis || t('checkupFirstDiagnosis');
    this.dot.hidden = count === 0;
    this.dot.textContent = count ? String(count) : '';
    this.note.hidden = !accounts.length;
    this.note.textContent = accounts.length ? message : '';
    if (this.backgroundControl) {
      this.backgroundControl.hidden = !allowed || !this.extensionAvailable || (!accounts.length && !this.profile.backgroundCheckup);
      if (!this.toggling) this.backgroundToggle.checked = allowed && this.profile.backgroundCheckup === true;
      this.backgroundToggle.disabled = this.toggling;
    }
    const showOffer = allowed && this.extensionAvailable && accounts.length === 1 &&
      this.offerProfileId === this.profile.id && this.profile.backgroundCheckup === undefined;
    this.reminderOffer.hidden = !showOffer;
    this.backgroundTip.hidden = !showOffer;
    this.acceptOffer.disabled = this.dismissOffer.disabled = this.toggling;
    if (this.app.checkup.dialog?.open) this.app.checkup.renderAccountStatus();
    const title = accounts.length && (count || !latest || Date.now() - latest >= STALE_DIAGNOSIS_MS)
      ? `${t('checkupBtn')} · ${message}` : t('checkupBtn');
    this.button.title = title;
    this.button.setAttribute('aria-label', title);
  }
}
