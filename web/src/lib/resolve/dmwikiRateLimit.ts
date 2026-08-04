/**
 * dmwiki への連続アクセス間隔（ミリ秒）。
 * 公式キューとは別。補助検索用なので同様に数百msで足りる。
 */
const MIN_INTERVAL_MS = 400;

let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();

/**
 * 有志 wiki へのリクエストを直列化し、最低間隔を空ける。
 * 公式レート制限とは別キュー。
 */
export function withDmwikiRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastRequestAt = Date.now();
    return fn();
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
