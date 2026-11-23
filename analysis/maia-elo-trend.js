import { t } from './i18n.js?v=20261123-checkup-account-selection';
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
    this.probabilitySource = dialog.querySelector('#maia-trend-probability-source');
    this.evaluationSource = dialog.querySelector('#maia-trend-evaluation-source');
    this.settings = dialog.querySelector('#maia-trend-settings');
    this.settingsToggle = dialog.querySelector('#maia-trend-settings-toggle');
    this.engineFields = [['model', 'intuition-edition'], ['engine', 'engine-edition']].map(([name, id]) => ({
      trend: dialog.querySelector(`#maia-trend-${name}`),
      workbench: document.getElementById(id)
    }));
    this.cache = new Map();
    opener.onclick = () => {
      if (dialog.open || !analysis.current(this.snapshot) || FairPlayGuard.isLiveGameInProgress()) return;
      if (analysis.app.isPlaying) analysis.app.toggleAutoPlay();
      this.setView('chart');
      this.highlight(null);
      dialog.showModal();
      void this.start();
    };
    dialog.querySelector('#maia-trend-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      this.request = this.refreshTarget = null;
      this.setSettingsOpen(false);
      analysis.app.scheduleReviewResume();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    for (const button of this.views) button.onclick = () => this.setView(button.dataset.trendView);
    this.retry.onclick = () => this.refreshTarget ? analysis.refresh() : this.start();
    this.settingsToggle.onclick = () => this.setSettingsOpen(this.settings.hidden, true);
    dialog.querySelector('#maia-trend-settings-cancel').onclick = () => this.setSettingsOpen(false, true);
    this.settings.onsubmit = event => {
      event.preventDefault();
      this.applySettings();
    };
  }

  get isOpen() { return this.dialog.open; }
  get busy() { return this.request?.running === true && this.dialog.open; }

  setSettingsOpen(open, focus = false) {
    if (open) {
      for (const { trend, workbench } of this.engineFields) {
        trend.replaceChildren(...Array.from(workbench.options, option => option.cloneNode(true)));
        trend.value = workbench.value;
      }
      this.settings.querySelector('#maia-trend-extension-note').hidden = document.getElementById('extension-standard-note').hidden;
    }
    this.settings.hidden = !open;
    this.settingsToggle.setAttribute('aria-expanded', String(open));
    if (focus) (open ? this.engineFields[0].trend : this.settingsToggle).focus();
  }

  applySettings() {
    const { app } = this.analysis;
    if (app.scanSourceLocked || app.practice?.active || !this.dialog.open || FairPlayGuard.isLiveGameInProgress()) return;
    const ctx = this.analysis.context();
    if (!ctx || this.engineFields.some(({ trend }) => trend.selectedIndex < 0 || trend.selectedOptions[0].disabled)) return;
    this.setSettingsOpen(false, true);
    if (this.engineFields.every(({ trend, workbench }) => trend.value === workbench.value)) return;
    this.refreshTarget = { ctx, positions: app.positions, branch: app.isBranching ? app.activeBranch : null };
    for (const { trend, workbench } of this.engineFields) workbench.value = trend.value;
    app.changeEngineVersions({ prioritizePosition: true });
  }

  isRefreshingHere() {
    const { app } = this.analysis;
    const target = this.refreshTarget;
    if (!target || !this.dialog.open || target.positions !== app.positions || target.branch !== (app.isBranching ? app.activeBranch : null) ||
        app.scanSourceLocked || app.practice?.active || FairPlayGuard.isLiveGameInProgress()) return false;
    const ctx = this.analysis.context();
    return ctx?.fen === target.ctx.fen && ctx.ply === target.ctx.ply && ctx.history.join(';') === target.ctx.history.join(';');
  }

  renderSources(snapshot, lines) {
    const { maiaEngine, stockfish } = this.analysis.app;
    this.probabilitySource.textContent = t('maiaTrendProbabilitySource', { model: maiaEngine.getModelName() });
    const depth = snapshot?.entry.sf?.depth;
    const status = lines.length && Number.isFinite(depth) ? t('maiaTrendDepth', { depth })
      : t(snapshot?.entry.sfFailed ? 'maiaTrendScoreUnavailable' : 'maiaTrendAwaitingScore');
    this.evaluationSource.textContent = t('maiaTrendEvaluationSource', {
      engine: t(stockfish.variant === 'standard' ? 'maiaTrendStockfishStandard' : 'maiaTrendStockfishLite'), status
    });
  }

  setView(view) {
    this.chart.hidden = view !== 'chart';
    this.data.hidden = view !== 'table';
    for (const button of this.views) button.setAttribute('aria-pressed', String(view === button.dataset.trendView));
  }

  reset() {
    this.request = null;
    this.opener.hidden = true;
    this.snapshot = null;
    this.chart.replaceChildren();
    this.legend.replaceChildren();
    this.table.replaceChildren();
    this.caption.textContent = '';
    this.status.textContent = '';
    this.retry.hidden = true;
    this.highlight(null);
    if (this.isRefreshingHere()) {
      this.status.textContent = t('maiaTrendRefreshing');
      this.renderSources(null, []);
      return;
    }
    this.refreshTarget = null;
    if (this.dialog.open) this.dialog.close();
    this.probabilitySource.textContent = this.evaluationSource.textContent = '';
  }

  update(snapshot, moves = [], lines = []) {
    if (this.refreshTarget) {
      if (!this.isRefreshingHere()) { this.reset(); return; }
      if (!snapshot || !moves.length) {
        const failed = snapshot?.entry.maiaFailed;
        this.status.textContent = t(failed ? 'intuitionUnavailable' : 'maiaTrendRefreshing');
        this.retry.textContent = t('maiaTrendRetryPosition');
        this.retry.hidden = !failed;
        this.renderSources(snapshot, lines);
        return;
      }
      this.refreshTarget = null;
    } else if (!snapshot || !moves.length) { this.reset(); return; }
    this.snapshot = snapshot;
    this.moves = moves;
    this.lines = lines;
    this.opener.hidden = false;
    if (!this.dialog.open) return;
    if (this.request) this.render(this.request);
    else void this.start();
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

  highlight(uci) {
    this.highlighted = uci;
    for (const button of this.legend.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.uci === uci));
    }
    for (const element of this.dialog.querySelectorAll('.maia-trend-chart g[data-uci], .maia-trend-data [data-uci]')) {
      element.classList.toggle('trend-muted', uci !== null && element.dataset.uci !== uci);
    }
  }

  renderLegend(series) {
    const remaining = new Map(Array.from(this.legend.children, item => [item.dataset.uci, item]));
    for (const [index, move] of series.entries()) {
      let item = remaining.get(move.uci);
      remaining.delete(move.uci);
      if (!item) {
        item = document.createElement('li');
        item.dataset.uci = move.uci;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.uci = move.uci;
        button.onclick = () => this.highlight(this.highlighted === move.uci ? null : move.uci);
        const swatch = svgElement('svg', { viewBox: '0 0 30 12', width: 30, height: 12, 'aria-hidden': 'true' });
        swatch.append(svgElement('path', { d: 'M2 6H28' }));
        button.append(swatch, document.createElement('span'));
        item.append(button);
      }
      item.className = `maia-trend-series trend-${move.role}`;
      item.querySelector('span').textContent = `${move.label} · Δ ${move.delta}`;
      if (this.legend.children[index] !== item) this.legend.insertBefore(item, this.legend.children[index] || null);
    }
    for (const item of remaining.values()) item.remove();
  }

  render(request) {
    const { samples, snapshot, running } = request;
    const elo = snapshot.ctx.elo;
    const complete = RATINGS.filter(rating => samples.has(rating)).length;
    const incomplete = !running && complete < RATINGS.length;
    this.status.textContent = t(incomplete ? 'maiaTrendPartial' : 'maiaTrendProgress', { count: complete, total: RATINGS.length });
    this.retry.textContent = t('maiaTrendRetry');
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

    this.renderLegend(series);
    const ratings = [...new Set([...RATINGS, elo])].sort((a, b) => a - b);
    this.table.replaceChildren();
    const head = this.table.createTHead().insertRow();
    for (const { label, uci } of [{ label: 'Elo' }, ...series]) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      if (uci) th.dataset.uci = uci;
      head.append(th);
    }
    const body = this.table.createTBody();
    for (const rating of ratings) {
      const row = body.insertRow();
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = rating;
      row.append(th);
      for (const move of series) {
        const cell = row.insertCell();
        cell.dataset.uci = move.uci;
        cell.textContent = formatProbability(samples.get(rating)?.get(move.uci));
      }
    }
    for (const move of series) {
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
    this.highlight(series.some(move => move.uci === this.highlighted) ? this.highlighted : null);
    this.renderSources(snapshot, this.lines);
  }
}
