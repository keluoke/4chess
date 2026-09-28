/**
 * Maia-3 Human Intuition Floating Panel
 * Displays:
 * 1. Current Side to Move (⚪ 白方行棋 / ⚫ 黑方行棋) - never guesses!
 * 2. Model Status & Weight Manager (ONNX Neural Engine vs Lightweight Fallback)
 * 3. One-click HuggingFace download or local .onnx loader
 * 4. Elo rating slider & Top candidate human moves with percentage bars
 */

import { ModelLoader } from '../engine/model-loader.js';

export class IntuitionPanel {
  constructor({ onEloChange, onToggleChange, onMoveHover, onModelLoaded }) {
    this.onEloChange = onEloChange;
    this.onToggleChange = onToggleChange;
    this.onMoveHover = onMoveHover;
    this.onModelLoaded = onModelLoaded;

    this.container = null;
    this.isMinimized = false;
    this.currentElo = 1500;
    this.currentData = null;
    this.currentTurn = 'w';
    this.latency = 0;

    this.showHeatmap = true;
    this.showArrows = true;
    this.opacity = 0.55;

    this.init();
  }

  init() {
    const old = document.getElementById('maia3-intuition-panel');
    if (old) old.remove();

    this.container = document.createElement('div');
    this.container.id = 'maia3-intuition-panel';
    this.container.className = 'maia-panel-root';

    const savedPos = localStorage.getItem('maia3_panel_pos');
    if (savedPos) {
      try {
        const { left, top } = JSON.parse(savedPos);
        this.container.style.left = `${left}px`;
        this.container.style.top = `${top}px`;
        this.container.style.right = 'auto';
      } catch (e) {}
    }

    this.renderSkeleton();
    document.body.appendChild(this.container);
    this.setupDraggable();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <!-- Header -->
      <div class="maia-header" id="maia-drag-handle">
        <div class="maia-title-box">
          <div class="maia-icon-glow">🧠</div>
          <span class="maia-title">Maia 3 · 人类直觉预测器</span>
        </div>
        <div class="maia-header-actions">
          <span id="maia-turn-pill" class="maia-turn-tag turn-white">⚪ 白方行棋</span>
          <button id="maia-btn-min" class="maia-btn-icon" title="最小化/展开">−</button>
        </div>
      </div>

      <!-- Main Body -->
      <div class="maia-body" id="maia-panel-body">
        <!-- Model Engine Status & Weight Manager -->
        <div class="maia-model-box">
          <div class="maia-model-header">
            <span class="maia-model-label">神经网络核心:</span>
            <span id="maia-model-badge" class="maia-badge badge-warning">🟡 离线模式 (未加载权重)</span>
          </div>

          <div id="maia-model-controls" class="maia-model-actions">
            <button id="maia-btn-download" class="maia-action-btn">
              📥 从 HuggingFace 载入 Maia-3 ONNX
            </button>
            <label class="maia-action-btn secondary">
              📂 载入本地 .onnx
              <input type="file" id="maia-file-input" accept=".onnx" style="display: none;" />
            </label>
          </div>

          <div id="maia-load-progress-box" class="maia-progress-container" style="display: none;">
            <div class="maia-progress-bar">
              <div id="maia-load-fill" class="maia-progress-fill" style="width: 0%; background-color: #10b981;"></div>
            </div>
            <span id="maia-load-text" class="maia-progress-text">准备下载...</span>
          </div>
        </div>

        <!-- Elo Selector -->
        <div class="maia-section">
          <div class="maia-section-header">
            <span class="maia-label">目标棋手等级分 (Elo)</span>
            <span id="maia-elo-val" class="maia-elo-pill">1500</span>
          </div>
          <div class="maia-elo-presets">
            <button class="maia-elo-btn" data-elo="1100">1100 (初阶)</button>
            <button class="maia-elo-btn active" data-elo="1500">1500 (中阶)</button>
            <button class="maia-elo-btn" data-elo="1900">1900 (进阶)</button>
            <button class="maia-elo-btn" data-elo="2200">2200 (大师)</button>
          </div>
          <input type="range" id="maia-elo-slider" min="600" max="2600" step="50" value="1500" class="maia-slider" />
        </div>

        <!-- Visual Toggles -->
        <div class="maia-toggles-row">
          <label class="maia-toggle-chip">
            <input type="checkbox" id="maia-chk-heatmap" checked />
            <span>🔥 意图热力图</span>
          </label>
          <label class="maia-toggle-chip">
            <input type="checkbox" id="maia-chk-arrows" checked />
            <span>🏹 直觉箭头</span>
          </label>
        </div>

        <!-- Prediction List -->
        <div class="maia-section">
          <div class="maia-section-header">
            <span id="maia-moves-header-text" class="maia-label">候选着法预测</span>
            <span id="maia-inference-time" class="maia-meta-text">Inference: -- ms</span>
          </div>
          <div id="maia-moves-container" class="maia-moves-list">
            <div class="maia-placeholder">⏳ 正在同步棋盘状态与行棋方...</div>
          </div>
        </div>

        <!-- Human Intuition Insight Card -->
        <div id="maia-insight-card" class="maia-insight-box">
          <div id="maia-insight-badge" class="maia-insight-tag">💡 直觉分析</div>
          <div id="maia-insight-text" class="maia-insight-content">
            观察棋局中，Maia 3 正在实时分析人类直觉倾向...
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Minimize / Expand
    const minBtn = this.container.querySelector('#maia-btn-min');
    const body = this.container.querySelector('#maia-panel-body');
    minBtn.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      body.style.display = this.isMinimized ? 'none' : 'block';
      minBtn.textContent = this.isMinimized ? '+' : '−';
    });

    // Elo Presets
    const eloBtns = this.container.querySelectorAll('.maia-elo-btn');
    const eloSlider = this.container.querySelector('#maia-elo-slider');
    const eloVal = this.container.querySelector('#maia-elo-val');

    eloBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        eloBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const elo = parseInt(btn.dataset.elo, 10);
        this.currentElo = elo;
        eloSlider.value = elo;
        eloVal.textContent = elo;
        if (this.onEloChange) this.onEloChange(elo);
      });
    });

    eloSlider.addEventListener('input', (e) => {
      const elo = parseInt(e.target.value, 10);
      this.currentElo = elo;
      eloVal.textContent = elo;
      eloBtns.forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.elo, 10) === elo);
      });
      if (this.onEloChange) this.onEloChange(elo);
    });

    // Toggles
    const chkHeatmap = this.container.querySelector('#maia-chk-heatmap');
    const chkArrows = this.container.querySelector('#maia-chk-arrows');

    const updateToggles = () => {
      this.showHeatmap = chkHeatmap.checked;
      this.showArrows = chkArrows.checked;
      if (this.onToggleChange) {
        this.onToggleChange({
          showHeatmap: this.showHeatmap,
          showArrows: this.showArrows,
          opacity: this.opacity
        });
      }
    };

    chkHeatmap.addEventListener('change', updateToggles);
    chkArrows.addEventListener('change', updateToggles);

    // Model Download Button (HuggingFace)
    const btnDownload = this.container.querySelector('#maia-btn-download');
    const progressBox = this.container.querySelector('#maia-load-progress-box');
    const progressFill = this.container.querySelector('#maia-load-fill');
    const progressText = this.container.querySelector('#maia-load-text');
    const modelBadge = this.container.querySelector('#maia-model-badge');

    btnDownload.addEventListener('click', async () => {
      progressBox.style.display = 'block';
      btnDownload.disabled = true;

      try {
        const hfUrl = 'https://huggingface.co/novachess/novachess-engine/resolve/main/maia3_simplified.onnx';
        await ModelLoader.downloadModelFromHuggingFace(hfUrl, 'Maia-3 (HuggingFace ONNX)', (percent, msg) => {
          progressFill.style.width = `${percent}%`;
          progressText.textContent = msg;
        });

        modelBadge.textContent = '🟢 Maia-3 真实模型已激活';
        modelBadge.className = 'maia-badge badge-gpu';
        progressBox.style.display = 'none';
        btnDownload.style.display = 'none';

        if (this.onModelLoaded) this.onModelLoaded();
      } catch (err) {
        progressText.textContent = `下载失败: ${err.message}`;
        progressFill.style.backgroundColor = '#ef4444';
        btnDownload.disabled = false;
      }
    });

    // Local .onnx File Upload
    const fileInput = this.container.querySelector('#maia-file-input');
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      progressBox.style.display = 'block';
      try {
        await ModelLoader.loadFromLocalFile(file, (percent, msg) => {
          progressFill.style.width = `${percent}%`;
          progressText.textContent = msg;
        });

        modelBadge.textContent = `🟢 已载入: ${file.name}`;
        modelBadge.className = 'maia-badge badge-gpu';
        progressBox.style.display = 'none';

        if (this.onModelLoaded) this.onModelLoaded();
      } catch (err) {
        progressText.textContent = `加载失败: ${err.message}`;
        progressFill.style.backgroundColor = '#ef4444';
      }
    });
  }

  setupDraggable() {
    const handle = this.container.querySelector('#maia-drag-handle');
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL' || e.target.tagName === 'INPUT') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.container.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        const newLeft = Math.max(10, Math.min(window.innerWidth - rect.width - 10, origLeft + dx));
        const newTop = Math.max(10, Math.min(window.innerHeight - rect.height - 10, origTop + dy));

        this.container.style.left = `${newLeft}px`;
        this.container.style.top = `${newTop}px`;
        this.container.style.right = 'auto';
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const rect = this.container.getBoundingClientRect();
        localStorage.setItem('maia3_panel_pos', JSON.stringify({ left: rect.left, top: rect.top }));
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  update(predictionData, latencyMs = 0) {
    this.currentData = predictionData;
    this.latency = latencyMs;

    const turnPill = this.container.querySelector('#maia-turn-pill');
    const isWhite = predictionData.turn === 'w';
    if (turnPill) {
      turnPill.textContent = isWhite ? '⚪ 白方行棋' : '⚫ 黑方行棋';
      turnPill.className = `maia-turn-tag ${isWhite ? 'turn-white' : 'turn-black'}`;
    }

    const modelBadge = this.container.querySelector('#maia-model-badge');
    const modelControls = this.container.querySelector('#maia-model-controls');
    const movesHeader = this.container.querySelector('#maia-moves-header-text');
    const movesContainer = this.container.querySelector('#maia-moves-container');
    const insightBox = this.container.querySelector('#maia-insight-card');
    const insightBadge = this.container.querySelector('#maia-insight-badge');
    const insightText = this.container.querySelector('#maia-insight-text');
    const timeEl = this.container.querySelector('#maia-inference-time');

    // 1. If engine is NOT available: strictly show unavailable error (no fake guesses!)
    if (!predictionData || !predictionData.isAvailable) {
      if (modelBadge) {
        modelBadge.textContent = '🔴 Maia-3 未就绪';
        modelBadge.className = 'maia-badge badge-warning';
      }
      if (modelControls) modelControls.style.display = 'flex';
      if (timeEl) timeEl.textContent = '未就绪';
      if (movesContainer) {
        movesContainer.innerHTML = `
          <div style="padding: 16px 12px; text-align: center; background: rgba(239, 68, 68, 0.08); border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 10px;">
            <div style="font-size: 22px; margin-bottom: 6px;">🛑</div>
            <div style="font-weight: 700; color: #ef4444; margin-bottom: 6px;">Maia-3 神经网络引擎未连接</div>
            <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.5; margin-bottom: 10px;">
              本插件已完全删除低精度离线乱猜模式。<br>
              请在本地终端执行一键启动脚本载入 79M 模型：<br>
              <code style="background: #1e293b; color: #38bdf8; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px;">./run_maia.sh</code>
            </div>
            <button id="maia-retry-btn" style="background: #3b82f6; color: #fff; border: none; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 11.5px; font-weight: 600;">🔄 重新检测引擎</button>
          </div>
        `;
        const retryBtn = movesContainer.querySelector('#maia-retry-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            if (this.onModelLoaded) this.onModelLoaded();
          });
        }
      }
      if (insightBox) insightBox.style.display = 'none';
      return;
    }

    // 2. Engine is connected: Update Badges and Controls
    if (modelControls) modelControls.style.display = 'none';
    if (insightBox) insightBox.style.display = 'block';

    if (modelBadge) {
      if (predictionData.stockfish && predictionData.stockfish.available) {
        modelBadge.textContent = `🟢 Maia-3 79M + Stockfish 17 (⚡ MPS)`;
      } else if (predictionData.isLocalServer) {
        modelBadge.textContent = `🟢 ${predictionData.modelName} (⚡ 本地 MPS)`;
      } else {
        modelBadge.textContent = `🟢 ONNX 实装 (⚡ ${predictionData.backend})`;
      }
      modelBadge.className = 'maia-badge badge-gpu';
    }

    if (movesHeader) {
      movesHeader.textContent = isWhite ? '白方候选着法 (向上进攻)' : '黑方候选着法 (向下进攻)';
    }

    if (timeEl) {
      timeEl.textContent = `${latencyMs.toFixed(0)} ms (${predictionData.backend})`;
    }

    // 3. Human vs Stockfish Comparative Insight Card
    if (predictionData.comparison) {
      const { badge, summary, agreed } = predictionData.comparison;
      insightBadge.textContent = badge;
      insightBadge.className = `maia-insight-tag ${agreed ? 'tag-consensus' : 'tag-trap'}`;
      insightBox.className = `maia-insight-box ${agreed ? 'alert-consensus' : 'alert-trap'}`;
      
      let sfHtml = '';
      if (predictionData.stockfish && predictionData.stockfish.bestMove) {
        const sf = predictionData.stockfish;
        sfHtml = `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center; font-size: 11.5px;">
            <span>🐟 Stockfish 17 最佳: <strong>${sf.bestMove.san}</strong></span>
            <span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${sf.score}</span>
          </div>
        `;
      }
      insightText.innerHTML = `${summary}${sfHtml}`;
    } else if (predictionData.analysis) {
      insightBadge.textContent = '💡 直觉研判';
      insightBadge.className = 'maia-insight-tag tag-neutral';
      insightBox.className = 'maia-insight-box alert-neutral';
      insightText.textContent = predictionData.analysis.commentary;
    }

    // 4. Maia Human Candidates Move List
    if (!predictionData.moves || predictionData.moves.length === 0) {
      movesContainer.innerHTML = `<div class="maia-placeholder">局面绝杀或无合法着法</div>`;
      return;
    }

    const topMoves = predictionData.moves.slice(0, 4);
    movesContainer.innerHTML = '';

    topMoves.forEach((move, idx) => {
      const row = document.createElement('div');
      row.className = `maia-move-row ${idx === 0 ? 'top-pick' : ''}`;
      row.dataset.uci = move.uci;

      const isSfMatch = predictionData.stockfish?.bestMove?.uci === move.uci;
      const colors = ['#f59e0b', '#06b6d4', '#a855f7', '#6b7280'];
      const barColor = isSfMatch ? '#10b981' : (colors[idx] || '#6b7280');

      row.innerHTML = `
        <div class="maia-move-main">
          <span class="maia-move-rank">#${idx + 1}</span>
          <span class="maia-move-san">${move.san} ${isSfMatch ? '<span style="font-size: 10px; color: #10b981;">(🐟 最佳)</span>' : ''}</span>
          <span class="maia-move-prob">${move.prob}%</span>
        </div>
        <div class="maia-progress-bar">
          <div class="maia-progress-fill" style="width: ${move.prob}%; background-color: ${barColor};"></div>
        </div>
      `;

      row.addEventListener('mouseenter', () => {
        if (this.onMoveHover) this.onMoveHover(move.uci);
      });
      row.addEventListener('mouseleave', () => {
        if (this.onMoveHover) this.onMoveHover(null);
      });

      movesContainer.appendChild(row);
    });
  }
}
