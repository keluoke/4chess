const english = { reviewTrainingTitle: 'Review both sides and retry a selection', reviewTrainingBody: 'After scoring, compare Best, Good, Inaccuracy, Mistake, Blunder, Forced and Incomplete counts for White and Black. Click a count to filter moves and a move to return to its decision point. Opening and intuition tags may overlap quality labels; combination follow-ups do not inflate independent beyond-intuition counts. Intuition counts are unavailable until scanning.', reviewTrainingPractice: 'Choose White, Black or both and practice errors and confirmed intuition moments in the selection. Answers stay hidden; hints, answer reveal and next-position controls support independent attempts. Results distinguish independent, hinted, revealed and retry-later outcomes, and stay in this game session only. One success does not establish mastery. Side filters are independent of board flipping.', installExtension: 'Add to Chrome',
  scanTitle: 'Scan a chess diagram', scanBody: 'Open a static diagram in a post or article, or a permitted study board, then click Scan page. Page boards use DOM reading when available; images use the packaged local vision model. Scan automatically opens the recognized board; if detection fails, crop the screenshot and retry. Edit position corrects pieces and recognized direction. View changes only the viewing angle. Settings opens a separate scrollable screen; use Back or Escape to return with your position and edit draft intact. Coordinates determine board orientation. Without turn evidence, side to move defaults to the viewed side and remains unconfirmed. Check pieces, orientation and side to move; correct with the piece palette or complete FEN, then confirm to start SF19 Lite. Images default to no castling or en passant rights.', scanHandoff: 'Click or drag pieces to explore variations, and right-drag to annotate. Explore engine vs intuition opens the current confirmed position with saved web engine/Maia preferences. A single position has no full-game accuracy or chart. Live play, source navigation or closure stops scan analysis. Supported sources include safe Chess.com/Lichess pages and static diagrams in Twitter/X timelines, forums, articles or image documents. Ordinary-page scans retain only visible static images; scroll the complete board into view and crop it if several images are present. Replacing a captured image stops analysis. Unknown interactive game pages and live broadcasts stay locked.',
  reviewMethodTitle: 'Review guide',
  reviewMethodAccuracy: 'How accuracy is calculated',
  reviewMethodAccuracyBody: 'Stockfish scores are converted to expected score Q. Each move scores A = 100 × exp(−5.11 × ΔQ), where ΔQ is the loss in expected score. Game accuracy averages the volatility-weighted mean and the harmonic mean so that critical errors retain their weight. Forced moves, failed evaluations, clock use and time forfeits are excluded.',
  reviewMethodAccuracyScope: 'Accuracy is a Diverge estimate. Chess.com and Lichess use their own scoring methods. A lopsided position can still score highly. The workbench shows how many moves counted for each side, which engine ran, and the search depth.',
  reviewMethodQuality: 'How moves are classified',
  reviewMethodQualityBody: 'Best is the current search’s top choice. Other moves are Good below 0.40 pawns of loss, Inaccuracy from 0.40 to below 1.00, Mistake from 1.00 to below 2.00, and Blunder from 2.00. A sole legal move is Forced. Moves with insufficient evidence are Incomplete.',
  reviewMethodLabels: 'Each move has one quality classification. Opening and intuition tags can overlap with it. The intuition scan adds three confirmed labels. An intuition trap is a natural or documented opening move that clearly loses ground on verification. Precise intuition is a less common, near-best move that improves on Maia’s first choice. Beyond intuition remains Stockfish’s first choice on verification, has an estimated Maia choice rate of at most 15%, and improves on Maia’s first choice by at least 0.70 pawns or 8 expected-score points on a 100-point scale. Follow-ups in a combination do not count again. Pausing the scan preserves existing scores and position analysis.',
  reviewMethodEngines: 'Reading engine candidates and key moments',
  reviewMethodEnginesBody: 'Stockfish scores use White’s perspective. Positive favors White and negative favors Black. Δ gives the score change for the player to move compared with the engine’s first choice. Maia percentages estimate move choices at the selected Elo. Key moments prioritize losses in expected score and confirmed intuition discoveries. Up to three major turning points are marked in game order. Select one to return to the decision point. Its card shows the engine’s first choice when it differs from the played move.',
  reviewMethodTrend: 'Reading Maia Elo trends',
  reviewMethodTrendBody: 'Open Maia Elo trends from a position to compare the same candidates at 600, 1000, 1400, 1800, 2200 and 2600 Elo. The dashed line marks the selected rating and the curves connect measured samples. Switch to Sampled values for exact percentages. Closing the dialog or changing moves stops pending work. Reopen the same position to reuse finished samples.',
  privacyPolicy: 'Privacy policy',
  tocTitle: 'On this page', legendConsensusTitle: 'Green ★ M · Consensus', legendConsensusDesc: 'Engine best and Maia intuition agree on the same move.', legendDivergeBadge: 'Δ -1.45 pawns', legendDivergeTitle: 'Blue ★ vs Gold M · Divergence', legendDivergeDesc: 'Natural human move loses 1.45 pawns — worth reviewing.', legendHeatTitle: 'Destination heatmap', legendHeatDesc: 'Warmer squares show higher Maia destination likelihood.',
  studyControls: 'Free exploration & shared preferences', studyControlsBody: 'Arrow keys navigate across the page; inputs, settings and promotion dialogs keep their own keyboard controls. Click or drag pieces to create a personal variation, then reopen it from My variations. Right-drag draws a thought arrow. Hold Shift while right-dragging a piece to play the move, keep its route arrow, and mark the destination piece with !!. Right-click marks a square. Marks stay with their position, and the clear button clears only the current position.', independentLoading: 'SF and Maia download and present results independently. Explore with whichever engine becomes ready first. Variations take priority; returning to the game and pausing navigation resumes an unfinished full-game review.', sharedPreferences: 'With the updated extension installed in the same Chrome browser, its popup, floating panel and web studio share the web Stockfish edition, Maia, language, rating and other preferences. Open pages update together. Without the extension, preferences stay in this browser; there is no automatic cross-device sync. The Web review engine setting does not switch the floating panel, which always runs SF19 Lite. With the updated extension enabled on the supported sites, Maia models share extension storage. Website-only analysis retains its own browser cache.', navStart: 'Get started', navDual: 'Visual legend', navAbout: 'About & licenses',
  title: 'Where do engine and intuition diverge?',
  intro: 'Compare Stockfish recommendations with Maia human move predictions. Scan a webpage chess diagram or review a finished game, then explore where the two perspectives differ.',
  openStudio: 'Open analysis studio ↗', source: 'Project source ↗', quickStart: 'First time? Start in three steps',
  step1: 'Find a chess diagram or a completed game',
  step1Body: 'For an image, show the complete static diagram and click Scan page. On Chess.com or Lichess, open an analysis board or a finished game. Pin the extension icon for easy access.',
  step2: 'Start with the lightweight model and wait for the first download',
  step2Body: 'The default is SF19 Lite + Maia 5M. Choose an intuition rating and inspect the current position. Maia weights download on first use, then reuse your browser cache. Analysis stays idle without a position or during a live game.',
  step3: 'Explore engine and intuition, from a position or a game',
  step3Body: 'After confirming a scanned position, the popup shows SF19 Lite lines. Explore engine vs intuition opens that position in the studio with Maia candidates. Platform boards use the floating panel; completed games can be reviewed with accuracy, an evaluation chart, notation and key moves. PGN and FEN imports are also available.',
  fairTitle: 'Live games automatically lock analysis',
  fairBody: 'Engine computation, candidate moves, arrows and heatmaps are disabled during a live game. Clear evidence of completion unlocks analysis; starting a new game locks it again. Model changes made while locked are saved and load only when analysis is permitted.',
  dualTitle: 'One position. Two different questions.', sfQuestion: 'How good is this move?',
  sfBody: 'Stockfish evaluates positions, searches variations and estimates a candidate’s loss relative to its preferred move. Scores use White’s perspective: positive favors White, negative favors Black.',
  maiaQuestion: 'How likely is a player at this rating to choose it?',
  maiaBody: 'Maia predicts a distribution of human moves at the selected rating. Candidate percentages are predicted move probabilities, not winning chances. A common move can still be a bad move.',
  gold: 'Gold solid: Maia candidates', green: 'Blue solid ★: Stockfish best move', cyan: 'Green ★ M: both favor the same move',
  heatBody: 'Warm squares aggregate Maia probabilities for every legal move’s destination, normalized by the strongest destination. Darker means relatively more common. This is not an attention matrix, danger map or win probability. Settings let you toggle each engine’s arrows and the heatmap separately.',
  modelsTitle: 'Models, downloads and local caching', model: 'Model', download: 'First download, approx.', where: 'Available in',
  extensionAndWeb: 'Extension & web studio', webOnly: 'Web review only; floating panel stays on Lite',
  modelBody: 'Try 5M first. 23M and 79M require larger downloads and slower computation, so desktop use is recommended. Switching versions starts a new analysis. Caches are separate; clearing browser or site data can require another download.',
  privacy: 'Engine inference happens in your browser. Weights download from weights.4chess.cc; importing a platform URL requests the game from that platform. A custom CDN URL must match the selected Maia version.',
  fp16: '79M is stored as FP16 and converted to Float32 for computation. Smaller downloads introduce numeric rounding; the weights are not bit-for-bit identical to the original FP32 checkpoint.',
  panelTitle: 'Using the floating panel',
  panelBody: 'The panel aligns with a detected sidebar ad slot. Otherwise it uses a 300 × 600 footprint, bounded by the available screen space. Drag the title bar to move it. Collapse keeps the sidebar cover; Expand Analysis restores the content. To hide it completely, switch off Floating Panel in the toolbar popup.',
  settingsBody: 'Top-right Settings contains language, intuition rating, all three Maia versions and overlay switches. Its own scroll area keeps the bottom guide and credits links reachable.',
  troubleTitle: 'If something looks wrong', lockedQuestion: 'Still locked?',
  lockedAnswer: 'Confirm the game has finished. Analysis pages or pages with clear game-over evidence permit analysis; ambiguous game status stays locked.',
  loadingQuestion: 'Model not ready?', loadingAnswer: 'Check download progress, errors, network access and the model URL. Try 5M again if needed. Maia being ready does not imply Stockfish is ready.',
  updateQuestion: 'Still seeing the old extension UI after an update?', updateAnswer: 'Reload the unpacked extension at chrome://extensions, then refresh the source webpage. The website and local extension are separate deployments: updating the website does not update an installed local extension.',
  maiaLicense: 'Code: AGPL-3.0. For weight terms, see each model card and upstream repository.', aboutTitle: 'About, credits & open-source licenses', projectCredit: 'Diverge · keluoke. Project source and maintenance history: keluoke/4chess.',
  independent: 'An independent project, with no official affiliation to Chess.com, Lichess, Maia or Stockfish. Each component retains its authorship and license.',
  licenseIntro: 'Expand the project license, third-party notices and full license texts below. They are also included in the extension package. Modification and redistribution must follow each component’s license, including applicable source-distribution obligations.'
};
const nodes = [...document.querySelectorAll('[data-copy]')];
const chinese = Object.fromEntries(nodes.map(node => [node.dataset.copy, node.textContent]));
let lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('diverge_guide_lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
function translate() {
  lang = lang === 'en' ? 'en' : 'zh';
  nodes.forEach(node => { node.textContent = (lang === 'en' ? english : chinese)[node.dataset.copy] || chinese[node.dataset.copy]; });
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = lang === 'en' ? 'Diverge · Chess Scanner & Analysis Guide' : '歧路 Diverge · 棋图扫描、分析指南与关于';
  document.querySelector('meta[name=description]').content = lang === 'en' ? 'Learn to scan webpage chess diagrams and compare Stockfish engine analysis with Maia human intuition. Position study, game review, settings and credits.' : '学习扫描网页棋图，对比 Stockfish 引擎分析与 Maia 人类直觉；了解局面探索、完赛复盘、设置、署名与许可。';
  document.getElementById('language-toggle').textContent = lang === 'en' ? '中文' : 'English';
  document.querySelector('.guide-toc')?.setAttribute('aria-label', lang === 'en' ? 'Table of contents' : '目录');
  const brand = document.querySelector('header .brand');
  if (brand && /^https?:$/.test(location.protocol)) brand.href = lang === 'en' ? '../en/' : '../zh/';
  document.querySelectorAll('a[href^="../analysis/"]').forEach(link => { link.href = '../analysis/?lang=' + lang; });
  localStorage.setItem('diverge_guide_lang', lang);
}
document.getElementById('language-toggle').addEventListener('click', () => { lang = lang === 'en' ? 'zh' : 'en'; translate(); });
translate();
for (const [label, file] of [['LICENSE', '../LICENSE'], ['THIRD-PARTY NOTICES', '../THIRD_PARTY_NOTICES.md'], ['AGPL-3.0', '../LICENSES/AGPL-3.0.txt'], ['GPL-3.0', '../LICENSES/GPL-3.0.txt'], ['GPL-2.0', '../LICENSES/GPL-2.0.txt'], ['chessimg2pos · MIT', '../LICENSES/chessimg2pos-MIT.txt'], ['chess.js · BSD-2-Clause', '../LICENSES/chess-js-BSD-2-Clause.txt']]) {
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = label;
  const pre = document.createElement('pre'); pre.textContent = '…';
  const link = document.createElement('a'); link.href = file; link.textContent = file.split('/').pop();
  details.append(summary, link, pre); document.getElementById('license-documents').append(details);
  details.addEventListener('toggle', async () => {
    if (!details.open || details.dataset.loaded) return;
    try {
      const response = await fetch(file + '?v=20261025-v115');
      if (!response.ok) throw new Error(String(response.status));
      pre.textContent = await response.text(); details.dataset.loaded = 'true';
    } catch { pre.textContent = lang === 'en' ? 'Unable to load this document. Use the source link above.' : '文档暂时无法加载，请使用上方的原文链接。'; }
  });
}

const tocLinks = [...document.querySelectorAll('.guide-toc a[href^="#"]')];
const tocTargets = tocLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
if (tocLinks.length && tocTargets.length && 'IntersectionObserver' in window) {
  const visible = new Set();
  const setActive = id => tocLinks.forEach(link => {
    if (link.hash === '#' + id) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  const io = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) visible.add(target);
      else visible.delete(target);
    }
    const active = tocTargets.find(target => visible.has(target));
    if (active) setActive(active.id);
  }, { rootMargin: '-72px 0px 0px 0px' });
  tocTargets.forEach(el => io.observe(el));
}
