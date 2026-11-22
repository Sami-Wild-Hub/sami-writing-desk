// Authenticated outline view; the archive supplies the first shared outlineSync snapshot.
import type { CreateNovelView } from '../types.ts';
import { mountOutline } from './controller.js';
import { decodeState } from './sync.ts';

const createOutline: CreateNovelView = host => {
  let panel: ReturnType<typeof mountOutline> | null = null;
  let y = 0;
  return {
    async show(_route, context) {
      if (!panel) {
        const state = await host.outline();
        if (state === undefined || !context.latest()) return false;
        const payload = await decodeState(state);
        if (!payload) {
          host.root.textContent = '这本书的大纲尚未同步。';
          return true;
        }
        panel = mountOutline(host.root, payload, host.outlineDraftKey, host);
      }
      document.title = `大纲 · ${host.bookTitle} · Sami Writing Desk`;
      window.scrollTo(0, context.restore ?? y);
      return true;
    },
    hide() { panel?.finish(); y = window.scrollY; },
    dispose() { panel?.dispose(); panel = null; },
    label: () => '大纲',
  };
};
export default createOutline;
