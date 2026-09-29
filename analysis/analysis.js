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
      sampleKasparov: document.getElementById('sample-kasparov'),
      dropOverlay: document.getElementById('drag-drop-overlay'),
      fileInput: document.getElementById('pgn-file-input'),
      btnUploadFile: document.getElementById('btn-upload-file'),
      // Three-way comparison panel
      comparePanel: document.getElementById('compare-panel'),
      compareEngineSan: document.getElementById('compare-engine-san'),
      compareEngineMeta: document.getElementById('compare-engine-meta'),
      compareIntuitionSan: document.getElementById('compare-intuition-san'),
      compareIntuitionMeta: document.getElementById('compare-intuition-meta'),
      comparePlayedSan: document.getElementById('compare-played-san'),
      comparePlayedMeta: document.getElementById('compare-played-meta'),
      comparePlayedCard: document.getElementById('compare-played')
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

      // Reset active move Maia prediction so it recalculates for the new ELO
      if (this.currentPly > 0) {
        const moveReview = this.reviewResult?.allMoves?.find(m => m.ply === this.currentPly);
        if (moveReview) {
          moveReview.maiaTopSan = null;
          moveReview.maiaTopUci = null;
          moveReview.maiaTopProb = null;
        }
      }
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

    this.el.btnSubmitPgn.addEventListener('click', async () => {
      const input = this.el.pgnInput.value.trim();
      if (!input) return;
      this.el.pgnModal.classList.remove('open');
      await this.smartLoadInput(input);
    });

    // File Upload Button & Input
    if (this.el.btnUploadFile && this.el.fileInput) {
      this.el.btnUploadFile.addEventListener('click', () => {
        this.el.fileInput.click();
      });
      this.el.fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.handleFileUpload(file);
          this.el.pgnModal.classList.remove('open');
          this.el.fileInput.value = '';
        }
      });
    }

    // Global Drag & Drop for PGN files
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (this.el.dropOverlay) this.el.dropOverlay.style.display = 'flex';
    });

    window.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        if (this.el.dropOverlay) this.el.dropOverlay.style.display = 'none';
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.el.dropOverlay) this.el.dropOverlay.style.display = 'none';
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        this.handleFileUpload(file);
        return;
      }
      const droppedText = e.dataTransfer?.getData('text');
      if (droppedText) {
        this.smartLoadInput(droppedText);
      }
    });

    // Global Paste (Cmd+V / Ctrl+V anywhere outside input/textarea)
    window.addEventListener('paste', (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (['input', 'textarea'].includes(tag)) return;
      const text = e.clipboardData?.getData('text')?.trim();
      if (text) {
        this.smartLoadInput(text);
      }
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

  showToast(message, duration = 3000) {
    let toast = document.getElementById('studio-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'studio-toast';
      toast.className = 'studio-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  handleFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        this.smartLoadInput(content, file.name);
      }
    };
    reader.readAsText(file);
  }

  async smartLoadInput(input, sourceName = '') {
    if (!input || typeof input !== 'string') return false;
    const text = input.trim();
    if (!text) return false;

    // 1. Detect Lichess Game URL
    // e.g. https://lichess.org/aBcDeFgH or lichess.org/aBcDeFgH/white
    const lichessMatch = text.match(/(?:https?:\/\/)?(?:www\.)?lichess\.org\/([a-zA-Z0-9]{8,12})/i);
    if (lichessMatch) {
      const gameId = lichessMatch[1].slice(0, 8);
      this.showToast(`🔍 正在从 Lichess 获取对局 (${gameId})...`, 5000);
      try {
        const resp = await fetch(`https://lichess.org/game/export/${gameId}?clocks=true&evals=true`);
        if (resp.ok) {
          const pgn = await resp.text();
          if (pgn && pgn.includes('1.')) {
            this.showToast(`✅ 成功载入 Lichess 对局 (${gameId})`);
            this.loadGameFromPgn(pgn);
            return true;
          }
        }
      } catch (err) {
        console.warn('[Analysis Studio] Lichess export error:', err);
      }
      this.showToast(`❌ 未能从 Lichess 获取该对局，请确认对局公开或直接粘贴 PGN`);
      return false;
    }

    // 2. Detect Chess.com Game URL
    // e.g. https://www.chess.com/game/live/12345678 or chess.com/game/daily/12345678
    const chesscomMatch = text.match(/(?:https?:\/\/)?(?:www\.)?chess\.com\/game\/(live|daily)\/([0-9]+)/i);
    if (chesscomMatch) {
      const type = chesscomMatch[1];
      const gameId = chesscomMatch[2];
      this.showToast(`🔍 正在从 Chess.com 获取对局 (${gameId})...`, 5000);

      // Try via Cloudflare Pages Function proxy (/api/chesscom?id=...&type=...)
      try {
        const proxyUrl = `/api/chesscom?id=${gameId}&type=${type}`;
        const resp = await fetch(proxyUrl);
        if (resp.ok) {
          const data = await resp.json();
          const pgn = data.game?.pgn || data.pgn;
          if (pgn) {
            this.showToast(`✅ 成功载入 Chess.com 对局 (${gameId})`);
            this.loadGameFromPgn(pgn);
            return true;
          }
        }
      } catch (err) {
        console.warn('[Analysis Studio] Chess.com proxy error:', err);
      }

      // If running inside Chrome extension, fallback to background script
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const res = await new Promise(res => {
            chrome.runtime.sendMessage({ type: 'FETCH_CHESSCOM_GAME_PGN', gameId, gameType: type }, res);
          });
          if (res?.ok && res.pgn) {
            this.showToast(`✅ 成功载入 Chess.com 对局 (${gameId})`);
            this.loadGameFromPgn(res.pgn);
            return true;
          }
        } catch (e) {}
      }

      this.showToast(`⚠️ Chess.com 对局接口受限，建议在对局页面直接点击插件复盘或复制 PGN`);
      return false;
    }

    // 3. Detect FEN Position string
    const fenParts = text.split(/\s+/);
    if (fenParts.length >= 2 && fenParts[0].split('/').length === 8) {
      try {
        this.moves = [];
        this.positions = [{
          ply: 0,
          moveNumber: 1,
          turn: fenParts[1] === 'b' ? 'b' : 'w',
          san: 'FEN',
          fen: text,
          moveEl: null
        }];
        this.boardUI.setPosition(text, null);
        this.el.metaWhite.textContent = '⚪ 自由局面分析';
        this.el.metaBlack.textContent = '⚫ FEN';
        this.el.metaResult.textContent = '*';
        this.el.moveCountBadge.textContent = '0';
        this.renderMoveList();
        this.goToPly(0);
        this.showToast('♟️ 已载入 FEN 局面');
        return true;
      } catch (e) {
        console.warn('[Analysis Studio] FEN load error:', e);
      }
    }

    // 4. Default: Standard PGN text
    if (text.includes('1.') || text.includes('[Event')) {
      const label = sourceName ? ` (${sourceName})` : '';
      this.loadGameFromPgn(text);
      this.showToast(`♟️ 成功载入 PGN 棋谱${label}`);
      return true;
    }

    this.showToast('⚠️ 未能识别该内容，请确认是否为有效 PGN 文本或对局链接');
    return false;
  }

  async loadInitialGame() {
    let loaded = false;

    // 1. Try URL parameters (Hash # or Search ?)
    // Hash is ideal: keeps entire PGN client-side without sending to Cloudflare/CDN servers
    try {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(window.location.search);

      const pgnParam = hashParams.get('pgn') || searchParams.get('pgn');
      const urlParam = hashParams.get('url') || searchParams.get('url');
      const eloParam = hashParams.get('elo') || searchParams.get('elo');

      if (eloParam) {
        const parsedElo = parseInt(eloParam, 10);
        if ([1100, 1500, 1900].includes(parsedElo)) {
          this.currentElo = parsedElo;
          if (this.el.eloSelector) this.el.eloSelector.value = String(parsedElo);
        }
      }

      if (pgnParam) {
        const decodedPgn = decodeURIComponent(pgnParam);
        if (decodedPgn) {
          this.loadGameFromPgn(decodedPgn);
          loaded = true;
          return;
        }
      }

      if (urlParam) {
        const decodedUrl = decodeURIComponent(urlParam);
        if (decodedUrl) {
          const ok = await this.smartLoadInput(decodedUrl);
          if (ok) {
            loaded = true;
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[Analysis Studio] Error parsing URL parameters:', e);
    }

    // 2. Try reading from chrome.storage.local (when opened from Chrome extension)
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await new Promise(res => {
          chrome.storage.local.get(['active_analysis_game', 'defaultElo'], res);
        });

        if (stored?.defaultElo) {
          this.currentElo = stored.defaultElo;
          if (this.el.eloSelector) this.el.eloSelector.value = String(this.currentElo);
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

    // 3. Fallback to Fischer sample game
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
    this.el.phaseText.textContent = '正在准备引擎评估...';

    this.el.blunderList.innerHTML = `
      <div style="padding: 28px; text-align: center; color: var(--brand-green); font-size: 13px;">
        <div style="margin-bottom: 8px; font-weight: 600;">⚡ 正在分析全盘对局...</div>
        <div style="font-size: 11.5px; color: var(--text-dim);" id="blunder-loading-detail">正在启动计算与直觉引擎...</div>
      </div>
    `;

    try {
      const result = await this.analyzer.analyzeGame(this.moves, {
        depth: 6,
        elo: this.currentElo,
        forceRefresh,
        onProgress: (prog) => {
          this.el.progressBar.style.width = `${prog.percent}%`;
          this.el.percentText.textContent = `${prog.percent}%`;
          const detailEl = document.getElementById('blunder-loading-detail');
          if (prog.phase === 'evaluating') {
            const txt = `引擎评估中 (${prog.current}/${prog.total}) · ${prog.currentMove || ''}`;
            this.el.phaseText.textContent = txt;
            if (detailEl) detailEl.textContent = txt;
          } else if (prog.phase === 'intuition') {
            const txt = `人类直觉盲区分析 (${prog.current}/${prog.total}) · ${prog.currentMove || ''}`;
            this.el.phaseText.textContent = txt;
            if (detailEl) detailEl.textContent = txt;
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
      this.el.blunderList.innerHTML = `
        <div style="padding: 28px; text-align: center; color: var(--brand-red); font-size: 13px;">
          <div style="margin-bottom: 8px;">⚠️ 棋局分析未能完成: ${err.message}</div>
          <button type="button" class="btn-header btn-primary" id="btn-retry-review" style="margin: 0 auto; display: inline-flex;">重试分析</button>
        </div>
      `;
      document.getElementById('btn-retry-review')?.addEventListener('click', () => this.runFullReview(true));
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
      card.dataset.ply = item.ply;

      const isWhite = item.turn === 'w';
      const sideIcon = isWhite ? '⚪' : '⚫';

      let sevTag = '';
      if (item.severity === 'blunder') {
        sevTag = `<span class="blunder-type-tag tag-blunder">大漏 ??</span>`;
      } else if (item.severity === 'mistake') {
        sevTag = `<span class="blunder-type-tag tag-mistake">失误 ?</span>`;
      } else if (item.severity === 'inaccuracy') {
        sevTag = `<span class="blunder-type-tag tag-inaccuracy">疑问手 ?!</span>`;
      }

      let trapTag = '';
      let trapSub = '';
      if (item.isHumanTrap) {
        trapTag = `<span class="blunder-type-tag tag-trap" title="直觉盲区：多数人类棋手在此局面都会受直觉诱导而犯下此错">直觉陷阱 💡</span>`;
        if (typeof item.humanProbability === 'number' && item.humanProbability > 0) {
          trapSub = ` · <span class="sub-trap-prob">约 ${Math.round(item.humanProbability)}% 棋手直觉误选</span>`;
        }
      }

      const lossPawnsNum = Math.abs((item.lossCp || 0) / 100).toFixed(1);
      const bestMoveText = (item.bestSan && item.bestSan !== '?') ? item.bestSan : null;

      card.innerHTML = `
        <div class="blunder-card-main">
          <div class="blunder-card-top">
            <div class="blunder-card-title">
              <span class="blunder-move-num">${item.moveNumber}.</span>
              <span class="blunder-side-icon">${sideIcon}</span>
              <span class="blunder-san">${item.san}</span>
            </div>
            <div class="blunder-tags-group">
              ${sevTag}
              ${trapTag}
            </div>
            <span class="blunder-loss-tag" title="相比最佳着法的优势损耗">损耗 ${lossPawnsNum} 兵</span>
          </div>
          <div class="blunder-card-sub">
            ${bestMoveText ? `<span class="sub-best-move">最佳走法: <strong>${bestMoveText}</strong></span>` : ''}
            ${trapSub}
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        // Highlight active card
        this.el.blunderList.querySelectorAll('.blunder-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.goToPly(item.ply);
      });

      this.el.blunderList.appendChild(card);
    });
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

    // Sync active blunder card if present
    const blunderCards = this.el.blunderList.querySelectorAll('.blunder-card');
    blunderCards.forEach(c => {
      if (parseInt(c.dataset.ply, 10) === clampedPly) {
        c.classList.add('active');
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        c.classList.remove('active');
      }
    });

    if (clampedPly === 0) {
      this.el.boardStatusText.textContent = '开局局面';
      this.boardUI.clearArrows();
      this.el.divergenceBadge.textContent = '♟️ 开局';
      this.el.divergenceBadge.style.color = 'var(--brand-green)';
      this.resetComparePanel();
    } else {
      const sideText = currentPos.turn === 'w' ? '白方' : '黑方';
      this.el.boardStatusText.textContent = `第 ${currentPos.moveNumber} 步 (${sideText} ${currentPos.san})`;
      this.updateActivePositionAnalysis();
    }
  }

  updateActivePositionAnalysis() {
    if (this.isBranching) return;
    if (this.currentPly === 0) {
      this.resetComparePanel();
      return;
    }

    const currentPos = this.positions[this.currentPly];
    if (!currentPos) return;

    const moveReview = this.reviewResult?.allMoves?.find(m => m.ply === this.currentPly);

    if (moveReview) {
      const arrows = [];

      // --- Populate three-way comparison cards ---

      // 1. Engine recommendation
      this.el.compareEngineSan.textContent = moveReview.bestSan || '—';
      this.el.compareEngineSan.style.color = 'var(--brand-green)';
      this.el.compareEngineMeta.textContent = moveReview.evalBefore ? `评估 ${moveReview.evalBefore}` : '';

      // 2. Maia intuition (from pre-computed data, with real-time fallback)
      if (moveReview.maiaTopSan) {
        this.el.compareIntuitionSan.textContent = moveReview.maiaTopSan;
        this.el.compareIntuitionSan.style.color = '#e6a520';
        this.el.compareIntuitionMeta.textContent = moveReview.maiaTopProb != null
          ? `概率 ${moveReview.maiaTopProb.toFixed(1)}%`
          : '';
      } else {
        // Fallback: Real-time Maia prediction if not yet stored
        this.el.compareIntuitionSan.textContent = '计算中...';
        this.el.compareIntuitionSan.style.color = 'var(--brand-gold)';
        this.el.compareIntuitionMeta.textContent = '';

        const targetPly = this.currentPly;
        this.maiaEngine.predict(moveReview.fenBefore || currentPos.fen, this.currentElo).then(pred => {
          if (this.currentPly !== targetPly) return;
          if (pred && pred.moves && pred.moves.length > 0) {
            const top = pred.moves[0];
            moveReview.maiaTopSan = top.san || null;
            moveReview.maiaTopUci = top.uci || null;
            moveReview.maiaTopProb = typeof top.prob === 'number' ? top.prob : null;

            this.el.compareIntuitionSan.textContent = top.san;
            this.el.compareIntuitionSan.style.color = '#e6a520';
            this.el.compareIntuitionMeta.textContent = top.prob != null ? `概率 ${top.prob.toFixed(1)}%` : '';

            // Update match badge
            const cleanPlayed = moveReview.san.replace(/[+#?!]/g, '');
            const cleanMaia = (top.san || '').replace(/[+#?!]/g, '');
            const cleanBest = (moveReview.bestSan || '').replace(/[+#?!]/g, '');
            if (cleanPlayed && cleanPlayed === cleanMaia && cleanPlayed !== cleanBest) {
              this.el.comparePlayedSan.innerHTML = `${moveReview.san} <span class="compare-match-badge" style="background: rgba(230,165,32,0.15); color: #e6a520;">= 直觉</span>`;
            }

            // Draw gold arrow if different from engine best
            if (top.uci && top.uci !== moveReview.bestUci) {
              arrows.push({
                from: top.uci.slice(0, 2),
                to: top.uci.slice(2, 4),
                color: 'gold',
                label: `${top.san} ${top.prob != null ? Math.round(top.prob) + '%' : ''}`
              });
              this.boardUI.setArrows(arrows);
            }
          } else {
            this.el.compareIntuitionSan.textContent = '—';
            this.el.compareIntuitionSan.style.color = 'var(--text-dim)';
          }
        });
      }

      // 3. Played move
      this.el.comparePlayedSan.textContent = moveReview.san;
      this.el.comparePlayedMeta.textContent = moveReview.evalAfter ? `结果 ${moveReview.evalAfter}` : '';

      // Highlight played card based on severity
      const playedCard = this.el.comparePlayedCard;
      playedCard.classList.remove('is-blunder');
      if (moveReview.severity === 'blunder' || moveReview.severity === 'mistake') {
        this.el.comparePlayedSan.style.color = 'var(--brand-red)';
        playedCard.classList.add('is-blunder');
      } else {
        this.el.comparePlayedSan.style.color = 'var(--text-main)';
      }

      // Check for match badges
      const cleanPlayed = moveReview.san.replace(/[+#?!]/g, '');
      const cleanBest = (moveReview.bestSan || '').replace(/[+#?!]/g, '');
      const cleanMaia = (moveReview.maiaTopSan || '').replace(/[+#?!]/g, '');

      // Add match indicator if played == engine best
      if (cleanPlayed && cleanBest && cleanPlayed === cleanBest) {
        this.el.comparePlayedSan.innerHTML = `${moveReview.san} <span class="compare-match-badge">= 引擎</span>`;
      } else if (cleanPlayed && cleanMaia && cleanPlayed === cleanMaia) {
        this.el.comparePlayedSan.innerHTML = `${moveReview.san} <span class="compare-match-badge" style="background: rgba(230,165,32,0.15); color: #e6a520;">= 直觉</span>`;
      }

      // --- Badge ---
      if (moveReview.severity === 'blunder') {
        this.el.divergenceBadge.textContent = '⚠️ 大漏';
        this.el.divergenceBadge.style.color = 'var(--brand-red)';
      } else if (moveReview.severity === 'mistake') {
        this.el.divergenceBadge.textContent = '⚠️ 失误';
        this.el.divergenceBadge.style.color = 'var(--brand-red)';
      } else if (moveReview.severity === 'inaccuracy') {
        this.el.divergenceBadge.textContent = '⚡ 疑问手';
        this.el.divergenceBadge.style.color = 'var(--brand-gold)';
      } else {
        this.el.divergenceBadge.textContent = '✓ 正常';
        this.el.divergenceBadge.style.color = 'var(--brand-green)';
      }

      // --- Arrows ---
      // Green arrow: Stockfish best (only if different from played)
      if (moveReview.bestUci && moveReview.bestUci.length >= 4 && cleanPlayed !== cleanBest) {
        arrows.push({
          from: moveReview.bestUci.slice(0, 2),
          to: moveReview.bestUci.slice(2, 4),
          color: 'green',
          label: moveReview.bestSan
        });
      }

      // Gold arrow: Maia top pick (if different from both played and engine best)
      if (moveReview.maiaTopUci && moveReview.maiaTopUci.length >= 4) {
        const maiaFrom = moveReview.maiaTopUci.slice(0, 2);
        const maiaTo = moveReview.maiaTopUci.slice(2, 4);
        const isDiffFromBest = moveReview.maiaTopUci !== moveReview.bestUci;
        const isDiffFromPlayed = cleanMaia !== cleanPlayed;
        if (isDiffFromPlayed || isDiffFromBest) {
          arrows.push({
            from: maiaFrom,
            to: maiaTo,
            color: 'gold',
            label: `${moveReview.maiaTopSan} ${moveReview.maiaTopProb != null ? moveReview.maiaTopProb.toFixed(0) + '%' : ''}`
          });
        }
      }

      // Red dashed arrow: played move (only if it's a blunder/mistake)
      if ((moveReview.severity === 'blunder' || moveReview.severity === 'mistake') && moveReview.from && moveReview.to) {
        arrows.push({
          from: moveReview.from,
          to: moveReview.to,
          color: 'red',
          dashed: true,
          label: moveReview.san
        });
      }

      this.boardUI.setArrows(arrows);
    } else {
      // Review data not yet computed for this ply - provide real-time dual-engine preview
      this.el.divergenceBadge.textContent = '⚡ 实时分析中';
      this.el.divergenceBadge.style.color = 'var(--brand-gold)';

      // Immediately display played move
      this.el.comparePlayedSan.textContent = currentPos.san;
      this.el.comparePlayedSan.style.color = 'var(--text-main)';
      this.el.comparePlayedMeta.textContent = '';
      this.el.comparePlayedCard.classList.remove('is-blunder');

      // Set placeholders
      this.el.compareEngineSan.textContent = '计算中...';
      this.el.compareEngineSan.style.color = 'var(--brand-gold)';
      this.el.compareEngineMeta.textContent = '';
      this.el.compareIntuitionSan.textContent = '计算中...';
      this.el.compareIntuitionSan.style.color = 'var(--brand-gold)';
      this.el.compareIntuitionMeta.textContent = '';

      const prevPos = this.positions[this.currentPly - 1];
      const evalFen = prevPos ? prevPos.fen : currentPos.fen;
      const targetPly = this.currentPly;
      const arrows = [];

      // Fallback realtime Maia prediction
      this.maiaEngine.predict(evalFen, this.currentElo).then(pred => {
        if (this.currentPly !== targetPly) return;
        if (pred && pred.moves && pred.moves.length > 0) {
          const top = pred.moves[0];
          this.el.compareIntuitionSan.textContent = top.san || '—';
          this.el.compareIntuitionSan.style.color = '#e6a520';
          this.el.compareIntuitionMeta.textContent = top.prob != null ? `概率 ${top.prob.toFixed(1)}%` : '';
          if (top.uci) {
            arrows.push({
              from: top.uci.slice(0, 2),
              to: top.uci.slice(2, 4),
              color: 'gold',
              label: `${top.san} (${top.prob}%)`
            });
            this.boardUI.setArrows(arrows);
          }
        } else {
          this.el.compareIntuitionSan.textContent = '—';
          this.el.compareIntuitionSan.style.color = 'var(--text-dim)';
        }
      });

      // Fallback realtime Stockfish evaluation
      if (this.stockfish?.isReady) {
        this.stockfish.evaluate(evalFen, 6, 2500, 1).then(sfRes => {
          if (this.currentPly !== targetPly) return;
          if (sfRes && sfRes.bestMove) {
            this.el.compareEngineSan.textContent = sfRes.bestMove.san || '—';
            this.el.compareEngineSan.style.color = 'var(--brand-green)';
            this.el.compareEngineMeta.textContent = `评估 ${sfRes.score}`;
            arrows.push({
              from: sfRes.bestMove.fromSq,
              to: sfRes.bestMove.toSq,
              color: 'green',
              label: sfRes.bestMove.san
            });
            this.boardUI.setArrows(arrows);
          } else {
            this.el.compareEngineSan.textContent = '—';
            this.el.compareEngineSan.style.color = 'var(--text-dim)';
          }
        });
      }
    }
  }

  resetComparePanel() {
    this.el.compareEngineSan.textContent = '—';
    this.el.compareEngineSan.style.color = 'var(--text-dim)';
    this.el.compareEngineMeta.textContent = '';
    this.el.compareIntuitionSan.textContent = '—';
    this.el.compareIntuitionSan.style.color = 'var(--text-dim)';
    this.el.compareIntuitionMeta.textContent = '';
    this.el.comparePlayedSan.textContent = '—';
    this.el.comparePlayedSan.style.color = 'var(--text-dim)';
    this.el.comparePlayedMeta.textContent = '';
    this.el.comparePlayedCard.classList.remove('is-blunder');
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

    this.el.divergenceBadge.textContent = '🌿 分支试演';
    this.el.divergenceBadge.style.color = 'var(--brand-gold)';
    this.resetComparePanel();
    this.el.comparePlayedSan.textContent = move.san || move.uci;
    this.el.comparePlayedSan.style.color = 'var(--text-main)';

    // Realtime dual-engine evaluation on branch position
    const arrows = [];

    // Maia Prediction (instant)
    this.maiaEngine.predict(newFen, this.currentElo).then(pred => {
      if (!this.isBranching || this.branchFen !== newFen) return;
      if (pred && pred.moves && pred.moves.length > 0) {
        const m = pred.moves[0];
        this.el.compareIntuitionSan.textContent = m.san || '—';
        this.el.compareIntuitionSan.style.color = '#e6a520';
        this.el.compareIntuitionMeta.textContent = m.prob != null ? `概率 ${m.prob.toFixed(1)}%` : '';
        if (m.uci) {
          arrows.push({
            from: m.uci.slice(0, 2),
            to: m.uci.slice(2, 4),
            color: 'gold',
            label: `${m.san} (${m.prob}%)`
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
          this.el.compareEngineSan.textContent = sfRes.bestMove.san || '—';
          this.el.compareEngineSan.style.color = 'var(--brand-green)';
          this.el.compareEngineMeta.textContent = `评估 ${sfRes.score} (d${sfRes.depth})`;
          arrows.push({
            from: sfRes.bestMove.fromSq,
            to: sfRes.bestMove.toSq,
            color: 'green',
            label: `${sfRes.bestMove.san || ''} (${sfRes.score})`
          });
          this.boardUI.setArrows(arrows);
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

// Safe instantiation for both pre-loaded and deferred execution
function initApp() {
  if (!window.__maiaStudioApp) {
    window.__maiaStudioApp = new AnalysisStudioApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
