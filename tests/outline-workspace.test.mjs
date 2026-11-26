// Verify extension completion and replacement using the canonical private outline.
// Reads: sibling data repo origin/main (JSON); no private fixture is stored here.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createOutlineModel } from '../src/lib/views/outline/model.js';
import { completePlan, completeWorkspace, PLAN_KEYS } from '../src/lib/views/outline/workspace.js';

const repo = resolve(process.env.OUTLINE_DATA_REPO || '../sami-writing-desk-data-outline');
const canonical = name => JSON.parse(readFileSync(resolve(repo, 'outline/maritime-story', name), 'utf8'));
const options = { skip: !existsSync(repo) && 'public CI has no sibling data repository' };

test('imported v7 plans inherit missing extensions in cloud key order without changing explicit values', options, () => {
  const current = canonical('placements.json');
  const old = Object.fromEntries(Object.entries(current).filter(([key]) => PLAN_KEYS.has(key)));
  const completed = completePlan(old, current);
  assert.equal(JSON.stringify(completed), JSON.stringify(current));
  const explicit = { ...current, notes: [] };
  assert.deepEqual(completePlan(explicit, current).notes, []);
  assert.deepEqual(completeWorkspace({ plot_data: canonical('plot-data.json'), plan: old }, current).plan, current);
});

test('plan exports preserve canonical key order, clear keeps extensions, remote import replaces them', options, () => {
  const plot = canonical('plot-data.json'), plan = canonical('placements.json');
  const model = createOutlineModel(plot, plan);
  assert.equal(JSON.stringify(model.exportPlan()), JSON.stringify(plan));
  model.clear(true); assert.deepEqual(model.exportPlan().notes, plan.notes);
  const withoutNotes = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'notes'));
  model.importWorkspace({ plot_data: plot, plan: withoutNotes }, false);
  assert.equal(Object.hasOwn(model.exportPlan(), 'notes'), false);
});
