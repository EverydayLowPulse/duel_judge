# 回答フォーマット

LLMが返す回答の形と、表示前に行う出典検証（Evidence Gate）のルール。

**LLMには自由文ではなくJSONを返させる。** 画面はそのJSONを人が読める形に整える。
JSONにする理由は、出典の検証と評価の採点を機械的に行うため。

---

## 回答の種類

| `kind` | 使う場面 |
|--------|----------|
| `answer` | 裁定を答えられるとき |
| `clarify` | カード名などが曖昧で、ユーザーに確認が必要なとき |
| `withhold` | 根拠が足りず、回答を保留するとき |

---

## `answer`

### 例

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

書く順番は「根拠 → 推論 → 結論」にしている。結論を先に書かせると、推論が雑になりやすいため。
免責文はJSONに含めない。アプリ側で必ず付ける。

### 各フィールド

| フィールド | 必須 | 中身 |
|------------|------|------|
| `resolved_cards` | はい | 質問中の表記と、確定した正式名の対応 |
| `resolved_cards[].card_id` | はい | 公式詳細ページの `id`。再開時に検索し直さずに済むよう持つ |
| `resolved_cards[].detail_url` | はい | 公式詳細ページのURL |
| `evidence` | はい（1件以上） | 根拠。空なら `withhold` にする。結論に使わない情報は載せない（関係の薄いルールを並べない） |
| `evidence[].type` | はい | `qa` / `rule` / `card` のどれか。wikiは不可 |
| `evidence[].rule_ref` | `type` が `rule` のとき | ルール番号（例: `111.1`）。採点と照合に使う |
| `evidence[].url` | はい | `dm.takaratomy.co.jp` のURLだけ |
| `evidence[].quote` | はい | 取得済みテキストからの引用。要約や言い換えは禁止 |
| `reasoning` | `confidence` が `medium` / `low` のとき。`high` でも総合ルールを使うなら書くのが望ましい | 根拠から結論への橋渡しを1〜2文で。Q&Aの言い換えで終わらせず、ルールの原理（例: 801.2 = 進化しても同じクリーチャーなので効果が続く）まで書く |
| `conclusion` | はい | 1〜2文で言い切る。前置きや免責は書かない |
| `confidence` | はい | 確信度（次の表） |
| `confidence_note` | はい | 確信度の理由を短く |

### 確信度

モデルの裁量を減らすため、根拠の種類で機械的に決まるようにしている。

| 値 | 意味 | 条件 |
|----|------|------|
| `high` | 公式Q&Aに直接の該当がある | `evidence` に `type: qa` が必要 |
| `medium` | 直接の該当はないが、似た公式Q&Aを根拠にしている | — |
| `low` | Q&Aはなく、ルールからの推論だけ。確定した裁定ではない | — |

---

## `clarify`

候補には正式名だけでなく `card_id` と詳細URLも持たせる。選んでもらった後に検索し直さずに済むため。

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

曖昧なカードが複数あるときは、1回の確認でまとめて聞く（1枚ずつ順に聞かない）。

---

## `withhold`

```json
{
  "kind": "withhold",
  "reason": "出典検証に失敗した／根拠チャンクが不足",
  "tried": ["ルール検索", "Q&A検索"],
  "next_hint": "カード正式名を指定してもう一度質問してください。"
}
```

---

## Evidence Gate（出典検証）

`answer` を表示する前に必ず通すチェック（`web/src/lib/answer/evidenceGate.ts`）。
失敗は2種類に分ける。

- **ハード失敗**: でっち上げや根拠なしの疑いがある。回答を保留する
- **ソフト失敗**: 確信度のラベルが根拠と食い違っているだけ。自動で直して回答する

### ハード失敗（保留する）

次のどれかに当てはまれば保留する。

1. `evidence` が0件
2. `url` が `https://dm.takaratomy.co.jp/` で始まらない
3. `quote` が、検索で取得したテキストに含まれていない
4. `evidence[].type` が `qa` / `rule` / `card` 以外
5. `type: rule` なのに `rule_ref` がない
6. `conclusion` が空

3の照合方法:

- **類似度などの曖昧一致は使わない**
- 照合の前に、引用と取得テキストの両方を正規化する。具体的には、Unicode正規化（NFKC。全角と半角をそろえる）、空白と改行の除去、かっこ類の除去、英字の小文字化（`web/src/lib/answer/normalize.ts`）
- 正規化した後の部分文字列一致で判定する。PDF抽出で改行の位置がずれても、誤って落とさないため

### ソフト失敗（自動で直す）

| 状態 | 直し方 |
|------|--------|
| `high` / `medium` なのに `type: qa` がない | ルールの根拠があれば `low`、カード情報だけなら `medium` に下げ、`confidence_note` に注記する |
| `low` なのに `type: qa` がある | `medium` に上げる |
| `medium` / `low` で `reasoning` が空 | 短い説明を自動で付ける |

### 検証の前後で行う処理

LLMの出力をそのまま検証にかけるのではなく、先に機械的な補正をかける。どれも新しい裁定は作らない。

1. **原理の根拠を足す**（`enrichPrincipleEvidence`）: 論点が必要とする総合ルールが検索結果にあるのに `evidence` にないとき、足す
2. **引用を原文に寄せる**（`repairEvidenceQuotes`）: LLMが引用を少し言い換えたとき、取得テキスト上の連続した文字列に置き換える。寄せられなければ触らない（その場合は検証で落ちる）
3. **使っていないルールを外す**（`pruneUnusedRuleEvidence`）: 推論にも結論にも出てこないルール番号の根拠を外す
4. **検証する**（`runEvidenceGate`）
5. **ハード失敗なら1回だけ作り直す**: 失敗の理由を添えて、同じ検索結果のまま再生成し、1〜4をもう一度通す。新しい検索はしない。それでも失敗したら `withhold` にする

---

## 画面での表示例

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

免責文と最終同期日時（`last_synced_at`）は、モデルに書かせずアプリ側で付ける。
現状、免責文は表示しているが、最終同期日時は値を持っていない（未実装）。

---

## やらないこと

| やらないこと | 理由 |
|--------------|------|
| 自由文だけで回答させる | 検証できない |
| wikiを `evidence` に入れる | 根拠は公式だけにする |
| `quote` を言い換えさせる | 照合が成り立たなくなる |
| 免責のフラグ（`disclaimer`）をJSONに持たせる | 常に表示するので、フィールドにする意味がない |
| 確信度を0〜100の連続値にする | MVPでは3段階で足りる |
| 照合に埋め込みの類似度などの曖昧一致を使う | 「似ているが違う文」を通してしまう |
