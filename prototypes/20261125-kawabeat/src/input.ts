export type Action = { kind: 'tap'; x: number; y: number } | { kind: 'key'; code: string };

/** タッチ・マウス・キーボードを「操作の列」にまとめる。ゲーム側が毎フレーム取り出す */
export class Input {
  queue: Action[] = [];

  constructor(el: HTMLElement, toLogical: (cx: number, cy: number) => { x: number; y: number }) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.code)) e.preventDefault();
      this.queue.push({ kind: 'key', code: e.code });
    });
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = toLogical(e.clientX, e.clientY);
      this.queue.push({ kind: 'tap', x: p.x, y: p.y });
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  drain(): Action[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
