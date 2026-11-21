import {
  CHECKUP_FAILURE_MS, CHECKUP_REFRESH_MS, checkupProbeDue, fetchCheckupObservation,
  checkupSubscriptionKey, hasNewCheckupGames, mergeCheckupObservation, mergeCheckupSnapshot
} from '../engine/checkup-watch.js?v=20261121-study-reminders';
import { accountKey, normalizeAccount } from './study-store.js?v=20261121-study-reminders';
import { formatRelativeTime } from './checkup-runner.js?v=20261121-study-reminders';
import { t } from './i18n.js?v=20261121-study-reminders';

const STALE_DIAGNOSIS_MS = 7 * 86400_000;

function backgroundRequest(subscriptions) {
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
    window.postMessage({ type: 'DIVERGE_CHECKUP_SYNC', id, subscriptions }, location.origin);
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
    if (!app.checkup.supported) return;
    if (location.origin === 'https://4chess.cc') {
      this.connection = backgroundRequest().then(result => {
        this.extensionAvailable = result?.ok === true;
        this.render();
      });
      this.backgroundToggle.onchange = () => this.setBackground(this.backgroundToggle.checked);
    }
    setInterval(() => { if (!document.hidden) this.refresh(); }, CHECKUP_REFRESH_MS);
  }

  profileChanged() {
    if (this.profile?.id !== this.bank.activeProfile?.id) this.lastDiagnosedAt = 0;
    this.profile = this.bank.activeProfile;
    this.render();
    this.refresh();
  }

  async refresh() {
    const id = this.bank.activeProfile?.id;
    if (!id || !this.app.checkup.allowed()) return;
    const generation = ++this.generation;
    const current = () => generation === this.generation && id === this.bank.activeProfile?.id && this.app.checkup.allowed();
    try {
      await this.syncBackground();
      if (!current()) return;
      const [profile, reports] = await Promise.all([this.bank.store.get('profiles', id), this.bank.store.listCheckups(id)]);
      if (!current()) return;
      this.profile = profile;
      const keys = new Set((profile?.accounts || []).map(accountKey));
      this.lastDiagnosedAt = reports.find(report => {
        const account = normalizeAccount(report.sourceLabel?.split(':')[0], report.playerName);
        return account && keys.has(accountKey(account));
      })?.createdAt || 0;
      this.render();
      if (document.hidden) return;
      let updated = false;
      for (const account of profile?.accounts || []) {
        if (!current() || document.hidden) return;
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

  async setBackground(enabled) {
    const profile = this.profile;
    if (!profile || !this.extensionAvailable || !this.app.checkup.allowed() || this.toggling) return;
    this.toggling = true;
    this.render();
    try {
      const saved = await this.bank.store.setBackgroundCheckup(profile.id, enabled);
      if (this.profile?.id === profile.id && saved) this.profile = saved;
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
      const result = await backgroundRequest(subscriptions);
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
    const records = accounts.map(account => this.profile.checkupReminders?.[accountKey(account)]);
    const hasNew = records.some(hasNewCheckupGames);
    const latest = Math.max(this.lastDiagnosedAt, ...records.map(record => record?.lastDiagnosedAt || 0));
    const lastDiagnosis = latest ? t('checkupLastDiagnosis', { when: formatRelativeTime(latest) }) : '';
    const message = hasNew ? t('checkupNewGames') : lastDiagnosis || t('checkupFirstDiagnosis');
    this.dot.hidden = !hasNew;
    this.note.hidden = !accounts.length;
    this.note.textContent = accounts.length ? message : '';
    if (this.backgroundControl) {
      this.backgroundControl.hidden = !allowed || !this.extensionAvailable || (!accounts.length && !this.profile.backgroundCheckup);
      if (!this.toggling) this.backgroundToggle.checked = allowed && this.profile.backgroundCheckup === true;
      this.backgroundToggle.disabled = this.toggling;
    }
    const title = accounts.length && (hasNew || !latest || Date.now() - latest >= STALE_DIAGNOSIS_MS)
      ? `${t('checkupBtn')} · ${message}` : t('checkupBtn');
    this.button.title = title;
    this.button.setAttribute('aria-label', title);
  }
}
