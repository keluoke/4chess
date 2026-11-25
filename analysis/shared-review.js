import { BoardUI } from './board-ui.js?v=20261124-divergence-cards';
import { EvalChart } from './eval-chart.js?v=20261124-intuition-labels';
import { t, initI18n, getLang, setLanguage } from './i18n.js?v=20261124-intuition-labels';
import { decodeReviewSnapshot, reviewStoryRows } from './review-snapshot.js?v=20261125-poster-focus';
import { STOCKFISH_VARIANTS, MAIA_VARIANTS } from '../engine/engine-variants.js?v=20261025-v115';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';

const byId = id => document.getElementById(id);
const fenSign = fen => fen.split(' ')[1] === 'b' ? -1 : 1;
const moveLabel = move => move.number + (move.turn === 'w' ? '. ' : '… ') + move.san;
const ARROW = { best: { color: 'blue', role: 'sf' }, maia: { color: 'gold', role: 'maia' } };

function scoreForChart(score, fen) {
  return score ? { cp: score.cp * fenSign(fen), text: score.mate === null ? score.text : 'M' + score.mate } : { text: '?' };
}

let getViewState = null;

function renderSnapshot(report, preserved = null) {
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
  const board = new BoardUI(boardEl, { orientation: preserved?.orientation === 'black' ? 'black' : 'white' });
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
  let cursor = 0, selected, activeVariation = null;
  const button = (label, onClick) => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'btn-header'; el.textContent = label; el.onclick = onClick;
    return el;
  };
  const moveButtons = report.plies.map(move => {
    const item = document.createElement('li');
    const el = button(moveLabel(move), () => show(move.ply));
    item.append(el);
    return { item, el };
  });
  notation.replaceChildren(...moveButtons.map(entry => entry.item));
  const turns = byId('snapshot-turns');
  turns.replaceChildren(...report.keyPlies.map(ply => button(moveLabel(report.plies[ply - 1]), () => show(ply - 1))));
  byId('snapshot-turning').hidden = !turns.children.length;
  const story = byId('snapshot-story');
  story.replaceChildren(...reviewStoryRows(report, getLang()).map(row => {
    const section = document.createElement('section');
    const title = document.createElement('h2');
    title.textContent = row.title;
    const text = document.createElement('p');
    text.textContent = row.note ? row.text + ' · ' + row.note : row.text;
    section.append(title, text);
    if (row.moves.length) {
      const links = document.createElement('div');
      links.className = 'snapshot-tags';
      links.append(...[...new Set(row.moves)].map(move => button(moveLabel(move), () => show(move.ply - 1))));
      section.append(links);
    }
    return section;
  }));
  story.hidden = !story.children.length;

  function analyzeAt(fen) {
    const url = new URL('./index.html', location.href);
    url.hash = new URLSearchParams({ fen, lang: getLang(), ...(report.elo ? { elo: report.elo } : {}) }).toString();
    analyze.href = url.href;
    analyze.hidden = false;
  }

  function applyVariation(step, role) {
    if (FairPlayGuard.isLiveGameInProgress()) return;
    activeVariation = { role, uci: step.uci, fen: step.fen, label: step.label };
    board.setPosition(step.fen, { from: step.uci.slice(0, 2), to: step.uci.slice(2, 4) });
    board.clearArrows();
    boardEl.setAttribute('aria-label', step.label + ' · ' + step.fen.split(' ')[0]);
    byId('snapshot-position').textContent = t('snapshotVariation', { move: step.label });
    analyzeAt(step.fen);
  }

  function show(ply) {
    if (FairPlayGuard.isLiveGameInProgress()) return;
    activeVariation = null;
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
    selected = moveButtons[cursor - 1]?.el;
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
        line.append(...variation.map(step => button(step.label, () => applyVariation(step, role))),
          button(t('snapshotMainLine'), () => show(cursor)));
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
  const flipBtn = byId('snapshot-flip');
  if (flipBtn) flipBtn.onclick = () => board.flip();
  range.oninput = () => show(Number(range.value));
  previous.onclick = () => show(cursor - 1);
  next.onclick = () => show(cursor + 1);
  if (!window.__snapshotKeysBound) {
    window.__snapshotKeysBound = true;
    document.addEventListener('keydown', event => {
      if (event.altKey || event.metaKey || event.ctrlKey || event.target.matches('input,textarea,select,button')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        window.__snapshotStep?.(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  }
  window.__snapshotStep = delta => show(cursor + delta);
  getViewState = () => ({ cursor, orientation: board.orientation, variation: activeVariation });
  byId('snapshot-report').hidden = false;
  show(preserved?.cursor ?? (report.keyPlies.length ? report.keyPlies[0] - 1 : 0));
  if (preserved?.variation) applyVariation(preserved.variation, preserved.variation.role);
}

const syncSnapshotHeader = () => {
  const lang = getLang();
  const langBtn = byId('snapshot-lang');
  if (langBtn) {
    langBtn.textContent = lang === 'zh' ? 'English' : '中文';
    langBtn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换为中文');
  }
  document.title = 'Diverge · ' + t('snapshotProvenance');
  const brand = document.querySelector('.snapshot-brand');
  if (brand) brand.href = `./index.html?lang=${lang}`;
  const recoveryLink = byId('snapshot-recovery-link');
  if (recoveryLink) recoveryLink.href = `./index.html?lang=${lang}`;
};

window.addEventListener('hashchange', () => location.reload());
const urlSearch = new URLSearchParams(location.search);
const urlHash = new URLSearchParams(location.hash.slice(1));
const explicitLang = urlHash.get('lang') || urlSearch.get('lang');
initI18n();
if (explicitLang === 'zh' || explicitLang === 'en') setLanguage(explicitLang);
syncSnapshotHeader();

let loadedReport = null;
const langBtn = byId('snapshot-lang');
if (langBtn) {
  langBtn.onclick = () => {
    const prev = getViewState?.();
    const next = getLang() === 'zh' ? 'en' : 'zh';
    setLanguage(next);
    syncSnapshotHeader();
    if (loadedReport) renderSnapshot(loadedReport, prev);
    else status.textContent = t('snapshotInvalid');
  };
}

const status = byId('snapshot-status');
status.textContent = t('reviewSharePreparing');
try {
  const token = urlHash.get('review');
  loadedReport = await decodeReviewSnapshot(token);
  if (FairPlayGuard.isLiveGameInProgress()) throw new Error('Fair play lock');
  renderSnapshot(loadedReport);
  status.hidden = true;
} catch {
  status.textContent = t('snapshotInvalid');
  byId('snapshot-recovery')?.removeAttribute('hidden');
}
