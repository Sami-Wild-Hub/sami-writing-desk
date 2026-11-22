// Validate the sole supported outline format at the shared browser/worker boundary.
export const CATEGORIES = ['past', 'current', 'undecided'];
const unique = xs => new Set(xs).size === xs.length;
const strings = xs => Array.isArray(xs) && xs.every(x => typeof x === 'string');
const require = (ok, why) => { if (!ok) throw Error(why); };

export function validateData(data) {
  require(data?.schema_version === '6.0', '需要 v6 大纲数据；请先完成一次性迁移');
  for (const field of ['plot_units', 'storyline_groups', 'beats', 'participants']) require(Array.isArray(data[field]), '缺少数组：' + field);
  require(strings(data.participant_order) && unique(data.participant_order), '参与者排序无效');
  require(data.beats.length && unique(data.beats.map(b => b.beat_id)), 'Beat 无效或重复');
  require(data.beats.every(b => typeof b.beat_id === 'string' && b.beat_id && Number.isFinite(b.act) && Number.isFinite(b.beat) && (b.title == null || typeof b.title === 'string')), 'Beat 字段无效');
  require(data.storyline_groups.length && unique(data.storyline_groups.map(g => g.id)), '故事线无效或重复');
  require(data.participants.every(p => typeof p.name === 'string' && typeof p.type === 'string'), '参与者目录无效');
  const groups = new Set(data.storyline_groups.map(g => g.id));
  const ids = new Set(data.plot_units.map(u => u.unit_id));
  require(ids.size === data.plot_units.length, '卡片 ID 重复');
  for (const u of data.plot_units) for (const field of ['details', 'source_unit_ids']) require(u[field] == null || strings(u[field]), '卡片列表字段无效：' + field);
  const merged = new Set(data.plot_units.flatMap(u => u.source_unit_ids || []));
  for (const u of data.plot_units) {
    require(typeof u.unit_id === 'string' && u.unit_id && groups.has(u.storyline_group_id) && CATEGORIES.includes(u.category) && typeof u.content === 'string', '卡片字段无效：' + u.unit_id);
    for (const field of ['details', 'source_unit_ids']) require(u[field] == null || strings(u[field]), '卡片列表字段无效：' + field);
    for (const field of ['element_title', 'source_refs', 'status']) require(u[field] == null || typeof u[field] === 'string', '卡片文字字段无效：' + field);
    require((u.source_unit_ids || []).every(id => ids.has(id) && id !== u.unit_id), '并入的原纲引用无效');
  }
  const units = Object.fromEntries(data.plot_units.map(u => [u.unit_id, u])), ordered = [];
  for (const g of data.storyline_groups) {
    require(typeof g.id === 'string' && g.id && typeof g.title === 'string' && g.title.trim(), '故事线标题无效');
    require(strings(g.participants) && g.participants.length && unique(g.participants) && g.participants.every(p => data.participant_order.includes(p)), '每条线至少一个已排序参与者');
    for (const c of CATEGORIES) {
      const col = g.time_order?.[c]; require(strings(col), '缺少时间顺序栏');
      require(col.every(id => units[id]?.storyline_group_id === g.id && units[id]?.category === c && !merged.has(id)), '时间顺序引用无效'); ordered.push(...col);
    }
  }
  require(unique(ordered) && ordered.length === data.plot_units.filter(u => !merged.has(u.unit_id)).length, '每张可见卡必须在时间顺序中恰好一次');
}

export function validatePlan(data, plan) {
  require(plan?.schema_version === '6.0' && Array.isArray(plan.placements), '需要 v6 编排数据');
  require(plan.beat_notes && typeof plan.beat_notes === 'object' && !Array.isArray(plan.beat_notes), 'Beat 备注无效');
  const beats = new Set(data.beats.map(b => b.beat_id));
  const ids = new Set(data.storyline_groups.flatMap(g => CATEGORIES.flatMap(c => g.time_order[c])));
  require(unique(plan.placements.map(p => p.unit_id)), '卡片不能重复入 Beat');
  for (const p of plan.placements) require(ids.has(p.unit_id) && beats.has(p.beat_id) && Number.isFinite(p.order), '编排引用无效或顺序无效');
  for (const [id, note] of Object.entries(plan.beat_notes)) require(beats.has(id) && typeof note === 'string', 'Beat 备注引用无效');
}
