import { t } from './i18n.js?v=20261103-jade';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { retryVerdict, canPractice } from '../engine/review-policy.js?v=20261103-jade';

export class ReviewPractice {
  constructor(app) { this.app = app; this.generation = 0; app.practiceResults ||= new Map(); }
  allowed() { return !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress(); }
  start(item, { queue = [item] } = {}) {
    this.stop();
    if (!this.allowed()) return;
    this.queue = queue.filter(canPractice).slice();
    if (!this.queue.length) return;
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
    this.hinted = this.revealed = false; this.verdict = null; this.attempts = 0; this.referenceResult = null;
    app.goToPly(this.item.ply, { before: true, practice: true });
    clearTimeout(app.resumeReviewTimer);
    app.positionAnalysis.cancel();
    document.body.classList.add('practice-active');
    app.boardUI.clearArrows?.(); app.positionAnalysis.clearOverlays();
    app.el.boardStatusText.textContent = t('retryTurn', { side: t(this.item.turn === 'w' ? 'whitePlayer' : 'blackPlayer') });
    this.panel = document.getElementById('practice-panel');
    this.panel.hidden = false; this.panel.replaceChildren();
    const title = document.createElement('h2'); title.textContent = t('practiceProgress', { current: this.index + 1, total: this.queue.length });
    this.message = document.createElement('p'); this.message.setAttribute('role', 'status'); this.message.textContent = t('retryPrompt');
    const controls = document.createElement('div'); controls.className = 'practice-controls';
    this.controls = {};
    for (const [key, label, action] of [
      ['hint', 'practiceHint', () => this.hint()], ['reveal', 'practiceReveal', () => this.reveal()],
      ['next', this.index + 1 === this.queue.length ? 'practiceFinish' : 'practiceNext', () => this.next()],
      ['skip', 'practiceSkip', () => this.next(true)], ['exit', 'practiceExit', () => this.finish()]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-header'; button.textContent = t(label);
      button.onclick = action; controls.append(button); this.controls[key] = button;
    }
    this.panel.append(title, this.message, controls); this.syncControls();
    title.tabIndex = -1; title.focus({ preventScroll: true });
    this.panel.scrollIntoView({ block: 'nearest' });
  }
  canAdvance() { return this.revealed || this.verdict === 'retryGood' || ['independent', 'hinted', 'revealed'].includes(this.results?.get(this.item?.ply)?.status); }
  syncControls() {
    if (!this.controls) return;
    for (const [key, button] of Object.entries(this.controls)) button.disabled = (this.busy && key !== 'exit') || key === 'next' && !this.canAdvance();
  }
  record(status) {
    const achieved = this.results?.get(this.item.ply)?.status;
    if (['independent', 'hinted'].includes(achieved)) status = achieved;
    const record = { status, attempts: this.attempts || 0 };
    this.results?.set(this.item.ply, record);
    this.app.practiceResults.set(this.item.ply, record);
  }
  referenceReady(best) { return Number.isFinite(best?.scoreCp) && (best.terminal || best.depth >= 12); }
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
    const results = this.results, queue = this.queue, item = this.item;
    this.stop();
    this.panel.hidden = false; this.panel.replaceChildren();
    const title = document.createElement('h2'); title.textContent = t('practiceSummary'); this.panel.append(title);
    const counts = Object.fromEntries(['independent', 'hinted', 'revealed'].map(status => [status, [...results.values()].filter(record => record.status === status).length]));
    counts.remaining = queue.length - counts.independent - counts.hinted - counts.revealed;
    const summary = document.createElement('p'); summary.setAttribute('role', 'status'); summary.textContent = t('practiceSummaryCounts', counts); this.panel.append(summary);
    const note = document.createElement('p'); note.className = 'review-count-note'; note.textContent = t('practiceSessionNote'); this.panel.append(note);
    const back = document.createElement('button'); back.type = 'button'; back.className = 'btn-header'; back.textContent = t('practiceBack');
    back.onclick = () => { this.stop(); this.app.goToPly(item.ply, { before: true }); }; this.panel.append(back);
    back.focus({ preventScroll: true });
  }
  stop() {
    this.generation++;
    this.active = false;
    if (this.busy) this.app.stockfish.stop();
    this.busy = false;
    document.body.classList.remove('practice-active');
    if (this.panel) this.panel.hidden = true;
    if (this.app.reviewResult) this.app.renderBlunderCards?.();
  }
  async submit(move, fenAfter) {
    const app = this.app;
    if (this.busy) { app.boardUI.setPosition(this.submittedFen); return; }
    if (!this.active || !this.allowed() || this.epoch !== app.gameEpoch) { this.stop(); return; }
    const generation = ++this.generation;
    this.busy = true; this.submittedFen = fenAfter; this.attempts = (this.attempts || 0) + 1;
    this.message.textContent = t('retryChecking'); this.syncControls();
    const current = () => this.active && generation === this.generation && this.epoch === app.gameEpoch && this.allowed();
    try {
      const best = await this.reference(current);
      if (!current()) return;
      if (!this.referenceReady(best)) {
        this.verdict = 'retryUncertain'; this.record('uncertain'); this.message.textContent = t('retryUncertain');
        app.boardUI.setPosition(this.item.fenBefore); return;
      }
      const played = await app.stockfish.evaluate(fenAfter, 13, 6000, 1);
      if (!current()) return;
      this.verdict = retryVerdict(best, played);
      this.message.textContent = t(this.verdict);
      this.record(this.revealed ? 'revealed' : this.verdict === 'retryGood' ? this.hinted ? 'hinted' : 'independent' : this.verdict === 'retryUncertain' ? 'uncertain' : 'attempted');
      app.boardUI.setPosition(this.item.fenBefore);
    } catch {
      if (current()) { this.verdict = 'retryUncertain'; this.record('uncertain'); this.message.textContent = t('retryUncertain'); app.boardUI.setPosition(this.item.fenBefore); }
    } finally {
      if (generation === this.generation) { this.busy = false; this.syncControls(); }
    }
  }
}
