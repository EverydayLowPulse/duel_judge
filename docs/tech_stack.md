# 技術スタック

使っている技術と、その選んだ理由。あわせて、起動・API・デプロイの手順をまとめる。
ライブラリの細部や索引の調整は、実装しながら決める。

---

## 技術の選定

| 項目 | 選択 | 理由 |
|------|------|------|
| 配信 | PWA（Web） | アプリストアの審査費用と審査待ちを避ける。裁定AIにネイティブ専用の機能は要らない |
| 言語 | TypeScript | 慣れている。画面とAPIを同じ言語で書ける。ボトルネックはLLMの待ち時間なので、言語の速さの差は効きにくい |
| フレームワーク | Next.js（App Router） | TypeScriptでフルスタックに書ける。API Route にカード取得・出典検証・LLM呼び出しをまとめて置ける |
| 置き場所 | `web/` | リポジトリのルートには `docs/` などがあるため、実装は `web/` の下に置く |
| 重い処理 | サーバー側 | カード取得、ルールとQ&Aの検索、出典検証、LLMの呼び出し |
| クライアント | 表示、カード確定の画面、PWAの外枠 | チャット画面程度 |

---

## コードの構成

`web/src/` の下:

| 場所 | 役割 |
|------|------|
| `app/` | 画面（`components/JudgeChat.tsx` がチャット、`components/CardPickerDialog.tsx` がカード確定）と API Route |
| `lib/judge/` | 裁定の処理全体（`runJudge.ts`）。事実の整理（`facts/`）、論点の分類（`issues/`）、機械判定（`validators/`） |
| `lib/llm/` | LLMの呼び出し。プロバイダの切り替え（`providers/`）、モデル一覧（`modelCatalog.ts`）、検索プラン・各検証・回答生成 |
| `lib/answer/` | 回答の型、出典検証（`evidenceGate.ts`）、引用の補正 |
| `lib/rules/` | 総合ルールの索引と検索、キーワード能力の辞書（`keywordDictionary.ts`）、論点オントロジー（`ontology/`） |
| `lib/official/` | 公式サイトからの取得（カード、Q&A）とレート制限 |
| `lib/resolve/` | カード名の解決。有志wikiでの補助検索もここ |
| `lib/aliases/` | 略称辞書 |
| `lib/cache/` | カードとQ&Aのキャッシュ |

処理の流れと各段階の担当ファイルは [project.md](./project.md#各段階の実装)。

---

## ローカルで動かす

```bash
cd web
cp .env.example .env.local   # APIキーを書く
npm install
npm run dev                  # http://localhost:3000/
```

### 環境変数

設定例は `web/.env.example`。

| 変数 | 必須 | 意味 |
|------|------|------|
| `GEMINI_API_KEY` | ほぼ必須 | Gemini（Google AI Studio）のキー |
| `GEMINI_MODEL` | 任意 | モデルを画面で選ばなかったときの既定の Gemini モデル |
| `DEEPSEEK_API_KEY` | 任意 | DeepSeek のキー。カード名の検索語の整形にも使う |
| `DEEPSEEK_MODEL` | 任意 | 既定の DeepSeek モデル |
| `LLM_PROVIDER` | 任意 | `auto` / `gemini` / `deepseek`。`auto` は Gemini を優先し、429・503・クォータ切れ・混雑のときは DeepSeek に切り替える |
| `CARD_RESOLVE_WEB` | 任意 | `auto` / `on` / `off`（既定 `auto`）。公式検索で0件のとき、有志wikiで正式名の候補を探すか |
| `DUEL_JUDGE_DATA` | 任意 | キャッシュの置き場所。未設定ならローカルはリポジトリの `data/`、Vercel では `/tmp/duel_judge_data`（再起動で消える） |

---

## API

### `GET /api/cards?q=レッドゾーン`

カード名を解決し、候補を返す。

- 確定するときは `POST /api/cards` に `{ q, cardId }` を送る
- 公式検索で0件のときは、有志wikiで正式名の候補を探し、公式DBで引き直す（`CARD_RESOLVE_WEB`）。wikiの情報は根拠には使わない
- `DEEPSEEK_API_KEY` があれば、検索語の整形にだけ使う

### `POST /api/judge`

裁定を行う。

```json
{ "question": "…", "confirmedCards": [{ "cardId": "…", "mention": "…" }], "model": "gemini-3.6-flash", "stream": true }
```

| パラメータ | 意味 |
|------------|------|
| `question` | 質問文（必須） |
| `confirmedCards` | 送信前に確定したカード。`[]` は「特定のカードなし」を明示したという意味。指定するとカード名の解決は行わない。`mention` は質問中の表記で、略称辞書の学習に使う |
| `model` | モデルの一覧（`lib/llm/modelCatalog.ts`）のID。省略時はサーバーの既定（`LLM_PROVIDER` と各 `*_MODEL`） |
| `stream` | `true`（または `Accept: text/event-stream`）でSSE。省略時はJSONを1回で返す（スクリプト向け） |
| `cardQuery` / `cardId` | 古い呼び方。カード名を推定するモードで、smoke やスクリプトから使う |
| `provider` | 古い呼び方（`auto` / `gemini` / `deepseek`） |

SSEの中身:

- `progress` イベントが何度か届き、最後に `result` が届く
- `progress` は処理段階の通知で、回答の文字を少しずつ流すものではない。`progress.kind` は `status`（通常の進捗）か `monologue`（出典検証で弾かれた後に見直している、という独り言）
- 約8秒ごとに keepalive（コメント行）を送る。携帯回線で通信がないと切られるのを防ぐため
- Vercel の Hobby プランでは、関数の実行時間の上限が約60秒

画面は回答を「結論（太字）→ 推論 → 根拠の一覧」の順に1つの枠で表示する。

Q&Aと総合ルールの検索は、裁定の処理の中から `lib/official` と `lib/rules` を直接呼ぶ。外部向けの検索APIは置いていない。

---

## LLM

- モデル単位で選ぶ。画面の縦並びのピッカー、または `POST /api/judge` の `model` で指定する
- いま選べるモデル: `deepseek-v4-pro` / `deepseek-v4-flash` / `gemini-3.6-flash` / `gemini-3.5-flash-lite` / `gemini-3.1-pro`
- 一覧は `web/src/lib/llm/modelCatalog.ts`。おすすめのモデルを上に出す
- DeepSeek Flash は 2026-07-31 に正式版になった（内部のバージョンは `DeepSeek-V4-Flash-0731`）。APIのIDは `deepseek-v4-flash` のまま。Pro の正式版は未公開

---

## PWAとデプロイ（Vercel）

| 項目 | 内容 |
|------|------|
| Web App Manifest | `web/src/app/manifest.ts` |
| Service Worker | `web/public/sw.js`。APIはキャッシュしない薄い外枠。本番でだけ登録する |
| アイコン | `web/public/icons/icon-192.png` / `icon-512.png` |
| Vercel のルートディレクトリ | `web/` |
| 環境変数 | Vercel のダッシュボード、または `vercel env add` で入れる |

総合ルールの索引は、`npm run build` の前に走る `build:rules` が `web/data/rules/bundled-index.json` に書き出し、デプロイに同梱する。実行時にPDFからテキストを抽出しないで済むようにするため。ルールが改訂されたら、`npm run build:rules` を実行するか、デプロイし直す。

```bash
cd web
npm run build:rules   # 索引だけ作り直す
npx vercel --prod
```

---

## データの置き場所

方針は [project.md](./project.md#データの持ち方) のとおり。

| データ | 場所 |
|--------|------|
| 総合ルールの索引 | `web/data/rules/bundled-index.json`（ビルド時に生成） |
| 公式Q&A | `data/qa/`（取得した記事のキャッシュ） |
| カード | `data/cards/`（質問されたカードのキャッシュ。有効期限30日） |
| 略称辞書 | `data/aliases/`（1対N） |

`data/` と `bundled-index.json` は生成物なので、Gitの管理対象から外している（`.gitignore`）。

---

## 回帰の確認（開発者向け）

論点ごとの smoke スクリプトがある。

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

ほかの smoke は `web/scripts/smoke/` にある。評価セットの実行は [eval/README.md](./eval/README.md#実行のしかた)。

---

## MVPでやらないこと

- App Store / Google Play への提出（必要になったら Capacitor などで）
- ネイティブ専用の機能（NFC、常時バックグラウンド動作など）
- クライアント側での大きなモデルの推論
- ベクトルDBを先に決めてしまうこと（最初は簡単な検索でよい）

## 認証・課金

ポートフォリオ・デモ用途なので、認証と課金は実装していない。
