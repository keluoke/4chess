import { refineGridBox } from "../lib/vision/board-detector.js";
import { boxToCorners, isAxisAligned } from "../lib/vision/perspective.js";
import { checkerQualityQuad, hasCheckerBorders } from "../lib/vision/quad-detector.js";

function roundedCornerRetry(image, layout) {
  const { data, gray, width, height } = image;
  if (!layout.autoAccepted || !isAxisAligned(layout.corners, layout.box.width / 64))
    return null;
  const box = isAxisAligned(layout.corners, 0.001) ? layout.box :
    refineGridBox(gray, width, height, { ...layout.box, gridAligned: false });
  if (!box.gridAligned || !Number.isInteger(box.x) || !Number.isInteger(box.y) ||
      !Number.isInteger(box.width) || !Number.isInteger(box.height))
    return null;
  const corners = boxToCorners(box);
  if (!hasCheckerBorders(gray, width, height, corners)) return null;

  const cell = Math.min(box.width, box.height) / 8;
  if (cell < 18) return null;
  const inner = Math.floor(cell * 0.84);
  const limit = Math.floor(cell * 0.75);
  const masks = [];
  let backdrop;
  const matches = (index, color) => color.every(
    (channel, offset) => Math.abs(data[index * 4 + offset] - channel) <= 9,
  );
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = box.x + (dx === 1 ? 0 : box.width - 1);
    const y = box.y + (dy === 1 ? 0 : box.height - 1);
    const pixel = (u, v) => (y + dy * v) * width + x + dx * u;
    const origin = pixel(0, 0);
    const background = (gray[pixel(inner, 3)] + gray[pixel(3, inner)]) / 2;
    if (Math.abs(gray[pixel(inner, 3)] - gray[pixel(3, inner)]) > 0.05 ||
        Math.abs(gray[origin] - background) < 0.12)
      return null;
    backdrop ??= Array.from(data.subarray(origin * 4, origin * 4 + 3));
    if (!matches(origin, backdrop)) return null;

    const indices = [];
    const rows = [];
    for (let v = 0; v < limit; v++) {
      let u = 0;
      while (u + v < limit && matches(pixel(u, v), backdrop)) {
        indices.push(pixel(u, v));
        u++;
      }
      rows.push(u);
    }
    // A cut corner tapers inward. A plain border or a dark piece near the edge
    // must not count as evidence that the screenshot background covers the tile.
    const depth = rows.filter((length) => length > 2).length;
    if (indices.length < cell / 2 || depth < 4 ||
        rows[2] < 4 || rows[2] - (rows[Math.floor(depth / 2)] || 0) < 2 ||
        rows[2] > depth * 2 || depth > rows[2] * 2)
      return null;
    masks.push({ indices, background });
  }
  const areas = masks.map(({ indices }) => indices.length);
  if (Math.max(...areas) > Math.min(...areas) * 2) return null;
  const repaired = gray.slice();
  for (const { indices, background } of masks)
    for (const index of indices) repaired[index] = background;
  const quality = Math.min(
    checkerQualityQuad(repaired, width, height, corners, 0.08, 0.25),
    checkerQualityQuad(repaired, width, height, corners, 0.15, 0.25),
  );
  if (quality <= 6) return null;
  return { repaired, box, corners, quality };
}

export async function recognizeScreenshot(recognizer, image, options = {}) {
  const started = Date.now();
  const finish = (result, preprocessing) => ({
    ...result,
    metadata: {
      ...result.metadata,
      ...(preprocessing ? { screenshotPreprocessing: preprocessing } : {}),
      timings: { ...result.metadata.timings, totalMs: Date.now() - started },
    },
  });
  const layout = recognizer.locate(image);
  const original = await recognizer.recognize(image, { ...options, ...layout });
  if (!original.validation.needsReview && original.suspiciousSquares.length === 0)
    return finish(original);

  const retry = roundedCornerRetry(image, layout);
  if (!retry) return finish(original);
  const { repaired, ...geometry } = retry;
  const result = await recognizer.recognize({ ...image, gray: repaired }, {
    ...options,
    ...geometry,
    autoAccepted: true,
    coordinateImage: image,
  });
  if (result.validation.needsReview || !result.layout.autoAccepted ||
      result.metadata.isVerifiedManifest !== true || result.suspiciousSquares.length)
    return finish(original);
  return finish(result, "roundedCorners");
}
