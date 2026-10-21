# 公式サイトの実地調査（2026-07-16）

設計の前提にした、公式サイトからデータを取る方法の調査結果。
調査に使ったスクリプト（`temp/probe_*.py`）は使い捨てで、リポジトリには含めていない。

## 結論

- **公開されたJSON APIはない**
- **ただしヘッドレスブラウザ（Playwright など）は要らない。** 普通のHTTPの `POST` / `GET` でカードとQ&Aを取れる
- **総合ルールはPDFで配布されている**

## 早見表

| 操作 | 方法 | 応答 |
|------|------|------|
| カード検索 | `POST https://dm.takaratomy.co.jp/card/`（フォーム送信） | HTMLの断片。カード名は含まない |
| カード詳細 | `GET https://dm.takaratomy.co.jp/card/detail/?id={card_id}` | 正式名と能力テキストを含むHTML |
| Q&A検索 | `POST https://dm.takaratomy.co.jp/rule/qa/`（`qa_w` など） | 記事の一覧 |
| Q&A記事 | `GET https://dm.takaratomy.co.jp/rule/qa/{id}/` | 本文に「Q」「A」がある |
| 総合ルール | PDFをダウンロード | 例: `https://dm.takaratomy.co.jp/img/dm_rule_20260410_4.pdf`（Ver.1.50、2026/04/10） |

---

## カードDB

### 検索

```
POST https://dm.takaratomy.co.jp/card/
Content-Type: application/x-www-form-urlencoded

keyword=...&pagenum=1&keyword_type[]=card_name
```

- 応答はHTMLの断片（`#cardlist`）
- 一覧の各要素は `data-href='/card/detail/?id={id}'` とサムネイル画像だけ。**カード名は載っていない。** 名前や能力を知るには詳細ページを取る必要がある
- URLの `?v={JSON}` はブラウザの履歴用。GETだけでは検索条件が効かず、全件の一覧になる。**検索にはPOSTが必須**

### 詳細

```
GET https://dm.takaratomy.co.jp/card/detail/?id=dm26sd1-w002F
```

- `<title>` に正式名と商品番号が入っている
- 「特殊能力」の欄に能力テキストがある
- 「このカードのよくある質問」のような専用リンクは、調べた詳細ページでは見つからなかった。カードに関係するQ&Aは、Q&A検索（`qa_w=カード名`）で取る

### 検索の挙動

キーワード検索は部分一致に近い。

| 検索語 | 結果の傾向 |
|--------|------------|
| `レッドゾーン` | 関係するカードが大量にヒットする（曖昧） |
| `轟く侵略 レッドゾーン` | 部分一致で、近い名前のカードも混ざる |
| `轟く侵略` | 調査時点では、正式名の1件に絞れた |
| `samename=on` を付ける | 同じカードの再録が増える。MVPではオフにする |

ここから決めたこと:

- 正式名を確定した後は、詳細ページのタイトルで照合する
- キャッシュのキーは、印刷物ごとのIDではなく**正式名**にする（再録で同じカードが別IDになるため）

---

## Q&A

| 項目 | URL・方法 |
|------|-----------|
| 一覧 | `https://dm.takaratomy.co.jp/rule/qa/` |
| ページ送り | `/rule/qa/page/{n}/`（少なくとも396ページまである） |
| 記事 | `/rule/qa/{数字のID}/` |
| 旧Q&A | `/rule/qa_old/` |
| 検索 | `POST /rule/qa/`。パラメータは `qa_w`（語句）、`qa_prod`、`qa_type` |

本文には「Q」と「A」がテキストとして入っているので、ミラーやチャンク分割がしやすい。

---

## 総合ルール

- 配布ページ: `https://dm.takaratomy.co.jp/rule/rulechange/`
- PDFの例: `https://dm.takaratomy.co.jp/img/dm_rule_20260410_4.pdf`（Ver.1.50）
- 条文にルール番号（`000.1.`、`111.` など）が付いている。なので、索引v1でチャンクにルール番号を付けるのは現実的

---

## 取得処理の設計への示唆

```
カード名の解決: 検索をPOST → 各IDの詳細をGET → 正式名で照合する／候補を示す
カードの取得:   正式名でキャッシュを引く → なければ検索と詳細の取得 → data/cards/ に有効期限付きで保存
Q&A:            ページを巡回して定期的にミラー ＋ 必要なときに qa_w で検索
総合ルール:     PDFをダウンロード → テキスト化 → チャンクに分けてルール番号を付ける
```

**レート制限は必須。** カード名の解決では、候補の数だけ詳細ページの取得が走るため。
