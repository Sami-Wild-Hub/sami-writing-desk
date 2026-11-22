// Outline frame retains cloud status, file interchange, recovery, and the book shell.
export const outlineFrame = `<div class="outline-view">
<div class="outline-shell-head"></div>
<div class="file-tools"><span id="sync-state" role="status">正在连接云端…</span><span id="autosave-warning" hidden>本地自动保存不可用，请导出工作台。</span>

<button id="export-data">导出剧情</button><button id="export">导出编排</button><button id="export-workspace">导出完整工作台</button>
<button id="manual-sync" type="button">立即同步</button><a href="https://github.com/Sami-Wild-Hub/sami-writing-desk-data/actions/workflows/outline-sync.yml" target="_blank" rel="noopener noreferrer">查看同步结果</a><span id="manual-sync-status" role="status" aria-live="polite"></span>
<details><summary>文件与恢复</summary><div class="file-tools"><button id="trigger-workspace">导入工作台</button><input id="import-workspace" type="file" accept=".json" hidden>
<button id="trigger-data">导入剧情</button><input id="import-data" type="file" accept=".json" hidden>
<button id="trigger-plan">导入编排</button><input id="import-plan" type="file" accept=".json" hidden>
<button id="clear-beat">清空本 Beat</button><button id="reset-all">清空编排</button><button id="restore-starter">恢复仓库预排</button>
</div></details></div>
<header class="bar" data-bar></header><div id="status" class="status" role="status" aria-live="polite"></div>
<div data-workbench></div><div data-layer></div></div>`;
