// Inline editor and composer templates; controls are bound by controller.js.
import { esc } from '../../archive/ui.ts';

const buttons = () => '<div class="composer-actions"><button type="submit" class="primary">保存</button><button type="button" data-composer-cancel>取消</button></div>';

export function inlineEditorHtml(field) {
  const control = ['unit','group-summary','element-details'].includes(field)
    ? '<textarea rows="3" aria-label="编辑文字"></textarea>'
    : '<input type="text" aria-label="编辑标题">';
  return `${control}<span class="inline-editor-actions"><button type="button" class="primary" data-inline-save>保存</button><button type="button" data-inline-cancel>取消</button></span>`;
}

export function groupComposerHtml(kind) {
  return `<div class="composer-caption">＋ 新建 ${kind === 'RELATIONSHIP' ? 'Relationship' : 'Events'} 故事线</div>
    <input name="title" required placeholder="故事线名称" maxlength="240">
    <textarea name="summary" rows="2" placeholder="走向摘要（选填）"></textarea>${buttons()}`;
}

export function unitComposerHtml({ era, groupId, groups, beat }) {
  const chooser = groupId ? '' : `<label>所属故事线<select name="group_id" required>${groups.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}</select></label>`;
  return `<div class="composer-caption">＋ ${era === 'PAST' ? 'Past' : 'Current'} · ${beat ? '写入 ' + esc(beat) : '故事线新增情节点'}</div>${chooser}
    <input name="element_title" required placeholder="阶段名称（简短）">
    <textarea name="content" rows="3" required placeholder="一句话概括阶段推进"></textarea>
    <textarea name="details" rows="4" placeholder="具体细节，每行一条"></textarea>
    <input name="source_refs" placeholder="出处，如 C14–C15 或 U039（可留空）">
    ${beat ? '<div class="composer-note">保存后自动选入当前 Beat，并检查故事线内部先后顺序。</div>' : '<label class="checkbox-label"><input name="also_place" type="checkbox"> 同时选入当前 Beat</label>'}${buttons()}`;
}
