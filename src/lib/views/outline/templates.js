// Outline rendering templates; data and interaction hooks are provided by the controller.
import { esc as html } from '../../archive/ui.ts';
export function outlineTemplates(root, model, ui, config) {
 const { data, state, storyMap, unitMap, beatIds, activeBeat, undoHistory, kindOf, placedList, orderedSelected, used } = model;
 const { openGroups, searchText, showOriginal } = ui;
 const $ = id => root.querySelector(`[id="${html(id)}"]`);
 const timeOrder = ['CURRENT','PAST'];
function editable(field,id,value,className=''){
 return `<span role="button" tabindex="0" class="editable-field ${className}" data-edit-field="${html(field)}" data-id="${html(id)}" title="点击直接编辑">${html(value||'')||'<em class="placeholder">点击填写…</em>'}</span>`;
}
function renderNav(){
 const items=[];
 for(const b of data.beats){if(b.beat===1)items.push(`<div class="actname">ACT ${html(b.act)}</div>`);const count=placedList().filter(p=>p.beat_id===b.beat_id&&unitMap[p.unit_id]?.is_editorial_element).length;
  items.push(`<button class="beat ${activeBeat===b.beat_id?'active':''}" data-choose-beat="${html(b.beat_id)}" aria-current="${activeBeat===b.beat_id?'step':'false'}"><span>Beat ${html(b.beat)}</span><small>${count} 点</small></button>`)}
 $('beat-nav').innerHTML=items.join('');
 const n=placedList().filter(p=>unitMap[p.unit_id]?.is_editorial_element).length,total=data.plot_units.filter(u=>u.is_editorial_element).length,pct=total?Math.round(100*n/total):0;
 $('overall').textContent=`${n} / ${total}`;$('overall-pct').textContent=pct+'%';$('meter').style.width=pct+'%';
 $('remaining').textContent=`Relationship ${placedList().filter(p=>kindOf(unitMap[p.unit_id])==='RELATIONSHIP').length} · Events ${placedList().filter(p=>kindOf(unitMap[p.unit_id])==='EVENT').length}`;
 const b=data.beats.find(b=>b.beat_id===activeBeat);$('active-beat').textContent=`ACT ${html(b.act)} / BEAT ${html(b.beat)}`;
 $('beat-title').innerHTML=editable('beat-title',b.beat_id,b.title||'','beat-title-value');
 $('beat-note').value=state.beat_notes[activeBeat]||'';
 $('beat-summary').textContent=`已选 ${placedList().filter(p=>p.beat_id===activeBeat).length} 点；素材可直接编辑和新增，原故事线顺序继续校验。`;
 $('rel-summary').textContent=placedList().filter(p=>p.beat_id===activeBeat&&unitMap[p.unit_id]?.storyline_group_id!==config.spineGroupId&&kindOf(unitMap[p.unit_id])==='RELATIONSHIP').length+' 块';$('event-summary').textContent=placedList().filter(p=>p.beat_id===activeBeat&&unitMap[p.unit_id]?.storyline_group_id!==config.spineGroupId&&kindOf(unitMap[p.unit_id])==='EVENT').length+' 块';$('undo').disabled=!undoHistory.length;
}
function sourceDetails(u){if(u.is_editorial_element)return `<details class="origin"><summary>章节 / 原纲出处</summary><div>${html(u.source_refs||'无')} · 原 XMind：${html((u.source_unit_ids||[]).join('、')||'新增')}</div></details>`;
 if(u.is_custom)return '<div class="origin">本次新建 · 可编辑或删除</div>';
 const origin=u.original_act?`ACT ${u.original_act} / Beat ${u.original_beat}`:'原稿未分配';
 return `<details class="origin"><summary>原稿来源</summary><div>${html(origin)} · ${html(u.source_group)} · XMind ID ${html(u.source_id)}</div></details>`;
}
function kindSelect(u){const val=kindOf(u);return `<select data-switch-kind="${html(u.unit_id)}" aria-label="${html(u.unit_id)} 分类"><option value="RELATIONSHIP" ${val==='RELATIONSHIP'?'selected':''}>Relationship</option><option value="EVENT" ${val==='EVENT'?'selected':''}>Event</option></select>`}
function eraSelect(u){const chosen=state.placements[u.unit_id]?.era||u.era;return `<select data-switch-era="${html(u.unit_id)}" aria-label="${html(u.unit_id)} 时间线" title="修改此情节点的时间线"><option value="CURRENT" ${chosen==='CURRENT'?'selected':''}>Current</option><option value="PAST" ${chosen==='PAST'?'selected':''}>Past</option><option value="UNASSIGNED" ${chosen==='UNASSIGNED'?'selected':''}>未定</option></select>`}
function editUnitText(u){return `<div class="cardtext editable-field" role="button" tabindex="0" data-edit-field="unit" data-id="${html(u.unit_id)}" title="点击编辑情节内容">${html(u.content)}</div>`}
function editorialCard(u,selected){
 const p=state.placements[u.unit_id],details=u.details||[];
 const actions=selected?`<button class="remove" data-remove="${html(u.unit_id)}">移出</button><select data-move="${html(u.unit_id)}"><option value="">整块移动到…</option>${beatIds.filter(b=>b!==p.beat_id).map(b=>`<option value="${html(b)}">${html(b)}</option>`).join("")}</select>`:p?`<button class="pick" data-move-here="${html(u.unit_id)}">从 ${p.beat_id} 移入本 Beat</button>`:`<button class="pick" data-add="${html(u.unit_id)}">＋ 选入</button>`;
 return `<article class="card editorial ${u.status==="PLANNED"?"planned":""}"><div class="editorial-top"><span>${html(u.unit_id)} · ${html(u.source_refs||"新建")}</span><span class="editorial-badge">${u.status==="WRITTEN"?"已写":"待写"}</span></div><div class="editorial-title">${editable("element-title",u.unit_id,u.element_title||"阶段名")}</div>${editUnitText(u)}<details class="editorial-details"><summary>内部细节（${details.length} 条）</summary><ul>${details.map(d=>`<li>${html(d)}</li>`).join("")}</ul>${editable("element-details",u.unit_id,"✎ 编辑细节")}</details><div class="cardactions">${actions}<button class="tiny" data-create-after="${html(u.unit_id)}">＋ 后接</button><details class="editorial-controls"><summary>分类 / 状态</summary>${kindSelect(u)}${eraSelect(u)}<select data-editorial-status="${html(u.unit_id)}"><option value="WRITTEN" ${u.status==="WRITTEN"?"selected":""}>已写</option><option value="PLANNED" ${u.status!=="WRITTEN"?"selected":""}>待写</option></select><button data-delete-unit="${html(u.unit_id)}">删除卡片</button></details></div>${sourceDetails(u)}</article>`;
}
function selectedCard(p){
 const u=unitMap[p.unit_id],group=storyMap[u.storyline_group_id];if(u.is_editorial_element)return editorialCard(u,true);
 return `<article class="card"><div class="cardtitle">${html(group?.title)} · ${html(u.unit_id)}</div>${editUnitText(u)}<div class="cardactions"><button class="remove" data-remove="${html(u.unit_id)}">移除</button><select data-move="${html(u.unit_id)}"><option value="">移动到…</option>${beatIds.filter(b=>b!==p.beat_id).map(b=>`<option value="${html(b)}">${html(b)}</option>`).join("")}</select>${kindSelect(u)}${eraSelect(u)}</div>${sourceDetails(u)}</article>`;
}
function renderSelected(kind,scope="support"){
 return timeOrder.map(era=>{
  const pool=scope==="spine"?[...orderedSelected(activeBeat,"RELATIONSHIP",era),...orderedSelected(activeBeat,"EVENT",era)].sort((a,b)=>unitMap[a.unit_id].sequence-unitMap[b.unit_id].sequence):orderedSelected(activeBeat,kind,era);
  const xs=pool.filter(p=>(unitMap[p.unit_id].storyline_group_id===config.spineGroupId)===(scope==="spine"));
  const gs=[...new Set(xs.map(p=>unitMap[p.unit_id].storyline_group_id))];
  const chunks=gs.map(id=>{
   const g=storyMap[id],items=xs.filter(p=>unitMap[p.unit_id].storyline_group_id===id);
   return `<div class="selected-storyline"><div class="selected-storyline-head">${html(g?.title||id)} <small>${items.length} 个阶段</small></div><div class="selected-storyline-summary">${html(g?.summary||"")}</div>${items.map(p=>selectedCard(p)).join("")}</div>`;
  }).join("");
  return `<section class="time-lane ${era==="PAST"?"past":"current"}" data-selected-kind="${kind}" data-selected-era="${era}"><div class="label"><span>${era==="PAST"?"PAST · T0 前":"CURRENT · T0 后"}</span><span class="label-actions">${xs.length} 块 <button class="inline-plus" data-create-beat-unit="${kind}" data-group-id="${html(scope==="spine"?config.spineGroupId:"")}" data-era="${era}">＋ Element</button></span></div><div class="cards">${chunks||'<div class="empty">没有这一时间层的 Element</div>'}</div></section>`;
 }).join("");
}
function candidateCard(u){if(u.is_editorial_element)return editorialCard(u,false);return `<article class="card"><div class="cardtitle">${html(u.unit_id)} · 原始 XMind 节点</div>${editUnitText(u)}<div class="cardactions"><button class="pick" data-add="${html(u.unit_id)}">＋ 选入</button>${kindSelect(u)}${eraSelect(u)}</div>${sourceDetails(u)}</article>`}
function groupEligible(group,kind){return (group.kinds||[]).includes(kind)||group.default_kind===kind||data.plot_units.some(u=>u.storyline_group_id===group.id&&kindOf(u)===kind)}
function renderLibrary(kind){const q=searchText[kind].trim().toLocaleLowerCase();let items=[],count=0;
 for(const group of data.storyline_groups){if(!groupEligible(group,kind))continue;if(!showOriginal&&!group.is_custom&&!data.plot_units.some(u=>u.is_editorial_element&&u.storyline_group_id===group.id&&kindOf(u)===kind))continue;
  const available=data.plot_units.filter(u=>u.storyline_group_id===group.id&&u.era!=='UNASSIGNED'&&kindOf(u)===kind&&(u.is_editorial_element?(!used(u.unit_id)||state.placements[u.unit_id].beat_id!==activeBeat):showOriginal&&!used(u.unit_id)));
  const matched=available.filter(u=>!q||group.title.toLowerCase().includes(q)||(group.summary||'').toLowerCase().includes(q)||u.content.toLowerCase().includes(q)||String(u.element_title||'').toLowerCase().includes(q)||(u.details||[]).join(' ').toLowerCase().includes(q)||u.unit_id.toLowerCase().includes(q));
  if(q&&!matched.length&&!group.title.toLowerCase().includes(q)&&!(group.summary||'').toLowerCase().includes(q))continue;
  count+=matched.length;
  const sections=timeOrder.map(era=>{const xs=matched.filter(u=>u.era===era).sort((a,b)=>a.sequence-b.sequence||a.unit_id.localeCompare(b.unit_id));
   return `<div class="sectionlabel ${era==='PAST'?'past':'current'}"><span>${era} · ${xs.length} 可选</span><button class="inline-plus" data-create-group-unit="${html(group.id)}" data-kind="${kind}" data-era="${era}" title="在这条故事线的 ${era} 新增情节点">＋</button></div>${xs.length?xs.map(candidateCard).join(''):'<div class="empty">此时间段暂无可选情节点，点击＋新增</div>'}`
  }).join('');
  const opened=q||openGroups[kind].has(group.id);
  items.push(`<details class="group" data-group="${html(group.id)}" data-kind="${kind}" ${opened?'open':''}><summary class="group-summary"><span class="group-name">${editable('group-title',group.id,group.title,'group-title')}</span><small>${matched.length} 可选</small></summary><div class="groupinner"><div class="group-description">${editable('group-summary',group.id,group.summary||'','group-summary-value')}</div>${sections}${group.is_custom?`<div class="group-footer"><button class="delete-item" data-delete-group="${html(group.id)}">删除空白故事线</button></div>`:''}</div></details>`)
 }
 $((kind==='RELATIONSHIP'?'rel':'event')+'-left').textContent=`${count} 个可选`;
 return items.length?items.join(''):'<div class="empty">暂无匹配故事线。点击上方「＋ 新建故事线」。</div>';
}
function renderPending(){const xs=data.plot_units.filter(u=>u.era==='UNASSIGNED'&&!used(u.unit_id));$('pending-count').textContent=xs.length;
 $('pending-list').innerHTML=xs.length?xs.map(u=>`<article class="pending-card" data-pending-id="${html(u.unit_id)}"><div class="pending-title">${html(storyMap[u.storyline_group_id]?.title)} · ${html(u.unit_id)} · 顺序 #${u.sequence}</div><div class="pending-text">${editUnitText(u)}</div><div class="cardactions"><button class="pick" data-add="${html(u.unit_id)}" data-era="CURRENT">＋ 选入 Current</button><button class="pick" data-add="${html(u.unit_id)}" data-era="PAST">＋ 选入 Past</button>${kindSelect(u)}${eraSelect(u)}${u.is_custom?`<button class="delete-item" data-delete-unit="${html(u.unit_id)}">删除新增</button>`:''}</div>${sourceDetails(u)}</article>`).join(''):'<div class="empty">没有待定时间的情节点</div>';
}
function renderCounts(){const rows=data.storylines.filter(s=>!s.is_custom).map(s=>{const xs=data.plot_units.filter(u=>u.storyline_id===s.id&&!u.is_custom),c=era=>xs.filter(u=>u.era===era).length;
 return `<tr><td>${html(s.title)}</td><td class="num">${c('CURRENT')}</td><td class="num">${c('PAST')}</td><td class="num">${c('UNASSIGNED')}</td><td class="num"><strong>${xs.length}</strong></td></tr>`}).join('');$('original-counts').innerHTML=rows}
return { groupEligible, editable, renderNav, renderSelected, renderLibrary, renderPending, renderCounts };
}
