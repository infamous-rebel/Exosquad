// =============================================================================
// Unit Tests — Sourcing Engine (Phase 13)
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  calculateSourcingOption,
  type SourcingEngineInput,
  type SourcingCommercialInput,
  type Phase7DemandInput,
  type Phase11PricingInput,
  type Phase10LogisticsInput,
} from "../../src/services/sourcing-engine.js";
import type { SupplierEvaluationResult } from "../../src/services/supplier-evaluation-engine.js";
import type { EvidenceRef } from "../../src/services/supplier-matching-engine.js";

const now = new Date("2025-01-15T00:00:00Z");

function makeEvidence(overrides: Partial<EvidenceRef> = {}): EvidenceRef {
  return {
    id: "ev-1",
    sourceId: "src-1",
    confidence: 0.8,
    observedAt: now,
    evidenceType: "SUPPLIER_IDENTITY",
    status: "active",
    ...overrides,
  };
}

function makeEvalResult(overrides: Partial<SupplierEvaluationResult> = {}): SupplierEvaluationResult {
  return {
    supplierId: "sup-1",
    qualityLevel: "high",
    qualityScore: 70,
    identityConfidence: 0.8,
    evidenceConfidence: 0.7,
    commercialCompleteness: 0.5,
    dimensionScores: {
      identityConfidence: 80, productRelevance: 75, evidenceQuality: 70,
      commercialCompleteness: 50, supplierReliability: 70, priceTransparency: 70,
      moqTransparency: 100, leadTimeTransparency: 100, certificationAvailability: 0,
      contactCompleteness: 60, recency: 70, crossSourceConsistency: 50,
    },
    strengths: [],
    constraints: [],
    explanations: [],
    contentHash: "abc123",
    ...overrides,
  };
}

function makeCommercial(overrides: Partial<SourcingCommercialInput> = {}): SourcingCommercialInput {
  return {
    sourcePrice: 25,
    currency: "USD",
    moq: 100,
    leadTimeDays: 14,
    quantityBreaks: null,
    paymentTerms: "T/T 30%",
    ...overrides,
  };
}

function makeDemand(overrides: Partial<Phase7DemandInput> = {}): Phase7DemandInput {
  return {
    estimatedMonthlyDemand: 50,
    demandLevel: "MODERATE",
    demandConfidence: 0.6,
    ...overrides,
  };
}

function makePricing(overrides: Partial<Phase11PricingInput> = {}): Phase11PricingInput {
  return {
    unitLandedCost: 30,
    currency: "USD",
    ...overrides,
  };
}

function makeLogistics(overrides: Partial<Phase10LogisticsInput> = {}): Phase10LogisticsInput {
  return {
    routeCount: 3,
    routeReliability: 0.8,
    transitTimeDays: { min: 7, max: 14 },
    ...overrides,
  };
}

function makeInput(overrides: Partial<SourcingEngineInput> = {}): SourcingEngineInput {
  return {
    productId: "prod-1",
    supplierId: "sup-1",
    matchScore: 75,
    matchLevel: "strong",
    evaluationResult: makeEvalResult(),
    commercial: makeCommercial(),
    demand: makeDemand(),
    pricing: makePricing(),
    logistics: makeLogistics(),
    evidence: [makeEvidence()],
    referenceDate: now,
    ...overrides,
  };
}

describe("Sourcing Engine", () => {
  // ─── MOQ Analysis ────────────────────────────────────────────────────────

  it("should calculate MOQ coverage in months", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: 100 }), demand: makeDemand({ estimatedMonthlyDemand: 50 }) }),
    );
    expect(result.moqCoverageMonths).toBe(2); // 100/50 = 2
  });

  it("should return null MOQ coverage when demand is unknown", () => {
    const result = calculateSourcingOption(
      makeInput({ demand: makeDemand({ estimatedMonthlyDemand: null }) }),
    );
    expect(result.moqCoverageMonths).toBeNull();
  });

  it("should return null MOQ coverage when MOQ is unknown", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: null }) }),
    );
    expect(result.moqCoverageMonths).toBeNull();
  });

  it("should detect HIGH_MOQ constraint for very large MOQ", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: 1000 }) }),
    );
    expect(result.constraints.some((c) => c.type === "HIGH_MOQ")).toBe(true);
  });

  it("should detect UNKNOWN_MOQ constraint when MOQ is null", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: null }) }),
    );
    expect(result.constraints.some((c) => c.type === "UNKNOWN_MOQ")).toBe(true);
  });

  // ─── Lead Time Analysis ──────────────────────────────────────────────────

  it("should calculate total lead time with transit", () => {
    const result = calculateSourcingOption(
      makeInput({
        commercial: makeCommercial({ leadTimeDays: 14 }),
        logistics: makeLogistics({ transitTimeDays: { min: 7, max: 14 } }),
      }),
    );
    expect(result.leadTimeDays).toBe(14);
  });

  it("should detect LONG_LEAD_TIME constraint", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ leadTimeDays: 90 }) }),
    );
    expect(result.constraints.some((c) => c.type === "LONG_LEAD_TIME")).toBe(true);
  });

  it("should detect UNKNOWN_LEAD_TIME constraint", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ leadTimeDays: null }) }),
    );
    expect(result.constraints.some((c) => c.type === "UNKNOWN_LEAD_TIME")).toBe(true);
  });

  // ─── Capital Exposure ────────────────────────────────────────────────────

  it("should calculate estimated initial inventory cost", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: 100, sourcePrice: 25 }) }),
    );
    expect(result.estimatedInitialInventoryCost).toBe(2500); // 100 * 25
  });

  it("should return null initial cost when MOQ is unknown", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: null, sourcePrice: 25 }) }),
    );
    expect(result.estimatedInitialInventoryCost).toBeNull();
  });

  it("should return null initial cost when price is unknown", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: 100, sourcePrice: null }) }),
    );
    expect(result.estimatedInitialInventoryCost).toBeNull();
  });

  it("should detect HIGH_CAPITAL_REQUIREMENT constraint", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: 1000, sourcePrice: 50 }) }),
    );
    // 1000 * 50 = 50000 > 10000
    expect(result.constraints.some((c) => c.type === "HIGH_CAPITAL_REQUIREMENT")).toBe(true);
  });

  // ─── Price Constraints ───────────────────────────────────────────────────

  it("should detect UNKNOWN_PRICE constraint when price is null", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ sourcePrice: null }) }),
    );
    expect(result.constraints.some((c) => c.type === "UNKNOWN_PRICE")).toBe(true);
  });

  // ─── Supplier Identity Constraint ────────────────────────────────────────

  it("should detect SUPPLIER_IDENTITY_UNCERTAIN constraint", () => {
    const result = calculateSourcingOption(
      makeInput({
        evaluationResult: makeEvalResult({ identityConfidence: 0.1 }),
      }),
    );
    expect(result.constraints.some((c) => c.type === "SUPPLIER_IDENTITY_UNCERTAIN")).toBe(true);
  });

  // ─── Evidence Constraints ────────────────────────────────────────────────

  it("should detect INSUFFICIENT_SUPPLIER_EVIDENCE with no evidence", () => {
    const result = calculateSourcingOption(makeInput({ evidence: [] }));
    expect(result.constraints.some((c) => c.type === "INSUFFICIENT_SUPPLIER_EVIDENCE")).toBe(true);
  });

  it("should detect WEAK_SUPPLIER_EVIDENCE with only 1 evidence", () => {
    const result = calculateSourcingOption(makeInput({ evidence: [makeEvidence()] }));
    // minimumEvidenceCount is 2, so 1 evidence = weak
    expect(result.constraints.some((c) => c.type === "WEAK_SUPPLIER_EVIDENCE")).toBe(true);
  });

  // ─── Payment Terms Constraint ────────────────────────────────────────────

  it("should detect MISSING_PAYMENT_TERMS constraint", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ paymentTerms: null }) }),
    );
    expect(result.constraints.some((c) => c.type === "MISSING_PAYMENT_TERMS")).toBe(true);
  });

  // ─── Logistics Constraint ────────────────────────────────────────────────

  it("should detect LOGISTICS_UNCERTAIN constraint when no routes", () => {
    const result = calculateSourcingOption(
      makeInput({ logistics: makeLogistics({ routeCount: null }) }),
    );
    expect(result.constraints.some((c) => c.type === "LOGISTICS_UNCERTAIN")).toBe(true);
  });

  // ─── Match Uncertainty Constraint ────────────────────────────────────────

  it("should detect PRODUCT_MATCH_UNCERTAIN for weak match", () => {
    const result = calculateSourcingOption(
      makeInput({ matchLevel: "weak", matchScore: 25 }),
    );
    expect(result.constraints.some((c) => c.type === "PRODUCT_MATCH_UNCERTAIN")).toBe(true);
  });

  // ─── Sourcing Score & Level ──────────────────────────────────────────────

  it("should calculate sourcing score within 0-100", () => {
    const result = calculateSourcingOption(makeInput());
    expect(result.sourcingScore).toBeGreaterThanOrEqual(0);
    expect(result.sourcingScore).toBeLessThanOrEqual(100);
  });

  it("should classify sourcing level correctly", () => {
    const result = calculateSourcingOption(makeInput());
    const validLevels = ["unavailable", "weak", "possible", "strong", "preferred"];
    expect(validLevels).toContain(result.sourcingLevel);
  });

  it("should produce higher score for complete data", () => {
    const complete = calculateSourcingOption(
      makeInput({
        commercial: makeCommercial({ sourcePrice: 25, moq: 50, leadTimeDays: 10, paymentTerms: "T/T" }),
        matchScore: 90,
        evaluationResult: makeEvalResult({ qualityScore: 85 }),
      }),
    );
    const sparse = calculateSourcingOption(
      makeInput({
        commercial: makeCommercial({ sourcePrice: null, moq: null, leadTimeDays: null, paymentTerms: null }),
        matchScore: 30,
        evaluationResult: makeEvalResult({ qualityScore: 20 }),
      }),
    );
    expect(complete.sourcingScore).toBeGreaterThan(sparse.sourcingScore);
  });

  // ─── Estimated Landed Cost ───────────────────────────────────────────────

  it("should reference Phase 11 landed cost when available", () => {
    const result = calculateSourcingOption(
      makeInput({ pricing: makePricing({ unitLandedCost: 35 }) }),
    );
    expect(result.estimatedLandedCost).toBe(35);
  });

  it("should return null landed cost when Phase 11 data is missing", () => {
    const result = calculateSourcingOption(
      makeInput({ pricing: makePricing({ unitLandedCost: null }) }),
    );
    expect(result.estimatedLandedCost).toBeNull();
  });

  // ─── Deterministic Output ────────────────────────────────────────────────

  it("should produce identical output for identical input", () => {
    const input = makeInput();
    const r1 = calculateSourcingOption(input);
    const r2 = calculateSourcingOption(input);
    expect(r1.sourcingScore).toBe(r2.sourcingScore);
    expect(r1.sourcingLevel).toBe(r2.sourcingLevel);
    expect(r1.contentHash).toBe(r2.contentHash);
  });

  // ─── Explanations ────────────────────────────────────────────────────────

  it("should provide explanations", () => {
    const result = calculateSourcingOption(makeInput());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it("should explain capital cost when available", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ moq: 100, sourcePrice: 25 }) }),
    );
    expect(result.explanations.some((e) => e.factor === "capital")).toBe(true);
  });

  // ─── Content Hash ────────────────────────────────────────────────────────

  it("should produce valid SHA-256 content hash", () => {
    const result = calculateSourcingOption(makeInput());
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should produce different hash for different inputs", () => {
    const r1 = calculateSourcingOption(makeInput({ supplierId: "sup-1" }));
    const r2 = calculateSourcingOption(makeInput({ supplierId: "sup-2" }));
    expect(r1.contentHash).not.toBe(r2.contentHash);
  });

  // ─── Score Bounds ────────────────────────────────────────────────────────

  it("should keep sourcePrice in output matching input", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ sourcePrice: 42.5 }) }),
    );
    expect(result.sourcePrice).toBe(42.5);
  });

  it("should keep currency in output matching input", () => {
    const result = calculateSourcingOption(
      makeInput({ commercial: makeCommercial({ currency: "EUR" }) }),
    );
    expect(result.currency).toBe("EUR");
  });

  // ─── Renormalization ─────────────────────────────────────────────────────

  it("should renormalize score over known dimensions only", () => {
    // With no price and no MOQ, those dimensions are excluded from weighted average
    const result = calculateSourcingOption(
      makeInput({
        commercial: makeCommercial({ sourcePrice: null, moq: null }),
        matchScore: 80,
        evaluationResult: makeEvalResult({ qualityScore: 80, evidenceConfidence: 0.8, commercialCompleteness: 0.8 }),
      }),
    );
    // Score should still be meaningful (not 0) since other dimensions are known
    expect(result.sourcingScore).toBeGreaterThan(0);
  });
});
