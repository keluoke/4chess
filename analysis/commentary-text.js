export const COMMENTARY_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false
};

const TOKEN = /\[\[([a-z]+)\]\]/g;
// Standard algebraic moves contain a rank, except for castling. Any raw
// notation, number or claim of a tactic must go through a verified binding.
const UNBOUND_CLAIM = /[\p{N}<>{}\r\n]|\bo(?:[-–—]o){1,2}\b|\b(?:mate|checkmat\w*|check(?:s|ed|ing)?|captur\w*|hanging|sacrific\w*|fork\w*|pinn?\w*|skewer\w*|forced|blunder\w*|wins?|won|draw\w*|resign\w*|time out|out of time|flagged|percent\w*)\b/iu;
const LOSS_WORD = /\b(?:loss(?:es)?|loses?|lost|losing)\b/iu;
const BOUND_LOSS = /\b(?:loses?|lost|losing|loss(?:es)? of)\s+(?:(?:about|roughly|around|approximately)\s+)?\[\[cost\]\]/giu;
const GROUND_LOSS = /\b(?:loses?|lost|losing|loss(?:es)? of)\s+ground\b/giu;

export function bindCommentary(result, bindings, required) {
  const text = typeof result?.text === 'string' ? result.text.trim() : '';
  if (Object.keys(result ?? {}).length !== 1 || text.length < 24 || text.length > 390) return null;
  const literal = text.replace(TOKEN, '');
  if (/[\[\]]/.test(literal) || UNBOUND_CLAIM.test(literal) ||
      (literal.match(/[.!?]+(?=\s|$)/g) || []).length > 2) return null;
  const refs = [...text.matchAll(TOKEN)].map(match => match[1]);
  if (refs.some(ref => !Object.hasOwn(bindings, ref)) || required.some(ref => !refs.includes(ref))) return null;
  const hasCost = refs.includes('cost');
  const hasTurningPoint = refs.includes('result') && refs.includes('turning');
  const afterBoundLoss = hasCost ? text.replace(BOUND_LOSS, '') : text;
  const afterGroundLoss = hasCost || hasTurningPoint ? afterBoundLoss.replace(GROUND_LOSS, '') : afterBoundLoss;
  if (LOSS_WORD.test(afterGroundLoss)) return null;
  return text.replace(TOKEN, (_, ref) => bindings[ref]);
}
