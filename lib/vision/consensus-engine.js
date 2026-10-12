/**
 * Dual-Opinion Consensus Engine
 * Combines fast-path CNN predictions with whole-board / cloud recheck predictions.
 * Resolves ambiguities, computes agreement matrix, and pinpoints exact divergent squares.
 */

import { solveConstraintsAndBuildFen } from './fen-optimizer.js';
import { buildRecognitionResult } from './protocol.js';

/**
 * Merges primary (local fast CNN) and secondary (recheck / whole-board) recognition results.
 * @param {object} primary - VisionRecognitionResult from primary model
 * @param {object} secondary - VisionRecognitionResult from secondary model
 * @returns {object} Combined consensus result with divergence flags
 */
function mergeConsensus(primary, secondary) {
  if (!primary || typeof primary !== 'object' || Array.isArray(primary) ||
      !Array.isArray(primary.squares) || primary.squares.length !== 64) {
    throw new Error('primary must be a valid VisionRecognitionResult with 64 squares');
  }
  if (!secondary || typeof secondary !== 'object' || Array.isArray(secondary) ||
      !Array.isArray(secondary.squares) || secondary.squares.length !== 64) {
    throw new Error('secondary must be a valid VisionRecognitionResult with 64 squares');
  }

  const primarySquares = primary.squares;
  const secondarySquares = secondary.squares;

  const mergedSquares = [];
  const divergentSquares = [];
  let agreedSquareCount = 0;

  // Re-build 64 probability rows favoring the higher-confidence agreement
  const mergedProbs = [];

  const primaryActualSha = primary.metadata?.actualWeightsSha256 || null;
  const secondaryActualSha = secondary.metadata?.actualWeightsSha256 || null;
  const primaryDeclSha = primary.metadata?.manifestSha256 || primaryActualSha;
  const secondaryDeclSha = secondary.metadata?.manifestSha256 || secondaryActualSha;
  const hasSameActualWeights = Boolean(primaryActualSha && secondaryActualSha && primaryActualSha === secondaryActualSha);
  const hasSameDeclaredWeights = Boolean(primaryDeclSha && secondaryDeclSha && primaryDeclSha === secondaryDeclSha);
  const hasSameWeights = hasSameActualWeights || hasSameDeclaredWeights;

  const isVerifiedPrimary = primary.metadata?.isVerifiedManifest === true;
  const isVerifiedSecondary = secondary.metadata?.isVerifiedManifest === true;

  const isIndependentModel = !hasSameWeights && isVerifiedPrimary && isVerifiedSecondary && Boolean(
    (primaryActualSha && secondaryActualSha && primaryActualSha !== secondaryActualSha) ||
    (primary.metadata?.architecture && secondary.metadata?.architecture && primary.metadata.architecture !== secondary.metadata.architecture)
  );

  for (let i = 0; i < 64; i++) {
    const pSq = primarySquares[i] || { piece: '1', prob: 0.5, square: `sq${i}`, rawIndex: i, candidates: [] };
    const sSq = secondarySquares[i] || { piece: '1', prob: 0.5, square: `sq${i}`, rawIndex: i, candidates: [] };

    const pPiece = pSq.piece || (primary.grid ? primary.grid[i] : '1');
    const sPiece = sSq.piece || (secondary.grid ? secondary.grid[i] : '1');

    const pProb = (typeof pSq.prob === 'number' && Number.isFinite(pSq.prob)) ? Math.max(0, Math.min(1, pSq.prob)) : 0.5;
    const sProb = (typeof sSq.prob === 'number' && Number.isFinite(sSq.prob)) ? Math.max(0, Math.min(1, sSq.prob)) : 0.5;

    const agrees = (pPiece === sPiece);
    if (agrees) agreedSquareCount++;

    let chosenPiece = pPiece;
    let chosenProb = pProb;
    let isSuspicious = pSq.isSuspicious;
    let suspiciousReason = pSq.suspiciousReason;
    let candidates = pSq.candidates || sSq.candidates || [];

    if (agrees) {
      // Both models agree on the piece
      const wasSuspicious = Boolean(pSq.isSuspicious || sSq.isSuspicious);
      chosenPiece = pPiece;
      const boost = (isIndependentModel && !wasSuspicious) ? 0.05 : 0;
      chosenProb = Math.min(1.0, Math.max(pProb, sProb) + boost);
      isSuspicious = wasSuspicious || (chosenProb < 0.70);
      suspiciousReason = wasSuspicious ? (pSq.suspiciousReason || sSq.suspiciousReason || '低置信度') : (chosenProb < 0.70 ? '低置信度' : null);
      candidates = pSq.candidates || sSq.candidates || [];
    } else {
      // Divergence: flag square specifically for user attention
      divergentSquares.push({
        square: pSq.square,
        index: i,
        primary: { piece: pPiece, prob: pProb },
        secondary: { piece: sPiece, prob: sProb }
      });

      // Tie-break: prefer the model with higher confidence, but keep suspicious flag
      if (sProb > pProb + 0.15) {
        chosenPiece = sPiece;
        chosenProb = sProb;
        candidates = sSq.candidates || pSq.candidates || [];
      } else {
        chosenPiece = pPiece;
        chosenProb = pProb;
        candidates = pSq.candidates || sSq.candidates || [];
      }
      isSuspicious = true;
      suspiciousReason = `双模型分歧 (主模型: ${pPiece}, 复核模型: ${sPiece})`;
    }

    mergedSquares.push({
      index: i,
      square: pSq.square,
      rawIndex: pSq.rawIndex !== undefined ? pSq.rawIndex : i,
      piece: chosenPiece,
      prob: Number(chosenProb.toFixed(4)),
      agrees,
      candidates,
      isSuspicious,
      suspiciousReason
    });

    // Create a 13-element probability array for fen-optimizer constraint solver
    const row = new Float32Array(13).fill(0.001);
    const pieceIdx = '1RNBQKPrnbqkp'.indexOf(chosenPiece);
    if (pieceIdx >= 0) row[pieceIdx] = chosenProb;
    mergedProbs.push(row);
  }

  // Re-run domain constraint solving on the merged board without re-flipping (canonical order)
  const solved = solveConstraintsAndBuildFen(mergedProbs, {
    activeTurn: secondary.activeTurn?.turn || primary.activeTurn?.turn || 'w',
    flip: false
  });

  // Reconstruct physical rawGrid matching original tile layout
  const mergedRawGrid = new Array(64);
  for (let i = 0; i < 64; i++) {
    const rawIdx = (primarySquares[i] && primarySquares[i].rawIndex !== undefined)
      ? primarySquares[i].rawIndex
      : i;
    mergedRawGrid[rawIdx] = solved.grid[i];
  }

  const agreementRatio = agreedSquareCount / 64;

  const orientationNeedsConfirm = Boolean(
    primary.orientation?.requiresConfirmation ||
    secondary.orientation?.requiresConfirmation ||
    (primary.orientation?.perspective !== secondary.orientation?.perspective)
  );

  const turnNeedsConfirm = Boolean(
    primary.activeTurn?.requiresConfirmation ||
    secondary.activeTurn?.requiresConfirmation ||
    (primary.activeTurn?.turn !== secondary.activeTurn?.turn)
  );

  const result = buildRecognitionResult({
    layout: primary.layout,
    squares: mergedSquares,
    grid: solved.grid,
    rawGrid: mergedRawGrid,
    orientation: {
      perspective: primary.orientation?.perspective || 'w',
      confidence: Math.max(primary.orientation?.confidence || 0.8, secondary.orientation?.confidence || 0.8),
      isConfirmed: Boolean(primary.orientation?.isConfirmed && secondary.orientation?.isConfirmed),
      evidence: [
        ...(primary.orientation?.evidence || []),
        ...(secondary.orientation?.evidence || []),
        { type: 'consensus', detail: `双模型格子一致率: ${(agreementRatio * 100).toFixed(1)}%`, confidence: agreementRatio }
      ],
      requiresConfirmation: orientationNeedsConfirm
    },
    activeTurn: {
      turn: solved.turn,
      confidence: Math.max(primary.activeTurn?.confidence || 0.8, secondary.activeTurn?.confidence || 0.8),
      isConfirmed: Boolean(primary.activeTurn?.isConfirmed && secondary.activeTurn?.isConfirmed),
      evidence: [
        ...(primary.activeTurn?.evidence || []),
        ...(secondary.activeTurn?.evidence || [])
      ],
      requiresConfirmation: turnNeedsConfirm
    },
    fen: {
      boardPart: solved.boardFen,
      analysisFen: solved.fen,
      isAssumedFullFen: true
    },
    validation: {
      isValid: solved.isValid,
      issues: solved.validationIssues || [],
      conflictSquares: solved.conflictSquares || [],
      needsReview: !solved.isValid || divergentSquares.length > 0 || mergedSquares.some(s => s.isSuspicious) || (solved.suspiciousSquares && solved.suspiciousSquares.length > 0)
    },
    metadata: {
      backend: `consensus(${primary.metadata?.backend || 'local'}+${secondary.metadata?.backend || 'recheck'})`,
      manifestSha256: primary.metadata?.manifestSha256 || secondary.metadata?.manifestSha256,
      modelVersion: primary.metadata?.modelVersion || secondary.metadata?.modelVersion,
      primaryModelSha256: primary.metadata?.manifestSha256,
      secondaryModelSha256: secondary.metadata?.manifestSha256,
      isIndependent: isIndependentModel,
      timings: {
        localizationMs: primary.metadata?.timings?.localizationMs || 0,
        samplingMs: primary.metadata?.timings?.samplingMs || 0,
        inferenceMs: (primary.metadata?.timings?.inferenceMs || 0) + (secondary.metadata?.timings?.inferenceMs || 0),
        solvingMs: solved.solvingMs || 0,
        totalMs: (primary.metadata?.timings?.totalMs || 0) + (secondary.metadata?.timings?.totalMs || 0)
      }
    }
  });

  result.consensus = {
    agreementRatio: Number(agreementRatio.toFixed(4)),
    agreedSquareCount,
    divergentSquareCount: divergentSquares.length,
    divergentSquares,
    isIndependent: isIndependentModel,
    isIndependentModel: isIndependentModel,
    primaryModel: {
      name: primary.metadata?.name || 'primary',
      architecture: primary.metadata?.architecture || 'fast_cnn_32x32',
      manifestSha256: primary.metadata?.manifestSha256 || null,
      actualWeightsSha256: primary.metadata?.actualWeightsSha256 || null,
      isVerifiedManifest: primary.metadata?.isVerifiedManifest === true,
      modelVersion: primary.metadata?.modelVersion || '1.0.0',
      backend: primary.metadata?.backend || 'primary'
    },
    secondaryModel: {
      name: secondary.metadata?.name || 'secondary',
      architecture: secondary.metadata?.architecture || 'fast_cnn_32x32',
      manifestSha256: secondary.metadata?.manifestSha256 || null,
      actualWeightsSha256: secondary.metadata?.actualWeightsSha256 || null,
      isVerifiedManifest: secondary.metadata?.isVerifiedManifest === true,
      modelVersion: secondary.metadata?.modelVersion || '1.0.0',
      backend: secondary.metadata?.backend || 'secondary'
    }
  };

  return result;
}

export { 
  mergeConsensus
 };
