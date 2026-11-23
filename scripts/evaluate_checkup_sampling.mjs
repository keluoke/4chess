import { readFileSync } from 'node:fs';
import { MaiaInBrowserEngine } from '../engine/maia-inbrowser.js';
import { ChessBoard } from '../engine/chess-core.js';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import {
  checkupFitBands, LOG_PROB_FLOOR, planCheckupSamples, summarizeCheckupFit
} from '../analysis/checkup-fit.js';
import { normalizeAlias } from '../analysis/study-store.js';

// Pass a CDN model stored outside the repo and completed Lichess PGN-in-JSON exports.
// node scripts/evaluate_checkup_sampling.mjs /tmp/maia.bin username=/tmp/games.ndjson
const [model, ...sources] = process.argv.slice(2);
if (!model || !sources.length) throw new Error('Expected a model path and one or more username=archive.ndjson arguments');
const bytes = readFileSync(model);
const engine = new MaiaInBrowserEngine();
await engine.loadModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

// Give the pilot the same coverage and final fit budget. Only the candidate
// choice within each stratum depends on the fixed reference model.
function planReferenceCandidates(groups) {
  return planCheckupSamples(groups).map(({ length: count }, i) => {
    const group = groups[i];
    const spacing = group.length / count;
    return Array.from({ length: count }, (_, j) => {
      const center = Math.floor((j + 0.5) * spacing);
      const earlier = Math.ceil(j * spacing);
      const later = Math.ceil((j + 1) * spacing) - 1;
      const other = center === earlier ? later : earlier;
      return center === other ? [group[center]] : [group[center], group[other]];
    });
  });
}

function selectReferenceCandidate(candidates, topProbability) {
  const [center, alternative] = candidates;
  if (!alternative) return center;
  const first = topProbability(center);
  const second = topProbability(alternative);
  return Number.isFinite(second) && second < 0.65 && (!Number.isFinite(first) || second < first) ? alternative : center;
}

function decisions(game, username) {
  if (!FairPlayGuard.verifyConcludedGame(game.pgn).ok) return [];
  const side = ['white', 'black'].find(color => normalizeAlias(game.players?.[color]?.user?.name) === normalizeAlias(username));
  if (!side) return [];
  const moves = GameAnalyzer.parsePgn(game.pgn);
  const chain = GameAnalyzer.buildPositionChain(moves);
  if (!chain || chain.isPartial) return [];
  return chain.slice(1).flatMap((move, index) => {
    if (move.turn !== side[0] || move.ply <= 12) return [];
    const fen = chain[index].fen;
    if (new ChessBoard(fen).getLegalMoves().length <= 1) return [];
    return [{ fen, move, history: chain.slice(Math.max(0, index - 7), index).map(position => position.fen), cache: new Map() }];
  });
}

async function prediction(position, elo) {
  if (!position.cache.has(elo)) {
    position.cache.set(elo, await engine.predict(new ChessBoard(position.fen), elo, null, position.history));
  }
  const result = position.cache.get(elo);
  if (!result?.moves?.length) throw new Error('Missing Maia policy');
  return result;
}

async function logProbability(position, elo) {
  const policy = await prediction(position, elo);
  const move = policy.moves.find(item => item.uci === position.move.uci);
  return Math.log(Math.max(move?.rawProb ?? (move?.prob || 0) / 100, LOG_PROB_FLOOR));
}

async function evaluate(training, test, method) {
  const bands = checkupFitBands(method);
  const games = [];
  for (const group of training) {
    const fitSamples = [];
    for (const position of group) {
      const scores = [];
      for (const band of bands) scores.push(await logProbability(position, band));
      fitSamples.push({ scores });
    }
    games.push({ fitSamples });
  }
  const { closestElo, eloSampleCount } = summarizeCheckupFit(games, method);
  let loss = 0;
  for (const position of test) loss -= await logProbability(position, closestElo);
  return { closestElo, n: eloSampleCount, loss: loss / test.length };
}

for (const source of sources) {
  const split = source.indexOf('=');
  const user = source.slice(0, split);
  const archive = readFileSync(source.slice(split + 1), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
  const games = archive.map(game => decisions(game, user)).filter(group => group.length >= 2);
  if (games.length < 6) throw new Error('Each archive must have at least six eligible completed games');
  const results = [];
  for (const fold of [0, 1]) {
    const train = games.filter((_, i) => i % 2 === fold);
    const test = planCheckupSamples(games.filter((_, i) => i % 2 !== fold)).flat();
    const uniform = planCheckupSamples(train);
    const candidateGroups = planReferenceCandidates(train);
    let changed = 0;
    const uncertainty = [];
    for (const group of candidateGroups) {
      const selected = [];
      for (const candidates of group) {
        const probs = new Map();
        for (const position of candidates) {
          const top = (await prediction(position, 1900)).moves[0];
          probs.set(position, top.rawProb ?? top.prob / 100);
        }
        const position = selectReferenceCandidate(candidates, item => probs.get(item));
        if (position !== candidates[0]) changed++;
        selected.push(position);
      }
      uncertainty.push(selected);
    }
    results.push({ fold, heldOut: test.length, changed,
      uniform: await evaluate(uniform, test, 'standard'),
      uncertainty: await evaluate(uncertainty, test, 'standard'),
      fine: await evaluate(uniform, test, 'fine') });
  }
  console.log(JSON.stringify({ user, games: games.length, results }));
}
