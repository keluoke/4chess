import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/yan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = process.cwd();
const out = path.join(root, 'chrome-web-store/english-20261012');
const mime = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.wasm':'application/wasm' };
const server = http.createServer(async(req,res)=>{try { const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname)); const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(8799,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:590},deviceScaleFactor:1,locale:'en-US'});
page.on('console',m=>{if(m.type()==='error')console.log('Browser error:',m.text());});
try {
  await page.goto('http://127.0.0.1:8799/analysis/index.html?lang=en&maia=5m&sf=lite');
  await page.waitForFunction(()=>window.__maiaStudioApp);
  const pgn='[Event "The Opera Game"]\n[Site "Paris"]\n[Date "1858.??.??"]\n[White "Paul Morphy"]\n[Black "Duke & Count"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0';
  await fs.writeFile(path.join(out,'source/opera-game.pgn'),pgn);
  await page.evaluate(pgn=>window.__maiaStudioApp.loadGameFromPgn(pgn),pgn);
  console.log('Imported completed Opera Game. Running actual engines.');
  await page.waitForFunction(()=>window.__maiaStudioApp.reviewResult,{},{timeout:240000});
  console.log('Whole-game review completed.');
  await page.evaluate(()=>window.__maiaStudioApp.goToPly(18,{silent:true}));
  await page.waitForFunction(()=>{const a=window.__maiaStudioApp.positionAnalysis.active;return a?.entry.sf&&a?.entry.prediction?.moves?.length;},{},{timeout:120000});
  await page.waitForTimeout(1500);
  const data=await page.evaluate(async()=>{
    const app=window.__maiaStudioApp;
    const {ctx,entry}=app.positionAnalysis.active;
    const pred=await app.maiaEngine.predict(ctx.fen,app.currentElo,entry.sf,null,ctx.history);
    return {fen:ctx.fen,ply:ctx.ply,prediction:pred,review:app.reviewResult,positions:app.positions,engine:entry.sf};
  });
  await fs.writeFile(path.join(out,'source/engine-evidence.json'),JSON.stringify(data,null,2));
  // The English UI offers a Chinese-language switch. Hide that control in this English-only asset.
  await page.addStyleTag({content:'#btn-lang-toggle{display:none}'});
  await page.evaluate(()=>{document.querySelectorAll('.analysis-column,.move-notation-table,.blunder-list').forEach(el=>el.scrollTop=0);});
  await page.screenshot({path:path.join(out,'source/studio.png')});
  console.log('Saved authentic studio capture and engine evidence.');
} finally {await browser.close();server.close();}
