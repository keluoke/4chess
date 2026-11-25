import { legalVariation } from '../engine/position-lines.js';
import { ChessBoard } from '../engine/chess-core.js';
import { LIVE_ANALYSIS_RATINGS, LIVE_ANALYSIS_VERSION, livePositionKey } from '../engine/live-analysis-position.js';
import { maiaTrendSeries } from '../analysis/maia-elo-trend.js?v=20261125-position-poster';

function evaluation({ cp, mate }) {
  if (Number.isInteger(mate)) return {
    cp: (mate < 0 ? -1 : 1) * (10000 - Math.abs(mate) * 10), isMate: true, text: (mate < 0 ? '-M' : '+M') + Math.abs(mate)
  };
  return { cp, isMate: false, text: (cp > 0 ? '+' : '') + (cp / 100).toFixed(2) };
}

export async function sharedAnalysis(event, snapshot, ply, position) {
  const query = new URLSearchParams({ event, round: snapshot.roundId, ply });
  try {
    const response = await fetch('/api/live/analysis?' + query, { signal: AbortSignal.timeout(2500) });
    if (response.status === 404) return null;
    if (response.status !== 200) return { pending: true };
    const data = await response.json();
    if (data.round !== snapshot.roundId || data.version !== LIVE_ANALYSIS_VERSION || data.ply !== ply ||
        data.fen !== position.fen || data.key !== await livePositionKey(snapshot.initialFen, snapshot.moves, ply)) return { pending: true };
    const result = data.result;
    if (result.terminal) return { display: { terminal: true, cloud: true,
      evaluation: result.mate === null ? evaluation({ cp: 0 }) :
        { cp: Math.sign(result.mate) * 10000, isMate: true, text: result.mate < 0 ? '-M0' : '+M0' }
    } };
    const elo = LIVE_ANALYSIS_RATINGS.reduce((nearest, rating) =>
      Math.abs(rating - position.elo) < Math.abs(nearest - position.elo) ? rating : nearest);
    const moves = new Map(new ChessBoard(position.fen).getLegalMoves().map(move => [move.uci, move]));
    const lines = result.lines.map(line => ({ ...line, evaluation: evaluation(line),
      variation: legalVariation(position.fen, line.pv) }));
    const samples = new Map(LIVE_ANALYSIS_RATINGS.map(rating => [rating,
      new Map(Object.entries(result.policies[rating]).map(([uci, probability]) => [uci, probability * 100]))]));
    const candidates = [...samples.get(elo)].sort((a, b) => b[1] - a[1]).map(([uci, prob]) => ({ ...moves.get(uci), uci, prob }));
    const maiaLines = candidates.slice(0, 3);
    const sf = lines[0];
    const trend = { ...position, elo, moves: candidates, series: maiaTrendSeries(maiaLines, sf), samples };
    const played = snapshot.moves[ply - 1];
    const moment = played && result.moment?.elo === elo ? { ...played,
      divergenceType: result.moment.kind, divergenceStatus: 'confirmed',
      severity: 'good', lossCp: result.moment.lossCp, verifiedLossCp: result.moment.lossCp
    } : null;
    return { display: { cloud: true, cloudElo: elo, model: result.model, evaluation: sf.evaluation, depth: sf.depth,
      stockfish: moves.get(sf.uci), stockfishLines: lines, maia: maiaLines[0], maiaLines, maiaReady: true, trend,
      maiaEvaluations: new Map(lines.map(line => [line.uci, line.evaluation]))
    }, moment };
  } catch {
    return { pending: true };
  }
}
