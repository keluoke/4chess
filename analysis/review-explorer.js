import { t } from './i18n.js?v=20261103-jade';
import { REVIEW_QUALITIES, reviewCounts, selectReviewMoves, canPractice } from '../engine/review-policy.js?v=20261103-jade';

const element = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
export class ReviewExplorer {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('review-overview');
    this.side = 'all';
    this.root.addEventListener('click', event => {
      const button = event.target.closest('button[data-review-side]');
      if (!button) return;
      this.side = button.dataset.reviewSide;
      if (button.dataset.reviewCategory) app.currentDivergenceFilter = button.dataset.reviewCategory;
      app.renderBlunderCards();
      if (button.dataset.reviewCategory) this.focusSelection();
    });
    document.getElementById('review-clear-filter').onclick = () => { this.side = 'all'; app.currentDivergenceFilter = 'all'; app.renderBlunderCards(); };
    document.getElementById('review-practice-batch').onclick = () => {
      const queue = this.visible().filter(canPractice);
      if (queue.length) app.startPractice(queue[0], queue);
    };
  }
  reset(orientation) {
    this.side = orientation === 'black' ? 'b' : orientation === 'white' ? 'w' : 'all';
    this.app.currentDivergenceFilter = 'all';
    this.clear();
  }
  clear() {
    this.root.hidden = true; this.root.replaceChildren();
    document.getElementById('review-practice-batch').disabled = true;
    document.getElementById('review-practice-batch').textContent = t('reviewPracticeBatch', { count: 0 });
    document.getElementById('review-selection-label').textContent = '';
    document.querySelectorAll('[id^="filter-count-"]').forEach(el => { el.textContent = '0'; });
  }
  focusSelection() {
    const focus = this.app.el.blunderList.querySelector('.review-move-jump') || document.getElementById('review-selection-label');
    const target = focus.closest('.blunder-card') || focus;
    if (matchMedia('(min-width:1180px)').matches) this.app.scrollWithin(target, document.querySelector('.insight-column'));
    else target.scrollIntoView({ block: 'nearest' });
    focus.tabIndex = focus.tagName === 'BUTTON' ? 0 : -1; focus.focus({ preventScroll: true });
  }
  available(moves) {
    return this.app.reviewResult?.engineOnly ? moves.map(move => ({ ...move, divergenceStatus: 'unconfirmed', divergenceType: null, isBeyondIntuition: false, isHumanTrap: false })) : moves;
  }
  visible(moves = this.app.reviewResult?.allMoves || []) { return selectReviewMoves(this.available(moves), this.side, this.app.currentDivergenceFilter); }
  render(moves) {
    const app = this.app, result = app.reviewResult;
    moves = this.available(moves);
    const focus = this.root.contains(document.activeElement) ? { ...document.activeElement.dataset } : null;
    this.root.hidden = !result;
    this.root.replaceChildren();
    if (result) {
      this.root.append(element('h2', t('reviewOverview')));
      const sides = element('div', null, 'review-side-controls'); sides.setAttribute('aria-label', t('reviewSideFilter'));
      for (const [side, label] of [['all', 'reviewBoth'], ['w', 'whitePlayer'], ['b', 'blackPlayer']]) {
        const button = element('button', t(label)); button.type = 'button'; button.dataset.reviewSide = side;
        button.setAttribute('aria-pressed', String(this.side === side)); sides.append(button);
      }
      this.root.append(sides);
      const counts = reviewCounts(moves), table = element('table', null, 'review-count-table');
      const caption = element('caption', t('reviewCountHelp')); table.append(caption);
      const head = element('thead'), header = element('tr');
      for (const label of [t('reviewCategory'), app.el.metaWhite.textContent, app.el.metaBlack.textContent]) {
        const th = element('th', label); th.scope = 'col'; th.title = label; header.append(th);
      }
      head.append(header); table.append(head);
      const body = element('tbody');
      for (const category of [...REVIEW_QUALITIES, 'total', 'book', 'beyond', 'trap']) {
        const row = element('tr'); if (category === 'book') row.className = 'review-aux-start';
        const key = category === 'total' ? 'moves' : REVIEW_QUALITIES.includes(category) ? `quality:${category}` : category;
        const label = t(category === 'total' ? 'reviewTotal' : `reviewQuality_${category}`);
        if (category === 'total') row.className = 'review-total-row';
        const heading = element('th', label); heading.scope = 'row'; row.append(heading);
        for (const side of ['w', 'b']) {
          const cell = element('td'), pending = ['beyond', 'trap'].includes(category) && result.engineOnly;
          const button = element('button', pending ? '—' : String(counts[side][category])); button.type = 'button';
          button.dataset.reviewSide = side; button.dataset.reviewCategory = key;
          button.disabled = pending;
          button.setAttribute('aria-label', `${t(side === 'w' ? 'whitePlayer' : 'blackPlayer')} · ${label} · ${pending ? t('reviewIntuitionPending') : counts[side][category]}`);
          button.setAttribute('aria-pressed', String(this.side === side && app.currentDivergenceFilter === key));
          cell.append(button); row.append(cell);
        }
        body.append(row);
      }
      table.append(body); this.root.append(table);
      const method = element('details', null, 'analysis-help');
      method.append(element('summary', t('reviewQualityHelpTitle')), element('p', t('reviewQualityHelp'))); this.root.append(method);
      const note = element('p', result.engineOnly ? t('reviewIntuitionPending') : t('reviewConfirmedOnly'), 'review-count-note'); this.root.append(note);
      if (result.isPartial) this.root.append(element('p', t('reviewPartial'), 'review-count-note'));
    }
    const side = t(this.side === 'w' ? 'whitePlayer' : this.side === 'b' ? 'blackPlayer' : 'reviewBoth');
    const filter = app.currentDivergenceFilter;
    const label = filter.startsWith('quality:') ? t(`reviewQuality_${filter.slice(8)}`) : t({ all: 'reviewKeyMoves', moves: 'reviewAllMoves', mistakes: 'filterMistakes', book: 'reviewQuality_book', beyond: 'reviewQuality_beyond', trap: 'reviewQuality_trap' }[filter]);
    const visible = this.visible(moves);
    document.getElementById('review-selection-label').textContent = result ? t('reviewSelected', { side, label, count: visible.length }) : '';
    for (const key of ['all', 'moves', 'mistakes', 'beyond', 'trap']) {
      const count = document.getElementById(`filter-count-${key}`);
      if (count) count.textContent = ['beyond', 'trap'].includes(key) && result?.engineOnly ? '—' : String(selectReviewMoves(moves, this.side, key).length);
      const pill = document.querySelector(`.filter-pill[data-filter="${key}"]`);
      pill?.classList.toggle('active', key === filter); pill?.setAttribute('aria-pressed', String(key === filter));
    }
    const queue = visible.filter(canPractice), batch = document.getElementById('review-practice-batch');
    batch.disabled = !queue.length || !!app.scanSourceLocked;
    batch.textContent = t('reviewPracticeBatch', { count: queue.length });
    if (focus?.reviewSide) this.root.querySelector(`button[data-review-side="${focus.reviewSide}"]${focus.reviewCategory ? `[data-review-category="${focus.reviewCategory}"]` : ':not([data-review-category])'}`)?.focus({ preventScroll: true });
    return visible;
  }
}
