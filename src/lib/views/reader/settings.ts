// 阅读设置 (the Aa menu): text size and 黑体／宋体, kept in this browser. 黑体 is the default.
import { leave } from '../../archive/motion.ts';

const KEY = 'swd.reading';
const sizes = { s: ['小', 0.9], m: ['中', 1], l: ['大', 1.12] } as const;
const fonts = { sans: ['黑体', 'var(--sans)'], serif: ['宋体', 'var(--serif)'] } as const;
type Settings = { size: keyof typeof sizes; font: keyof typeof fonts };

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { size: saved.size in sizes ? saved.size : 'm', font: saved.font in fonts ? saved.font : 'sans' };
  } catch {
    return { size: 'm', font: 'sans' };
  }
}

export function applyReading(settings = load()) {
  const root = document.documentElement.style;
  root.setProperty('--read-scale', String(sizes[settings.size][1]));
  root.setProperty('--read-font', fonts[settings.font][1]);
}

const seg = (name: keyof Settings, options: Record<string, readonly [string, unknown]>, on: string) =>
  `<div class="seg" data-set="${name}">${Object.entries(options).map(([v, [label]]) =>
    `<button type="button" data-v="${v}" aria-pressed="${v === on}">${label}</button>`).join('')}</div>`;

/** Wires the Aa button inside `scope` (re-rendered with each page) to its popover. */
export function mountReadingMenu(scope: HTMLElement) {
  let pop: HTMLElement | null = null;
  const close = () => {
    const node = pop;
    if (node) leave(node, () => node.remove());
    pop = null;
    scope.querySelector('[data-aa]')?.setAttribute('aria-expanded', 'false');
  };
  scope.addEventListener('click', (event) => {
    const target = event.target as Element;
    const button = target.closest<HTMLElement>('[data-aa]');
    if (button) {
      if (pop) return close();
      const s = load();
      pop = document.createElement('div');
      pop.className = 'aa-pop';
      pop.innerHTML = `<div class="opt"><span>字号</span>${seg('size', sizes, s.size)}</div><div class="opt"><span>字体</span>${seg('font', fonts, s.font)}</div>`;
      button.after(pop);
      button.setAttribute('aria-expanded', 'true');
      return;
    }
    const choice = target.closest<HTMLElement>('[data-set] button');
    if (choice) {
      const s = { ...load(), [choice.parentElement!.dataset.set!]: choice.dataset.v };
      const top = document.querySelector<HTMLElement>('#novel-bar')?.offsetHeight ?? 0;
      const anchor = [...scope.querySelectorAll<HTMLElement>('.prose p, .prose li, .prose h2, .prose h3')].find(el => el.getBoundingClientRect().bottom >= top);
      const offset = anchor?.getBoundingClientRect().top ?? 0;
      localStorage.setItem(KEY, JSON.stringify(s));
      applyReading(s);
      if (anchor) window.scrollBy({ top: anchor.getBoundingClientRect().top - offset, behavior: 'instant' });
      for (const b of choice.parentElement!.children) b.setAttribute('aria-pressed', String(b === choice));
    }
  });
  const outside = (event: Event) => { if (pop && !(event.target as Element).closest('.aa')) close(); };
  const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
  document.addEventListener('click', outside);
  document.addEventListener('keydown', esc);
  applyReading();
  return {
    close,
    dispose: () => {
      document.removeEventListener('click', outside);
      document.removeEventListener('keydown', esc);
    },
  };
}
