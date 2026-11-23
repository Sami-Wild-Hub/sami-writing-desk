// One mounted storyline workbench; both tabs edit the same cloud-backed model.
import { createOutlineModel } from './model.js';
import { OutlineCloud } from './cloud-controller.js';
import { outlineFrame } from './frame.ts';
import { presentation } from './presentation.js';
import { draftStore } from './draft.js';
import { mountDrag } from './drag.js';
import { completePlan, completeWorkspace } from './workspace.js';
import { subscribe } from './sync.ts';
import { mountManualSync } from './manual-sync.js';
import { fullTimeIndex } from './ordering.js';
export const mountOutline = (root, payload, draftKey, host) => new OutlinePanel(root, payload, draftKey, host);
class OutlinePanel extends OutlineCloud {
  constructor(root, payload, draftKey, host) {
    super(); Object.assign(this, { root, payload, host, draftKey, remote: payload.sync, uid: host.uid, config: payload.config });
    this.localDirty = false; this.pendingWorkspace = null; this.cloudSaveTimer = null; this.pendingSince = 0;
    this.inFlight = null; this.remoteUpdates = Promise.resolve(); this.keepPrevious = false; this.noticeKind = ''; this.disposed = false;
    root.innerHTML = outlineFrame;
    this.manualSync = mountManualSync(root.querySelector('.outline-view'));
    this.$ = id => root.querySelector(`[id="${id}"]`);
    root.querySelector('.outline-shell-head').append(host.sideHead());
    this.UI = { tab: 'story', line: payload.config.defaultStorylineId, beat: payload.plot_data.beats[0].beat_id, picker: false, rank: false, dialog: null, editing: null, composing: null, search: '', open: new Set(), filters: new Set(['unplaced']), onlyUnplaced: true };
    this.draft = draftStore(draftKey, this.cloudRevision());
    this.report = (text, error = false) => { this.$('status').textContent = text; this.$('status').classList.toggle('error', error); };
    this.model = createOutlineModel(payload.plot_data, payload.plan, { render: this.render, save: this.saveWorkspace, warning: () => { this.$('autosave-warning').hidden = false; } });
    this.drag = mountDrag(root.querySelector('.outline-view'));
    this.drag.onDrop = ({ kind, id, zone, index }) => this.attempt(() => {
      if (kind === 'rank') this.model.moveRank(id, index);
      else if (zone.zone === 'time') this.model.moveInTime(id, zone.cat, this.timeIndex(id, zone.cat, index));
      else if (zone.zone === 'beat') this.model.placeInCell(id, zone.beat, zone.cat, index);
      else if (zone.zone === 'line') this.moveToLine(id, zone.line);
    });
    this.wire(); this.wireFiles();
    this.online = () => { if (this.pendingWorkspace) { this.retrySave = false; this.queueCloudSave(); } };
    window.addEventListener('online', this.online);
    try { const saved = this.draft.load(); if (saved) this.loadSavedDraft(saved); }
    catch (error) { this.noticeKind = 'draft'; this.notice('本地草稿未能读取，原始草稿仍保留。'); this.report(error.message, true); }
    this.unsubscribe = subscribe(host.householdRef, host.slug, state => { this.remoteUpdates = this.remoteUpdates.then(() => this.receiveRemote(state)); }, error => this.report(error.message, true));
    this.render();
  }
  // With placed/written cards hidden, the drop index counts shown cards only.
  timeIndex = (id, cat, index) => {
    const m = this.model, ids = m.storyMap[m.unitMap[id].storyline_group_id].time_order[cat];
    return this.UI.onlyUnplaced ? fullTimeIndex(ids, id, x => m.unitMap[x].status !== 'WRITTEN' && !m.used(x), index) : index;
  };
  get activeBeat() { return this.model.activeBeat; }
  get editing() { return this.UI.editing; }
  get composer() { return this.UI.composing; }
  finishInline = () => {
    const form = this.root.querySelector('[data-form="card"], [data-form="new"]');
    if (!form) return true;
    if (form.dataset.form === 'new' && !form.elements.text.value.trim()) return true;
    try { this.submit(form); return true; }
    catch (error) { this.report(error.message, true); return false; }
  };
  finish = () => this.finishInline();
  attempt = fn => { try { fn(); } catch (error) { this.report(error.message, true); } };
  moveToLine = (id, line) => {
    if (this.model.unitMap[id].storyline_group_id === line) return;
    this.UI.picker = false; this.model.moveToLine(id, line); this.report(`已转到「${this.model.storyMap[line].title}」，可撤销。`);
  };
  deleteLine = id => {
    const n = this.model.lineCards(id).length, title = this.model.storyMap[id].title;
    if (!confirm(n ? `删除故事线「${title}」和它的 ${n} 张卡？可撤销。` : `删除故事线「${title}」？可撤销。`)) return;
    this.model.deleteLine(id); this.UI.dialog = null; this.render(); this.report(`已删除故事线「${title}」，可撤销。`);
  };
  render = () => {
    const u = this.UI, root = this.root;
    if (!this.model.storyMap[u.line]) u.line = this.model.data.storyline_groups[0].id;
    u.beat = this.model.activeBeat;
    const scroll = [...root.querySelectorAll('[data-keep]')].map(el => [el.dataset.keep, el.scrollTop]);
    const focused = root.querySelector('[data-input="search"]') === document.activeElement ? document.activeElement.selectionStart : null;
    const v = presentation(this.model, u);
    root.querySelector('[data-bar]').innerHTML = v.renderBar();
    root.querySelector('[data-workbench]').innerHTML = u.tab === 'story' ? v.renderStory() : v.renderOutline();
    root.querySelector('[data-layer]').innerHTML = (u.rank ? v.rankPanel() : '') + (u.dialog ? v.lineDialog() : '');
    for (const [key, top] of scroll) root.querySelector(`[data-keep="${key}"]`)?.scrollTo(0, top);
    if (focused !== null) { const input = root.querySelector('[data-input="search"]'); input.focus(); input.setSelectionRange(focused, focused); }
    this.updateSyncStatus();
  };
  action = t => {
    const u = this.UI, id = t.dataset.id, m = this.model;
    switch (t.dataset.act) {
      case 'tab': u.tab = t.dataset.tab; u.picker = false; break;
      case 'undo': m.undo(); return;
      case 'toggle-rank': u.rank = !u.rank; break;
      case 'toggle-picker': u.picker = !u.picker; break;
      case 'select-line': u.line = id; u.picker = false; u.editing = u.composing = null; break;
      case 'new-line': u.dialog = { id: null, title: '', parts: [], lead: '' }; u.picker = false; break;
      case 'edit-line': { const l = m.storyMap[id]; u.dialog = { id, title: l.title, parts: [...l.participants], lead: l.lead_participant }; break; }
      case 'open-line': u.tab = 'story'; u.line = id; break;
      case 'close-dialog': u.dialog = null; break;
      case 'add-part': this.addPart(); break;
      case 'drop-part':
        u.dialog.parts = u.dialog.parts.filter(p => p !== t.dataset.name);
        if (!u.dialog.parts.includes(u.dialog.lead)) u.dialog.lead = u.dialog.parts[0] || '';
        break;
      case 'edit-card': u.editing = id; break;
      case 'delete-card': if (u.editing === id) u.editing = null; m.deleteCard(id); this.report('已删除卡片，可撤销。'); return;
      case 'delete-line': this.deleteLine(id); return;
      case 'cancel-edit': u.editing = null; break;
      case 'compose': u.composing = t.dataset.cat; break;
      case 'cancel-compose': u.composing = null; break;
      case 'choose-beat': m.activeBeat = id; break;
      case 'unplace': u.filters.add(m.unitMap[id].status === 'WRITTEN' ? 'written' : 'unplaced'); u.open.add('lib:' + m.unitMap[id].storyline_group_id); m.removeUnit(id); return;
      case 'pick': m.placeInCell(id, m.activeBeat, m.unitMap[id].category); return;
      case 'toggle-written': {
        const written = m.unitMap[id].status !== 'WRITTEN';
        u.filters.add(written ? 'written' : m.used(id) ? 'placed' : 'unplaced'); m.setWritten(id, written);
        this.report(written ? '已标为已写，可撤销。' : '已改回未写，可撤销。'); return;
      }
      case 'toggle-unplaced': u.onlyUnplaced = !u.onlyUnplaced; break;
      case 'filter': if (!u.filters.delete(t.dataset.filterState)) u.filters.add(t.dataset.filterState); break;
    } this.render();
  };
  addPart = () => {
    const form = this.root.querySelector('[data-form="line"]'), name = form.elements.part.value.trim();
    this.UI.dialog.title = form.elements.title.value;
    if (name && !this.UI.dialog.parts.includes(name)) this.UI.dialog.parts.push(name);
    this.UI.dialog.lead ||= this.UI.dialog.parts[0] || '';
  };
  submit = form => {
    const value = name => form.elements[name]?.value || '', u = this.UI;
    if (form.dataset.form === 'card') {
      this.model.editText(form.dataset.id, value('text'), value('details').split('\n').map(s => s.trim()).filter(Boolean)); u.editing = null; this.render();
    } else if (form.dataset.form === 'new') {
      if (!value('text').trim()) return;
      u.composing = null; this.model.addCard(u.line, form.dataset.cat, value('text'));
    } else if (form.dataset.form === 'line') {
      const d = u.dialog; if (!value('title').trim() || !d.parts.length) return;
      u.line = this.model.saveLine(d.id, value('title'), d.parts, d.lead); u.dialog = null; this.render();
    }
  };
  wire = () => {
    this.root.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (t) { e.preventDefault(); this.attempt(() => this.action(t)); }
      else if (this.UI.picker && !e.target.closest('.picker')) { this.UI.picker = false; this.render(); }
    });
    this.root.addEventListener('submit', e => { if (e.target.dataset.form) { e.preventDefault(); this.attempt(() => this.submit(e.target)); } });
    this.root.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'lead') this.UI.dialog.lead = t.value;
      if (t.dataset.change === 'move-line' && t.value) this.attempt(() => this.moveToLine(t.dataset.id, t.value));
      if (t.dataset.change === 'move-beat' && t.value) this.attempt(() => this.model.placeInCell(t.dataset.id, t.value, this.model.unitMap[t.dataset.id].category));
    });
    this.root.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.input === 'search') { this.UI.search = t.value; this.render(); }
      if (t.dataset.input === 'line-title') {
        this.UI.dialog.title = t.value; this.$('line-preview').textContent = presentation(this.model, this.UI).linePreview(this.UI.dialog);
        this.$('line-save').disabled = !(t.value.trim() && this.UI.dialog.parts.length);
      }
      if (t.dataset.input === 'beat-note') { this.model.state.beat_notes[this.activeBeat] = t.value; this.model.saveLocal(); }
    });
    this.root.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.name === 'part') { e.preventDefault(); this.addPart(); this.render(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input,textarea')) { e.preventDefault(); this.model.undo(); }
      if (e.key === 'Escape' && !this.drag.active()) { Object.assign(this.UI, { dialog: null, picker: false, rank: false, editing: null, composing: null }); this.render(); }
    });
    this.root.addEventListener('toggle', e => { const key = e.target.dataset?.key; if (key) e.target.open ? this.UI.open.add(key) : this.UI.open.delete(key); }, true);
  };
  wireFiles = () => {
    const on = (id, fn) => this.$(id).addEventListener('click', () => this.attempt(fn));
    for (const [id, name, body] of [['export', 'placements.json', this.model.exportPlan], ['export-data', 'plot-data.json', this.model.exportData], ['export-workspace', 'storylines-workspace.json', this.model.exportWorkspace]]) on(id, () => this.download(name, body()));
    for (const kind of ['plan', 'data', 'workspace']) {
      on('trigger-' + kind, () => this.$('import-' + kind).click());
      this.$('import-' + kind).addEventListener('change', async e => {
        const file = e.target.files?.[0]; if (!file) return;
        try {
          let raw = JSON.parse(await file.text()); if (this.disposed) return;
          if (kind === 'workspace') raw = completeWorkspace(raw, this.model.exportPlan());
          if (kind === 'plan') raw = completePlan(raw, this.model.exportPlan());
          this.model['import' + kind[0].toUpperCase() + kind.slice(1)](raw); this.model.saveLocal(); this.render(); this.report('已导入 ' + file.name);
        } catch (error) { this.report('导入失败：' + error.message, true); } finally { e.target.value = ''; }
      });
    }
    on('clear-beat', () => { if (confirm('清空本 Beat？可撤销。')) this.model.clear(); });
    on('reset-all', () => { if (confirm('清空全部编排？可撤销。')) this.model.clear(true); });
    on('restore-starter', () => {
      const s = this.payload.starter; if (!s || !confirm('恢复仓库预排？当前版本保留且可撤销。')) return;
      this.model.importWorkspace({ plot_data: s.plot_data, plan: s.plan }); this.keepPrevious = true;
      this.draft.acceptRevision(this.cloudRevision()); this.model.saveLocal(); this.render();
    });
  };
  download = (filename, body) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1200);
  };
  notice = (text, actions = []) => {
    this.root.querySelector('.draft-notice')?.remove();
    const node = document.createElement('div'); node.className = 'draft-notice'; node.setAttribute('role', 'status'); node.textContent = text;
    if (!actions.length) actions = [{ label: '导出原始草稿', action: () => this.download('outline-local-draft.json', this.draft.raw()) }];
    for (const item of actions) { const b = document.createElement('button'); b.textContent = item.label; b.onclick = item.action; node.append(b); }
    this.root.prepend(node);
  };
  dispose = () => {
    this.disposed = true; this.manualSync.dispose(); this.drag.dispose(); this.unsubscribe?.(); window.removeEventListener('online', this.online);
    if (this.cloudSaveTimer) clearTimeout(this.cloudSaveTimer); this.root.replaceChildren();
  };
}
