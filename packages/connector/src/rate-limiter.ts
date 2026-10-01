// =============================================================================
// @exosquad/connector — Token-bucket rate limiter
// =============================================================================
// Per-source rate limiting to respect upstream API limits.
// Uses a token bucket algorithm with async/await support.
// =============================================================================

import { createChildLogger } from "@exosquad/logger";

const logger = createChildLogger({ module: "rate-limiter" });

export interface RateLimitConfig {
  maxRequests: number;   // Maximum requests per window
  windowMs: number;      // Window duration in milliseconds
}

/**
 * Per-key token bucket rate limiter.
 * Each key (e.g., sourceId or domain) gets its own bucket.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Acquire a token for the given key.
   * Resolves immediately if a token is available.
   * Waits until a token is available if the bucket is empty.
   */
  async acquire(key: string, signal?: AbortSignal): Promise<void> {
    const bucket = this.getBucket(key);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // Calculate wait time until next token is available
    const elapsed = Date.now() - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / (this.config.windowMs / this.config.maxRequests));

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.config.maxRequests, bucket.tokens + tokensToAdd);
      bucket.lastRefill = Date.now();
      bucket.tokens -= 1;
      return;
    }

    // Need to wait for next token
    const waitMs = Math.ceil(
      this.config.windowMs / this.config.maxRequests - elapsed % (this.config.windowMs / this.config.maxRequests)
    );

    logger.debug({ key, waitMs }, "Rate limit: waiting for token");

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Aborted"));
        return;
      }

      const timer = setTimeout(() => {
        this.refillBucket(key);
        if (this.getBucket(key).tokens >= 1) {
          this.getBucket(key).tokens -= 1;
        }
        resolve();
      }, waitMs);

      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Aborted"));
      }, { once: true });
    });
  }

  /**
   * Try to acquire a token without waiting.
   * Returns true if acquired, false if rate limited.
   */
  tryAcquire(key: string): boolean {
    this.refillBucket(key);
    const bucket = this.getBucket(key);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Get remaining tokens for a key.
   */
  getRemaining(key: string): number {
    this.refillBucket(key);
    return Math.floor(this.getBucket(key).tokens);
  }

  /**
   * Update rate limit config (e.g., from response headers).
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    if (config.maxRequests !== undefined) this.config.maxRequests = config.maxRequests;
    if (config.windowMs !== undefined) this.config.windowMs = config.windowMs;
  }

  private getBucket(key: string): { tokens: number; lastRefill: number } {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.maxRequests, lastRefill: Date.now() };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refillBucket(key: string): void {
    const bucket = this.getBucket(key);
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / this.config.windowMs) * this.config.maxRequests;

    if (tokensToAdd >= 1) {
      bucket.tokens = Math.min(this.config.maxRequests, bucket.tokens + Math.floor(tokensToAdd));
      bucket.lastRefill = now;
    }
  }
}

/**
 * Parse rate limit info from HTTP response headers.
 * Supports common rate limit header conventions.
 */
export function parseRateLimitHeaders(headers: Record<string, string>): {
  limit?: number;
  remaining?: number;
  resetAt?: number;
  retryAfterMs?: number;
} {
  const result: ReturnType<typeof parseRateLimitHeaders> = {};

  // Standard RateLimit headers (draft-ietf-httpapi-ratelimit-headers)
  if (headers["ratelimit-limit"]) {
    result.limit = parseInt(headers["ratelimit-limit"], 10);
  }
  if (headers["ratelimit-remaining"]) {
    result.remaining = parseInt(headers["ratelimit-remaining"], 10);
  }
  if (headers["ratelimit-reset"]) {
    result.resetAt = parseInt(headers["ratelimit-reset"], 10);
  }

  // X-RateLimit headers (common convention)
  if (!result.limit && headers["x-ratelimit-limit"]) {
    result.limit = parseInt(headers["x-ratelimit-limit"], 10);
  }
  if (result.remaining === undefined && headers["x-ratelimit-remaining"]) {
    result.remaining = parseInt(headers["x-ratelimit-remaining"], 10);
  }

  // Retry-After header (seconds or HTTP date)
  if (headers["retry-after"]) {
    const retryAfter = headers["retry-after"];
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      result.retryAfterMs = seconds * 1000;
    } else {
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        result.retryAfterMs = Math.max(0, date.getTime() - Date.now());
      }
    }
  }

  return result;
}
