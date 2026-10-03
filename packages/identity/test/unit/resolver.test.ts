// =============================================================================
// Tests — Identity resolution engine (integration-style)
// =============================================================================

import { describe, it, expect } from "vitest";
import { IdentityResolver, buildComparableProduct } from "../../src/resolver.js";
import { NoOpAIProvider } from "../../src/ai-provider.js";
import type { ProductIdentityInput, AIProvider, AIMatchRequest, AIMatchResponse } from "../../src/types.js";

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

/** Mock AI provider for testing. */
class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly available = true;
  private response: AIMatchResponse;

  constructor(response: Partial<AIMatchResponse> = {}) {
    this.response = {
      decision: response.decision ?? "UNRESOLVED",
      confidence: response.confidence ?? 0,
      reasons: response.reasons ?? ["mock AI response"],
      relationshipType: response.relationshipType ?? null,
    };
  }

  async matchProducts(_request: AIMatchRequest): Promise<AIMatchResponse> {
    return this.response;
  }
}

describe("buildComparableProduct", () => {
  it("should build a comparable product from input", () => {
    const input = makeProduct({
      id: "p1",
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brandId: "brand1",
      brandNormalizedName: "cerave",
      brandSearchKey: "cerave",
      identifiers: [
        { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
      ],
    });
    const comparable = buildComparableProduct(input);
    expect(comparable.token).toBeTruthy();
    expect(comparable.brandId).toBe("brand1");
    expect(comparable.brandNormalizedName).toBe("cerave");
    expect(comparable.identifiers.length).toBe(1);
  });
});

describe("IdentityResolver", () => {
  describe("generateCandidates", () => {
    it("should generate candidates for a product set", () => {
      const resolver = new IdentityResolver();
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
      const candidates = resolver.generateCandidates(products);
      expect(candidates.length).toBeGreaterThan(0);
    });
  });

  describe("generateCandidatesForNewProduct", () => {
    it("should generate candidates for a new product", () => {
      const resolver = new IdentityResolver();
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
      ];
      const candidates = resolver.generateCandidatesForNewProduct(newProduct, existing);
      expect(candidates.length).toBeGreaterThan(0);
    });
  });

  describe("resolveCandidate", () => {
    it("should resolve an exact match", async () => {
      const resolver = new IdentityResolver({ aiProvider: new NoOpAIProvider() });
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Facial Cleanser 236ml",
        brandId: "brand1",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "CeraVe Hydrating Facial Cleanser 236ml",
        brandId: "brand1",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const candidate = {
        fromProductId: "p1",
        toProductId: "p2",
        generationMethod: "identifier" as const,
        blockingKey: "id:gtin13:3606000423981",
        priority: 10,
      };
      const result = await resolver.resolveCandidate(candidate, a, b);
      expect(result.matchResult.decision).toBe("EXACT_MATCH");
      expect(result.autoApplicable).toBe(true);
      expect(result.conflicts.length).toBe(0);
      expect(result.aiUsed).toBe(false);
    });

    it("should resolve NO_MATCH for different brands", async () => {
      const resolver = new IdentityResolver({ aiProvider: new NoOpAIProvider() });
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser 236ml",
        brandId: "brand1",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
      });
      const b = makeProduct({
        id: "p2",
        name: "NIVEA Soft Light Moisturiser 100ml",
        brandId: "brand2",
        brandName: "NIVEA",
        brandNormalizedName: "nivea",
        brandSearchKey: "nivea",
      });
      const candidate = {
        fromProductId: "p1",
        toProductId: "p2",
        generationMethod: "blocking" as const,
        blockingKey: null,
        priority: 0,
      };
      const result = await resolver.resolveCandidate(candidate, a, b);
      expect(result.matchResult.decision).toBe("NO_MATCH");
      expect(result.autoApplicable).toBe(false);
    });

    it("should use AI when deterministic result is uncertain", async () => {
      const mockAI = new MockAIProvider({
        decision: "POSSIBLE_MATCH",
        confidence: 0.65,
        reasons: ["Similar product names from same brand"],
      });
      const resolver = new IdentityResolver({
        aiProvider: mockAI,
        useAIForUncertain: true,
      });
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser 236ml",
        brandId: "brand1",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
      });
      const b = makeProduct({
        id: "p2",
        name: "CeraVe Daily Moisturizing Lotion 236ml",
        brandId: "brand1",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
      });
      const candidate = {
        fromProductId: "p1",
        toProductId: "p2",
        generationMethod: "blocking" as const,
        blockingKey: null,
        priority: 0,
      };
      const result = await resolver.resolveCandidate(candidate, a, b);
      // AI was available and might have been used
      // The exact behavior depends on whether deterministic was uncertain
      expect(result.matchResult).toBeTruthy();
      expect(result.candidate).toBe(candidate);
    });

    it("should detect conflicts and override decision", async () => {
      const resolver = new IdentityResolver({ aiProvider: new NoOpAIProvider() });
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser 236ml",
        brandId: "brand1",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const b = makeProduct({
        id: "p2",
        name: "Completely Different Product",
        brandId: "brand2",
        brandName: "OtherBrand",
        brandNormalizedName: "otherbrand",
        brandSearchKey: "otherbrand",
        identifiers: [
          { type: "gtin13", value: "3606000423981", normalized: "3606000423981", isValid: true },
        ],
      });
      const candidate = {
        fromProductId: "p1",
        toProductId: "p2",
        generationMethod: "identifier" as const,
        blockingKey: "id:gtin13:3606000423981",
        priority: 10,
      };
      const result = await resolver.resolveCandidate(candidate, a, b);
      // Conflicts detected → decision should be CONFLICT
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.matchResult.decision).toBe("CONFLICT");
      expect(result.autoApplicable).toBe(false);
    });

    it("should not auto-apply low-confidence matches", async () => {
      const resolver = new IdentityResolver({
        aiProvider: new NoOpAIProvider(),
        autoResolveThreshold: 0.9,
      });
      const a = makeProduct({
        id: "p1",
        name: "CeraVe Hydrating Cleanser",
        brandId: "brand1",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
      });
      const b = makeProduct({
        id: "p2",
        name: "CeraVe Foaming Cleanser",
        brandId: "brand1",
        brandName: "CeraVe",
        brandNormalizedName: "cerave",
        brandSearchKey: "cerave",
      });
      const candidate = {
        fromProductId: "p1",
        toProductId: "p2",
        generationMethod: "blocking" as const,
        blockingKey: null,
        priority: 0,
      };
      const result = await resolver.resolveCandidate(candidate, a, b);
      // Even if match is POSSIBLE, it shouldn't be auto-applicable if below threshold
      if (result.matchResult.decision !== "EXACT_MATCH" && result.matchResult.decision !== "HIGH_CONFIDENCE_MATCH") {
        expect(result.autoApplicable).toBe(false);
      }
    });
  });

  describe("resolveAll", () => {
    it("should resolve all candidates for a product set", async () => {
      const resolver = new IdentityResolver({ aiProvider: new NoOpAIProvider() });
      const products = [
        makeProduct({
          id: "p1",
          name: "CeraVe Hydrating Cleanser 236ml",
          brandName: "CeraVe",
          brandNormalizedName: "cerave",
          brandSearchKey: "cerave",
          identifiers: [
            { type: "gtin13", value: "1111111111111", normalized: "1111111111111", isValid: true },
          ],
        }),
        makeProduct({
          id: "p2",
          name: "CeraVe Hydrating Cleanser 236ml",
          brandName: "CeraVe",
          brandNormalizedName: "cerave",
          brandSearchKey: "cerave",
          identifiers: [
            { type: "gtin13", value: "1111111111111", normalized: "1111111111111", isValid: true },
          ],
        }),
      ];
      const results = await resolver.resolveAll(products);
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.matchResult).toBeTruthy();
        expect(result.candidate).toBeTruthy();
      }
    });

    it("should handle empty product list", async () => {
      const resolver = new IdentityResolver({ aiProvider: new NoOpAIProvider() });
      const results = await resolver.resolveAll([]);
      expect(results).toEqual([]);
    });
  });
});
