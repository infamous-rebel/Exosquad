// =============================================================================
// Unit Tests — Supplier Evaluation Engine (Phase 13)
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  calculateSupplierEvaluation,
  type SupplierEvaluationEngineInput,
  type SupplierDataInput,
  type CommercialDataInput,
} from "../../src/services/supplier-evaluation-engine.js";
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

function makeSupplier(overrides: Partial<SupplierDataInput> = {}): SupplierDataInput {
  return {
    supplierId: "sup-1",
    name: "Shenzhen Electronics Co.",
    normalizedName: "shenzhen electronics co",
    country: "CN",
    supplierRole: "manufacturer",
    identityStatus: "resolved",
    url: "https://shenzhen-example.com",
    domain: "shenzhen-example.com",
    email: "sales@shenzhen-example.com",
    phone: "+86-755-12345678",
    contactPerson: "Li Wei",
    attributes: {},
    createdAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeCommercial(overrides: Partial<CommercialDataInput> = {}): CommercialDataInput {
  return {
    hasPrice: true,
    hasMoq: true,
    hasLeadTime: true,
    hasPaymentTerms: true,
    hasQuantityBreaks: false,
    hasCertifications: false,
    hasPackaging: false,
    hasExportInfo: false,
    ...overrides,
  };
}

function makeInput(overrides: Partial<SupplierEvaluationEngineInput> = {}): SupplierEvaluationEngineInput {
  return {
    supplierId: "sup-1",
    supplier: makeSupplier(),
    commercialData: makeCommercial(),
    matchLevel: "strong",
    matchScore: 75,
    evidence: [makeEvidence()],
    contactCount: 2,
    referenceDate: now,
    ...overrides,
  };
}

describe("Supplier Evaluation Engine", () => {
  // ─── Identity Confidence ─────────────────────────────────────────────────

  it("should return high identity confidence for high_confidence status", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ supplier: makeSupplier({ identityStatus: "high_confidence" }) }),
    );
    expect(result.dimensionScores.identityConfidence).toBeGreaterThanOrEqual(90);
  });

  it("should return moderate identity confidence for resolved status", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ supplier: makeSupplier({ identityStatus: "resolved" }) }),
    );
    expect(result.dimensionScores.identityConfidence).toBeGreaterThanOrEqual(70);
    expect(result.dimensionScores.identityConfidence).toBeLessThan(90);
  });

  it("should return low identity confidence for unresolved status", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ supplier: makeSupplier({ identityStatus: "unresolved" }) }),
    );
    expect(result.dimensionScores.identityConfidence).toBeLessThanOrEqual(25);
  });

  it("should return very low identity confidence for conflict status", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ supplier: makeSupplier({ identityStatus: "conflict" }) }),
    );
    expect(result.dimensionScores.identityConfidence).toBeLessThanOrEqual(10);
  });

  // ─── Product Relevance ───────────────────────────────────────────────────

  it("should score product relevance proportional to match score", () => {
    const high = calculateSupplierEvaluation(makeInput({ matchScore: 90 }));
    const low = calculateSupplierEvaluation(makeInput({ matchScore: 30 }));
    expect(high.dimensionScores.productRelevance).toBeGreaterThan(
      low.dimensionScores.productRelevance,
    );
  });

  it("should cap product relevance at 100", () => {
    const result = calculateSupplierEvaluation(makeInput({ matchScore: 100 }));
    expect(result.dimensionScores.productRelevance).toBeLessThanOrEqual(100);
  });

  // ─── Evidence Quality ────────────────────────────────────────────────────

  it("should return 0 evidence quality with no evidence", () => {
    const result = calculateSupplierEvaluation(makeInput({ evidence: [] }));
    expect(result.dimensionScores.evidenceQuality).toBe(0);
  });

  it("should score higher with more evidence from multiple sources", () => {
    const single = calculateSupplierEvaluation(
      makeInput({ evidence: [makeEvidence()] }),
    );
    const multi = calculateSupplierEvaluation(
      makeInput({
        evidence: Array.from({ length: 5 }, (_, i) =>
          makeEvidence({ id: `ev-${i}`, sourceId: `src-${i}`, confidence: 0.8 }),
        ),
      }),
    );
    expect(multi.dimensionScores.evidenceQuality).toBeGreaterThanOrEqual(
      single.dimensionScores.evidenceQuality,
    );
  });

  it("should penalize stale evidence", () => {
    const oldDate = new Date("2023-01-01T00:00:00Z");
    const result = calculateSupplierEvaluation(
      makeInput({ evidence: [makeEvidence({ observedAt: oldDate })] }),
    );
    expect(result.dimensionScores.evidenceQuality).toBeLessThan(50);
  });

  it("should ignore inactive evidence", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ evidence: [makeEvidence({ status: "expired" })] }),
    );
    expect(result.dimensionScores.evidenceQuality).toBe(0);
  });

  // ─── Commercial Completeness ─────────────────────────────────────────────

  it("should score 100% with all commercial fields present", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        commercialData: makeCommercial({
          hasPrice: true, hasMoq: true, hasLeadTime: true,
          hasPaymentTerms: true, hasQuantityBreaks: true,
          hasCertifications: true, hasPackaging: true, hasExportInfo: true,
        }),
      }),
    );
    expect(result.dimensionScores.commercialCompleteness).toBe(100);
  });

  it("should score 0% with no commercial fields", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        commercialData: makeCommercial({
          hasPrice: false, hasMoq: false, hasLeadTime: false,
          hasPaymentTerms: false, hasQuantityBreaks: false,
          hasCertifications: false, hasPackaging: false, hasExportInfo: false,
        }),
      }),
    );
    expect(result.dimensionScores.commercialCompleteness).toBe(0);
  });

  it("should score proportionally to known fields", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        commercialData: makeCommercial({
          hasPrice: true, hasMoq: true, hasLeadTime: false,
          hasPaymentTerms: false, hasQuantityBreaks: false,
          hasCertifications: false, hasPackaging: false, hasExportInfo: false,
        }),
      }),
    );
    expect(result.dimensionScores.commercialCompleteness).toBe(25); // 2/8
  });

  // ─── Supplier Reliability ────────────────────────────────────────────────

  it("should score higher for high_confidence identity with full details", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        supplier: makeSupplier({
          identityStatus: "high_confidence",
          domain: "example.com",
          url: "https://example.com",
          supplierRole: "manufacturer",
          country: "CN",
        }),
      }),
    );
    expect(result.dimensionScores.supplierReliability).toBeGreaterThanOrEqual(80);
  });

  it("should score low for unresolved identity with no details", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        supplier: makeSupplier({
          identityStatus: "unresolved",
          domain: null, url: null, supplierRole: null, country: null,
        }),
      }),
    );
    expect(result.dimensionScores.supplierReliability).toBeLessThanOrEqual(35);
  });

  // ─── Price / MOQ / Lead Time Transparency ────────────────────────────────

  it("should score 100 for price transparency when price + quantity breaks exist", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasPrice: true, hasQuantityBreaks: true }) }),
    );
    expect(result.dimensionScores.priceTransparency).toBe(100);
  });

  it("should score 70 for price transparency with price but no breaks", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasPrice: true, hasQuantityBreaks: false }) }),
    );
    expect(result.dimensionScores.priceTransparency).toBe(70);
  });

  it("should score 0 for price transparency with no price", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasPrice: false }) }),
    );
    expect(result.dimensionScores.priceTransparency).toBe(0);
  });

  it("should score 100 for MOQ transparency when MOQ is known", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasMoq: true }) }),
    );
    expect(result.dimensionScores.moqTransparency).toBe(100);
  });

  it("should score 0 for MOQ transparency when MOQ is unknown", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasMoq: false }) }),
    );
    expect(result.dimensionScores.moqTransparency).toBe(0);
  });

  it("should score lead time transparency correctly", () => {
    const withLt = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasLeadTime: true }) }),
    );
    const withoutLt = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasLeadTime: false }) }),
    );
    expect(withLt.dimensionScores.leadTimeTransparency).toBe(100);
    expect(withoutLt.dimensionScores.leadTimeTransparency).toBe(0);
  });

  // ─── Contact Completeness ────────────────────────────────────────────────

  it("should score high contact completeness with all contact info", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        supplier: makeSupplier({
          email: "a@b.com", phone: "+123", url: "https://x.com",
          domain: "x.com", contactPerson: "John",
        }),
        contactCount: 5,
      }),
    );
    expect(result.dimensionScores.contactCompleteness).toBeGreaterThanOrEqual(90);
  });

  it("should score 0 contact completeness with no contact info", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        supplier: makeSupplier({
          email: null, phone: null, url: null, domain: null, contactPerson: null,
        }),
        contactCount: 0,
      }),
    );
    expect(result.dimensionScores.contactCompleteness).toBe(0);
  });

  // ─── Recency ─────────────────────────────────────────────────────────────

  it("should score high recency for fresh evidence", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ evidence: [makeEvidence({ observedAt: now })] }),
    );
    expect(result.dimensionScores.recency).toBeGreaterThanOrEqual(70);
  });

  it("should score 0 recency with no evidence", () => {
    const result = calculateSupplierEvaluation(makeInput({ evidence: [] }));
    expect(result.dimensionScores.recency).toBe(0);
  });

  // ─── Cross-Source Consistency ────────────────────────────────────────────

  it("should score higher consistency with consistent multi-source evidence", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        evidence: [
          makeEvidence({ id: "ev-1", sourceId: "src-1", confidence: 0.8 }),
          makeEvidence({ id: "ev-2", sourceId: "src-2", confidence: 0.8 }),
          makeEvidence({ id: "ev-3", sourceId: "src-3", confidence: 0.75 }),
        ],
      }),
    );
    expect(result.dimensionScores.crossSourceConsistency).toBeGreaterThanOrEqual(70);
  });

  it("should return 0 consistency with no evidence", () => {
    const result = calculateSupplierEvaluation(makeInput({ evidence: [] }));
    expect(result.dimensionScores.crossSourceConsistency).toBe(0);
  });

  it("should return moderate consistency for single evidence", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ evidence: [makeEvidence()] }),
    );
    expect(result.dimensionScores.crossSourceConsistency).toBe(50);
  });

  // ─── Quality Level Classification ────────────────────────────────────────

  it("should classify quality level correctly", () => {
    const result = calculateSupplierEvaluation(makeInput());
    const validLevels = ["very_low", "low", "moderate", "high", "very_high"];
    expect(validLevels).toContain(result.qualityLevel);
  });

  it("should produce very_high quality for ideal input", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        supplier: makeSupplier({ identityStatus: "high_confidence" }),
        commercialData: makeCommercial({
          hasPrice: true, hasMoq: true, hasLeadTime: true,
          hasPaymentTerms: true, hasQuantityBreaks: true,
          hasCertifications: true, hasPackaging: true, hasExportInfo: true,
        }),
        matchScore: 95,
        evidence: Array.from({ length: 5 }, (_, i) =>
          makeEvidence({ id: `ev-${i}`, sourceId: `src-${i}`, confidence: 0.9 }),
        ),
        contactCount: 5,
      }),
    );
    expect(result.qualityLevel).toBe("very_high");
    expect(result.qualityScore).toBeGreaterThanOrEqual(80);
  });

  // ─── Deterministic Output ────────────────────────────────────────────────

  it("should produce identical output for identical input", () => {
    const input = makeInput();
    const r1 = calculateSupplierEvaluation(input);
    const r2 = calculateSupplierEvaluation(input);
    expect(r1.qualityScore).toBe(r2.qualityScore);
    expect(r1.qualityLevel).toBe(r2.qualityLevel);
    expect(r1.contentHash).toBe(r2.contentHash);
  });

  // ─── Constraints Detection ───────────────────────────────────────────────

  it("should detect constraint when price is missing", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasPrice: false }) }),
    );
    expect(result.constraints.some((c) => c.dimension === "priceTransparency")).toBe(true);
  });

  it("should detect constraint when MOQ is missing", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ commercialData: makeCommercial({ hasMoq: false }) }),
    );
    expect(result.constraints.some((c) => c.dimension === "moqTransparency")).toBe(true);
  });

  it("should detect critical constraint when no evidence", () => {
    const result = calculateSupplierEvaluation(makeInput({ evidence: [] }));
    const evidenceConstraint = result.constraints.find((c) => c.dimension === "evidenceQuality");
    expect(evidenceConstraint).toBeDefined();
    expect(evidenceConstraint?.severity).toBe("critical");
  });

  it("should detect constraint when identity is uncertain", () => {
    const result = calculateSupplierEvaluation(
      makeInput({ supplier: makeSupplier({ identityStatus: "conflict" }) }),
    );
    expect(result.constraints.some((c) => c.dimension === "identityConfidence")).toBe(true);
  });

  // ─── Strengths Detection ─────────────────────────────────────────────────

  it("should detect strengths for high-scoring dimensions", () => {
    const result = calculateSupplierEvaluation(
      makeInput({
        supplier: makeSupplier({ identityStatus: "high_confidence" }),
        matchScore: 90,
      }),
    );
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.strengths.some((s) => s.dimension === "identityConfidence")).toBe(true);
  });

  // ─── Explanations ────────────────────────────────────────────────────────

  it("should provide explanations", () => {
    const result = calculateSupplierEvaluation(makeInput());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  // ─── Score Bounds ────────────────────────────────────────────────────────

  it("should keep qualityScore within 0-100", () => {
    const result = calculateSupplierEvaluation(makeInput());
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(100);
  });

  it("should keep identityConfidence within 0-1", () => {
    const result = calculateSupplierEvaluation(makeInput());
    expect(result.identityConfidence).toBeGreaterThanOrEqual(0);
    expect(result.identityConfidence).toBeLessThanOrEqual(1);
  });

  it("should keep evidenceConfidence within 0-1", () => {
    const result = calculateSupplierEvaluation(makeInput());
    expect(result.evidenceConfidence).toBeGreaterThanOrEqual(0);
    expect(result.evidenceConfidence).toBeLessThanOrEqual(1);
  });

  it("should keep commercialCompleteness within 0-1", () => {
    const result = calculateSupplierEvaluation(makeInput());
    expect(result.commercialCompleteness).toBeGreaterThanOrEqual(0);
    expect(result.commercialCompleteness).toBeLessThanOrEqual(1);
  });

  it("should keep all dimension scores within 0-100", () => {
    const result = calculateSupplierEvaluation(makeInput());
    for (const [, score] of Object.entries(result.dimensionScores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  // ─── Content Hash ────────────────────────────────────────────────────────

  it("should produce valid SHA-256 content hash", () => {
    const result = calculateSupplierEvaluation(makeInput());
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should produce different hash for different inputs", () => {
    const r1 = calculateSupplierEvaluation(makeInput({ supplierId: "sup-1" }));
    const r2 = calculateSupplierEvaluation(makeInput({ supplierId: "sup-2" }));
    expect(r1.contentHash).not.toBe(r2.contentHash);
  });
});
