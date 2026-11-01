import { t, onLanguageChange } from './i18n.js?v=20261101-ultrawide';

/** Move the existing chart, preserving its data and listeners across breakpoints. */
export function initWorkbenchLayout() {
  const layout = document.querySelector('.studio-layout');
  const board = layout.querySelector('.board-column');
  const analysis = layout.querySelector('.analysis-column');
  const insight = layout.querySelector('.insight-column');
  const chart = document.getElementById('eval-chart-container');
  const wide = matchMedia('(min-width: 1800px)');
  const key = 'diverge-study-columns-v1';
  let saved = {}, frame = 0;
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  } catch { /* Optional local preference. */ }
  const handles = ['board', 'insight'].map((name, index) => {
    const handle = document.createElement('div');
    handle.className = `workspace-divider divider-${name}`;
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.dataset.name = name;
    layout.append(handle);
    const reset = () => { delete saved[name]; persist(); update(); };
    handle.addEventListener('dblclick', reset);
    handle.addEventListener('keydown', event => {
      if (event.key === 'Home') { event.preventDefault(); event.stopPropagation(); reset(); return; }
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const current = (index ? insight : board).getBoundingClientRect().width;
      setWidth(name, current + (event.key === 'ArrowRight' ? 24 : -24) * (index ? -1 : 1));
      persist();
    });
    let drag;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag = { x: event.clientX, width: (index ? insight : board).getBoundingClientRect().width };
      handle.setPointerCapture(event.pointerId);
      layout.classList.add('resizing-columns');
    });
    handle.addEventListener('pointermove', event => {
      if (drag) setWidth(name, drag.width + (event.clientX - drag.x) * (index ? -1 : 1));
    });
    const finish = () => { if (!drag) return; drag = null; layout.classList.remove('resizing-columns'); persist(); };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
    return handle;
  });
  function persist() { try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* Storage may be disabled. */ } }
  function bounds(name) {
    const width = layout.clientWidth;
    const header = document.querySelector('.studio-navbar').getBoundingClientRect().height;
    const hasInsight = getComputedStyle(insight).display !== 'none';
    const style = getComputedStyle(layout);
    const usable = width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.columnGap) * (hasInsight ? 2 : 1);
    const neighbour = name === 'board' ? (hasInsight ? insight.getBoundingClientRect().width : 0) : board.getBoundingClientRect().width;
    const remaining = usable - neighbour - 480;
    const boardMin = Math.min(440, Math.max(240, innerHeight - header - 180));
    return name === 'board' ? [boardMin, Math.max(boardMin, Math.min(939, innerHeight - header - 180, width * .42, remaining))] : [360, Math.max(360, Math.min(width * .32, remaining))];
  }
  function setWidth(name, width) {
    const [min, max] = bounds(name);
    saved[name] = Math.max(min, Math.min(max, width)) / layout.clientWidth;
    update();
  }
  function update() {
    const destination = wide.matches ? analysis : board;
    if (chart.parentElement !== destination) destination.append(chart);
    for (const handle of handles) {
      const name = handle.dataset.name;
      const [min, max] = bounds(name);
      const ratio = saved[name];
      const property = `--study-${name}-width`;
      if (Number.isFinite(ratio) && ratio > 0 && wide.matches) layout.style.setProperty(property, `${Math.max(min, Math.min(max, ratio * layout.clientWidth))}px`);
      else layout.style.removeProperty(property);
    }
    for (const [index, handle] of handles.entries()) {
      const [min, max] = bounds(handle.dataset.name);
      handle.setAttribute('aria-label', t(index ? 'resizeInsight' : 'resizeBoard'));
      handle.title = handle.getAttribute('aria-label');
      const target = index ? insight : board;
      const gap = parseFloat(getComputedStyle(layout).columnGap) || 22;
      handle.style.left = `${index ? target.offsetLeft - gap / 2 : target.offsetLeft + target.offsetWidth + gap / 2}px`;
      handle.setAttribute('aria-valuemin', String(Math.round(min)));
      handle.setAttribute('aria-valuemax', String(Math.round(max)));
      handle.setAttribute('aria-valuenow', String(Math.round(target.getBoundingClientRect().width)));
    }
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }
  wide.addEventListener('change', update);
  window.addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(layout);
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  onLanguageChange(update);
  update();
  return { update };
}
