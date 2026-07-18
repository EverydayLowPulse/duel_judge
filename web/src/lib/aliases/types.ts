/** 略称辞書の1候補（確認後に再検索しないための id 付き） */
export type AliasCandidate = {
  officialName: string;
  cardId: string;
  detailUrl: string;
};

/** 略称 → 候補リスト（1対N） */
export type AliasEntry = {
  alias: string;
  candidates: AliasCandidate[];
  /** ISO8601。新弾同期時に引き直す判断に使う */
  verifiedAt: string;
};

export type AliasIndex = Record<string, AliasEntry>;
