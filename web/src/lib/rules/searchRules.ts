import { ensureRuleIndex } from "./ensureIndex";
import { searchRuleChunks } from "./search";
import type { RuleIndexMeta, RuleSearchHit } from "./types";

export async function searchRules(
  query: string,
  options?: { limit?: number; forceRebuild?: boolean },
): Promise<{ meta: RuleIndexMeta; hits: RuleSearchHit[] }> {
  const index = await ensureRuleIndex({
    forceRebuild: options?.forceRebuild,
  });
  const hits = searchRuleChunks(index.chunks, query, options?.limit ?? 5);
  const { chunks: _c, ...meta } = index;
  return { meta, hits };
}
