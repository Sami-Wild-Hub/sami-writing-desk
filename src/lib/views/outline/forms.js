// Inline editor and composer templates; controls are bound by controller.js.
import { esc } from '../../archive/ui.ts';

const buttons = () => '<div class="composer-actions"><button type="submit" class="primary">保存</button><button type="button" data-composer-cancel>取消</button><span class="hint">Ctrl/⌘ + Enter 保存 · Esc 取消</span></div>';

export function inlineEditorHtml(field) {
  const control = ['unit','group-summary','element-details'].includes(field)
    ? `<textarea rows="${field === 'element-details' ? 5 : 3}" aria-label="编辑文字"></textarea>`
    : '<input type="text" aria-label="编辑标题">';
  const hint = field === 'element-details' ? '每行一条 · Ctrl/⌘ + Enter 保存' : control.startsWith('<input') ? 'Enter 保存 · Esc 取消' : 'Ctrl/⌘ + Enter 保存 · Esc 取消';
  return `${control}<span class="inline-editor-actions"><button type="button" class="primary" data-inline-save>保存</button><button type="button" data-inline-cancel>取消</button><span class="hint">${hint}</span></span>`;
}

export function groupComposerHtml(kind) {
  return `<div class="composer-caption">新建 ${kind === 'RELATIONSHIP' ? 'Relationship' : 'Events'} 故事线</div>
    <label class="field-label">故事线名称<input name="title" required maxlength="240"></label>
    <label class="field-label">走向摘要（选填）<textarea name="summary" rows="2"></textarea></label>${buttons()}`;
}

export function unitComposerHtml({ era, groupId, groups, beat }) {
  const chooser = groupId ? '' : `<label class="field-label">所属故事线<select name="group_id" required>${groups.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}</select></label>`;
  return `<div class="composer-caption"><span class="era-tag ${era === 'PAST' ? 'past' : 'current'}">${era === 'PAST' ? 'Past' : 'Current'}</span>${beat ? '写入 ' + esc(beat) : '故事线新增情节点'}</div>${chooser}
    <label class="field-label">阶段名称<input name="element_title" required placeholder="简短"></label>
    <label class="field-label">阶段推进<textarea name="content" rows="3" required placeholder="一句话概括"></textarea></label>
    <label class="field-label">内部细节<textarea name="details" rows="3" placeholder="每行一条（选填）"></textarea></label>
    <label class="field-label">出处<input name="source_refs" placeholder="章节或原纲节点编号（可留空）"></label>
    ${beat ? '<div class="composer-note">保存后自动选入当前 Beat，并检查故事线内部先后顺序。</div>' : '<label class="checkbox-label"><input name="also_place" type="checkbox"> 同时选入当前 Beat</label>'}${buttons()}`;
}
