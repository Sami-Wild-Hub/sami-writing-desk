// Seed a complete synthetic shared workspace for public foreshadow browser tests.
// Writes: stub RTDB outlineSync/maritime-story (packed JSON documents)
import { expect, type Locator, type Page } from '@playwright/test';
import { stubFirebase } from './stub.ts';
import { foreshadowFixture } from './foreshadow-fixture.mjs';
import { pack, unpack } from '../src/lib/views/outline/codec.js';

export const path = 'households/novel-stub-house/outlineSync/maritime-story';

export async function setup(page: Page, data = foreshadowFixture()) {
  const db = await stubFirebase(page);
  const plot = {
    schema_version: '7.0',
    beats: [{ beat_id: 'B1', act: 1, beat: 1, title: 'Opening' }],
    participants: [{ name: 'Ann', type: 'CHARACTER' }], participant_order: ['Ann'],
    storyline_groups: [{ id: 'G1', title: 'A clue', participants: ['Ann'], lead_participant: 'Ann',
      time_order: { past: [], current: ['U1'], combined: [] } }],
    plot_units: [{ unit_id: 'U1', storyline_group_id: 'G1', category: 'current', content: 'Ann finds a clue' }],
  };
  const files = { plot: await pack(plot), plan: await pack({ schema_version: '7.0', placements: [], beat_notes: {} }),
    foreshadow: await pack(data) };
  db.server(path, {
    head: { synced: { rev: 'fixture-v1', tree: 'fixture-tree', commit: 'fixture-v1' },
      repo: { tree: 'fixture-tree', commit: 'fixture-v1' } },
    live: { rev: 'fixture-v1', base: '', at: 1, by: 'repo', ...files },
    starter: { commit: 'fixture-v1', ...files },
  });
  await page.goto('book/?book=maritime-story&view=foreshadow');
  const root = page.locator('[data-view="foreshadow"]');
  await expect(root.locator('tbody tr')).toHaveCount(data.rows.filter(r => !['已收', '不需要'].includes(r.author['是否已收'])).length);
  return { db, root };
}

/** The input of one visible cell: row index among shown rows, column header. */
export const cell = (root: Locator, row: number, header: string) => root.locator('tbody tr').nth(row).locator(`[data-col="${header}"]`);

/** Type into a cell like a person and leave it, which saves it. */
export async function typeCell(root: Locator, row: number, header: string, text: string) {
  const input = cell(root, row, header);
  await input.fill(text); await input.press('Tab');
}

export const savedRows = async (db: { at(path: string): unknown }) =>
  JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows as { author: Record<string, string>; derived: { recovery_chapters: string[] } }[];
