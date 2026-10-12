import { GLYPH_TEMPLATES } from './coordinate-templates.js';

/**
 * Chessboard Coordinate Detector and Perspective Inference
 * Detects coordinate labels (a–h, 1–8) in outer gutters or inner cell corners.
 * Distinguishes White perspective (a-h left-to-right, 8-1 top-to-bottom)
 * from Black perspective (h-a left-to-right, 1-8 top-to-bottom).
 */

/**
 * Extracts a normalized sub-patch from grayscale image.
 */
function extractPatch(gray, srcW, srcH, x, y, w, h) {
  const patch = new Float32Array(w * h);
  for (let dy = 0; dy < h; dy++) {
    const sy = Math.max(0, Math.min(srcH - 1, Math.floor(y + dy)));
    for (let dx = 0; dx < w; dx++) {
      const sx = Math.max(0, Math.min(srcW - 1, Math.floor(x + dx)));
      patch[dy * w + dx] = gray[sy * srcW + sx];
    }
  }
  return patch;
}

/**
 * Evaluates whether a patch contains a character glyph.
 * Computes contrast, binarized edge energy, and bounding profile.
 */
function evaluateGlyphPresence(patch, w, h) {
  let min = 1, max = 0, sum = 0;
  for (let i = 0; i < patch.length; i++) {
    const v = patch[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const contrast = max - min;
  if (contrast < 0.20) return null; // Insufficient contrast

  const mean = sum / patch.length;
  // Binarize based on polarity (dark glyph on light background or vice versa)
  const isDarkOnLight = (mean > 0.5);
  let foregroundCount = 0;
  let topHalfEnergy = 0;
  let bottomHalfEnergy = 0;
  let leftHalfEnergy = 0;
  let rightHalfEnergy = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = patch[y * w + x];
      const isFg = isDarkOnLight ? (v < mean - contrast * 0.25) : (v > mean + contrast * 0.25);
      if (isFg) {
        foregroundCount++;
        if (y < h / 2) topHalfEnergy++;
        else bottomHalfEnergy++;
        if (x < w / 2) leftHalfEnergy++;
        else rightHalfEnergy++;
      }
    }
  }

  const fgRatio = foregroundCount / (w * h);
  if (fgRatio < 0.03 || fgRatio > 0.60) return null; // Noise or solid background

  return {
    contrast,
    foregroundCount,
    fgRatio,
    topHalfRatio: topHalfEnergy / Math.max(1, foregroundCount),
    bottomHalfRatio: bottomHalfEnergy / Math.max(1, foregroundCount),
    leftHalfRatio: leftHalfEnergy / Math.max(1, foregroundCount),
    rightHalfEnergy: rightHalfEnergy / Math.max(1, foregroundCount)
  };
}

/**
 * Compatibility entry point for normalized digit template matching.
 */
function scoreDigit1vs8(patch, w, h) {
  const result = recognizeCoordinateGlyph(patch, w, h, '12345678');
  return result && (result.char === '1' || result.char === '8') ? result.char : null;
}

/**
 * Compatibility entry point for normalized letter template matching.
 */
function scoreLetterAvsH(patch, w, h) {
  const result = recognizeCoordinateGlyph(patch, w, h, 'abcdefgh');
  return result && (result.char === 'a' || result.char === 'h') ? result.char : null;
}

// Match the tight glyph, not foreground occupancy in a large gutter window.
function recognizeCoordinateGlyph(patch, w, h, alphabet) {
  let min = 1, max = 0, sum = 0;
  for (const v of patch) { min = Math.min(min, v); max = Math.max(max, v); sum += v; }
  if (max - min < 0.2) return null;
  const dark = sum / patch.length > (min + max) / 2;
  const threshold = (min + max) / 2;
  const mask = new Uint8Array(w * h);
  let left = w, right = -1, top = h, bottom = -1, count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fg = dark ? patch[y * w + x] < threshold : patch[y * w + x] > threshold;
    if (fg) { mask[y * w + x] = 1; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++; }
  }
  const gw = right - left + 1, gh = bottom - top + 1;
  if (count < 8 || gh < 6 || gw < 2 || gw / gh > 1.4 || gh / h > 0.95 || count / (gw * gh) > 0.8) return null;
  const normalized = new Uint8Array(16 * 24);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
    let hits = 0, n = 0;
    for (let sy = Math.floor(y * gh / 24); sy < Math.ceil((y + 1) * gh / 24); sy++) {
      for (let sx = Math.floor(x * gw / 16); sx < Math.ceil((x + 1) * gw / 16); sx++) { hits += mask[(top + sy) * w + left + sx]; n++; }
    }
    normalized[y * 16 + x] = hits / n >= 0.4 ? 1 : 0;
  }
  const scores = new Map();
  for (const template of GLYPH_TEMPLATES) {
    if (!alphabet.includes(template.char)) continue;
    let diff = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) diff += Math.abs(normalized[y * 16 + x] - ((template.rows[y] >> x) & 1));
    const score = diff / 384 + Math.min(1, Math.abs(Math.log((gw / gh) / template.aspect))) * 0.1;
    scores.set(template.char, Math.min(score, scores.has(template.char) ? scores.get(template.char) : Infinity));
  }
  const ranked = [...scores].sort((a, b) => a[1] - b[1]);
  if (ranked.length < 2 || ranked[0][1] > 0.28 || ranked[1][1] - ranked[0][1] < 0.025) return null;
  return { char: ranked[0][0], distance: ranked[0][1], margin: ranked[1][1] - ranked[0][1] };
}

/**
 * Analyzes borders and gutters for coordinates to infer board perspective.
 * @param {Float32Array} gray - grayscale float image
 * @param {number} width - image width
 * @param {number} height - image height
 * @param {object} box - { x, y, width, height }
 * @returns {object|null} { perspective: 'w'|'b', confidence: number, evidence: string }
 */
function detectBoardPerspective(gray, width, height, box) {
  if (!gray || !box || box.hasBoard === false) return null;
  const cellW = box.width / 8, cellH = box.height / 8;
  const margins = { top: box.y, bottom: height - box.y - box.height, left: box.x, right: width - box.x - box.width };
  // Pieces inside corner cells are never coordinate evidence.
  if (Math.max(...Object.values(margins)) < 14) return null;
  let normalized = gray;
  if (gray.some(v => v > 1)) normalized = Float32Array.from(gray, v => v / 255);
  const sequences = [];
  for (const side of ['bottom', 'top', 'left', 'right']) {
    if (margins[side] < 14) continue;
    const horizontal = side === 'bottom' || side === 'top';
    const alphabet = horizontal ? 'abcdefgh' : '12345678';
    const observed = [];
    for (let i = 0; i < 8; i++) {
      let x, y, w, h;
      if (horizontal) {
        w = Math.round(cellW * 0.6); h = Math.min(Math.round(cellH * 0.7), Math.floor(margins[side]) - 3);
        x = box.x + cellW * (i + 0.2); y = side === 'bottom' ? box.y + box.height + 2 : box.y - h - 1;
      } else {
        w = Math.min(Math.round(cellW * 0.7), Math.floor(margins[side]) - 3); h = Math.round(cellH * 0.6);
        x = side === 'left' ? box.x - w - 1 : box.x + box.width + 2; y = box.y + cellH * (i + 0.2);
      }
      const glyph = recognizeCoordinateGlyph(extractPatch(normalized, width, height, x, y, w, h), w, h, alphabet);
      observed.push(glyph ? glyph.char : null);
    }
    const white = horizontal ? 'abcdefgh' : '87654321';
    const black = white.split('').reverse().join('');
    function count(expected) {
      return { matches: observed.filter((c, i) => c === expected[i]).length, mismatches: observed.filter((c, i) => c !== null && c !== expected[i]).length };
    }
    const a = count(white), b = count(black);
    const perspective = a.matches >= 6 && a.mismatches === 0 ? 'w' : b.matches >= 6 && b.mismatches === 0 ? 'b' : null;
    sequences.push({ side, axis: horizontal ? 'file' : 'rank', observed: observed.map(c => c || '?').join(''), perspective, matches: perspective === 'w' ? a.matches : perspective === 'b' ? b.matches : 0 });
  }
  const support = sequences.filter(s => s.perspective);
  if (!support.length) return null;
  const perspectives = new Set(support.map(s => s.perspective));
  const detail = sequences.map(s => `${s.side}: ${s.observed}`).join('；');
  if (perspectives.size > 1) return { perspective: 'w', confidence: 0.5, isConflicted: true, hasStrongGutterAlignment: false, detail: `坐标序列冲突，待确认（${detail}）`, sequences };
  const hasBothAxes = new Set(support.map(s => s.axis)).size === 2;
  const completeSequence = support.some(s => s.matches === 8);
  const strong = hasBothAxes || completeSequence;
  return { perspective: support[0].perspective, confidence: hasBothAxes ? 0.98 : completeSequence ? 0.96 : 0.8, isConflicted: false, hasStrongGutterAlignment: strong, detail: `已匹配外框坐标序列（${detail}）`, sequences };
}

export { 
  detectBoardPerspective,
  extractPatch,
  evaluateGlyphPresence,
  scoreDigit1vs8,
  scoreLetterAvsH,
  recognizeCoordinateGlyph
 };
