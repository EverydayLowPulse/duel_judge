# デュエマ裁定確認 AI

デュエル・マスターズの裁定質問に、公式カード DB・公式 Q&A・総合ルールを根拠付きで答える Web アプリ（PWA）です。

質問を投げると、送信前にカードを確定し、論点分類 → ルール/Q&A 検索 → 決定的バリデータまたは LLM 推論 → **Evidence Gate（出典照合）** を経て回答します。

## 技術ハイライト

- **Evidence Gate** — 引用必須。検索ヒットした文言との部分一致まで検証し、出典のない裁定を出さない
- **決定的 validators** — 多色マナ支払いなど解ける論点は LLM を介さず総合ルール引用で回答
- **カード確定 UI** — 略称ゆれを推測で決め打ちせず、送信前に正式名をユーザーが確定
- **マルチプロバイダ LLM** — DeepSeek / Gemini をカタログから切替（フォールバック付き）
- **設計ドキュメント** — 処理フロー・回答スキーマ・評価セットを [`docs/`](./docs/) に整理

## セットアップ

```bash
cd web
cp .env.example .env.local
# GEMINI_API_KEY または DEEPSEEK_API_KEY を設定
npm install
npm run dev
```

ブラウザで `http://localhost:3000/` を開きます。環境変数の詳細は [`web/.env.example`](./web/.env.example) を参照してください。

本番ビルドでは総合ルール索引を同梱します。

```bash
cd web
npm run build
npm start
```

## ドキュメント

| パス | 内容 |
|------|------|
| [`docs/project.md`](./docs/project.md) | 全体方針・処理フロー |
| [`docs/answer_format.md`](./docs/answer_format.md) | 回答 JSON・Evidence Gate |
| [`docs/evaluation.md`](./docs/evaluation.md) | 評価セット・採点軸 |
| [`docs/tech_stack.md`](./docs/tech_stack.md) | Next.js / PWA / API |
| [`docs/inference_approaches.md`](./docs/inference_approaches.md) | 推論方式の研究メモ（ADR） |

実装のエントリは [`web/src/app/components/JudgeChat.tsx`](./web/src/app/components/JudgeChat.tsx)、裁定パイプラインは [`web/src/lib/judge/runJudge.ts`](./web/src/lib/judge/runJudge.ts) です。

## ライセンス・利用上の注意

公式サイトからの取得にはレート制限とキャッシュ方針があります。公開利用・商用利用の前に公式ポリシーの確認が必要です。回答は参考情報であり、公式裁定の代替ではありません。
