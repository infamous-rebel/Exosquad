// =============================================================================
// API — Supplier Matching Engine (Phase 13)
// =============================================================================
// Pure, deterministic engine for evaluating how well a supplier's product
// matches a target product. No database, no HTTP, no filesystem, no tenant
// context, no mutable global state.
//
// Key invariants:
// - Unknown ≠ Zero: missing attributes reduce confidence, never treated as 0
// - Deterministic: same input → same output
// - Evidence-backed: no fabricated matches
// - No opaque AI scoring: all math is documented and reproducible
// =============================================================================

import { createHash } from "node:crypto";
import { SOURCING_CONFIG } from "@exosquad/common";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface ProductIdentifierInput {
  type: string; // gtin8 | gtin12 | gtin13 | gtin14 | upc | ean | mpn | sku | source_product_id
  value: string;
  normalized: string;
}

export interface ProductMatchInput {
  name: string;
  normalizedName: string;
  category: string | null;
  brand: string | null;
  description: string | null;
  countryOfOrigin: string | null;
  attributes: Record<string, unknown>;
  identifiers: ProductIdentifierInput[];
}

export interface SupplierProductInput {
  supplierProductName: string | null;
  supplierNormalizedName: string | null;
  supplierCategory: string | null;
  supplierDescription: string | null;
  supplierCountry: string | null;
  supplierRole: string | null; // manufacturer | distributor | wholesaler | etc.
  supplierAttributes: Record<string, unknown>;
  supplierIdentifiers: ProductIdentifierInput[];
}

export interface EvidenceRef {
  id: string;
  sourceId: string | null;
  confidence: number;
  observedAt: Date;
  evidenceType: string;
  status: string;
}

export interface SupplierMatchEngineInput {
  productId: string;
  supplierId: string;
  product: ProductMatchInput;
  supplierProduct: SupplierProductInput;
  evidence: EvidenceRef[];
  /** Reference timestamp for staleness. Injected for determinism. */
  referenceDate: Date;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface SourcingExplanation {
  factor: string;
  impact: "positive" | "negative" | "neutral" | "unknown";
  magnitude: number;
  statement: string;
  evidenceIds: string[];
}

export interface SupplierMatchResult {
  supplierId: string;
  matchLevel: "no_match" | "weak" | "possible" | "strong" | "exact";
  matchScore: number; // 0–100
  matchedAttributes: string[];
  unmatchedAttributes: string[];
  identifierMatchScore: number; // 0–100
  attributeMatchScore: number; // 0–100
  evidenceConfidence: number; // 0–1
  explanations: SourcingExplanation[];
  contentHash: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]),
  );
  return "{" + pairs.join(",") + "}";
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Normalize a string for deterministic comparison: lowercase, trim,
 * remove punctuation and extra whitespace.
 */
function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Compute token overlap (Jaccard-like) between two normalized strings.
 * Returns 0–1 where 1 = identical token sets.
 */
function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if two normalized values are exact match (case-insensitive).
 */
function exactMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeText(a) === normalizeText(b) && normalizeText(a).length > 0;
}

// ─── Identifier Matching ─────────────────────────────────────────────────────

/**
 * Compare product identifiers with supplier product identifiers.
 * Returns score 0–100 and list of matched attribute names.
 */
function matchIdentifiers(
  productIds: ProductIdentifierInput[],
  supplierIds: ProductIdentifierInput[],
): { score: number; matched: string[] } {
  if (productIds.length === 0 || supplierIds.length === 0) {
    return { score: 0, matched: [] };
  }

  const matched: string[] = [];
  let totalScore = 0;
  let comparisons = 0;

  for (const pid of productIds) {
    for (const sid of supplierIds) {
      comparisons++;
      // Same type + same normalized value = exact match
      if (pid.type === sid.type && pid.normalized === sid.normalized) {
        matched.push(`identifier:${pid.type}`);
        totalScore += 100;
      }
      // Same normalized value, different type = partial match
      else if (pid.normalized === sid.normalized && pid.normalized.length > 0) {
        matched.push(`identifier:cross_type:${pid.type}:${sid.type}`);
        totalScore += 70;
      }
    }
  }

  const score = comparisons > 0 ? totalScore / Math.max(comparisons, productIds.length) : 0;
  return { score: Math.min(100, Math.round(score)), matched: [...new Set(matched)] };
}

// ─── Attribute Matching ──────────────────────────────────────────────────────

/**
 * Compare product and supplier product attributes deterministically.
 */
function matchAttributes(
  product: ProductMatchInput,
  supplierProduct: SupplierProductInput,
): { score: number; matched: string[]; unmatched: string[] } {
  const matched: string[] = [];
  const unmatched: string[] = [];
  let totalScore = 0;
  let dimensions = 0;

  // 1. Name similarity (token overlap)
  dimensions++;
  const nameOverlap = tokenOverlap(product.name, supplierProduct.supplierProductName ?? "");
  if (nameOverlap > 0.5) {
    matched.push("name");
    totalScore += nameOverlap * 100;
  } else if (nameOverlap > 0) {
    unmatched.push("name");
    totalScore += nameOverlap * 60;
  } else {
    unmatched.push("name");
  }

  // 2. Category match
  dimensions++;
  if (product.category && supplierProduct.supplierCategory) {
    if (exactMatch(product.category, supplierProduct.supplierCategory)) {
      matched.push("category");
      totalScore += 100;
    } else {
      const catOverlap = tokenOverlap(product.category, supplierProduct.supplierCategory);
      if (catOverlap > 0.3) {
        matched.push("category:partial");
        totalScore += catOverlap * 70;
      } else {
        unmatched.push("category");
      }
    }
  } else {
    unmatched.push("category");
  }

  // 3. Country match
  dimensions++;
  if (product.countryOfOrigin && supplierProduct.supplierCountry) {
    if (exactMatch(product.countryOfOrigin, supplierProduct.supplierCountry)) {
      matched.push("country");
      totalScore += 100;
    } else {
      unmatched.push("country");
    }
  } else {
    unmatched.push("country");
  }

  // 4. Description overlap
  dimensions++;
  const descOverlap = tokenOverlap(product.description ?? "", supplierProduct.supplierDescription ?? "");
  if (descOverlap > 0.3) {
    matched.push("description");
    totalScore += descOverlap * 80;
  } else if (descOverlap > 0) {
    unmatched.push("description");
    totalScore += descOverlap * 30;
  } else {
    unmatched.push("description");
  }

  const score = dimensions > 0 ? Math.round(totalScore / dimensions) : 0;
  return { score: Math.min(100, score), matched: [...new Set(matched)], unmatched: [...new Set(unmatched)] };
}

// ─── Evidence Confidence ─────────────────────────────────────────────────────

/**
 * Calculate evidence confidence from the evidence list.
 * Considers: count, average confidence, recency, source independence.
 */
function calculateEvidenceConfidence(
  evidence: EvidenceRef[],
  referenceDate: Date,
): number {
  if (evidence.length === 0) return 0;

  const freshCutoff = new Date(
    referenceDate.getTime() - SOURCING_CONFIG.currentCommercialDataDays * 24 * 60 * 60 * 1000,
  );

  const activeEvidence = evidence.filter((e) => e.status === "active");
  const freshEvidence = activeEvidence.filter((e) => e.observedAt >= freshCutoff);

  if (activeEvidence.length === 0) return 0;

  // Average confidence of active evidence
  const avgConfidence =
    activeEvidence.reduce((sum, e) => sum + e.confidence, 0) / activeEvidence.length;

  // Recency factor: fraction of fresh evidence
  const recencyFactor = freshEvidence.length / Math.max(activeEvidence.length, 1);

  // Source independence: unique source count
  const uniqueSources = new Set(activeEvidence.map((e) => e.sourceId).filter(Boolean));
  const independenceFactor = Math.min(1, uniqueSources.size / 3);

  // Coverage: more evidence = more confidence (diminishing returns)
  const coverageFactor = Math.min(1, activeEvidence.length / 5);

  const cw = SOURCING_CONFIG.confidenceWeights;
  return clamp01(
    avgConfidence * cw.sourceQuality +
      recencyFactor * cw.recency +
      coverageFactor * cw.coverage +
      0.5 * cw.consistency + // default neutral consistency
      independenceFactor * cw.independence,
  );
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

/**
 * Calculate how well a supplier's product matches the target product.
 * Pure function: same input → same output.
 */
export function calculateSupplierMatch(input: SupplierMatchEngineInput): SupplierMatchResult {
  const { product, supplierProduct, evidence, referenceDate } = input;

  // 1. Identifier matching
  const idResult = matchIdentifiers(product.identifiers, supplierProduct.supplierIdentifiers);

  // 2. Attribute matching
  const attrResult = matchAttributes(product, supplierProduct);

  // 3. Evidence confidence
  const evidenceConf = calculateEvidenceConfidence(evidence, referenceDate);

  // 4. Weighted match score
  const w = SOURCING_CONFIG.matchWeights;
  const dimensionScores: Array<[number | null, number]> = [
    [idResult.score > 0 ? idResult.score : null, w.identifier],
    [attrResult.score > 0 ? attrResult.score : null, w.productAttributes],
    [null, w.model], // model matching (reserved for future structured model comparison)
    [product.category && supplierProduct.supplierCategory
      ? (exactMatch(product.category, supplierProduct.supplierCategory) ? 100 : tokenOverlap(product.category, supplierProduct.supplierCategory) * 70)
      : null, w.category],
    [evidenceConf > 0 ? evidenceConf * 100 : null, w.evidence],
  ];

  let weightedSum = 0;
  let weightTotal = 0;
  for (const [score, weight] of dimensionScores) {
    if (score !== null) {
      weightedSum += score * weight;
      weightTotal += weight;
    }
  }

  const matchScore = weightTotal > 0
    ? Math.max(0, Math.min(100, Math.round(weightedSum / weightTotal)))
    : 0;

  // 5. Match level classification
  const thresholds = SOURCING_CONFIG.matchLevelThresholds;
  let matchLevel: SupplierMatchResult["matchLevel"];
  if (matchScore >= thresholds.exactMin) matchLevel = "exact";
  else if (matchScore >= thresholds.strongMin) matchLevel = "strong";
  else if (matchScore >= thresholds.possibleMin) matchLevel = "possible";
  else if (matchScore >= thresholds.weakMin) matchLevel = "weak";
  else matchLevel = "no_match";

  // 6. Explanations
  const explanations: SourcingExplanation[] = [];

  if (idResult.matched.length > 0) {
    explanations.push({
      factor: "supplier_match",
      impact: "positive",
      magnitude: round2(clamp01(idResult.score / 100)),
      statement: `${idResult.matched.length} identifier(s) matched between product and supplier: ${idResult.matched.slice(0, 5).join(", ")}`,
      evidenceIds: evidence.slice(0, 3).map((e) => e.id),
    });
  }

  if (attrResult.matched.length > 0) {
    explanations.push({
      factor: "supplier_match",
      impact: "positive",
      magnitude: round2(clamp01(attrResult.score / 100)),
      statement: `${attrResult.matched.length} attribute(s) matched: ${attrResult.matched.slice(0, 5).join(", ")}`,
      evidenceIds: [],
    });
  }

  if (attrResult.unmatched.length > 3) {
    explanations.push({
      factor: "supplier_match",
      impact: "negative",
      magnitude: round2(clamp01(attrResult.unmatched.length / 8)),
      statement: `${attrResult.unmatched.length} attributes did not match: ${attrResult.unmatched.slice(0, 5).join(", ")}`,
      evidenceIds: [],
    });
  }

  if (evidence.length === 0) {
    explanations.push({
      factor: "evidence",
      impact: "unknown",
      magnitude: 0,
      statement: "No evidence supports this supplier-product relationship",
      evidenceIds: [],
    });
  } else if (evidenceConf < 0.3) {
    explanations.push({
      factor: "evidence",
      impact: "negative",
      magnitude: round2(1 - evidenceConf),
      statement: `Evidence confidence is low (${(evidenceConf * 100).toFixed(0)}%) based on ${evidence.length} evidence record(s)`,
      evidenceIds: evidence.slice(0, 5).map((e) => e.id),
    });
  }

  // 7. Content hash (no timestamp contamination)
  const contentHash = sha256(
    stableStringify({
      productId: input.productId,
      supplierId: input.supplierId,
      matchScore,
      matchLevel,
      identifierMatchScore: idResult.score,
      attributeMatchScore: attrResult.score,
      matchedAttributes: attrResult.matched.sort(),
      evidenceCount: evidence.length,
      engineVersion: SOURCING_CONFIG.engineVersion,
    }),
  );

  return {
    supplierId: input.supplierId,
    matchLevel,
    matchScore,
    matchedAttributes: attrResult.matched,
    unmatchedAttributes: attrResult.unmatched,
    identifierMatchScore: idResult.score,
    attributeMatchScore: attrResult.score,
    evidenceConfidence: round2(evidenceConf),
    explanations,
    contentHash,
  };
}

// ─── Exported Hash Helpers ───────────────────────────────────────────────────

export function computeMatchContentHash(result: SupplierMatchResult): string {
  return sha256(
    stableStringify({
      supplierId: result.supplierId,
      matchScore: result.matchScore,
      matchLevel: result.matchLevel,
      identifierMatchScore: result.identifierMatchScore,
      attributeMatchScore: result.attributeMatchScore,
      matchedAttributes: result.matchedAttributes.sort(),
      evidenceConfidence: result.evidenceConfidence,
      engineVersion: SOURCING_CONFIG.engineVersion,
    }),
  );
}
