// Replay the original workbench offline; no source files are modified.
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { outlineFixture } from '../tests/outline-fixture.mjs';
import { exerciseOutline } from '../tests/outline-scenario.mjs';
import { exerciseOriginalEdges } from '../tests/outline-original-edges.mjs';
const [source, shots] = process.argv.slice(2);
if (!source || !shots) throw Error('Usage: node scripts/outline-original.mjs <original HTML> <private shots directory>');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ offline: true });
  let page = await context.newPage();
  await page.goto(pathToFileURL(source).href);
  await mkdir(shots, { recursive: true });
  for (const [width, height] of [[390,844],[1280,800],[2560,1440]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${shots}/${width}-outline.png`, fullPage: true });
  }
  let html = await readFile(source, 'utf8');
  const fixture = outlineFixture();
  html = html.replace(/(<script type="application\/json" id="source-snapshot">)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(fixture.plot_data)}$2`)
    .replace(/(<script type="application\/json" id="plan-snapshot">)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(fixture.plan)}$2`);
  await page.close(); page = await context.newPage();
  await page.setContent(html);
  page.on('dialog', d => d.accept());
  await exerciseOutline(page, page.locator('body'));
  await exerciseOriginalEdges(page, page.locator('body'));
  console.log('Original offline control replay passed; screenshots saved.');
} finally { await browser.close(); }

