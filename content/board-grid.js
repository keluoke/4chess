// DOM geometry is measured in screen pixels so the SVG also follows browser zoom
// and transforms shared by the board and its piece layer.
const EDGE_TOLERANCE = 2;

function sameGrid(a, b) {
  return Math.abs(a.left - b.left) <= EDGE_TOLERANCE &&
    Math.abs(a.top - b.top) <= EDGE_TOLERANCE &&
    Math.abs(a.width - b.width) <= EDGE_TOLERANCE &&
    Math.abs(a.height - b.height) <= EDGE_TOLERANCE;
}

function chessComGrid(board, bounds, orientation) {
  const estimates = [];
  for (const piece of board.querySelectorAll('.piece[class*="square-"]:not(.dragging, .ghost, .dragged)')) {
    const square = piece.getAttribute('class')?.match(/\bsquare-([1-8])([1-8])\b/);
    if (!square) continue;
    const file = Number(square[1]) - 1, rank = Number(square[2]) - 1;
    const col = orientation === 'black' ? 7 - file : file;
    const row = orientation === 'black' ? rank : 7 - rank;
    const rect = piece.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const width = rect.width * 8, height = rect.height * 8;
    const left = rect.left - col * rect.width, top = rect.top - row * rect.height;
    if (left < bounds.left - EDGE_TOLERANCE || top < bounds.top - EDGE_TOLERANCE ||
        left + width > bounds.right + EDGE_TOLERANCE || top + height > bounds.bottom + EDGE_TOLERANCE) continue;
    estimates.push({ left, top, width, height, square: square[0] });
  }

  // A moving piece may already be labelled with its destination. Use independent
  // squares that agree on the grid, rather than relying on a single piece.
  let best = null, votes = 1, ambiguous = false;
  for (const estimate of estimates) {
    const support = new Set(estimates.filter(other => sameGrid(other, estimate)).map(other => other.square)).size;
    if (support > votes) {
      best = estimate;
      votes = support;
      ambiguous = false;
    } else if (best && support === votes && !sameGrid(best, estimate)) {
      ambiguous = true;
    }
  }
  if (best) return ambiguous ? null : best;
  if (Math.abs(bounds.width - bounds.height) <= EDGE_TOLERANCE &&
      (!estimates.length || estimates.some(estimate => sameGrid(bounds, estimate)))) return bounds;
  return null;
}

export function visibleBoardGrid(board, orientation) {
  if (!board?.isConnected || getComputedStyle(board).visibility !== 'visible') return null;
  const bounds = board.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  if (board.matches('wc-chess-board, chess-board, .board-layout-chessboard')) {
    return chessComGrid(board, bounds, orientation);
  }
  // Lichess renders the grid on cg-board. Its surrounding cg-wrap can include
  // coordinate gutters, borders and a resize handle.
  return bounds;
}
