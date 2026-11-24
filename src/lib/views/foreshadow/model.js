// Validate and edit the imported table without rewriting author cells or matching quotes.
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
    if (typeof row.derived?.planting_location?.link !== 'string' ||
        !Array.isArray(row.derived?.recovery_chapters) || row.derived.recovery_chapters.some(c => !/^C[1-9]\d*$/.test(c))) throw Error('伏笔表链接无效');
    validatePlantingLink(row.derived.planting_location.link);
  }
  return data;
}

export function validatePlantingLink(value) {
  if (value && !/^C[1-9]\d*#P[1-9]\d*(?:-P?[1-9]\d*)?$/.test(value)) throw Error('埋设链接格式：C章号#P段号（可加 -P末段）');
}

export function filterRows(data, status = '', chapter = '') {
  return data.rows.filter(r => (!status || (r.author['是否已收'] || '未标注') === status) &&
    (!chapter || (r.author['埋设章节'] || '未标注') === chapter));
}

export function addRow(data) {
  const sheet = data.sheets[0];
  const source_row = Math.max(0, ...data.rows.filter(r => r.sheet === sheet.name).map(r => r.source_row)) + 1;
  const row = { sheet: sheet.name, source_row, author: Object.fromEntries(data.columns.map(c => [c.header, ''])),
    derived: { planting_location: { link: '' }, recovery_chapters: [] } };
  data.rows.push(row);
  sheet.data_rows = data.rows.filter(r => r.sheet === sheet.name).length;
  return row;
}

export function deleteRow(data, row) {
  data.rows.splice(data.rows.indexOf(row), 1);
  data.sheets.find(s => s.name === row.sheet).data_rows = data.rows.filter(r => r.sheet === row.sheet).length;
}
