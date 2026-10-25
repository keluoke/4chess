// Real bundled Stockfish 19 Lite WASM, loaded through its CommonJS factory.
// The Worker adapter below only transports UCI strings to the actual engine.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {StockfishInBrowser} from '../engine/stockfish-inbrowser.js';
import {GameAnalyzer} from '../engine/game-analyzer.js';
const repo=fileURLToPath(new URL('../',import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'diverge-review-stockfish-'));
fs.copyFileSync(path.join(repo,'lib/stockfish-19.js'),path.join(tmp,'stockfish.cjs'));
const require=createRequire(import.meta.url),factory=require(path.join(tmp,'stockfish.cjs'));
const uci=[];
class RealStockfishAdapter {
 constructor(){
  this.queued=[];
  this.boot=factory()({locateFile:()=>path.join(repo,'lib/stockfish.wasm'),listener:line=>{uci.push(line);this.onmessage?.({data:line})}}).then(engine=>{this.engine=engine;for(const command of this.queued)this.postMessage(command);this.queued=[];});
 }
 postMessage(command){if(!this.engine){this.queued.push(command);return;}this.engine.ccall('command',null,['string'],[command],{async:true});}
 terminate(){}
}
globalThis.Worker=RealStockfishAdapter;
const sf=new StockfishInBrowser();
const ready=new Promise(resolve=>sf._readyResolve=resolve);sf.initDirectWorker('real-bundled-engine');await ready;
const mateFen='7k/5KQ1/8/8/8/8/8/8 b - - 1 1';
const terminalStart=uci.length;
const terminalResult=await sf.evaluate(mateFen,6,1000);
const terminalUci=uci.slice(terminalStart);
assert.equal(terminalResult.terminal,true);assert.equal(terminalResult.scoreCp,-10000);
const maia={isReady:true,modelKey:'review-fixture',async predict(){return {moves:[]}}};
const analyzer=new GameAnalyzer(sf,maia);
let oneMoveError;
try{await analyzer.analyzeGame(GameAnalyzer.parsePgn('[FEN "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1"]\n1. Qg7# 1-0'),{depth:6,forceRefresh:true})}catch(error){oneMoveError=error.message}
assert.equal(oneMoveError,undefined);
const foolsMate=await analyzer.analyzeGame(GameAnalyzer.parsePgn('1. f3 e5 2. g4 Qh4# 0-1'),{depth:6,forceRefresh:true});
assert.notEqual(foolsMate.allMoves.at(-1).severity,'unknown');assert.equal(foolsMate.coverageRateBlack,100);
const result={engineName:sf.engineName,engineBytes:fs.statSync(path.join(repo,'lib/stockfish.wasm')).size,terminalUci,terminalResult,oneMoveError,foolsMate:{totalMoves:foolsMate.totalMoves,lastSan:foolsMate.allMoves.at(-1).san,lastSeverity:foolsMate.allMoves.at(-1).severity,lastAccuracy:foolsMate.allMoves.at(-1).accuracy,lastEvalAfter:foolsMate.allMoves.at(-1).evalAfter,coverageRateBlack:foolsMate.coverageRateBlack},boundary:'Real bundled Stockfish WASM + actual StockfishInBrowser/GameAnalyzer source. Maia mocked with empty predictions; no platform or network used.'};

console.log(JSON.stringify(result,null,2));sf.reset();fs.rmSync(tmp,{recursive:true,force:true});
