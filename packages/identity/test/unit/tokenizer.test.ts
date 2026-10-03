// =============================================================================
// Tests — Tokenizer
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  tokenizeProductName,
  tokenizeFromComponents,
  hasSignificantVariant,
  getBlockingKey,
} from "../../src/tokenizer.js";

describe("tokenizeProductName", () => {
  it("should tokenize a basic product name", () => {
    const token = tokenizeProductName("CeraVe Hydrating Facial Cleanser 236ml");
    expect(token.originalName).toBe("CeraVe Hydrating Facial Cleanser 236ml");
    expect(token.normalizedName).toBeTruthy();
    expect(token.searchKey).toBeTruthy();
    expect(token.brandTokens.length).toBeGreaterThan(0);
    expect(token.productTokens.length).toBeGreaterThan(0);
    expect(token.quantity).toBe(236);
    expect(token.unit).toBe("ml");
  });

  it("should handle empty input", () => {
    const token = tokenizeProductName("");
    expect(token.originalName).toBe("");
    expect(token.normalizedName).toBe("");
    expect(token.brandTokens).toEqual([]);
    expect(token.productTokens).toEqual([]);
    expect(token.quantity).toBeNull();
  });

  it("should handle null/undefined input", () => {
    const token = tokenizeProductName(null as unknown as string);
    expect(token.originalName).toBe("");
    expect(token.allTokens.size).toBe(0);
  });

  it("should detect SPF attribute", () => {
    const token = tokenizeProductName("La Roche-Posay Anthelios SPF 50 Sunscreen 100ml");
    expect(token.attributes.spf).toBe("50");
  });

  it("should detect concentration", () => {
    const token = tokenizeProductName("The Ordinary Niacinamide 10% + Zinc 30ml");
    expect(token.attributes.concentration).toBe("10");
  });

  it("should detect formulation keywords", () => {
    const token = tokenizeProductName("CeraVe Moisturizing Cream 340g");
    expect(token.productTokens).toContain("cream");
  });

  it("should detect pack structure", () => {
    const token = tokenizeProductName("Cetaphil Gentle Skin Cleanser 2 x 236ml");
    expect(token.packCount).toBe(2);
    expect(token.perUnitQuantity).toBe(236);
    expect(token.perUnitUnit).toBe("ml");
  });

  it("should preserve meaningful variant terms", () => {
    const token = tokenizeProductName("CeraVe Hydrating Cleanser for Sensitive Skin 236ml");
    expect(token.allTokens.size).toBeGreaterThan(0);
    // Should have tokens for all meaningful words
    expect(token.allTokens.has("sensitive")).toBe(true);
  });

  it("should handle multilingual names (Unicode)", () => {
    const token = tokenizeProductName("NIVEA Soft Light Moisturiser 100ml");
    expect(token.brandTokens).toContain("nivea");
    expect(token.normalizedName).toBeTruthy();
  });
});

describe("tokenizeFromComponents", () => {
  it("should tokenize from pre-parsed components", () => {
    const token = tokenizeFromComponents({
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandName: "CeraVe",
      quantity: 236,
      unit: "ml",
    });
    expect(token.brandTokens).toContain("cerave");
    expect(token.quantity).toBe(236);
    expect(token.unit).toBe("ml");
  });

  it("should handle missing brand", () => {
    const token = tokenizeFromComponents({
      name: "Gentle Skin Cleanser 236ml",
      quantity: 236,
      unit: "ml",
    });
    expect(token.brandTokens).toEqual([]);
    expect(token.productTokens.length).toBeGreaterThan(0);
  });
});

describe("hasSignificantVariant", () => {
  it("should return true when variant tokens exist", () => {
    const token = tokenizeProductName("CeraVe Hydrating Cleanser Fragrance-Free 236ml");
    expect(hasSignificantVariant(token)).toBe(true);
  });

  it("should return true when attributes detected", () => {
    const token = tokenizeProductName("Sunscreen SPF 50 100ml");
    expect(hasSignificantVariant(token)).toBe(true);
  });

  it("should return false for plain product", () => {
    const token = tokenizeFromComponents({
      name: "Basic Product",
    });
    // No variant tokens, no attributes
    expect(hasSignificantVariant(token)).toBe(false);
  });
});

describe("getBlockingKey", () => {
  it("should generate a blocking key", () => {
    const token = tokenizeProductName("CeraVe Hydrating Facial Cleanser 236ml");
    const key = getBlockingKey(token);
    expect(key).toBeTruthy();
    expect(key.length).toBeGreaterThan(0);
  });

  it("should generate same key for equivalent products", () => {
    const token1 = tokenizeProductName("CeraVe Hydrating Facial Cleanser 236ml");
    const token2 = tokenizeProductName("Cerave Hydrating Facial Cleanser 473ml");
    const key1 = getBlockingKey(token1);
    const key2 = getBlockingKey(token2);
    // Same brand + core product → same blocking key
    expect(key1).toBe(key2);
  });
});
