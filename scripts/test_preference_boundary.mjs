import assert from 'node:assert/strict';
import {preferencePatch} from '../engine/engine-preferences.js';
import {loadStandardWorker} from '../engine/stockfish-standard-web.js';
import {STOCKFISH_VARIANTS} from '../engine/engine-variants.js';
import {ModelCache} from '../engine/model-cache.js';
assert.deepEqual(preferencePatch(null),{});
assert.deepEqual(preferencePatch({maiaVariant:'__proto__',stockfishVariant:'constructor',defaultElo:'2200',command:'go depth 20',pgn:'secret',cloudflareCdnUrl:'https://invalid.test'}),{});
assert.deepEqual(preferencePatch({maiaVariant:'79m',defaultElo:1700,maia3_lang:'en',showHeatmap:true}),{maiaVariant:'79m',defaultElo:1700,maia3_lang:'en',showHeatmap:true,maia3_target_elo:1700});
const original={bytes:STOCKFISH_VARIANTS.standard.bytes,fetch:globalThis.fetch,get:ModelCache.getModel,save:ModelCache.saveModel};
let saved=0;
try {
  STOCKFISH_VARIANTS.standard.bytes=4;
  ModelCache.getModel=async()=>null;
  ModelCache.saveModel=async(_key,buffer)=>{saved++;assert.deepEqual([...new Uint8Array(buffer)],[1,2,3,4]);return true};
  const response=chunks=>new Response(new ReadableStream({start(c){for(const bytes of chunks)c.enqueue(Uint8Array.from(bytes));c.close()}}));
  globalThis.fetch=async()=>response([[1,2],[3,4]]);
  const progress=[];
  const engine={lifecycleEpoch:1,onDownloadProgress(){progress.push(this.downloadProgress.percent)},initDirectWorker(url){this.workerUrl=url}};
  await loadStandardWorker(engine,1);assert.equal(saved,1);assert.deepEqual(progress,[0,50,100]);assert(engine.workerUrl.includes('stockfish-19-standard.js'));URL.revokeObjectURL(engine.wasmBlobUrl);
  globalThis.fetch=async()=>response([[1,2]]);
  await assert.rejects(loadStandardWorker({lifecycleEpoch:1},1),/Incomplete/);assert.equal(saved,1);
  globalThis.fetch=async()=>response([[1,2,3,4,5]]);
  await assert.rejects(loadStandardWorker({lifecycleEpoch:1},1),/Invalid/);assert.equal(saved,1);
  globalThis.fetch=async()=>response([[1,2],[3,4]]);
  const cancelled={lifecycleEpoch:1,onDownloadProgress(){if(this.downloadProgress.percent===50)this.lifecycleEpoch++},initDirectWorker(){throw Error('Cancelled download must not start a worker')}};
  await loadStandardWorker(cancelled,1);assert.equal(saved,1);
  console.log('PASS UI preference allowlist and types; complete/cancelled/truncated/oversized SF streams and progress');
} finally {STOCKFISH_VARIANTS.standard.bytes=original.bytes;globalThis.fetch=original.fetch;ModelCache.getModel=original.get;ModelCache.saveModel=original.save}
