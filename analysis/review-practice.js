import { t } from './i18n.js?v=20261029-workbench';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { retryVerdict } from '../engine/review-policy.js?v=20261029-workbench';

export class ReviewPractice {
  constructor(app) { this.app = app; this.generation = 0; }
  start(item) {
    const app = this.app;
    this.stop();
    if (app.scanSourceLocked || FairPlayGuard.isLiveGameInProgress()) return;
    if (app.isPlaying) app.toggleAutoPlay();
    app.goToPly(item.ply, { before: true });
    clearTimeout(app.resumeReviewTimer);
    app.positionAnalysis.cancel();
    this.active = true; this.item = item; this.busy = false;
    document.body.classList.add('practice-active');
    app.boardUI.clearArrows?.();
    app.positionAnalysis.clearOverlays();
    app.el.boardStatusText.textContent = t('retryTurn', { side: t(item.turn === 'w' ? 'whitePlayer' : 'blackPlayer') });
    this.panel = document.getElementById('practice-panel');
    this.panel.hidden = false;
    this.panel.replaceChildren();
    const title = document.createElement('h2'); title.textContent = t('retryMove');
    this.message = document.createElement('p'); this.message.setAttribute('role', 'status'); this.message.textContent = t('retryPrompt');
    const exit = document.createElement('button'); exit.className = 'btn-header'; exit.textContent = t('retryReveal');
    exit.onclick = () => { this.stop(); app.goToPly(item.ply, { before: true }); };
    this.panel.append(title, this.message, exit);
    this.panel.scrollIntoView({ block: 'nearest' });
  }
  stop() {
    if (!this.active) return;
    this.generation++;
    this.active = false;
    if (this.busy) this.app.stockfish.stop();
    this.busy = false;
    document.body.classList.remove('practice-active');
    if (this.panel) this.panel.hidden = true;
  }
  async submit(move, fenAfter) {
    const app = this.app;
    // A second drag cannot replace the position being graded.
    if (this.busy) { app.boardUI.setPosition(this.submittedFen); return; }
    if (app.scanSourceLocked || FairPlayGuard.isLiveGameInProgress()) { this.stop(); return; }
    const generation = ++this.generation;
    this.busy = true; this.submittedFen = fenAfter;
    this.message.textContent = t('retryChecking');
    const current = () => this.active && generation === this.generation && !app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
    try {
      const best = await app.stockfish.evaluate(this.item.fenBefore, 14, 6000, 1);
      if (!current()) return;
      const played = await app.stockfish.evaluate(fenAfter, 13, 6000, 1);
      if (!current()) return;
      const verdict = retryVerdict(best, played);
      this.message.textContent = t(verdict);
      // Keep the answer hidden and allow another independent attempt.
      app.boardUI.setPosition(this.item.fenBefore);
    } catch {
      if (current()) { this.message.textContent = t('retryUncertain'); app.boardUI.setPosition(this.item.fenBefore); }
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
}
