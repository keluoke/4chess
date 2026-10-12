/**
 * Unified Vision Recognizer Core
 * Orchestrates board detector, piece classifier, and FEN constraint solver.
 * Decoupled from host platforms; injects dependencies via VisionPlatformAdapter.
 */

import { extractTiles, rgbaToGrayscale, findChessboardBox, refineGridBox, checkerQuality } from './board-detector.js';
import { PieceClassifierCore } from './piece-classifier.js';
import { solveConstraintsAndBuildFen } from './fen-optimizer.js';
import { buildRecognitionResult } from './protocol.js';
import { VisionTaskController } from './task-controller.js';
import { boxToCorners } from './perspective.js';
import { detectBoardPerspective } from './coordinate-detector.js';
import { detectLastMoveHighlights } from './turn-detector.js';

const OFFICIAL_MANIFEST = {
  version: '1.0.0',
  name: 'chessimg2pos',
  architecture: 'fast_cnn_32x32',
  manifestSha256: '3911bad0cc0ec0e86b4688aab70e33ef59ddc77b805efbfa680dd02826059720',
  files: {
    'chessimg2pos_weights.bin': {
      size: 620852,
      sha256: '3911bad0cc0ec0e86b4688aab70e33ef59ddc77b805efbfa680dd02826059720'
    },
    'chess-cnn.wasm': {
      size: 6349,
      sha256: 'cd54b2122ed679eb5f935785a3db425131591f253d1e961c82ce516b456fe169'
    },
    'chessimg2pos.onnx': {
      size: 623976,
      sha256: '8446a3686d57a4c0324b3cb3b73dfdda4734ab4f57b2814416b8128effb66822'
    }
  },
  labels: ['1', 'R', 'N', 'B', 'Q', 'K', 'P', 'r', 'n', 'b', 'q', 'k', 'p'],
  tileSize: 32
};

class VisionRecognizerCore {
  constructor(options = {}) {
    this.adapter = options.adapter || null;
    this.classifier = new PieceClassifierCore(options);
    this.taskController = new VisionTaskController(this);
    this.manifestSha256 = options.manifestSha256 || OFFICIAL_MANIFEST.manifestSha256;
    this.modelVersion = options.modelVersion || OFFICIAL_MANIFEST.version;
    this.isVerifiedManifest = false;
    this.localizationMs = 0;
  }

  async init() {
    const res = await this.classifier.init();
    if (this.classifier && this.classifier.weightsSha256) {
      this.manifestSha256 = this.classifier.weightsSha256;
      this.actualWeightsSha256 = this.classifier.weightsSha256;
      const weightsMatch = (this.actualWeightsSha256 === OFFICIAL_MANIFEST.files['chessimg2pos_weights.bin'].sha256);
      let backendAssetMatch = false;
      const backend = this.classifier.backend;
      if (backend === 'wasm') {
        backendAssetMatch = Boolean(this.classifier.wasmSha256 && this.classifier.wasmSha256 === OFFICIAL_MANIFEST.files['chess-cnn.wasm'].sha256);
      } else if (backend === 'js') {
        backendAssetMatch = true;
      } else if (backend === 'native') {
        backendAssetMatch = Boolean(this.classifier.onnxSha256 && this.classifier.onnxSha256 === OFFICIAL_MANIFEST.files['chessimg2pos.onnx'].sha256);
      }
      this.isVerifiedManifest = Boolean(weightsMatch && backendAssetMatch);
    }
    return res;
  }

  destroy() {
    if (this.taskController) {
      this.taskController.cancelCurrentTask();
    }
    if (this.classifier && typeof this.classifier.destroy === 'function') {
      this.classifier.destroy();
    }
  }

  /**
   * Fast board localization without classification.
   * @param {object} imageInfo - { data, width, height }
   * @returns {{ box: object, autoAccepted: boolean, quality: number }}
   */
  locate(imageInfo) {
    const { data, width, height } = imageInfo;
    const gray = imageInfo.gray || rgbaToGrayscale(data, width, height);
    const started = Date.now();
    let coarse;
    const ratio = Math.min(1, 480 / Math.max(width, height));

    if (ratio < 1) {
      const w = Math.round(width * ratio), h = Math.round(height * ratio), small = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0, n = 0;
          for (let sy = Math.floor(y * height / h); sy < Math.ceil((y + 1) * height / h); sy++) {
            for (let sx = Math.floor(x * width / w); sx < Math.ceil((x + 1) * width / w); sx++) {
              sum += gray[Math.min(height - 1, sy) * width + Math.min(width - 1, sx)];
              n++;
            }
          }
          small[y * w + x] = sum / n;
        }
      }
      const found = findChessboardBox(small, w, h);
      coarse = {
        ...found,
        x: Math.round(found.x * width / w),
        y: Math.round(found.y * height / h),
        width: Math.round(found.width * width / w),
        height: Math.round(found.height * height / h)
      };
    } else {
      coarse = findChessboardBox(gray, width, height);
    }

    let box = refineGridBox(gray, width, height, coarse);
    if (!box.gridAligned && ratio < 1) {
      box = refineGridBox(gray, width, height, findChessboardBox(gray, width, height));
    }

    this.localizationMs = Date.now() - started;
    const quality = box.hasBoard === false ? 0 : checkerQuality(gray, width, box);
    imageInfo.gray = gray;

    const corners = boxToCorners(box);
    const isAutoAccepted = box.hasBoard !== false && Boolean(box.gridAligned) && quality > 4;
    return {
      box,
      corners,
      autoAccepted: isAutoAccepted,
      quality
    };
  }

  /**
   * Recognizes chessboard and pieces with abort signal protection.
   * @param {object} imageInfo - { data, width, height }
   * @param {object} [options={}] - { activeTurn, flip, marginTrim, box, corners, signal }
   * @returns {Promise<object>} VisionRecognitionResult
   */
  async recognize(imageInfo, options = {}) {
    const started = Date.now();
    if (options.signal && options.signal.aborted) {
      const err = new Error('Recognition aborted before starting');
      err.name = 'AbortError';
      throw err;
    }

    // 1. Detect board and extract 64 normalized 32x32 tiles (supports box or perspective corners)
    const tileResult = extractTiles(imageInfo, {
      marginTrim: options.marginTrim,
      box: options.box,
      corners: options.corners
    });

    if (!tileResult.hasBoard) {
      return buildRecognitionResult({
        layout: {
          hasBoard: false,
          box: tileResult.box,
          corners: tileResult.corners || null,
          gridAligned: false,
          qualityScore: 0,
          autoAccepted: false
        },
        fen: {
          boardPart: '',
          analysisFen: '',
          isAssumedFullFen: true
        },
        activeTurn: {
          turn: options.activeTurn || 'w',
          confidence: 0,
          isConfirmed: false,
          requiresConfirmation: true
        },
        squares: new Array(64).fill(null).map((_, i) => ({
          index: i,
          square: `${String.fromCharCode(97 + (i % 8))}${8 - Math.floor(i / 8)}`,
          rawIndex: i,
          piece: '1',
          prob: 0,
          candidates: [],
          isSuspicious: false
        })),
        grid: new Array(64).fill('1'),
        rawGrid: new Array(64).fill('1'),
        validation: {
          isValid: false,
          issues: ['未能从图片中检测到有效棋盘（图片缺少对比度或无棋盘）']
        },
        metadata: {
          backend: this.classifier.backend,
          manifestSha256: this.manifestSha256,
          modelVersion: this.modelVersion,
          timings: {
            localizationMs: this.localizationMs || 0,
            samplingMs: Date.now() - started,
            inferenceMs: 0,
            solvingMs: 0,
            totalMs: Date.now() - started
          }
        }
      });
    }

    if (options.signal && options.signal.aborted) {
      const err = new Error('Recognition aborted after extraction');
      err.name = 'AbortError';
      throw err;
    }

    // 2. Classify tiles with deep learning model
    const sampled = Date.now();
    const probs = await this.classifier.predictTiles(tileResult.tiles, options);

    if (options.signal && options.signal.aborted) {
      const err = new Error('Recognition aborted after tile inference');
      err.name = 'AbortError';
      throw err;
    }

    // 3. Multi-evidence detection: Coordinate OCR & Last-Move Highlights
    let flip = Boolean(options.flip);
    const extraOrientationEvidence = [];
    const gray = imageInfo.gray || tileResult.gray || (imageInfo.data ? rgbaToGrayscale(imageInfo.data, imageInfo.width, imageInfo.height) : null);
    const coordEvidence = gray ? detectBoardPerspective(
      gray,
      imageInfo.width,
      imageInfo.height,
      tileResult.box
    ) : null;
    if (coordEvidence) {
      extraOrientationEvidence.push({
        type: 'coordinate_ocr',
        detail: coordEvidence.detail,
        confidence: coordEvidence.confidence
      });
      // Auto-adapt flip ONLY if:
      // - Caller did not explicitly specify flip
      // - Coordinate confidence is high (>= 0.95)
      // - Not conflicted and verified by outer gutters
      if (options.flip === undefined && coordEvidence.confidence >= 0.95 && !coordEvidence.isConflicted && coordEvidence.hasStrongGutterAlignment) {
        flip = (coordEvidence.perspective === 'b');
      }
    }

    const extraTurnEvidence = [];
    if (imageInfo.data && imageInfo.data.length >= imageInfo.width * imageInfo.height * 4) {
      const highlight = detectLastMoveHighlights(
        imageInfo.data,
        imageInfo.width,
        imageInfo.height,
        tileResult.box,
        flip ? 'b' : 'w'
      );
      if (highlight) {
        extraTurnEvidence.push({
          type: 'last_move_highlight',
          detail: highlight.detail,
          confidence: highlight.confidence
        });
      }
    }

    // 4. Solve domain constraints and generate legal FEN
    const solvedStart = Date.now();
    const solved = solveConstraintsAndBuildFen(probs, {
      activeTurn: options.activeTurn || 'w',
      flip
    });

    const now = Date.now();
    const timings = {
      localizationMs: this.localizationMs || 0,
      samplingMs: sampled - started,
      inferenceMs: solvedStart - sampled,
      solvingMs: now - solvedStart,
      totalMs: now - started,
      backend: this.classifier.backend
    };

    console.info('[Vision timing]', JSON.stringify(timings));

    const allOrientationEvidence = [...extraOrientationEvidence, ...(solved.orientationEvidence || [])];
    const allTurnEvidence = [...extraTurnEvidence, ...(solved.turnEvidence || [])];

    const qualityScore = options.quality !== undefined ? options.quality :
      (options.qualityScore !== undefined ? options.qualityScore :
      (gray ? checkerQuality(gray, imageInfo.width, tileResult.box) : 0));
    const autoAccepted = options.autoAccepted !== undefined ? Boolean(options.autoAccepted) :
      (tileResult.box.hasBoard !== false && Boolean(tileResult.box.gridAligned) && qualityScore > 4);

    const isOrientationConfirmed = Boolean(options.orientationConfirmed);
    const coordinateAgrees = coordEvidence && coordEvidence.perspective === (flip ? 'b' : 'w');
    const requiresOrientationConfirmation = !isOrientationConfirmed && !(coordinateAgrees && coordEvidence.confidence >= 0.95 && !coordEvidence.isConflicted && coordEvidence.hasStrongGutterAlignment);

    // A confident classifier can confidently classify the wrong crop. Geometry
    // is a separate acceptance gate and must cover empty as well as occupied cells.
    const localizationNeedsReview = !options.corners && (!tileResult.box.gridAligned || !Number.isFinite(qualityScore) || qualityScore <= 4);
    if (localizationNeedsReview) {
      solved.validationIssues.push('棋盘范围待核对，请对照原图重新选区');
      for (const square of solved.structuredSquares) {
        square.isSuspicious = true;
        square.suspiciousReason = '棋盘范围待核对';
      }
    }

    const result = buildRecognitionResult({
      layout: {
        hasBoard: tileResult.box.hasBoard !== false,
        box: tileResult.box,
        corners: tileResult.corners || null,
        gridAligned: Boolean(tileResult.box.gridAligned),
        qualityScore,
        autoAccepted,
        requiresReview: localizationNeedsReview
      },
      squares: solved.structuredSquares || [],
      grid: solved.grid,
      rawGrid: solved.rawGrid,
      orientation: {
        perspective: flip ? 'b' : 'w',
        confidence: coordinateAgrees ? coordEvidence.confidence : 0.5,
        isConfirmed: isOrientationConfirmed,
        evidence: allOrientationEvidence,
        requiresConfirmation: requiresOrientationConfirmation
      },
      activeTurn: {
        turn: solved.turn,
        confidence: extraTurnEvidence.length > 0 ? 0.92 : 0.85,
        isConfirmed: Boolean(options.turnConfirmed),
        evidence: allTurnEvidence,
        requiresConfirmation: !options.turnConfirmed
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
        needsReview: localizationNeedsReview || !solved.isValid || (solved.suspiciousSquares && solved.suspiciousSquares.length > 0)
      },
      metadata: {
        name: 'chessimg2pos',
        architecture: 'fast_cnn_32x32',
        manifestSha256: this.manifestSha256,
        actualWeightsSha256: this.classifier.weightsSha256 || this.manifestSha256,
        ...(this.classifier.wasmSha256 ? { actualWasmSha256: this.classifier.wasmSha256 } : {}),
        isVerifiedManifest: Boolean(this.isVerifiedManifest),
        modelVersion: this.modelVersion,
        backend: this.classifier.backend,
        timings
      }
    });

    return result;
  }
}

export { 
  VisionRecognizerCore,
  OFFICIAL_MANIFEST
 };
