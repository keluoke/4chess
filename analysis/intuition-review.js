import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261029-workbench';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js?v=20261025-v115';
import { FairPlayGuard } from '../content/fair-play-guard.js';
import { t } from './i18n.js?v=20261029-workbench';

// Full-game intuition has its own search worker. It never cancels the board's
// foreground search; the large Maia model remains shared and is loaded once.
export class IntuitionReview {
  constructor(app) {
    this.app = app;
    this.generation = 0;
    this.predictions = new Map();
    this.state = 'idle';
    this.button = document.getElementById('intuition-toggle');
    this.button.onclick = () => this.state === 'running' ? this.pause() : this.start();
    this.render();
  }
  render() {
    const status = document.getElementById('intuition-progress');
    const key = { idle:'intuitionIdle', running:'intuitionScanning', paused:'intuitionPaused', done:'intuitionDone', error:'intuitionFailed', partial:'intuitionPartial' }[this.state];
    status.textContent = this.state === 'running' && this.progress ? this.progress : t(key);
    const progress = this.app.maiaEngine?.status?.maia;
    if (this.state === 'running' && this.app.maiaEngine?.isLoading && progress?.state === 'downloading') status.textContent = t('intuitionLoading', { percent: progress.percent || 0 });
    this.button.textContent = t(this.state === 'running' ? 'intuitionPause' : this.state === 'paused' ? 'intuitionResume' : 'intuitionStart');
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
    this.progress = '';
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
    this.state = 'running'; this.progress = ''; this.render();
    const waitForTurn = async invalid => {
      while (current() && !invalid() && (app.positionAnalysis.foregroundBusy || app.practice?.active || app.isPlaying)) {
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
        const result = await maia.predict(fen, rating, sf, invalid, history);
        if (current() && !invalid() && result?.moves?.length) predictions.set(key, result);
        return result;
      }
    };
    const analyzer = this.analyzer = new GameAnalyzer(this.engine, facade);
    try {
      const result = await analyzer.analyzeGame(app.moves, {
        depth: base.depth, elo, baseReview: base, waitForTurn,
        onProgress: progress => {
          if (!current() || progress.phase === 'evaluating' || progress.phase === 'done') return;
          this.progress = t(progress.phase === 'verifying' ? 'intuitionVerifying' : 'intuitionCount', { current: progress.current, total: progress.total });
          this.render();
        }
      });
      if (!current() || !result) return;
      const count = result.allMoves.filter(move => move._predMoves?.length).length;
      this.state = count === result.totalMoves ? 'done' : count ? 'partial' : 'error';
      // Refresh report labels only. Keep the current board and foreground work.
      app.applyReviewResult(result, { refreshPosition: false });
      this.render();
    } catch (error) {
      if (!current()) return;
      console.warn('[Studio] Intuition scan failed:', error);
      this.state = 'error'; this.render();
    } finally {
      if (current()) this.engine?.reset();
    }
  }
}
