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
import { viewStore, OUTLINE_ARCHIVED } from './view-state.js';
import { editorDrafts } from './editor-drafts.js';
import { searchInput } from '../../archive/input.ts';
import { updateLayers } from './layers.ts';
import { invalidateToastAction } from '../../archive/ui.ts';
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
    this.report = (text, error = false) => { if (error) { this.$('status').textContent = text; this.$('status').classList.add('error'); } else host.toast(text); };
    this.editors = editorDrafts(draftKey + ':editors', error => this.report('草稿未能保存在此浏览器：' + error.message, true));
    this.UI.drafts = this.editors.values;
    this.model = createOutlineModel(payload.plot_data, payload.plan, { render: this.render, save: this.saveWorkspace, warning: this.localSaveFailed, changed: this.modelChanged });
    this.drag = mountDrag(root.querySelector('.outline-view'));
    this.drag.onDrop = ({ kind, id, zone, index }) => this.attempt(() => {
      if (kind === 'rank') this.model.moveRank(id, index);
      else if (zone.zone === 'time') this.model.moveInTime(id, zone.cat, this.timeIndex(id, zone.cat, index, zone.line), zone.line);
      else if (zone.zone === 'beat') {
        // The Beat list shows only unwritten cards; turn the drop spot into a place among all of the Beat's cards.
        const m = this.model, ids = m.placedList().filter(p => p.beat_id === zone.beat).map(p => p.unit_id);
        const v = zone.pillar ? presentation(m, this.UI) : null;
        const shown = x => m.unitMap[x].status !== 'WRITTEN' && (!v || v.partsOf(v.lineOf(m.unitMap[x].storyline_group_id))[0] === zone.pillar);
        const at = zone.pillar || !this.UI.open.has('group-planned:' + m.data.beats.find(b => b.beat_id === zone.beat)?.act)
          ? fullTimeIndex(ids, id, shown, index) : Infinity;
        m.placeAt(id, zone.beat, at);
      }
      else if (zone.zone === 'line') this.moveToLine(id, zone.line);
    });
    this.wire(); this.wireFiles();
    this.online = () => { if (this.pendingWorkspace) { this.retrySave = false; this.queueCloudSave(); } };
    window.addEventListener('online', this.online);
    try { const saved = this.draft.load(); if (saved) this.loadSavedDraft(saved); }
    catch (error) { this.noticeKind = 'draft'; this.notice('本地草稿未能读取，原始草稿仍保留。'); this.report(error.message, true); }
    this.restoreView();
    this.unsubscribe = subscribe(host.householdRef, host.slug, state => { this.remoteUpdates = this.remoteUpdates.then(() => this.receiveRemote(state)); }, error => this.report(error.message, true));
    this.render();
  }
  // With placed/written cards hidden, the drop index counts shown cards only.
  timeIndex = (id, cat, index, line) => {
    const m = this.model, ids = m.storyMap[line && m.storyMap[line] ? line : m.unitMap[id].storyline_group_id].time_order[cat];
    return this.UI.onlyUnplaced ? fullTimeIndex(ids, id, x => m.unitMap[x].status !== 'WRITTEN' && !m.used(x), index) : index;
  };
  get activeBeat() { return this.model.activeBeat; }
  get editing() { return this.UI.editing; }
  get composer() { return this.UI.composing; }
  finishInline = () => {
    const form = this.root.querySelector('[data-form="card"], [data-form="new"]');
    if (form) { if (form.elements.text.value.trim()) this.editors.capture(form); else this.editors.drop(form.dataset.draft); }
    return true;
  };
  finish = () => this.finishInline();
  attempt = fn => { try { fn(); } catch (error) { this.report(error.message, true); } };
  moveToLine = (id, line) => {
    if (this.model.unitMap[id].storyline_group_id === line) return;
    this.UI.picker = false; this.undoToast(`已转到「${this.model.storyMap[line].title}」`, () => this.model.moveToLine(id, line));
  };
  deleteLine = id => {
    const title = this.model.storyMap[id].title;
    this.undoToast(`已删除故事线「${title}」`, () => this.model.deleteLine(id)); this.UI.dialog = null; this.render();
  };
  modelChanged = () => {
    invalidateToastAction();
    for (const key of Object.keys(this.editors.values)) {
      if (key.startsWith('card:') && !this.model.unitMap[key.slice(5)]) this.editors.drop(key);
    }
  };
  undoToast = (text, operation) => {
    const before = this.model.undoHistory.at(-1);
    operation();
    const prior = this.model.undoHistory.at(-1);
    if (!prior || before === prior) return;
    this.host.toast(text, { label: '撤销', action: () => {
      if (this.disposed || this.model.undoHistory.at(-1) !== prior) return;
      this.model.undo();
    } });
  };
  render = () => {
    if (this.ime) { this.renderPending = true; return; }
    this.renderPending = false;
    const u = this.UI, root = this.root;
    if (!this.model.storyMap[u.line]) u.line = this.model.data.storyline_groups[0].id;
    u.beat = this.model.activeBeat;
    const scroll = [...root.querySelectorAll('[data-keep]')].map(el => [el.dataset.keep, el.scrollTop]);
    const focused = document.activeElement, search = root.querySelector('[data-input="search"]');
    const picker = root.querySelector('.picker-strip');
    const draft = focused?.closest('[data-draft]')?.dataset.draft, name = focused?.name;
    const selection = focused?.selectionStart, end = focused?.selectionEnd;
    const v = presentation(this.model, u);
    root.querySelector('[data-bar]').innerHTML = v.renderBar();
    root.querySelector('[data-workbench]').innerHTML = u.tab === 'story' ? v.renderStory() : v.renderOutline();
    const nextPicker = root.querySelector('.picker-strip');
    if (picker && nextPicker) {
      picker.setAttribute('aria-expanded', String(u.picker));
      picker.querySelector('.strip-name').textContent = nextPicker.querySelector('.strip-name').textContent;
      nextPicker.replaceWith(picker);
    }
    const nextSearch = root.querySelector('[data-input="search"]');
    if (search && nextSearch) nextSearch.replaceWith(search);
    else if (nextSearch) {
      this.searchBinding?.dispose();
      this.searchBinding = searchInput(nextSearch, this.renderSearch);
    }
    updateLayers(root.querySelector('[data-layer]'), (u.rank ? v.rankPanel() : '') + (u.dialog ? v.lineDialog() : ''));
    for (const [key, top] of scroll) root.querySelector(`[data-keep="${key}"]`)?.scrollTo(0, top);
    if (this.scroll && !this.viewShown) { this.viewShown = true; for (const [key, top] of Object.entries(this.scroll)) root.querySelector(`[data-keep="${CSS.escape(key)}"]`)?.scrollTo(0, top); }
    const field = draft ? root.querySelector(`[data-draft="${CSS.escape(draft)}"] [name="${name}"]`) : focused === search ? search : null;
    if (field) { field.focus({ preventScroll: true }); if (selection != null) field.setSelectionRange(selection, end); }
    // Picking a storyline or a main character scrolls the stacked storylines to it (a whole section opens at its top).
    if (this.scrollLine && u.tab === 'story') {
      const box = root.querySelector('.self-lines'), block = root.querySelector(`[data-line-block="${CSS.escape(this.scrollLine)}"]`);
      if (box && block) box.scrollTo(0, this.scrollTop ? 0 : block.offsetTop - box.offsetTop);
    }
    this.scrollLine = null; this.scrollTop = false;
    this.updateSyncStatus(); this.queueView();
  };
  renderSearch = () => {
    this.UI.search = this.root.querySelector('[data-input="search"]')?.value || '';
    const library = this.root.querySelector('.library'); if (!library) return;
    const next = document.createElement('div'); next.innerHTML = presentation(this.model, this.UI).library();
    for (const selector of ['.lib-head', '.lib-body']) library.querySelector(selector).replaceChildren(...next.querySelector(selector).childNodes);
  };
  // Reopen at the tab, storyline, Beat, library groups, filters and scroll left last time in this browser.
  restoreView = () => {
    this.views = viewStore(this.draftKey + ':view');
    const { beat, scroll = {}, y = 0, ...ui } = this.views.load(this.model);
    Object.assign(this.UI, ui); if (OUTLINE_ARCHIVED) this.UI.tab = 'story'; if (beat) this.model.activeBeat = beat;
    this.scroll = scroll; this.y = y; this.viewTimer = null;
    this.onScroll = e => {
      const key = e.target.dataset?.keep;
      if (key) this.scroll[key] = e.target.scrollTop;
      else if (e.target === document && !this.root.closest('[hidden]')) this.y = window.scrollY;
      else return;
      this.queueView();
    };
    this.root.addEventListener('scroll', this.onScroll, true); document.addEventListener('scroll', this.onScroll);
    this.flushView = () => {
      if (this.viewTimer) { clearTimeout(this.viewTimer); this.viewTimer = null; }
      const u = this.UI; this.views.save({ tab: u.tab, line: u.line, beat: this.model.activeBeat, open: u.open, filters: u.filters, onlyUnplaced: u.onlyUnplaced, scroll: this.scroll, y: this.y });
    };
    window.addEventListener('pagehide', this.flushView);
  };
  get initialY() { return this.y; }
  queueView = () => { if (this.views && !this.viewTimer) this.viewTimer = setTimeout(this.flushView, 300); };
  action = t => {
    const u = this.UI, id = t.dataset.id, m = this.model;
    switch (t.dataset.act) {
      case 'tab': this.finishInline(); u.tab = OUTLINE_ARCHIVED ? 'story' : t.dataset.tab; u.picker = false; break;
      case 'undo': m.undo(); return;
      case 'toggle-rank': u.rank = !u.rank; break;
      case 'toggle-picker': u.picker = !u.picker; break;
      case 'select-line': this.finishInline(); u.line = id; u.picker = false; u.editing = u.composing = null; this.scrollLine = id; break;
      case 'select-section': {
        const first = presentation(m, u).sections().find(s => s.name === t.dataset.name)?.lines[0];
        if (first) { this.finishInline(); u.line = first.id; u.picker = false; u.editing = u.composing = null; this.scrollLine = first.id; this.scrollTop = true; }
        break;
      }
      case 'new-line': u.dialog = { id: null, title: '', parts: [], lead: '' }; u.picker = false; break;
      case 'edit-line': { const l = m.storyMap[id]; u.dialog = { id, title: l.title, parts: [...l.participants], lead: l.lead_participant }; break; }
      case 'open-line': u.tab = 'story'; u.line = id; this.scrollLine = id; break;
      case 'close-dialog': u.dialog = null; break;
      case 'add-part': this.addPart(); break;
      case 'drop-part':
        u.dialog.parts = u.dialog.parts.filter(p => p !== t.dataset.name);
        if (!u.dialog.parts.includes(u.dialog.lead)) u.dialog.lead = u.dialog.parts[0] || '';
        break;
      case 'edit-card': this.finishInline(); u.editing = id; u.editingPane = t.dataset.editPane || 'right'; u.composing = null; break;
      case 'delete-card': if (u.editing === id) u.editing = null; this.undoToast('已删除卡片', () => m.deleteCard(id)); return;
      case 'delete-line': this.deleteLine(id); return;
      case 'cancel-edit': this.editors.drop('card:' + u.editing); u.editing = null; break;
      case 'compose': this.finishInline(); if (t.dataset.line) u.line = t.dataset.line; u.composing = t.dataset.cat; break;
      case 'cancel-compose': this.editors.drop(`new:${u.line}:${u.composing}`); u.composing = null; break;
      case 'choose-beat': m.activeBeat = id; break;
      case 'unplace': {
        const unit = m.unitMap[id], line = unit.storyline_group_id, written = unit.status === 'WRITTEN';
        this.finishInline(); if (u.editing === id) u.editing = null;
        u.filters.add(written ? 'written' : 'unplaced'); u.open.add('lib:' + line);
        if (u.tab === 'story') {
          u.line = line; u.picker = false; this.scrollLine = line;
          if (written) u.onlyUnplaced = false;
        } else if (u.search) {
          const v = presentation(m, u);
          if (!v.matches(v.S.cards[id], v.lineOf(line), u.search.trim().toLowerCase())) {
            u.search = ''; const input = this.root.querySelector('[data-input="search"]'); if (input) input.value = '';
          }
        }
        this.undoToast('已移出大纲，退回故事线', () => m.removeUnit(id)); return;
      }
      case 'pick': this.undoToast('已选入当前分段', () => m.placeInCell(id, m.activeBeat, m.unitMap[id].category)); return;
      case 'toggle-written': {
        const written = m.unitMap[id].status !== 'WRITTEN';
        u.filters.add(written ? 'written' : m.used(id) ? 'placed' : 'unplaced');
        this.undoToast(written ? '已标为已写' : '已改回未写', () => m.setWritten(id, written)); return;
      }
      case 'toggle-unplaced': u.onlyUnplaced = !u.onlyUnplaced; break;
      case 'toggle-row': if (!u.open.delete('w:' + id)) u.open.add('w:' + id); break;
      case 'toggle-planned-group': {
        this.finishInline();
        const key = 'group-planned:' + t.dataset.actNo;
        if (!u.open.delete(key)) {
          u.open.add(key);
          const beats = m.data.beats.filter(b => String(b.act) === t.dataset.actNo).map(b => b.beat_id);
          for (const k of u.open) if (beats.some(b => k.startsWith('planned-shut:' + b + ':'))) u.open.delete(k);
        }
        break;
      }
      case 'toggle-planned-pillar': {
        this.finishInline();
        const key = t.dataset.keyName;
        if (!u.open.delete(key)) u.open.add(key);
        break;
      }
      case 'toggle-part': {
        const a = t.dataset.actNo, v = presentation(m, u), key = (v.partState(a).done ? 'part-open:' : 'part-shut:') + a;
        if (!u.open.delete(key)) u.open.add(key); break;
      }
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
      if (!value('text').trim()) { this.editors.drop(form.dataset.draft); u.editing = null; this.render(); return; }
      this.model.editText(form.dataset.id, value('text'), value('details').split('\n').map(s => s.trim()).filter(Boolean));
      this.editors.drop(form.dataset.draft); u.editing = null; this.render();
    } else if (form.dataset.form === 'new') {
      if (!value('text').trim()) return;
      this.editors.drop(form.dataset.draft); u.composing = null; this.model.addCard(u.line, form.dataset.cat, value('text'));
    } else if (form.dataset.form === 'line') {
      const d = u.dialog; if (!value('title').trim() || !d.parts.length) return;
      u.line = this.model.saveLine(d.id, value('title'), d.parts, d.lead); u.dialog = null; this.render();
    }
  };
  wire = () => {
    this.root.addEventListener('compositionstart', () => { this.ime = true; });
    this.root.addEventListener('compositionend', e => {
      this.ime = false; const form = e.target.closest('[data-draft]'); if (form) this.editors.capture(form);
      if (this.renderPending) setTimeout(() => { if (!this.disposed) this.render(); }, 0);
    });
    this.root.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (t) { e.preventDefault(); this.attempt(() => this.action(t)); }
      else if (this.UI.picker && !e.target.closest('.picker')) { this.UI.picker = false; this.render(); }
    });
    this.root.addEventListener('submit', e => { if (e.target.dataset.form) { e.preventDefault(); if (!this.ime) this.attempt(() => this.submit(e.target)); } });
    this.root.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.change === 'choose-beat') { this.model.activeBeat = t.value; this.render(); }
      if (t.name === 'lead') this.UI.dialog.lead = t.value;
      if (t.dataset.change === 'move-line' && t.value) this.attempt(() => this.moveToLine(t.dataset.id, t.value));
      if (t.dataset.change === 'move-beat' && t.value) this.attempt(() => this.model.placeInCell(t.dataset.id, t.value, this.model.unitMap[t.dataset.id].category));
    });
    this.root.addEventListener('input', e => {
      const t = e.target;
      const form = t.closest('[data-draft]'); if (form) this.editors.capture(form);
      if (t.dataset.input === 'line-title') {
        this.UI.dialog.title = t.value; this.$('line-preview').textContent = presentation(this.model, this.UI).linePreview(this.UI.dialog);
        this.$('line-save').disabled = !(t.value.trim() && this.UI.dialog.parts.length);
      }
      if (t.dataset.input === 'beat-note') this.model.setBeatNote(t.value);
    });
    this.root.addEventListener('keydown', e => {
      if (e.isComposing || this.ime || e.keyCode === 229) return;
      if (e.key === 'Enter' && e.target.name === 'part') { e.preventDefault(); this.addPart(); this.render(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input,textarea')) { e.preventDefault(); this.model.undo(); }
      if (e.key === 'Escape' && !this.drag.active()) {
        const u = this.UI;
        if (u.dialog) u.dialog = null; else if (u.rank) u.rank = false; else if (u.picker) u.picker = false;
        else { this.finishInline(); u.editing = u.composing = null; }
        e.preventDefault(); this.render();
      }
    });
    this.root.addEventListener('toggle', e => { const key = e.target.dataset?.key; if (key) { e.target.open && !e.target.hasAttribute('data-fold-closed') ? this.UI.open.add(key) : this.UI.open.delete(key); this.queueView(); } }, true);
    this.root.addEventListener('disclosure-toggle', e => { const key = e.target.dataset.key; if (key) { e.detail ? this.UI.open.add(key) : this.UI.open.delete(key); this.queueView(); } });
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
          this.undoToast('已导入 ' + file.name, () => this.model['import' + kind[0].toUpperCase() + kind.slice(1)](raw)); this.model.saveLocal(); this.render();
        } catch (error) { this.report('导入失败：' + error.message, true); } finally { e.target.value = ''; }
      });
    }
    on('sync-state', () => { if (this.localSaveError) this.model.saveLocal(); else if (this.retrySave) { this.retrySave = false; void this.flushCloudSave(); } });
    on('download-local', () => this.download('outline-local-draft.json', this.model.exportWorkspace()));
    on('overwrite-local', () => void this.writeResolution('use-local'));
    on('keep-web', () => void this.writeResolution('keep-web'));
    on('download-kept', () => void this.downloadKept());
    on('clear-beat', () => this.undoToast('已清空当前分段', () => this.model.clear()));
    on('reset-all', () => this.undoToast('已清空编排', () => this.model.clear(true)));
    on('restore-starter', () => {
      const s = this.payload.starter; if (!s) return;
      this.undoToast('已恢复仓库预排', () => this.model.importWorkspace({ plot_data: s.plot_data, plan: s.plan })); this.keepPrevious = true;
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
    for (const item of actions) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = item.label; b.onclick = item.action; node.append(b); }
    this.root.prepend(node);
  };
  dispose = () => {
    this.searchBinding?.dispose();
    this.disposed = true; this.manualSync.dispose(); this.drag.dispose(); this.unsubscribe?.(); window.removeEventListener('online', this.online);
    this.flushView(); window.removeEventListener('pagehide', this.flushView); document.removeEventListener('scroll', this.onScroll);
    if (this.cloudSaveTimer) clearTimeout(this.cloudSaveTimer); this.root.replaceChildren();
  };
}
