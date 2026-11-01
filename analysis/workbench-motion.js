/** Study motion is decorative: DOM/state always reaches its destination synchronously. */
const running = new Map();
const preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
export const motionEnabled = () => !preference?.matches && !globalThis.document?.hidden;
export function cancelMotion(element) {
  running.get(element)?.cancel();
  running.delete(element);
}
export function animateStudy(element, frames, duration = 180) {
  if (!element) return null;
  cancelMotion(element);
  if (!motionEnabled() || !element.animate) return null;
  const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
  running.set(element, animation);
  const clear = () => { if (running.get(element) === animation) running.delete(element); };
  animation.onfinish = clear;
  animation.oncancel = clear;
  return animation;
}
function cancelAll() { for (const element of running.keys()) cancelMotion(element); }
preference?.addEventListener('change', () => { if (preference.matches) cancelAll(); });
globalThis.document?.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); });

export function transitionLayout(elements, update) {
  // Capture the current visual position even if a previous transition is in flight.
  const before = elements.map(el => el.getBoundingClientRect());
  elements.forEach(cancelMotion);
  update();
  elements.forEach((el, i) => {
    const after = el.getBoundingClientRect(), old = before[i];
    if (!after.width || !after.height) return;
    if (!old.width || !old.height) {
      animateStudy(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 220);
    } else {
      animateStudy(el, [
        { transformOrigin: 'top left', transform: `translate(${old.left - after.left}px,${old.top - after.top}px) scale(${old.width / after.width},${old.height / after.height})` },
        { transformOrigin: 'top left', transform: 'none' }
      ], 240);
    }
  });
}
