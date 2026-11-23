import { rankCheckupOpenings, summarizeCheckupOverview } from './checkup-insights.js?v=20261123-playing-profile';
import { t } from './i18n.js?v=20261123-playing-profile';

const outcomes = ['win', 'draw', 'loss'];
const color = side => t(side === 'w' ? 'checkupColorWhite' : 'checkupColorBlack');
const ratio = (part, total) => total ? part / total : 0;
export const checkupPercent = (part, total) => total ? `${Math.round(ratio(part, total) * 100)}%` : '—';

export function overviewSummary(result) {
  const { w, b } = result.colors;
  const summary = [];
  if (w.count && b.count) {
    const gap = Math.round((ratio(w.points, w.count) - ratio(b.points, b.count)) * 100);
    summary.push(gap ? t('checkupSummaryLead', { side: color(gap > 0 ? 'w' : 'b'), gap: Math.abs(gap) }) : t('checkupSummaryEven'));
  }
  if (result.total.loss) {
    summary.push(t('checkupSummaryTimeLoss', { rate: checkupPercent(result.pressure.timeoutLosses, result.total.loss) }));
  }
  return summary.join(t('checkupSummaryJoin'));
}

export function clockErrorTone(errors, reviewed) {
  if (!reviewed) return 'missing';
  const rate = ratio(errors, reviewed);
  return rate >= 0.25 ? 'high' : rate >= 0.12 ? 'medium' : 'low';
}

function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function card(title, ...children) {
  return el('section', 'checkup-insight-section', el('h3', '', t(title)), ...children);
}

function bar(className, segments) {
  const track = el('span', 'checkup-stat-bar ' + className);
  track.setAttribute('aria-hidden', 'true');
  for (const [tone, ratio] of segments) {
    if (!(ratio > 0)) continue;
    const segment = el('span', 'checkup-tone-' + tone);
    segment.style.width = `${ratio * 100}%`;
    track.append(segment);
  }
  return track;
}

function resultBlock(label, record, side = '') {
  const score = el('div', 'checkup-score-value', el('strong', '', checkupPercent(record.points, record.count)),
    el('span', '', t('checkupScoreRate')));
  const legend = el('div', 'checkup-result-legend', ...outcomes.map(kind =>
    el('span', 'checkup-legend-' + kind, t(`checkupOutcome_${kind}`, { count: record[kind] }))));
  const resultBar = bar('checkup-result-bar', outcomes.map(kind => [kind, ratio(record[kind], record.count)]));
  return el('div', side ? 'checkup-result-side checkup-result-' + side : 'checkup-result-total',
    el('span', 'checkup-result-label', label), score, resultBar, legend);
}

function options(items, value, label, onChange) {
  const group = el('div', 'checkup-pills');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [id, text] of items) {
    const button = el('button', 'btn-header', text);
    button.type = 'button';
    button.dataset.value = id;
    button.setAttribute('aria-pressed', String(value === id));
    button.onclick = () => {
      if (value !== id) onChange(id);
    };
    group.append(button);
  }
  return group;
}

export function renderOverviewSpeeds(host, speeds, state, speedLabel, onChange) {
  const group = options([['', t('checkupAllSpeeds')], ...speeds.map(id => [id, speedLabel(id)])],
    state.speed, t('checkupTimeClass'), value => {
      onChange(value);
      [...host.querySelectorAll('button')].find(button => button.dataset.value === value)?.focus({ preventScroll: true });
    });
  host.hidden = !speeds.length;
  host.replaceChildren(group);
}

function matchList(games, openGame, speedLabel) {
  const list = el('div', 'checkup-match-list');
  for (const game of games) {
    const opponent = game.side === 'w' ? game.meta.black : game.meta.white;
    const result = el('span', `checkup-match-${game.outcome}`, t(`checkupResult_${game.outcome}`));
    const meta = el('small', '', [game.meta.date, game.meta.timeClass && speedLabel(game.meta.timeClass)].filter(Boolean).join(' · '));
    const button = el('button', 'checkup-match', result, el('span', '', opponent || '—', meta), el('span', 'checkup-match-link', t('checkupOpenGame')));
    button.type = 'button';
    button.onclick = () => openGame(game, button);
    list.append(button);
  }
  return list;
}

function disclosure(key, state, title, content) {
  const summary = el('summary', '', ...title);
  const detail = el('details', 'checkup-overview-detail', summary, content);
  detail.dataset.detail = key;
  detail.open = state.expanded.has(key);
  detail.ontoggle = () => {
    if (detail.open) state.expanded.add(key);
    else state.expanded.delete(key);
  };
  return detail;
}

function renderOpenings(result, state, openGame, speedLabel, onSide) {
  const side = state.side;
  const selector = options([['w', color('w')], ['b', color('b')]], side, t('checkupOpeningColor'), value => onSide(value));
  const openingCard = card('checkupOverviewOpenings', selector);
  openingCard.classList.add('checkup-openings-card');
  const highlighted = rankCheckupOpenings(result.openings, side);
  const renderOpening = opening => {
    const { eco, name, count, points, labels = [] } = opening;
    const label = el('span', 'checkup-opening-labels', ...labels.map(key => {
      const tone = key === 'checkupOpeningBest' ? 'best' : key === 'checkupOpeningWorst' ? 'worst' : 'popular';
      return el('span', 'checkup-opening-' + tone, t(key));
    }));
    const identity = el('span', 'checkup-opening-id', el('span', 'checkup-eco', eco),
      el('span', '', el('strong', '', name || t('checkupOpeningUnnamed')), label));
    const magnitude = el('span', 'checkup-opening-score', el('small', '', t('checkupOverviewGameCount', { count })),
      bar('', [['win', points / count]]), el('strong', '', checkupPercent(points, count)));
    return disclosure(opening.key, state, [identity, magnitude], matchList(opening.games, openGame, speedLabel));
  };
  openingCard.append(...highlighted.map(renderOpening));
  const more = result.openings.filter(item => item.side === side)
    .sort((a, b) => b.count - a.count || a.eco.localeCompare(b.eco)).slice(0, 8)
    .filter(item => !highlighted.some(featured => featured.key === item.key));
  if (more.length) openingCard.append(disclosure('more-' + side, state, [t('checkupOpeningMore')],
    el('div', 'checkup-more-openings', ...more.map(renderOpening))));
  if (!highlighted.length) openingCard.append(el('p', 'checkup-stat-note', t('checkupOpeningNone')));
  else if (!highlighted.some(item => item.count >= 3)) openingCard.append(el('p', 'checkup-stat-note', t('checkupOpeningFew')));
  return openingCard;
}

function renderEndings(result) {
  return card('checkupOverviewEndings', el('div', 'checkup-endings',
    ...Object.entries(result.endings).map(([kind, count]) => el('div', 'checkup-ending-row',
      el('span', '', t(`checkupEnding_${kind}`)),
      bar('', [[kind === 'timeout' ? 'timeout' : 'win', ratio(count, result.count)]]),
      el('span', 'checkup-ending-count', String(count)), el('strong', '', checkupPercent(count, result.count))
    ))));
}

function renderPressure(result, state, openGame, speedLabel) {
  const { low, observed, reviewedLow, errors, timeoutLosses } = result.pressure;
  const kpi = (title, value, hint, tone = '') => el('div', `checkup-clock-kpi ${tone}`.trim(),
    el('span', '', t(title)), el('strong', '', value), hint ? el('small', '', hint) : '');
  const pressureCard = card('checkupOverviewPressure', el('div', 'checkup-clock-grid',
    kpi('checkupClockShare', checkupPercent(low, observed),
      observed ? t('checkupClockShareDetail', { low, observed }) : t('checkupClockUnavailable')),
    kpi('checkupClockTimeout', String(timeoutLosses), '', timeoutLosses ? 'checkup-clock-timeout' : ''),
    kpi('checkupClockErrorRate', checkupPercent(errors, reviewedLow),
      reviewedLow ? t('checkupClockCoverage', { errors, reviewed: reviewedLow, low }) : t('checkupClockNoReviews'),
      'checkup-clock-' + clockErrorTone(errors, reviewedLow))
  ));
  if (timeoutLosses) pressureCard.append(disclosure('timeout', state, [t('checkupTimeoutGames', { count: timeoutLosses })],
    matchList(result.timeoutGames, openGame, speedLabel)));
  return pressureCard;
}

export function renderCheckupOverview(host, games, state, { openGame, speedLabel }) {
  const result = summarizeCheckupOverview(games, state.speed);
  const hero = card('checkupOverviewRecord', el('div', 'checkup-overview-record',
    resultBlock(t('checkupOverviewSample', { count: result.count }), result.total),
    el('div', 'checkup-overview-sides', resultBlock(color('w'), result.colors.w, 'w'), resultBlock(color('b'), result.colors.b, 'b'))
  ));
  hero.classList.add('checkup-overview-hero');
  const summary = overviewSummary(result);
  if (summary) hero.querySelector('h3').after(el('p', 'checkup-hero-summary', summary));
  const changeSide = value => {
    state.side = value;
    renderCheckupOverview(host, games, state, { openGame, speedLabel });
    host.querySelector('.checkup-openings-card [aria-pressed="true"]')?.focus({ preventScroll: true });
  };
  host.replaceChildren(hero, renderOpenings(result, state, openGame, speedLabel, changeSide),
    el('div', 'checkup-overview-footer', renderEndings(result), renderPressure(result, state, openGame, speedLabel)));
}
