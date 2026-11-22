// Outline frame template; book labels are filled from private data.
export const outlineFrame = `<div class="outline-view"><div class="actions">
    <button type="button" id="trigger-workspace">导入工作台</button><input type="file" id="import-workspace" accept=".json,application/json" hidden>
    <button type="button" id="trigger-data">导入剧情 JSON</button><input type="file" id="import-data" accept=".json,application/json" hidden>
    <button type="button" id="trigger-plan">导入编排 JSON</button><input type="file" id="import-plan" accept=".json,application/json" hidden>
    <button id="undo" type="button">撤销</button><button id="restore-starter" type="button">恢复仓库预排</button>
    <button id="export-data" type="button">导出剧情</button>
    <button id="export" type="button">导出编排</button>
    <button id="export-workspace" type="button" class="primary">导出完整工作台</button>
  </div>

<div class="outline-workspace">
<aside class="side outline-sidebar">
  <section class="sidebox"><h2>ACT / BEAT</h2><nav id="beat-nav" aria-label="选择 Act 和 Beat"></nav></section>
  <section class="sidebox"><h2>合并 Element 编排进度</h2><div class="numline"><strong id="overall">0 / 0</strong><span class="muted" id="overall-pct">0%</span></div><div class="meter"><span id="meter" style="width:0%"></span></div><p id="remaining"></p></section>
  <section class="sidebox"><h2>编排规则</h2><p>先排男女主主轴，再插入配角的 Relationship / Events 故事块。</p><p>一张卡对应一个阶段，展开看细节。</p><p>Current 与 Past 不混用，整块可移到其他 Beat。</p><p>标记「待写」的内容仍是大纲。</p><label class="archive-toggle"><input id="show-original" type="checkbox"> 查看 <span data-original-count></span> 个原始 XMind 节点</label></section>
</aside>
<main class="outline-main" id="workspace-main">
  <div class="beatbar"><div><h2 id="active-beat">ACT 1 / BEAT 1</h2><p id="beat-summary">从全书素材池重新选取情节点，本拍初始为空。</p></div><div class="controlline"><button type="button" id="clear-beat">清空本 Beat</button><button type="button" id="reset-all">清空编排</button></div></div>
  <div class="beat-title-row"><span>本 Beat 标题</span><span id="beat-title"></span></div>
  <textarea id="beat-note" class="beatnote" placeholder="这一拍的核心转折或编排意图（可留空）" aria-label="本 Beat 备注"></textarea>
  <div id="status" role="status" aria-live="polite" class="status">可以点击卡片文字直接编辑，或按＋新增。</div>
  <div id="autosave-warning" hidden>本地自动保存不可用。请用「导出完整工作台」保留修改。</div>
  <section class="panel primary-spine"><div class="panel-header"><h3 data-spine-title></h3><p>男女主关系优先。Current 与 Past 分开排，不要求每拍都齐全。</p></div><div class="panel-body"><div id="spine-selected" class="chosen-lanes"></div></div></section>
   <div class="split">
    <section class="panel relationship" aria-label="Relationship 编排">
      <div class="panel-header"><span class="headnumber" id="rel-summary">0 点</span><h3>配角关系线 · Relationship</h3><p>以关系阶段为单位插入主轴</p></div>
      <div class="panel-body"><div class="section-title">本 Beat 已选</div><div class="chosen-lanes" id="rel-selected"></div></div>
      <div class="available" id="rel-available"><div class="available-hdr"><h4>Relationship 故事线</h4><button class="create-storyline" data-create-storyline="RELATIONSHIP">＋ 新建故事线</button><span class="muted" id="rel-left"></span></div><input type="search" id="rel-search" placeholder="搜索故事线或情节点…" aria-label="搜索 Relationship"><div class="groups" id="rel-groups"></div></div>
    </section>
    <section class="panel events" aria-label="Events 编排">
      <div class="panel-header"><span class="headnumber" id="event-summary">0 点</span><h3>事件线 · Events</h3><p>家族、商业、权力与调查支线</p></div>
      <div class="panel-body"><div class="section-title">本 Beat 已选</div><div class="chosen-lanes" id="event-selected"></div></div>
      <div class="available" id="event-available"><div class="available-hdr"><h4>Events 故事线</h4><button class="create-storyline" data-create-storyline="EVENT">＋ 新建故事线</button><span class="muted" id="event-left"></span></div><input type="search" id="event-search" placeholder="搜索故事线或情节点…" aria-label="搜索 Events"><div class="groups" id="event-groups"></div></div>
    </section>
  </div>
  <section class="secondary">
    <details class="detailbox" id="pending-box"><summary>未确定 Current / Past 的情节点（<span id="pending-count">0</span>）</summary><div class="subtitle">这些原始节点没有时间分类。选入某 Beat 前，需要明确选择 Current 或 Past；不替你作决定。</div><div id="pending-list"></div></details>
    <details class="detailbox"><summary>原稿统计与出处（<span data-storyline-count></span> 条原始故事线）</summary><div class="subtitle">原 XMind 的点数独立于新编排；主轴过去和当下分开显示。</div><table class="counttable"><thead><tr><th>原始故事线</th><th>Current</th><th>Past</th><th>待定</th><th>合计</th></tr></thead><tbody id="original-counts"></tbody></table></details>
  </section>
  <p class="footer-note">Element 标题、概括、内部细节均可编辑，整块移动不拆开。原始 XMind 节点独立保留。页面修改自动保存到浏览器；请导出完整工作台作为备份。</p>
</main>
</div>
</div>`;
