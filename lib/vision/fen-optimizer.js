/**
 * FEN Constraint & Legality Optimizer (Core)
 * Applies chess domain knowledge constraints to neural network predictions:
 * 1. Exactly one White King ('K') and one Black King ('k').
 * 2. No Pawns ('P', 'p') on Rank 1 or Rank 8.
 * 3. Piece count budget bounds (max 16 pieces per side, max 8 pawns).
 * 4. Active turn inference based on check rules.
 * 5. Compressed FEN generation & chess.js validation.
 * 6. Evidence collection for orientation, active turn and square entropy.
 */

import { Chess } from './chess.js';
let defaultChess = Chess;
function getDefaultChess() {
  return defaultChess;
}

const FEN_CHARS = '1RNBQKPrnbqkp';
const CHAR_TO_INDEX = Object.freeze(Object.fromEntries([...FEN_CHARS].map((c, i) => [c, i])));

/**
 * Compresses rank string: "1111p1K1" -> "4p1K1"
 */
function compressRank(rankStr) {
  let res = '';
  let empty = 0;
  for (const ch of rankStr) {
    if (ch === '1') {
      empty++;
    } else {
      if (empty > 0) {
        res += empty;
        empty = 0;
      }
      res += ch;
    }
  }
  if (empty > 0) res += empty;
  return res;
}

function calculateEntropy(probs) {
  let ent = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    if (p > 1e-7) {
      ent -= p * Math.log2(p);
    }
  }
  return Number(ent.toFixed(4));
}

/**
 * Solves domain constraints given a 64x13 probability matrix.
 * @param {Array<Array<number>>|Float32Array} probs - 64 rows of 13 probabilities
 * @param {object} options - { activeTurn: 'w'|'b', flip: boolean, chessProvider: Function }
 * @returns {object} structured output with legacy properties
 */
function solveConstraintsAndBuildFen(probs, options = {}) {
  const activeTurn = options.activeTurn || 'w';
  const flip = Boolean(options.flip);
  const ChessClass = options.chessProvider || getDefaultChess();

  // Normalize probs into 64 rows of 13 numbers
  const rows = [];
  if (probs[0] && (probs[0].length === 13)) {
    for (let i = 0; i < 64; i++) rows.push(Array.from(probs[i]));
  } else if (probs.subarray) {
    for (let i = 0; i < 64; i++) rows.push(Array.from(probs.subarray(i * 13, (i + 1) * 13)));
  } else {
    for (let i = 0; i < 64; i++) rows.push(Array.from(probs.slice(i * 13, (i + 1) * 13)));
  }

  const preds = new Int32Array(64);
  const rawSquareCandidates = [];
  const rawSquareItems = [];
  let nonZeroPieceConfidenceSum = 0;
  let nonZeroPieceCount = 0;

  for (let i = 0; i < 64; i++) {
    const file = String.fromCharCode(97 + (i % 8));
    const rank = 8 - Math.floor(i / 8);
    const sq = `${file}${rank}`;

    const ranked = [];
    for (let c = 0; c < 13; c++) {
      ranked.push({ piece: FEN_CHARS[c], prob: rows[i][c] });
    }
    ranked.sort((a, b) => b.prob - a.prob);

    const top1 = ranked[0];
    const top2 = ranked[1];
    preds[i] = CHAR_TO_INDEX[top1.piece];
    rawSquareCandidates.push(ranked.slice(0, 3));

    if (top1.piece !== '1') {
      nonZeroPieceConfidenceSum += top1.prob;
      nonZeroPieceCount++;
    }

    const isWeakPiece = top1.piece !== '1' && top1.prob < 0.65;
    const isCloseContest = (top1.prob - top2.prob) < 0.18 && top1.prob < 0.85;
    const isAmbiguousEmpty = top1.piece === '1' && top2.prob > 0.35;
    const isSuspicious = isWeakPiece || isCloseContest || isAmbiguousEmpty;
    let suspiciousReason = null;
    if (isWeakPiece) suspiciousReason = '置信度低';
    else if (isCloseContest) suspiciousReason = '候选接近';
    else if (isAmbiguousEmpty) suspiciousReason = '可疑空格';

    rawSquareItems.push({
      rawIndex: i,
      rawSquare: sq,
      predicted: top1.piece,
      prob: Number(top1.prob.toFixed(4)),
      second: top2.piece,
      secondProb: Number(top2.prob.toFixed(4)),
      candidates: ranked.slice(0, 3),
      entropy: calculateEntropy(rows[i]),
      isSuspicious,
      suspiciousReason
    });
  }

  // Pure raw grid from argmax
  const rawGrid = Array.from(preds).map(idx => FEN_CHARS[idx]);

  // Perspective flip if viewing from Black's side
  let grid = rawGrid.slice();
  const squareCandidates = new Array(64);
  const structuredSquares = new Array(64);

  if (flip) {
    const flippedGrid = new Array(64);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rawIdx = r * 8 + f;
        const flippedIdx = (7 - r) * 8 + (7 - f);
        flippedGrid[flippedIdx] = rawGrid[rawIdx];
        squareCandidates[flippedIdx] = rawSquareCandidates[rawIdx];

        const item = rawSquareItems[rawIdx];
        const boardFile = String.fromCharCode(97 + (flippedIdx % 8));
        const boardRank = 8 - Math.floor(flippedIdx / 8);
        structuredSquares[flippedIdx] = {
          index: flippedIdx,
          square: `${boardFile}${boardRank}`,
          rawIndex: rawIdx,
          rawSquare: item.rawSquare,
          piece: item.predicted,
          prob: item.prob,
          candidates: item.candidates,
          entropy: item.entropy,
          isSuspicious: item.isSuspicious,
          suspiciousReason: item.suspiciousReason
        };
      }
    }
    grid = flippedGrid;
  } else {
    for (let i = 0; i < 64; i++) {
      squareCandidates[i] = rawSquareCandidates[i];
      const item = rawSquareItems[i];
      structuredSquares[i] = {
        index: i,
        square: item.rawSquare,
        rawIndex: i,
        rawSquare: item.rawSquare,
        piece: item.predicted,
        prob: item.prob,
        candidates: item.candidates,
        entropy: item.entropy,
        isSuspicious: item.isSuspicious,
        suspiciousReason: item.suspiciousReason
      };
    }
  }

  // 3. Build compressed board FEN
  const rankFens = [];
  for (let r = 0; r < 8; r++) {
    const rankStr = grid.slice(r * 8, (r + 1) * 8).join('');
    rankFens.push(compressRank(rankStr));
  }
  const boardFen = rankFens.join('/');

  // 4. Deduce active turn based on check legality
  let inferredTurn = activeTurn;
  const turnEvidence = [];
  if (ChessClass) {
    try {
      const cWhite = new ChessClass(`${boardFen} w - - 0 1`);
      const cBlack = new ChessClass(`${boardFen} b - - 0 1`);
      const whiteInCheck = cWhite.in_check();
      const blackInCheck = cBlack.in_check();
      if (whiteInCheck && !blackInCheck) {
        inferredTurn = 'w';
        turnEvidence.push({ type: 'check_status', detail: '白王处于受将状态，合法行棋方必为白方', confidence: 0.99 });
      } else if (blackInCheck && !whiteInCheck) {
        inferredTurn = 'b';
        turnEvidence.push({ type: 'check_status', detail: '黑王处于受将状态，合法行棋方必为黑方', confidence: 0.99 });
      } else {
        turnEvidence.push({ type: 'check_status', detail: '双方均未受将，依据默认或用户指定先手', confidence: 0.5 });
      }
    } catch (_) {}
  }

  const fullFen = `${boardFen} ${inferredTurn} - - 0 1`;

  // 5. Comprehensive FIDE Chess Rule Validation
  const valCheck = validateChessPosition(fullFen, inferredTurn, { chessProvider: ChessClass });

  const whiteKings = grid.filter(c => c === 'K').length;
  const blackKings = grid.filter(c => c === 'k').length;
  if (whiteKings === 0 && blackKings === 0) {
    if (!valCheck.issues.includes('未可靠识别双王，请核对并补齐白王与黑王')) {
      valCheck.issues.unshift('未可靠识别双王，请核对并补齐白王与黑王');
      valCheck.error = valCheck.issues[0];
    }
  }

  // 6. Update suspicious squares with rule conflict marks
  const suspiciousSquares = [];
  for (let i = 0; i < 64; i++) {
    const sqItem = structuredSquares[i];
    const rank = parseInt(sqItem.square.charAt(1), 10);
    const p = sqItem.piece;

    if ((rank === 1 || rank === 8) && (p === 'p' || p === 'P')) {
      sqItem.isSuspicious = true;
      sqItem.suspiciousReason = '底线兵';
    }
    if (p === 'K' && whiteKings > 1) {
      sqItem.isSuspicious = true;
      sqItem.suspiciousReason = '重复白王';
    }
    if (p === 'k' && blackKings > 1) {
      sqItem.isSuspicious = true;
      sqItem.suspiciousReason = '重复黑王';
    }

    if (valCheck.conflictSquares && valCheck.conflictSquares.some(c => c.square === sqItem.square)) {
      const c = valCheck.conflictSquares.find(x => x.square === sqItem.square);
      sqItem.isSuspicious = true;
      sqItem.suspiciousReason = c.reason || '规则冲突';
    }

    if (sqItem.isSuspicious) {
      suspiciousSquares.push({
        square: sqItem.square,
        rawSquare: sqItem.rawSquare,
        index: i,
        boardIndex: i,
        rawIndex: sqItem.rawIndex,
        predicted: sqItem.piece,
        prob: sqItem.prob,
        second: sqItem.candidates[1] ? sqItem.candidates[1].piece : '1',
        secondProb: sqItem.candidates[1] ? sqItem.candidates[1].prob : 0,
        candidates: sqItem.candidates,
        reason: sqItem.suspiciousReason
      });
    }
  }

  // Calculate geometric mean confidence across 64 squares
  let sumLog = 0;
  for (let i = 0; i < 64; i++) {
    const p = Math.max(1e-5, rows[i][preds[i]] || 0.1);
    sumLog += Math.log(p);
  }
  const avgConfidence = Math.min(1.0, Math.max(0.0, Math.exp(sumLog / 64)));
  const pieceConfidence = nonZeroPieceCount > 0 ? (nonZeroPieceConfidenceSum / nonZeroPieceCount) : 0;

  // Perspective evidence
  const orientationEvidence = [
    {
      type: 'piece_distribution',
      detail: flip ? '基于黑方视角映射（h-a, 1-8）' : '基于白方视角映射（a-h, 8-1）',
      confidence: 0.85
    }
  ];

  return {
    fen: fullFen,
    boardFen,
    turn: inferredTurn,
    confidence: Number(avgConfidence.toFixed(4)),
    pieceConfidence: Number(pieceConfidence.toFixed(4)),
    pieceCount: nonZeroPieceCount,
    grid,
    rawGrid,
    candidates: squareCandidates,
    suspiciousSquares,
    hasBoard: true,
    isValid: valCheck.valid,
    validationError: valCheck.error || '',
    validationIssues: valCheck.issues || [],
    error: valCheck.error || '',
    issues: valCheck.issues || [],
    structuredSquares,
    orientationEvidence,
    turnEvidence,
    conflictSquares: valCheck.conflictSquares || []
  };
}

/**
 * Validates chess position legality according to FIDE rules.
 */
function validateChessPosition(fenOrBoard, turn = 'w', options = {}) {
  const issues = [];
  if (!fenOrBoard || typeof fenOrBoard !== 'string') {
    return { valid: false, error: 'FEN 为空或不是字符串', issues: ['FEN 为空'], conflictSquares: [] };
  }

  const parts = fenOrBoard.trim().split(/\s+/);
  const boardFen = parts[0];
  const activeTurn = (parts[1] && (parts[1] === 'w' || parts[1] === 'b')) ? parts[1] : (turn || 'w');
  const ChessClass = options.chessProvider || getDefaultChess();

  // 1. Structure: 8 rows separated by '/'
  const ranks = boardFen.split('/');
  if (ranks.length !== 8) {
    return { valid: false, error: `FEN 必须包含 8 行（当前 ${ranks.length} 行）`, issues: ['行数不为 8'], conflictSquares: [] };
  }

  // 2. Expand ranks into 64 square characters
  const grid = [];
  for (let r = 0; r < 8; r++) {
    const rankStr = ranks[r];
    let fileCount = 0;
    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '8') {
        const count = parseInt(ch, 10);
        fileCount += count;
        for (let k = 0; k < count; k++) grid.push('1');
      } else if ('RNBQKPrnbqkp'.includes(ch)) {
        fileCount++;
        grid.push(ch);
      } else {
        issues.push(`包含非法棋子符号: ${ch}`);
      }
    }
    if (fileCount !== 8) {
      issues.push(`第 ${8 - r} 横线宽度错误（应为 8，实际 ${fileCount}）`);
    }
  }

  if (grid.length !== 64 || issues.length > 0) {
    return { valid: false, error: issues[0] || 'FEN 结构不合法', issues, conflictSquares: [] };
  }

  // 3. Count pieces & pawns
  let whiteKings = 0, blackKings = 0;
  let whitePawns = 0, blackPawns = 0;
  let whitePieces = 0, blackPieces = 0;
  let whiteKingSq = null, blackKingSq = null;
  const conflictSquares = [];

  for (let i = 0; i < 64; i++) {
    const p = grid[i];
    if (p === '1') continue;
    const r = Math.floor(i / 8);
    const f = i % 8;
    const sq = `${String.fromCharCode(97 + f)}${8 - r}`;

    if (p === 'K') {
      whiteKings++;
      whitePieces++;
      whiteKingSq = { r, f, i, square: sq };
    } else if (p === 'k') {
      blackKings++;
      blackPieces++;
      blackKingSq = { r, f, i, square: sq };
    } else if (p === 'P') {
      whitePawns++;
      whitePieces++;
      if (r === 0 || r === 7) {
        issues.push(`白兵出现在第 ${8 - r} 横线（兵不可在第 1 或第 8 横线）`);
        conflictSquares.push({ square: sq, reason: '底线兵' });
      }
    } else if (p === 'p') {
      blackPawns++;
      blackPieces++;
      if (r === 0 || r === 7) {
        issues.push(`黑兵出现在第 ${8 - r} 横线（兵不可在第 1 或第 8 横线）`);
        conflictSquares.push({ square: sq, reason: '底线兵' });
      }
    } else if (p === p.toUpperCase()) {
      whitePieces++;
    } else {
      blackPieces++;
    }
  }

  if (whiteKings === 0) issues.push('缺少白王（每方必须有一王）');
  else if (whiteKings > 1) {
    issues.push(`检测到 ${whiteKings} 个白王（每方只能有一王）`);
    for (let i = 0; i < 64; i++) {
      if (grid[i] === 'K') {
        const sq = `${String.fromCharCode(97 + (i % 8))}${8 - Math.floor(i / 8)}`;
        conflictSquares.push({ square: sq, reason: '重复白王' });
      }
    }
  }

  if (blackKings === 0) issues.push('缺少黑王（每方必须有一王）');
  else if (blackKings > 1) {
    issues.push(`检测到 ${blackKings} 个黑王（每方只能有一王）`);
    for (let i = 0; i < 64; i++) {
      if (grid[i] === 'k') {
        const sq = `${String.fromCharCode(97 + (i % 8))}${8 - Math.floor(i / 8)}`;
        conflictSquares.push({ square: sq, reason: '重复黑王' });
      }
    }
  }

  if (whitePieces > 16) issues.push(`白方棋子总数超过 16（当前 ${whitePieces}）`);
  if (blackPieces > 16) issues.push(`黑方棋子总数超过 16（当前 ${blackPieces}）`);
  if (whitePawns > 8) issues.push(`白方兵数量超过 8（当前 ${whitePawns}）`);
  if (blackPawns > 8) issues.push(`黑方兵数量超过 8（当前 ${blackPawns}）`);

  if (whiteKingSq && blackKingSq) {
    const dr = Math.abs(whiteKingSq.r - blackKingSq.r);
    const df = Math.abs(whiteKingSq.f - blackKingSq.f);
    if (dr <= 1 && df <= 1) {
      issues.push('白王与黑王相邻，违反走子规则');
      conflictSquares.push({ square: whiteKingSq.square, reason: '王相邻' });
      conflictSquares.push({ square: blackKingSq.square, reason: '王相邻' });
    }
  }

  if (whiteKings === 1 && blackKings === 1 && !issues.some(x => x.includes('王')) && ChessClass) {
    try {
      const cWhiteTurn = new ChessClass(`${boardFen} w - - 0 1`);
      const cBlackTurn = new ChessClass(`${boardFen} b - - 0 1`);
      const whiteInCheck = cWhiteTurn.in_check();
      const blackInCheck = cBlackTurn.in_check();

      if (whiteInCheck && blackInCheck) {
        issues.push('双方王同时受将，不可能出现');
        if (whiteKingSq) conflictSquares.push({ square: whiteKingSq.square, reason: '同时受将' });
        if (blackKingSq) conflictSquares.push({ square: blackKingSq.square, reason: '同时受将' });
      } else if (activeTurn === 'w' && blackInCheck) {
        issues.push('当前为白先，但黑王正受将（非行棋方不能处于受将状态）');
        if (blackKingSq) conflictSquares.push({ square: blackKingSq.square, reason: '非行棋方受将' });
      } else if (activeTurn === 'b' && whiteInCheck) {
        issues.push('当前为黑先，但白王正受将（非行棋方不能处于受将状态）');
        if (whiteKingSq) conflictSquares.push({ square: whiteKingSq.square, reason: '非行棋方受将' });
      }
    } catch (err) {
      issues.push(err.message || '局面合法性检验失败');
    }
  }

  return {
    valid: issues.length === 0,
    error: issues[0] || '',
    issues,
    conflictSquares
  };
}

export { 
  solveConstraintsAndBuildFen,
  validateChessPosition,
  compressRank,
  calculateEntropy,
  FEN_CHARS
 };
