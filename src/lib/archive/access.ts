// Shared access language for the shelf and the book's sign-in gate.
import type { HouseholdSessionStatus } from '../householdSession.ts';
export function accessMessage(status: HouseholdSessionStatus) {
  if (status.connection === 'error') return { title: '连接失败', text: `暂时连不上，请重试。${status.error ?? ''}` };
  if (status.connection === 'pending') return status.label === '家庭权限已撤销'
    ? { title: '权限已撤销', text: '这个账号的家庭权限已撤销。需要的话请联系小离重新开通，开通后会自动进入。' }
    : { title: '等待批准', text: '把账号邮箱发给小离，开通后会自动进入。也可以点「重新检查」。' };
  if (status.connection === 'connecting') return { title: '登录中', text: '正在恢复登录并检查访问权限…' };
  if (status.connection === 'connected') return { title: '家庭成员', text: '已登录' };
  return { title: '未登录', text: '登录后阅读' };
}
