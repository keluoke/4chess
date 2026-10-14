// Preserve raw model labels for user review; the rule solver is evidence, not a new observation.
import {
  suggestPerspective,
  rotateSquare,
} from "../lib/vision/image-context.js";
import { defaultTurn } from "../lib/vision/default-context.js";

export function imageContext(result) {
  const orientationKnown =
    !!result.orientation && !result.orientation.requiresConfirmation;
  const perspective = orientationKnown
    ? result.orientation.perspective
    : suggestPerspective(result.rawGrid || []).flip
      ? "b"
      : "w";
  const oriented = imagePosition({
    ...result,
    orientation: { ...result.orientation, perspective },
  });
  let suggested;
  try {
    suggested = defaultTurn(oriented, result.activeTurn, { perspective });
  } catch {
    // Incomplete raw labels remain editable; they cannot be passed to an engine before validation.
    suggested = { turn: perspective, known: false };
  }
  return {
    fen: oriented.split(" ")[0] + " " + suggested.turn + " - - 0 1",
    orientation: perspective === "b" ? "black" : "white",
    orientationKnown,
    turnKnown: suggested.known,
    turnConflict: !!suggested.conflict,
    suspiciousSquares: (result.suspiciousSquares || []).map((square) => {
      if (perspective === result.orientation?.perspective) return square;
      return typeof square === "string"
        ? rotateSquare(square)
        : { ...square, square: rotateSquare(square.square) };
    }),
  };
}

export function imagePosition(result) {
  const labels = result.rawGrid;
  if (
    !Array.isArray(labels) ||
    labels.length !== 64 ||
    labels.some((p) => !/^([1rnbqkpRNBQKP])$/.test(p))
  )
    return result.fen?.analysisFen || result.analysisFen;
  const ordered =
    result.orientation?.perspective === "b" ? [...labels].reverse() : labels;
  const ranks = [];
  for (let row = 0; row < 8; row++) {
    let rank = "",
      empty = 0;
    for (const p of ordered.slice(row * 8, row * 8 + 8)) {
      if (p === "1") empty++;
      else {
        if (empty) rank += empty;
        empty = 0;
        rank += p;
      }
    }
    if (empty) rank += empty;
    ranks.push(rank);
  }
  return (
    ranks.join("/") +
    " " +
    (result.activeTurn?.turn === "b" ? "b" : "w") +
    " - - 0 1"
  );
}

export function saneFenFields(fen) {
  if (typeof fen !== "string" || fen.length > 150) return false;
  const fields = fen.trim().split(/\s+/);
  if (
    fields.length !== 6 ||
    !/^[wb]$/.test(fields[1]) ||
    !/^(?:-|K?Q?k?q?)$/.test(fields[2]) ||
    !/^(?:-|[a-h][36])$/.test(fields[3]) ||
    !/^\d+$/.test(fields[4]) ||
    !/^[1-9]\d*$/.test(fields[5])
  )
    return false;
  if (Number(fields[4]) > 1000 || Number(fields[5]) > 100000) return false;
  if (fields[3] !== "-" && fields[3][1] !== (fields[1] === "w" ? "6" : "3"))
    return false;
  return true;
}

export function validHistoricalFields(fen, board) {
  const fields = fen.trim().split(/\s+/);
  const isPiece = (index, type, color) =>
    board.board[index]?.type === type && board.board[index]?.color === color;
  for (const right of fields[2].replace("-", "")) {
    const white = right === right.toUpperCase(),
      king = white ? 4 : 60,
      rook = right.toUpperCase() === "K" ? (white ? 7 : 63) : white ? 0 : 56,
      color = white ? "w" : "b";
    if (!isPiece(king, "k", color) || !isPiece(rook, "r", color)) return false;
  }
  if (fields[3] !== "-") {
    const file = fields[3].charCodeAt(0) - 97,
      whiteTurn = fields[1] === "w",
      target = (whiteTurn ? 5 : 2) * 8 + file;
    if (
      board.board[target] ||
      !isPiece((whiteTurn ? 4 : 3) * 8 + file, "p", whiteTurn ? "b" : "w") ||
      board.board[(whiteTurn ? 6 : 1) * 8 + file]
    )
      return false;
  }
  return true;
}

export function validBoardPlacement(fen) {
  if (!saneFenFields(fen)) return false;
  const ranks = fen.trim().split(/\s+/)[0].split("/");
  return (
    ranks.length === 8 &&
    ranks.every(
      (rank) =>
        /^[1-8rnbqkpRNBQKP]+$/.test(rank) &&
        [...rank].reduce((n, p) => n + (/[1-8]/.test(p) ? Number(p) : 1), 0) ===
          8,
    )
  );
}
