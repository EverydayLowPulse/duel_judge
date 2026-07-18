import type { AnswerDisplayMeta, AnswerPayload, WithholdPayload } from "../answer/types";
import type { ResolveCardNameResult } from "../resolve/types";

export type JudgeRequest = {
  question: string;
  cardQuery?: string;
  cardId?: string;
};

export type JudgeResponse =
  | {
      kind: "answer";
      answer: AnswerPayload;
      display: AnswerDisplayMeta;
      debug?: {
        chunkIds: string[];
        gateFailures?: string[];
        gateAdjustments?: string[];
      };
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
      debug?: {
        chunkIds: string[];
        gateFailures?: string[];
        gateAdjustments?: string[];
      };
    };
