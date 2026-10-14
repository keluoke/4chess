import { authorizeScan, showScanLock } from './scan-authorization.js';
/**
 * Maia-3 Standalone Deep Analysis Studio Application Coordinator
 * High-performance, zero-latency, 100% self-contained chess analysis workstation.
 */

import { ChessBoard } from '../engine/chess-core.js?v=20261014-scan1';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js?v=20261014-scan1';
import { MaiaEngine } from '../engine/maia-engine.js?v=20261014-scan1';
import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261014-scan1';
import { BoardUI } from './board-ui.js?v=20261014-scan1';
import { EvalChart } from './eval-chart.js?v=20261014-scan1';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261014-scan1';
import { PositionAnalysis } from './position-analysis.js?v=20261014-scan1';
import { STOCKFISH_VARIANTS, MAIA_VARIANTS } from '../engine/engine-variants.js?v=20261014-scan1';
import { soundEffects } from './sound-effects.js?v=20261014-scan1';
import { t, getLang, setLanguage, toggleLanguage, initI18n, onLanguageChange } from './i18n.js?v=20261014-scan1';
import { initializePreferences, getPreferences, savePreferences, subscribePreferences, preferencesLinked, engineExperienceHint } from '../engine/engine-preferences.js';

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

    const preferences = getPreferences();
    this.currentElo = preferences.defaultElo;
    this.engineVariant = preferences.stockfishVariant;
    this.modelVariant = preferences.maiaVariant;
    if (location.protocol === 'chrome-extension:') this.engineVariant = 'lite';
    this.moves = [];
    this.positions = [];
    this.reviewResult = null;
    this.currentPly = 0;
    this.gameEpoch = 0;
    this.reviewEpoch = 0;
    this.currentGameKey = '';

    this.isBranching = false;
    this.savedBranches = [];
    this.branchFen = null;
    this.isPlaying = false;
    this.playTimer = null;
    this.currentDivergenceFilter = 'all';
    this.isReviewingMove = false;
    this.hasAnalysisInput = false;
    this.settings = { arrows: preferences.showArrows || preferences.showStockfishArrows, maiaArrows: preferences.showArrows, sfArrows: preferences.showStockfishArrows, heatmap: preferences.showHeatmap, probability: preferences.showProbability };

    this.initElements();
    initI18n();
    onLanguageChange(() => { this.refreshAfterLanguageChange(); if (!this.applyingPreferences) savePreferences({ maia3_lang: getLang() }); });

    this.initEngines();
    this.initUI();
    this.bindEvents();
    this.applyPreferences({ ...preferences, maiaVariant: this.modelVariant, stockfishVariant: location.protocol === 'chrome-extension:' ? preferences.stockfishVariant : this.engineVariant });
    subscribePreferences(next => this.applyPreferences(next));
    this.headerObserver = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--studio-header-height', `${Math.ceil(document.querySelector('.studio-navbar').getBoundingClientRect().height)}px`);
    });
    this.headerObserver.observe(document.querySelector('.studio-navbar'));
    this.loadInitialGame();
  }

  initElements() {
    this.el = {
      btnLangToggle: document.getElementById('btn-lang-toggle'),
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
      btnSound: document.getElementById('btn-sound'),
      iconSoundOn: document.getElementById('icon-sound-on'),
      iconSoundOff: document.getElementById('icon-sound-off'),
      boardStatusText: document.getElementById('board-status-text'),
      progressCard: document.getElementById('analysis-progress-card'),
      phaseText: document.getElementById('analysis-phase-text'),
      percentText: document.getElementById('analysis-percent-text'),
      progressBar: document.getElementById('analysis-progress-bar'),
      evalChartContainer: document.getElementById('eval-chart-container'),
      divergenceContent: document.getElementById('divergence-content'),
      blunderCountBadge: document.getElementById('blunder-count-badge'),
      moveCountBadge: document.getElementById('move-count-badge'),
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
      positionDepth: document.getElementById('position-depth'),
      settingsDialog: document.getElementById('review-settings'),
      btnSettings: document.getElementById('btn-settings')
    };
  }

  initEngines({ keepStockfish = false } = {}) {
    if (!keepStockfish) this.stockfish = new StockfishInBrowser({ variant: this.engineVariant });
    const stockfish = this.stockfish;
    stockfish.onDownloadProgress = () => { if (this.stockfish === stockfish) this.updateEngineStatus(); };
    const maia = new MaiaEngine(() => { if (this.maiaEngine === maia) this.updateEngineStatus(); }, this.stockfish, { variant: this.modelVariant });
    this.maiaEngine = maia;
    this.analyzer = new GameAnalyzer(this.stockfish, this.maiaEngine);
    document.getElementById('engine-edition').value = this.engineVariant;
    document.getElementById('intuition-edition').value = this.modelVariant;
    if (location.protocol === 'chrome-extension:') {
      document.querySelector('#engine-edition option[value="standard"]').disabled = true;
      document.getElementById('extension-standard-note').hidden = false;
    }
    // Empty visits stay idle; initialize only for an imported position or completed-game review.
    this.updateEngineStatus();

    // Register PWA File Handling API (launchQueue)
    if ('launchQueue' in window && typeof window.LaunchParams !== 'undefined' && 'files' in window.LaunchParams.prototype) {
      window.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.files || !launchParams.files.length) return;
        for (const fileHandle of launchParams.files) {
          try {
            const file = await fileHandle.getFile();
            const text = await file.text();
            if (text) {
              this.smartLoadInput(text, file.name);
              break;
            }
          } catch (e) {
            console.warn('[PWA] launchQueue file load failed:', e);
          }
        }
      });
    }
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

    this.positionAnalysis = new PositionAnalysis(this);

    // 3. Initialize Sound Toggle state
    this.updateSoundToggleUI();
  }

  updateSoundToggleUI() {
    const isEnabled = soundEffects.enabled;
    if (this.el.iconSoundOn) this.el.iconSoundOn.style.display = isEnabled ? 'inline-block' : 'none';
    if (this.el.iconSoundOff) this.el.iconSoundOff.style.display = isEnabled ? 'none' : 'inline-block';
    if (this.el.btnSound) {
      this.el.btnSound.title = isEnabled ? t('btnSoundMute') : t('btnSoundUnmute');
      this.el.btnSound.setAttribute('aria-label', this.el.btnSound.title);
      this.el.btnSound.setAttribute('aria-pressed', String(isEnabled));
      this.el.btnSound.classList.toggle('muted', !isEnabled);
    }
  }

  updateEngineStatus() {
    document.getElementById('name-status-sf').textContent = STOCKFISH_VARIANTS[this.engineVariant].name;
    document.getElementById('name-status-maia').textContent = MAIA_VARIANTS[this.modelVariant].name;
    for (const [name, engine] of [['sf', this.stockfish], ['maia', this.maiaEngine]]) {
      const ready = engine?.isReady;
      const loading = name === 'maia' ? engine?.isLoading : !!engine?.initPromise && !ready;
      const failed = this.maiaEngine?.status?.[name === 'maia' ? 'maia' : 'stockfish']?.state === 'error';
      const status = ready ? 'engineReady' : failed ? 'engineFailed' : loading ? 'engineStarting' : 'engineNotStarted';
      const dot = document.getElementById(`dot-${name}`);
      if (dot) dot.className = `status-dot${ready ? ' ready' : failed ? ' error' : loading ? ' loading' : ''}`;
      const text = document.getElementById(`text-status-${name}`);
      if (text) {
        const progress = name === 'maia' ? this.maiaEngine?.status?.maia : this.stockfish?.downloadProgress;
        text.textContent = loading && progress && (name === 'sf' || progress.state === 'downloading') ? t('modelDownloading', { percent: progress.percent || 0 }) : t(status);
      }
    }
    this.positionAnalysis?.renderLoadingStatuses();
  }

  flipBoard() {
    this.boardUI.flip();
    document.getElementById('setting-orientation').value = this.boardUI.orientation;
    this.positionAnalysis.render();
    savePreferences({ studio_orientation: this.boardUI.orientation });
  }

  bindEvents() {
    for (const id of ['engine-edition', 'intuition-edition']) {
      document.getElementById(id).addEventListener('change', () => this.changeEngineVersions());
    }
    // Language Toggle (if not already bound by i18n module)
    if (this.el.btnLangToggle && !this.el.btnLangToggle.__i18nBound) {
      this.el.btnLangToggle.__i18nBound = true;
      this.el.btnLangToggle.addEventListener('click', () => {
        toggleLanguage();
      });
    }

    // Elo selector
    this.el.eloSelector.addEventListener('change', (e) => {
      this.currentElo = parseInt(e.target.value, 10);
      savePreferences({ defaultElo: this.currentElo });
      try {
        localStorage.setItem('maia3_target_elo', String(this.currentElo));
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ defaultElo: this.currentElo });
        }
      } catch (err) {}

      this.positionAnalysis.cancel();
      this.positionAnalysis.cache.clear();
      this.currentGameKey = this.getReviewKey();
      // Invalidate review result so old Elo data is not mixed
      this.reviewResult = null;
      if (this.moves && this.moves.length > 0 && !this.isBranching) {
        this.runFullReview(false);
      } else {
        this.updateActivePositionAnalysis();
      }
    });

    // Board controls
    this.el.btnFirst.addEventListener('click', () => this.isBranching ? this.showBranchPosition(0) : this.goToPly(0));
    this.el.btnPrev.addEventListener('click', () => this.navigateStudy(-1));
    this.el.btnNext.addEventListener('click', () => this.navigateStudy(1));
    this.el.btnLast.addEventListener('click', () => this.isBranching ? this.showBranchPosition(this.activeBranch.moves.length) : this.goToPly(this.positions.length - 1));
    document.getElementById('btn-clear-thought-arrows').addEventListener('click', () => this.boardUI.clearAnnotations());
    this.el.btnFlip.addEventListener('click', () => this.flipBoard());
    if (this.el.btnSound) {
      this.el.btnSound.addEventListener('click', () => {
        const enabled = soundEffects.toggle();
        savePreferences({ diverge_sound_enabled: enabled });
        this.updateSoundToggleUI();
        if (enabled) {
          soundEffects.playMove();
          this.showToast(t('soundEnabled'));
        } else {
          this.showToast(t('soundMuted'));
        }
      });
    }
    this.el.btnPlay.addEventListener('click', () => this.toggleAutoPlay());
    this.el.btnExitBranch.addEventListener('click', () => this.goToPly(this.currentPly));

    this.el.btnSettings.addEventListener('click', () => {
      this.updateEngineStatus();
      this.el.settingsDialog.showModal();
      document.getElementById('btn-close-settings').focus();
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => this.el.settingsDialog.close());
    this.el.settingsDialog.addEventListener('click', event => {
      if (event.target === this.el.settingsDialog) {
        const rect = this.el.settingsDialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.el.settingsDialog.close();
      }
    });
    this.el.settingsDialog.addEventListener('close', () => this.el.btnSettings.focus());
    this.el.positionDepth.addEventListener('change', () => { savePreferences({ studio_depth: Number(this.el.positionDepth.value) }); this.positionAnalysis.refresh(); });
    for (const [id, key] of [['setting-arrows', 'arrows'], ['setting-heatmap', 'heatmap'], ['setting-probability', 'probability']]) {
      document.getElementById(id).addEventListener('change', event => {
        this.settings[key] = event.target.checked;
        if (key === 'arrows') this.settings.maiaArrows = this.settings.sfArrows = event.target.checked;
        savePreferences(key === 'arrows' ? { showArrows: event.target.checked, showStockfishArrows: event.target.checked } : { [key === 'heatmap' ? 'showHeatmap' : 'showProbability']: event.target.checked });
        if (key === 'heatmap') this.positionAnalysis.refresh();
        else this.positionAnalysis.render();
      });
    }
    document.getElementById('setting-orientation').addEventListener('change', event => {
      this.boardUI.setOrientation(event.target.value);
      savePreferences({ studio_orientation: event.target.value });
      this.positionAnalysis.render();
    });

    // Divergence Category Filter Pills
    const filterPills = document.querySelectorAll('.divergence-filters .filter-pill');
    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentDivergenceFilter = pill.dataset.filter || 'all';
        const rawMoments = (this.reviewResult?.keyMoments || this.reviewResult?.allMoves || []);
        const validMoments = rawMoments.filter(
          m => m.divergenceType === 'beyond_intuition' || m.divergenceType === 'intuition_trap'
        ).sort((a, b) => a.ply - b.ply);
        this.renderBlunderCards(validMoments);
      });
    });


    // PGN Import Modal
    this.el.btnImportPgn.addEventListener('click', () => {
      this.openPgnModal();
    });
    this.el.btnCancelPgn.addEventListener('click', () => {
      this.closePgnModal();
    });
    this.el.pgnModal.addEventListener('click', (e) => {
      if (e.target === this.el.pgnModal) this.closePgnModal();
    });

    this.el.btnSubmitPgn.addEventListener('click', async () => {
      const input = this.el.pgnInput.value.trim();
      if (!input) return;
      this.closePgnModal();
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
          this.closePgnModal();
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
      if (this.el.settingsDialog.open) return;
      if (this.el.pgnModal.classList.contains('open')) {
        if (e.key === 'Escape') { e.preventDefault(); this.closePgnModal(); }
        if (e.key === 'Tab') {
          const controls = [...this.el.pgnModal.querySelectorAll('button, textarea, input, select')].filter(el => !el.disabled && el.getClientRects().length);
          const first = controls[0], last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
        return;
      }
      if (this.boardUI.promotionPicker) {
        if (e.key === 'Escape') { e.preventDefault(); this.boardUI.closePromotion(); }
        return;
      }
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey || document.activeElement?.isContentEditable || document.activeElement?.closest('input, textarea, select, [role="textbox"]')) return;

      if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        this.navigateStudy(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'k') {
        e.preventDefault();
        this.navigateStudy(1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (this.isBranching) this.showBranchPosition(0); else this.goToPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (this.isBranching) this.showBranchPosition(this.activeBranch.moves.length); else this.goToPly(this.positions.length - 1);
      } else if ((e.key === ' ' || e.code === 'Space') && !document.activeElement?.closest('button, a')) {
        e.preventDefault();
        this.toggleAutoPlay();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.flipBoard();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (this.el.btnSound) this.el.btnSound.click();
      }
    });
  }

  refreshAfterLanguageChange() {
    if (!this.el) return;
    this.updatePreferenceNotes();
    this.renderStudyBranches();

    // 1. Meta player names if default
    if (this.el.metaWhite) {
      if (/^⚪ (白方|White)$/.test(this.el.metaWhite.textContent)) {
        this.el.metaWhite.textContent = t('whitePlayer');
      }
    }
    const sideLabelW = document.getElementById('metric-side-white');
    if (sideLabelW) sideLabelW.textContent = t('whitePlayer');
    const sideLabelB = document.getElementById('metric-side-black');
    if (sideLabelB) sideLabelB.textContent = t('blackPlayer');

    if (this.el.metaBlack) {
      if (/^⚫ (黑方|Black)$/.test(this.el.metaBlack.textContent)) {
        this.el.metaBlack.textContent = t('blackPlayer');
      }
    }

    // 2. Tab labels
    const lblBlunders = document.getElementById('lbl-tab-blunders');
    if (lblBlunders) lblBlunders.textContent = t('tabKeyMoments', { count: '' }).replace(/\(\s*\)/, '').trim();
    const lblMoves = document.getElementById('lbl-tab-moves');
    if (lblMoves) lblMoves.textContent = t('tabNotation', { count: '' }).replace(/\(\s*\)/, '').trim();

    // 3. Filter pills
    const lblFilterAll = document.getElementById('lbl-filter-all');
    if (lblFilterAll) lblFilterAll.textContent = t('filterAll', { count: '' }).replace(/\(\s*\)/, '').trim();
    const lblFilterBeyond = document.getElementById('lbl-filter-beyond');
    if (lblFilterBeyond) lblFilterBeyond.textContent = t('beyondText');
    const lblFilterTrap = document.getElementById('lbl-filter-trap');
    if (lblFilterTrap) lblFilterTrap.textContent = t('trapText');

    // 4. Board status text & comparison panel
    if (this.currentPly === 0) {
      this.el.boardStatusText.textContent = t('startingPosition');

    } else if (this.positions && this.positions[this.currentPly]) {
      const currentPos = this.positions[this.currentPly];
      const sideText = currentPos.turn === 'w' ? t('whitePlayer').replace('⚪ ', '') : t('blackPlayer').replace('⚫ ', '');
      this.el.boardStatusText.textContent = t('moveIndicator', { move: currentPos.moveNumber, side: sideText, san: currentPos.san });
      if (this.isReviewingMove) this.el.boardStatusText.textContent = t('reviewMoveBefore', { move: currentPos.san, number: currentPos.moveNumber });
    }

    if (this.isBranching) this.el.boardStatusText.textContent = t('badgeBranch');
    this.positionAnalysis?.render();
    this.updateEngineStatus();

    // 4.1 Update progress card and loading state if currently reviewing
    if (this.el.progressCard && this.el.progressCard.style.display !== 'none') {
      const detailEl = document.getElementById('blunder-loading-detail');
      const titleEl = detailEl?.previousElementSibling;
      if (titleEl) titleEl.textContent = t('launchingEngines');
      if (this.reviewPendingResume) {
        this.el.phaseText.textContent = t('reviewPausedForPosition');
        if (detailEl) detailEl.textContent = t('reviewResumeHint');
      } else if (this.lastProgress) {
        const prog = this.lastProgress;
        const txt = prog.phase === 'intuition'
          ? t('analyzingIntuition', { current: prog.current, total: prog.total, move: prog.currentMove || '' })
          : t('evaluatingEngine', { current: prog.current, total: prog.total, move: prog.currentMove || '' });
        this.el.phaseText.textContent = txt;
        if (detailEl) detailEl.textContent = txt;
      } else {
        this.el.phaseText.textContent = t('preparingEngine');
        if (detailEl) detailEl.textContent = t('startingEngines');
      }
    }

    // 4.2 Update control button tooltips
    if (this.el.btnPlay) {
      this.el.btnPlay.title = this.isPlaying ? t('btnPlayPause') : t('btnPlayStart');
    }
    this.updateSoundToggleUI();

    // 5. Blunder list or empty hero state
    if (!this.moves || this.moves.length === 0) {
      this.renderEmptyHomeState();
    } else if (this.reviewResult) {
      const rawMoments = (this.reviewResult?.keyMoments || this.reviewResult?.allMoves || []);
      const validMoments = rawMoments.filter(
        m => m.divergenceType === 'beyond_intuition' || m.divergenceType === 'intuition_trap'
      ).sort((a, b) => a.ply - b.ply);
      this.renderBlunderCards(validMoments);
      this.annotateMoveList(this.reviewResult?.allMoves);

      const elAccW = document.getElementById('val-accuracy-white');
      const elAccB = document.getElementById('val-accuracy-black');
      if (elAccW && this.reviewResult.coverageRateWhite != null && this.reviewResult.coverageRateWhite < 100) {
        elAccW.title = t('coverageTooltip', { pct: this.reviewResult.coverageRateWhite });
      }
      if (elAccB && this.reviewResult.coverageRateBlack != null && this.reviewResult.coverageRateBlack < 100) {
        elAccB.title = t('coverageTooltip', { pct: this.reviewResult.coverageRateBlack });
      }
    }
  }

  toggleAutoPlay() {
    if (this.isPlaying) {
      clearInterval(this.playTimer);
      this.isPlaying = false;
      this.el.btnPlay.textContent = '▶';
      this.el.btnPlay.title = t('btnPlayStart');
    } else {
      this.isPlaying = true;
      this.el.btnPlay.textContent = '⏸';
      this.el.btnPlay.title = t('btnPlayPause');
      this.playTimer = setInterval(() => {
        if ((this.isBranching ? this.activeBranch.cursor : this.currentPly) < (this.isBranching ? this.activeBranch.moves.length : this.positions.length - 1)) {
          this.navigateStudy(1);
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

  openPgnModal() {
    if (this.el.pgnModal) {
      this.modalReturnFocus = document.activeElement;
      this.el.pgnModal.inert = false;
      this.el.pgnModal.setAttribute('aria-hidden', 'false');
      document.querySelector('.studio-navbar').inert = true;
      document.querySelector('.studio-layout').inert = true;
      this.el.pgnModal.classList.add('open');
      this.el.pgnInput?.focus();
    }
  }

  closePgnModal() {
    if (this.el.pgnModal) {
      this.el.pgnModal.classList.remove('open');
      this.el.pgnModal.inert = true;
      this.el.pgnModal.setAttribute('aria-hidden', 'true');
      document.querySelector('.studio-navbar').inert = false;
      document.querySelector('.studio-layout').inert = false;
      this.modalReturnFocus?.focus();
    }
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
      this.showToast(t('toastFetchingLichess', { gameId }), 5000);
      try {
        const resp = await fetch(`https://lichess.org/game/export/${gameId}?moves=true&pgnInJson=true&clocks=true`, {
          headers: { 'Accept': 'application/json' }
        });
        if (resp.ok) {
          const data = await resp.json();
          // Boundary Fair Play Verification: strictly refuse active matches!
          const v = FairPlayGuard.verifyConcludedGame(data);
          if (!v.ok) {
            this.analyzer.cancel();
            this.showToast(t('toastFairPlayReview', { reason: v.reason }), 7000);
            return false;
          }
          if (data.pgn && data.pgn.includes('1.')) {
            this.showToast(t('toastLoadedLichess', { gameId }));
            this.startNewSession({ pgn: data.pgn, autoReview: true });
            return true;
          }
        }
      } catch (err) {
        console.warn('[Analysis Studio] Lichess export error:', err);
      }
      this.showToast(t('toastFailedLichess'));
      return false;
    }

    // 2. Detect Chess.com Game URL or Game ID
    // Supports:
    // - https://www.chess.com/analysis/game/live/184602606266/review?flip=false
    // - https://www.chess.com/analysis/game/live/184602606266
    // - https://www.chess.com/analysis/game/daily/184602606266
    // - https://www.chess.com/game/live/184602606266
    // - https://www.chess.com/game/daily/184602606266
    // - https://www.chess.com/play/online/game/184602606266
    // - Bare Chess.com ID: 184602606266
    let chesscomGameId = null;
    let chesscomType = 'live';

    if (text.includes('chess.com') || /^\d{8,16}$/.test(text)) {
      const idMatch = text.match(/(\d{8,16})/);
      if (idMatch) {
        chesscomGameId = idMatch[1];
        chesscomType = text.toLowerCase().includes('daily') ? 'daily' : 'live';
      }
    }

    if (chesscomGameId) {
      const type = chesscomType;
      const gameId = chesscomGameId;
      this.showToast(t('toastFetchingChesscom', { gameId }), 5000);

      let fetchedData = null;

      // Strategy A: Chrome extension background service worker (direct fetch with extension permissions)
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const res = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'FETCH_CHESSCOM_GAME_PGN', gameId, gameType: type }, resolve);
          });
          if (res?.ok) {
            fetchedData = res;
          }
        } catch (e) {}
      }

      // Strategy B: Cloudflare edge proxy (relative /api/chesscom or absolute 4chess.cc edge)
      if (!fetchedData) {
        const candidateProxies = [
          `/api/chesscom?id=${gameId}&type=${type}`,
          `https://4chess.cc/api/chesscom?id=${gameId}&type=${type}`
        ];
        for (const proxyUrl of candidateProxies) {
          try {
            const resp = await fetch(proxyUrl);
            if (resp.ok) {
              const data = await resp.json();
              if (data && (data.game || data.moveList || data.pgn)) {
                fetchedData = data;
                break;
              }
            }
          } catch (err) {}
        }
      }

      if (fetchedData) {
        const gameObj = fetchedData.game || fetchedData;
        const v = FairPlayGuard.verifyConcludedGame(gameObj);
        if (!v.ok) {
          this.analyzer.cancel();
          this.showToast(t('toastFairPlayReview', { reason: v.reason }), 7000);
          return false;
        }

        // 1. Direct PGN string
        let pgn = gameObj.pgn || fetchedData.pgn;
        if (pgn && typeof pgn === 'string' && pgn.includes('1.')) {
          this.showToast(t('toastLoadedChesscom', { gameId }));
          this.startNewSession({ pgn, autoReview: true });
          return true;
        }

        // 2. Decode TCN moveList
        const moveList = gameObj.moveList || fetchedData.moveList;
        if (moveList) {
          const moves = GameAnalyzer.tcnToSanMoves(moveList);
          if (moves && moves.length > 0) {
            const headers = gameObj.pgnHeaders || fetchedData.pgnHeaders || {};
            const white = headers.White || fetchedData.players?.bottom?.username || gameObj.whiteUser || 'White';
            const black = headers.Black || fetchedData.players?.top?.username || gameObj.blackUser || 'Black';
            const result = headers.Result || (gameObj.colorOfWinner === 'white' ? '1-0' : (gameObj.colorOfWinner === 'black' ? '0-1' : '1/2-1/2'));
            const generatedPgn = GameAnalyzer.movesToPgn(moves, {
              ...headers,
              White: white,
              Black: black,
              Result: result
            });
            this.showToast(t('toastLoadedChesscom', { gameId }));
            this.startNewSession({
              pgn: generatedPgn,
              moves,
              white,
              black,
              result,
              autoReview: true
            });
            return true;
          }
        }
      }

      this.showToast(t('toastFailedChesscom'));
      return false;
    }

    // 3. Detect FEN Position string (Single position / puzzle)
    const fenParts = text.split(/\s+/);
    if (fenParts.length >= 2 && fenParts[0].split('/').length === 8) {
      const ok = this.startNewSession({
        fen: text,
        white: t('freeAnalysisBoard'),
        black: 'FEN',
        result: '*',
        autoReview: false
      });
      if (ok) {
        this.showToast(t('toastLoadedFen'));
        return true;
      }
    }

    // 4. Default: Standard PGN text
    if (text.includes('1.') || text.includes('[Event')) {
      const v = FairPlayGuard.verifyConcludedGame(text);
      if (!v.ok && v.isLive) {
        this.analyzer.cancel();
        this.showToast(t('toastFairPlayReview', { reason: v.reason }), 7000);
        return false;
      }
      const label = sourceName ? ` (${sourceName})` : '';
      const ok = this.startNewSession({ pgn: text, autoReview: true });
      if (ok) {
        this.showToast(t('toastLoadedPgn', { label }));
        return true;
      }
      return false;
    }

    this.showToast(t('toastUnrecognizedInput'));
    return false;
  }

  async loadInitialGame() {
    let loaded = false;

    // 1. Try URL parameters (Hash # or Search ?)
    try {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(window.location.search);

      const langParam = hashParams.get('lang') || searchParams.get('lang');
      if (langParam === 'zh' || langParam === 'en') {
        setLanguage(langParam);
      }

      const fenParam = hashParams.get('fen') || searchParams.get('fen');
      if (fenParam) {
        const validBoard = new ChessBoard();
        if (!validBoard.load(fenParam)) throw new Error('Invalid FEN');
        this.startNewSession({ fen: validBoard.getFen(), white: t('freeAnalysisBoard'), black: 'FEN', result: '*', autoReview: false, positionInput: true });
        const orientation = hashParams.get('orientation') || searchParams.get('orientation');
        this.boardUI.setOrientation(orientation === 'black' ? 'black' : 'white');
        this.updateEvaluationGauge?.();
        return;
      }
      const textParam = hashParams.get('text') || searchParams.get('text');
      const pgnParam = hashParams.get('pgn') || searchParams.get('pgn') || (textParam && (textParam.includes('1.') || textParam.includes('[Event')) ? textParam : null);
      const urlParam = hashParams.get('url') || searchParams.get('url') || (textParam && textParam.startsWith('http') ? textParam : null);
      const eloParam = hashParams.get('elo') || searchParams.get('elo');

      const whiteParam = hashParams.get('white') || searchParams.get('white');
      const blackParam = hashParams.get('black') || searchParams.get('black');
      const resultParam = hashParams.get('result') || searchParams.get('result');

      if (eloParam) {
        const parsedElo = parseInt(eloParam, 10);
        if ([1100, 1500, 1900, 2200].includes(parsedElo)) {
          this.currentElo = parsedElo;
          if (this.el.eloSelector) this.el.eloSelector.value = String(parsedElo);
        }
      }

      if (pgnParam) {
        let cleanPgn = pgnParam;
        if (cleanPgn.includes('%')) {
          try {
            const reDecoded = decodeURIComponent(cleanPgn);
            if (reDecoded) cleanPgn = reDecoded;
          } catch (e) {}
        }
        if (cleanPgn) {
          const v = FairPlayGuard.verifyConcludedGame(cleanPgn);
          if (!v.ok && v.isLive) {
            this.showToast(t('toastFairPlay', { reason: v.reason }), 7000);
          } else {
            this.startNewSession({
              pgn: cleanPgn,
              white: whiteParam,
              black: blackParam,
              result: resultParam,
              autoReview: true
            });
            loaded = true;
            return;
          }
        }
      }

      if (urlParam) {
        let cleanUrl = urlParam;
        if (cleanUrl.includes('%')) {
          try {
            const reDecoded = decodeURIComponent(cleanUrl);
            if (reDecoded) cleanUrl = reDecoded;
          } catch (e) {}
        }
        if (cleanUrl) {
          const ok = await this.smartLoadInput(cleanUrl);
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
          const v = FairPlayGuard.verifyConcludedGame(game);
          if (!v.ok && v.isLive) {
            this.showToast(t('toastFairPlay', { reason: v.reason }), 7000);
          } else {
            this.startNewSession({
              pgn: game.pgn,
              moves: game.moves,
              white: game.white,
              black: game.black,
              result: game.result,
              cachedReview: game.cachedReview,
              autoReview: !game.cachedReview
            });
            loaded = true;
          }
        }
      } catch (err) {
        console.warn('[Analysis Studio] Storage load error:', err);
      }
    }

    // 3. Clean On-Demand Initial State (Do NOT auto-burn CPU or download weights on empty visits!)
    if (!loaded) {
      this.startNewSession({
        fen: ChessBoard.INITIAL_FEN,
        white: t('whitePlayer').replace('⚪ ', ''),
        black: t('blackPlayer').replace('⚫ ', ''),
        result: '*',
        autoReview: false
      });
      if (this.el.boardStatusText) {
        this.el.boardStatusText.textContent = t('startingPosition');
      }
      if (this.el.divergenceContent) {
        this.el.divergenceContent.textContent = t('heroSubtitle');
      }
      this.renderEmptyHomeState();
    }
  }

  /**
   * Renders an interactive, welcoming hero card for blank landing visits
   */
  renderEmptyHomeState() {
    this.el.blunderList.replaceChildren();

    const heroCard = document.createElement('div');
    heroCard.className = 'studio-home-hero';

    heroCard.innerHTML = `
      <div class="home-hero-header">
        <div class="home-hero-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21v-8"></path>
            <path d="M12 13c0-4.5-6-4.5-6-9"></path>
            <path d="M12 13c0-4.5 6-4.5 6-9"></path>
            <polyline points="3 7 6 4 9 7"></polyline>
            <polyline points="15 7 18 4 21 7"></polyline>
          </svg>
        </div>
        <div class="home-hero-title">${t('heroTitle')}</div>
        <div class="home-hero-subtitle">${t('heroSubtitle')}</div>
      </div>

      <div class="home-hero-actions">
        <button type="button" class="btn-home-primary" id="btn-home-import">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          ${t('btnImportCompleted')} →
        </button>
      </div>

      <div class="home-hero-samples">
        <div class="home-samples-label">${t('modalSampleLabel')}</div>
        <div class="home-samples-chips">
          <button type="button" class="btn-sample-chip" id="btn-chip-fischer">${t('chipFischer')}</button>
          <button type="button" class="btn-sample-chip" id="btn-chip-kasparov">${t('chipKasparov')}</button>
        </div>
      </div>

      <div class="home-hero-tips">
        <div class="home-tip-item">${t('tipDragDrop')}</div>
        <div class="home-tip-item">${t('tipPwa')}</div>
      </div>
    `;

    heroCard.querySelector('#btn-home-import')?.addEventListener('click', () => {
      this.openPgnModal();
    });
    heroCard.querySelector('#btn-chip-fischer')?.addEventListener('click', () => {
      this.el.sampleFischer?.click();
      this.el.btnSubmitPgn?.click();
    });
    heroCard.querySelector('#btn-chip-kasparov')?.addEventListener('click', () => {
      this.el.sampleKasparov?.click();
      this.el.btnSubmitPgn?.click();
    });

    this.el.blunderList.appendChild(heroCard);
  }

  /**
   * Unified Game Session Lifecycle Coordinator
   * Guarantees old task cancellation, epoch bumping, UI clearing, and clean state loading.
   */
  startNewSession({
    pgn = null,
    moves = null,
    fen = null,
    white = null,
    black = null,
    result = null,
    cachedReview = null,
    autoReview = true,
    positionInput = false
  } = {}) {
    if (this.scanSourceLocked) return false;
    // 1. Immediately abort running tasks and advance session epochs
    clearTimeout(this.resumeReviewTimer);
    this.fullReviewRunning = this.reviewPendingResume = false;
    this.savedBranches = [];
    this.activeBranch = null;
    this.boardUI.clearAnnotations(true);
    this.renderStudyBranches();
    this.positionAnalysis.cancel();
    this.positionAnalysis.active = null;
    this.positionAnalysis.cache.clear();
    this.analyzer.cancel();
    this.gameEpoch++;
    this.reviewEpoch++;
    this.reviewResult = null;
    this.hasAnalysisInput = !!pgn || !!moves?.length || (!!fen && (fen !== ChessBoard.INITIAL_FEN || positionInput));
    document.body.classList.toggle('position-only', !!fen && !pgn && !moves?.length && this.hasAnalysisInput);
    this.isReviewingMove = false;
    this.isBranching = false;
    this.branchFen = null;
    if (this.el.branchBanner) this.el.branchBanner.style.display = 'none';

    this.el.btnReanalyze.disabled = true;

    // 2. Reset UI state immediately
    this.evalChart.setData([]);
    this.el.blunderCountBadge.textContent = '0';
    this.el.blunderList.replaceChildren();
    this.el.divergenceContent.textContent = '—';
    document.getElementById('review-summary').hidden = true;
    this.el.progressCard.style.display = 'none';
    this.boardUI.clearArrows();
    this.resetPositionPanel();

    // 3. Single FEN setup mode (puzzle, free board, initial start)
    if (fen && (!moves || moves.length === 0) && !pgn) {
      const testBoard = new ChessBoard();
      if (!testBoard.load(fen)) {
        console.warn('[Analysis Studio] Invalid start FEN in session:', fen);
        return false;
      }
      this.moves = [];
      this.positions = [{
        ply: 0,
        moveNumber: testBoard.fullMoves || 1,
        turn: testBoard.turn,
        san: 'Start',
        fen: testBoard.getFen(),
        moveEl: null
      }];
      this.currentGameKey = `fen_${fen.replace(/\s+/g, '_')}`;
      this.el.metaWhite.textContent = `⚪ ${white || t('whitePlayer').replace('⚪ ', '')}`;
      this.el.metaBlack.textContent = `⚫ ${black || t('blackPlayer').replace('⚫ ', '')}`;
      this.el.metaResult.textContent = result || '*';
      this.el.moveCountBadge.textContent = '0';
      this.renderMoveList();
      this.goToPly(0, { silent: true });
      if (autoReview) {
        this.runFullReview(false);
      }
      return true;
    }

    // 4. Game mode (structured moves array or PGN text)
    let parsedMoves = [];
    if (moves && moves.length > 0) {
      parsedMoves = moves;
    } else if (pgn) {
      parsedMoves = GameAnalyzer.parsePgn(pgn);
    }

    if (!parsedMoves || parsedMoves.length === 0) {
      alert(t('errorParseMove'));
      return false;
    }

    if (parsedMoves.startFen) {
      const testBoard = new ChessBoard();
      if (!testBoard.load(parsedMoves.startFen)) {
        alert(t('errorIllegalFen'));
        return false;
      }
    }

    const positions = GameAnalyzer.buildPositionChain(parsedMoves);
    if (!positions || positions.length <= 1) {
      alert(t('errorBuildChain'));
      return false;
    }

    if (positions.isPartial) {
      const validMoves = parsedMoves.slice(0, positions.length - 1);
      validMoves.isPartial = true;
      validMoves.stoppedAtPly = positions.stoppedAtPly;
      validMoves.unparsedSan = positions.unparsedSan;
      validMoves.rawTotalMoves = parsedMoves.length;
      if (parsedMoves.startFen) validMoves.startFen = parsedMoves.startFen;
      this.moves = validMoves;
    } else {
      this.moves = parsedMoves;
    }

    this.positions = positions;
    this.el.btnReanalyze.disabled = false;
    this.currentGameKey = this.getReviewKey();

    // Update metadata headers
    if (pgn) {
      this.parsePgnHeaders(pgn);
      if (white && (this.el.metaWhite.textContent.includes('白方') || this.el.metaWhite.textContent.includes('White') || this.el.metaWhite.textContent === '⚪ ')) {
        this.el.metaWhite.textContent = `⚪ ${white}`;
      }
      if (black && (this.el.metaBlack.textContent.includes('黑方') || this.el.metaBlack.textContent.includes('Black') || this.el.metaBlack.textContent === '⚫ ')) {
        this.el.metaBlack.textContent = `⚫ ${black}`;
      }
      if (result && (!this.el.metaResult.textContent || this.el.metaResult.textContent === '*')) {
        this.el.metaResult.textContent = result;
      }
    } else {
      if (white) this.el.metaWhite.textContent = `⚪ ${white}`;
      if (black) this.el.metaBlack.textContent = `⚫ ${black}`;
      if (result) this.el.metaResult.textContent = result;
    }

    this.el.moveCountBadge.textContent = this.moves.isPartial
      ? t('errorTruncated', { count: this.moves.length })
      : String(this.moves.length);

    this.renderMoveList();
    this.goToPly(0, { silent: true });

    const compatibleReview = cachedReview &&
      (cachedReview.engineKey || 'sf19lite') === this.stockfish.engineKey &&
      (cachedReview.modelKey || 'maia3-5m') === this.maiaEngine.modelKey &&
      (cachedReview.elo == null || cachedReview.elo === this.currentElo);
    if (compatibleReview) {
      this.applyReviewResult(cachedReview);
    } else if (autoReview || cachedReview) {
      this.runFullReview(false);
    }
    return true;
  }

  loadGameData(game) {
    if (!game) return;
    return this.startNewSession({
      pgn: game.pgn,
      moves: game.moves,
      white: game.white,
      black: game.black,
      result: game.result,
      cachedReview: game.cachedReview,
      autoReview: !game.cachedReview
    });
  }

  loadGameFromPgn(pgnText, autoReview = true) {
    if (!pgnText || typeof pgnText !== 'string') return;
    return this.startNewSession({
      pgn: pgnText,
      autoReview
    });
  }

  getReviewKey() {
    return GameAnalyzer.getGameKey(this.moves, { depth: 6, elo: this.currentElo, engineKey: this.stockfish.engineKey, modelKey: this.maiaEngine.modelKey });
  }

  changeEngineVersions({ persist = true } = {}) {
    const engine = document.getElementById('engine-edition').value;
    const model = document.getElementById('intuition-edition').value;
    if (engine === this.engineVariant && model === this.modelVariant) return;
    const engineChanged = engine !== this.engineVariant;
    if (this.isPlaying) this.toggleAutoPlay();
    this.positionAnalysis.cancel();
    this.analyzer.cancel();
    this.reviewEpoch++;
    this.gameEpoch++;
    this.maiaEngine.dispose();
    if (engineChanged) this.stockfish.reset();
    this.engineVariant = engine;
    this.modelVariant = model;
    if (persist) savePreferences({ maiaVariant: model, ...(location.protocol === 'chrome-extension:' ? {} : { stockfishVariant: engine }) });
    this.updatePreferenceNotes();
    try { localStorage.setItem('diverge_engine_versions', JSON.stringify({ engine, model })); } catch {}
    const url = new URL(location.href);
    if (url.searchParams.has('sf') || url.searchParams.has('maia')) {
      url.searchParams.set('sf', engine);
      url.searchParams.set('maia', model);
      history.replaceState(null, '', url);
    }
    this.initEngines({ keepStockfish: !engineChanged });
    this.currentGameKey = this.getReviewKey();
    this.reviewResult = null;
    this.lastProgress = null;
    this.positionAnalysis.cache.clear();
    this.positionAnalysis.active = null;
    this.positionAnalysis.render();
    document.getElementById('review-summary').hidden = true;
    this.el.progressCard.style.display = 'none';
    this.el.blunderList.replaceChildren();
    this.el.blunderCountBadge.textContent = '0';
    for (const id of ['filter-count-all', 'filter-count-beyond', 'filter-count-trap']) document.getElementById(id).textContent = '0';
    this.el.divergenceContent.hidden = true;
    this.renderMoveList();
    if (this.moves.length && !this.isBranching) this.runFullReview();
    else this.updateActivePositionAnalysis();
  }

  scrollWithin(element, container) {
    if (!element || !container) return;
    const item = element.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const delta = item.top < box.top ? item.top - box.top : item.bottom > box.bottom ? item.bottom - box.bottom : 0;
    if (delta) container.scrollTop += delta;
  }

  parsePgnHeaders(pgnText) {
    const whiteMatch = pgnText.match(/\[White\s+"([^"]+)"\]/i);
    const blackMatch = pgnText.match(/\[Black\s+"([^"]+)"\]/i);
    const whiteEloMatch = pgnText.match(/\[WhiteElo\s+"([^"]+)"\]/i);
    const blackEloMatch = pgnText.match(/\[BlackElo\s+"([^"]+)"\]/i);
    const resultMatch = pgnText.match(/\[Result\s+"([^"]+)"\]/i);

    const whiteName = whiteMatch ? whiteMatch[1] : t('whitePlayer').replace('⚪ ', '');
    const blackName = blackMatch ? blackMatch[1] : t('blackPlayer').replace('⚫ ', '');
    const whiteElo = whiteEloMatch ? ` (${whiteEloMatch[1]})` : '';
    const blackElo = blackEloMatch ? ` (${blackEloMatch[1]})` : '';
    const result = resultMatch ? resultMatch[1] : '*';

    this.el.metaWhite.textContent = `⚪ ${whiteName}${whiteElo}`;
    this.el.metaBlack.textContent = `⚫ ${blackName}${blackElo}`;
    this.el.metaResult.textContent = result;
  }

  async runFullReview(forceRefresh = false) {
    if (this.scanSourceLocked) return;
    if (!this.moves || this.moves.length === 0) return;

    this.positionAnalysis.cancel();
    if (forceRefresh) this.positionAnalysis.cache.clear();
    document.getElementById('review-summary').hidden = true;
    const targetGameEpoch = this.gameEpoch;
    const targetReviewEpoch = ++this.reviewEpoch;
    const targetGameKey = this.currentGameKey;
    const targetElo = this.currentElo;
    clearTimeout(this.resumeReviewTimer);
    this.fullReviewRunning = true;
    this.reviewPendingResume = false;

    this.el.progressCard.style.display = 'flex';
    this.el.progressBar.style.width = '0%';
    this.el.percentText.textContent = '0%';
    this.el.phaseText.textContent = t('preparingEngine');
    setTimeout(() => this.updateEngineStatus(), 0);

    this.el.blunderList.replaceChildren();
    const loadingCard = document.createElement('div');
    loadingCard.style.cssText = 'padding: 28px; text-align: center; color: var(--brand-green); font-size: 13px;';
    const lTitle = document.createElement('div');
    lTitle.style.cssText = 'margin-bottom: 8px; font-weight: 600;';
    lTitle.textContent = t('launchingEngines');
    loadingCard.appendChild(lTitle);
    const lDetail = document.createElement('div');
    lDetail.style.cssText = 'font-size: 11.5px; color: var(--text-dim);';
    lDetail.id = 'blunder-loading-detail';
    lDetail.textContent = t('startingEngines');
    loadingCard.appendChild(lDetail);
    this.el.blunderList.appendChild(loadingCard);

    try {
      // Present the current position independently while each engine downloads/prepares.
      this.positionAnalysis.refresh({ calculate: false });
      this.positionAnalysis.pending = this.positionAnalysis.compute(this.positionAnalysis.active);
      await this.positionAnalysis.pending;
      if (this.gameEpoch !== targetGameEpoch || this.reviewEpoch !== targetReviewEpoch || this.isBranching) return;
      this.positionAnalysis.cancel();
      const result = await this.analyzer.analyzeGame(this.moves, {
        depth: 6,
        elo: targetElo,
        forceRefresh,
        onProgress: (prog) => {
          if (this.gameEpoch !== targetGameEpoch || this.reviewEpoch !== targetReviewEpoch) return;
          this.lastProgress = prog;
          this.el.progressBar.style.width = `${prog.percent}%`;
          this.el.percentText.textContent = `${prog.percent}%`;
          const detailEl = document.getElementById('blunder-loading-detail');
          if (prog.phase === 'evaluating') {
            const txt = t('evaluatingEngine', { current: prog.current, total: prog.total, move: prog.currentMove || '' });
            this.el.phaseText.textContent = txt;
            if (detailEl) detailEl.textContent = txt;
          } else if (prog.phase === 'intuition') {
            const txt = t('analyzingIntuition', { current: prog.current, total: prog.total, move: prog.currentMove || '' });
            this.el.phaseText.textContent = txt;
            if (detailEl) detailEl.textContent = txt;
          }
        }
      });

      // Verify epoch and game key to ensure results from a stale task or different game are not applied
      if (this.gameEpoch !== targetGameEpoch || this.reviewEpoch !== targetReviewEpoch || this.currentGameKey !== targetGameKey || this.currentElo !== targetElo) {
        console.log('[Analysis Studio] Discarded stale review result from superseded game/request');
        return;
      }

      this.lastProgress = null;
      this.el.progressCard.style.display = 'none';
      this.updateEngineStatus();
      if (result) {
        this.applyReviewResult(result);
      }
    } catch (err) {
      if (this.gameEpoch !== targetGameEpoch || this.reviewEpoch !== targetReviewEpoch) return;
      this.lastProgress = null;
      console.error('[Analysis Studio] Review failed:', err);
      this.el.progressCard.style.display = 'none';

      this.el.divergenceContent.replaceChildren();
      const errSpan = document.createElement('span');
      errSpan.style.color = 'var(--brand-red)';
      errSpan.textContent = t('errorReviewError', { error: err.message });
      this.el.divergenceContent.appendChild(errSpan);
      this.el.divergenceContent.hidden = false;
      this.updateEngineStatus();
      this.positionAnalysis.refresh();

      this.el.blunderList.replaceChildren();
      const errBox = document.createElement('div');
      errBox.style.cssText = 'padding: 28px; text-align: center; color: var(--brand-red); font-size: 13px;';
      const msgDiv = document.createElement('div');
      msgDiv.style.marginBottom = '8px';
      msgDiv.textContent = t('errorAnalysisFailed', { error: err.message });
      errBox.appendChild(msgDiv);

      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn-header btn-primary';
      retryBtn.style.cssText = 'margin: 0 auto; display: inline-flex;';
      retryBtn.textContent = t('btnRetryAnalysis');
      retryBtn.addEventListener('click', () => this.runFullReview(true));
      errBox.appendChild(retryBtn);

      this.el.blunderList.appendChild(errBox);
    } finally {
      if (this.reviewEpoch === targetReviewEpoch) this.fullReviewRunning = false;
    }
  }

  applyReviewResult(result) {
    this.reviewResult = result;

    // 0. Update Metrics Summary Card (Engine Accuracy)
    const metricsCard = document.getElementById('review-metrics-card');
    if (metricsCard) {
      const elAccW = document.getElementById('val-accuracy-white');
      const elAccB = document.getElementById('val-accuracy-black');

      if (elAccW) elAccW.removeAttribute('title');
      if (elAccB) elAccB.removeAttribute('title');
      // White Accuracy
      if (elAccW) {
        elAccW.textContent = result.accuracyWhite != null ? Number(result.accuracyWhite).toFixed(1) : '—';
        if (result.coverageRateWhite != null && result.coverageRateWhite < 100) {
          elAccW.title = t('coverageTooltip', { pct: result.coverageRateWhite });
        }
      }

      // Black Accuracy
      if (elAccB) {
        elAccB.textContent = result.accuracyBlack != null ? Number(result.accuracyBlack).toFixed(1) : '—';
        if (result.coverageRateBlack != null && result.coverageRateBlack < 100) {
          elAccB.title = t('coverageTooltip', { pct: result.coverageRateBlack });
        }
      }

      metricsCard.style.display = 'grid';
      document.getElementById('review-summary').hidden = false;
    }

    // 1. Update Chart
    this.evalChart.setData(result.allMoves);
    this.evalChart.setCursor(this.currentPly);

    // 2. Update Blunder list (Strictly 妙手 & 俗手 only)
    const rawMoments = (result.keyMoments || result.allMoves || []);
    const moments = rawMoments.filter(
      m => m.divergenceType === 'beyond_intuition' || m.divergenceType === 'intuition_trap'
    ).sort((a, b) => a.ply - b.ply);
    this.el.blunderCountBadge.textContent = String(moments.length);
    this.renderBlunderCards(moments);

    // 3. Annotate Move Notation Table
    this.annotateMoveList(result.allMoves);

    // 4. Update current position insight
    try {
      this.updateActivePositionAnalysis();
    } catch (err) {
      console.warn('[Analysis Studio] Failed to update active position analysis on review completion:', err);
    }
  }

  renderBlunderCards(moments) {
    // Strictly filter to valid types only (妙手 and 俗手)
    const list = (moments || []).filter(
      m => m.divergenceType === 'beyond_intuition' || m.divergenceType === 'intuition_trap'
    );

    // 1. Update filter pill counters
    const countBeyond = list.filter(m => m.divergenceType === 'beyond_intuition' || m.isBeyondIntuition).length;
    const countTrap = list.filter(m => m.divergenceType === 'intuition_trap' || m.isHumanTrap).length;
    const totalAll = countBeyond + countTrap;

    const elCountAll = document.getElementById('filter-count-all');
    const elCountBeyond = document.getElementById('filter-count-beyond');
    const elCountTrap = document.getElementById('filter-count-trap');
    if (elCountAll) elCountAll.textContent = String(totalAll);
    if (elCountBeyond) elCountBeyond.textContent = String(countBeyond);
    if (elCountTrap) elCountTrap.textContent = String(countTrap);

    // 2. Filter moments based on active category pill
    let filteredMoments = list;
    if (this.currentDivergenceFilter === 'beyond') {
      filteredMoments = list.filter(m => m.divergenceType === 'beyond_intuition' || m.isBeyondIntuition);
    } else if (this.currentDivergenceFilter === 'trap') {
      filteredMoments = list.filter(m => m.divergenceType === 'intuition_trap' || m.isHumanTrap);
    }

    this.el.blunderList.replaceChildren();

    if (!filteredMoments || filteredMoments.length === 0) {
      const emptyMsg = this.currentDivergenceFilter === 'beyond'
        ? t('noBeyondDetected')
        : (this.currentDivergenceFilter === 'trap'
          ? t('noTrapDetected')
          : t('noKeyMoments'));
      const emptyBox = document.createElement('div');
      emptyBox.style.cssText = 'padding: 28px; text-align: center; color: var(--text-dim); font-size: 13px;';
      emptyBox.textContent = emptyMsg;
      this.el.blunderList.appendChild(emptyBox);
      return;
    }

    filteredMoments.forEach((item, index) => {
      const card = document.createElement('div');
      const isBeyond = item.divergenceType === 'beyond_intuition' || item.isBeyondIntuition;
      const isTrap = item.divergenceType === 'intuition_trap' || item.isHumanTrap;

      let cardClass = 'blunder-card';
      if (isBeyond) cardClass += ' card-beyond-intuition';
      else if (isTrap) cardClass += ' card-intuition-trap';

      card.className = cardClass;
      card.dataset.index = index;
      card.dataset.ply = item.ply;

      const isWhite = item.turn === 'w';
      const sideIcon = isWhite ? '⚪' : '⚫';
      const lossPawnsNum = Math.abs((item.lossCp || 0) / 100).toFixed(1);
      const bestMoveText = (item.bestSan && item.bestSan !== '?') ? item.bestSan : null;

      const cardMain = document.createElement('div');
      cardMain.className = 'blunder-card-main';

      const cardTop = document.createElement('div');
      cardTop.className = 'blunder-card-top';

      const cardTitle = document.createElement('div');
      cardTitle.className = 'blunder-card-title';

      const moveNumSpan = document.createElement('span');
      moveNumSpan.className = 'blunder-move-num';
      moveNumSpan.textContent = `${item.moveNumber}.`;
      cardTitle.appendChild(moveNumSpan);

      const sideIconSpan = document.createElement('span');
      sideIconSpan.className = 'blunder-side-icon';
      sideIconSpan.textContent = sideIcon;
      cardTitle.appendChild(sideIconSpan);

      const sanSpan = document.createElement('span');
      sanSpan.className = 'blunder-san';
      sanSpan.textContent = item.san;
      cardTitle.appendChild(sanSpan);

      cardTop.appendChild(cardTitle);

      const tagsGroup = document.createElement('div');
      tagsGroup.className = 'blunder-tags-group';

      const typeTag = document.createElement('span');
      typeTag.className = 'blunder-type-tag';

      const rightTag = document.createElement('span');
      rightTag.className = 'blunder-loss-tag';

      const cardSub = document.createElement('div');
      cardSub.className = 'blunder-card-sub';

      if (isBeyond) {
        typeTag.classList.add('tag-beyond');
        typeTag.title = t('beyondTitle');
        typeTag.textContent = t('beyondText');
        rightTag.classList.add('tag-gain');
        rightTag.title = t('playedEngineBest');
        rightTag.textContent = item.isCombinationFollowup ? t('beyondComboText') : t('beyondIntuitionBreak');

        const subProb = document.createElement('span');
        subProb.className = 'sub-trap-prob';
        subProb.style.color = 'var(--text-dim)';
        if (item.maiaTopSan) {
          subProb.appendChild(document.createTextNode(t('naturalIntuitionTop')));
          const topStrong = document.createElement('strong');
          topStrong.style.color = 'var(--brand-gold)';
          topStrong.textContent = item.maiaTopSan;
          subProb.appendChild(topStrong);
          if (item.maiaTopProb) {
            subProb.appendChild(document.createTextNode(` (${Math.round(item.maiaTopProb)}%)`));
          }
          if (item.maiaLossCp != null && item.maiaLossCp > 0) {
            const pawns = (item.maiaLossCp / 100).toFixed(1);
            subProb.appendChild(document.createTextNode(t('betterThanIntuition', { pawns })));
          }
        } else {
          subProb.textContent = t('playedEngineBest');
        }
        cardSub.appendChild(subProb);
      } else if (isTrap) {
        typeTag.classList.add('tag-trap');
        typeTag.title = t('trapTitle');
        typeTag.textContent = t('trapText');
        rightTag.title = t('lossVersusBest');
        rightTag.textContent = t('lossPawns', { loss: lossPawnsNum });

        if (bestMoveText) {
          const subBest = document.createElement('span');
          subBest.className = 'sub-best-move';
          subBest.appendChild(document.createTextNode(t('bestMoveIs')));
          const bStrong = document.createElement('strong');
          bStrong.textContent = bestMoveText;
          subBest.appendChild(bStrong);
          subBest.appendChild(document.createTextNode(' · '));
          cardSub.appendChild(subBest);
        }

        const subTrap = document.createElement('span');
        subTrap.className = 'sub-trap-prob';
        const cleanPlayed = item.san ? item.san.replace(/[+#?!]/g, '') : '';
        const cleanTop1 = item.maiaTopSan ? item.maiaTopSan.replace(/[+#?!]/g, '') : '';
        if (cleanPlayed === cleanTop1) {
          subTrap.textContent = item.maiaTopProb ? t('trapTopTendency', { prob: Math.round(item.maiaTopProb) }) : t('trapTopTendency', { prob: '100' }).replace(' (100% 倾向)', '').replace(' (100% tendency)', '');
        } else {
          subTrap.textContent = item.humanProbability ? t('trapHumanTendency', { prob: Math.round(item.humanProbability) }) : t('trapProne');
        }
        cardSub.appendChild(subTrap);
      } else {
        if (item.severity === 'mistake') {
          typeTag.classList.add('tag-mistake');
          typeTag.textContent = t('mistakeText');
        } else if (item.severity === 'inaccuracy') {
          typeTag.classList.add('tag-inaccuracy');
          typeTag.textContent = t('inaccuracyText');
        } else {
          typeTag.classList.add('tag-blunder');
          typeTag.textContent = t('blunderText');
        }
        rightTag.title = t('lossVersusBest');
        rightTag.textContent = t('lossPawns', { loss: lossPawnsNum });

        if (bestMoveText) {
          const subBest = document.createElement('span');
          subBest.className = 'sub-best-move';
          subBest.appendChild(document.createTextNode(t('bestMoveIs')));
          const bStrong = document.createElement('strong');
          bStrong.textContent = bestMoveText;
          subBest.appendChild(bStrong);
          cardSub.appendChild(subBest);
        }
      }

      tagsGroup.appendChild(typeTag);
      cardTop.appendChild(tagsGroup);
      cardTop.appendChild(rightTag);

      cardMain.appendChild(cardTop);
      cardMain.appendChild(cardSub);
      card.appendChild(cardMain);

      card.addEventListener('click', () => {
        this.el.blunderList.querySelectorAll('.blunder-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.goToPly(item.ply, { before: true });
      });

      this.el.blunderList.appendChild(card);
    });

    if (this.currentPly) {
      const activeCard = this.el.blunderList.querySelector(`.blunder-card[data-ply="${this.currentPly}"]`);
      if (activeCard) activeCard.classList.add('active');
    }
  }

  renderMoveList() {
    this.el.moveNotationTable.replaceChildren();
    if (!this.moves || this.moves.length === 0) return;

    // Group moves into rows based on fullmove numbers
    // Correctly handles White-first, Black-first, and custom starting move numbers
    const rowsMap = new Map();

    for (let i = 0; i < this.moves.length; i++) {
      const m = this.moves[i];
      const pos = this.positions[i + 1];
      const moveNum = pos ? pos.moveNumber : (m.moveNumber || Math.floor(i / 2) + 1);
      const turn = pos ? pos.turn : (m.turn || (i % 2 === 0 ? 'w' : 'b'));

      if (!rowsMap.has(moveNum)) {
        rowsMap.set(moveNum, { moveNum, white: null, black: null });
      }
      const rowData = rowsMap.get(moveNum);
      if (turn === 'w') {
        rowData.white = m;
      } else {
        rowData.black = m;
      }
    }

    for (const [moveNum, rowData] of rowsMap.entries()) {
      const row = document.createElement('div');
      row.className = 'notation-row';

      const numSpan = document.createElement('span');
      numSpan.className = 'notation-num';
      numSpan.textContent = `${moveNum}.`;
      row.appendChild(numSpan);

      // White slot
      if (rowData.white) {
        const wEl = document.createElement('div');
        wEl.className = 'notation-move';
        wEl.id = `move-ply-${rowData.white.ply}`;

        const sanSpan = document.createElement('span');
        sanSpan.textContent = rowData.white.san;
        wEl.appendChild(sanSpan);

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'annotation-badge';
        badgeSpan.id = `badge-ply-${rowData.white.ply}`;
        wEl.appendChild(badgeSpan);

        wEl.addEventListener('click', () => this.goToPly(rowData.white.ply));
        row.appendChild(wEl);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'notation-move';
        const dots = document.createElement('span');
        dots.textContent = '...';
        dots.style.color = 'var(--text-dim)';
        placeholder.appendChild(dots);
        row.appendChild(placeholder);
      }

      // Black slot
      if (rowData.black) {
        const bEl = document.createElement('div');
        bEl.className = 'notation-move';
        bEl.id = `move-ply-${rowData.black.ply}`;

        const sanSpan = document.createElement('span');
        sanSpan.textContent = rowData.black.san;
        bEl.appendChild(sanSpan);

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'annotation-badge';
        badgeSpan.id = `badge-ply-${rowData.black.ply}`;
        bEl.appendChild(badgeSpan);

        bEl.addEventListener('click', () => this.goToPly(rowData.black.ply));
        row.appendChild(bEl);
      } else {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'notation-move';
        emptyEl.style.visibility = 'hidden';
        row.appendChild(emptyEl);
      }

      this.el.moveNotationTable.appendChild(row);
    }

    // If truncated/partial, append a safe notice
    if (this.positions?.isPartial) {
      const partialRow = document.createElement('div');
      partialRow.className = 'notation-partial-notice';
      partialRow.style.cssText = 'padding: 8px 12px; margin: 8px 0; background: var(--dg-gold-soft); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; font-size: 11.5px; color: var(--brand-gold);';
      partialRow.textContent = t('errorPartialPgn', { ply: this.positions.stoppedAtPly, san: this.positions.unparsedSan || (getLang() === 'zh' ? '未知' : 'unknown') });
      this.el.moveNotationTable.appendChild(partialRow);
    }
  }

  annotateMoveList(allMoves) {
    if (!allMoves) return;

    allMoves.forEach(m => {
      const badge = document.getElementById(`badge-ply-${m.ply}`);
      if (!badge) return;

      if (m.divergenceType === 'beyond_intuition' || m.isBeyondIntuition) {
        badge.textContent = '✨';
        badge.className = 'annotation-badge annotation-beyond';
        badge.title = m.isCombinationFollowup ? `✨ ${t('beyondComboText')}` : `✨ ${t('beyondText')}: ${t('playedEngineBest')}`;
      } else if (m.divergenceType === 'intuition_trap' || m.isHumanTrap) {
        badge.textContent = '🫤';
        badge.className = 'annotation-badge annotation-trap';
        const lossTxt = m.lossPawns || (m.lossCp ? (Math.abs(m.lossCp) / 100).toFixed(1) : '0');
        badge.title = `🫤 ${t('trapText')} (-${lossTxt} ${t('pawnsUnit')})`;
      } else if (m.severity === 'blunder') {
        badge.textContent = '??';
        badge.className = 'annotation-badge annotation-blunder';
        badge.title = `${t('blunderText')} (${m.lossPawns} ${t('pawnsUnit')})`;
      } else if (m.severity === 'mistake') {
        badge.textContent = '?';
        badge.className = 'annotation-badge annotation-mistake';
        badge.title = `${t('mistakeText')} (${m.lossPawns} ${t('pawnsUnit')})`;
      } else if (m.severity === 'inaccuracy') {
        badge.textContent = '?!';
        badge.className = 'annotation-badge annotation-mistake';
        badge.title = `${t('inaccuracyText')} (${m.lossPawns} ${t('pawnsUnit')})`;
      } else {
        badge.textContent = '';
      }
    });
  }

  highlightMoveRow(ply) {
    const all = this.el.moveNotationTable.querySelectorAll('.notation-move');
    all.forEach(el => el.classList.remove('active'));
    if (ply === 0) {
      this.el.moveNotationTable.scrollTop = 0;
      document.querySelector('.analysis-column').scrollTop = 0;
    }

    if (ply > 0) {
      const activeEl = document.getElementById(`move-ply-${ply}`);
      if (activeEl) {
        activeEl.classList.add('active');
        this.scrollWithin(activeEl, this.el.moveNotationTable);
        this.scrollWithin(activeEl, document.querySelector('.analysis-column'));
      }
    }
  }

  goToPly(ply, options = {}) {
    if (!options.silent) this.pauseWholeReview();
    this.exitBranchMode();

    if (this.positions.length === 0) return;
    const clampedPly = Math.max(0, Math.min(this.positions.length - 1, ply));
    const prevPly = this.currentPly;
    this.currentPly = clampedPly;
    this.isReviewingMove = !!options.before && clampedPly > 0;

    const currentPos = this.positions[clampedPly];
    const lastMove = (clampedPly > 0 && currentPos) ? { from: currentPos.from, to: currentPos.to } : null;

    const displayPos = this.isReviewingMove ? this.positions[clampedPly - 1] : currentPos;
    this.boardUI.setPosition(displayPos.fen, this.isReviewingMove ? null : lastMove);
    this.evalChart.setCursor(clampedPly);
    this.highlightMoveRow(clampedPly);

    // Audio feedback on move navigation
    if (!options.silent && clampedPly !== prevPly) {
      if (clampedPly > 0 && currentPos) {
        if (clampedPly > prevPly) {
          soundEffects.playSoundForMove(currentPos.san);
        } else {
          soundEffects.playMove(0.4);
        }
      } else if (clampedPly === 0 && prevPly > 0) {
        soundEffects.playMove(0.3);
      }
    }

    // Sync active blunder card if present
    const blunderCards = this.el.blunderList.querySelectorAll('.blunder-card');
    blunderCards.forEach(c => {
      if (parseInt(c.dataset.ply, 10) === clampedPly) {
        c.classList.add('active');
        this.scrollWithin(c, document.querySelector('.analysis-column'));
      } else {
        c.classList.remove('active');
      }
    });

    if (clampedPly === 0) {
      this.el.boardStatusText.textContent = t('startingPosition');
    } else {
      const sideText = currentPos.turn === 'w' ? t('whitePlayer').replace('⚪ ', '') : t('blackPlayer').replace('⚫ ', '');
      this.el.boardStatusText.textContent = this.isReviewingMove ? t('reviewMoveBefore', { move: currentPos.san, number: currentPos.moveNumber }) : t('moveIndicator', { move: currentPos.moveNumber, side: sideText, san: currentPos.san });
    }
    this.updateActivePositionAnalysis();
    if (!options.silent) this.scheduleReviewResume();
  }

  updateActivePositionAnalysis() {
    this.positionAnalysis.refresh();
  }

  updatePreferenceNotes() {
    const experience = document.getElementById('studio-engine-experience');
    if (experience) { experience.textContent = engineExperienceHint(getPreferences(), getLang(), location.protocol === 'chrome-extension:'); experience.hidden = !experience.textContent; }
    const sync = document.getElementById('preference-sync-status');
    if (sync) sync.textContent = t(preferencesLinked() ? 'preferencesConnected' : 'preferencesBrowserOnly');
    if (this.boardUI) this.boardUI.promotionLabel = t('choosePromotion');
  }

  applyPreferences(prefs) {
    this.applyingPreferences = true;
    try {
      const engine = location.protocol === 'chrome-extension:' ? 'lite' : prefs.stockfishVariant;
      const versionsChanged = engine !== this.engineVariant || prefs.maiaVariant !== this.modelVariant;
      const eloChanged = this.currentElo !== prefs.defaultElo;
      const calculate = eloChanged || this.settings.heatmap !== prefs.showHeatmap || Number(this.el.positionDepth.value) !== prefs.studio_depth;
      if (getLang() !== prefs.maia3_lang) setLanguage(prefs.maia3_lang);
      this.currentElo = prefs.defaultElo;
      if (![...this.el.eloSelector.options].some(option => option.value === String(prefs.defaultElo))) this.el.eloSelector.add(new Option(String(prefs.defaultElo), String(prefs.defaultElo)));
      this.el.eloSelector.value = String(prefs.defaultElo);
      this.settings = { arrows: prefs.showArrows || prefs.showStockfishArrows, maiaArrows: prefs.showArrows, sfArrows: prefs.showStockfishArrows, heatmap: prefs.showHeatmap, probability: prefs.showProbability };
      document.getElementById('setting-arrows').checked = this.settings.arrows;
      document.getElementById('setting-heatmap').checked = prefs.showHeatmap;
      document.getElementById('setting-probability').checked = prefs.showProbability;
      this.el.positionDepth.value = String(prefs.studio_depth);
      this.boardUI.setOrientation(prefs.studio_orientation);
      document.getElementById('setting-orientation').value = prefs.studio_orientation;
      soundEffects.enabled = prefs.diverge_sound_enabled;
      this.updateSoundToggleUI();
      this.updatePreferenceNotes();
      if (versionsChanged) {
        document.getElementById('engine-edition').value = engine; document.getElementById('intuition-edition').value = prefs.maiaVariant;
        this.changeEngineVersions({ persist: false });
      } else if (eloChanged) {
        this.pauseWholeReview(); this.analyzer.cancel(); this.reviewEpoch++; this.currentGameKey = this.getReviewKey(); this.reviewResult = null;
        if (this.moves.length && !this.isBranching) this.runFullReview(); else this.positionAnalysis.refresh();
      } else if (this.positions.length) {
        if (calculate) this.positionAnalysis.refresh(); else this.positionAnalysis.render();
      }
    } finally { this.applyingPreferences = false; }
  }

  resetPositionPanel() {
    this.el.divergenceContent.hidden = true;
    this.el.divergenceContent.textContent = '';
    this.positionAnalysis?.renderGauge(null);
  }

  previewCandidate(context, variation) {
    if (this.isPlaying) this.toggleAutoPlay();
    this.pauseWholeReview();
    this.hasAnalysisInput = true;
    if (!this.isBranching) {
      this.activeBranch = { base: { ...context, history: [...context.history] }, anchor: this.currentPly, moves: [], cursor: 0 };
      this.savedBranches.push(this.activeBranch);
    }
    this.activeBranch.moves = [...this.activeBranch.moves.slice(0, this.activeBranch.cursor), ...variation];
    this.showBranchPosition(this.activeBranch.moves.length);
  }

  showBranchPosition(cursor) {
    const branch = this.activeBranch;
    branch.cursor = Math.max(0, Math.min(cursor, branch.moves.length));
    this.isBranching = true;
    const moves = branch.moves.slice(0, branch.cursor);
    this.branchFen = moves.at(-1)?.fen || branch.base.fen;
    this.branchHistory = [...branch.base.history, ...[branch.base.fen, ...moves.map(move => move.fen)].slice(0, -1)].slice(-7);
    this.el.branchBanner.style.display = 'flex';
    const last = moves.at(-1);
    this.boardUI.setPosition(this.branchFen, last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null);
    this.el.boardStatusText.textContent = t('branchMoveIndicator', { move: moves.map(move => move.label).join(' ') || t('startingPosition') });
    this.renderStudyBranches();
    if (last) soundEffects.playSoundForMove(last.san);
    this.updateActivePositionAnalysis();
  }

  navigateStudy(delta) {
    if (this.isBranching) {
      if (this.activeBranch.cursor + delta < 0) this.goToPly(this.activeBranch.anchor);
      else this.showBranchPosition(this.activeBranch.cursor + delta);
    } else this.goToPly(this.currentPly + delta);
  }

  renderStudyBranches() {
    let list = document.getElementById('study-branches');
    if (!list) { list = document.createElement('div'); list.id = 'study-branches'; list.className = 'study-branches'; this.el.moveNotationTable.parentElement.append(list); }
    list.replaceChildren();
    if (!this.savedBranches.length) return;
    const heading = document.createElement('strong'); heading.textContent = t('userBranches'); list.append(heading);
    for (const branch of this.savedBranches) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'study-branch';
      const base = new ChessBoard(branch.base.fen);
      const origin = branch.base.fen === ChessBoard.INITIAL_FEN ? t('startingPosition') : `${base.fullMoves}${base.turn === 'w' ? '.' : '…'}`;
      button.textContent = `${origin} · ${branch.moves.map(move => move.label).join(' ')}`;
      button.onclick = () => { this.pauseWholeReview(); this.activeBranch = branch; this.currentPly = branch.anchor; this.showBranchPosition(branch.moves.length); };
      list.append(button);
    }
  }

  pauseWholeReview() {
    clearTimeout(this.resumeReviewTimer);
    if (!this.fullReviewRunning && !this.analyzer.isAnalyzing) return;
    this.reviewEpoch++;
    this.analyzer.cancel();
    this.analyzer = new GameAnalyzer(this.stockfish, this.maiaEngine);
    this.fullReviewRunning = false;
    this.reviewPendingResume = !this.reviewResult && !!this.moves.length;
    this.lastProgress = null;
    this.el.phaseText.textContent = t('reviewPausedForPosition');
    const detail = document.getElementById('blunder-loading-detail');
    if (detail) { detail.textContent = t('reviewResumeHint'); if (detail.previousElementSibling) detail.previousElementSibling.textContent = t('reviewPausedForPosition'); }
  }

  scheduleReviewResume() {
    if (!this.reviewPendingResume || this.isBranching) return;
    clearTimeout(this.resumeReviewTimer);
    this.resumeReviewTimer = setTimeout(async () => {
      await this.positionAnalysis.pending;
      if (this.reviewPendingResume && !this.isBranching && !this.fullReviewRunning) this.runFullReview();
    }, 1800);
  }

  handleUserBoardMove(move, newFen) {
    const next = this.positions[this.currentPly + (this.isReviewingMove ? 0 : 1)];
    if (!this.isBranching && next?.uci === move.uci) {
      this.goToPly(this.currentPly + (this.isReviewingMove ? 0 : 1));
      return;
    }
    const context = this.positionAnalysis.context();
    this.previewCandidate(context, [{ ...move, label: move.san || move.uci, fen: newFen }]);
  }

  exitBranchMode() {
    if (!this.isBranching) return;
    this.isBranching = false;
    this.branchFen = null;
    this.branchHistory = [];
    this.el.branchBanner.style.display = 'none';
  }
}

// Safe instantiation for both pre-loaded and deferred execution
async function initApp() {
  if (window.__maiaStudioBooting) return;
  window.__maiaStudioBooting = true;
  await initializePreferences();
  const url = new URL(location.href), hash = new URLSearchParams(url.hash.slice(1));
  const value = key => hash.get(key) || url.searchParams.get(key);
  const intent = {};
  if (value('sf')) intent.stockfishVariant = value('sf');
  if (value('maia')) intent.maiaVariant = value('maia');
  if (value('lang')) intent.maia3_lang = value('lang');
  if (value('elo')) intent.defaultElo = Number(value('elo'));
  if (Object.keys(intent).length) {
    await savePreferences(intent);
    for (const key of ['sf', 'maia', 'lang', 'elo']) { url.searchParams.delete(key); hash.delete(key); }
    url.hash = hash.toString(); history.replaceState(null, '', url);
  }
  const scanToken = hash.get('scan');
  if (scanToken) { setLanguage(getPreferences().maia3_lang); initI18n(); }
  let scanRevoked = false;
  if (!await authorizeScan(scanToken, () => { scanRevoked = true; showScanLock(window.__maiaStudioApp); }) || scanRevoked) return;
  if (!window.__maiaStudioApp) {
    window.__maiaStudioApp = new AnalysisStudioApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
