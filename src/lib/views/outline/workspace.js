// Complete older workspace plans using the current plan's extension fields and key order.
export const PLAN_KEYS = new Set(['schema_version', 'source_data', 'placements', 'kind_overrides', 'beat_notes']);

export function completePlan(plan, current) {
  const result = {};
  for (const key of Object.keys(current)) {
    if (Object.hasOwn(plan, key)) result[key] = plan[key];
    else if (!PLAN_KEYS.has(key)) result[key] = structuredClone(current[key]);
  }
  return { ...result, ...plan };
}

export function completeWorkspace(workspace, currentPlan) {
  return { ...workspace, plan: completePlan(workspace.plan, currentPlan) };
}
