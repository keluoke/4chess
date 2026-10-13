const english = {
  studyControls: 'Free exploration & shared preferences', studyControlsBody: 'Arrow keys navigate across the page; inputs, settings and promotion dialogs keep their own keyboard controls. Click or drag pieces to create a personal variation, then reopen it from My variations. Right-drag draws a thought arrow and right-click marks a square. Marks stay with their position; the clear button clears only the current position.', independentLoading: 'SF and Maia download and present results independently. Explore with whichever engine becomes ready first. Variations take priority; returning to the game and pausing navigation resumes an unfinished full-game review.', sharedPreferences: 'With the updated extension installed in the same Chrome browser, its popup, floating panel and web studio share engine versions, Maia, language, rating and other preferences. Open pages update together. Without the extension, preferences stay in this browser; there is no automatic cross-device sync. Model caches still belong to each site, so a first visit to another site may download the weights again.', navStart: 'Get started', navDual: 'Visual legend', navAbout: 'About & licenses',
  title: 'Two engines. A clearer view of every move.',
  intro: 'Stockfish evaluates move quality. Maia predicts how players at a chosen rating are likely to move. Diverge puts both perspectives together.',
  openStudio: 'Open full-game analysis ↗', source: 'Project source ↗', quickStart: 'First time? Start in three steps',
  step1: 'Open an analysis board or a completed game',
  step1Body: 'Open analysis on Chess.com or Lichess, then click Diverge in your browser toolbar. Pin the extension icon so it is easy to find.',
  step2: 'Start with the lightweight model and wait for the first download',
  step2Body: 'The default is SF19 Lite + Maia 5M. Choose an intuition rating and inspect the current position. Maia weights download on first use, then reuse your browser cache. Analysis stays idle without a position or during a live game.',
  step3: 'Compare the position or open a full-game review',
  step3Body: 'The floating panel compares human candidates with the engine suggestion. Full Game Analysis imports the completed game into the web studio, with accuracy, the evaluation chart, notation, brilliant moves and intuition traps. You can also import a PGN or set up a FEN.',
  fairTitle: 'Live games automatically lock analysis',
  fairBody: 'Engine computation, candidate moves, arrows and heatmaps are disabled during a live game. Clear evidence of completion unlocks analysis; starting a new game locks it again. Model changes made while locked are saved and load only when analysis is permitted.',
  dualTitle: 'One position. Two different questions.', sfQuestion: 'How good is this move?',
  sfBody: 'Stockfish evaluates positions, searches variations and estimates a candidate’s loss relative to its preferred move. Scores use White’s perspective: positive favors White, negative favors Black.',
  maiaQuestion: 'How likely is a player at this rating to choose it?',
  maiaBody: 'Maia predicts a distribution of human moves at the selected rating. Candidate percentages are predicted move probabilities, not winning chances. A common move can still be a bad move.',
  gold: 'Gold solid: Maia candidates', green: 'Green dashed: Stockfish best move', cyan: 'Cyan merged: both favor the same move',
  heatBody: 'Warm squares aggregate Maia probabilities for every legal move’s destination, normalized by the strongest destination. Darker means relatively more common. This is not an attention matrix, danger map or win probability. Settings let you toggle each engine’s arrows and the heatmap separately.',
  modelsTitle: 'Models, downloads and local caching', model: 'Model', download: 'First download, approx.', where: 'Available in',
  extensionAndWeb: 'Extension & web studio', webOnly: 'Web studio; extension uses Lite',
  modelBody: 'Try 5M first. 23M and 79M require larger downloads and slower computation, so desktop use is recommended. Switching versions starts a new analysis. Caches are separate; clearing browser or site data can require another download.',
  privacy: 'Engine inference happens in your browser. Weights download from weights.4chess.cc; importing a platform URL requests the game from that platform. A custom CDN URL must match the selected Maia version.',
  fp16: '79M is stored as FP16 and converted to Float32 for computation. Smaller downloads introduce numeric rounding; the weights are not bit-for-bit identical to the original FP32 checkpoint.',
  panelTitle: 'Using the floating panel',
  panelBody: 'The panel aligns with a detected sidebar ad slot. Otherwise it uses a 300 × 600 footprint, bounded by the available screen space. Drag the title bar to move it. Collapse keeps the sidebar cover; Expand Analysis restores the content. To hide it completely, switch off Floating Panel in the toolbar popup.',
  settingsBody: 'Top-right Settings contains language, intuition rating, all three Maia versions and overlay switches. Its own scroll area keeps the bottom guide and credits links reachable.',
  troubleTitle: 'If something looks wrong', lockedQuestion: 'Still locked?',
  lockedAnswer: 'Confirm the game has finished. Analysis pages or pages with clear game-over evidence permit analysis; ambiguous game status stays locked.',
  loadingQuestion: 'Model not ready?', loadingAnswer: 'Check download progress, errors, network access and the model URL. Try 5M again if needed. Maia being ready does not imply Stockfish is ready.',
  updateQuestion: 'Still seeing the old extension UI after an update?', updateAnswer: 'Reload the unpacked extension at chrome://extensions, then refresh the Chess.com or Lichess tab. The website and local extension are separate deployments: updating the website does not update an installed local extension.',
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
  document.title = lang === 'en' ? 'Diverge · Guide, credits & licenses' : '歧路 Diverge · 使用指南与关于';
  document.getElementById('language-toggle').textContent = lang === 'en' ? '中文' : 'English';
  document.querySelectorAll('a[href^="../analysis/"]').forEach(link => { link.href = '../analysis/?lang=' + lang; });
  localStorage.setItem('diverge_guide_lang', lang);
}
document.getElementById('language-toggle').addEventListener('click', () => { lang = lang === 'en' ? 'zh' : 'en'; translate(); });
translate();
for (const [label, file] of [['LICENSE', '../LICENSE'], ['THIRD-PARTY NOTICES', '../THIRD_PARTY_NOTICES.md'], ['AGPL-3.0', '../LICENSES/AGPL-3.0.txt'], ['GPL-3.0', '../LICENSES/GPL-3.0.txt'], ['GPL-2.0', '../LICENSES/GPL-2.0.txt']]) {
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = label;
  const pre = document.createElement('pre'); pre.textContent = '…';
  const link = document.createElement('a'); link.href = file; link.textContent = file.split('/').pop();
  details.append(summary, link, pre); document.getElementById('license-documents').append(details);
  details.addEventListener('toggle', async () => {
    if (!details.open || details.dataset.loaded) return;
    try {
      const response = await fetch(file + '?v=20261013-study1');
      if (!response.ok) throw new Error(String(response.status));
      pre.textContent = await response.text(); details.dataset.loaded = 'true';
    } catch { pre.textContent = lang === 'en' ? 'Unable to load this document. Use the source link above.' : '文档暂时无法加载，请使用上方的原文链接。'; }
  });
}
