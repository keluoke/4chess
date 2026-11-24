import { BoardUI } from './board-ui.js?v=20261117-ui';
import { getLang, initI18n, t } from './i18n.js?v=20261124-study-entry';
import { challengeChoices, decodeChallenge } from './challenge-link.js?v=20261124-study-entry';
import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';

const params = new URLSearchParams(location.hash.slice(1));
initI18n();
document.title = 'Diverge · ' + t('challengeTitle');
document.querySelector('meta[name="description"]').content = t('challengeDescription');

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
  byId('challenge-self-test').href = './?tab=checkup&lang=' + getLang();
  const choices = byId('challenge-choices');
  let hovered, focused;
  const board = new BoardUI(byId('challenge-board'), {
    orientation,
    onMove: move => submit(move.uci)
  });
  byId('challenge-play').hidden = false;

  function arrow(uci, color, role) {
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), color, role };
  }

  function preview() {
    if (!answer.hidden || !allowed()) return;
    const move = hovered || focused;
    board.setArrows(move ? [{ ...arrow(move, 'green', 'preview'), opacity: .34 }] : []);
  }

  challengeChoices(challenge).forEach(({ uci, san }, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'challenge-choice';
    const letter = document.createElement('span');
    letter.className = 'challenge-choice-letter';
    letter.textContent = index === 0 ? 'A' : 'B';
    const move = document.createElement('span');
    move.className = 'challenge-choice-san';
    move.textContent = san;
    option.append(letter, move);
    option.onclick = () => submit(uci);
    option.onpointerenter = event => {
      if (event.pointerType === 'touch') return;
      hovered = uci;
      preview();
    };
    option.onpointerleave = () => {
      if (hovered === uci) hovered = null;
      preview();
    };
    option.onfocus = () => {
      focused = option.matches(':focus-visible') ? uci : null;
      preview();
    };
    option.onblur = () => {
      if (focused === uci) focused = null;
      preview();
    };
    choices.append(option);
  });

  function reset() {
    hovered = focused = null;
    board.setPosition(challenge.fen);
    board.setArrows([]);
    board.container.inert = false;
    answer.hidden = true;
    choices.hidden = false;
    delete status.dataset.outcome;
    status.textContent = t(challenge.turn === 'w' ? 'challengeWhite' : 'challengeBlack');
  }

  function submit(uci) {
    if (!answer.hidden || !allowed()) return;
    const outcome = uci === challenge.best ? 'best' : uci === challenge.played ? 'trap' : 'other';
    status.dataset.outcome = outcome;
    status.textContent = t(outcome === 'best' ? 'challengeCorrect' : outcome === 'trap' ? 'challengeTrapped' : 'challengeDifferent');
    answer.hidden = false;
    choices.hidden = true;
    board.setPosition(challenge.fen);
    board.setArrows([
      arrow(challenge.best, 'blue', 'sf'),
      arrow(challenge.played, 'gold', 'maia')
    ]);
    board.container.inert = true;
    byId('challenge-best').textContent = t('challengeRevealBest', { move: challenge.bestSan });
    byId('challenge-played').textContent = t('challengeRevealPlayed', { move: challenge.playedSan });
    const odds = byId('challenge-probability');
    odds.hidden = challenge.probability === null || challenge.elo === null;
    if (!odds.hidden) odds.textContent = t('challengeOdds', { elo: challenge.elo, rate: challenge.probability, played: challenge.playedSan });
    status.focus({ preventScroll: true });
  }

  byId('challenge-reset').onclick = () => {
    reset();
    choices.querySelector('button').focus({ preventScroll: true });
  };
  reset();
}
