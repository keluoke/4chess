/**
 * Unified Vision Recognition Result Protocol
 * Structures all computer vision, orientation, turn and FEN outputs.
 * Distinguishes visual facts from assumed chess game state defaults.
 */

const FEN_CHARS = '1RNBQKPrnbqkp';

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
 * Builds the comprehensive structured result object.
 * Retains backward-compatible properties on the root level for legacy callers.
 */
function buildRecognitionResult({
  layout = {},
  squares = [],
  grid = [],
  rawGrid = [],
  orientation = {},
  activeTurn = {},
  gameState = {},
  fen = {},
  validation = {},
  metadata = {}
}) {
  const primaryFen = (fen && fen.analysisFen) || (typeof fen === 'string' ? fen : '');
  const boardFen = (fen && fen.boardPart) || '';
  const turn = (activeTurn && activeTurn.turn) || 'w';

  // Compute confidence summary
  let nonZeroPieceConfidenceSum = 0;
  let nonZeroPieceCount = 0;
  let sumLog = 0;

  for (let i = 0; i < squares.length; i++) {
    const sq = squares[i];
    const topProb = sq.prob || 0.1;
    sumLog += Math.log(Math.max(1e-5, topProb));
    if (sq.piece && sq.piece !== '1') {
      nonZeroPieceConfidenceSum += topProb;
      nonZeroPieceCount++;
    }
  }

  const avgConfidence = squares.length === 64
    ? Math.min(1.0, Math.max(0.0, Math.exp(sumLog / 64)))
    : 0;
  const pieceConfidence = nonZeroPieceCount > 0
    ? (nonZeroPieceConfidenceSum / nonZeroPieceCount)
    : 0;

  // Extract suspicious squares for legacy UI
  const suspiciousSquares = squares
    .filter(s => s.isSuspicious)
    .map(s => ({
      square: s.square,
      rawSquare: s.rawSquare || s.square,
      index: s.index,
      boardIndex: s.index,
      rawIndex: s.rawIndex,
      predicted: s.piece,
      prob: s.prob,
      second: s.candidates && s.candidates[1] ? s.candidates[1].piece : '1',
      secondProb: s.candidates && s.candidates[1] ? s.candidates[1].prob : 0,
      candidates: s.candidates || [],
      reason: s.suspiciousReason || '置信度低'
    }));

  const candidateMatrix = squares.map(s => s.candidates || []);

  const result = {
    // 1. Structured Protocol
    layout: {
      hasBoard: layout.hasBoard !== false,
      box: layout.box || { x: 0, y: 0, width: 0, height: 0 },
      corners: layout.corners || null,
      gridAligned: Boolean(layout.gridAligned),
      qualityScore: Number((layout.qualityScore || 0).toFixed(2)),
      autoAccepted: Boolean(layout.autoAccepted),
      requiresReview: Boolean(layout.requiresReview)
    },
    squares,
    grid,
    rawGrid: rawGrid.length > 0 ? rawGrid : grid.slice(),
    confidenceSummary: {
      modelScore: Number(avgConfidence.toFixed(4)),
      weakestSquareScore: squares.length ? Math.min(...squares.map(s => s.prob || 0)) : 0,
      isWholeBoardProbability: false,
      localizationReliable: !layout.requiresReview && Boolean(layout.gridAligned),
      needsReview: Boolean(layout.requiresReview || !validation.isValid || suspiciousSquares.length)
    },
    orientation: {
      perspective: orientation.perspective || 'w',
      confidence: Number((orientation.confidence || 0.5).toFixed(4)),
      isConfirmed: Boolean(orientation.isConfirmed),
      evidence: orientation.evidence || [],
      requiresConfirmation: Boolean(orientation.requiresConfirmation)
    },
    activeTurn: {
      turn: activeTurn.turn || 'w',
      confidence: Number((activeTurn.confidence || 0.5).toFixed(4)),
      isConfirmed: Boolean(activeTurn.isConfirmed),
      evidence: activeTurn.evidence || [],
      requiresConfirmation: Boolean(activeTurn.requiresConfirmation)
    },
    gameState: {
      castling: {
        K: null,
        Q: null,
        k: null,
        q: null,
        isAssumed: true,
        defaultNotice: '无法从单张图片恢复王车易位权，采用不可易位默认值'
      },
      enPassant: {
        targetSquare: null,
        isAssumed: true,
        defaultNotice: '无法从单张图片恢复吃过路兵权，采用无目标格默认值'
      },
      halfmoveClock: {
        value: 0,
        isAssumed: true,
        defaultNotice: '50步计数不可知，采用0默认值'
      },
      fullmoveNumber: {
        value: 1,
        isAssumed: true,
        defaultNotice: '回合数不可知，采用1默认值'
      }
    },
    fen: {
      boardPart: boardFen,
      analysisFen: primaryFen,
      isAssumedFullFen: true
    },
    validation: {
      isValid: Boolean(validation.isValid),
      issues: validation.issues || [],
      conflictSquares: validation.conflictSquares || [],
      needsReview: Boolean(validation.needsReview || !validation.isValid || suspiciousSquares.length > 0)
    },
    metadata: {
      name: metadata.name || 'chessimg2pos',
      architecture: metadata.architecture || 'fast_cnn_32x32',
      manifestSha256: metadata.manifestSha256 || '',
      modelVersion: metadata.modelVersion || '1.0.0',
      backend: metadata.backend || 'unknown',
      ...metadata,
      actualWeightsSha256: (typeof metadata.actualWeightsSha256 === 'string') ? metadata.actualWeightsSha256 : '',
      isVerifiedManifest: metadata.isVerifiedManifest === true,
      timings: metadata.timings || {
        localizationMs: 0,
        samplingMs: 0,
        inferenceMs: 0,
        solvingMs: 0,
        totalMs: 0
      }
    },

    // 2. Backward-compatible properties (for WeChat Controller and existing tests)
    hasBoard: layout.hasBoard !== false,
    analysisFen: primaryFen,
    boardFen,
    turn,
    confidence: Number(avgConfidence.toFixed(4)),
    pieceConfidence: Number(pieceConfidence.toFixed(4)),
    pieceCount: nonZeroPieceCount,
    candidates: candidateMatrix,
    suspiciousSquares,
    isValid: Boolean(validation.isValid),
    validationError: validation.issues && validation.issues[0] ? validation.issues[0] : (validation.error || ''),
    validationIssues: validation.issues || [],
    error: validation.issues && validation.issues[0] ? validation.issues[0] : '',
    issues: validation.issues || [],
    box: layout.box,
    autoAccepted: Boolean(layout.autoAccepted),
    timings: metadata.timings || {}
  };

  return result;
}

export { 
  buildRecognitionResult,
  calculateEntropy,
  FEN_CHARS
 };
