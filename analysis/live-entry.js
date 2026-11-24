const anchors = [...document.querySelectorAll('[data-live-entry]')];
if (anchors.length && /^https?:$/.test(location.protocol)) {
  fetch('/api/live/event?id=wcc2026', { signal: AbortSignal.timeout(4000) })
    .then(response => response.ok ? response.json() : null)
    .then(event => {
      if (!event?.enabled || !event.rounds?.length) return;
      const zh = document.documentElement.lang.toLowerCase().startsWith('zh');
      const title = zh ? event.title : event.titleEn;
      for (const anchor of anchors) {
        anchor.href = '/live/?lang=' + (zh ? 'zh' : 'en');
        anchor.textContent = title;
        anchor.hidden = false;
      }
    }).catch(() => {});
}
