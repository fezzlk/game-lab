import { P, PARAM_RANGE, type ParamKey } from './params';

/** `?debug` で開くと調整値をスライダーで即時反映できる（#046, #193 デバッグモード） */
export function mountDebugPanel(): void {
  if (!new URLSearchParams(location.search).has('debug')) return;
  const saved = JSON.parse(localStorage.getItem('suresure.params') ?? '{}') as Partial<typeof P>;
  Object.assign(P, saved);

  const panel = document.createElement('div');
  panel.id = 'debug';
  const head = document.createElement('div');
  head.innerHTML = '<b>params</b> ';
  const copy = document.createElement('button');
  copy.textContent = 'コピー';
  copy.onclick = () => void navigator.clipboard.writeText(JSON.stringify(P, null, 2));
  const reset = document.createElement('button');
  reset.textContent = 'リセット';
  reset.onclick = () => { localStorage.removeItem('suresure.params'); location.reload(); };
  head.append(copy, reset);
  panel.append(head);

  for (const key of Object.keys(PARAM_RANGE) as ParamKey[]) {
    const [min, max, step] = PARAM_RANGE[key]!;
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = key;
    const val = document.createElement('code');
    val.textContent = String(P[key]);
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min, max, step, value: P[key] });
    input.oninput = () => {
      P[key] = Number(input.value);
      val.textContent = input.value;
      localStorage.setItem('suresure.params', JSON.stringify(P));
    };
    // スライダー操作がゲームの入力にならないように
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    row.append(name, input, val);
    panel.append(row);
  }
  document.body.append(panel);
}
