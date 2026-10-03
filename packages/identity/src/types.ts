// =============================================================================
// @exosquad/identity — Types for identity resolution
// =============================================================================

/** Match decision outcomes. */
export type MatchDecision =
  | "EXACT_MATCH"
  | "HIGH_CONFIDENCE_MATCH"
  | "POSSIBLE_MATCH"
  | "NO_MATCH"
  | "CONFLICT"
  | "UNRESOLVED";

/** Identity resolution states for products. */
export type IdentityStatus =
  | "resolved"
  | "high_confidence"
  | "possible"
  | "ambiguous"
  | "conflict"
  | "unresolved"
  | "invalid";

/** Relationship types between products. */
export type RelationshipType =
  | "EXACT_SKU"
  | "SAME_PRODUCT_VARIANT"
  | "SAME_PRODUCT_FAMILY"
  | "RELATED_PRODUCT"
  | "REPLACED_BY"
  | "REPLACES"
  | "SUPERSEDED_BY"
  | "DISCONTINUED";

/** Identifier match quality. */
export type IdentifierMatchQuality = "exact" | "partial" | "none" | "conflict";

/** Brand match quality. */
export type BrandMatchQuality = "exact" | "similar" | "none";

/** Name match quality. */
export type NameMatchQuality = "exact" | "high" | "medium" | "low" | "none";

/** Variant match quality. */
export type VariantMatchQuality = "exact" | "compatible" | "different" | "none";

/** Quantity match quality. */
export type QuantityMatchQuality = "exact" | "compatible" | "different" | "none";

/** Pack match quality. */
export type PackMatchQuality = "exact" | "compatible" | "different" | "none";

/** Country match quality. */
export type CountryMatchQuality = "exact" | "compatible" | "different" | "none";

/** Manufacturer match quality. */
export type ManufacturerMatchQuality = "exact" | "similar" | "none";

/** Conflict types. */
export type ConflictType =
  | "identifier_collision"
  | "name_conflict"
  | "variant_conflict"
  | "brand_conflict";

/** Conflict severity. */
export type ConflictSeverity = "low" | "medium" | "high" | "critical";

/** Conflict status. */
export type ConflictStatus = "open" | "resolved" | "dismissed" | "superseded";

/** Merge history action. */
export type MergeAction = "merged" | "split" | "superseded" | "overridden";

/** Actor type for decisions. */
export type ActorType = "system" | "ai" | "manual";

/** Method used for matching. */
export type MatchMethod = "deterministic" | "ai" | "manual" | "hybrid";

/** Candidate generation method. */
export type CandidateGenerationMethod = "blocking" | "identifier" | "manual" | "ai";

/** Candidate status. */
export type CandidateStatus =
  | "pending"
  | "processing"
  | "matched"
  | "rejected"
  | "ambiguous"
  | "failed";

// ─── Token Types ─────────────────────────────────────────────────────────────

/** A tokenized product representation. */
export interface ProductToken {
  /** Original raw name. */
  originalName: string;
  /** Normalized full name. */
  normalizedName: string;
  /** Search key (lowercase, no punctuation). */
  searchKey: string;
  /** Detected brand tokens. */
  brandTokens: string[];
  /** Core product term tokens. */
  productTokens: string[];
  /** Variant descriptor tokens. */
  variantTokens: string[];
  /** Detected quantity. */
  quantity: number | null;
  /** Detected unit. */
  unit: string | null;
  /** Pack structure. */
  packCount: number | null;
  perUnitQuantity: number | null;
  perUnitUnit: string | null;
  /** Detected attributes (SPF, formulation, etc.). */
  attributes: Record<string, string>;
  /** All tokens as a flat set for fast comparison. */
  allTokens: Set<string>;
}

// ─── Matching Evidence ───────────────────────────────────────────────────────

/** Structured matching evidence across all dimensions. */
export interface MatchEvidence {
  identifierMatch: IdentifierMatchQuality;
  brandMatch: BrandMatchQuality;
  nameMatch: NameMatchQuality;
  variantMatch: VariantMatchQuality;
  quantityMatch: QuantityMatchQuality;
  packMatch: PackMatchQuality;
  countryMatch: CountryMatchQuality;
  manufacturerMatch: ManufacturerMatchQuality;
  conflictState: string;
  sourceReliability: number | null;
  /** Component similarity scores (0.0–1.0). */
  scores: {
    identifierScore: number;
    brandScore: number;
    nameScore: number;
    variantScore: number;
    quantityScore: number;
    packScore: number;
    overallScore: number;
  };
  /** Human-readable reasons. */
  reasons: string[];
}

/** Result of comparing two product tokens. */
export interface MatchResult {
  decision: MatchDecision;
  confidence: number;
  evidence: MatchEvidence;
  relationshipType: RelationshipType | null;
  reasons: string[];
}

// ─── Product Input ───────────────────────────────────────────────────────────

/** Product data needed for identity resolution. */
export interface ProductIdentityInput {
  id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  brandId: string | null;
  brandName: string | null;
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
    id: string;
    name: string | null;
    normalizedName: string | null;
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

// ─── AI Provider Types ───────────────────────────────────────────────────────

/** AI matching request. */
export interface AIMatchRequest {
  productA: {
    name: string;
    brand: string | null;
    identifiers: string[];
    quantity: string | null;
    variant: string | null;
  };
  productB: {
    name: string;
    brand: string | null;
    identifiers: string[];
    quantity: string | null;
    variant: string | null;
  };
  context?: {
    category?: string;
    country?: string;
  };
}

/** AI matching response (structured). */
export interface AIMatchResponse {
  decision: MatchDecision;
  confidence: number;
  reasons: string[];
  relationshipType: RelationshipType | null;
}

/** AI provider interface. */
export interface AIProvider {
  readonly name: string;
  readonly available: boolean;
  matchProducts(request: AIMatchRequest): Promise<AIMatchResponse>;
}

// ─── Conflict Types ──────────────────────────────────────────────────────────

/** Detected conflict. */
export interface DetectedConflict {
  conflictType: ConflictType;
  severity: ConflictSeverity;
  description: string;
  entityId: string;
  conflictingData: Record<string, unknown>;
}

// ─── Candidate Types ─────────────────────────────────────────────────────────

/** A candidate pair for resolution. */
export interface CandidatePair {
  fromProductId: string;
  toProductId: string;
  generationMethod: CandidateGenerationMethod;
  blockingKey: string | null;
  priority: number;
}
