// Dispatch the data repository's sync workflow directly from this browser.
// Reads: localStorage sami-outline-sync-token:Sami-Wild-Hub/sami-writing-desk-data (token string)
// Writes: localStorage sami-outline-sync-token:Sami-Wild-Hub/sami-writing-desk-data (token string)
const key = 'sami-outline-sync-token:Sami-Wild-Hub/sami-writing-desk-data';
const endpoint = 'https://api.github.com/repos/Sami-Wild-Hub/sami-writing-desk-data/actions/workflows/outline-sync.yml/dispatches';
export function mountManualSync(root) {
  const button = root.querySelector('#manual-sync'), status = root.querySelector('#manual-sync-status');
  const abort = new AbortController();
  let dialog, disposed = false;
  const report = text => { if (!disposed) status.textContent = text; };
  const ask = () => {
    if (disposed || dialog) return;
    dialog = document.createElement('div'); dialog.className = 'modal-back';
    dialog.innerHTML = `<form class="modal" aria-label="同步授权"><h3>同步授权</h3>
      <p>填写 GitHub token：仅需 sami-writing-desk-data 仓库的 Actions 写权限。授权保存在此浏览器。</p>
      <label class="field">GitHub token<input name="token" type="password" autocomplete="off" required></label>
      <div class="form-actions"><button class="primary" type="submit">保存并同步</button><button type="button" data-cancel>取消</button></div></form>`;
    const close = () => { dialog.remove(); dialog = null; button.focus(); };
    dialog.querySelector('[data-cancel]').onclick = close;
    dialog.onkeydown = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    dialog.querySelector('form').onsubmit = event => {
      event.preventDefault(); const token = dialog.querySelector('input').value.trim();
      if (token) { close(); void dispatch(token); }
    };
    root.append(dialog); dialog.querySelector('input').focus();
  };
  const dispatch = async token => {
    button.disabled = true; report('正在触发同步…');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28',
      }, body: JSON.stringify({ ref: 'main' }), signal: abort.signal });
      if (disposed) return;
      if ([401, 403, 404].includes(response.status)) {
        localStorage.removeItem(key); report('触发失败：token 无效或权限不足，请重新填写。'); ask(); return;
      }
      if (!response.ok) { report(`触发失败（GitHub ${response.status}），请重试。`); return; }
      localStorage.setItem(key, token); report('已触发同步，请打开“查看同步结果”。');
    } catch {
      report('触发失败：无法连接 GitHub 或保存浏览器授权，请重试。');
    } finally { if (!disposed) button.disabled = false; }
  };
  const click = () => {
    try { const token = localStorage.getItem(key); token ? void dispatch(token) : ask(); }
    catch { report('触发失败：浏览器授权存储不可用。'); }
  };
  button.addEventListener('click', click);
  return { dispose() { disposed = true; abort.abort(); dialog?.remove(); button.removeEventListener('click', click); } };
}
