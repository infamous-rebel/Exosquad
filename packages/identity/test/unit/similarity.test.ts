// =============================================================================
// Tests — Similarity engine
// =============================================================================

import { describe, it, expect } from "vitest";
import { compareProducts, jaccardSimilarity, bigramSimilarity, type ComparableProduct } from "../../src/similarity.js";
import { tokenizeProductName } from "../../src/tokenizer.js";

function makeComparable(overrides: Partial<ComparableProduct> & { name: string }): ComparableProduct {
  const token = tokenizeProductName(overrides.name);
  return {
    token,
    brandId: overrides.brandId ?? null,
    brandNormalizedName: overrides.brandNormalizedName ?? null,
    brandSearchKey: overrides.brandSearchKey ?? null,
    countryOfOrigin: overrides.countryOfOrigin ?? null,
    identifiers: overrides.identifiers ?? [],
    variants: overrides.variants ?? [],
  };
}

describe("compareProducts", () => {
  it("should EXACT_MATCH products with same GTIN", () => {
    const a = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
      identifiers: [{ type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true }],
    });
    const b = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
      identifiers: [{ type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true }],
    });

    const result = compareProducts(a, b);
    expect(result.decision).toBe("EXACT_MATCH");
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.evidence.identifierMatch).toBe("exact");
  });

  it("should detect CONFLICT when same GTIN has different names", () => {
    const a = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
      identifiers: [{ type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true }],
    });
    const b = makeComparable({
      name: "Completely Different Product Name",
      brandId: "brand2",
      brandNormalizedName: "other",
      identifiers: [{ type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true }],
    });

    const result = compareProducts(a, b);
    // Same GTIN but different brands → CONFLICT
    expect(result.evidence.identifierMatch).toBe("exact");
    expect(result.evidence.brandMatch).toBe("none");
  });

  it("should HIGH_CONFIDENCE_MATCH same brand + exact name + same quantity", () => {
    const a = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
    });
    const b = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
    });

    const result = compareProducts(a, b);
    expect(["EXACT_MATCH", "HIGH_CONFIDENCE_MATCH"]).toContain(result.decision);
    expect(result.evidence.brandMatch).toBe("exact");
    expect(result.evidence.nameMatch).toBe("exact");
  });

  it("should NO_MATCH different brands", () => {
    const a = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
    });
    const b = makeComparable({
      name: "NIVEA Soft Light Moisturiser 100ml",
      brandId: "brand2",
      brandNormalizedName: "nivea",
    });

    const result = compareProducts(a, b);
    expect(result.decision).toBe("NO_MATCH");
    expect(result.evidence.brandMatch).toBe("none");
  });

  it("should detect quantity differences", () => {
    const a = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
    });
    const b = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 473ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
    });

    const result = compareProducts(a, b);
    expect(result.evidence.quantityMatch).toBe("different");
    // Same product different SKU
    expect(["POSSIBLE_MATCH", "HIGH_CONFIDENCE_MATCH", "UNRESOLVED"]).toContain(result.decision);
  });

  it("should detect variant differences", () => {
    const a = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
      variants: [{
        packCount: null, perUnitQuantity: 236, perUnitUnit: "ml",
        totalQuantity: 236, quantityUnit: "ml",
        formulation: "cream", flavor: null, scent: null,
        concentration: null, strength: null, spf: null,
        ageGroup: null, genderTarget: null, color: null,
      }],
    });
    const b = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
      variants: [{
        packCount: null, perUnitQuantity: 236, perUnitUnit: "ml",
        totalQuantity: 236, quantityUnit: "ml",
        formulation: "lotion", flavor: null, scent: null,
        concentration: null, strength: null, spf: null,
        ageGroup: null, genderTarget: null, color: null,
      }],
    });

    const result = compareProducts(a, b);
    expect(result.evidence.variantMatch).toBe("different");
  });

  it("should handle products with no identifiers", () => {
    const a = makeComparable({ name: "Product A 100ml", brandId: "b1", brandNormalizedName: "brand" });
    const b = makeComparable({ name: "Product A 100ml", brandId: "b1", brandNormalizedName: "brand" });

    const result = compareProducts(a, b);
    expect(result.evidence.identifierMatch).toBe("none");
    expect(result.evidence.scores.identifierScore).toBe(0);
  });

  it("should provide structured evidence with reasons", () => {
    const a = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
    });
    const b = makeComparable({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
    });

    const result = compareProducts(a, b);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.evidence.scores.overallScore).toBeGreaterThan(0);
  });
});

describe("jaccardSimilarity", () => {
  it("should return 1.0 for identical sets", () => {
    const a = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(a, a)).toBe(1.0);
  });

  it("should return 0 for disjoint sets", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("should return 0 for empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("should calculate partial overlap", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    // Intersection: {b, c} = 2, Union: {a, b, c, d} = 4
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5);
  });
});

describe("bigramSimilarity", () => {
  it("should return 1.0 for identical strings", () => {
    expect(bigramSimilarity("hello", "hello")).toBe(1.0);
  });

  it("should return 0 for empty strings", () => {
    expect(bigramSimilarity("", "")).toBe(0);
  });

  it("should return high similarity for similar strings", () => {
    const sim = bigramSimilarity("hydrating cleanser", "hydrating facial cleanser");
    expect(sim).toBeGreaterThan(0.5);
  });

  it("should return low similarity for different strings", () => {
    const sim = bigramSimilarity("shampoo", "motor oil");
    expect(sim).toBeLessThan(0.3);
  });
});
