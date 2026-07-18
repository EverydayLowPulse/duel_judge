import { NextRequest, NextResponse } from "next/server";
import { fetchQaArticle, searchQa } from "@/lib/official/qa";

/**
 * GET /api/qa?q=レッドゾーン
 * GET /api/qa?q=レッドゾーン&details=3  … 上位3件の本文も取得
 * GET /api/qa?id=49017                 … 記事1件
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const detailsRaw = req.nextUrl.searchParams.get("details");

  try {
    if (id) {
      const article = await fetchQaArticle(id);
      return NextResponse.json(article);
    }

    if (!q) {
      return NextResponse.json(
        { error: "query parameter q or id is required" },
        { status: 400 },
      );
    }

    const maxArticles = detailsRaw ? Math.max(0, Number(detailsRaw) || 0) : 0;
    const result = await searchQa(q, { maxArticles });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
