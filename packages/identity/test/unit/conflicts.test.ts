// =============================================================================
// Tests — Conflict detection
// =============================================================================

import { describe, it, expect } from "vitest";
import { detectConflicts } from "../../src/conflicts.js";
import type { ProductIdentityInput } from "../../src/types.js";

function makeProduct(overrides: Partial<ProductIdentityInput> & { id: string; name: string }): ProductIdentityInput {
  return {
    tenantId: overrides.tenantId ?? "tenant1",
    normalizedName: overrides.normalizedName ?? overrides.name.toLowerCase(),
    brandId: overrides.brandId ?? null,
    brandName: overrides.brandName ?? null,
    brandNormalizedName: overrides.brandNormalizedName ?? null,
    brandSearchKey: overrides.brandSearchKey ?? null,
    countryOfOrigin: overrides.countryOfOrigin ?? null,
    identifiers: overrides.identifiers ?? [],
    variants: overrides.variants ?? [],
    ...overrides,
  };
}

describe("detectConflicts", () => {
  describe("identifier-name conflicts", () => {
    it("should detect same GTIN with radically different names", () => {
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Facial Cleanser 236ml",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "Completely Different Product Motor Oil",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const conflicts = detectConflicts(a, b);
      const identifierConflict = conflicts.find((c) => c.conflictType === "identifier_collision");
      expect(identifierConflict).toBeTruthy();
      expect(identifierConflict!.severity).toBe("high");
    });

    it("should NOT flag same GTIN with similar names", () => {
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Facial Cleanser 236ml",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "CeraVe Hydrating Facial Cleanser 473ml",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const conflicts = detectConflicts(a, b);
      const idNameConflict = conflicts.find(
        (c) => c.conflictType === "identifier_collision" && c.severity === "high"
      );
      // Names are similar enough — no high-severity name conflict
      expect(idNameConflict).toBeUndefined();
    });

    it("should ignore invalid identifiers", () => {
      const a = makeProduct({
        id: "p1",
        name: "Product A",
        identifiers: [
          { type: "gtin13", value: "123", normalized: "123", isValid: false },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "Completely Different",
        identifiers: [
          { type: "gtin13", value: "123", normalized: "123", isValid: false },
        ],
      });
      const conflicts = detectConflicts(a, b);
      expect(conflicts.length).toBe(0);
    });
  });

  describe("identifier-brand conflicts", () => {
    it("should detect same GTIN with different brands", () => {
      const a = makeProduct({
        id: "p1",
        name: "Product A",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "Product B",
        brandName: "NIVEA",
        brandNormalizedName: "nivea",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const conflicts = detectConflicts(a, b);
      const brandConflict = conflicts.find((c) => c.conflictType === "brand_conflict");
      expect(brandConflict).toBeTruthy();
      expect(brandConflict!.severity).toBe("critical");
    });

    it("should NOT flag when brands match", () => {
      const a = makeProduct({
        id: "p1",
        name: "Product A",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "Product B",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const conflicts = detectConflicts(a, b);
      const brandConflict = conflicts.find((c) => c.conflictType === "brand_conflict");
      expect(brandConflict).toBeUndefined();
    });

    it("should not detect brand conflict when brands are missing", () => {
      const a = makeProduct({
        id: "p1",
        name: "Product A",
        identifiers: [
          { type: "gtin13", value: "111", normalized: "111", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "Product B",
        identifiers: [
          { type: "gtin13", value: "111", normalized: "111", isValid: true },
        ],
      });
      const conflicts = detectConflicts(a, b);
      const brandConflict = conflicts.find((c) => c.conflictType === "brand_conflict");
      expect(brandConflict).toBeUndefined();
    });
  });

  describe("duplicate GTIN conflicts", () => {
    it("should detect different GTINs with nearly identical names", () => {
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Facial Cleanser 236ml",
        identifiers: [
          { type: "gtin13", value: "1111111111111", normalized: "1111111111111", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "CeraVe Hydrating Facial Cleanser 236ml",
        identifiers: [
          { type: "gtin13", value: "2222222222222", normalized: "2222222222222", isValid: true },
        ],
      });
      const conflicts = detectConflicts(a, b);
      const dupConflict = conflicts.find(
        (c) => c.conflictType === "identifier_collision" && c.severity === "medium"
      );
      expect(dupConflict).toBeTruthy();
    });

    it("should NOT flag when GTINs differ and names differ", () => {
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser 236ml",
        identifiers: [
          { type: "gtin13", value: "1111111111111", normalized: "1111111111111", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "NIVEA Soft Light Moisturiser 100ml",
        identifiers: [
          { type: "gtin13", value: "2222222222222", normalized: "2222222222222", isValid: true },
        ],
      });
      const conflicts = detectConflicts(a, b);
      const dupConflict = conflicts.find(
        (c) => c.conflictType === "identifier_collision" && c.severity === "medium"
      );
      expect(dupConflict).toBeUndefined();
    });
  });

  describe("variant conflicts", () => {
    it("should detect different formulations with similar names", () => {
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Moisturizing Cream 340g",
        variants: [{
          id: "v1", name: null, normalizedName: null,
          packCount: null, perUnitQuantity: null, perUnitUnit: null,
          totalQuantity: null, quantityUnit: null,
          formulation: "cream", flavor: null, scent: null,
          concentration: null, strength: null, spf: null,
          ageGroup: null, genderTarget: null, color: null,
        }],
      });
      const b = makeProduct({
        id: "p2",
        name: "CeraVe Moisturizing Cream 340g",
        variants: [{
          id: "v2", name: null, normalizedName: null,
          packCount: null, perUnitQuantity: null, perUnitUnit: null,
          totalQuantity: null, quantityUnit: null,
          formulation: "lotion", flavor: null, scent: null,
          concentration: null, strength: null, spf: null,
          ageGroup: null, genderTarget: null, color: null,
        }],
      });
      const conflicts = detectConflicts(a, b);
      const variantConflict = conflicts.find((c) => c.conflictType === "variant_conflict");
      expect(variantConflict).toBeTruthy();
      expect(variantConflict!.severity).toBe("medium");
    });

    it("should NOT flag when formulations match", () => {
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Cream 340g",
        variants: [{
          id: "v1", name: null, normalizedName: null,
          packCount: null, perUnitQuantity: null, perUnitUnit: null,
          totalQuantity: null, quantityUnit: null,
          formulation: "cream", flavor: null, scent: null,
          concentration: null, strength: null, spf: null,
          ageGroup: null, genderTarget: null, color: null,
        }],
      });
      const b = makeProduct({
        id: "p2",
        name: "CeraVe Cream 340g",
        variants: [{
          id: "v2", name: null, normalizedName: null,
          packCount: null, perUnitQuantity: null, perUnitUnit: null,
          totalQuantity: null, quantityUnit: null,
          formulation: "cream", flavor: null, scent: null,
          concentration: null, strength: null, spf: null,
          ageGroup: null, genderTarget: null, color: null,
        }],
      });
      const conflicts = detectConflicts(a, b);
      const variantConflict = conflicts.find((c) => c.conflictType === "variant_conflict");
      expect(variantConflict).toBeUndefined();
    });

    it("should not detect variant conflict when no variants exist", () => {
      const a = makeProduct({ id: "p1", name: "Product A" });
      const b = makeProduct({ id: "p2", name: "Product A" });
      const conflicts = detectConflicts(a, b);
      expect(conflicts.length).toBe(0);
    });
  });

  describe("no conflicts", () => {
    it("should return empty array for completely different products", () => {
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser 236ml",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        identifiers: [
          { type: "gtin13", value: "1111111111111", normalized: "1111111111111", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "NIVEA Soft Light Moisturiser 100ml",
        brandName: "NIVEA",
        brandNormalizedName: "nivea",
        identifiers: [
          { type: "gtin13", value: "2222222222222", normalized: "2222222222222", isValid: true },
        ],
      });
      const conflicts = detectConflicts(a, b);
      // Different GTINs, different brands, different names → no conflicts
      expect(conflicts.length).toBe(0);
    });
  });
});
