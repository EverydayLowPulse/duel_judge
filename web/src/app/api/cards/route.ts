import { NextRequest, NextResponse } from "next/server";
import {
  resolveCardById,
  resolveCardName,
} from "@/lib/resolve/resolveCardName";
import { createRateLimiter } from "@/lib/http/ipRateLimit";
import { rejectIfLimited } from "@/lib/http/limitRequest";

/** 1回で公式へ最大12回アクセスしうるので厳しめにする */
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * GET /api/cards?q=レッドゾーン
 * カード名解決（略称辞書 → 公式検索）。1件なら resolved、複数なら clarify。
 *
 * POST /api/cards  { "q": "レッドゾーン", "cardId": "dm26sd1-w002F" }
 * clarify 後の選択で確定する。
 */
export async function GET(req: NextRequest) {
  const limited = rejectIfLimited(limiter, req);
  if (limited) return limited;
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { error: "query parameter q is required" },
      { status: 400 },
    );
  }

  const skipAlias = req.nextUrl.searchParams.get("refresh") === "1";

  try {
    const result = await resolveCardName(q, { skipAlias });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const limited = rejectIfLimited(limiter, req);
  if (limited) return limited;
  let body: { q?: string; cardId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const q = body.q?.trim();
  const cardId = body.cardId?.trim();
  if (!q || !cardId) {
    return NextResponse.json(
      { error: "body.q and body.cardId are required" },
      { status: 400 },
    );
  }

  try {
    const result = await resolveCardById(q, cardId);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
