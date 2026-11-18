import { t } from './i18n.js?v=20261118-review-overview';
import { canPractice, coreTurningPoints, intuitionKind, isKeyMoment, selectReviewMoves } from '../engine/review-policy.js?v=20261117-review-policy';

const byId = id => document.getElementById(id);
const sideLabel = side => t(side === 'w' ? 'reviewWhite' : side === 'b' ? 'reviewBlack' : 'reviewBoth');

function compareImpact(a, b) {
  return (b.expectedScoreLoss ?? 0) - (a.expectedScoreLoss ?? 0) ||
    (b.lossCp ?? 0) - (a.lossCp ?? 0) || a.ply - b.ply;
}

function leadingSide(cp) {
  return cp >= 100 ? 'w' : cp <= -100 ? 'b' : null;
}

export class ReviewOverview {
  constructor(app) {
    this.app = app;
    this.summary = byId('review-summary');
    this.title = byId('review-report-title');
    this.views = byId('review-views');
    this.overviewButton = byId('btn-review-overview');
    this.workbenchButton = byId('btn-review-workbench');
    this.readyButton = byId('review-ready');
    this.practiceButton = byId('review-report-practice');
    this.scoreButton = byId('review-report-workbench');
    this.turnButton = byId('review-report-turn');
    this.sidePicker = byId('review-report-side');
    this.overviewButton.onclick = this.readyButton.onclick = () => this.show('overview', { focus: true });
    this.workbenchButton.onclick = () => this.show('workbench');
    this.scoreButton.onclick = () => this.show('workbench', { focus: true });
    this.practiceButton.onclick = () => {
      const queue = this.queue;
      if (queue.length) app.startPractice(queue[0], queue);
    };
    this.sidePicker.addEventListener('click', event => {
      const button = event.target.closest('[data-practice-side]');
      if (!button) return;
      this.side = button.dataset.practiceSide;
      this.renderPractice(app.reviewExplorer.available(app.reviewResult.allMoves));
    });
    this.reset();
  }

  reset() {
    this.received = this.exploring = this.pending = false;
    this.side = 'all';
    this.queue = [];
    this.summary.querySelector('details').open = false;
    this.show('workbench');
  }

  update(result) {
    if (!this.received) {
      this.received = true;
      this.pending = this.exploring;
      this.show(this.exploring ? 'workbench' : 'overview');
      if (!this.exploring) this.title.scrollIntoView({ block: 'nearest' });
    } else this.show(this.view);
    this.render(result);
  }

  show(view, { focus = false } = {}) {
    const available = this.received && !!this.app.reviewResult && !this.app.scanSourceLocked;
    this.view = view;
    const overview = available && view === 'overview';
    if (overview) this.pending = false;
    this.views.hidden = !available;
    this.readyButton.hidden = !available || !this.pending;
    this.readyButton.textContent = t(this.app.reviewResult?.isPartial ? 'reviewPartialReady' : 'reviewReady');
    this.summary.hidden = !overview;
    document.body.classList.toggle('show-review-overview', overview);
    this.overviewButton.setAttribute('aria-pressed', String(overview));
    this.workbenchButton.setAttribute('aria-pressed', String(!overview));
    if (focus) {
      const target = overview ? this.title : this.workbenchButton;
      target.focus({ preventScroll: true });
      if (overview) target.scrollIntoView({ block: 'nearest' });
    }
  }

  jumpTo(move) {
    this.show('workbench');
    this.app.goToPly(move.ply, { before: true, revealCandidates: true });
    document.getElementById('position-context')?.focus({ preventScroll: true });
  }

  render(result = this.app.reviewResult) {
    if (!result) return;
    const allMoves = result.allMoves;
    const moveCount = allMoves.length;
    const round = allMoves.at(-1)?.moveNumber;
    const score = this.app.el.metaResult.textContent;
    byId('review-report-meta').textContent = [
      this.app.el.metaWhite.textContent, this.app.el.metaBlack.textContent,
      !result.isPartial && ['1-0', '0-1', '1/2-1/2'].includes(score) ? score : '',
      result.isPartial || !round ? t('reviewLoadedPlies', { count: moveCount }) : t('reviewThroughRound', { round })
    ].filter(Boolean).join(' · ');

    const moves = this.app.reviewExplorer.available(allMoves);
    const scored = moves.filter(move => Number.isFinite(move.accuracy) && Number.isFinite(move.expectedScoreLoss));
    const turningPoint = scored.filter(move => move.expectedScoreLoss >= 8).sort(compareImpact)[0];
    this.renderStory(result, scored, turningPoint);
    const beyond = selectReviewMoves(moves, 'all', 'beyond').length;
    const traps = selectReviewMoves(moves, 'all', 'trap').length;
    byId('review-report-intuition').textContent = [
      beyond ? t('reviewConfirmedBeyond', { count: beyond }) : '',
      traps ? t('reviewConfirmedTraps', { count: traps }) : ''
    ].filter(Boolean).join(' · ');
  }

  renderStory(result, scored, turningPoint) {
    const sideScores = (result.positionEvaluations || []).map((evaluation, index) => {
      const turn = result.allMoves[index]?.turn || (result.allMoves.at(-1)?.turn === 'b' ? 'w' : 'b');
      return Number.isFinite(evaluation?.scoreCp) ? evaluation.scoreCp * (turn === 'w' ? 1 : -1) : null;
    });
    const samples = sideScores.filter(Number.isFinite);
    const complete = samples.length >= 3 && samples.length === result.allMoves.length + 1 && !result.isPartial;
    let story = t('reviewScoredPlies', { valid: scored.length, count: result.allMoves.length });
    if (complete) {
      const end = samples.at(-1);
      const lead = leadingSide(end);
      const endPosition = result.positionEvaluations.at(-1);
      const early = leadingSide(samples[Math.min(20, Math.floor(samples.length / 3))]);
      const stayedAhead = lead && samples.slice(-Math.min(6, samples.length)).every(cp => leadingSide(cp) === lead);
      if (samples.every(cp => Math.abs(cp) < 100)) story = t('reviewBalanced');
      else if (endPosition?.isMate && endPosition.terminal && lead) story = t('reviewCheckmated', { side: sideLabel(lead) });
      else if (early && lead && early !== lead) story = t('reviewLeadChanged', { early: sideLabel(early), late: sideLabel(lead) });
      else if (stayedAhead) story = t('reviewClosingLead', { side: sideLabel(lead) });
      else if (lead) story = t('reviewFinalLead', { side: sideLabel(lead) });
      else story = t('reviewBackToBalance');
    }
    if (turningPoint) {
      story += ' ' + t('reviewLargestSwing', { side: sideLabel(turningPoint.turn), round: turningPoint.moveNumber,
        points: turningPoint.expectedScoreLoss });
    }
    byId('review-report-story').textContent = story;
    this.turnButton.hidden = !turningPoint;
    if (turningPoint) {
      this.turnButton.textContent = t('reviewInspectRound', { round: turningPoint.moveNumber });
      this.turnButton.onclick = () => this.jumpTo(turningPoint);
    }
  }

  renderPractice(moves) {
    const { side } = this;
    const candidates = moves.filter(move => canPractice(move) && !move.isCombinationFollowup);
    const inScope = candidates.filter(move => side === 'all' || side === move.turn);
    const core = coreTurningPoints(inScope);
    const ranked = inScope.filter(move => isKeyMoment(move)).sort((a, b) =>
      Number(core.has(b.ply)) - Number(core.has(a.ply)) || compareImpact(a, b));
    const first = ranked.find(move => intuitionKind(move) !== 'beyond') || ranked[0];
    const next = first && (ranked.find(move => move.ply !== first.ply && intuitionKind(move) === 'beyond') ||
      ranked.find(move => move.ply !== first.ply && (side !== 'all' || move.turn !== first.turn)) ||
      ranked.find(move => move.ply !== first.ply));
    this.queue = [first, next].filter(Boolean).sort((a, b) => a.ply - b.ply);
    this.sidePicker.hidden = !candidates.some(isKeyMoment);
    for (const button of this.sidePicker.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.practiceSide === side));
    }
    const completed = this.queue.filter(move => ['independent', 'hinted', 'revealed']
      .includes(this.app.practiceResults.get(move.ply)?.status)).length;
    byId('review-report-practice-status').textContent = completed ? t('reviewPracticed', { count: completed }) : '';
    this.practiceButton.hidden = !this.queue.length;
    this.practiceButton.textContent = t(this.queue.length === 1 ? 'reviewPracticeOne' : 'reviewPracticeTwo');
    this.scoreButton.classList.toggle('btn-primary', !this.queue.length);
  }
}
