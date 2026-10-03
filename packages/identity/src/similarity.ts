// =============================================================================
// @exosquad/identity — Similarity engine
// =============================================================================
// Multi-dimensional product similarity comparison.
// Compares products across: identifiers, brand, name, variant, quantity,
// pack structure, country, and manufacturer.
// Produces structured evidence — never a single opaque score.
// =============================================================================

import { createSearchKey } from "@exosquad/normalization";
import type { ProductToken, MatchEvidence, MatchResult, MatchDecision, RelationshipType } from "./types.js";

// ─── Product Data for Comparison ─────────────────────────────────────────────

export interface ComparableProduct {
  token: ProductToken;
  brandId: string | null;
  brandNormalizedName: string | null;
  brandSearchKey: string | null;
  countryOfOrigin: string | null;
  identifiers: Array<{
    type: string;
    value: string;
    normalized: string;
    isValid: boolean;
  }>;
  variants: Array<{
    packCount: number | null;
    perUnitQuantity: number | null;
    perUnitUnit: string | null;
    totalQuantity: number | null;
    quantityUnit: string | null;
    formulation: string | null;
    flavor: string | null;
    scent: string | null;
    concentration: string | null;
    strength: string | null;
    spf: string | null;
    ageGroup: string | null;
    genderTarget: string | null;
    color: string | null;
  }>;
}

// ─── Trusted Identifier Types ────────────────────────────────────────────────

const TRUSTED_IDENTIFIER_TYPES = new Set([
  "gtin8", "gtin12", "gtin13", "gtin14",
]);

// ─── Main Comparison ─────────────────────────────────────────────────────────

/**
 * Compare two products across all matching dimensions.
 * Returns structured evidence and a match decision.
 */
export function compareProducts(a: ComparableProduct, b: ComparableProduct): MatchResult {
  const reasons: string[] = [];

  // 1. Identifier matching
  const identifierResult = compareIdentifiers(a.identifiers, b.identifiers);
  if (identifierResult.quality === "exact") {
    reasons.push("Exact identifier match");
  } else if (identifierResult.quality === "conflict") {
    reasons.push("Identifier conflict detected");
  }

  // 2. Brand matching
  const brandResult = compareBrands(a, b);
  if (brandResult.quality === "exact") {
    reasons.push("Brand exact match");
  } else if (brandResult.quality === "similar") {
    reasons.push("Brand similar");
  } else {
    reasons.push("Brand does not match");
  }

  // 3. Name matching
  const nameResult = compareNames(a.token, b.token);
  if (nameResult.quality === "exact") {
    reasons.push("Product name exact match");
  } else if (nameResult.quality === "high") {
    reasons.push(`Product name high similarity (${nameResult.score.toFixed(2)})`);
  } else if (nameResult.quality === "medium") {
    reasons.push(`Product name medium similarity (${nameResult.score.toFixed(2)})`);
  } else if (nameResult.quality === "low") {
    reasons.push(`Product name low similarity (${nameResult.score.toFixed(2)})`);
  } else {
    reasons.push("Product name does not match");
  }

  // 4. Variant matching
  const variantResult = compareVariants(a, b);
  if (variantResult.quality === "different") {
    reasons.push("Variant attributes differ");
  } else if (variantResult.quality === "exact") {
    reasons.push("Variant attributes match");
  }

  // 5. Quantity matching
  const quantityResult = compareQuantities(a.token, b.token);
  if (quantityResult.quality === "different") {
    reasons.push(`Quantity differs: ${formatQuantity(a.token)} vs ${formatQuantity(b.token)}`);
  } else if (quantityResult.quality === "exact") {
    reasons.push("Quantity exact match");
  } else if (quantityResult.quality === "compatible") {
    reasons.push("Quantity compatible (unit conversion)");
  }

  // 6. Pack matching
  const packResult = comparePacks(a.token, b.token);
  if (packResult.quality === "different") {
    reasons.push("Pack structure differs");
  } else if (packResult.quality === "exact") {
    reasons.push("Pack structure match");
  }

  // 7. Country matching
  const countryResult = compareCountries(a.countryOfOrigin, b.countryOfOrigin);
  if (countryResult.quality === "different") {
    reasons.push("Country/market differs");
  }

  // Build evidence
  const evidence: MatchEvidence = {
    identifierMatch: identifierResult.quality,
    brandMatch: brandResult.quality,
    nameMatch: nameResult.quality,
    variantMatch: variantResult.quality,
    quantityMatch: quantityResult.quality,
    packMatch: packResult.quality,
    countryMatch: countryResult.quality,
    manufacturerMatch: "none", // not yet tracked at product level
    conflictState: identifierResult.quality === "conflict" ? "open" : "none",
    sourceReliability: null,
    scores: {
      identifierScore: identifierResult.score,
      brandScore: brandResult.score,
      nameScore: nameResult.score,
      variantScore: variantResult.score,
      quantityScore: quantityResult.score,
      packScore: packResult.score,
      overallScore: 0,
    },
    reasons,
  };

  // Calculate overall score (weighted)
  evidence.scores.overallScore = calculateOverallScore(evidence);

  // Determine decision
  const decision = determineDecision(evidence, identifierResult, brandResult);
  const confidence = calculateConfidence(evidence, decision);
  const relationshipType = determineRelationshipType(decision, evidence);

  return {
    decision,
    confidence,
    evidence,
    relationshipType,
    reasons,
  };
}

// ─── Identifier Comparison ───────────────────────────────────────────────────

function compareIdentifiers(
  a: Array<{ type: string; value: string; normalized: string; isValid: boolean }>,
  b: Array<{ type: string; value: string; normalized: string; isValid: boolean }>
): { quality: "exact" | "partial" | "none" | "conflict"; score: number } {
  if (a.length === 0 || b.length === 0) {
    return { quality: "none", score: 0 };
  }

  // Check for exact matches on trusted identifiers
  for (const idA of a) {
    if (!idA.isValid) continue;
    if (!TRUSTED_IDENTIFIER_TYPES.has(idA.type)) continue;

    for (const idB of b) {
      if (!idB.isValid) continue;
      if (!TRUSTED_IDENTIFIER_TYPES.has(idB.type)) continue;

      // Normalize both to GTIN-13 for comparison
      const normA = normalizeToGtin13(idA);
      const normB = normalizeToGtin13(idB);

      if (normA && normB && normA === normB) {
        return { quality: "exact", score: 1.0 };
      }

      // Same type, different value = potential conflict
      if (idA.type === idB.type && idA.normalized !== idB.normalized) {
        return { quality: "conflict", score: 0 };
      }
    }
  }

  // Check for partial matches (e.g., MPN or SKU)
  for (const idA of a) {
    for (const idB of b) {
      if (idA.type === idB.type && idA.normalized === idB.normalized) {
        return { quality: "partial", score: 0.7 };
      }
    }
  }

  return { quality: "none", score: 0 };
}

/**
 * Normalize an identifier to GTIN-13 for cross-type comparison.
 */
function normalizeToGtin13(id: { type: string; normalized: string }): string | null {
  const val = id.normalized.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(val)) return null;

  switch (id.type) {
    case "gtin8":
      // GTIN-8 → GTIN-13: prepend 5 zeros
      return "00000" + val;
    case "gtin12":
      // GTIN-12 (UPC-A) → GTIN-13: prepend 0
      return "0" + val;
    case "gtin13":
      return val;
    case "gtin14":
      // GTIN-14 → GTIN-13: strip leading indicator digit
      return val.slice(1);
    default:
      return null;
  }
}

// ─── Brand Comparison ────────────────────────────────────────────────────────

function compareBrands(
  a: ComparableProduct,
  b: ComparableProduct
): { quality: "exact" | "similar" | "none"; score: number } {
  // Both have brand IDs — compare
  if (a.brandId && b.brandId) {
    if (a.brandId === b.brandId) {
      return { quality: "exact", score: 1.0 };
    }
    // Different brand IDs — check if normalized names match
    if (a.brandNormalizedName && b.brandNormalizedName) {
      if (a.brandNormalizedName === b.brandNormalizedName) {
        return { quality: "exact", score: 1.0 };
      }
      if (a.brandSearchKey && b.brandSearchKey && a.brandSearchKey === b.brandSearchKey) {
        return { quality: "similar", score: 0.8 };
      }
    }
    return { quality: "none", score: 0 };
  }

  // Compare by normalized name
  if (a.brandNormalizedName && b.brandNormalizedName) {
    if (a.brandNormalizedName === b.brandNormalizedName) {
      return { quality: "exact", score: 1.0 };
    }
    if (a.brandSearchKey && b.brandSearchKey && a.brandSearchKey === b.brandSearchKey) {
      return { quality: "similar", score: 0.8 };
    }
    return { quality: "none", score: 0 };
  }

  // Compare by token brand
  const aBrand = a.token.brandTokens.join(" ");
  const bBrand = b.token.brandTokens.join(" ");

  if (aBrand && bBrand) {
    if (aBrand === bBrand) {
      return { quality: "exact", score: 1.0 };
    }
    if (createSearchKey(aBrand) === createSearchKey(bBrand)) {
      return { quality: "similar", score: 0.8 };
    }
    return { quality: "none", score: 0 };
  }

  // One or both have no brand
  if (!aBrand && !bBrand) {
    return { quality: "none", score: 0 };
  }

  return { quality: "none", score: 0 };
}

// ─── Name Comparison ─────────────────────────────────────────────────────────

function compareNames(
  a: ProductToken,
  b: ProductToken
): { quality: "exact" | "high" | "medium" | "low" | "none"; score: number } {
  // Exact search key match
  if (a.searchKey && b.searchKey && a.searchKey === b.searchKey) {
    return { quality: "exact", score: 1.0 };
  }

  // Compare product core tokens (excluding brand)
  const aCore = a.productTokens.filter((t) => !a.brandTokens.includes(t));
  const bCore = b.productTokens.filter((t) => !b.brandTokens.includes(t));

  if (aCore.length === 0 || bCore.length === 0) {
    // Fall back to full name comparison
    const fullSim = jaccardSimilarity(a.allTokens, b.allTokens);
    return classifyNameScore(fullSim);
  }

  // Jaccard similarity on core product tokens
  const aCoreSet = new Set(aCore);
  const bCoreSet = new Set(bCore);
  const coreSim = jaccardSimilarity(aCoreSet, bCoreSet);

  // Also check token ordering (bigram similarity)
  const aStr = aCore.join(" ");
  const bStr = bCore.join(" ");
  const bigramSim = bigramSimilarity(aStr, bStr);

  // Combined score (weighted average)
  const combined = coreSim * 0.6 + bigramSim * 0.4;

  return classifyNameScore(combined);
}

function classifyNameScore(score: number): { quality: "exact" | "high" | "medium" | "low" | "none"; score: number } {
  if (score >= 0.95) return { quality: "exact", score };
  if (score >= 0.75) return { quality: "high", score };
  if (score >= 0.5) return { quality: "medium", score };
  if (score >= 0.25) return { quality: "low", score };
  return { quality: "none", score };
}

// ─── Variant Comparison ──────────────────────────────────────────────────────

function compareVariants(
  a: ComparableProduct,
  b: ComparableProduct
): { quality: "exact" | "compatible" | "different" | "none"; score: number } {
  const aVariants = a.variants;
  const bVariants = b.variants;

  if (aVariants.length === 0 || bVariants.length === 0) {
    return { quality: "none", score: 0 };
  }

  // Compare the first variant of each (primary variant)
  const aV = aVariants[0]!;
  const bV = bVariants[0]!;

  let matchCount = 0;
  let totalChecks = 0;
  let hasConflict = false;

  // Compare each variant attribute
  const comparisons: Array<[string | null, string | null, boolean]> = [
    [aV.formulation, bV.formulation, true],
    [aV.flavor, bV.flavor, true],
    [aV.scent, bV.scent, true],
    [aV.concentration, bV.concentration, true],
    [aV.strength, bV.strength, true],
    [aV.spf, bV.spf, true],
    [aV.ageGroup, bV.ageGroup, true],
    [aV.genderTarget, bV.genderTarget, false], // different is not a hard conflict
    [aV.color, bV.color, false],
  ];

  for (const [aVal, bVal, isHardConflict] of comparisons) {
    if (aVal && bVal) {
      totalChecks++;
      if (aVal.toLowerCase() === bVal.toLowerCase()) {
        matchCount++;
      } else if (isHardConflict) {
        hasConflict = true;
      }
    }
  }

  if (hasConflict) {
    return { quality: "different", score: 0 };
  }

  if (totalChecks === 0) {
    return { quality: "none", score: 0 };
  }

  const ratio = matchCount / totalChecks;
  if (ratio >= 0.9) return { quality: "exact", score: ratio };
  if (ratio >= 0.5) return { quality: "compatible", score: ratio };
  return { quality: "different", score: ratio };
}

// ─── Quantity Comparison ─────────────────────────────────────────────────────

function compareQuantities(
  a: ProductToken,
  b: ProductToken
): { quality: "exact" | "compatible" | "different" | "none"; score: number } {
  const aQty = a.quantity;
  const bQty = b.quantity;

  if (aQty === null || bQty === null || aQty === undefined || bQty === undefined) {
    return { quality: "none", score: 0 };
  }

  if (a.unit && b.unit && a.unit === b.unit) {
    // Same unit — direct comparison
    if (Math.abs(aQty - bQty) < 0.01) {
      return { quality: "exact", score: 1.0 };
    }
    // Allow small tolerance (e.g., rounding)
    if (Math.abs(aQty - bQty) / Math.max(aQty, bQty) < 0.05) {
      return { quality: "compatible", score: 0.8 };
    }
    return { quality: "different", score: 0 };
  }

  // Different units — would need conversion (ml vs oz, etc.)
  // For now, mark as none if units differ
  if (a.unit && b.unit && a.unit !== b.unit) {
    // Check if they're compatible units (both mass or both volume)
    const massUnits = new Set(["mg", "g", "kg"]);
    const volumeUnits = new Set(["ml", "l"]);

    if (massUnits.has(a.unit) && massUnits.has(b.unit)) {
      return { quality: "compatible", score: 0.6 };
    }
    if (volumeUnits.has(a.unit) && volumeUnits.has(b.unit)) {
      return { quality: "compatible", score: 0.6 };
    }

    return { quality: "different", score: 0 };
  }

  return { quality: "none", score: 0 };
}

// ─── Pack Comparison ─────────────────────────────────────────────────────────

function comparePacks(
  a: ProductToken,
  b: ProductToken
): { quality: "exact" | "compatible" | "different" | "none"; score: number } {
  const aPack = a.packCount;
  const bPack = b.packCount;

  // Both have no pack structure
  if ((aPack === null || aPack === undefined) && (bPack === null || bPack === undefined)) {
    return { quality: "none", score: 0 };
  }

  // One has pack, other doesn't
  if ((aPack === null || aPack === undefined) !== (bPack === null || bPack === undefined)) {
    return { quality: "different", score: 0 };
  }

  // Both have pack structure
  if (aPack === bPack) {
    // Same pack count — check per-unit quantity
    const aPerUnit = a.perUnitQuantity;
    const bPerUnit = b.perUnitQuantity;

    if (aPerUnit !== null && aPerUnit !== undefined && bPerUnit !== null && bPerUnit !== undefined) {
      if (a.perUnitUnit === b.perUnitUnit && Math.abs(aPerUnit - bPerUnit) < 0.01) {
        return { quality: "exact", score: 1.0 };
      }
    }
    return { quality: "compatible", score: 0.7 };
  }

  return { quality: "different", score: 0 };
}

// ─── Country Comparison ──────────────────────────────────────────────────────

function compareCountries(
  a: string | null,
  b: string | null
): { quality: "exact" | "compatible" | "different" | "none"; score: number } {
  if (!a && !b) return { quality: "none", score: 0 };
  if (!a || !b) return { quality: "none", score: 0 };

  if (a === b) return { quality: "exact", score: 1.0 };

  // Same region compatibility (e.g., US/CA, EU countries)
  const regions: Record<string, string[]> = {
    north_america: ["US", "CA", "MX"],
    eu: ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "FI", "SE", "DK", "PL", "CZ", "HU", "RO", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "LU", "MT", "CY", "GR"],
    gulf: ["SA", "AE", "KW", "QA", "BH", "OM"],
    south_asia: ["BD", "IN", "PK", "LK", "NP"],
  };

  for (const countries of Object.values(regions)) {
    if (countries.includes(a) && countries.includes(b)) {
      return { quality: "compatible", score: 0.7 };
    }
  }

  return { quality: "different", score: 0 };
}

// ─── Decision Logic ──────────────────────────────────────────────────────────

/**
 * Determine match decision from evidence using tiered logic.
 *
 * Tier 1: Valid exact trusted GTIN → EXACT_MATCH
 * Tier 2: Exact manufacturer SKU + compatible attributes → HIGH_CONFIDENCE_MATCH
 * Tier 3: Strong brand + product-name + variant + quantity agreement → HIGH_CONFIDENCE or POSSIBLE
 * Tier 4: Name similarity only → UNRESOLVED or POSSIBLE (NOT automatic merge)
 */
function determineDecision(
  evidence: MatchEvidence,
  identifierResult: { quality: string },
  brandResult: { quality: string }
): MatchDecision {
  // Conflict takes priority
  if (evidence.identifierMatch === "conflict") {
    return "CONFLICT";
  }

  // Tier 1: Exact trusted identifier match
  if (identifierResult.quality === "exact") {
    if (evidence.brandMatch !== "none" || evidence.nameMatch === "exact") {
      return "EXACT_MATCH";
    }
    // Identifier matches but brand is unknown — still high confidence
    return "HIGH_CONFIDENCE_MATCH";
  }

  // Tier 2: Strong brand + exact name + compatible quantity
  if (
    brandResult.quality === "exact" &&
    evidence.nameMatch === "exact" &&
    (evidence.quantityMatch === "exact" || evidence.quantityMatch === "compatible" || evidence.quantityMatch === "none") &&
    evidence.variantMatch !== "different"
  ) {
    return "HIGH_CONFIDENCE_MATCH";
  }

  // Tier 3: Brand + name + variant agreement
  if (
    brandResult.quality === "exact" &&
    (evidence.nameMatch === "high" || evidence.nameMatch === "medium") &&
    evidence.variantMatch !== "different" &&
    evidence.quantityMatch !== "different"
  ) {
    if (evidence.nameMatch === "high") {
      return "HIGH_CONFIDENCE_MATCH";
    }
    return "POSSIBLE_MATCH";
  }

  // Tier 4: Name similarity only
  if (evidence.nameMatch === "high" && brandResult.quality !== "none") {
    return "POSSIBLE_MATCH";
  }

  if (evidence.nameMatch === "medium" && brandResult.quality === "exact") {
    return "POSSIBLE_MATCH";
  }

  // Low similarity or no match
  if (evidence.scores.overallScore < 0.15) {
    return "NO_MATCH";
  }

  return "UNRESOLVED";
}

/**
 * Calculate confidence score based on evidence and decision.
 */
function calculateConfidence(evidence: MatchEvidence, decision: MatchDecision): number {
  switch (decision) {
    case "EXACT_MATCH":
      return Math.min(1.0, 0.9 + evidence.scores.overallScore * 0.1);
    case "HIGH_CONFIDENCE_MATCH":
      return Math.min(0.9, 0.7 + evidence.scores.overallScore * 0.2);
    case "POSSIBLE_MATCH":
      return Math.min(0.7, 0.4 + evidence.scores.overallScore * 0.3);
    case "NO_MATCH":
      return 1.0 - evidence.scores.overallScore;
    case "CONFLICT":
      return 0.5; // uncertain — needs resolution
    case "UNRESOLVED":
      return evidence.scores.overallScore;
    default:
      return 0;
  }
}

/**
 * Determine the relationship type from the decision and evidence.
 */
function determineRelationshipType(
  decision: MatchDecision,
  evidence: MatchEvidence
): RelationshipType | null {
  switch (decision) {
    case "EXACT_MATCH":
      // Check if it's same product different variant or exact SKU
      if (evidence.quantityMatch === "different" || evidence.packMatch === "different") {
        return "SAME_PRODUCT_VARIANT";
      }
      return "EXACT_SKU";
    case "HIGH_CONFIDENCE_MATCH":
      if (evidence.variantMatch === "different") {
        return "SAME_PRODUCT_FAMILY";
      }
      return "SAME_PRODUCT_VARIANT";
    case "POSSIBLE_MATCH":
      return "RELATED_PRODUCT";
    default:
      return null;
  }
}

/**
 * Calculate weighted overall score from component scores.
 */
function calculateOverallScore(evidence: MatchEvidence): number {
  const weights = {
    identifierScore: 0.30,
    brandScore: 0.20,
    nameScore: 0.20,
    variantScore: 0.10,
    quantityScore: 0.10,
    packScore: 0.10,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const score = evidence.scores[key as keyof typeof evidence.scores] as number;
    // Only include dimensions that have data
    if (score > 0 || key === "identifierScore") {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ─── String Similarity Utilities ─────────────────────────────────────────────

/**
 * Jaccard similarity between two sets.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Character bigram similarity (Dice coefficient).
 */
export function bigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;

  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower.length < 2 || bLower.length < 2) return 0;

  const aBigrams = new Set<string>();
  for (let i = 0; i < aLower.length - 1; i++) {
    aBigrams.add(aLower.slice(i, i + 2));
  }

  let intersection = 0;
  for (let i = 0; i < bLower.length - 1; i++) {
    const bigram = bLower.slice(i, i + 2);
    if (aBigrams.has(bigram)) intersection++;
  }

  const totalBigrams = (aLower.length - 1) + (bLower.length - 1) - intersection;
  return totalBigrams > 0 ? (2 * intersection) / totalBigrams : 0;
}

/**
 * Format a quantity for display in reasons.
 */
function formatQuantity(token: ProductToken): string {
  if (token.quantity === null) return "unknown";
  const qty = token.packCount && token.packCount > 1
    ? `${token.packCount}×${token.perUnitQuantity ?? token.quantity}`
    : `${token.quantity}`;
  return `${qty}${token.unit ?? ""}`;
}
