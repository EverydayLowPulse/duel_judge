import { NextRequest, NextResponse } from "next/server";
import { ensureRuleIndex } from "@/lib/rules/ensureIndex";
import { searchRules } from "@/lib/rules/searchRules";

/**
 * GET /api/rules?q=召喚酔い&limit=5
 * POST /api/rules { rebuild: true } — PDF再取得して索引を作り直す
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "5");
  try {
    if (!q) {
      const index = await ensureRuleIndex();
      const { chunks: _c, ...meta } = index;
      return NextResponse.json({ meta });
    }
    const result = await searchRules(q, {
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 20) : 5,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let body: { rebuild?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok
  }
  if (!body.rebuild) {
    return NextResponse.json(
      { error: "body.rebuild=true が必要です" },
      { status: 400 },
    );
  }
  try {
    const index = await ensureRuleIndex({ forceRebuild: true });
    const { chunks: _c, ...meta } = index;
    return NextResponse.json({ meta });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
