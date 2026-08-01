export type CleanedCardQuery = {
  /** 元の入力 */
  raw: string;
  /** 属性っぽいノイズを除いた検索用文字列 */
  cleaned: string;
};

/**
 * カード語句のノイズを除き、検索キーだけ残す。
 * 候補の絞り込みには使わない（専用入力がない属性ヒントは半端になるため）。
 * 例: 「ドラッヘダーバンデ　3コスの」→ cleaned=ドラッヘダーバンデ
 */
export function cleanCardQuery(raw: string): CleanedCardQuery {
  const normalized = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { raw, cleaned: "" };
  }

  let text = normalized;

  // コスト表現は名前検索のノイズなので落とす（値は保持しない）
  text = text
    .replace(/コスト\s*[0-9]{1,2}/g, " ")
    .replace(/[0-9]{1,2}\s*コス(?:ト)?(?:の)?/g, " ");

  // レアリティ等の単独トークン（名前の一部になりにくいもの）
  text = text
    .replace(
      /(?:^|\s)(SR|VR|VIC|LEG|OR|SR以上|スーパーレア|ベリーレア)(?:\s|$)/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  // 末尾の助詞だけ残ったら落とす
  text = text.replace(/[のをはがにでとへ]+$/u, "").trim();

  return {
    raw,
    cleaned: text || normalized,
  };
}
