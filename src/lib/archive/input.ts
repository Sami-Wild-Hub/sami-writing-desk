// Debounced search input that leaves IME composition and its Enter key to the browser.
export function searchInput(input: HTMLInputElement, run: () => void, invalidate = () => {}) {
  let composing = false, timer = 0;
  const cancel = () => clearTimeout(timer);
  const schedule = () => { cancel(); invalidate(); if (!composing) timer = window.setTimeout(run, 120); };
  const start = () => { composing = true; cancel(); invalidate(); };
  const end = () => { composing = false; schedule(); };
  input.addEventListener('compositionstart', start);
  input.addEventListener('compositionend', end);
  input.addEventListener('input', schedule);
  return {
    composing: () => composing,
    flush() { cancel(); if (composing) return false; run(); return true; },
    dispose() {
      cancel(); input.removeEventListener('compositionstart', start);
      input.removeEventListener('compositionend', end); input.removeEventListener('input', schedule);
    },
  };
}
