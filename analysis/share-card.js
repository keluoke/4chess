import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { intuitionKind } from '../engine/review-policy.js?v=20261117-review-policy';
import { BOARD_ARROW } from '../ui/board-visuals.js?v=20261124-divergence-cards';
import { CHESS_PIECES_SVG } from './chess-pieces.js';
import { getLang, t } from './i18n.js?v=20261124-review-navigation';
import { canvasPng, drawShareQr, shareQr, SHARE_PAPER } from './share-export.js?v=20261124-divergence-cards';

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
  format = 'landscape',
  theme
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
  const usesMaia = useMaiaDivergence || !(playedUci || playedSan);

  const humanSan = usesMaia ? maiaTopSan : playedSan;
  const humanUci = usesMaia ? maiaTopUci : playedUci;
  const rawProb = usesMaia
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
      headline = `${moveNum}Stockfish 推荐 ${bestSan}（${usesMaia ? 'Maia 首选' : '实战'} ${humanSan}）`;
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
    arrows.push({ role: 'stockfish', ...bestSq, label: bestSan });
  }
  const humanSq = parseUciSquares(humanUci);
  if (humanSq && (!bestSq || humanSq.from !== bestSq.from || humanSq.to !== bestSq.to)) {
    arrows.push({ role: usesMaia ? 'maia' : 'played', ...humanSq, label: humanSan });
  }

  return {
    format: fmt,
    dimensions,
    fen,
    board,
    theme,
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

function drawCanvasArrow(ctx, fromPt, toPt, color, sqSize) {
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const len = Math.hypot(dx, dy);
  if (!len) return;
  const ux = dx / len;
  const uy = dy / len;
  const scale = sqSize / 100;
  const { length, width, stroke } = BOARD_ARROW.primary;
  const sx = fromPt.x + ux * BOARD_ARROW.start * scale;
  const sy = fromPt.y + uy * BOARD_ARROW.start * scale;
  const ex = toPt.x - ux * length * scale;
  const ey = toPt.y - uy * length * scale;
  const perpX = -uy * width * scale / 2;
  const perpY = ux * width * scale / 2;

  ctx.save();
  ctx.globalAlpha = BOARD_ARROW.opacity;
  ctx.fillStyle = color;
  // Fill the shaft and head together so their shared edge has the same opacity.
  const halfShaft = stroke * scale / 2;
  const shaftX = -uy * halfShaft, shaftY = ux * halfShaft;
  ctx.beginPath();
  ctx.moveTo(sx + shaftX, sy + shaftY);
  ctx.lineTo(ex + shaftX, ey + shaftY);
  ctx.lineTo(ex + perpX, ey + perpY);
  ctx.lineTo(toPt.x, toPt.y);
  ctx.lineTo(ex - perpX, ey - perpY);
  ctx.lineTo(ex - shaftX, ey - shaftY);
  ctx.lineTo(sx - shaftX, sy - shaftY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function wrapTextLines(ctx, text, maxWidth) {
  const lines = [];
  let current = '';
  for (const token of String(text || '').trim().split(/(\s+)/)) {
    if (ctx.measureText(current + token).width <= maxWidth) {
      current += token;
      continue;
    }
    if (current.trim()) lines.push(current.trimEnd());
    current = '';
    for (const ch of token.trimStart()) {
      if (ctx.measureText(current + ch).width > maxWidth && current) {
        lines.push(current);
        current = '';
      }
      current += ch;
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines;
}

export async function prepareShareBoards() { return getPieceImages(); }

const defaultBoardTheme = {
  light: '#e8eee7', dark: '#9caf9f', frame: '#ffffff', coordinate: '#284634',
  stockfish: '#2e6086', maia: '#966033', played: '#b94950'
};

export function readStudioShareBoard(host) {
  if (!host?.isConnected) return defaultBoardTheme;
  const probe = host.ownerDocument.createElement('span');
  probe.hidden = true;
  // Share images use light paper, including when the workbench is dark.
  probe.style.colorScheme = 'only light';
  host.append(probe);
  const view = host.ownerDocument.defaultView;
  try {
    const color = name => {
      probe.style.color = `var(${name})`;
      return view.getComputedStyle(probe).color;
    };
    return {
      light: color('--board-light'), dark: color('--board-dark'),
      frame: color('--dg-surface'), stockfish: color('--dg-blue'),
      maia: color('--dg-gold'), played: color('--dg-red'),
      coordinate: defaultBoardTheme.coordinate
    };
  } finally {
    probe.remove();
  }
}

export function drawShareBoard(ctx, spec, pieceImages, boardX, boardY, boardSize) {
  ctx.save();
  const sqSize = boardSize / 8;

  const theme = spec.theme || defaultBoardTheme;
  ctx.fillStyle = theme.frame;
  ctx.beginPath();
  ctx.roundRect(boardX - 5, boardY - 5, boardSize + 10, boardSize + 10, boardSize * .024 + 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(boardX, boardY, boardSize, boardSize, boardSize * .024);
  ctx.clip();

  // Squares
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      ctx.fillStyle = isLight ? theme.light : theme.dark;
      ctx.fillRect(boardX + col * sqSize, boardY + row * sqSize, sqSize, sqSize);
    }
  }

  // Coordinates
  ctx.font = `600 ${Math.round(sqSize * 0.18)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = theme.coordinate;
  for (let i = 0; i < 8; i++) {
    const rankLabel = spec.orientation === 'black' ? String(i + 1) : String(8 - i);
    const fileLabel = spec.orientation === 'black' ? String.fromCharCode(104 - i) : String.fromCharCode(97 + i);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(rankLabel, boardX + 4, boardY + i * sqSize + 3);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fileLabel, boardX + (i + 1) * sqSize - 4, boardY + boardSize - 3);
  }

  // Pieces
  for (const item of spec.board.pieces) {
    const pos = squareCoords(item.square, spec.orientation, boardX, boardY, sqSize);
    const img = pieceImages[item.piece];
    if (img) {
      const pad = sqSize * 0.05;
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
    drawCanvasArrow(ctx, { x: fromPos.cx, y: fromPos.cy }, { x: toPos.cx, y: toPos.cy }, theme[arrow.role], sqSize);
  }
  ctx.restore();
}

function moveShareUrl(spec) {
  if (!new ChessBoard(spec.fen).isValid) return null;
  const params = new URLSearchParams({
    fen: spec.fen, orientation: spec.orientation, lang: spec.lang, elo: spec.elo
  });
  return 'https://4chess.cc/analysis/#' + params.toString().replaceAll('%2F', '/');
}

const legendRowHeight = 34;
const legendGap = 9;

function drawShareLegend(ctx, spec, theme, x, y, width) {
  const roles = { stockfish: 'Stockfish', maia: 'Maia', played: t('snapshotPlayed') };
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  let left = x;
  for (const { role, label } of spec.arrows) {
    if (!label) continue;
    const text = roles[role] + ' · ' + label;
    const itemWidth = Math.min(width, ctx.measureText(text).width + 43);
    if (left > x && left + itemWidth > x + width) {
      left = x;
      y += legendRowHeight + legendGap;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(left, y, itemWidth, legendRowHeight, 8);
    ctx.fill();
    ctx.fillStyle = theme[role];
    ctx.beginPath();
    ctx.arc(left + 16, y + legendRowHeight / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SHARE_PAPER.ink;
    ctx.fillText(text, left + 28, y + legendRowHeight / 2, itemWidth - 35);
    left += itemWidth + legendGap;
  }
}

export async function renderShareCardCanvas(spec, canvas, { isCurrent = () => true } = {}) {
  if (!canvas) return null;
  const pieceImages = await prepareShareBoards();
  if (!isCurrent()) return null;
  const { width, height } = spec.dimensions;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { paper, line, green, ink, muted } = SHARE_PAPER;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(18, 18, width - 36, height - 36, 22);
  ctx.stroke();

  const portrait = spec.format === 'portrait';
  const theme = spec.theme || defaultBoardTheme;
  const boardSize = portrait ? 770 : 568;
  const boardX = portrait ? (width - boardSize) / 2 : 48;
  const boardY = portrait ? 318 : Math.round((height - boardSize) / 2);
  drawShareBoard(ctx, { ...spec, theme }, pieceImages, boardX, boardY, boardSize);
  const textX = portrait ? boardX : boardX + boardSize + 40;
  const top = portrait ? 46 : 64;
  const textWidth = portrait ? boardSize : width - textX - 48;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = green;
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText(spec.badge, textX, top, textWidth);

  const headlineY = top + 44;
  const lineHeight = portrait ? 52 : 45;
  ctx.fillStyle = ink;
  ctx.font = `700 ${portrait ? 43 : 37}px system-ui, sans-serif`;
  const lines = wrapTextLines(ctx, spec.headline, textWidth).slice(0, 3);
  lines.forEach((text, index) => ctx.fillText(text, textX, headlineY + index * lineHeight));

  if (spec.subline) {
    const subtitleY = headlineY + lines.length * lineHeight + 9;
    ctx.fillStyle = muted;
    ctx.font = '500 22px system-ui, sans-serif';
    const sublines = wrapTextLines(ctx, spec.subline, textWidth).slice(0, 2);
    sublines.forEach((text, index) => ctx.fillText(text, textX, subtitleY + index * 28));
  }

  const url = moveShareUrl(spec);
  // Larger modules survive the downscaling used by chat apps.
  const qrSize = 230;
  const qrRight = textX + textWidth;
  const qrTop = height - (portrait ? 252 : 265);
  const footerY = portrait ? height - 94 : height - 124;
  const legendY = portrait ? boardY + boardSize + 21 : url ? qrTop - (2 * legendRowHeight + legendGap + 12) : 360;
  drawShareLegend(ctx, spec, theme, textX, legendY, textWidth - (portrait && url ? qrSize + 25 : 0));

  const footerWidth = textWidth - (url ? qrSize + 20 : 0);
  if (url) drawShareQr(ctx, shareQr(url), qrRight, qrTop, qrSize);
  ctx.textBaseline = 'top';
  ctx.fillStyle = green;
  ctx.font = '650 22px system-ui, sans-serif';
  if (url) ctx.fillText(t('shareCardScanPosition'), textX, footerY, footerWidth);
  ctx.fillStyle = muted;
  ctx.font = '550 19px system-ui, sans-serif';
  ctx.fillText(spec.watermark, textX, footerY + 32, footerWidth);
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
    this.exportGeneration++;
    this.btnCopy.disabled = this.btnDownload.disabled = true;
    const orientation = this.app.boardUI?.orientation || (parseFenBoard(this.currentMove.fenBefore || this.currentMove.fen).turn === 'b' ? 'black' : 'white');
    const spec = buildShareCardSpec(this.currentMove, {
      elo: this.currentContext.elo || this.app.currentElo || 1900,
      lang: getLang(),
      orientation,
      white: this.currentContext.white || this.app.el?.metaWhite?.textContent || '',
      black: this.currentContext.black || this.app.el?.metaBlack?.textContent || '',
      format: this.format,
      theme: readStudioShareBoard(document.getElementById('board-container'))
    });
    const isCurrent = () => renderGen === this.renderGeneration && this.allowed();
    const rendered = await renderShareCardCanvas(spec, this.canvas, { isCurrent });
    if (isCurrent()) this.btnCopy.disabled = this.btnDownload.disabled = !rendered;
  }

  async downloadPng() {
    if (!this.allowed() || !this.canvas || !this.dialog?.open || this.btnDownload.disabled) return;
    const gen = this.exportGeneration;
    const format = this.format;
    const moveNum = this.currentMove?.moveNumber || 'pos';
    const blob = await canvasPng(this.canvas);
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
    if (!this.allowed() || !this.canvas || !this.dialog?.open || this.btnCopy.disabled) return;
    const gen = this.exportGeneration;
    try {
      const blob = await canvasPng(this.canvas);
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
