import {
  CHECKUP_ALARM_MINUTES, CHECKUP_BACKGROUND_KEY, CHECKUP_FAILURE_MS, checkupProbeDue, checkupSubscriptionKey,
  fetchCheckupObservation, hasNewCheckupGames, isCheckupReminderToken, mergeCheckupObservation, mergeCheckupSnapshot, sanitizeCheckupSnapshot
} from './checkup-watch.js';

const ALARM = 'diverge-checkup-archives';
const ALARM_MS = CHECKUP_ALARM_MINUTES * 60_000;
const MESSAGE = 'CHECKUP_BACKGROUND_SYNC';

function allowedSender(sender) {
  if (sender.frameId !== 0 || sender.tab?.incognito) return false;
  try {
    const url = new URL(sender.url);
    return url.origin === 'https://4chess.cc' && /^\/analysis\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function subscriptionsFrom(payload) {
  if (!Array.isArray(payload) || payload.length > 200) throw new Error('Invalid checkup subscriptions');
  const subscriptions = new Map();
  for (const input of payload) {
    const profileId = input?.profileId;
    const platform = input?.platform;
    const username = typeof input?.username === 'string' ? input.username.trim().toLowerCase() : '';
    if (typeof profileId !== 'string' || !profileId.trim() || profileId.length > 128 ||
      !['lichess', 'chesscom'].includes(platform) || !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(username)) {
      throw new Error('Invalid checkup subscription');
    }
    const account = { profileId, platform, username };
    subscriptions.set(checkupSubscriptionKey(account), { ...account, state: sanitizeCheckupSnapshot(platform, input.state) });
  }
  return [...subscriptions.values()];
}

export function startCheckupReminders(api = chrome, fetchImpl = (...args) => fetch(...args)) {
  let queue = Promise.resolve();
  let polling = false;
  const serial = action => {
    const next = queue.then(action);
    queue = next.catch(() => {});
    return next;
  };
  const read = async () => (await api.storage.local.get(CHECKUP_BACKGROUND_KEY))[CHECKUP_BACKGROUND_KEY] || [];
  const write = data => api.storage.local.set({ [CHECKUP_BACKGROUND_KEY]: data });
  const refreshAction = async subscriptions => {
    const unseen = subscriptions.some(item => hasNewCheckupGames(item.state));
    await api.action.setBadgeText({ text: unseen ? '•' : '' });
    if (unseen) await api.action.setBadgeBackgroundColor({ color: '#cb514f' });
    const title = api.i18n?.getMessage(unseen ? 'checkupBadgeTitle' : 'actionTitle');
    if (title) await api.action.setTitle({ title });
    const alarm = await api.alarms.get(ALARM);
    if (subscriptions.length && !alarm) await api.alarms.create(ALARM, { periodInMinutes: CHECKUP_ALARM_MINUTES });
    if (!subscriptions.length && alarm) await api.alarms.clear(ALARM);
  };
  const restore = () => serial(async () => refreshAction(await read())).catch(console.warn);

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== MESSAGE || !allowedSender(sender)) return;
    if (message.reminder !== undefined) {
      if (!isCheckupReminderToken(message.reminder)) {
        sendResponse({ ok: false });
        return;
      }
      serial(async () => {
        const entry = (await read()).find(item => item.token === message.reminder);
        if (!entry) return { ok: true };
        const { profileId, platform, username } = entry;
        return { ok: true, target: { profileId, platform, username } };
      }).then(sendResponse).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.subscriptions === undefined) {
      sendResponse({ ok: true });
      return;
    }
    serial(async () => {
      const incoming = subscriptionsFrom(message.subscriptions);
      const previous = await read();
      const byKey = new Map(previous.map(item => [checkupSubscriptionKey(item), item]));
      const next = incoming.map(item => {
        const old = byKey.get(checkupSubscriptionKey(item));
        const state = mergeCheckupSnapshot(item.state, old?.state);
        if (old?.state.retryAt && state.checkedAt <= old.state.checkedAt) state.retryAt = old.state.retryAt;
        return {
          ...item,
          token: old?.token || crypto.randomUUID(),
          state
        };
      });
      if (JSON.stringify(next) !== JSON.stringify(previous)) await write(next);
      await refreshAction(next);
      return next.map(({ token, ...item }) => item);
    }).then(subscriptions => sendResponse({ ok: true, subscriptions }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  });

  api.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name !== ALARM || polling) return;
    polling = true;
    try {
      for (const item of await read()) {
        const existing = (await read()).find(entry => entry.token === item.token);
        if (!existing || !checkupProbeDue(existing.state, ALARM_MS)) continue;
        let observation;
        let retryAt = 0;
        try {
          observation = await fetchCheckupObservation(existing, { fetchImpl });
        } catch (error) {
          retryAt = Math.max(Date.now() + CHECKUP_FAILURE_MS, error.retryAt || 0);
        }
        await serial(async () => {
          const subscriptions = await read();
          const current = subscriptions.find(entry => entry.token === item.token);
          if (!current) return;
          if (observation) current.state = mergeCheckupObservation(current.state, observation);
          else if (current.state.checkedAt === existing.state.checkedAt) current.state = { ...current.state, retryAt };
          await write(subscriptions);
          await refreshAction(subscriptions);
        });
      }
    } catch (error) {
      console.warn('[Checkup reminders] Background refresh failed:', error);
    } finally {
      polling = false;
    }
  });
  api.runtime.onInstalled.addListener(restore);
  api.runtime.onStartup.addListener(restore);
  restore();
}
