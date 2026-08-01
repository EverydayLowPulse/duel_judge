import { containsNormalized, normalizeForMatch } from "./normalize";
import type { AnswerPayload, EvidenceChunk, EvidenceItem } from "./types";

/**
 * LLM が quote を微妙に言い換えたとき、取得済みチャンク上の連続文字列へ機械的に寄せる。
 * 新しい裁定は作らない。マッチ不能ならその evidence は触らない（Gate が withhold）。
 */
export function repairEvidenceQuotes(input: {
  answer: AnswerPayload;
  chunks: EvidenceChunk[];
}): { answer: AnswerPayload; adjustments: string[] } {
  const adjustments: string[] = [];
  const corpus = input.chunks.map((c) => c.text).join("\n");
  const evidence = (input.answer.evidence ?? []).map((ev, i) => {
    if (!ev.quote?.trim()) return ev;
    if (containsNormalized(corpus, ev.quote)) return ev;

    const chunk = findChunkForEvidence(ev, input.chunks);
    if (!chunk) return ev;

    const snapped =
      snapQuoteToChunk(ev.quote, chunk.text) ??
      fallbackVerbatimQuote(chunk);
    if (!snapped || !containsNormalized(chunk.text, snapped)) return ev;

    adjustments.push(`evidence[${i}].quote をチャンク原文へ寄せた`);
    return { ...ev, quote: snapped, url: chunk.url || ev.url };
  });

  return {
    answer: { ...input.answer, evidence },
    adjustments,
  };
}

function findChunkForEvidence(
  ev: EvidenceItem,
  chunks: EvidenceChunk[],
): EvidenceChunk | undefined {
  const exact = chunks.find((c) => c.url === ev.url);
  if (exact) return exact;

  const qaId = ev.url?.match(/\/qa(?:_old)?\/(\d+)/)?.[1];
  if (qaId) {
    const byId = chunks.find((c) => c.id === `qa:${qaId}`);
    if (byId) return byId;
  }

  if (ev.type === "rule" && ev.rule_ref) {
    const byRef = chunks.find((c) => c.id === `rule:${ev.rule_ref}`);
    if (byRef) return byRef;
  }

  if (ev.type === "card") {
    return chunks.find(
      (c) =>
        c.type === "card" &&
        (c.url === ev.url || c.label === ev.label),
    );
  }

  return undefined;
}

/**
 * quote の最長部分列がチャンクに含まれるなら、その箇所を原文から切り出す。
 */
function snapQuoteToChunk(quote: string, chunkText: string): string | null {
  const needle = normalizeForMatch(quote);
  const hay = normalizeForMatch(chunkText);
  if (!needle || !hay) return null;

  const minLen = Math.min(24, needle.length);
  const maxLen = Math.min(needle.length, 160);
  for (let len = maxLen; len >= minLen; len--) {
    for (let start = 0; start + len <= needle.length; start++) {
      const sub = needle.slice(start, start + len);
      const idx = hay.indexOf(sub);
      if (idx < 0) continue;
      const original = sliceByNormalizedRange(chunkText, idx, idx + len);
      if (original && containsNormalized(chunkText, original)) {
        return expandToSentence(chunkText, original);
      }
    }
  }
  return null;
}

function fallbackVerbatimQuote(chunk: EvidenceChunk): string | null {
  if (chunk.type === "qa") {
    const answer = chunk.text.match(/A:\s*([\s\S]+)/i)?.[1]?.trim();
    if (answer) return trimAtSentence(answer, 220);
  }
  if (chunk.type === "rule") {
    return trimAtSentence(chunk.text.replace(/\s+/g, " ").trim(), 220);
  }
  if (chunk.type === "card") {
    return trimAtSentence(chunk.text.replace(/\s+/g, " ").trim(), 220);
  }
  return null;
}

/** 正規化後の [start,end) を原文へ近似マップする（空白除去前提の線形スキャン）。 */
function sliceByNormalizedRange(
  original: string,
  normStart: number,
  normEnd: number,
): string | null {
  let normIndex = 0;
  let startOrig = -1;
  let endOrig = -1;
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    if (/[\s\u3000「」『』【】（）()［］\[\]"'`]/.test(ch)) continue;
    const n = ch.normalize("NFKC").toLowerCase();
    for (const unit of n) {
      if (normIndex === normStart) startOrig = i;
      normIndex += 1;
      if (normIndex === normEnd) {
        endOrig = i + 1;
        break;
      }
    }
    if (endOrig >= 0) break;
  }
  if (startOrig < 0 || endOrig < 0 || endOrig <= startOrig) return null;
  return original.slice(startOrig, endOrig).trim();
}

function expandToSentence(chunkText: string, snippet: string): string {
  const idx = chunkText.indexOf(snippet);
  if (idx < 0) return snippet;
  let start = idx;
  let end = idx + snippet.length;
  // 前方は句点の直後まで広げすぎない（最大40文字）
  const leftBound = Math.max(0, start - 40);
  for (let i = start - 1; i >= leftBound; i--) {
    if ("。．\n".includes(chunkText[i]!)) {
      start = i + 1;
      break;
    }
    if (i === leftBound) start = leftBound;
  }
  const rightBound = Math.min(chunkText.length, end + 80);
  for (let i = end; i < rightBound; i++) {
    if ("。．".includes(chunkText[i]!)) {
      end = i + 1;
      break;
    }
  }
  return chunkText.slice(start, end).trim();
}

function trimAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const cut = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("．"));
  return (cut >= 40 ? slice.slice(0, cut + 1) : slice).trim();
}
