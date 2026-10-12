/**
 * Vision Core ESM Entry for Chrome Extension / Web
 */
export { VisionRecognizerCore } from './recognizer-core.js';
export { VisionTaskController } from './task-controller.js';
export { WebAdapter } from './web-adapter.js';
export { buildRecognitionResult } from './protocol.js';
export { extractTiles, findChessboardBox, refineGridBox } from './board-detector.js';
export { getUnitSquareToQuadHomography, resampleQuadToSquare, boxToCorners, isAxisAligned } from './perspective.js';
export { detectBoardPerspective } from './coordinate-detector.js';
export { detectLastMoveHighlights } from './turn-detector.js';
export { PieceClassifierCore, forwardTile, softmax } from './piece-classifier.js';
export { solveConstraintsAndBuildFen, validateChessPosition, FEN_CHARS } from './fen-optimizer.js';
export { mergeConsensus } from './consensus-engine.js';
export { sha256 } from './crypto-utils.js';
