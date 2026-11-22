// Opt-in private parity and screenshots. Inputs/outputs must live outside the public checkout.
import { expect, test, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { env, stubFirebase, watchErrors } from './stub.ts';
import { chooseBeat, exportJSON, importJSON } from './outline-scenario.mjs';

const originalPath = env.NOVEL_OUTLINE_ORIGINAL;
const shots = env.NOVEL_OUTLINE_SHOTS_DIR;
async function board(root: Locator) {
  return root.locator('#spine-selected,#rel-selected,#event-selected').evaluateAll(sections => sections.map(section => ({
    section: section.id,
    lanes: [...section.querySelectorAll<HTMLElement>('.time-lane')].map(lane => ({
      era: lane.dataset.selectedEra,
      groups: [...lane.querySelectorAll('.selected-storyline')].map(group => ({
        name: group.querySelector('.selected-storyline-head')!.textContent,
        cards: [...group.querySelectorAll<HTMLElement>('.card [data-edit-field="unit"]')].map(card => ({ id:card.dataset.id, text:card.textContent })),
      })),
    })),
  })));
}

test.describe('private outline parity', () => {
  test.skip(!originalPath || !env.NOVEL_STUB_DB || !shots, 'Set NOVEL_OUTLINE_ORIGINAL, NOVEL_STUB_DB and NOVEL_OUTLINE_SHOTS_DIR');
  for (const [width,height] of [[390,844],[1280,800],[2560,1440]]) {
    test(`${width}px starter parity and bidirectional interchange`, async ({ browser, page }) => {
      test.setTimeout(120_000);
      const offline = await browser.newContext({ offline:true, viewport:{ width,height } });
      try {
        const source = await offline.newPage();
        await source.goto(pathToFileURL(originalPath!).href);
        await page.setViewportSize({ width,height });
        const errors = watchErrors(page);
        await stubFirebase(page);
        await page.goto('book/?book=maritime-story&view=outline');
        const root = page.locator('[data-view="outline"]');
        await expect(root.locator('#overall')).toHaveText('60 / 60');
        const sourceRoot = source.locator('body');
        const beats = await source.locator('[data-choose-beat]').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.chooseBeat!));
        for (const beat of beats) {
          await source.locator(`[data-choose-beat="${beat}"]`).click();
          await chooseBeat(page, root, beat);
          expect(await board(root)).toEqual(await board(sourceRoot));
        }
        await source.locator(`[data-choose-beat="${beats[0]}"]`).click();
        await chooseBeat(page, root, beats[0]);
        await mkdir(`${shots}/original`, { recursive:true }); await mkdir(`${shots}/build`, { recursive:true });
        await source.screenshot({ path:`${shots}/original/${width}-outline.png`, fullPage:true });
        await page.screenshot({ path:`${shots}/build/${width}-outline.png`, fullPage:true });
        await source.screenshot({ path:`${shots}/original/${width}-viewport.png` });
        await page.screenshot({ path:`${shots}/build/${width}-viewport.png` });
        const exported = await exportJSON(page, root, 'export-workspace');
        expect(exported).toEqual(await exportJSON(source, sourceRoot, 'export-workspace'));
        const data = exported.plot_data;
        expect(data.plot_units.filter((u: {is_editorial_element?:boolean}) => u.is_editorial_element)).toHaveLength(60);
        expect(data.plot_units.filter((u: {is_custom?:boolean}) => !u.is_custom)).toHaveLength(92);
        expect(data.storyline_groups).toHaveLength(32); expect(data.source_nodes).toHaveLength(279);
        await importJSON(sourceRoot, 'import-workspace', exported);
        const back = await exportJSON(source, sourceRoot, 'export-workspace');
        expect(back).toEqual(exported);
        await importJSON(root, 'import-workspace', back);
        expect(await exportJSON(page, root, 'export-workspace')).toEqual(back);
        for (const [id,file] of [['export-data','import-data'],['export','import-plan']]) {
          const raw = await exportJSON(page, root, id);
          await importJSON(sourceRoot, file, raw);
          await importJSON(root, file, await exportJSON(source, sourceRoot, id));
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
        expect(errors).toEqual([]);
      } finally { await offline.close(); }
    });
  }
});
