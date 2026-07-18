export type OfficialCardFace = {
  /** 例: クリーチャー / 呪文 */
  cardType: string | null;
  abilityText: string;
};

export type OfficialCard = {
  cardId: string;
  officialName: string;
  productLabel: string | null;
  cardType: string | null;
  civilizations: string[];
  power: string | null;
  cost: string | null;
  races: string[];
  /** 全面をラベル付きで結合した本文（証拠用） */
  abilityText: string;
  /** ツインパクト等の各面。片面カードは1件 */
  faces: OfficialCardFace[];
  detailUrl: string;
  fetchedAt: string;
};

export type CardSearchHit = {
  cardId: string;
  detailUrl: string;
};

export type CardResolveResult = {
  query: string;
  totalHint: number | null;
  candidates: OfficialCard[];
};
