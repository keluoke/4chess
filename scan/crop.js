export function screenshotBoard(layout, frame) {
  if (!layout?.hasBoard || !frame) return null;
  const { box } = layout;
  const corners = layout.corners?.length === 4 ? layout.corners : box && [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
  if (!corners || corners.some(({ x, y }) =>
    !Number.isFinite(x) || !Number.isFinite(y) ||
    x < -1 || y < -1 || x > frame.inputWidth + 1 || y > frame.inputHeight + 1
  )) return null;

  const clamp = (value) => Math.max(0, Math.min(1, value));
  const points = corners.map(({ x, y }) => ({
    x: clamp((frame.x + x * frame.width / frame.inputWidth) / frame.screenshotWidth),
    y: clamp((frame.y + y * frame.height / frame.inputHeight) / frame.screenshotHeight),
  }));
  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));
  const width = Math.max(...points.map((point) => point.x)) - x;
  const height = Math.max(...points.map((point) => point.y)) - y;
  if (width * frame.screenshotWidth < 32 || height * frame.screenshotHeight < 32)
    return null;
  return { bounds: { x, y, width, height }, points };
}
