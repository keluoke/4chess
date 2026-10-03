const root = document.getElementById('preview-content');
const description = document.getElementById('preview-description');
let activeView = location.hash.slice(1) || 'studio';
let dark = false;
let generation = 0;
const mockChrome = `const prefs = {}; window.chrome = { i18n: { getMessage: () => '', getUILanguage: () => 'zh-CN' }, runtime: {}, tabs: {query: (q, cb) => cb([])}, storage: { local: { get: (keys, cb) => cb(prefs), set: values => Object.assign(prefs, values) }, onChanged: {addListener: () => {}} } };`;
function syncTheme() {
  document.body.classList.toggle('dark', dark);
  const button = document.getElementById('theme-toggle');
  button.textContent = dark ? '浅色预览' : '深色预览';
  button.setAttribute('aria-pressed', String(dark));
  document.querySelectorAll('iframe').forEach(frame => {
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    doc.body.dataset.theme = dark ? 'dark' : 'light';
    doc.querySelectorAll('#maia3-intuition-panel, #maia-wechat-float').forEach(el => el.dataset.theme = dark ? 'dark' : 'light');
    doc.body.classList.toggle('dark', dark);
    doc.querySelectorAll('[data-theme-toggle]').forEach(b => { b.textContent = dark ? '浅色' : '深色'; b.setAttribute('aria-label', dark ? '切换为浅色界面' : '切换为深色界面'); b.setAttribute('aria-pressed', String(dark)); });
  });
}
async function render(view) {
  if (!['studio','floating','popup','system'].includes(view)) view = 'studio';
  activeView = view;
  const epoch = ++generation;
  location.hash = view;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  root.replaceChildren();
  if (view === 'system') {
    description.textContent = '统一的视觉语言 · 状态真实、内容优先、渐进展开';
    root.innerHTML = `<section class="app-shell system-shell"><div class="system-header"><div><div class="eyebrow">THE DIVERGE CHESS STUDY</div><h1>安静地，看见另一条路。</h1><p>暖白纸面与墨绿。把注意力交还给棋盘与选择。</p></div><span class="tag">设计系统 v2</span></div><div class="system-grid"><article class="system-card"><h3>颜色有固定含义</h3><div class="swatch"><i class="swatch-color" style="background:var(--green)"></i>墨绿 · 品牌与主操作</div><div class="swatch"><i class="swatch-color" style="background:var(--blue)"></i>蓝色 · 引擎推荐 / 妙手</div><div class="swatch"><i class="swatch-color" style="background:var(--gold)"></i>琥珀 · 人类直觉 / 俗手</div><div class="swatch"><i class="swatch-color" style="background:var(--red)"></i>砖红 · 错误 / 严重损失</div><p>类型同时使用文字标签，不依赖颜色判断。</p></article><article class="system-card"><h3>排版与数字</h3><div class="focus-heading" style="margin-top:0">比较三种选择</div><p>衬线标题保留棋谱与阅读的气质。操作与说明使用系统无衬线字体。</p><div class="compare-san" style="margin-top:20px">24. Rxd4 &nbsp; +0.42</div><p>着法与评分使用等宽数字。未知结果显示 —，避免制造确定感。</p></article><article class="system-card"><h3>操作与层级</h3><button class="button primary" data-open-studio>进入全盘分析 ↗</button><button class="button" data-open-popup>设置与偏好</button><button class="button" disabled>对局中已锁定</button><p>一个主要入口。技术设置折叠；引擎状态放在内容之后。</p><span class="tag" style="margin-top:15px">仅供复盘</span></article></div><div class="lifecycle"><article class="life-card"><div class="life-number">01 / IDLE</div><h3>赛前待命</h3><p>状态显示「未启动」，没有箭头、热力图或建议。</p></article><article class="life-card"><div class="life-number">02 / LOCKED</div><h3>对局进行中</h3><p>清空建议，停机，锁定全盘分析。明确说明结束后自动解锁。</p></article><article class="life-card"><div class="life-number">03 / REVIEW</div><h3>赛后立即解锁</h3><p>结算明确后恢复研判和复盘入口，无需跳转分析台。</p></article><article class="life-card"><div class="life-number">04 / PERSISTENT</div><h3>关闭弹窗或刷新</h3><p>完赛证据仍在，保持可复盘；开始新局则立即上锁。</p></article></div><p class="system-footer">三种界面同一套令牌、焦点样式与系统明暗适配。桌面三栏，平板两栏，手机按棋盘 → 局面 → 记谱排列。</p></section>`;
    root.querySelector('[data-open-studio]').onclick = () => render('studio');
    root.querySelector('[data-open-popup]').onclick = () => render('popup');
    return;
  }
  const frame = document.createElement('iframe');
  frame.title = {studio:'全盘分析正式界面',popup:'扩展 Popup 正式界面',floating:'悬浮窗正式组件与状态预览'}[view];
  frame.style.cssText = 'width:100%;height:920px;border:1px solid var(--line);border-radius:12px;background:var(--surface);display:block;';
  frame.addEventListener('load', syncTheme);
  if (view === 'popup') {
    description.textContent = 'Popup 正式 HTML / CSS · 预览中设置仅写入内存，不修改扩展偏好';
    const stage = document.createElement('div');stage.className = 'popup-stage';root.append(stage);
    frame.style.width = '370px';frame.style.maxWidth = '100%';frame.style.height = '810px';frame.style.boxShadow = 'var(--shadow)';stage.append(frame);
    const html = await fetch('../../popup/popup.html').then(r => {if(!r.ok)throw new Error('Popup preview load failed');return r.text();});
    if(epoch !== generation)return;
    const base = new URL('../../popup/',location.href).href;
    frame.srcdoc = html.replace('<head>',`<head><base href="${base}"><script>${mockChrome}<\/script>`);
  } else {
    description.textContent = view === 'studio' ? '正式全盘分析页 · 导入与示例入口可用 · 分析会按需加载引擎' : '正式悬浮窗组件 · 所有候选与数值均为 UI 示例 · 此页不启动引擎';
    frame.src = view === 'studio' ? '../../analysis/index.html' : 'floating.html';
    root.append(frame);
  }
}
root.addEventListener('click', e => { if(e.target.matches('[data-view]'))render(e.target.dataset.view); });
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => render(b.dataset.view));
document.getElementById('theme-toggle').onclick = () => {dark = !dark;syncTheme();};
window.addEventListener('hashchange', () => { const next=location.hash.slice(1);if(next!==activeView)render(next); });
render(activeView).catch(error => {root.textContent = `预览载入失败：${error.message}`;});
