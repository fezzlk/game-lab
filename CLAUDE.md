# game-lab

2つの要素を組み合わせたゲームの試作を集めるリポジトリ。定期実行の手順は `lab/routine.md` が正本。

## 構成
- `prototypes/<YYYYMMDD>-<slug>/` 試作1本ずつ。`prototypes/suresure` が見本（調整値の集約、`?debug`、`?autotest` と `window.__step()`、純粋ロジックのテスト）
- ルートの Vite がマルチページで全試作をビルドする（`vite.config.ts` が `prototypes/*/index.html` を自動で入口にする）。試作の `index.html` からのスクリプト参照は相対パス（`./src/main.ts`）にする
- `prototypes.json` に載せた試作が一覧ページ（`index.html`, `site/`）に出る。`thumb.png`（640×360）はビルド時に dist へコピーされる
- テストは `prototypes/*/tests/**/*.test.ts`

## 作業
- `docker compose up` で起動（http://localhost:5174 、HMR 有効）
- 変更後は `npm test` と `npm run build` を通す
- ゲームデザインの判断は `.claude/skills/sakurai`（`./scripts/setup-skill.sh` で取得）を参照し、根拠の動画番号を README や PR に残す
- 試作のコードは PR にする。main への直接 push は `ideas/` の記録だけ
- 画像・音の素材ファイルは使わない（図形と WebAudio の合成）。有料の API・サービスを足さない
