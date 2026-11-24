// The sign-in gate in front of the book: signed out, restoring/connecting, not yet
// admitted (pending), errors and missing configuration. Renders into #novel-auth.
import type { FirebaseHouseholdSession, HouseholdSessionStatus } from '../householdSession.ts';
import { esc, toast } from './ui.ts';
import { accessMessage } from './access.ts';

const intro = '这里放的是家里人在写的书稿和整理笔记，<br>登录后才能看。';
const googleButton = '<button id="novel-sign-in" type="button" class="go"><span class="g" aria-hidden="true"></span>用 Google 账号登录</button>';

function panel(status: HouseholdSessionStatus) {
  const { connection, email = '' } = status;
  const access = accessMessage(status);
  if (connection === 'signed-out') {
    return `<span class="logo-mark" aria-hidden="true">离</span><h2>小离总周报</h2><p id="novel-auth-message">${intro}</p>${googleButton}` +
      '<p class="note">只用来确认你是谁，不会读取邮箱或别的内容。</p>';
  }
  if (connection === 'pending' || (connection === 'error' && email)) {
    return `<span class="logo-mark off" aria-hidden="true">离</span><h2>${access.title}</h2>` +
      `<p id="novel-auth-message">${esc(access.text)}</p>` +
      `<div class="acct"><span class="avatar" style="background:var(--ink-3)" aria-hidden="true">${esc(email.slice(0, 1).toUpperCase())}</span><span>${esc(email)}<small>${access.title}</small></span></div>` +
      '<div class="row"><button id="novel-refresh-access" type="button" class="btn primary">重新检查</button>' +
      '<button type="button" class="btn" data-gate="copy">复制邮箱</button><button type="button" class="btn" data-gate="switch">换个账号</button></div>';
  }
  if (connection === 'error') {
    return `<span class="logo-mark off" aria-hidden="true">离</span><h2>${access.title}</h2><p id="novel-auth-message">${esc(access.text)}</p>${googleButton}`;
  }
  return `<span class="logo-mark" aria-hidden="true">离</span><h2>${access.title}</h2><p id="novel-auth-message" aria-live="polite">${esc(access.text)}</p>`;
}

export function mountGate(root: HTMLElement, session: FirebaseHouseholdSession | null) {
  const box = document.createElement('section');
  box.className = 'gate-panel';
  root.replaceChildren(box);
  if (!session) {
    box.innerHTML = '<span class="logo-mark off" aria-hidden="true">离</span><h2>小离总周报</h2><p id="novel-auth-message">Firebase 配置不完整，无法访问私人小说内容。</p>';
    return () => {};
  }
  let email = '';
  const fail = (error: unknown) => {
    const message = root.querySelector('#novel-auth-message');
    if (message) message.textContent = error instanceof Error ? error.message : String(error);
  };
  box.addEventListener('click', (event) => {
    const target = (event.target as Element).closest('button');
    if (!target) return;
    if (target.id === 'novel-sign-in') void session.signInWithGoogle().catch(fail);
    else if (target.id === 'novel-refresh-access') void session.refreshAccess().catch(fail);
    else if (target.dataset.gate === 'copy') {
      void navigator.clipboard?.writeText(email).then(() => toast('已复制邮箱'), () => toast(email));
    } else if (target.dataset.gate === 'switch') {
      void session.signOut().then(() => session.signInWithGoogle()).catch(fail);
    }
  });
  return (status: HouseholdSessionStatus) => {
    email = status.email ?? '';
    box.innerHTML = panel(status);
  };
}
