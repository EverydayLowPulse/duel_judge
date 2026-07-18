/**
 * Evidence Gate 用の正規化。
 * 曖昧一致はせず、正規化後の部分文字列一致だけ使う。
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[「」『』【】（）()［］\[\]"'`]/g, "")
    .toLowerCase();
}

export function containsNormalized(haystack: string, needle: string): boolean {
  const h = normalizeForMatch(haystack);
  const n = normalizeForMatch(needle);
  if (!n) return false;
  return h.includes(n);
}
