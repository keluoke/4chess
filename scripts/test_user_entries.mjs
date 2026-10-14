// Actual packaged MV3 runtime on deterministic platform DOM fixtures, plus real guide rendering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'diverge-entries-'));
const extension = path.join(scratch, 'extension'); fs.mkdirSync(extension);
execFileSync(process.execPath, ['scripts/package_extension.mjs'], { cwd: root });
execFileSync('unzip', ['-q', path.join(root, 'releases/diverge-extension-v1.0.8.zip'), '-d', extension]);
for (const file of ['LICENSE', 'LICENSES/GPL-2.0.txt', 'LICENSES/GPL-3.0.txt', 'LICENSES/AGPL-3.0.txt', 'THIRD_PARTY_NOTICES.md', 'guide/index.html']) assert(fs.existsSync(path.join(extension, file)));
assert(!fs.existsSync(path.join(extension, 'engine/stockfish-standard-web.js')));
assert(!fs.existsSync(path.join(extension, 'lib/stockfish-19-standard.js')));
const server = http.createServer((req, res) => {
  let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'application/javascript', '.css':'text/css' })[path.extname(file)] || 'text/plain'); fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const context = await chromium.launchPersistentContext(path.join(scratch, 'profile'), { channel: 'chromium', headless: process.env.HEADFUL !== '1', locale: 'zh-CN', viewport: { width:1440, height:900 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
const screenshots = path.join(root, 'artifacts/user-entries'); fs.mkdirSync(screenshots, { recursive:true });
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  let downloads = 0;
  context.on('request', req => { if (req.url().startsWith('https://weights.4chess.cc')) downloads++; });
  const fixture = '<!doctype html><html><head><style>body{margin:0;background:#eee}wc-chess-board{display:block;position:absolute;left:180px;top:100px;width:600px;height:600px;background:#adbb91}.ad-slot{position:absolute;left:1030px;top:100px;width:300px;height:600px;background:#900;color:white}</style></head><body><wc-chess-board></wc-chess-board><div class="ad-slot">Advertisement</div><div class="clock-running">10:00</div><button aria-label="Resign">Resign</button></body></html>';
  const isolatedHeaders = {'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'};
  await context.route('https://www.chess.com/play/online*', route => route.fulfill({ contentType:'text/html', headers:isolatedHeaders, body:fixture }));
  const page = await context.newPage(); const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://www.chess.com/play/online');
  const panel = page.locator('#maia3-intuition-panel'); await panel.waitFor();
  await page.waitForFunction(() => document.querySelector('#maia-turn-pill')?.textContent.includes('🛡') || document.querySelector('#maia-turn-pill svg'));
  const rect = await panel.boundingBox(); assert.equal(rect.width,300); assert.equal(rect.height,600); assert.equal(rect.x,1030); assert.equal(rect.y,100);
  await page.locator('#weui-btn-close').click(); assert.deepEqual(await panel.boundingBox(), rect); assert.equal(await panel.getAttribute('data-collapsed'),'true');
  await page.screenshot({ path:path.join(screenshots,'locked-collapsed.png') });
  await page.locator('#maia-restore').click(); assert.deepEqual(await panel.boundingBox(),rect);
  await page.locator('#weui-btn-more').click();
  for (const variant of ['23m','79m','5m']) {
    await page.locator(`[data-model="${variant}"]`).click();
    await page.waitForFunction(v => document.querySelector(`[data-model="${v}"]`).classList.contains('active'), variant);
    assert.equal((await worker.evaluate(() => chrome.storage.local.get('maiaVariant'))).maiaVariant,variant);
  }
  assert.equal(downloads,0,'Changing model while live must only save preferences');
  await page.setViewportSize({ width:1200, height:460 });
  const drawer = page.locator('#cdn-config-drawer');
  await drawer.evaluate(el => {el.scrollTop=el.scrollHeight});
  const about = drawer.locator('a[href*="#about"]'); await about.scrollIntoViewIfNeeded();
  const linkRect=await about.boundingBox(), panelRect=await panel.boundingBox();
  assert(linkRect.y>=panelRect.y && linkRect.y+linkRect.height<=panelRect.y+panelRect.height,'Settings footer must be reachable within viewport');
  await page.screenshot({path:path.join(screenshots,'settings-small-zh.png')});
  await drawer.locator('[data-lang="en"]').click();
  assert.match(await page.locator('#maia-turn-pill').innerText(),/Live/);
  assert.match(await page.locator('#model-switch-hint').innerText(),/Saved/);
  await about.scrollIntoViewIfNeeded(); assert.match(await about.innerText(),/About/);
  await page.screenshot({path:path.join(screenshots,'settings-small-en.png')});
  // Verify messaging in the real extension service worker, with the platform tab selected explicitly.
  const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({url:'https://www.chess.com/play/online'}))[0].id);
  await worker.evaluate(async tabId=>chrome.tabs.sendMessage(tabId,{type:'CLOSE_PANEL'}),tabId); await panel.waitFor({state:'hidden'});
  await worker.evaluate(async tabId=>chrome.tabs.sendMessage(tabId,{type:'OPEN_PANEL'}),tabId); await panel.waitFor({state:'visible'});
  // Open the actual action popup if Chrome exposes it to automation.
  let popup, nativePopup=false;
  try {
    const popupPromise=context.waitForEvent('page',{timeout:10000});
    await worker.evaluate(()=>chrome.action.openPopup()); popup=await popupPromise;
    nativePopup=true; console.log('Actual chrome.action popup opened');
  } catch { popup=await context.newPage(); await popup.goto(`chrome-extension://${id}/popup/popup.html`); console.log('Popup tested as extension page; native popup open unavailable'); }
  await popup.locator('#guide-link').waitFor();
  if(nativePopup) {
    await popup.locator('#toggle-panel-switch').uncheck(); await panel.waitFor({state:'hidden'});
    await popup.locator('#toggle-panel-switch').check(); await panel.waitFor({state:'visible'});
  }
  await popup.setViewportSize({width:368,height:600});
  await popup.screenshot({path:path.join(screenshots,'popup-default-zh.png')});
  assert.equal(await popup.locator('#ui-language').inputValue(),'en');
  await popup.locator('#ui-language').selectOption('zh');
  await popup.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  assert.equal(await popup.locator('#guide-link').getAttribute('href'),'https://4chess.cc/guide/?lang=zh');
  await popup.locator('.advanced-settings > summary').click();
  assert.equal(await popup.locator('#model-preset-select option').count(),3);
  await popup.locator('#model-preset-select').selectOption('79m'); await popup.locator('#sf-preset-select').selectOption('standard');
  await popup.waitForFunction(()=>document.querySelector('#studio-link').href.includes('sf=standard') && document.querySelector('#studio-link').href.includes('maia=79m'));
  assert.equal(downloads,0); await popup.screenshot({path:path.join(screenshots,'popup-zh.png')});
  await popup.close();
  const prefs=await worker.evaluate(()=>chrome.storage.local.get(['maiaVariant','stockfishVariant'])); assert.deepEqual(prefs,{maiaVariant:'79m',stockfishVariant:'standard'});
  // Exercise the live -> concluded -> dismissed -> new game lifecycle without a valid FEN.
  await page.evaluate(()=>{document.querySelector('.clock-running').remove();document.querySelector('[aria-label="Resign"]').remove();document.body.insertAdjacentHTML('beforeend','<div class="game-over-modal">White won by checkmate</div><div class="vertical-move-list">1-0</div>')});
  await page.waitForFunction(()=>document.querySelector('#maia3-intuition-panel').dataset.fairPlayLocked==='false');
  await page.evaluate(()=>document.querySelector('.game-over-modal').remove());
  assert.equal(await panel.getAttribute('data-fair-play-locked'),'false');
  await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<div class="clock-running">10:00</div>'));
  await page.waitForFunction(()=>document.querySelector('#maia3-intuition-panel').dataset.fairPlayLocked==='true');
  assert.equal(downloads,0);
  // Synthetic candidate values validate SVG semantics only; no claim of model-quality accuracy.
  await context.route('https://www.chess.com/analysis/entry-fixture',route=>route.fulfill({contentType:'text/html',body:fixture.replace('<div class="clock-running">10:00</div><button aria-label="Resign">Resign</button>','')}));
  const arrowsPage=await context.newPage(); await arrowsPage.goto('https://www.chess.com/analysis/entry-fixture');
  await arrowsPage.locator('#maia3-intuition-panel').waitFor();
  const svgChecks=await arrowsPage.evaluate(async id=>{
    const {HeatmapOverlay}=await import(`chrome-extension://${id}/content/heatmap-overlay.js`);
    const overlay=new HeatmapOverlay(); overlay.attach(document.querySelector('wc-chess-board'));
    const data={turn:'b',isAvailable:true,moves:[{from:'e7',to:'e5',uci:'e7e5',san:'e5',prob:42}],stockfish:{bestMove:{from:'d7',to:'d5',uci:'d7d5',san:'d5'},score:'+0.80'},heatmap:Array(64).fill(.4)};
    overlay.render(data);
    const score=document.querySelector('#maia-sf-arrows-layer').textContent;
    const dash=document.querySelector('#maia-sf-arrows-layer line').getAttribute('stroke-dasharray');
    overlay.setToggles({showArrows:false}); const sfOnly=document.querySelector('#maia-sf-arrows-layer').children.length>0 && document.querySelector('#maia-arrows-layer').children.length===0;
    overlay.setToggles({showStockfishArrows:false}); const neither=document.querySelector('#maia-sf-arrows-layer').children.length===0;
    overlay.setToggles({showArrows:true,showStockfishArrows:true}); data.stockfish.bestMove={...data.moves[0]}; overlay.render(data);
    const consensus=!!document.querySelector('#maia-arrows-layer [marker-end="url(#maia-arrow-consensus)"]');
    document.body.insertAdjacentHTML('beforeend','<div class="clock-running">10:00</div>');overlay.render(data);
    const cleared=[...document.querySelectorAll('#maia3-board-overlay > g')].every(g=>!g.children.length);
    return {score,dash,sfOnly,neither,consensus,cleared};
  },id);
  assert.match(svgChecks.score,/-0.80/); assert.equal(svgChecks.dash,'7 4'); for(const key of ['sfOnly','neither','consensus','cleared']) assert(svgChecks[key],key);
  await arrowsPage.close();
  // Actual bundled WASM must work inside an isolated host iframe before Maia finishes downloading.
  await worker.evaluate(()=>chrome.storage.local.set({maiaVariant:'5m',stockfishVariant:'lite',cloudflareCdnUrl:'https://weights.4chess.cc/maia3_model.bin'}));
  let releaseDownload;
  const pendingDownload = new Promise(resolve=>{releaseDownload=resolve});
  await context.route('https://weights.4chess.cc/maia3_model.bin',async route=>{await pendingDownload;await route.abort().catch(()=>{})});
  let pieces=''; const ranks={1:'RNBQKBNR',2:'PPPPPPPP',7:'pppppppp',8:'rnbqkbnr'};
  for(const [rank,types] of Object.entries(ranks)) [...types].forEach((type,index)=>{pieces+=`<div class="piece ${type===type.toUpperCase()?'w':'b'}${type.toLowerCase()} square-${index+1}${rank}"></div>`});
  const engineFixtureUrl='https://www.chess.com/analysis/rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR_w_KQkq_-_0_1';
  await context.route(engineFixtureUrl,route=>route.fulfill({contentType:'text/html',headers:isolatedHeaders,body:fixture.replace('<wc-chess-board></wc-chess-board>',`<wc-chess-board>${pieces}</wc-chess-board>`).replace('<div class="clock-running">10:00</div><button aria-label="Resign">Resign</button>','')}));
  const enginePage=await context.newPage(); const runtimeErrors=[];
  enginePage.on('console',m=>{if(m.type()==='error')runtimeErrors.push(m.text())});
  await enginePage.goto(engineFixtureUrl);
  try {
    await enginePage.waitForFunction(()=>document.querySelector('#label-sf-status')?.textContent.includes('WASM'),null,{timeout:20000});
    await enginePage.waitForFunction(()=>document.querySelector('#maia-moves-container .weui-move-item'),null,{timeout:20000});
    assert.equal(await enginePage.evaluate(()=>crossOriginIsolated),true);
    assert(await enginePage.locator('#maia-sf-arrows-layer line').count()>0);
    assert.doesNotMatch(await enginePage.locator('#label-maia-status').innerText(),/就绪|Ready/);
    releaseDownload();
    const retry=enginePage.getByRole('button',{name:/Retry Maia download|重试 Maia 下载/});
    await retry.waitFor({timeout:10000});
    assert(await enginePage.locator('#maia-sf-arrows-layer line').count()>0,'Maia failure must preserve the independent SF result');
    const requestsBeforeRetry=downloads;
    await retry.click();
    await enginePage.waitForTimeout(300);
    assert(downloads>requestsBeforeRetry,'Retry must start a new download even when model preferences have not changed');
    await enginePage.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<div class="clock-running">10:00</div>'));
    await enginePage.waitForFunction(()=>document.querySelector('#maia3-intuition-panel').dataset.fairPlayLocked==='true');
    assert.equal(await enginePage.locator('#maia-sf-arrows-layer line').count(),0);
  } catch(error) { console.log({runtimeErrors,statuses:await enginePage.locator('#label-maia-status,#label-sf-status').allTextContents(),frames:enginePage.frames().map(f=>f.url())}); throw error; }
  finally { releaseDownload(); await enginePage.close(); }
  const guide=await context.newPage(); const origin=`http://127.0.0.1:${server.address().port}`;
  await guide.goto(origin+'/guide/?lang=zh');
  assert.match(await guide.locator('[data-copy="projectCredit"]').innerText(),/keluoke/);
  for (let i=0;i<5;i++) { const d=guide.locator('#license-documents details').nth(i); await d.locator('summary').click(); await guide.waitForFunction(index=>document.querySelectorAll('#license-documents details')[index].dataset.loaded==='true',i); assert((await d.locator('pre').innerText()).length>1000); }
  await guide.locator('#language-toggle').click(); assert.equal(await guide.locator('html').getAttribute('lang'),'en');
  assert.match(await guide.locator('[data-theme-toggle]').innerText(),/Dark|Light/);
  for(const width of [1440,390,320]) { await guide.setViewportSize({width,height:900}); assert(await guide.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); }
  await guide.screenshot({path:path.join(screenshots,'guide-mobile-en.png'),fullPage:true});
  await guide.setViewportSize({width:1440,height:1000}); await guide.goto(origin+'/guide/?lang=zh'); await guide.screenshot({path:path.join(screenshots,'guide-desktop-zh.png'),fullPage:true});
  assert.deepEqual(errors,[]); console.log('PASS packaged MV3: live lock/no downloads, equal coverage, 3 model preferences, bilingual scrolling, popup, packaged notices and responsive guide');
} finally { await context.close(); server.close(); fs.rmSync(scratch,{recursive:true,force:true}); }
