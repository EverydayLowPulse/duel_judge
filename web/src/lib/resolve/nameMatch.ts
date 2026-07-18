/**
 * カード名照合用の正規化。
 * 中黒・空白・括弧・面区切り（/）を落とし、全角半角を揃える。
 * 「ドラン・ゴルゲルス」と「ドラン・ゴル・ゲルス」を同じキーにするため。
 */
export function normalizeCardNameKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫:：/／]/g, "")
    .toLowerCase();
}

/**
 * クエリが公式名（ツインパクトの片面名含む）を指すか。
 */
export function nameKeyMatches(officialName: string, query: string): boolean {
  const q = normalizeCardNameKey(query);
  if (q.length < 2) return false;

  const faces = officialName.split(/[/／]/).map((part) =>
    normalizeCardNameKey(part),
  );
  const full = normalizeCardNameKey(officialName);
  return [full, ...faces].some(
    (name) => name === q || name.includes(q) || q.includes(name),
  );
}

/** 公式検索用のクエリ候補（原文 → 短い接頭辞）。中黒位置ズレ対策。 */
export function buildOfficialSearchVariants(query: string): string[] {
  const q = query.normalize("NFKC").trim();
  if (!q) return [];

  const variants: string[] = [q];
  const chars = [...q];

  // 1文字ずつ短くした接頭辞（末尾の中黒・空白は落とす）
  for (let len = chars.length - 1; len >= 3; len -= 1) {
    const prefix = chars
      .slice(0, len)
      .join("")
      .replace(/[・･\s　]+$/u, "");
    if (prefix.length >= 3) variants.push(prefix);
  }

  const spaced = q.replace(/[・･]/g, " ").replace(/\s+/g, " ").trim();
  if (spaced && spaced !== q) variants.push(spaced);

  return [...new Set(variants)];
}
