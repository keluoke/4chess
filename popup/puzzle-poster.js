import { CHESS_PIECES_SVG } from '../analysis/chess-pieces.js';
import { ChessBoard } from '../engine/chess-core.js';

const WIDTH = 1080;
const HEIGHT = 1440;
const DEFAULT_BRIDGE_ENDPOINT = 'http://127.0.0.1:3210/api/share/code';
const DEFAULT_BRIDGE_TOKEN = '';

function text(ctx, value, x, y, size, color = '#253c33', weight = 'normal', align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function svgToImage(svgStr) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('棋子矢量素材加载失败'));
    };
    img.src = url;
  });
}

let cachedPieceImages = null;
async function getPieceImages() {
  if (cachedPieceImages) return cachedPieceImages;
  const entries = await Promise.all(
    Object.keys(CHESS_PIECES_SVG).map(async (key) => {
      const img = await svgToImage(CHESS_PIECES_SVG[key]);
      return [key, img];
    })
  );
  cachedPieceImages = Object.fromEntries(entries);
  return cachedPieceImages;
}

/**
 * Fetch official Mini Program WxaCode from local bridge service.
 * Strictly no fallback to regular QR: Version 1 only allows real mini-program sunflower codes.
 */
async function fetchMiniProgramSunflowerCode(fen, flipped) {
  const local = await chrome.storage.local.get(['miniProgramCodeEndpoint', 'miniProgramCodeToken']);
  const endpoint = local.miniProgramCodeEndpoint || DEFAULT_BRIDGE_ENDPOINT;
  const token = local.miniProgramCodeToken || DEFAULT_BRIDGE_TOKEN;
  const target = new URL(endpoint);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '3210') throw new Error('分享服务仅允许本机 localhost:3210。');

  if (!token) throw new Error('请先设置本地分享服务令牌 miniProgramCodeToken，再生成海报。');
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ fen, flipped: flipped === true }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (primaryErr) {
    console.warn('[Puzzle Poster] Primary fetch failed, trying localhost fallback...', primaryErr);
    // If 127.0.0.1 was used and failed, try localhost as fallback
    if (endpoint.includes('127.0.0.1')) {
      const fallbackUrl = endpoint.replace('127.0.0.1', 'localhost');
      try {
        res = await fetch(fallbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ fen, flipped: flipped === true }),
          signal: AbortSignal.timeout(8000)
        });
      } catch (fallbackErr) {
        console.error('[Puzzle Poster] Fallback fetch also failed:', fallbackErr);
        throw new Error(`无法连接本地桥接服务 (http://127.0.0.1:3210)。请确认：1. 终端正在运行 node scripts/share-service.mjs；2. 在 chrome://extensions 中点击了“重新加载”插件以更新网络权限 (${primaryErr.message || primaryErr})`);
      }
    } else {
      console.error('[Puzzle Poster] Fetch failed:', primaryErr);
      throw new Error(`无法连接本地桥接服务 (${endpoint})。请确认服务运行正常并在 chrome://extensions 重新加载插件 (${primaryErr.message || primaryErr})`);
    }
  }

  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`本地服务响应格式异常 (${res.status})`);
  }

  if (!res.ok || !data.ok || !data.dataUrl) {
    throw new Error(data.error || `获取小程序码失败 (${res.status})`);
  }

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('小程序码图像解码失败'));
    img.src = data.dataUrl;
  });

  return { img, token: data.token };
}

/**
 * Render the full 1080x1440 Poster onto a Canvas
 */
export async function renderPuzzlePoster(canvas, { fen, orientation = 'white' }) {
  const chess = new ChessBoard();
  if (!chess.load(fen)) {
    throw new Error('无效的棋局 FEN，无法生成海报');
  }

  const isFlipped = orientation === 'black';
  const files = isFlipped ? 'hgfedcba' : 'abcdefgh';
  const ranks = isFlipped ? '12345678' : '87654321';

  // 1. Fetch real mini program sunflower code first (Fail-fast before drawing canvas)
  const codeResult = await fetchMiniProgramSunflowerCode(fen, isFlipped);
  const codeImg = codeResult.img;

  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#f8f6f0';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Brand Header
  text(ctx, '棋谜', 76, 100, 44, '#284b3d', '600');
  text(ctx, '每一步，都藏着一个谜。', 205, 98, 26, '#72816b');

  // Challenge Headline
  text(ctx, '这一步，你会怎么走？', 76, 205, 62, '#253c33', '600');

  // Turn prompt
  const turnText = (chess.turn === 'w' ? '白方先走' : '黑方先走') + '  ·  先想一想，再看答案';
  text(ctx, turnText, 78, 263, 29, '#6f7d66');

  // 8x8 Board
  const bx = 108;
  const by = 320;
  const cell = 108;

  const pieceImages = await getPieceImages();

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#9eb087' : '#eeeee0';
      ctx.fillRect(bx + col * cell, by + row * cell, cell, cell);

      const sq = files[col] + ranks[row];
      const p = chess.getPiece(sq);
      if (p) {
        const key = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();
        const pieceImg = pieceImages[key];
        if (pieceImg) {
          ctx.drawImage(pieceImg, bx + col * cell + 10, by + row * cell + 10, 88, 88);
        }
      }
    }
  }

  // Outer border
  ctx.strokeStyle = '#c6d0ba';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, 864, 864);

  // Coordinate Labels
  ctx.textAlign = 'center';
  ctx.fillStyle = '#748268';
  ctx.font = '24px "PingFang SC", sans-serif';
  for (let i = 0; i < 8; i++) {
    ctx.fillText(files[i], bx + (i + 0.5) * cell, by + 894);
    ctx.fillText(ranks[i], bx - 26, by + (i + 0.56) * cell);
  }

  // Divider Line
  ctx.strokeStyle = '#dce2d3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(76, 1250);
  ctx.lineTo(1004, 1250);
  ctx.stroke();

  // Footer text
  text(ctx, '把好棋，留给朋友一起想。', 76, 1320, 32, '#284b3d', '500');
  text(ctx, '微信扫码打开这道题 · 也可以拍下你的棋图', 76, 1373, 24, '#77866e');

  // White Card for Code
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(820, 1258, 184, 176);

  // Draw real WxaCode
  ctx.drawImage(codeImg, 836, 1266, 152, 152);

  return canvas;
}

export function closePosterModal() {
  const modal = document.getElementById('poster-modal');
  if (modal) modal.hidden = true;
}

window.addEventListener('scan-lock', closePosterModal);

/**
 * Open the interactive poster modal in popup
 */
export async function openPosterModal({ fen, orientation = 'white' }) {
  let modal = document.getElementById('poster-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'poster-modal';
    modal.className = 'poster-modal-backdrop';
    modal.innerHTML = `
      <div class="poster-modal-dialog">
        <div class="poster-modal-header">
          <h3>♟️ 棋谜分享海报 (动态小程序码)</h3>
          <button id="poster-close-btn" class="scan-icon" aria-label="关闭">&times;</button>
        </div>
        <div class="poster-modal-body">
          <div id="poster-loading" class="poster-loading">正在向微信请求真实小程序码...</div>
          <div id="poster-error-box" class="poster-error-box" style="display:none;">
            <p id="poster-error-msg"></p>
            <button id="poster-retry-btn" class="action-secondary">🔄 重试生成</button>
          </div>
          <img id="poster-preview-img" alt="棋谜海报预览" style="display:none;" />
        </div>
        <div class="poster-modal-footer">
          <button id="poster-copy-btn" class="action-secondary" disabled>📋 复制图片</button>
          <button id="poster-save-btn" class="action-primary" disabled>💾 保存海报</button>
        </div>
        <p id="poster-hint" class="poster-hint">微信扫码直达小程序题面 · 动态唯一局面对题</p>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#poster-close-btn').onclick = closePosterModal;
    modal.onclick = (e) => { if (e.target === modal) closePosterModal(); };
  }

  modal.hidden = false;
  const loading = modal.querySelector('#poster-loading');
  const errorBox = modal.querySelector('#poster-error-box');
  const errorMsg = modal.querySelector('#poster-error-msg');
  const retryBtn = modal.querySelector('#poster-retry-btn');
  const previewImg = modal.querySelector('#poster-preview-img');
  const copyBtn = modal.querySelector('#poster-copy-btn');
  const saveBtn = modal.querySelector('#poster-save-btn');

  const executeRender = async () => {
    loading.style.display = 'block';
    loading.textContent = '正在向微信请求真实小程序码...';
    errorBox.style.display = 'none';
    previewImg.style.display = 'none';
    copyBtn.disabled = true;
    saveBtn.disabled = true;

    try {
      const canvas = document.createElement('canvas');
      await renderPuzzlePoster(canvas, { fen, orientation });

      canvas.toBlob((blob) => {
        if (!blob) throw new Error('导出图片失败');
        const url = URL.createObjectURL(blob);
        previewImg.src = url;
        previewImg.onload = () => {
          loading.style.display = 'none';
          previewImg.style.display = 'block';
          copyBtn.disabled = false;
          saveBtn.disabled = false;
        };

        // Copy to clipboard
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            const orig = copyBtn.textContent;
            copyBtn.textContent = '✅ 已复制到剪贴板！';
            setTimeout(() => { copyBtn.textContent = orig; }, 2000);
          } catch (err) {
            copyBtn.textContent = '❌ 复制失败，请点击保存';
            setTimeout(() => { copyBtn.textContent = '📋 复制图片'; }, 2500);
          }
        };

        // Save to disk
        saveBtn.onclick = () => {
          const a = document.createElement('a');
          a.href = url;
          const turn = fen.split(' ')[1] || 'w';
          a.download = `qimi-puzzle-${turn}-${Date.now()}.png`;
          a.click();
        };
      }, 'image/png');
    } catch (err) {
      loading.style.display = 'none';
      errorBox.style.display = 'block';
      errorMsg.textContent = err.message;
    }
  };

  retryBtn.onclick = executeRender;
  await executeRender();
}
