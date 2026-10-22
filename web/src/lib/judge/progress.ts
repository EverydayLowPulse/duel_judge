/**
 * 裁定パイプラインの進捗（回答トークンではない）。
 * UI は stage / message / detail を推論過程パネルに載せてよい。
 */
export type JudgeProgressStage =
  | "resolve_card"
  | "resolve_card_web"
  | "plan"
  | "resolve_scenario"
  | "build_facts"
  | "retrieve"
  | "verify_resolution_order"
  | "verify_scenario"
  | "generate_answer"
  | "evidence_gate"
  | "revise_answer";

/** status=工程 / draft=回答案の中身 / monologue=検証で弾かれたあとの独り言 */
export type JudgeProgressKind = "status" | "draft" | "monologue";

export type JudgeProgressEvent = {
  stage: JudgeProgressStage;
  message: string;
  kind?: JudgeProgressKind;
  /** 回答案の推論・結論など、message より長い本文 */
  detail?: string;
};

export type JudgeProgressHandler = (event: JudgeProgressEvent) => void;

const STAGE_MESSAGES: Record<JudgeProgressStage, string> = {
  resolve_card: "カード名を解決中…",
  resolve_card_web: "wikiで正式名候補を検索中…",
  plan: "質問を分析中…",
  resolve_scenario: "関連カードを取得中…",
  build_facts: "盤面の事実を整理中…",
  retrieve: "公式Q&A・ルールを検索中…",
  verify_resolution_order: "効果の処理順を整理中…",
  verify_scenario: "シナリオを検証中…",
  generate_answer: "回答を生成中…",
  evidence_gate: "出典を照合中…",
  revise_answer: "出典検証で弾かれたので見直し中…",
};

export function progressEvent(
  stage: JudgeProgressStage,
  message?: string,
  extra?: Pick<JudgeProgressEvent, "kind" | "detail">,
): JudgeProgressEvent {
  return {
    stage,
    message: message ?? STAGE_MESSAGES[stage],
    kind: extra?.kind ?? "status",
    detail: extra?.detail,
  };
}
