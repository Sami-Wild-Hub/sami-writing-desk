// Outline rendering templates; data and interaction hooks are provided by the controller.
import { esc as html } from '../../archive/ui.ts';
export function outlineTemplates(root, model, ui, config) {
 const { data, state, storyMap, unitMap, activeBeat, undoHistory, kindOf, placedList, orderedSelected, used } = model;
 const { openGroups, searchText, showOriginal, showWritten } = ui;
 const $ = id => root.querySelector(`[id="${html(id)}"]`);
 const timeOrder = ['CURRENT','PAST'];
 const acts = [...new Set(data.beats.map(b=>b.act))];
function editable(field,id,value,className=''){
 return `<span role="button" tabindex="0" class="editable-field ${className}" data-edit-field="${html(field)}" data-id="${html(id)}" title="点击直接编辑">${html(value||'')||'<em class="placeholder">点击填写…</em>'}</span>`;
}
function renderNav(){
 const placed=placedList(),isElement=p=>unitMap[p.unit_id]?.is_editorial_element;
 $('beat-nav').innerHTML=acts.map(act=>`<div class="act"><div class="actname">ACT ${html(act)}</div>${data.beats.filter(b=>b.act===act).map(b=>{
  const count=placed.filter(p=>p.beat_id===b.beat_id&&isElement(p)).length,on=activeBeat===b.beat_id;
  return `<button class="beat ${on?'active':''} ${count?'':'empty-beat'}" data-choose-beat="${html(b.beat_id)}" aria-current="${on?'step':'false'}"><span class="beat-no">Beat ${html(b.beat)}</span><span class="beat-name">${html(b.title||'')}</span><small title="${count} 个 Element">${count}</small></button>`}).join('')}</div>`).join('');
 const n=placed.filter(isElement).length,total=data.plot_units.filter(u=>u.is_editorial_element).length,pct=total?Math.round(100*n/total):0;
 $('overall').textContent=`${n} / ${total}`;$('overall-pct').textContent=pct+'%';$('meter').style.width=pct+'%';
 $('remaining').textContent=`Relationship ${placed.filter(p=>kindOf(unitMap[p.unit_id])==='RELATIONSHIP').length} · Events ${placed.filter(p=>kindOf(unitMap[p.unit_id])==='EVENT').length}`;
 const b=data.beats.find(b=>b.beat_id===activeBeat);$('active-beat').textContent=`ACT ${html(b.act)} / BEAT ${html(b.beat)}`;
 $('beat-title').innerHTML=editable('beat-title',b.beat_id,b.title||'','beat-title-value');
 $('beat-note').value=state.beat_notes[activeBeat]||'';
 const here=placed.filter(p=>p.beat_id===activeBeat),elements=here.map(p=>unitMap[p.unit_id]).filter(u=>u?.is_editorial_element),written=elements.filter(u=>u.status==='WRITTEN').length;
 $('beat-summary').innerHTML=`<span>本拍已选 <b>${here.length}</b> 块</span><span class="tally written">已写 ${written}</span><span class="tally planned">待写 ${elements.length-written}</span>`;
 const support=kind=>here.filter(p=>unitMap[p.unit_id]?.storyline_group_id!==config.spineGroupId&&kindOf(unitMap[p.unit_id])===kind).length+' 块';
 $('rel-summary').textContent=support('RELATIONSHIP');$('event-summary').textContent=support('EVENT');$('undo').disabled=!undoHistory.length;
}
function sourceDetails(u){if(u.is_editorial_element)return `<details class="origin"><summary>出处</summary><div>${html(u.source_refs||'无')} · 原 XMind：${html((u.source_unit_ids||[]).join('、')||'新增')}</div></details>`;
 if(u.is_custom)return '<span class="origin">本次新建</span>';
 const origin=u.original_act?`ACT ${u.original_act} / Beat ${u.original_beat}`:'原稿未分配';
 return `<details class="origin"><summary>原稿来源</summary><div>${html(origin)} · ${html(u.source_group)} · XMind ID ${html(u.source_id)}</div></details>`;
}
function kindSelect(u){const val=kindOf(u);return `<select data-switch-kind="${html(u.unit_id)}" aria-label="${html(u.unit_id)} 分类"><option value="RELATIONSHIP" ${val==='RELATIONSHIP'?'selected':''}>Relationship</option><option value="EVENT" ${val==='EVENT'?'selected':''}>Event</option></select>`}
function eraSelect(u){const chosen=state.placements[u.unit_id]?.era||u.era;return `<select data-switch-era="${html(u.unit_id)}" aria-label="${html(u.unit_id)} 时间线" title="修改此情节点的时间线"><option value="CURRENT" ${chosen==='CURRENT'?'selected':''}>Current</option><option value="PAST" ${chosen==='PAST'?'selected':''}>Past</option><option value="UNASSIGNED" ${chosen==='UNASSIGNED'?'selected':''}>未定</option></select>`}
function moveSelect(u,current){return `<select class="move" data-move="${html(u.unit_id)}" aria-label="${html(u.unit_id)} 整块移动到其他 Beat"><option value="">整块移动到…</option>${acts.map(act=>`<optgroup label="ACT ${html(act)}">${data.beats.filter(b=>b.act===act&&b.beat_id!==current).map(b=>`<option value="${html(b.beat_id)}">Beat ${html(b.beat)}${b.title?' · '+html(b.title):''}</option>`).join('')}</optgroup>`).join('')}</select>`}
function editUnitText(u){return `<div class="cardtext editable-field" role="button" tabindex="0" data-edit-field="unit" data-id="${html(u.unit_id)}" title="点击编辑情节内容">${html(u.content)}</div>`}
function editorialCard(u,selected){
 const p=state.placements[u.unit_id],details=u.details||[],written=u.status==="WRITTEN";
 const actions=selected?`<button class="remove" data-remove="${html(u.unit_id)}">移出</button>${moveSelect(u,p.beat_id)}`:p?`<button class="pick" data-move-here="${html(u.unit_id)}">从 ${html(p.beat_id)} 移入本 Beat</button>`:`<button class="pick" data-add="${html(u.unit_id)}">＋ 选入</button>`;
 return `<article class="card editorial ${written?"written":"planned"}"><div class="card-head"><span class="editorial-badge">${written?"已写":"待写"}</span><div class="editorial-title">${editable("element-title",u.unit_id,u.element_title||"阶段名")}</div><span class="card-id">${html(u.unit_id)}${u.source_refs?` · ${html(u.source_refs)}`:""}</span></div>${editUnitText(u)}<div class="card-foot"><details class="editorial-details"><summary>细节 ${details.length}</summary><ul>${details.map(d=>`<li>${html(d)}</li>`).join("")}</ul>${editable("element-details",u.unit_id,"✎ 编辑细节","details-edit")}</details>${sourceDetails(u)}<div class="cardactions">${actions}<button class="tiny" data-create-after="${html(u.unit_id)}" title="在这张卡后面新增一个阶段">＋ 后接</button><details class="editorial-controls"><summary>分类·状态</summary><div class="control-grid"><label>分类${kindSelect(u)}</label><label>时间线${eraSelect(u)}</label><label>写作状态<select data-editorial-status="${html(u.unit_id)}"><option value="WRITTEN" ${written?"selected":""}>已写</option><option value="PLANNED" ${!written?"selected":""}>待写</option></select></label><button class="delete-item" data-delete-unit="${html(u.unit_id)}">删除卡片</button></div></details></div></div></article>`;
}
function rawCard(u,meta,actions){return `<article class="card raw"><div class="card-head"><span class="raw-badge">原始</span><div class="cardtitle">${meta}</div></div>${editUnitText(u)}<div class="card-foot">${sourceDetails(u)}<div class="cardactions">${actions}${kindSelect(u)}${eraSelect(u)}</div></div></article>`}
function selectedCard(p){
 const u=unitMap[p.unit_id],group=storyMap[u.storyline_group_id];if(u.is_editorial_element)return editorialCard(u,true);
 return rawCard(u,`${html(group?.title)} · ${html(u.unit_id)}`,`<button class="remove" data-remove="${html(u.unit_id)}">移除</button>${moveSelect(u,p.beat_id)}`);
}
function renderSelected(kind,scope="support"){
 return timeOrder.map(era=>{
  const pool=scope==="spine"?[...orderedSelected(activeBeat,"RELATIONSHIP",era),...orderedSelected(activeBeat,"EVENT",era)].sort((a,b)=>unitMap[a.unit_id].sequence-unitMap[b.unit_id].sequence):orderedSelected(activeBeat,kind,era);
  const xs=pool.filter(p=>(unitMap[p.unit_id].storyline_group_id===config.spineGroupId)===(scope==="spine"));
  const gs=[...new Set(xs.map(p=>unitMap[p.unit_id].storyline_group_id))];
  const chunks=gs.map(id=>{
   const g=storyMap[id],items=xs.filter(p=>unitMap[p.unit_id].storyline_group_id===id);
   return `<div class="selected-storyline"><div class="selected-storyline-head">${html(g?.title||id)} <small>${items.length} 个阶段</small></div><div class="selected-storyline-summary" title="${html(g?.summary||"")}">${html(g?.summary||"")}</div>${items.map(p=>selectedCard(p)).join("")}</div>`;
  }).join("");
  return `<section class="time-lane ${era==="PAST"?"past":"current"}" data-selected-kind="${kind}" data-selected-era="${era}"><div class="label"><span class="era">${era==="PAST"?"PAST · T0 前":"CURRENT · T0 后"}</span><span class="label-actions"><span class="n">${xs.length} 块</span><button class="inline-plus" data-create-beat-unit="${kind}" data-group-id="${html(scope==="spine"?config.spineGroupId:"")}" data-era="${era}">＋ Element</button></span></div><div class="cards">${chunks||'<div class="empty">没有这一时间层的 Element</div>'}</div></section>`;
 }).join("");
}
function candidateCard(u){if(u.is_editorial_element)return editorialCard(u,false);return rawCard(u,`${html(u.unit_id)} · 原始 XMind 节点`,`<button class="pick" data-add="${html(u.unit_id)}">＋ 选入</button>`)}
function groupEligible(group,kind){return (group.kinds||[]).includes(kind)||group.default_kind===kind||data.plot_units.some(u=>u.storyline_group_id===group.id&&kindOf(u)===kind)}
function renderLibrary(kind){const q=searchText[kind].trim().toLocaleLowerCase();let items=[],count=0;
 for(const group of data.storyline_groups){if(!groupEligible(group,kind))continue;if(!showOriginal&&!group.is_custom&&!data.plot_units.some(u=>u.is_editorial_element&&u.storyline_group_id===group.id&&kindOf(u)===kind))continue;
  const hidden=u=>!showWritten[kind]&&u.is_editorial_element&&u.status==='WRITTEN';
  const available=data.plot_units.filter(u=>u.storyline_group_id===group.id&&!hidden(u)&&u.era!=='UNASSIGNED'&&kindOf(u)===kind&&(u.is_editorial_element?(!used(u.unit_id)||state.placements[u.unit_id].beat_id!==activeBeat):showOriginal&&!used(u.unit_id)));
  const matched=available.filter(u=>!q||group.title.toLowerCase().includes(q)||(group.summary||'').toLowerCase().includes(q)||u.content.toLowerCase().includes(q)||String(u.element_title||'').toLowerCase().includes(q)||(u.details||[]).join(' ').toLowerCase().includes(q)||u.unit_id.toLowerCase().includes(q));
  const elements=data.plot_units.filter(u=>u.is_editorial_element&&u.storyline_group_id===group.id&&kindOf(u)===kind);
  if(!available.length&&elements.length&&elements.every(hidden))continue;
  if(q&&!matched.length&&!group.title.toLowerCase().includes(q)&&!(group.summary||'').toLowerCase().includes(q))continue;
  count+=matched.length;
  const sections=timeOrder.map(era=>{const xs=matched.filter(u=>u.era===era).sort((a,b)=>a.sequence-b.sequence||a.unit_id.localeCompare(b.unit_id));
   return `<div class="sectionlabel ${era==='PAST'?'past':'current'}"><span class="era">${era} · ${xs.length} 可选</span><button class="inline-plus" data-create-group-unit="${html(group.id)}" data-kind="${kind}" data-era="${era}" title="在这条故事线的 ${era} 新增情节点">＋</button></div>${xs.length?xs.map(candidateCard).join(''):'<div class="empty">此时间段暂无可选情节点，点击＋新增</div>'}`
  }).join('');
  const opened=q||openGroups[kind].has(group.id);
  items.push(`<details class="group" data-group="${html(group.id)}" data-kind="${kind}" ${opened?'open':''}><summary class="group-summary"><span class="group-name">${editable('group-title',group.id,group.title,'group-title')}</span><small class="${matched.length?'':'none'}">${matched.length} 可选</small></summary><div class="groupinner"><div class="group-description">${editable('group-summary',group.id,group.summary||'','group-summary-value')}</div>${sections}${group.is_custom?`<div class="group-footer"><button class="delete-item" data-delete-group="${html(group.id)}">删除空白故事线</button></div>`:''}</div></details>`)
 }
 $((kind==='RELATIONSHIP'?'rel':'event')+'-left').textContent=`${count} 个可选`;
 return items.length?items.join(''):'<div class="empty">暂无匹配故事线。点击上方「＋ 新建故事线」。</div>';
}
function destinationSelect(u){return `<select name="destination" required aria-label="${html(u.unit_id)} 放入的故事线"><option value="">选择故事线…</option>${['RELATIONSHIP','EVENT'].map(kind=>`<optgroup label="${kind==='RELATIONSHIP'?'Relationship':'Events'} 素材">${data.storyline_groups.filter(g=>groupEligible(g,kind)).map(g=>`<option value="${html(`${kind}:${g.id}`)}">${html(g.title)}</option>`).join('')}</optgroup>`).join('')}</select>`}
// An original node leaves this list while an Element cites it; deleting that Element brings it back.
function renderPending(){const cited=new Set(data.plot_units.filter(u=>u.is_editorial_element).flatMap(u=>u.source_unit_ids||[]));
 const xs=data.plot_units.filter(u=>u.era==='UNASSIGNED'&&!used(u.unit_id)&&(u.is_editorial_element||!cited.has(u.unit_id)));$('pending-count').textContent=xs.length;
 $('pending-list').innerHTML=xs.length?xs.map(u=>`<article class="pending-card" data-pending-id="${html(u.unit_id)}"><div class="pending-title">${html(storyMap[u.storyline_group_id]?.title)} · ${html(u.unit_id)} · 顺序 #${u.sequence}</div><div class="pending-text">${editUnitText(u)}</div><div class="card-foot">${sourceDetails(u)}<form class="cardactions pending-destination" data-to-library="${html(u.unit_id)}">${destinationSelect(u)}<button class="pick" name="era" value="CURRENT">放入 Current</button><button class="pick" name="era" value="PAST">放入 Past</button>${u.is_custom?`<button type="button" class="delete-item" data-delete-unit="${html(u.unit_id)}">删除新增</button>`:''}</form></div></article>`).join(''):'<div class="empty">没有未确定的情节点</div>';
}
function renderCounts(){const rows=data.storylines.filter(s=>!s.is_custom).map(s=>{const xs=data.plot_units.filter(u=>u.storyline_id===s.id&&!u.is_custom),c=era=>xs.filter(u=>u.era===era).length;
 return `<tr><td>${html(s.title)}</td><td class="num">${c('CURRENT')}</td><td class="num">${c('PAST')}</td><td class="num">${c('UNASSIGNED')}</td><td class="num"><strong>${xs.length}</strong></td></tr>`}).join('');$('original-counts').innerHTML=rows}
return { groupEligible, editable, renderNav, renderSelected, renderLibrary, renderPending, renderCounts };
}
