# AIエージェント向けの指示
- 要件・設計の正本は `docs/`。方針は `docs/project.md`、回答型は `docs/answer_format.md`、技術は `docs/tech_stack.md`（Next.js + TS + PWA）
- `memo/` と `*forme*` は人間向けの私的メモ。編集・レビュー・コミット対象にしない
- 一時ファイルは `temp/` へ格納
- 個々のカード・Q&A事例に特化した分岐を、検出・結論・プロンプトに入れない。原則（能力テキストのパターン / RuleConcept / 総合ルール）で書き、具体名は略称シード・qaSeeds・smoke/eval に限る
