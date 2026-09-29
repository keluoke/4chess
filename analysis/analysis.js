/**
 * Maia-3 Standalone Deep Analysis Studio Application Coordinator
 * High-performance, zero-latency, 100% self-contained chess analysis workstation.
 */

import { ChessBoard } from '../engine/chess-core.js';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js';
import { MaiaEngine } from '../engine/maia-engine.js';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { BoardUI } from './board-ui.js';
import { EvalChart } from './eval-chart.js';

// Famous Sample Games for instant exploration & demo
const SAMPLE_GAMES = {
  fischer: `[Event "Third Rosenwald Trophy"]
[Site "New York, NY USA"]
[Date "1956.10.17"]
[Round "8"]
[White "Donald Byrne"]
[Black "Robert James Fischer"]
[Result "0-1"]

1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2# 0-1`,

  kasparov: `[Event "Hoogovens Group A"]
[Site "Wijk aan Zee NED"]
[Date "1999.01.20"]
[Round "4"]
[White "Garry Kasparov"]
[Black "Veselin Topalov"]
[Result "1-0"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`
};

class AnalysisStudioApp {
  constructor() {
    this.boardUI = null;
    this.evalChart = null;
    this.stockfish = null;
    this.maiaEngine = null;
    this.analyzer = null;

    this.currentElo = 1900;
    this.moves = [];
    this.positions = [];
    this.reviewResult = null;
    this.currentPly = 0;

    this.isBranching = false;
    this.branchFen = null;
    this.isPlaying = false;
    this.playTimer = null;

    this.initElements();
    this.initEngines();
    this.initUI();
    this.bindEvents();
    this.loadInitialGame();
  }

  initElements() {
    this.el = {
      metaWhite: document.getElementById('meta-white'),
      metaBlack: document.getElementById('meta-black'),
      metaResult: document.getElementById('meta-result'),
      eloSelector: document.getElementById('elo-selector'),
      dotMaia: document.getElementById('dot-maia'),
      dotSf: document.getElementById('dot-sf'),
      btnImportPgn: document.getElementById('btn-import-pgn'),
      btnReanalyze: document.getElementById('btn-reanalyze'),
      boardContainer: document.getElementById('board-container'),
      branchBanner: document.getElementById('branch-banner'),
      btnExitBranch: document.getElementById('btn-exit-branch'),
      btnFirst: document.getElementById('btn-first'),
      btnPrev: document.getElementById('btn-prev'),
      btnPlay: document.getElementById('btn-play'),
      btnNext: document.getElementById('btn-next'),
      btnLast: document.getElementById('btn-last'),
      btnFlip: document.getElementById('btn-flip'),
      boardStatusText: document.getElementById('board-status-text'),
      progressCard: document.getElementById('analysis-progress-card'),
      phaseText: document.getElementById('analysis-phase-text'),
      percentText: document.getElementById('analysis-percent-text'),
      progressBar: document.getElementById('analysis-progress-bar'),
      evalChartContainer: document.getElementById('eval-chart-container'),
      divergenceBadge: document.getElementById('divergence-badge'),
      divergenceContent: document.getElementById('divergence-content'),
      tabBlunders: document.getElementById('tab-blunders'),
      tabMoves: document.getElementById('tab-moves'),
      blunderCountBadge: document.getElementById('blunder-count-badge'),
      moveCountBadge: document.getElementById('move-count-badge'),
      blunderTabContent: document.getElementById('blunder-tab-content'),
      movesTabContent: document.getElementById('moves-tab-content'),
      blunderList: document.getElementById('blunder-list'),
      moveNotationTable: document.getElementById('move-notation-table'),
      pgnModal: document.getElementById('pgn-modal'),
      pgnInput: document.getElementById('pgn-input'),
      btnCancelPgn: document.getElementById('btn-cancel-pgn'),
      btnSubmitPgn: document.getElementById('btn-submit-pgn'),
      sampleFischer: document.getElementById('sample-fischer'),
      sampleKasparov: document.getElementById('sample-kasparov')
    };
  }

  initEngines() {
    this.stockfish = new StockfishInBrowser();
    this.maiaEngine = new MaiaEngine();
    this.analyzer = new GameAnalyzer(this.stockfish, this.maiaEngine);

    // Stockfish lifecycle monitoring
    this.stockfish.initialize().then((ready) => {
      if (ready) {
        this.el.dotSf.className = 'status-dot ready';
      } else {
        this.el.dotSf.className = 'status-dot error';
      }
    }).catch(() => {
      this.el.dotSf.className = 'status-dot error';
    });

    // Maia 3 lifecycle monitoring
    this.maiaEngine.initialize().then(() => {
      this.el.dotMaia.className = 'status-dot ready';
    }).catch(() => {
      this.el.dotMaia.className = 'status-dot error';
    });
  }

  initUI() {
    // 1. Initialize BoardUI
    this.boardUI = new BoardUI(this.el.boardContainer, {
      orientation: 'white',
      onMove: (move, newFen) => this.handleUserBoardMove(move, newFen)
    });

    // 2. Initialize EvalChart
    this.evalChart = new EvalChart(this.el.evalChartContainer, (selectedPly) => {
      this.goToPly(selectedPly);
    });
  }

  bindEvents() {
    // Elo selector
    this.el.eloSelector.addEventListener('change', (e) => {
      this.currentElo = parseInt(e.target.value, 10);
      try {
        localStorage.setItem('maia3_target_elo', String(this.currentElo));
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ defaultElo: this.currentElo });
        }
      } catch (err) {}
      this.updateActivePositionAnalysis();
    });

    // Board controls
    this.el.btnFirst.addEventListener('click', () => this.goToPly(0));
    this.el.btnPrev.addEventListener('click', () => this.goToPly(this.currentPly - 1));
    this.el.btnNext.addEventListener('click', () => this.goToPly(this.currentPly + 1));
    this.el.btnLast.addEventListener('click', () => this.goToPly(this.positions.length - 1));
    this.el.btnFlip.addEventListener('click', () => this.boardUI.flip());
    this.el.btnPlay.addEventListener('click', () => this.toggleAutoPlay());
    this.el.btnExitBranch.addEventListener('click', () => this.exitBranchMode());

    // Tabs
    this.el.tabBlunders.addEventListener('click', () => this.switchTab('blunders'));
    this.el.tabMoves.addEventListener('click', () => this.switchTab('moves'));

    // PGN Import Modal
    this.el.btnImportPgn.addEventListener('click', () => {
      this.el.pgnModal.classList.add('open');
      this.el.pgnInput.focus();
    });
    this.el.btnCancelPgn.addEventListener('click', () => {
      this.el.pgnModal.classList.remove('open');
    });
    this.el.pgnModal.addEventListener('click', (e) => {
      if (e.target === this.el.pgnModal) this.el.pgnModal.classList.remove('open');
    });

    this.el.btnSubmitPgn.addEventListener('click', () => {
      const pgn = this.el.pgnInput.value.trim();
      if (!pgn) return;
      this.el.pgnModal.classList.remove('open');
      this.loadGameFromPgn(pgn);
    });

    this.el.sampleFischer.addEventListener('click', () => {
      this.el.pgnInput.value = SAMPLE_GAMES.fischer;
    });
    this.el.sampleKasparov.addEventListener('click', () => {
      this.el.pgnInput.value = SAMPLE_GAMES.kasparov;
    });

    // Reanalyze button
    this.el.btnReanalyze.addEventListener('click', () => {
      if (this.moves.length > 0) {
        this.runFullReview(true);
      }
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;

      if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        this.goToPly(this.currentPly - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'k') {
        e.preventDefault();
        this.goToPly(this.currentPly + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.goToPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.goToPly(this.positions.length - 1);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.toggleAutoPlay();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.boardUI.flip();
      }
    });
  }

  switchTab(tabName) {
    if (tabName === 'blunders') {
      this.el.tabBlunders.classList.add('active');
      this.el.tabMoves.classList.remove('active');
      this.el.blunderTabContent.style.display = 'block';
      this.el.movesTabContent.style.display = 'none';
    } else {
      this.el.tabMoves.classList.add('active');
      this.el.tabBlunders.classList.remove('active');
      this.el.movesTabContent.style.display = 'block';
      this.el.blunderTabContent.style.display = 'none';
    }
  }

  toggleAutoPlay() {
    if (this.isPlaying) {
      clearInterval(this.playTimer);
      this.isPlaying = false;
      this.el.btnPlay.textContent = '▶';
      this.el.btnPlay.title = '自动播放';
    } else {
      this.isPlaying = true;
      this.el.btnPlay.textContent = '⏸';
      this.el.btnPlay.title = '暂停播放';
      this.playTimer = setInterval(() => {
        if (this.currentPly < this.positions.length - 1) {
          this.goToPly(this.currentPly + 1);
        } else {
          this.toggleAutoPlay();
        }
      }, 1200);
    }
  }

  async loadInitialGame() {
    let loaded = false;

    // 1. Try reading from chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await new Promise(res => {
          chrome.storage.local.get(['active_analysis_game', 'defaultElo'], res);
        });

        if (stored?.defaultElo) {
          this.currentElo = stored.defaultElo;
          this.el.eloSelector.value = String(this.currentElo);
        }

        const game = stored?.active_analysis_game;
        if (game && (game.moves?.length > 0 || game.pgn)) {
          this.loadGameData(game);
          loaded = true;
        }
      } catch (err) {
        console.warn('[Analysis Studio] Storage load error:', err);
      }
    }

    // 2. Fallback to Fischer sample game
    if (!loaded) {
      this.loadGameFromPgn(SAMPLE_GAMES.fischer);
    }
  }

  loadGameData(game) {
    if (game.white) this.el.metaWhite.textContent = `⚪ ${game.white}`;
    if (game.black) this.el.metaBlack.textContent = `⚫ ${game.black}`;
    if (game.result) this.el.metaResult.textContent = game.result;

    if (game.pgn) {
      this.parsePgnHeaders(game.pgn);
    }

    if (game.moves && game.moves.length > 0) {
      this.moves = game.moves;
    } else if (game.pgn) {
      this.moves = GameAnalyzer.parsePgn(game.pgn);
    }

    if (this.moves.length === 0) return;

    this.positions = GameAnalyzer.buildPositionChain(this.moves);
    this.el.moveCountBadge.textContent = String(this.moves.length);

    this.renderMoveList();
    this.goToPly(0);

    if (game.cachedReview) {
      this.applyReviewResult(game.cachedReview);
    } else {
      this.runFullReview(false);
    }
  }

  loadGameFromPgn(pgnText) {
    this.parsePgnHeaders(pgnText);
    const parsedMoves = GameAnalyzer.parsePgn(pgnText);
    if (!parsedMoves || parsedMoves.length === 0) {
      alert('未能解析该 PGN 文本，请确认格式是否正确。');
      return;
    }

    this.moves = parsedMoves;
    this.positions = GameAnalyzer.buildPositionChain(this.moves);
    this.el.moveCountBadge.textContent = String(this.moves.length);

    this.renderMoveList();
    this.goToPly(0);
    this.runFullReview(false);
  }

  parsePgnHeaders(pgnText) {
    const whiteMatch = pgnText.match(/\[White\s+"([^"]+)"\]/i);
    const blackMatch = pgnText.match(/\[Black\s+"([^"]+)"\]/i);
    const whiteEloMatch = pgnText.match(/\[WhiteElo\s+"([^"]+)"\]/i);
    const blackEloMatch = pgnText.match(/\[BlackElo\s+"([^"]+)"\]/i);
    const resultMatch = pgnText.match(/\[Result\s+"([^"]+)"\]/i);

    const whiteName = whiteMatch ? whiteMatch[1] : '白方';
    const blackName = blackMatch ? blackMatch[1] : '黑方';
    const whiteElo = whiteEloMatch ? ` (${whiteEloMatch[1]})` : '';
    const blackElo = blackEloMatch ? ` (${blackEloMatch[1]})` : '';
    const result = resultMatch ? resultMatch[1] : '*';

    this.el.metaWhite.textContent = `⚪ ${whiteName}${whiteElo}`;
    this.el.metaBlack.textContent = `⚫ ${blackName}${blackElo}`;
    this.el.metaResult.textContent = result;
  }

  async runFullReview(forceRefresh = false) {
    this.el.progressCard.style.display = 'flex';
    this.el.progressBar.style.width = '0%';
    this.el.percentText.textContent = '0%';
    this.el.phaseText.textContent = '正在准备全盘引擎评估...';

    try {
      const result = await this.analyzer.analyzeGame(this.moves, {
        depth: 6,
        elo: this.currentElo,
        forceRefresh,
        onProgress: (prog) => {
          this.el.progressBar.style.width = `${prog.percent}%`;
          this.el.percentText.textContent = `${prog.percent}%`;
          if (prog.phase === 'evaluating') {
            this.el.phaseText.textContent = `Stockfish 19 WASM 评估中 (${prog.current}/${prog.total}) · ${prog.currentMove || ''}`;
          } else if (prog.phase === 'intuition') {
            this.el.phaseText.textContent = `Maia 3 直觉陷阱测算中 (${prog.current}/${prog.total}) · ${prog.currentMove || ''}`;
          }
        }
      });

      this.el.progressCard.style.display = 'none';

      if (result) {
        this.applyReviewResult(result);
      }
    } catch (err) {
      console.error('[Analysis Studio] Review failed:', err);
      this.el.progressCard.style.display = 'none';
      this.el.divergenceContent.innerHTML = `<span style="color: var(--brand-red);">⚠️ 复盘分析出错: ${err.message}</span>`;
    }
  }

  applyReviewResult(result) {
    this.reviewResult = result;

    // 1. Update Chart
    this.evalChart.setData(result.allMoves);
    this.evalChart.setCursor(this.currentPly);

    // 2. Update Blunder list
    const moments = result.keyMoments || [];
    this.el.blunderCountBadge.textContent = String(moments.length);
    this.renderBlunderCards(moments);

    // 3. Annotate Move Notation Table
    this.annotateMoveList(result.allMoves);

    // 4. Update current position insight
    this.updateActivePositionAnalysis();
  }

  renderBlunderCards(moments) {
    if (!moments || moments.length === 0) {
      this.el.blunderList.innerHTML = `
        <div style="padding: 28px; text-align: center; color: var(--text-dim); font-size: 13px;">
          👏 本盘棋质量极高！未检测到显著的局面漏着或失误。
        </div>
      `;
      return;
    }

    this.el.blunderList.innerHTML = '';

    moments.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'blunder-card';
      card.dataset.index = index;

      const isWhite = item.turn === 'w';
      const sideText = isWhite ? '⚪ 白方' : '⚫ 黑方';

      let sevClass = 'badge-blunder';
      let sevText = '大漏 (Blunder)';
      if (item.severity === 'mistake') {
        sevClass = 'badge-trap';
        sevText = '失误 (Mistake)';
      } else if (item.severity === 'inaccuracy') {
        sevClass = 'badge-trap';
        sevText = '疑问手 (Inaccuracy)';
      }

      const trapBadgeHtml = item.isHumanTrap
        ? `<span class="badge-trap" title="人类棋手高频错着陷阱 (直觉概率 ${item.humanProbability || 0}%)">💡 人类陷阱</span>`
        : '';

      card.innerHTML = `
        <div class="blunder-card-header">
          <div class="blunder-move-title">
            <span>第 ${item.moveNumber} 步 (${sideText})</span>
            <span class="${sevClass}">${sevText}</span>
            ${trapBadgeHtml}
          </div>
          <span style="font-size: 11px; font-weight: 700; color: var(--brand-red);">
            ${item.lossPawns} 兵
          </span>
        </div>

        <div class="blunder-eval-row">
          <span>实战: <strong style="color: var(--brand-red);">${item.san}</strong></span>
          <span>推荐: <strong style="color: var(--brand-green);">${item.bestSan}</strong></span>
          <span>局势: ${item.evalBefore} ➔ ${item.evalAfter}</span>
        </div>

        <div class="blunder-btn-actions">
          <button type="button" class="btn-dual-drill btn-drill-decision" data-index="${index}">
            🎯 走棋前决策
          </button>
          <button type="button" class="btn-dual-drill btn-drill-result" data-index="${index}">
            👀 走棋后局面
          </button>
        </div>
      `;

      // Decision button: jumps to fenBefore
      const btnDec = card.querySelector('.btn-drill-decision');
      btnDec.addEventListener('click', (e) => {
        e.stopPropagation();
        this.drillBlunder(item, 'decision');
      });

      // Result button: jumps to fenAfter
      const btnRes = card.querySelector('.btn-drill-result');
      btnRes.addEventListener('click', (e) => {
        e.stopPropagation();
        this.drillBlunder(item, 'result');
      });

      // Card click defaults to decision
      card.addEventListener('click', () => {
        this.drillBlunder(item, 'decision');
      });

      this.el.blunderList.appendChild(card);
    });
  }

  drillBlunder(item, viewMode = 'decision') {
    this.exitBranchMode();

    // Highlight card
    const cards = this.el.blunderList.querySelectorAll('.blunder-card');
    cards.forEach(c => c.classList.remove('active'));
    const matchedCard = this.el.blunderList.querySelector(`.blunder-card[data-index="${momentsIndex(item)}"]`);
    if (matchedCard) matchedCard.classList.add('active');

    if (viewMode === 'decision') {
      // 1. Board setup at fenBefore
      const prevPly = Math.max(0, item.ply - 1);
      const prevPos = this.positions[prevPly];
      const lastMove = prevPos ? { from: prevPos.from, to: prevPos.to } : null;

      this.boardUI.setPosition(item.fenBefore, lastMove);
      this.currentPly = prevPly;
      this.evalChart.setCursor(item.ply);
      this.highlightMoveRow(item.ply);

      this.el.boardStatusText.textContent = `🎯 走棋前决策 · 第 ${item.moveNumber} 步 (${item.turn === 'w' ? '白方' : '黑方'}思考中)`;

      // Arrows: Stockfish best move (green)
      const arrows = [];
      if (item.bestUci && item.bestUci.length >= 4) {
        arrows.push({
          from: item.bestUci.slice(0, 2),
          to: item.bestUci.slice(2, 4),
          color: 'green',
          label: item.bestSan || '最佳'
        });
      }

      this.boardUI.setArrows(arrows);

      // Async fetch Maia top intuition arrow for this decision
      this.maiaEngine.predict(item.fenBefore, this.currentElo).then(pred => {
        if (pred && pred.moves && pred.moves.length > 0) {
          const topIntuition = pred.moves[0];
          if (topIntuition.uci && topIntuition.uci !== item.bestUci) {
            arrows.push({
              from: topIntuition.uci.slice(0, 2),
              to: topIntuition.uci.slice(2, 4),
              color: 'gold',
              label: `${topIntuition.san} (${topIntuition.prob}%)`
            });
            this.boardUI.setArrows(arrows);
          }
        }
      });

      // Divergence explanation
      this.el.divergenceBadge.textContent = '🎯 走棋前决策研判';
      this.el.divergenceBadge.style.color = 'var(--brand-green)';
      this.el.divergenceContent.innerHTML = `
        轮到 <strong>${item.turn === 'w' ? '白方' : '黑方'}</strong> 走棋。<br/>
        实战走出了 <strong style="color: var(--brand-red);">${item.san}</strong> (造成 <strong>${item.lossPawns}</strong> 兵局面损耗)；<br/>
        引擎推荐最佳着法为 <strong style="color: var(--brand-green);">${item.bestSan}</strong>。
      `;

    } else {
      // 2. Board setup at fenAfter
      this.boardUI.setPosition(item.fenAfter, { from: item.from, to: item.to });
      this.currentPly = item.ply;
      this.evalChart.setCursor(item.ply);
      this.highlightMoveRow(item.ply);

      this.el.boardStatusText.textContent = `👀 走棋后局面 · 第 ${item.moveNumber} 步 (${item.turn === 'w' ? '白方' : '黑方'}走出了 ${item.san})`;

      // Arrows: Dashed red blunder arrow
      const arrows = [];
      if (item.from && item.to) {
        arrows.push({
          from: item.from,
          to: item.to,
          color: 'red',
          dashed: true,
          label: `${item.san} (${item.lossPawns})`
        });
      }
      this.boardUI.setArrows(arrows);

      this.el.divergenceBadge.textContent = '👀 走棋后局面损耗';
      this.el.divergenceBadge.style.color = 'var(--brand-red)';
      this.el.divergenceContent.innerHTML = `
        走棋完成: <strong style="color: var(--brand-red);">${item.san}</strong>。<br/>
        局势从 <strong>${item.evalBefore}</strong> 急剧转向 <strong>${item.evalAfter}</strong> (净亏损 <strong>${item.lossPawns}</strong> 兵)。
      `;
    }

    function momentsIndex(m) {
      return (moments || []).indexOf(m);
    }
  }

  renderMoveList() {
    this.el.moveNotationTable.innerHTML = '';
    const totalMoves = this.moves.length;

    for (let i = 0; i < totalMoves; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = this.moves[i];
      const blackMove = this.moves[i + 1] || null;

      const row = document.createElement('div');
      row.className = 'notation-row';

      row.innerHTML = `
        <span class="notation-num">${moveNum}.</span>
        <div class="notation-move" id="move-ply-${whiteMove.ply}">
          <span>${whiteMove.san}</span>
          <span class="annotation-badge" id="badge-ply-${whiteMove.ply}"></span>
        </div>
        ${blackMove ? `
          <div class="notation-move" id="move-ply-${blackMove.ply}">
            <span>${blackMove.san}</span>
            <span class="annotation-badge" id="badge-ply-${blackMove.ply}"></span>
          </div>
        ` : '<div class="notation-move" style="visibility: hidden;"></div>'}
      `;

      // Click event for white move
      const wEl = row.querySelector(`#move-ply-${whiteMove.ply}`);
      wEl.addEventListener('click', () => this.goToPly(whiteMove.ply));

      // Click event for black move
      if (blackMove) {
        const bEl = row.querySelector(`#move-ply-${blackMove.ply}`);
        bEl.addEventListener('click', () => this.goToPly(blackMove.ply));
      }

      this.el.moveNotationTable.appendChild(row);
    }
  }

  annotateMoveList(allMoves) {
    if (!allMoves) return;

    allMoves.forEach(m => {
      const badge = document.getElementById(`badge-ply-${m.ply}`);
      if (!badge) return;

      if (m.severity === 'blunder') {
        badge.textContent = '??';
        badge.className = 'annotation-badge annotation-blunder';
        badge.title = `大漏 (${m.lossPawns} 兵)`;
      } else if (m.severity === 'mistake') {
        badge.textContent = '?';
        badge.className = 'annotation-badge annotation-mistake';
        badge.title = `失误 (${m.lossPawns} 兵)`;
      } else if (m.severity === 'inaccuracy') {
        badge.textContent = '?!';
        badge.className = 'annotation-badge annotation-mistake';
        badge.title = `疑问手 (${m.lossPawns} 兵)`;
      } else {
        badge.textContent = '';
      }
    });
  }

  highlightMoveRow(ply) {
    const all = this.el.moveNotationTable.querySelectorAll('.notation-move');
    all.forEach(el => el.classList.remove('active'));

    if (ply > 0) {
      const activeEl = document.getElementById(`move-ply-${ply}`);
      if (activeEl) {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  goToPly(ply) {
    this.exitBranchMode();

    if (this.positions.length === 0) return;
    const clampedPly = Math.max(0, Math.min(this.positions.length - 1, ply));
    this.currentPly = clampedPly;

    const currentPos = this.positions[clampedPly];
    const lastMove = (clampedPly > 0 && currentPos) ? { from: currentPos.from, to: currentPos.to } : null;

    this.boardUI.setPosition(currentPos.fen, lastMove);
    this.evalChart.setCursor(clampedPly);
    this.highlightMoveRow(clampedPly);

    if (clampedPly === 0) {
      this.el.boardStatusText.textContent = '开局局面';
      this.boardUI.clearArrows();
      this.el.divergenceBadge.textContent = '♟️ 开局状态';
      this.el.divergenceBadge.style.color = 'var(--brand-green)';
      this.el.divergenceContent.textContent = '对局起始状态，双方棋子全部就位。';
    } else {
      const sideText = currentPos.turn === 'w' ? '白方' : '黑方';
      this.el.boardStatusText.textContent = `第 ${currentPos.moveNumber} 步 (${sideText} ${currentPos.san})`;
      this.updateActivePositionAnalysis();
    }
  }

  updateActivePositionAnalysis() {
    if (this.isBranching) return;
    if (this.currentPly === 0) return;

    const currentPos = this.positions[this.currentPly];
    if (!currentPos) return;

    // Check if we have reviewResult for this ply
    const moveReview = this.reviewResult?.allMoves?.find(m => m.ply === this.currentPly);

    if (moveReview) {
      const sideText = moveReview.turn === 'w' ? '白方' : '黑方';
      const arrows = [];

      if (moveReview.severity === 'blunder' || moveReview.severity === 'mistake') {
        this.el.divergenceBadge.textContent = `⚠️ 人机分歧 · ${moveReview.severity === 'blunder' ? '大漏' : '失误'}`;
        this.el.divergenceBadge.style.color = 'var(--brand-red)';

        arrows.push({
          from: moveReview.from,
          to: moveReview.to,
          color: 'red',
          dashed: true,
          label: `${moveReview.san} (${moveReview.lossPawns})`
        });

        this.el.divergenceContent.innerHTML = `
          实战 <strong>${sideText}</strong> 走出: <strong style="color: var(--brand-red);">${moveReview.san}</strong>。<br/>
          推荐最佳走法为 <strong style="color: var(--brand-green);">${moveReview.bestSan}</strong>。<br/>
          局面损耗: <strong style="color: var(--brand-red);">${moveReview.lossPawns}</strong> 兵 (变动: ${moveReview.evalBefore} ➔ ${moveReview.evalAfter})
        `;
      } else {
        this.el.divergenceBadge.textContent = '✓ 正常着法';
        this.el.divergenceBadge.style.color = 'var(--brand-green)';

        this.el.divergenceContent.innerHTML = `
          第 ${moveReview.moveNumber} 步: <strong>${sideText}</strong> 走棋 <strong>${moveReview.san}</strong>。<br/>
          当前局势评分: <strong>${moveReview.evalAfter || '0.00'}</strong>
        `;
      }

      this.boardUI.setArrows(arrows);
    } else {
      this.el.divergenceBadge.textContent = '⚡ 局面分析中';
      this.el.divergenceBadge.style.color = 'var(--brand-gold)';
      this.el.divergenceContent.textContent = '正在计算当前局面的人类直觉与引擎评估...';

      // Realtime lightweight Maia prediction
      this.maiaEngine.predict(currentPos.fen, this.currentElo).then(pred => {
        if (pred && pred.moves && pred.moves.length > 0) {
          const top = pred.moves[0];
          if (top.uci) {
            this.boardUI.setArrows([{
              from: top.uci.slice(0, 2),
              to: top.uci.slice(2, 4),
              color: 'gold',
              label: `${top.san} (${top.prob}%)`
            }]);
          }
        }
      });
    }
  }

  handleUserBoardMove(move, newFen) {
    // 1. Check if user's move matches the next mainline move
    const nextMainlinePos = this.positions[this.currentPly + 1];
    if (!this.isBranching && nextMainlinePos && (nextMainlinePos.uci === move.uci || (nextMainlinePos.from === move.fromSq && nextMainlinePos.to === move.toSq))) {
      this.goToPly(this.currentPly + 1);
      return;
    }

    // 2. User branched away from the mainline!
    this.isBranching = true;
    this.branchFen = newFen;
    this.el.branchBanner.style.display = 'flex';
    this.el.boardStatusText.textContent = `🌿 分支走法: ${move.san || move.uci}`;

    this.el.divergenceBadge.textContent = '🌿 自由试演分支研判';
    this.el.divergenceBadge.style.color = 'var(--brand-gold)';
    this.el.divergenceContent.innerHTML = '正在测算该分支局面下的人类直觉倾向与引擎评分...';

    // Realtime dual-engine evaluation on branch position
    const arrows = [];

    // Maia Prediction (instant)
    this.maiaEngine.predict(newFen, this.currentElo).then(pred => {
      if (!this.isBranching || this.branchFen !== newFen) return;
      if (pred && pred.moves && pred.moves.length > 0) {
        const m = pred.moves[0];
        if (m.uci) {
          arrows.push({
            from: m.uci.slice(0, 2),
            to: m.uci.slice(2, 4),
            color: 'gold',
            label: `直觉 ${m.san} (${m.prob}%)`
          });
          this.boardUI.setArrows(arrows);
        }
      }
    });

    // Stockfish Evaluation (fast background)
    if (this.stockfish.isReady) {
      this.stockfish.evaluate(newFen, 6, 2500, 1).then(sfRes => {
        if (!this.isBranching || this.branchFen !== newFen) return;
        if (sfRes && sfRes.bestMove) {
          arrows.push({
            from: sfRes.bestMove.fromSq,
            to: sfRes.bestMove.toSq,
            color: 'green',
            label: `引擎 ${sfRes.bestMove.san || ''} (${sfRes.score})`
          });
          this.boardUI.setArrows(arrows);

          this.el.divergenceContent.innerHTML = `
            分支局面评估: <strong>${sfRes.score}</strong> (深度 ${sfRes.depth})。<br/>
            引擎最优应着: <strong style="color: var(--brand-green);">${sfRes.bestMove.san}</strong>。
          `;
        }
      });
    }
  }

  exitBranchMode() {
    if (!this.isBranching) return;
    this.isBranching = false;
    this.branchFen = null;
    this.el.branchBanner.style.display = 'none';
  }
}

// Instantiate on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  new AnalysisStudioApp();
});
