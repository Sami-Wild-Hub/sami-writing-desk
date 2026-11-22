// Shared markup: top bar, cards, folds, participant ranking popover and the storyline dialog.
export function renderBar(v) {
  const { UI, S, D, undoStack } = v;
  const tab = (id, label) => `<button data-act="tab" data-tab="${id}" aria-current="${UI.tab === id ? 'page' : 'false'}">${label}</button>`;
  return `
    <nav class="tabs" aria-label="视图">${tab('outline', '大纲')}${tab('story', '故事线')}</nav>
    <span class="sp"></span>
    <span id="overall">${Object.keys(S.cards).length} 张 · ${Object.keys(D.placedIn).length} 已排</span>
    <button class="btn" data-act="toggle-rank" aria-expanded="${UI.rank}">参与者排序</button>
    <button class="btn" id="undo" data-act="undo" ${undoStack.length ? '' : 'disabled'} title="撤销上一步（Ctrl+Z）">↶ 撤销</button>`;
}

export function fold(v, key, label, body) {
  const { UI, esc } = v;
  return `<details class="fold" data-key="${esc(key)}" ${UI.open.has(key) ? 'open' : ''}><summary>${label}</summary>${body}</details>`;
}

// Full card: badge, where it is placed, text, details and origins, actions.
export function cardFull(v, c, { actions = '', where = true, drag = false, mark = true } = {}) {
  const { D, beatShort, esc, list, markBlock, statusClass, fold } = v;
  const p = D.placedIn[c.id], m = mark && D.marks[c.id];
  const place = where ? `<span class="where ${p ? 'placed' : ''}">${p ? '排在 ' + beatShort(p.beat) : '未排'}</span>` : '';
  const foot = [
    c.details?.length ? fold(`d:${c.id}`, `细节 ${c.details.length}`, list(c.details)) : '',
    c.origins?.length ? fold(`o:${c.id}`, `并入的原纲 ${c.origins.length}`, list(c.origins)) : '',
    c.refs ? `<span class="refs">出处 ${esc(c.refs)}</span>` : '',
  ].join('');
  return `<article class="card ${c.cat} ${m ? 'marked' : ''}" ${drag ? `data-drag="card" data-id="${c.id}"` : ''} data-card="${c.id}">
    <div class="c-head"><span class="badge ${statusClass[c.status]}">${c.status}</span>${place}</div>
    ${c.title ? `<div class="c-title">${esc(c.title)}</div>` : ''}<div class="c-text">${esc(c.text)}</div>${m ? markBlock(c) : ''}
    <div class="c-foot">${foot}<span class="c-actions">${actions}</span></div></article>`;
}

// Compact card in a Beat cell of the current storyline.
export function cardMini(v, c) {
  const { D, cardLabel, esc, markBlock, statusClass } = v;
  return `<div class="mini ${c.cat} ${D.marks[c.id] ? 'marked' : ''}" data-drag="card" data-id="${c.id}" data-card="${c.id}" title="${esc(c.text)}">
    <div class="mini-head"><span class="badge ${statusClass[c.status]}">${c.status}</span><span class="mini-title">${esc(cardLabel(c))}</span>
    <button class="x" data-act="unplace" data-id="${c.id}" title="移出这一拍" aria-label="移出这一拍">×</button></div>${markBlock(c)}</div>`;
}

// Read-only reference to another storyline's card.
export function refChip(v, c) {
  const { lineOf, nameOf, cardLabel, esc } = v;
  const l = lineOf(c.line);
  return `<div class="ref" title="${esc(nameOf(l))}\n${esc(c.text)}"><span class="ref-line">${esc(nameOf(l))}</span><span class="ref-title">${esc(cardLabel(c))}</span></div>`;
}

export function cardEditor(v, c) {
  const { esc } = v;
  return `<form class="card editor ${c.cat}" data-form="card" data-drag="card" data-id="${c.id}" data-locked>
    <label class="field">标题<input name="title" value="${esc(c.title)}" placeholder="可留空"></label>
    <label class="field">内容<textarea name="text" rows="4">${esc(c.text)}</textarea></label>
    <label class="field">细节（每行一条）<textarea name="details" rows="3">${esc((c.details || []).join('\n'))}</textarea></label>
    <div class="form-actions"><button class="primary" type="submit">保存</button><button type="button" data-act="cancel-edit">取消</button></div></form>`;
}

export function composer(v, cat) {
  const { CAT_LABEL } = v;
  return `<form class="card editor composer ${cat}" data-form="new" data-cat="${cat}">
    <div class="composer-caption">新增到 ${CAT_LABEL[cat]} 末尾</div>
    <label class="field">标题<input name="title" placeholder="这一段的名字"></label>
    <label class="field">内容<textarea name="text" rows="3" placeholder="发生了什么"></textarea></label>
    <div class="form-actions"><button class="primary" type="submit">添加</button><button type="button" data-act="cancel-compose">取消</button></div></form>`;
}

export function rankPanel(v) {
  const { S, KB_TYPE, esc, list } = v;
  const used = n => S.lines.filter(l => l.parts.includes(n)).length;
  const item = (n, i) => `<li class="rank-item" data-drag="rank" data-id="${esc(n)}"><span class="grip" aria-hidden="true">⋮⋮</span><span class="rk">${i + 1}</span>
    <span class="rn">${esc(n)}</span><span class="rt">${esc(KB_TYPE[n] || '手填')}</span><small>${used(n)} 条</small></li>`;
  return `<div class="pop rank-pop" role="dialog" aria-label="参与者排序"><div class="pop-head"><b>参与者排序</b>
    <button class="quiet" data-act="toggle-rank" aria-label="关闭">×</button></div>
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
      <button type="button" data-act="add-part">添加</button></div>
      <datalist id="kb-names">${DATA.kb.map(k => `<option value="${esc(k.name)}">${esc(k.type)}</option>`).join('')}</datalist></div>
    <label class="field">标志性参与者<select name="lead" ${parts.length ? '' : 'disabled'}>${parts.map(p => `<option value="${esc(p)}" ${p === d.lead ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    <div class="form-actions"><button class="primary" type="submit" id="line-save" ${d.parts.length && d.title.trim() ? '' : 'disabled'}>保存</button>
      <button type="button" data-act="close-dialog">取消</button></div></form></div>`;
}
