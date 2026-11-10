/**
 * Board Overlay for Maia-3 Human Intuition Heatmap & Arrows
 * Injects an SVG canvas over the chessboard to render:
 * 1. Relative Maia destination-probability heatmap in one warm hue
 * 2. Unambiguous directed intuition arrows pointing precisely from origin to destination
 * 3. Tactical trap warning rings
 */

import { boardColors, arrowMarkers, drawBoardArrow, drawMoveBadge } from '../ui/board-visuals.js';
import { FairPlayGuard } from './fair-play-guard.js';

export class HeatmapOverlay {
  constructor() {
    this.svg = null;
    this.heatmapSvg = null;
    this.boardEl = null;
    this.orientation = 'white';
    this.showHeatmap = true;
    this.showArrows = true;
    this.liveEvaluationEnabled = true;
    this.heatmapOpacity = 0.6;
    this.showStockfishArrows = true;
    this.currentData = null;
    this.activeHoverMove = null;
  }

  attach(boardEl, orientation = 'white') {
    this.orientation = orientation;
    if (this.boardEl === boardEl && this.svg && boardEl.contains(this.svg) && this.heatmapSvg && boardEl.contains(this.heatmapSvg)) {
      return;
    }
    this.svg?.remove();
    this.heatmapSvg?.remove();
    this.boardEl = boardEl;

    const computedStyle = window.getComputedStyle(boardEl);
    if (computedStyle.position === 'static') {
      boardEl.style.position = 'relative';
    }

    const existing = boardEl.querySelector('#maia3-board-overlay');
    if (existing) existing.remove();
    boardEl.querySelector('#maia3-heatmap-overlay')?.remove();

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.id = 'maia3-board-overlay';
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.style.position = 'absolute';
    this.svg.style.top = '0';
    this.svg.style.left = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.pointerEvents = 'none';
    this.svg.style.zIndex = '15';
    this.svg.style.transition = 'opacity 0.2s ease';

    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.svg.style.display = 'block';
    this.svg.innerHTML = `
      ${arrowMarkers('maia-arrow', { ...boardColors(), 'gold-secondary': boardColors().gold, sf: boardColors().green, consensus: boardColors().green, blunder: boardColors().red })}
      <g id="maia-arrows-layer"></g>
      <g id="maia-sf-arrows-layer"></g>
      <g id="maia-traps-layer"></g>
    `;

    // Heat belongs above the board background and below pieces, like the studio.
    this.heatmapSvg = this.svg.cloneNode(false);
    this.heatmapSvg.id = 'maia3-heatmap-overlay';
    this.heatmapSvg.style.zIndex = '0';
    this.heatmapSvg.innerHTML = '<g id="maia-heatmap-layer"></g>';
    boardEl.append(this.heatmapSvg, this.svg);
  }

  setOrientation(orientation) {
    this.orientation = orientation;
    if (this.currentData) {
      this.render(this.currentData);
    }
  }

  setToggles({ showHeatmap, showArrows, showStockfishArrows, opacity }) {
    if (showHeatmap !== undefined) this.showHeatmap = showHeatmap;
    if (showArrows !== undefined) this.showArrows = showArrows;
    if (showStockfishArrows !== undefined) this.showStockfishArrows = showStockfishArrows;
    if (opacity !== undefined) this.heatmapOpacity = opacity;

    if (this.currentData) {
      this.render(this.currentData);
    }
  }

  setHoverMove(moveUci) {
    this.activeHoverMove = moveUci;
    if (this.currentData) {
      this.render(this.currentData);
    }
  }

  setLiveEvaluation(enabled) {
    this.liveEvaluationEnabled = Boolean(enabled);
    if (!this.liveEvaluationEnabled) {
      this.clear();
    } else if (this.currentData) {
      this.render(this.currentData);
    }
  }

  /**
   * Converts square index (0..63) to SVG canvas coordinates
   * sqIdx = rank * 8 + file (a1 = 0, h1 = 7, a8 = 56, h8 = 63)
   */
  squareToCoords(sqIdx) {
    if (typeof sqIdx === 'string') {
      const f = sqIdx.charCodeAt(0) - 97;
      const r = parseInt(sqIdx[1], 10) - 1;
      sqIdx = r * 8 + f;
    }
    const f = sqIdx % 8;
    const r = Math.floor(sqIdx / 8);

    let col = f;
    let row = 7 - r; // White orientation: rank 8 is top row 0

    if (this.orientation === 'black') {
      col = 7 - f;
      row = r; // Black orientation: rank 1 is top row 0
    }

    const sqSize = 100;
    const x = col * sqSize;
    const y = row * sqSize;
    return {
      x,
      y,
      cx: x + sqSize / 2,
      cy: y + sqSize / 2,
      size: sqSize
    };
  }

  render(predictionData) {
    if (!this.svg) return;
    if (FairPlayGuard.isLiveGameInProgress() || !this.liveEvaluationEnabled) {
      this.clear();
      return;
    }
    this.currentData = predictionData;
    this.svg.querySelector('defs').outerHTML = arrowMarkers('maia-arrow', { ...boardColors(), 'gold-secondary': boardColors().gold, sf: boardColors().green, consensus: boardColors().green, blunder: boardColors().red });
    // Engine scores arrive in the side-to-move perspective; labels use White's perspective.
    if (predictionData?.stockfish && predictionData.turn === 'b') {
      const score = String(predictionData.stockfish.score ?? '?');
      const mate = score.match(/^[M#]([-+]?\d+)$/);
      const whiteScore = mate ? `M${-Number(mate[1]) > 0 ? '+' : ''}${-Number(mate[1])}` : Number.isFinite(Number(score)) ? (-Number(score)).toFixed(2) : score;
      predictionData = { ...predictionData, stockfish: { ...predictionData.stockfish, score: whiteScore } };
    }

    const heatmapGroup = this.heatmapSvg.querySelector('#maia-heatmap-layer');
    const arrowsGroup = this.svg.querySelector('#maia-arrows-layer');
    const sfArrowsGroup = this.svg.querySelector('#maia-sf-arrows-layer');
    const trapsGroup = this.svg.querySelector('#maia-traps-layer');

    heatmapGroup.innerHTML = '';
    arrowsGroup.innerHTML = '';
    if (sfArrowsGroup) sfArrowsGroup.innerHTML = '';
    trapsGroup.innerHTML = '';

    // If Stockfish has bestMove, draw Stockfish arrow immediately regardless of Maia state
    if (this.showStockfishArrows && predictionData?.stockfish?.bestMove && sfArrowsGroup && !predictionData.isAvailable) {
      const bm = predictionData.stockfish.bestMove;
      this.drawArrow(sfArrowsGroup, {
        from: bm.fromSq !== undefined ? bm.fromSq : bm.from,
        to: bm.toSq !== undefined ? bm.toSq : bm.to,
        width: 7.5,
        marker: 'maia-arrow-sf',
        label: `★ ${bm.san} (${predictionData.stockfish.score})`,
      });
    }

    // If Maia-3 engine is not available, return after drawing Stockfish
    if (!predictionData || !predictionData.isAvailable) {
      return;
    }

    // 1. Render Square Heatmap
    if (this.showHeatmap && predictionData.heatmap) {
      this.renderHeatmapSquares(heatmapGroup, predictionData.heatmap);
    }

    // 2. Render Dual Move Arrows (Maia Human + Stockfish Objective)
    if (this.showArrows || this.showStockfishArrows) {
      this.renderDualArrows(arrowsGroup, sfArrowsGroup, { ...predictionData, stockfish: this.showStockfishArrows ? predictionData.stockfish : null });
      if (!this.showArrows) arrowsGroup.replaceChildren();
      if (!this.showStockfishArrows) sfArrowsGroup.replaceChildren();
    }

    // 3. Render Tactical Trap Indicator
    if (predictionData.analysis && predictionData.analysis.isTacticalTrap && predictionData.moves?.[0]) {
      this.renderTrapWarning(trapsGroup, predictionData.moves[0]);
    }
  }

  renderHeatmapSquares(group, heatmap) {
    const color = boardColors().gold;
    for (let i = 0; i < 64; i++) {
      const val = heatmap[i];
      if (!Number.isFinite(val) || val <= 0) continue;

      const { x, y, size } = this.squareToCoords(i);
      const alpha = Math.min(0.6, val * this.heatmapOpacity);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', size);
      rect.setAttribute('height', size);
      rect.setAttribute('shape-rendering', 'crispEdges');
      rect.setAttribute('fill', color);
      rect.setAttribute('fill-opacity', alpha.toFixed(3));
      rect.style.transition = 'fill-opacity 0.15s ease';

      group.appendChild(rect);
    }
  }

  renderDualArrows(maiaGroup, sfGroup, data) {
    const moves = data.moves || [];
    const sf = data.stockfish;
    const blunder = data.blunderContext;

    // SCENARIO 1: Blunder Moment Drill (Decision point before the blunder was played)
    if (blunder && data.viewMode !== 'result') {
      // 1. Played blunder: red dashed arrow and ! badge
      const bFrom = blunder.from || (blunder.uci ? blunder.uci.slice(0, 2) : null);
      const bTo = blunder.to || (blunder.uci ? blunder.uci.slice(2, 4) : null);

      if (bFrom && bTo) {
        this.drawArrow(maiaGroup, {
          from: bFrom,
          to: bTo,
          width: 8.5,
          marker: 'maia-arrow-blunder',
          label: `! ${blunder.san} (${blunder.lossPawns})`,
        });
      }

      // 2. Engine Best Move Arrow (★ Emerald Green, solid)
      const bm = blunder.bestMove || sf?.bestMove;
      const bmFrom = bm ? (bm.fromSq !== undefined ? bm.fromSq : bm.from) : (blunder.bestUci ? blunder.bestUci.slice(0, 2) : null);
      const bmTo = bm ? (bm.toSq !== undefined ? bm.toSq : bm.to) : (blunder.bestUci ? blunder.bestUci.slice(2, 4) : null);

      if (bmFrom && bmTo && sfGroup) {
        const bestSan = blunder.bestSan || bm.san;
        const evalScore = sf?.score || blunder.evalBefore;
        this.drawArrow(sfGroup, {
          from: bmFrom,
          to: bmTo,
          width: 8.5,
          marker: 'maia-arrow-sf',
          label: `★ ${bestSan} (${evalScore})`,
        });
      }

      // 3. Maia Intuition Arrow (M Gold, if distinct from played blunder & engine best)
      const topMove = moves[0];
      if (topMove) {
        const cleanTop = topMove.san.replace(/[+#?!]/g, '');
        const cleanPlayed = (blunder.san || '').replace(/[+#?!]/g, '');
        const cleanBest = (blunder.bestSan || bm?.san || '').replace(/[+#?!]/g, '');
        const isPlayedMove = cleanTop === cleanPlayed || (bFrom && bTo && topMove.from === bFrom && topMove.to === bTo);
        const isBestMove = cleanTop === cleanBest || (bmFrom && bmTo && topMove.from === bmFrom && topMove.to === bmTo);

        if (!isPlayedMove && !isBestMove) {
          this.drawArrow(maiaGroup, {
            from: topMove.from,
            to: topMove.to,
            width: 6.5,
            marker: 'maia-arrow-gold',
            label: `M ${topMove.san} (${topMove.prob}%)`,
          });
        }
      }

      return;
    }

    // SCENARIO 2: Standard Dual-Engine Comparative Display
    const topMove = moves[0];
    const isConsensus = this.showArrows && this.showStockfishArrows && sf && sf.bestMove && topMove && (topMove.uci === sf.bestMove.uci);

    if (isConsensus) {
      // One green arrow with both engine identifiers (Maia == Stockfish)
      this.drawArrow(maiaGroup, {
        from: topMove.from,
        to: topMove.to,
        width: 9.0,
        marker: 'maia-arrow-consensus',
        label: `★ M ${topMove.san} (${topMove.prob}%)`,
      });
      // Other human moves
      moves.slice(1, 3).forEach(m => {
        this.drawArrow(maiaGroup, {
          from: m.from,
          to: m.to,
          width: 5.0,
          marker: 'maia-arrow-gold',
          label: `${m.prob}%`,
        });
      });
    } else {
      // Maia Human Top Move (Gold Arrow)
      if (topMove) {
        this.drawArrow(maiaGroup, {
          from: topMove.from,
          to: topMove.to,
          width: 8.5,
          marker: 'maia-arrow-gold',
          label: `M ${topMove.san} (${topMove.prob}%)`,
        });
      }

      // Stockfish Objective Best Move (Emerald Green Arrow)
      if (sf && sf.bestMove && sfGroup) {
        const bm = sf.bestMove;
        this.drawArrow(sfGroup, {
          from: bm.fromSq !== undefined ? bm.fromSq : bm.from,
          to: bm.toSq !== undefined ? bm.toSq : bm.to,
          width: 7.5,
          marker: 'maia-arrow-sf',
          label: `★ ${bm.san} (${sf.score})`,
        });
      }

      // Other human candidates
      moves.slice(1, 3).forEach(m => {
        this.drawArrow(maiaGroup, {
          from: m.from,
          to: m.to,
          width: 4.5,
          marker: 'maia-arrow-gold',
          label: `${m.prob}%`,
        });
      });
    }
  }

  drawArrow(group, { from, to, width, marker, label }) {
    const a = this.squareToCoords(from), b = this.squareToCoords(to);
    const role = marker === 'maia-arrow-sf' ? 'sf' : marker === 'maia-arrow-consensus' ? 'consensus' : marker === 'maia-arrow-blunder' ? 'error' : label?.startsWith('M ') ? 'maia' : 'candidate';
    const colors = boardColors();
    const color = role === 'sf' || role === 'consensus' ? colors.green : role === 'error' ? colors.red : colors.gold;
    drawBoardArrow(group, { from: { x: a.cx, y: a.cy }, to: { x: b.cx, y: b.cy }, color, marker: width <= 5 ? `${marker}-secondary` : marker, role, secondary: width <= 5, opacity: width <= 5 ? .5 : .84, dashed: role === 'error' });
    drawMoveBadge(group, { x: b.cx, y: b.cy, role, color, title: label });
  }

  renderTrapWarning(group, topMove) {
    if (!topMove) return;
    const { cx, cy } = this.squareToCoords(topMove.to);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', '38');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', boardColors().red);
    circle.setAttribute('stroke-width', '3.5');
    circle.setAttribute('stroke-dasharray', '6 4');
    circle.setAttribute('opacity', '0.85');

    group.appendChild(circle);
  }

  clear() {
    this.currentData = null;
    this.activeHoverMove = null;
    if (!this.svg) return;
    const heatmapGroup = this.heatmapSvg?.querySelector('#maia-heatmap-layer');
    const arrowsGroup = this.svg.querySelector('#maia-arrows-layer');
    const sfArrowsGroup = this.svg.querySelector('#maia-sf-arrows-layer');
    const trapsGroup = this.svg.querySelector('#maia-traps-layer');
    if (heatmapGroup) heatmapGroup.innerHTML = '';
    if (arrowsGroup) arrowsGroup.innerHTML = '';
    if (sfArrowsGroup) sfArrowsGroup.innerHTML = '';
    if (trapsGroup) trapsGroup.innerHTML = '';
  }
}
