// Shared Chess.com TCN and PGN serialization for background and studio.
import { ChessBoard } from './chess-core.js';

function pgnTags(pgn) {
  const tag = /\s*\[([a-z][a-z0-9_]*)\s+"((?:\\[^\r\n]|[^"\\\r\n])*)"\s*\]/iy;
  const tags = [];
  while (true) {
    const match = tag.exec(pgn);
    if (!match) return tags;
    tags.push({ key: match[1].toLowerCase(), value: match[2].replace(/\\(["\\])/g, '$1').trim(), raw: match[0].trim(), end: tag.lastIndex });
  }
}

export function readPgnTags(pgn = '') {
  return Object.fromEntries(pgnTags(pgn).map(({ key, value }) => [key, value]));
}

export function withPgnTermination(pgn, status) {
  const reason = String(status?.name || status || '').toLowerCase();
  const termination = ['resign', 'resigned', 'resignation'].includes(reason) ? 'Resignation'
    : ['outoftime', 'timeout'].includes(reason) ? 'Time forfeit' : null;
  if (!termination) return pgn;
  const tags = pgnTags(pgn);
  const existing = tags.find(({ key }) => key === 'termination');
  if (existing && !/^(?:normal|\?)$/i.test(existing.value)) return pgn;
  const header = tags.filter(({ key }) => key !== 'termination').map(({ raw }) => raw);
  header.push('[Termination "' + termination + '"]');
  return header.join('\n') + '\n\n' + pgn.slice(tags.at(-1)?.end || 0).trimStart();
}

export function parseStudioElo(value) {
  const elo = Number(value);
  return Number.isInteger(elo) && elo >= 600 && elo <= 2600 ? elo : null;
}

export function gameLinkInput(pgn, fallback = {}) {
  const tags = pgnTags(pgn);
  const values = Object.fromEntries(tags.map(({ key, value }) => [key, value]));
  const fens = tags.filter(({ key }) => key === 'fen');
  const standardStart = fens.length === 1 && fens[0].value.split(/\s+/).join(' ') === ChessBoard.INITIAL_FEN &&
    tags.filter(({ key }) => key === 'variant').every(({ value }) => /^(standard|chess)$/i.test(value));
  const header = tags.filter(({ key, value }) => key !== 'endtime' &&
    !(standardStart && (key === 'fen' || key === 'setup' && value === '1'))).map(({ raw }) => raw);
  const moves = pgn.slice(tags.at(-1)?.end || 0).trim();
  const params = new URLSearchParams({ pgn: header.length ? `${header.join('\n')}\n\n${moves}` : moves });
  const end = moves.replace(/\{[^}]*\}/g, '').trim().match(/(?:^|\s)(1-0|0-1|1\/2-1\/2)\s*$/)?.[1];
  for (const key of ['white', 'black', 'result']) {
    if (key === 'result' && end) continue;
    if ((!values[key] || values[key] === '?' || (key === 'result' && values[key] === '*')) && fallback[key] && fallback[key] !== '*') {
      params.set(key, fallback[key]);
    }
  }
  return params;
}

export function decodeTcn(tcnString) {
    if (!tcnString || typeof tcnString !== 'string') return [];
    const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=";
    const PROMO_PIECES = "qnrbkp";
    const moves = [];

    for (let i = 0; i < tcnString.length; i += 2) {
      const code1 = ALPHABET.indexOf(tcnString[i]);
      let code2 = ALPHABET.indexOf(tcnString[i + 1]);
      if (code1 === -1 || code2 === -1) continue;

      const move = {};
      if (code2 > 63) {
        const promoIndex = Math.floor((code2 - 64) / 3);
        move.promotion = PROMO_PIECES[promoIndex];
        const offset = ((code2 - 1) % 3) - 1;
        code2 = code1 + (code1 < 16 ? -8 : 8) + offset;
      }
      if (code1 > 75) {
        const dropIndex = code1 - 79;
        move.drop = PROMO_PIECES[dropIndex];
      } else {
        const file = code1 % 8;
        const rank = Math.floor(code1 / 8) + 1;
        move.from = 'abcdefgh'[file] + rank;
      }
      const file = code2 % 8;
      const rank = Math.floor(code2 / 8) + 1;
      move.to = 'abcdefgh'[file] + rank;

      moves.push(move);
    }
    return moves;
  }

export function tcnToSanMoves(tcnString) {
    const tcnMoves = decodeTcn(tcnString);
    if (!tcnMoves || tcnMoves.length === 0) return [];

    const chess = new ChessBoard();
    const moves = [];

    for (let i = 0; i < tcnMoves.length; i++) {
      const mv = tcnMoves[i];
      const uci = mv.from + mv.to + (mv.promotion || '');
      const legals = chess.getLegalMoves();
      const found = legals.find(m => m.uci === uci || (m.fromSq === mv.from && m.toSq === mv.to));
      if (!found) {
        console.warn(`[GameAnalyzer] TCN replay stopped at ply ${i + 1}: ${uci}`);
        break;
      }
      chess.makeMove(found);
      moves.push({
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        turn: (i % 2 === 0) ? 'w' : 'b',
        san: found.san,
        element: null
      });
    }

    return moves;
  }

export function movesToPgn(moves, headers = {}) {
    if (!moves || moves.length === 0) return '';
    let pgn = '';
    const defHeaders = {
      Event: 'Live Chess',
      Site: 'Chess.com',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: 'White',
      Black: 'Black',
      Result: '*',
      ...headers
    };
    for (const [k, v] of Object.entries(defHeaders)) {
      if (v !== undefined && v !== null) {
        pgn += `[${k} "${v}"]\n`;
      }
    }
    pgn += '\n';
    for (let i = 0; i < moves.length; i++) {
      if (i % 2 === 0) {
        pgn += `${Math.floor(i / 2) + 1}. `;
      }
      pgn += `${moves[i].san} `;
    }
    pgn += defHeaders.Result || '*';
    return pgn.trim();
  }
