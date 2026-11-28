// The host watcher's way into this folder (Protocols proofdesk), so the task texts and the
// report rules exist once, here. Run with Node 24 (it strips the types):
//   node src/lib/views/proof/cli.ts task   < {"check": "open"|"manuscript", "slug", "title", "draft", "skipProse"?: boolean}
//     → the task text on stdout; exit 2 when the draft has no paragraph
//   node src/lib/views/proof/cli.ts report < the reply text
//     → {"ok": true, "report": {title, summary, items}} or {"ok": false, "error"} on stdout
// Reads: stdin (JSON request or reply text).
// Writes: stdout (task text or report JSON), stderr (why it refused).
import { splitParagraphs } from './paragraphs.ts';
import { parseReport } from './report.ts';
import { CHECKS, TASKS, type Check } from './task.ts';
import { MODELS } from './models.ts';

interface Stream { write(text: string): void }
const proc = (globalThis as unknown as {
  process: { argv: string[]; stdin: AsyncIterable<Uint8Array>; stdout: Stream; stderr: Stream; exitCode?: number };
}).process;

async function input() {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of proc.stdin) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

function fail(message: string) {
  proc.stderr.write(`${message}\n`);
  proc.exitCode = 2;
}

const command = proc.argv[2];
if (command === 'models') {
  proc.stdout.write(JSON.stringify(MODELS));
} else if (command === 'task') {
  const { check, slug, title, draft, skipProse, localSourceRoot } = JSON.parse(await input()) as { check: Check; slug: string; title: string; draft: string; skipProse?: boolean; localSourceRoot?: string };
  const paras = splitParagraphs(draft ?? '');
  if (!(CHECKS.includes(check as typeof CHECKS[number]) || check === 'manuscript')) fail(`unknown check: ${check}`);
  else if (!paras.length) fail('新稿里没有可编号的段落');
  else proc.stdout.write(TASKS[check]({ slug, title, paras, skipProse, localSourceRoot }));
} else if (command === 'report') {
  proc.stdout.write(JSON.stringify(parseReport(await input())));
} else {
  fail('usage: cli.ts task|report < input');
}
