// Current component and host-style isolation. Synthetic results do not verify model quality.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer((q, s) => {
  if (q.url === '/fixture') {
    s.setHeader('Content-Type', 'text/html');
    s.end('<!doctype html><html><head><style>button,input,select{font-size:24px;line-height:3;letter-spacing:4px;text-transform:uppercase;min-height:48px;margin:6px}p{margin:22px}</style><link rel="stylesheet" href="/ui/theme.css"><link rel="stylesheet" href="/content/styles.css"></head><body style="background:#ededeb"></body></html>'); return;
  }
  const f = path.join(root, new URL(q.url, 'http://localhost').pathname);
  s.setHeader('Content-Type', f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/plain');
  if (!f.startsWith(root) || !fs.existsSync(f)) { s.writeHead(404); s.end(); return; }
  fs.createReadStream(f).pipe(s);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const screenshots = path.join(root, 'artifacts/floating-layout'); fs.mkdirSync(screenshots, { recursive: true });
try {
  const p = await browser.newPage({ viewport: { width: 1000, height: 900 }, locale: 'en-US' });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  await p.evaluate(async () => {
    const { IntuitionPanel } = await import('/content/intuition-panel.js');
    const panel = window.panel = new IntuitionPanel({});
    await new Promise(r => setTimeout(r, 30)); panel.userPositioned = true;
    panel.setEnginePreferences({ stockfishVariant: 'standard', maiaVariant: '79m' });
    window.result = { isAvailable: true, turn: 'w', moves: [{ uci: 'e2e4', san: 'e4', prob: 59.3, deltaText: '0.00' }, { uci: 'd2d4', san: 'd4', prob: 27, deltaText: '-0.28' }, { uci: 'g1f3', san: 'Nf3', prob: 8.2, deltaText: '-1.30' }], stockfish: { bestMove: { uci: 'e2e4', san: 'e4' }, scoreCp: 32, score: '+0.32' }, comparison: { agreed: true, deltaText: '0.00' }, status: { maia: { state: 'ready', source: 'IndexedDB 缓存' }, stockfish: { state: 'ready' } } };
    panel.update(result, 531);
  });
  for (const theme of ['light', 'dark']) for (const lang of ['zh', 'en']) for (const [width, height] of [[250, 200], [250, 600], [300, 600], [420, 800]]) {
    await p.evaluate(({ theme, lang, width, height }) => {
      panel.open(); panel.userPositioned = true; panel.setLanguage(lang); panel.container.dataset.theme = theme;
      panel.container.style.setProperty('--diverge-panel-width', width + 'px'); panel.container.style.setProperty('--diverge-panel-height', height + 'px');
      panel.setSettings(false); panel.syncPanelSize();
    }, { theme, lang, width, height });
    const panel = p.locator('#maia3-intuition-panel');
    const rect = await panel.boundingBox(); assert.equal(rect.width, width); assert.equal(rect.height, height);
    const overflow = await panel.evaluate(e => [e, ...e.querySelectorAll('.weui-page__bd,.weui-navbar,.weui-cells,.weui-move-main,.weui-sf-mini-row,.weui-drawer-item')].filter(x => x.getBoundingClientRect().height && x.scrollWidth > x.clientWidth + 2).map(x => x.className));
    assert.deepEqual(overflow, [], `${theme}/${lang}/${width} overflow`);
    if (height === 200) {
      assert(await p.locator('#panel-expand').isVisible());
      const visible = await p.locator('#panel-compact-title').evaluate(e => { const r=e.getBoundingClientRect(), b=e.parentElement.getBoundingClientRect(); return r.top>=b.top && r.bottom<=b.bottom; });
      assert(visible, 'A full useful summary must fit, not merely an invisible candidate list');
      assert.match(await p.locator('#panel-compact-title').innerText(), /e4.*59.3%/);
      await panel.screenshot({ path: path.join(screenshots, `${theme}-${lang}-compact.png`) });
    } else {
      assert(await p.locator('#btn-trigger-standalone').isVisible());
      const visible = await p.locator('.weui-move-item').first().evaluate(e => { const r=e.getBoundingClientRect(), b=e.closest('#maia-panel-body').getBoundingClientRect(); return r.top>=b.top && r.bottom<=b.bottom; });
      assert(visible, 'First candidate must be fully readable before scrolling');
      if (width === 300) await panel.screenshot({ path: path.join(screenshots, `${theme}-${lang}-analysis.png`) });
    }
    await p.locator('#weui-btn-more').click();
    await p.locator('#maia-sf-select').scrollIntoViewIfNeeded();
    assert.match(await p.locator('[data-dg-text="sfWebOnly"]').innerText(), /SF19 Lite/);
    await p.locator('[data-model="79m"]').scrollIntoViewIfNeeded();
    if (width === 300) await panel.screenshot({ path: path.join(screenshots, `${theme}-${lang}-settings.png`) });
    const lowContrast = await panel.evaluate(root => {
      const rgb=s=>s.match(/[\d.]+/g)?.map(Number), lum=c=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0), bad=[];
      for(const e of root.querySelectorAll('.weui-insight-box strong,.weui-move-prob,.weui-delta-tag,.weui-cell__ft,.diverge-help,.weui-segment.active,.diverge-model-options small')) {
        if(!e.checkVisibility())continue;const fg=rgb(getComputedStyle(e).color);let parent=e,bg;
        while(parent){bg=rgb(getComputedStyle(parent).backgroundColor);if(bg&&(bg[3]??1)>.99)break;parent=parent.parentElement}
        if(!fg||!bg)continue;const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<4.5)bad.push({text:e.textContent,ratio});
      }
      return bad;
    });
    assert.deepEqual(lowContrast, [], `${theme}/${lang} contrast`);
    // Collapse content preserves its cover; minimize is a distinct operation.
    await p.locator('#panel-collapse').scrollIntoViewIfNeeded(); await p.locator('#panel-collapse').click();
    assert.equal((await panel.boundingBox()).height, height); assert.equal(await p.locator('#cdn-config-drawer').isVisible(), false);
    await p.locator('#maia-restore').scrollIntoViewIfNeeded(); await p.locator('#maia-restore').click();
    await p.locator('#weui-btn-close').click(); assert.equal(await panel.isVisible(), false);
    assert(await p.locator('#maia-wechat-float').isVisible()); await p.locator('#maia-wechat-float').click();
    assert(await panel.isVisible());
  }
  assert.deepEqual(errors, []);
  console.log('PASS 16 floating layouts: readable summary/candidate, no row overflow, contrast, settings, cover collapse and real minimize/restore');
} finally { await browser.close(); server.close(); }
