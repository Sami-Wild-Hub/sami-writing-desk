// Shared v7 outline state and reversible edits. Reads/Writes: workspace snapshots (v7 JSON).
import { validateData, validatePlan, CATEGORIES } from './validation.js';
import { mismatchMarks } from './ordering.js';
export const clone = value => structuredClone(value);
// Cards show one text: a stored title is joined in front of the content unless the content already starts with it.
export const cardText = u => u.content || u.element_title || '';
export const createOutlineModel = (data, plan, hooks) => new OutlineModel(data, plan, hooks);
class OutlineModel {
  constructor(data, plan, hooks = {}) {
    this.hooks = { render() {}, save() {}, warning() {}, changed() {}, ...hooks };
    this.undoHistory = []; this.load(data, plan); this.activeBeat = this.beatIds[0];
  }
  load(data, plan) {
    validateData(data); validatePlan(data, plan); this.data = clone(data);
    this.state = { ...clone(plan), placements: Object.fromEntries(plan.placements.map(p => [p.unit_id, clone(p)])) }; this.refreshData();
  }
  refreshData = () => {
    this.storyMap = Object.fromEntries(this.data.storyline_groups.map(g => [g.id, g]));
    this.unitMap = Object.fromEntries(this.data.plot_units.map(u => [u.unit_id, u]));
    this.beatIds = this.data.beats.map(b => b.beat_id); this.beatIndex = Object.fromEntries(this.beatIds.map((id, i) => [id, i]));
  };
  visibleUnits = () => {
    const merged = new Set(this.data.plot_units.flatMap(u => u.source_unit_ids || []));
    return this.data.plot_units.filter(u => !merged.has(u.unit_id));
  };
  used = id => Boolean(this.state.placements[id]);
  placedList = () => Object.values(this.state.placements).sort((a, b) => this.beatIndex[a.beat_id] - this.beatIndex[b.beat_id] || a.order - b.order);
  savedCount = () => this.placedList().length;
  exportData = () => clone(this.data);
  exportPlan = () => ({ ...clone(this.state), placements: clone(this.placedList()) });
  exportWorkspace = () => ({ schema_version: '7.0', format: 'storylines-workspace', plot_data: this.exportData(), plan: this.exportPlan(), active_beat: this.activeBeat });
  saveLocal = () => { try { this.hooks.save(this.exportWorkspace()); return true; } catch (error) { this.hooks.warning(error); return false; } };
  change = fn => {
    const before = this.exportWorkspace();
    try { fn(); validateData(this.data); validatePlan(this.data, this.exportPlan()); }
    catch (error) { this.load(before.plot_data, before.plan); throw error; }
    if (JSON.stringify(before) === JSON.stringify(this.exportWorkspace())) return;
    this.undoHistory.push(before); if (this.undoHistory.length > 50) this.undoHistory.shift();
    this.refreshData(); this.hooks.changed(); this.saveLocal(); this.hooks.render();
  };
  setBeatNote = text => {
    if ((this.state.beat_notes[this.activeBeat] || '') === text) return;
    this.state.beat_notes[this.activeBeat] = text; this.hooks.changed(); this.saveLocal();
  };
  setCategory = (id, category) => {
    if (!CATEGORIES.includes(category)) throw Error('未知 category');
    const unit = this.unitMap[id], columns = this.storyMap[unit.storyline_group_id].time_order;
    if (unit.category === category) return;
    columns[unit.category] = columns[unit.category].filter(x => x !== id); unit.category = category; columns[category].push(id);
  };
  // line: drop into another storyline's column (story tab shows a whole section); one undo step.
  moveInTime = (id, category, index, line) => this.change(() => {
    const unit = this.unitMap[id];
    if (line && this.storyMap[line] && unit.storyline_group_id !== line) {
      const from = this.storyMap[unit.storyline_group_id].time_order;
      from[unit.category] = from[unit.category].filter(x => x !== id); this.storyMap[line].time_order[unit.category].push(id); unit.storyline_group_id = line;
    }
    this.setCategory(id, category);
    const ids = this.storyMap[this.unitMap[id].storyline_group_id].time_order[category];
    ids.splice(ids.indexOf(id), 1); ids.splice(index, 0, id);
  });
  placeInCell = (id, beat, category, index = Infinity) => this.change(() => {
    if (!this.beatIds.includes(beat)) throw Error('未知 Beat');
    this.setCategory(id, category); delete this.state.placements[id];
    const unit = this.unitMap[id], rows = this.placedList().filter(p => p.beat_id === beat);
    const mates = rows.filter(p => this.unitMap[p.unit_id].storyline_group_id === unit.storyline_group_id && this.unitMap[p.unit_id].category === category);
    const at = index < mates.length ? rows.indexOf(mates[index]) : mates.length ? rows.indexOf(mates.at(-1)) + 1 : rows.length;
    rows.splice(at, 0, { unit_id: id, beat_id: beat, order: 0 });
    rows.forEach((p, i) => { this.state.placements[p.unit_id] = { ...p, order: (i + 1) * 10 }; });
  });
  // Story tab: one reveal list per Beat across all storylines; index counts every other card already in that Beat.
  placeAt = (id, beat, index = Infinity) => this.change(() => {
    if (!this.beatIds.includes(beat)) throw Error('未知 Beat');
    delete this.state.placements[id];
    const rows = this.placedList().filter(p => p.beat_id === beat);
    rows.splice(Math.min(index, rows.length), 0, { unit_id: id, beat_id: beat, order: 0 });
    rows.forEach((p, i) => { this.state.placements[p.unit_id] = { ...p, order: (i + 1) * 10 }; });
  });
  removeUnit = id => this.change(() => { delete this.state.placements[id]; });
  freshId = (prefix, existing) => { let n = 1; while (existing.has(prefix + n)) n++; return prefix + n; };
  addCard = (line, category, content) => {
    if (!content.trim()) throw Error('卡片不能为空');
    const id = this.freshId('N', new Set(Object.keys(this.unitMap)));
    this.change(() => {
      this.data.plot_units.push({ unit_id: id, storyline_group_id: line, category, element_title: '', content: content.trim(), details: [], source_unit_ids: [], source_refs: '', status: 'PLANNED', is_editorial_element: true, is_custom: true });
      this.storyMap[line].time_order[category].push(id);
    }); return id;
  };
  editCard = (id, patch) => this.change(() => { Object.assign(this.unitMap[id], patch); });
  // Manual 已写 mark. Clearing it returns the card to PLANNED, so 已排/未排 again follows its Beat placement.
  setWritten = (id, written) => this.change(() => {
    const unit = this.unitMap[id];
    if (written) unit.status = 'WRITTEN'; else if (unit.status === 'WRITTEN') unit.status = 'PLANNED';
  });
  // The edited text replaces both stored title and content.
  editText = (id, text, details) => {
    if (!text.trim()) throw Error('卡片不能为空');
    this.editCard(id, { content: text.trim(), details, ...(this.unitMap[id].element_title ? { element_title: '' } : {}) });
  };
  dropCard = id => {
    const unit = this.unitMap[id], gone = new Set([id, ...(unit.source_unit_ids || [])]), col = this.storyMap[unit.storyline_group_id].time_order;
    col[unit.category] = col[unit.category].filter(x => x !== id); delete this.state.placements[id];
    this.data.plot_units = this.data.plot_units.filter(u => !gone.has(u.unit_id));
  };
  deleteCard = id => this.change(() => this.dropCard(id));
  lineCards = line => CATEGORIES.flatMap(c => this.storyMap[line].time_order[c]);
  // Cards go with their line; merged originals kept here for another line's card follow that card.
  deleteLine = line => this.change(() => {
    if (this.data.storyline_groups.length < 2) throw Error('至少保留一条故事线');
    this.lineCards(line).forEach(this.dropCard);
    for (const owner of this.data.plot_units) for (const src of owner.source_unit_ids || []) {
      const u = this.data.plot_units.find(x => x.unit_id === src);
      if (u.storyline_group_id === line) u.storyline_group_id = owner.storyline_group_id;
    }
    this.data.storyline_groups = this.data.storyline_groups.filter(g => g.id !== line);
  });
  // Another line takes the card at the end of the same category; its Beat placement and reveal position stay.
  moveToLine = (id, line) => this.change(() => {
    const unit = this.unitMap[id], from = this.storyMap[unit.storyline_group_id].time_order, to = this.storyMap[line].time_order;
    if (unit.storyline_group_id === line) return;
    from[unit.category] = from[unit.category].filter(x => x !== id); to[unit.category].push(id); unit.storyline_group_id = line;
  });
  saveLine = (id, title, participants, lead) => {
    if (!title.trim() || !participants.length || participants.some(p => !p.trim())) throw Error('需要标题和至少一个参与者');
    id ||= this.freshId('L', new Set(Object.keys(this.storyMap)));
    this.change(() => {
      for (const name of participants) if (!this.data.participant_order.includes(name)) this.data.participant_order.push(name);
      const group = this.storyMap[id];
      const chosen = lead ?? (participants.includes(group?.lead_participant) ? group.lead_participant : participants[0]);
      if (!participants.includes(chosen)) throw Error('标志性参与者必须是本线参与者');
      const fields = { title: title.trim(), participants: [...new Set(participants)], lead_participant: chosen };
      if (group) Object.assign(group, fields);
      else this.data.storyline_groups.push({ id, ...fields, time_order: Object.fromEntries(CATEGORIES.map(c => [c, []])) });
    }); return id;
  };
  moveRank = (name, index) => this.change(() => {
    this.data.participant_order = this.data.participant_order.filter(p => p !== name); this.data.participant_order.splice(index, 0, name);
  });
  marks = () => mismatchMarks(this.data, this.exportPlan());
  importWorkspace = (raw, remember = true) => {
    validateData(raw.plot_data); validatePlan(raw.plot_data, raw.plan);
    const before = this.exportWorkspace();
    this.load(raw.plot_data, raw.plan); this.activeBeat = this.beatIds.includes(raw.active_beat) ? raw.active_beat : this.beatIds[0];
    if (JSON.stringify(before) === JSON.stringify(this.exportWorkspace())) return;
    if (remember) { this.undoHistory.push(before); if (this.undoHistory.length > 50) this.undoHistory.shift(); }
    this.hooks.changed();
  };
  importData = data => this.importWorkspace({ ...this.exportWorkspace(), plot_data: data });
  importPlan = plan => this.importWorkspace({ ...this.exportWorkspace(), plan });
  undo = () => { const prior = this.undoHistory.pop(); if (!prior) return; this.importWorkspace(prior, false); this.saveLocal(); this.hooks.render(); };
  clear = (all = false) => this.change(() => {
    for (const p of this.placedList()) if (all || p.beat_id === this.activeBeat) delete this.state.placements[p.unit_id];
    if (all) this.state.beat_notes = {};
  });
}
