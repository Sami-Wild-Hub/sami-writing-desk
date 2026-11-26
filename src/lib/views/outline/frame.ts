// Outline frame retains cloud status, file interchange, recovery, and the book shell.
export const outlineFrame = `<div class="outline-view">
<div class="outline-shell-head"></div>
<div class="file-tools" data-toolbar><button class="save-state" id="sync-state" type="button" aria-live="polite">保存中</button>
<details class="file-recovery"><summary class="btn small">文件与恢复</summary><div class="file-tools">
<p id="save-detail"></p><p id="autosave-warning" hidden>当前改动尚未保存，请重试或导出工作台。</p>
<button class="btn small" id="export-data">导出剧情</button><button class="btn small" id="export">导出编排</button><button class="btn small" id="export-workspace">导出完整工作台</button>
<button class="btn small" id="manual-sync" type="button">立即同步</button><a href="https://github.com/Sami-Wild-Hub/sami-writing-desk-data/actions/workflows/outline-sync.yml" target="_blank" rel="noopener noreferrer">查看同步结果</a><span id="manual-sync-status" role="status" aria-live="polite"></span>
<button class="btn small" id="download-local">下载本机版</button><button class="btn small" id="overwrite-local" hidden>用本机版覆盖</button><button class="btn small" id="keep-web" hidden>保留网页版</button><button class="btn small" id="download-kept" hidden>下载被替换的版本</button>
<button class="btn small" id="trigger-workspace">导入工作台</button><input id="import-workspace" type="file" accept=".json" hidden>
<button class="btn small" id="trigger-data">导入剧情</button><input id="import-data" type="file" accept=".json" hidden>
<button class="btn small" id="trigger-plan">导入编排</button><input id="import-plan" type="file" accept=".json" hidden>
<button class="btn small" id="clear-beat">清空当前分段</button><button class="btn small" id="reset-all">清空编排</button><button class="btn small" id="restore-starter">恢复仓库预排</button>
</div></details><header class="bar" data-bar></header></div>
<div class="ol-ctx"><button class="ol-person" type="button" data-drawer aria-expanded="false"><b></b><small></small></button><span class="sp"></span><span data-save-slot></span><button class="chip" data-act="mobile-unplaced" aria-pressed="true">只看未排</button><span data-undo-slot></span></div>
<div id="status" class="status" role="status" aria-live="polite"></div>
<div data-workbench></div><div data-layer></div></div>`;
