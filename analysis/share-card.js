import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { intuitionKind } from '../engine/review-policy.js?v=20261117-review-policy';
import { CHESS_PIECES_SVG } from './chess-pieces.js';
import { getLang, t } from './i18n.js?v=20261123-playing-profile';

export const SHARE_CARD_FORMATS = {
  landscape: { width: 1200, height: 675 },
  portrait: { width: 1080, height: 1350 }
};

const UNICODE_PIECES = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

export function parseUciSquares(uci) {
  if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8]/.test(uci)) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export function parseFenBoard(fen = ChessBoard.INITIAL_FEN) {
  const parts = String(fen || ChessBoard.INITIAL_FEN).trim().split(/\s+/);
  const placement = parts[0] || ChessBoard.INITIAL_FEN.split(' ')[0];
  const turn = parts[1] === 'b' ? 'b' : 'w';
  const rows = placement.split('/');
  const pieces = [];
  if (rows.length === 8) {
    for (let rIdx = 0; rIdx < 8; rIdx++) {
      const rank = 8 - rIdx;
      let file = 0;
      for (const ch of rows[rIdx]) {
        if (ch >= '1' && ch <= '8') {
          file += Number(ch);
        } else if (UNICODE_PIECES[ch] && file < 8) {
          pieces.push({
            piece: ch,
            rank,
            file,
            square: `${String.fromCharCode(97 + file)}${rank}`
          });
          file++;
        }
      }
    }
  }
  return { pieces, turn };
}

export function buildShareCardSpec(move = {}, {
  elo = 1900,
  lang = 'zh',
  orientation = 'white',
  white = '',
  black = '',
  format = 'landscape'
} = {}) {
  const fmt = SHARE_CARD_FORMATS[format] ? format : 'landscape';
  const dimensions = SHARE_CARD_FORMATS[fmt];
  const fen = move?.fenBefore || move?.fen || ChessBoard.INITIAL_FEN;
  const board = parseFenBoard(fen);
  const side = move?.turn || board.turn;
  const moveNum = Number.isFinite(move?.moveNumber) ? `${move.moveNumber}${side === 'w' ? '. ' : '… '}` : '';

  const playedSan = move?.san || move?.playedSan || '';
  const bestSan = move?.verifiedBestSan || move?.bestSan || '';
  const bestUci = move?.verifiedBestUci || move?.bestUci || '';
  const playedUci = move?.uci || move?.playedUci || '';
  const maiaTopUci = move?.maiaTopUci || '';
  const maiaTopSan = move?.maiaTopSan || '';
  const playedMatchesBest = !!(bestUci && playedUci ? playedUci === bestUci : bestSan && playedSan && playedSan === bestSan);
  const useMaiaDivergence = playedMatchesBest && !!((maiaTopUci && maiaTopUci !== bestUci) || (maiaTopSan && maiaTopSan !== bestSan));

  const humanSan = useMaiaDivergence ? maiaTopSan : (playedSan || maiaTopSan);
  const humanUci = useMaiaDivergence ? maiaTopUci : (playedUci || maiaTopUci);
  const rawProb = useMaiaDivergence
    ? (Number.isFinite(move?.maiaTopRawProb) ? move.maiaTopRawProb * 100 : (Number.isFinite(move?.maiaTopProb) ? move.maiaTopProb : null))
    : (Number.isFinite(move?.humanRawProbability) ? move.humanRawProbability * 100 : (Number.isFinite(move?.humanProbability) ? move.humanProbability : null));
  const probStr = Number.isFinite(rawProb) ? `${rawProb.toFixed(1)}%` : null;

  let headline = '';
  if (lang === 'en') {
    if (probStr && humanSan && bestSan && humanSan !== bestSan) {
      headline = `${elo} Elo: ${probStr} play ${humanSan} — Stockfish plays ${bestSan}`;
    } else if (bestSan && humanSan && humanSan !== bestSan) {
      headline = `${moveNum}Stockfish plays ${bestSan} instead of ${humanSan}`;
    } else if (bestSan) {
      headline = `${moveNum}Engine best: ${bestSan}`;
    } else {
      headline = `${elo} Elo intuition comparison`;
    }
  } else {
    if (probStr && humanSan && bestSan && humanSan !== bestSan) {
      headline = `${elo} Elo：${probStr} 会走 ${humanSan} — Stockfish 推荐 ${bestSan}`;
    } else if (bestSan && humanSan && humanSan !== bestSan) {
      headline = `${moveNum}Stockfish 推荐 ${bestSan}（${useMaiaDivergence ? 'Maia 首选' : '实战'} ${humanSan}）`;
    } else if (bestSan) {
      headline = `${moveNum}引擎首选 ${bestSan}`;
    } else {
      headline = `${elo} Elo 棋局直觉对比`;
    }
  }

  const kind = intuitionKind(move);
  const badgeMap = {
    beyond: lang === 'en' ? 'Beyond Intuition' : '突破直觉',
    precise: lang === 'en' ? 'Precise Intuition' : '精准直觉',
    trap: lang === 'en' ? 'Intuition Trap' : '直觉陷阱',
    divergence: lang === 'en' ? 'Engine vs Maia' : '人机分歧'
  };
  const badge = badgeMap[kind] || badgeMap.divergence;

  const lossPawns = Number.isFinite(move?.verifiedLossCp)
    ? (move.verifiedLossCp / 100).toFixed(2)
    : (Number.isFinite(move?.lossCp) ? (Math.max(0, move.lossCp) / 100).toFixed(2) : null);
  const cleanWhite = String(white || '').replace(/^⚪\s*/, '').trim();
  const cleanBlack = String(black || '').replace(/^⚫\s*/, '').trim();
  const players = cleanWhite && cleanBlack ? `${cleanWhite} vs ${cleanBlack}` : '';
  const lossLabel = lossPawns && Number(lossPawns) > 0
    ? (lang === 'en' ? `Δ -${lossPawns} pawns` : `损耗 -${lossPawns} 兵`)
    : '';
  const subline = [moveNum ? `${moveNum}${playedSan}`.trim() : '', lossLabel, players].filter(Boolean).join(' · ');

  const arrows = [];
  const bestSq = parseUciSquares(bestUci);
  if (bestSq) {
    arrows.push({ role: 'engine', color: '#3b82f6', ...bestSq, label: bestSan });
  }
  const humanSq = parseUciSquares(humanUci);
  if (humanSq && (!bestSq || humanSq.from !== bestSq.from || humanSq.to !== bestSq.to)) {
    arrows.push({ role: 'human', color: '#f59e0b', ...humanSq, label: humanSan });
  }

  return {
    format: fmt,
    dimensions,
    fen,
    board,
    orientation: orientation === 'black' ? 'black' : 'white',
    elo,
    lang,
    badge,
    headline,
    subline,
    bestSan,
    playedSan,
    humanSan,
    useMaiaDivergence,
    maiaSan: maiaTopSan || playedSan,
    arrows,
    watermark: '4chess.cc · Diverge'
  };
}

let cachedPieceImages = null;
async function getPieceImages() {
  if (cachedPieceImages) return cachedPieceImages;
  if (typeof Image === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return {};
  const entries = await Promise.all(
    Object.entries(CHESS_PIECES_SVG).map(([sym, svg]) => new Promise(resolve => {
      try {
        const squareSvg = svg.replace('width="100%" height="100%"', 'width="128" height="128"');
        const blob = new Blob([squareSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve([sym, img]); };
        img.onerror = () => { URL.revokeObjectURL(url); resolve([sym, null]); };
        img.src = url;
      } catch {
        resolve([sym, null]);
      }
    }))
  );
  cachedPieceImages = Object.fromEntries(entries);
  return cachedPieceImages;
}

function squareCoords(square, orientation, boardX, boardY, sqSize) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const col = orientation === 'black' ? (7 - file) : file;
  const row = orientation === 'black' ? (rank - 1) : (8 - rank);
  return {
    x: boardX + col * sqSize,
    y: boardY + row * sqSize,
    cx: boardX + (col + 0.5) * sqSize,
    cy: boardY + (row + 0.5) * sqSize
  };
}

function drawCanvasArrow(ctx, fromPt, toPt, color, sqSize, studio) {
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = sqSize * (studio ? 0.36 : 0.34);
  const headWidth = sqSize * (studio ? 0.44 : 0.28);
  const startOffset = sqSize * (studio ? 0.12 : 0.14);
  const endOffset = studio ? headLen : headLen * 0.72;

  const sx = fromPt.x + ux * startOffset;
  const sy = fromPt.y + uy * startOffset;
  const ex = toPt.x - ux * endOffset;
  const ey = toPt.y - uy * endOffset;

  ctx.save();
  ctx.globalAlpha = studio ? 0.84 : 0.88;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = studio ? sqSize * 0.14 : Math.max(6, sqSize * 0.13);
  ctx.lineCap = studio ? 'butt' : 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  const inset = studio ? 0 : sqSize * 0.08;
  const tipX = toPt.x - ux * inset;
  const tipY = toPt.y - uy * inset;
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  const perpX = -uy * (headWidth / 2);
  const perpY = ux * (headWidth / 2);

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + perpX, baseY + perpY);
  ctx.lineTo(baseX - perpX, baseY - perpY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function wrapTextLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/(\s+)/);
  const lines = [];
  let current = '';
  for (const token of words) {
    const test = current + token;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else if (!current) {
      for (const ch of token) {
        if (ctx.measureText(current + ch).width <= maxWidth) current += ch;
        else { if (current) lines.push(current.trimEnd()); current = ch; }
      }
    } else {
      lines.push(current.trimEnd());
      current = token.trimStart();
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines;
}

export async function prepareShareBoards() { return getPieceImages(); }

export function readStudioShareBoard(host) {
  if (!host) return null;
  const probe = host.ownerDocument.createElement('span');
  probe.hidden = true;
  host.append(probe);
  const view = host.ownerDocument.defaultView;
  try {
    const color = name => {
      probe.style.color = `var(${name})`;
      return view.getComputedStyle(probe).color;
    };
    const coordinate = host.querySelector('.coord');
    return {
      light: color('--board-light'), dark: color('--board-dark'),
      frame: color('--dg-surface'), stockfish: color('--dg-blue'),
      maia: color('--dg-gold'), played: color('--dg-red'),
      coordinate: coordinate ? view.getComputedStyle(coordinate).color : color('--dg-ink')
    };
  } finally {
    probe.remove();
  }
}

export function drawShareBoard(ctx, spec, pieceImages, boardX, boardY, boardSize) {
  ctx.save();
  const sqSize = boardSize / 8;

  const theme = spec.theme;
  if (theme) {
    ctx.fillStyle = theme.frame;
    ctx.beginPath();
    ctx.roundRect(boardX - 5, boardY - 5, boardSize + 10, boardSize + 10, boardSize * .024 + 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(boardX, boardY, boardSize, boardSize, boardSize * .024);
    ctx.clip();
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(boardX - 6, boardY - 6, boardSize + 12, boardSize + 12);
  }

  // Squares
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      ctx.fillStyle = isLight ? (theme?.light || '#f0d9b5') : (theme?.dark || '#b58863');
      ctx.fillRect(boardX + col * sqSize, boardY + row * sqSize, sqSize, sqSize);
    }
  }

  // Coordinates
  ctx.font = `600 ${Math.round(sqSize * 0.18)}px system-ui, -apple-system, sans-serif`;
  for (let i = 0; i < 8; i++) {
    const rankLabel = spec.orientation === 'black' ? String(i + 1) : String(8 - i);
    const fileLabel = spec.orientation === 'black' ? String.fromCharCode(104 - i) : String.fromCharCode(97 + i);
    ctx.fillStyle = theme?.coordinate || (i % 2 === 0 ? '#926745' : '#ebd1a7');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(rankLabel, boardX + 4, boardY + i * sqSize + 3);
    ctx.fillStyle = theme?.coordinate || (i % 2 === 0 ? '#ebd1a7' : '#926745');
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fileLabel, boardX + (i + 1) * sqSize - 4, boardY + boardSize - 3);
  }

  // Pieces
  for (const item of spec.board.pieces) {
    const pos = squareCoords(item.square, spec.orientation, boardX, boardY, sqSize);
    const img = pieceImages[item.piece];
    if (img) {
      const pad = sqSize * (theme ? 0.05 : 0.04);
      ctx.drawImage(img, pos.x + pad, pos.y + pad, sqSize - pad * 2, sqSize - pad * 2);
    } else {
      ctx.fillStyle = item.piece === item.piece.toUpperCase() ? '#ffffff' : '#111827';
      ctx.font = `${Math.round(sqSize * 0.72)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(UNICODE_PIECES[item.piece] || '', pos.cx, pos.cy);
    }
  }

  // Arrows
  for (const arrow of spec.arrows) {
    const fromPos = squareCoords(arrow.from, spec.orientation, boardX, boardY, sqSize);
    const toPos = squareCoords(arrow.to, spec.orientation, boardX, boardY, sqSize);
    drawCanvasArrow(ctx, { x: fromPos.cx, y: fromPos.cy }, { x: toPos.cx, y: toPos.cy }, arrow.color, sqSize, Boolean(theme));
  }
  ctx.restore();
}

export async function renderShareCardCanvas(spec, canvas, { isCurrent = () => true } = {}) {
  if (!canvas) return canvas;
  const pieceImages = await getPieceImages();
  if (!isCurrent()) return null;
  const { width, height } = spec.dimensions;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const isPortrait = spec.format === 'portrait';

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle border frame
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Board geometry
  const boardSize = isPortrait ? 860 : 576;
  const boardX = isPortrait ? Math.round((width - boardSize) / 2) : 48;
  const boardY = isPortrait ? 310 : Math.round((height - boardSize) / 2);
  drawShareBoard(ctx, spec, pieceImages, boardX, boardY, boardSize);

  // Text panel
  const textX = isPortrait ? boardX : boardX + boardSize + 44;
  const textY = isPortrait ? 64 : boardY + 12;
  const textWidth = isPortrait ? boardSize : width - textX - 48;

  // Badge pill
  ctx.font = '700 20px system-ui, -apple-system, sans-serif';
  const badgeW = ctx.measureText(spec.badge).width + 32;
  ctx.fillStyle = 'rgba(59, 130, 246, 0.22)';
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(textX, textY, badgeW, 38, 19);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#93c5fd';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.badge, textX + 16, textY + 19);

  // Headline
  const headlineY = textY + 62;
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 ${isPortrait ? 38 : 34}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'top';
  const lines = wrapTextLines(ctx, spec.headline, textWidth).slice(0, 3);
  const lineH = isPortrait ? 50 : 46;
  lines.forEach((line, idx) => ctx.fillText(line, textX, headlineY + idx * lineH));

  // Subline
  if (spec.subline) {
    const subY = headlineY + lines.length * lineH + 16;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 22px system-ui, -apple-system, sans-serif';
    const subLines = wrapTextLines(ctx, spec.subline, textWidth).slice(0, 2);
    subLines.forEach((line, idx) => ctx.fillText(line, textX, subY + idx * 30));
  }

  // Legend pills
  const legendY = isPortrait ? boardY + boardSize + 38 : height - 138;
  let legendX = textX;
  const humanLegendLabel = spec.useMaiaDivergence
    ? (spec.lang === 'en' ? 'Maia' : 'Maia 首选')
    : (spec.lang === 'en' ? 'Human / Played' : '人类 / 实战');
  const legendItems = [
    spec.bestSan ? { color: '#3b82f6', text: `Stockfish: ${spec.bestSan}` } : null,
    spec.humanSan ? { color: '#f59e0b', text: `${humanLegendLabel}: ${spec.humanSan}` } : null
  ].filter(Boolean);

  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  for (const item of legendItems) {
    const pillW = ctx.measureText(item.text).width + 44;
    if (legendX + pillW > textX + textWidth && legendX > textX) {
      break;
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.roundRect(legendX, legendY, pillW, 40, 10);
    ctx.fill();
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(legendX + 18, legendY + 20, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.text, legendX + 34, legendY + 20);
    legendX += pillW + 14;
  }

  // Watermark
  ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = isPortrait ? 'center' : 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(spec.watermark, isPortrait ? width / 2 : textX, height - 38);

  return canvas;
}

export class ShareCardModal {
  format = 'landscape';
  openGeneration = 0;
  renderGeneration = 0;
  exportGeneration = 0;
  currentMove = null;
  currentContext = {};

  constructor(app) {
    this.app = app;
    this.dialog = document.getElementById('share-card-dialog');
    this.closeBtn = document.getElementById('btn-close-share-card');
    this.canvas = document.getElementById('share-card-canvas');
    this.formatButtons = [...document.querySelectorAll('#share-card-dialog [data-share-format]')];
    this.btnCopy = document.getElementById('btn-share-card-copy');
    this.btnDownload = document.getElementById('btn-share-card-download');
    this.statusEl = document.getElementById('share-card-status');
    this.bindEvents();
  }

  allowed() {
    return !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
  }

  bindEvents() {
    if (this.closeBtn) this.closeBtn.onclick = () => this.close();
    if (this.dialog) {
      this.dialog.addEventListener('click', event => {
        if (event.target === this.dialog) {
          const rect = this.dialog.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            this.close();
          }
        }
      });
      this.dialog.addEventListener('cancel', () => {
        this.openGeneration++;
        this.renderGeneration++;
        this.exportGeneration++;
      });
      this.dialog.addEventListener('close', () => {
        this.openGeneration++;
        this.renderGeneration++;
        this.exportGeneration++;
      });
    }
    for (const btn of this.formatButtons) {
      btn.onclick = () => {
        this.format = btn.dataset.shareFormat === 'portrait' ? 'portrait' : 'landscape';
        this.renderPreview();
      };
    }
    if (this.btnCopy) this.btnCopy.onclick = () => this.copyImage();
    if (this.btnDownload) this.btnDownload.onclick = () => this.downloadPng();
  }

  async open(move, context = {}) {
    if (!this.allowed() || !this.dialog || !move) return;
    const gen = ++this.openGeneration;
    this.renderGeneration++;
    this.exportGeneration++;
    this.currentMove = move;
    this.currentContext = context;
    if (this.statusEl) this.statusEl.textContent = '';
    await this.renderPreview();
    if (!this.allowed() || gen !== this.openGeneration) return;
    if (!this.dialog.open) this.dialog.showModal();
    this.closeBtn?.focus();
  }

  close() {
    this.openGeneration++;
    this.renderGeneration++;
    this.exportGeneration++;
    if (this.dialog?.open) this.dialog.close();
  }

  async renderPreview() {
    const renderGen = ++this.renderGeneration;
    for (const btn of this.formatButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.shareFormat === this.format));
    }
    if (!this.currentMove || !this.canvas) return;
    const spec = buildShareCardSpec(this.currentMove, {
      elo: this.currentContext.elo || this.app.currentElo || 1900,
      lang: getLang(),
      orientation: this.app.boardUI?.orientation || 'white',
      white: this.currentContext.white || this.app.el?.metaWhite?.textContent || '',
      black: this.currentContext.black || this.app.el?.metaBlack?.textContent || '',
      format: this.format
    });
    await renderShareCardCanvas(spec, this.canvas, { isCurrent: () => renderGen === this.renderGeneration && this.allowed() });
  }

  async downloadPng() {
    if (!this.allowed() || !this.canvas || !this.dialog?.open) return;
    const gen = this.exportGeneration;
    const format = this.format;
    const moveNum = this.currentMove?.moveNumber || 'pos';
    const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
    if (!blob || !this.allowed() || gen !== this.exportGeneration || !this.dialog?.open) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diverge-move-${moveNum}-${format}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (this.statusEl) this.statusEl.textContent = t('shareCardDownloaded');
  }

  async copyImage() {
    if (!this.allowed() || !this.canvas || !this.dialog?.open) return;
    const gen = this.exportGeneration;
    try {
      const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
      if (!blob || !this.allowed() || gen !== this.exportGeneration || !this.dialog?.open) return;
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        if (this.statusEl) this.statusEl.textContent = t('shareCardCopyUnsupported');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      if (this.statusEl) this.statusEl.textContent = t('shareCardCopied');
    } catch {
      if (this.statusEl) this.statusEl.textContent = t('shareCardCopyUnsupported');
    }
  }
}
