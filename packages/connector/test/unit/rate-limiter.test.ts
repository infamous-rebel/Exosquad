import { describe, it, expect } from "vitest";
import { RateLimiter, parseRateLimitHeaders } from "../../src/rate-limiter";

describe("RateLimiter", () => {
  it("allows requests within the rate limit", async () => {
    const rl = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
    // Should not throw for 5 requests
    for (let i = 0; i < 5; i++) {
      expect(rl.tryAcquire("source-1")).toBe(true);
    }
  });

  it("rejects requests when tokens exhausted", () => {
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 10000 });
    expect(rl.tryAcquire("source-1")).toBe(true);
    expect(rl.tryAcquire("source-1")).toBe(true);
    expect(rl.tryAcquire("source-1")).toBe(false); // exhausted
  });

  it("tracks separate buckets per key", () => {
    const rl = new RateLimiter({ maxRequests: 1, windowMs: 10000 });
    expect(rl.tryAcquire("source-1")).toBe(true);
    expect(rl.tryAcquire("source-1")).toBe(false);
    expect(rl.tryAcquire("source-2")).toBe(true); // different key, own bucket
  });

  it("refills tokens after window elapses", async () => {
    const rl = new RateLimiter({ maxRequests: 1, windowMs: 50 });
    expect(rl.tryAcquire("source-1")).toBe(true);
    expect(rl.tryAcquire("source-1")).toBe(false);

    await new Promise((r) => setTimeout(r, 100));
    expect(rl.tryAcquire("source-1")).toBe(true); // refilled
  });

  it("reports remaining tokens", () => {
    const rl = new RateLimiter({ maxRequests: 5, windowMs: 10000 });
    expect(rl.getRemaining("source-1")).toBe(5);
    rl.tryAcquire("source-1");
    expect(rl.getRemaining("source-1")).toBe(4);
  });
});

describe("parseRateLimitHeaders", () => {
  it("parses standard RateLimit headers", () => {
    const result = parseRateLimitHeaders({
      "ratelimit-limit": "100",
      "ratelimit-remaining": "50",
      "ratelimit-reset": "1700000000",
    });
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(50);
    expect(result.resetAt).toBe(1700000000);
  });

  it("parses X-RateLimit headers", () => {
    const result = parseRateLimitHeaders({
      "x-ratelimit-limit": "200",
      "x-ratelimit-remaining": "100",
    });
    expect(result.limit).toBe(200);
    expect(result.remaining).toBe(100);
  });

  it("parses Retry-After in seconds", () => {
    const result = parseRateLimitHeaders({ "retry-after": "30" });
    expect(result.retryAfterMs).toBe(30000);
  });

  it("returns empty for no rate limit headers", () => {
    const result = parseRateLimitHeaders({ "content-type": "application/json" });
    expect(result.limit).toBeUndefined();
    expect(result.remaining).toBeUndefined();
  });
});
