import { defineConfig } from 'vitest/config';
import { readdirSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// 一覧ページ（index.html）と、prototypes/<名前>/index.html をすべてビルドの入口にする
const prototypes = readdirSync('prototypes', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`prototypes/${d.name}/index.html`))
  .map((d) => d.name);

export default defineConfig({
  plugins: [
    {
      // 各試作の thumb.png（一覧ページのサムネイル）を dist にコピーする
      name: 'copy-thumbs',
      apply: 'build',
      closeBundle() {
        for (const p of prototypes) {
          const src = `prototypes/${p}/thumb.png`;
          if (!existsSync(src)) continue;
          mkdirSync(`dist/prototypes/${p}`, { recursive: true });
          copyFileSync(src, `dist/prototypes/${p}/thumb.png`);
        }
      },
    },
  ],
  // GitHub Pages では /game-lab/ 配下に置かれる（CI で BASE を渡す）
  base: process.env.BASE ?? '/',
  server: {
    host: true,
    port: 5173,
    // Docker のボリュームマウント越しでもファイル変更を拾えるようにポーリングする
    watch: { usePolling: true, interval: 200 },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(prototypes.map((p) => [p, resolve(__dirname, `prototypes/${p}/index.html`)])),
      },
    },
  },
  test: {
    include: ['prototypes/*/tests/**/*.test.ts'],
  },
});
