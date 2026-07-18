import type { RuleChunk } from "./types";

/**
 * 本文中のルール番号先頭パターン。
 * 例: 000.1. / 100.2a / 101. / 111.4a
 */
const RULE_START =
  /(?:^|\n)(\d{3}(?:\.\d+[a-z]?)*(?:\.[a-z])?)(?:\.|\s)/g;

/**
 * PDF全文をルール番号単位のチャンクに分割する。
 * もくじ部分は「000.」出現以降だけ使う。
 */
export function chunkRuleText(fullText: string): RuleChunk[] {
  const bodyStart = fullText.search(/(?:^|\n)000\./);
  const text = bodyStart >= 0 ? fullText.slice(bodyStart) : fullText;

  const matches: { ref: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  RULE_START.lastIndex = 0;
  while ((m = RULE_START.exec(text)) !== null) {
    const ref = normalizeRuleRef(m[1]);
    // もくじの重複を避けるため、同じ番号の2回目以降だけ本文扱い…
    // → 簡易: 連続で同じ ref が来たらスキップせず、後勝ちで上書きしない。
    // 初出だけ採用すると見出しだけの行で止まるので、すべて採用して後で短すぎを捨てる。
    matches.push({ ref, index: m.index + (m[0].startsWith("\n") ? 1 : 0) });
  }

  if (matches.length === 0) return [];

  const chunks: RuleChunk[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
    // 見出しだけの極短行（もくじ残り）を除外
    if (slice.length < 24) continue;
    chunks.push({
      ruleRef: matches[i].ref,
      text: slice,
    });
  }

  // 同一 ruleRef が複数ある場合は最長（本文）を残す
  const best = new Map<string, RuleChunk>();
  for (const c of chunks) {
    const prev = best.get(c.ruleRef);
    if (!prev || c.text.length > prev.text.length) {
      best.set(c.ruleRef, c);
    }
  }

  return [...best.values()].sort((a, b) =>
    compareRuleRef(a.ruleRef, b.ruleRef),
  );
}

function normalizeRuleRef(raw: string): string {
  return raw.replace(/\.$/, "");
}

function compareRuleRef(a: string, b: string): number {
  const pa = parseRefParts(a);
  const pb = parseRefParts(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const xa = pa[i] ?? "";
    const xb = pb[i] ?? "";
    const na = Number(xa);
    const nb = Number(xb);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
      return na - nb;
    }
    if (xa !== xb) return xa < xb ? -1 : 1;
  }
  return 0;
}

function parseRefParts(ref: string): string[] {
  return ref.split(".");
}
