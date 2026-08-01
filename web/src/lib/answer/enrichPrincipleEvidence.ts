import { containsNormalized } from "./normalize";
import type { AnswerPayload, EvidenceChunk, EvidenceItem } from "./types";

/**
 * 論点で要求した総合ルールがチャンクにあるのに evidence に無いとき、機械的に足す。
 * Q&Aだけの言い換え回答を防ぎ、原理（例: 801.2）を根拠面に出す。
 */
export function enrichPrincipleEvidence(input: {
  answer: AnswerPayload;
  chunks: EvidenceChunk[];
  requiredRuleRefs: string[];
  /** reasoning に足す短い原理メモ（任意） */
  principleHints?: string[];
}): { answer: AnswerPayload; adjustments: string[] } {
  const adjustments: string[] = [];
  const evidence: EvidenceItem[] = [...(input.answer.evidence ?? [])];
  const presentRefs = new Set(
    evidence
      .filter((e) => e.type === "rule" && e.rule_ref)
      .map((e) => e.rule_ref as string),
  );

  for (const ref of unique(input.requiredRuleRefs)) {
    if (presentRefs.has(ref)) continue;
    const item = evidenceItemFromRuleChunk(input.chunks, ref);
    if (!item) continue;
    // Gate と同じ正規化で通ることを確認
    const corpus = input.chunks.map((c) => c.text).join("\n");
    if (!containsNormalized(corpus, item.quote)) continue;
    evidence.push(item);
    presentRefs.add(ref);
    adjustments.push(`principle rule ${ref} を evidence に自動追加`);
  }

  let reasoning = input.answer.reasoning?.trim() ?? "";
  const hints = (input.principleHints ?? []).filter(Boolean);
  if (hints.length > 0) {
    const missing = hints.filter((h) => !reasoningIncludesHint(reasoning, h));
    if (missing.length > 0) {
      const bridge = missing.join(" ");
      reasoning = reasoning ? `${reasoning}\n${bridge}` : bridge;
      adjustments.push("reasoning に総合ルールの原理を追記");
    }
  }

  return {
    answer: {
      ...input.answer,
      evidence: evidence.slice(0, 5),
      reasoning: reasoning || input.answer.reasoning,
    },
    adjustments,
  };
}

function evidenceItemFromRuleChunk(
  chunks: EvidenceChunk[],
  ruleRef: string,
): EvidenceItem | null {
  const chunk =
    chunks.find((c) => c.id === `rule:${ruleRef}`) ||
    chunks.find(
      (c) =>
        c.type === "rule" &&
        (c.label.includes(ruleRef) || c.text.includes(ruleRef)),
    );
  if (!chunk?.text.trim()) return null;
  return {
    type: "rule",
    label: chunk.label,
    url: chunk.url,
    rule_ref: ruleRef,
    quote: extractRuleQuote(chunk.text, ruleRef),
  };
}

function extractRuleQuote(text: string, ruleRef: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const idx = normalized.indexOf(ruleRef);
  const slice =
    idx >= 0
      ? normalized.slice(idx, idx + 220)
      : normalized.slice(0, 180);
  const cut = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("．"));
  return (cut >= 24 ? slice.slice(0, cut + 1) : slice).trim();
}

function reasoningIncludesHint(reasoning: string, hint: string): boolean {
  const r = normalize(reasoning);
  const ruleRef = hint.match(/\d{3}\.\d+[a-z]?/i)?.[0];
  if (ruleRef && r.includes(normalize(ruleRef))) return true;
  // 原理キーワードがルール番号なしで既にあっても、Q&A言い換えだけの可能性がある
  if (!ruleRef) {
    const h = normalize(hint);
    return h.length >= 8 && r.includes(h.slice(0, Math.min(20, h.length)));
  }
  return false;
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
