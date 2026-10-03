import { describe, it, expect } from "vitest";
import { parseRetryAfterHeader } from "../../src/types";

describe("parseRetryAfterHeader", () => {
  it("parses integer seconds", () => {
    expect(parseRetryAfterHeader({ "retry-after": "120" })).toBe(120_000);
    expect(parseRetryAfterHeader({ "retry-after": "0" })).toBe(0);
    expect(parseRetryAfterHeader({ "retry-after": "1" })).toBe(1_000);
  });

  it("parses Retry-After with capital case", () => {
    expect(parseRetryAfterHeader({ "Retry-After": "60" })).toBe(60_000);
  });

  it("returns undefined for missing header", () => {
    expect(parseRetryAfterHeader({})).toBeUndefined();
    expect(parseRetryAfterHeader(undefined)).toBeUndefined();
  });

  it("returns undefined for invalid values", () => {
    expect(parseRetryAfterHeader({ "retry-after": "abc" })).toBeUndefined();
  });

  it("parses HTTP-date format (future date)", () => {
    // Create a date 60 seconds in the future
    const future = new Date(Date.now() + 60_000);
    const result = parseRetryAfterHeader({ "retry-after": future.toUTCString() });
    // Should be approximately 60 seconds (±5s tolerance for test execution time)
    expect(result).toBeDefined();
    expect(result).toBeGreaterThan(50_000);
    expect(result).toBeLessThan(70_000);
  });

  it("returns 0 for past HTTP-date", () => {
    const past = new Date(Date.now() - 60_000);
    const result = parseRetryAfterHeader({ "retry-after": past.toUTCString() });
    expect(result).toBe(0);
  });
});
