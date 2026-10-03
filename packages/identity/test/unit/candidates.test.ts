// =============================================================================
// Tests — Candidate generation (blocking/indexing)
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  generateBlockingKeys,
  generateCandidates,
  generateCandidatesForProduct,
} from "../../src/candidates.js";
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

describe("generateBlockingKeys", () => {
  it("should generate at least one key for a product", () => {
    const product = makeProduct({
      id: "p1",
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandName: "CeraVe",
      brandNormalizedName: "cerave",
    });
    const keys = generateBlockingKeys(product);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("should generate identifier-based keys for valid GTINs", () => {
    const product = makeProduct({
      id: "p1",
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      identifiers: [
        { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
      ],
    });
    const keys = generateBlockingKeys(product);
    const idKey = keys.find((k) => k.startsWith("id:"));
    expect(idKey).toBe("id:gtin13:3606000423981");
  });

  it("should skip invalid identifiers", () => {
    const product = makeProduct({
      id: "p1",
      name: "Some Product",
      identifiers: [
        { type: "gtin13", value: "123", normalized: "123", isValid: false },
      ],
    });
    const keys = generateBlockingKeys(product);
    const idKey = keys.find((k) => k.startsWith("id:"));
    expect(idKey).toBeUndefined();
  });

  it("should generate brand+quantity key when brand and quantity exist", () => {
    const product = makeProduct({
      id: "p1",
      name: "CeraVe Hydrating Cleanser 236ml",
      brandName: "CeraVe",
      brandNormalizedName: "cerave",
    });
    const keys = generateBlockingKeys(product);
    const bqKey = keys.find((k) => k.startsWith("bq:"));
    expect(bqKey).toBeTruthy();
  });

  it("should generate brand-only blocking key", () => {
    const product = makeProduct({
      id: "p1",
      name: "CeraVe Hydrating Cleanser",
      brandName: "CeraVe",
      brandNormalizedName: "cerave",
    });
    const keys = generateBlockingKeys(product);
    const brandKey = keys.find((k) => k.startsWith("brand:"));
    expect(brandKey).toBeTruthy();
  });

  it("should deduplicate keys", () => {
    const product = makeProduct({
      id: "p1",
      name: "CeraVe Cleanser 236ml",
      brandName: "CeraVe",
      brandNormalizedName: "cerave",
      identifiers: [
        { type: "gtin13", value: "111", normalized: "111", isValid: true },
        { type: "gtin13", value: "111", normalized: "111", isValid: true },
      ],
    });
    const keys = generateBlockingKeys(product);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});

describe("generateCandidates", () => {
  it("should generate candidate pairs for products sharing a brand", () => {
    const products = [
      makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser 236ml",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
      }),
      makeProduct({
        id: "p2",
        name: "CeraVe Foaming Cleanser 236ml",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
      }),
    ];
    const candidates = generateCandidates(products);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.fromProductId).toBeTruthy();
    expect(candidates[0]!.toProductId).toBeTruthy();
  });

  it("should not generate pairs for completely unrelated products", () => {
    const products = [
      makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser 236ml",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
      }),
      makeProduct({
        id: "p2",
        name: "NIVEA Soft Light Moisturiser 100ml",
        brandName: "NIVEA",
        brandNormalizedName: "nivea",
      }),
    ];
    // With brand blocking disabled, unrelated brands should not match
    const candidates = generateCandidates(products, { includeBrandBlocking: false });
    // No identifier or bq overlap → no candidates
    expect(candidates.length).toBe(0);
  });

  it("should generate candidates for products sharing a GTIN", () => {
    const products = [
      makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser 236ml",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      }),
      makeProduct({
        id: "p2",
        name: "CeraVe Hydrating Facial Cleanser 236ml",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      }),
    ];
    const candidates = generateCandidates(products);
    expect(candidates.length).toBeGreaterThan(0);
    // Identifier-based candidates should have highest priority
    expect(candidates[0]!.generationMethod).toBe("identifier");
  });

  it("should not create duplicate pairs", () => {
    const products = [
      makeProduct({ id: "p1", name: "CeraVe Cleanser 236ml", brandName: "CeraVe", brandNormalizedName: "cerave" }),
      makeProduct({ id: "p2", name: "CeraVe Foaming Cleanser 236ml", brandName: "CeraVe", brandNormalizedName: "cerave" }),
      makeProduct({ id: "p3", name: "CeraVe Moisturizer 100ml", brandName: "CeraVe", brandNormalizedName: "cerave" }),
    ];
    const candidates = generateCandidates(products);
    const pairKeys = new Set(candidates.map((c) => `${c.fromProductId}:${c.toProductId}`));
    expect(pairKeys.size).toBe(candidates.length);
  });

  it("should handle empty product list", () => {
    const candidates = generateCandidates([]);
    expect(candidates).toEqual([]);
  });

  it("should handle single product", () => {
    const products = [
      makeProduct({ id: "p1", name: "CeraVe Cleanser 236ml", brandName: "CeraVe", brandNormalizedName: "cerave" }),
    ];
    const candidates = generateCandidates(products);
    expect(candidates).toEqual([]);
  });

  it("should sort by priority (higher first)", () => {
    const products = [
      makeProduct({
        id: "p1",
        name: "Product A 100ml",
        brandName: "Brand",
        brandNormalizedName: "brand",
        identifiers: [{ type: "gtin13", value: "111", normalized: "111", isValid: true }],
      }),
      makeProduct({
        id: "p2",
        name: "Product A 100ml",
        brandName: "Brand",
        brandNormalizedName: "brand",
        identifiers: [{ type: "gtin13", value: "111", normalized: "111", isValid: true }],
      }),
      makeProduct({
        id: "p3",
        name: "Product B 200ml",
        brandName: "Brand",
        brandNormalizedName: "brand",
      }),
    ];
    const candidates = generateCandidates(products);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i]!.priority).toBeLessThanOrEqual(candidates[i - 1]!.priority);
    }
  });
});

describe("generateCandidatesForProduct", () => {
  it("should find candidates for a new product among existing ones", () => {
    const newProduct = makeProduct({
      id: "new1",
      name: "CeraVe Hydrating Cleanser 473ml",
      brandName: "CeraVe",
      brandNormalizedName: "cerave",
    });
    const existing = [
      makeProduct({
        id: "ex1",
        name: "CeraVe Hydrating Cleanser 236ml",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
      }),
      makeProduct({
        id: "ex2",
        name: "NIVEA Soft Moisturiser 100ml",
        brandName: "NIVEA",
        brandNormalizedName: "nivea",
      }),
    ];
    const candidates = generateCandidatesForProduct(newProduct, existing);
    // Should find CeraVe product as candidate, not NIVEA
    expect(candidates.length).toBeGreaterThan(0);
    const candidateIds = candidates.map((c) =>
      c.fromProductId === "new1" ? c.toProductId : c.fromProductId
    );
    expect(candidateIds).toContain("ex1");
  });

  it("should exclude products from different tenants", () => {
    const newProduct = makeProduct({
      id: "new1",
      tenantId: "tenant1",
      name: "CeraVe Cleanser 236ml",
      brandName: "CeraVe",
      brandNormalizedName: "cerave",
    });
    const existing = [
      makeProduct({
        id: "ex1",
        tenantId: "tenant2", // Different tenant
        name: "CeraVe Cleanser 473ml",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
      }),
    ];
    const candidates = generateCandidatesForProduct(newProduct, existing);
    expect(candidates.length).toBe(0);
  });

  it("should not match product with itself", () => {
    const product = makeProduct({
      id: "p1",
      name: "CeraVe Cleanser 236ml",
      brandName: "CeraVe",
      brandNormalizedName: "cerave",
    });
    const candidates = generateCandidatesForProduct(product, [product]);
    expect(candidates.length).toBe(0);
  });

  it("should respect maxCandidates limit", () => {
    const newProduct = makeProduct({
      id: "new1",
      name: "CeraVe Cleanser",
      brandName: "CeraVe",
      brandNormalizedName: "cerave",
    });
    const existing = Array.from({ length: 30 }, (_, i) =>
      makeProduct({
        id: `ex${i}`,
        name: `CeraVe Product ${i} 100ml`,
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
      })
    );
    const candidates = generateCandidatesForProduct(newProduct, existing, 5);
    expect(candidates.length).toBeLessThanOrEqual(5);
  });
});
