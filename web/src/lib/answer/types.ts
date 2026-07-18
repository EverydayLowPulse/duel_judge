import type { OfficialCard } from "../official/types";

export type EvidenceItem = {
  type: "qa" | "rule" | "card";
  label: string;
  url: string;
  quote: string;
  rule_ref?: string;
};

export type AnswerPayload = {
  kind: "answer";
  resolved_cards: Array<{
    query: string;
    official_name: string;
    card_id: string;
    detail_url: string;
  }>;
  evidence: EvidenceItem[];
  reasoning?: string;
  conclusion: string;
  confidence: "high" | "medium" | "low";
  confidence_note: string;
};

export type WithholdPayload = {
  kind: "withhold";
  reason: string;
  tried: string[];
  next_hint: string;
};

/** アプリ側で付与する表示用メタ */
export type AnswerDisplayMeta = {
  disclaimer: string;
  last_synced_at: string | null;
};

export type EvidenceChunk = {
  id: string;
  type: "qa" | "rule" | "card";
  label: string;
  url: string;
  text: string;
  rule_ref?: string;
};

export type JudgeContext = {
  question: string;
  cardQuery?: string;
  card?: OfficialCard;
  cards?: OfficialCard[];
  /** 公式情報から作った内部時系列検証。出典ではなく回答の論理制約。 */
  scenarioAnalysis?: string;
  chunks: EvidenceChunk[];
};
