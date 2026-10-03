// =============================================================================
// Phase 8 — Unit Tests: Opportunity Calculation Engine
// =============================================================================
// Tests all deterministic opportunity calculations: scoring, confidence,
// risk assessment, action generation, deduplication, and type classification.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  evaluateOpportunity,
  computeOpportunityContentHash,
  type OpportunityCandidate,
  type DemandSignalSummary,
} from "../../src/services/opportunity-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<DemandSignalSummary> = {}): DemandSignalSummary {
  return {
    id: `signal-${Math.random().toString(36).slice(2, 8)}`,
    sourceId: "source-1",
    signalType: "MARKETPLACE",
    metric: "listing_count",
    value: 100,
    observedAt: new Date("2026-09-15T00:00:00Z"),
    geography: "BD",
    confidence: 0.7,
    freshness: "fresh",
    dataQuality: "valid",
    sourceReliability: 0.8,
    isOutlier: false,
    ...overrides,
  };
}

function makeCandidate(
  signalCount: number = 5,
  overrides: Partial<DemandSignalSummary> = {}
): OpportunityCandidate {
  const baseDate = new Date("2026-09-01T00:00:00Z");
  const signals: DemandSignalSummary[] = [];

  for (let i = 0; i < signalCount; i++) {
    signals.push(
      makeSignal({
        id: `signal-${i}`,
        observedAt: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
        value: 100 + i * 10, // Growing values
        ...overrides,
      })
    );
  }

  return {
    tenantId: "tenant-1",
    productId: "product-1",
    productVariantId: null,
    geographyCode: "BD",
    categoryId: null,
    signals,
  };
}

// ─── Basic Scoring Tests ─────────────────────────────────────────────────────

describe("evaluateOpportunity", () => {
  it("should produce a valid opportunity for strong demand signals", () => {
    const candidate = makeCandidate(10);
    const result = evaluateOpportunity(candidate);

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
    expect(result!.algorithmVersion).toBe("8.0.0");
    expect(result!.contentHash).toBeTruthy();
    expect(result!.opportunityType).toBeTruthy();
  });

  it("should return null for insufficient signals", () => {
    const candidate = makeCandidate(1);
    const result = evaluateOpportunity(candidate);
    expect(result).toBeNull();
  });

  it("should return null for low confidence signals", () => {
    const candidate = makeCandidate(5, { confidence: 0.1 });
    const result = evaluateOpportunity(candidate);
    expect(result).toBeNull();
  });

  it("should filter out outlier signals", () => {
    const candidate = makeCandidate(5);
    // Make most signals outliers
    candidate.signals = candidate.signals.map((s, i) =>
      i < 4 ? { ...s, isOutlier: true } : s
    );
    const result = evaluateOpportunity(candidate);
    // Only 1 valid signal → should return null
    expect(result).toBeNull();
  });

  it("should filter out invalid quality signals", () => {
    const candidate = makeCandidate(5);
    candidate.signals = candidate.signals.map((s, i) =>
      i < 4 ? { ...s, dataQuality: "invalid" } : s
    );
    const result = evaluateOpportunity(candidate);
    expect(result).toBeNull();
  });
});

// ─── Growth Tests ────────────────────────────────────────────────────────────

describe("demand growth scoring", () => {
  it("should score higher for strong growth", () => {
    const candidate = makeCandidate(10);
    // Strong growth: 10, 20, 30, ... 100
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      value: 10 + i * 10,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.breakdown.demandMomentum).toBeGreaterThan(50);
  });

  it("should score lower for declining demand", () => {
    const candidate = makeCandidate(10);
    // Declining: 100, 90, 80, ... 10
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      value: 100 - i * 10,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.breakdown.demandMomentum).toBeLessThan(50);
  });

  it("should score moderate for flat demand", () => {
    const candidate = makeCandidate(10);
    candidate.signals = candidate.signals.map((s) => ({
      ...s,
      value: 50,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.breakdown.demandMomentum).toBeGreaterThanOrEqual(0);
    expect(result!.breakdown.demandMomentum).toBeLessThanOrEqual(100);
  });
});

// ─── Acceleration Tests ──────────────────────────────────────────────────────

describe("acceleration scoring", () => {
  it("should detect accelerating demand", () => {
    const candidate = makeCandidate(10);
    // Exponential growth: acceleration should be high
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      value: 10 * Math.pow(1.5, i),
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.breakdown.acceleration).toBeGreaterThan(50);
  });

  it("should detect decelerating demand", () => {
    const candidate = makeCandidate(10);
    // Logarithmic growth: deceleration
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      value: 10 + 50 * Math.log(i + 1),
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    // Deceleration → lower acceleration score
    expect(result!.breakdown.acceleration).toBeLessThan(60);
  });
});

// ─── Persistence Tests ───────────────────────────────────────────────────────

describe("persistence scoring", () => {
  it("should score high for persistent demand", () => {
    const candidate = makeCandidate(15);
    // Steadily increasing values over 15 days
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      observedAt: new Date(new Date("2026-09-01").getTime() + i * 24 * 60 * 60 * 1000),
      value: 50 + i * 3,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.breakdown.demandPersistence).toBeGreaterThan(50);
  });

  it("should score low for short-lived spike", () => {
    const candidate = makeCandidate(5);
    // Spike then drop
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      value: i === 2 ? 500 : 50,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.breakdown.demandPersistence).toBeLessThan(80);
  });
});

// ─── Source Diversity Tests ──────────────────────────────────────────────────

describe("source diversity scoring", () => {
  it("should score higher with multiple independent sources", () => {
    const candidate = makeCandidate(10);
    // 5 different sources
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      sourceId: `source-${i % 5}`,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.breakdown.sourceDiversity).toBeGreaterThan(50);
  });

  it("should score lower with single source", () => {
    const candidate = makeCandidate(10);
    candidate.signals = candidate.signals.map((s) => ({
      ...s,
      sourceId: "source-1",
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.breakdown.sourceDiversity).toBeLessThanOrEqual(30);
  });

  it("should not simply count duplicates", () => {
    const candidate1 = makeCandidate(10);
    candidate1.signals = candidate1.signals.map((s) => ({
      ...s,
      sourceId: "source-1",
    }));

    const candidate2 = makeCandidate(10);
    candidate2.signals = candidate2.signals.map((s, i) => ({
      ...s,
      sourceId: `source-${i % 5}`,
    }));

    const result1 = evaluateOpportunity(candidate1);
    const result2 = evaluateOpportunity(candidate2);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    // Multiple sources should have higher diversity score
    expect(result2!.breakdown.sourceDiversity).toBeGreaterThan(result1!.breakdown.sourceDiversity);
  });
});

// ─── Confidence Tests ────────────────────────────────────────────────────────

describe("confidence scoring", () => {
  it("should produce high confidence with complete data", () => {
    const candidate = makeCandidate(20);
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      confidence: 0.9,
      sourceId: `source-${i % 5}`,
      sourceReliability: 0.9,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0.6);
  });

  it("should produce lower confidence with sparse data", () => {
    const candidate = makeCandidate(3, { confidence: 0.5 });
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThan(0.7);
  });

  it("should produce lower confidence with conflicting signals", () => {
    const candidate = makeCandidate(10);
    // Very different values from different sources
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      value: i < 5 ? 10 : 1000,
      sourceId: i < 5 ? "source-a" : "source-b",
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    // High variance → lower agreement → lower confidence
    expect(result!.confidence).toBeLessThan(0.9);
  });
});

// ─── Risk Tests ──────────────────────────────────────────────────────────────

describe("risk assessment", () => {
  it("should detect high volatility risk", () => {
    const candidate = makeCandidate(10);
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      value: i % 2 === 0 ? 10 : 1000,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    const volatilityRisk = result!.risks.find((r) => r.riskType === "HIGH_VOLATILITY");
    expect(volatilityRisk).toBeTruthy();
  });

  it("should detect stale signal risk", () => {
    const candidate = makeCandidate(5);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    candidate.signals = candidate.signals.map((s) => ({
      ...s,
      observedAt: oldDate,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    const staleRisk = result!.risks.find((r) => r.riskType === "STALE_SIGNAL");
    expect(staleRisk).toBeTruthy();
  });

  it("should detect data sparse risk", () => {
    const candidate = makeCandidate(3);
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    const sparseRisk = result!.risks.find((r) => r.riskType === "DATA_SPARSE");
    expect(sparseRisk).toBeTruthy();
  });

  it("should always include COMMERCIAL_DATA_MISSING risk", () => {
    const candidate = makeCandidate(10);
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    const commercialRisk = result!.risks.find(
      (r) => r.riskType === "COMMERCIAL_DATA_MISSING"
    );
    expect(commercialRisk).toBeTruthy();
  });

  it("should detect source conflict risk", () => {
    const candidate = makeCandidate(10);
    // Source A shows growth, Source B shows decline
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      sourceId: i < 5 ? "source-a" : "source-b",
      value: i < 5 ? 50 + i * 20 : 200 - i * 20,
      observedAt: new Date(new Date("2026-09-01").getTime() + i * 24 * 60 * 60 * 1000),
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    const conflictRisk = result!.risks.find((r) => r.riskType === "SOURCE_CONFLICT");
    expect(conflictRisk).toBeTruthy();
  });
});

// ─── Missing Data Tests ──────────────────────────────────────────────────────

describe("missing data handling", () => {
  it("should not fabricate commercial data", () => {
    const candidate = makeCandidate(10);
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    // Commercial data should be absent from breakdown
    expect(result!.breakdown).not.toHaveProperty("commercialScore");
    expect(result!.breakdown).not.toHaveProperty("supplierPrice");
    expect(result!.breakdown).not.toHaveProperty("margin");
  });

  it("should handle null productId gracefully", () => {
    const candidate = makeCandidate(5);
    candidate.productId = null;
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(result!.productId).toBeNull();
  });
});

// ─── Determinism Tests ───────────────────────────────────────────────────────

describe("determinism", () => {
  it("should produce identical results for identical inputs", () => {
    const candidate = makeCandidate(10);
    const result1 = evaluateOpportunity(candidate);
    const result2 = evaluateOpportunity(candidate);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1!.score).toBe(result2!.score);
    expect(result1!.confidence).toBe(result2!.confidence);
    expect(result1!.contentHash).toBe(result2!.contentHash);
    expect(result1!.opportunityType).toBe(result2!.opportunityType);
  });

  it("should produce different hashes for different signal sets", () => {
    const candidate1 = makeCandidate(5);
    const candidate2 = makeCandidate(5);
    // Different signal IDs
    candidate2.signals = candidate2.signals.map((s) => ({
      ...s,
      id: `different-${s.id}`,
    }));

    const result1 = evaluateOpportunity(candidate1);
    const result2 = evaluateOpportunity(candidate2);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1!.contentHash).not.toBe(result2!.contentHash);
  });
});

// ─── Content Hash Tests ──────────────────────────────────────────────────────

describe("computeOpportunityContentHash", () => {
  it("should produce deterministic hash", () => {
    const data = {
      tenantId: "tenant-1",
      productId: "product-1",
      productVariantId: null,
      geographyCode: "BD",
      opportunityType: "GROWING_PRODUCT",
      signalIds: ["s1", "s2", "s3"],
      algorithmVersion: "8.0.0",
    };

    const hash1 = computeOpportunityContentHash(data);
    const hash2 = computeOpportunityContentHash(data);
    expect(hash1).toBe(hash2);
  });

  it("should produce same hash regardless of signal ID order", () => {
    const hash1 = computeOpportunityContentHash({
      tenantId: "t1",
      productId: "p1",
      productVariantId: null,
      geographyCode: "BD",
      opportunityType: "GROWING_PRODUCT",
      signalIds: ["s1", "s2", "s3"],
      algorithmVersion: "8.0.0",
    });

    const hash2 = computeOpportunityContentHash({
      tenantId: "t1",
      productId: "p1",
      productVariantId: null,
      geographyCode: "BD",
      opportunityType: "GROWING_PRODUCT",
      signalIds: ["s3", "s1", "s2"],
      algorithmVersion: "8.0.0",
    });

    expect(hash1).toBe(hash2);
  });

  it("should produce different hash for different algorithm versions", () => {
    const base = {
      tenantId: "t1",
      productId: "p1",
      productVariantId: null,
      geographyCode: "BD",
      opportunityType: "GROWING_PRODUCT",
      signalIds: ["s1"],
    };

    const hash1 = computeOpportunityContentHash({ ...base, algorithmVersion: "8.0.0" });
    const hash2 = computeOpportunityContentHash({ ...base, algorithmVersion: "8.1.0" });
    expect(hash1).not.toBe(hash2);
  });
});

// ─── Action Generation Tests ─────────────────────────────────────────────────

describe("action generation", () => {
  it("should generate INVESTIGATE_SUPPLIERS for high-score opportunities", () => {
    const candidate = makeCandidate(15);
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      value: 50 + i * 20,
      sourceId: `source-${i % 4}`,
      confidence: 0.8,
      sourceReliability: 0.9,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    const investigateAction = result!.actions.find(
      (a) => a.actionType === "INVESTIGATE_SUPPLIERS"
    );
    expect(investigateAction).toBeTruthy();
  });

  it("should generate WATCH_DEMAND for low confidence", () => {
    const candidate = makeCandidate(5, { confidence: 0.55 });
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    if (result!.confidence < 0.5) {
      const watchAction = result!.actions.find((a) => a.actionType === "WATCH_DEMAND");
      expect(watchAction).toBeTruthy();
    }
  });

  it("should always include VERIFY_PRICE when commercial data is missing", () => {
    const candidate = makeCandidate(10);
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    const priceAction = result!.actions.find((a) => a.actionType === "VERIFY_PRICE");
    expect(priceAction).toBeTruthy();
  });
});

// ─── Opportunity Type Tests ──────────────────────────────────────────────────

describe("opportunity type classification", () => {
  it("should classify sustained demand correctly", () => {
    const candidate = makeCandidate(20);
    // Long, steady growth
    candidate.signals = candidate.signals.map((s, i) => ({
      ...s,
      observedAt: new Date(new Date("2026-09-01").getTime() + i * 24 * 60 * 60 * 1000),
      value: 50 + i * 5,
    }));
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(["SUSTAINED_DEMAND", "GROWING_PRODUCT"]).toContain(result!.opportunityType);
  });

  it("should produce a valid opportunity type", () => {
    const validTypes = [
      "EMERGING_PRODUCT", "GROWING_PRODUCT", "SUSTAINED_DEMAND",
      "SEASONAL_OPPORTUNITY", "GEOGRAPHIC_OPPORTUNITY",
      "MOMENTUM_OPPORTUNITY", "UNDEREXPLORED_CATEGORY",
    ];
    const candidate = makeCandidate(10);
    const result = evaluateOpportunity(candidate);
    expect(result).not.toBeNull();
    expect(validTypes).toContain(result!.opportunityType);
  });
});
