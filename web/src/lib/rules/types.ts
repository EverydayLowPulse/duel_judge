/** 総合ルール1チャンク（ルール番号単位） */
export type RuleChunk = {
  /** 例: "111.1" / "100.2a" */
  ruleRef: string;
  text: string;
};

export type RuleIndexMeta = {
  version: string;
  sourceUrl: string;
  sourceFile: string;
  builtAt: string;
  chunkCount: number;
};

export type RuleIndex = RuleIndexMeta & {
  chunks: RuleChunk[];
};

export type RuleSearchHit = RuleChunk & {
  score: number;
};
