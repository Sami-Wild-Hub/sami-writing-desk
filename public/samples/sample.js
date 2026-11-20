// Shared sample behaviour: side drawer, 校稿台 placeholder, search overlay (/ or ⌘K), toast.
(() => {
  const S = window.SAMPLE;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  window.toast = (text) => {
    const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
    document.body.append(t); setTimeout(() => t.remove(), 1800);
  };

  // drawer (phone): the left column slides in
  const side = $('.side'), scrim = $('.scrim');
  const drawer = (open) => { side?.classList.toggle('show', open); scrim?.classList.toggle('show', open); };
  document.querySelectorAll('[data-drawer]').forEach((b) => b.addEventListener('click', () => drawer(true)));
  scrim?.addEventListener('click', () => drawer(false));
  side?.addEventListener('click', (e) => { if (e.target.closest('a[href]') && innerWidth <= 860) drawer(false); });

  document.querySelectorAll('[data-soon]').forEach((b) => b.addEventListener('click', () => toast('校稿台：之后上线，这里先留位置')));

  /* ---------- search ---------- */
  if (!S) return;
  const index = [];
  S.owners.forEach((o) => index.push({ sec: '人物与设定', title: o.name, text: o.desc, href: `reader.html#o-${o.id}` }));
  Object.entries(S.points).forEach(([pid, p]) => index.push({ sec: '事件', title: `${S.pid(pid)} ${p.title}${pid.includes('@') ? ' · ' + pid.split('@')[1] : ''}`, text: `${p.t}。${p.time}${p.story}`, href: `reader.html#e-${pid}` }));
  S.chapter4.forEach((text, i) => index.push({ sec: '正文', title: `第4章 · ${i + 1}段`, text, href: `reader.html#ch4:p${i + 1}` }));
  index.push({ sec: '总览', title: '总目录', text: '故事知识库 已处理正文 人物 组织 地点 物件 议题', href: 'reader.html#index' });
  const secs = ['全部', '人物与设定', '事件', '正文', '总览'];

  const box = document.createElement('div');
  box.className = 'search'; box.hidden = true;
  box.innerHTML = `<div class="search-box" role="dialog" aria-label="搜索">
    <div class="search-top"><svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
      <input type="text" enterkeyhint="search" placeholder="人物、事件、伏笔、原文…" aria-label="搜索小说知识库" autocomplete="off">
      <button class="iconbtn" data-close aria-label="关闭"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="search-chips"></div><div class="search-list"></div>
    <div class="search-foot">↑↓ 选择 · Enter 打开 · Esc 关闭 · 正文结果直接跳到段落</div></div>`;
  document.body.append(box);
  const input = $('input', box), list = $('.search-list', box), chips = $('.search-chips', box);
  let filter = '全部', sel = 0, hits = [];

  const run = () => {
    const q = input.value.trim();
    const all = q ? index.filter((x) => x.title.includes(q) || x.text.includes(q)) : [];
    const counts = Object.fromEntries(secs.map((s) => [s, s === '全部' ? all.length : all.filter((x) => x.sec === s).length]));
    chips.innerHTML = secs.map((s) => `<button class="chip" aria-pressed="${s === filter}" data-s="${s}">${s}${q ? `<span class="n">${counts[s]}</span>` : ''}</button>`).join('');
    hits = all.filter((x) => filter === '全部' || x.sec === filter)
      .sort((a, b) => secs.indexOf(a.sec) - secs.indexOf(b.sec) || Number(b.title.includes(q)) - Number(a.title.includes(q)));
    if (!q) { list.innerHTML = `<h5>最近查看</h5>` + ['reader.html#o-shen|沈砚秋|人物与设定', 'reader.html#e-005|#005 灯塔失火|事件', 'reader.html#ch4:p12|第4章 · 12段|正文'].map((r) => { const [h, t, s] = r.split('|'); return `<a class="hit" href="${h}"><b>${t}</b><small>${s}</small></a>`; }).join(''); hits = [...list.querySelectorAll('.hit')]; sel = 0; mark(); return; }
    if (!hits.length) { list.innerHTML = `<div class="search-empty">没有找到“${esc(q)}”</div>`; return; }
    const hl = (s) => esc(s).split(esc(q)).join(`<mark>${esc(q)}</mark>`);
    const snip = (t) => { const i = t.indexOf(q); return i < 0 ? t.slice(0, 70) : (i > 24 ? '…' : '') + t.slice(Math.max(0, i - 24), i + q.length + 60); };
    let h = '', last = '';
    hits.forEach((x) => { if (x.sec !== last) { last = x.sec; h += `<h5>${x.sec}</h5>`; } h += `<a class="hit" href="${x.href}"><b>${hl(x.title)}</b><small>${hl(snip(x.text))}</small></a>`; });
    list.innerHTML = h; hits = [...list.querySelectorAll('.hit')]; sel = 0; mark();
  };
  const mark = () => hits.forEach((a, i) => a.classList.toggle('sel', i === sel));
  window.openSearch = (q = '') => { box.hidden = false; input.value = q; run(); input.focus(); };
  const close = () => { box.hidden = true; };
  input.addEventListener('input', run);
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { filter = b.dataset.s; run(); input.focus(); } });
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-close]') || e.target.closest('.hit')) close(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(1, hits.length); mark(); hits[sel]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter' && hits[sel]) { location.href = hits[sel].href; close(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.hidden) close();
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
    if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); openSearch(); }
  });
  document.querySelectorAll('[data-search]').forEach((b) => b.addEventListener('click', () => openSearch()));
})();
