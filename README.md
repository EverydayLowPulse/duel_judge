# デュエマ裁定確認 AI

デュエル・マスターズの裁定質問に、公式カード DB・公式 Q&A・総合ルールを根拠付きで答える Web アプリ（PWA）です。現在はプロトタイプの段階です。

質問を投げると、送信前に質問に関連するカードを選択するためのUIが表示されます。ユーザー側のカード選択が済むと、論点分類 → ルール/Q&A 検索 → 決定的バリデータまたは LLM 推論 → **Evidence Gate（出典照合）** を経て回答します。

**デモ:** [https://web-two-tau-e2mnzze5db.vercel.app](https://web-two-tau-e2mnzze5db.vercel.app)

## 技術ハイライト

- **Evidence Gate** — 引用必須。検索ヒットした文言との部分一致まで検証し、出典のない裁定を出さない

- **決定的 validators** — マナ支払いなど一部の論点は純関数で可/不可を出す。確かなときだけ LLM を省略し、解けない／他論点が残る場合は制約として LLM に渡す（設計ミス。デュエマは例外が多く機械的な判定が難しいため、本来であればすべての判断をLLMに任せるべきと考えています。推論コストの節約としても大きな効果がみられないため削る予定です。）

- **カード確定 UI** — PoC段階のため、質問に登場するカードの詳細の取得を公式のDBに頼っています。公式DBからカード詳細を取得するには正式名称の一部を打ち込む必要がありますが、質問文に登場した略称から正式名称をこちら側で特定するのは推論コストが高すぎること、また同じ略称を共有するカードが複数存在する場合に一意に絞り込めないこと、一般的でない略称を用いられた際に対応できないことから、こちらが用意したUIを通じて、ユーザーが直接、公式DBから該当するカードを指定する形にしています。

- **マルチプロバイダ LLM** — 現在、DeepSeek / Gemini のモデルが選択可能です。他プロバイダについても順次追加予定です。ユーザー体験を損ねることのないよう、利用できるモデルは厳選する予定です。なおプロトタイプにつき、geminiのapiにはgoogle ai studioの無料apiを使用しています。

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
