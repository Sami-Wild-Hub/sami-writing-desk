// Preserve plan extensions during explicit file imports; only v7 core fields are supported.
export const PLAN_KEYS = new Set(['schema_version', 'source_data', 'placements', 'beat_notes']);
export function completePlan(plan, current) {
  const result = {};
  for (const key of Object.keys(current)) {
    if (Object.hasOwn(plan, key)) result[key] = plan[key];
    else if (!PLAN_KEYS.has(key)) result[key] = structuredClone(current[key]);
  }
  return { ...result, ...plan };
}
export const completeWorkspace = (workspace, current) => ({ ...workspace, plan: completePlan(workspace.plan, current) });
