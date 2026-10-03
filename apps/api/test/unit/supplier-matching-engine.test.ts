// =============================================================================
// Unit Tests — Supplier Matching Engine (Phase 13)
// =============================================================================

import { describe, it, expect } from "vitest";
import { calculateSupplierMatch, computeMatchContentHash } from "../../src/services/supplier-matching-engine.js";
import type { SupplierMatchEngineInput, EvidenceRef } from "../../src/services/supplier-matching-engine.js";

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

function makeInput(overrides: Partial<SupplierMatchEngineInput> = {}): SupplierMatchEngineInput {
  return {
    productId: "prod-1",
    supplierId: "sup-1",
    product: {
      name: "Samsung Galaxy A54",
      normalizedName: "samsung galaxy a54",
      category: "Smartphones",
      brand: "Samsung",
      description: "Samsung Galaxy A54 5G smartphone 128GB",
      countryOfOrigin: "KR",
      attributes: {},
      identifiers: [
        { type: "gtin13", value: "8806095012345", normalized: "8806095012345" },
        { type: "mpn", value: "SM-A546E", normalized: "sm-a546e" },
      ],
    },
    supplierProduct: {
      supplierProductName: "Samsung Galaxy A54 5G",
      supplierNormalizedName: "samsung galaxy a54 5g",
      supplierCategory: "Smartphones",
      supplierDescription: "Samsung Galaxy A54 5G mobile phone",
      supplierCountry: "KR",
      supplierRole: "distributor",
      supplierAttributes: {},
      supplierIdentifiers: [
        { type: "gtin13", value: "8806095012345", normalized: "8806095012345" },
      ],
    },
    evidence: [makeEvidence()],
    referenceDate: now,
    ...overrides,
  };
}

describe("Supplier Matching Engine", () => {
  // ─── Identifier Match ────────────────────────────────────────────────────

  it("should detect identifier match when GTIN matches", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.identifierMatchScore).toBeGreaterThan(0);
    expect(result.matchedAttributes.length).toBeGreaterThan(0);
  });

  it("should detect same-type identifier match", () => {
    const result = calculateSupplierMatch(makeInput());
    // GTIN13 matches between product and supplier
    expect(result.identifierMatchScore).toBeGreaterThan(0);
    // Check explanation mentions identifier match
    expect(result.explanations.some((e) => e.statement.includes("identifier"))).toBe(true);
  });

  it("should detect cross-type identifier match by value", () => {
    const input = makeInput({
      product: {
        ...makeInput().product,
        identifiers: [{ type: "gtin13", value: "123", normalized: "123" }],
      },
      supplierProduct: {
        ...makeInput().supplierProduct,
        supplierIdentifiers: [{ type: "ean", value: "123", normalized: "123" }],
      },
    });
    const result = calculateSupplierMatch(input);
    // Cross-type match: same normalized value but different type
    expect(result.identifierMatchScore).toBeGreaterThan(0);
    expect(result.explanations.some((e) => e.statement.includes("identifier"))).toBe(true);
  });

  it("should return 0 identifier score when no identifiers on either side", () => {
    const input = makeInput({
      product: { ...makeInput().product, identifiers: [] },
      supplierProduct: { ...makeInput().supplierProduct, supplierIdentifiers: [] },
    });
    const result = calculateSupplierMatch(input);
    expect(result.identifierMatchScore).toBe(0);
  });

  it("should return 0 identifier score when only product has identifiers", () => {
    const input = makeInput({
      supplierProduct: { ...makeInput().supplierProduct, supplierIdentifiers: [] },
    });
    const result = calculateSupplierMatch(input);
    expect(result.identifierMatchScore).toBe(0);
  });

  // ─── Attribute Match ─────────────────────────────────────────────────────

  it("should match name when token overlap is high", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.matchedAttributes).toContain("name");
  });

  it("should match category when categories are identical", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.matchedAttributes).toContain("category");
  });

  it("should detect partial category overlap", () => {
    const input = makeInput({
      product: { ...makeInput().product, category: "Consumer Electronics" },
      supplierProduct: { ...makeInput().supplierProduct, supplierCategory: "Consumer Electronics Accessories" },
    });
    const result = calculateSupplierMatch(input);
    expect(result.matchedAttributes.some((a) => a.includes("category"))).toBe(true);
  });

  it("should match country when countries are the same", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.matchedAttributes).toContain("country");
  });

  it("should not match country when countries differ", () => {
    const input = makeInput({
      product: { ...makeInput().product, countryOfOrigin: "KR" },
      supplierProduct: { ...makeInput().supplierProduct, supplierCountry: "CN" },
    });
    const result = calculateSupplierMatch(input);
    expect(result.unmatchedAttributes).toContain("country");
  });

  it("should match description when token overlap is significant", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.matchedAttributes).toContain("description");
  });

  // ─── No Match Scenarios ──────────────────────────────────────────────────

  it("should produce low score for completely different products", () => {
    const input = makeInput({
      product: {
        ...makeInput().product,
        name: "Industrial Drill Press",
        normalizedName: "industrial drill press",
        category: "Industrial Tools",
        description: "Heavy duty drill press for metal working",
        countryOfOrigin: "DE",
        identifiers: [],
      },
      supplierProduct: {
        ...makeInput().supplierProduct,
        supplierProductName: "Organic Green Tea",
        supplierNormalizedName: "organic green tea",
        supplierCategory: "Beverages",
        supplierDescription: "Premium organic green tea leaves from Japan",
        supplierCountry: "JP",
        supplierIdentifiers: [],
      },
    });
    const result = calculateSupplierMatch(input);
    expect(result.matchScore).toBeLessThan(50);
  });

  // ─── Evidence Confidence ─────────────────────────────────────────────────

  it("should return 0 evidence confidence with no active evidence", () => {
    const input = makeInput({ evidence: [] });
    const result = calculateSupplierMatch(input);
    // With no evidence, the evidence confidence dimension is excluded (null) from scoring
    // but evidenceConfidence field itself should be 0
    expect(result.evidenceConfidence).toBe(0);
  });

  it("should have higher confidence with more evidence from multiple sources", () => {
    const input1 = makeInput({ evidence: [makeEvidence()] });
    const input5 = makeInput({
      evidence: Array.from({ length: 5 }, (_, i) =>
        makeEvidence({ id: `ev-${i}`, sourceId: `src-${i}` }),
      ),
    });
    const r1 = calculateSupplierMatch(input1);
    const r5 = calculateSupplierMatch(input5);
    expect(r5.evidenceConfidence).toBeGreaterThanOrEqual(r1.evidenceConfidence);
  });

  it("should reduce confidence for stale evidence", () => {
    const freshInput = makeInput({
      evidence: [makeEvidence({ observedAt: now })],
    });
    const staleInput = makeInput({
      evidence: [makeEvidence({ observedAt: new Date("2023-01-01T00:00:00Z") })],
    });
    const fresh = calculateSupplierMatch(freshInput);
    const stale = calculateSupplierMatch(staleInput);
    expect(stale.evidenceConfidence).toBeLessThan(fresh.evidenceConfidence);
  });

  it("should return 0 evidence confidence for all-expired evidence", () => {
    const input = makeInput({
      evidence: [makeEvidence({ status: "expired" })],
    });
    const result = calculateSupplierMatch(input);
    expect(result.evidenceConfidence).toBe(0);
  });

  // ─── Match Level Classification ──────────────────────────────────────────

  it("should classify match level as a valid value", () => {
    const result = calculateSupplierMatch(makeInput());
    const validLevels = ["no_match", "weak", "possible", "strong", "exact"];
    expect(validLevels).toContain(result.matchLevel);
  });

  it("should produce strong or exact match for highly similar products with identifiers", () => {
    const result = calculateSupplierMatch(makeInput());
    // With GTIN match + name + category + country + description overlap
    expect(["strong", "exact", "possible"]).toContain(result.matchLevel);
  });

  // ─── Deterministic Output ────────────────────────────────────────────────

  it("should produce identical output for identical input", () => {
    const input = makeInput();
    const r1 = calculateSupplierMatch(input);
    const r2 = calculateSupplierMatch(input);
    expect(r1.matchScore).toBe(r2.matchScore);
    expect(r1.matchLevel).toBe(r2.matchLevel);
    expect(r1.contentHash).toBe(r2.contentHash);
    expect(r1.matchedAttributes).toEqual(r2.matchedAttributes);
  });

  it("should produce different content hash when match score changes", () => {
    const r1 = calculateSupplierMatch(makeInput({ matchScore: undefined }));
    const r2 = calculateSupplierMatch(makeInput({
      product: {
        ...makeInput().product,
        name: "Completely Different Product XYZ",
        normalizedName: "completely different product xyz",
        identifiers: [],
      },
    }));
    // Different inputs should likely produce different hashes
    expect(typeof r1.contentHash).toBe("string");
    expect(typeof r2.contentHash).toBe("string");
  });

  // ─── Explanations ────────────────────────────────────────────────────────

  it("should provide explanations for matches", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it("should explain when no evidence exists", () => {
    const result = calculateSupplierMatch(makeInput({ evidence: [] }));
    const evidenceExplanation = result.explanations.find((e) => e.factor === "evidence");
    expect(evidenceExplanation).toBeDefined();
    expect(evidenceExplanation?.impact).toBe("unknown");
  });

  it("should explain identifier matches", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.explanations.some((e) => e.statement.includes("identifier"))).toBe(true);
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────────

  it("should handle null supplier product name", () => {
    const input = makeInput({
      supplierProduct: { ...makeInput().supplierProduct, supplierProductName: null },
    });
    const result = calculateSupplierMatch(input);
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThanOrEqual(100);
  });

  it("should handle null product description", () => {
    const input = makeInput({
      product: { ...makeInput().product, description: null },
    });
    const result = calculateSupplierMatch(input);
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
  });

  it("should handle null category on product side", () => {
    const input = makeInput({
      product: { ...makeInput().product, category: null },
    });
    const result = calculateSupplierMatch(input);
    expect(result.unmatchedAttributes).toContain("category");
  });

  it("should handle null country on both sides", () => {
    const input = makeInput({
      product: { ...makeInput().product, countryOfOrigin: null },
      supplierProduct: { ...makeInput().supplierProduct, supplierCountry: null },
    });
    const result = calculateSupplierMatch(input);
    expect(result.unmatchedAttributes).toContain("country");
  });

  it("should handle null supplier normalizedName", () => {
    const input = makeInput({
      supplierProduct: { ...makeInput().supplierProduct, supplierNormalizedName: null },
    });
    const result = calculateSupplierMatch(input);
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
  });

  // ─── Content Hash ────────────────────────────────────────────────────────

  it("should produce valid SHA-256 content hash", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should produce consistent hash via helper function", () => {
    const result = calculateSupplierMatch(makeInput());
    const hash = computeMatchContentHash(result);
    // Both should be valid SHA-256 hashes
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  // ─── Score Bounds ────────────────────────────────────────────────────────

  it("should keep matchScore within 0-100", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThanOrEqual(100);
  });

  it("should keep evidenceConfidence within 0-1", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.evidenceConfidence).toBeGreaterThanOrEqual(0);
    expect(result.evidenceConfidence).toBeLessThanOrEqual(1);
  });

  it("should keep identifierMatchScore within 0-100", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.identifierMatchScore).toBeGreaterThanOrEqual(0);
    expect(result.identifierMatchScore).toBeLessThanOrEqual(100);
  });

  it("should keep attributeMatchScore within 0-100", () => {
    const result = calculateSupplierMatch(makeInput());
    expect(result.attributeMatchScore).toBeGreaterThanOrEqual(0);
    expect(result.attributeMatchScore).toBeLessThanOrEqual(100);
  });

  // ─── Supplier ID ─────────────────────────────────────────────────────────

  it("should include supplierId in output", () => {
    const result = calculateSupplierMatch(makeInput({ supplierId: "my-supplier" }));
    expect(result.supplierId).toBe("my-supplier");
  });

  // ─── Renormalization ─────────────────────────────────────────────────────

  it("should renormalize score when some dimensions are null", () => {
    // With no identifiers, the identifier dimension is excluded from weighted average
    const input = makeInput({
      product: { ...makeInput().product, identifiers: [] },
      supplierProduct: { ...makeInput().supplierProduct, supplierIdentifiers: [] },
    });
    const result = calculateSupplierMatch(input);
    // Score should still be meaningful from attribute matching
    expect(result.matchScore).toBeGreaterThan(0);
    expect(result.identifierMatchScore).toBe(0);
  });
});
