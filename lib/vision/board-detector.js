/**
 * Chessboard Localization and Tile Slicer (Pure Core)
 * Detects the 8x8 board region, trims coordinate gutter margins,
 * and extracts 64 normalized 32x32 grayscale tiles for model input.
 * Zero external platform dependencies.
 */

import { resampleQuadToSquare, boxToCorners } from './perspective.js';

/**
 * Resamples a grayscale buffer to 256x256 using bilinear interpolation.
 * @param {Float32Array|Uint8Array} gray - source grayscale buffer
 * @param {number} srcW - source width
 * @param {number} srcH - source height
 * @param {object} [cropBox] - { x, y, width, height }
 * @returns {Float32Array} 256x256 grayscale float values in [0, 1]
 */
function resampleTo256x256(gray, srcW, srcH, cropBox = null) {
  const box = cropBox || { x: 0, y: 0, width: srcW, height: srcH };
  const out = new Float32Array(256 * 256);
  const xRatio = box.width / 256;
  const yRatio = box.height / 256;

  for (let dy = 0; dy < 256; dy++) {
    const srcY = box.y + (dy + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(srcY)));
    const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));
    const yDiff = Math.max(0, Math.min(1, srcY - y0));

    for (let dx = 0; dx < 256; dx++) {
      const srcX = box.x + (dx + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(srcX)));
      const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
      const xDiff = Math.max(0, Math.min(1, srcX - x0));

      const p00 = gray[y0 * srcW + x0];
      const p10 = gray[y0 * srcW + x1];
      const p01 = gray[y1 * srcW + x0];
      const p11 = gray[y1 * srcW + x1];

      const val = (p00 * (1 - xDiff) * (1 - yDiff) +
                   p10 * xDiff * (1 - yDiff) +
                   p01 * (1 - xDiff) * yDiff +
                   p11 * xDiff * yDiff);
      out[dy * 256 + dx] = val;
    }
  }
  return out;
}

/**
 * Detects the bounding box of the chessboard in an image.
 * Uses horizontal & vertical edge energy analysis with adaptive thresholding.
 * Robust to mobile screenshots (with side padding, margins, player banners, and clocks).
 * @param {Float32Array} gray - grayscale float values [0..1]
 * @param {number} width - image width
 * @param {number} height - height
 * @returns {{ x: number, y: number, width: number, height: number, hasBoard?: boolean }}
 */
function findChessboardBox(gray, width, height) {
  const coarse = findCoarseBox(gray, width, height);
  if (coarse.hasBoard === false) return coarse;
  if (coarse.gridAligned && checkerQuality(gray, width, coarse) > 4) return coarse;
  // Search the grid's scale independently of the content/coordinate frame.
  // A small correction around an oversized frame cannot recover the real pitch.
  return findPeriodicGrid(gray, width, height) || coarse;
}

function findPeriodicGrid(gray, width, height) {
  const scale = Math.min(1, 480 / Math.max(width, height));
  const w = Math.round(width * scale), h = Math.round(height * scale);
  let small = gray;
  if (scale < 1) {
    small = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let sy = Math.floor(y * height / h); sy < Math.ceil((y + 1) * height / h); sy++) {
        for (let sx = Math.floor(x * width / w); sx < Math.ceil((x + 1) * width / w); sx++) {
          sum += gray[sy * width + sx]; count++;
        }
      }
      small[y * w + x] = sum / count;
    }
  }
  // Suppress wood/paper texture before measuring grid-line periodicity.
  small = smoothGray(small, w, h, Math.max(1, Math.round(Math.min(w, h) / 160)));
  const ex = new Float32Array(w), ey = new Float32Array(h);
  for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) {
    const i = y * w + x;
    ex[x] += Math.abs(small[i] - small[i - 1]) / h;
    ey[y] += Math.abs(small[i] - small[i - w]) / w;
  }
  function candidates(energy) {
    const length = energy.length, maxPitch = Math.min(w, h) / 8;
    const mean = energy.reduce((s, v) => s + v, 0) / length;
    if (mean < 1e-5) return [];
    const pool = [];
    for (let pitch = Math.max(6, maxPitch * 0.35); pitch <= maxPitch + 0.25; pitch += 0.5) {
      for (let origin = 0; origin <= length - pitch * 8; origin++) {
        let sum = 0, floor = Infinity;
        const points = [];
        for (let k = 1; k < 8; k++) {
          const center = Math.round(origin + k * pitch);
          let peak = 0, pos = center;
          for (let p = Math.max(1, center - 1); p <= Math.min(length - 1, center + 1); p++) {
            if (energy[p] > peak) { peak = energy[p]; pos = p; }
          }
          sum += peak; floor = Math.min(floor, peak); points.push(pos);
        }
        if (floor < mean * 1.3 || sum / 7 < mean * 2) continue;
        const step = points.reduce((s, p, i) => s + (i - 3) * (p - points[3]), 0) / 28;
        const offset = points.reduce((s, p, i) => s + p - (i + 1) * step, 0) / 7;
        if (offset < -1 || offset + step * 8 > length + 1 || points.some((p, i) => Math.abs(p - offset - (i + 1) * step) > 1.25)) continue;
        pool.push({ origin: Math.max(0, offset), pitch: step, score: Math.sqrt(floor * sum / 7) / mean });
      }
    }
    pool.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const c of pool) {
      if (picked.every(p => Math.abs(p.origin - c.origin) > 2 || Math.abs(p.pitch - c.pitch) > 1)) picked.push(c);
      if (picked.length === 32) break;
    }
    return picked;
  }
  let best = null;
  const xs = candidates(ex), ys = candidates(ey);
  for (const x of xs) for (const y of ys) {
    if (Math.abs(x.pitch - y.pitch) > Math.max(1, x.pitch * 0.03)) continue;
    const pitch = (x.pitch + y.pitch) / 2;
    const box = { x: Math.round(x.origin), y: Math.round(y.origin), width: Math.round(pitch * 8), height: Math.round(pitch * 8) };
    if (box.x + box.width > w || box.y + box.height > h) continue;
    const quality = checkerQuality(small, w, box);
    if (quality <= 4) continue;
    const score = Math.sqrt(x.score * y.score) * Math.min(quality, 30);
    if (!best || score > best.score) best = { box, score };
  }
  if (!best) return null;
  const box = { x: Math.round(best.box.x * width / w), y: Math.round(best.box.y * height / h), width: Math.round(best.box.width * width / w), height: Math.round(best.box.height * height / h), hasBoard: true };
  const refined = refineGridBox(gray, width, height, box);
  return refined.gridAligned && checkerQuality(gray, width, refined) > 4 ? refined : null;
}

function findCoarseBox(gray, width, height) {
  // 1. Compute horizontal edge gradients across row scan lines
  const rowDiffs = new Float32Array(height);
  const totalLen = gray.length;
  for (let y = 0; y < height; y++) {
    let diffSum = 0;
    const rowOffset = y * width;
    for (let x = 0; x < width - 1; x++) {
      const idx = rowOffset + x;
      if (idx + 1 < totalLen) {
        diffSum += Math.abs(gray[idx + 1] - gray[idx]);
      }
    }
    rowDiffs[y] = diffSum / (width - 1);
  }

  let totalRowEnergy = 0;
  for (let y = 0; y < height; y++) totalRowEnergy += rowDiffs[y];

  // If uniform/flat image with no edge contrast, return centered square with hasBoard: false
  if (totalRowEnergy < 1e-4) {
    const s = Math.min(width, height);
    return {
      x: Math.max(0, Math.floor((width - s) / 2)),
      y: Math.max(0, Math.floor((height - s) / 2)),
      width: s,
      height: s,
      hasBoard: false
    };
  }

  const isSquare = Math.abs(width - height) <= Math.max(4, Math.floor(Math.min(width, height) * 0.03));
  const meanRowEnergy = totalRowEnergy / height;
  const rowThreshold = meanRowEnergy * (isSquare ? 0.35 : 0.70);

  let yMin = 0;
  while (yMin < height && rowDiffs[yMin] <= rowThreshold) yMin++;
  let yMax = height - 1;
  while (yMax > yMin && rowDiffs[yMax] <= rowThreshold) yMax--;

  // Fallback to centered square if active rows cannot be reliably determined
  if (yMax <= yMin || (yMax - yMin) < Math.min(width, height) * 0.3) {
    const s = Math.min(width, height);
    return {
      x: Math.max(0, Math.floor((width - s) / 2)),
      y: Math.max(0, Math.floor((height - s) / 2)),
      width: s,
      height: s
    };
  }

  const activeH = yMax - yMin + 1;

  // 2. Compute vertical edge gradients across column scan lines in the active row band
  const colDiffs = new Float32Array(width - 1);
  const sampleRows = Math.max(1, activeH);
  for (let y = yMin; y <= yMax; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width - 1; x++) {
      const idx = rowOffset + x;
      if (idx + 1 < totalLen) {
        colDiffs[x] += Math.abs(gray[idx + 1] - gray[idx]);
      }
    }
  }

  let totalColEnergy = 0;
  for (let x = 0; x < width - 1; x++) {
    colDiffs[x] /= sampleRows;
    totalColEnergy += colDiffs[x];
  }
  const meanColEnergy = totalColEnergy / (width - 1);
  const colThreshold = meanColEnergy * (isSquare ? 0.35 : 0.50);

  let xMin = 0;
  while (xMin < width - 2 && colDiffs[xMin] <= colThreshold) xMin++;
  let xMax = width - 2;
  while (xMax > xMin && colDiffs[xMax] <= colThreshold) xMax--;

  const activeW = xMax - xMin + 1;

  if (isSquare) {
    const marginY = yMin;
    const marginX = xMin > 0 ? xMin : yMin;
    if (marginY >= 1 && marginY < height * 0.12) {
      const finalMargin = Math.max(marginX, marginY);
      const size = Math.min(width - 2 * finalMargin, height - 2 * finalMargin);
      const candidate = { x: finalMargin, y: finalMargin, width: size, height: size };
      const aligned = refineGridBox(gray, width, height, candidate);
      if (aligned.gridAligned) return aligned;
    }
    return { x: 0, y: 0, width, height };
  }

  // The 8x8 chessboard is strictly square
  let boardSize = activeH;
  if (activeW > 32 && activeW < width * 0.98 && Math.abs(activeW - activeH) < Math.min(width, height) * 0.25) {
    boardSize = Math.round((activeW + activeH) / 2);
  } else {
    boardSize = Math.min(width, activeH);
  }
  boardSize = Math.max(32, Math.min(boardSize, width, height));

  const sizes = [activeW, activeH, boardSize].map(Math.round).filter(s => s >= Math.min(width, height) * 0.6 && s <= Math.min(width, height));
  let best = null;
  for (const size of new Set(sizes)) {
    const origins = width <= height ? [Math.round((width - size) / 2), xMin + 1] : [Math.round((height - size) / 2), yMin];
    for (const fixed of new Set(origins)) {
      for (let variable = 0; variable <= Math.max(width, height) - size; variable += Math.max(1, Math.floor(size / 256))) {
        const box = width <= height ? { x: fixed, y: variable, width: size, height: size } : { x: variable, y: fixed, width: size, height: size };
        if (box.x < 0 || box.y < 0 || box.x + size > width || box.y + size > height) continue;
        const quality = checkerQuality(gray, width, box);
        if (quality > 4 && (!best || quality > best.quality)) best = { ...box, quality };
      }
    }
  }
  if (best) {
    const box = { x: best.x, y: best.y, width: best.width, height: best.height, hasBoard: true };
    return refineGridBox(gray, width, height, box);
  }

  let finalX, finalY;
  if (width <= height) {
    finalX = Math.max(0, Math.floor((width - boardSize) / 2));
    finalY = Math.max(0, Math.min(height - boardSize, Math.floor((yMin + yMax + 1 - boardSize) / 2)));
  } else {
    finalX = Math.max(0, Math.min(width - boardSize, Math.floor((xMin + xMax + 1 - boardSize) / 2)));
    finalY = Math.max(0, Math.floor((height - boardSize) / 2));
  }

  return { x: finalX, y: finalY, width: boardSize, height: boardSize, hasBoard: true };
}

function checkerQuality(gray, width, box) {
  const groups = [[], []], step = box.width / 8;
  const height = Math.floor(gray.length / width), radius = Math.min(3, Math.max(0, Math.floor(step * 0.025)));
  function background(x, y) {
    let sum = 0, count = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const sx = Math.max(0, Math.min(width - 1, x + dx)), sy = Math.max(0, Math.min(height - 1, y + dy));
      sum += gray[sy * width + sx]; count++;
    }
    return sum / count;
  }
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const corners = [];
      for (const dy of [0.08, 0.92]) {
        for (const dx of [0.08, 0.92]) {
          corners.push(background(Math.floor(box.x + (f + dx) * step), Math.floor(box.y + (r + dy) * step)));
        }
      }
      corners.sort((a, b) => a - b);
      groups[(r + f) % 2].push((corners[1] + corners[2]) / 2);
    }
  }
  const means = groups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
  const contrast = Math.abs(means[0] - means[1]);
  if (contrast < 0.03) return 0;
  const spread = groups.map((g, i) => Math.sqrt(g.reduce((s, v) => s + (v - means[i]) ** 2, 0) / g.length));
  return contrast / (spread[0] + spread[1] + 0.01);
}

/**
 * Converts RGBA pixel data to grayscale [0..1].
 */
function rgbaToGrayscale(rgbaData, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgbaData[i * 4];
    const g = rgbaData[i * 4 + 1];
    const b = rgbaData[i * 4 + 2];
    gray[i] = (0.2989 * r + 0.5870 * g + 0.1140 * b) / 255.0;
  }
  return gray;
}

function refineGridBox(gray, width, height, box) {
  if (box.hasBoard === false) return box;
  function fit(axis, source = gray) {
    const length = axis === 'x' ? width : height, origin = axis === 'x' ? box.x : box.y;
    const size = axis === 'x' ? box.width : box.height, pitch = size / 8;
    const energy = new Float32Array(length);
    const histogram = new Uint32Array(1024);
    const start = Math.max(1, Math.ceil(axis === 'x' ? box.y : box.x));
    const end = Math.min(axis === 'x' ? height : width, Math.floor(start + (axis === 'x' ? box.height : box.width)));
    for (let p = 1; p < length; p++) {
      histogram.fill(0);
      let samples = 0;
      for (let q = start; q < end; q += Math.max(1, Math.floor(size / 256))) {
        const i = axis === 'x' ? q * width + p : p * width + q;
        const diff = Math.abs(source[i] - source[i - (axis === 'x' ? 1 : width)]);
        energy[p] += diff;
        if (source !== gray) { histogram[Math.min(1023, Math.floor(diff * 1024))]++; samples++; }
      }
      if (source !== gray) {
        // A true grid line crosses most of the board. Isolated piece contours
        // must not win over faint but spatially supported square boundaries.
        let cumulative = 0;
        for (let bin = 0; bin < 1024; bin++) {
          cumulative += histogram[bin];
          if (cumulative >= samples / 2) { energy[p] = bin / 1024; break; }
        }
      }
    }
    const points = [];
    for (let k = 1; k < 8; k++) {
      const center = origin + k * pitch, radius = Math.max(2, Math.round(pitch * 0.12));
      let best = -1, peak = 0, mean = 0, count = 0;
      for (let p = Math.max(1, Math.round(center) - radius); p <= Math.min(length - 1, Math.round(center) + radius); p++) {
        mean += energy[p]; count++;
        if (energy[p] > peak) { peak = energy[p]; best = p; }
      }
      if (best < 0 || peak < mean / count * (source === gray ? 2.5 : 1.15)) continue;
      let weight = 0, sum = 0;
      for (let p = Math.max(1, best - 1); p <= Math.min(length - 1, best + 1); p++) {
        if (energy[p] > peak * 0.25) { weight += energy[p]; sum += p * energy[p]; }
      }
      points.push({ k, value: sum / weight });
    }
    if (points.length < 6) return null;
    // One grid line can be occluded by a sprite or dominated by texture. Fit
    // the consensus lattice, while requiring six independently located lines.
    const subsets = [points];
    if (points.length === 7) for (let i = 0; i < 7; i++) subsets.push(points.filter((_, j) => i !== j));
    for (const subset of subsets) {
      const mx = subset.reduce((s, p) => s + p.k, 0) / subset.length, my = subset.reduce((s, p) => s + p.value, 0) / subset.length;
      const step = subset.reduce((s, p) => s + (p.k - mx) * (p.value - my), 0) / subset.reduce((s, p) => s + (p.k - mx) ** 2, 0);
      const offset = my - mx * step;
      if (step < pitch * 0.94 || step > pitch * 1.06 || subset.some(p => Math.abs(p.value - offset - p.k * step) > Math.max(1.5, pitch * 0.015))) continue;
      return { origin: Math.round(offset), size: Math.round(step * 8) };
    }
    return null;
  }
  let x = fit('x'), y = fit('y');
  if (!x || !y) {
    const smooth = smoothGray(gray, width, height, Math.min(4, Math.max(1, Math.round(box.width / 8 * 0.04))));
    x = fit('x', smooth); y = fit('y', smooth);
  }
  if (!x || !y || x.origin < 0 || y.origin < 0 || x.origin + x.size > width || y.origin + y.size > height) return box;
  return { x: x.origin, y: y.origin, width: x.size, height: y.size, hasBoard: true, gridAligned: true };
}

function smoothGray(gray, width, height, radius) {
  const stride = width + 1, integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) { sum += gray[y * width + x]; integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum; }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const l = Math.max(0, x - radius), r = Math.min(width, x + radius + 1), t = Math.max(0, y - radius), b = Math.min(height, y + radius + 1);
    out[y * width + x] = (integral[b * stride + r] - integral[t * stride + r] - integral[b * stride + l] + integral[t * stride + l]) / ((r - l) * (b - t));
  }
  return out;
}

function resampleFiltered(gray, width, height, box, size = 256) {
  function axis(origin, span, length) {
    const ratio = span / size, scale = Math.max(1, ratio), radius = 3 * scale;
    const sinc = x => Math.abs(x) < 1e-8 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    return Array.from({ length: size }, (_, d) => {
      const center = origin + (d + 0.5) * ratio - 0.5, indices = [], weights = [];
      let sum = 0;
      for (let p = Math.ceil(center - radius); p <= Math.floor(center + radius); p++) {
        const x = (p - center) / scale, w = Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0;
        if (!w) continue;
        indices.push(Math.max(0, Math.min(length - 1, p)));
        weights.push(w);
        sum += w;
      }
      return { indices, weights: weights.map(w => w / sum) };
    });
  }
  const xs = axis(box.x, box.width, width), ys = axis(box.y, box.height, height);
  const first = Math.min(...ys.flatMap(y => y.indices)), last = Math.max(...ys.flatMap(y => y.indices));
  const tmp = new Float32Array((last - first + 1) * size), out = new Float32Array(size * size);
  for (let y = first; y <= last; y++) {
    for (let x = 0; x < size; x++) {
      const a = xs[x];
      let sum = 0;
      for (let i = 0; i < a.indices.length; i++) sum += gray[y * width + a.indices[i]] * a.weights[i];
      tmp[(y - first) * size + x] = sum;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = ys[y];
      let sum = 0;
      for (let i = 0; i < a.indices.length; i++) sum += tmp[(a.indices[i] - first) * size + x] * a.weights[i];
      out[y * size + x] = Math.max(0, Math.min(1, sum));
    }
  }
  return out;
}

/**
 * Extracts 64 normalized 32x32 tiles from image data.
 * @param {object} imageInfo - { data: Uint8ClampedArray|Array, width: number, height: number }
 * @param {object} [options] - { marginTrim: number, box: object, bilinear: boolean }
 * @returns {object} { tiles, box, board256, hasBoard }
 */
function extractTiles(imageInfo, options = {}) {
  const { data, width, height } = imageInfo;
  const gray = imageInfo.gray || rgbaToGrayscale(data, width, height);
  let box = options.box ? (options.corners ? options.box : refineGridBox(gray, width, height, { ...options.box, gridAligned: false })) : refineGridBox(gray, width, height, findChessboardBox(gray, width, height));

  const trim = options.marginTrim || 0.0;
  if (trim > 0) {
    const tx = Math.floor(box.width * trim);
    const ty = Math.floor(box.height * trim);
    box = {
      x: box.x + tx,
      y: box.y + ty,
      width: Math.max(32, box.width - 2 * tx),
      height: Math.max(32, box.height - 2 * ty)
    };
  }

  let board256;
  if (options.corners && Array.isArray(options.corners) && options.corners.length === 4) {
    board256 = resampleQuadToSquare(gray, width, height, options.corners, 256);
  } else {
    board256 = options.bilinear ? resampleTo256x256(gray, width, height, box) : resampleFiltered(gray, width, height, box);
  }

  const tiles = new Float32Array(64 * 32 * 32);
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      for (let r = 0; r < 32; r++) {
        for (let c = 0; c < 32; c++) {
          tiles[(rank * 8 + file) * 1024 + r * 32 + c] = (board256[(rank * 32 + r) * 256 + file * 32 + c] - 0.5) / 0.5;
        }
      }
    }
  }

  return {
    tiles,
    box,
    corners: options.corners || boxToCorners(box),
    board256,
    gray,
    hasBoard: box.hasBoard !== false
  };
}

export { 
  extractTiles,
  findChessboardBox,
  resampleTo256x256,
  rgbaToGrayscale,
  refineGridBox,
  resampleFiltered,
  checkerQuality
 };
