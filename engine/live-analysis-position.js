export const LIVE_ANALYSIS_VERSION = 'sf19-mpv3-maia79m-v1';
export const LIVE_ANALYSIS_RATINGS = [600, 1000, 1400, 1800, 2200, 2600];

export async function livePositionKey(initialFen, moves, ply) {
  const identity = JSON.stringify([LIVE_ANALYSIS_VERSION, initialFen, moves.slice(0, ply).map(move => move.uci)]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest).slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
}
