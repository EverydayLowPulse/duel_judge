import * as cheerio from "cheerio";

export type CardListPage = {
  /** 検索条件に合う総件数（`#total_count`）。読めなければ null */
  totalCount: number | null;
  /** ページ内のカードID（出現順・重複なし）。一覧には名前がない */
  cardIds: string[];
  /** ページ送りの最大番号。ページ送りがなければ 1 */
  lastPage: number;
};

/**
 * 公式カード検索（POST /card/）の応答HTMLを読む。
 * 全件ミラーの列挙とキーワード検索の両方で使う。
 */
export function parseCardListHtml(html: string): CardListPage {
  const $ = cheerio.load(html);

  const totalRaw = $("#total_count").first().text().trim();
  const total = totalRaw ? Number(totalRaw.replace(/[,，]/g, "")) : NaN;

  const ids: string[] = [];
  $("[data-href*='/card/detail/?id=']").each((_, el) => {
    const href = $(el).attr("data-href") ?? "";
    const m = href.match(/[?&]id=([^&]+)/);
    if (m?.[1]) ids.push(m[1]);
  });

  let lastPage = 1;
  $("[data-page]").each((_, el) => {
    const n = Number($(el).attr("data-page"));
    if (Number.isInteger(n) && n > lastPage) lastPage = n;
  });

  return {
    totalCount: Number.isFinite(total) ? total : null,
    cardIds: [...new Set(ids)],
    lastPage,
  };
}
