import { BoardUI } from './board-ui.js?v=20261124-divergence-cards';
import { EvalChart } from './eval-chart.js?v=20261124-player-copy';
import { t, initI18n, getLang } from './i18n.js?v=20261124-player-copy';
import { decodeReviewSnapshot } from './review-snapshot.js?v=20261124-checkup-cards-r2';
import { STOCKFISH_VARIANTS, MAIA_VARIANTS } from '../engine/engine-variants.js?v=20261025-v115';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';

const byId = id => document.getElementById(id);
const fenSign = fen => fen.split(' ')[1] === 'b' ? -1 : 1;
const moveLabel = move => move.number + (move.turn === 'w' ? '. ' : '… ') + move.san;
const ARROW = { best: { color: 'blue', role: 'sf' }, maia: { color: 'gold', role: 'maia' } };

function scoreForChart(score, fen) {
  return score ? { cp: score.cp * fenSign(fen), text: score.mate === null ? score.text : 'M' + score.mate } : { text: '?' };
}

function renderSnapshot(report) {
  const names = [report.white || t('reviewWhite'), report.black || t('reviewBlack')];
  byId('snapshot-title').textContent = names[0] + '  ' + report.result + '  ' + names[1];
  byId('snapshot-opening').textContent = report.opening;
  byId('snapshot-opening').hidden = !report.opening;
  byId('snapshot-scores').replaceChildren(...report.accuracy.map((accuracy, index) => {
    const group = document.createElement('div');
    const name = document.createElement('dt'), value = document.createElement('dd');
    name.textContent = names[index];
    value.textContent = accuracy === null ? '—' : accuracy.toFixed(1) + '%';
    group.append(name, value);
    return group;
  }));
  const engine = Object.values(STOCKFISH_VARIANTS).find(item => item.key === report.engine)?.name || report.engine;
  const model = Object.values(MAIA_VARIANTS).find(item => item.key === report.model)?.name || report.model;
  byId('snapshot-source').textContent = [t('snapshotProvenance'), engine,
    report.maxDepth && ('D' + report.minDepth + (report.maxDepth > report.minDepth ? '–' + report.maxDepth : '')),
    report.maiaCoverage && [model, report.elo && ('Elo ' + report.elo),
      report.maiaCoverage < report.plies.length && t('reviewMaiaSamples', { valid: report.maiaCoverage, total: report.plies.length })].filter(Boolean).join(' · '),
    report.verified > 0 && t('accuracyVerifiedDepth', { count: report.verified, depth: report.verifiedDepth })].filter(Boolean).join(' · ');

  const boardEl = byId('snapshot-board');
  const board = new BoardUI(boardEl);
  const chart = new EvalChart(byId('snapshot-chart'), ply => show(ply));
  const initial = scoreForChart(report.initial, report.startFen);
  chart.setData(report.plies.map(move => {
    const after = scoreForChart(move.score, move.fenAfter);
    return {
      ply: move.ply, san: move.san, moveNumber: move.number, turn: move.turn,
      fenBefore: move.fenBefore, fenAfter: move.fenAfter,
      evalAfterCp: after.cp, evalAfter: after.text,
      ...(move.ply === 1 && report.initial ? { evalBeforeCp: initial.cp, evalBefore: initial.text } : {}),
      severity: move.quality, isHumanTrap: move.kind === 'trap', isBeyondIntuition: move.kind === 'beyond'
    };
  }));
  const range = byId('snapshot-range');
  range.max = String(report.plies.length);
  const previous = byId('snapshot-prev'), next = byId('snapshot-next');
  const notation = byId('snapshot-notation');
  const evidence = byId('snapshot-lines');
  const analyze = byId('snapshot-analyze');
  let cursor = 0, selected;
  const button = (label, onClick) => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'btn-header'; el.textContent = label; el.onclick = onClick;
    return el;
  };
  const moveButtons = report.plies.map(move => {
    const item = document.createElement('li');
    const el = button(moveLabel(move), () => show(move.ply));
    item.append(el);
    notation.append(item);
    return el;
  });
  const turns = byId('snapshot-turns');
  turns.replaceChildren(...report.keyPlies.map(ply => button(moveLabel(report.plies[ply - 1]), () => show(ply - 1))));
  byId('snapshot-turning').hidden = !turns.children.length;

  function analyzeAt(fen) {
    const url = new URL('./index.html', location.href);
    url.hash = new URLSearchParams({ fen, lang: getLang(), ...(report.elo ? { elo: report.elo } : {}) }).toString();
    analyze.href = url.href;
    analyze.hidden = false;
  }

  function show(ply) {
    if (FairPlayGuard.isLiveGameInProgress()) return;
    cursor = Math.max(0, Math.min(ply, report.plies.length));
    const last = report.plies[cursor - 1];
    const upcoming = report.plies[cursor];
    const fen = last?.fenAfter || report.startFen;
    const position = last ? moveLabel(last) : t('startingPosition');
    board.setPosition(fen, last && { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) });
    boardEl.setAttribute('aria-label', position + ' · ' + fen.split(' ')[0]);
    range.value = String(cursor);
    previous.disabled = cursor === 0;
    next.disabled = cursor === report.plies.length;
    byId('snapshot-position').textContent = position;
    chart.setCursor(cursor);
    selected?.removeAttribute('aria-current');
    selected = moveButtons[cursor - 1];
    selected?.setAttribute('aria-current', 'step');
    analyzeAt(fen);
    const arrows = [];
    const lines = [];
    for (const [role, label, variation, chance] of [
      ['best', 'Stockfish', upcoming?.best, null],
      ['maia', 'Maia', upcoming?.maia, upcoming?.maiaProb],
      ['played', t('snapshotPlayed'), upcoming?.played, upcoming?.playedProb]
    ]) {
      if (!variation?.length) continue;
      const first = variation[0];
      if (ARROW[role] && !arrows.some(arrow => arrow.from === first.uci.slice(0, 2) && arrow.to === first.uci.slice(2, 4))) {
        arrows.push({ ...ARROW[role], from: first.uci.slice(0, 2), to: first.uci.slice(2, 4) });
      }
      const row = document.createElement('div');
      const text = document.createElement('strong');
      text.textContent = label + ' · ' + first.san + (chance == null ? '' : ' · ' + chance.toFixed(1) + '%');
      row.append(text);
      if (variation.length > 1) {
        const line = document.createElement('div');
        line.className = 'snapshot-tags';
        line.append(...variation.map(step => button(step.label, () => {
          if (FairPlayGuard.isLiveGameInProgress()) return;
          board.setPosition(step.fen, { from: step.uci.slice(0, 2), to: step.uci.slice(2, 4) });
          board.clearArrows();
          boardEl.setAttribute('aria-label', step.label + ' · ' + step.fen.split(' ')[0]);
          byId('snapshot-position').textContent = t('snapshotVariation', { move: step.label });
          analyzeAt(step.fen);
        })), button(t('snapshotMainLine'), () => show(cursor)));
        row.append(line);
      }
      lines.push(row);
    }
    board.setArrows(arrows);
    evidence.replaceChildren(...lines);
    byId('snapshot-evidence').hidden = !lines.length;
    if (upcoming) {
      byId('snapshot-evidence-title').textContent = moveLabel(upcoming) + (upcoming.kind ? ' · ' + t('snapshotKind_' + upcoming.kind) : '');
      const losses = [upcoming.playedLoss > 0 && t('snapshotPlayedLoss', { loss: (upcoming.playedLoss / 100).toFixed(2) }),
        upcoming.maiaLoss > 0 && t('snapshotMaiaLoss', { loss: (upcoming.maiaLoss / 100).toFixed(2) })].filter(Boolean);
      if (losses.length) {
        const line = document.createElement('p'); line.textContent = losses.join(' · '); evidence.append(line);
      }
    }
  }
  range.oninput = () => show(Number(range.value));
  previous.onclick = () => show(cursor - 1);
  next.onclick = () => show(cursor + 1);
  document.addEventListener('keydown', event => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.target.matches('input,textarea,select,button')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(cursor + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  byId('snapshot-report').hidden = false;
  show(report.keyPlies.length ? report.keyPlies[0] - 1 : 0);
}

window.addEventListener('hashchange', () => location.reload());
initI18n();
document.title = 'Diverge · ' + t('snapshotProvenance');
const status = byId('snapshot-status');
status.textContent = t('reviewSharePreparing');
try {
  const token = new URLSearchParams(location.hash.slice(1)).get('review');
  const report = await decodeReviewSnapshot(token);
  if (FairPlayGuard.isLiveGameInProgress()) throw new Error('Fair play lock');
  renderSnapshot(report);
  status.hidden = true;
} catch {
  status.textContent = t('snapshotInvalid');
}
