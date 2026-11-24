import { t } from './i18n.js?v=20261124-review-scan-polish';
import { REVIEW_QUALITIES, reviewCounts, selectReviewMoves, canPractice } from '../engine/review-policy.js?v=20261117-review-policy';

const byId = id => document.getElementById(id);
const sideKeys = { all: 'reviewBoth', w: 'reviewWhite', b: 'reviewBlack' };
const intuitionOrder = ['trap', 'beyond', 'precise'];
const sides = ['w', 'b'];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function filterLabel(category) {
  if (category.startsWith('quality:')) return t(`reviewQuality_${category.slice(8)}`);
  return t({ all: 'reviewKeyMoves', moves: 'reviewAllMoves', mistakes: 'reviewEngineErrors' }[category] || `reviewQuality_${category}`);
}

export class ReviewExplorer {
  constructor(app) {
    this.app = app;
    this.side = 'all';
    this.root = byId('review-overview');
    this.details = byId('review-classifications');
    this.toolbar = document.querySelector('.review-filter-toolbar');
    this.modes = this.toolbar.querySelectorAll('[data-filter]');
    this.sideButtons = this.toolbar.querySelectorAll('[data-review-side]');
    this.clearButton = byId('review-clear-filter');
    this.column = byId('insight-column');
    this.toolbarObserver = new ResizeObserver(() => {
      this.column.style.setProperty('--review-toolbar-height', `${this.toolbar.getBoundingClientRect().height}px`);
    });
    this.toolbarObserver.observe(this.toolbar);

    this.root.addEventListener('click', event => {
      const button = event.target.closest('button[data-review-side]');
      if (!button) return;
      this.select(button.dataset.reviewSide, button.dataset.reviewCategory);
    });
    for (const button of this.modes) {
      button.onclick = () => {
        app.currentDivergenceFilter = button.dataset.filter;
        app.renderBlunderCards();
        this.focusSelection();
      };
    }
    for (const button of this.sideButtons) button.onclick = () => this.select(button.dataset.reviewSide);
    this.clearButton.onclick = () => this.select('all', 'all');
    byId('review-practice-batch').onclick = () => {
      const queue = this.visible().filter(canPractice);
      if (queue.length) app.startPractice(queue[0], queue);
    };
  }

  select(side, category) {
    this.sideSelected = true;
    this.side = this.app.reviewOverview.side = side;
    if (category) this.app.currentDivergenceFilter = category;
    this.app.renderBlunderCards();
    if (category) this.focusSelection();
  }

  reset(orientation) {
    this.sideSelected = false;
    this.side = orientation === 'black' ? 'b' : orientation === 'white' ? 'w' : 'all';
    this.app.currentDivergenceFilter = 'all';
    this.details.open = false;
    this.clear();
  }

  clear() {
    this.root.hidden = this.toolbar.hidden = true;
    const batch = byId('review-practice-batch');
    batch.disabled = true;
    batch.textContent = t('reviewPracticeBatch', { count: 0 });
    byId('review-selection-label').textContent = '';
  }

  focusSelection() {
    const list = this.app.el.blunderList;
    const focus = list.querySelector('.review-move-jump, .review-empty') || byId('review-selection-label');
    const target = focus.closest('.blunder-card') || focus;
    if (matchMedia('(min-width:1180px)').matches) this.app.scrollWithin(target, this.column);
    else target.scrollIntoView({ block: 'nearest' });
    if (focus.tagName !== 'BUTTON') focus.tabIndex = -1;
    focus.focus({ preventScroll: true });
  }

  available(moves) {
    return this.app.reviewResult?.engineOnly ? moves.map(move => ({ ...move, divergenceStatus: 'unconfirmed', divergenceType: null, isBeyondIntuition: false, isHumanTrap: false })) : moves;
  }

  visible(moves = this.app.reviewResult?.allMoves || []) {
    return selectReviewMoves(this.available(moves), this.side, this.app.currentDivergenceFilter);
  }

  filterButton(side, category, text, label, className) {
    const button = element('button', text, className);
    button.type = 'button';
    button.dataset.reviewSide = side;
    if (category) button.dataset.reviewCategory = category;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(this.side === side && (!category || this.app.currentDivergenceFilter === category)));
    return button;
  }

  countButton(side, category, count, label, { showSide = false } = {}) {
    const button = this.filterButton(side, category, null, `${t(sideKeys[side])} · ${label} · ${count}`);
    if (showSide) button.append(element('span', t(sideKeys[side])));
    button.append(element('strong', String(count), 'review-metric-value'));
    button.classList.toggle('review-count-positive', count > 0);
    return button;
  }

  renderIntuition(counts, moves, result) {
    const coverage = result.engineOnly ? 0 : moves.some(move => Array.isArray(move._predMoves))
      ? moves.filter(move => move._predMoves?.length).length
      : moves.length;
    const partial = coverage > 0 && coverage < moves.length;
    const note = byId('review-intuition-coverage');
    note.hidden = !partial;
    note.textContent = partial ? t('reviewIntuitionCoverage', { current: coverage, total: moves.length }) : '';

    const grid = byId('review-intuition-grid');
    const categories = coverage ? intuitionOrder.filter(category => !partial || counts.w[category] + counts.b[category] > 0) : [];
    const cards = categories.map(category => {
      const label = filterLabel(category);
      const total = counts.w[category] + counts.b[category];
      const card = element('div', null, 'review-intuition-card');
      card.dataset.kind = category;
      const heading = this.filterButton('all', category, label, `${label} · ${t('reviewBoth')} · ${total}`, 'review-intuition-kind');
      card.dataset.selected = String(this.app.currentDivergenceFilter === category);
      const values = element('div', null, 'review-intuition-values');
      for (const side of sides) {
        const count = counts[side][category];
        if (!partial || count > 0) values.append(this.countButton(side, category, count, label, { showSide: true }));
      }
      card.append(heading, values);
      return card;
    });
    grid.hidden = !cards.length;
    grid.replaceChildren(...cards);
  }

  renderEngineSummary(counts, result) {
    const accuracy = element('div', null, 'review-engine-metric');
    const errors = element('div', null, 'review-engine-metric');
    const errorsLabel = filterLabel('mistakes');
    accuracy.append(element('span', t('accuracyLabel'), 'review-engine-label'));
    errors.append(element('span', errorsLabel, 'review-engine-label'));
    const scores = element('div', null, 'review-engine-values');
    const totals = element('div', null, 'review-engine-values');
    for (const [index, side] of sides.entries()) {
      const score = index ? result.accuracyBlack : result.accuracyWhite;
      const coverage = index ? result.coverageRateBlack : result.coverageRateWhite;
      const value = element('span', null, 'review-engine-value');
      value.append(element('span', t(sideKeys[side])), element('strong', Number.isFinite(score) ? score.toFixed(1) : '—'));
      if (Number.isFinite(coverage) && coverage < 100) value.title = t('coverageTooltip', { pct: coverage });
      scores.append(value);
      totals.append(this.countButton(side, 'mistakes', counts[side].mistake + counts[side].blunder, errorsLabel, { showSide: true }));
    }
    accuracy.append(scores);
    errors.append(totals);
    byId('review-engine-summary').replaceChildren(accuracy, errors);
  }

  renderClassifications(counts) {
    const table = element('table', null, 'review-count-table');
    table.setAttribute('aria-labelledby', 'review-explorer-title');
    const head = table.createTHead().insertRow();
    for (const label of [t('reviewCategory'), this.app.el.metaWhite.textContent, this.app.el.metaBlack.textContent]) {
      const th = element('th', label);
      th.scope = 'col';
      th.title = label;
      head.append(th);
    }
    const body = table.createTBody();
    for (const category of [...REVIEW_QUALITIES, 'book', 'total']) {
      const row = body.insertRow();
      row.dataset.quality = category;
      const key = category === 'total' ? 'moves' : category === 'book' ? 'book' : `quality:${category}`;
      const label = category === 'total' ? t('reviewTotal') : filterLabel(key);
      const heading = element('th', label);
      heading.scope = 'row';
      row.append(heading);
      for (const side of sides) row.insertCell().append(this.countButton(side, key, counts[side][category], label));
    }
    byId('review-classification-table').replaceChildren(table);
  }

  render(moves) {
    const result = this.app.reviewResult;
    const filter = this.app.currentDivergenceFilter;
    const available = this.available(moves);
    const visible = selectReviewMoves(available, this.side, filter);
    this.root.hidden = this.toolbar.hidden = !result;
    if (result) {
      const active = document.activeElement;
      const focus = this.root.contains(active) ? { ...active.dataset } : {};
      const counts = reviewCounts(available);
      this.renderIntuition(counts, available, result);
      this.renderEngineSummary(counts, result);
      this.renderClassifications(counts);
      byId('review-partial-note').hidden = !result.isPartial;
      if (focus.reviewSide) {
        const category = focus.reviewCategory ? `[data-review-category="${focus.reviewCategory}"]` : ':not([data-review-category])';
        this.root.querySelector(`button[data-review-side="${focus.reviewSide}"]${category}`)?.focus({ preventScroll: true });
      }
    }
    const side = t(sideKeys[this.side]);
    byId('review-selection-label').textContent = result ? t('reviewSelected', { side, label: filterLabel(filter), count: visible.length }) : '';
    for (const button of this.modes) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    for (const button of this.sideButtons) button.setAttribute('aria-pressed', String(button.dataset.reviewSide === this.side));
    this.clearButton.hidden = !result || (this.side === 'all' && filter === 'all');
    const queue = visible.filter(canPractice), batch = byId('review-practice-batch');
    batch.disabled = !queue.length || !!this.app.scanSourceLocked;
    batch.textContent = t('reviewPracticeBatch', { count: queue.length });
    return visible;
  }
}
