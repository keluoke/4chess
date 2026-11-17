import { t } from './i18n.js?v=20261117-review-guide';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';

const RATINGS = [600, 1000, 1400, 1800, 2200, 2600];
const CACHE_POSITIONS = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';
const symbols = { sf: '★ ', maia: 'M ', consensus: '★ M ' };

function svgElement(name, attrs, text) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}

function probabilities(moves) {
  return new Map(moves.flatMap(({ uci, rawProb, prob }) => {
    const percentage = Number.isFinite(rawProb) ? rawProb * 100 : prob;
    return uci && Number.isFinite(percentage) ? [[uci, percentage]] : [];
  }));
}

function formatProbability(probability) {
  return Number.isFinite(probability) ? `${probability.toFixed(1)}%` : '—';
}

export class MaiaEloTrend {
  constructor(analysis, dialog, opener) {
    this.analysis = analysis;
    this.dialog = dialog;
    this.opener = opener;
    this.chart = dialog.querySelector('.maia-trend-chart');
    this.legend = dialog.querySelector('.maia-trend-legend');
    this.caption = dialog.querySelector('.maia-trend-caption');
    this.status = dialog.querySelector('.maia-trend-status');
    this.data = dialog.querySelector('.maia-trend-data');
    this.table = this.data.querySelector('table');
    this.retry = dialog.querySelector('.maia-trend-retry');
    this.views = [...dialog.querySelectorAll('[data-trend-view]')];
    this.cache = new Map();
    opener.onclick = () => {
      if (dialog.open || !analysis.current(this.snapshot) || FairPlayGuard.isLiveGameInProgress()) return;
      if (analysis.app.isPlaying) analysis.app.toggleAutoPlay();
      this.setView('chart');
      dialog.showModal();
      void this.start();
    };
    dialog.querySelector('#maia-trend-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      if (!dialog.open) this.request = null;
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    for (const button of this.views) button.onclick = () => this.setView(button.dataset.trendView);
    this.retry.onclick = () => this.start();
  }

  get busy() { return this.request?.running === true && this.dialog.open; }

  setView(view) {
    this.chart.hidden = view !== 'chart';
    this.data.hidden = view !== 'table';
    for (const button of this.views) button.setAttribute('aria-pressed', String(view === button.dataset.trendView));
  }

  reset() {
    this.request = null;
    this.opener.hidden = true;
    if (this.dialog.open) this.dialog.close();
    this.snapshot = null;
    this.chart.replaceChildren();
    this.legend.replaceChildren();
    this.table.replaceChildren();
    this.caption.textContent = '';
    this.status.textContent = '';
    this.retry.hidden = true;
  }

  update(snapshot, moves = [], lines = []) {
    if (!snapshot || !moves.length) { this.reset(); return; }
    this.snapshot = snapshot;
    this.moves = moves;
    this.lines = lines;
    this.opener.hidden = false;
    if (this.dialog.open && this.request) this.render(this.request);
  }

  async start() {
    const snapshot = this.snapshot;
    const { app } = this.analysis;
    if (this.busy || !this.dialog.open || !this.analysis.current(snapshot) || FairPlayGuard.isLiveGameInProgress()) return;
    const { ctx, entry } = snapshot;
    const engine = app.maiaEngine;
    // Each model instance owns its distributions, including custom weights.
    if (this.cacheEngine !== engine) {
      this.cache.clear();
      this.cacheEngine = engine;
    }
    const key = JSON.stringify([engine.modelKey, ctx.fen, ctx.history]);
    const samples = this.cache.get(key) || new Map();
    this.cache.delete(key);
    this.cache.set(key, samples);
    if (this.cache.size > CACHE_POSITIONS) this.cache.delete(this.cache.keys().next().value);
    samples.set(ctx.elo, probabilities(entry.prediction.moves));
    const request = { snapshot, samples, candidates: this.moves, running: true };
    this.request = request;
    const invalid = () => this.request !== request || !this.dialog.open || !this.analysis.current(snapshot) ||
      engine !== app.maiaEngine || FairPlayGuard.isLiveGameInProgress();
    this.render(request);
    try {
      const missing = RATINGS.filter(rating => !samples.has(rating))
        .sort((a, b) => Math.abs(a - ctx.elo) - Math.abs(b - ctx.elo));
      for (const rating of missing) {
        if (invalid()) return;
        const prediction = await this.analysis.predictMaia(engine, ctx.fen, rating, null, invalid, ctx.history, 1);
        if (invalid()) return;
        const sample = probabilities(prediction?.moves || []);
        if (sample.size) samples.set(rating, sample);
        this.render(request);
      }
    } catch (error) {
      if (!invalid()) console.warn('[Studio] Maia Elo sample failed:', error);
    } finally {
      request.running = false;
      if (!invalid()) this.render(request);
    }
  }

  series(request) {
    const best = this.lines[0];
    const candidates = new Map(request.candidates.map((move, index) => [
      move.uci, { uci: move.uci, san: move.san, role: ['maia', 'neutral', 'teal'][index] }
    ]));
    if (best) {
      const sameFirst = best.uci === request.candidates[0].uci;
      candidates.set(best.uci, { uci: best.uci, san: best.variation[0].san, role: sameFirst ? 'consensus' : 'sf' });
    }
    const { entry, ctx } = request.snapshot;
    return [...candidates.values()].map(candidate => {
      const score = this.lines.find(line => line.uci === candidate.uci)?.evaluation || entry.maiaEvaluations.get(candidate.uci);
      let delta = '—';
      if (candidate.uci === best?.uci) delta = '0.00';
      else if (best?.evaluation && score && !best.evaluation.isMate && !score.isMate) {
        const sign = ctx.fen.split(' ')[1] === 'b' ? -1 : 1;
        const loss = Math.max(0, (best.evaluation.cp - score.cp) * sign) / 100;
        delta = loss > 0 ? `−${loss.toFixed(2)}` : '0.00';
      }
      return { ...candidate, label: (symbols[candidate.role] || '') + candidate.san, delta };
    });
  }

  render(request) {
    const { samples, snapshot, running } = request;
    const elo = snapshot.ctx.elo;
    const complete = RATINGS.filter(rating => samples.has(rating)).length;
    const incomplete = !running && complete < RATINGS.length;
    this.status.textContent = t(incomplete ? 'maiaTrendPartial' : 'maiaTrendProgress', { count: complete, total: RATINGS.length });
    this.retry.hidden = !incomplete;
    const series = this.series(request);
    const x = rating => 36 + (rating - RATINGS[0]) / 2000 * 360;
    const y = percentage => 135 - percentage * 1.16;
    const svg = svgElement('svg', { viewBox: '0 0 420 161', 'aria-hidden': 'true' });
    for (const percent of [0, 25, 50, 75, 100]) {
      svg.append(
        svgElement('line', { x1: 36, x2: 396, y1: y(percent), y2: y(percent), class: 'maia-trend-grid' }),
        svgElement('text', { x: 31, y: y(percent) + 4, 'text-anchor': 'end' }, `${percent}%`)
      );
    }
    for (const rating of RATINGS) svg.append(svgElement('text', { x: x(rating), y: 153, 'text-anchor': 'middle' }, rating));
    svg.append(svgElement('line', { x1: x(elo), x2: x(elo), y1: y(100), y2: y(0), class: 'maia-trend-current' }));

    this.legend.replaceChildren();
    const ratings = [...new Set([...RATINGS, elo])].sort((a, b) => a - b);
    this.table.replaceChildren();
    const head = this.table.createTHead().insertRow();
    for (const title of ['Elo', ...series.map(move => move.label)]) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = title;
      head.append(th);
    }
    const body = this.table.createTBody();
    for (const rating of ratings) {
      const row = body.insertRow();
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = rating;
      row.append(th);
      for (const move of series) row.insertCell().textContent = formatProbability(samples.get(rating)?.get(move.uci));
    }
    for (const move of series) {
      const item = document.createElement('li');
      item.className = `maia-trend-series trend-${move.role}`;
      item.textContent = `${move.label} · Δ ${move.delta}`;
      this.legend.append(item);
      const group = svgElement('g', { class: `maia-trend-series trend-${move.role}`, 'data-uci': move.uci });
      let d = '', connected = false;
      for (const rating of RATINGS) {
        const p = samples.get(rating)?.get(move.uci);
        if (!Number.isFinite(p)) { connected = false; continue; }
        d += `${connected ? 'L' : 'M'}${x(rating)} ${y(p)} `;
        connected = true;
      }
      group.append(svgElement('path', { d }));
      for (const rating of ratings) {
        const probability = samples.get(rating)?.get(move.uci);
        if (!Number.isFinite(probability)) continue;
        const dot = svgElement('circle', { cx: x(rating), cy: y(probability), r: rating === elo ? 4 : 2.75, 'data-elo': rating });
        dot.append(svgElement('title', {}, `${move.san} · ${rating} Elo · ${formatProbability(probability)}`));
        group.append(dot);
      }
      svg.append(group);
    }
    this.caption.textContent = `${t('maiaTrendProbability')} · ${t('maiaTrendCurrent', { elo })}`;
    this.chart.replaceChildren(svg);
  }
}
