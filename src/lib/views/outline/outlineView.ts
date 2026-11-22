// Authenticated outline view; the archive supplies one private, read-only initial snapshot.
import type { CreateNovelView } from '../types.ts';
import { mountOutline } from './controller.js';

const createOutline: CreateNovelView = host => {
  let panel: ReturnType<typeof mountOutline> | null = null;
  let y = 0;
  return {
    async show(_route, context) {
      if (!panel) {
        const payload = await host.outline();
        if (payload === undefined || !context.latest()) return false;
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
