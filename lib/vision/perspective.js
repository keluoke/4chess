/**
 * Perspective Warping and Quadrilateral Geometry
 * Provides closed-form 2D Projective (Homography) Transformation for chessboard rectification.
 * Enables accurate recognition of angled book photos, mobile phone shots, and perspective-distorted boards.
 */

/**
 * Computes the projective mapping from unit square [0,1]x[0,1] to 4 source quadrilateral points.
 * Corners order: [TL, TR, BR, BL] (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
 * @param {Array<{x: number, y: number}>} corners - 4 corners in source image coordinates
 * @returns {object} { h00, h01, h02, h10, h11, h12, h20, h21 }
 */
function getUnitSquareToQuadHomography(corners) {
  const [p0, p1, p2, p3] = corners;
  const x0 = p0.x, y0 = p0.y;
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;

  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;

  // Affine case
  if (Math.abs(sx) < 1e-7 && Math.abs(sy) < 1e-7) {
    return {
      h00: x1 - x0, h01: x3 - x0, h02: x0,
      h10: y1 - y0, h11: y3 - y0, h12: y0,
      h20: 0,       h21: 0,       h22: 1
    };
  }

  // Projective case
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-9) {
    // Degenerate quadrilateral, fallback to affine
    return {
      h00: x1 - x0, h01: x3 - x0, h02: x0,
      h10: y1 - y0, h11: y3 - y0, h12: y0,
      h20: 0,       h21: 0,       h22: 1
    };
  }

  const h20 = (sx * dy2 - sy * dx2) / det;
  const h21 = (dx1 * sy - dy1 * sx) / det;
  const h00 = x1 - x0 + h20 * x1;
  const h01 = x3 - x0 + h21 * x3;
  const h02 = x0;
  const h10 = y1 - y0 + h20 * y1;
  const h11 = y3 - y0 + h21 * y3;
  const h12 = y0;

  return { h00, h01, h02, h10, h11, h12, h20, h21, h22: 1 };
}

/**
 * Resamples a quadrilateral region from a grayscale image to a rectified 256x256 square
 * using inverse projective transformation and bilinear interpolation.
 * @param {Float32Array|Uint8Array} gray - grayscale float values [0..1]
 * @param {number} srcW - source image width
 * @param {number} srcH - source image height
 * @param {Array<{x: number, y: number}>} corners - [TL, TR, BR, BL]
 * @param {number} [destSize=256] - output size
 * @returns {Float32Array} rectified destination buffer
 */
function resampleQuadToSquare(gray, srcW, srcH, corners, destSize = 256) {
  const H = getUnitSquareToQuadHomography(corners);
  const out = new Float32Array(destSize * destSize);

  const invSize = 1 / destSize;

  for (let dy = 0; dy < destSize; dy++) {
    const v = (dy + 0.5) * invSize;
    const dyOffset = dy * destSize;

    for (let dx = 0; dx < destSize; dx++) {
      const u = (dx + 0.5) * invSize;

      const denom = H.h20 * u + H.h21 * v + 1.0;
      const srcX = (H.h00 * u + H.h01 * v + H.h02) / denom;
      const srcY = (H.h10 * u + H.h11 * v + H.h12) / denom;

      // Bilinear interpolation
      const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(srcX)));
      const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
      const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(srcY)));
      const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));

      const xDiff = Math.max(0, Math.min(1, srcX - x0));
      const yDiff = Math.max(0, Math.min(1, srcY - y0));

      const p00 = gray[y0 * srcW + x0];
      const p10 = gray[y0 * srcW + x1];
      const p01 = gray[y1 * srcW + x0];
      const p11 = gray[y1 * srcW + x1];

      const val = (p00 * (1 - xDiff) * (1 - yDiff) +
                   p10 * xDiff * (1 - yDiff) +
                   p01 * (1 - xDiff) * yDiff +
                   p11 * xDiff * yDiff);

      out[dyOffset + dx] = val;
    }
  }

  return out;
}

/**
 * Converts an axis-aligned box to 4 corners [TL, TR, BR, BL].
 */
function boxToCorners(box) {
  return [
    { x: box.x, y: box.y },                         // TL
    { x: box.x + box.width, y: box.y },             // TR
    { x: box.x + box.width, y: box.y + box.height }, // BR
    { x: box.x, y: box.y + box.height }              // BL
  ];
}

/**
 * Checks if 4 corners are approximately an axis-aligned square/rectangle.
 */
function isAxisAligned(corners, tolerancePx = 2.0) {
  const [tl, tr, br, bl] = corners;
  const topH = Math.abs(tl.y - tr.y);
  const botH = Math.abs(bl.y - br.y);
  const leftV = Math.abs(tl.x - bl.x);
  const rightV = Math.abs(tr.x - br.x);
  return topH <= tolerancePx && botH <= tolerancePx && leftV <= tolerancePx && rightV <= tolerancePx;
}

export { 
  getUnitSquareToQuadHomography,
  resampleQuadToSquare,
  boxToCorners,
  isAxisAligned
 };
