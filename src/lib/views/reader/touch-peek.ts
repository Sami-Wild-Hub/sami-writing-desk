// A stationary touch holds for a preview; taps and scrolling keep their native behavior.
export function touchPeek(scope: HTMLElement, show: (a: HTMLAnchorElement) => void, hide: () => void) {
  let timer = 0, pressed: HTMLAnchorElement | null = null, suppress: HTMLAnchorElement | null = null;
  let x = 0, y = 0;
  const cancel = () => { clearTimeout(timer); pressed = null; };
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    cancel(); hide();
    pressed = (e.target as Element).closest<HTMLAnchorElement>('a.ent[data-doc-path]');
    if (!pressed) return;
    x = e.clientX; y = e.clientY;
    timer = window.setTimeout(() => { if (pressed) { suppress = pressed; show(pressed); } }, 450);
  };
  const move = (e: PointerEvent) => { if (pressed && e.pointerType === 'touch' && Math.hypot(e.clientX - x, e.clientY - y) > 10) { cancel(); hide(); } };
  const click = (e: MouseEvent) => {
    if (suppress && (e.target as Element).closest('a') === suppress) { e.preventDefault(); e.stopPropagation(); }
    else hide();
    suppress = null;
  };
  const context = (e: Event) => { if (suppress) e.preventDefault(); };
  const outside = (e: Event) => { if (!scope.contains(e.target as Node)) { cancel(); hide(); } };
  const scroll = () => { cancel(); hide(); suppress = null; };
  scope.addEventListener('pointerdown', down);
  scope.addEventListener('pointermove', move);
  scope.addEventListener('pointerup', cancel);
  scope.addEventListener('pointercancel', scroll);
  scope.addEventListener('click', click, true);
  scope.addEventListener('contextmenu', context);
  document.addEventListener('pointerdown', outside);
  window.addEventListener('scroll', scroll, { passive: true });
  return { dismiss: () => { cancel(); suppress = null; }, dispose: () => {
    cancel(); scope.removeEventListener('pointerdown', down); scope.removeEventListener('pointermove', move);
    scope.removeEventListener('pointerup', cancel); scope.removeEventListener('pointercancel', scroll);
    scope.removeEventListener('click', click, true); scope.removeEventListener('contextmenu', context);
    document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', scroll);
  } };
}
