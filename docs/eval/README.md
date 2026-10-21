# 評価ケース（`docs/eval/`）

Phase 1 用の固定の問題集。最近つまずいた裁定を中心に、正解の要約と必ず引用してほしい出典を先に決めておく。
採点ルールの正本は [evaluation.md](../evaluation.md)。

## いま入っているケース

| id | セット | 狙い |
|----|--------|------|
| `mana-payment-001` | B | 多色マナの支払い（総合ルール 112.2a） |
| `mana-payment-002-daishugo` | B | 代替コストと通常の支払いの違い |
| `perspective-fairy-mekakushi-001` | A | 同期の妖精 × メカくし（「自分／相手」の視点） |
| `perspective-fairy-trap-001` | A | 妖精 × トラップの「または」の選択（Q&A 45555） |
| `evolution-first-attack-redzone-f-001` | A | 侵略した後も同じクリーチャーか。最初の攻撃の扱い（Q&A 42363） |
| `evolution-justdiver-mach-001` | A | 継続的効果と常在型能力の違い |
| `swap-charisma-not-blocker-001` | B | 「破壊されてマナへ」は入れ替えの阻害にならない |
| `replacement-break-saint-castle-001` | A | 置換されたブレイクは手札へ（Q&A 48504） |

## 実行のしかた

```bash
cd web
npx tsx scripts/run-eval.ts              # ケースの一覧を出すだけ
npx tsx scripts/run-eval.ts --full       # 全件を実際に裁定させる（APIキーが必要。時間がかかる）
npx tsx scripts/run-eval.ts --full --id=replacement-break-saint-castle-001   # 1件だけ
```

`--full` の自動採点は**補助**。最終的な正誤は人が判定する（結論が合っているか、でっち上げがないか）。

## ケースの書き方

[evaluation.md](../evaluation.md#1問の書き方) のJSONに加えて、自動採点用に次の2つを任意で書ける。

| フィールド | 意味 |
|------------|------|
| `must_conclusion_contains` | 結論に含まれていてほしい語 |
| `must_not_conclusion_contains` | 結論に含まれていてはいけない語 |

自動採点の照合のしかた（`web/scripts/run-eval.ts`）:

- どちらも部分一致。ただし直前に「不」「非」「無」があれば一致とみなさない。たとえば「可能」は「不可能」に一致しない
- `must_conclusion_contains` は、結論だけでなく推論（`reasoning`）や引用文（`quote`）に含まれていても合格になる。引用文にたまたま語が入っていて通ってしまうことがあるので、自動採点が合格でも中身は人が確認する
- `must_not_conclusion_contains` は結論だけを見る

## ケースの足し方

1. 誤答や怪しい回答が出たら、`docs/eval/<id>.json` を1件足す
2. できれば、対応する `web/scripts/smoke/smoke-*.ts` も足す（論点の検出やシードの注入など、機械的に決まる部分の回帰確認）
3. ときどき `--full` で全件を通し、落ちたものを直す
