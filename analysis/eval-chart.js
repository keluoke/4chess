/** Evaluation timeline. Original game and study branches never share mutable scores. */
import { t, onLanguageChange } from './i18n.js?v=20261029-workbench';
const NS = 'http://www.w3.org/2000/svg';

export class EvalChart {
  constructor(containerEl, onSelectPly, onSelectBranch) {
    this.container = containerEl;
    this.onSelectPly = onSelectPly;
    this.onSelectBranch = onSelectBranch;
    this.data = [];
    this.branch = null;
    this.currentPly = 0;
    this.initDOM();
    onLanguageChange(() => this.render());
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="eval-chart-header">
        <div class="eval-chart-title-group"><span class="eval-chart-title"></span><span id="eval-chart-cursor-badge" class="eval-chart-badge">—</span></div>
        <div class="eval-chart-legend"><span class="chart-original-label"></span><span class="chart-branch-label" hidden></span></div>
      </div>
      <div class="eval-chart-body"><div class="eval-chart-tooltip"></div>
        <svg class="eval-chart-svg" viewBox="0 0 1000 160" preserveAspectRatio="none" role="img">
          <g class="eval-grid"><line x1="0" y1="41.333" x2="1000" y2="41.333"/><line x1="0" y1="80" x2="1000" y2="80"/><line x1="0" y1="118.667" x2="1000" y2="118.667"/></g>
          <path id="eval-line-path" fill="none" stroke="var(--brand-blue)" stroke-width="2"/>
          <path id="eval-branch-path" fill="none" stroke="var(--brand-blue)" stroke-width="2.5"/>
          <line id="eval-fork-line" y1="0" y2="160" stroke="var(--border-color)" opacity="0"/>
          <g id="eval-dots-group"></g><g id="eval-branch-dots"></g>
          <line id="eval-hover-line" y1="0" y2="160" stroke="var(--text-muted)" stroke-dasharray="3 3" opacity="0"/>
          <line id="eval-scrub-line" y1="0" y2="160" stroke="var(--brand-blue)" opacity="0"/>
          <circle id="eval-scrub-dot" r="4.5" fill="var(--brand-blue)" stroke="var(--dg-surface)" stroke-width="1.5" opacity="0"/>
        </svg><div class="chart-scale" aria-hidden="true"><span>+3</span><span>0</span><span>−3</span></div>
      </div><div class="chart-axis"><span class="chart-axis-start"></span><span class="chart-axis-end"></span></div>`;
    const q = selector => this.container.querySelector(selector);
    this.svg = q('svg'); this.tooltip = q('.eval-chart-tooltip'); this.cursorBadge = q('.eval-chart-badge');
    this.linePath = q('#eval-line-path'); this.branchPath = q('#eval-branch-path'); this.forkLine = q('#eval-fork-line');
    this.dotsGroup = q('#eval-dots-group'); this.branchDots = q('#eval-branch-dots');
    this.hoverLine = q('#eval-hover-line'); this.scrubLine = q('#eval-scrub-line'); this.scrubDot = q('#eval-scrub-dot');
    this.svg.addEventListener('pointermove', event => this.showTooltip(event));
    this.svg.addEventListener('pointerleave', () => this.hideTooltip());
    this.svg.addEventListener('click', event => {
      const hit = this.hit(event);
      if (hit) this.select(hit);
    });
  }

  get mainPoints() { return this.initialPoint ? [this.initialPoint, ...this.data] : this.data; }
  get allPoints() { return [...this.mainPoints, ...(this.branch?.points || [])]; }
  get minPly() { return Math.min(...this.allPoints.map(p => p.ply), 0); }
  get maxPly() { return Math.max(...this.allPoints.map(p => p.ply), 1); }
  x(ply) { return (ply - this.minPly) / (this.maxPly - this.minPly || 1) * 1000; }
  y(cp) { return 80 - Math.max(-450, Math.min(450, cp)) / 450 * 58; }
  known(point) { return Number.isFinite(point?.cp); }

  // Missing evaluations break the path. Never interpolate a guessed zero.
  path(points) {
    let connected = false;
    return points.map(point => {
      if (!this.known(point)) { connected = false; return ''; }
      const command = connected ? 'L' : 'M'; connected = true;
      return `${command}${this.x(point.ply)},${this.y(point.cp)}`;
    }).join(' ');
  }

  setBranch(branch) {
    this.branch = branch;
    this.hideTooltip();
    this.render();
  }

  hit(event) {
    const rect = this.svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ply = Math.round(this.minPly + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (this.maxPly - this.minPly));
    const main = this.mainPoints.find(p => p.ply === ply);
    const branch = this.branch?.points.find(p => p.ply === ply);
    const y = (event.clientY - rect.top) / rect.height * 160;
    if (branch && (!main || !this.known(branch) || Math.abs(y - this.y(branch.cp)) <= Math.abs(y - this.y(main.cp)))) return { point: branch, branch: true };
    return main ? { point: main, branch: false } : null;
  }

  select({ point, branch }) {
    if (branch) this.onSelectBranch?.(point.offset);
    else this.onSelectPly?.(point.ply);
  }

  showTooltip(event) {
    const hit = this.hit(event);
    if (!hit) { this.hideTooltip(); return; }
    const point = hit.point;
    this.hoverLine.setAttribute('x1', this.x(point.ply)); this.hoverLine.setAttribute('x2', this.x(point.ply)); this.hoverLine.style.opacity = '1';
    this.tooltip.replaceChildren();
    const label = document.createElement('strong');
    label.textContent = `${t(hit.branch ? 'chartBranch' : 'chartOriginal')} · ${point.moveNumber ? point.moveNumber + (point.turn === 'b' ? '… ' : '. ') : ''}${point.san || ''}`;
    const value = document.createElement('div');
    value.textContent = `${t('chartWhiteAdvantage')} ${point.displayText || '—'}${Number.isFinite(point.depth) ? ` · D${point.depth}` : ''}`;
    if (!this.known(point)) value.textContent = t('chartPending');
    this.tooltip.append(label, value);
    const classification = point.isBeyondIntuition || point.divergenceType === 'beyond_intuition' ? 'beyondText' : point.isHumanTrap || point.divergenceType === 'intuition_trap' ? 'trapText' : point.severity === 'blunder' ? 'blunderText' : point.severity === 'mistake' ? 'mistakeText' : null;
    if (classification) { const tag = document.createElement('div'); tag.textContent = t(classification); this.tooltip.append(tag); }
    this.tooltip.style.display = 'block';
    const width = this.svg.getBoundingClientRect().width;
    const left = Math.max(0, Math.min(width - this.tooltip.offsetWidth, event.clientX - this.svg.getBoundingClientRect().left + 10));
    this.tooltip.style.left = `${left}px`;
  }
  hideTooltip() { this.tooltip.style.display = 'none'; this.hoverLine.style.opacity = '0'; }

  setData(analyzedMoves, evaluations = []) {
    if (!analyzedMoves || analyzedMoves.length === 0) {
      this.data = [];
      this.initialPoint = null;
      this.render();
      return;
    }

    // Convert centipawns / eval into White advantage: clamp to [-450, +450]
    this.data = analyzedMoves.map((m, index) => {
      // Review scores are from the side to move at the evaluated position.
      // In particular, terminal M0 means that side has LOST; its numeric score
      // is -10000. Inferring the sign from the text alone flips the final point.
      const after = m.evalAfter && m.evalAfter !== '?';
      const before = !after && m.evalBefore && m.evalBefore !== '?';
      const evalStr = after ? m.evalAfter : before ? m.evalBefore : m.eval;
      const numericCp = after ? m.evalAfterCp : before ? m.evalBeforeCp : undefined;
      let cp = null;
      if (Number.isFinite(numericCp)) {
        cp = numericCp;
      } else if (evalStr && evalStr !== '?') {
        const mate = String(evalStr).match(/^[#M](-?\d+)$/);
        cp = mate ? (Number(mate[1]) > 0 ? 900 : -900) : parseFloat(evalStr) * 100;
        if (!Number.isFinite(cp)) cp = null;
      }

      const fen = before ? m.fenBefore : m.fenAfter;
      const sideToMove = fen?.split(' ')[1] || (before ? m.turn : m.turn === 'w' ? 'b' : 'w');
      if (cp !== null && sideToMove === 'b') cp = -cp;

      // Clamp between -450 and +450 centipawns ([-4.5, +4.5] pawns)
      const clamped = cp === null ? null : Math.max(-450, Math.min(450, cp));

      return {
        ply: m.ply ?? index + 1,
        depth: evaluations[m.ply ?? index + 1]?.depth ?? m.depth,
        moveNumber: m.moveNumber,
        turn: m.turn,
        san: m.san,
        cp: clamped,
        rawCp: cp,
        displayText: cp === null ? '—' : /^[M#]/.test(evalStr || '') ? `${cp < 0 ? '-' : '+'}M${Math.abs(Number(String(evalStr).slice(1)))}` : `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`,
        evalText: evalStr || '0.00',
        severity: m.severity || 'normal',
        lossPawns: m.lossPawns || '0.00',
        isHumanTrap: !!m.isHumanTrap,
        isBeyondIntuition: !!m.isBeyondIntuition,
        divergenceType: m.divergenceType || null,
        divergenceNote: m.divergenceNote || ''
      };
    });

    const first = analyzedMoves[0];
    const cp = Number.isFinite(first.evalBeforeCp) && first.evalBefore && first.evalBefore !== '?'
      ? first.evalBeforeCp * ((first.fenBefore?.split(' ')[1] || first.turn) === 'b' ? -1 : 1) : null;
    this.initialPoint = Number.isFinite(cp) ? { ply: this.data[0].ply - 1, cp: Math.max(-450, Math.min(450, cp)), rawCp: cp,
      depth: evaluations[0]?.depth,
      displayText: /^[M#]/.test(first.evalBefore) ? `${cp < 0 ? '-' : '+'}M${Math.abs(Number(first.evalBefore.slice(1)))}` : `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`, san: t('startingPosition') } : null;
    this.render();
  }

  setCursor(ply) {
    this.currentPly = ply;
    this.renderCursor();
  }

  renderCursor() {
    const point = this.branch ? this.branch.points[this.branch.cursor] : this.mainPoints.find(p => p.ply === this.currentPly);
    this.scrubLine.style.opacity = point ? '1' : '0';
    this.scrubDot.style.opacity = this.known(point) ? '1' : '0';
    this.cursorBadge.textContent = point?.displayText || '—';
    if (!point) return;
    this.scrubLine.setAttribute('x1', this.x(point.ply)); this.scrubLine.setAttribute('x2', this.x(point.ply));
    this.scrubDot.setAttribute('cx', this.x(point.ply));
    if (this.known(point)) this.scrubDot.setAttribute('cy', this.y(point.cp));
  }

  render() {
    this.container.classList.toggle('chart-has-branch', !!this.branch);
    this.container.querySelector('.eval-chart-title').textContent = t('evalChartTitle');
    this.container.querySelector('.chart-original-label').textContent = t('chartOriginal');
    const legend = this.container.querySelector('.chart-branch-label'); legend.hidden = !this.branch; legend.textContent = t('chartBranch');
    this.svg.setAttribute('aria-label', t(this.branch ? 'chartComparisonLabel' : 'evalChartTitle'));
    this.container.querySelector('.chart-axis-start').textContent = this.allPoints.length ? t('startingPosition') : '';
    const last = this.allPoints.find(point => point.ply === this.maxPly);
    this.container.querySelector('.chart-axis-end').textContent = this.allPoints.length ? t('chartThroughMove', { move: last?.moveNumber || Math.ceil(this.maxPly / 2) }) : '';
    this.linePath.setAttribute('d', this.path(this.mainPoints));
    this.linePath.setAttribute('stroke', this.branch ? 'var(--text-muted)' : 'var(--brand-blue)');
    this.linePath.setAttribute('stroke-dasharray', this.branch ? '5 5' : '');
    this.branchPath.setAttribute('d', this.path(this.branch?.points || []));
    this.forkLine.style.opacity = this.branch ? '1' : '0';
    if (this.branch) { this.forkLine.setAttribute('x1', this.x(this.branch.basePly)); this.forkLine.setAttribute('x2', this.x(this.branch.basePly)); }
    this.dotsGroup.replaceChildren(); this.branchDots.replaceChildren();
    const dot = (point, branch, color, radius) => {
      if (!this.known(point)) return;
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', this.x(point.ply)); el.setAttribute('cy', this.y(point.cp)); el.setAttribute('r', radius);
      el.setAttribute('fill', color); el.setAttribute('stroke', 'var(--dg-surface)'); el.setAttribute('stroke-width', '1.5');
      el.dataset.ply = point.ply;
      if (branch) el.dataset.offset = point.offset;
      el.addEventListener('click', event => { event.stopPropagation(); this.select({ point, branch }); });
      (branch ? this.branchDots : this.dotsGroup).append(el);
    };
    for (const point of this.data) {
      const beyond = point.isBeyondIntuition || point.divergenceType === 'beyond_intuition';
      const trap = point.isHumanTrap || point.divergenceType === 'intuition_trap';
      if (beyond || trap || ['blunder','mistake'].includes(point.severity)) dot(point, false, beyond ? 'var(--brand-blue)' : trap ? 'var(--brand-gold)' : 'var(--brand-red)', 4);
    }
    for (const point of this.branch?.points || []) dot(point, true, 'var(--brand-blue)', 3.5);
    this.renderCursor();
  }
}
