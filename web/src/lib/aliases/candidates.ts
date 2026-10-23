import { normalizeCardNameKey } from "../resolve/nameMatch";

/**
 * 略称の候補を、同じカードは1件にまとめる。
 * 再録（IDが違う別の版）を1件にするため正式名で見分け、先に登録したものを残す。
 * 公式の表記は出どころによってアポストロフィ（' と ’）などが揺れるので、照合キーで比べる。
 */
export function dedupeAliasCandidates<T extends { officialName: string }>(
  list: T[],
): T[] {
  const map = new Map<string, T>();
  for (const c of list) {
    const key = normalizeCardNameKey(c.officialName);
    if (!map.has(key)) map.set(key, c);
  }
  return [...map.values()];
}
