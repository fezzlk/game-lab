# game-lab

2つの要素（例：「音ゲー」×「RTA」）を組み合わせたゲームを、AI エージェントが定期的に提案し、採用された案を試作するリポジトリ。

**遊ぶ**: https://fezzlk.github.io/game-lab/

## 流れ
1. クラウドの定期実行が、毎日1回 [`lab/routine.md`](lab/routine.md) を読んで動く
2. 提案日（月・水・金）には、[`ideas/elements.md`](ideas/elements.md) から分類の違う2つの要素を選び、ゲーム案を3つ Slack の `#p-game-lab` に投稿する
3. スレッドに返信して決める
   - `採用 A` … その案を試作する
   - `どれもなし` … 見送る
   - `要素: ○○` … 次の提案でその単語を使う
4. 採用された案は、次の実行で実装される。実装 → [sakurai-skill](https://github.com/kociden/sakurai-skill) を使ったレビュー → 直し → PR まで自動で進み、PR のリンクがスレッドに返る
5. PR をマージすると、GitHub Pages の一覧に載る

提案と採否の記録は [`ideas/history.md`](ideas/history.md) にある。

## 手元で動かす
```bash
docker compose up        # http://localhost:5174/ （一覧）
```
Docker を使わない場合は `npm install && npm run dev`。

- `npm test` … 全試作のテスト（vitest）
- `npm run build` … 型チェック + 本番ビルド（`dist/`）
- `./scripts/setup-skill.sh` … sakurai-skill を `.claude/skills/sakurai` に取得する（LICENSE が無いので、このリポジトリには含めない）

## 構成
```
prototypes/<YYYYMMDD>-<slug>/   試作1本ずつ（index.html, src/, tests/, README.md, thumb.png）
prototypes.json                 一覧ページに出す試作のリスト
ideas/elements.md               要素の一覧（自由に足してよい）
ideas/history.md                提案と採否の記録
lab/routine.md                  定期実行の手順書
```

> sakurai-skill は非公式のファンメイドで、桜井政博氏・有限会社ソラとは関係ありません。
