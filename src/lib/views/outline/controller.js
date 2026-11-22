// Scoped DOM interactions for the outline; templates and model remain independent.
import { inlineEditorHtml, groupComposerHtml, unitComposerHtml } from './forms.js';
import { createOutlineModel } from './model.js';
import { outlineTemplates } from './templates.js';
import { outlineFrame } from './frame.ts';
import { draftStore } from './draft.js';
export function mountOutline(root,payload,draftKey,host) { return new OutlinePanel(root,payload,draftKey,host); }

class OutlinePanel {
constructor(root,payload,draftKey,host) {
this.root = root;
this.payload = payload;
this.draftKey = draftKey;
this.host = host;
this.root.innerHTML = outlineFrame;
this.root.querySelector('.side').prepend(this.host.sideHead());
this.$ = id => this.root.querySelector(`[id="${id}"]`);
this.config = this.payload.config;
this.editing = null;
this.composer = null;
this.showOriginal = false;
this.disposed = false;
this.searchText = { RELATIONSHIP: '', EVENT: '' };
this.draft = draftStore(this.draftKey, this.payload.revision);
this.report = (message, error = false) => { this.$('status').textContent = message; this.$('status').classList.toggle('error', error); };
this.model = createOutlineModel(this.payload.plot_data, this.payload.plan, {
  render: this.render, report: this.report, save: workspace => this.draft.save(workspace), confirm: message => window.confirm(message),
  warning: () => { this.$('autosave-warning').hidden = false; },
 });
this.data = undefined;
this.state = undefined;
this.storyMap = undefined;
this.unitMap = undefined;
this.activeBeat = undefined;
this.templates = undefined;
this.openGroups = this.model.openGroups;
this.kindOf = this.model.kindOf;
this.used = this.model.used;
this.placedList = this.model.placedList;
this.savedCount = this.model.savedCount;
this.snapshot = this.model.snapshot;
this.saveLocal = this.model.saveLocal;
this.createStoryline = this.model.createStoryline;
this.createUnit = this.model.createUnit;
this.deleteNewUnit = this.model.deleteNewUnit;
this.deleteNewGroup = this.model.deleteNewGroup;
this.assign = this.model.assign;
this.moveUnit = this.model.moveUnit;
this.removeUnit = this.model.removeUnit;
this.reorder = this.model.reorder;
this.switchKind = this.model.switchKind;
this.switchEra = this.model.switchEra;
this.wireDelegated();
this.wireActions();
this.sync();
try {
  const saved = this.draft.load();
  if (saved) { this.model.importWorkspace(saved.workspace, false); this.report('已恢复本地草稿。'); }
  if (saved?.changed) this.notice('仓库预排已更新；当前保留本地草稿。请先导出，再决定是否恢复仓库预排。');
 } catch (error) { this.notice('本地草稿未能读取，原始草稿仍保留。可导出备份后恢复仓库预排。'); this.report(error.message, true); }
this.render();
}
sync = () => {
  ({ data: this.data, state: this.state, storyMap: this.storyMap, unitMap: this.unitMap, activeBeat: this.activeBeat } = this.model);
  this.templates = outlineTemplates(this.root, this.model, { openGroups: this.openGroups, searchText: this.searchText, showOriginal: this.showOriginal }, this.config);
 };
render = () => {
  this.discardComposer(); this.sync(); this.model.refreshDerived();
  this.templates.renderNav();
  this.$('spine-selected').innerHTML = this.templates.renderSelected('RELATIONSHIP', 'spine');
  this.$('rel-selected').innerHTML = this.templates.renderSelected('RELATIONSHIP', 'support');
  this.$('event-selected').innerHTML = this.templates.renderSelected('EVENT');
  this.$('rel-groups').innerHTML = this.templates.renderLibrary('RELATIONSHIP');
  this.$('event-groups').innerHTML = this.templates.renderLibrary('EVENT');
  this.templates.renderPending(); this.templates.renderCounts();
  this.root.querySelector('[data-original-count]').textContent = String(this.data.plot_units.filter(u => !u.is_custom).length);
  this.root.querySelector('[data-storyline-count]').textContent = String(this.data.storylines.filter(s => !s.is_custom).length);
  this.root.querySelector('[data-spine-title]').textContent = this.config.spineTitle;
 };
editValue = (field,id) => {if(field==='unit')return this.unitMap[id]?.content;if(field==='element-title')return this.unitMap[id]?.element_title;if(field==='element-details')return (this.unitMap[id]?.details||[]).join('\n');if(field==='group-title')return this.storyMap[id]?.title;if(field==='group-summary')return this.storyMap[id]?.summary;if(field==='beat-title')return this.data.beats.find(x=>x.beat_id===id)?.title||'';return null};
beginInline = (el) => {if(this.editing&&this.editing.element===el)return;if(this.editing&&!this.finishInline(true))return;this.discardComposer();
 const field=el.dataset.editField,id=el.dataset.id,old=this.editValue(field,id);if(old==null)return;
 if(el.closest('details.group'))this.openGroups[el.closest('details.group').dataset.kind].add(el.closest('details.group').dataset.group);
 const host=document.createElement('span');host.className='inline-editor';host.innerHTML=inlineEditorHtml(field);
 const ctl=host.querySelector('input,textarea');ctl.value=old;el.replaceWith(host);this.editing={element:el,host,field,id,old,ctl};ctl.focus();if(ctl.select)ctl.select();
};
finishInline = (shouldSave) => {if(!this.editing)return true;const ed=this.editing,val=ed.ctl.value.trim();
 if(shouldSave&&!val&&!['group-summary','beat-title','element-details'].includes(ed.field)){this.report('内容或故事线名称不能为空。',true);ed.ctl.focus();return false}
 this.editing=null;
 if(shouldSave&&val!==ed.old){this.snapshot();if(ed.field==='unit'){const u=this.unitMap[ed.id];if(!u.original_content&&!u.is_custom)u.original_content=ed.old;u.content=val}
  else if(ed.field==='element-title'){this.unitMap[ed.id].element_title=val}
   else if(ed.field==='element-details'){this.unitMap[ed.id].details=val.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)}
   else if(ed.field==='group-title'){this.storyMap[ed.id].title=val;for(const s of this.data.storylines)if(s.is_custom&&s.storyline_group_id===ed.id)s.title=val}
  else if(ed.field==='group-summary'){this.storyMap[ed.id].summary=val;for(const s of this.data.storylines)if(s.is_custom&&s.storyline_group_id===ed.id)s.summary=val}
  else if(ed.field==='beat-title'){this.data.beats.find(b=>b.beat_id===ed.id).title=val}
  this.saveLocal();this.render();this.report('已保存文字修改（本地草稿）。');
 }else this.render();
 return true;
};
discardComposer = () => {if(this.composer){this.composer.remove();this.composer=null}};
showGroupComposer = (kind) => {if(this.editing&&!this.finishInline(true))return;this.discardComposer();const host=this.$((kind==='RELATIONSHIP'?'rel':'event')+'-available');const form=document.createElement('form');form.className='composer';form.dataset.composerType='storyline';form.dataset.kind=kind;
 form.innerHTML=groupComposerHtml(kind);
 host.insertBefore(form,host.querySelector('input[type="search"]'));this.composer=form;form.querySelector('input').focus();
};
eligibleGroupsForKind = (kind) => {return this.data.storyline_groups.filter(g=>this.templates.groupEligible(g,kind))};
showUnitComposer = ({kind,era,groupId=null,afterId=null,beat=null,anchor}) => {if(this.editing&&!this.finishInline(true))return;this.discardComposer();const form=document.createElement('form');form.className='composer';form.dataset.composerType='unit';form.dataset.kind=kind;form.dataset.era=era;form.dataset.afterId=afterId||'';form.dataset.beat=beat||'';
 const groups=this.eligibleGroupsForKind(kind);if(!groupId&&!groups.length)return this.report('请先新建一条故事线。',true);
 form.dataset.groupId=groupId||'';
 form.innerHTML=unitComposerHtml({era,groupId,groups,beat});
 // The form is inserted *inside* the corresponding era section or selected lane.
 if(afterId){const card=anchor.closest('.card');card.insertAdjacentElement('afterend',form)}
 else if(beat){const box=anchor.closest('.time-lane').querySelector('.cards');box.prepend(form)}
 else{const section=anchor.closest('.sectionlabel');section.insertAdjacentElement('afterend',form)}
 this.composer=form;form.querySelector('textarea').focus();
};
submitComposer = (form) => {const fd=new FormData(form),type=form.dataset.composerType;try{
 if(type==='storyline'){this.createStoryline(form.dataset.kind,String(fd.get('title')||''),String(fd.get('summary')||''));return}
 if(type==='unit'){
  const kind=form.dataset.kind,era=form.dataset.era,groupId=form.dataset.groupId||String(fd.get('group_id')||'');
  const beat=form.dataset.beat||(fd.get('also_place')?this.activeBeat:null);
  this.createUnit({groupId,kind,era,content:String(fd.get('content')||''),title:String(fd.get('element_title')||''),details:String(fd.get('details')||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),source_refs:String(fd.get('source_refs')||''),beat,afterId:form.dataset.afterId||null});return;
 }
 }catch(e){this.report('未能新增：'+e.message,true);form.querySelector('textarea,input')?.focus()}
};
download = (filename,body) => {const blob=new Blob([JSON.stringify(body,null,2)+'\n'],{type:'application/json;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1200)};
notice = (text) => {
  const p = document.createElement('div'); p.className = 'draft-notice'; p.setAttribute('role','status');
  const span = document.createElement('span'); span.textContent = text; p.append(span);
  const b = document.createElement('button'); b.type = 'button'; b.textContent = '导出原始草稿';
  b.onclick = () => { const raw = this.draft.raw(); if (raw) this.download('outline-local-draft.json', raw); };
  p.append(b); this.root.prepend(p);
 };
finish = () => !this.editing || this.finishInline(true);
dispose = () => { this.disposed = true; this.discardComposer(); this.root.replaceChildren(); };
wireDelegated = () => {
this.root.addEventListener('click',e=>{
 const editSave=e.target.closest('[data-inline-save]');if(editSave){e.preventDefault();e.stopPropagation();this.finishInline(true);return}
 const editCancel=e.target.closest('[data-inline-cancel]');if(editCancel){e.preventDefault();e.stopPropagation();this.finishInline(false);return}
 const ed=e.target.closest('[data-edit-field]');if(ed){e.preventDefault();e.stopPropagation();this.beginInline(ed);return}
 if(e.target.closest('[data-composer-cancel]')){e.preventDefault();this.discardComposer();this.report('已取消新增。');return}
 if(this.editing&&!e.target.closest('.inline-editor')&&!this.finishInline(true)){e.preventDefault();return}
 const newGroup=e.target.closest('[data-create-storyline]');if(newGroup){this.showGroupComposer(newGroup.dataset.createStoryline);return}
 const newUnit=e.target.closest('[data-create-group-unit]');if(newUnit){const b=newUnit.dataset;this.openGroups[b.kind].add(b.createGroupUnit);this.showUnitComposer({kind:b.kind,era:b.era,groupId:b.createGroupUnit,anchor:newUnit});return}
 const newBeatUnit=e.target.closest('[data-create-beat-unit]');if(newBeatUnit){this.showUnitComposer({kind:newBeatUnit.dataset.createBeatUnit,era:newBeatUnit.dataset.era,groupId:newBeatUnit.dataset.groupId||null,beat:this.activeBeat,anchor:newBeatUnit});return}
 const after=e.target.closest('[data-create-after]');if(after){const u=this.unitMap[after.dataset.createAfter];this.showUnitComposer({kind:this.kindOf(u),era:this.state.placements[u.unit_id]?.era||u.era,groupId:u.storyline_group_id,afterId:u.unit_id,beat:this.used(u.unit_id)?this.state.placements[u.unit_id].beat_id:null,anchor:after});return}
 const del=e.target.closest('[data-delete-unit]');if(del){this.deleteNewUnit(del.dataset.deleteUnit);return}
 const delGroup=e.target.closest('[data-delete-group]');if(delGroup){this.deleteNewGroup(delGroup.dataset.deleteGroup);return}
 const nav=e.target.closest('[data-choose-beat]');if(nav){this.model.activeBeat=nav.dataset.chooseBeat;this.sync();this.discardComposer();this.render();this.host.setDrawer(false);this.report('已切换至 '+this.activeBeat);return}
 const moveHere=e.target.closest('[data-move-here]');if(moveHere){this.discardComposer();this.moveUnit(moveHere.dataset.moveHere,this.activeBeat);return}
  const add=e.target.closest('[data-add]');if(add){this.discardComposer();this.assign(add.dataset.add,this.activeBeat,add.dataset.era);return}
 const rem=e.target.closest('[data-remove]');if(rem){this.discardComposer();this.removeUnit(rem.dataset.remove);return}
 const step=e.target.closest('[data-step]');if(step){this.discardComposer();this.reorder(step.dataset.id,Number(step.dataset.step));return}
 const summary=e.target.closest('summary.group-summary');if(summary&&!this.searchText[summary.parentElement.dataset.kind]){const d=summary.parentElement,kind=d.dataset.kind,gid=d.dataset.group;if(d.open)this.openGroups[kind].delete(gid);else this.openGroups[kind].add(gid)}
});
this.root.addEventListener('submit',e=>{const form=e.target.closest('form[data-composer-type]');if(!form)return;e.preventDefault();this.submitComposer(form)});
this.root.addEventListener('change',e=>{
 if(this.editing&&!e.target.closest('.inline-editor')&&!this.finishInline(true))return;
 if(e.target.matches('[data-move]')){const id=e.target.dataset.move,dest=e.target.value;e.target.value='';if(dest)this.moveUnit(id,dest);return}
 if(e.target.matches('[data-switch-kind]')){this.switchKind(e.target.dataset.switchKind,e.target.value);return}
 if(e.target.matches('[data-switch-era]')){this.switchEra(e.target.dataset.switchEra,e.target.value);return}
  if(e.target.matches('[data-editorial-status]')){const u=this.unitMap[e.target.dataset.editorialStatus];if(u?.is_editorial_element){this.snapshot();u.status=e.target.value;this.saveLocal();this.render();this.report('写作状态已更新。')}return}
});
this.root.addEventListener('keydown',e=>{
 if(this.editing&&this.editing.host.contains(e.target)){
  if(e.key==='Escape'){e.preventDefault();this.finishInline(false)}
  else if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();this.finishInline(true)}
  else if(e.key==='Enter'&&this.editing.ctl.tagName==='INPUT'){e.preventDefault();this.finishInline(true)}
  return;
 }
 if(e.target.matches('[data-edit-field]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();this.beginInline(e.target)}
 if(e.key==='Escape'&&this.composer){this.discardComposer();this.report('已取消新增。')}
 if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&this.composer?.contains(e.target)){e.preventDefault();this.composer.requestSubmit()}
});
};
wireActions = () => {
for (const [id, kind] of [['rel-search','RELATIONSHIP'],['event-search','EVENT']]) {
  this.$(id).addEventListener('input', e => { this.searchText[kind] = e.target.value; this.sync(); this.$(kind === 'RELATIONSHIP' ? 'rel-groups' : 'event-groups').innerHTML = this.templates.renderLibrary(kind); });
 }
this.$('beat-note').addEventListener('input', e => { this.state.beat_notes[this.activeBeat] = e.target.value; this.saveLocal(); });
this.action = (id, fn) => this.$(id).addEventListener('click', () => { if (this.editing && !this.finishInline(true)) return; this.discardComposer(); fn(); });
this.action('undo', () => { this.model.undo(); this.saveLocal(); this.render(); this.report('已撤销上一步操作。'); });
this.action('clear-beat', () => {
  const n = this.placedList().filter(p => p.beat_id === this.activeBeat).length;
  if (!n) return this.report('这一拍没有已选节点。');
  if (!confirm(`确定清空 ${this.activeBeat} 的 ${n} 个已选节点吗？文字修改和新素材不会删除。`)) return;
  this.model.clear(); this.saveLocal(); this.render(); this.report('已清空本 Beat 的编排，素材不变。');
 });
this.action('reset-all', () => {
  if (!confirm('确定清空全部 Beat 的编排与分类改动吗？原始及新增素材内容会保留。')) return;
  this.model.clear(true); this.saveLocal(); this.render(); this.report('已清空编排；已有故事线和新增情节点均保留。');
 });
for (const [id, filename, body] of [
  ['export','placements.json',this.model.exportPlan], ['export-data','plot-data.json',this.model.exportData],
  ['export-workspace','maritime-workspace.json',this.model.exportWorkspace],
 ]) this.action(id, () => { this.download(filename, body()); this.report('已导出 ' + filename); });
for (const [kind, load] of [['plan',this.model.importPlan],['data',this.model.importData],['workspace',this.model.importWorkspace]]) {
  this.$('trigger-' + kind).addEventListener('click', () => this.$('import-' + kind).click());
  this.$('import-' + kind).addEventListener('change', async e => {
   const file = e.target.files?.[0]; if (!file) return;
   try { const raw = JSON.parse(await file.text()); if (this.disposed) return;
    if (this.editing && !this.finishInline(true)) return; this.discardComposer(); load(raw);
    this.saveLocal(); this.render(); this.report(`已导入 ${file.name}：${this.savedCount()} 个已安排情节点。`);
   } catch (error) { this.report('导入失败：' + error.message, true); }
   finally { e.target.value = ''; }
  });
 }
this.$('show-original').addEventListener('change', e => { this.showOriginal = e.target.checked; this.render(); this.report(this.showOriginal ? '已显示 XMind 原始节点。' : '已切换回合并 Element 视图。'); });
this.action('restore-starter', () => {
  if (!confirm('恢复仓库预排？未导出的浏览器草稿改动会丢失。')) return;
  this.model.restore(); this.draft.acceptRevision(); this.saveLocal(); this.render();
  this.root.querySelector('.draft-notice')?.remove(); this.report('已恢复仓库预排。');
 });
};
}
