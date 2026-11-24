// Save foreshadow drafts with the same account/book scope and shared outline revision.
// Reads: outlineSync/<slug> (RTDB); Writes: outlineSync/<slug>, scoped localStorage (JSON)
import type { NovelViewHost } from '../types.ts';
import type { ForeshadowData } from './schema.ts';
import { newRevision, resolve, save, subscribe, type OutlineSyncState } from '../outline/sync.ts';
import { unpack } from '../outline/codec.js';
import { draftStore } from '../outline/draft.js';
import { classify } from '../outline/sync-state.js';
import { validateForeshadow } from './model.js';

export class ForeshadowCloud {
  data: ForeshadowData | null = null;
  remote: OutlineSyncState;
  dirty = false;
  conflict = false;
  error = '';
  saving = false;
  private baseline = '';
  private edits = 0;
  private own = '';
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private draft;
  private stop = () => {};
  private updates = Promise.resolve();

  constructor(private host: NovelViewHost, state: OutlineSyncState, private changed: () => void) {
    this.remote = state;
    this.draft = draftStore(host.outlineDraftKey + ':foreshadow', state.live?.rev ?? '');
  }

  async start() {
    await this.receive(this.remote);
    try {
      const saved = this.draft.load();
      if (saved) {
        this.data = validateForeshadow(saved.workspace.foreshadow);
        this.dirty = JSON.stringify(this.data) !== this.baseline;
        this.conflict = this.dirty && saved.base !== this.remote.live?.rev;
        if (this.dirty && !this.conflict) this.queue();
      }
    } catch (error) { this.error = `本地草稿未能读取，原始草稿仍保留：${String(error)}`; this.conflict = true; }
    this.stop = subscribe(this.host.householdRef, this.host.slug, state => {
      this.updates = this.updates.then(() => this.receive(state)).catch(error => { this.error = String(error); this.changed(); });
    }, error => { this.error = error.message; this.changed(); });
    this.changed();
  }

  private async receive(state: OutlineSyncState | null) {
    if (this.disposed) return;
    const data = state?.live?.foreshadow ? validateForeshadow(JSON.parse(await unpack(state.live.foreshadow))) as ForeshadowData : null;
    if (this.disposed) return;
    const text = JSON.stringify(data);
    if (this.dirty && text !== this.baseline && state?.live?.rev !== this.own) this.conflict = true;
    else {
      this.baseline = text;
      if (!this.dirty) this.data = data;
      this.draft.acceptRevision(state?.live?.rev ?? '');
      if (this.dirty) this.draft.save({ foreshadow: this.data });
    }
    this.remote = state ?? {};
    this.changed();
  }

  edit(data: ForeshadowData) {
    this.draft.save({ foreshadow: validateForeshadow(data) });
    this.data = data; this.dirty = true; this.edits += 1; this.error = '';
    this.queue(); this.changed();
  }

  private queue() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 2_000);
  }

  status() {
    if (this.error) return this.error;
    if (this.conflict) return '云端已有新版本；本机改动仍保留。';
    if (this.dirty || this.saving) return '未保存到云端';
    const info = classify({ ...this.remote, coordinator: this.remote._coordinator });
    return info.label + (info.kind === 'synced' && info.commit ? ` · ${info.commit.slice(0, 7)}` : '');
  }

  async loadCloud() {
    this.dirty = false; this.conflict = false; this.error = ''; this.draft.clear();
    await this.receive(this.remote);
  }

  async flush(action?: 'keep-web' | 'use-repo' | 'use-local' | 'fix-repo') {
    if (this.saving || (!this.dirty && !action) || (this.conflict && !action) || this.disposed || !this.remote.live) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const live = this.remote.live, version = this.edits;
    this.saving = true; this.own = newRevision(); this.error = ''; this.changed();
    try {
      const workspace = { plot_data: JSON.parse(await unpack(live.plot)), plan: JSON.parse(await unpack(live.plan)), foreshadow: structuredClone(this.data) };
      const options = { base: action ? live.rev : this.draft.base(), uid: this.host.uid, current: live, revision: () => this.own };
      const result = action ? await resolve(this.host.householdRef, this.host.slug, action, this.remote, workspace, options)
        : await save(this.host.householdRef, this.host.slug, workspace, options);
      await this.updates;
      if (this.disposed) return;
      if (this.remote.live?.rev !== result.rev) { this.conflict = true; return; }
      this.conflict = false;
      this.draft.acceptRevision(result.rev);
      if (this.edits === version) {
        this.dirty = false; this.draft.clear(); await this.receive(this.remote);
      } else { this.draft.save({ foreshadow: this.data }); this.queue(); }
    } catch (error) { this.error = `云端保存失败：${String(error)}`; }
    finally { this.saving = false; this.own = ''; this.changed(); }
  }

  dispose() {
    this.disposed = true; this.stop();
    if (this.timer) clearTimeout(this.timer);
  }
}
