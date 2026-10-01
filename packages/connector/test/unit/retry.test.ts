import { describe, it, expect, vi } from "vitest";
import { calculateBackoff, withRetry, DEFAULT_RETRY_CONFIG } from "../../src/retry";
import { ConnectorError, TimeoutError } from "../../src/errors";

describe("calculateBackoff", () => {
  it("returns a delay within expected range for attempt 0", () => {
    // baseDelay=1000, multiplier=2, attempt=0 → 1000 * 2^0 = 1000 ± 30%
    const delay = calculateBackoff(0, DEFAULT_RETRY_CONFIG);
    expect(delay).toBeGreaterThanOrEqual(700);
    expect(delay).toBeLessThanOrEqual(1300);
  });

  it("increases delay exponentially", () => {
    // Run multiple times to verify the trend (averages should increase)
    const delays: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += calculateBackoff(attempt, DEFAULT_RETRY_CONFIG);
      }
      delays.push(sum / 100);
    }
    // Each subsequent attempt should have higher average delay
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it("caps at maxDelayMs", () => {
    const delay = calculateBackoff(100, { ...DEFAULT_RETRY_CONFIG, maxDelayMs: 5000 });
    expect(delay).toBeLessThanOrEqual(5000 * 1.3); // maxDelay + jitter
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TimeoutError("http://example.com", 5000))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable errors", async () => {
    const error = new ConnectorError("Auth failed", { statusCode: 401, retryable: false });
    const fn = vi.fn().mockRejectedValue(error);
    await expect(withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow("Auth failed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting all attempts", async () => {
    const error = new TimeoutError("http://example.com", 5000);
    const fn = vi.fn().mockRejectedValue(error);
    await expect(withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 50 })).rejects.toThrow(TimeoutError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
