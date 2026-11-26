import { OUTLINE_ARCHIVED } from './view-state.js';

// Shared markup: top bar, cards, folds, participant ranking popover and the storyline dialog.
export function renderBar(v) {
  const { UI, S, D, undoStack } = v;
  const tab = (id, label) => `<button data-act="tab" data-tab="${id}" aria-current="${UI.tab === id ? 'page' : 'false'}">${label}</button>`;
  return `
    ${OUTLINE_ARCHIVED ? '' : `<nav class="tabs" aria-label="视图">${tab('outline', '大纲')}${tab('story', '故事线')}</nav>`}
    <span class="sp"></span>
    <span id="overall">${Object.keys(S.cards).length} 张 · ${Object.keys(D.placedIn).length} 已排</span>
    <button class="btn small" data-act="toggle-rank" aria-expanded="${UI.rank}">参与者排序</button>
    ${undoStack.length ? '<button class="btn small" id="undo" data-act="undo" title="撤销上一步（Ctrl+Z）" aria-label="撤销">↶ <span>撤销</span></button>' : ''}`;
}

export function fold(v, key, label, body) {
  const { UI, esc } = v;
  return `<details class="fold" data-key="${esc(key)}" ${UI.open.has(key) ? 'open' : ''}><summary>${label}</summary>${body}</details>`;
}

// Status badge doubles as the manual 已写 switch; 已排/未排 still follow placement.
export function badge(v, c) {
  const { statusClass } = v, written = c.status === '已写';
  return `<button type="button" class="badge ${statusClass[c.status]}" data-act="toggle-written" data-id="${c.id}" aria-pressed="${written}" title="${written ? '已写 · 点击改回未写' : '点击标为已写'}">${c.status}</button>`;
}

// Full card: badge, where it is placed, text, details and origins, actions.
export function cardFull(v, c, { actions = '', where = true, drag = false, mark = true, headerActions = '' } = {}) {
  const { D, beatShort, esc, list, markBlock, badge, fold } = v;
  const p = D.placedIn[c.id], m = mark && D.marks[c.id];
  const place = where && p ? `<span class="where placed">排在 ${beatShort(p.beat)}</span>` : '';
  const foot = [
    c.details?.length ? fold(`d:${c.id}`, `细节 ${c.details.length}`, list(c.details)) : '',
    c.origins?.length ? fold(`o:${c.id}`, `原纲 ${c.origins.length}`, list(c.origins)) : '',
    c.refs ? `<span class="refs">出处 ${esc(c.refs)}</span>` : '',
  ].filter(Boolean).join('<span class="foot-dot" aria-hidden="true">·</span>');
  const menu = actions ? `<details class="card-menu"><summary aria-label="卡片操作">⋯</summary><div class="menu">${actions}</div></details>` : '';
  return `<article class="card ${c.cat} ${m ? 'marked' : ''}" ${drag ? `data-drag="card" data-id="${c.id}"` : ''} data-card="${c.id}">
    <div class="c-head">${drag ? '<span class="drag-grip" data-drag-handle title="拖动卡片排序" aria-hidden="true">⋮⋮</span>' : ''}${badge(c)}${place}<span class="sp"></span>${headerActions}${menu}</div>
    <div class="c-text">${esc(c.text)}</div>${m ? markBlock(c) : ''}
    <div class="c-foot">${foot}</div></article>`;
}

// What unfolds under a card in the Beat list: details, merged originals and refs.
export function cardMore(v, c) {
  const { list, esc } = v, nd = c.details?.length || 0, no = c.origins?.length || 0;
  return [nd ? list(c.details) : '', no ? `<div class="mini-sub">并入的原纲</div>${list(c.origins)}` : '', c.refs ? `<span class="refs">出处 ${esc(c.refs)}</span>` : ''].join('');
}

// One card in a Beat (any storyline). All placed cards can be edited or unplaced; only cards in the selected section can be dragged.
export function revealItem(v, c, mine) {
  const { UI, CAT_LABEL, esc, nameOf, lineOf, badge, cardMore, cardEditor, placedActions } = v;
  if (UI.editing === c.id && UI.editingPane === 'left') return cardEditor(c);
  const tag = `<span class="cat-tag ${c.cat}">${CAT_LABEL[c.cat]}</span><span class="ri-line">${esc(nameOf(lineOf(c.line)))}</span>`;
  const grip = mine ? '<span class="drag-grip" data-drag-handle title="拖动调整揭示顺序" aria-hidden="true">⋮⋮</span>' : '';
  const x = placedActions(c.id);
  const attrs = `data-drag="card" data-id="${c.id}" data-card="${c.id}"`;
  if (c.status === '已写') {
    const open = UI.open.has('w:' + c.id);
    return `<div class="ri done ${mine ? 'mine' : ''} ${open ? 'open' : ''}" data-card="${c.id}"><div class="ri-head"><button type="button" class="ri-ok" data-act="toggle-written" data-id="${c.id}" aria-pressed="true" title="已写 · 点击改回未写">✓</button>${tag}
      <button type="button" class="ri-text" data-act="toggle-row" data-id="${c.id}" aria-expanded="${open}" title="${open ? '收起' : '展开全文'}">${esc(c.text)}</button>${x}</div>${open ? `<div class="ri-more">${cardMore(c)}</div>` : ''}</div>`;
  }
  const key = `m:${c.id}`, n = (c.details?.length || 0) + (c.origins?.length || 0) + (c.refs ? 1 : 0);
  const label = [c.details?.length && `细节 ${c.details.length}`, c.origins?.length && `原纲 ${c.origins.length}`, c.refs && '出处'].filter(Boolean).join(' · ');
  return `<div class="ri todo ${mine ? 'mine' : ''}" ${attrs}><div class="ri-head">${grip}${badge(c)}${tag}${mine ? '<span class="ri-mine">本线</span>' : ''}${x}</div>
    <div class="mini-text">${esc(c.text)}</div>${n ? `<details class="mini-more" data-key="${esc(key)}" ${UI.open.has(key) ? 'open' : ''}><summary>${label}</summary>${cardMore(c)}</details>` : ''}</div>`;
}

// Move a card to another storyline; it keeps its category and Beat placement.
export function placedActions(v, id) {
  return `<button type="button" class="btn tiny quiet" data-act="edit-card" data-edit-pane="left" data-id="${id}" title="编辑卡片" aria-label="编辑卡片">✎</button><button type="button" class="x" data-act="unplace" data-id="${id}" title="移出大纲，退回故事线" aria-label="移出大纲，退回故事线">×</button>`;
}

export function lineSelect(v, c) {
  const { S, sections, nameOf, esc } = v;
  const groups = sections(S.lines.filter(l => l.id !== c.line)).map(s => `<optgroup label="${esc(s.name)}">${s.lines.map(l => `<option value="${l.id}">${esc(nameOf(l))}</option>`).join('')}</optgroup>`).join('');
  return `<select data-change="move-line" data-id="${c.id}" aria-label="转到其他故事线"><option value="">转到…</option>${groups}</select>`;
}

export function cardEditor(v, c) {
  const { esc, UI } = v, key = 'card:' + c.id, draft = UI.drafts?.[key];
  return `<form class="card editor ${c.cat}" data-form="card" data-draft="${key}" data-drag="card" data-id="${c.id}" data-locked>
    <label class="field">内容<textarea name="text" rows="4">${esc(draft?.text ?? c.text)}</textarea></label>
    <label class="field">细节（每行一条）<textarea name="details" rows="3">${esc(draft?.details ?? (c.details || []).join('\n'))}</textarea></label>
    <div class="form-actions"><button class="btn small primary" type="submit">保存</button><button class="btn small" type="button" data-act="cancel-edit">取消</button></div></form>`;
}

export function composer(v, cat) {
  const { CAT_LABEL, UI, esc } = v, key = `new:${UI.line}:${cat}`;
  return `<form class="card editor composer ${cat}" data-form="new" data-draft="${key}" data-cat="${cat}">
    <div class="composer-caption">新增到 ${CAT_LABEL[cat]} 末尾</div>
    <label class="field">内容<textarea name="text" rows="3" placeholder="发生了什么">${esc(UI.drafts?.[key]?.text || '')}</textarea></label>
    <div class="form-actions"><button class="btn small primary" type="submit">添加</button><button class="btn small" type="button" data-act="cancel-compose">取消</button></div></form>`;
}

export function rankPanel(v) {
  const { S, KB_TYPE, esc, list } = v;
  const used = n => S.lines.filter(l => l.parts.includes(n)).length;
  const item = (n, i) => `<li class="rank-item" data-drag="rank" data-id="${esc(n)}"><span class="grip" aria-hidden="true">⋮⋮</span><span class="rk">${i + 1}</span>
    <span class="rn">${esc(n)}</span><span class="rt">${esc(KB_TYPE[n] || '手填')}</span><small>${used(n)} 条</small></li>`;
  return `<div class="pop rank-pop" role="dialog" aria-label="参与者排序"><div class="pop-head"><b>参与者排序</b>
    <button class="btn small quiet" data-act="toggle-rank" aria-label="关闭">×</button></div>
    <p class="hint">拖动调整 section 先后和名字前缀次序。每条故事线列在它的标志性参与者下。</p>
    <ol class="rank-list" data-zone="rank" data-accept="rank">${S.ranking.map(item).join('')}</ol></div>`;
}

export function linePreview(v, d) {
  const { rankOf } = v;
  const parts = [...d.parts].sort((a, b) => rankOf(a) - rankOf(b));
  return `${parts.join(' × ') || '（参与者）'}：${d.title || '（标题）'}`;
}
export function lineDialog(v) {
  const { DATA, UI, KB_TYPE, rankOf, esc, list, linePreview } = v;
  const d = UI.dialog, parts = [...d.parts].sort((a, b) => rankOf(a) - rankOf(b));
  const chip = p => `<span class="part">${esc(p)}<small>${esc(KB_TYPE[p] || '手填')}</small>
    <button type="button" class="x" data-act="drop-part" data-name="${esc(p)}" ${d.parts.length < 2 ? 'disabled title="至少保留一个参与者"' : 'title="移除"'}>×</button></span>`;
  return `<div class="modal-back"><form class="modal" data-form="line" aria-label="故事线">
    <h3>${d.id ? '编辑故事线' : '新建故事线'}</h3>
    <div class="preview" id="line-preview">${esc(linePreview(d))}</div>
    <label class="field">标题<input name="title" value="${esc(d.title)}" data-input="line-title" autocomplete="off"></label>
    <div class="field">参与者（至少一个，名字前半按参与者排序自动生成）<div class="parts">${parts.map(chip).join('') || '<span class="muted">还没有参与者</span>'}</div>
      <div class="add-part"><input name="part" list="kb-names" placeholder="从资料库选人物、组织、地点、物件，或直接填写" autocomplete="off">
      <button class="btn small" type="button" data-act="add-part">添加</button></div>
      <datalist id="kb-names">${DATA.kb.map(k => `<option value="${esc(k.name)}">${esc(k.type)}</option>`).join('')}</datalist></div>
    <label class="field">标志性参与者<select name="lead" ${parts.length ? '' : 'disabled'}>${parts.map(p => `<option value="${esc(p)}" ${p === d.lead ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    <div class="form-actions"><button class="btn small primary" type="submit" id="line-save" ${d.parts.length && d.title.trim() ? '' : 'disabled'}>保存</button>
      <button class="btn small" type="button" data-act="close-dialog">取消</button>${d.id ? `<button type="button" class="btn small danger" data-act="delete-line" data-id="${d.id}">删除故事线</button>` : ''}</div></form></div>`;
}
