// Validate, filter and edit the imported table without rewriting author cells or matching quotes.
// Rows are never deleted from the web table; status 不需要 archives them.
export function validateForeshadow(data) {
  if (data?.schema_version !== 1 || !Array.isArray(data.columns) || !data.columns.length ||
      !Array.isArray(data.rows) || !Array.isArray(data.sheets) || !data.sheets.length) throw Error('伏笔表格式无效');
  const headers = data.columns.map(c => c.header);
  if (headers.some(h => typeof h !== 'string' || !h) || new Set(headers).size !== headers.length) throw Error('伏笔表列无效');
  const keys = new Set();
  for (const row of data.rows) {
    const key = JSON.stringify([row.sheet, row.source_row]);
    if (!data.sheets.some(s => s.name === row.sheet) || !Number.isInteger(row.source_row) || keys.has(key)) throw Error('伏笔表行标识无效');
    keys.add(key);
    if (headers.some(h => typeof row.author?.[h] !== 'string')) throw Error('伏笔表格子必须是文字');
    if (!Array.isArray(row.derived?.recovery_chapters) || row.derived.recovery_chapters.some(c => !/^C[1-9]\d*$/.test(c))) throw Error('伏笔表链接无效');
  }
  return data;
}

const PLANTING = /^C?([1-9]\d*)(?:P([1-9]\d*)(?:-[1-9]\d*)?)?$/;
// Split the author's 埋设章节 cell (C1P8, C1P10-11, C3 or just 3; several joined by ，) into pieces, separators kept;
// recognized pieces carry the chapter and first paragraph (0 = whole chapter).
/** @param {string} text @returns {{ text: string, chapter?: number, paragraph?: number }[]} */
export function plantingParts(text) {
  return text.split(/([，,、；;\s]+)/).filter(Boolean).map(part => {
    const m = PLANTING.exec(part);
    return m ? { text: part, chapter: Number(m[1]), paragraph: Number(m[2] ?? 0) } : { text: part };
  });
}

// The table shows 埋设章节 as chapter numbers only ("C1P10-11，C3P2" → "1，3"); the stored cell keeps any paragraphs,
// so the quote still links to its exact paragraph until the cell is retyped.
/** @param {string} text */
export function plantingChapterText(text) {
  const chapters = [...new Set(plantingParts(text).filter(p => p.chapter).map(p => String(p.chapter)))];
  return chapters.length ? chapters.join('，') : text;
}

export function plantingChapters(row) {
  const chapters = [...new Set(plantingParts(row.author['埋设章节']).filter(p => p.chapter).map(p => `C${p.chapter}`))];
  return chapters.length ? chapters : ['未标注'];
}

// Author status values offered in the table; '' means 未收. 不需要 archives a row instead of deleting it.
export const STATUSES = ['已收', '部分回收', '不需要'];
const CLOSED = new Set(['已收', '不需要']);
// Columns kept in the data (and in sync) but not shown in the table.
export const HIDDEN_COLUMNS = new Set(['回收方式／揭示内容', '重要程度']);
/** @param {{ columns: { header: string, source_column: string }[] }} data */
export const visibleColumns = data => data.columns.filter(c => !HIDDEN_COLUMNS.has(c.header));

// Status filter value meaning "everything still open" (部分回收 stays visible; 已收 and 不需要 hide); the default view.
export const OPEN = '!已收';
export function filterRows(data, status = '', chapter = '') {
  return data.rows.filter(r => {
    const state = r.author['是否已收'] || '未标注';
    return (!status || (status === OPEN ? !CLOSED.has(state) : state === status)) && (!chapter || plantingChapters(r).includes(chapter));
  });
}

// Recovery links follow the author's 实际回收章节 cell: every Cn in it, in order, once ("C5，x" → C5).
export function recoveryChapters(text) {
  return [...new Set([...text.matchAll(/C([1-9]\d*)/g)].map(m => `C${m[1]}`))];
}

export const rowKey = row => JSON.stringify([row.sheet, row.source_row]);
export const findRow = (data, key) => data.rows.find(r => rowKey(r) === key);

// Set one author cell; editing 实际回收章节 also refreshes the recovery links derived from it.
export function setCell(row, header, value) {
  row.author[header] = value;
  if (header === '实际回收章节') row.derived.recovery_chapters = recoveryChapters(value);
}

// New row after `after` (or at the end), in the first sheet; 伏笔ID continues the numbering when IDs are numbers.
export function addRow(data, after = null, preset = {}) {
  const sheet = after ? data.sheets.find(s => s.name === after.sheet) : data.sheets[0];
  const source_row = Math.max(0, ...data.rows.filter(r => r.sheet === sheet.name).map(r => r.source_row)) + 1;
  const row = { sheet: sheet.name, source_row, author: Object.fromEntries(data.columns.map(c => [c.header, ''])), derived: { recovery_chapters: [] } };
  const ids = data.rows.map(r => r.author['伏笔ID']).filter(id => /^\d+$/.test(id ?? '')).map(Number);
  if ('伏笔ID' in row.author && ids.length) row.author['伏笔ID'] = String(Math.max(...ids) + 1);
  for (const [header, value] of Object.entries(preset)) if (header in row.author) setCell(row, header, value);
  data.rows.splice(after ? data.rows.indexOf(after) + 1 : data.rows.length, 0, row);
  sheet.data_rows = data.rows.filter(r => r.sheet === sheet.name).length;
  return row;
}
