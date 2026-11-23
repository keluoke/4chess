import { initWorkbenchLayout } from './workbench-layout.js?v=20261123-checkup-windows';
import { animateStudy, cancelMotion, transitionLayout } from './workbench-motion.js?v=20261103-jade';
import { IntuitionReview } from './intuition-review.js?v=20261123-checkup-windows';
import { ReviewExplorer } from './review-explorer.js?v=20261123-checkup-windows';
import { ReviewOverview } from './review-overview.js?v=20261123-checkup-windows';
import { ReviewCommentary } from './review-commentary.js?v=20261123-checkup-windows';
import { ConsequencePlayer } from './consequence-player.js?v=20261123-checkup-windows';
import { MistakeBank } from './mistake-bank.js?v=20261123-checkup-windows';
import { resolvePerspective } from './study-store.js?v=20261123-checkup-windows';
import { IntuitionCheckup } from './checkup-runner.js?v=20261123-checkup-windows';
import { checkupGameContext } from './checkup-archives.js?v=20261123-checkup-windows';
import { StudyProfileControls } from './study-profile-controls.js?v=20261123-checkup-windows';
import { CheckupReminders } from './checkup-reminders.js?v=20261123-checkup-windows';
import { ReviewShare } from './review-share.js?v=20261123-checkup-windows';
import { ShareCardModal } from './share-card.js?v=20261123-checkup-windows';
import { coreTurningPoints, moveQuality, intuitionKind, canPractice, INTUITION_KINDS, selectReviewObservations } from '../engine/review-policy.js?v=20261120-review';
import { ReviewPractice } from './review-practice.js?v=20261123-checkup-windows';
import { authorizeScan, setScanAvailability, showScanLock } from './scan-authorization.js?v=20261121-study-reminders';
/**
 * Maia-3 Standalone Deep Analysis Studio Application Coordinator
 * Browser-based engine and human-intuition comparison for positions and completed games.
 */

import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js?v=20261123-checkup-windows';
import { MaiaEngine } from '../engine/maia-engine.js?v=20261123-checkup-windows';
import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261123-checkup-windows';
import { BoardUI } from './board-ui.js?v=20261117-ui';
import { EvalChart } from './eval-chart.js?v=20261123-checkup-windows';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { PositionAnalysis } from './position-analysis.js?v=20261123-checkup-windows';
import { STOCKFISH_VARIANTS, MAIA_VARIANTS } from '../engine/engine-variants.js?v=20261025-v115';
import { soundEffects } from './sound-effects.js?v=20261025-v115';
import { t, getLang, setLanguage, toggleLanguage, initI18n, onLanguageChange } from './i18n.js?v=20261123-checkup-windows';
import { initializePreferences, getPreferences, savePreferences, subscribePreferences, preferencesLinked, engineExperienceHint } from '../engine/engine-preferences.js?v=20261123-checkup-windows';
import { gameLinkInput, parseStudioElo, readPgnTags, withPgnTermination } from '../engine/chess-notation.js?v=20261120-import';

const STUDIO_INPUT_PARAMS = ['pgn', 'text', 'url', 'fen', 'empty', 'white', 'black', 'result', 'elo', 'fallbackElo', 'orientation', 'checkupSource', 'overview'];
const STUDIO_SESSION = 'divergeStudioSession';

const POSITION_TOGGLES = [
  ['setting-maia-arrows', 'maiaArrows', 'showArrows'],
  ['setting-sf-arrows', 'sfArrows', 'showStockfishArrows'],
  ['setting-heatmap', 'heatmap', 'showHeatmap'],
  ['setting-probability', 'probability', 'showProbability']
];

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
    this.reviewMode = preferences.studio_review_mode;
    this.positionMaxDepth = preferences.studio_max_depth;
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
    this.settings = {};

    this.initElements();
    initI18n();
    onLanguageChange(() => { this.refreshAfterLanguageChange(); if (!this.applyingPreferences) savePreferences({ maia3_lang: getLang() }); });

    this.initEngines();
    this.initUI();
    this.reviewExplorer = new ReviewExplorer(this);
    this.reviewOverview = new ReviewOverview(this);
    this.reviewCommentary = new ReviewCommentary(this);
    this.consequencePlayer = new ConsequencePlayer(this);
    this.mistakeBank = new MistakeBank(this);
    this.checkup = new IntuitionCheckup(this);
    this.studyProfiles = new StudyProfileControls(this);
    this.checkupReminders = new CheckupReminders(this);
    this.shareCard = new ShareCardModal(this);
    this.reviewShare = new ReviewShare(this);
    this.bindEvents();
    this.applyPreferences({ ...preferences, maiaVariant: this.modelVariant, stockfishVariant: location.protocol === 'chrome-extension:' ? preferences.stockfishVariant : this.engineVariant });
    subscribePreferences(next => this.applyPreferences(next));
    this.headerObserver = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--studio-header-height', `${Math.ceil(document.querySelector('.studio-navbar').getBoundingClientRect().height)}px`);
    });
    this.headerObserver.observe(document.querySelector('.studio-navbar'));
    this.workbenchLayout = initWorkbenchLayout();
    const url = new URL(location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const reminder = hash.get('checkup');
    if (reminder) {
      hash.delete('checkup');
      url.hash = hash.toString();
      history.replaceState(history.state, '', url);
    }
    const profileReady = this.mistakeBank.ready?.catch(error => console.warn('[Studio] Could not load study profiles:', error));
    Promise.resolve(profileReady).then(() => this.loadInitialGame()).then(() => {
      if (hash.has('scan')) return;
      if (reminder) return this.checkupReminders.openFromReminder(reminder);
      if (url.searchParams.get('tab') === 'checkup') return this.checkup.open({ view: 'settings' });
    }).catch(error => console.warn('[Studio] Could not open initial view:', error));
  }

  initElements() {
    this.el = {
      btnLangToggle: document.getElementById('btn-lang-toggle'),
      metaWhite: document.getElementById('meta-white'),
      metaBlack: document.getElementById('meta-black'),
      metaResult: document.getElementById('meta-result'),
      eloSelector: document.getElementById('elo-selector'),
      eloHint: document.getElementById('studio-elo-hint'),
      copyGameLink: document.getElementById('review-copy-game-link'),
      gameLinkField: document.getElementById('review-game-link-field'),
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
      reviewMode: document.getElementById('review-mode'),
      settingsDialog: document.getElementById('review-settings'),
      btnSettings: document.getElementById('btn-settings')
    };
  }

  initEngines({ keepStockfish = false } = {}) {
    this.intuitionReview?.dispose();
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
      motion: true,
      brilliantArrows: true,
      orientation: 'white',
      onMove: (move, newFen) => this.handleUserBoardMove(move, newFen)
    });

    // 2. Initialize EvalChart
    this.evalChart = new EvalChart(this.el.evalChartContainer, (selectedPly) => {
      this.goToPly(selectedPly, { revealCandidates: true });
    }, (offset) => {
      if (this.isBranching && this.activeBranch) this.showBranchPosition(offset);
    });

    this.positionAnalysis = new PositionAnalysis(this);
    this.intuitionReview = new IntuitionReview(this);
    try { document.body.classList.toggle('focus-mode', localStorage.getItem('diverge_studio_focus') === 'true'); } catch {}
    const focusButton = document.getElementById('btn-focus');
    focusButton.onclick = () => {
      transitionLayout([...document.querySelectorAll('.board-column, .analysis-column, .insight-column')], () => {
        const focused = document.body.classList.toggle('focus-mode');
        focusButton.setAttribute('aria-pressed', String(focused));
        try { localStorage.setItem('diverge_studio_focus', String(focused)); } catch {}
      });
    };
    focusButton.setAttribute('aria-pressed', String(document.body.classList.contains('focus-mode')));

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
        text.title = failed ? this.maiaEngine?.status?.[name === 'maia' ? 'maia' : 'stockfish']?.error || '' : '';
        text.textContent = loading && progress && (name === 'sf' || progress.state === 'downloading')
          ? (name === 'maia' && progress.percent == null ? t('modelDownloadingBytes', { size: progress.loadedMB }) : t('modelDownloading', { percent: progress.percent || 0 }))
          : t(status);
      }
    }
    this.positionAnalysis?.renderLoadingStatuses();
    this.intuitionReview?.render();
    this.checkup?.renderProgress();
  }

  flipBoard() {
    this.boardUI.flip();
    document.getElementById('setting-orientation').value = this.boardUI.orientation;
    this.positionAnalysis.render();
    if (this.sessionOrientation) {
      this.sessionOrientation = this.boardUI.orientation;
      this.rememberSession();
    }
    savePreferences({ studio_orientation: this.boardUI.orientation });
  }

  bindEvents() {
    this.el.copyGameLink.onclick = () => this.copyGameLink();
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
      const elo = parseStudioElo(e.target.value);
      if (!elo) return;
      const profile = this.mistakeBank?.activeProfile;
      this.sessionElo = this.hasAnalysisInput ? { value: elo, explicit: true, profileId: profile?.id } : null;
      this.setSessionElo(elo);
      this.rememberSession();
      if (profile && this.mistakeBank.allowed()) {
        profile.defaultElo = elo;
        this.mistakeBank.store.setProfileElo(profile.id, elo).catch(() => this.showToast(t('checkupAccountError')));
      } else {
        savePreferences({ defaultElo: this.currentElo });
        try {
          localStorage.setItem('maia3_target_elo', String(this.currentElo));
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ defaultElo: this.currentElo });
          }
        } catch {}
      }

      this.positionAnalysis.cancel();
      this.positionAnalysis.cache.clear();
      this.currentGameKey = this.getReviewKey();
      this.practice?.stop();
      this.intuitionReview.dispose();
      if (this.coreReview) {
        this.applyReviewResult(this.coreReview);
        this.intuitionReview.start();
      } else if (this.moves.length && !this.isBranching) this.runFullReview(false);
      else this.updateActivePositionAnalysis();
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
    this.el.btnPlay.addEventListener('click', () => {
      this.toggleAutoPlay();
      this.updateActivePositionAnalysis();
    });
    this.el.btnExitBranch.addEventListener('click', () => this.goToPly(this.currentPly));

    this.el.btnSettings.addEventListener('click', () => {
      this.updateEngineStatus();
      this.reviewCommentary.sync({ recheck: true });
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
    this.el.positionDepth.addEventListener('change', () => savePreferences({ studio_max_depth: Number(this.el.positionDepth.value) }));
    this.el.reviewMode.addEventListener('change', () => savePreferences({ studio_review_mode: this.el.reviewMode.value }));
    for (const [id, , preference] of POSITION_TOGGLES) {
      document.getElementById(id).addEventListener('change', event => {
        savePreferences({ [preference]: event.target.checked });
      });
    }
    document.getElementById('setting-orientation').addEventListener('change', event => {
      this.boardUI.setOrientation(event.target.value);
      if (this.sessionOrientation) {
        this.sessionOrientation = event.target.value;
        this.rememberSession();
      }
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
        this.renderBlunderCards();
        this.reviewExplorer.focusSelection();
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
      if (this.checkup?.dialog?.open) return;
      if (this.el.dropOverlay) this.el.dropOverlay.style.display = 'flex';
    });

    window.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        if (this.el.dropOverlay) this.el.dropOverlay.style.display = 'none';
      }
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (this.el.dropOverlay) this.el.dropOverlay.style.display = 'none';
      if (this.checkup?.dialog?.open) {
        const files = [...(e.dataTransfer?.files || [])];
        if (files.length) {
          await this.checkup.readFilesForBatch(files, { autoPrepare: true });
          return;
        }
        const droppedText = e.dataTransfer?.getData('text');
        if (droppedText) await this.checkup.receiveDroppedPgn(droppedText);
        return;
      }
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
        this.runFullReview(true, { openOverview: true });
      }
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.studyProfiles?.editor?.open || this.el.settingsDialog.open || this.reviewOverview.summary.open || this.mistakeBank?.dialog?.open || this.checkup?.dialog?.open || this.shareCard?.dialog?.open || this.reviewShare?.dialog?.open) return;
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
      if (this.scanSourceLocked) return;

      if (this.tempAnalysisFen) {
        if (e.key === 'Escape') { e.preventDefault(); this.exitTemporaryPositionAnalysis(); }
        else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); this.flipBoard(); }
        else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); this.el.btnSound?.click(); }
        return;
      }

      if (this.practice?.inProgress) {
        if (e.key === 'Escape') { e.preventDefault(); this.practice.returnToWorkbench(); }
        else if (e.key === 'ArrowLeft' || e.key === 'j') { e.preventDefault(); this.practice.stepVariation(-1); }
        else if (e.key === 'ArrowRight' || e.key === 'k') { e.preventDefault(); this.practice.stepVariation(1); }
        else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); this.flipBoard(); }
        else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); this.el.btnSound?.click(); }
        return;
      }

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
      } else if ((e.key === ' ' || e.code === 'Space') && !document.activeElement?.closest('button, a, summary')) {
        e.preventDefault();
        this.toggleAutoPlay();
        this.updateActivePositionAnalysis();
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
    this.renderEloHint();
    this.intuitionReview?.render();
    this.reviewCommentary?.sync();
    this.studyProfiles?.render();
    this.checkupReminders?.render();
    this.mistakeBank?.refreshState?.();
    if (this.mistakeBank?.dialog?.open) this.mistakeBank.renderDialog();
    if (this.checkup?.dialog?.open) {
      this.checkup.renderAccounts();
      this.checkup.renderSourceControls();
      this.checkup.renderReport(this.checkup.latestReport);
      if (this.checkup.view === 'overview') this.checkup.renderOverview();
      if (this.checkup.share?.dialog.open) this.checkup.share.dialog.close();
    }
    if (this.shareCard?.dialog?.open) this.shareCard.renderPreview();
    if (this.reviewShare?.dialog?.open) void this.reviewShare.prepare();
    this.renderCurrentInsight();
    if (this.practice?.inProgress) this.practice.returnToWorkbench();
    if (!this.el) return;
    this.updatePreferenceNotes();
    for (const [id, key] of [['lbl-filter-all', 'filterAllLabel'], ['lbl-filter-beyond', 'filterBeyondLabel'], ['lbl-filter-trap', 'filterTrapLabel']]) {
      const label = document.getElementById(id);
      if (label) label.textContent = t(key, { count: '' }).replace(/\(\s*\)/, '').trim();
    }
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
    if (lblFilterAll) lblFilterAll.textContent = t('filterAllLabel', { count: '' }).replace(/\(\s*\)/, '').trim();
    const lblFilterBeyond = document.getElementById('lbl-filter-beyond');
    if (lblFilterBeyond) lblFilterBeyond.textContent = t('filterBeyondLabel');
    const lblFilterTrap = document.getElementById('lbl-filter-trap');
    if (lblFilterTrap) lblFilterTrap.textContent = t('filterTrapLabel');

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
      this.renderAccuracyDetails();
      this.renderBlunderCards();
      this.reviewOverview.show(this.reviewOverview.view);
      this.reviewOverview.render();
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
          this.updateActivePositionAnalysis();
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
    const generation = this.importGeneration = (this.importGeneration || 0) + 1;
    this.importController?.abort();
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (generation === this.importGeneration && typeof content === 'string') {
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

  async smartLoadInput(input, sourceName = '', options = {}) {
    if (!input || typeof input !== 'string') return false;
    const generation = this.importGeneration = (this.importGeneration || 0) + 1;
    this.importController?.abort();
    const controller = this.importController = new AbortController();
    const current = () => generation === this.importGeneration && !controller.signal.aborted;
    const commit = data => current() && this.startNewSession({ ...options, ...data });
    const text = input.trim();
    if (!text) return false;

    // 3. Detect FEN Position string (Single position / puzzle)
    const fenParts = text.split(/\s+/);
    if (fenParts.length >= 2 && fenParts[0].split('/').length === 8) {
      const ok = commit({
        fen: text,
        white: t('freeAnalysisBoard'),
        black: 'FEN',
        result: '*',
        positionInput: true,
        autoReview: false
      });
      if (ok) {
        this.showToast(t('toastLoadedFen'));
        return true;
      }
    }

    // 4. Default: Standard PGN text
    if (!/^(?:https?:\/\/|(?:www\.)?(?:lichess\.org|chess\.com)\/)/i.test(text) &&
        (text.includes('1.') || /^\s*(?:\[|\d+\.)/.test(text))) {
      const v = FairPlayGuard.verifyConcludedGame(text);
      if (!v.ok) {
        this.analyzer.cancel();
        this.showToast(t('toastFairPlayReview', { reason: v.reason }), 7000);
        return false;
      }
      const label = sourceName ? ` (${sourceName})` : '';
      const ok = commit({ pgn: text, autoReview: true });
      if (ok) {
        this.showToast(t('toastLoadedPgn', { label }));
        return true;
      }
      return false;
    }


    // 1. Detect Lichess Game URL
    const lichessPath = text.match(/^(?:https?:\/\/)?(?:www\.)?lichess\.org(\/[^?#\s]+)/i)?.[1];
    const lichessGame = lichessPath && GameAnalyzer.gameSource({ hostname: 'lichess.org', pathname: lichessPath });
    if (lichessGame) {
      const { id: gameId } = lichessGame;
      this.showToast(t('toastFetchingLichess', { gameId }), 5000);
      try {
        const resp = await fetch(`https://lichess.org/game/export/${gameId}?moves=true&pgnInJson=true&clocks=true`, {
          headers: { 'Accept': 'application/json' }, signal: controller.signal
        });
        if (resp.ok) {
          const data = await resp.json();
          if (!current()) return false;
          // Boundary Fair Play Verification: strictly refuse active matches!
          const v = FairPlayGuard.verifyConcludedGame(data);
          if (!v.ok) {
            this.analyzer.cancel();
            this.showToast(t('toastFairPlayReview', { reason: v.reason }), 7000);
            return false;
          }
          if (data.pgn && commit({ pgn: withPgnTermination(data.pgn, data.status), checkupSource: 'lichess', publicGameUrl: 'https://lichess.org/' + gameId, landAtEnd: true })) {
            this.showToast(t('toastLoadedLichess', { gameId }));
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
            const resp = await fetch(proxyUrl, { signal: controller.signal, cache: 'no-store' });
            if (resp.ok) {
              const data = await resp.json();
          if (!current()) return false;
              if (data && (data.game || data.moveList || data.pgn)) {
                fetchedData = data;
                break;
              }
            }
          } catch (err) {}
        }
      }

      if (!current()) return false;
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
        if (typeof pgn === 'string' && pgn && commit({ pgn: withPgnTermination(pgn, gameObj.status), checkupSource: 'chesscom', publicGameUrl: 'https://www.chess.com/game/' + type + '/' + gameId, landAtEnd: true })) {
          this.showToast(t('toastLoadedChesscom', { gameId }));
          return true;
        }

        // 2. Decode TCN moveList
        const moveList = gameObj.moveList || fetchedData.moveList;
        if (moveList) {
          const moves = GameAnalyzer.tcnToSanMoves(moveList);
          if (moves?.length && moves.length * 2 === moveList.length) {
            const headers = gameObj.pgnHeaders || fetchedData.pgnHeaders || {};
            const white = headers.White || fetchedData.players?.bottom?.username || gameObj.whiteUser || 'White';
            const black = headers.Black || fetchedData.players?.top?.username || gameObj.blackUser || 'Black';
            const result = v.result;
            const generatedPgn = GameAnalyzer.movesToPgn(moves, {
              ...headers,
              White: white,
              Black: black,
              Result: result
            });
            if (commit({
              pgn: withPgnTermination(generatedPgn, gameObj.status),
              moves,
              white,
              black,
              result,
              checkupSource: 'chesscom',
              publicGameUrl: 'https://www.chess.com/game/' + type + '/' + gameId,
              landAtEnd: true
            })) {
              this.showToast(t('toastLoadedChesscom', { gameId }));
              return true;
            }
          }
        }
      }

      this.showToast(t('toastFailedChesscom'));
      return false;
    }

    this.showToast(t('toastUnrecognizedInput'));
    return false;
  }

  async loadInitialGame() {
    const url = new URL(location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const value = key => hash.get(key) || url.searchParams.get(key);
    const orientation = value('orientation');
    const elo = parseStudioElo(value('elo'));
    const fallbackElo = parseStudioElo(value('fallbackElo'));
    const checkupSource = value('checkupSource');
    const generation = this.importGeneration;
    const text = value('text');
    let pgn = value('pgn') || (text && !/^https?(?::|%3a)/i.test(text) ? text : null);
    const fen = value('fen');
    const sourceUrl = value('url') || (text && /^https?(?::|%3a)/i.test(text) ? text : null);
    const empty = value('empty') === '1';
    const external = { orientation, elo, fallbackElo, checkupSource, landAtEnd: true, openOverview: value('overview') === '1' };
    try {
      if (fen) {
        if (this.startNewSession({ ...external, fen, positionInput: true, autoReview: false })) return;
        this.showToast(t('errorIllegalFen'));
      }

      if (pgn) {
        // Older links sometimes encoded the entire PGN twice. Preserve percent escapes in actual PGN text.
        if (/^(?:%0[ad]|%20)*(?:%5b|\d+\.(?:%20|%0a))/i.test(pgn)) pgn = decodeURIComponent(pgn);
        const conclusion = FairPlayGuard.verifyConcludedGame(pgn);
        if (!conclusion.ok) this.showToast(t('toastFairPlay', { reason: conclusion.reason }), 7000);
        else if (this.startNewSession({ ...external, pgn, white: value('white'), black: value('black'), result: conclusion.result })) return;
      }

      if (sourceUrl) {
        const loading = this.smartLoadInput(/^https?%3a/i.test(sourceUrl) ? decodeURIComponent(sourceUrl) : sourceUrl, '', external);
        const sourceGeneration = this.importGeneration;
        if (await loading || sourceGeneration !== this.importGeneration) return;
      }

      if (!fen && !pgn && !sourceUrl && !empty) {
        const session = hash.has('scan') ? null : history.state?.[STUDIO_SESSION];
        if (session) {
          const { input, orientation: savedOrientation, elo: savedElo, eloProfileId, fallbackElo: savedFallback, ratingMatch } = session;
          const restored = {
            ...input, orientation: orientation || savedOrientation, elo: elo || savedElo,
            eloProfileId: elo ? null : eloProfileId, fallbackElo: fallbackElo || savedFallback, ratingMatch
          };
          if (restored.moves && restored.startFen) restored.moves.startFen = restored.startFen;
          if ((restored.fen || FairPlayGuard.verifyConcludedGame(restored).ok) && this.startNewSession(restored)) return;
        }

        if (typeof chrome !== 'undefined' && chrome.storage?.local && !hash.has('scan')) {
          const stored = await new Promise(resolve => chrome.storage.local.get(['active_analysis_game', 'defaultElo'], resolve));
          if (generation !== this.importGeneration) return;
          const game = stored?.active_analysis_game;
          if (game && (game.moves?.length > 0 || game.pgn)) {
            const conclusion = FairPlayGuard.verifyConcludedGame(game);
            if (!conclusion.ok) this.showToast(t('toastFairPlay', { reason: conclusion.reason }), 7000);
            else if (this.startNewSession({
              ...game, ...external, orientation: orientation || game.orientation, result: conclusion.result,
              fallbackElo: fallbackElo || parseStudioElo(stored.defaultElo), autoReview: !game.cachedReview
            })) return;
          }
        }
      }
    } catch (error) {
      console.warn('[Analysis Studio] Could not load the opening input:', error);
    }

    if (!this.positions.length) {
      this.startNewSession({ fen: ChessBoard.INITIAL_FEN, orientation, elo, fallbackElo, autoReview: false });
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
    const intro = document.getElementById('empty-study-intro');
    intro.hidden = false;
    intro.replaceChildren();
    document.body.classList.add('empty-study');

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
        <a class="btn-home-primary" href="https://chromewebstore.google.com/detail/diverge-chess-analysis-sc/egiimjkekgiaimaagaljiclacljmdkmo">${getLang() === 'zh' ? '安装扩展，扫描网页棋图' : 'Install extension to scan a diagram'}</a>
        <button type="button" class="btn-home-primary" id="btn-home-import">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          ${t('btnImportCompleted')} →
        </button>
        ${this.checkup?.allowed() ? `<button type="button" class="btn-home-primary" id="btn-home-checkup">${t('checkupBtn')} →</button>` : ''}
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
    heroCard.querySelector('#btn-home-checkup')?.addEventListener('click', () => {
      this.checkup?.open();
    });
    heroCard.querySelector('#btn-chip-fischer')?.addEventListener('click', () => {
      this.el.sampleFischer?.click();
      this.el.btnSubmitPgn?.click();
    });
    heroCard.querySelector('#btn-chip-kasparov')?.addEventListener('click', () => {
      this.el.sampleKasparov?.click();
      this.el.btnSubmitPgn?.click();
    });

    intro.appendChild(heroCard);
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
    openOverview = false,
    positionInput = false,
    checkupSource = null,
    publicGameUrl = null,
    checkupOrientation = null,
    orientation = null,
    elo = null,
    eloProfileId = null,
    fallbackElo = null,
    ratingMatch = null,
    landAtEnd = false,
    focusMove = null
  } = {}) {
    if (this.scanSourceLocked) return false;
    const positionOnly = !!fen && !pgn && !moves?.length;
    let positionBoard, parsedMoves, positions;
    if (positionOnly) {
      positionBoard = new ChessBoard();
      if (!positionBoard.load(fen)) return false;
    } else {
      parsedMoves = moves?.length ? moves : GameAnalyzer.parsePgn(pgn);
      if (!parsedMoves?.length) {
        alert(t('errorParseMove'));
        return false;
      }
      if (parsedMoves.startFen && !new ChessBoard().load(parsedMoves.startFen)) {
        alert(t('errorIllegalFen'));
        return false;
      }
      positions = GameAnalyzer.buildPositionChain(parsedMoves);
      if (!positions || positions.length <= 1) {
        alert(t('errorBuildChain'));
        return false;
      }
    }

    const tags = pgn ? readPgnTags(pgn) : {};
    const conclusion = positionOnly ? null : FairPlayGuard.verifyConcludedGame(pgn || { result });
    if (focusMove) {
      const { ply, uci, fenBefore } = focusMove;
      if (!conclusion?.ok || !Number.isSafeInteger(ply) || ply <= 0 || positions?.isPartial ||
        positions?.[ply]?.uci !== uci || positions?.[ply - 1]?.fen !== fenBefore) return false;
    }

    const entryOrientation = ['white', 'black'].includes(orientation) ? orientation : this.sessionOrientation || this.boardUI.orientation;
    this.boardUI.setOrientation(entryOrientation);
    document.getElementById('setting-orientation').value = this.boardUI.orientation;
    const game = positionOnly ? null : checkupGameContext(pgn, {
      source: checkupSource, publicGameUrl, orientation: checkupOrientation || this.boardUI.orientation, white, black
    });
    const profile = this.mistakeBank?.activeProfile;
    const side = resolvePerspective(game, profile).side;
    const matchedElo = conclusion?.ok ? (side ? this.matchPgnElo(tags, side) : ratingMatch || this.matchPgnElo(tags)) : null;
    const explicitElo = !eloProfileId || eloProfileId === profile?.id ? parseStudioElo(elo) : null;
    this.sessionElo = explicitElo ? { value: explicitElo, explicit: true, profileId: eloProfileId }
      : matchedElo || (fallbackElo && !parseStudioElo(profile?.defaultElo) ? { value: fallbackElo } : null);
    this.setSessionElo(this.sessionElo?.value ?? this.profileDefaultElo());
    this.pgnTags = tags;
    const termination = tags.termination || '';
    this.terminationType = /(?:^resign|^resignation|\bwon by resignation|\bresigned)[.!]?$/i.test(termination) ? 'resignation'
      : /(?:\bwon on time|^time forfeit|^timeout)[.!]?$/i.test(termination) ? 'time' : null;
    if (this.checkup?.dialog?.open) this.checkup.close();
    this.tempAnalysisFen = null;
    this.tempPositionReturn = null;
    document.body.classList.remove('temp-position-analysis');
    const tempBanner = document.getElementById('temp-analysis-banner');
    if (tempBanner) tempBanner.hidden = true;
    this.checkupGame = null;
    this.profilePerspective = null;
    this.studyProfiles.render();
    this.consequencePlayer?.stop();
    this.reviewCommentary.reset();
    this.isSampleGame = !!pgn && (pgn.trim() === SAMPLE_GAMES.fischer.trim() || pgn.trim() === SAMPLE_GAMES.kasparov.trim());
    this.importGeneration = (this.importGeneration || 0) + 1;
    this.importController?.abort();
    clearInterval(this.playTimer);
    this.isPlaying = false;
    // 1. Immediately abort running tasks and advance session epochs
    clearTimeout(this.resumeReviewTimer);
    this.fullReviewRunning = this.reviewPendingResume = false;
    this.savedBranches = [];
    this.branchMotionLengths = new WeakMap();
    this.activeBranch = null;
    this.boardUI.clearAnnotations(true);
    this.renderStudyBranches();
    this.positionAnalysis.cancel();
    this.positionAnalysis.active = null;
    this.positionAnalysis.cache.clear();
    this.analyzer.cancel();
    this.intuitionReview?.dispose();
    this.gameEpoch++;
    this.checkup?.syncReplayBanner();
    this.reviewEpoch++;
    this.practice?.stop();
    this.practiceResults = new Map();
    this.reviewExplorer.reset(this.boardUI.orientation);
    this.reviewOverview.reset(this.reviewExplorer.side);
    this.reviewResult = null;
    this.coreReview = null;
    this.intuitionReview?.render();
    this.hasAnalysisInput = !!pgn || !!moves?.length || (!!fen && (fen !== ChessBoard.INITIAL_FEN || positionInput));
    this.sessionOrientation = this.hasAnalysisInput ? this.boardUI.orientation : null;
    this.sessionFallbackElo = fallbackElo;
    this.sessionInput = this.hasAnalysisInput ? {
      pgn, fen, white, black, result, checkupSource, publicGameUrl, landAtEnd,
      ...(focusMove ? { focusMove, autoReview: false } : {}),
      positionInput: positionOnly,
      moves: !pgn && !positionOnly ? parsedMoves.map(({ element, ...move }) => move) : null,
      startFen: !pgn && !positionOnly ? parsedMoves.startFen : null
    } : null;
    document.body.classList.toggle('empty-study', !this.hasAnalysisInput);
    document.getElementById('empty-study-intro').hidden = this.hasAnalysisInput;
    if (this.hasAnalysisInput && !this.workspaceEntered) {
      this.workspaceEntered = true;
      document.querySelectorAll('.board-column, .analysis-column, .insight-column').forEach((column, i) => {
        animateStudy(column, [{ opacity: 0 }, { opacity: 1 }], 280 + i * 60);
      });
    }

    document.body.classList.toggle('position-only', positionOnly && this.hasAnalysisInput);
    this.isReviewingMove = false;
    this.isBranching = false;
    document.body.classList.remove('exploring-branch');
    this.branchFen = null;
    if (this.el.branchBanner) this.el.branchBanner.style.display = 'none';

    this.el.btnReanalyze.disabled = true;

    // 2. Reset UI state immediately
    this.evalChart.setData([]);
    this.evalChart.setBranch(null);
    this.el.blunderCountBadge.textContent = '0';
    this.el.blunderList.replaceChildren();
    this.el.divergenceContent.textContent = '—';
    this.el.progressCard.style.display = 'none';
    this.boardUI.clearArrows();
    this.resetPositionPanel();

    // 3. Single FEN setup mode (puzzle, free board, initial start)
    if (positionOnly) {
      this.moves = [];
      this.positions = [{
        ply: 0,
        moveNumber: positionBoard.fullMoves || 1,
        turn: positionBoard.turn,
        san: 'Start',
        fen: positionBoard.getFen(),
        moveEl: null
      }];
      this.currentGameKey = `fen_${fen.replace(/\s+/g, '_')}`;
      this.renderGameMetadata({ white: white || (positionInput ? t('freeAnalysisBoard') : null), black: black || (positionInput ? 'FEN' : null), result });
      this.el.moveCountBadge.textContent = '0';
      this.renderMoveList();
      this.goToPly(0, { silent: true });
      this.rememberSession();
      this.syncGameLink();
      if (autoReview) {
        this.runFullReview(false);
      }
      return true;
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
    this.checkupGame = game;
    this.el.btnReanalyze.disabled = false;
    this.currentGameKey = this.getReviewKey();

    this.renderGameMetadata({ white, black, result: conclusion.ok ? conclusion.result : result });
    this.applyProfilePerspective();
    this.studyProfiles.render();

    this.el.moveCountBadge.textContent = this.moves.isPartial
      ? t('errorTruncated', { count: this.moves.length })
      : String(this.moves.length);

    this.renderMoveList();
    const initialPly = focusMove?.ply ?? (landAtEnd && conclusion.ok && !positions.isPartial ? positions.length - 1 : 0);
    this.goToPly(initialPly, { before: !!focusMove, silent: true });
    this.rememberSession();
    this.syncGameLink();

    if (openOverview) this.reviewOverview.requestAutoOpen();
    const compatibleReview = cachedReview && GameAnalyzer.isValidReviewCache(cachedReview) &&
      cachedReview.reviewMode === this.reviewMode &&
      (cachedReview.engineKey || 'sf19lite') === this.stockfish.engineKey &&
      (cachedReview.modelKey || 'maia3-5m') === this.maiaEngine.modelKey &&
      (cachedReview.elo == null || cachedReview.elo === this.currentElo);
    if (compatibleReview) {
      this.applyReviewResult(cachedReview);
      if (!cachedReview.engineOnly && cachedReview.positionEvaluations) {
        const epoch = this.gameEpoch;
        this.analyzer.analyzeGame(this.moves, { engineOnly: true, depth: cachedReview.depth, reviewMode: this.reviewMode, baseReview: cachedReview }).then(core => {
          if (this.gameEpoch === epoch && core) { this.coreReview = core; this.intuitionReview.render(); }
        }).catch(error => console.warn('[Studio] Cached score restore failed:', error));
      }
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
      publicGameUrl: game.url,
      orientation: game.orientation,
      elo: game.elo,
      cachedReview: game.cachedReview,
      autoReview: !game.cachedReview
    });
  }

  studyProfilesChanged(previousId) {
    this.studyProfiles?.render();
    this.checkup?.syncReplayBanner();
    this.checkupReminders?.profileChanged();
    if (previousId && previousId !== this.mistakeBank.activeProfile?.id
      && this.checkup?.dialog?.open && !this.checkup.updatingProfile) this.checkup.close();
    const changedPerspective = this.applyProfilePerspective();
    const profileId = this.mistakeBank.activeProfile?.id;
    if (previousId !== profileId || changedPerspective) {
      const manual = this.sessionElo?.explicit && (!this.sessionElo.profileId || this.sessionElo.profileId === profileId);
      if (!manual && this.hasAnalysisInput) {
        const match = this.checkupGame ? this.matchPgnElo(this.pgnTags, this.profilePerspective)
          : this.sessionElo?.source ? this.sessionElo : null;
        const fallback = parseStudioElo(this.mistakeBank.activeProfile?.defaultElo) ? null : this.sessionFallbackElo;
        this.sessionElo = match || (fallback ? { value: fallback } : null);
        this.rememberSession();
      }
      this.applyPreferences(getPreferences());
    }
    if (this.reviewResult && (changedPerspective || previousId !== this.mistakeBank.activeProfile?.id)) {
      this.renderBlunderCards();
      this.reviewOverview.render();
    }
  }

  applyProfilePerspective() {
    if (!this.moves.length || this.moves.isPartial || this.practice?.inProgress || this.tempAnalysisFen || this.scanSourceLocked) return;
    const matched = this.mistakeBank.getPerspective().side;
    if (matched === this.profilePerspective) return;
    this.profilePerspective = matched;
    const side = matched || (this.sessionOrientation === 'black' ? 'b' : 'w');
    if (!this.reviewExplorer.sideSelected) this.reviewExplorer.side = side;
    if (!this.reviewOverview.sideSelected) this.reviewOverview.side = this.reviewExplorer.side;
    return true;
  }

  loadGameFromPgn(pgnText, autoReview = true) {
    if (!pgnText || typeof pgnText !== 'string') return;
    return this.startNewSession({
      pgn: pgnText,
      autoReview
    });
  }

  getReviewKey() {
    return GameAnalyzer.getGameKey(this.moves, { depth: GameAnalyzer.DEFAULT_DEPTH, reviewMode: this.reviewMode, elo: this.currentElo, engineKey: this.stockfish.engineKey, modelKey: this.maiaEngine.modelKey });
  }

  changeEngineVersions({ persist = true, prioritizePosition = false } = {}) {
    const engine = document.getElementById('engine-edition').value;
    const model = document.getElementById('intuition-edition').value;
    if (engine === this.engineVariant && model === this.modelVariant) return;
    const engineChanged = engine !== this.engineVariant;
    const retainedCore = !engineChanged && this.coreReview?.reviewMode === this.reviewMode ? this.coreReview : null;
    if (this.isPlaying) this.toggleAutoPlay();
    this.consequencePlayer?.stop();
    this.positionAnalysis.cancel();
    this.analyzer.cancel();
    this.reviewCommentary.reset();
    this.reviewEpoch++;
    clearTimeout(this.resumeReviewTimer);
    this.fullReviewRunning = this.reviewPendingResume = false;
    this.intuitionReview?.dispose();
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
      history.replaceState(history.state, '', url);
    }
    this.initEngines({ keepStockfish: !engineChanged });
    this.coreReview = retainedCore;
    this.currentGameKey = this.getReviewKey();
    this.practice?.stop();
    this.practiceResults = new Map();
    this.reviewExplorer.reset(this.sessionOrientation || this.boardUI.orientation);
    this.reviewOverview.side = this.reviewExplorer.side;
    this.reviewResult = null;
    this.lastProgress = null;
    this.positionAnalysis.cache.clear();
    this.positionAnalysis.active = null;
    this.positionAnalysis.render();
    this.reviewOverview.show(this.reviewOverview.view);
    this.el.progressCard.style.display = 'none';
    this.el.blunderList.replaceChildren();
    this.el.blunderCountBadge.textContent = '0';
    this.el.divergenceContent.hidden = true;
    this.renderMoveList();
    if (retainedCore) {
      this.applyReviewResult(retainedCore);
      this.intuitionReview.start();
    } else if (this.moves.length && !this.isBranching && !prioritizePosition) this.runFullReview();
    else {
      this.reviewPendingResume = !!this.moves.length;
      this.updateActivePositionAnalysis();
      this.scheduleReviewResume();
    }
  }

  scrollWithin(element, container) {
    if (!element || !container) return;
    const item = element.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const top = box.top + container.clientTop + (parseFloat(getComputedStyle(container).scrollPaddingTop) || 0);
    const bottom = box.top + container.clientTop + container.clientHeight;
    const delta = item.top < top || (item.height > bottom - top && item.bottom > bottom) ? item.top - top
      : item.bottom > bottom ? item.bottom - bottom : 0;
    if (delta) container.scrollTop += delta;
  }

  revealPositionCandidates() {
    if (!matchMedia('(min-width:1180px)').matches) return;
    const section = document.querySelector('.position-analysis');
    const container = document.querySelector(matchMedia('(min-width:1360px)').matches ? '.analysis-scroll' : '.analysis-column');
    const box = container.getBoundingClientRect();
    const candidates = section.getBoundingClientRect();
    if (candidates.top < box.top || candidates.top + Math.min(candidates.height, container.clientHeight) > box.bottom) {
      container.scrollTop += candidates.top - box.top;
    }
  }

  profileDefaultElo(fallback = getPreferences().defaultElo) {
    return parseStudioElo(this.mistakeBank?.activeProfile?.defaultElo) ?? fallback;
  }

  matchPgnElo(tags, side) {
    const rating = value => /^\d{3,4}$/.test(value || '') ? Number(value) : null;
    const white = rating(tags.whiteelo);
    const black = rating(tags.blackelo);
    const preferred = side || (this.boardUI.orientation === 'black' ? 'b' : 'w');
    const source = (preferred === 'b' ? black : white) ? preferred : white ? 'w' : black ? 'b' : null;
    if (!source) return null;
    const raw = source === 'b' ? black : white;
    return { source, raw, value: Math.max(600, Math.min(2600, Math.round(raw / 100) * 100)) };
  }

  setSessionElo(elo) {
    this.currentElo = elo;
    const select = this.el.eloSelector;
    const value = String(elo);
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
    select.value = value;
    this.renderEloHint();
  }

  renderEloHint() {
    const match = this.sessionElo;
    this.el.eloHint.hidden = !match?.source;
    this.el.eloHint.textContent = match?.source ? t('reviewMatchedElo', {
      side: t(match.source === 'w' ? 'reviewWhite' : 'reviewBlack'), rating: match.raw, elo: match.value
    }) : '';
  }

  renderGameMetadata({ white, black, result } = {}) {
    const tags = this.pgnTags || {};
    const name = (tag, fallback, key) => tag && tag !== '?' ? tag : fallback || t(key).slice(3);
    this.el.metaWhite.textContent = `⚪ ${name(tags.white, white, 'whitePlayer')}${tags.whiteelo && tags.whiteelo !== '?' ? ` (${tags.whiteelo})` : ''}`;
    this.el.metaBlack.textContent = `⚫ ${name(tags.black, black, 'blackPlayer')}${tags.blackelo && tags.blackelo !== '?' ? ` (${tags.blackelo})` : ''}`;
    this.el.metaResult.textContent = result || tags.result || '*';
  }

  rememberSession() {
    if (!this.sessionInput) return;
    const url = new URL(location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    if (hash.has('scan')) return;
    for (const key of STUDIO_INPUT_PARAMS) {
      url.searchParams.delete(key);
      hash.delete(key);
    }
    url.hash = hash.toString();
    const session = {
      input: this.sessionInput,
      orientation: this.sessionOrientation,
      elo: this.sessionElo?.explicit ? this.sessionElo.value : null,
      eloProfileId: this.sessionElo?.profileId,
      fallbackElo: this.sessionFallbackElo,
      ratingMatch: this.sessionElo?.source ? this.sessionElo : null
    };
    try {
      history.replaceState({ ...history.state, [STUDIO_SESSION]: session }, '', url);
    } catch (error) {
      console.warn('[Analysis Studio] Could not save the current tab’s input:', error);
    }
  }

  syncGameLink() {
    const pgn = this.sessionInput?.pgn;
    const scan = new URLSearchParams(location.hash.slice(1)).has('scan');
    this.el.copyGameLink.hidden = !pgn || this.moves.isPartial || scan || !!this.scanSourceLocked ||
      !FairPlayGuard.verifyConcludedGame(pgn).ok || FairPlayGuard.isLiveGameInProgress();
    this.el.gameLinkField.hidden = true;
    this.reviewShare?.sync();
  }

  async copyGameLink() {
    if (this.el.copyGameLink.hidden || this.scanSourceLocked || FairPlayGuard.isLiveGameInProgress()) return;
    const input = this.sessionInput;
    const epoch = this.gameEpoch;
    const params = gameLinkInput(input.pgn, input);
    params.set('orientation', this.sessionOrientation || this.boardUI.orientation);
    params.set('elo', this.currentElo);
    params.set('lang', getLang());
    if (input.checkupSource) params.set('checkupSource', input.checkupSource);
    const url = new URL(location.protocol === 'chrome-extension:' ? 'https://4chess.cc/analysis/' : location.href);
    url.search = '';
    url.hash = params.toString();
    try {
      await navigator.clipboard.writeText(url.href);
      if (this.gameEpoch === epoch) this.showToast(t('reviewGameLinkCopied'));
    } catch {
      if (this.gameEpoch !== epoch || !this.reviewOverview.summary.open) return;
      this.el.gameLinkField.value = url.href;
      this.el.gameLinkField.hidden = false;
      this.el.gameLinkField.focus();
      this.el.gameLinkField.select();
    }
  }

  async runFullReview(forceRefresh = false, { openOverview = false } = {}) {
    if (this.checkup?.ownsEngines) return;
    this.consequencePlayer?.stop();
    this.practice?.stop();
    this.reviewCommentary.reset();
    this.intuitionReview?.dispose();
    if (this.scanSourceLocked) return;
    if (!this.moves || this.moves.length === 0) return;

    if (forceRefresh) this.reviewOverview.reset(undefined, { newGame: false });
    if (openOverview) this.reviewOverview.requestAutoOpen();
    this.positionAnalysis.cancel();
    this.reviewResult = this.coreReview = null;
    this.practiceResults = new Map();
    this.reviewExplorer.clear();
    this.intuitionReview.render();
    if (forceRefresh) this.positionAnalysis.cache.clear();
    this.reviewOverview.show(this.reviewOverview.view);
    const targetGameEpoch = this.gameEpoch;
    const targetReviewEpoch = ++this.reviewEpoch;
    const targetGameKey = this.currentGameKey;
    const targetElo = this.currentElo;
    const targetProfileId = this.mistakeBank?.activeProfile?.id;
    const checkupGame = this.checkupGame;
    clearTimeout(this.resumeReviewTimer);
    this.fullReviewRunning = true;
    this.reviewPendingResume = false;

    this.el.progressCard.style.display = 'flex';
    this.el.progressBar.style.width = '0%';
    this.el.progressCard.style.setProperty('--review-progress', '0');
    this.el.percentText.textContent = '0%';
    this.el.phaseText.textContent = t('preparingEngine');
    setTimeout(() => this.updateEngineStatus(), 0);

    this.el.blunderList.replaceChildren();

    try {
      // Scores must never wait for Maia download or position prediction.
      this.positionAnalysis.refresh({ calculate: false });
      const result = await this.analyzer.analyzeGame(this.moves, {
        depth: GameAnalyzer.DEFAULT_DEPTH,
        reviewMode: this.reviewMode,
        engineOnly: true,
        elo: targetElo,
        forceRefresh,
        onProgress: (prog) => {
          if (this.gameEpoch !== targetGameEpoch || this.reviewEpoch !== targetReviewEpoch) return;
          this.lastProgress = prog;
          this.el.progressBar.style.width = `${prog.percent}%`;
          this.el.progressCard.style.setProperty('--review-progress', String(Math.max(0, Math.min(100, Number(prog.percent) || 0))));
          this.el.percentText.textContent = `${prog.percent}%`;
          const detailEl = document.getElementById('blunder-loading-detail');
          if (prog.phase === 'evaluating') {
            const txt = t('evaluatingEngine', { current: prog.current, total: prog.total, move: prog.currentMove || '' });
            this.el.phaseText.textContent = txt;
            if (detailEl) detailEl.textContent = txt;
          } else if (prog.phase === 'scoring') {
            const txt = t('reviewVerifyingScore', { current: prog.current, total: prog.total });
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
        this.coreReview = result;
        this.applyReviewResult(result);
        this.intuitionReview.start();
        if (!this.moves.isPartial && !result.isPartial && result.positionEvaluations?.length === this.positions.length) {
          this.checkupReminders?.recordReview(targetProfileId, checkupGame)
            .catch(error => console.warn('[Checkup reminders] Could not record review:', error));
          if (checkupGame?.gameId && this.checkup?.allowed()) {
            const sides = { w: { errors: {} }, b: { errors: {} } };
            for (const move of result.allMoves || []) {
              const quality = moveQuality(move);
              if (quality !== 'unknown' && sides[move.turn]) {
                sides[move.turn].errors[move.ply] = quality === 'mistake' || quality === 'blunder';
              }
            }
            this.mistakeBank?.store.saveCheckupReviewEvidence(targetProfileId, checkupGame, sides)
              .catch(error => console.warn('[Checkup] Could not save clock-pressure evidence:', error));
          }
        }
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

  renderAccuracyDetails() {
    const result = this.reviewResult;
    if (!result) return;
    for (const [side, turn] of [['white', 'w'], ['black', 'b']]) {
      const decisions = result.allMoves.filter(m => m.turn === turn && !m.isOnlyLegalMove);
      const valid = decisions.filter(m => Number.isFinite(m.accuracy)).length;
      const detail = document.getElementById(`accuracy-detail-${side}`);
      if (detail) detail.textContent = t('accuracySamples', { valid, total: decisions.length });
    }
    const depth = result.depthMin == null ? t('accuracyTargetDepth', { depth: result.depth })
      : `D${result.depthMin}${result.depthMax > result.depthMin ? '–' + result.depthMax : ''}`;
    const verified = result.scoreVerifications || [];
    const detail = t('accuracyAnalysisDetail', {
      engine: result.engineKey?.startsWith('sf19standard') ? 'SF19 Standard' : 'SF19 Lite', depth
    });
    document.getElementById('accuracy-analysis-detail').textContent = verified.length
      ? detail + ' · ' + t('accuracyVerifiedDepth', { count: verified.length, depth: Math.max(...verified.map(move => move.depth)) })
      : detail;
  }

  applyReviewResult(result, { refreshPosition = true } = {}) {
    this.reviewResult = result;
    if (result.engineOnly) this.coreReview = result;
    this.intuitionReview?.render();

    this.renderAccuracyDetails();

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
    }

    // 1. Update Chart
    this.evalChart.setData(result.allMoves, result.positionEvaluations);
    this.evalChart.setCursor(this.currentPly);
    this.syncBranchChart();
    this.renderCurrentInsight();

    this.renderBlunderCards();
    this.reviewOverview.update(result);

    // 3. Annotate Move Notation Table
    this.annotateMoveList(result.allMoves);

    // 4. Update current position insight
    try {
      if (refreshPosition) this.updateActivePositionAnalysis();
    } catch (err) {
      console.warn('[Analysis Studio] Failed to update active position analysis on review completion:', err);
    }
  }

  startPractice(item, options = [item]) {
    this.consequencePlayer?.stop();
    this.practice ||= new ReviewPractice(this);
    const config = Array.isArray(options) ? { queue: options } : (options || { queue: [item] });
    this.practice.start(item, config);
    if (this.practice.inProgress) this.reviewCommentary.cancelOverview();
  }

  enterTemporaryPositionAnalysis(item, { returnTo = 'practice' } = {}) {
    if (this.scanSourceLocked || !item?.fenBefore) return;
    if (this.isPlaying) this.toggleAutoPlay();
    this.consequencePlayer?.stop();
    clearTimeout(this.resumeReviewTimer);
    this.positionAnalysis.cancel();
    const origin = returnTo === 'practice' ? null : this.capturePracticeOrigin();
    this.tempPositionReturn = {
      returnTo,
      epoch: this.gameEpoch,
      orientation: this.boardUI.orientation,
      hasAnalysisInput: this.hasAnalysisInput,
      isBranching: this.isBranching,
      activeBranch: this.activeBranch,
      branchFen: this.branchFen,
      branchHistory: this.branchHistory ? [...this.branchHistory] : [],
      savedBranchCount: this.savedBranches.length,
      origin
    };
    if (returnTo === 'practice') this.practice?.suspendForTempAnalysis?.();
    if (this.isBranching) {
      this.isBranching = false;
      document.body.classList.remove('exploring-branch');
      if (this.el.branchBanner) this.el.branchBanner.style.display = 'none';
    }
    this.tempAnalysisFen = item.fenBefore;
    document.body.classList.remove('empty-study');
    document.body.classList.add('temp-position-analysis');
    const intro = document.getElementById('empty-study-intro');
    if (intro) intro.hidden = true;
    const banner = document.getElementById('temp-analysis-banner');
    const backBtn = document.getElementById('btn-temp-analysis-back');
    if (banner) banner.hidden = false;
    if (backBtn) {
      backBtn.textContent = t(returnTo === 'practice' ? 'tempAnalysisBackPractice' : 'tempAnalysisBackBank');
      backBtn.onclick = () => this.exitTemporaryPositionAnalysis();
    }
    this.boardUI.setOrientation(returnTo === 'practice' ? this.boardUI.orientation : (item.turn === 'b' ? 'black' : 'white'));
    const trig = item.triggerMove?.from && item.triggerMove?.to ? { from: item.triggerMove.from, to: item.triggerMove.to } : null;
    this.boardUI.setPosition(item.fenBefore, trig);
    this.positionAnalysis.refresh();
  }

  exitTemporaryPositionAnalysis() {
    const ret = this.tempPositionReturn;
    this.tempAnalysisFen = null;
    this.tempPositionReturn = null;
    document.body.classList.remove('temp-position-analysis');
    const banner = document.getElementById('temp-analysis-banner');
    if (banner) banner.hidden = true;
    this.positionAnalysis.cancel();
    if (!ret || ret.epoch !== this.gameEpoch) return;
    this.hasAnalysisInput = !!ret.hasAnalysisInput;
    this.savedBranches.length = Math.min(this.savedBranches.length, ret.savedBranchCount ?? 0);
    this.isBranching = !!ret.isBranching;
    this.activeBranch = ret.activeBranch || null;
    this.branchFen = ret.branchFen || null;
    this.branchHistory = ret.branchHistory || [];
    document.body.classList.toggle('exploring-branch', this.isBranching);
    if (this.el.branchBanner) this.el.branchBanner.style.display = this.isBranching ? 'flex' : 'none';
    this.renderStudyBranches();
    this.syncBranchChart();
    this.boardUI.setOrientation(ret.orientation);
    if (ret.returnTo === 'practice' && this.practice?.suspended) {
      this.practice.resumeFromTempAnalysis(ret.orientation);
      return;
    }
    this.restorePracticeOrigin(ret.origin);
    if (ret.returnTo === 'bank') this.mistakeBank?.open?.();
  }

  capturePracticeOrigin() {
    const scrollAreas = [document.scrollingElement, ...document.querySelectorAll(
      '.analysis-column, .analysis-scroll, .insight-column, #move-notation-table')];
    return {
      epoch: this.gameEpoch, ply: this.currentPly, before: this.isReviewingMove,
      branch: this.isBranching ? this.activeBranch : null, cursor: this.activeBranch?.cursor,
      orientation: this.boardUI.orientation, side: this.reviewExplorer.side, filter: this.currentDivergenceFilter,
      emptyStudy: document.body.classList.contains('empty-study'),
      focus: document.activeElement, scroll: scrollAreas.map(element => [element, element.scrollTop])
    };
  }

  restorePracticeOrigin(origin, move) {
    if (origin?.epoch !== this.gameEpoch || this.scanSourceLocked) return;
    this.reviewCommentary.maybeGenerateOverview();
    this.reviewExplorer.side = origin.side;
    this.currentDivergenceFilter = origin.filter;
    this.boardUI.setOrientation(origin.orientation);
    if (origin.emptyStudy) {
      document.body.classList.add('empty-study');
      const intro = document.getElementById('empty-study-intro');
      if (intro) intro.hidden = false;
      this.goToPly(0, { silent: true });
      return;
    }
    this.renderBlunderCards();
    if (move) {
      this.reviewOverview.jumpTo(move);
      return;
    }
    this.goToPly(origin.ply, { before: origin.before, silent: true });
    if (origin.branch) {
      this.activeBranch = origin.branch;
      this.showBranchPosition(origin.cursor, { silent: true });
    }
    const fallback = this.el.blunderList.querySelector(`[data-ply="${origin.ply}"] .practice-start`) ||
      document.getElementById('review-practice-batch');
    const focus = origin.focus?.isConnected ? origin.focus : fallback;
    focus?.focus({ preventScroll: true });
    for (const [element, top] of origin.scroll) element.scrollTop = top;
  }

  renderBlunderCards(moments) {
    const moves = this.reviewResult?.allMoves || moments || [];
    const filtered = this.reviewExplorer.render(moves);
    this.reviewOverview?.renderPractice(this.reviewExplorer.available(moves));
    this.el.blunderCountBadge.textContent = String(filtered.length);
    document.getElementById('lbl-tab-blunders').textContent = t(this.currentDivergenceFilter === 'all' ? 'reviewKeyMoves' : this.currentDivergenceFilter === 'moves' ? 'reviewAllMoves' : 'reviewSelectedMoves');
    this.el.blunderList.replaceChildren();
    const observations = this.currentDivergenceFilter === 'all' && this.reviewResult && !this.reviewResult.isPartial
      ? selectReviewObservations(this.reviewExplorer.available(moves), this.reviewExplorer.side, this.reviewResult.positionEvaluations) : [];
    if (!filtered.length && !observations.length) {
      const empty = document.createElement('p'); empty.className = 'review-empty';
      empty.textContent = t(this.reviewResult?.engineOnly && INTUITION_KINDS.includes(this.currentDivergenceFilter) ? 'reviewIntuitionPending' : 'reviewNoSelection');
      this.el.blunderList.append(empty); return;
    }
    const turningPoints = coreTurningPoints(this.reviewExplorer.available(moves));
    for (const item of filtered) {
      const quality = moveQuality(item), kind = intuitionKind(item);
      const card = document.createElement('article'); card.className = `blunder-card quality-${quality}`; card.dataset.ply = item.ply;
      const heading = document.createElement('div'); heading.className = 'blunder-card-top';
      const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'review-move-jump';
      jump.textContent = `${item.moveNumber}${item.turn === 'w' ? '. ' : '… '}${item.san}`;
      jump.setAttribute('aria-label', `${t(item.turn === 'w' ? 'whitePlayer' : 'blackPlayer')} ${jump.textContent}`);
      jump.onclick = () => this.goToPly(item.ply, { before: true, revealCandidates: true }); heading.append(jump);
      const tags = document.createElement('div'); tags.className = 'blunder-tags-group';
      for (const tag of [quality, ...(kind ? [kind] : []), ...(item.isBookMove ? ['book'] : [])]) {
        const badge = document.createElement('span'); badge.className = `blunder-type-tag review-tag-${tag}`;
        badge.textContent = t(tag === 'beyond' && item.isCombinationFollowup ? 'beyondComboText' : `reviewQuality_${tag}`); tags.append(badge);
      }
      if (turningPoints.has(item.ply)) tags.append(Object.assign(document.createElement('span'), {
        className: 'review-turning-point', textContent: t('reviewTurningPoint')
      }));
      heading.append(tags); card.append(heading);
      card.addEventListener('click', event => { if (!event.target.closest('button')) this.goToPly(item.ply, { before: true, revealCandidates: true }); });
      const loss = document.createElement('p'); loss.className = 'review-card-loss';
      loss.textContent = quality === 'unknown' ? t('reviewEvaluationPending') : quality === 'forced' ? t('reviewForcedHelp') : t('reviewLoss', { pawns: (Math.max(0, item.lossCp) / 100).toFixed(2) }); card.append(loss);
      const probability = Number.isFinite(item.humanRawProbability) ? item.humanRawProbability * 100 : item.humanProbability;
      if (kind === 'trap') {
        const note = document.createElement('p'); note.className = 'review-card-reason';
        if (Number.isFinite(probability)) note.textContent = t('reviewTrapReason', { elo: this.reviewResult?.elo || this.currentElo, probability: probability.toFixed(1) });
        if (Number.isFinite(item.verifiedExpectedScoreLoss) && Number.isFinite(item.verifiedLossCp)) {
          const proof = t('reviewTrapVerified', { pawns: (item.verifiedLossCp / 100).toFixed(2), points: item.verifiedExpectedScoreLoss.toFixed(1) });
          note.textContent = [note.textContent, proof].filter(Boolean).join(' ');
        }
        if (note.textContent) card.append(note);
      } else if (['beyond', 'precise'].includes(kind) && Number.isFinite(item.maiaAdvantageCp ?? item.maiaLossCp)) {
        const note = document.createElement('p'); note.className = 'review-card-reason';
        if (Number.isFinite(item.maiaESL) && Number.isFinite(item.maiaAdvantageCp)) {
          note.textContent = t('reviewMaiaGain', { move: item.maiaTopSan, pawns: (item.maiaAdvantageCp / 100).toFixed(2), points: item.maiaESL.toFixed(1) });
        } else {
          note.textContent = t('reviewBeyondReason', { move: item.maiaTopSan || '—', pawns: ((item.maiaAdvantageCp ?? item.maiaLossCp) / 100).toFixed(2) });
        }
        card.append(note);
      }
      const bestSan = item.verifiedBestSan || item.bestSan;
      if (bestSan && bestSan !== '?' && bestSan !== item.san && quality !== 'unknown') {
        const best = document.createElement('p'); best.textContent = t('cardEngineBestMove', { move: bestSan });
        best.className = 'review-card-best';
        card.append(best);
      }
      if (canPractice(item)) {
        const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn-header practice-start'; retry.textContent = t('retryMove');
        retry.onclick = () => this.startPractice(item); card.append(retry);
      }
      this.reviewCommentary.addCardAction(card, item, this.reviewResult);
      this.mistakeBank?.addCardActions(card, item, this.reviewResult);
      if (item.bestUci || item.maiaTopUci) {
        const shareBtn = document.createElement('button');
        shareBtn.type = 'button';
        shareBtn.className = 'btn-header';
        shareBtn.textContent = t('shareCardBtn');
        shareBtn.onclick = () => this.shareCard?.open(item, { elo: this.reviewResult?.elo || this.currentElo });
        card.append(shareBtn);
      }
      const status = this.practiceResults?.get(item.ply)?.status;
      if (status) { const note = document.createElement('span'); note.className = 'review-practice-status'; note.textContent = t(`practiceStatus_${status}`); card.append(note); }
      if (item.ply === this.currentPly) card.classList.add('active');
      this.el.blunderList.append(card);
    }
    if (observations.length) {
      const section = document.createElement('section');
      section.className = 'review-observations';
      const title = document.createElement('h3');
      title.textContent = t('reviewObservations');
      section.append(title);
      for (const move of observations) {
        const row = document.createElement('div');
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'btn-header';
        jump.textContent = t('reviewInspectRound', { round: move.moveNumber });
        jump.onclick = () => this.goToPly(move.ply, { before: true, revealCandidates: true });
        const note = document.createElement('p');
        note.textContent = t('reviewObservationMoves', { played: move.san, best: move.bestSan });
        row.append(jump, note);
        section.append(row);
      }
      this.el.blunderList.append(section);
    }
  }

  renderMoveList() {
    cancelMotion(this.notationMarker);
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
    this.renderStudyBranches();
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
    const table = this.el.moveNotationTable;
    const previous = table.querySelector('.notation-move.active');
    cancelMotion(this.notationMarker);
    this.notationMarker?.remove();
    const all = table.querySelectorAll('.notation-move');
    all.forEach(el => { cancelMotion(el); el.classList.remove('active'); });
    if (ply === 0) {
      table.scrollTop = 0;
    }

    if (ply > 0) {
      const activeEl = document.getElementById(`move-ply-${ply}`);
      if (activeEl) {
        activeEl.classList.add('active');
        this.notationMarker ||= document.createElement('span');
        this.notationMarker.className = 'notation-selection';
        this.notationMarker.setAttribute('aria-hidden', 'true');
        activeEl.prepend(this.notationMarker);
        this.scrollWithin(activeEl, table);
        if (previous && previous !== activeEl) {
          const from = previous.getBoundingClientRect(), to = activeEl.getBoundingClientRect();
          // Keep long jumps immediate; adjacent selections carry the highlight only.
          if (Math.abs(from.top - to.top) <= 80) animateStudy(this.notationMarker, [
            { transform: `translate(${from.left - to.left}px,${from.top - to.top}px)` },
            { transform: 'none' }
          ], 180);
        }

      }
    }
  }

  goToPly(ply, options = {}) {
    this.consequencePlayer?.stop();
    if (!options.practice) {
      this.practice?.stop();
      if (options.revealCandidates && this.reviewOverview.view === 'overview') this.reviewOverview.show('workbench');
    }
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

    if (clampedPly === 0) {
      this.el.boardStatusText.textContent = t('startingPosition');
    } else {
      const sideText = currentPos.turn === 'w' ? t('whitePlayer').replace('⚪ ', '') : t('blackPlayer').replace('⚫ ', '');
      this.el.boardStatusText.textContent = this.isReviewingMove ? t('reviewMoveBefore', { move: currentPos.san, number: currentPos.moveNumber }) : t('moveIndicator', { move: currentPos.moveNumber, side: sideText, san: currentPos.san });
    }
    this.updateActivePositionAnalysis();
    this.renderCurrentInsight();
    this.renderStudyBranches();
    // Sync active blunder card if present
    const blunderCards = this.el.blunderList.querySelectorAll('.blunder-card');
    blunderCards.forEach(c => {
      if (parseInt(c.dataset.ply, 10) === clampedPly) {
        const newlySelected = !c.classList.contains('active');
        c.classList.add('active');
        if (newlySelected) animateStudy(c, [{ boxShadow: '0 0 0 3px var(--dg-green-soft)' }, { boxShadow: '0 0 0 0 transparent' }], 480);
        this.scrollWithin(c, document.querySelector('.insight-column'));
      } else {
        cancelMotion(c);
        c.classList.remove('active');
      }
    });

    if (options.revealCandidates) this.revealPositionCandidates();
    if (!options.silent) this.scheduleReviewResume();
  }

  updateActivePositionAnalysis() {
    if (!this.practice?.active && !this.checkup?.ownsEngines) this.positionAnalysis.refresh();
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
      const effectiveElo = this.sessionElo?.value ?? this.profileDefaultElo(prefs.defaultElo);
      const eloChanged = this.currentElo !== effectiveElo;
      const reviewModeChanged = this.reviewMode !== prefs.studio_review_mode;
      const calculate = eloChanged || this.settings.heatmap !== prefs.showHeatmap || this.positionMaxDepth !== prefs.studio_max_depth;
      this.reviewMode = prefs.studio_review_mode;
      this.el.reviewMode.value = this.reviewMode;
      if (getLang() !== prefs.maia3_lang) setLanguage(prefs.maia3_lang);
      this.setSessionElo(effectiveElo);
      for (const [id, key, preference] of POSITION_TOGGLES) {
        this.settings[key] = prefs[preference];
        document.getElementById(id).checked = prefs[preference];
      }
      this.positionMaxDepth = prefs.studio_max_depth;
      this.el.positionDepth.value = String(this.positionMaxDepth);
      const orientation = this.sessionOrientation || prefs.studio_orientation;
      this.boardUI.setOrientation(orientation);
      document.getElementById('setting-orientation').value = orientation;
      soundEffects.enabled = prefs.diverge_sound_enabled;
      this.updateSoundToggleUI();
      this.updatePreferenceNotes();
      if (versionsChanged) {
        document.getElementById('engine-edition').value = engine; document.getElementById('intuition-edition').value = prefs.maiaVariant;
        this.changeEngineVersions({ persist: false });
      } else if (reviewModeChanged && this.moves.length) {
        this.currentGameKey = this.getReviewKey();
        this.runFullReview();
      } else if (eloChanged) {
        this.intuitionReview.dispose();
        this.currentGameKey = this.getReviewKey();
        if (this.coreReview) { this.applyReviewResult(this.coreReview); this.intuitionReview.start(); }
        else if (this.moves.length && !this.isBranching) this.runFullReview(); else this.positionAnalysis.refresh();
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
    this.consequencePlayer?.stop();
    if (this.isPlaying) this.toggleAutoPlay();
    this.pauseWholeReview();
    if (!this.tempAnalysisFen) this.hasAnalysisInput = true;
    if (!this.isBranching) {
      this.activeBranch = { base: { ...context, history: [...context.history] }, anchor: this.currentPly, moves: [], cursor: 0, evaluations: new Map() };
      this.savedBranches.push(this.activeBranch);
    }
    this.activeBranch.moves = [...this.activeBranch.moves.slice(0, this.activeBranch.cursor), ...variation];
    this.showBranchPosition(this.activeBranch.moves.length);
  }

  showBranchPosition(cursor, { silent = false } = {}) {
    if (!silent) {
      if (this.reviewOverview.view === 'overview') this.reviewOverview.show('workbench');
    }
    const branch = this.activeBranch;
    branch.cursor = Math.max(0, Math.min(cursor, branch.moves.length));
    this.isBranching = true;
    document.body.classList.add('exploring-branch');
    const moves = branch.moves.slice(0, branch.cursor);
    this.branchFen = moves.at(-1)?.fen || branch.base.fen;
    this.branchHistory = [...branch.base.history, ...[branch.base.fen, ...moves.map(move => move.fen)].slice(0, -1)].slice(-7);
    this.el.branchBanner.style.display = 'flex';
    const last = moves.at(-1);
    this.boardUI.setPosition(this.branchFen, last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null);
    this.el.boardStatusText.textContent = last?.label || t('branchBannerText');
    this.renderStudyBranches();
    this.syncBranchChart();
    this.renderCurrentInsight();
    if (last && !silent) soundEffects.playSoundForMove(last.san);
    this.updateActivePositionAnalysis();
  }

  navigateStudy(delta) {
    if (this.isBranching) {
      if (this.activeBranch.cursor + delta < 0) this.goToPly(Math.max(0, this.activeBranch.base.ply - 1));
      else this.showBranchPosition(this.activeBranch.cursor + delta);
    } else this.goToPly(this.currentPly + delta);
  }

  renderStudyBranches() {
    document.getElementById('study-branches')?.remove();
    this.el.moveNotationTable.querySelectorAll('.study-branches').forEach(el => el.remove());
    if (!this.savedBranches.length) return;
    for (const branch of this.savedBranches) {
      const list = document.createElement('div'); list.className = 'study-branches';
      this.branchMotionLengths ||= new WeakMap();
      const previousLength = this.branchMotionLengths.get(branch);
      this.branchMotionLengths.set(branch, branch.moves.length);
      list.setAttribute('aria-label', t('userBranches'));
      const label = document.createElement('span'); label.className = 'branch-origin';
      label.textContent = '↳'; list.append(label);
      branch.moves.forEach((move, i) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'study-branch';
        const before = new ChessBoard(i ? branch.moves[i - 1].fen : branch.base.fen);
        button.textContent = `${before.turn === 'w' ? before.fullMoves + '. ' : i === 0 ? before.fullMoves + '… ' : ''}${move.san}`;
        button.setAttribute('aria-pressed', String(this.isBranching && branch === this.activeBranch && i + 1 === branch.cursor));
        button.onclick = () => { this.pauseWholeReview(); this.activeBranch = branch; this.currentPly = branch.anchor; this.showBranchPosition(i + 1); };
        list.append(button);
      });
      const row = document.getElementById(`move-ply-${branch.base.ply + 1}`)?.closest('.notation-row') || document.getElementById(`move-ply-${branch.base.ply}`)?.closest('.notation-row');
      if (row) row.after(list); else this.el.moveNotationTable.append(list);
      if (previousLength === undefined) {
        animateStudy(list, [{ clipPath: 'inset(0 0 100% 0)', opacity: .5 }, { clipPath: 'inset(0)', opacity: 1 }], 240);
      } else if (branch.moves.length > previousLength) {
        animateStudy(list.lastElementChild, [{ opacity: 0, transform: 'translateX(-5px)' }, { opacity: 1, transform: 'none' }], 180);
      }
    }
  }

  branchEvaluationKey(fen, depth = this.positionMaxDepth) {
    return `${this.stockfish.engineKey}|${depth}|${fen}`;
  }

  syncBranchChart() {
    const branch = this.isBranching && this.activeBranch;
    if (!branch) { this.evalChart.setBranch(null); return; }
    const points = [branch.base, ...branch.moves].map((node, offset) => {
      const evaluation = branch.evaluations.get(this.branchEvaluationKey(node.fen));
      const origin = offset === 0 && this.evalChart.mainPoints.find(point => point.ply === branch.base.ply);
      if (origin && Number.isFinite(origin.cp)) return { ...origin, offset: 0, san: t('branchStart') };
      const before = new ChessBoard(offset < 2 ? branch.base.fen : branch.moves[offset - 2].fen);
      return { ply: branch.base.ply + offset, offset, san: node.san || t('branchStart'), moveNumber: before.fullMoves, turn: before.turn,
        cp: evaluation?.cp ?? null, displayText: evaluation?.text || '—', depth: evaluation?.depth };
    });
    this.evalChart.setBranch({ basePly: branch.base.ply, cursor: branch.cursor, points });
  }

  renderPositionHeading(evaluation) {
    const score = document.getElementById('position-score');
    const text = evaluation?.text || '—';
    const fen = this.boardUI.chess.getFen();
    // Animate the first measured score of a position, never every search-depth update.
    if (text !== '—' && (this.lastScoreFen !== fen || score.textContent === '—')) {
      animateStudy(score, [{ opacity: .55, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], 180);
      this.lastScoreFen = fen;
    } else if (text === '—') cancelMotion(score);
    score.textContent = text;
    document.getElementById('position-context').textContent = t(this.isBranching ? 'chartBranch' : 'currentPosition');
  }

  renderCurrentInsight() {
    const panel = document.getElementById('current-insight');
    const contextKey = `${this.isBranching}:${this.currentPly}:${this.activeBranch?.cursor ?? ''}`;
    if (panel.dataset.context !== contextKey) {
      animateStudy(panel, [{ opacity: .55, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], 180);
      panel.dataset.context = contextKey;
    }
    panel.replaceChildren();
    const move = this.reviewResult?.allMoves?.find(move => move.ply === this.currentPly);
    if (!this.isBranching && !move) {
      this.reviewCommentary?.clearContext();
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const heading = document.createElement('div'); heading.className = 'insight-context-heading';
    heading.textContent = this.isBranching ? t('branchComparison') : `${move.moveNumber}${move.turn === 'w' ? '. ' : '… '}${move.san}`;
    panel.append(heading);
    if (this.isBranching) {
      this.reviewCommentary.clearContext();
      const note = document.createElement('p'); note.textContent = t('branchScoreNote'); panel.append(note);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-header'; button.textContent = t('btnExitBranch');
      button.onclick = () => this.goToPly(this.currentPly); panel.append(button);
    } else {
      for (const [label, value] of [[t('cardPlayed'), move.san], [t('engineCandidates'), move.bestSan], [t('intuitionCandidates'), move.maiaTopSan]]) {
        if (!value || value === '?') continue;
        const row = document.createElement('div'); row.className = 'insight-fact';
        const name = document.createElement('span'); name.textContent = label;
        const result = document.createElement('strong'); result.textContent = value; row.append(name, result); panel.append(row);
      }
      if (canPractice(move)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-header btn-primary'; button.textContent = t('retryMove');
        button.onclick = () => this.startPractice(move); panel.append(button);
      }
      if (move.bestUci || move.maiaTopUci) {
        const shareBtn = document.createElement('button');
        shareBtn.type = 'button';
        shareBtn.className = 'btn-header';
        shareBtn.textContent = t('shareCardBtn');
        shareBtn.onclick = () => this.shareCard?.open(move, { elo: this.reviewResult?.elo || this.currentElo });
        panel.append(shareBtn);
      }
      this.reviewCommentary.render(panel, move, this.reviewResult);
    }
  }

  pauseWholeReview() {
    this.reviewOverview.autoOpenRequested = false;
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

  pauseForCheckup() {
    const epoch = this.gameEpoch;
    const intuitionWasRunning = this.intuitionReview.state === 'running';
    if (this.isPlaying) this.toggleAutoPlay();
    this.pauseWholeReview();
    this.positionAnalysis.cancel();
    if (intuitionWasRunning) this.intuitionReview.pause();
    return () => {
      if (epoch !== this.gameEpoch || !this.checkup.allowed()) return;
      this.updateActivePositionAnalysis();
      this.scheduleReviewResume();
      if (intuitionWasRunning && this.intuitionReview.state === 'paused') this.intuitionReview.start();
    };
  }

  scheduleReviewResume() {
    if (!this.reviewPendingResume || this.isBranching || this.positionAnalysis.eloTrend?.isOpen || this.checkup?.ownsEngines) return;
    clearTimeout(this.resumeReviewTimer);
    this.resumeReviewTimer = setTimeout(() => {
      if (this.reviewPendingResume && !this.isBranching && !this.fullReviewRunning && !this.positionAnalysis.eloTrend?.isOpen && !this.checkup?.ownsEngines) this.runFullReview();
    }, 1800);
  }

  handleUserBoardMove(move, newFen) {
    if (!this.tempAnalysisFen && this.practice?.inProgress) {
      if (this.practice.active) this.practice.handleBoardMove(move, newFen);
      return;
    }
    const next = this.positions[this.currentPly + (this.isReviewingMove ? 0 : 1)];
    if (!this.tempAnalysisFen && !this.isBranching && next?.uci === move.uci) {
      this.goToPly(this.currentPly + (this.isReviewingMove ? 0 : 1));
      return;
    }
    const context = this.positionAnalysis.context();
    this.previewCandidate(context, [{ ...move, label: move.san || move.uci, fen: newFen }]);
  }

  exitBranchMode() {
    if (!this.isBranching) return;
    this.isBranching = false;
    document.body.classList.remove('exploring-branch');
    this.evalChart.setBranch(null);
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
  if (Object.keys(intent).length) {
    await savePreferences(intent);
    for (const key of ['sf', 'maia', 'lang']) { url.searchParams.delete(key); hash.delete(key); }
    url.hash = hash.toString(); history.replaceState(history.state, '', url);
  }
  const scanToken = hash.get('scan');
  if (scanToken) { setLanguage(getPreferences().maia3_lang); initI18n(); }
  let scanRevoked = false;
  if (!await authorizeScan(
    scanToken,
    () => { scanRevoked = true; showScanLock(window.__maiaStudioApp); },
    available => setScanAvailability(window.__maiaStudioApp, available)
  ) || scanRevoked) return;
  if (!window.__maiaStudioApp) {
    window.__maiaStudioApp = new AnalysisStudioApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
