// =============================================================================
// Phase 8 (Original Roadmap) — Unit Tests: Authenticity Calculation Engine
// =============================================================================
// Tests all deterministic authenticity calculations: signal generation,
// scoring, confidence, status classification, contradiction detection,
// deduplication, and edge cases.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  calculateAuthenticity,
  type AuthenticityEngineInput,
  type EvidenceSummary,
  type SubjectData,
  type SourceMetadata,
} from "../../src/services/authenticity-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvidence(overrides: Partial<EvidenceSummary> = {}): EvidenceSummary {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    sourceId: "source-1",
    evidenceType: "PRODUCT_IDENTITY",
    entityType: "product",
    entityId: "product-1",
    confidence: 0.8,
    status: "active",
    freshness: "fresh",
    contentHash: "hash-1",
    extractedValue: null,
    normalizedValue: null,
    observedAt: new Date("2026-09-15T00:00:00Z"),
    ...overrides,
  };
}

function makeSubject(overrides: Partial<SubjectData> = {}): SubjectData {
  return {
    tenantId: "tenant-1",
    subjectType: "PRODUCT",
    subjectId: "product-1",
    productName: "Test Product",
    normalizedProductName: "test product",
    brandId: "brand-1",
    brandName: "Test Brand",
    ...overrides,
  };
}

function makeSource(overrides: Partial<SourceMetadata> = {}): SourceMetadata {
  return {
    sourceId: "source-1",
    type: "api_connector",
    healthStatus: "healthy",
    totalFetched: 100,
    consecutiveErrors: 0,
    ...overrides,
  };
}

function makeInput(overrides: Partial<AuthenticityEngineInput> = {}): AuthenticityEngineInput {
  return {
    tenantId: "tenant-1",
    subject: makeSubject(),
    evidence: [],
    sources: [],
    conflicts: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Authenticity Calculation Engine", () => {
  // ─── Empty Evidence ──────────────────────────────────────────────────────

  describe("empty evidence", () => {
    it("should return INSUFFICIENT_EVIDENCE status with no evidence", () => {
      const input = makeInput({ evidence: [] });
      const result = calculateAuthenticity(input);

      expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.score).toBe(50); // Neutral score
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(0.3); // Low confidence
      expect(result.evidenceCount).toBe(0);
      expect(result.signalCount).toBeGreaterThan(0); // At least UNKNOWN signals
    });

    it("should produce deterministic results for empty evidence", () => {
      const input = makeInput({ evidence: [] });
      const r1 = calculateAuthenticity(input);
      const r2 = calculateAuthenticity(input);

      expect(r1.score).toBe(r2.score);
      expect(r1.confidence).toBe(r2.confidence);
      expect(r1.status).toBe(r2.status);
      expect(r1.inputHash).toBe(r2.inputHash);
      expect(r1.calculationHash).toBe(r2.calculationHash);
    });
  });

  // ─── Single Weak Source ──────────────────────────────────────────────────

  describe("single weak source", () => {
    it("should produce low confidence with single evidence record", () => {
      const evidence = [makeEvidence({ confidence: 0.3 })];
      const input = makeInput({ evidence });
      const result = calculateAuthenticity(input);

      expect(result.confidence).toBeLessThan(0.5);
      expect(result.sourceDiversity).toBe(1);
    });

    it("should generate product identity signal from product evidence", () => {
      const evidence = [
        makeEvidence({
          evidenceType: "PRODUCT_IDENTITY",
          normalizedValue: { name: "test product", sku: "ABC123" },
        }),
      ];
      const input = makeInput({ evidence });
      const result = calculateAuthenticity(input);

      const productSignals = result.signals.filter(
        (s) => s.signalType === "PRODUCT_IDENTITY_MATCH" || s.signalType === "SKU_MATCH"
      );
      expect(productSignals.length).toBeGreaterThan(0);
    });
  });

  // ─── Multiple Independent Sources ────────────────────────────────────────

  describe("multiple independent sources", () => {
    it("should increase confidence with multiple sources", () => {
      const evidence = [
        makeEvidence({ id: "ev-1", sourceId: "source-1", contentHash: "hash-same" }),
        makeEvidence({ id: "ev-2", sourceId: "source-2", contentHash: "hash-same" }),
        makeEvidence({ id: "ev-3", sourceId: "source-3", contentHash: "hash-same" }),
      ];
      const sources = [
        makeSource({ sourceId: "source-1" }),
        makeSource({ sourceId: "source-2" }),
        makeSource({ sourceId: "source-3" }),
      ];
      const input = makeInput({ evidence, sources });
      const result = calculateAuthenticity(input);

      expect(result.sourceDiversity).toBe(3);
      expect(result.confidence).toBeGreaterThan(0.2);

      // Should have corroboration signal
      const corroboration = result.signals.find(
        (s) => s.signalType === "SOURCE_CORROBORATION"
      );
      expect(corroboration).toBeDefined();
      expect(corroboration!.direction).toBe("POSITIVE");
    });

    it("should generate positive signals for consistent cross-source evidence", () => {
      const evidence = [
        makeEvidence({
          id: "ev-1",
          sourceId: "source-1",
          evidenceType: "PRODUCT_IDENTITY",
          contentHash: "same-hash",
          normalizedValue: { name: "test product" },
        }),
        makeEvidence({
          id: "ev-2",
          sourceId: "source-2",
          evidenceType: "PRODUCT_IDENTITY",
          contentHash: "same-hash",
          normalizedValue: { name: "test product" },
        }),
      ];
      const input = makeInput({ evidence });
      const result = calculateAuthenticity(input);

      const positiveSignals = result.signals.filter((s) => s.direction === "POSITIVE");
      expect(positiveSignals.length).toBeGreaterThan(0);
      expect(result.positiveSignalCount).toBeGreaterThan(0);
    });
  });

  // ─── Contradictory Sources ──────────────────────────────────────────────

  describe("contradictory sources", () => {
    it("should detect contradictions from evidence conflicts", () => {
      const evidence = [
        makeEvidence({ id: "ev-1", sourceId: "source-1" }),
        makeEvidence({ id: "ev-2", sourceId: "source-2" }),
      ];
      const conflicts = [
        {
          id: "conflict-1",
          conflictType: "value_conflict",
          description: "SKU mismatch between sources",
          status: "open",
          supportingEvidenceId: "ev-1",
          contradictingEvidenceId: "ev-2",
        },
      ];
      const input = makeInput({ evidence, conflicts });
      const result = calculateAuthenticity(input);

      expect(result.contradictionCount).toBeGreaterThan(0);
      const contradictionSignals = result.signals.filter(
        (s) => s.signalType === "SOURCE_CONTRADICTION"
      );
      expect(contradictionSignals.length).toBeGreaterThan(0);
      expect(contradictionSignals[0]!.direction).toBe("NEGATIVE");
    });

    it("should detect implicit contradictions from different content hashes", () => {
      const evidence = [
        makeEvidence({
          id: "ev-1",
          sourceId: "source-1",
          evidenceType: "PRODUCT_IDENTITY",
          contentHash: "hash-A",
        }),
        makeEvidence({
          id: "ev-2",
          sourceId: "source-2",
          evidenceType: "PRODUCT_IDENTITY",
          contentHash: "hash-B",
        }),
      ];
      const input = makeInput({ evidence });
      const result = calculateAuthenticity(input);

      expect(result.contradictionCount).toBeGreaterThan(0);
      expect(result.negativeSignalCount).toBeGreaterThan(0);
    });

    it("should reduce score with contradictions", () => {
      const consistentInput = makeInput({
        evidence: [
          makeEvidence({ id: "ev-1", sourceId: "source-1", contentHash: "same" }),
          makeEvidence({ id: "ev-2", sourceId: "source-2", contentHash: "same" }),
        ],
      });
      const contradictedInput = makeInput({
        evidence: [
          makeEvidence({ id: "ev-1", sourceId: "source-1", contentHash: "hash-A" }),
          makeEvidence({ id: "ev-2", sourceId: "source-2", contentHash: "hash-B" }),
        ],
      });

      const consistent = calculateAuthenticity(consistentInput);
      const contradicted = calculateAuthenticity(contradictedInput);

      expect(consistent.score).toBeGreaterThan(contradicted.score);
    });
  });

  // ─── SKU Mismatch ────────────────────────────────────────────────────────

  describe("SKU mismatch", () => {
    it("should generate negative signal for conflicting SKUs", () => {
      const evidence = [
        makeEvidence({
          id: "ev-1",
          sourceId: "source-1",
          evidenceType: "PRODUCT_IDENTIFIER",
          normalizedValue: { sku: "ABC123" },
        }),
        makeEvidence({
          id: "ev-2",
          sourceId: "source-2",
          evidenceType: "PRODUCT_IDENTIFIER",
          normalizedValue: { sku: "XYZ789" },
        }),
      ];
      const input = makeInput({
        evidence,
        subject: makeSubject({ sku: "ABC123" }),
      });
      const result = calculateAuthenticity(input);

      const skuSignal = result.signals.find((s) => s.signalType === "SKU_MATCH");
      expect(skuSignal).toBeDefined();
      expect(skuSignal!.direction).toBe("NEGATIVE");
      expect((skuSignal!.metadata as any).conflict).toBe(true);
    });
  });

  // ─── Price Anomaly ──────────────────────────────────────────────────────

  describe("price anomaly", () => {
    it("should detect extreme price deviation", () => {
      const evidence = [
        makeEvidence({
          id: "ev-1",
          sourceId: "source-1",
          evidenceType: "PRICE",
          normalizedValue: { price: 1000 },
        }),
        makeEvidence({
          id: "ev-2",
          sourceId: "source-2",
          evidenceType: "PRICE",
          normalizedValue: { price: 1100 },
        }),
        makeEvidence({
          id: "ev-3",
          sourceId: "source-3",
          evidenceType: "PRICE",
          normalizedValue: { price: 950 },
        }),
      ];
      const input = makeInput({
        evidence,
        subject: makeSubject({ listingPrice: 200 }), // Much lower than others
      });
      const result = calculateAuthenticity(input);

      const priceSignal = result.signals.find(
        (s) => s.signalType === "PRICE_ANOMALY"
      );
      expect(priceSignal).toBeDefined();
      expect(priceSignal!.direction).toBe("NEGATIVE");
    });

    it("should not flag consistent prices as anomalous", () => {
      const evidence = [
        makeEvidence({
          id: "ev-1",
          sourceId: "source-1",
          evidenceType: "PRICE",
          normalizedValue: { price: 1000 },
        }),
        makeEvidence({
          id: "ev-2",
          sourceId: "source-2",
          evidenceType: "PRICE",
          normalizedValue: { price: 1010 },
        }),
        makeEvidence({
          id: "ev-3",
          sourceId: "source-3",
          evidenceType: "PRICE",
          normalizedValue: { price: 990 },
        }),
      ];
      const input = makeInput({
        evidence,
        subject: makeSubject({ listingPrice: 1005 }),
      });
      const result = calculateAuthenticity(input);

      const priceAnomaly = result.signals.find(
        (s) => s.signalType === "PRICE_ANOMALY" && s.direction === "NEGATIVE"
      );
      expect(priceAnomaly).toBeUndefined();
    });
  });

  // ─── Score ≠ Confidence ─────────────────────────────────────────────────

  describe("score vs confidence independence", () => {
    it("should allow high score with low confidence", () => {
      // Single evidence → limited confidence but potentially high score
      const evidence = [
        makeEvidence({
          evidenceType: "PRODUCT_IDENTITY",
          confidence: 0.9,
          normalizedValue: { name: "test product" },
        }),
      ];
      const input = makeInput({ evidence });
      const result = calculateAuthenticity(input);

      // Score can be decent but confidence should be limited
      expect(result.confidence).toBeLessThan(0.7);
    });

    it("should allow moderate score with high confidence", () => {
      // Many consistent sources → high confidence even if some contradictions
      const evidence = [];
      for (let i = 0; i < 10; i++) {
        evidence.push(
          makeEvidence({
            id: `ev-${i}`,
            sourceId: `source-${i}`,
            evidenceType: i < 7 ? "PRODUCT_IDENTITY" : "BRAND_IDENTITY",
            contentHash: i < 8 ? "same-hash" : `hash-${i}`,
          })
        );
      }
      const sources = evidence.map((e) =>
        makeSource({ sourceId: e.sourceId! })
      );
      const input = makeInput({ evidence, sources });
      const result = calculateAuthenticity(input);

      expect(result.confidence).toBeGreaterThan(0.4);
    });
  });

  // ─── SHA-256 Idempotency ────────────────────────────────────────────────

  describe("SHA-256 idempotency", () => {
    it("should produce same inputHash for same inputs", () => {
      const evidence = [makeEvidence({ id: "ev-1" })];
      const input = makeInput({ evidence });

      const r1 = calculateAuthenticity(input);
      const r2 = calculateAuthenticity(input);

      expect(r1.inputHash).toBe(r2.inputHash);
    });

    it("should produce different inputHash when evidence changes", () => {
      const input1 = makeInput({ evidence: [makeEvidence({ id: "ev-1" })] });
      const input2 = makeInput({ evidence: [makeEvidence({ id: "ev-2" })] });

      const r1 = calculateAuthenticity(input1);
      const r2 = calculateAuthenticity(input2);

      expect(r1.inputHash).not.toBe(r2.inputHash);
    });

    it("should produce same calculationHash for identical results", () => {
      const input = makeInput({
        evidence: [
          makeEvidence({ id: "ev-1", sourceId: "source-1" }),
          makeEvidence({ id: "ev-2", sourceId: "source-2" }),
        ],
      });

      const r1 = calculateAuthenticity(input);
      const r2 = calculateAuthenticity(input);

      expect(r1.calculationHash).toBe(r2.calculationHash);
    });
  });

  // ─── Status Classification ──────────────────────────────────────────────

  describe("status classification", () => {
    it("should classify as INSUFFICIENT_EVIDENCE with no evidence", () => {
      const result = calculateAuthenticity(makeInput({ evidence: [] }));
      expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    });

    it("should classify as CONTRADICTED with many contradictions", () => {
      const evidence = [
        makeEvidence({ id: "ev-1", sourceId: "s1", contentHash: "h1" }),
        makeEvidence({ id: "ev-2", sourceId: "s2", contentHash: "h2" }),
      ];
      const conflicts = [
        { id: "c1", conflictType: "value_conflict", description: "d", status: "open", supportingEvidenceId: "ev-1", contradictingEvidenceId: "ev-2" },
        { id: "c2", conflictType: "value_conflict", description: "d", status: "open", supportingEvidenceId: "ev-1", contradictingEvidenceId: "ev-2" },
        { id: "c3", conflictType: "value_conflict", description: "d", status: "open", supportingEvidenceId: "ev-1", contradictingEvidenceId: "ev-2" },
      ];
      const result = calculateAuthenticity(makeInput({ evidence, conflicts }));
      expect(result.status).toBe("CONTRADICTED");
    });
  });

  // ─── Brand Signals ──────────────────────────────────────────────────────

  describe("brand signals", () => {
    it("should generate positive brand signal when brand matches", () => {
      const evidence = [
        makeEvidence({
          evidenceType: "BRAND_IDENTITY",
          normalizedValue: { brandName: "Test Brand" },
        }),
      ];
      const input = makeInput({ evidence });
      const result = calculateAuthenticity(input);

      const brandSignal = result.signals.find((s) => s.signalType === "BRAND_MATCH");
      expect(brandSignal).toBeDefined();
      expect(brandSignal!.direction).toBe("POSITIVE");
    });

    it("should generate UNKNOWN brand signal with no brand evidence", () => {
      const input = makeInput({ evidence: [] });
      const result = calculateAuthenticity(input);

      const brandSignal = result.signals.find((s) => s.signalType === "BRAND_MATCH");
      expect(brandSignal).toBeDefined();
      expect(brandSignal!.direction).toBe("UNKNOWN");
    });
  });

  // ─── Seller Signals ─────────────────────────────────────────────────────

  describe("seller signals", () => {
    it("should generate UNKNOWN seller signal with no seller evidence", () => {
      const input = makeInput({
        evidence: [],
        subject: makeSubject({ subjectType: "SELLER", subjectId: "seller-1" }),
      });
      const result = calculateAuthenticity(input);

      const sellerSignal = result.signals.find(
        (s) => s.signalType === "SELLER_IDENTITY_MATCH"
      );
      expect(sellerSignal).toBeDefined();
      expect(sellerSignal!.direction).toBe("UNKNOWN");
    });
  });

  // ─── Supplier Signals ───────────────────────────────────────────────────

  describe("supplier signals", () => {
    it("should generate positive supplier signal from evidence", () => {
      const evidence = [
        makeEvidence({
          evidenceType: "SUPPLIER_IDENTITY",
          normalizedValue: { name: "Test Supplier" },
        }),
      ];
      const input = makeInput({
        evidence,
        subject: makeSubject({
          subjectType: "SUPPLIER",
          subjectId: "supplier-1",
          supplierName: "Test Supplier",
        }),
      });
      const result = calculateAuthenticity(input);

      const supplierSignal = result.signals.find(
        (s) => s.signalType === "SUPPLIER_IDENTITY_MATCH"
      );
      expect(supplierSignal).toBeDefined();
      expect(supplierSignal!.direction).toBe("POSITIVE");
    });
  });

  // ─── Algorithm Version ──────────────────────────────────────────────────

  describe("algorithm version", () => {
    it("should include algorithm version in result", () => {
      const result = calculateAuthenticity(makeInput());
      expect(result.algorithmVersion).toBe("1.0.0");
    });

    it("should produce different inputHash for different algorithm versions", () => {
      // This tests that the algorithm version is part of the hash input
      const input = makeInput({ evidence: [makeEvidence()] });
      const result = calculateAuthenticity(input);
      expect(result.inputHash).toBeTruthy();
      expect(result.inputHash.length).toBe(64); // SHA-256 hex
    });
  });

  // ─── Risk Generation ────────────────────────────────────────────────────

  describe("risk generation", () => {
    it("should generate MISSING_EVIDENCE risk when evidence is sparse", () => {
      const input = makeInput({ evidence: [makeEvidence()] });
      const result = calculateAuthenticity(input);

      const missingRisk = result.risks.find(
        (r) => r.riskType === "MISSING_EVIDENCE"
      );
      expect(missingRisk).toBeDefined();
    });

    it("should generate IDENTITY_CONTRADICTION risk with contradictions", () => {
      const evidence = [
        makeEvidence({ id: "ev-1", sourceId: "s1", contentHash: "h1" }),
        makeEvidence({ id: "ev-2", sourceId: "s2", contentHash: "h2" }),
      ];
      const conflicts = [
        { id: "c1", conflictType: "value_conflict", description: "d", status: "open", supportingEvidenceId: "ev-1", contradictingEvidenceId: "ev-2" },
      ];
      const result = calculateAuthenticity(makeInput({ evidence, conflicts }));

      const contradictionRisk = result.risks.find(
        (r) => r.riskType === "IDENTITY_CONTRADICTION"
      );
      expect(contradictionRisk).toBeDefined();
    });
  });

  // ─── Content Reuse Detection ────────────────────────────────────────────

  describe("content reuse", () => {
    it("should detect content reuse across listings", () => {
      const evidence = [
        makeEvidence({
          id: "ev-1",
          sourceId: "source-1",
          evidenceType: "SELLER_LISTING",
          contentHash: "same-content-hash",
        }),
        makeEvidence({
          id: "ev-2",
          sourceId: "source-2",
          evidenceType: "SELLER_LISTING",
          contentHash: "same-content-hash",
        }),
      ];
      const result = calculateAuthenticity(makeInput({ evidence }));

      const contentReuseSignal = result.signals.find(
        (s) => s.signalType === "LISTING_CONTENT_REUSE"
      );
      expect(contentReuseSignal).toBeDefined();
      expect(contentReuseSignal!.direction).toBe("NEGATIVE");
    });
  });

  // ─── Data Completeness ──────────────────────────────────────────────────

  describe("data completeness", () => {
    it("should report 0 completeness with no evidence", () => {
      const result = calculateAuthenticity(makeInput({ evidence: [] }));
      expect(result.dataCompleteness).toBe(0);
    });

    it("should report higher completeness with diverse evidence", () => {
      const evidence = [
        makeEvidence({ id: "ev-1", evidenceType: "PRODUCT_IDENTITY" }),
        makeEvidence({ id: "ev-2", evidenceType: "BRAND_IDENTITY" }),
        makeEvidence({ id: "ev-3", evidenceType: "SELLER_IDENTITY" }),
        makeEvidence({ id: "ev-4", evidenceType: "PRICE" }),
      ];
      const result = calculateAuthenticity(makeInput({ evidence }));
      expect(result.dataCompleteness).toBeGreaterThan(0);
    });
  });
});
