// =============================================================================
// @exosquad/identity — Identity resolution engine
// =============================================================================
// Main orchestrator for product identity resolution.
// Pipeline: DETERMINISTIC FILTERING → CANDIDATE GENERATION → AI (if needed)
//           → STRUCTURED DECISION → CONFIDENCE → EVIDENCE → PERSISTENCE
// =============================================================================

import { tokenizeProductName } from "./tokenizer.js";
import { compareProducts, type ComparableProduct } from "./similarity.js";
import { generateCandidates, generateCandidatesForProduct } from "./candidates.js";
import { detectConflicts } from "./conflicts.js";
import { createAIProvider } from "./ai-provider.js";
import type {
  AIProvider,
  AIMatchRequest,
  AIMatchResponse,
  MatchResult,
  CandidatePair,
  DetectedConflict,
  ProductIdentityInput,
  RelationshipType,
} from "./types.js";

// ─── Resolver Configuration ──────────────────────────────────────────────────

export interface ResolverConfig {
  /** AI provider for assisted matching. */
  aiProvider?: AIProvider;
  /** Whether to use AI for uncertain matches. */
  useAIForUncertain?: boolean;
  /** Maximum candidates per product. */
  maxCandidatesPerProduct?: number;
  /** Minimum confidence to auto-resolve. */
  autoResolveThreshold?: number;
}

// ─── Resolution Result ───────────────────────────────────────────────────────

export interface ResolutionResult {
  /** The candidate pair that was resolved. */
  candidate: CandidatePair;
  /** The match result with evidence. */
  matchResult: MatchResult;
  /** Whether AI was used. */
  aiUsed: boolean;
  /** Any detected conflicts. */
  conflicts: DetectedConflict[];
  /** Whether this result should be auto-applied. */
  autoApplicable: boolean;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Product identity resolution engine.
 * Orchestrates the full pipeline from candidate generation to decision.
 */
export class IdentityResolver {
  private aiProvider: AIProvider;
  private useAIForUncertain: boolean;
  private maxCandidates: number;
  private autoResolveThreshold: number;

  constructor(config?: ResolverConfig) {
    this.aiProvider = config?.aiProvider ?? createAIProvider();
    this.useAIForUncertain = config?.useAIForUncertain ?? true;
    this.maxCandidates = config?.maxCandidatesPerProduct ?? 50;
    this.autoResolveThreshold = config?.autoResolveThreshold ?? 0.8;
  }

  /**
   * Generate candidate pairs for a set of products.
   */
  generateCandidates(products: ProductIdentityInput[]): CandidatePair[] {
    return generateCandidates(products, {
      maxCandidatesPerProduct: this.maxCandidates,
    });
  }

  /**
   * Generate candidates for a single new product against existing products.
   */
  generateCandidatesForNewProduct(
    newProduct: ProductIdentityInput,
    existingProducts: ProductIdentityInput[]
  ): CandidatePair[] {
    return generateCandidatesForProduct(newProduct, existingProducts, this.maxCandidates);
  }

  /**
   * Resolve a single candidate pair.
   * Returns structured match result with evidence.
   */
  async resolveCandidate(
    candidate: CandidatePair,
    productA: ProductIdentityInput,
    productB: ProductIdentityInput
  ): Promise<ResolutionResult> {
    // Build comparable products
    const compA = buildComparableProduct(productA);
    const compB = buildComparableProduct(productB);

    // Step 1: Deterministic comparison
    let matchResult = compareProducts(compA, compB);
    let aiUsed = false;

    // Step 2: If uncertain and AI is available, try AI-assisted matching
    if (
      this.useAIForUncertain &&
      this.aiProvider.available &&
      (matchResult.decision === "UNRESOLVED" || matchResult.decision === "POSSIBLE_MATCH")
    ) {
      const aiResult = await this.tryAIMatching(productA, productB);
      if (aiResult) {
        aiUsed = true;
        // AI can upgrade the decision if confidence is higher
        if (aiResult.confidence > matchResult.confidence) {
          matchResult = {
            ...matchResult,
            decision: aiResult.decision,
            confidence: aiResult.confidence,
            reasons: [...matchResult.reasons, ...aiResult.reasons.map((r: string) => `AI: ${r}`)],
            relationshipType: (aiResult.relationshipType as RelationshipType | null) ?? matchResult.relationshipType,
          };
        }
      }
    }

    // Step 3: Detect conflicts
    const conflicts = detectConflicts(productA, productB);

    // If conflicts detected, override decision
    if (conflicts.length > 0 && matchResult.decision !== "NO_MATCH") {
      matchResult = {
        ...matchResult,
        decision: "CONFLICT",
        evidence: {
          ...matchResult.evidence,
          conflictState: "open",
        },
        reasons: [...matchResult.reasons, `${conflicts.length} conflict(s) detected`],
      };
    }

    // Step 4: Determine if auto-applicable
    const autoApplicable =
      (matchResult.decision === "EXACT_MATCH" || matchResult.decision === "HIGH_CONFIDENCE_MATCH") &&
      matchResult.confidence >= this.autoResolveThreshold &&
      conflicts.length === 0;

    return {
      candidate,
      matchResult,
      aiUsed,
      conflicts,
      autoApplicable,
    };
  }

  /**
   * Resolve all candidates for a set of products.
   */
  async resolveAll(products: ProductIdentityInput[]): Promise<ResolutionResult[]> {
    const candidates = this.generateCandidates(products);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const results: ResolutionResult[] = [];

    for (const candidate of candidates) {
      const productA = productMap.get(candidate.fromProductId);
      const productB = productMap.get(candidate.toProductId);

      if (!productA || !productB) continue;

      const result = await this.resolveCandidate(candidate, productA, productB);
      results.push(result);
    }

    return results;
  }

  /**
   * Try AI-assisted matching for a pair of products.
   */
  private async tryAIMatching(
    productA: ProductIdentityInput,
    productB: ProductIdentityInput
  ): Promise<AIMatchResponse | null> {
    try {
      const tokenA = tokenizeProductName(productA.name);
      const tokenB = tokenizeProductName(productB.name);

      const request: AIMatchRequest = {
        productA: {
          name: productA.name,
          brand: productA.brandName,
          identifiers: productA.identifiers.map((i) => i.normalized),
          quantity: tokenA.quantity ? `${tokenA.quantity}${tokenA.unit ?? ""}` : null,
          variant: tokenA.variantTokens.join(" ") || null,
        },
        productB: {
          name: productB.name,
          brand: productB.brandName,
          identifiers: productB.identifiers.map((i) => i.normalized),
          quantity: tokenB.quantity ? `${tokenB.quantity}${tokenB.unit ?? ""}` : null,
          variant: tokenB.variantTokens.join(" ") || null,
        },
      };

      const response = await this.aiProvider.matchProducts(request);
      return response;
    } catch {
      // AI failure — continue with deterministic only
      return null;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a ComparableProduct from a ProductIdentityInput.
 */
export function buildComparableProduct(input: ProductIdentityInput): ComparableProduct {
  const token = tokenizeProductName(input.name);

  return {
    token,
    brandId: input.brandId,
    brandNormalizedName: input.brandNormalizedName,
    brandSearchKey: input.brandSearchKey,
    countryOfOrigin: input.countryOfOrigin,
    identifiers: input.identifiers,
    variants: input.variants.map((v) => ({
      packCount: v.packCount,
      perUnitQuantity: v.perUnitQuantity,
      perUnitUnit: v.perUnitUnit,
      totalQuantity: v.totalQuantity,
      quantityUnit: v.quantityUnit,
      formulation: v.formulation,
      flavor: v.flavor,
      scent: v.scent,
      concentration: v.concentration,
      strength: v.strength,
      spf: v.spf,
      ageGroup: v.ageGroup,
      genderTarget: v.genderTarget,
      color: v.color,
    })),
  };
}
