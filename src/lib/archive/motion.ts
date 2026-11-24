// Shared motion helpers. Durations come from the tokens in global.css (zero under reduced
// motion); this plays the jump highlight, scrolls with one near/far rule, runs popover exits
// and enters, and slides the seg/tab selection and reveals opened <details> site-wide.

const media = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => media?.matches ?? false;

/** A duration token from :root in milliseconds, e.g. ms('--dur-flash'). */
export function ms(token: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(value) || 0;
  return value.endsWith('ms') ? n : value.endsWith('s') ? n * 1000 : n;
}

const flashes = new WeakMap<Element, number>();
/** Highlights a jump target; the class is cleared after --dur-flash (a static mark under reduced motion). */
export function flash(el: Element) {
  clearTimeout(flashes.get(el));
  el.classList.remove('flash');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('flash');
  flashes.set(el, window.setTimeout(() => { el.classList.remove('flash'); flashes.delete(el); }, ms('--dur-flash')));
}

/** Smooth for a nearby target, instant when it is far away or motion is reduced. */
const behaviorFor = (distance: number): ScrollBehavior =>
  reduced() || Math.abs(distance) > window.innerHeight * 1.5 ? 'instant' : 'smooth';

/** Scrolls the window to the document y `top`; true when the move was an instant jump. */
export function scrollToY(top: number) {
  const behavior = behaviorFor(top - window.scrollY);
  window.scrollTo({ top: Math.max(0, top), behavior });
  return behavior === 'instant';
}

/** scrollIntoView with the same near/far rule; true when the move was an instant jump. */
export function jumpTo(el: Element, block: ScrollLogicalPosition = 'start') {
  const behavior = behaviorFor(el.getBoundingClientRect().top);
  el.scrollIntoView({ block, behavior });
  return behavior === 'instant';
}

const entries = new WeakMap<Element, number>();
/** Replays a one-off entry class (view switch, new layer, opened details) and drops it after `token`. */
export function enter(el: HTMLElement, cls = 'enter', token = '--dur-2') {
  clearTimeout(entries.get(el));
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  entries.set(el, window.setTimeout(() => { el.classList.remove(cls); entries.delete(el); }, ms(token) + 60));
}

interface Exit { timer: number; end(event: AnimationEvent): void; }
const exits = new WeakMap<HTMLElement, Exit>();
const stopExit = (el: HTMLElement) => {
  const exit = exits.get(el);
  if (!exit) return;
  clearTimeout(exit.timer);
  el.removeEventListener('animationend', exit.end);
  el.classList.remove('leaving');
  exits.delete(el);
};

/** Plays the `.leaving` exit, then runs `done` (hide or remove). Immediate under reduced motion. */
export function leave(el: HTMLElement, done: () => void) {
  if (exits.has(el)) return;
  if (reduced() || el.hidden || !el.isConnected) return done();
  const finish = () => { stopExit(el); done(); };
  const end = (event: AnimationEvent) => { if (/-out$/.test(event.animationName)) finish(); };
  el.classList.add('leaving');
  el.addEventListener('animationend', end);
  exits.set(el, { timer: window.setTimeout(finish, ms('--dur-exit') + 60), end });
}
/** Hides a popover with its exit animation. */
export const hide = (el: HTMLElement) => leave(el, () => { el.hidden = true; });
/** Hides at once, also cutting short a running exit. */
export function hideNow(el: HTMLElement) {
  stopExit(el);
  el.hidden = true;
}
/** Shows a popover (its CSS entry animation plays), cancelling an exit still running. */
export function show(el: HTMLElement) {
  stopExit(el);
  el.hidden = false;
}
/** Open and not on its way out. */
export const isShown = (el: HTMLElement) => !el.hidden && !exits.has(el);

const ITEM = '.seg button, .tabs a, .tabs button';
const ON = '[aria-pressed="true"], [aria-current="page"]';

// The selected background (::before) slides from the old item to the new one. Views may
// re-render the group, so the new item is found again under the clicked point.
function slideSelection(event: Event) {
  const item = (event.target as Element).closest?.<HTMLElement>(ITEM);
  const old = item?.parentElement ? [...item.parentElement.children].find((node) => node.matches(ON)) : undefined;
  if (!item || !old || old === item || reduced()) return;
  const from = old.getBoundingClientRect();
  const at = item.getBoundingClientRect();
  const x = at.left + at.width / 2, y = at.top + at.height / 2;
  let tries = 0;
  const check = () => {
    const now = item.isConnected ? item : document.elementFromPoint(x, y)?.closest<HTMLElement>(ITEM);
    if (!now?.matches(ON)) { if (++tries < 4) requestAnimationFrame(check); return; }
    const to = now.getBoundingClientRect();
    if (!to.width) return;
    now.style.setProperty('--from-x', `${from.left - to.left}px`);
    now.style.setProperty('--from-s', String(from.width / to.width));
    enter(now, 'slide');
  };
  requestAnimationFrame(check);
}

const POP_DETAILS = '.card-menu, .file-recovery';
// Opening a <details> by its summary reveals the content once (re-renders that keep it open
// do not); the popover-like ones also play the exit before closing.
function revealDetails(event: MouseEvent) {
  const summary = (event.target as Element).closest?.('summary');
  const box = summary?.parentElement;
  if (event.defaultPrevented || !(box instanceof HTMLDetailsElement) || box.firstElementChild !== summary) return;
  if (!box.open) {
    if (!reduced()) enter(box as HTMLElement, 'opening');
    return;
  }
  if (!box.matches(POP_DETAILS) || reduced()) return;
  event.preventDefault();
  leave(box, () => { box.open = false; });
}

let installed = false;
/** Site-wide listeners; called once by the base layout. */
export function installMotion() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', slideSelection, true);
  document.addEventListener('click', revealDetails);
}
