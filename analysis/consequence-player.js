import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { soundEffects } from './sound-effects.js?v=20261025-v115';
import { t } from './i18n.js?v=20261124-review-scan-polish';

export function buildReplaySteps(fenBefore, variation, limit = 3) {
  if (!fenBefore || !Array.isArray(variation) || !variation.length) return [];
  const board = new ChessBoard(fenBefore);
  if (!board.isValid) return [];
  const steps = [];
  for (const uci of variation.slice(0, limit)) {
    const move = board.getLegalMoves().find(candidate => candidate.uci === uci);
    if (!move) break;
    board.makeMove(move);
    steps.push({
      uci: move.uci,
      san: move.san,
      from: move.fromSq,
      to: move.toSq,
      fen: board.getFen()
    });
  }
  return steps;
}

export class ConsequencePlayer {
  active = false;
  generation = 0;
  timers = [];

  constructor(app) {
    this.app = app;
    this.bar = document.getElementById('consequence-bar');
    this.label = document.getElementById('consequence-bar-text');
    this.btnBest = document.getElementById('btn-consequence-best');
    this.btnExit = document.getElementById('btn-consequence-exit');
    if (this.btnBest) {
      this.btnBest.onclick = () => {
        if (this.currentMove) this.play(this.currentMove, { mode: 'best' });
      };
    }
    if (this.btnExit) {
      this.btnExit.onclick = () => this.stop({ restore: true });
    }
  }

  allowed() {
    return !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
  }

  canPlay(move) {
    return !!move?.fenBefore && buildReplaySteps(move.fenBefore, move.verifiedPlayedPv || move.playedPv, 3).length >= 2;
  }

  canPlayBest(move) {
    const pv = move?.verifiedBestPv || move?.bestPv || (move?.verifiedBestUci ? [move.verifiedBestUci] : move?.bestUci ? [move.bestUci] : []);
    return !!move?.fenBefore && buildReplaySteps(move.fenBefore, pv, 3).length >= 1;
  }

  clearTimers() {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
  }

  play(move, { mode = 'played', stepMs = 750 } = {}) {
    if (!this.allowed() || !move?.fenBefore) return false;
    const variation = mode === 'best'
      ? (move.verifiedBestPv || move.bestPv || (move.verifiedBestUci ? [move.verifiedBestUci] : move.bestUci ? [move.bestUci] : []))
      : (move.verifiedPlayedPv || move.playedPv || []);
    const steps = buildReplaySteps(move.fenBefore, variation, 3);
    if (!steps.length || (mode === 'played' && steps.length < 2)) return false;

    this.stop();
    if (this.app.isPlaying) this.app.toggleAutoPlay();
    this.app.positionAnalysis?.cancel();
    this.app.positionAnalysis?.clearOverlays?.();
    this.app.boardUI?.clearArrows?.();

    const generation = ++this.generation;
    const epoch = this.app.gameEpoch;
    this.active = true;
    this.currentMove = move;
    this.currentMode = mode;
    this.epoch = epoch;

    if (move.turn && !this.app.positions?.length) {
      this.app.boardUI?.setOrientation?.(move.turn === 'w' ? 'white' : 'black');
    }
    this.app.boardUI?.setPosition?.(move.fenBefore, null);

    const lineText = steps.map(step => step.san).join(' ');
    if (this.bar) this.bar.hidden = false;
    if (this.btnBest) this.btnBest.hidden = mode === 'best' || !this.canPlayBest(move);
    const updateStatus = text => {
      if (this.label) this.label.textContent = text;
      if (this.app.el?.boardStatusText) this.app.el.boardStatusText.textContent = text;
    };
    updateStatus(t(mode === 'best' ? 'consequenceBestRunning' : 'consequenceRunning', { line: lineText }));

    steps.forEach((step, index) => {
      const timer = setTimeout(() => {
        if (!this.active || generation !== this.generation || this.app.gameEpoch !== epoch || !this.allowed()) return;
        this.app.boardUI?.setPosition?.(step.fen, { from: step.from, to: step.to });
        soundEffects?.playSoundForMove?.(step.san);
        updateStatus(t(mode === 'best' ? 'consequenceBestStep' : 'consequenceStep', {
          current: index + 1,
          total: steps.length,
          san: step.san,
          line: lineText
        }));
      }, (index + 1) * stepMs);
      this.timers.push(timer);
    });

    return true;
  }

  stop({ restore = false } = {}) {
    const move = this.currentMove;
    const epoch = this.epoch;
    this.clearTimers();
    this.generation++;
    this.active = false;
    this.currentMove = null;
    if (this.bar) this.bar.hidden = true;
    if (restore && move && epoch === this.app.gameEpoch) {
      if (Number.isInteger(move.ply) && move.ply > 0 && this.app.positions?.length > move.ply) {
        this.app.goToPly(move.ply, { before: true, silent: true });
      } else if (move.fenBefore) {
        this.app.boardUI?.setPosition?.(move.fenBefore, null);
      }
    }
  }
}
