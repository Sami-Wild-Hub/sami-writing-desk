// Numbers a draft's paragraphs P1…Pn the way the KB's numbered source views do: every
// non-empty line is a paragraph (blank lines only separate), Markdown headings are skipped.
// Also finds a report's quote inside its paragraph, ignoring whitespace differences.

export interface Para { n: number; label: string; text: string; }

export function splitParagraphs(draft: string): Para[] {
  return draft.split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line))
    .map((text, i) => ({ n: i + 1, label: `P${i + 1}`, text }));
}

/** The paragraph number a label like "P12" (or "p 12") names, or 0. */
export function paraNumber(label: string): number {
  const match = /^\s*P\s*(\d+)\s*$/i.exec(label);
  return match ? Number(match[1]) : 0;
}

/** [start, end) of `quote` in `text`, matching across whitespace; null when it is not there. */
export function findQuote(text: string, quote: string): [number, number] | null {
  const wanted = quote.replace(/\s+/g, '');
  if (!wanted) return null;
  const exact = text.indexOf(quote);
  if (exact >= 0) return [exact, exact + quote.length];
  const kept: number[] = [];
  let squeezed = '';
  for (let i = 0; i < text.length; i += 1) {
    if (/\s/.test(text[i])) continue;
    kept.push(i);
    squeezed += text[i];
  }
  const at = squeezed.indexOf(wanted);
  return at < 0 ? null : [kept[at], kept[at + wanted.length - 1] + 1];
}
