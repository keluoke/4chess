import { t } from './i18n.js?v=20261123-challenge-choice';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { retryVerdict, canPractice } from '../engine/review-policy.js?v=20261117-review-policy';
import { legalVariation } from './position-analysis.js?v=20261123-challenge-choice';
import { buildReplaySteps } from './consequence-player.js?v=20261123-challenge-choice';
import { soundEffects } from './sound-effects.js?v=20261025-v115';

export class ReviewPractice {
  constructor(app) { this.app = app; this.generation = 0; app.practiceResults ||= new Map(); }
  get inProgress() { return this.active || this.finished || this.suspended; }
  allowed() { return !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress(); }
  itemKey(item) { return this.mode === 'bank' ? (item?.id || item?.fenBefore) : item?.ply; }

  canExploreAfterAnswer() {
    return this.active && !this.busy && !this.answering && (this.hasAttempt || this.revealed || this.verdict === 'retryGood');
  }

  triggerMoveForItem(item = this.item) {
    if (item?.triggerMove?.from && item?.triggerMove?.to) return item.triggerMove;
    if (this.mode !== 'bank' && Number.isInteger(item?.ply) && item.ply > 1) {
      const posBefore = this.app.positions?.[item.ply - 1];
      if (posBefore?.fen === item.fenBefore && posBefore?.from && posBefore?.to) {
        return { from: posBefore.from, to: posBefore.to, san: posBefore.san || '' };
      }
    }
    return null;
  }

  triggerLastMove(item = this.item) {
    const trig = this.triggerMoveForItem(item);
    return trig ? { from: trig.from, to: trig.to } : null;
  }

  start(item, { queue = [item], mode = 'game', onItemResult = null } = {}) {
    this.stop();
    if (!this.allowed()) return;
    this.mode = mode;
    this.onItemResult = typeof onItemResult === 'function' ? onItemResult : null;
    this.queue = mode === 'bank'
      ? queue.filter(entry => !!entry?.fenBefore).slice()
      : queue.filter(canPractice).slice();
    if (!this.queue.length) return;
    this.origin = this.app.capturePracticeOrigin?.();
    const targetKey = this.itemKey(item);
    this.index = Math.max(0, this.queue.findIndex(entry => this.itemKey(entry) === targetKey));
    this.epoch = this.app.gameEpoch;
    this.results = new Map();
    if (this.app.isPlaying) this.app.toggleAutoPlay();
    this.app.consequencePlayer?.stop?.();
    this.showItem();
  }

  showItem() {
    const app = this.app;
    if (!this.allowed() || this.epoch !== app.gameEpoch) { this.stop(); return; }
    this.stopVariationTimer();
    this.generation++;
    this.active = true; this.suspended = false; this.busy = false; this.answering = true;
    this.item = this.queue[this.index];
    this.hinted = this.revealed = this.hasAttempt = false;
    this.submittedMove = null; this.submittedFen = null;
    this.verdict = null; this.attempts = 0; this.referenceResult = null;
    this.variationSteps = []; this.variationCursor = 0; this.variationLabel = '';
    this.variationBaseFen = this.item.fenBefore; this.variationBaseMove = this.triggerLastMove();
    this.branchMoves = []; this.branchCursor = 0;

    if (this.mode === 'bank') {
      document.body.classList.remove('empty-study');
      const intro = document.getElementById('empty-study-intro');
      if (intro) intro.hidden = true;
      app.boardUI?.setOrientation?.(this.item.turn === 'b' ? 'black' : 'white');
      app.boardUI?.setPosition?.(this.item.fenBefore, this.triggerLastMove());
    } else {
      app.goToPly(this.item.ply, { before: true, practice: true, silent: true });
      const trigMove = this.triggerLastMove();
      if (trigMove) app.boardUI?.setPosition?.(this.item.fenBefore, trigMove);
    }
    clearTimeout(app.resumeReviewTimer);
    app.positionAnalysis?.cancel?.();
    document.body.classList.add('practice-active');
    app.boardUI?.clearArrows?.(); app.positionAnalysis?.clearOverlays?.();
    this.renderPanel();
  }

  renderPanel() {
    const app = this.app;
    const side = t(this.item.turn === 'w' ? 'reviewWhite' : 'reviewBlack');
    if (app.el?.boardStatusText) {
      app.el.boardStatusText.textContent = t('practiceRound', { side, round: this.item.moveNumber || 1 });
    }
    const mobileContext = document.getElementById('practice-context');
    if (mobileContext) mobileContext.textContent = `${t('practiceProgress', { current: this.index + 1, total: this.queue.length })} · ${app.el?.boardStatusText?.textContent || ''}`;
    this.panel = document.getElementById('practice-panel');
    this.panel.hidden = false; this.panel.replaceChildren();
    const title = document.createElement('h2'); title.textContent = t('practiceProgress', { current: this.index + 1, total: this.queue.length });
    this.panel.append(title);

    const trig = this.triggerMoveForItem();
    if (trig?.san) {
      const trigNote = document.createElement('p');
      trigNote.className = 'practice-trigger-note';
      trigNote.textContent = t('practiceTriggerMove', { san: trig.san });
      this.panel.append(trigNote);
    }

    this.message = document.createElement('p'); this.message.setAttribute('role', 'status'); this.message.textContent = t('retryPrompt');
    this.stepperBox = document.createElement('div'); this.stepperBox.className = 'practice-stepper'; this.stepperBox.hidden = true;
    this.branchNote = document.createElement('p'); this.branchNote.className = 'practice-branch-note'; this.branchNote.hidden = true;
    this.comparison = document.createElement('div'); this.comparison.className = 'practice-comparison';
    const controls = document.createElement('div'); controls.className = 'practice-controls';
    this.controls = {};
    for (const [key, label, action] of [
      ['next', this.index + 1 === this.queue.length ? 'practiceFinish' : 'practiceNext', () => this.next()],
      ['retry', 'practiceRetry', () => this.retry()], ['hint', 'practiceHint', () => this.hint()],
      ['reveal', 'practiceReveal', () => this.reveal()],
      ['analyze', 'practiceDualEngine', () => this.openDualEngineAnalysis()],
      ['share', 'shareCardBtn', () => this.openShareCard()],
      ['skip', 'practiceSkip', () => this.next(true)], ['exit', 'practiceBack', () => this.returnToWorkbench()]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-header'; button.textContent = t(label);
      button.onclick = action; controls.append(button); this.controls[key] = button;
    }
    this.controls.next.classList.add('btn-primary');
    this.panel.append(this.message, this.stepperBox, this.branchNote, this.comparison, controls);
    this.syncControls();
    this.renderStepper();
    title.tabIndex = -1; title.focus({ preventScroll: true });
    if (mobileContext?.getClientRects().length) mobileContext.scrollIntoView({ block: 'start' });
    else this.panel.scrollIntoView({ block: 'nearest' });
  }

  canAdvance() {
    const key = this.itemKey(this.item);
    return this.revealed || this.verdict === 'retryGood' || ['independent', 'hinted', 'revealed'].includes(this.results?.get(key)?.status);
  }

  syncControls() {
    if (!this.controls) return;
    const ready = this.canAdvance();
    const postAnswer = this.canExploreAfterAnswer();
    this.controls.next.hidden = !ready;
    this.controls.retry.hidden = !(postAnswer && (this.hasAttempt || this.revealed));
    this.controls.hint.hidden = this.hasAttempt || ready;
    this.controls.reveal.hidden = ready;
    this.controls.analyze.hidden = !postAnswer;
    this.controls.share.hidden = !postAnswer || !this.app.shareCard;
    this.controls.skip.hidden = ready;
    for (const [key, button] of Object.entries(this.controls)) button.disabled = (this.busy && key !== 'exit') || (key === 'next' && !ready);
    if (this.app.el?.boardContainer) this.app.el.boardContainer.inert = this.busy;
  }

  stopVariationTimer() {
    clearInterval(this.variationTimer);
    this.variationTimer = null;
  }

  loadVariation({ baseFen, baseMove = null, pv = [], label = '', limit = 4 } = {}) {
    this.stopVariationTimer();
    this.branchMoves = [];
    this.branchCursor = 0;
    this.variationBaseFen = baseFen || this.item.fenBefore;
    this.variationBaseMove = baseMove;
    this.variationSteps = pv.length ? buildReplaySteps(this.variationBaseFen, pv, limit) : [];
    this.variationCursor = 0;
    this.variationLabel = label;
    this.renderStepper();
  }

  renderStepper() {
    if (!this.stepperBox) return;
    this.stepperBox.replaceChildren();
    if (this.branchNote) {
      const inBranch = this.branchMoves.length > 0;
      this.branchNote.hidden = !inBranch;
      if (inBranch) this.branchNote.textContent = t('practiceBranchNote');
    }
    const inBranch = this.branchMoves.length > 0;
    const steps = inBranch ? this.branchMoves : this.variationSteps;
    const cursor = inBranch ? this.branchCursor : this.variationCursor;
    if (!steps.length) {
      this.stepperBox.hidden = true;
      return;
    }
    this.stepperBox.hidden = false;

    const status = document.createElement('span');
    status.className = 'practice-stepper-label';
    if (cursor > 0 && steps[cursor - 1]) {
      const step = steps[cursor - 1];
      status.textContent = t('practiceVariationStep', {
        label: inBranch ? t('chartBranch') : this.variationLabel,
        current: cursor,
        total: steps.length,
        san: step.san
      });
    } else {
      status.textContent = t('practiceVariationReady', {
        label: inBranch ? t('chartBranch') : this.variationLabel,
        line: steps.map(s => s.san).join(' ')
      });
    }

    const btns = document.createElement('div');
    btns.className = 'practice-stepper-btns';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button'; prevBtn.className = 'btn-header'; prevBtn.textContent = '◀';
    prevBtn.setAttribute('aria-label', t('btnPrev'));
    prevBtn.disabled = cursor <= 0 && !inBranch;
    prevBtn.onclick = () => this.stepVariation(-1);

    const playBtn = document.createElement('button');
    playBtn.type = 'button'; playBtn.className = 'btn-header';
    playBtn.textContent = this.variationTimer ? '⏸' : '▶';
    playBtn.setAttribute('aria-label', t('btnPlay'));
    playBtn.hidden = inBranch;
    playBtn.onclick = () => this.toggleVariationPlay();

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button'; nextBtn.className = 'btn-header'; nextBtn.textContent = '▶|';
    nextBtn.setAttribute('aria-label', t('btnNext'));
    nextBtn.disabled = cursor >= steps.length;
    nextBtn.onclick = () => this.stepVariation(1);

    btns.append(prevBtn, playBtn, nextBtn);
    this.stepperBox.append(status, btns);
  }

  stepVariation(delta) {
    if (!this.active || this.busy || !this.canExploreAfterAnswer()) return;
    this.stopVariationTimer();
    if (this.branchMoves.length > 0) {
      const next = Math.max(0, Math.min(this.branchMoves.length, this.branchCursor + delta));
      this.branchCursor = next;
      if (next === 0) {
        this.branchMoves = [];
        this.syncBoardToVariation();
      } else {
        const step = this.branchMoves[next - 1];
        this.app.boardUI?.setPosition?.(step.fen, { from: step.from, to: step.to });
        if (delta > 0) soundEffects?.playSoundForMove?.(step.san);
      }
      this.renderStepper();
      return;
    }
    if (!this.variationSteps.length) return;
    const next = Math.max(0, Math.min(this.variationSteps.length, this.variationCursor + delta));
    if (next === this.variationCursor) return;
    this.variationCursor = next;
    this.syncBoardToVariation({ sound: delta > 0 });
    this.renderStepper();
  }

  syncBoardToVariation({ sound = false } = {}) {
    if (this.variationCursor === 0) {
      this.app.boardUI?.setPosition?.(this.variationBaseFen, this.variationBaseMove);
      return;
    }
    const step = this.variationSteps[this.variationCursor - 1];
    if (step) {
      this.app.boardUI?.setPosition?.(step.fen, { from: step.from, to: step.to });
      if (sound) soundEffects?.playSoundForMove?.(step.san);
    }
  }

  toggleVariationPlay() {
    if (!this.active || this.busy || !this.variationSteps.length || this.branchMoves.length > 0) return;
    if (this.variationTimer) {
      this.stopVariationTimer();
      this.renderStepper();
      return;
    }
    if (this.variationCursor >= this.variationSteps.length) {
      this.variationCursor = 0;
      this.syncBoardToVariation();
    }
    this.variationTimer = setInterval(() => {
      if (!this.active || this.busy || this.variationCursor >= this.variationSteps.length) {
        this.stopVariationTimer();
        this.renderStepper();
        return;
      }
      this.variationCursor++;
      this.syncBoardToVariation({ sound: true });
      this.renderStepper();
    }, 750);
    this.renderStepper();
  }

  handleBoardMove(move, fenAfter) {
    if (!this.active || !this.allowed() || this.epoch !== this.app.gameEpoch) { this.stop(); return; }
    if (this.busy) {
      if (this.submittedFen) this.app.boardUI?.setPosition?.(this.submittedFen);
      return;
    }
    if (this.canExploreAfterAnswer()) {
      this.stopVariationTimer();
      this.branchMoves = [
        ...this.branchMoves.slice(0, this.branchCursor),
        { uci: move.uci, san: move.san, from: move.fromSq, to: move.toSq, fen: fenAfter }
      ];
      this.branchCursor = this.branchMoves.length;
      this.renderStepper();
      return;
    }
    return this.submit(move, fenAfter);
  }

  openDualEngineAnalysis() {
    if (!this.active || !this.item?.fenBefore) return;
    this.app.enterTemporaryPositionAnalysis?.(this.item, { returnTo: 'practice' });
  }

  openShareCard() {
    if (!this.item || !this.app.shareCard) return;
    const item = this.item;
    const payload = {
      ...item,
      san: item.san || item.playedSan,
      bestSan: item.verifiedBestSan || item.bestSan,
      bestUci: item.verifiedBestUci || item.bestUci,
      humanRawProbability: Number.isFinite(item.humanRawProbability) ? item.humanRawProbability : item.humanProb,
      verifiedExpectedScoreLoss: Number.isFinite(item.verifiedExpectedScoreLoss) ? item.verifiedExpectedScoreLoss : item.eslLoss
    };
    this.app.shareCard.open(payload, { elo: item.elo || this.app.currentElo });
  }

  suspendForTempAnalysis() {
    if (!this.active) return;
    this.stopVariationTimer();
    this.active = false;
    this.suspended = true;
    document.body.classList.remove('practice-active');
    if (this.panel) this.panel.hidden = true;
  }

  resumeFromTempAnalysis(orientation) {
    if (!this.suspended || !this.item) return;
    this.suspended = false;
    this.active = true;
    document.body.classList.add('practice-active');
    if (orientation) this.app.boardUI?.setOrientation?.(orientation);
    if (this.panel) this.panel.hidden = false;
    if (this.branchMoves.length > 0 && this.branchCursor > 0) {
      const step = this.branchMoves[this.branchCursor - 1];
      this.app.boardUI?.setPosition?.(step.fen, { from: step.from, to: step.to });
    } else if (this.variationSteps.length > 0) {
      this.syncBoardToVariation();
    } else if (this.hasAttempt && this.submittedFen) {
      this.app.boardUI?.setPosition?.(this.submittedFen, this.submittedMove ? { from: this.submittedMove.fromSq, to: this.submittedMove.toSq } : null);
    } else {
      this.app.boardUI?.setPosition?.(this.item.fenBefore, this.triggerLastMove());
    }
    this.syncControls();
    this.renderStepper();
  }

  retry() {
    this.stopVariationTimer();
    this.branchMoves = [];
    this.branchCursor = 0;
    this.variationSteps = [];
    this.variationCursor = 0;
    this.answering = true;
    this.hasAttempt = false;
    this.verdict = null;
    this.submittedMove = null;
    this.submittedFen = null;
    this.app.boardUI.setPosition(this.item.fenBefore, this.triggerLastMove());
    this.message.textContent = t('retryPrompt');
    this.comparison.replaceChildren();
    this.syncControls();
    this.renderStepper();
  }

  feedback(best, move, played) {
    if (!this.comparison) return;
    const rows = [];
    const showComparison = this.revealed || this.verdict === 'retryGood';
    const before = this.item.fenBefore;
    if (move?.san) rows.push(['practiceYourMove', move.san]);
    const playedSan = this.item.san || this.item.playedSan;
    if (showComparison && playedSan) rows.push(['practicePlayedMove', playedSan]);
    if (showComparison && best?.bestMove?.san) {
      const pv = best.pv?.[0] === best.bestMove.uci ? best.pv : [best.bestMove.uci];
      const line = this.formatLine(before, pv);
      rows.push(['practiceBestLine', line || best.bestMove.san]);
    }
    if (showComparison && this.item.maiaTopSan && this.item.divergenceStatus === 'confirmed') {
      rows.push(['practiceMaiaMove', this.item.maiaTopSan]);
    }
    if (this.verdict === 'retryAgain' && played?.pv?.length) {
      const line = this.formatLine(this.submittedFen, played.pv);
      if (line) rows.push(['practiceReply', line]);
    }
    this.comparison.replaceChildren();
    for (const [label, value] of rows) {
      const row = document.createElement('p');
      row.textContent = `${t(label)} · ${value}`;
      this.comparison.append(row);
    }
  }

  formatLine(fen, pv) {
    return legalVariation(fen, pv, 3).map(move => move.label).join(' ');
  }

  record(status) {
    const key = this.itemKey(this.item);
    const achieved = this.results?.get(key)?.status;
    if (['independent', 'hinted'].includes(achieved)) status = achieved;
    const record = { status, attempts: this.attempts || 0 };
    this.results?.set(key, record);
    if (this.mode !== 'bank') this.app.practiceResults.set(this.item.ply, record);
    this.onItemResult?.(this.item, status, record);
  }

  referenceReady(best) { return Number.isFinite(best?.scoreCp) && !best.isBound && (best.terminal || best.depth >= 12); }

  async reference(current) {
    if (this.referenceResult) return this.referenceResult;
    const best = await this.app.stockfish.evaluate(this.item.fenBefore, 14, 6000, 1);
    if (current() && this.referenceReady(best)) this.referenceResult = best;
    return best;
  }

  hint() { return this.assist(false); }
  reveal() { return this.assist(true); }

  async assist(reveal) {
    if (!this.active || this.busy || !this.allowed() || this.epoch !== this.app.gameEpoch) return;
    const generation = ++this.generation;
    const current = () => this.active && generation === this.generation && this.epoch === this.app.gameEpoch && this.allowed();
    this.busy = true; this.message.textContent = t('retryChecking'); this.syncControls();
    try {
      const best = await this.reference(current);
      if (!current()) return;
      const uci = best?.bestMove?.uci, san = best?.bestMove?.san || uci;
      if (!this.referenceReady(best) || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci || '')) { this.message.textContent = t('practiceNoHint'); return; }
      if (reveal) {
        this.revealed = true; this.answering = false; this.record('revealed');
        this.message.textContent = t('practiceAnswer', { move: san });
        this.feedback(best, this.submittedMove);
        const pv = best.pv?.[0] === best.bestMove.uci ? best.pv : [best.bestMove.uci];
        this.loadVariation({
          baseFen: this.item.fenBefore,
          baseMove: this.triggerLastMove(),
          pv,
          label: t('practiceVariationBest')
        });
        this.syncBoardToVariation();
      } else {
        this.hinted = true; this.record(this.revealed ? 'revealed' : 'hint_used');
        this.message.textContent = t('practiceHintFrom', { square: uci.slice(0, 2) });
      }
    } catch { if (current()) this.message.textContent = t('practiceNoHint'); }
    finally { if (generation === this.generation) { this.busy = false; this.syncControls(); } }
  }

  next(skip = false) {
    if (!this.active || this.busy) return;
    if (!this.allowed() || this.epoch !== this.app.gameEpoch) { this.stop(); return; }
    if (!skip && !this.canAdvance()) return;
    const key = this.itemKey(this.item);
    if (skip && !this.results.has(key)) this.record('skipped');
    if (++this.index >= this.queue.length) this.finish(); else this.showItem();
  }

  finish() {
    if (!this.active || !this.allowed() || this.epoch !== this.app.gameEpoch) { this.stop(); return; }
    this.stopVariationTimer();
    const results = this.results, queue = this.queue, mode = this.mode;
    this.generation++;
    this.active = false;
    this.finished = true;
    if (this.app.el?.boardContainer) this.app.el.boardContainer.inert = true;
    const mobileContext = document.getElementById('practice-context');
    if (mobileContext) mobileContext.textContent = t('practiceSummary');
    this.panel.hidden = false; this.panel.replaceChildren();
    const title = document.createElement('h2'); title.textContent = t('practiceSummary'); this.panel.append(title);
    const counts = Object.fromEntries(['independent', 'hinted', 'revealed'].map(status => [status, [...results.values()].filter(record => record.status === status).length]));
    counts.remaining = queue.length - counts.independent - counts.hinted - counts.revealed;
    const summary = document.createElement('p'); summary.setAttribute('role', 'status'); summary.textContent = t('practiceSummaryCounts', counts); this.panel.append(summary);
    const note = document.createElement('p'); note.className = 'review-count-note'; note.textContent = t(mode === 'bank' ? 'bankPracticeSavedNote' : 'practiceSessionNote'); this.panel.append(note);
    const list = document.createElement('ul'); list.className = 'practice-summary-list';
    for (const move of queue) {
      const key = mode === 'bank' ? (move.id || move.fenBefore) : move.ply;
      const status = results.get(key)?.status || 'skipped';
      const entry = document.createElement('li');
      const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'btn-header';
      jump.textContent = mode === 'bank'
        ? `${move.moveNumber || 1}${move.turn === 'w' ? '. ' : '… '}${move.playedSan || move.san || ''}`.trim()
        : t('reviewInspectRound', { round: move.moveNumber });
      jump.setAttribute('aria-label', `${jump.textContent} · ${t(move.turn === 'w' ? 'reviewWhite' : 'reviewBlack')}`);
      jump.onclick = () => this.returnToWorkbench(move);
      entry.append(jump, document.createTextNode(t(`practiceStatus_${status}`)));
      list.append(entry);
    }
    this.panel.append(list);
    const back = document.createElement('button'); back.type = 'button'; back.className = 'btn-header btn-primary'; back.textContent = t(mode === 'bank' ? 'bankBackToBank' : 'practiceBack');
    back.onclick = () => this.returnToWorkbench(); this.panel.append(back);
    back.focus({ preventScroll: true });
  }

  returnToWorkbench(move) {
    const origin = this.origin;
    const mode = this.mode;
    this.stop();
    if (mode === 'bank') {
      if (move?.fenBefore) {
        this.app.enterTemporaryPositionAnalysis?.(move, { returnTo: 'bank' });
      } else {
        this.app.restorePracticeOrigin?.(origin);
        this.app.mistakeBank?.open?.();
      }
      return;
    }
    this.app.restorePracticeOrigin?.(origin, move);
  }

  stop() {
    if (!this.inProgress) return;
    this.stopVariationTimer();
    this.generation++;
    this.active = this.finished = this.suspended = false;
    if (this.busy) this.app.stockfish?.stop?.();
    this.busy = false;
    document.body.classList.remove('practice-active');
    if (this.app.el?.boardContainer) this.app.el.boardContainer.inert = false;
    this.origin = null;
    this.mode = 'game';
    this.onItemResult = null;
    if (this.panel) this.panel.hidden = true;
    if (this.app.reviewResult) this.app.renderBlunderCards?.();
  }

  async submit(move, fenAfter) {
    const app = this.app;
    if (this.busy) { app.boardUI.setPosition(this.submittedFen); return; }
    if (!this.active || !this.allowed() || this.epoch !== app.gameEpoch) { this.stop(); return; }
    this.stopVariationTimer();
    this.branchMoves = [];
    this.branchCursor = 0;
    const generation = ++this.generation;
    this.busy = true; this.answering = false; this.hasAttempt = true; this.submittedFen = fenAfter; this.submittedMove = move;
    this.attempts = (this.attempts || 0) + 1;
    this.message.textContent = t('retryChecking'); this.syncControls();
    const current = () => this.active && generation === this.generation && this.epoch === app.gameEpoch && this.allowed();
    try {
      const best = await this.reference(current);
      if (!current()) return;
      if (!this.referenceReady(best)) {
        this.verdict = 'retryUncertain'; this.record('uncertain'); this.message.textContent = t('retryUncertain');
        return;
      }
      const played = await app.stockfish.evaluate(fenAfter, 13, 6000, 1);
      if (!current()) return;
      this.verdict = played?.isBound ? 'retryUncertain' : retryVerdict(best, played);
      this.message.textContent = t(this.verdict);
      this.record(this.revealed ? 'revealed' : this.verdict === 'retryGood' ? this.hinted ? 'hinted' : 'independent' : this.verdict === 'retryUncertain' ? 'uncertain' : 'attempted');
      this.feedback(best, move, played);
      if (this.verdict === 'retryGood' && best?.bestMove?.uci) {
        const pv = best.pv?.[0] === best.bestMove.uci ? best.pv : [best.bestMove.uci];
        this.loadVariation({
          baseFen: this.item.fenBefore,
          baseMove: this.triggerLastMove(),
          pv,
          label: t('practiceVariationBest')
        });
      } else if (this.verdict === 'retryAgain' && played?.pv?.length) {
        this.loadVariation({
          baseFen: this.submittedFen,
          baseMove: move ? { from: move.fromSq, to: move.toSq } : null,
          pv: played.pv,
          label: t('practiceVariationReply')
        });
      } else {
        this.loadVariation({ baseFen: this.submittedFen, pv: [] });
      }
    } catch {
      if (current()) { this.verdict = 'retryUncertain'; this.record('uncertain'); this.message.textContent = t('retryUncertain'); }
    } finally {
      if (generation === this.generation) { this.busy = false; this.syncControls(); }
    }
  }
}
