// The sign-in gate in front of the book: signed out, restoring/connecting, not yet
// admitted (pending), errors and missing configuration. Renders into #novel-auth.
import type { FirebaseHouseholdSession, HouseholdSessionStatus } from '../householdSession.ts';
import { esc, toast } from './ui.ts';

const intro = '这里放的是家里人在写的书稿和整理笔记，<br>登录后才能看。';
const googleButton = '<button id="novel-sign-in" type="button" class="go"><span class="g" aria-hidden="true"></span>用 Google 账号登录</button>';

function panel(status: HouseholdSessionStatus) {
  const { connection, email = '' } = status;
  if (connection === 'signed-out') {
    return `<span class="logo-mark" aria-hidden="true">离</span><h2>小离总周报</h2><p id="novel-auth-message">${intro}</p>${googleButton}` +
      '<p class="note">只用来确认你是谁，不会读取邮箱或别的内容。</p>';
  }
  if (connection === 'pending' || (connection === 'error' && email)) {
    const revoked = status.label === '家庭权限已撤销';
    const text = connection === 'error' ? `${status.label}：${status.error ?? ''}`
      : revoked ? '这个账号的家庭权限已撤销。需要的话请联系小离重新开通。'
      : '书稿只对家里人开放。把下面的邮箱发给小离，开通后刷新本页就能看。';
    return `<span class="logo-mark off" aria-hidden="true">离</span><h2>${connection === 'error' ? '暂时打不开' : '这个账号还没有开通'}</h2>` +
      `<p id="novel-auth-message">${esc(text)}</p>` +
      `<div class="acct"><span class="avatar" style="background:var(--ink-3)" aria-hidden="true">${esc(email.slice(0, 1).toUpperCase())}</span><span>${esc(email)}<small>已登录 · 未在名单里</small></span></div>` +
      '<div class="row"><button id="novel-refresh-access" type="button" class="btn primary">重新检查</button>' +
      '<button type="button" class="btn" data-gate="copy">复制邮箱</button><button type="button" class="btn" data-gate="switch">换个账号</button></div>';
  }
  if (connection === 'error') {
    return `<span class="logo-mark off" aria-hidden="true">离</span><h2>暂时打不开</h2><p id="novel-auth-message">${esc(`${status.label}：${status.error ?? ''}`)}</p>${googleButton}`;
  }
  return `<span class="logo-mark" aria-hidden="true">离</span><h2>小离总周报</h2><p id="novel-auth-message" aria-live="polite">${esc(status.label)}</p>`;
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
