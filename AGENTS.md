# AIエージェント向けの指示
- 要件・設計の正本は `docs.byAI/`。方針は `docs.byAI/project.md`、回答型は `docs.byAI/answer_format.md`、技術は `docs.byAI/tech_stack.md`（Next.js + TS + PWA）
- `memo/` と `*forme*` は人間向けの私的メモ。編集・レビュー・コミット対象にしない
- `docs.byMe/` は人間が手書きする文書。エージェントは編集しない
- 一時ファイルは `temp/` へ格納
- 個々のカード・Q&A事例に特化した分岐を、検出・結論・プロンプトに入れない。原則（能力テキストのパターン / RuleConcept / 総合ルール）で書き、具体名は略称シード・qaSeeds・smoke/eval に限る
