const anchors = [...document.querySelectorAll('[data-live-entry]')];
if (anchors.length && /^https?:$/.test(location.protocol)) {
  let cachedEvent = null;
  const apply = () => {
    if (!cachedEvent?.enabled || !cachedEvent.rounds?.length) return;
    const zh = document.documentElement.lang.toLowerCase().startsWith('zh');
    const title = zh ? cachedEvent.title : cachedEvent.titleEn;
    for (const anchor of anchors) {
      anchor.href = '/live/?lang=' + (zh ? 'zh' : 'en');
      anchor.textContent = title;
      anchor.hidden = false;
    }
  };
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  fetch('/api/live/event?id=wcc2026', { signal: AbortSignal.timeout(4000) })
    .then(response => response.ok ? response.json() : null)
    .then(event => {
      cachedEvent = event;
      apply();
    }).catch(() => {});
}
