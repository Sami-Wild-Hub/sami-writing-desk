// Update timeline chips only when their content or positions change; cache measured widths.
export class TimelineStrip {
  private key = '';
  private widths = new Map<string, number>();
  constructor(private root: HTMLElement) {}
  reset() { this.key = ''; this.widths.clear(); }
  update(ticks: string, chips: { x: number; html: string }[]) {
    const key = ticks + JSON.stringify(chips);
    if (key === this.key) return;
    this.key = key;
    this.root.innerHTML = ticks + chips.map(c => c.html).join('');
    const nodes = [...this.root.querySelectorAll<HTMLElement>('.chip2')];
    // Batch layout reads before writes, and reuse these widths on later band/line changes.
    const widths = nodes.map((node, i) => {
      const id = chips[i].html;
      if (!this.widths.has(id)) this.widths.set(id, node.offsetWidth);
      return this.widths.get(id)!;
    });
    let left = 0;
    nodes.forEach((node, i) => {
      const x = Math.max(4, chips[i].x - 8, left);
      node.style.left = `${x}px`; left = x + widths[i] + 4;
    });
  }
}
