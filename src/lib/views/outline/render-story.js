// 故事线 tab: storyline picker, other storylines per Beat, this storyline per Beat (reveal order), and the storyline itself (time order).
export function renderStory(v) {
  const { UI, lineOf, picker, beatsGrid, selfPane } = v;
  const line = lineOf(UI.line);
  return `<div class="story"><section class="beats-pane" data-keep="beats">${beatsGrid(line)}</section>${picker(line)}
    <section class="self-pane">${selfPane(line)}</section></div>`;
}

// Sits between the Beat grid and the storyline; opens leftward over the grid, also while a card is dragged onto it.
export function picker(v, line) {
  const { UI, nameOf, countOf, sections, esc } = v;
  const item = l => `<button class="pick-line" role="radio" aria-checked="${l.id === line.id}" data-act="select-line" data-id="${l.id}" data-zone="line" data-accept="card" data-line="${l.id}" data-nomark>
    <span>${esc(nameOf(l))}</span><small>${countOf(l.id)}</small></button>`;
  const panel = `<div class="picker-panel" data-keep="picker"><div class="picker-top"><b>选择故事线</b><small class="muted" title="未排 | 已排 | 总数">未排|已排|total</small>
    <button class="btn tiny quiet" data-act="new-line">＋ 新建故事线</button></div><p class="hint">把卡片拖到某条线上即转过去。</p>
    <div role="radiogroup" aria-label="故事线">${sections().map(s => `<div class="sec-name">${esc(s.name)}</div>${s.lines.map(item).join('')}`).join('')}</div></div>`;
  return `<aside class="picker ${UI.picker ? 'open' : ''}" data-drag-open><button class="picker-strip" data-act="toggle-picker" aria-expanded="${UI.picker}" title="选择故事线">
    <span class="chev" aria-hidden="true"></span><span class="strip-label">故事线</span><span class="strip-name">${esc(nameOf(line))}</span></button>${panel}</aside>`;
}

// A Part is written once it has placed cards and every one of them (any storyline) is 已写.
export function partState(v, act) {
  const { S, BEAT_IDS, BEAT } = v;
  const ids = BEAT_IDS.filter(b => String(BEAT[b].act) === String(act)).flatMap(b => S.reveal[b]);
  const written = ids.filter(id => S.cards[id]?.status === '已写').length;
  return { total: ids.length, written, done: ids.length > 0 && written === ids.length };
}

// Written Parts start folded; the reader's own fold/unfold is remembered in UI.open.
export function partOpen(v, act) {
  const { UI } = v;
  return v.partState(act).done ? UI.open.has(`part-open:${act}`) : !UI.open.has(`part-shut:${act}`);
}

// Left pane: per Part, one reveal-order list per Beat of every placed card (all storylines); 未排 cards are not here.
export function beatsGrid(v, line) {
  const { S, BEAT_IDS, BEAT, beatLong, esc, revealItem } = v;
  const head = `<div class="bg-head"><b>各 ${v.actOnly ? 'Part' : 'Beat'} 已排的卡</b><span>所有故事线 · 揭示顺序 · 本线卡片有描边，可拖动</span></div>`;
  const acts = [...new Set(BEAT_IDS.map(b => BEAT[b].act))];
  const partHead = a => {
    const st = v.partState(a), open = v.partOpen(a), only = v.actOnly && BEAT_IDS.find(b => BEAT[b].act === a);
    const sign = st.done ? `<span class="part-done" title="本 Part 已排的卡全部已写">✓ 已写完</span>` : st.total ? `<small class="part-count">${st.written}/${st.total} 已写</small>` : '';
    return `<button class="bg-part ${st.done ? 'done' : ''}" data-act="toggle-part" data-act-no="${esc(a)}" aria-expanded="${open}">
      <span class="chev" aria-hidden="true"></span><b>Part ${esc(a)}</b>${only ? `<span class="part-title">${esc(BEAT[only].title)}</span>` : ''}${sign}</button>`;
  };
  const beatList = b => (v.actOnly ? '' : `<div class="bg-beat"><b>${beatLong(b)}</b><span>${esc(BEAT[b].title)}</span></div>`) +
    `<div class="bg-list" data-zone="beat" data-accept="card" data-beat="${b}">${S.reveal[b].map(id => revealItem(S.cards[id], S.cards[id].line === line.id)).join('')}</div>`;
  const parts = acts.map(a => partHead(a) + (v.partOpen(a) ? BEAT_IDS.filter(b => BEAT[b].act === a).map(beatList).join('') : '')).join('');
  return `<div class="bgrid">${head}${parts}</div>`;
}

export function selfPane(v, line) {
  const { UI, CATS, nameOf, esc, selfCol } = v;
  return `<div class="self-head"><div class="self-title"><span class="kicker">故事线 · 时间顺序</span><h2>${esc(nameOf(line))}</h2></div>
    <button class="chip" data-act="toggle-unplaced" aria-pressed="${UI.onlyUnplaced}" title="隐藏已排和已写的卡">只看未排</button>
    <button class="btn" data-act="edit-line" data-id="${line.id}">编辑名称与参与者</button></div>
    <div class="self-cols">${CATS.map(cat => selfCol(line, cat)).join('')}</div>`;
}

export function selfCol(v, line, cat) {
  const { UI, S, CAT_LABEL, list, cardFull, cardEditor, composer, lineSelect } = v;
  const all = S.time[line.id][cat], ids = UI.onlyUnplaced ? all.filter(id => S.cards[id].status === '未排') : all;
  const hidden = all.length - ids.length;
  const actions = id => `<button class="btn tiny" data-act="edit-card" data-id="${id}">编辑</button>${lineSelect(S.cards[id])}${v.moveSelect(id)}<details class="card-menu"><summary class="btn tiny" aria-label="更多卡片操作">更多</summary><button class="btn tiny danger" data-act="delete-card" data-id="${id}">删除</button></details>`;
  const card = id => (UI.editing === id ? cardEditor(S.cards[id]) : cardFull(S.cards[id], { drag: true, mark: false, actions: actions(id) }));
  return `<section class="self-col ${cat}"><div class="col-head"><span class="era">${CAT_LABEL[cat]}</span><span class="n">${UI.onlyUnplaced ? `${ids.length} / ${all.length}` : all.length} 张</span>
    <button class="inline-plus" data-act="compose" data-cat="${cat}">＋ 新增</button></div>
    <div class="col-body" data-keep="col-${cat}" data-zone-area><div class="col-list" data-zone="time" data-accept="card" data-cat="${cat}">${ids.map(card).join('')}</div>
    ${hidden ? `<button class="btn tiny quiet hidden-note" data-act="toggle-unplaced">另有 ${hidden} 张已排/已写，点此显示</button>` : ''}${UI.composing === cat ? composer(cat) : ''}</div></section>`;
}
