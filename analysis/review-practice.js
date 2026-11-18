import { t } from './i18n.js?v=20261118-summary-ai';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { retryVerdict, canPractice } from '../engine/review-policy.js?v=20261117-review-policy';
import { legalVariation } from './position-analysis.js?v=20261118-summary-ai';

export class ReviewPractice {
  constructor(app) { this.app = app; this.generation = 0; app.practiceResults ||= new Map(); }
  get inProgress() { return this.active || this.finished; }
  allowed() { return !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress(); }
  start(item, { queue = [item] } = {}) {
    this.stop();
    if (!this.allowed()) return;
    this.queue = queue.filter(canPractice).slice();
    if (!this.queue.length) return;
    this.origin = this.app.capturePracticeOrigin?.();
    this.index = Math.max(0, this.queue.findIndex(move => move.ply === item.ply));
    this.epoch = this.app.gameEpoch;
    this.results = new Map();
    if (this.app.isPlaying) this.app.toggleAutoPlay();
    this.showItem();
  }
  showItem() {
    const app = this.app;
    if (!this.allowed() || this.epoch !== app.gameEpoch) { this.stop(); return; }
    this.generation++;
    this.active = true; this.busy = false; this.item = this.queue[this.index];
    this.hinted = this.revealed = this.hasAttempt = false;
    this.submittedMove = null;
    this.verdict = null; this.attempts = 0; this.referenceResult = null;
    app.goToPly(this.item.ply, { before: true, practice: true, silent: true });
    clearTimeout(app.resumeReviewTimer);
    app.positionAnalysis.cancel();
    document.body.classList.add('practice-active');
    app.boardUI.clearArrows?.(); app.positionAnalysis.clearOverlays();
    const side = t(this.item.turn === 'w' ? 'reviewWhite' : 'reviewBlack');
    app.el.boardStatusText.textContent = t('practiceRound', { side, round: this.item.moveNumber });
    const mobileContext = document.getElementById('practice-context');
    if (mobileContext) mobileContext.textContent = `${t('practiceProgress', { current: this.index + 1, total: this.queue.length })} · ${app.el.boardStatusText.textContent}`;
    this.panel = document.getElementById('practice-panel');
    this.panel.hidden = false; this.panel.replaceChildren();
    const title = document.createElement('h2'); title.textContent = t('practiceProgress', { current: this.index + 1, total: this.queue.length });
    this.message = document.createElement('p'); this.message.setAttribute('role', 'status'); this.message.textContent = t('retryPrompt');
    this.comparison = document.createElement('div'); this.comparison.className = 'practice-comparison';
    const controls = document.createElement('div'); controls.className = 'practice-controls';
    this.controls = {};
    for (const [key, label, action] of [
      ['next', this.index + 1 === this.queue.length ? 'practiceFinish' : 'practiceNext', () => this.next()],
      ['retry', 'practiceRetry', () => this.retry()], ['hint', 'practiceHint', () => this.hint()],
      ['reveal', 'practiceReveal', () => this.reveal()],
      ['skip', 'practiceSkip', () => this.next(true)], ['exit', 'practiceBack', () => this.returnToWorkbench()]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-header'; button.textContent = t(label);
      button.onclick = action; controls.append(button); this.controls[key] = button;
    }
    this.controls.next.classList.add('btn-primary');
    this.panel.append(title, this.message, this.comparison, controls); this.syncControls();
    title.tabIndex = -1; title.focus({ preventScroll: true });
    if (mobileContext?.getClientRects().length) mobileContext.scrollIntoView({ block: 'start' });
    else this.panel.scrollIntoView({ block: 'nearest' });
  }
  canAdvance() { return this.revealed || this.verdict === 'retryGood' || ['independent', 'hinted', 'revealed'].includes(this.results?.get(this.item?.ply)?.status); }
  syncControls() {
    if (!this.controls) return;
    const ready = this.canAdvance();
    this.controls.next.hidden = !ready;
    this.controls.retry.hidden = !this.hasAttempt || ready;
    this.controls.hint.hidden = this.hasAttempt || ready;
    this.controls.reveal.hidden = ready;
    this.controls.skip.hidden = ready;
    for (const [key, button] of Object.entries(this.controls)) button.disabled = (this.busy && key !== 'exit') || key === 'next' && !ready;
    if (this.app.el.boardContainer) this.app.el.boardContainer.inert = this.busy || this.hasAttempt || ready;
  }
  retry() {
    this.hasAttempt = false;
    this.verdict = null;
    this.app.boardUI.setPosition(this.item.fenBefore);
    this.message.textContent = t('retryPrompt');
    this.comparison.replaceChildren();
    this.syncControls();
  }
  feedback(best, move, played) {
    if (!this.comparison) return;
    const rows = [];
    const showComparison = this.revealed || this.verdict === 'retryGood';
    const before = this.item.fenBefore;
    if (move?.san) rows.push(['practiceYourMove', move.san]);
    if (showComparison && this.item.san) rows.push(['practicePlayedMove', this.item.san]);
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
    const achieved = this.results?.get(this.item.ply)?.status;
    if (['independent', 'hinted'].includes(achieved)) status = achieved;
    const record = { status, attempts: this.attempts || 0 };
    this.results?.set(this.item.ply, record);
    this.app.practiceResults.set(this.item.ply, record);
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
        this.revealed = true; this.record('revealed');
        this.message.textContent = t('practiceAnswer', { move: san });
        this.feedback(best, this.submittedMove);
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
    if (skip && !this.results.has(this.item.ply)) this.record('skipped');
    if (++this.index >= this.queue.length) this.finish(); else this.showItem();
  }
  finish() {
    if (!this.active || !this.allowed() || this.epoch !== this.app.gameEpoch) { this.stop(); return; }
    const results = this.results, queue = this.queue;
    this.generation++;
    this.active = false;
    this.finished = true;
    if (this.app.el.boardContainer) this.app.el.boardContainer.inert = true;
    const mobileContext = document.getElementById('practice-context');
    if (mobileContext) mobileContext.textContent = t('practiceSummary');
    this.panel.hidden = false; this.panel.replaceChildren();
    const title = document.createElement('h2'); title.textContent = t('practiceSummary'); this.panel.append(title);
    const counts = Object.fromEntries(['independent', 'hinted', 'revealed'].map(status => [status, [...results.values()].filter(record => record.status === status).length]));
    counts.remaining = queue.length - counts.independent - counts.hinted - counts.revealed;
    const summary = document.createElement('p'); summary.setAttribute('role', 'status'); summary.textContent = t('practiceSummaryCounts', counts); this.panel.append(summary);
    const note = document.createElement('p'); note.className = 'review-count-note'; note.textContent = t('practiceSessionNote'); this.panel.append(note);
    const list = document.createElement('ul'); list.className = 'practice-summary-list';
    for (const move of queue) {
      const status = results.get(move.ply)?.status || 'skipped';
      const entry = document.createElement('li');
      const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'btn-header';
      jump.textContent = t('reviewInspectRound', { round: move.moveNumber });
      jump.setAttribute('aria-label', `${jump.textContent} · ${t(move.turn === 'w' ? 'reviewWhite' : 'reviewBlack')}`);
      jump.onclick = () => this.returnToWorkbench(move);
      entry.append(jump, document.createTextNode(t(`practiceStatus_${status}`)));
      list.append(entry);
    }
    this.panel.append(list);
    const back = document.createElement('button'); back.type = 'button'; back.className = 'btn-header btn-primary'; back.textContent = t('practiceBack');
    back.onclick = () => this.returnToWorkbench(); this.panel.append(back);
    back.focus({ preventScroll: true });
  }
  returnToWorkbench(move) {
    const origin = this.origin;
    this.stop();
    this.app.restorePracticeOrigin?.(origin, move);
  }
  stop() {
    if (!this.inProgress) return;
    this.generation++;
    this.active = this.finished = false;
    if (this.busy) this.app.stockfish.stop();
    this.busy = false;
    document.body.classList.remove('practice-active');
    if (this.app.el?.boardContainer) this.app.el.boardContainer.inert = false;
    this.origin = null;
    if (this.panel) this.panel.hidden = true;
    if (this.app.reviewResult) this.app.renderBlunderCards?.();
  }
  async submit(move, fenAfter) {
    const app = this.app;
    if (this.busy) { app.boardUI.setPosition(this.submittedFen); return; }
    if (!this.active || !this.allowed() || this.epoch !== app.gameEpoch) { this.stop(); return; }
    const generation = ++this.generation;
    this.busy = true; this.hasAttempt = true; this.submittedFen = fenAfter; this.submittedMove = move;
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
    } catch {
      if (current()) { this.verdict = 'retryUncertain'; this.record('uncertain'); this.message.textContent = t('retryUncertain'); }
    } finally {
      if (generation === this.generation) { this.busy = false; this.syncControls(); }
    }
  }
}
