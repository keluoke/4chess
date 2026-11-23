import { getLang, t } from './i18n.js?v=20261123-checkup-opening-names';
import { intuitionTrapFacts } from '../engine/chess-facts.js?v=20261118-summary-ai';
import { canPractice, coreTurningPoints, intuitionKind, isKeyMoment, selectReviewMoves, selectReviewObservations } from '../engine/review-policy.js?v=20261120-review';
import { turningPointWording } from './review-commentary.js?v=20261123-checkup-opening-names';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';

const byId = id => document.getElementById(id);
const sideLabel = side => t(side === 'w' ? 'reviewWhite' : side === 'b' ? 'reviewBlack' : 'reviewBoth');

function compareImpact(a, b) {
  return (b.expectedScoreLoss ?? 0) - (a.expectedScoreLoss ?? 0) ||
    (b.lossCp ?? 0) - (a.lossCp ?? 0) || a.ply - b.ply;
}

function leadingSide(cp) {
  return cp >= 100 ? 'w' : cp <= -100 ? 'b' : null;
}

function gameContext(tags, result, platform) {
  const eco = /^[A-E]\d{2}$/i.test(tags.eco) ? tags.eco.toUpperCase() : '';
  const bookName = eco && result.allMoves.findLast(move => move.eco === eco && move.isBookMove)?.openingName;
  const bookParts = bookName?.match(/^(.+?) \((.+)\)$/);
  const localName = eco === 'A80' ? t('reviewDutchDefense') : bookParts?.[getLang() === 'zh' ? 1 : 2];
  const opening = tags.opening && tags.opening !== '?' ? tags.opening : '';
  const name = (getLang() === 'zh' && localName) || opening || localName;
  const time = tags.timecontrol?.match(/^(\d+)(?:\+(\d+))?$/);
  let clock = '';
  if (time) {
    const [base, inc] = [Number(time[1]), Number(time[2] || 0)];
    const duration = base + 40 * inc;
    if (duration > 0 && Number.isSafeInteger(duration)) {
      clock = base % 60 ? t('reviewClockSeconds', { base, inc }) : String(base / 60) + '+' + inc;
      const blitz = duration >= 180 && duration < (platform === 'chesscom' ? 600 : 480);
      if (blitz) clock = t('reviewClockBlitz', { clock });
    }
  } else if (tags.timecontrol && /^[\d+:/]+$/.test(tags.timecontrol)) {
    clock = tags.timecontrol;
  }
  return [name && eco ? name + ' (' + eco + ')' : name || eco, clock].filter(Boolean).join(' · ');
}

export class ReviewOverview {
  constructor(app) {
    this.app = app;
    this.summary = byId('review-summary');
    this.title = byId('review-report-title');
    this.overviewButton = byId('btn-review-overview');
    this.closeButton = byId('review-card-close');
    this.readyButton = byId('review-ready');
    this.practiceButton = byId('review-report-practice');
    this.scoreButton = byId('review-report-workbench');
    this.turnButton = byId('review-report-turn');
    this.sidePicker = byId('review-report-side');
    this.overviewButton.onclick = this.readyButton.onclick = () => this.show('overview');
    this.scoreButton.onclick = this.closeButton.onclick = () => this.show('workbench');
    this.summary.addEventListener('cancel', event => {
      event.preventDefault();
      this.show('workbench');
    });
    this.practiceButton.onclick = () => {
      const queue = this.queue;
      if (!queue.length) return;
      this.show('workbench');
      app.startPractice(queue[0], queue);
    };
    this.sidePicker.addEventListener('click', event => {
      const button = event.target.closest('[data-practice-side]');
      if (!button) return;
      this.sideSelected = true;
      this.side = button.dataset.practiceSide;
      this.renderPractice(app.reviewExplorer.available(app.reviewResult.allMoves));
    });
    for (const type of ['pointerdown', 'click', 'keydown', 'wheel', 'input', 'drop']) {
      document.addEventListener(type, event => {
        if (event.isTrusted) this.autoOpenRequested = false;
      }, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoOpenRequested = false;
    });
    this.reset();
  }

  reset(side = this.app.reviewExplorer.side, { newGame = true } = {}) {
    this.received = this.pending = false;
    this.autoOpenRequested = false;
    if (newGame) {
      this.autoOpened = false;
      this.sideSelected = false;
    }
    this.side = side;
    this.queue = [];
    this.summary.querySelector('details').open = false;
    this.show('workbench');
  }

  requestAutoOpen() {
    this.autoOpenRequested = !this.autoOpened && !this.app.isBranching && !this.app.tempAnalysisFen;
  }

  update(result) {
    this.render(result);
    let view = this.view;
    if (!this.received) {
      this.received = true;
      this.pending = true;
      if (this.autoOpenRequested && !result.isPartial && !this.app.moves?.isPartial
        && result.allMoves.length === this.app.moves?.length
        && FairPlayGuard.verifyConcludedGame(this.app.sessionInput?.pgn || this.app.sessionInput).ok
        && !FairPlayGuard.isLiveGameInProgress() && !this.app.scanSourceLocked
        && !document.hidden && document.hasFocus() && !document.querySelector('dialog[open]')
        && !this.app.el.pgnModal.classList.contains('open') && !this.app.boardUI.promotionPicker
        && !this.app.isBranching && !this.app.tempAnalysisFen && !this.app.practice?.inProgress) {
        this.autoOpened = true;
        view = 'overview';
      }
      this.autoOpenRequested = false;
    }
    this.show(view);
  }

  show(view) {
    this.app.reviewShare?.sync();
    const available = this.received && !!this.app.reviewResult && !this.app.scanSourceLocked;
    const overview = available && view === 'overview' && !this.app.practice?.inProgress;
    this.view = overview ? 'overview' : 'workbench';
    if (overview) this.pending = false;
    this.overviewButton.hidden = !available;
    this.readyButton.hidden = !available || !this.pending;
    const { isPartial, accuracyWhite, accuracyBlack } = this.app.reviewResult || {};
    this.readyButton.textContent = isPartial ? t('reviewPartialReady')
      : Number.isFinite(accuracyWhite) && Number.isFinite(accuracyBlack)
        ? t('reviewReadyWithAccuracy', { white: accuracyWhite.toFixed(1), black: accuracyBlack.toFixed(1) })
        : t('reviewReady');
    if (overview) {
      if (this.summary.open) return;
      this.summary.showModal();
      this.title.focus({ preventScroll: true });
    } else {
      if (this.summary.open) {
        this.summary.close();
        if (available && document.activeElement === document.body) this.overviewButton.focus({ preventScroll: true });
      }
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
    const context = byId('review-report-context');
    context.textContent = gameContext(this.app.pgnTags || {}, result, this.app.checkupGame?.platform);
    context.hidden = !context.textContent;

    const moves = this.app.reviewExplorer.available(allMoves);
    const scored = moves.filter(move => Number.isFinite(move.accuracy) && Number.isFinite(move.expectedScoreLoss));
    const turningPoint = scored.filter(move => move.expectedScoreLoss >= 8).sort(compareImpact)[0];
    const verified = moves.filter(move => move.divergenceType === 'intuition_trap' && move.divergenceStatus === 'confirmed')
      .sort((a, b) => (b.verifiedExpectedScoreLoss ?? 0) - (a.verifiedExpectedScoreLoss ?? 0))
      .find(move => Number.isFinite(move.verifiedExpectedScoreLoss) && (move.verifiedBestUci || move.verifiedBestSan));
    const observation = !turningPoint && !result.isPartial ? selectReviewObservations(moves, 'all', result.positionEvaluations)[0] : null;
    this.renderStory(result, score, scored, turningPoint, verified, observation);
    const beyond = selectReviewMoves(moves, 'all', 'beyond').length;
    const traps = selectReviewMoves(moves, 'all', 'trap').length;
    byId('review-report-intuition').textContent = [
      beyond ? t('reviewConfirmedBeyond', { count: beyond }) : '',
      traps ? t('reviewConfirmedTraps', { count: traps }) : ''
    ].filter(Boolean).join(' · ');
    this.app.mistakeBank?.renderOverviewSave?.(byId('review-report-save-bank'), result);
  }

  renderStory(result, score, scored, turningPoint, verified, observation) {
    const sideScores = (result.positionEvaluations || []).map((evaluation, index) => {
      const turn = result.allMoves[index]?.turn || (result.allMoves.at(-1)?.turn === 'b' ? 'w' : 'b');
      return Number.isFinite(evaluation?.scoreCp) ? evaluation.scoreCp * (turn === 'w' ? 1 : -1) : null;
    });
    const samples = sideScores.filter(Number.isFinite);
    const complete = samples.length >= 3 && samples.length === result.allMoves.length + 1 && !result.isPartial;
    const finalEvaluation = result.positionEvaluations?.[result.allMoves.length];
    const finalScore = sideScores[result.allMoves.length];
    const lead = leadingSide(finalScore);
    const winner = result.isPartial ? null : score === '1-0' ? 'w' : score === '0-1' ? 'b' : null;
    const drawn = !result.isPartial && score === '1/2-1/2';
    const mate = !result.isPartial && !drawn && finalEvaluation?.isMate && finalEvaluation.terminal &&
      (!winner || winner === lead) ? lead : null;
    const balanced = complete && samples.every(cp => Math.abs(cp) < 100);
    const stayedAhead = complete && lead && samples.slice(-Math.min(6, samples.length)).every(cp => leadingSide(cp) === lead);
    const opponent = winner === 'w' ? 'b' : 'w';
    const comeback = complete && winner && samples.slice(-3).every(cp => leadingSide(cp) === winner) &&
      samples.slice(0, -3).some((cp, i, early) => leadingSide(cp) === opponent && leadingSide(early[i + 1]) === opponent);
    const lastRound = result.allMoves.at(-1)?.moveNumber;
    const outcome = winner ? t('reviewWinner', { side: sideLabel(winner) }) : drawn ? t('reviewDraw') : t('gameOverview');
    const resigned = winner && this.app.terminationType === 'resignation';
    const wonOnTime = winner && !mate && this.app.terminationType === 'time';
    let resultText = winner || drawn ? outcome : null;
    if (resigned && lastRound) resultText = t('reviewResignationHeadline', { loser: sideLabel(opponent), round: lastRound });
    else if (wonOnTime) resultText = t('reviewTimeHeadline', { winner: sideLabel(winner), loser: sideLabel(opponent) });
    else if (mate && lastRound) resultText = t('reviewMateHeadline', { side: sideLabel(mate), round: lastRound });
    const facts = intuitionTrapFacts(verified, result);
    const keyMove = facts?.best ? verified : turningPoint;
    const jump = keyMove || observation;
    const move = { round: jump?.moveNumber, side: sideLabel(jump?.turn) };
    let title = outcome;
    let turnInTitle = false;
    if (result.isPartial) {
      title = jump ? t('reviewPartialTurnHeadline', move) : t('reviewPartialHeadline');
      turnInTitle = !!jump;
    }
    else if (resigned || wonOnTime) title = resultText || outcome;
    else if (mate && lastRound) title = t('reviewMateHeadline', { side: sideLabel(mate), round: lastRound });
    else if (comeback) title = t('reviewComebackHeadline', { side: sideLabel(winner) });
    else if (drawn && balanced) title = t('reviewDrawHeadline');
    else if (keyMove) {
      if (winner === jump.turn) title = t('reviewWinMissHeadline', { outcome, round: move.round });
      else title = winner || drawn ? t('reviewOutcomeTurnHeadline', { outcome, ...move }) : t('reviewTurnHeadline', move);
      turnInTitle = true;
    } else if (winner && lead === winner && stayedAhead) title = t('reviewHoldLeadHeadline', { side: sideLabel(winner) });
    this.title.textContent = title;

    let story = t('reviewScoredPlies', { valid: scored.length, count: result.allMoves.length });
    if (resigned && Number.isFinite(finalScore) && Math.abs(finalScore) < 150 &&
        !finalEvaluation?.isMate && !finalEvaluation?.isBound) {
      story = Math.abs(finalScore) < 100 ? t('reviewResignationClose') : t('reviewResignationPlayable', { loser: sideLabel(opponent) });
    } else if (resigned && finalEvaluation?.isMate && !finalEvaluation.terminal && !finalEvaluation.isBound && lead === winner) {
      story = t('reviewResignationMateAvailable', { winner: sideLabel(winner) });
    } else if (complete) {
      const early = leadingSide(samples[Math.min(20, Math.floor(samples.length / 3))]);
      if (mate || drawn && balanced) story = '';
      else if (balanced) story = t('reviewBalanced');
      else if (early && lead && early !== lead) story = t('reviewLeadChanged', { early: sideLabel(early), late: sideLabel(lead) });
      else if (stayedAhead) story = t('reviewClosingLead', { side: sideLabel(lead) });
      else if (lead) story = t('reviewFinalLead', { side: sideLabel(lead) });
      else story = t('reviewBackToBalance');
    }
    const closing = complete && stayedAhead ? t('reviewClosingLead', { side: sideLabel(lead) }) : '';
    const previous = verified && result.allMoves.find(candidate => candidate.ply === verified.ply - 1);
    const prior = intuitionTrapFacts(previous, result);
    const related = !!facts?.best && prior?.playedReply?.san === facts.best.san && previous.moveNumber === verified.moveNumber;
    const turning = turningPointWording(jump, move, { facts, trigger: related ? prior.played.san : null, observation: !keyMove });
    if (turning && (facts?.best || !turnInTitle || getLang() === 'zh')) story = [turning, story].filter(Boolean).join(' ');
    const bindings = {};
    if (resultText) bindings.result = resultText.replace(/[.!?]$/, '');
    if (keyMove) {
      bindings.turning = `move ${keyMove.moveNumber}`;
      bindings.side = sideLabel(keyMove.turn);
    }
    if (facts?.best) {
      bindings.played = facts.played.san;
      bindings.best = facts.best.san;
      if (related) bindings.trigger = prior.played.san;
    }
    if (closing) bindings.closing = closing.replace(/[.!?]$/, '');
    this.app.reviewCommentary.renderOverview(result, story, bindings, { deterministic: !!resigned || !!observation && !keyMove });
    this.turnButton.hidden = !jump;
    if (jump) {
      this.turnButton.textContent = t('reviewInspectRound', { round: jump.moveNumber });
      this.turnButton.onclick = () => this.jumpTo(jump);
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
