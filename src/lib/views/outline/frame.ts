// Outline frame template; book labels are filled from private data.
export const outlineFrame = `<div class="outline-view frame">
<aside class="side outline-sidebar" aria-label="Act 与 Beat">
  <section class="sidebox progress"><h3>Element 编排进度</h3><div class="numline"><strong id="overall">0 / 0</strong><span id="overall-pct">0%</span></div><div class="meter"><span id="meter" style="width:0%"></span></div><p id="remaining"></p></section>
  <section class="sidebox"><h3>ACT / BEAT</h3><nav id="beat-nav" aria-label="选择 Act 和 Beat"></nav></section>
  <section class="sidebox"><h3>素材</h3><label class="archive-toggle"><input id="show-original" type="checkbox"> 显示 <span data-original-count></span> 个原始 XMind 节点</label></section>
  <section class="sidebox files"><h3>导入</h3>
    <button type="button" id="trigger-workspace">导入工作台</button><input type="file" id="import-workspace" accept=".json,application/json" hidden>
    <button type="button" id="trigger-data">导入剧情 JSON</button><input type="file" id="import-data" accept=".json,application/json" hidden>
    <button type="button" id="trigger-plan">导入编排 JSON</button><input type="file" id="import-plan" accept=".json,application/json" hidden>
  </section>
  <details class="sidebox rules"><summary>编排规则</summary><p>先排男女主主轴，再插入配角的 Relationship / Events 故事块。</p><p>一张卡对应一个阶段，展开看细节。</p><p>Current 与 Past 不混用，整块可移到其他 Beat。</p><p>标记「待写」的内容仍是大纲。</p></details>
</aside>
<main class="outline-main" id="workspace-main">
  <div class="actions">
    <button id="undo" type="button" title="撤销上一步">↶ 撤销</button>
    <span class="sync" title="保存状态"><span id="sync-state" class="sync-ok">正在连接云端…</span><span id="autosave-warning" hidden>本地自动保存不可用。请用「导出完整工作台」保留修改。</span></span>
    <span class="sp"></span>
    <span class="group-label">导出</span>
    <button id="export-data" type="button">剧情</button>
    <button id="export" type="button">编排</button>
    <button id="export-workspace" type="button" class="primary">完整工作台</button>
    <span class="divider" aria-hidden="true"></span>
    <button id="reset-all" type="button" class="quiet">清空编排</button>
    <button id="restore-starter" type="button" class="quiet">恢复仓库预排</button>
  </div>

  <header class="beatbar">
    <div class="beat-heading"><h2 id="active-beat">ACT 1 / BEAT 1</h2><button type="button" id="clear-beat" class="quiet">清空本 Beat</button></div>
    <div class="beat-title-row"><span class="vh">本 Beat 标题</span><span id="beat-title"></span></div>
    <p id="beat-summary"></p>
    <textarea id="beat-note" class="beatnote" rows="2" placeholder="这一拍的核心转折或编排意图（可留空）" aria-label="本 Beat 备注"></textarea>
  </header>
  <div id="status" role="status" aria-live="polite" class="status"></div>

  <div class="workbench">
  <div class="board">
    <section class="panel primary-spine"><div class="panel-header"><span class="kind">主轴</span><h3 data-spine-title></h3><p>男女主关系优先。Current 与 Past 分开排，不要求每拍都齐全。</p></div><div id="spine-selected" class="chosen-lanes"></div></section>
    <section class="panel relationship" aria-label="Relationship 编排"><div class="panel-header"><span class="kind">配角关系</span><h3>Relationship</h3><span class="headnumber" id="rel-summary">0 块</span><p>以关系阶段为单位插入主轴</p></div><div class="chosen-lanes" id="rel-selected"></div></section>
    <section class="panel events" aria-label="Events 编排"><div class="panel-header"><span class="kind">事件</span><h3>Events</h3><span class="headnumber" id="event-summary">0 块</span><p>家族、商业、权力与调查支线</p></div><div class="chosen-lanes" id="event-selected"></div></section>
  </div>

  <section class="library" aria-label="素材库">
    <div class="available" id="rel-available"><div class="available-hdr"><h4>Relationship 素材</h4><span class="muted" id="rel-left"></span><label class="checkbox-label"><input type="checkbox" data-show-written="RELATIONSHIP"> 显示已写</label><button class="create-storyline" data-create-storyline="RELATIONSHIP">＋ 新建故事线</button></div><input type="search" id="rel-search" placeholder="搜索故事线或情节点…" aria-label="搜索 Relationship"><div class="groups" id="rel-groups"></div></div>
    <div class="available" id="event-available"><div class="available-hdr"><h4>Events 素材</h4><span class="muted" id="event-left"></span><label class="checkbox-label"><input type="checkbox" data-show-written="EVENT"> 显示已写</label><button class="create-storyline" data-create-storyline="EVENT">＋ 新建故事线</button></div><input type="search" id="event-search" placeholder="搜索故事线或情节点…" aria-label="搜索 Events"><div class="groups" id="event-groups"></div></div>
  </section>
  </div>

  <section class="secondary">
    <details class="detailbox" id="pending-box"><summary>未确定的情节点 <span class="count" id="pending-count">0</span></summary><div class="subtitle">先选故事线和时间，放入素材库待选；再从素材库选入 Beat。</div><div id="pending-list"></div></details>
    <details class="detailbox"><summary>原稿统计与出处 <span class="count"><span data-storyline-count></span> 条原始故事线</span></summary><div class="subtitle">原 XMind 的点数独立于新编排；主轴过去和当下分开显示。</div><div class="table-wrap"><table class="counttable"><thead><tr><th>原始故事线</th><th>Current</th><th>Past</th><th>待定</th><th>合计</th></tr></thead><tbody id="original-counts"></tbody></table></div></details>
  </section>
  <p class="footer-note">Element 标题、概括、内部细节均可编辑，整块移动不拆开。原始 XMind 节点独立保留。修改自动保存到云端；断网时保留本机草稿，请定期导出完整工作台作为备份。</p>
</main>
</div>`;
