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
  /**
   * マナゾーンでタップしたときに生むマナ数（公式の「マナ」欄）。
   * 通常は 1。未取得の旧キャッシュでは undefined になりうる。
   */
  manaValue?: number | null;
  races: string[];
  /** 全面をラベル付きで結合した本文（証拠用） */
  abilityText: string;
  /** ツインパクト等の各面。片面カードは1件 */
  faces: OfficialCardFace[];
  /**
   * パーサの版（CARD_PARSER_VERSION）。未設定は v1（空の能力欄を捨てていた旧パーサ）。
   * v2 以降は能力のない面も abilityText "" の面として持つ。
   */
  parserVersion?: number;
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
