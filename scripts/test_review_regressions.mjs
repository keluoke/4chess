import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { MaiaEngine } from '../engine/maia-engine.js';
import { MaiaInBrowserEngine } from '../engine/maia-inbrowser.js';
import { ModelCache } from '../engine/model-cache.js';
import { ChessBoard } from '../engine/chess-core.js';

let dom = new JSDOM('<body><div class="game__meta"><a>LostKnight</a></div>', { url: 'https://lichess.org/AbCd1234' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver });
assert.equal(FairPlayGuard.isLiveGameInProgress(), true, 'A player name is not a concluded result');
dom.window.close();
dom = new JSDOM('<body><button aria-label="Resign" hidden></button><button aria-label="Resign"></button><div class="move-list-result">1-0</div>', { url: 'https://www.chess.com/play/online' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver });
assert.equal(FairPlayGuard.isLiveGameInProgress(), true, 'Any visible active control overrides a residual result');
document.querySelectorAll('button').forEach(el => el.remove());
assert.equal(FairPlayGuard.isLiveGameInProgress(), false, 'The remaining result survives dismissing the modal');
let changed;
FairPlayGuard.startObserver(value => { changed = value; });
document.body.insertAdjacentHTML('beforeend', '<div class="clock-running"></div>');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(changed, true, 'New-game lock arrives in the mutation batch');
FairPlayGuard._observer.disconnect();
for (const data of [{}, { moveList:'mC0K', pgnHeaders:{Result:'*'} }, { result:'1-0', pgnHeaders:{Result:'0-1'} }, {isFinished:false,result:'1-0'}, {pgn:'[Result "1-0"]\n1. e4 *'}]) assert.equal(FairPlayGuard.verifyConcludedGame(data).ok, false);
for (const data of [{pgnHeaders:{Result:'1-0'}}, '[Result "1/2-1/2"]\n1. e4 e5 1/2-1/2']) assert.equal(FairPlayGuard.verifyConcludedGame(data).ok, true);
document.body.innerHTML = '<div class="move-list-result">1-0</div>';

for (const pgn of ['1. e4 (1. d4 d5 (1... Nf6) 2. c4) e5 2. Nf3 Nc6', '1. e4 ; line comment\ne5 2. Nf3 Nc6']) {
 const moves = GameAnalyzer.parsePgn(pgn);
 assert.deepEqual(moves.map(m => m.san), ['e4','e5','Nf3','Nc6']);
 assert.equal(GameAnalyzer.buildPositionChain(moves).length, 5);
}
class WorkerFixture { postMessage(msg) { (this.commands ||= []).push(msg); } terminate() { this.terminated = true; } }
globalThis.Worker = WorkerFixture;
const sf = new StockfishInBrowser(); sf.initDirectWorker('fixture'); sf.worker.onmessage({data:'readyok'});
const first = sf.evaluate(ChessBoard.INITIAL_FEN,14,1000), second = sf.evaluate(ChessBoard.INITIAL_FEN,10,1000);
sf.stop(); const before = sf.worker.commands.length; sf.worker.onmessage({data:'bestmove e2e4'});
assert.equal(sf.worker.commands.length, before, 'Explicit cancellation cannot launch queued searches');
assert.equal(await first,null); assert.equal(await second,null); sf.reset();

const pendingInit = new StockfishInBrowser();
let releaseInit;
pendingInit.worker = new WorkerFixture();
pendingInit.initialize = () => new Promise(resolve => { releaseInit = () => { pendingInit.isReady = true; resolve(true); }; });
const delayedEvaluation = pendingInit.evaluate(ChessBoard.INITIAL_FEN);
pendingInit.stop();
releaseInit();
assert.equal(await delayedEvaluation, null, 'Cancel must revoke work waiting for initialization');
assert.equal(pendingInit.worker.commands?.filter(c => String(c).startsWith('go ')).length || 0, 0);
pendingInit.reset();

let releasePlayed, started;
const searching = new Promise(resolve => { started = resolve; });
const calls=[];
const reviewSf={isReady:true,engineKey:'regression',stop(){},async evaluate(fen,depth){
 calls.push({depth,locked:FairPlayGuard.isLiveGameInProgress()});
 if(depth===6)return {scoreCp:fen===ChessBoard.INITIAL_FEN?200:0,score:'+2.00',bestMove:{uci:'e2e4',san:'e4'}};
 if(depth===12)return {scoreCp:200,score:'+2.00',bestMove:{uci:'e2e4',san:'e4'},lines:[{uci:'e2e4',deltaCp:0}]};
 if(!releasePlayed){started();return new Promise(resolve => {releasePlayed=resolve;});}
 return {scoreCp:0,score:'0.00',bestMove:{uci:'e7e5',san:'e5'}};
}};
const analyzer = new GameAnalyzer(reviewSf,{isReady:true,modelKey:'regression',async predict(){return {moves:[{uci:'h2h3',san:'h3',prob:60,rawProb:.6},{uci:'a2a3',san:'a3',prob:30,rawProb:.3}]};}});
const work=analyzer.analyzeGame(GameAnalyzer.parsePgn('1. a3'),{forceRefresh:true});
await searching; document.body.innerHTML='<div class="clock-running"></div>'; analyzer.cancel(); releasePlayed(null);
assert.equal(await work,null); assert.equal(calls.filter(c=>c.locked).length,0,'No search may start after fair-play lock');
document.body.innerHTML='<div class="move-list-result">1-0</div>';
const model=new MaiaEngine(null,{isReady:true,initialize:async()=>true});
const initialization=model.initialize(); await new Promise(r=>setImmediate(r));model.worker.onerror({message:'Injected crash'});
await assert.rejects(initialization,/Injected crash/);assert.equal(model.isLoading,false);assert.equal(model.initPromise,null);model.dispose();

const suspended = new MaiaEngine(null,{isReady:true,initialize:async()=>true,reset(){this.isReady=false;}});
const staleWorker = suspended.worker;
const suspendedInit = suspended.initialize(); await new Promise(r=>setImmediate(r));
suspended.suspendForFairPlay();
assert(staleWorker.terminated); await assert.rejects(suspendedInit,/suspended|session/);
assert.equal(suspended.initPromise,null);assert.equal(suspended.status.maia.state,'uninitialized');
const resumed = suspended.initialize(); await new Promise(r=>setImmediate(r));
const resumedWorker = suspended.worker;
staleWorker.onmessage({data:{type:'loadModel_result',success:true,data:{}}});
assert(suspended._workerLoadResolve,'A stale Worker must not settle the resumed loader');
resumedWorker.onmessage({data:{type:'loadModel_result',success:true,data:{dim_vit:256}}});
await resumed;assert(suspended.isReady);suspended.dispose();

const read=ModelCache.getModel, clear=ModelCache.clearCache, originalFetch=globalThis.fetch;
let cleared=0, fetched=0;
ModelCache.getModel=async()=>new ArrayBuffer(1000001); ModelCache.clearCache=async()=>{cleared++;};
globalThis.fetch=async()=>{fetched++;throw new Error('Network intentionally unavailable');};
const rawModel=new MaiaInBrowserEngine();await assert.rejects(rawModel.loadModel(),/Network intentionally unavailable/);
assert(cleared>0);assert(fetched>0,'Bad cache must fall back to a fresh network request');
ModelCache.getModel=read;ModelCache.clearCache=clear;globalThis.fetch=originalFetch;
dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.Worker;delete globalThis.MutationObserver;
console.log('PASS review regressions: strict conclusion, hidden controls, immediate lock, nested PGN, cancel queue, deep review cancellation, Worker crash, cache recovery');
