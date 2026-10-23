/**
 * 受信リクエストのIP単位の回数制限（固定ウィンドウ）。
 * ミラーの一括抜き出しや、公式への中継アクセスの連打を防ぐ。
 *
 * サーバーレスではインスタンスごとのメモリに数えるため、全体での厳密な上限ではない。
 * 抑止が目的。厳密に絞るなら Vercel Firewall のレート制限を使う。
 */
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export type RateLimiter = {
  check: (key: string) => RateLimitResult;
  /** 保持しているキーの数（テスト用） */
  size: () => number;
};

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { startedAt: number; count: number }>();

  function prune(at: number) {
    for (const [key, w] of windows) {
      if (at - w.startedAt >= options.windowMs) windows.delete(key);
    }
  }

  return {
    check(key) {
      const at = now();
      prune(at);
      const w = windows.get(key);
      if (!w) {
        windows.set(key, { startedAt: at, count: 1 });
        return { ok: true };
      }
      if (w.count < options.limit) {
        w.count += 1;
        return { ok: true };
      }
      const retryAfterMs = w.startedAt + options.windowMs - at;
      return { ok: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
    },
    size: () => windows.size,
  };
}

/** プロキシ（Vercel）経由の元のクライアントIP。取れなければ1つのキーにまとめる */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
