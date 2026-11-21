(() => {
  if (location.origin !== 'https://4chess.cc' || !/^\/analysis\/?$/.test(location.pathname) || window !== window.top) return;
  window.addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.type !== 'DIVERGE_CHECKUP_SYNC' ||
      typeof message.id !== 'string' || !/^[a-f0-9-]{36}$/.test(message.id)) return;
    let result;
    try {
      result = await chrome.runtime.sendMessage({
        type: 'CHECKUP_BACKGROUND_SYNC', subscriptions: message.subscriptions, reminder: message.reminder
      });
    } catch {
      result = { ok: false };
    }
    window.postMessage({ type: 'DIVERGE_CHECKUP_SYNC_RESULT', id: message.id, result }, location.origin);
  });
})();
