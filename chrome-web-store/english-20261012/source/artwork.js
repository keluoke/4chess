import { IntuitionPanel } from '../../../content/intuition-panel.js';
import { BoardUI } from '../../../analysis/board-ui.js';
const art=document.getElementById('art');
const kind=new URLSearchParams(location.search).get('kind')||'compare';
const logo='../../../icons/icon-diverge.svg';
const brand=`<div class="brand"><img src="${logo}" alt="Diverge">Diverge</div>`;
const header=label=>`<header class="masthead">${brand}<span class="pill">${label}</span></header>`;
const footer=label=>`<footer class="footer"><span>${label}</span><span>WEB DIAGRAMS · GAME REVIEW</span></footer>`;
if(kind==='small'){
 art.className='promo promo-small';art.innerHTML=`<div class="board-pattern"></div><div class="small-center"><img src="${logo}" alt=""><h1>Diverge</h1><p>Chess analysis, with perspective.</p><span class="small-engine">MAIA 3 + STOCKFISH 19</span></div>`;
}else if(kind==='marquee'){
 art.className='promo marquee';art.innerHTML=`<div class="board-pattern"></div><div class="promo-copy">${brand}<h1>Human instinct.<br><em>Engine insight.</em></h1><p>See where the paths diverge.<br>Study positions and games with Maia &amp; Stockfish.</p><div class="engine-tags"><span>WEB DIAGRAMS &amp; GAME REVIEW</span><span>FAIR PLAY FIRST</span></div></div><svg class="fork-art" viewBox="0 0 470 450" fill="none"><circle cx="238" cy="288" r="152" stroke="#b9c9ae" stroke-opacity=".13"/><circle cx="238" cy="288" r="114" stroke="#b9c9ae" stroke-opacity=".12"/><path d="M238 407V295" stroke="#f0eee0" stroke-width="20" stroke-linecap="round"/><path d="M238 295C238 216 165 211 97 121" stroke="#d4b47d" stroke-width="20" stroke-linecap="round"/><path d="M238 295C238 216 316 205 383 121" stroke="#93bb9d" stroke-width="20" stroke-linecap="round"/><path d="M94 168V116H146" stroke="#d4b47d" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><path d="M333 116H385V168" stroke="#93bb9d" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><circle cx="238" cy="295" r="22" fill="#f0eee0"/><text x="43" y="65" class="branch-label" fill="#d4b47d">HUMAN INTUITION</text><text x="294" y="65" class="branch-label" fill="#acd2af">ENGINE SEARCH</text></svg>`;
}else if(kind==='studio'){
 art.className='studio';art.innerHTML=header('02 / WHOLE-GAME REVIEW')+`<div class="study-header"><h1 class="editorial">Find the turning points.</h1><p class="copy">Explore the evaluation trend, candidate moves<br>and key moments in one review workspace.</p></div><div class="studio-frame"><img src="studio.png" alt="Actual Diverge Review Studio with completed Opera Game analysis"></div>`;
}else if(kind==='compare'){
 art.innerHTML=header('01 / TWO PERSPECTIVES')+`<section class="intro"><div class="eyebrow">CHESS POSITION STUDY</div><h1 class="editorial">See both<br>sides of<br>a move.</h1><p class="copy">Compare Maia's human move predictions with Stockfish's engine choices.</p><div class="legend"><div class="legend-row"><i></i><div><strong>Maia 3</strong><small>Human intuition · Move probability</small></div></div><div class="legend-row engine"><i></i><div><strong>Stockfish 19</strong><small>Engine search · Position evaluation</small></div></div></div></section><section class="board-area"><div class="board-head"><span>MORPHY · THE OPERA GAME</span><span class="result">FINISHED · 1–0</span></div><div id="board"></div><div class="board-caption"><span>Position before 10. Nxb5</span><span>White to move</span></div></section><div class="panel-mount" id="mount"></div>`+footer('Local analysis · Two engines · One clearer perspective');
 const data=await fetch('engine-evidence.json').then(r=>r.json());
 const board=new BoardUI(document.getElementById('board'));board.setPosition(data.fen);
 board.setArrows([{from:data.prediction.moves[0].fromSq,to:data.prediction.moves[0].toSq,color:'gold'},{from:data.prediction.stockfish.bestMove.fromSq,to:data.prediction.stockfish.bestMove.toSq,color:'green',dashed:true}]);
 const panel=new IntuitionPanel({});panel.setLanguage('en');panel.setElo(1900,false);panel.isClosed=false;panel.renderSkeleton();panel.container.style.display='block';panel.fab.style.display='none';document.getElementById('mount').append(panel.container);panel.update(data.prediction,data.prediction.latencyMs);
 document.getElementById('mount').insertAdjacentHTML('beforeend','<div class="ui-label">DIVERGE · ON-BOARD ANALYSIS PANEL</div>');
 window.__panel=panel;
}else if(kind==='locked'){
 art.className='locked';art.innerHTML=header('03 / FAIR PLAY FIRST')+`<section class="locked-intro"><div class="eyebrow">BUILT FOR STUDY</div><h1 class="editorial">Play fair.<br><em>Study deeper.</em></h1><p class="copy">Analysis pauses during live games.<br>Return to your decisions after the result.</p><div class="fair-items"><span>No move suggestions</span><span>No analysis overlays</span></div></section><div class="panel-mount" id="mount"></div><div class="life-strip"><span>Ready to study</span><span class="arrow">→</span><span class="active">Live game · Locked</span><span class="arrow">→</span><span>Post-game review</span></div>`+footer('Analysis boards · Puzzles · Completed games');
 const panel=new IntuitionPanel({});panel.setLanguage('en');panel.isClosed=false;panel.renderSkeleton();panel.container.style.display='block';panel.fab.style.display='none';document.getElementById('mount').append(panel.container);panel.updateEngineStatus({maia:{state:'uninitialized'},stockfish:{state:'uninitialized'}});panel.setFairPlayLocked(true);
 document.getElementById('mount').insertAdjacentHTML('beforeend','<div class="ui-label">DIVERGE · FAIR PLAY GUARD</div>');window.__panel=panel;
}
await document.fonts.ready;
window.__artReady=true;
