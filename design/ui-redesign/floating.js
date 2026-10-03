import { IntuitionPanel } from '../../content/intuition-panel.js';
import { ChessBoard } from '../../engine/chess-core.js';
import { CHESS_PIECES_SVG } from '../../analysis/chess-pieces.js';
const board = new ChessBoard();
const moves = 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Nge2 Nbd7 Bh6 Bxh6 Qxh6 Bb7 a3 e5 O-O-O Qe7 Kb1 a6 Nc1 O-O-O Nb3 exd4 Rxd4 c5 Rd1 Nb6 g3 Kb8 Na5 Ba8 Bh3 d5 Qf4+ Ka7 Rhe1 d4 Nd5 Nbxd5 exd5 Qd6'.split(' ');
for(const san of moves){const move=board.getLegalMoves().find(m=>m.san===san);if(!move)throw new Error(`Invalid sample move: ${san}`);board.makeMove(move);}
const grid = document.getElementById('preview-board');
for(let rank=7;rank>=0;rank--)for(let file=0;file<8;file++){
  const square=document.createElement('div');square.className=`square ${(rank+file)%2===0?'dark-square':''}`;
  const piece=board.board[rank*8+file];if(piece)square.innerHTML=CHESS_PIECES_SVG[piece.color==='w'?piece.type.toUpperCase():piece.type];
  if(rank===0){const label=document.createElement('span');label.className='coordinate';label.textContent=String.fromCharCode(97+file);square.append(label);}
  if(file===0){const label=document.createElement('span');label.className='coordinate rank-coordinate';label.textContent=rank+1;square.append(label);}grid.append(square);
}
const panel = new IntuitionPanel({onOpenStandaloneAnalysis:()=>window.open('../../analysis/index.html','_blank','noopener'),onModelLoaded:()=>setState('review'),onEloChange:()=>{},onToggleChange:()=>{},onCdnSave:()=>{}});
panel.lang='zh';panel.isClosed=false;panel.renderSkeleton();panel.container.style.display='block';panel.fab.style.display='none';
const demo = {isAvailable:true,turn:'w',fen:board.getFen(),moves:[{san:'Rxd4',uci:'d1d4',prob:38.2,deltaText:'0.00'},{san:'Re7',uci:'e1e7',prob:23.1,deltaText:'-0.35'},{san:'Qc4',uci:'f4c4',prob:14.6,deltaText:'-0.62'}],stockfish:{bestMove:{san:'Rxd4',uci:'d1d4'},score:'+0.42'},comparison:{agreed:true,badge:'示例 · 人机共识',badgeEn:'Demo · Consensus',summary:'人类直觉与引擎都选择 <strong>Rxd4</strong>。此处仅为布局示例，不代表真实计算结论。',summaryEn:'Demo content only. No engine computation.'},status:{maia:{state:'ready',source:'UI 示例'},stockfish:{state:'ready'}}};
function setState(state){
 panel.setFairPlayLocked(false);panel.currentData=null;panel.renderSkeleton();panel.updateEngineStatus({maia:{state:'uninitialized'},stockfish:{state:'uninitialized'}});
 const stage=document.getElementById('host-stage');stage.textContent=state==='locked'?'模拟进行中（不连接平台）':state==='idle'?'赛前待命':'已完赛复盘';
 if(state==='review')panel.update(demo,32);
 if(state==='idle'){panel.container.querySelector('#maia-moves-container').textContent='等待分析局面或已完赛对局';panel.container.querySelector('#maia-inference-time').textContent='未启动';}
 if(state==='locked')panel.setFairPlayLocked(true);
 if(state==='download')panel.update({isAvailable:false,turn:'w',status:{maia:{state:'downloading',percent:63,speed:4.2,loadedMB:17.6,totalMB:28},stockfish:{state:'uninitialized'}}});
 if(state==='error')panel.update({isAvailable:false,turn:'w',status:{maia:{state:'error'},stockfish:{state:'uninitialized'}}});
}
document.getElementById('preview-state').onchange=e=>setState(e.target.value);
setState('review');
window.__divergePreviewPanel=panel;
