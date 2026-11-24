// Outline frame retains cloud status, file interchange, recovery, and the book shell.
export const outlineFrame = `<div class="outline-view">
<div class="outline-shell-head"></div>
<div class="file-tools"><button id="sync-state" type="button" aria-live="polite">正在保存</button>
<details class="file-recovery"><summary>文件与恢复</summary><div class="file-tools">
<p id="save-detail"></p><p id="autosave-warning" hidden>当前改动尚未保存，请重试或导出工作台。</p>
<button id="export-data">导出剧情</button><button id="export">导出编排</button><button id="export-workspace">导出完整工作台</button>
<button id="manual-sync" type="button">立即同步</button><a href="https://github.com/Sami-Wild-Hub/sami-writing-desk-data/actions/workflows/outline-sync.yml" target="_blank" rel="noopener noreferrer">查看同步结果</a><span id="manual-sync-status" role="status" aria-live="polite"></span>
<button id="download-local">下载本机版</button><button id="overwrite-local" hidden>用本机版覆盖</button><button id="keep-web" hidden>保留网页版</button><button id="download-kept" hidden>下载被替换的版本</button>
<button id="trigger-workspace">导入工作台</button><input id="import-workspace" type="file" accept=".json" hidden>
<button id="trigger-data">导入剧情</button><input id="import-data" type="file" accept=".json" hidden>
<button id="trigger-plan">导入编排</button><input id="import-plan" type="file" accept=".json" hidden>
<button id="clear-beat">清空本 Beat</button><button id="reset-all">清空编排</button><button id="restore-starter">恢复仓库预排</button>
</div></details></div>
<header class="bar" data-bar></header><div id="status" class="status" role="status" aria-live="polite"></div>
<div data-workbench></div><div data-layer></div></div>`;
