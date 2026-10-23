import type { RuleIndex } from "./types";

/**
 * 既存の索引を使い回してよいか。
 * 総合ルールのPDFは版ごとにURLが変わり、同じURLの中身は変わらないので、
 * 同じURLから作った中身のある索引なら作り直す必要がない。
 */
export function canReuseRuleIndex(
  existing: RuleIndex | null,
  pdfUrl: string,
): boolean {
  return Boolean(existing?.chunks?.length) && existing?.sourceUrl === pdfUrl;
}
