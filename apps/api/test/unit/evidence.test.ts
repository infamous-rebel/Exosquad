// =============================================================================
// Phase 6 — Unit Tests: Evidence extraction, hashing, freshness, conflicts
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  computeContentHash,
  calculateFreshness,
} from "../../src/services/evidence.js";

// ─── Content Hashing ─────────────────────────────────────────────────────────

describe("computeContentHash", () => {
  it("produces deterministic SHA-256 for string values", () => {
    const hash1 = computeContentHash("hello");
    const hash2 = computeContentHash("hello");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it("produces different hashes for different values", () => {
    const hash1 = computeContentHash("price=100");
    const hash2 = computeContentHash("price=200");
    expect(hash1).not.toBe(hash2);
  });

  it("handles numeric values", () => {
    const hash = computeContentHash(42);
    expect(hash).toHaveLength(64);
  });

  it("handles null and undefined", () => {
    const hashNull = computeContentHash(null);
    const hashUndef = computeContentHash(undefined);
    // null serializes as "null", undefined as "null" via JSON.stringify
    expect(hashNull).toHaveLength(64);
    expect(hashUndef).toHaveLength(64);
  });

  it("handles objects", () => {
    const hash = computeContentHash({ price: 100, currency: "BDT" });
    expect(hash).toHaveLength(64);
  });

  it("different objects produce different hashes", () => {
    const hash1 = computeContentHash({ price: 100 });
    const hash2 = computeContentHash({ price: 200 });
    expect(hash1).not.toBe(hash2);
  });
});

// ─── Freshness Calculation ───────────────────────────────────────────────────

describe("calculateFreshness", () => {
  it("returns 'live' for very recent stock evidence", () => {
    const now = new Date();
    const result = calculateFreshness(new Date(now.getTime() - 5 * 60 * 1000), "STOCK");
    expect(result).toBe("live");
  });

  it("returns 'fresh' for 30-min old stock evidence", () => {
    const now = new Date();
    const result = calculateFreshness(new Date(now.getTime() - 30 * 60 * 1000), "STOCK");
    expect(result).toBe("fresh");
  });

  it("returns 'aging' for 12-hour old stock evidence", () => {
    const now = new Date();
    const result = calculateFreshness(new Date(now.getTime() - 12 * 60 * 60 * 1000), "STOCK");
    expect(result).toBe("aging");
  });

  it("returns 'stale' for 2-day old stock evidence", () => {
    const now = new Date();
    const result = calculateFreshness(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), "STOCK");
    expect(result).toBe("stale");
  });

  it("price evidence has longer thresholds than stock", () => {
    const now = new Date();
    // 2 hours old — should be 'fresh' for PRICE (threshold 24h) but 'aging' for STOCK (threshold 1d)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(calculateFreshness(twoHoursAgo, "PRICE")).toBe("fresh");
    expect(calculateFreshness(twoHoursAgo, "STOCK")).toBe("aging");
  });

  it("organization evidence has longest thresholds", () => {
    const now = new Date();
    // 30 days old
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(calculateFreshness(thirtyDaysAgo, "ORGANIZATION_IDENTITY")).toBe("fresh");
    expect(calculateFreshness(thirtyDaysAgo, "PRICE")).toBe("stale");
  });

  it("unknown evidence types use default thresholds", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000);
    expect(calculateFreshness(recent, "SOME_UNKNOWN_TYPE")).toBe("live");
  });
});

// ─── Evidence Type Enums ─────────────────────────────────────────────────────

describe("Evidence type enums", () => {
  it("exports EVIDENCE_TYPES with expected values", async () => {
    const { EVIDENCE_TYPES } = await import("@exosquad/common");
    expect(EVIDENCE_TYPES).toContain("PRODUCT_IDENTITY");
    expect(EVIDENCE_TYPES).toContain("PRICE");
    expect(EVIDENCE_TYPES).toContain("SELLER_LISTING");
    expect(EVIDENCE_TYPES).toContain("ORGANIZATION_IDENTITY");
    expect(EVIDENCE_TYPES).toContain("IDENTITY_DECISION");
    expect(EVIDENCE_TYPES).toContain("CALCULATION_RESULT");
    expect(EVIDENCE_TYPES).toContain("OTHER");
  });

  it("exports EVIDENCE_STATUSES", async () => {
    const { EVIDENCE_STATUSES } = await import("@exosquad/common");
    expect(EVIDENCE_STATUSES).toContain("active");
    expect(EVIDENCE_STATUSES).toContain("stale");
    expect(EVIDENCE_STATUSES).toContain("superseded");
    expect(EVIDENCE_STATUSES).toContain("retracted");
    expect(EVIDENCE_STATUSES).toContain("invalid");
    expect(EVIDENCE_STATUSES).toContain("conflicted");
  });

  it("exports FRESHNESS_STATES", async () => {
    const { FRESHNESS_STATES } = await import("@exosquad/common");
    expect(FRESHNESS_STATES).toContain("live");
    expect(FRESHNESS_STATES).toContain("fresh");
    expect(FRESHNESS_STATES).toContain("aging");
    expect(FRESHNESS_STATES).toContain("stale");
    expect(FRESHNESS_STATES).toContain("unknown");
  });

  it("exports OBSERVATION_STATUSES", async () => {
    const { OBSERVATION_STATUSES } = await import("@exosquad/common");
    expect(OBSERVATION_STATUSES).toContain("observed");
    expect(OBSERVATION_STATUSES).toContain("inferred");
    expect(OBSERVATION_STATUSES).toContain("probable");
    expect(OBSERVATION_STATUSES).toContain("unknown");
  });
});

// ─── Error Types ─────────────────────────────────────────────────────────────

describe("Phase 6 error types", () => {
  it("EvidenceExtractionError has correct code and status", async () => {
    const { EvidenceExtractionError, AppError } = await import("@exosquad/common");
    const err = new EvidenceExtractionError("test", { observationId: "123" });
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("EVIDENCE_EXTRACTION_FAILED");
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it("ProvenanceNotFoundError has correct code and status", async () => {
    const { ProvenanceNotFoundError, AppError } = await import("@exosquad/common");
    const err = new ProvenanceNotFoundError("product", "abc");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("PROVENANCE_NOT_FOUND");
    expect(err).toBeInstanceOf(AppError);
  });

  it("EvidenceConflictError has correct code and status", async () => {
    const { EvidenceConflictError } = await import("@exosquad/common");
    const err = new EvidenceConflictError("conflict detected");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("EVIDENCE_CONFLICT");
  });
});
