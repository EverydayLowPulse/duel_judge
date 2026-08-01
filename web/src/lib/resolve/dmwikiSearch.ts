import * as cheerio from "cheerio";
import { withDmwikiRateLimit } from "./dmwikiRateLimit";

const UA = "duel_judge/0.1 (personal research; respectful rate limit)";
const SEARCH_URL = "https://dmwiki.net/?cmd=search";

export type DmwikiSearchHit = {
  /** 《》を除いたページ名（カード正式名候補） */
  title: string;
  pageUrl: string;
};

/**
 * dmwiki 単語検索（POST）。カード記事（《…》）だけを候補にする。
 * 裁定根拠には使わず、正式名ヒント専用。
 */
export async function searchDmwikiCardNames(
  word: string,
  options?: { maxHits?: number },
): Promise<DmwikiSearchHit[]> {
  const q = word.normalize("NFKC").trim();
  if (q.length < 2) return [];

  const html = await withDmwikiRateLimit(async () => {
    const body = new URLSearchParams();
    body.set("encode_hint", "ぷ");
    body.set("word", q);
    body.set("type", "AND");

    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": UA,
      },
      body,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`dmwiki search failed: HTTP ${res.status}`);
    }
    return res.text();
  });

  return parseDmwikiSearchHtml(html, options?.maxHits ?? 10);
}

/** テスト用に公開 */
export function parseDmwikiSearchHtml(
  html: string,
  maxHits = 10,
): DmwikiSearchHit[] {
  const $ = cheerio.load(html);
  const hits: DmwikiSearchHit[] = [];
  const seen = new Set<string>();

  $("#cmd ul li a").each((_, el) => {
    if (hits.length >= maxHits) return;
    const raw = $(el).text().trim();
    const href = $(el).attr("href") ?? "";
    const title = extractCardTitle(raw);
    if (!title) return;
    if (seen.has(title)) return;
    seen.add(title);
    hits.push({
      title,
      pageUrl: href.startsWith("http")
        ? href
        : `https://dmwiki.net/${href.replace(/^\//, "")}`,
    });
  });

  return hits;
}

/** 《正式名》だけ採用。コメントログ等は捨てる */
function extractCardTitle(label: string): string | null {
  const m = label.normalize("NFKC").match(/^《(.+?)》$/);
  if (!m?.[1]) return null;
  const title = m[1].trim();
  if (title.length < 2) return null;
  // 明らかにカードでないもの
  if (/コメント|掲示板|ログ保存|トップページ/.test(title)) return null;
  return title;
}
