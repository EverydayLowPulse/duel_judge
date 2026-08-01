import type { OfficialCard } from "../official/types";

export type ClarifyCandidate = {
  official_name: string;
  card_id: string;
  detail_url: string;
  /** UI表示用（任意） */
  cost?: string | null;
  civilizations?: string[];
  card_type?: string | null;
};

export type ResolveCardNameResult =
  | {
      kind: "resolved";
      query: string;
      source: "alias" | "official_search" | "web_assist";
      card: OfficialCard;
    }
  | {
      kind: "clarify";
      query: string;
      source: "alias" | "official_search" | "web_assist";
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
      /** 実際に試した検索語 */
      triedQueries?: string[];
      /** 確定はしないが、近い候補として提示する */
      suggestions?: ClarifyCandidate[];
      /** 掃除後の語句（UI表示用） */
      cleanedQuery?: string;
    };
