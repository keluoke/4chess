import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { onRequest } from '../functions/api/chesscom.js';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/delivery-2026-10-25');
fs.mkdirSync(output, { recursive: true });
const fetchOriginal = globalThis.fetch;
let finished = false, upstreamCalls = 0;
globalThis.fetch = async (url, options) => {
 if (String(url).startsWith('https://www.chess.com/callback/')) {
  upstreamCalls++;
  return Response.json({game:{isFinished:finished,status:finished?'finished':'playing',moveList:'mC0K',pgnHeaders:{Result:finished?'1-0':'*'}}});
 }
 return fetchOriginal(url, options);
};
const server = http.createServer(async (req, res) => {
 const url = new URL(req.url, 'http://localhost');
 if (url.pathname === '/api/chesscom') {
  const response = await onRequest({request:new Request(url)});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
 }
 let file = path.resolve(root, '.' + url.pathname);
 if (!file.startsWith(root + path.sep)) { res.writeHead(404);res.end();return; }
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.xml':'application/xml','.txt':'text/plain'};
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'chromium',headless:true});
const results={};
try {
 const context=await browser.newContext({locale:'en-US'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/analysis/?lang=en');await page.waitForFunction(()=>!!window.__maiaStudioApp?.positions.length);
 const initial=await page.evaluate(()=>({text:document.body.innerText,install:!!document.querySelector('a[href*="chromewebstore.google.com"]'),intro:document.querySelector('#empty-study-intro').hidden}));
 assert(initial.install&&!initial.intro);assert(!/全部|妙手|俗手/.test(initial.text));
 await page.setViewportSize({width:390,height:844});
 const rect=await page.locator('#btn-home-import').boundingBox();assert(rect.y+rect.height<844,'Primary action visible on mobile first screen');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 await page.screenshot({path:path.join(output,'studio-mobile.png'),fullPage:true});
 const imports=await page.evaluate(async()=>{
  const app=window.__maiaStudioApp;app.positionAnalysis.refresh=()=>{};app.runFullReview=async()=>{};
  const original=window.fetch;let requests=0;
  window.fetch=async()=>{requests++;return new Response('',{status:503});};
  const local=await app.smartLoadInput('[Site "https://lichess.org/AbCd1234"]\n[Result "1-0"]\n1. e4 e5 1-0');
  let release;window.fetch=()=>new Promise(r=>release=r);
  const old=app.smartLoadInput('https://lichess.org/OldG1234');
  await app.smartLoadInput('[White "Latest"]\n[Result "1-0"]\n1. d4 d5 1-0');
  release(Response.json({pgn:'[White "Old"]\n[Result "1-0"]\n1. e4 e5 1-0'}));await old;
  const current=app.el.metaWhite.textContent;
  app.toggleAutoPlay();app.startNewSession({pgn:'[Result "1-0"]\n1. e4 e5 1-0',autoReview:false});
  const playing=app.isPlaying;
  window.fetch=async()=>Response.json({game:{moveList:'mC0K',pgnHeaders:{Result:'*'}}});
  const unknown=await app.smartLoadInput('https://www.chess.com/game/live/12345678');window.fetch=original;
  return {local,requests,current,playing,unknown};
 });
 assert.equal(imports.local,true);assert.equal(imports.requests,0);assert(imports.current.includes('Latest'));assert.equal(imports.playing,false);assert.equal(imports.unknown,false);results.imports=imports;
 for(const lang of ['en','zh']){
  await page.setViewportSize({width:lang==='en'?1440:390,height:1000});
  await page.goto(origin+'/'+lang+'/');assert.equal(await page.locator('h1').count(),1);
  assert(await page.locator('link[rel="canonical"]').getAttribute('href'));assert.equal(await page.locator('link[hreflang]').count(),3);
  await page.screenshot({path:path.join(output,'landing-'+lang+'.png'),fullPage:true});
 }
 assert.equal(errors.length,0,errors.join('\n'));results.ui={errors,primaryActionVisible:true};await context.close();

 const offlineContext=await browser.newContext(),offline=await offlineContext.newPage();
 await offline.goto(origin+'/analysis/');await offline.waitForFunction(()=>!!window.__maiaStudioApp);
 await offline.evaluate(async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
 const first=await offline.evaluate(async()=>{const r=await fetch('/api/chesscom?id=12345678');return {cache:r.headers.get('Cache-Control'),body:await r.json()};});
 finished=true;
 const second=await offline.evaluate(async()=>await(await fetch('/api/chesscom?id=12345678')).json());
 assert.equal(first.cache,'no-store');assert.equal(first.body.game.isFinished,false);assert.equal(second.game.isFinished,true);assert(upstreamCalls>=2);
 const cachedApi=await offline.evaluate(async()=>(await Promise.all((await caches.keys()).map(async k=>(await(await caches.open(k)).keys()).filter(r=>new URL(r.url).pathname.startsWith('/api/'))))).flat().length);
 assert.equal(cachedApi,0);results.api={upstreamCalls,cachedApi};
 await offlineContext.setOffline(true);await offline.reload();await offline.waitForFunction(()=>!!window.__maiaStudioApp?.positions.length);
 results.offline={app:true,firstOfflineReload:true};await offlineContext.close();

 // Load exactly the user-facing unpacked directory, not the source tree or an old ZIP.
 const version=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version;
 const extension=path.join(root,`releases/diverge-extension-v${version}`),profile=fs.mkdtempSync(path.join(os.tmpdir(),'diverge-release-profile-'));
 const extensionContext=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=extensionContext.serviceWorkers()[0]||await extensionContext.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const popup=await extensionContext.newPage();await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.waitForFunction(()=>!!document.querySelector('button'));
  const actual=await worker.evaluate(()=>chrome.runtime.getManifest());assert.equal(actual.version,version);assert(!actual.host_permissions.some(p=>/localhost|127\.0\.0\.1/.test(p)));
  let fixtureFinished=false;
  await extensionContext.route('https://www.chess.com/play/online',route=>route.fulfill({contentType:'text/html',body:fixtureFinished?'<!doctype html><body><div class="move-list-result">1-0</div><wc-chess-board></wc-chess-board></body>':'<!doctype html><body><div class="clock-running">5:00</div><button aria-label="Resign">Resign</button><wc-chess-board style="display:block;width:500px;height:500px"></wc-chess-board></body>'}));
  const host=await extensionContext.newPage();await host.goto('https://www.chess.com/play/online');await host.locator('#maia3-intuition-panel').waitFor();
  await host.waitForFunction(()=>/公平|Fair Play|LIVE|进行中/i.test(document.querySelector('#maia3-intuition-panel').textContent));
  await host.evaluate(()=>{document.querySelector('.clock-running').remove();document.querySelector('button[aria-label="Resign"]').remove();document.body.insertAdjacentHTML('beforeend','<div class="game-over-modal">White won by checkmate</div><div class="move-list-result">1-0</div>');});
  await host.waitForFunction(()=>document.querySelector('#maia3-intuition-panel').dataset.fairPlayLocked==='false');
  await host.evaluate(()=>document.querySelector('.game-over-modal').remove());
  await host.waitForTimeout(200);assert.equal(await host.locator('#maia3-intuition-panel').getAttribute('data-fair-play-locked'),'false');
  fixtureFinished=true;await host.reload();
  await host.waitForFunction(()=>document.querySelector('#maia3-intuition-panel')?.dataset.fairPlayLocked==='false');
  const lockMs=await host.evaluate(()=>new Promise(resolve=>{
    const started=performance.now();const panel=document.querySelector('#maia3-intuition-panel');
    const observer=new MutationObserver(()=>{if(panel.dataset.fairPlayLocked==='true'){observer.disconnect();resolve(performance.now()-started);}});
    observer.observe(panel,{attributes:true});document.body.insertAdjacentHTML('beforeend','<div class="clock-running">5:00</div>');
  }));
  assert(lockMs<150,`New-game lock exceeded 150ms in fixture: ${lockMs}`);
  results.extension={version,id,loaded:true,liveLock:true,conclusion:true,dismiss:true,refresh:true,lockMs};
 }finally{await extensionContext.close();fs.rmSync(profile,{recursive:true,force:true});}
 fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
}finally{await browser.close();await new Promise(r=>server.close(r));globalThis.fetch=fetchOriginal;}
