// =============================================================================
// Unit Tests — Procurement Viability Engine (Phase 13)
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  calculateProcurementViability,
  type ProcurementViabilityEngineInput,
} from "../../src/services/procurement-viability-engine.js";
import type { SupplierEvaluationResult } from "../../src/services/supplier-evaluation-engine.js";
import type { SourcingOptionResult } from "../../src/services/sourcing-engine.js";
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

function makeSourcingResult(overrides: Partial<SourcingOptionResult> = {}): SourcingOptionResult {
  return {
    supplierId: "sup-1",
    sourcePrice: 25,
    currency: "USD",
    moq: 100,
    leadTimeDays: 14,
    estimatedLandedCost: 30,
    estimatedInitialInventoryCost: 2500,
    moqCoverageMonths: 2,
    sourcingLevel: "possible",
    sourcingScore: 55,
    constraints: [],
    explanations: [],
    contentHash: "def456",
    ...overrides,
  };
}

function makeInput(overrides: Partial<ProcurementViabilityEngineInput> = {}): ProcurementViabilityEngineInput {
  return {
    productId: "prod-1",
    supplierId: "sup-1",
    matchScore: 75,
    matchLevel: "strong",
    evaluationResult: makeEvalResult(),
    sourcingResult: makeSourcingResult(),
    evidence: [makeEvidence()],
    hasComplianceData: false,
    hasLogisticsRoutes: true,
    contactCount: 2,
    referenceDate: now,
    ...overrides,
  };
}

describe("Procurement Viability Engine", () => {
  // ─── Viability Score & Level ─────────────────────────────────────────────

  it("should calculate viability score within 0-100", () => {
    const result = calculateProcurementViability(makeInput());
    expect(result.viabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.viabilityScore).toBeLessThanOrEqual(100);
  });

  it("should classify viability level correctly", () => {
    const result = calculateProcurementViability(makeInput());
    const validLevels = ["not_viable", "weak", "conditional", "viable", "strong"];
    expect(validLevels).toContain(result.viabilityLevel);
  });

  it("should produce higher score for complete data", () => {
    const complete = calculateProcurementViability(
      makeInput({
        evaluationResult: makeEvalResult({ qualityScore: 85 }),
        sourcingResult: makeSourcingResult({ sourcePrice: 25, moq: 50, leadTimeDays: 10 }),
        hasComplianceData: true,
        hasLogisticsRoutes: true,
        evidence: Array.from({ length: 5 }, (_, i) => makeEvidence({ id: `ev-${i}`, sourceId: `src-${i}` })),
      }),
    );
    const sparse = calculateProcurementViability(
      makeInput({
        evaluationResult: makeEvalResult({ qualityScore: 20 }),
        sourcingResult: makeSourcingResult({ sourcePrice: null, moq: null, leadTimeDays: null }),
        hasComplianceData: false,
        hasLogisticsRoutes: false,
        evidence: [],
      }),
    );
    expect(complete.viabilityScore).toBeGreaterThan(sparse.viabilityScore);
  });

  // ─── Dimension Scores ────────────────────────────────────────────────────

  it("should calculate all 12 dimension scores", () => {
    const result = calculateProcurementViability(makeInput());
    const expectedDims = [
      "supplierReliability", "supplierEvidence", "productMatch",
      "moqBurden", "capitalRequirement", "priceTransparency",
      "leadTimeBurden", "paymentTermAvailability", "logisticsFeasibility",
      "complianceReadiness", "documentationCompleteness", "contactAvailability",
    ];
    for (const dim of expectedDims) {
      expect(result.dimensionScores).toHaveProperty(dim);
      expect(result.dimensionScores[dim]).toBeGreaterThanOrEqual(0);
      expect(result.dimensionScores[dim]).toBeLessThanOrEqual(100);
    }
  });

  it("should score product match proportional to match score", () => {
    const high = calculateProcurementViability(makeInput({ matchScore: 90 }));
    const low = calculateProcurementViability(makeInput({ matchScore: 30 }));
    expect(high.dimensionScores.productMatch).toBeGreaterThan(low.dimensionScores.productMatch);
  });

  it("should score price transparency 100 when price is known", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ sourcePrice: 25 }) }),
    );
    expect(result.dimensionScores.priceTransparency).toBe(100);
  });

  it("should score price transparency 0 when price is unknown", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ sourcePrice: null }) }),
    );
    expect(result.dimensionScores.priceTransparency).toBe(0);
  });

  it("should score compliance readiness 80 when compliance data exists", () => {
    const result = calculateProcurementViability(makeInput({ hasComplianceData: true }));
    expect(result.dimensionScores.complianceReadiness).toBe(80);
  });

  it("should score compliance readiness 0 when no compliance data", () => {
    const result = calculateProcurementViability(makeInput({ hasComplianceData: false }));
    expect(result.dimensionScores.complianceReadiness).toBe(0);
  });

  it("should score logistics feasibility 0 when no routes", () => {
    const result = calculateProcurementViability(makeInput({ hasLogisticsRoutes: false }));
    expect(result.dimensionScores.logisticsFeasibility).toBe(0);
  });

  it("should score logistics feasibility 50 when routes exist but reliability unknown", () => {
    const result = calculateProcurementViability(makeInput({ hasLogisticsRoutes: true }));
    expect(result.dimensionScores.logisticsFeasibility).toBe(50);
  });

  // ─── MOQ Burden ──────────────────────────────────────────────────────────

  it("should score MOQ burden 0 when MOQ is unknown", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ moq: null }) }),
    );
    expect(result.dimensionScores.moqBurden).toBe(0);
  });

  it("should score MOQ burden higher for low coverage months", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ moq: 50, moqCoverageMonths: 1 }) }),
    );
    expect(result.dimensionScores.moqBurden).toBeGreaterThanOrEqual(70);
  });

  // ─── Capital Requirement ─────────────────────────────────────────────────

  it("should score capital requirement 0 when unknown", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ estimatedInitialInventoryCost: null }) }),
    );
    expect(result.dimensionScores.capitalRequirement).toBe(0);
  });

  it("should score capital requirement high for low cost", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ estimatedInitialInventoryCost: 200 }) }),
    );
    expect(result.dimensionScores.capitalRequirement).toBeGreaterThanOrEqual(80);
  });

  it("should score capital requirement low for very high cost", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ estimatedInitialInventoryCost: 50000 }) }),
    );
    expect(result.dimensionScores.capitalRequirement).toBeLessThanOrEqual(15);
  });

  // ─── Lead Time Burden ────────────────────────────────────────────────────

  it("should score lead time burden 0 when unknown", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ leadTimeDays: null }) }),
    );
    expect(result.dimensionScores.leadTimeBurden).toBe(0);
  });

  it("should score lead time burden high for short lead time", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ leadTimeDays: 7 }) }),
    );
    expect(result.dimensionScores.leadTimeBurden).toBeGreaterThanOrEqual(80);
  });

  it("should score lead time burden low for very long lead time", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ leadTimeDays: 90 }) }),
    );
    expect(result.dimensionScores.leadTimeBurden).toBeLessThanOrEqual(15);
  });

  // ─── Confidence ──────────────────────────────────────────────────────────

  it("should calculate confidence within 0-1", () => {
    const result = calculateProcurementViability(makeInput());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should have higher confidence with more data dimensions populated", () => {
    const rich = calculateProcurementViability(
      makeInput({
        hasComplianceData: true,
        hasLogisticsRoutes: true,
        evidence: Array.from({ length: 5 }, (_, i) => makeEvidence({ id: `ev-${i}`, sourceId: `src-${i}` })),
      }),
    );
    const poor = calculateProcurementViability(
      makeInput({
        hasComplianceData: false,
        hasLogisticsRoutes: false,
        evidence: [],
      }),
    );
    expect(rich.confidence).toBeGreaterThan(poor.confidence);
  });

  // ─── Pass-Through Metrics ────────────────────────────────────────────────

  it("should pass through capital requirement from sourcing result", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ estimatedInitialInventoryCost: 3000 }) }),
    );
    expect(result.capitalRequirement).toBe(3000);
  });

  it("should pass through estimated lead time from sourcing result", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ leadTimeDays: 21 }) }),
    );
    expect(result.estimatedLeadTimeDays).toBe(21);
  });

  it("should pass through inventory exposure from sourcing result", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ moqCoverageMonths: 3.5 }) }),
    );
    expect(result.inventoryExposure).toBe(3.5);
  });

  // ─── Constraints ─────────────────────────────────────────────────────────

  it("should include COMPLIANCE_UNCERTAIN constraint when no compliance data", () => {
    const result = calculateProcurementViability(makeInput({ hasComplianceData: false }));
    expect(result.constraints.some((c) => c.type === "COMPLIANCE_UNCERTAIN")).toBe(true);
  });

  it("should not include COMPLIANCE_UNCERTAIN when compliance data exists", () => {
    const result = calculateProcurementViability(makeInput({ hasComplianceData: true }));
    expect(result.constraints.some((c) => c.type === "COMPLIANCE_UNCERTAIN")).toBe(false);
  });

  it("should include LOGISTICS_UNCERTAIN constraint when no routes", () => {
    const result = calculateProcurementViability(makeInput({ hasLogisticsRoutes: false }));
    expect(result.constraints.some((c) => c.type === "LOGISTICS_UNCERTAIN")).toBe(true);
  });

  it("should pass through sourcing result constraints", () => {
    const sourcingConstraints = [{
      type: "UNKNOWN_PRICE",
      severity: "high" as const,
      value: null,
      explanation: "No price",
      evidenceIds: [],
    }];
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ constraints: sourcingConstraints }) }),
    );
    expect(result.constraints.some((c) => c.type === "UNKNOWN_PRICE")).toBe(true);
  });

  // ─── Explanations ────────────────────────────────────────────────────────

  it("should provide explanations", () => {
    const result = calculateProcurementViability(makeInput());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it("should explain capital requirement when available", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ estimatedInitialInventoryCost: 2500 }) }),
    );
    expect(result.explanations.some((e) => e.factor === "capital")).toBe(true);
  });

  it("should explain unknown capital requirement", () => {
    const result = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ estimatedInitialInventoryCost: null }) }),
    );
    const capitalExplanation = result.explanations.find((e) => e.factor === "capital");
    expect(capitalExplanation).toBeDefined();
    expect(capitalExplanation?.impact).toBe("unknown");
  });

  // ─── Deterministic Output ────────────────────────────────────────────────

  it("should produce identical output for identical input", () => {
    const input = makeInput();
    const r1 = calculateProcurementViability(input);
    const r2 = calculateProcurementViability(input);
    expect(r1.viabilityScore).toBe(r2.viabilityScore);
    expect(r1.viabilityLevel).toBe(r2.viabilityLevel);
    expect(r1.contentHash).toBe(r2.contentHash);
  });

  // ─── Content Hash ────────────────────────────────────────────────────────

  it("should produce valid SHA-256 content hash", () => {
    const result = calculateProcurementViability(makeInput());
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should produce different hash for different inputs", () => {
    const r1 = calculateProcurementViability(makeInput({ supplierId: "sup-1" }));
    const r2 = calculateProcurementViability(makeInput({ supplierId: "sup-2" }));
    expect(r1.contentHash).not.toBe(r2.contentHash);
  });

  // ─── Unknown ≠ Zero ─────────────────────────────────────────────────────

  it("should not treat unknown MOQ as zero burden", () => {
    const withMoq = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ moq: 100 }) }),
    );
    const withoutMoq = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ moq: null }) }),
    );
    // Unknown MOQ → moqBurden = 0 (unknown), not confused with zero MOQ
    expect(withoutMoq.dimensionScores.moqBurden).toBe(0);
    expect(withMoq.dimensionScores.moqBurden).toBeGreaterThan(0);
  });

  it("should not treat unknown lead time as zero burden", () => {
    const withLt = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ leadTimeDays: 14 }) }),
    );
    const withoutLt = calculateProcurementViability(
      makeInput({ sourcingResult: makeSourcingResult({ leadTimeDays: null }) }),
    );
    expect(withoutLt.dimensionScores.leadTimeBurden).toBe(0);
    expect(withLt.dimensionScores.leadTimeBurden).toBeGreaterThan(0);
  });

  // ─── Viability Level Classification ──────────────────────────────────────

  it("should classify as strong for ideal input", () => {
    const result = calculateProcurementViability(
      makeInput({
        matchScore: 95,
        evaluationResult: makeEvalResult({
          qualityScore: 90,
          dimensionScores: {
            identityConfidence: 95, productRelevance: 95, evidenceQuality: 90,
            commercialCompleteness: 90, supplierReliability: 90, priceTransparency: 100,
            moqTransparency: 100, leadTimeTransparency: 100, certificationAvailability: 100,
            contactCompleteness: 90, recency: 90, crossSourceConsistency: 85,
          },
        }),
        sourcingResult: makeSourcingResult({
          sourcePrice: 20, moq: 30, leadTimeDays: 7,
          estimatedInitialInventoryCost: 600, moqCoverageMonths: 1,
          sourcingScore: 85,
        }),
        hasComplianceData: true,
        hasLogisticsRoutes: true,
        evidence: Array.from({ length: 5 }, (_, i) => makeEvidence({ id: `ev-${i}`, sourceId: `src-${i}` })),
      }),
    );
    expect(result.viabilityLevel).toBe("strong");
    expect(result.viabilityScore).toBeGreaterThanOrEqual(80);
  });

  it("should classify as not_viable for worst-case input", () => {
    const result = calculateProcurementViability(
      makeInput({
        matchScore: 0,
        evaluationResult: makeEvalResult({
          qualityScore: 0,
          evidenceConfidence: 0,
          dimensionScores: {
            identityConfidence: 0, productRelevance: 0, evidenceQuality: 0,
            commercialCompleteness: 0, supplierReliability: 0, priceTransparency: 0,
            moqTransparency: 0, leadTimeTransparency: 0, certificationAvailability: 0,
            contactCompleteness: 0, recency: 0, crossSourceConsistency: 0,
          },
        }),
        sourcingResult: makeSourcingResult({
          sourcePrice: null, moq: null, leadTimeDays: null,
          estimatedInitialInventoryCost: null, moqCoverageMonths: null,
          constraints: [],
        }),
        hasComplianceData: false,
        hasLogisticsRoutes: false,
        evidence: [],
      }),
    );
    expect(result.viabilityLevel).toBe("not_viable");
    expect(result.viabilityScore).toBeLessThan(15);
  });
});
