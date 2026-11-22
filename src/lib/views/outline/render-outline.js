// 大纲 tab: choose a Beat, see it in Past / Current / 未确定, pick cards in from the library; all grouped by participant.
export function renderOutline(v) {
  const { CATS, beatNav, beatHeader, boardLane, library } = v;
  return `<div class="ol"><nav class="ol-side" aria-label="Act 与 Beat">${beatNav()}</nav>
    <main class="ol-main">${beatHeader()}<div class="ol-board">${CATS.map(boardLane).join('')}</div></main>
    <aside class="library" data-keep="library" aria-label="素材库">${library()}</aside></div>`;
}

export function beatNav(v) {
  const { DATA, UI, S, BEAT, esc } = v;
  const acts = [...new Set(DATA.beats.map(b => b.act))];
  const beat = b => `<button class="beat ${b.id === UI.beat ? 'active' : ''}" data-act="choose-beat" data-id="${b.id}" aria-current="${b.id === UI.beat ? 'step' : 'false'}">
    <span class="beat-no">Beat ${b.beat}</span><span class="beat-name">${esc(b.title)}</span><small>${S.reveal[b.id].length}</small></button>`;
  return `<div class="side-h">ACT / BEAT</div>` + acts.map(a => `<div class="actname">ACT ${a}</div>${DATA.beats.filter(b => b.act === a).map(beat).join('')}`).join('');
}

export function beatHeader(v) {
  const { UI, BEAT, beatLong, esc } = v;
  const b = BEAT[UI.beat];
  return `<header class="beatbar"><h2>${esc(beatLong(b.id).toUpperCase())}</h2>
    <div class="beat-title">${esc(b.title) || '<span class="muted">（未命名）</span>'}</div><label class="field">本 Beat 备注<textarea id="beat-note" data-input="beat-note" rows="2">${esc(b.note)}</textarea></label></header>`;
}

export function lineHead(v, l) {
  const { nameOf, esc } = v;
  return `<div class="line-head"><span class="line-name">${esc(nameOf(l))}</span>
    <button class="quiet tiny" data-act="edit-line" data-id="${l.id}" title="改名称与参与者">✎</button>
    <button class="quiet tiny" data-act="open-line" data-id="${l.id}" title="在故事线 tab 打开">↗</button></div>`;
}

export function moveSelect(v, id) {
  const { UI, BEAT_IDS, BEAT, beatShort, esc } = v;
  const opts = BEAT_IDS.filter(b => b !== UI.beat).map(b => `<option value="${b}">${beatShort(b)}${BEAT[b].title ? ' · ' + esc(BEAT[b].title) : ''}</option>`).join('');
  return `<select data-change="move-beat" data-id="${id}" aria-label="移到其他 Beat"><option value="">移到…</option>${opts}</select>`;
}

// One category of the active Beat: participant section → storyline → cards in reveal order.
export function boardLane(v, cat) {
  const { UI, S, CAT_LABEL, sections, esc, cardFull, lineHead, moveSelect } = v;
  const ids = S.reveal[UI.beat].filter(id => S.cards[id].cat === cat);
  const used = new Set(ids.map(id => S.cards[id].line));
  const body = sections(S.lines.filter(l => used.has(l.id))).map(s => `<div class="sec-name">${esc(s.name)}</div>` + s.lines.map(l =>
    `<div class="ol-line">${lineHead(l)}${ids.filter(id => S.cards[id].line === l.id).map(id => cardFull(S.cards[id], {
      where: false, actions: `<button data-act="unplace" data-id="${id}">移出</button>${moveSelect(id)}` })).join('')}</div>`).join('')).join('');
  return `<section class="lane ${cat}"><div class="col-head"><span class="era">${CAT_LABEL[cat]}</span><span class="n">${ids.length} 张</span></div>
    ${body || '<div class="empty">这一拍还没有这一类的卡</div>'}</section>`;
}

export function matches(v, c, l, q) {
  const { nameOf } = v;
  return [nameOf(l), c.title, c.text, ...(c.details || [])].some(x => x.toLowerCase().includes(q));
}

// Library: every storyline once, under its section; cards not in this Beat, by category in time order.
export function library(v) {
  const { UI, S, D, CATS, CAT_LABEL, beatShort, nameOf, sections, esc, cardFull, matches } = v;
  const q = UI.search.trim().toLowerCase();
  let total = 0;
  const lineBlock = l => {
    const per = CATS.map(cat => [cat, S.time[l.id][cat].filter(id => D.placedIn[id]?.beat !== UI.beat && UI.filters.has(S.cards[id].status === '已写' ? 'written' : D.placedIn[id] ? 'placed' : 'unplaced') && (!q || matches(S.cards[id], l, q)))]);
    const n = per.reduce((a, [, xs]) => a + xs.length, 0);
    if (q && !n) return '';
    total += n;
    const pick = id => {
      const p = D.placedIn[id];
      return `<button class="pick" data-act="pick" data-id="${id}">${p ? `从 ${beatShort(p.beat)} 移入本拍` : '＋ 选入本拍'}</button>`;
    };
    const sub = ([cat, xs]) => `<div class="sub ${cat}"><span class="era">${CAT_LABEL[cat]}</span><span class="n">${xs.length}</span></div>
      ${xs.map(id => cardFull(S.cards[id], { actions: pick(id) })).join('') || '<div class="empty">没有可选的卡</div>'}`;
    const open = q || UI.open.has(`lib:${l.id}`);
    return `<details class="lib-line" data-key="lib:${l.id}" ${open ? 'open' : ''}><summary><span class="line-name">${esc(nameOf(l))}</span>
      <small>${n} 可选</small><button class="quiet tiny" data-act="edit-line" data-id="${l.id}" title="改名称与参与者">✎</button></summary>
      <div class="lib-inner">${per.map(sub).join('')}</div></details>`;
  };
  const body = sections().map(s => { const inner = s.lines.map(lineBlock).join(''); return inner && `<div class="sec-name">${esc(s.name)}</div>${inner}`; }).join('');
  return `<div class="lib-head"><h4>素材库</h4><span class="muted">${total} 张可选</span></div>
    <input type="search" data-input="search" value="${esc(UI.search)}" placeholder="搜索故事线或卡片…" aria-label="搜索素材">
    <div class="state-filter" role="group" aria-label="素材状态">${[['unplaced','待排'],['placed','已排'],['written','已写']].map(([key,label]) => `<button data-act="filter" data-filter-state="${key}" aria-pressed="${UI.filters.has(key)}">${label}</button>`).join('')}</div><div class="lib-body">${body || '<div class="empty">没有匹配的卡</div>'}</div>`;
}
