// 时间线 view (interim): mounts the previous timeline inside the new shell until the
// redesigned view replaces it.
import { mountNovelTimeline, type NovelTimelineState } from '../../novelTimeline.ts';
import '../../../styles/novelTimeline.css';
import type { CreateNovelView } from '../types.ts';

const createTimeline: CreateNovelView = (host) => {
  let mounted: ReturnType<typeof mountNovelTimeline> | null = null;
  return {
    async show(_route, ctx) {
      if (mounted) return true;
      const data = await host.timeline();
      if (data === undefined || !ctx.latest()) return false;
      if (!data) {
        host.root.innerHTML = '<p class="tl-empty">这本书的时间线尚未同步。</p>';
        return true;
      }
      mounted = mountNovelTimeline(host.root, data, (path, hash) => host.readerHref(path, hash), host.memo.state as NovelTimelineState | undefined);
      host.memo.state = mounted.state;
      return true;
    },
    hide() {
      mounted?.unmount();
      mounted = null;
    },
    dispose() {
      mounted?.unmount();
      mounted = null;
    },
    label: () => '时间线',
  };
};

export default createTimeline;
