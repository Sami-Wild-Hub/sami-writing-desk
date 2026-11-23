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
    <button class="quiet tiny" data-act="new-line">＋ 新建故事线</button></div><p class="hint">把卡片拖到某条线上即转过去。</p>
    <div role="radiogroup" aria-label="故事线">${sections().map(s => `<div class="sec-name">${esc(s.name)}</div>${s.lines.map(item).join('')}`).join('')}</div></div>`;
  return `<aside class="picker ${UI.picker ? 'open' : ''}" data-drag-open><button class="picker-strip" data-act="toggle-picker" aria-expanded="${UI.picker}" title="选择故事线">
    <span class="strip-label">${UI.picker ? '▸' : '◂'} 故事线</span><span class="strip-name">${esc(nameOf(line))}</span></button>${panel}</aside>`;
}

// Parts 2 and 3 share one grid: a row per Beat category, so both sides line up.
export function beatsGrid(v, line) {
  const { S, CATS, CAT_LABEL, BEAT_IDS, BEAT, beatLong, esc, cardMini, refChip } = v;
  const head = `<div class="bg-head"><span>Beat</span><span>其他故事线 · 已排（只读）</span><span>本线 · 揭示顺序</span></div>`;
  const rows = BEAT_IDS.map(b => `<div class="bg-beat"><b>${beatLong(b)}</b><span>${esc(BEAT[b].title)}</span></div>` + CATS.map(cat => {
    const ids = S.reveal[b].filter(id => S.cards[id].cat === cat);
    const others = ids.filter(id => S.cards[id].line !== line.id), mine = ids.filter(id => S.cards[id].line === line.id);
    return `<div class="bg-row" data-zone-area><div class="bg-cat ${cat}">${CAT_LABEL[cat]}</div>
      <div class="bg-other ${cat}">${others.map(id => refChip(S.cards[id])).join('')}</div>
      <div class="bg-mine ${cat}" data-zone="beat" data-accept="card" data-beat="${b}" data-cat="${cat}">${mine.map(id => cardMini(S.cards[id])).join('')}</div></div>`;
  }).join('')).join('');
  return `<div class="bgrid">${head}${rows}</div>`;
}

export function selfPane(v, line) {
  const { CATS, nameOf, esc, selfCol } = v;
  return `<div class="self-head"><div class="self-title"><span class="kicker">故事线 · 时间顺序</span><h2>${esc(nameOf(line))}</h2></div>
    <button class="btn" data-act="edit-line" data-id="${line.id}">编辑名称与参与者</button></div>
    <div class="self-cols">${CATS.map(cat => selfCol(line, cat)).join('')}</div>`;
}

export function selfCol(v, line, cat) {
  const { UI, S, CAT_LABEL, list, cardFull, cardEditor, composer, lineSelect } = v;
  const ids = S.time[line.id][cat];
  const actions = id => `<button class="tiny" data-act="edit-card" data-id="${id}">编辑</button>${lineSelect(S.cards[id])}<button class="tiny danger" data-act="delete-card" data-id="${id}">删除</button>`;
  const card = id => (UI.editing === id ? cardEditor(S.cards[id]) : cardFull(S.cards[id], { drag: true, mark: false, actions: actions(id) }));
  return `<section class="self-col ${cat}"><div class="col-head"><span class="era">${CAT_LABEL[cat]}</span><span class="n">${ids.length} 张</span>
    <button class="inline-plus" data-act="compose" data-cat="${cat}">＋ 新增</button></div>
    <div class="col-body" data-keep="col-${cat}" data-zone-area><div class="col-list" data-zone="time" data-accept="card" data-cat="${cat}">${ids.map(card).join('')}</div>
    ${UI.composing === cat ? composer(cat) : ''}</div></section>`;
}
