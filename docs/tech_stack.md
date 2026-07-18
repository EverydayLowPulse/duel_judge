# 技術スタック（MVP）

迷わないための決定メモ。ライブラリの細部・索引チューニングは実装しながら決める。

## 決定

| 項目 | 選択 | 理由 |
|------|------|------|
| 配信 | **PWA（Web）** | ストア審査料・審査待ちを避ける。裁定AIにネイティブ必須機能はない |
| 言語 | **TypeScript** | 慣れている。UIとAPIを同一言語にできる。ボトルネックはLLM待ちなので言語差は効きにくい |
| 枠組み | **Next.js（App Router）** | TSフルスタック向き。API Route / Server Actions で取得・Gate・LLM呼び出しをサーバ側に置ける |
| アプリ配置 | **`web/`** | ルートは `docs/` 等のため、実装は `web/` 配下 |
| 重い処理の場所 | **サーバ側** | カード取得、ルール/Q&A検索、Evidence Gate、LLM呼び出し |
| クライアント | 表示・`clarify` 対話・PWA壳 | チャットUI程度 |

## ローカル起動

```bash
cd web
npm run dev
```

- 開発用確認UI: `http://localhost:3000/dev`
- 本番チャット: `http://localhost:3000/`（裁定質問・clarify再開・answer表示）
- カード名解決: `GET /api/cards?q=レッドゾーン`（確定は `POST` で `cardId`）
- Q&A検索: `GET /api/qa?q=レッドゾーン&details=2`
- 裁定: `POST /api/judge` `{ question, cardQuery?, cardId? }`
- 総合ルール: `GET /api/rules?q=召喚酔い`（初回は公式PDF取得→チャンク索引。再構築は `POST` `{ rebuild: true }`）
- キーワード辞書: `web/src/lib/rules/keywordDictionary.ts`（能力名→ルール節の決定的注入）
- LLM: `LLM_PROVIDER=auto|gemini|deepseek`（既定 `auto` = Gemini優先、429/quota 時は DeepSeek）
  - Gemini: `GEMINI_API_KEY` / `GEMINI_MODEL`（無料枠があるうちはこちら）
  - DeepSeek: `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL=deepseek-v4-flash`（有料フォールバック）
  - 設定例は `web/.env.example`

## MVPでやらないこと

- App Store / Google Play への提出（必要なら後で Capacitor 等）
- ネイティブ専用機能（NFC、常時バックグラウンドなど）
- クライアントでの大規模モデル推論
- ベクトルDBの最終選定の先走り（最初は簡易でよい）

## データ（既存方針）

`docs/project.md` の RAG 方針に従う。

- ルール・Q&A: ローカルミラー（リポジトリルートの `data/`）
- カード: 都度取得 + TTL付きオンデマンドキャッシュ（`data/cards/`）
- 略称辞書: `data/aliases/`（1対N）
- `data/` は `.gitignore` 対象（キャッシュをコミットしない）

## 認証・課金

- MVP（自分用・非公開）: 省略可
- 公開時: Web決済等を別途検討（ストア内課金に縛られない）

## 参照

- 全体方針: `docs/project.md`
- 回答型: `docs/answer_format.md`
- 評価: `docs/evaluation.md`
