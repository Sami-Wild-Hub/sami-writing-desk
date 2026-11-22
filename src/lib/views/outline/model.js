// Outline state and operations, preserving the original v5 interchange format.
// Reads: private plot_data and plan (JSON)
// Writes: in-memory working copy (JSON); persistence is supplied by hooks.
export const clone = value => JSON.parse(JSON.stringify(value));
export function createOutlineModel(source,plan,hooks = {}) { return new OutlineModel(source,plan,hooks); }

class OutlineModel {
constructor(source,plan,hooks = {}) {
this.source = source;
this.plan = plan;
this.hooks = hooks;
this.hooks = { render() {}, report() {}, save() {}, warning() {}, confirm: () => true, ...this.hooks };
this.data = clone(this.source);
this.state = { placements: {}, kind_overrides: {}, beat_notes: {} };
this.storyMap = {};
this.unitMap = {};
this.beatIds = [];
this.beatIndex = {};
this.activeBeat = this.data.beats?.[0]?.beat_id;
this.undoHistory = [];
this.timeOrder = ['CURRENT', 'PAST'];
this.kindOrder = ['RELATIONSHIP', 'EVENT'];
this.closedGroups = { RELATIONSHIP: new Set(), EVENT: new Set() };
this.used = id => Boolean(this.state.placements[id]);
this.kindOf = u => this.state.kind_overrides[u.unit_id] || u.kind;
this.placedList = () => Object.values(this.state.placements);
this.labelKind = k => k === 'RELATIONSHIP' ? 'Relationship' : 'Events';
this.savedCount = () => this.placedList().length;
this.report = (message, error = false) => this.hooks.report(message, error);
this.render = () => this.hooks.render();
this.refreshData(this.data);
this.state = this.validPlan(this.plan);
}
normalizeData = (db) => {
 if(!db||!Array.isArray(db.plot_units)||!Array.isArray(db.storyline_groups)||!Array.isArray(db.beats)||!Array.isArray(db.storylines))throw Error('需要 plot-data.json（包含 plot_units、storyline_groups、beats、storylines）');
 if(!db.beats.length)throw Error('至少需要一个 Beat');
 for(const key of ['source_nodes','branches'])if(db[key]!==undefined&&!Array.isArray(db[key]))throw Error('溯源字段必须为数组：'+key);
 for(const s of db.storylines)if(!s||typeof s.id!=='string')throw Error('原始故事线字段无效');
 const ids=new Set(),groups=new Set(),beats=new Set();
 for(const g of db.storyline_groups){if(!g||typeof g.id!=='string'||!g.id||groups.has(g.id))throw Error('故事线 ID 无效或重复');groups.add(g.id);if(typeof g.title!=='string')throw Error('故事线缺少名称：'+g.id);
  if(g.summary!=null&&typeof g.summary!=='string')throw Error('故事线摘要必须为文字');
  for(const key of ['kinds','source_storyline_ids'])if(g[key]!=null&&(!Array.isArray(g[key])||g[key].some(v=>typeof v!=='string')))throw Error('故事线列表字段无效：'+key);
 }
 for(const b of db.beats){if(!b||typeof b.beat_id!=='string'||!b.beat_id||beats.has(b.beat_id))throw Error('重复或无效 Beat');beats.add(b.beat_id)}
 for(const u of db.plot_units){if(!u||typeof u.unit_id!=='string'||!u.unit_id||ids.has(u.unit_id))throw Error('情节点 ID 重复或无效');ids.add(u.unit_id);
  if(!groups.has(u.storyline_group_id)||!['CURRENT','PAST','UNASSIGNED'].includes(u.era)||!this.kindOrder.includes(u.kind)||!Number.isFinite(u.sequence)||typeof u.content!=='string')throw Error('情节点字段无效：'+u.unit_id);
  for(const key of ['details','source_unit_ids'])if(u[key]!=null&&(!Array.isArray(u[key])||u[key].some(v=>typeof v!=='string')))throw Error('情节点列表字段无效：'+key);
 }
 return db;
};
refreshData = (db) => {
 this.data=this.normalizeData(db);
 this.storyMap=Object.fromEntries(this.data.storyline_groups.map(g=>[g.id,g]));
 this.unitMap=Object.fromEntries(this.data.plot_units.map(u=>[u.unit_id,u]));
 this.beatIds=this.data.beats.map(b=>b.beat_id);
 this.beatIndex=Object.fromEntries(this.beatIds.map((b,i)=>[b,i]));
 if(!this.beatIds.includes(this.activeBeat))this.activeBeat=this.beatIds[0];
};
refreshDerived = () => {
 for(const group of this.data.storyline_groups){
  const xs=this.data.plot_units.filter(u=>u.storyline_group_id===group.id).sort((a,b)=>a.sequence-b.sequence||a.unit_id.localeCompare(b.unit_id));
  group.sections={CURRENT:xs.filter(u=>u.era==='CURRENT').map(u=>u.unit_id),PAST:xs.filter(u=>u.era==='PAST').map(u=>u.unit_id)};
  group.awaiting_era=xs.filter(u=>u.era==='UNASSIGNED').map(u=>u.unit_id);
  const kinds=new Set([...(group.kinds||[]),...(group.default_kind?[group.default_kind]:[]),...xs.map(u=>this.kindOf(u))]);
  group.kinds=Array.from(kinds).filter(k=>this.kindOrder.includes(k));
 }
 this.data.counts={...(this.data.counts||{}),display_storylines:this.data.storyline_groups.length,plot_units:this.data.plot_units.length,
  relationship:this.data.plot_units.filter(u=>this.kindOf(u)==='RELATIONSHIP').length,event:this.data.plot_units.filter(u=>this.kindOf(u)==='EVENT').length,
  current:this.data.plot_units.filter(u=>u.era==='CURRENT').length,past:this.data.plot_units.filter(u=>u.era==='PAST').length,
  awaiting_era:this.data.plot_units.filter(u=>u.era==='UNASSIGNED').length,
  original_plot_units:this.data.plot_units.filter(u=>!u.is_custom).length,user_added_plot_units:this.data.plot_units.filter(u=>u.is_custom).length};
 this.data.schema_version='5.0';
};
exportPlan = () => {return {...clone(this.state),schema_version:'5.0',source_data:'plot-data.json',placements:this.placedList().map(row=>({...row})).sort((a,b)=>this.beatIndex[a.beat_id]-this.beatIndex[b.beat_id]||a.order-b.order),kind_overrides:{...this.state.kind_overrides},beat_notes:{...this.state.beat_notes}}};
exportData = () => {this.refreshDerived();return clone(this.data)};
exportWorkspace = () => {return {schema_version:'5.0',format:'maritime-outline-workspace',plot_data:this.exportData(),plan:this.exportPlan(),active_beat:this.activeBeat}};
saveLocal = () => {try{this.hooks.save(this.exportWorkspace());return true}catch(e){this.hooks.warning(e);return false}};
snapshot = () => {this.undoHistory.push({data:clone(this.data),state:clone(this.state)});if(this.undoHistory.length>50)this.undoHistory.shift()};
validPlan = (raw) => {
 if(!raw||!Array.isArray(raw.placements))throw Error('编排 JSON 缺少 placements 数组');
 const fresh={...clone(raw),placements:{},kind_overrides:{},beat_notes:{}};
 for(const [id,k] of Object.entries(raw.kind_overrides||{})){if(!this.unitMap[id]||!this.kindOrder.includes(k))throw Error('分类覆盖无效：'+id);fresh.kind_overrides[id]=k}
 for(const [b,n] of Object.entries(raw.beat_notes||{})){if(!(b in this.beatIndex))throw Error('Beat 备注目标无效：'+b);fresh.beat_notes[b]=String(n)}
 for(const row of raw.placements){if(!this.unitMap[row.unit_id]||!(row.beat_id in this.beatIndex))throw Error('编排引用了未知节点或 Beat');if(fresh.placements[row.unit_id])throw Error('节点在两个 Beat 中重复：'+row.unit_id);
  const u=this.unitMap[row.unit_id];if(!this.timeOrder.includes(row.era))throw Error('请选择 Current 或 Past：'+row.unit_id);if(u.era!=='UNASSIGNED'&&u.era!==row.era)throw Error('编排时间与数据冲突：'+row.unit_id);
  fresh.placements[row.unit_id]={unit_id:row.unit_id,beat_id:row.beat_id,era:row.era,order:Number.isFinite(Number(row.order))?Number(row.order):(Object.keys(fresh.placements).length+1)*10};
 }
 for(const p of Object.values(fresh.placements)){const why=this.conflict(p.unit_id,p.beat_id,p.era,fresh.placements);if(why)throw Error('编排逆序：'+why)}
 return fresh;
};
conflict = (id,beat,era,placements=this.state.placements) => {
 const u=this.unitMap[id],n=this.beatIndex[beat];if(!u||n===undefined)return '节点或 Beat 不存在';
 for(const p of Object.values(placements)){
  if(p.unit_id===id)continue;const v=this.unitMap[p.unit_id];if(!v||v.storyline_group_id!==u.storyline_group_id||p.era!==era)continue;
  const other=this.beatIndex[p.beat_id];if((u.sequence<v.sequence&&n>other)||(u.sequence>v.sequence&&n<other))return `${u.unit_id}（顺序 ${u.sequence}）与 ${v.unit_id}（顺序 ${v.sequence}，${p.beat_id}）冲突`;
 }
 return null;
};
nextOrder = (beat) => {return Math.max(0,...this.placedList().filter(p=>p.beat_id===beat).map(p=>p.order))+10};
allocateSequence = (groupId,era,afterId=null,beat=null) => {
 const xs=this.data.plot_units.filter(u=>u.storyline_group_id===groupId&&(this.state.placements[u.unit_id]?.era||u.era)===era).sort((a,b)=>a.sequence-b.sequence||a.unit_id.localeCompare(b.unit_id));
 if(afterId){const i=xs.findIndex(x=>x.unit_id===afterId);if(i<0)throw Error('插入位置不存在');return i===xs.length-1?xs[i].sequence+1:(xs[i].sequence+xs[i+1].sequence)/2}
 if(beat){
  const placed=xs.filter(u=>this.used(u.unit_id));
  const low=placed.filter(u=>this.beatIndex[this.state.placements[u.unit_id].beat_id]<=this.beatIndex[beat]).map(u=>u.sequence);
  const high=placed.filter(u=>this.beatIndex[this.state.placements[u.unit_id].beat_id]>this.beatIndex[beat]).map(u=>u.sequence);
  if(high.length){const upper=Math.min(...high),lower=low.length?Math.max(...low):Math.min(0,upper-1);if(lower>=upper)throw Error('这条故事线已经出现顺序冲突');return (lower+upper)/2}
 }
 return xs.length?xs[xs.length-1].sequence+1:1;
};
assign = (id,beat) => {
 const u=this.unitMap[id];if(!u||this.used(id))return this.report('此节点已经安排在其他位置。请使用移动功能。',true);
 if(!this.timeOrder.includes(u.era))return this.report('请先把情节点放入素材库。',true);
 const why=this.conflict(id,beat,u.era);let sequence=u.sequence;
 if(why){
  if(!u.position_open)return this.report('不能逆序插入：'+why,true);
  // A node from the pending list has no rank in its storyline until a Beat gives it one.
  try{sequence=this.allocateSequence(u.storyline_group_id,u.era,null,beat)}catch(e){return this.report('不能选入：'+e.message,true)}
 }
 this.snapshot();u.sequence=sequence;this.state.placements[id]={unit_id:id,beat_id:beat,era:u.era,order:this.nextOrder(beat)};this.saveLocal();this.render();this.report(`已将 ${id} 选入 ${beat} · ${u.era}`);
};
removeUnit = (id) => {if(!this.used(id))return;this.snapshot();delete this.state.placements[id];this.saveLocal();this.render();this.report(`${id} 已回到素材库。`)};
moveUnit = (id,dest) => {const old=this.state.placements[id];if(!old||old.beat_id===dest)return;const why=this.conflict(id,dest,old.era);if(why)return this.report('移动会颠倒故事线顺序：'+why,true);this.snapshot();old.beat_id=dest;old.order=this.nextOrder(dest);this.saveLocal();this.render();this.report(`已将 ${id} 移至 ${dest}。`)};
switchKind = (id,k) => {const u=this.unitMap[id];if(!u||!this.kindOrder.includes(k))return;const old=this.kindOf(u);if(old===k)return;this.snapshot();if(k===u.kind)delete this.state.kind_overrides[id];else this.state.kind_overrides[id]=k;this.refreshDerived();this.saveLocal();this.render();this.report(`${id} 已改为 ${this.labelKind(k)}。`)};
switchEra = (id,era) => {
 const u=this.unitMap[id];if(!u||!['CURRENT','PAST','UNASSIGNED'].includes(era))return;
 if(this.used(id)&&era==='UNASSIGNED'){this.render();return this.report('已选入 Beat 的节点不能改为时间待定；请先移除。',true)}
 if(u.era===era&&(!this.used(id)||this.state.placements[id].era===era))return;
 const before={data:clone(this.data),state:clone(this.state)},previousEra=u.era;
 u.era=era;
 if(era!=='UNASSIGNED'){
  // Preserve the original narrative number wherever possible. If a different
  // time section contains the same rank, insert just after that rank.
  const same=this.data.plot_units.filter(v=>v.unit_id!==id&&v.storyline_group_id===u.storyline_group_id&&v.era===era);
  if(same.some(v=>v.sequence===u.sequence)){
   const higher=same.filter(v=>v.sequence>u.sequence).map(v=>v.sequence);
   u.sequence=higher.length?(u.sequence+Math.min(...higher))/2:u.sequence+0.5;
  }
 }
 if(this.used(id))this.state.placements[id].era=era;
 const bad=this.placedList().map(p=>this.conflict(p.unit_id,p.beat_id,p.era)).find(Boolean);
 if(bad){this.state=before.state;this.refreshData(before.data);return this.report('不能改变时间层：'+bad,true)}
 this.undoHistory.push(before);if(this.undoHistory.length>50)this.undoHistory.shift();
 if(!u.original_era)u.original_era=previousEra;
 this.refreshDerived();this.saveLocal();this.render();this.report(`${id} 已改为 ${era==='UNASSIGNED'?'待定':era}。`);
};
orderedSelected = (beat,kind,era) => {
 const arr=this.placedList().filter(p=>p.beat_id===beat&&p.era===era&&this.unitMap[p.unit_id]&&this.kindOf(this.unitMap[p.unit_id])===kind);
 const output=[],picked=new Set();
 while(output.length<arr.length){
  const ready=arr.filter(p=>!picked.has(p.unit_id)&&!arr.some(q=>!picked.has(q.unit_id)&&q.unit_id!==p.unit_id&&this.unitMap[q.unit_id].storyline_group_id===this.unitMap[p.unit_id].storyline_group_id&&this.unitMap[q.unit_id].sequence<this.unitMap[p.unit_id].sequence));
  ready.sort((a,b)=>a.order-b.order||a.unit_id.localeCompare(b.unit_id));if(!ready.length)throw Error('节点排序循环');output.push(ready[0]);picked.add(ready[0].unit_id);
 }
 return output;
};
reorder = (id,delta) => {const p=this.state.placements[id];if(!p)return;const lane=this.orderedSelected(p.beat_id,this.kindOf(this.unitMap[id]),p.era);const i=lane.findIndex(x=>x.unit_id===id),j=i+delta;if(j<0||j>=lane.length)return;
 const other=lane[j];if(this.unitMap[id].storyline_group_id===this.unitMap[other.unit_id].storyline_group_id)return this.report('同一故事线仍须保持内部顺序。',true);
 this.snapshot();[lane[i],lane[j]]=[lane[j],lane[i]];lane.forEach((r,idx)=>this.state.placements[r.unit_id].order=(idx+1)*10);this.saveLocal();this.render();this.report(`已调整 ${id} 在本 Beat 内的位置。`)
};
freshId = (prefix,items,field) => {
 const usedIds=new Set(items.map(x=>x[field]));
 if(!this.data.next_custom_ids)this.data.next_custom_ids={};
 let n=Number(this.data.next_custom_ids[prefix]||1),id;
 do{id=prefix+String(n++).padStart(3,'0')}while(usedIds.has(id));
 this.data.next_custom_ids[prefix]=n;return id;
};
createStoryline = (kind,title,summary) => {title=title.trim();summary=summary.trim();if(!title)throw Error('故事线名称不能为空');
 this.snapshot();const gid=this.freshId('GNEW',this.data.storyline_groups,'id');const sid=this.freshId('SNEW',this.data.storylines,'id');
 this.data.storyline_groups.push({id:gid,title,summary,source_storyline_ids:[sid],sections:{CURRENT:[],PAST:[]},awaiting_era:[],kinds:[kind],default_kind:kind,is_custom:true});
 this.data.storylines.push({id:sid,title,summary,storyline_group_id:gid,source_scope:'BOTH',is_custom:true});
 this.refreshData(this.data);this.refreshDerived();this.closedGroups[kind].delete(gid);this.saveLocal();this.render();this.report(`已新建 ${this.labelKind(kind)} 故事线：${title}。`);return gid;
};
createUnit = ({groupId,kind,era,content,beat=null,afterId=null,title=null,details=[],source_refs='',source_unit_ids=[],position_open=false}) => {
 content=content.trim();if(!content)throw Error('情节点内容不能为空');if(!this.storyMap[groupId])throw Error('请先选择故事线');if(!this.kindOrder.includes(kind)||!this.timeOrder.includes(era))throw Error('请指定分类与时间层');
 let seq=this.allocateSequence(groupId,era,afterId,beat);
 // If there is no representable floating gap, use the smallest conventional increment.
 if(!Number.isFinite(seq))throw Error('情节点顺序无效');
 const gid=this.storyMap[groupId],id=this.freshId('UNEW',this.data.plot_units,'unit_id');
 const u={unit_id:id,storyline_id:gid.source_storyline_ids?.[0]||null,storyline_group_id:groupId,branch_id:null,source_id:null,source_parent_id:null,source_group:'User Added',source_path:'',source_status:'new',depth:1,parent_unit_id:null,is_branch_seed:false,unplaced:!beat,
  original_act:null,original_beat:null,original_beat_id:null,era,kind,sequence:seq,content,element_title:String(title||content.split('\n')[0]).slice(0,150),details,source_refs,source_unit_ids,status:'PLANNED',is_editorial_element:true,is_custom:true,...(position_open?{position_open}:{})};
 // Validate cross-Beat chronology before mutation. No original unit is moved or renumbered.
 if(beat){const p=this.state.placements;for(const v of this.data.plot_units){if(v.storyline_group_id!==groupId||(p[v.unit_id]?.era||v.era)!==era||!p[v.unit_id])continue;
  const other=this.beatIndex[p[v.unit_id].beat_id],now=this.beatIndex[beat];if((seq<v.sequence&&now>other)||(seq>v.sequence&&now<other))throw Error(`新增节点与 ${v.unit_id} 在 ${p[v.unit_id].beat_id} 的顺序冲突`);
 }}
 this.snapshot();this.data.plot_units.push(u);if(beat)this.state.placements[id]={unit_id:id,beat_id:beat,era,order:this.nextOrder(beat)};
 this.refreshData(this.data);this.refreshDerived();this.closedGroups[kind].delete(groupId);this.saveLocal();this.render();this.report(`已新增 ${id}${beat?' 并选入 '+beat:' 到素材库'}。`);return id;
};
toLibrary = (id,groupId,kind,era) => {
 const u=this.unitMap[id],group=this.storyMap[groupId];if(!u||!group||!this.kindOrder.includes(kind)||!this.timeOrder.includes(era))return this.report('请选择故事线和时间。',true);
 if(!u.is_editorial_element){
  // Original nodes stay as they are; the library receives an Element that cites the node.
  this.createUnit({groupId,kind,era,content:u.content,title:u.content.trim().split(/[，。；,;\n]/)[0],source_refs:id,source_unit_ids:[id],position_open:true});
 }else{
  const sequence=this.allocateSequence(groupId,era);
  this.snapshot();Object.assign(u,{storyline_group_id:groupId,storyline_id:group.source_storyline_ids?.[0]||null,kind,era,sequence,position_open:true});
  delete this.state.kind_overrides[id];this.closedGroups[kind].delete(groupId);this.refreshDerived();this.saveLocal();this.render();
 }
 this.report(`已将 ${id} 放入素材库：${group.title} · ${era}。`);
};
deleteNewUnit = (id) => {const u=this.unitMap[id];if(!u?.is_custom)return this.report('原 XMind 节点仅可编辑，不从源数据删除。',true);if(!this.hooks.confirm('删除这条新增情节点？此操作可撤销。'))return;
 this.snapshot();this.data.plot_units=this.data.plot_units.filter(x=>x.unit_id!==id);delete this.state.placements[id];delete this.state.kind_overrides[id];this.refreshData(this.data);this.refreshDerived();this.saveLocal();this.render();this.report(`新增节点 ${id} 已删除。`)};
deleteNewGroup = (id) => {const g=this.storyMap[id];if(!g?.is_custom)return;const n=this.data.plot_units.filter(u=>u.storyline_group_id===id).length;if(n)return this.report(`请先移除这条故事线的 ${n} 个新情节点。`,true);if(!this.hooks.confirm('删除空白故事线「'+g.title+'」吗？'))return;
 this.snapshot();this.data.storyline_groups=this.data.storyline_groups.filter(x=>x.id!==id);this.data.storylines=this.data.storylines.filter(x=>x.storyline_group_id!==id);this.refreshData(this.data);this.refreshDerived();this.saveLocal();this.render();this.report('已删除空白故事线。')};
importWorkspace = (raw,remember = true) => {
  if (!raw?.plot_data || !raw?.plan) throw Error('需要完整工作台 JSON（plot_data + plan）');
  const previous = { data: this.data, state: this.state, activeBeat: this.activeBeat };
  try {
   this.refreshData(clone(raw.plot_data));
   const next = this.validPlan(raw.plan);
   if (remember) { this.undoHistory.push({ data: clone(previous.data), state: clone(previous.state) }); if (this.undoHistory.length > 50) this.undoHistory.shift(); }
   this.state = next;
   this.activeBeat = this.beatIds.includes(raw.active_beat) ? raw.active_beat : this.activeBeat;
  } catch (error) { this.refreshData(previous.data); this.state = previous.state; this.activeBeat = previous.activeBeat; throw error; }
 };
importData = (raw) => {
  const previous = { data: this.data, state: this.state, activeBeat: this.activeBeat };
  try { this.refreshData(clone(raw)); const next = this.validPlan(this.exportPlan());
   this.undoHistory.push({ data: clone(previous.data), state: clone(previous.state) });
   if (this.undoHistory.length > 50) this.undoHistory.shift(); this.state = next;
  } catch (error) { this.refreshData(previous.data); this.state = previous.state; this.activeBeat = previous.activeBeat; throw error; }
 };
importPlan = (raw) => { const next = this.validPlan(raw); this.snapshot(); this.state = next; };
undo = () => { const old = this.undoHistory.pop(); if (!old) return; this.state = old.state; this.refreshData(old.data); };
clear = (all = false) => {
  this.snapshot();
  if (all) this.state = { ...this.state, placements: {}, kind_overrides: {}, beat_notes: {} };
  else for (const p of this.placedList()) if (p.beat_id === this.activeBeat) delete this.state.placements[p.unit_id];
 };
restore = () => { this.importWorkspace({ plot_data: this.source, plan: this.plan, active_beat: this.source.beats[0]?.beat_id }); };
}
