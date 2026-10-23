import { NextResponse, type NextRequest } from "next/server";
import { clientIpFrom, type RateLimiter } from "./ipRateLimit";

/** 上限を超えていれば 429 を返す。通してよければ null */
export function rejectIfLimited(
  limiter: RateLimiter,
  req: NextRequest,
): NextResponse | null {
  const result = limiter.check(clientIpFrom(req.headers));
  if (result.ok) return null;
  return NextResponse.json(
    { error: "リクエストが多すぎます。少し待ってからやり直してください。" },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}
