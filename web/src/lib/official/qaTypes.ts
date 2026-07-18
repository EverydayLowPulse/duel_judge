export type QaSearchHit = {
  qaId: string;
  url: string;
  /** 一覧に出ている質問文（要約） */
  questionPreview: string;
};

export type OfficialQa = {
  qaId: string;
  url: string;
  question: string;
  answer: string;
  fetchedAt: string;
};

export type QaSearchResult = {
  query: string;
  hits: QaSearchHit[];
  /** details=1 のとき本文まで取得したもの */
  articles?: OfficialQa[];
};
