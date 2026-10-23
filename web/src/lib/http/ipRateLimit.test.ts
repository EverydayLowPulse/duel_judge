import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientIpFrom, createRateLimiter } from "./ipRateLimit";

describe("createRateLimiter", () => {
  function limiter(limit = 3, windowMs = 60_000) {
    let now = 0;
    const rl = createRateLimiter({ limit, windowMs, now: () => now });
    return {
      check: (key: string) => rl.check(key),
      advance: (ms: number) => {
        now += ms;
      },
      size: () => rl.size(),
    };
  }

  it("上限までは通す", () => {
    const rl = limiter(3);
    assert.equal(rl.check("a").ok, true);
    assert.equal(rl.check("a").ok, true);
    assert.equal(rl.check("a").ok, true);
  });

  it("上限を超えたら止め、窓が明けるまでの秒数を返す", () => {
    const rl = limiter(2, 60_000);
    rl.check("a");
    rl.advance(15_000);
    rl.check("a");
    const blocked = rl.check("a");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.retryAfterSec, 45);
  });

  it("窓が明けたらまた通す", () => {
    const rl = limiter(1, 60_000);
    rl.check("a");
    assert.equal(rl.check("a").ok, false);
    rl.advance(60_000);
    assert.equal(rl.check("a").ok, true);
  });

  it("キー（IP）ごとに別々に数える", () => {
    const rl = limiter(1);
    assert.equal(rl.check("a").ok, true);
    assert.equal(rl.check("b").ok, true);
    assert.equal(rl.check("a").ok, false);
  });

  it("窓が明けた古い記録は捨て、メモリを増やし続けない", () => {
    const rl = limiter(1, 60_000);
    for (let i = 0; i < 100; i++) rl.check(`ip-${i}`);
    rl.advance(60_000);
    rl.check("new");
    assert.equal(rl.size(), 1);
  });
});

describe("clientIpFrom", () => {
  function headers(init: Record<string, string>) {
    return new Headers(init);
  }

  it("x-forwarded-for の先頭（元のクライアント）を使う", () => {
    assert.equal(
      clientIpFrom(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })),
      "203.0.113.5",
    );
  });

  it("x-forwarded-for がなければ x-real-ip を使う", () => {
    assert.equal(clientIpFrom(headers({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
  });

  it("どちらもなければ unknown にまとめる", () => {
    assert.equal(clientIpFrom(headers({})), "unknown");
  });
});
