import './style.css';
import { VIEW_W, VIEW_H } from './params';
import { Input } from './input';
import { Sfx } from './audio';
import { Game } from './game';
import { mountDebugPanel } from './debug';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
let scale = 1, offX = 0, offY = 0, dpr = 1;

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  scale = Math.min(w / VIEW_W, h / VIEW_H);
  offX = (w - VIEW_W * scale) / 2;
  offY = (h - VIEW_H * scale) / 2;
  document.body.classList.toggle('portrait', h > w);
}
window.addEventListener('resize', resize);
resize();

const input = new Input(canvas, (cx, cy) => ({ x: (cx - offX) / scale, y: (cy - offY) / scale }));
const sfx = new Sfx();
const game = new Game(input, sfx);
mountDebugPanel();

// 60fps 固定ステップ（処理速度で難易度が変わらないように）
const STEP = 1000 / 60;
// ?autotest では自動操縦スクリプトが __step で進めるので、ここでは描画だけ
const AUTOTEST = new URLSearchParams(location.search).has('autotest');
let acc = 0, last = performance.now();
function loop(now: number): void {
  acc += Math.min(100, now - last);
  last = now;
  if (AUTOTEST) acc = 0;
  while (acc >= STEP) {
    input.poll();
    game.update();
    acc -= STEP;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW_W, VIEW_H); g.clip();
  game.draw(g);
  g.restore();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// テスト・デバッグ用（自動操縦スクリプトから 1 フレームずつ進められる）
Object.assign(window, { game, __step: () => { input.poll(); game.update(); } });
