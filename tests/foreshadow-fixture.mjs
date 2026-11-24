// Synthetic foreshadow cells for public tests: paragraph-level 埋设章节 cells and separate recovery links.
export function foreshadowFixture() {
  const headers = ['伏笔ID', '埋设章节', '伏笔／线索内容', '重要程度', '是否已收', '实际回收章节', '回收场景／位置', '回收方式／揭示内容', '备注'];
  return { schema_version: 1, source: { title: 'Test tracker' }, sheets: [{ name: '伏笔追踪', header_row: 4, data_rows: 2 }],
    columns: headers.map((header, i) => ({ header, source_column: String.fromCharCode(65 + i) })),
    rows: [
      { sheet: '伏笔追踪', source_row: 5, author: Object.fromEntries(headers.map((h, i) => [h, ['one', 'C1P2', 'A clue\nSecond line', '', '部分回收', 'C2', '', '', ''][i]])),
        derived: { recovery_chapters: ['C2'] } },
      { sheet: '伏笔追踪', source_row: 6, author: Object.fromEntries(headers.map((h, i) => [h, ['two', 'C2P5-6', '<script>literal</script>', '', '', '', '', '', ''][i]])),
        derived: { recovery_chapters: [] } },
    ] };
}
