import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261128-review-fixes';
import { MaiaEngine } from '../engine/maia-engine.js?v=20261128-review-fixes';
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
    this.yielded = false;
    this.controls = document.getElementById('review-intuition-scan');
    this.button = document.getElementById('intuition-toggle');
    this.meter = document.getElementById('intuition-scan-meter');
    this.button.onclick = () => this.state === 'running' ? this.pause() : this.start();
    this.render();
  }
  statusText() {
    const key = { idle:'intuitionIdle', running:'intuitionScanning', paused:'intuitionPaused', done:'intuitionDone', error:'intuitionFailed', partial:'intuitionPartial' }[this.state];
    const progress = this.app.maiaEngine?.status?.maia;
    const downloading = this.state === 'running' && this.app.maiaEngine?.isLoading && progress?.state === 'downloading';
    if (downloading) return progress.percent == null
      ? t('modelDownloadingBytes', { size: progress.loadedMB })
      : t('intuitionLoading', { percent: progress.percent });
    if (this.state === 'running' && this.yielded) return t('intuitionYielded');
    if (this.state === 'running' && this.progress) return t(phaseLabels[this.progress.phase], this.progress);
    return t(key);
  }
  fraction() {
    const progress = this.app.maiaEngine?.status?.maia;
    const downloading = this.state === 'running' && this.app.maiaEngine?.isLoading && progress?.state === 'downloading';
    if (downloading) return progress.percent / 100;
    if (['running', 'paused'].includes(this.state) && this.progress?.total > 0) return this.progress.current / this.progress.total;
    return NaN;
  }
  actionLabel() {
    const action = { running: 'intuitionPause', paused: 'intuitionResume', error: 'intuitionRetry', partial: 'intuitionRetry' };
    return t(action[this.state] || 'intuitionStart');
  }
  render() {
    const status = document.getElementById('intuition-progress');
    const result = this.app.reviewResult;
    this.controls.hidden = !result || this.state === 'done' || (this.state === 'idle' && !result.engineOnly);
    const text = this.statusText();
    if (status.textContent !== text) status.textContent = text;
    const progress = this.app.maiaEngine?.status?.maia;
    const downloading = this.state === 'running' && this.app.maiaEngine?.isLoading && progress?.state === 'downloading';
    const fraction = this.fraction();
    if (this.state !== 'paused') {
      this.meter.hidden = (downloading && progress.percent == null) || !Number.isFinite(fraction);
      if (!this.meter.hidden) this.meter.value = Math.max(0, Math.min(1, fraction));
    }
    this.button.textContent = this.actionLabel();
    this.button.disabled = !this.app.coreReview || !!this.app.scanSourceLocked;
    this.app.reviewOverview?.syncIntuitionStatus?.();
    this.app.reviewShare?.syncIntuitionNote?.();
  }
  pause() {
    this.generation++;
    this.analyzer?.cancel();
    this.yielded = false;
    this.state = 'paused';
    this.render();
  }
  dispose() {
    this.generation++;
    this.analyzer?.cancel();
    this.engine?.reset();
    this.engine = null;
    this.predictions.clear();
    this.yielded = false;
    this.state = 'idle';
    this.progress = null;
    this.render();
  }
  async prewarm(moves, elo) {
    const app = this.app;
    if (!moves?.length || app.scanSourceLocked || FairPlayGuard.isLiveGameInProgress() || this.state === 'running') return;
    const maia = app.maiaEngine;
    if (!maia) return;
    const canPrewarm = maia.isReady || (maia.initialize === MaiaEngine.prototype.initialize && await maia.isCachedLocally());
    if (!canPrewarm) return;
    const generation = this.generation, epoch = app.gameEpoch;
    const active = () => generation === this.generation && epoch === app.gameEpoch &&
      maia === app.maiaEngine && elo === app.currentElo && this.state === 'idle' &&
      !app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
    try {
      if (!maia.isReady) await maia.initialize();
      if (!active() || !maia.isReady) return;
      const positions = GameAnalyzer.buildPositionChain(moves);
      for (let j = 0; j < positions.length - 1; j++) {
        if (!active()) return;
        while (active() && (app.positionAnalysis.foregroundBusy || app.practice?.active || app.isPlaying)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!active()) return;
        const fenBefore = positions[j].fen;
        const historyFens = positions.slice(Math.max(0, j - 7), j).map(p => p.fen);
        const key = `${maia.modelKey}|${elo}|${fenBefore}|${historyFens.join(';')}`;
        if (this.predictions.has(key)) continue;
        const res = await app.positionAnalysis.predictMaia(maia, fenBefore, elo, null, () => !active(), historyFens, 2);
        if (active() && res?.moves?.length) this.predictions.set(key, res);
      }
    } catch (error) {
      console.debug('[Studio] Maia prewarm skipped:', error?.message || error);
    }
  }
  async start() {
    const app = this.app, base = app.coreReview;
    if (!base || app.scanSourceLocked || FairPlayGuard.isLiveGameInProgress()) return;
    this.analyzer?.cancel();
    const generation = ++this.generation, epoch = app.gameEpoch;
    const maia = app.maiaEngine, elo = app.currentElo;
    const current = () => generation === this.generation && epoch === app.gameEpoch &&
      maia === app.maiaEngine && elo === app.currentElo && !app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
    this.yielded = false;
    this.state = 'running'; this.progress = null; this.render();
    const waitForTurn = async invalid => {
      const busy = () => app.positionAnalysis.foregroundBusy || app.positionAnalysis.eloTrend?.busy || app.practice?.active || app.isPlaying;
      if (!busy()) return;
      const startedWait = performance.now();
      while (current() && !invalid() && busy()) {
        if (!this.yielded && performance.now() - startedWait >= 250) {
          this.yielded = true;
          this.render();
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.yielded && current()) {
        this.yielded = false;
        this.render();
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
      this.yielded = false;
      const count = result.allMoves.filter(move => move._predMoves?.length).length;
      this.state = count === result.totalMoves ? 'done' : count ? 'partial' : 'error';
      if (this.state === 'error') {
        this.render();
        return;
      }
      const focusResult = this.state === 'done' && document.activeElement === this.button;
      // Refresh report labels only. Keep the current board and foreground work.
      app.applyReviewResult(result, { refreshPosition: false });
      if (focusResult) document.querySelector('#review-intuition-grid .review-intuition-kind')?.focus({ preventScroll: true });
    } catch (error) {
      if (!current()) return;
      this.yielded = false;
      console.warn('[Studio] Intuition scan failed:', error);
      this.state = 'error'; this.render();
    } finally {
      if (current()) this.engine?.reset();
    }
  }
}
