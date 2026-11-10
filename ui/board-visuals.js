// Both host overlays and the review board use an 800-unit canvas: one cell = 100.
const NS = 'http://www.w3.org/2000/svg';
export function boardColors() {
  const root = document.querySelector('#maia3-intuition-panel, .diverge-ui');
  const style = root && getComputedStyle(root);
  const token = (name, fallback) => style?.getPropertyValue(name).trim() || fallback;
  return { green: token('--dg-green', '#285a46'), gold: token('--dg-gold', '#865315'), red: token('--dg-red', '#ac4b41'), blue: token('--dg-blue', '#376281') };
}

export function arrowMarkers(prefix, colors) {
  return `<defs>${Object.entries(colors).map(([key, color]) => {
    const length = key.endsWith('-secondary') ? 26 : 36;
    const width = key.endsWith('-secondary') ? 30 : 44;
    return `<marker id="${prefix}-${key}" viewBox="0 0 ${length} ${width}" refX="0" refY="${width / 2}" markerWidth="${length}" markerHeight="${width}" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 ${length} ${width / 2} 0 ${width}Z" fill="${color}"/></marker>`;
  }).join('')}</defs>`;
}

export function drawBoardArrow(group, { from, to, color, marker, role, secondary = false, opacity = .84, dashed = false }) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  if (!length || ![from.x, from.y, to.x, to.y].every(Number.isFinite)) return;
  const line = document.createElementNS(NS, 'line');
  const headLength = secondary ? 26 : 36;
  const values = { x1: from.x + dx / length * 12, y1: from.y + dy / length * 12, x2: to.x - dx / length * headLength, y2: to.y - dy / length * headLength,
    stroke: color, 'stroke-width': secondary ? 8 : 14, 'stroke-linecap': 'butt', 'marker-end': `url(#${marker})`, opacity, 'data-role': role };
  for (const [name, value] of Object.entries(values)) line.setAttribute(name, value);
  if (dashed) line.setAttribute('stroke-dasharray', '14 10');
  group.append(line);
  return line;
}

export function drawMoveBadge(group, { x, y, role, color, title = '' }) {
  if (!['sf', 'maia', 'consensus', 'error'].includes(role)) return;
  const badge = document.createElementNS(NS, 'g');
  badge.setAttribute('data-move-badge', role);
  const hex = color.replace('#', '');
  const light = hex.length === 6 && (parseInt(hex.slice(0, 2), 16) * 299 + parseInt(hex.slice(2, 4), 16) * 587 + parseInt(hex.slice(4, 6), 16) * 114) > 165000;
  const foreground = light ? '#17231b' : '#fff';
  // Place compact badges in square corners, leaving the piece and arrow tip visible.
  const left = role === 'maia' ? x - 44 : x + 20;
  const top = role === 'error' ? y + 20 : y - 44;
  const width = role === 'consensus' ? 40 : 24;
  const bx = role === 'consensus' ? x + 4 : left;
  badge.setAttribute('transform', `translate(${bx} ${top})`);
  const rect = document.createElementNS(NS, 'rect');
  for (const [key, value] of Object.entries({ width, height: 24, rx: 6, fill: color, stroke: '#ffffff', 'stroke-width': 1.5 })) rect.setAttribute(key, value);
  badge.append(rect);
  if (role === 'sf' || role === 'consensus') {
    // Original geometric star; no third-party icon assets.
    const star = document.createElementNS(NS, 'path');
    star.setAttribute('d', 'M12 4.5 14.3 9.2 19.5 10 15.7 13.6 16.6 18.8 12 16.3 7.4 18.8 8.3 13.6 4.5 10 9.7 9.2Z');
    star.setAttribute('fill', foreground); badge.append(star);
  }
  if (role !== 'sf') {
    const text = document.createElementNS(NS, 'text');
    for (const [key, value] of Object.entries({ x: role === 'consensus' ? 29 : 12, y: 12.5, fill: foreground, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'system-ui, sans-serif', 'font-size': 15, 'font-weight': 750 })) text.setAttribute(key, value);
    text.textContent = role === 'error' ? '!' : 'M'; badge.append(text);
  }
  const tooltip = document.createElementNS(NS, 'title'); tooltip.textContent = title || { sf: 'Stockfish', maia: 'Maia', consensus: 'Stockfish + Maia', error: 'Played move' }[role]; badge.append(tooltip);
  group.append(badge);
}
