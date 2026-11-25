import { t } from './i18n.js?v=20261124-intuition-labels';
import { REVIEW_QUALITIES, reviewCounts, selectReviewMoves, canPractice } from '../engine/review-policy.js?v=20261120-review';

const byId = id => document.getElementById(id);
const sideKeys = { all: 'reviewBoth', w: 'reviewWhite', b: 'reviewBlack' };
const intuitionOrder = ['trap', 'precise', 'beyond'];
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
      const chip = event.target.closest('.review-intuition-kind');
      if (!chip) return;
      const category = chip.dataset.reviewCategory;
      this.select(this.side, category);
    });
    this.details.addEventListener('click', event => {
      const button = event.target.closest('button[data-review-side]');
      if (!button) return;
      this.app.reviewOverview.show('workbench');
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
    const visible = this.app.renderBlunderCards();
    if (!category) return;
    if (category === 'all' || category === 'moves') {
      this.focusSelection();
      return;
    }
    const current = visible.find(move => move.ply === this.app.currentPly);
    const match = current || visible[0];
    if (!current && match) this.app.goToPly(match.ply, { before: true, revealCandidates: true, scrollReview: false });
    this.focusSelection(match?.ply);
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

  cardFor(ply) {
    return this.app.el.blunderList.querySelector(`.blunder-card[data-ply="${ply}"]`);
  }

  keepCardInPlace(card, top) {
    if (!card?.isConnected) return;
    const scroller = matchMedia('(min-width:1180px)').matches ? this.column : document.scrollingElement;
    const delta = card.getBoundingClientRect().top - top;
    if (Math.abs(delta) > .5) scroller.scrollTop += delta;
  }

  focusSelection(ply) {
    const list = this.app.el.blunderList;
    const card = ply === undefined ? null : this.cardFor(ply);
    const focus = card?.querySelector('.review-move-jump') ||
      list.querySelector('.review-move-jump, .review-empty') || byId('review-selection-label');
    const target = focus.closest('.blunder-card') || focus;
    if (matchMedia('(min-width:1180px)').matches) {
      if (card) {
        const top = this.column.getBoundingClientRect().top + this.column.clientTop + this.toolbar.offsetHeight + 8;
        this.column.scrollTop += target.getBoundingClientRect().top - top;
      } else this.app.scrollWithin(target, this.column);
    } else target.scrollIntoView({ block: card ? 'start' : 'nearest' });
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

  countButton(side, category, count, label) {
    const button = this.filterButton(side, category, null, `${t(sideKeys[side])} · ${label} · ${count}`);
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
    grid.title = note.textContent;
    const chips = coverage ? intuitionOrder.map(category => {
      const label = filterLabel(category);
      const total = (this.side === 'b' ? 0 : counts.w[category]) + (this.side === 'w' ? 0 : counts.b[category]);
      const count = partial && total === 0 ? '—' : String(total);
      const button = this.filterButton(this.side, category, label, `${label} · ${t(sideKeys[this.side])} · ${count}`, 'review-intuition-kind');
      button.dataset.kind = category;
      button.append(element('strong', count, 'review-metric-value'));
      return button;
    }) : [];
    grid.hidden = !chips.length;
    grid.replaceChildren(...chips);
  }

  renderEngineSummary(result) {
    const scores = sides.map(side => {
      const score = side === 'b' ? result.accuracyBlack : result.accuracyWhite;
      const coverage = side === 'b' ? result.coverageRateBlack : result.coverageRateWhite;
      const value = element('span', null, 'review-engine-value');
      value.append(element('span', t(sideKeys[side])), element('strong', Number.isFinite(score) ? score.toFixed(1) : '—'));
      if (Number.isFinite(coverage) && coverage < 100) value.title = t('coverageTooltip', { pct: coverage });
      return value;
    });
    byId('review-engine-scores').replaceChildren(...scores);
  }

  renderClassifications(counts) {
    const table = element('table', null, 'review-count-table');
    table.setAttribute('aria-label', t('reviewAllClassifications'));
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
      const focusRoot = this.details.contains(active) ? this.details : this.root;
      const focus = focusRoot.contains(active) ? { ...active.dataset } : {};
      const counts = reviewCounts(available);
      this.renderIntuition(counts, available, result);
      this.renderEngineSummary(result);
      this.renderClassifications(counts);
      byId('review-partial-note').hidden = !result.isPartial;
      if (focus.reviewSide) {
        const category = focus.reviewCategory ? `[data-review-category="${focus.reviewCategory}"]` : ':not([data-review-category])';
        focusRoot.querySelector(`button[data-review-side="${focus.reviewSide}"]${category}`)?.focus({ preventScroll: true });
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
