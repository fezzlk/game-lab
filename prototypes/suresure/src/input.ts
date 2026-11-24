/** 押している間＝上昇。タッチ・マウス・キーボードを1つの「押下」にまとめる */
export class Input {
  held = false;
  /** このフレームで押された */
  pressed = false;
  /** 押した位置（論理座標）。ボタン判定用 */
  pressPos: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private pointers = new Set<number>();
  private queuedPress = false;
  private queuedPos: { x: number; y: number } | null = null;
  onKey: (code: string) => void = () => {};

  constructor(el: HTMLElement, toLogical: (cx: number, cy: number) => { x: number; y: number }) {
    const holdKeys = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'Enter']);
    window.addEventListener('keydown', (e) => {
      if (holdKeys.has(e.code)) {
        e.preventDefault();
        if (!this.keys.has(e.code)) { this.keys.add(e.code); this.queuedPress = true; this.queuedPos = null; }
      } else if (!e.repeat) {
        this.onKey(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pointers.add(e.pointerId);
      this.queuedPress = true;
      this.queuedPos = toLogical(e.clientX, e.clientY);
    });
    const up = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 1 フレームの最初に呼ぶ */
  poll(): void {
    this.pressed = this.queuedPress;
    this.pressPos = this.queuedPos;
    this.queuedPress = false;
    this.queuedPos = null;
    this.held = this.keys.size > 0 || this.pointers.size > 0;
  }

  /** ボタンで消費した押下を上昇に使わない */
  consume(): void {
    this.pressed = false;
    this.pointers.clear();
    this.held = this.keys.size > 0;
  }
}
