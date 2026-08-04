/**
 * 公式サイトへの連続アクセス間隔（ミリ秒）。
 * 公式が 2 秒を要求しているわけではなく、負荷・悪用回避の自前下限。
 * カード詳細はキャッシュヒット時はこのキューを通らない。
 * ユーザー検索は /api/cards 経由の間接アクセスなので、直列＋数百msで十分。
 */
const MIN_INTERVAL_MS = 400;

let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();

/**
 * 公式へのリクエストを直列化し、最低間隔を空ける。
 * 並列で呼んでもキューに並ぶ。
 */
export function withOfficialRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastRequestAt = Date.now();
    return fn();
  });
  // 失敗してもキューは先に進める
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
