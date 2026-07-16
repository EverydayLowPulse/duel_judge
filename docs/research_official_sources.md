# 公式ソース実地調査メモ（2026-07-16）

設計前提の検証結果。再現用スクリプトは `temp/probe_*.py`（使い捨て）。

## 結論（一言）

公開JSON APIはないが、**Playwright不要**。`POST/GET` でカード・Q&Aを取れる。総合ルールはPDF。

## カードDB

### 検索

```
POST https://dm.takaratomy.co.jp/card/
Content-Type: application/x-www-form-urlencoded

keyword=...&pagenum=1&keyword_type[]=card_name
```

- 応答: HTML断片（`#cardlist`）
- 一覧の各要素: `data-href='/card/detail/?id={id}'` + サムネ画像のみ（**カード名なし**）
- `?v={JSON}` は履歴用。GETだけでは条件が効かない

### 詳細

```
GET https://dm.takaratomy.co.jp/card/detail/?id=dm26sd1-w002F
```

- `<title>` に正式名＋商品番号
- 「特殊能力」セクションにルールテキスト

### 検索挙動の注意

| クエリ | 結果の傾向 |
|--------|------------|
| `レッドゾーン` | 関連カードが大量ヒット（曖昧） |
| `轟く侵略 レッドゾーン` | 部分一致で近縁カードも混ざる |
| `轟く侵略` | 正式名1件に寄る（検証時） |
| `samename=on` | 再録が増える。MVPはオフ想定 |

キャッシュキーは印刷IDではなく**正式名**単位がよい。

カード個別の「このカードのよくある質問」リンクは、調査した詳細ページでは確認できず。関連Q&AはQ&A検索で取る。

## Q&A

- 一覧: `https://dm.takaratomy.co.jp/rule/qa/`
- ページ: `/rule/qa/page/{n}/`（page1から少なくとも396までリンクあり）
- 記事: `/rule/qa/{numeric_id}/`
- 旧: `/rule/qa_old/`
- 検索: `POST /rule/qa/` with `qa_w`, `qa_prod`, `qa_type`
- 本文構造: `Q` / `A` がテキストとして存在（ミラー・チャンク分割しやすい）

## 総合ルール

- ポータル: `https://dm.takaratomy.co.jp/rule/rulechange/`
- PDF例: `https://dm.takaratomy.co.jp/img/dm_rule_20260410_4.pdf`（Ver.1.50）
- ルール番号あり（`000.1.` / `111.` 等）→ 索引v1のメタデータ付与は可能

## fetch設計への示唆

```
resolve: keyword POST → 各idの detail GET → 正式名で突合/候補提示
fetch:   正式名キャッシュ命中? → なければ検索+詳細 → data/cards/ にTTL付き保存
qa:      定期ミラー（page巡回）+ 必要時 qa_w 検索
rules:   PDFダウンロード → テキスト化 → チャンク+ルール番号メタデータ
```

レート制限必須（詳細GETが候補数ぶん走るため）。
