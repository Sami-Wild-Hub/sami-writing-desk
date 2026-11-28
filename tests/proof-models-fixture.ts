// Three model replies on the same sentence, with independent report histories.
export const modelRecordId = '20261128-010101-mod1';
export const modelQuote = '她又又走到了码头。';
export const modelFix = '她又走到了码头。';
export const modelPath = `/households/novel-stub-house/proofdesk/maritime-story/${modelRecordId}`;
export function modelRecord() {
  const models = ['open', 'opus', 'terra'];
  const reports = Object.fromEntries(models.flatMap(check => [1, 2].map(attempt => {
    const id = `${check}-${attempt}`;
    return [id, { id, check, attempt, createdAt: attempt, report: JSON.stringify({ title: '三模型', summary: check,
      items: [{ para: 'P1', quote: modelQuote, kind: check === 'open' ? '连续性' : '文字',
        issue: `${check} 第${attempt}次`, evidence: [], ...(check === 'open' ? {} : { fix: modelFix }) }] }) }];
  })));
  return { id: modelRecordId, title: '三模型', source: 'paste', draft: `前文。${modelQuote}\n后文。`,
    status: 'done', createdAt: 1, updatedAt: 1,
    checks: Object.fromEntries(models.map(check => [check, { status: 'done', attempt: 2 }])), reports };
}
