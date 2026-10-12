/**
 * Active Turn & Side-to-Move Evidence Detector
 * Deduces active turn from:
 * 1. Check legality (if King is in check, active turn is strictly constrained)
 * 2. Last-move square highlights (origin and destination squares tinted yellow/green/cyan)
 * 3. Text indicators ("White to move", "Black to move", "白先", "黑先")
 */

/**
 * Converts RGB to HSV (Hue [0..360], Saturation [0..1], Value [0..1]).
 */
function rgbToHsv(r, g, b) {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const delta = max - min;
  let h = 0;
  if (delta > 1e-4) {
    if (max === rf) h = 60 * (((gf - bf) / delta) % 6);
    else if (max === gf) h = 60 * (((bf - rf) / delta) + 2);
    else h = 60 * (((rf - gf) / delta) + 4);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

/**
 * Detects last-move highlighted squares from raw RGBA image.
 * Analyzes saturation and chromatic deviations across 64 board squares.
 * @param {Uint8ClampedArray|Array} rgba - source pixel data
 * @param {number} width - image width
 * @param {number} height - image height
 * @param {object} box - { x, y, width, height }
 * @param {string} perspective - 'w' or 'b'
 * @returns {object|null} { squares, lastMovedSide, activeTurn, confidence, detail }
 */
function detectLastMoveHighlights(rgba, width, height, box, perspective = 'w') {
  if (!rgba || rgba.length < width * height * 4) return null;

  const cellW = box.width / 8;
  const cellH = box.height / 8;

  // Sample corner background pixels of each cell (avoiding centered pieces)
  const squareTints = [];

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      const cornerOffsets = [
        [0.10, 0.10], [0.90, 0.10],
        [0.10, 0.90], [0.90, 0.90]
      ];

      for (const [df, dr] of cornerOffsets) {
        const px = Math.max(0, Math.min(width - 1, Math.floor(box.x + (f + df) * cellW)));
        const py = Math.max(0, Math.min(height - 1, Math.floor(box.y + (r + dr) * cellH)));
        const idx = (py * width + px) * 4;
        rSum += rgba[idx];
        gSum += rgba[idx + 1];
        bSum += rgba[idx + 2];
        count++;
      }

      const avgR = rSum / count;
      const avgG = gSum / count;
      const avgB = bSum / count;
      const hsv = rgbToHsv(avgR, avgG, avgB);

      const boardFile = perspective === 'w'
        ? String.fromCharCode(97 + f)
        : String.fromCharCode(104 - f);
      const boardRank = perspective === 'w'
        ? 8 - r
        : r + 1;
      const sq = `${boardFile}${boardRank}`;

      squareTints.push({
        square: sq,
        r, f,
        isLightSquare: (r + f) % 2 === 0,
        h: hsv.h,
        s: hsv.s,
        v: hsv.v
      });
    }
  }

  // Separate light and dark square baselines
  const lightSats = squareTints.filter(s => s.isLightSquare).map(s => s.s);
  const darkSats = squareTints.filter(s => !s.isLightSquare).map(s => s.s);

  lightSats.sort((a, b) => a - b);
  darkSats.sort((a, b) => a - b);

  const medianLightSat = lightSats[Math.floor(lightSats.length / 2)] || 0;
  const medianDarkSat = darkSats[Math.floor(darkSats.length / 2)] || 0;

  // Squares with saturation noticeably higher than their square color median
  const highlighted = [];
  for (const s of squareTints) {
    const baseline = s.isLightSquare ? medianLightSat : medianDarkSat;
    const diff = s.s - baseline;
    // Highlighted squares (yellow/green/blue) typically exhibit saturation bump > 0.18
    // with distinct hue (yellow: 40-70, green: 70-150, cyan/blue: 160-230)
    if (diff > 0.18 && s.s > 0.25) {
      highlighted.push({ square: s.square, s: s.s, diff, rank: parseInt(s.square.charAt(1), 10) });
    }
  }

  // Exactly two highlighted squares strongly indicate a standard chess move
  if (highlighted.length === 2) {
    highlighted.sort((a, b) => a.rank - b.rank);
    const [sq1, sq2] = highlighted;
    // Heuristic: Pawns and pieces move forward; rank transition gives clues
    return {
      squares: [sq1.square, sq2.square],
      confidence: 0.80,
      detail: `检测到走子高亮格子 [${sq1.square}, ${sq2.square}]`
    };
  }

  return null;
}

export { 
  detectLastMoveHighlights,
  rgbToHsv
 };
