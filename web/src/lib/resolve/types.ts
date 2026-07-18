import type { OfficialCard } from "../official/types";

export type ClarifyCandidate = {
  official_name: string;
  card_id: string;
  detail_url: string;
};

export type ResolveCardNameResult =
  | {
      kind: "resolved";
      query: string;
      source: "alias" | "official_search";
      card: OfficialCard;
    }
  | {
      kind: "clarify";
      query: string;
      source: "alias" | "official_search";
      note: string;
      questions: Array<{
        about: string;
        candidates: ClarifyCandidate[];
      }>;
      candidates: OfficialCard[];
    }
  | {
      kind: "not_found";
      query: string;
      note: string;
    };
