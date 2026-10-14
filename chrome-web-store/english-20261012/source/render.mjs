import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/yan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp=require('/Users/yan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=process.cwd(),dir=path.join(root,'chrome-web-store/english-20261012');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(8799,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const assets=[['compare','screenshot-1-two-perspectives-1280x800.png',1280,800],['studio','screenshot-2-review-studio-1280x800.png',1280,800],['locked','screenshot-3-fair-play-1280x800.png',1280,800],['small','promo-small-440x280.png',440,280],['marquee','promo-marquee-1400x560.png',1400,560]];
const report=[];
try {
 for(const [kind,name,width,height] of assets){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,locale:'en-US'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:8799/chrome-web-store/english-20261012/source/artwork.html?kind=${kind}`);
  await page.waitForFunction(()=>window.__artReady);await page.waitForTimeout(400);
  const audit=await page.evaluate(()=>{
   const text=[];const walker=document.createTreeWalker(document.getElementById('art'),NodeFilter.SHOW_TEXT);let n;
   while(n=walker.nextNode()){const range=document.createRange();range.selectNode(n);const rect=range.getBoundingClientRect();if(rect.width&&rect.height&&getComputedStyle(n.parentElement).visibility!=='hidden'&&getComputedStyle(n.parentElement).display!=='none')text.push(n.textContent.trim());}
   const panel=window.__panel;return {visibleText:text.join(' '),locked:panel?.isFairPlayLocked,reviewDisabled:panel?.container.querySelector('#btn-trigger-standalone')?.disabled,candidates:panel?.container.querySelectorAll('.weui-move-item').length};
  });
  const raw=await page.screenshot();
  await sharp(raw).removeAlpha().png().toFile(path.join(dir,'images',name));
  const meta=await sharp(path.join(dir,'images',name)).metadata();
  const englishOnly=!/[\u3400-\u9fff]/u.test(audit.visibleText);
  report.push({file:name,width:meta.width,height:meta.height,channels:meta.channels,hasAlpha:meta.hasAlpha,englishOnly,errors,...audit});
  if(meta.width!==width||meta.height!==height||!englishOnly||errors.length)throw new Error(`Asset QA failed: ${name}`);
  if(kind==='locked'&&(!audit.locked||!audit.reviewDisabled))throw new Error('Locked UI is not disabled');
  console.log(`${name}: ${width}×${height}, English only, RGB`);await page.close();
 }
 const composites=[];
 for(let i=0;i<3;i++){const buffer=await sharp(path.join(dir,'images',assets[i][1])).resize(640,400).toBuffer();composites.push({input:buffer,left:20+(i%2)*660,top:20+Math.floor(i/2)*420});}
 composites.push({input:await sharp(path.join(dir,'images',assets[3][1])).toBuffer(),left:790,top:500});
 composites.push({input:await sharp(path.join(dir,'images',assets[4][1])).resize(1320,528).toBuffer(),left:20,top:860});
 await sharp({create:{width:1360,height:1408,channels:3,background:'#dfe5dc'}}).composite(composites).png().toFile(path.join(dir,'overview.png'));
 await fs.writeFile(path.join(dir,'qa/report.json'),JSON.stringify({passed:true,assets:report},null,2));
}finally{await browser.close();server.close();}
