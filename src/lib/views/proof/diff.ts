// Character LCS for suggested sentence edits; shared by validation and highlighting.
export interface Change { kind: 'same' | 'add' | 'remove'; text: string }

export function sentenceDiff(quote: string, fix: string): Change[] {
  const a = Array.from(quote), b = Array.from(fix);
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  }
  const changes: Change[] = [];
  const append = (kind: Change['kind'], text: string) => {
    const last = changes.at(-1);
    if (last?.kind === kind) last.text += text; else changes.push({ kind, text });
  };
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { append('same', a[i++]); j++; }
    else if (j < b.length && (i === a.length || lengths[i][j + 1] > lengths[i + 1][j])) append('add', b[j++]);
    else append('remove', a[i++]);
  }
  return changes;
}

/** A fix must retain at least half of the longer sentence, and change something. */
export function fixProblem(quote: string, fix: unknown): string {
  if (typeof fix !== 'string' || !fix.trim()) return 'fix 应是改好后的完整句子';
  if (quote === fix) return 'fix 和 quote 相同';
  const kept = sentenceDiff(quote, fix).filter(c => c.kind === 'same').reduce((n, c) => n + Array.from(c.text).length, 0);
  return kept * 2 < Math.max(Array.from(quote).length, Array.from(fix).length) ? 'fix 与 quote 差异过大，应只改需要改的字' : '';
}
