import { soundEffects } from './sound-effects.js?v=20261025-v115';

const shortcuts = new Map([
  ['ArrowLeft', 'previous'], ['j', 'previous'], ['ArrowRight', 'next'], ['k', 'next'],
  ['Home', 'first'], ['End', 'latest'], ['f', 'flip'], ['F', 'flip'], ['m', 'sound'], ['M', 'sound']
]);

export function boardShortcut(event, active = document.activeElement) {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey
      || active?.isContentEditable || active?.closest('input, textarea, select, [role="textbox"]')) return null;
  if ((event.key === ' ' || event.code === 'Space') && !active?.closest('button, a, summary')) return 'play';
  return shortcuts.get(event.key) ?? null;
}

export function playNavigationSound(previous, next, san) {
  if (next > previous && san) soundEffects.playSoundForMove(san);
  else if (next < previous) soundEffects.playMove(next ? 0.4 : 0.3);
}
