import type { AnswerDisplayMeta, AnswerPayload, WithholdPayload } from "../answer/types";
import type { ResolveCardNameResult } from "../resolve/types";
import type { JudgeProgressEvent, JudgeProgressHandler } from "./progress";

/** 送信前にユーザーが選び切ったカード1枚 */
export type ConfirmedCardInput = {
  cardId: string;
  /** ユーザーが検索に使った表記。略称辞書の学習と事実抽出に使う */
  mention?: string;
};

export type JudgeRequest = {
  question: string;
  cardQuery?: string;
  cardId?: string;
  /**
   * 送信前にユーザーが確定したカード。配列があればカード名解決を行わない。
   * 空配列は「特定のカードが関わらない質問」の明示（推定はしない）。
   */
  confirmedCards?: ConfirmedCardInput[];
  /** カタログのモデルID（推奨）。指定時は provider より優先 */
  model?: string;
  /** 未指定ならサーバの LLM_PROVIDER。model 未指定時の後方互換 */
  provider?: "auto" | "gemini" | "deepseek";
};

/** runJudge の実行オプション（HTTP JSON には載せない） */
export type RunJudgeOptions = {
  onProgress?: JudgeProgressHandler;
};

/** 推論過程パネル用（SSE progress と同型。最終応答にも残す） */
export type ProcessTraceEntry = Pick<
  JudgeProgressEvent,
  "stage" | "message" | "kind" | "detail"
>;

type JudgeDebug = {
  chunkIds: string[];
  gateFailures?: string[];
  gateAdjustments?: string[];
  /** Gate で弾かれた／見直したときの過程（UI用） */
  processTrace?: ProcessTraceEntry[];
  /** 例: gemini:gemini-3-flash-preview → deepseek:deepseek-v4-flash */
  llm?: string;
  llmCalls?: Array<{
    provider: "gemini" | "deepseek";
    model: string;
    purpose?: string;
  }>;
};

export type JudgeResponse =
  | {
      kind: "answer";
      answer: AnswerPayload;
      display: AnswerDisplayMeta;
      debug?: JudgeDebug;
    }
  | {
      kind: "clarify";
      resolve: Extract<ResolveCardNameResult, { kind: "clarify" }>;
    }
  | {
      kind: "not_found";
      resolve: Extract<ResolveCardNameResult, { kind: "not_found" }>;
    }
  | {
      kind: "withhold";
      withhold: WithholdPayload;
      display: AnswerDisplayMeta;
      debug?: JudgeDebug;
    };
