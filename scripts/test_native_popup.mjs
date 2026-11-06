// Actual browser action popup, triggered through Chrome's extension action API.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { nativePopup } from './native_popup_helper.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'diverge-popup-cdp-'));
const extension = path.join(temporary, 'extension'); fs.mkdirSync(extension);
const output = path.join(root, 'artifacts/floating-ux-delivery'); fs.mkdirSync(output, { recursive: true });
execFileSync('unzip', ['-q', path.join(root, `releases/diverge-extension-v${JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).version}.zip`), '-d', extension]);
const context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), { channel: 'chromium', headless: false, locale: 'zh-CN', args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await context.route('https://www.chess.com/play/online', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div class="clock-running">10:00</div></body></html>' }));
  const host = await context.newPage(); await host.goto('https://www.chess.com/play/online'); await host.locator('#maia3-intuition-panel').waitFor();
  // This invokes the actual extension action for the host tab, without needing
  // a globally focused OS window or falling back to a normal extension page.
  const popup = await nativePopup(context, worker, host);
  await popup.run("document.querySelector('#scan-settings').click()");
  await popup.wait("!document.querySelector('#toggle-panel-switch').closest('[hidden]')");
  const data = await popup.run("({url:location.href,lang:document.documentElement.lang,guide:document.querySelector('#guide-link').innerText,models:document.querySelectorAll('#model-preset-select option').length,width:innerWidth,height:innerHeight,active:document.querySelector('#toggle-panel-switch').checked})");
  console.log('Native popup', JSON.stringify(data)); assert.equal(data.models, 3); assert.equal(data.width, 368); assert(data.height <= 600); assert(data.active);
  const screenshot = async name => { const image = await popup.rpc('Page.captureScreenshot'); fs.writeFileSync(path.join(output, name), Buffer.from(image.data, 'base64')); };
  await screenshot('native-popup-default.png');
  await popup.run("(()=>{const field=document.querySelector('#toggle-panel-switch');field.checked=false;field.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await host.locator('#maia3-intuition-panel').waitFor({ state: 'hidden' });
  await popup.run("(()=>{const field=document.querySelector('#toggle-panel-switch');field.checked=true;field.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.advanced-settings').open=true;document.querySelector('.popup-footer').scrollIntoView({block:'end'});})()");
  await host.locator('#maia3-intuition-panel').waitFor({ state: 'visible' });
  const footer = await popup.run("(()=>{const r=document.querySelector('.popup-footer').getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:innerHeight}})()");
  assert(footer.top >= 0 && footer.bottom <= footer.height + 1); await screenshot('native-popup-settings.png');
  await popup.run("(()=>{const field=document.querySelector('#ui-language');field.value='en';field.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await popup.wait("document.documentElement.lang==='en'");
  assert.match(await popup.run("document.querySelector('#guide-link').textContent"), /First time|First use|New to/);
  await screenshot('native-popup-settings-en.png');
  await host.waitForFunction(() => /Live/.test(document.querySelector('#maia-turn-pill').textContent));
  console.log('PASS actual headed native browser action popup: bounded viewport, 3 models, bilingual settings, footer scrolling and host panel hide/restore');
} finally { await context.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
