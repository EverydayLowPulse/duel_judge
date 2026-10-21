# 設計ドキュメント

要件と設計の正本。人もAIエージェントも、設計判断はここを見る。
私的なメモは `memo/`、一時的なファイルは `temp/` に置く（どちらもGitの管理対象外）。

## 読む順番

初めて読むなら、上から順に。

| ファイル | 内容 |
|----------|------|
| [project.md](./project.md) | 何を作るか、全体の処理の流れ、カード確定の画面、データと法務、開発フェーズ |
| [answer_format.md](./answer_format.md) | 回答JSONの形、出典検証（Evidence Gate）のルール |
| [inference_approaches.md](./inference_approaches.md) | いまの推論方式の長所と限界、将来試したい方式（研究メモ / ADR） |
| [evaluation.md](./evaluation.md) | 精度の測り方、採点の基準、合格ライン |
| [eval/](./eval/README.md) | 実際の評価ケースと、評価ランナーの使い方 |
| [tech_stack.md](./tech_stack.md) | 技術の選定理由、コードの構成、API、環境変数、デプロイ |
| [research_official_sources.md](./research_official_sources.md) | 公式サイトからのデータ取得方法の調査結果 |

## 用語集

### デュエマの用語

| 用語 | 意味 |
|------|------|
| 裁定 | ルール上の扱いについての公式の判断 |
| 総合ルール | 公式が配布しているルールの全文（PDF）。条文にルール番号（例: `101.4a`）が付いている |
| 公式Q&A | 公式サイトの「よくある質問」。個別の状況についての裁定が載っている |
| 略称 | カードの通称。例: 「赤ゾ」＝《轟く侵略 レッドゾーン》など |
| ターンプレイヤー | そのターンを進めているプレイヤー |
| 誘発 / 解決 / 待機 | 能力の条件が満たされること / 実際に処理すること / 誘発して処理を待っている状態 |

### このプロジェクトの用語

| 用語 | 意味 | 詳しく |
|------|------|--------|
| カード確定（画面） | 質問を送る前に、ユーザーが関係するカードを検索して選ぶ画面 | [project.md 4章](./project.md#4-カードの確定) |
| 名前解決 | 入力された語を、公式の正式名と `card_id` に結び付ける処理 | [project.md 4章](./project.md#名前解決の仕組み) |
| 略称辞書 | 略称 → 候補カードのリスト（1対N） | [project.md 4章](./project.md#名前解決の仕組み) |
| チャンク | 検索で取得したテキストの断片（Q&Aの記事、総合ルールの節、カード情報） | — |
| Evidence Gate（出典検証） | 回答を表示する前に、引用が取得済みのチャンクに本当にあるかを照合するチェック | [answer_format.md](./answer_format.md#evidence-gate出典検証) |
| `answer` / `clarify` / `withhold` | 回答の種類。答える / 聞き返す / 保留する | [answer_format.md](./answer_format.md#回答の種類) |
| 確信度（`confidence`） | `high` / `medium` / `low`。根拠の種類で機械的に決まる | [answer_format.md](./answer_format.md#確信度) |
| ScenarioFacts | 質問が述べている状況を構造化したもの。カードの属性は公式DBの値で上書きする | [project.md 2章](./project.md#各段階のルール) |
| 論点（Issue） | その質問で何が争点か。マナ支払い、視点、待機、処理順など | [project.md 6章](./project.md#6-総合ルールの索引と論点) |
| RuleConcept | 論点ごとに、関係するルール番号（`ruleRefs`）、公式Q&A（`qaSeeds`）、機械判定を束ねたもの | [project.md 6章](./project.md#6-総合ルールの索引と論点) |
| validator（機械判定） | 純関数で可否を出す判定。LLMを使わない | [project.md 2章](./project.md#各段階のルール) |
| Observation | 処理順を確認する段階が、回答生成に渡す短い観察結果 | [inference_approaches.md](./inference_approaches.md) |
| StepEngine | ゲームの進行を状態機械で追う方式。未着手の実験候補 | [inference_approaches.md](./inference_approaches.md#将来の実験候補-ステップ駆動ゲーム進行のシミュレーション) |
| smoke | 論点ごとの回帰確認スクリプト（`web/scripts/smoke/`） | [tech_stack.md](./tech_stack.md#回帰の確認開発者向け) |
| 評価セット（eval） | 正解付きの問題集（`docs/eval/`） | [evaluation.md](./evaluation.md) |
