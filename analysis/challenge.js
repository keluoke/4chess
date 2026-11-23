import { BoardUI } from './board-ui.js?v=20261117-ui';
import { getLang, initI18n, t } from './i18n.js?v=20261123-checkup-challenge';
import { decodeChallenge } from './challenge-link.js?v=20261123-checkup-challenge';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';

const params = new URLSearchParams(location.hash.slice(1));
initI18n();
document.title = 'Diverge · ' + t('challengeTitle');
document.querySelector('meta[name="description"]').content = t('challengeDescription');
document.querySelector('.challenge-self-test').href = './?tab=checkup&lang=' + getLang();

const byId = id => document.getElementById(id);
const status = byId('challenge-status');
const challenge = decodeChallenge(params.get('p'));
const allowed = () => window.top === window && !FairPlayGuard.isLiveGameInProgress();

if (!challenge || !allowed()) {
  status.textContent = t('challengeInvalid');
} else {
  const answer = byId('challenge-answer');
  const orientation = challenge.turn === 'w' ? 'white' : 'black';
  const studio = new URL('./', location.href);
  studio.hash = new URLSearchParams({ fen: challenge.fen, orientation, lang: getLang() });
  byId('challenge-analyze').href = studio.href;
  const form = byId('challenge-form');
  const moveField = byId('challenge-move');
  const board = new BoardUI(byId('challenge-board'), {
    orientation,
    onMove: move => submit(move.uci)
  });
  byId('challenge-play').hidden = false;

  function reset() {
    board.setPosition(challenge.fen);
    board.setArrows([]);
    board.container.inert = false;
    answer.hidden = true;
    form.hidden = false;
    moveField.value = '';
    status.textContent = t(challenge.turn === 'w' ? 'challengeWhite' : 'challengeBlack');
  }

  function submit(uci) {
    if (!answer.hidden || !allowed()) return;
    const best = uci === challenge.best;
    status.textContent = t(best ? 'challengeCorrect' : uci === challenge.played ? 'challengeTrapped' : 'challengeDifferent');
    board.setPosition(challenge.fen);
    board.setArrows([
      { from: challenge.best.slice(0, 2), to: challenge.best.slice(2, 4), color: 'blue', role: 'sf' },
      { from: challenge.played.slice(0, 2), to: challenge.played.slice(2, 4), color: 'gold', role: 'maia' }
    ]);
    board.container.inert = true;
    form.hidden = true;
    byId('challenge-lines').textContent = t('challengeReveal', { best: challenge.bestSan, played: challenge.playedSan });
    const odds = byId('challenge-probability');
    odds.hidden = challenge.probability === null || challenge.elo === null;
    if (!odds.hidden) odds.textContent = t('challengeOdds', { elo: challenge.elo, rate: challenge.probability, played: challenge.playedSan });
    answer.hidden = false;
    byId('challenge-reset').focus();
  }

  form.onsubmit = event => {
    event.preventDefault();
    const input = moveField.value.trim();
    const legal = board.chess.getLegalMoves();
    const move = legal.find(candidate => candidate.uci === input.toLowerCase() ||
      board.chess.moveToSan(candidate, legal).replace(/[+#]$/, '') === input.replace(/[+#]$/, ''));
    if (move) submit(move.uci);
    else status.textContent = t('challengeIllegal');
  };
  byId('challenge-reset').onclick = reset;
  reset();
}
