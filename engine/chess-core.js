/**
 * Maia 3 - Ultra-lightweight Chess Rules & State Engine
 * Handles FEN parsing, legal move generation, SAN/UCI formatting, and board state tracking.
 * Zero external dependencies.
 */

export class ChessBoard {
  static SQUARES = [
    'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1',
    'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
    'a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3',
    'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4',
    'a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5',
    'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
    'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
    'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8'
  ];

  static INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  constructor(fen = ChessBoard.INITIAL_FEN) {
    this.board = new Array(64).fill(null);
    this.turn = 'w';
    this.castling = { K: true, Q: true, k: true, q: true };
    this.epSquare = null;
    this.halfMoves = 0;
    this.fullMoves = 1;
    this.history = [];
    this.isValid = true;
    const ok = this.load(fen);
    if (!ok && fen !== ChessBoard.INITIAL_FEN) {
      this.isValid = false;
      this.load(ChessBoard.INITIAL_FEN);
    }
  }

  static squareToIndex(sq) {
    if (typeof sq === 'number') return sq;
    const file = sq.charCodeAt(0) - 97; // 'a' -> 0
    const rank = parseInt(sq[1], 10) - 1; // '1' -> 0
    return rank * 8 + file;
  }

  static indexToSquare(idx) {
    return ChessBoard.SQUARES[idx];
  }

  load(fen) {
    if (!fen || typeof fen !== 'string') return false;
    let clean = decodeURIComponent(fen).replace(/_/g, ' ').trim();
    let tokens = clean.split(/\s+/);
    if (tokens.length === 1 && tokens[0].split('/').length === 8) {
      tokens = [tokens[0], 'w', '-', '-', '0', '1'];
    }
    if (tokens.length < 2) return false;

    this.board.fill(null);
    const rows = tokens[0].split('/');
    if (rows.length !== 8) return false;

    let whiteKings = 0;
    let blackKings = 0;

    for (let r = 7; r >= 0; r--) {
      const row = rows[7 - r];
      let f = 0;
      for (const char of row) {
        if (/\d/.test(char)) {
          f += parseInt(char, 10);
        } else {
          const color = char === char.toUpperCase() ? 'w' : 'b';
          const type = char.toLowerCase();
          if (type === 'k') {
            if (color === 'w') whiteKings++;
            else blackKings++;
          }
          const idx = r * 8 + f;
          this.board[idx] = { color, type };
          f++;
        }
      }
    }

    // A valid chess board MUST have exactly 1 white king and 1 black king
    if (whiteKings !== 1 || blackKings !== 1) {
      return false;
    }

    this.turn = tokens[1] === 'b' ? 'b' : 'w';
    
    // Castling (validate against physical pieces on starting squares)
    const castlingStr = tokens[2] || '-';
    const whiteKingAtE1 = this.board[4]?.color === 'w' && this.board[4]?.type === 'k';
    const blackKingAtE8 = this.board[60]?.color === 'b' && this.board[60]?.type === 'k';
    const whiteRookAtH1 = this.board[7]?.color === 'w' && this.board[7]?.type === 'r';
    const whiteRookAtA1 = this.board[0]?.color === 'w' && this.board[0]?.type === 'r';
    const blackRookAtH8 = this.board[63]?.color === 'b' && this.board[63]?.type === 'r';
    const blackRookAtA8 = this.board[56]?.color === 'b' && this.board[56]?.type === 'r';

    this.castling = {
      K: castlingStr.includes('K') && whiteKingAtE1 && whiteRookAtH1,
      Q: castlingStr.includes('Q') && whiteKingAtE1 && whiteRookAtA1,
      k: castlingStr.includes('k') && blackKingAtE8 && blackRookAtH8,
      q: castlingStr.includes('q') && blackKingAtE8 && blackRookAtA8
    };

    // En passant
    this.epSquare = (tokens[3] && tokens[3] !== '-') ? ChessBoard.squareToIndex(tokens[3]) : null;
    this.halfMoves = parseInt(tokens[4] || '0', 10);
    this.fullMoves = parseInt(tokens[5] || '1', 10);
    return true;
  }

  getFen() {
    let fen = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const piece = this.board[r * 8 + f];
        if (!piece) {
          empty++;
        } else {
          if (empty > 0) {
            fen += empty;
            empty = 0;
          }
          const char = piece.type;
          fen += piece.color === 'w' ? char.toUpperCase() : char.toLowerCase();
        }
      }
      if (empty > 0) fen += empty;
      if (r > 0) fen += '/';
    }

    fen += ` ${this.turn} `;
    let castling = '';
    const whiteKingAtE1 = this.board[4]?.color === 'w' && this.board[4]?.type === 'k';
    const blackKingAtE8 = this.board[60]?.color === 'b' && this.board[60]?.type === 'k';
    if (this.castling.K && whiteKingAtE1 && this.board[7]?.color === 'w' && this.board[7]?.type === 'r') castling += 'K';
    if (this.castling.Q && whiteKingAtE1 && this.board[0]?.color === 'w' && this.board[0]?.type === 'r') castling += 'Q';
    if (this.castling.k && blackKingAtE8 && this.board[63]?.color === 'b' && this.board[63]?.type === 'r') castling += 'k';
    if (this.castling.q && blackKingAtE8 && this.board[56]?.color === 'b' && this.board[56]?.type === 'r') castling += 'q';
    fen += (castling || '-') + ' ';
    fen += (this.epSquare !== null ? ChessBoard.indexToSquare(this.epSquare) : '-') + ' ';
    fen += `${this.halfMoves} ${this.fullMoves}`;
    return fen;
  }

  getPiece(sq) {
    const idx = ChessBoard.squareToIndex(sq);
    return this.board[idx];
  }

  isSquareAttacked(sqIdx, attackerColor) {
    const f = sqIdx % 8;
    const r = Math.floor(sqIdx / 8);

    // Pawns
    const pStep = attackerColor === 'w' ? -1 : 1;
    const pawnRank = r + pStep;
    if (pawnRank >= 0 && pawnRank < 8) {
      if (f > 0) {
        const p = this.board[pawnRank * 8 + (f - 1)];
        if (p && p.color === attackerColor && p.type === 'p') return true;
      }
      if (f < 7) {
        const p = this.board[pawnRank * 8 + (f + 1)];
        if (p && p.color === attackerColor && p.type === 'p') return true;
      }
    }

    // Knights
    const knightOffsets = [-17, -15, -10, -6, 6, 10, 15, 17];
    for (const offset of knightOffsets) {
      const target = sqIdx + offset;
      if (target >= 0 && target < 64) {
        const tf = target % 8;
        const tr = Math.floor(target / 8);
        if (Math.abs(tf - f) <= 2 && Math.abs(tr - r) <= 2) {
          const p = this.board[target];
          if (p && p.color === attackerColor && p.type === 'n') return true;
        }
      }
    }

    // Kings
    const kingOffsets = [-9, -8, -7, -1, 1, 7, 8, 9];
    for (const offset of kingOffsets) {
      const target = sqIdx + offset;
      if (target >= 0 && target < 64) {
        const tf = target % 8;
        const tr = Math.floor(target / 8);
        if (Math.abs(tf - f) <= 1 && Math.abs(tr - r) <= 1) {
          const p = this.board[target];
          if (p && p.color === attackerColor && p.type === 'k') return true;
        }
      }
    }

    // Sliders: Bishops/Queens (diagonals)
    const diagDirs = [-9, -7, 7, 9];
    for (const dir of diagDirs) {
      let cur = sqIdx;
      while (true) {
        const cf = cur % 8;
        const cr = Math.floor(cur / 8);
        cur += dir;
        if (cur < 0 || cur >= 64) break;
        const nf = cur % 8;
        const nr = Math.floor(cur / 8);
        if (Math.abs(nf - cf) !== 1 || Math.abs(nr - cr) !== 1) break;
        const p = this.board[cur];
        if (p) {
          if (p.color === attackerColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
      }
    }

    // Sliders: Rooks/Queens (straights)
    const straightDirs = [-8, -1, 1, 8];
    for (const dir of straightDirs) {
      let cur = sqIdx;
      while (true) {
        const cf = cur % 8;
        const cr = Math.floor(cur / 8);
        cur += dir;
        if (cur < 0 || cur >= 64) break;
        const nf = cur % 8;
        const nr = Math.floor(cur / 8);
        if (Math.abs(nf - cf) + Math.abs(nr - cr) !== 1) break;
        const p = this.board[cur];
        if (p) {
          if (p.color === attackerColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
      }
    }

    return false;
  }

  inCheck(color = this.turn) {
    let kingIdx = -1;
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (p && p.color === color && p.type === 'k') {
        kingIdx = i;
        break;
      }
    }
    if (kingIdx === -1) return false;
    const opponent = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(kingIdx, opponent);
  }

  isCheck(color = this.turn) {
    return this.inCheck(color);
  }

  generatePseudoLegalMoves() {
    const moves = [];
    const color = this.turn;
    const enemyColor = color === 'w' ? 'b' : 'w';

    for (let idx = 0; idx < 64; idx++) {
      const p = this.board[idx];
      if (!p || p.color !== color) continue;

      const f = idx % 8;
      const r = Math.floor(idx / 8);

      if (p.type === 'p') {
        const forward = color === 'w' ? 8 : -8;
        const startRank = color === 'w' ? 1 : 6;
        const promoRank = color === 'w' ? 7 : 0;

        // 1 step forward
        const target1 = idx + forward;
        if (target1 >= 0 && target1 < 64 && !this.board[target1]) {
          const targetRank = Math.floor(target1 / 8);
          if (targetRank === promoRank) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              moves.push({ from: idx, to: target1, piece: p, promo });
            }
          } else {
            moves.push({ from: idx, to: target1, piece: p });
            // 2 steps forward
            if (r === startRank) {
              const target2 = idx + forward * 2;
              if (!this.board[target2]) {
                moves.push({ from: idx, to: target2, piece: p });
              }
            }
          }
        }

        // Captures
        for (const df of [-1, 1]) {
          const tf = f + df;
          if (tf >= 0 && tf < 8) {
            const target = idx + forward + df;
            if (target >= 0 && target < 64) {
              const destPiece = this.board[target];
              const isPromo = Math.floor(target / 8) === promoRank;
              if (destPiece && destPiece.color === enemyColor) {
                if (isPromo) {
                  for (const promo of ['q', 'r', 'b', 'n']) {
                    moves.push({ from: idx, to: target, piece: p, captured: destPiece, promo });
                  }
                } else {
                  moves.push({ from: idx, to: target, piece: p, captured: destPiece });
                }
              } else if (target === this.epSquare) {
                // En passant
                moves.push({ from: idx, to: target, piece: p, enPassant: true });
              }
            }
          }
        }
      } else if (p.type === 'n') {
        const knightOffsets = [-17, -15, -10, -6, 6, 10, 15, 17];
        for (const offset of knightOffsets) {
          const target = idx + offset;
          if (target >= 0 && target < 64) {
            const tf = target % 8;
            const tr = Math.floor(target / 8);
            if (Math.abs(tf - f) <= 2 && Math.abs(tr - r) <= 2) {
              const destPiece = this.board[target];
              if (!destPiece || destPiece.color === enemyColor) {
                moves.push({ from: idx, to: target, piece: p, captured: destPiece || null });
              }
            }
          }
        }
      } else if (p.type === 'k') {
        const kingOffsets = [-9, -8, -7, -1, 1, 7, 8, 9];
        for (const offset of kingOffsets) {
          const target = idx + offset;
          if (target >= 0 && target < 64) {
            const tf = target % 8;
            const tr = Math.floor(target / 8);
            if (Math.abs(tf - f) <= 1 && Math.abs(tr - r) <= 1) {
              const destPiece = this.board[target];
              if (!destPiece || destPiece.color === enemyColor) {
                moves.push({ from: idx, to: target, piece: p, captured: destPiece || null });
              }
            }
          }
        }

        // Castling (requiring corresponding rook on starting square)
        if (color === 'w' && r === 0 && f === 4) {
          const rH1 = this.board[7];
          if (this.castling.K && rH1 && rH1.color === 'w' && rH1.type === 'r' && !this.board[5] && !this.board[6]) {
            if (!this.isSquareAttacked(4, 'b') && !this.isSquareAttacked(5, 'b') && !this.isSquareAttacked(6, 'b')) {
              moves.push({ from: 4, to: 6, piece: p, castling: 'K' });
            }
          }
          const rA1 = this.board[0];
          if (this.castling.Q && rA1 && rA1.color === 'w' && rA1.type === 'r' && !this.board[1] && !this.board[2] && !this.board[3]) {
            if (!this.isSquareAttacked(4, 'b') && !this.isSquareAttacked(3, 'b') && !this.isSquareAttacked(2, 'b')) {
              moves.push({ from: 4, to: 2, piece: p, castling: 'Q' });
            }
          }
        } else if (color === 'b' && r === 7 && f === 4) {
          const rH8 = this.board[63];
          if (this.castling.k && rH8 && rH8.color === 'b' && rH8.type === 'r' && !this.board[61] && !this.board[62]) {
            if (!this.isSquareAttacked(60, 'w') && !this.isSquareAttacked(61, 'w') && !this.isSquareAttacked(62, 'w')) {
              moves.push({ from: 60, to: 62, piece: p, castling: 'k' });
            }
          }
          const rA8 = this.board[56];
          if (this.castling.q && rA8 && rA8.color === 'b' && rA8.type === 'r' && !this.board[57] && !this.board[58] && !this.board[59]) {
            if (!this.isSquareAttacked(60, 'w') && !this.isSquareAttacked(59, 'w') && !this.isSquareAttacked(58, 'w')) {
              moves.push({ from: 60, to: 58, piece: p, castling: 'q' });
            }
          }
        }
      } else {
        // Rays for Bishop, Rook, Queen
        const dirs = [];
        if (p.type === 'b' || p.type === 'q') dirs.push(-9, -7, 7, 9);
        if (p.type === 'r' || p.type === 'q') dirs.push(-8, -1, 1, 8);

        for (const dir of dirs) {
          let cur = idx;
          while (true) {
            const cf = cur % 8;
            const cr = Math.floor(cur / 8);
            cur += dir;
            if (cur < 0 || cur >= 64) break;
            const nf = cur % 8;
            const nr = Math.floor(cur / 8);

            const isDiag = Math.abs(dir) === 7 || Math.abs(dir) === 9;
            if (isDiag && (Math.abs(nf - cf) !== 1 || Math.abs(nr - cr) !== 1)) break;
            if (!isDiag && (Math.abs(nf - cf) + Math.abs(nr - cr) !== 1)) break;

            const destPiece = this.board[cur];
            if (!destPiece) {
              moves.push({ from: idx, to: cur, piece: p });
            } else {
              if (destPiece.color === enemyColor) {
                moves.push({ from: idx, to: cur, piece: p, captured: destPiece });
              }
              break;
            }
          }
        }
      }
    }

    return moves;
  }

  makeMove(move) {
    const savedState = {
      board: [...this.board],
      turn: this.turn,
      castling: { ...this.castling },
      epSquare: this.epSquare,
      halfMoves: this.halfMoves,
      fullMoves: this.fullMoves
    };

    const p = this.board[move.from];
    this.board[move.from] = null;

    // Handle En Passant capture
    if (move.enPassant) {
      const epCaptureIdx = this.turn === 'w' ? move.to - 8 : move.to + 8;
      this.board[epCaptureIdx] = null;
    }

    // Set piece on target square (with promotion if applicable)
    if (move.promo) {
      this.board[move.to] = { color: this.turn, type: move.promo };
    } else {
      this.board[move.to] = p;
    }

    // Handle castling rook movement
    if (move.castling === 'K') {
      this.board[7] = null;
      this.board[5] = { color: 'w', type: 'r' };
    } else if (move.castling === 'Q') {
      this.board[0] = null;
      this.board[3] = { color: 'w', type: 'r' };
    } else if (move.castling === 'k') {
      this.board[63] = null;
      this.board[61] = { color: 'b', type: 'r' };
    } else if (move.castling === 'q') {
      this.board[56] = null;
      this.board[59] = { color: 'b', type: 'r' };
    }

    // Update En Passant square
    if (p.type === 'p' && Math.abs(move.to - move.from) === 16) {
      this.epSquare = (move.from + move.to) / 2;
    } else {
      this.epSquare = null;
    }

    // Update Castling rights
    if (p.type === 'k') {
      if (this.turn === 'w') {
        this.castling.K = false;
        this.castling.Q = false;
      } else {
        this.castling.k = false;
        this.castling.q = false;
      }
    }
    if (p.type === 'r') {
      if (move.from === 0) this.castling.Q = false;
      if (move.from === 7) this.castling.K = false;
      if (move.from === 56) this.castling.q = false;
      if (move.from === 63) this.castling.k = false;
    }
    if (move.to === 0) this.castling.Q = false;
    if (move.to === 7) this.castling.K = false;
    if (move.to === 56) this.castling.q = false;
    if (move.to === 63) this.castling.k = false;

    // Turn switch
    this.turn = this.turn === 'w' ? 'b' : 'w';
    if (this.turn === 'w') this.fullMoves++;
    return savedState;
  }

  undoMove(savedState) {
    this.board = savedState.board;
    this.turn = savedState.turn;
    this.castling = savedState.castling;
    this.epSquare = savedState.epSquare;
    this.halfMoves = savedState.halfMoves;
    this.fullMoves = savedState.fullMoves;
  }

  getLegalMoves() {
    const pseudo = this.generatePseudoLegalMoves();
    const legal = [];
    const movingColor = this.turn;

    for (const move of pseudo) {
      const state = this.makeMove(move);
      if (!this.inCheck(movingColor)) {
        legal.push(move);
      }
      this.undoMove(state);
    }

    // Attach UCI, SAN, and algebraic squares
    for (const move of legal) {
      move.fromSq = ChessBoard.indexToSquare(move.from);
      move.toSq = ChessBoard.indexToSquare(move.to);
      move.uci = move.fromSq + move.toSq + (move.promo || '');
      move.san = this.moveToSan(move, legal);
    }
    return legal;
  }

  moveToSan(move, legalMoves = null) {
    if (move.castling === 'K' || move.castling === 'k') return 'O-O';
    if (move.castling === 'Q' || move.castling === 'q') return 'O-O-O';

    const p = this.board[move.from];
    let san = '';
    const fromSq = ChessBoard.indexToSquare(move.from);
    const toSq = ChessBoard.indexToSquare(move.to);

    if (p.type !== 'p') {
      san += p.type.toUpperCase();
      // Disambiguation
      if (legalMoves) {
        const ambiguities = legalMoves.filter(
          m => m.to === move.to && m.from !== move.from && this.board[m.from]?.type === p.type
        );
        if (ambiguities.length > 0) {
          const sameFile = ambiguities.some(m => m.from % 8 === move.from % 8);
          const sameRank = ambiguities.some(m => Math.floor(m.from / 8) === Math.floor(move.from / 8));
          if (!sameFile) {
            san += fromSq[0];
          } else if (!sameRank) {
            san += fromSq[1];
          } else {
            san += fromSq;
          }
        }
      }
    } else {
      if (move.captured || move.enPassant) {
        san += fromSq[0];
      }
    }

    if (move.captured || move.enPassant) san += 'x';
    san += toSq;
    if (move.promo) san += `=${move.promo.toUpperCase()}`;

    // Check / Checkmate detection
    const state = this.makeMove(move);
    if (this.inCheck(this.turn)) {
      const nextLegal = this.getLegalMoves();
      san += nextLegal.length === 0 ? '#' : '+';
    }
    this.undoMove(state);

    return san;
  }

  // Quick evaluation to contrast human intuition against tactical/engine baseline
  evaluateSimple() {
    const weights = { p: 100, n: 310, b: 330, r: 500, q: 900, k: 0 };
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (!p) continue;
      const v = weights[p.type] || 0;
      score += p.color === 'w' ? v : -v;
    }
    return this.turn === 'w' ? score : -score;
  }
}
