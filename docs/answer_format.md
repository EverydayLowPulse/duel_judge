# 回答フォーマット

方針: LLMは自由文ではなく **JSON** を返す。UIはそれを人間向けに整形する。  
理由: Evidence Gate（出典検証）とテスト採点を機械的にやるため。

## 回答の種類

| kind | いつ |
|------|------|
| `answer` | 裁定回答を出せるとき |
| `clarify` | カード名などが曖昧で確認が必要なとき |
| `withhold` | 出典が足りず回答を保留するとき |

## `answer` のスキーマ（内部）

フィールド順は「根拠 → 推論（任意）→ 結論」。結論を先に書かせると推論が雑になりやすい。  
免責文はスキーマに含めない（アプリ側で必ず付与）。

```json
{
  "kind": "answer",
  "resolved_cards": [
    {
      "query": "赤ゾ",
      "official_name": "轟く侵略 レッドゾーン",
      "card_id": "dm26sd1-w002F",
      "detail_url": "https://dm.takaratomy.co.jp/card/detail/?id=dm26sd1-w002F"
    }
  ],
  "evidence": [
    {
      "type": "qa",
      "label": "公式Q&A",
      "url": "https://dm.takaratomy.co.jp/rule/qa/48739/",
      "quote": "はい。その場合、〜"
    },
    {
      "type": "rule",
      "label": "総合ルール",
      "rule_ref": "111.1",
      "url": "https://dm.takaratomy.co.jp/img/dm_rule_20260410_4.pdf",
      "quote": "〜"
    }
  ],
  "reasoning": "Q&Aの類似例とルール111.1を合わせると、この状況でも同じ扱いになる。",
  "conclusion": "その場合、シールドは墓地に置かれず手札に加わる。",
  "confidence": "medium",
  "confidence_note": "類似Q&Aあり。直接該当のQ&Aはない"
}
```

### フィールド説明

| フィールド | 必須 | 意味 |
|------------|------|------|
| `resolved_cards` | はい | 質問中の表記 → 確定した正式名 |
| `resolved_cards[].card_id` | はい | 公式詳細の `id`。再開時に再検索を避ける |
| `resolved_cards[].detail_url` | はい | 公式詳細URL |
| `evidence` | はい（1件以上） | 根拠。空なら `withhold` にする |
| `evidence[].type` | はい | `qa` / `rule` / `card` のみ。wiki不可 |
| `evidence[].rule_ref` | `type=rule` のとき必須 | ルール番号（例: `111.1`）。採点・突合用 |
| `evidence[].url` | はい | `dm.takaratomy.co.jp` のみ |
| `evidence[].quote` | はい | 取得済みテキストからの引用（要約・言い換え禁止） |
| `reasoning` | `confidence` が `medium` / `low` のとき必須。`high` は任意 | 根拠から結論への橋渡し（短く） |
| `conclusion` | はい | 1〜2文で断言。前置きや免責は書かない |
| `confidence` | はい | 下表 |
| `confidence_note` | はい | 確信度の理由を短く |

### 確信度

判定を機械的に寄せる（モデルの裁量を減らす）。

| 値 | 意味 |
|----|------|
| `high` | 公式Q&Aに**直接該当**あり（`evidence` に `type: qa` が必須） |
| `medium` | 直接該当のQ&Aはないが、**類似Q&A**を根拠にしている |
| `low` | Q&Aなし。ルールからの推論のみ（確定裁定ではない） |

## `clarify` のスキーマ

候補は正式名だけでなく、選択後に再検索しなくて済むよう `card_id` / `detail_url` を持つ。

```json
{
  "kind": "clarify",
  "questions": [
    {
      "about": "レッドゾーン",
      "candidates": [
        {
          "official_name": "轟く侵略 レッドゾーン",
          "card_id": "dm26sd1-w002F",
          "detail_url": "https://dm.takaratomy.co.jp/card/detail/?id=dm26sd1-w002F"
        },
        {
          "official_name": "超音速 レッドゾーンX",
          "card_id": "dmex16-027",
          "detail_url": "https://dm.takaratomy.co.jp/card/detail/?id=dmex16-027"
        },
        {
          "official_name": "熱き侵略 レッドゾーンZ",
          "card_id": "dm26sd1-k004",
          "detail_url": "https://dm.takaratomy.co.jp/card/detail/?id=dm26sd1-k004"
        }
      ]
    }
  ],
  "note": "複数候補があるため、どれを指すか選んでください。"
}
```

曖昧な略称が複数あるときは、質問を1ターンにまとめる（逐次確認しない）。

## `withhold` のスキーマ

```json
{
  "kind": "withhold",
  "reason": "出典検証に失敗した／根拠チャンクが不足",
  "tried": ["ルール検索", "Q&A検索"],
  "next_hint": "カード正式名を指定してもう一度質問してください。"
}
```

## Evidence Gate（機械チェック）

`answer` を出す前に通す。**ハード失敗だけ withhold**。ソフト失敗はラベルを直して回答する。

### ハード（保留）

1. `evidence` が1件以上ある
2. 各 `url` が `https://dm.takaratomy.co.jp/` で始まる
3. 各 `quote` が、検索で取得済みのチャンクに含まれること  
   - **曖昧一致（類似度）は使わない**
   - ただし照合前に双方を正規化する: 空白・改行の除去、全角/半角の統一など  
   - 正規化後の部分文字列一致で判定（PDF抽出の改行ズレによる偽陰性を防ぐ）
4. `evidence[].type` が `qa` / `rule` / `card` のみ
5. `type: rule` には `rule_ref` がある
6. `conclusion` が空でない

### ソフト（自動修正して回答）

`confidence` と根拠種別の食い違いは保留しない。

- `high` / `medium` なのに `type: qa` がない → `low`（ruleあり）または `medium`（cardのみ）へ下げ、`confidence_note` に注記
- `low` なのに `type: qa` がある → `medium` へ上げる
- `medium` / `low` で `reasoning` が空 → 短い注記を自動付与

## ユーザー向け表示（整形例）

```
【結論】
その場合、シールドは墓地に置かれず手札に加わる。

【根拠】
- 公式Q&A「はい。その場合、〜」
  https://dm.takaratomy.co.jp/rule/qa/48739/
- 総合ルール 111.1「〜」
  （総合ルールPDF）

【確信度】中 — 類似Q&Aあり。直接該当のQ&Aはない

※ 本回答は公式裁定の代替ではありません。大会ではジャッジに確認してください。
※ ルール/Q&A最終同期: 2026-07-16
```

免責文と `last_synced_at` はアプリ側で必ず付与する（モデルに書かせない）。

## やらないこと

- 自由文だけで回答させる（検証不能）
- wikiを `evidence` に入れる
- `quote` を言い換えて書かせる（照合が壊れる）
- `disclaimer` をJSONに持たせる（常にtrueならフィールド不要）
- 確信度を 0〜100 の連続値にする（MVPでは3段階で十分）
- 照合を埋め込み類似度などの曖昧一致にする
