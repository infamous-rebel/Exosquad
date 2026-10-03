// =============================================================================
// Phase 7 — Unit Tests: Demand Signal Service
// =============================================================================
// Tests signal content hashing, freshness calculation, outlier detection.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  computeSignalContentHash,
  calculateSignalFreshness,
  detectOutlierIQR,
  detectOutlierZScore,
} from "../../src/services/demand-signals.js";

// ─── Content Hash Tests ──────────────────────────────────────────────────────

describe("computeSignalContentHash", () => {
  it("should produce consistent hash for same input", () => {
    const data = {
      signalType: "REVIEW_COUNT",
      metric: "review_count",
      value: 100,
      observedAt: new Date("2026-09-25T00:00:00Z"),
      granularity: "day",
      geography: "global",
      sourceId: "source-1",
    };

    const hash1 = computeSignalContentHash(data);
    const hash2 = computeSignalContentHash(data);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it("should produce different hash for different values", () => {
    const base = {
      signalType: "REVIEW_COUNT",
      metric: "review_count",
      observedAt: new Date("2026-09-25T00:00:00Z"),
      granularity: "day",
      geography: "global",
      sourceId: "source-1",
    };

    const hash1 = computeSignalContentHash({ ...base, value: 100 });
    const hash2 = computeSignalContentHash({ ...base, value: 200 });

    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hash for different timestamps", () => {
    const base = {
      signalType: "REVIEW_COUNT",
      metric: "review_count",
      value: 100,
      granularity: "day",
      geography: "global",
      sourceId: "source-1",
    };

    const hash1 = computeSignalContentHash({ ...base, observedAt: new Date("2026-09-25T00:00:00Z") });
    const hash2 = computeSignalContentHash({ ...base, observedAt: new Date("2026-09-26T00:00:00Z") });

    expect(hash1).not.toBe(hash2);
  });
});

// ─── Freshness Tests ─────────────────────────────────────────────────────────

describe("calculateSignalFreshness", () => {
  it("should return fresh for recent observations", () => {
    const now = new Date();
    const observedAt = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago
    expect(calculateSignalFreshness(observedAt, "MARKETPLACE", now)).toBe("fresh");
  });

  it("should return aging for medium-age observations", () => {
    const now = new Date();
    const observedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago
    expect(calculateSignalFreshness(observedAt, "MARKETPLACE", now)).toBe("aging");
  });

  it("should return stale for old observations", () => {
    const now = new Date();
    const observedAt = new Date(now.getTime() - 200 * 60 * 60 * 1000); // 200 hours ago
    expect(calculateSignalFreshness(observedAt, "MARKETPLACE", now)).toBe("stale");
  });

  it("should use signal-specific thresholds", () => {
    const now = new Date();
    // SEARCH has fresh=168h, aging=720h
    const observedAt = new Date(now.getTime() - 100 * 60 * 60 * 1000); // 100 hours ago
    expect(calculateSignalFreshness(observedAt, "SEARCH", now)).toBe("fresh");
    expect(calculateSignalFreshness(observedAt, "AVAILABILITY", now)).toBe("stale");
  });
});

// ─── Outlier Detection Tests ─────────────────────────────────────────────────

describe("detectOutlierIQR", () => {
  it("should not flag normal values as outliers", () => {
    const values = [100, 105, 98, 102, 97, 103, 101, 99];
    const result = detectOutlierIQR(values, 100);
    expect(result.isOutlier).toBe(false);
  });

  it("should flag extreme values as outliers", () => {
    const values = [100, 105, 98, 102, 97, 103, 101, 99];
    const result = detectOutlierIQR(values, 500);
    expect(result.isOutlier).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("should return false for < 4 values", () => {
    const values = [100, 105];
    const result = detectOutlierIQR(values, 500);
    expect(result.isOutlier).toBe(false);
  });
});

describe("detectOutlierZScore", () => {
  it("should not flag normal values", () => {
    const values = [100, 102, 98, 101, 99, 100, 101, 99];
    const result = detectOutlierZScore(values, 100);
    expect(result.isOutlier).toBe(false);
  });

  it("should flag extreme values", () => {
    const values = [100, 102, 98, 101, 99, 100, 101, 99];
    const result = detectOutlierZScore(values, 500);
    expect(result.isOutlier).toBe(true);
  });

  it("should return false for < 3 values", () => {
    const values = [100, 105];
    const result = detectOutlierZScore(values, 500);
    expect(result.isOutlier).toBe(false);
  });
});
