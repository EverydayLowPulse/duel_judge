import type { RuleChunk, RuleSearchHit } from "./types";

/** 中黒・空白を無視して照合（PDFは「ニンジャ・ストライク」表記） */
function normalizeForMatch(s: string): string {
  return s.replace(/[・･\s　]/g, "").toLowerCase();
}

/** 質問との語句重なりでチャンクをスコアリング（BM25の薄い代替） */
export function searchRuleChunks(
  chunks: RuleChunk[],
  query: string,
  limit = 5,
): RuleSearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored: RuleSearchHit[] = [];
  for (const c of chunks) {
    const hay = normalizeForMatch(c.text);
    const refN = normalizeForMatch(c.ruleRef);
    let score = 0;
    for (const t of tokens) {
      const tn = normalizeForMatch(t);
      if (!tn) continue;
      if (hay.includes(tn)) score += tn.length;
      if (tn === refN || normalizeForMatch(query).includes(refN)) score += 20;
    }
    if (score > 0) {
      scored.push({ ...c, score });
    }
  }

  scored.sort(
    (a, b) => b.score - a.score || a.ruleRef.localeCompare(b.ruleRef),
  );
  return scored.slice(0, limit);
}

function tokenize(q: string): string[] {
  return (q.match(/[\u3040-\u30ff\u4e00-\u9fffA-Za-z0-9.]+/g) ?? [])
    .filter((t) => t.length >= 2)
    .filter((t) => !STOP.has(t));
}

const STOP = new Set([
  "です",
  "ます",
  "した",
  "する",
  "ある",
  "いる",
  "こと",
  "場合",
  "とき",
  "とは",
  "から",
  "について",
  "ください",
  "できる",
  "できない",
]);
