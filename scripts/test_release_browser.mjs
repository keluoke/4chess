import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { onRequest } from '../functions/api/chesscom.js';

const root = path.resolve(import.meta.dirname, '..');
const siteRoot = process.env.TEST_SITE_ROOT ? path.resolve(process.env.TEST_SITE_ROOT) : root;
const output = path.join(root, 'artifacts/delivery-2026-10-25');
fs.mkdirSync(output, { recursive: true });
const fetchOriginal = globalThis.fetch;
let finished = false, upstreamCalls = 0;
const releaseModules = new Map([
 ...[
  '/analysis/i18n.js', '/analysis/intuition-review.js',
  '/analysis/review-explorer.js', '/analysis/share-card.js',
  '/analysis/checkup-runner.js', '/analysis/checkup-overview.js', '/analysis/checkup-fit-view.js', '/analysis/checkup-share.js',
  '/analysis/challenge.js'
 ].map(path => [path, '20261124-intuition-labels']),
 ['/analysis/board-controls.js', '20261124-controls'],
 ['/engine/game-analyzer.js', '20261125-game-story'],
 ['/analysis/review-share.js', '20261125-poster-focus-r2'],
 ...['/analysis/analysis.js', '/analysis/position-analysis.js', '/analysis/maia-elo-trend.js', '/analysis/review-practice.js']
   .map(path => [path, '20261125-trend-lines']),
 ...['/analysis/review-snapshot.js', '/analysis/shared-review.js']
   .map(path => [path, '20261125-poster-focus']),
 ...['/engine/maia-engine.js', '/engine/maia-inbrowser.js', '/engine/maia-worker.js',
  '/engine/model-cache-client.js', '/engine/model-loader.js'].map(path => [path, '20261124-mobile']),
 ...['/analysis/board-ui.js', '/ui/board-visuals.js', '/analysis/share-export.js']
  .map(path => [path, '20261124-divergence-cards']),
 ...[
  '/ui/theme.js', '/analysis/checkup-archives.js', '/analysis/checkup-analysis.js', '/analysis/checkup-insights.js', '/analysis/study-store.js',
  '/analysis/checkup-fit.js', '/analysis/challenge-link.js', '/engine/stockfish-inbrowser.js',
  '/engine/engine-preferences.js'
 ].map(path => [path, '20261124-checkup-cards-r2'])
]);
const staleModuleRequests = [];
globalThis.fetch = async (url, options) => {
 if (String(url).startsWith('https://www.chess.com/callback/')) {
  upstreamCalls++;
  return Response.json({game:{isFinished:finished,status:finished?'finished':'playing',moveList:'mC0K',pgnHeaders:{Result:finished?'1-0':'*'}}});
 }
 return fetchOriginal(url, options);
};
const server = http.createServer(async (req, res) => {
 const url = new URL(req.url, 'http://localhost');
 if (releaseModules.has(url.pathname) && url.searchParams.get('v') !== releaseModules.get(url.pathname)) {
  staleModuleRequests.push(url.pathname + url.search);
  res.writeHead(200, {'Content-Type':'application/javascript','Cache-Control':'public, max-age=31536000, immutable'});
  res.end('throw new Error("Cached workbench module from the previous release")');
  return;
 }
 if (url.pathname === '/api/chesscom') {
  const response = await onRequest({request:new Request(url)});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
 }
 if (url.pathname === '/analysis/index.html') {
  res.writeHead(308, {Location:'/analysis/'});res.end();return;
 }
 let file = path.resolve(siteRoot, '.' + url.pathname);
 if (!file.startsWith(siteRoot + path.sep)) { res.writeHead(404);res.end();return; }
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.xml':'application/xml','.txt':'text/plain','.woff2':'font/woff2'};
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
 const examples = page.locator('.study-home-examples');
 assert((await examples.boundingBox()).y > rect.y+rect.height,'Examples follow the mobile import action');
 for (const width of [700,1440]) {
  await page.setViewportSize({width,height:900});
  const intro=await page.locator('#study-home-title').boundingBox(), sample=await examples.boundingBox();
  assert(sample.x>=intro.x+intro.width,'Examples sit beside the introduction at wide widths');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
 }
 await page.locator('#btn-home-import').click();
 await page.locator('#pgn-modal.open #pgn-input').waitFor();
 await page.keyboard.press('Escape');
 await page.locator('#btn-home-checkup').click();
 await page.locator('#checkup-dialog[open]').waitFor();
 await page.keyboard.press('Escape');
 await page.locator('#checkup-dialog[open]').waitFor({state:'detached'});
 await page.evaluate(()=>{
  const app=window.__maiaStudioApp;
  app.positionAnalysis.refresh=()=>{};
  app.runFullReview=async()=>{};
 });
 const preview = page.locator('#study-home-preview .study-home-square');
 assert.equal(await preview.count(),64);
 const samplePieces=await preview.evaluateAll(squares=>squares.filter(square=>square.querySelector('svg')).length);
 assert(samplePieces>16 && samplePieces<32,'The preview renders the featured midgame position');
 await page.locator('#btn-chip-fischer').click();
 assert(await page.locator('#empty-study-intro').isHidden());
 assert.deepEqual(await page.evaluate(()=>{
  const app=window.__maiaStudioApp;
  return [app.currentPly,app.positions[app.currentPly].san,app.isReviewingMove,app.boardUI.orientation];
 }),[34,'Be6',true,'black']);
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
  let lichessExport;
  window.fetch=async url=>{
   lichessExport=new URL(url).pathname;
   return Response.json({ status:'mate', pgn:'[Result "1-0"]\n1. e4 e5 1-0' });
  };
  const lichessGame=await app.smartLoadInput('https://lichess.org/game/AbCd1234wxyz');
  window.fetch=async()=>Response.json({game:{moveList:'mC0K',pgnHeaders:{Result:'*'}}});
  const unknown=await app.smartLoadInput('https://www.chess.com/game/live/12345678');window.fetch=original;
  return {local,requests,current,playing,unknown,lichessGame,lichessExport};
 });
 assert.equal(imports.local,true);assert.equal(imports.requests,0);assert(imports.current.includes('Latest'));assert.equal(imports.playing,false);assert.equal(imports.unknown,false);results.imports=imports;
 assert.equal(imports.lichessGame,true);
 assert.equal(imports.lichessExport,'/game/export/AbCd1234');
 await page.setViewportSize({width:1360,height:768});
 const notation = await page.evaluate(() => {
  const app = window.__maiaStudioApp;
  const moves = Array.from({length:60}, (_, i) => `${i + 1}. ${i % 2 ? 'Ng1 Ng8' : 'Nf3 Nf6'}`).join(' ');
  app.startNewSession({pgn:`[Result "1-0"]\n${moves} 1-0`,autoReview:false});
  const scroll = document.querySelector('.analysis-scroll');
  const table = app.el.moveNotationTable;
  app.goToPly(100);
  const row = table.querySelector('.active').getBoundingClientRect();
  const viewport = table.getBoundingClientRect();
  return {outer:scroll.scrollTop,inner:table.scrollTop,visible:row.top >= viewport.top - 1 && row.bottom <= viewport.bottom + 1};
 });
 assert.equal(notation.outer,0,'Long jumps preserve the middle column position');
 assert(notation.inner > 0,'Long jumps scroll within the notation only');
 assert.equal(notation.visible,true);
 const trendPage=await context.newPage({viewport:{width:1440,height:900}});
 trendPage.on('pageerror',e=>errors.push(e.message));
 await trendPage.goto(origin+'/analysis/?lang=en');
 await trendPage.waitForFunction(()=>!!window.__maiaStudioApp?.positions.length);
 await trendPage.evaluate(async()=>{
  const app=window.__maiaStudioApp;
  const {ChessBoard}=await import('../engine/chess-core.js');
  window.trendCalls=[];
  const mockEngines=()=>{
   const model=app.maiaEngine.variant;
   app.maiaEngine.initialize=async()=>true;
   app.maiaEngine.predict=async(fen,rating,_sf,canceled)=>{
    const call={fen,rating,model,aborted:false};
    trendCalls.push(call);
    if(window.holdRating===rating){
     await new Promise(resolve=>{
      const timer=setInterval(()=>{
       if(canceled() || window.holdRating!==rating){clearInterval(timer);call.aborted=canceled();resolve();}
      },5);
     });
    }
    const moves=new ChessBoard(fen).getLegalMoves();
    const rank=rating===600?['g1h3','g1f3','d2d4','c2c4','e2e4']:['e2e4','d2d4','c2c4','g1f3'];
    const ordered=[...rank.map(uci=>moves.find(move=>move.uci===uci)).filter(Boolean),...moves.filter(move=>!rank.includes(move.uci))];
    return {moves:ordered.map((move,index)=>({...move,rawProb:1/(index+4),prob:100/(index+4)}))};
   };
   const stockfish=app.stockfish.variant;
   app.stockfish.initialize=async()=>true;
   app.stockfish.evaluate=async(fen,depth)=>{
    const moves=new ChessBoard(fen).getLegalMoves();
    const bestMove=moves.find(move=>move.uci==='g1f3')||moves[0];
    return {bestMove,scoreCp:25,depth:stockfish==='standard'?depth-1:depth};
   };
  };
  const init=app.initEngines.bind(app);
  app.initEngines=options=>{init(options);mockEngines();};
  mockEngines();
  window.reviewResumeCount=0;
  app.runFullReview=()=>{window.reviewResumeCount++;app.reviewPendingResume=false;};
  app.startNewSession({pgn:'[Result "1-0"]\n1. e4 e5 2. Nf3 Nc6 1-0',elo:1800,autoReview:false});
 });
 const trend=trendPage.locator('#maia-elo-trend');
 const openTrend=trendPage.locator('#maia-trend-open');
 const closeTrend=trend.locator('#maia-trend-close');
 const progress=trend.locator('.maia-trend-status');
 const extras=()=>trendPage.evaluate(()=>trendCalls.filter(call=>call.rating!==1800));
 await openTrend.waitFor();
 assert.equal(await trendPage.locator('main details:not(#review-classifications)').count(),0,'The workbench has no scattered help disclosures');
 assert.equal(await trendPage.locator('#review-classifications').getAttribute('open'),null);
 assert.equal(await trendPage.locator('#review-summary details.review-score-details').count(),1);
 assert.equal(await trend.getAttribute('open'),null);
 assert.equal(await trend.locator('svg').count(),0);
 assert.deepEqual(await extras(),[],'An unopened trend dialog must not start rating inference');
 await openTrend.focus();
 await trendPage.keyboard.press('Space');
 await trendPage.waitForFunction(()=>document.querySelector('.maia-trend-status')?.textContent.includes('6 of 6'));
 assert.equal(await trend.isVisible(),true);
 assert.equal(await trendPage.evaluate(()=>document.activeElement.id),'maia-trend-close');
 assert.equal(await trendPage.evaluate(()=>window.__maiaStudioApp.isPlaying),false,'Space opens the dialog without starting playback');
 assert.deepEqual((await extras()).map(call=>call.rating).sort((a,b)=>a-b),[600,1000,1400,2200,2600]);
 assert.equal(await trend.locator('g.maia-trend-series').count(),4);
 assert.equal(await trend.locator('g[data-uci="e2e4"] circle[data-elo="600"]').count(),1,'A move outside the sampled top three retains its actual probability');
 assert.equal(await trend.locator('g.trend-sf[data-uci="g1f3"]').count(),1);
 const legend=trend.locator('.maia-trend-legend');
 const maiaMove=legend.getByRole('button',{name:/^M e4 · Δ/});
 const e4Line=trend.locator('g[data-uci="e2e4"]');
 assert.equal(await legend.getByRole('button').count(),4);
 assert.equal(await legend.getByRole('button',{name:/^★ Nf3 · Δ/}).count(),1);
 assert.deepEqual(await maiaMove.locator('path').evaluate(path=>[getComputedStyle(path).stroke,getComputedStyle(path).strokeDasharray]),
  await e4Line.locator('path').evaluate(path=>[getComputedStyle(path).stroke,getComputedStyle(path).strokeDasharray]));
 await maiaMove.click();
 assert.equal(await maiaMove.getAttribute('aria-pressed'),'true');
 assert.equal(await trend.locator('g.trend-muted').count(),3);
 assert.equal(await e4Line.evaluate(group=>getComputedStyle(group).opacity),'1');
 await trendPage.evaluate(()=>window.__maiaStudioApp.positionAnalysis.render());
 assert.equal(await maiaMove.getAttribute('aria-pressed'),'true');
 assert.equal(await trendPage.evaluate(()=>document.activeElement.dataset.uci),'e2e4');
 assert.match(await trend.locator('.maia-trend-sources').innerText(),/Move probabilities · Maia-3 5M\s+Top move and Δ scores · Stockfish 19 Lite · Root search D20/);
 await trend.getByRole('button',{name:'Sampled values',exact:true}).click();
 assert.equal(await trend.locator('table tbody tr').count(),6);
 assert.equal(await trend.locator('.maia-trend-chart').isVisible(),false);
 assert.equal(await trend.locator('.maia-trend-data').isVisible(),true);
 assert.equal((await extras()).length,5,'Changing the presentation cannot trigger new samples');
 await trendPage.keyboard.press('Escape');
 assert.equal(await trend.isVisible(),false);
 assert.equal(await trendPage.evaluate(()=>document.activeElement.id),'maia-trend-open');
 await openTrend.click();
 assert.equal(await progress.innerText(),'6 of 6 ratings complete');
 assert.equal((await extras()).length,5,'Reopening a complete chart must reuse its samples');
 await closeTrend.click();

 // Cancel a partly completed chart on the next position and resume only its missing ratings.
 await trendPage.evaluate(()=>{window.holdRating=2200;window.__maiaStudioApp.goToPly(1);});
 const priorFen=await trendPage.evaluate(()=>window.__maiaStudioApp.positions[1].fen);
 await openTrend.click();
 await trendPage.waitForFunction(fen=>trendCalls.some(call=>call.fen===fen&&call.rating===2200),priorFen);
 await trendPage.keyboard.press('ArrowRight');
 await trendPage.waitForFunction(fen=>trendCalls.some(call=>call.fen===fen&&call.rating===2200&&call.aborted),priorFen);
 await trendPage.waitForFunction(()=>window.__maiaStudioApp.currentPly===2&&trendCalls.some(call=>call.fen===window.__maiaStudioApp.positions[2].fen&&call.rating===1800));
 assert.equal(await trend.getAttribute('open'),null);
 assert.equal(await trend.locator('svg').count(),0,'A late previous-position sample must not resurrect the chart');
 assert.deepEqual((await extras()).filter(call=>call.fen===priorFen).map(call=>call.rating),[1400,2200]);
 const nextFen=await trendPage.evaluate(()=>{window.holdRating=1400;return window.__maiaStudioApp.positions[2].fen;});
 await openTrend.click();
 await trendPage.waitForFunction(fen=>trendCalls.some(call=>call.fen===fen&&call.rating===1400),nextFen);
 await closeTrend.click();
 await trendPage.waitForFunction(fen=>trendCalls.some(call=>call.fen===fen&&call.rating===1400&&call.aborted),nextFen);
 assert.equal(await trend.isVisible(),false);
 assert.deepEqual((await extras()).filter(call=>call.fen===nextFen).map(call=>call.rating),[1400],'Closing stops all remaining samples');
 await trendPage.evaluate(()=>{window.holdRating=null;window.__maiaStudioApp.goToPly(1);});
 await openTrend.click();
 await trendPage.waitForFunction(()=>document.querySelector('.maia-trend-status')?.textContent.includes('6 of 6'));
 assert.equal((await extras()).filter(call=>call.fen===priorFen&&call.rating===1400).length,1,'A completed pre-cancellation sample is reused');
 await closeTrend.click();
 const beforeOffGrid=(await extras()).length;
 await trendPage.evaluate(()=>{
  const app=window.__maiaStudioApp;
  app.el.eloSelector.value='1900';
  app.el.eloSelector.dispatchEvent(new Event('change'));
  window.reviewResumeCount=0;
  app.updateActivePositionAnalysis();
 });
 await openTrend.click();
 await trendPage.waitForFunction(()=>document.querySelector('circle[data-elo="1900"]'));
 assert.equal((await extras()).length,beforeOffGrid+1,'Off-grid marker uses the actual current prediction and reuses all six sampled ratings');
 assert.equal(await trend.locator('.maia-trend-current').count(),1);
 await trendPage.setViewportSize({width:390,height:844});
 assert.equal(await trendPage.evaluate(()=>document.documentElement.scrollWidth),390);
 const sheet=await trend.boundingBox();
 assert(sheet.x>=0 && sheet.x+sheet.width<=391 && Math.abs(sheet.y+sheet.height-844)<2,'Mobile dialog fits as a bottom sheet');
 await trendPage.screenshot({path:path.join(output,'maia-elo-mobile.png')});
 const settings=trend.getByRole('button',{name:'Engine settings',exact:true});
 const model=trend.locator('#maia-trend-model');
 const sf=trend.locator('#maia-trend-engine');
 await settings.click();
 await model.selectOption('79m');
 await trend.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await trendPage.locator('#intuition-edition').inputValue(),'5m');
 await settings.click();
 assert.equal(await model.inputValue(),'5m');
 await model.selectOption('23m');
 await sf.selectOption('standard');
 assert.equal(await trend.locator('#maia-trend-settings').evaluate(form=>form.scrollWidth<=form.clientWidth),true);
 await trendPage.evaluate(()=>{window.holdRating=1900;});
 await trend.getByRole('button',{name:'Apply and refresh',exact:true}).click();
 assert.equal(await trend.isVisible(),true);
 assert.equal(await trend.locator('g.maia-trend-series').count(),0,'Old curves are cleared while the new model is pending');
 assert.match(await progress.innerText(),/new settings/);
 await trendPage.waitForFunction(()=>trendCalls.some(call=>call.model==='23m'&&call.rating===1900));
 await trendPage.evaluate(()=>{window.holdRating=null;});
 await trendPage.waitForFunction(()=>document.querySelector('.maia-trend-status')?.textContent.includes('6 of 6'));
 assert.match(await trend.locator('.maia-trend-sources').innerText(),/Maia-3 23M\s+Top move and Δ scores · Stockfish 19 Standard · Root search D11/);
 assert.deepEqual(await trendPage.evaluate(()=>trendCalls.filter(call=>call.model==='23m').map(({fen,rating})=>[fen,rating]).sort((a,b)=>a[1]-b[1])),
  [600,1000,1400,1800,1900,2200,2600].map(rating=>[priorFen,rating]));
 assert.equal(await trendPage.locator('#intuition-edition').inputValue(),'23m');
 assert.equal(await trendPage.locator('#engine-edition').inputValue(),'standard');
 assert.deepEqual(await trendPage.evaluate(()=>{
  const {maiaVariant,stockfishVariant}=JSON.parse(localStorage.getItem('diverge_preferences'));
  return [maiaVariant,stockfishVariant,reviewResumeCount];
 }),['23m','standard',0]);
 await closeTrend.click();
 await trendPage.waitForFunction(()=>reviewResumeCount===1);
 const helpTabPromise=context.waitForEvent('page');
 await trendPage.getByRole('link',{name:'Review guide',exact:true}).click();
 const helpTab=await helpTabPromise;
 await helpTab.getByRole('heading',{name:'How accuracy is calculated'}).waitFor();
 assert.equal(new URL(helpTab.url()).hash,'#review-method');
 assert.match(await helpTab.locator('#review-method').innerText(),/harmonic mean/);
 assert.equal(await trendPage.evaluate(()=>window.__maiaStudioApp.currentPly),1,'Reading the guide preserves the review position');
 await helpTab.close();
 await trendPage.close();
 results.maiaTrend={lazy:true,sixRatings:true,cancel:true,resumeMissing:true,interactiveLegend:true,engineProvenance:true,refreshInPlace:true};
 for(const lang of ['en','zh']){
  await page.setViewportSize({width:lang==='en'?1440:390,height:1000});
  await page.goto(origin+'/'+lang+'/');assert.equal(await page.locator('h1').count(),1);
  assert(await page.locator('link[rel="canonical"]').getAttribute('href'));assert.equal(await page.locator('link[hreflang]').count(),3);
  await page.screenshot({path:path.join(output,'landing-'+lang+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.goto(origin+'/guide/?lang=zh');
 await page.locator('#models').evaluate(el=>el.scrollIntoView({behavior:'instant'}));
 await page.waitForFunction(()=>document.querySelector('.guide-toc a[href="#models"]').getAttribute('aria-current')==='true');
 assert.equal(await page.locator('.guide-toc a[aria-current="true"]').count(),1);
 assert.equal(await page.locator('.board-legend-card svg').count(),3);
 await page.setViewportSize({width:390,height:844});
 await page.locator('.guide-toc-mobile summary').click();
 await page.locator('.guide-toc-mobile a[href="#scan"]').click();
 assert.equal(new URL(page.url()).hash,'#scan');
 assert.equal(errors.length,0,errors.join('\n'));results.ui={errors,primaryActionVisible:true};await context.close();

 const offlineContext=await browser.newContext(),offline=await offlineContext.newPage();
 await offline.goto(origin+'/analysis/?lang=en');await offline.waitForFunction(()=>!!window.__maiaStudioApp);
 await offline.evaluate(async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
 const first=await offline.evaluate(async()=>{const r=await fetch('/api/chesscom?id=12345678');return {cache:r.headers.get('Cache-Control'),body:await r.json()};});
 finished=true;
 const second=await offline.evaluate(async()=>await(await fetch('/api/chesscom?id=12345678')).json());
 assert.equal(first.cache,'no-store');assert.equal(first.body.game.isFinished,false);assert.equal(second.game.isFinished,true);assert(upstreamCalls>=2);
 const cachedApi=await offline.evaluate(async()=>(await Promise.all((await caches.keys()).map(async k=>(await(await caches.open(k)).keys()).filter(r=>new URL(r.url).pathname.startsWith('/api/'))))).flat().length);
 assert.equal(cachedApi,0);results.api={upstreamCalls,cachedApi};
 await offline.evaluate(async () => {
  const bank = window.__maiaStudioApp.mistakeBank;
  await bank.ready;
  await bank.store.upsertTrap({
   id: 'default|6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1|g1f1',
   profileId: 'default',
   fenBefore: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
   turn: 'w', moveNumber: 21, ply: 41, uci: 'g1f1', playedUci: 'g1f1', san: 'Kf1', playedSan: 'Kf1',
   bestUci: 'e1e8', bestSan: 'Re8#', verifiedBestUci: 'e1e8', verifiedBestSan: 'Re8#',
   playedPv: ['g1f1', 'g7g6'], verifiedPlayedPv: ['g1f1', 'g7g6'], bestPv: ['e1e8'], verifiedBestPv: ['e1e8'],
   divergenceType: 'intuition_trap', divergenceStatus: 'confirmed', elo: 1500, humanProb: 0.25,
   eslLoss: 50, lossCp: 900, phase: 'endgame', source: { white: 'Offline', black: 'Test', result: '1-0' },
   srs: { stage: 0, streak: 0, attempts: 0, nextReviewAt: Date.now() - 1000, lastStatus: 'new', lastReviewedAt: null },
   createdAt: Date.now() - 1000
  });
 });
 await offlineContext.setOffline(true);await offline.reload();await offline.waitForFunction(()=>!!window.__maiaStudioApp?.positions.length);
 await offline.evaluate(() => document.fonts.ready);
 assert.equal(await offline.evaluate(() => [...document.fonts].some(font => font.family === 'Inter' && font.status === 'loaded')), true, 'Inter is available on first offline reload');
 const offlineAssets = await offline.evaluate(async () => {
  const cache = await caches.open((await caches.keys()).find(name => name.startsWith('4chess-review-')));
  const requests = await cache.keys();
  const paths = ['/engine/maia-worker.js', '/engine/maia-inbrowser.js', '/lib/stockfish-19.js', '/lib/stockfish.wasm', '/lib/stockfish-19-standard.js'];
  return Promise.all(paths.map(async path => {
   const matches = requests.filter(request => new URL(request.url).pathname === path);
   return matches.length === 1 && (await fetch(matches[0].url)).ok;
  }));
 });
 assert(offlineAssets.every(Boolean), 'Each local engine asset has one cached URL and is retrievable offline');
 const cachedReleaseModules = await offline.evaluate(async entries => {
  const cacheVersion = new URL(navigator.serviceWorker.controller.scriptURL).searchParams.get('v');
  const cache = await caches.open('4chess-review-' + cacheVersion);
  const urls = (await cache.keys()).map(request => new URL(request.url));
  return entries.every(([path, version]) => {
   const matches = urls.filter(url => url.pathname === path);
   return matches.length === 1 && matches[0].searchParams.get('v') === version;
  });
 }, [...releaseModules]);
 assert(cachedReleaseModules, 'Offline prefetch uses the same release URLs as the workbench module graph');
 assert.deepEqual(staleModuleRequests, [], 'A warm HTTP cache must not supply a module from the previous release');
 await offline.locator('#btn-mistake-bank').click();
 await offline.locator('#btn-bank-practice').click();
 await offline.waitForFunction(() => window.__maiaStudioApp.practice?.active === true);
 await offline.evaluate(() => {
  const app = window.__maiaStudioApp;
  const move = app.boardUI.chess.getLegalMoves().find(m => m.uci === 'e1e8');
  app.boardUI.chess.makeMove(move);
  app.handleUserBoardMove(move, app.boardUI.chess.getFen());
 });
 await offline.waitForFunction(() => window.__maiaStudioApp.practice?.verdict === 'retryGood', null, { timeout: 15000 });
 const offlineSrs = await offline.evaluate(async () => {
  const traps = await window.__maiaStudioApp.mistakeBank.store.listTraps('default', { filter: 'all' });
  return traps[0]?.srs;
 });
 assert.equal(offlineSrs?.stage, 1, 'Offline Stockfish grading advances SRS stage in IndexedDB');
 results.offline={app:true,firstOfflineReload:true,font:true,engineAssets:true,offlineStockfishGraded:true,srsStage:offlineSrs.stage};await offlineContext.close();

 // Load exactly the user-facing unpacked directory, not the source tree or an old ZIP.
 const version=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version;
 const extension=path.resolve(root,process.env.DIVERGE_RELEASE_DIR || 'releases',`diverge-extension-v${version}`),profile=fs.mkdtempSync(path.join(os.tmpdir(),'diverge-release-profile-'));
 const extensionContext=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=extensionContext.serviceWorkers()[0]||await extensionContext.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const popup=await extensionContext.newPage();await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.waitForFunction(()=>!!document.querySelector('button'));
  const actual=await worker.evaluate(()=>chrome.runtime.getManifest());assert.equal(actual.version,version);assert(!actual.host_permissions.some(p=>/localhost|127\.0\.0\.1/.test(p)));
  let protectedModelRequests=0;
  extensionContext.on('request',request=>{if(request.url().startsWith('https://weights.4chess.cc/'))protectedModelRequests++;});
  let fixtureFinished=false;
  const ad = '<div class="ad-slot" style="position:absolute;left:750px;top:70px;width:300px;height:600px"></div>';
  await extensionContext.route('https://www.chess.com/play/online',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><body>${fixtureFinished ? '<div class="move-list-result">1-0</div>' : '<div class="clock-running">5:00</div><button aria-label="Resign">Resign</button>'}<wc-chess-board style="display:block;width:500px;height:500px"></wc-chess-board>${ad}</body>`}));
  const host=await extensionContext.newPage();await host.goto('https://www.chess.com/play/online');await host.locator('#maia3-intuition-panel').waitFor();
  await host.waitForFunction(()=>/公平|Fair Play|LIVE|进行中/i.test(document.querySelector('#maia3-intuition-panel').textContent));
  await host.evaluate(()=>{document.querySelector('.clock-running').remove();document.querySelector('button[aria-label="Resign"]').remove();document.body.insertAdjacentHTML('beforeend','<div class="game-over-modal">White won by checkmate</div><div class="move-list-result">1-0</div>');});
  await host.waitForFunction(()=>document.querySelector('#maia3-intuition-panel').dataset.fairPlayLocked==='false');
  assert.doesNotMatch(await host.locator('#maia-turn-pill').innerText(),/对局中|Live|Locked/i,'Unlock must clear stale protection before a readable FEN is available');
  assert.equal(await host.locator('#maia-inference-time').innerText(),'');
  assert.equal(await host.locator('#btn-trigger-standalone').isDisabled(),false);
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
  await host.evaluate(()=>{document.querySelector('.clock-running').remove();document.querySelector('.move-list-result').remove();});
  await host.waitForFunction(()=>/Verifying|确认/.test(document.querySelector('#maia-moves-container').textContent));
  assert.doesNotMatch(await host.locator('#maia-turn-pill').innerText(),/对局中|Live/);
  await host.locator('#weui-btn-more').click();await host.locator('#panel-collapse').scrollIntoViewIfNeeded();await host.locator('#panel-collapse').click();
  assert.match(await host.locator('#compact-title').innerText(),/Verifying|确认/);
  await host.locator('#maia-restore').click();
  await host.evaluate(()=>document.querySelector('wc-chess-board').remove());
  await host.waitForFunction(()=>/Waiting for a board|等待棋盘/.test(document.querySelector('#maia-moves-container').textContent));
  assert.doesNotMatch(await host.locator('#maia-turn-pill').innerText(),/对局中|Live/);
  assert.equal(await host.locator('#btn-trigger-standalone').isDisabled(),true);
  await extensionContext.route('https://lichess.org/AbCd1234',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body><cg-board></cg-board><div class="rclock-running">5:00</div><button class="resign">Resign</button></body>'}));
  const lichess=await extensionContext.newPage();await lichess.goto('https://lichess.org/AbCd1234');
  await lichess.waitForFunction(()=>document.querySelector('#maia3-intuition-panel')?.dataset.fairPlayLocked==='true');
  await lichess.evaluate(()=>{document.querySelector('.rclock-running').remove();document.querySelector('button.resign').remove();document.body.insertAdjacentHTML('beforeend','<div class="result-wrap">1-0 White is victorious</div>');});
  await lichess.waitForFunction(()=>document.querySelector('#maia3-intuition-panel').dataset.fairPlayLocked==='false');
  assert.doesNotMatch(await lichess.locator('#maia-turn-pill').innerText(),/对局中|Live|Locked/i);

  // Exercise saved preferences and arrows in the packaged studio, with representative legal results.
  await worker.evaluate(() => chrome.storage.local.set({ showArrows: false, showStockfishArrows: true }));
  const studio = await extensionContext.newPage();
  await studio.goto(`chrome-extension://${id}/analysis/index.html?lang=en`);
  await studio.waitForFunction(() => !!window.__maiaStudioApp?.positionAnalysis.active);
  await studio.evaluate(() => {
    const analysis = window.__maiaStudioApp.positionAnalysis;
    analysis.active.entry.sf = { bestMove: { uci: 'e2e4' }, scoreCp: 30, depth: 10 };
    analysis.active.entry.prediction = { moves: [{ uci: 'd2d4', prob: 42 }] };
    analysis.render();
  });
  const maiaSwitch = studio.getByRole('checkbox', { name: 'Show Maia candidate arrows' });
  const sfSwitch = studio.getByRole('checkbox', { name: 'Show Stockfish best-move arrow' });
  const expectArrows = roles => studio.waitForFunction(expected => {
    const actual = [...document.querySelectorAll('#maia-svg-arrows-group line[data-role]')].map(line => line.dataset.role);
    return actual.join(',') === expected.join(',');
  }, roles);
  await expectArrows(['sf']);
  await studio.locator('#engine-candidate-lines .candidate-variation').dispatchEvent('mouseenter');
  await expectArrows(['sf']);
  const sfStar = studio.locator('#maia-svg-arrows-group [data-move-badge="sf"] path');
  assert.equal(await sfStar.count(),1,'Hover retains the Stockfish star');
  await studio.emulateMedia({colorScheme:'dark'});
  await studio.locator('#engine-candidate-lines .candidate-variation').dispatchEvent('mouseenter');
  assert.equal(await sfStar.evaluate(el=>getComputedStyle(el).fill),'rgb(23, 35, 27)','Dark theme uses a dark glyph on the light blue badge');
  await studio.locator('#engine-candidate-lines .candidate-variation').dispatchEvent('mouseleave');
  await studio.locator('#maia-candidate-lines .candidate-variation').dispatchEvent('mouseenter');
  await expectArrows(['sf']);
  await studio.locator('#btn-settings').click();
  assert.equal(await maiaSwitch.isChecked(), false);
  assert.equal(await sfSwitch.isChecked(), true);
  await maiaSwitch.check();
  await expectArrows(['sf', 'maia']);
  await host.waitForFunction(() => document.querySelector('#maia-chk-arrows').checked);
  await studio.evaluate(() => {
    const analysis = window.__maiaStudioApp.positionAnalysis;
    analysis.active.entry.prediction.moves[0].uci = 'e2e4';
    analysis.render();
  });
  await expectArrows(['consensus']);
  await sfSwitch.uncheck();
  await expectArrows(['maia']);
  await studio.locator('#engine-candidate-lines .candidate-variation').dispatchEvent('mouseenter');
  await expectArrows(['maia']);
  await host.waitForFunction(() => !document.querySelector('#maia-chk-sf-arrows').checked);
  await host.locator('#weui-btn-more').click();
  await host.locator('#maia-chk-arrows').uncheck();
  await expectArrows([]);
  assert.equal(await maiaSwitch.isChecked(), false);
  await host.locator('#maia-chk-arrows').check();
  await expectArrows(['maia']);
  await studio.reload();
  await studio.waitForFunction(() => !!window.__maiaStudioApp?.positions.length);
  await studio.locator('#btn-settings').click();
  assert.equal(await maiaSwitch.isChecked(), true);
  assert.equal(await sfSwitch.isChecked(), false);

  assert.equal(protectedModelRequests,0,'Protected and no-readable-FEN fixtures must not download a model');
  results.extension={version,id,loaded:true,liveLock:true,conclusion:true,dismiss:true,refresh:true,lockMs,unknownAndLobbyCopy:true,lichessUnlock:true,independentArrowSettings:true,protectedModelRequests};
 }finally{await extensionContext.close();fs.rmSync(profile,{recursive:true,force:true});}
 fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
}finally{await browser.close();await new Promise(r=>server.close(r));globalThis.fetch=fetchOriginal;}
