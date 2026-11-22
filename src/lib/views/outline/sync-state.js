// Classify the shared outline sync state for the web status panel.
export function classify({ head = null, live = null, incoming = null, now = Date.now(), coordinator = null } = {}) {
  const synced = head?.synced ?? null;
  const repo = head?.repo ?? null;
  const stale = Boolean(live && synced && live.rev !== synced.rev);
  const conflict = Boolean(incoming && (!live?.over || live.over !== incoming.tree));
  const invalid = Boolean(repo?.error);
  const online = Boolean(coordinator && Number(coordinator.until) > now);
  let kind = 'missing';
  let label = '未初始化';
  if (conflict) { kind = 'conflict'; label = '仓库有新版'; }
  else if (invalid) { kind = 'invalid'; label = '仓库版本无效'; }
  else if (stale) { kind = 'pending'; label = '已存云端，待入库'; }
  else if (synced) { kind = 'synced'; label = '已入库'; }
  return { kind, label, online, stale, conflict, invalid, rev: synced?.rev ?? null, commit: synced?.commit ?? null };
}

