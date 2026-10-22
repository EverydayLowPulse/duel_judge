# 技術スタック（MVP）

迷わないための決定メモ。ライブラリの細部・索引チューニングは実装しながら決める。

## 決定

| 項目 | 選択 | 理由 |
|------|------|------|
| 配信 | **PWA（Web）** | ストア審査料・審査待ちを避ける。裁定AIにネイティブ必須機能はない |
| 言語 | **TypeScript** | 慣れている。UIとAPIを同一言語にできる。ボトルネックはLLM待ちなので言語差は効きにくい |
| 枠組み | **Next.js（App Router）** | TSフルスタック向き。API Route / Server Actions で取得・Gate・LLM呼び出しをサーバ側に置ける |
| アプリ配置 | **`web/`** | ルートは `docs.byAI/` 等のため、実装は `web/` 配下 |
| 重い処理の場所 | **サーバ側** | カード取得、ルール/Q&A検索、Evidence Gate、LLM呼び出し |
| クライアント | 表示・カード確定UI・PWA壳 | チャットUI程度 |

## ローカル起動

```bash
cd web
npm run dev
```

## PWA / デプロイ（Vercel）

- Web App Manifest: `src/app/manifest.ts`
- Service Worker: `public/sw.js`（APIはキャッシュしない薄い壳。本番のみ登録）
- アイコン: `public/icons/icon-192.png` / `icon-512.png`
- ルートディレクトリは **`web/`**
- 環境変数: `GEMINI_API_KEY`（必須に近い）、任意で `DEEPSEEK_API_KEY` / `LLM_PROVIDER` / `DUEL_JUDGE_DATA`
- Vercel 上の書き込みキャッシュは未設定時 `/tmp/duel_judge_data`（消える）
- **総合ルール索引**は `npm run build` 前の `build:rules` で `data/rules/bundled-index.json` に同梱（実行時の PDF 抽出を避ける）

```bash
cd web
npm run build:rules   # 索引だけ再生成
npx vercel --prod
```

環境変数は Vercel ダッシュボードか `vercel env add` で入れる。

---

- 本番チャット: `http://localhost:3000/`（状況入力 → カード確定ポップアップ → answer表示。フローは `docs.byAI/project.md`）
- カード名解決: `GET /api/cards?q=レッドゾーン`（確定は `POST` で `cardId`）
  - 公式0件時は dmwiki 検索で正式名候補 → 公式DB再突合（`CARD_RESOLVE_WEB=auto|on|off`）。論拠には使わない
  - 任意: `DEEPSEEK_API_KEY` があれば検索語整形のみ（Gemini grounding は使わない）
- 裁定: `POST /api/judge` `{ question, confirmedCards?, cardQuery?, cardId?, stream? }`
  - `confirmedCards`: `[{ cardId, mention? }]`。送信前確定モード（`[]` は「カードなし」の明示）。指定時はカード名解決を行わない。`mention` は略称辞書へ学習させる
  - `cardQuery` / `cardId` は後方互換（スモーク・スクリプト用の推定モード）
  - 既定: JSON 一発（スモーク・スクリプト向け）
  - `stream: true` または `Accept: text/event-stream`: SSE（`progress` → `result`）。進捗は段階イベント（回答トークンではない）。`progress.kind` は `status` / `monologue`（出典検証で弾れたあとの見直し独り言）。UI回答は「結論（太字）→推論→根拠一覧」を1枠で表示
  - SSE は約8秒ごとに keepalive（コメント行）。携帯回線の無通信切断を抑止。Vercel Hobby は関数上限約60秒
- Q&A・総合ルール検索は裁定パイプライン内の `lib/official` / `lib/rules` 経由（公開 HTTP API は置かない）
- キーワード辞書: `web/src/lib/rules/keywordDictionary.ts`（能力名→ルール節の決定的注入）
- ルールオントロジー: `web/src/lib/rules/ontology/`（論点→ruleRefs / qaSeeds / validator）
- 事実モデル: `web/src/lib/judge/facts/`（`ScenarioFacts`。カード属性は公式DBで上書き）
- 論点分類: `web/src/lib/judge/issues/classifyIssues.ts`
- 決定的validators: `web/src/lib/judge/validators/`（例: 多色マナ支払い）。`not_allowed` は `buildDeterministicAnswer` でLLM省略回答にする
- LLM: モデル単位で選択（UI の縦ピッカー / `POST /api/judge` の `model`）
  - カタログ: `web/src/lib/llm/modelCatalog.ts`（推奨を上位表示）
  - いま選べる: `deepseek-v4-pro` / `deepseek-v4-flash` / `gemini-3.6-flash` / `gemini-3.5-flash-lite` / `gemini-3.1-pro`
  - DeepSeek Flash は 2026-07-31 正式版（裏バージョン `DeepSeek-V4-Flash-0731`）。API ID は `deepseek-v4-flash` のまま。Pro 正式版は未公開
  - サーバ既定: `LLM_PROVIDER` + `DEEPSEEK_MODEL` / `GEMINI_MODEL`（`model` 未指定時）
  - `provider=auto|gemini|deepseek` は後方互換
  - Gemini: `GEMINI_API_KEY` / DeepSeek: `DEEPSEEK_API_KEY`

  - 設定例は `web/.env.example`

### 回帰スモーク（例・開発者向け）

```bash
cd web
npx tsx scripts/test-mana-payment-validator.ts
npx tsx scripts/smoke/smoke-confirmed-cards.ts
npx tsx scripts/smoke/smoke-mana-payment.ts
npx tsx scripts/smoke/smoke-daishugo-mana.ts
npx tsx scripts/smoke/smoke-card-resolve-bande.ts
npx tsx scripts/smoke/smoke-pending-revolution.ts
npx tsx scripts/smoke/smoke-pending-seal-battle.ts
npx tsx scripts/smoke/smoke-resolution-order.ts
```

## MVPでやらないこと

- App Store / Google Play への提出（必要なら後で Capacitor 等）
- ネイティブ専用機能（NFC、常時バックグラウンドなど）
- クライアントでの大規模モデル推論
- ベクトルDBの最終選定の先走り（最初は簡易でよい）

## データ（既存方針）

`docs.byAI/project.md` の RAG 方針に従う。

- ルール・Q&A: ローカルミラー（リポジトリルートの `data/`）
- **総合ルール索引**: ビルド時に `web/data/rules/bundled-index.json` を生成して同梱（実行時 PDF 抽出を避ける）。ルール改訂時は `npm run build:rules` または再デプロイ
- カード: 都度取得 + TTL付きオンデマンドキャッシュ（`data/cards/`）
- 略称辞書: `data/aliases/`（1対N）
- `data/` は原則 `.gitignore`（`bundled-index.json` も生成物として ignore）

## 認証・課金

- ポートフォリオ／デモ用途では認証・課金は未実装（ローカルまたは限定公開を想定）

## 参照

- 全体方針: `docs.byAI/project.md`
- 回答型: `docs.byAI/answer_format.md`
- 評価: `docs.byAI/evaluation.md`
