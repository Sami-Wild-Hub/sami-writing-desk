// 故事线 tab: storyline picker, other storylines per Beat, this storyline per Beat (reveal order), and the storyline itself (time order).
export function renderStory(v) {
  const { UI, lineOf, picker, beatsGrid, selfPane } = v;
  const line = lineOf(UI.line);
  return `<div class="story"><section class="beats-pane" id="outline-parts" data-keep="beats" tabindex="-1">${beatsGrid(line)}</section>${picker(line)}
    <section class="self-pane">${selfPane(line)}</section></div>`;
}

// Sits between the Beat grid and the storylines; opens leftward over the grid, also while a card is dragged onto it.
// Picking a main character (section) shows all of its storylines; picking one storyline shows the same section, scrolled to it.
export function picker(v, line) {
  const { nameOf, countOf, sections, esc, UI } = v, sec = v.sectionOf(line);
  const item = l => `<button class="pick-line" aria-current="${l.id === line.id}" data-in="${sec.lines.includes(l)}" data-act="select-line" data-id="${l.id}" data-zone="line" data-accept="card" data-line="${l.id}" data-nomark>
    <span>${esc(nameOf(l))}</span><small>${countOf(l.id)}</small></button>`;
  const head = s => `<button class="sec-name sec-pick" data-act="select-section" data-name="${esc(s.name)}" aria-pressed="${s.name === sec.name}" title="显示 ${esc(s.name)} 的全部故事线">${esc(s.name)}<small>${s.lines.length} 条</small></button>`;
  const panel = `<div class="picker-panel" data-keep="picker"><div class="picker-top"><b>选择主要人物</b><small class="muted" title="未排 | 已排 | 总数">未排|已排|total</small>
    </div><p class="hint">点人物名显示其全部故事线；把卡片拖到某条线上即转过去。</p>
    <div aria-label="故事线">${sections().map(s => `${head(s)}${s.lines.map(item).join('')}`).join('')}</div><button class="btn small quiet" data-act="new-line">＋ 新建故事线</button></div>`;
  return `<aside class="picker side ${UI.picker ? 'open' : ''}" aria-label="人物与故事线" data-drag-open><div class="outline-drawer-head"></div><button class="picker-strip" data-act="toggle-picker" aria-expanded="${UI.picker}" title="选择主要人物">
    <span class="chev" aria-hidden="true"></span><span class="strip-label">主要人物</span><span class="strip-name">${esc(sec.name)}</span></button>${panel}<footer class="outline-drawer-foot"><button class="btn quiet" data-act="show-parts">各 Part 已排的卡 ›</button><button class="btn quiet" data-act="drawer-rank">参与者排序</button><div data-recovery-slot></div></footer></aside>`;
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

// Left pane, per Part: 已写 cards folded by main character, then the 已排 cards of every storyline in reveal order; 未排 cards are not here.
export function beatsGrid(v, line) {
  const { S, BEAT_IDS, BEAT, beatLong, esc, revealItem } = v, own = new Set(v.sectionOf(line).lines.map(l => l.id));
  const head = `<div class="bg-head"><b>各 ${v.actOnly ? 'Part' : 'Beat'} 已排的卡</b><span>所有故事线 · 已写按人物收起 · 已排可按人物归档或按揭示顺序，右侧人物的卡可拖动</span></div>`;
  const acts = [...new Set(BEAT_IDS.map(b => BEAT[b].act))];
  const partHead = a => {
    const st = v.partState(a), open = v.partOpen(a), only = v.actOnly && BEAT_IDS.find(b => BEAT[b].act === a);
    const sign = st.done ? `<span class="part-done" title="本 Part 已排的卡全部已写">✓ 已写完</span>` : st.total ? `<small class="part-count">${st.written}/${st.total} 已写</small>` : '';
    return `<button class="bg-part ${st.done ? 'done' : ''}" data-act="toggle-part" data-act-no="${esc(a)}" aria-expanded="${open}">
      <span class="chev" aria-hidden="true"></span><b>Part ${esc(a)}</b>${only ? `<span class="part-title">${esc(BEAT[only].title)}</span>` : ''}${sign}</button>`;
  };
  // 已写 cards gather under the storyline's first-ranked participant (张予安 × 周念儿 → 张予安), one fold per person.
  const pillarOf = id => v.partsOf(v.lineOf(S.cards[id].line))[0];
  const written = b => {
    const ids = S.reveal[b].filter(id => S.cards[id].status === '已写');
    if (!ids.length) return '';
    const names = [...new Set(ids.map(pillarOf))].sort((x, y) => v.rankOf(x) - v.rankOf(y));
    const pillar = name => {
      const mine = ids.filter(id => pillarOf(id) === name), key = `pl:${b}:${name}`, ours = mine.some(id => own.has(S.cards[id].line));
      return `<details class="pillar ${ours ? 'own' : ''}" data-key="${esc(key)}" ${v.UI.open.has(key) ? 'open' : ''}><summary><span class="pl-name">${esc(name)}</span><small>${mine.length} 张已写</small></summary>
        <div class="pl-body">${mine.map(id => revealItem(S.cards[id], own.has(S.cards[id].line))).join('')}</div></details>`;
    };
    return `<div class="bg-written"><div class="bw-cap">✓ 已写 ${ids.length} 张 · 按主要人物</div>${names.map(pillar).join('')}</div>`;
  };
  const grouped = a => v.UI.open.has(`group-planned:${a}`);
  const planned = b => {
    const ids = S.reveal[b].filter(id => S.cards[id].status !== '已写');
    const zone = `data-zone="beat" data-accept="card" data-beat="${b}"`;
    const cards = xs => xs.map(id => revealItem(S.cards[id], own.has(S.cards[id].line))).join('');
    if (!grouped(BEAT[b].act) || !ids.length) return `<div class="bg-list" ${zone}>${cards(ids)}</div>`;
    const names = [...new Set(ids.map(pillarOf))].sort((x, y) => v.rankOf(x) - v.rankOf(y));
    const pillar = name => {
      const mine = ids.filter(id => pillarOf(id) === name), key = `planned-shut:${b}:${name}`, open = !v.UI.open.has(key);
      const ours = mine.some(id => own.has(S.cards[id].line));
      return `<section class="pillar planned-pillar ${ours ? 'own' : ''}">
        <button type="button" class="planned-pillar-head" data-act="toggle-planned-pillar" data-key-name="${esc(key)}" aria-expanded="${open}"><span class="chev" aria-hidden="true"></span><span class="pl-name">${esc(name)}</span><small>${mine.length} 张已排</small></button>
        ${open ? `<div class="pl-body bg-list" ${zone} data-pillar="${esc(name)}">${cards(mine)}</div>` : ''}</section>`;
    };
    return `<div class="bg-list bg-planned" ${zone}>${names.map(pillar).join('')}</div>`;
  };
  const beatList = b => (v.actOnly ? '' : `<div class="bg-beat"><b>${beatLong(b)}</b><span>${esc(BEAT[b].title)}</span></div>`) + written(b) + planned(b);
  const controls = a => {
    const st = v.partState(a);
    if (!st.total || st.done) return '';
    return `<div class="planned-controls"><span>已排 ${st.total - st.written} 张 · ${grouped(a) ? '按主要人物' : '按揭示顺序'}</span><button type="button" class="btn tiny" data-act="toggle-planned-group" data-act-no="${esc(a)}" aria-pressed="${grouped(a)}">${grouped(a) ? '恢复揭示顺序' : '按人物归档'}</button></div>`;
  };
  const parts = acts.map(a => partHead(a) + (v.partOpen(a) ? controls(a) + BEAT_IDS.filter(b => BEAT[b].act === a).map(beatList).join('') : '')).join('');
  return `<div class="bgrid">${head}${parts}</div>`;
}

export function selfPane(v, line) {
  const { UI, CATS, nameOf, countOf, esc, selfCol } = v, sec = v.sectionOf(line);
  const block = l => `<section class="self-line ${l.id === line.id ? 'current' : ''}" data-line-block="${l.id}"><div class="self-line-head"><h3>${esc(nameOf(l))}</h3>
    <small class="muted" title="未排 | 已排 | 总数">${countOf(l.id)}</small><button class="iconbtn" data-act="edit-line" data-id="${l.id}" title="编辑名称与参与者" aria-label="编辑故事线">✎</button></div>
    <div class="self-cols">${CATS.map(cat => selfCol(l, cat)).join('')}</div></section>`;
  return `<div class="self-head"><div class="self-title"><span class="kicker">主要人物 · ${sec.lines.length} 条故事线 · 时间顺序</span><h2>${esc(sec.name)}</h2></div>
    <button class="chip" data-act="toggle-unplaced" aria-pressed="${UI.onlyUnplaced}" title="隐藏已排和已写的卡">只看未排</button></div>
    <div class="self-lines" data-keep="self">${sec.lines.map(block).join('')}</div>`;
}

export function selfCol(v, line, cat) {
  const { UI, S, CAT_LABEL, cardFull, cardEditor, composer, lineSelect } = v;
  const all = S.time[line.id][cat], ids = UI.onlyUnplaced ? all.filter(id => S.cards[id].status === '未排') : all;
  const hidden = all.length - ids.length;
  const actions = id => `<button data-act="edit-card" data-id="${id}">编辑</button><label>转到故事线${lineSelect(S.cards[id])}</label><label>移到 Part / Beat${v.moveSelect(id)}</label><hr><button type="button" class="danger" data-act="delete-card" data-id="${id}">删除</button>`;
  const card = id => (UI.editing === id && UI.editingPane !== 'left' ? cardEditor(S.cards[id]) : cardFull(S.cards[id], { drag: true, mark: false, actions: actions(id) }));
  return `<section class="self-col ${cat}"><div class="col-head"><span class="era">${CAT_LABEL[cat]}</span><span class="n">${UI.onlyUnplaced ? `${ids.length} / ${all.length}` : all.length} 张</span>
    <button class="inline-plus" data-act="compose" data-cat="${cat}" data-line="${line.id}">＋ 新增</button></div>
    <div class="col-body" data-zone-area><div class="col-list" data-zone="time" data-accept="card" data-cat="${cat}" data-line="${line.id}">${ids.map(card).join('')}</div>
    ${!all.length ? `<div class="empty">暂无卡片 <button class="btn tiny" data-act="compose" data-cat="${cat}" data-line="${line.id}">＋ 新增</button></div>` : ''}${hidden ? `<button class="btn tiny quiet hidden-note" data-act="toggle-unplaced">另有 ${hidden} 张已排/已写，点此显示</button>` : ''}${UI.composing === cat && UI.line === line.id ? composer(cat) : ''}</div></section>`;
}
