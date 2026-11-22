// Cloud saves, local drafts, CAS conflicts and replacement recovery for the outline panel.
import { classify } from './sync-state.js';
import { decodeState, filesEqual, newRevision, resolve, save, workspaceFiles } from './sync.ts';
export class OutlineCloud {
cloudRevision = () => this.remote.live?.rev || this.remote.head?.synced?.rev || '';
loadSavedDraft = (saved) => {

 const local = workspaceFiles(saved.workspace), cloud = this.payload.texts;
 const localChanged = !filesEqual(local, cloud);
 if (!localChanged) { this.draft.clear(); this.draft.acceptRevision(this.cloudRevision()); return; }
 this.model.importWorkspace(saved.workspace, false); this.localDirty = true; this.pendingWorkspace = saved.workspace;
 if (saved.base === this.cloudRevision()) {
   this.draft.acceptRevision(this.cloudRevision()); this.draft.save(saved.workspace);
   this.report('正在把本机草稿写入云端…'); this.queueCloudSave();
 } else {
   this.showRemoteConflict(this.payload);
 }
};
saveWorkspace = (workspace) => {
 try { this.draft.save(workspace); this.localDirty = true; this.pendingWorkspace = workspace; this.queueCloudSave(); this.updateSyncStatus(); }
 catch (error) { this.$('autosave-warning').hidden = false; throw error; }
};
queueCloudSave = () => {
 if (this.cloudSaveTimer) clearTimeout(this.cloudSaveTimer);
 if (!this.pendingSince) this.pendingSince = Date.now();
 if (this.inFlight || this.noticeKind === 'cloud') return;
 const delay = Math.max(0, Math.min(2_000, 10_000 - (Date.now() - this.pendingSince)));
 this.cloudSaveTimer = setTimeout(() => { this.cloudSaveTimer = null; void this.flushCloudSave(); }, delay);
};
flushCloudSave = async () => {
 if (!this.pendingWorkspace || !this.remote.live || this.inFlight || this.noticeKind === 'cloud') return;
 await this.submitWorkspace();
};
submitWorkspace = async (action) => {
 if (this.inFlight) return;
 const workspace = this.pendingWorkspace, revision = newRevision(), keep = this.keepPrevious;
 const unsaved = action === 'use-repo' && !filesEqual(workspaceFiles(workspace), this.payload.texts);
 this.inFlight = { revision }; this.pendingSince = 0; this.keepPrevious = false;
 if (this.cloudSaveTimer) clearTimeout(this.cloudSaveTimer);
 try {
  const options = { base: this.draft.base() || this.remote.live.rev, uid: this.uid, current: this.remote.live, previous: keep ? this.remote.live : undefined, revision: () => revision };
  const live = action ? await resolve(this.host.householdRef, this.host.slug, action, this.remote, workspace, options)
   : await save(this.host.householdRef, this.host.slug, workspace, options);
  await this.remoteUpdates;
  if (this.disposed) return;
  if (action === 'use-repo' && this.editing) this.finishInline(true);
  // Edits still pending here were made on the replaced web version: keep their old base so they are never saved over the repository version unasked.
  const superseded = action === 'use-repo' && (unsaved || this.pendingWorkspace !== workspace);
  if (!superseded) this.draft.acceptRevision(live.rev);
  this.retrySave = false;
  this.noticeKind = ''; this.root.querySelector('.draft-notice')?.remove();
  if (!superseded && this.pendingWorkspace === workspace) {
   this.pendingWorkspace = null; this.localDirty = false; this.draft.clear();
   if (action === 'use-repo' && this.remote.live.rev === live.rev) this.applyRemote(await decodeState({ ...this.remote, live }));
  } else this.draft.save(this.pendingWorkspace);
  if (superseded || this.remote.live.rev !== live.rev) {
   if (this.pendingWorkspace) this.showRemoteConflict(this.payload); else this.applyRemote(this.payload);
  }
 } catch (error) {
  await this.remoteUpdates;
  this.keepPrevious = keep; this.retrySave = this.remote.live.rev === this.draft.base();
  this.report('云端保存失败：' + (error.message || error), true);
  if (!this.retrySave) this.showRemoteConflict(this.payload);
 } finally {
  this.inFlight = null;
  if (!this.disposed) { this.updateSyncStatus(); if (this.pendingWorkspace && !this.retrySave) this.queueCloudSave(); }
 }
};
receiveRemote = async (state) => {
 if (this.disposed || !state) return;
 try {
  const payload = await decodeState(state); if (!payload) return;
  const own = this.inFlight?.revision === state.live?.rev;
  const sameFiles = filesEqual(payload.texts, this.payload.texts);
  if (own || sameFiles || this.inFlight) {
   const configChanged = JSON.stringify(payload.config) !== JSON.stringify(this.config);
   this.remote = state; this.payload = payload; this.config = payload.config;
   if (configChanged && !this.composer && this.finishInline(true)) this.render(); else this.updateSyncStatus();
   if (!this.inFlight && !this.pendingWorkspace) this.draft.acceptRevision(this.cloudRevision());
   if (this.retrySave && this.pendingWorkspace && !this.inFlight) { this.retrySave = false; this.queueCloudSave(); }
   return;
  }
  if (!this.finishInline(true)) return;
  if (this.localDirty || this.pendingWorkspace) { this.remote = state; this.payload = payload; this.showRemoteConflict(payload); this.updateSyncStatus(); return; }
  this.applyRemote(payload);
 } catch (error) { this.report('云端大纲格式无效：' + (error.message || error), true); }
};
applyRemote = (payload) => {
 if (!payload) return;
 if (this.cloudSaveTimer) clearTimeout(this.cloudSaveTimer); this.pendingSince = 0;
 this.remote = payload.sync; this.payload = payload; this.config = payload.config; this.draft.acceptRevision(this.cloudRevision()); this.draft.clear();
 this.model.importWorkspace({ plot_data: payload.plot_data, plan: payload.plan, active_beat: this.activeBeat }, false); this.model.undoHistory = [];
 this.localDirty = false; this.pendingWorkspace = null; this.noticeKind = ''; this.root.querySelector('.draft-notice')?.remove(); this.render();
};
showRemoteConflict = (payload) => {
 this.payload = payload;
 if (this.noticeKind === 'cloud') return; this.noticeKind = 'cloud';
 this.notice('云端已有新版本；当前本机改动仍保留。', [
  { label: '下载本机版', action: () => this.download('outline-local-draft.json', this.model.exportWorkspace()) },
  { label: '载入云端版', action: () => this.applyRemote(this.payload) },
  { label: '用本机版覆盖', action: () => void this.writeResolution('use-local') },
 ]);
};
writeResolution = async (action) => {
 if (this.inFlight) return;
 const workspace = this.model.exportWorkspace(); this.pendingWorkspace = workspace; this.localDirty = true;
 try { this.draft.save(workspace); await this.submitWorkspace(action); }
 catch (error) { this.report('处理云端版本失败：' + (error.message || error), true); }
};
showRepoConflict = () => {
 if (this.noticeKind === 'repo') return; this.noticeKind = 'repo';
 this.notice('仓库有新版，请选择要保留的版本。', [
  { label: '下载网页版', action: () => this.download('outline-web-version.json', this.model.exportWorkspace()) },
  { label: '保留网页版', action: () => void this.writeResolution('keep-web') },
  { label: '用仓库版', action: () => void this.writeResolution('use-repo') },
 ]);
};
showInvalidRepo = () => {
 if (this.noticeKind === 'invalid') return; this.noticeKind = 'invalid';
 this.notice('仓库版本无效：' + (this.remote.head?.repo?.error || '校验失败'), [
  { label: '用网页版修复', action: () => void this.writeResolution('fix-repo') },
 ]);
};
updateSyncStatus = () => {
 const info = classify({ ...this.remote, coordinator: this.remote._coordinator, now: Date.now() }); let label = info.label;
 if (info.kind === 'synced' && info.commit) label += ' · ' + info.commit.slice(0, 7);
 else if (info.kind === 'pending') label += info.online ? ' · 同步程序在线' : ' · 等待同步';
 if (this.remote.head?.repo?.configError) label += ' · config.json 无效，沿用可用配置';
 this.$('sync-state').textContent = this.pendingWorkspace || this.inFlight ? '未保存到云端' : label;
 if (this.noticeKind === 'cloud' || this.noticeKind === 'draft') return;
 if ((this.noticeKind === 'repo' && !info.conflict) || (this.noticeKind === 'invalid' && !info.invalid)) {
  this.noticeKind = ''; this.root.querySelector('.draft-notice')?.remove();
 }
 if (info.conflict) this.showRepoConflict(); else if (info.invalid) this.showInvalidRepo();
 else if (this.remote.kept && !this.noticeKind) this.notice('最近被替换的版本仍可下载。', [{ label: '下载被替换的版本', action: () => void this.downloadKept() }]);
};
downloadKept = async () => {
 const kept = this.remote.kept; if (!kept) return;
 const payload = await decodeState({ ...this.remote, live: { ...kept, base: '', at: kept.at, by: 'repo' } });
 if (payload) this.download('outline-kept.json', { schema_version: '7.0', format: 'storylines-workspace', plot_data: payload.plot_data, plan: payload.plan });
};
}
