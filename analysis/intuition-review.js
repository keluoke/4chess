import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261125-game-story';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js?v=20261124-checkup-cards-r2';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { t } from './i18n.js?v=20261124-intuition-labels';

const phaseLabels = { intuition: 'intuitionCount', verifying: 'intuitionVerifying' };

// Full-game intuition has its own search worker. It never cancels the board's
// foreground search; the large Maia model remains shared and is loaded once.
export class IntuitionReview {
  constructor(app) {
    this.app = app;
    this.generation = 0;
    this.predictions = new Map();
    this.state = 'idle';
    this.controls = document.getElementById('review-intuition-scan');
    this.button = document.getElementById('intuition-toggle');
    this.meter = document.getElementById('intuition-scan-meter');
    this.button.onclick = () => this.state === 'running' ? this.pause() : this.start();
    this.render();
  }
  render() {
    const status = document.getElementById('intuition-progress');
    const result = this.app.reviewResult;
    this.controls.hidden = !result || this.state === 'done' || (this.state === 'idle' && !result.engineOnly);
    const key = { idle:'intuitionIdle', running:'intuitionScanning', paused:'intuitionPaused', done:'intuitionDone', error:'intuitionFailed', partial:'intuitionPartial' }[this.state];
    const progress = this.app.maiaEngine?.status?.maia;
    const downloading = this.state === 'running' && this.app.maiaEngine?.isLoading && progress?.state === 'downloading';
    let text = t(key);
    if (downloading) text = progress.percent == null
      ? t('modelDownloadingBytes', { size: progress.loadedMB })
      : t('intuitionLoading', { percent: progress.percent });
    else if (this.state === 'running' && this.progress) text = t(phaseLabels[this.progress.phase], this.progress);
    if (status.textContent !== text) status.textContent = text;
    const fraction = downloading ? progress.percent / 100
      : ['running', 'paused'].includes(this.state) && this.progress?.total > 0 ? this.progress.current / this.progress.total : NaN;
    if (this.state !== 'paused') {
      this.meter.hidden = (downloading && progress.percent == null) || !Number.isFinite(fraction);
      if (!this.meter.hidden) this.meter.value = Math.max(0, Math.min(1, fraction));
    }
    const action = { running: 'intuitionPause', paused: 'intuitionResume', error: 'intuitionRetry', partial: 'intuitionRetry' };
    const label = t(action[this.state] || 'intuitionStart');
    this.button.textContent = Number.isFinite(fraction) ? `${label} · ${Math.round(fraction * 100)}%` : label;
    this.button.disabled = !this.app.coreReview || !!this.app.scanSourceLocked;
  }
  pause() {
    this.generation++;
    this.analyzer?.cancel();
    this.state = 'paused';
    this.render();
  }
  dispose() {
    this.generation++;
    this.analyzer?.cancel();
    this.engine?.reset();
    this.engine = null;
    this.predictions.clear();
    this.state = 'idle';
    this.progress = null;
    this.render();
  }
  async start() {
    const app = this.app, base = app.coreReview;
    if (!base || app.scanSourceLocked || FairPlayGuard.isLiveGameInProgress()) return;
    this.analyzer?.cancel();
    const generation = ++this.generation, epoch = app.gameEpoch;
    const maia = app.maiaEngine, elo = app.currentElo;
    const current = () => generation === this.generation && epoch === app.gameEpoch &&
      maia === app.maiaEngine && elo === app.currentElo && !app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
    this.state = 'running'; this.progress = null; this.render();
    const waitForTurn = async invalid => {
      while (current() && !invalid() && (app.positionAnalysis.foregroundBusy || app.positionAnalysis.eloTrend?.busy || app.practice?.active || app.isPlaying)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    this.engine ||= new StockfishInBrowser({ variant: app.engineVariant });
    const predictions = this.predictions;
    const facade = {
      get isReady() { return maia.isReady; },
      get modelKey() { return maia.modelKey; },
      initialize: () => maia.initialize(),
      async predict(fen, rating, sf, invalid, history) {
        const key = `${maia.modelKey}|${rating}|${fen}|${history.join(';')}`;
        if (predictions.has(key)) return predictions.get(key);
        const result = await app.positionAnalysis.predictMaia(maia, fen, rating, sf, () => !current() || invalid(), history, 2);
        if (current() && !invalid() && result?.moves?.length) predictions.set(key, result);
        return result;
      }
    };
    const analyzer = this.analyzer = new GameAnalyzer(this.engine, facade);
    try {
      const result = await analyzer.analyzeGame(app.moves, {
        depth: base.depth, reviewMode: base.reviewMode, elo, baseReview: base, waitForTurn,
        onProgress: progress => {
          if (!current() || !phaseLabels[progress.phase] || !progress.current) return;
          this.progress = progress;
          this.render();
        }
      });
      if (!current() || !result) return;
      const count = result.allMoves.filter(move => move._predMoves?.length).length;
      this.state = count === result.totalMoves ? 'done' : count ? 'partial' : 'error';
      const focusResult = this.state === 'done' && document.activeElement === this.button;
      // Refresh report labels only. Keep the current board and foreground work.
      app.applyReviewResult(result, { refreshPosition: false });
      if (focusResult) document.querySelector('#review-intuition-grid .review-intuition-kind')?.focus({ preventScroll: true });
    } catch (error) {
      if (!current()) return;
      console.warn('[Studio] Intuition scan failed:', error);
      this.state = 'error'; this.render();
    } finally {
      if (current()) this.engine?.reset();
    }
  }
}
