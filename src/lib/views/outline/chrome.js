// Arrange persistent outline controls between the desktop toolbar and phone drawer.
import { leave, jumpTo } from '../../archive/motion.ts';

export function outlineChrome(panel) {
  const { root, host } = panel, phone = matchMedia('(max-width: 860px)');
  const q = selector => root.querySelector(selector);
  const recovery = q('.file-recovery'), head = q('.outline-shell-head .side-head');
  const scope = head.querySelector('small').textContent;
  const resize = () => panel.render();
  phone.addEventListener('change', resize);
  const closeMenu = (event, focus = false) => {
    const menu = q('.card-menu[open]');
    if (!menu || (event?.type === 'click' && menu.contains(event.target))) return false;
    leave(menu, () => { menu.open = false; });
    if (focus) menu.querySelector('summary').focus({ preventScroll: true });
    return true;
  };
  const outside = event => closeMenu(event);
  const escape = event => {
    if (event.key === 'Escape' && closeMenu(event, true)) { event.preventDefault(); event.stopPropagation(); }
  };
  document.addEventListener('click', outside);
  document.addEventListener('keydown', escape, true);
  return {
    before() {
      if (q('.side.show')) host.setDrawer(false);
      recovery.remove(); head.querySelector('#overall')?.remove(); head.remove(); q('[data-undo-slot]').replaceChildren();
    },
    render(v) {
      const sec = v.sectionOf(v.lineOf(panel.UI.line));
      q('.ol-person b').textContent = sec.name + ' ▾';
      q('.ol-person small').textContent = `${sec.lines.length} 条故事线`;
      q('.ol-ctx .chip').setAttribute('aria-pressed', String(panel.UI.onlyUnplaced));
      const side = q('.picker.side');
      if (side) side.inert = phone.matches;
      (phone.matches ? q('.outline-drawer-head') : q('.outline-shell-head')).append(head);
      (phone.matches ? q('[data-recovery-slot]') : q('[data-toolbar]')).append(recovery);
      (phone.matches ? q('[data-save-slot]') : q('[data-toolbar]')).prepend(q('#sync-state'));
      if (phone.matches) {
        head.querySelector('small').textContent = scope + ' · ';
        head.querySelector('small').append(q('#overall'));
        q('[data-undo-slot]').replaceChildren();
        const undo = q('#undo');
        if (undo) { undo.className = 'iconbtn'; q('[data-undo-slot]').append(undo); }
      } else head.querySelector('small').textContent = scope;
    },
    openDrawer() { q('.ol-person').focus({ preventScroll: true }); host.setDrawer(true); },
    jumpParts() { host.setDrawer(false); const parts = q('.beats-pane'); jumpTo(parts); parts.focus({ preventScroll: true }); },
    dispose() {
      phone.removeEventListener('change', resize);
      document.removeEventListener('click', outside); document.removeEventListener('keydown', escape, true);
    },
  };
}
