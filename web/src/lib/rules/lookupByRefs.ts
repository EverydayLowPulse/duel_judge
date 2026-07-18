import { ensureRuleIndex } from "./ensureIndex";
import type { RuleSearchHit } from "./types";

/**
 * ルール番号で総合ルールチャンクを直接取得する。
 * キーワード辞書からの決定的注入用。検索スコアとは独立。
 */
export async function lookupRuleChunksByRefs(
  ruleRefs: string[],
): Promise<RuleSearchHit[]> {
  if (ruleRefs.length === 0) return [];
  const index = await ensureRuleIndex();
  const byRef = new Map(index.chunks.map((chunk) => [chunk.ruleRef, chunk]));
  const hits: RuleSearchHit[] = [];
  for (const ref of unique(ruleRefs)) {
    const chunk = byRef.get(ref);
    if (!chunk) continue;
    hits.push({
      ...chunk,
      // 検索ヒットより先に残すための高めの基準点
      score: 1000,
    });
  }
  return hits;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
