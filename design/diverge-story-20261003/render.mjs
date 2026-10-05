// Re-render with: node render.mjs
// Set PLAYWRIGHT_MODULE and CHROME_PATH to use another local runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const pw=process.env.PLAYWRIGHT_MODULE || '/Users/yan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(pw).href);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={export:[],mobile:[],desktop:[],errors:[]};
await fs.mkdir(path.join(root,'png'),{recursive:true});
await fs.mkdir(path.join(root,'qa'),{recursive:true});
const url=pathToFileURL(path.join(root,'index.html')).href;

async function inspect(page, mode){
  return page.locator('.page').evaluateAll((pages,mode)=>pages.map(p=>{
    const pr=p.getBoundingClientRect();
    const body=p.querySelector('.body').getBoundingClientRect();
    const footer=p.querySelector('footer').getBoundingClientRect();
    const overflow=[];
    for(const e of p.querySelectorAll('h1,h2,h3,p,li,.page-header,.page-footer,.board,.cover-art,.heat-block')){
      const r=e.getBoundingClientRect();
      if(r.right>pr.right+1||r.left<pr.left-1||r.bottom>pr.bottom+1) overflow.push({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,30)});
    }
    return {id:p.id,width:pr.width,height:pr.height,bodyBottom:Math.round(body.bottom-pr.top),footerTop:Math.round(footer.top-pr.top),overlap:body.bottom>footer.top-12,overflow,mode};
  }),mode);
}

try{
  const page=await browser.newPage({viewport:{width:1080,height:1440},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(url+'?export=1'); await page.evaluate(()=>document.fonts.ready);
  report.fonts=await page.evaluate(()=>({status:document.fonts.status,pingfang:document.fonts.check('30px "PingFang SC"'),songti:document.fonts.check('30px "Songti SC"'),images:[...document.images].every(i=>i.complete&&i.naturalWidth>0)}));
  report.export=await inspect(page,'export');
  const ids=await page.locator('.page').evaluateAll(ps=>ps.map(p=>p.id));
  for(const id of ids) await page.locator(`[id="${id}"]`).screenshot({path:path.join(root,'png',id+'.png')});
  const exportTexts=await page.locator('.page').allTextContents();
  await page.setViewportSize({width:1440,height:1000}); await page.goto(url); await page.evaluate(()=>document.fonts.ready);
  report.desktop=await inspect(page,'desktop');
  report.samePageText=JSON.stringify(exportTexts)===JSON.stringify(await page.locator('.page').allTextContents());
  await page.screenshot({path:path.join(root,'qa','desktop.png'),fullPage:false});
  for(const width of [390,375]){
    await page.setViewportSize({width,height:844});
    const rows=await inspect(page,'mobile-'+width);
    const horizontal=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    report.mobile.push({width,horizontal,pages:rows});
    if(width===390)for(const id of ids)await page.locator(`[id="${id}"]`).screenshot({path:path.join(root,'qa','mobile-'+id+'.png')});
  }
  report.passed=report.errors.length===0&&report.samePageText&&report.fonts.status==='loaded'&&[...report.export,...report.desktop,...report.mobile.flatMap(m=>m.pages)].every(r=>!r.overlap&&r.overflow.length===0)&&report.mobile.every(m=>m.horizontal.scrollWidth<=m.width);
  await fs.writeFile(path.join(root,'qa','report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
