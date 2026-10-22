# 小さな評価セット（`docs.byAI/eval/`）

Phase 1 向けの**固定問題集**。最近つまずいた裁定を中心に、正答の要約と必須出典を先に決めておく。

採点ルールの正本は [`../evaluation.md`](../evaluation.md)。

## いま入っているケース

| id | set | 狙い |
|----|-----|------|
| `mana-payment-001` | B | 多色マナ支払い（112.2a） |
| `mana-payment-002-daishugo` | B | 代替コスト vs 通常支払い |
| `perspective-fairy-mekakushi-001` | A | 同期の妖精 × メカくし（視点） |
| `perspective-fairy-trap-001` | A | 妖精 × トラップ OR 選択（45555） |
| `evolution-first-attack-redzone-f-001` | A | 侵略後も同一／最初の攻撃（42363） |
| `evolution-justdiver-mach-001` | A | 継続的効果 vs 常在型 |
| `swap-charisma-not-blocker-001` | B | 破壊→マナ ≠ 入れ替え阻害 |
| `replacement-break-saint-castle-001` | A | 置換ブレイク → 手札（48504） |

## ケースの書き方

`evaluation.md` の JSON に加え、自動採点用に次を任意で足せる。

- `must_conclusion_contains`: 結論（または根拠文）に含めたい語
- `must_not_conclusion_contains`: 結論にあってはいけない語

## 実行

```bash
cd web
npx tsx scripts/run-eval.ts              # 一覧のみ
npx tsx scripts/run-eval.ts --full       # 全件 runJudge（APIキー必要・時間かかる）
npx tsx scripts/run-eval.ts --full --id=replacement-break-saint-castle-001
```

`--full` の自動採点は**補助**。最終の正誤は人手（結論一致・捏造なし）。

## 足し方

1. 誤答・あやしい回答が出たら `docs.byAI/eval/<id>.json` を1件追加
2. 可能なら対応する `web/scripts/smoke/smoke-*.ts` も足す（論点 seed など決定的部分）
3. たまに `--full` で通し、落ちたものを直す
