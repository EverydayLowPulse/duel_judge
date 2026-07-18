import * as cheerio from "cheerio";
import { readQaCache, writeQaCache } from "../cache/qaCache";
import { withOfficialRateLimit } from "./rateLimit";
import type { OfficialQa, QaSearchHit, QaSearchResult } from "./qaTypes";

const BASE = "https://dm.takaratomy.co.jp";
const UA = "duel_judge/0.1 (personal research; respectful rate limit)";

function articleUrl(qaId: string): string {
  return `${BASE}/rule/qa/${qaId}/`;
}

function stripHtmlToText(html: string): string {
  const $ = cheerio.load(`<div>${html}</div>`);
  return $("div")
    .first()
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 公式Q&A検索（POST qa_w）。一覧の質問プレビューと記事URLを返す。
 */
export async function searchQaHits(keyword: string): Promise<QaSearchHit[]> {
  const body = new URLSearchParams();
  body.set("qa_w", keyword);
  body.set("qa_prod", "");
  body.set("qa_type", "");

  const html = await withOfficialRateLimit(async () => {
    const res = await fetch(`${BASE}/rule/qa/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": UA,
      },
      body,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`qa search failed: HTTP ${res.status}`);
    }
    return res.text();
  });

  const $ = cheerio.load(html);
  const hits: QaSearchHit[] = [];
  const seen = new Set<string>();

  $('p.tit01 a[href*="/rule/qa/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/\/rule\/qa\/(\d+)\/?/);
    if (!m?.[1] || seen.has(m[1])) return;
    seen.add(m[1]);
    hits.push({
      qaId: m[1],
      url: articleUrl(m[1]),
      questionPreview: $(el).text().replace(/\s+/g, " ").trim(),
    });
  });

  return hits;
}

/**
 * Q&A記事1件の Q / A を取得。
 */
export async function fetchQaArticle(qaId: string): Promise<OfficialQa> {
  const cached = await readQaCache(qaId);
  if (cached) return cached;

  const url = articleUrl(qaId);
  const html = await withOfficialRateLimit(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`qa article failed: HTTP ${res.status} id=${qaId}`);
    }
    return res.text();
  });

  const article = parseQaArticleHtml(qaId, html);
  await writeQaCache(article);
  return article;
}

export function parseQaArticleHtml(qaId: string, html: string): OfficialQa {
  const $ = cheerio.load(html);
  const qHtml = $(".qabox01 .question h2").first().html() ?? "";
  const aHtml = $(".qabox01 .answer").first().html() ?? "";

  let question = stripHtmlToText(qHtml).replace(/^Q\s*/, "");
  let answer = stripHtmlToText(aHtml).replace(/^A\s*/, "");

  if (!question && !answer) {
    // フォールバック: 本文テキストから Q/A
    const body = $("body").text();
    const m = body.match(/Q\s*([\s\S]*?)\s*A\s*([\s\S]*?)一覧へ戻る/);
    if (m) {
      question = m[1].replace(/\s+/g, " ").trim();
      answer = m[2].replace(/\s+/g, " ").trim();
    }
  }

  return {
    qaId,
    url: articleUrl(qaId),
    question,
    answer,
    fetchedAt: new Date().toISOString(),
  };
}

/** 質問文との語句重なりで一覧を並べ替える（公式の並びが新しい順でずれる対策） */
function rankHitsByQuestion(
  hits: QaSearchHit[],
  question: string,
): QaSearchHit[] {
  const tokens = (question.match(/[\u3040-\u30ff\u4e00-\u9fffA-Za-z0-9]+/g) ?? [])
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return hits;

  const score = (preview: string) =>
    tokens.reduce((s, t) => (preview.includes(t) ? s + t.length : s), 0);

  return [...hits].sort(
    (a, b) => score(b.questionPreview) - score(a.questionPreview),
  );
}

/**
 * 検索し、必要なら上位記事の本文まで取得する。
 */
export async function searchQa(
  query: string,
  options?: { maxArticles?: number; rankBy?: string },
): Promise<QaSearchResult> {
  const q = query.trim();
  const hits = await searchQaHits(q);
  const maxArticles = options?.maxArticles ?? 0;
  const ordered = options?.rankBy
    ? rankHitsByQuestion(hits, options.rankBy)
    : hits;

  if (maxArticles <= 0) {
    return { query: q, hits: ordered };
  }

  const articles: OfficialQa[] = [];
  for (const hit of ordered.slice(0, maxArticles)) {
    articles.push(await fetchQaArticle(hit.qaId));
  }

  return { query: q, hits: ordered, articles };
}
