// =============================================================================
// @exosquad/common — shared types, errors, and validation schemas
// =============================================================================

import { z } from "zod";

// -----------------------------------------------------------------------------
// ERROR HIERARCHY
// -----------------------------------------------------------------------------

/** Base application error. All domain errors extend this. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.context ? { context: this.context } : {}),
      },
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(msg, 404, "NOT_FOUND", { resource, id });
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", { details });
    this.name = "ValidationError";
    this.details = details;
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super("Rate limit exceeded", 429, "RATE_LIMITED", { retryAfter });
    this.name = "RateLimitError";
  }
}

export class SourceError extends AppError {
  constructor(message: string, sourceId?: string, context?: Record<string, unknown>) {
    super(message, 502, "SOURCE_ERROR", { sourceId, ...context });
    this.name = "SourceError";
  }
}

export class EvidenceExtractionError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 422, "EVIDENCE_EXTRACTION_FAILED", context);
    this.name = "EvidenceExtractionError";
  }
}

export class ProvenanceNotFoundError extends AppError {
  constructor(entityType: string, entityId: string) {
    super(`Provenance not found for ${entityType}: ${entityId}`, 404, "PROVENANCE_NOT_FOUND", { entityType, entityId });
    this.name = "ProvenanceNotFoundError";
  }
}

export class EvidenceConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 409, "EVIDENCE_CONFLICT", context);
    this.name = "EvidenceConflictError";
  }
}

// -----------------------------------------------------------------------------
// PHASE 6 — EVIDENCE & PROVENANCE ENUMS
// -----------------------------------------------------------------------------

export const EVIDENCE_TYPES = [
  "PRODUCT_IDENTITY", "PRODUCT_NAME", "PRODUCT_VARIANT", "PRODUCT_IDENTIFIER", "BRAND_IDENTITY",
  "PRICE", "CURRENCY", "AVAILABILITY", "STOCK", "SELLER_LISTING", "SELLER_IDENTITY",
  "SUPPLIER_IDENTITY", "SUPPLIER_OFFER", "SUPPLIER_PRICE", "MOQ", "LEAD_TIME",
  "ORGANIZATION_IDENTITY", "ORGANIZATION_DOMAIN", "ORGANIZATION_EMAIL", "ORGANIZATION_PHONE",
  "ORGANIZATION_ADDRESS", "ORGANIZATION_IDENTIFIER",
  "COMMERCIAL_RELATIONSHIP", "DISTRIBUTOR_RELATIONSHIP", "IMPORTER_RELATIONSHIP",
  "WHOLESALER_RELATIONSHIP", "MANUFACTURER_RELATIONSHIP", "BRAND_OWNER_RELATIONSHIP",
  "AUTHENTICITY", "COUNTRY_OF_ORIGIN", "COUNTRY_OF_SALE",
  "SHIPPING", "LOGISTICS", "MARKET_OBSERVATION",
  "DEMAND_SIGNAL", "SOCIAL_SIGNAL", "SEARCH_SIGNAL", "REVIEW_SIGNAL",
  "IDENTITY_DECISION", "IDENTITY_CONFLICT",
  "CALCULATION_INPUT", "CALCULATION_RESULT",
  "OTHER",
] as const;

export type EvidenceType = typeof EVIDENCE_TYPES[number];

export const EVIDENCE_STATUSES = ["active", "stale", "superseded", "retracted", "invalid", "conflicted"] as const;
export type EvidenceStatus = typeof EVIDENCE_STATUSES[number];

export const FRESHNESS_STATES = ["live", "fresh", "aging", "stale", "unknown"] as const;
export type FreshnessState = typeof FRESHNESS_STATES[number];

export const OBSERVATION_STATUSES = ["observed", "inferred", "probable", "unknown"] as const;
export type ObservationStatus = typeof OBSERVATION_STATUSES[number];

export const EVIDENCE_CONFLICT_STATUSES = ["open", "under_review", "resolved", "dismissed"] as const;
export type EvidenceConflictStatus = typeof EVIDENCE_CONFLICT_STATUSES[number];

export const CLAIM_STATUSES = ["active", "superseded", "retracted", "disputed"] as const;
export type ClaimStatus = typeof CLAIM_STATUSES[number];

export const CALCULATION_STATUSES = ["active", "superseded", "invalid"] as const;
export type CalculationStatus = typeof CALCULATION_STATUSES[number];

export const PROVENANCE_EDGE_TYPES = ["DERIVED_FROM", "SUPPORTS", "CONTRADICTS", "COMPUTED_FROM", "OBSERVED_IN", "EXTRACTED_FROM"] as const;
export type ProvenanceEdgeType = typeof PROVENANCE_EDGE_TYPES[number];

// -----------------------------------------------------------------------------
// PHASE 7 — DEMAND & TREND INTELLIGENCE ENUMS
// -----------------------------------------------------------------------------

export const SIGNAL_TYPES = [
  "SEARCH", "SOCIAL", "MARKETPLACE", "SELLER_COUNT", "LISTING_COUNT",
  "REVIEW_COUNT", "REVIEW_VELOCITY", "PRICE", "PRICE_CHANGE",
  "AVAILABILITY", "STOCK", "RANK", "RATING", "ENGAGEMENT",
  "MENTION", "QUERY_VOLUME", "QUERY_GROWTH", "PRODUCT_ACTIVITY",
] as const;
export type SignalType = typeof SIGNAL_TYPES[number];

export const DEMAND_STATES = [
  "EMERGING", "GROWING", "ESTABLISHED", "STABLE",
  "DECLINING", "VOLATILE", "SEASONAL", "INSUFFICIENT_DATA",
] as const;
export type DemandState = typeof DEMAND_STATES[number];

export const TREND_STATES = [
  "STRONG_UPTREND", "UPTREND", "STABLE", "DOWNWARD",
  "STRONG_DOWNTREND", "VOLATILE", "SEASONAL", "INSUFFICIENT_DATA",
] as const;
export type TrendState = typeof TREND_STATES[number];

export const ACCELERATION_STATES = [
  "ACCELERATING", "GROWING_STEADILY", "STABLE",
  "DECELERATING", "DECLINING", "VOLATILE", "INSUFFICIENT_DATA",
] as const;
export type AccelerationState = typeof ACCELERATION_STATES[number];

export const DATA_SUFFICIENCY = [
  "SUFFICIENT", "LIMITED", "INSUFFICIENT", "STALE", "CONFLICTED",
] as const;
export type DataSufficiency = typeof DATA_SUFFICIENCY[number];

export const DATA_QUALITY_STATES = [
  "VALID", "PARTIAL", "SUSPECT", "INVALID", "MISSING",
] as const;
export type DataQualityState = typeof DATA_QUALITY_STATES[number];

export const GRANULARITY_LEVELS = ["minute", "hour", "day", "week", "month"] as const;
export type Granularity = typeof GRANULARITY_LEVELS[number];

export const DEMAND_WINDOWS = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;
export type DemandWindow = typeof DEMAND_WINDOWS[number];

export const GEOGRAPHY_SCOPES = [
  "global", "region", "country", "BD", "source_market",
] as const;
export type GeographyScope = typeof GEOGRAPHY_SCOPES[number];

export const DEMAND_CALCULATION_TYPES = [
  "current_demand", "demand_growth", "demand_acceleration",
  "demand_velocity", "trend_classification", "momentum",
  "seasonality", "persistence", "volatility", "price_activity",
  "seller_activity", "review_velocity", "availability_signal",
  "market_activity", "bangladesh_demand",
] as const;
export type DemandCalculationType = typeof DEMAND_CALCULATION_TYPES[number];

// -----------------------------------------------------------------------------
// PHASE 8 — DECISION INTELLIGENCE & RESELLER OPPORTUNITY ENGINE ENUMS
// -----------------------------------------------------------------------------

export const OPPORTUNITY_STATUSES = [
  "DETECTED", "VALIDATED", "WATCH", "ACTIONABLE", "DISMISSED", "EXPIRED",
] as const;
export type OpportunityStatus = typeof OPPORTUNITY_STATUSES[number];

export const OPPORTUNITY_TYPES = [
  "EMERGING_PRODUCT", "GROWING_PRODUCT", "SUSTAINED_DEMAND",
  "SEASONAL_OPPORTUNITY", "GEOGRAPHIC_OPPORTUNITY",
  "MOMENTUM_OPPORTUNITY", "UNDEREXPLORED_CATEGORY",
] as const;
export type OpportunityType = typeof OPPORTUNITY_TYPES[number];

export const OPPORTUNITY_EVIDENCE_TYPES = [
  "DEMAND_GROWTH", "DEMAND_VELOCITY", "DEMAND_PERSISTENCE",
  "SOURCE_DIVERSITY", "SEASONALITY", "ACCELERATION",
  "CROSS_SIGNAL_AGREEMENT",
] as const;
export type OpportunityEvidenceType = typeof OPPORTUNITY_EVIDENCE_TYPES[number];

export const OPPORTUNITY_RISK_TYPES = [
  "LOW_DEMAND_CONFIDENCE", "HIGH_VOLATILITY", "SEASONAL_DEPENDENCY",
  "SOURCE_CONFLICT", "HIGH_COMPETITION", "LOW_MARGIN",
  "SUPPLIER_UNCERTAINTY", "PRICE_UNCERTAINTY", "GEOGRAPHIC_LIMITATION",
  "DATA_SPARSE", "STALE_SIGNAL", "COMMERCIAL_DATA_MISSING",
] as const;
export type OpportunityRiskType = typeof OPPORTUNITY_RISK_TYPES[number];

export const OPPORTUNITY_ACTION_TYPES = [
  "INVESTIGATE_SUPPLIERS", "CHECK_COMPETITORS", "VERIFY_PRICE",
  "RUN_SMALL_TEST", "WATCH_DEMAND", "INVESTIGATE_SOURCE_CONFLICT",
  "CHECK_SEASONALITY", "CHECK_LOCAL_AVAILABILITY", "COMPARE_IMPORT_COST",
] as const;
export type OpportunityActionType = typeof OPPORTUNITY_ACTION_TYPES[number];

export const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type SeverityLevel = typeof SEVERITY_LEVELS[number];

export const PRIORITY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type PriorityLevel = typeof PRIORITY_LEVELS[number];

// -----------------------------------------------------------------------------
// PHASE 8 (ORIGINAL ROADMAP) — AUTHENTICITY INTELLIGENCE ENUMS
// -----------------------------------------------------------------------------

export const AUTHENTICITY_STATUSES = [
  "UNASSESSED", "INSUFFICIENT_EVIDENCE", "VERIFIED", "LIKELY_AUTHENTIC",
  "UNCERTAIN", "SUSPICIOUS", "LIKELY_COUNTERFEIT", "CONTRADICTED",
] as const;
export type AuthenticityStatusType = typeof AUTHENTICITY_STATUSES[number];

export const AUTHENTICITY_SUBJECT_TYPES = [
  "PRODUCT", "SKU", "BRAND", "SELLER", "SUPPLIER", "LISTING", "DOCUMENT",
] as const;
export type AuthenticitySubjectType = typeof AUTHENTICITY_SUBJECT_TYPES[number];

export const AUTHENTICITY_SIGNAL_TYPES = [
  // Product identity
  "PRODUCT_IDENTITY_MATCH", "SKU_MATCH", "MODEL_NUMBER_MATCH",
  "BARCODE_MATCH", "VARIANT_MATCH", "SPECIFICATION_MATCH", "PACK_SIZE_MATCH",
  // Brand/manufacturer
  "BRAND_MATCH", "MANUFACTURER_MATCH", "OFFICIAL_PRODUCT_REFERENCE",
  "MANUFACTURER_RELATIONSHIP", "AUTHORIZED_DISTRIBUTOR_EVIDENCE",
  // Seller
  "SELLER_IDENTITY_MATCH", "SELLER_HISTORY", "SELLER_AUTHORIZATION",
  "SELLER_CONTACT_CONSISTENCY", "SELLER_SOURCE_CONSISTENCY",
  // Supplier
  "SUPPLIER_IDENTITY_MATCH", "SUPPLIER_MANUFACTURER_RELATIONSHIP",
  "SUPPLIER_DOCUMENTATION", "SUPPLIER_CATALOG_CONSISTENCY",
  "SUPPLIER_CONTACT_CONSISTENCY",
  // Listing
  "LISTING_CONSISTENCY", "LISTING_METADATA_MATCH", "LISTING_CONTENT_REUSE",
  "LISTING_IMAGE_REUSE", "LISTING_SOURCE_CONFLICT",
  // Documentation
  "DOCUMENT_PRESENT", "DOCUMENT_VALIDATED", "DOCUMENT_UNVALIDATED",
  "DOCUMENT_MISMATCH", "DOCUMENT_CONTRADICTION",
  // Pricing
  "PRICE_ANOMALY", "EXTREME_DISCOUNT", "PRICE_DISPERSION",
  // Cross-source
  "SOURCE_CORROBORATION", "SOURCE_CONTRADICTION", "SOURCE_DISAGREEMENT",
] as const;
export type AuthenticitySignalType = typeof AUTHENTICITY_SIGNAL_TYPES[number];

export const SIGNAL_DIRECTIONS = ["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"] as const;
export type SignalDirection = typeof SIGNAL_DIRECTIONS[number];

export const EVIDENCE_ROLES = ["SUPPORTING", "CONTRADICTING", "CONTEXTUAL", "UNRESOLVED"] as const;
export type EvidenceRole = typeof EVIDENCE_ROLES[number];

export const EVIDENCE_STRENGTHS = ["DIRECT", "STRONG", "MODERATE", "WEAK", "CONTEXTUAL"] as const;
export type EvidenceStrength = typeof EVIDENCE_STRENGTHS[number];

export const AUTHENTICITY_RISK_TYPES = [
  "IDENTITY_CONTRADICTION", "SOURCE_CONFLICT", "PRICE_ANOMALY",
  "MISSING_EVIDENCE", "UNVERIFIED_CLAIM", "DOCUMENT_MISMATCH",
  "CONTENT_REUSE", "SELLER_INCONSISTENCY", "SUPPLIER_UNCERTAINTY",
  "AUTHORIZATION_GAP",
] as const;
export type AuthenticityRiskType = typeof AUTHENTICITY_RISK_TYPES[number];

/** Authenticity intelligence configuration. */
export const AUTHENTICITY_CONFIG = {
  algorithmVersion: "1.0.0",

  // Evidence strength weights
  evidenceStrengthWeights: {
    DIRECT: 1.0,
    STRONG: 0.8,
    MODERATE: 0.6,
    WEAK: 0.3,
    CONTEXTUAL: 0.2,
  },

  // Signal direction multipliers
  directionMultipliers: {
    POSITIVE: 1.0,
    NEGATIVE: -1.0,
    NEUTRAL: 0.0,
    UNKNOWN: 0.0,
  },

  // Confidence weights
  confidenceWeights: {
    evidenceQuantity: 0.20,
    evidenceQuality: 0.25,
    independence: 0.20,
    completeness: 0.15,
    consistency: 0.20,
  },

  // Score thresholds for status classification
  statusThresholds: {
    verified: 90,
    likelyAuthentic: 70,
    uncertain: 40,
    suspicious: 25,
    // Below suspicious → LIKELY_COUNTERFEIT
  },

  // Minimum evidence for confident assessment
  minimumEvidenceForHighConfidence: 5,
  minimumSourcesForIndependence: 2,

  // Contradiction penalty
  contradictionPenaltyFactor: 0.15,
} as const;

/** Phase 8 opportunity configuration thresholds. */
export const OPPORTUNITY_CONFIG = {
  algorithmVersion: "8.0.0",

  minimumSignalConfidence: 0.50,
  minimumPersistence: 0.40,
  minimumEvidenceSources: 2,

  actionableScore: 75,
  watchScore: 50,

  staleSignalDays: 30,

  // Confidence weights
  confidenceWeights: {
    signal: 0.30,
    sourceDiversity: 0.20,
    persistence: 0.20,
    completeness: 0.15,
    agreement: 0.15,
  },

  // Score weights
  scoreWeights: {
    demandStrength: 0.25,
    demandMomentum: 0.20,
    demandPersistence: 0.15,
    confidence: 0.20,
    riskAdjustment: 0.20,
  },
} as const;

// -----------------------------------------------------------------------------
// PHASE 9 — SUPPLY-CHAIN TRACING & PROVENANCE GRAPH ENGINE ENUMS
// -----------------------------------------------------------------------------

export const SC_NODE_TYPES = [
  "PRODUCT", "SKU", "BRAND", "MANUFACTURER",
  "AUTHORIZED_DISTRIBUTOR", "DISTRIBUTOR",
  "SUPPLIER", "SELLER",
  "LISTING", "OFFER",
  "FULFILLMENT_PROVIDER", "WAREHOUSE",
  "EXPORTER", "IMPORTER",
  "ORIGIN_COUNTRY", "ORIGIN_REGION", "ORIGIN_CITY",
  "PORT", "TRADE_ROUTE",
  "SHIPMENT", "TRADE_OBSERVATION",
  "DESTINATION_COUNTRY", "DESTINATION_REGION", "DESTINATION_CITY",
  "BANGLADESH_MARKET_ENTITY", "BANGLADESH_IMPORTER",
  "BANGLADESH_DISTRIBUTOR", "BANGLADESH_RESELLER",
  "UNKNOWN",
] as const;
export type SCNodeType = typeof SC_NODE_TYPES[number];

export const SC_EDGE_TYPES = [
  "BRAND_MANUFACTURES_PRODUCT", "MANUFACTURER_PRODUCES_SKU",
  "MANUFACTURER_DISTRIBUTES", "MANUFACTURER_SUPPLIES", "MANUFACTURER_EXPORTS",
  "AUTHORIZED_DISTRIBUTOR_DISTRIBUTES", "DISTRIBUTOR_SUPPLIES",
  "SUPPLIER_SUPPLIES", "SUPPLIER_SOURCES_FROM",
  "SELLER_PURCHASES_FROM", "SELLER_SUPPLIES", "SELLER_LISTS", "SELLER_OFFERS",
  "LISTING_REPRESENTS_PRODUCT", "LISTING_OFFERS_SKU",
  "FULFILLMENT_BY", "STORED_AT",
  "ORIGINATED_FROM", "EXPORTED_FROM", "IMPORTED_TO",
  "EXPORTER_EXPORTS", "IMPORTER_IMPORTS",
  "SHIPMENT_FROM", "SHIPMENT_TO",
  "TRADE_OBSERVATION_SUPPORTS",
  "DESTINATION_TO", "SOLD_IN_MARKET",
  "BANGLADESH_IMPORTER_DISTRIBUTES", "BANGLADESH_DISTRIBUTOR_SUPPLIES",
  "BANGLADESH_SUPPLIER_SUPPLIES", "BANGLADESH_RESELLER_SELLS",
] as const;
export type SCEdgeType = typeof SC_EDGE_TYPES[number];

export const SC_RELATIONSHIP_STATUSES = [
  "OBSERVED", "CLAIMED", "INFERRED", "CORROBORATED", "CONFIRMED", "CONTRADICTED", "UNKNOWN",
] as const;
export type SCRelationshipStatus = typeof SC_RELATIONSHIP_STATUSES[number];

export const SC_CONFLICT_RESOLUTION_STATES = [
  "OPEN", "RESOLVED", "SUPERSEDED", "UNRESOLVED",
] as const;
export type SCConflictResolutionState = typeof SC_CONFLICT_RESOLUTION_STATES[number];

export const SC_CONFLICT_TYPES = [
  "CONTRADICTORY_MANUFACTURER", "CONTRADICTORY_ORIGIN", "TEMPORAL_OVERLAP",
  "SUSPICIOUS_SHORTCUT", "SELF_LOOP", "INVALID_RELATIONSHIP", "CONTRADICTORY_EVIDENCE",
] as const;
export type SCConflictType = typeof SC_CONFLICT_TYPES[number];

export const SC_ANOMALY_TYPES = [
  "INVALID_RELATIONSHIP", "SELF_LOOP", "CONTRADICTORY_MANUFACTURER",
  "CONTRADICTORY_ORIGIN", "TEMPORAL_OVERLAP", "SUSPICIOUS_SHORTCUT", "CYCLE_DETECTED",
] as const;
export type SCAnomalyType = typeof SC_ANOMALY_TYPES[number];

export const SC_VERIFICATION_TYPES = [
  "VERIFY_SUPPLIER_AUTHORIZATION", "VERIFY_MANUFACTURER_RELATIONSHIP",
  "VERIFY_EXPORTER_IDENTITY", "VERIFY_IMPORTER_IDENTITY",
  "VERIFY_ORIGIN", "VERIFY_TRADE_ROUTE", "VERIFY_BANGLADESH_DISTRIBUTOR",
] as const;
export type SCVerificationType = typeof SC_VERIFICATION_TYPES[number];

export const SC_CLAIM_TYPES = [
  "AUTHORIZED_DISTRIBUTOR", "FACTORY_DIRECT", "OFFICIAL_IMPORTER",
  "MANUFACTURER", "EXCLUSIVE_DISTRIBUTOR", "OEM_MANUFACTURER", "ORIGINAL_SUPPLIER",
] as const;
export type SCClaimType = typeof SC_CLAIM_TYPES[number];

export const SC_ASSESSMENT_STATUSES = [
  "PENDING", "COMPLETE", "STALE", "CONTRADICTED", "INSUFFICIENT",
] as const;
export type SCAssessmentStatus = typeof SC_ASSESSMENT_STATUSES[number];

export const SC_EVIDENCE_ROLES = ["SUPPORTING", "CONTRADICTING", "CONTEXTUAL", "UNRESOLVED"] as const;
export type SCEvidenceRole = typeof SC_EVIDENCE_ROLES[number];

export const SC_EVIDENCE_STRENGTHS = ["DIRECT", "STRONG", "MODERATE", "WEAK", "CONTEXTUAL"] as const;
export type SCEvidenceStrength = typeof SC_EVIDENCE_STRENGTHS[number];

/** Supply-chain intelligence configuration. */
export const SUPPLY_CHAIN_CONFIG = {
  algorithmVersion: "SUPPLY_CHAIN_ALGORITHM_V1",

  confidenceWeights: {
    evidenceStrength: 0.25,
    sourceIndependence: 0.20,
    identityConfidence: 0.20,
    directness: 0.15,
    corroboration: 0.10,
    temporalFreshness: 0.10,
  },

  directnessValues: {
    OBSERVED: 1.0, CONFIRMED: 0.95, CORROBORATED: 0.9,
    INFERRED: 0.6, CLAIMED: 0.5, UNKNOWN: 0.0, CONTRADICTED: 0.3,
  },

  evidenceStrengthValues: {
    DIRECT: 1.0, STRONG: 0.8, MODERATE: 0.6, WEAK: 0.3, CONTEXTUAL: 0.2,
  },

  temporalFreshnessDecay: [
    { maxDays: 7, value: 1.0 }, { maxDays: 30, value: 0.8 },
    { maxDays: 90, value: 0.6 }, { maxDays: 180, value: 0.4 },
    { maxDays: 365, value: 0.2 }, { maxDays: Infinity, value: 0.1 },
  ],

  contradictionPenaltyFactor: 0.15,

  confirmationRules: {
    minSourceDiversity: 3,
    minDirectEvidence: true,
    minIdentityConfidence: 0.8,
    minEvidenceStrength: 0.7,
    noUnresolvedContradictions: true,
  },

  corroborationRules: {
    minSourceDiversity: 2,
    requireConsistency: true,
  },

  traversalDefaults: {
    maxDepth: 10,
    defaultMaxDepth: 5,
  },

  statusProgression: {
    unknownToObserved: { minEvidence: 1 },
    observedToCorroborated: { minSourceDiversity: 2 },
    corroboratedToConfirmed: { minSourceDiversity: 3, minIdentityConfidence: 0.8, minEvidenceStrength: 0.7 },
  },
} as const;

// -----------------------------------------------------------------------------
// PHASE 10 — LOGISTICS & ROUTING INTELLIGENCE ENGINE ENUMS
// -----------------------------------------------------------------------------

export const LOGISTICS_NODE_TYPES = [
  "ORIGIN", "DESTINATION", "PORT", "AIRPORT", "BORDER_CROSSING",
  "WAREHOUSE", "DISTRIBUTION_CENTER", "TRANSLOAD_HUB",
  "CONSOLIDATION_HUB", "DECONSOLIDATION_HUB", "FULFILLMENT_CENTER",
  "MANUFACTURER_LOCATION", "SUPPLIER_LOCATION",
  "EXPORTER_LOCATION", "IMPORTER_LOCATION",
  "BANGLADESH_DISTRIBUTION_POINT", "BANGLADESH_WAREHOUSE",
  "BANGLADESH_MARKET", "CUSTOMS_POINT", "OTHER_LOGISTICS_NODE",
] as const;
export type LogisticsNodeType = typeof LOGISTICS_NODE_TYPES[number];

export const LOGISTICS_LEG_TYPES = [
  "ROAD", "RAIL", "SEA", "AIR", "INLAND_WATERWAY",
  "MULTIMODAL", "COURIER", "PARCEL", "TRUCK", "CONTAINER", "OTHER",
] as const;
export type LogisticsLegType = typeof LOGISTICS_LEG_TYPES[number];

export const LOGISTICS_ROUTE_STATUSES = [
  "OBSERVED", "CLAIMED", "INFERRED", "CORROBORATED", "CONFIRMED", "CONTRADICTED", "UNKNOWN",
] as const;
export type LogisticsRouteStatus = typeof LOGISTICS_ROUTE_STATUSES[number];

export const LOGISTICS_AVAILABILITY_STATUSES = [
  "AVAILABLE", "UNAVAILABLE", "UNKNOWN", "UNRESOLVED",
] as const;
export type LogisticsAvailabilityStatus = typeof LOGISTICS_AVAILABILITY_STATUSES[number];

export const LOGISTICS_RISK_TYPES = [
  "EXCESSIVE_TRANSSHIPMENTS", "EXCESSIVE_MODE_CHANGES", "MISSING_LEG",
  "UNKNOWN_TRANSIT_TIME", "LOW_EVIDENCE_COVERAGE", "STALE_OBSERVATION",
  "CONTRADICTORY_EVIDENCE", "ROUTE_CYCLE", "UNAVAILABLE_NODE",
  "UNAVAILABLE_MODE", "BORDER_CUSTOMS_UNCERTAINTY", "CARRIER_UNCERTAINTY",
  "DESTINATION_UNCERTAINTY", "ORIGIN_UNCERTAINTY", "TEMPORAL_CONFLICT",
  "ROUTE_COMPLETENESS_FAILURE",
] as const;
export type LogisticsRiskType = typeof LOGISTICS_RISK_TYPES[number];

export const LOGISTICS_ANOMALY_TYPES = [
  "SELF_LOOP", "CYCLE_DETECTED", "INVALID_MODE_NODE_COMBINATION",
  "IMPOSSIBLE_TRANSITION", "MISSING_ORIGIN", "MISSING_DESTINATION",
  "DUPLICATE_LEG", "SUSPICIOUS_SHORTCUT", "CONTRADICTORY_TIMING",
  "STALE_ROUTE", "DISCONNECTED_ROUTE", "UNSUPPORTED_TRANSPORT_MODE",
] as const;
export type LogisticsAnomalyType = typeof LOGISTICS_ANOMALY_TYPES[number];

export const LOGISTICS_OBSERVATION_TYPES = [
  "ROUTE_AVAILABLE", "TRANSIT_TIME", "CARRIER_CLAIM", "PORT_STATUS",
  "BORDER_CONDITION", "MODE_AVAILABILITY", "CAPACITY", "RESTRICTION",
  "CUSTOMS_INFO", "OTHER",
] as const;
export type LogisticsObservationType = typeof LOGISTICS_OBSERVATION_TYPES[number];

export const LOGISTICS_EVIDENCE_ROLES = ["SUPPORTING", "CONTRADICTING", "CONTEXTUAL", "UNRESOLVED"] as const;
export type LogisticsEvidenceRole = typeof LOGISTICS_EVIDENCE_ROLES[number];

export const LOGISTICS_EVIDENCE_STRENGTHS = ["DIRECT", "STRONG", "MODERATE", "WEAK", "CONTEXTUAL"] as const;
export type LogisticsEvidenceStrength = typeof LOGISTICS_EVIDENCE_STRENGTHS[number];

export const LOGISTICS_ASSESSMENT_STATUSES = [
  "PENDING", "COMPLETE", "STALE", "CONTRADICTED", "INSUFFICIENT",
] as const;
export type LogisticsAssessmentStatus = typeof LOGISTICS_ASSESSMENT_STATUSES[number];

export const LOGISTICS_CONFLICT_TYPES = [
  "CONTRADICTORY_TRANSIT_TIME", "CONTRADICTORY_CARRIER",
  "CONTRADICTORY_ROUTE_AVAILABILITY", "CONTRADICTORY_NODE_STATUS",
  "CONTRADICTORY_TEMPORAL", "CONTRADICTORY_CAPACITY", "CONTRADICTORY_EVIDENCE",
] as const;
export type LogisticsConflictType = typeof LOGISTICS_CONFLICT_TYPES[number];

/** Logistics intelligence configuration. */
export const LOGISTICS_CONFIG = {
  algorithmVersion: "LOGISTICS_ALGORITHM_V1",

  confidenceWeights: {
    evidenceStrength: 0.25,
    sourceIndependence: 0.20,
    carrierConfidence: 0.15,
    directness: 0.15,
    corroboration: 0.15,
    temporalFreshness: 0.10,
  },

  directnessValues: {
    OBSERVED: 1.0, CONFIRMED: 0.95, CORROBORATED: 0.9,
    INFERRED: 0.6, CLAIMED: 0.5, UNKNOWN: 0.0, CONTRADICTED: 0.3,
  },

  evidenceStrengthValues: {
    DIRECT: 1.0, STRONG: 0.8, MODERATE: 0.6, WEAK: 0.3, CONTEXTUAL: 0.2,
  },

  temporalFreshnessDecay: [
    { maxDays: 7, value: 1.0 }, { maxDays: 30, value: 0.8 },
    { maxDays: 90, value: 0.6 }, { maxDays: 180, value: 0.4 },
    { maxDays: 365, value: 0.2 }, { maxDays: Infinity, value: 0.1 },
  ],

  contradictionPenaltyFactor: 0.15,

  riskThresholds: {
    maxTransshipments: 3,
    maxModeChanges: 2,
    minEvidenceCoverage: 0.5,
    staleObservationDays: 180,
  },

  traversalDefaults: {
    maxDepth: 10,
    defaultMaxDepth: 5,
    maxRoutes: 20,
  },

  completenessWeights: {
    originKnown: 0.10,
    destinationKnown: 0.10,
    legsKnown: 0.20,
    modeKnown: 0.10,
    timingKnown: 0.15,
    carrierKnown: 0.10,
    evidenceCoverage: 0.15,
    temporalCoverage: 0.10,
  },
} as const;

// -----------------------------------------------------------------------------
// PHASE 11 — LANDED COST, PRICING & MARGIN INTELLIGENCE ENGINE ENUMS
// -----------------------------------------------------------------------------

export const PRICING_SOURCE_TYPES = [
  "SUPPLIER_QUOTE", "MARKETPLACE_LISTING", "WHOLESALE", "RETAIL",
  "DISTRIBUTOR", "CUSTOMS_DECLARATION", "TRADE_DATA", "OTHER",
] as const;
export type PricingSourceType = typeof PRICING_SOURCE_TYPES[number];

export const PRICE_OBSERVATION_TYPES = [
  "PRODUCT_COST", "FREIGHT", "INSURANCE", "DUTY", "TAX",
  "PORT_CHARGE", "CUSTOMS_FEE", "CLEARING_FEE", "INLAND_TRANSPORT",
  "WAREHOUSE", "PLATFORM_FEE", "COMMISSION", "MARKETING", "DELIVERY",
  "SELLING_PRICE", "COMPETITOR_PRICE", "EXCHANGE_RATE", "OTHER",
] as const;
export type PriceObservationType = typeof PRICE_OBSERVATION_TYPES[number];

export const PRICE_BASES = [
  "UNIT", "PACK", "CASE", "CARTON", "PALLET", "CONTAINER", "KG", "LITER", "OTHER",
] as const;
export type PriceBasis = typeof PRICE_BASES[number];

export const COST_COMPONENT_TYPES = [
  "PRODUCT_COST", "PACKAGING", "INLAND_ORIGIN", "EXPORT_HANDLING",
  "FREIGHT", "INSURANCE", "PORT", "CUSTOMS", "DUTY", "VAT",
  "AIT", "ATV", "CD", "SD", "RD", "CLEARING", "INLAND_BANGLADESH",
  "WAREHOUSE", "PAYMENT", "PLATFORM", "OTHER",
] as const;
export type CostComponentType = typeof COST_COMPONENT_TYPES[number];

export const COST_STATUSES = [
  "OBSERVED", "ESTIMATED", "UNKNOWN", "DISPUTED", "EXPIRED",
] as const;
export type CostStatus = typeof COST_STATUSES[number];

export const PRICING_CALCULATION_STATUSES = [
  "PENDING", "COMPLETE", "STALE", "CONTRADICTED", "INSUFFICIENT",
] as const;
export type PricingCalculationStatus = typeof PRICING_CALCULATION_STATUSES[number];

export const MARGIN_TYPES = [
  "GROSS_PROFIT", "GROSS_MARGIN", "MARKUP", "NET_MARGIN", "CONTRIBUTION_MARGIN",
] as const;
export type MarginType = typeof MARGIN_TYPES[number];

export const PRICE_SCENARIO_TYPES = [
  "CONSERVATIVE", "BASE", "UPSIDE",
  "IMPORT_WHOLESALE", "IMPORT_RETAIL", "MARKETPLACE",
  "DISTRIBUTOR", "DIRECT_TO_CONSUMER",
] as const;
export type PriceScenarioType = typeof PRICE_SCENARIO_TYPES[number];

export const PRICING_RISK_TYPES = [
  "UNKNOWN_FREIGHT", "UNKNOWN_DUTY", "UNKNOWN_TAX", "UNKNOWN_CLEARING",
  "CURRENCY_UNCERTAINTY", "HIGH_LOGISTICS_COST", "SUPPLIER_PRICE_UNCERTAINTY",
  "INSUFFICIENT_PRICE_OBSERVATIONS", "LARGE_PRICE_SPREAD", "STALE_OBSERVATIONS",
  "RAPID_PRICE_CHANGE", "SPECIFICATION_INCONSISTENCY", "PACKAGE_SIZE_MISMATCH",
  "INCOMPARABLE_UNITS", "INSUFFICIENT_MARGIN_INPUTS", "SELLING_BELOW_COST",
  "HIGH_PLATFORM_FEES", "HIGH_DELIVERY_COST", "NARROW_MARGIN_RANGE",
] as const;
export type PricingRiskType = typeof PRICING_RISK_TYPES[number];

export const PRICE_TREND_DIRECTIONS = [
  "RISING", "STABLE", "DECLINING", "VOLATILE", "UNKNOWN",
] as const;
export type PriceTrendDirection = typeof PRICE_TREND_DIRECTIONS[number];

export const PRICE_CONFIDENCE_BANDS = [
  "HIGH", "MEDIUM", "LOW", "INSUFFICIENT_DATA",
] as const;
export type PriceConfidenceBand = typeof PRICE_CONFIDENCE_BANDS[number];

export const PRICE_POSITION_TYPES = [
  "BELOW_MARKET", "LOWER_MARKET", "MID_MARKET", "UPPER_MARKET", "ABOVE_MARKET", "UNKNOWN",
] as const;
export type PricePositionType = typeof PRICE_POSITION_TYPES[number];

/** Pricing intelligence configuration. */
export const PRICING_CONFIG = {
  algorithmVersion: "PRICING_ALGORITHM_V1",

  // Staleness thresholds
  staleObservationThresholdDays: 180,
  staleExchangeRateThresholdDays: 30,

  // Market aggregation rules
  minimumComparableObservations: 3,
  minimumObservationsForStatistics: 5,
  minimumObservationsForMedian: 3,
  minimumObservationsForQuartiles: 5,

  // Supported currencies (ISO 4217)
  supportedCurrencies: [
    "USD", "BDT", "EUR", "GBP", "CNY", "JPY", "INR", "KRW",
    "THB", "VND", "IDR", "MYR", "SGD", "HKD", "TWD", "AUD",
  ],

  // Default target currency
  defaultTargetCurrency: "BDT",

  // Confidence weights
  confidenceWeights: {
    evidenceQuality: 0.25,
    evidenceQuantity: 0.20,
    sourceIndependence: 0.20,
    temporalFreshness: 0.15,
    completeness: 0.20,
  },

  // Price position thresholds (percentile-based)
  pricePositionThresholds: {
    belowMarket: 0.10,   // below P10
    lowerMarket: 0.25,   // P10–P25
    midMarket: 0.75,     // P25–P75
    upperMarket: 0.90,   // P75–P90
    aboveMarket: 1.00,   // above P90
  },

  // Risk thresholds
  riskThresholds: {
    highPriceSpreadPercentage: 0.50,  // 50% spread is high risk
    criticalPriceSpreadPercentage: 1.0, // 100% spread is critical
    narrowMarginThreshold: 0.05,      // 5% margin is narrow
    highPlatformFeePercentage: 0.20,  // 20% of selling price
    highDeliveryCostPercentage: 0.15, // 15% of selling price
    highLogisticsCostPercentage: 0.30, // 30% of product cost
    rapidPriceChangeThreshold: 0.20,  // 20% change in 30 days
  },

  // Scenario rules
  scenarioRules: {
    conservativeCostMultiplier: 1.0,  // use actual high-cost observations
    conservativePricePercentile: 0.25, // use P25 for selling price
    baseCostPercentile: 0.50,         // use median for cost
    basePricePercentile: 0.50,        // use median for price
    upsideCostPercentile: 0.25,       // use P25 for cost
    upsidePricePercentile: 0.75,      // use P75 for price
  },

  // Comparability rules
  comparabilityRules: {
    requireSameCurrency: false,        // currency normalization handles this
    requireSameUnit: true,             // must normalize to same unit
    requireSameBasis: true,            // UNIT vs PACK must be normalized
    allowCrossLevelComparison: false,  // wholesale vs retail not directly comparable
    taxTreatmentMustBeExplicit: true,  // tax-inclusive vs exclusive must be known
  },

  // Completeness weights
  completenessWeights: {
    productCost: 0.25,
    freight: 0.15,
    duty: 0.10,
    tax: 0.10,
    insurance: 0.05,
    portCosts: 0.05,
    clearing: 0.05,
    inlandTransport: 0.10,
    marketPrices: 0.15,
  },
} as const;

// -----------------------------------------------------------------------------
// PHASE 12 — PRODUCT OPPORTUNITY, COMPETITION & RESELLER VIABILITY ENUMS
// -----------------------------------------------------------------------------

export const PRODUCT_OPP_SIGNAL_TYPES = [
  "STRONG_DEMAND_GROWTH", "WEAK_DEMAND", "DEMAND_DECLINE", "DEMAND_VOLATILITY",
  "SEASONALITY_DETECTED", "LOW_COMPETITOR_DENSITY", "HIGH_COMPETITION",
  "MARKET_SATURATION", "PRICE_COMPRESSION", "WIDE_PRICE_SPREAD",
  "HIGH_PRICE_VOLATILITY", "MULTIPLE_SUPPLIER_OPTIONS", "HIGH_SUPPLIER_CONCENTRATION",
  "SUPPLIER_DIVERSITY", "HIGH_LOGISTICS_COMPLEXITY", "LOGISTICS_UNCERTAINTY",
  "NARROW_MARGIN_RANGE", "LOW_MARGIN", "HIGH_LANDED_COST",
  "LOW_DATA_COMPLETENESS", "SPECIFICATION_AMBIGUITY", "PRICE_ANOMALY",
] as const;
export type ProductOppSignalType = typeof PRODUCT_OPP_SIGNAL_TYPES[number];

export const COMPETITION_LEVELS = [
  "VERY_LOW", "LOW", "MODERATE", "HIGH", "VERY_HIGH", "UNKNOWN",
] as const;
export type CompetitionLevel = typeof COMPETITION_LEVELS[number];

export const COMPETITION_STRUCTURES = [
  "MONOPOLY", "DUOPOLY", "OLIGOPOLY", "COMPETITIVE", "FRAGMENTED", "UNKNOWN",
] as const;
export type CompetitionStructure = typeof COMPETITION_STRUCTURES[number];

export const DEMAND_MOMENTUMS = [
  "ACCELERATING", "GROWING", "STABLE", "DECLINING", "VOLATILE", "UNKNOWN",
] as const;
export type DemandMomentum = typeof DEMAND_MOMENTUMS[number];

export const MARKET_SATURATION_LEVELS = [
  "LOW", "MODERATE", "HIGH", "VERY_HIGH", "UNKNOWN",
] as const;
export type MarketSaturationLevel = typeof MARKET_SATURATION_LEVELS[number];

export const SUPPLIER_CONCENTRATION_LEVELS = [
  "DIVERSIFIED", "MODERATELY_CONCENTRATED", "CONCENTRATED", "HIGHLY_CONCENTRATED", "UNKNOWN",
] as const;
export type SupplierConcentrationLevel = typeof SUPPLIER_CONCENTRATION_LEVELS[number];

export const PRICE_COMPETITION_LEVELS = [
  "LOW", "MODERATE", "HIGH", "VERY_HIGH", "UNKNOWN",
] as const;
export type PriceCompetitionLevel = typeof PRICE_COMPETITION_LEVELS[number];

export const RESELLER_VIABILITY_BANDS = [
  "VERY_LOW", "LOW", "MODERATE", "HIGH", "VERY_HIGH", "UNKNOWN",
] as const;
export type ResellerViabilityBand = typeof RESELLER_VIABILITY_BANDS[number];

export const PRODUCT_OPP_RISK_TYPES = [
  "WEAK_DEMAND", "DEMAND_DECLINE", "HIGH_COMPETITION", "MARKET_SATURATION",
  "LOW_MARGIN", "HIGH_PRICE_VOLATILITY", "SUPPLIER_CONCENTRATION",
  "LOGISTICS_COMPLEXITY", "SUPPLY_UNCERTAINTY", "INSUFFICIENT_DATA",
  "SPECIFICATION_AMBIGUITY", "SEASONALITY_RISK", "PRICE_COMPRESSION", "HIGH_LANDED_COST",
] as const;
export type ProductOppRiskType = typeof PRODUCT_OPP_RISK_TYPES[number];

export const PRODUCT_OPP_STATUSES = [
  "DETECTED", "VALIDATED", "WATCH", "ACTIONABLE", "DISMISSED", "EXPIRED",
] as const;
export type ProductOppStatus = typeof PRODUCT_OPP_STATUSES[number];

export const OPPORTUNITY_CONFIDENCE_BANDS = [
  "HIGH", "MEDIUM", "LOW", "INSUFFICIENT_DATA",
] as const;
export type OpportunityConfidenceBand = typeof OPPORTUNITY_CONFIDENCE_BANDS[number];

export const DATA_COMPLETENESS_BANDS = [
  "HIGH", "MODERATE", "LOW", "VERY_LOW", "UNKNOWN",
] as const;
export type DataCompletenessBand = typeof DATA_COMPLETENESS_BANDS[number];

// Reuse SIGNAL_DIRECTIONS / SignalDirection from Authenticity phase (line 305)

export const RISK_SEVERITIES = [
  "LOW", "MODERATE", "HIGH", "CRITICAL",
] as const;
export type RiskSeverity = typeof RISK_SEVERITIES[number];

export const AFFECTED_DIMENSIONS = [
  "DEMAND", "COMPETITION", "SUPPLY", "LOGISTICS", "PRICING", "DATA",
] as const;
export type AffectedDimension = typeof AFFECTED_DIMENSIONS[number];

export const OPPORTUNITY_LEVELS = [
  "VERY_LOW", "LOW", "MODERATE", "HIGH", "VERY_HIGH",
] as const;
export type OpportunityLevel = typeof OPPORTUNITY_LEVELS[number];

export const VIABILITY_LEVELS = [
  "NOT_VIABLE", "WEAK", "CONDITIONAL", "VIABLE", "STRONG",
] as const;
export type ViabilityLevel = typeof VIABILITY_LEVELS[number];

export const MARKET_GAP_TYPES = [
  "UNDERSUPPLIED", "PRICE_GAP", "COMPETITION_GAP", "AVAILABILITY_GAP", "DEMAND_SUPPLY_GAP",
] as const;
export type MarketGapType = typeof MARKET_GAP_TYPES[number];

export const CONSTRAINT_TYPES = [
  "INSUFFICIENT_MARGIN", "HIGH_MOQ", "HIGH_LANDED_COST", "HIGH_LOGISTICS_COST",
  "LONG_LEAD_TIME", "SUPPLIER_UNCERTAINTY", "HIGH_COMPETITION", "WEAK_DEMAND",
  "REGULATORY_COMPLEXITY", "IMPORT_RESTRICTION", "INSUFFICIENT_EVIDENCE",
] as const;
export type ConstraintType = typeof CONSTRAINT_TYPES[number];

/** Phase 12 — Product opportunity intelligence configuration. */
export const PRODUCT_OPP_CONFIG = {
  algorithmVersion: "OPPORTUNITY_ALGORITHM_V1",

  // Minimum observations for analysis
  minimumCompetitorObservations: 3,
  minimumDemandObservations: 5,
  minimumSupplierObservations: 2,
  minimumPriceObservationsForStatistics: 3,

  // Staleness thresholds (days)
  staleCompetitorObservationThresholdDays: 90,
  staleDemandObservationThresholdDays: 60,
  staleSupplierObservationThresholdDays: 120,

  // Competition thresholds
  competitionThresholds: {
    veryLowMaxCompetitors: 2,
    lowMaxCompetitors: 5,
    moderateMaxCompetitors: 10,
    highMaxCompetitors: 20,
    // > highMaxCompetitors = VERY_HIGH
    lowHHI: 1500, // below 1500 = competitive market
    moderateHHI: 2500, // 1500-2500 = moderate concentration
    // above 2500 = high concentration
  },

  // Saturation thresholds
  saturationThresholds: {
    lowMaxCompetitorDensity: 5,
    moderateMaxCompetitorDensity: 15,
    highMaxCompetitorDensity: 30,
    // > highMaxCompetitorDensity = VERY_HIGH
    lowPriceCompression: 0.10, // CV < 10% = low saturation signal
    highPriceCompression: 0.05, // CV < 5% = strong saturation signal
  },

  // Price compression thresholds
  priceCompressionThresholds: {
    narrowSpreadCV: 0.10, // coefficient of variation < 10% = compressed
    veryNarrowSpreadCV: 0.05, // < 5% = very compressed
    minimumObservations: 5, // need at least 5 observations
  },

  // Risk thresholds
  riskThresholds: {
    weakDemandConfidence: 0.3, // demand confidence < 30% = weak
    highCompetitionMinCompetitors: 15,
    lowMarginThreshold: 0.10, // < 10% margin = low margin risk
    highPriceVolatility: 0.30, // CV > 30% = high volatility
    highSupplierConcentrationHHI: 2500,
    highLogisticsComplexityMinHops: 4,
    insufficientDataCompleteness: 0.40, // < 40% = insufficient data
    narrowMarginRange: 0.05, // 5% range = narrow
  },

  // Confidence weights
  confidenceWeights: {
    demandEvidence: 0.20,
    competitionEvidence: 0.20,
    supplyEvidence: 0.15,
    logisticsEvidence: 0.15,
    pricingEvidence: 0.15,
    dataCompleteness: 0.15,
  },

  // Completeness weights
  completenessWeights: {
    demandData: 0.20,
    competitionData: 0.20,
    supplyData: 0.15,
    logisticsData: 0.15,
    pricingData: 0.15,
    costData: 0.15,
  },

  // Demand momentum classification
  demandMomentumThresholds: {
    acceleratingMinGrowth: 0.20, // > 20% growth = accelerating
    growingMinGrowth: 0.05, // 5-20% = growing
    decliningMaxGrowth: -0.05, // < -5% = declining
    volatileMinCV: 0.30, // CV > 30% = volatile
  },

  // Supplier concentration thresholds
  supplierConcentrationThresholds: {
    diversifiedMinSuppliers: 5,
    moderatelyConcentratedMaxHHI: 1500,
    concentratedMaxHHI: 2500,
    // above 2500 = highly concentrated
  },

  // Opportunity score weights (from supplementary spec)
  opportunityWeights: {
    demand: 0.22,
    margin: 0.22,
    competition: 0.16,
    supply: 0.12,
    logistics: 0.10,
    compliance: 0.10,
    marketFit: 0.08,
  },

  // Opportunity level thresholds (score 0–100)
  opportunityLevelThresholds: {
    veryLowMax: 20,
    lowMax: 40,
    moderateMax: 60,
    highMax: 80,
    // > highMax = VERY_HIGH
  },

  // Viability level thresholds (score 0–100)
  viabilityLevelThresholds: {
    notViableMax: 20,
    weakMax: 40,
    conditionalMax: 60,
    viableMax: 80,
    // > viableMax = STRONG
  },

  // Competition level thresholds (score 0–100)
  competitionLevelThresholds: {
    veryLowMax: 20,
    lowMax: 40,
    moderateMax: 60,
    highMax: 80,
    // > highMax = VERY_HIGH
  },
} as const;

// -----------------------------------------------------------------------------
// VALIDATION SCHEMAS — shared input validation
// -----------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

// -----------------------------------------------------------------------------
// SHARED TYPES
// -----------------------------------------------------------------------------

export type PaginationParams = z.infer<typeof paginationSchema>;
export type SortParams = z.infer<typeof sortSchema>;

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthenticatedRequest {
  userId: string;
  tenantId: string;
  userRole: string;
}

/** Standard health check response shape. */
export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  version: string;
  checks?: Record<string, { status: string; latencyMs?: number }>;
}

// -----------------------------------------------------------------------------
// PHASE 13 — Supplier Discovery, Sourcing & Procurement Intelligence
// -----------------------------------------------------------------------------

/** Phase 13 — Supplier match levels. */
export const SUPPLIER_MATCH_LEVELS = ["no_match", "weak", "possible", "strong", "exact"] as const;
export type SupplierMatchLevel = typeof SUPPLIER_MATCH_LEVELS[number];

/** Phase 13 — Sourcing levels. */
export const SOURCING_LEVELS = ["unavailable", "weak", "possible", "strong", "preferred"] as const;
export type SourcingLevel = typeof SOURCING_LEVELS[number];

/** Phase 13 — Procurement viability levels. */
export const SOURCING_VIABILITY_LEVELS = ["not_viable", "weak", "conditional", "viable", "strong"] as const;
export type SourcingViabilityLevel = typeof SOURCING_VIABILITY_LEVELS[number];

/** Phase 13 — Supplier types. */
export const SUPPLIER_TYPES = [
  "manufacturer", "factory", "brand_owner", "wholesaler",
  "distributor", "trading_company", "exporter", "agent", "unknown",
] as const;
export type SupplierType = typeof SUPPLIER_TYPES[number];

/** Phase 13 — Sourcing constraint types. */
export const SOURCING_CONSTRAINT_TYPES = [
  "HIGH_MOQ", "UNKNOWN_MOQ", "HIGH_CAPITAL_REQUIREMENT", "UNKNOWN_PRICE",
  "HIGH_PRICE", "LONG_LEAD_TIME", "UNKNOWN_LEAD_TIME", "SUPPLIER_IDENTITY_UNCERTAIN",
  "PRODUCT_MATCH_UNCERTAIN", "WEAK_SUPPLIER_EVIDENCE", "INSUFFICIENT_SUPPLIER_EVIDENCE",
  "MISSING_PAYMENT_TERMS", "MISSING_CONTACT", "MISSING_CERTIFICATION",
  "COMPLIANCE_UNCERTAIN", "LOGISTICS_UNCERTAIN",
] as const;
export type SourcingConstraintType = typeof SOURCING_CONSTRAINT_TYPES[number];

/** Phase 13 — Supplier contact types. */
export const SUPPLIER_CONTACT_TYPES = [
  "website", "email", "phone", "whatsapp", "wechat", "address", "marketplace", "other",
] as const;
export type SupplierContactType = typeof SUPPLIER_CONTACT_TYPES[number];

/** Phase 13 — Sourcing explanation factor types. */
export const SOURCING_EXPLANATION_FACTORS = [
  "supplier_match", "supplier_quality", "price", "moq", "lead_time",
  "capital", "evidence", "logistics", "compliance",
] as const;
export type SourcingExplanationFactor = typeof SOURCING_EXPLANATION_FACTORS[number];

/** Phase 13 — Supplier sourcing intelligence configuration. */
export const SOURCING_CONFIG = {
  engineVersion: "phase13-v1",

  // Staleness / freshness (days)
  currentCommercialDataDays: 30,
  currentContactDataDays: 90,
  historicalEvidenceDays: 365,
  staleAssessmentDays: 14,

  // Supplier match weights (sum = 1.0)
  matchWeights: {
    identifier: 0.35,
    productAttributes: 0.25,
    model: 0.15,
    category: 0.10,
    evidence: 0.15,
  },

  // Match level thresholds (score 0–100)
  matchLevelThresholds: {
    exactMin: 90,
    strongMin: 70,
    possibleMin: 45,
    weakMin: 20,
    // < weakMin = no_match
  },

  // Sourcing weights (sum = 1.0)
  sourcingWeights: {
    productMatch: 0.20,
    price: 0.18,
    moq: 0.15,
    leadTime: 0.12,
    supplierQuality: 0.15,
    evidenceConfidence: 0.10,
    commercialCompleteness: 0.10,
  },

  // Sourcing level thresholds (score 0–100)
  sourcingLevelThresholds: {
    preferredMin: 80,
    strongMin: 60,
    possibleMin: 35,
    weakMin: 15,
    // < weakMin = unavailable
  },

  // Viability weights (sum = 1.0, 12 dimensions)
  viabilityWeights: {
    supplierReliability: 0.10,
    supplierEvidence: 0.10,
    productMatch: 0.12,
    moqBurden: 0.10,
    capitalRequirement: 0.08,
    priceTransparency: 0.10,
    leadTimeBurden: 0.08,
    paymentTermAvailability: 0.06,
    logisticsFeasibility: 0.08,
    complianceReadiness: 0.06,
    documentationCompleteness: 0.06,
    contactAvailability: 0.06,
  },

  // Viability level thresholds (score 0–100)
  viabilityLevelThresholds: {
    strongMin: 80,
    viableMin: 60,
    conditionalMin: 35,
    weakMin: 15,
    // < weakMin = not_viable
  },

  // Confidence weights (sum = 1.0)
  confidenceWeights: {
    sourceQuality: 0.25,
    recency: 0.20,
    coverage: 0.15,
    consistency: 0.20,
    independence: 0.20,
  },

  // MOQ thresholds
  moqThresholds: {
    lowMax: 50,        // <= 50 = low burden
    moderateMax: 200,   // 51–200 = moderate
    highMax: 500,       // 201–500 = high
    // > 500 = very_high burden
    highCoverageMonths: 6, // MOQ covers > 6 months = high exposure
  },

  // Lead time thresholds (days)
  leadTimeThresholds: {
    shortMax: 14,       // <= 14 days = short
    moderateMax: 30,    // 15–30 = moderate
    longMax: 60,        // 31–60 = long
    // > 60 = very_long
  },

  // Capital exposure thresholds (USD)
  capitalThresholds: {
    lowMax: 500,
    moderateMax: 2000,
    highMax: 10000,
    // > 10000 = very_high
  },

  // Supplier quality thresholds
  supplierQualityThresholds: {
    veryHighMin: 80,
    highMin: 60,
    moderateMin: 40,
    lowMin: 20,
    // < lowMin = very_low
  },

  // Minimum evidence for reliable assessment
  minimumEvidenceCount: 2,
  minimumSourceCount: 1,

  // Scheduler
  maxAssessJobsPerTenant: 20,
  detectionIntervalHours: 12,
} as const;

// -----------------------------------------------------------------------------
// PHASE 14 — AI RESEARCH & REASONING ENGINE
// -----------------------------------------------------------------------------

/** Phase 14 — Research request statuses. */
export const RESEARCH_REQUEST_STATUSES = [
  "QUEUED", "PLANNING", "RESEARCHING", "ANALYZING", "SYNTHESIZING",
  "COMPLETED", "PARTIAL", "FAILED", "CANCELLED",
] as const;
export type ResearchRequestStatus = typeof RESEARCH_REQUEST_STATUSES[number];

/** Phase 14 — Research question types. */
export const RESEARCH_QUESTION_TYPES = [
  "IDENTITY", "SUPPLIER", "PRICING", "DEMAND", "LOGISTICS",
  "COMPETITION", "REGULATORY", "FEASIBILITY", "COMPARISON", "GENERAL",
] as const;
export type ResearchQuestionType = typeof RESEARCH_QUESTION_TYPES[number];

/** Phase 14 — Research evidence quality levels. */
export const RESEARCH_EVIDENCE_QUALITIES = [
  "HIGH", "MEDIUM", "LOW", "UNVERIFIED",
] as const;
export type ResearchEvidenceQuality = typeof RESEARCH_EVIDENCE_QUALITIES[number];

/** Phase 14 — Research hypothesis statuses. */
export const RESEARCH_HYPOTHESIS_STATUSES = [
  "SUPPORTED", "PARTIALLY_SUPPORTED", "UNCERTAIN", "CONTRADICTED", "INSUFFICIENT_EVIDENCE",
] as const;
export type ResearchHypothesisStatus = typeof RESEARCH_HYPOTHESIS_STATUSES[number];

/** Phase 14 — Research temporal classifications. */
export const RESEARCH_TEMPORAL_CLASSIFICATIONS = [
  "CURRENT", "RECENT", "HISTORICAL", "STALE", "UNKNOWN",
] as const;
export type ResearchTemporalClassification = typeof RESEARCH_TEMPORAL_CLASSIFICATIONS[number];

/** Phase 14 — Research source types. */
export const RESEARCH_SOURCE_TYPES = [
  "EXISTING_EVIDENCE", "INTELLIGENCE_RESULT", "AI_INFERENCE", "MANUAL",
] as const;
export type ResearchSourceType = typeof RESEARCH_SOURCE_TYPES[number];

/** Phase 14 — AI Research & Reasoning configuration. */
export const RESEARCH_CONFIG = {
  algorithmVersion: "RESEARCH_ALGORITHM_V1",
  promptVersion: "research-v1",

  // Research limits
  maxIterations: 5,
  maxSubQuestions: 15,
  maxEvidenceItems: 50,
  maxModelCalls: 20,
  maxTokenUsage: 50000,
  maxExecutionTimeMs: 300_000, // 5 minutes

  // Evidence quality weights (sum = 1.0)
  evidenceQualityWeights: {
    sourceAuthority: 0.25,
    temporalFreshness: 0.20,
    sourceIndependence: 0.20,
    directness: 0.15,
    corroboration: 0.20,
  },

  // Confidence thresholds
  confidenceThresholds: {
    highMin: 0.75,
    mediumMin: 0.50,
    lowMin: 0.25,
    // < lowMin = INSUFFICIENT_EVIDENCE
  },

  // Temporal freshness thresholds (days)
  temporalThresholds: {
    currentMaxDays: 30,
    recentMaxDays: 90,
    historicalMaxDays: 365,
    // > historicalMaxDays = STALE
  },

  // Contradiction detection thresholds
  contradictionThresholds: {
    numericTolerancePercent: 0.10, // 10% difference triggers contradiction
    minEvidenceForContradiction: 2,
  },

  // Research depth presets
  depthPresets: {
    brief: { maxSubQuestions: 5, maxEvidenceItems: 15, maxIterations: 2 },
    standard: { maxSubQuestions: 10, maxEvidenceItems: 30, maxIterations: 4 },
    deep: { maxSubQuestions: 15, maxEvidenceItems: 50, maxIterations: 5 },
  },

  // Scheduler
  maxResearchJobsPerTenant: 10,
  researchCheckIntervalMs: 30_000,

  // Cache TTL (seconds)
  cacheTtlSeconds: 3600, // 1 hour
} as const;

// -----------------------------------------------------------------------------
// PHASE 15 — SUPPLIER OUTREACH / SOURCING INTELLIGENCE ENGINE
// -----------------------------------------------------------------------------

/** Phase 15 — Outreach lifecycle statuses. */
export const OUTREACH_STATUSES = [
  "DRAFT", "READY", "APPROVED", "QUEUED", "SENT", "DELIVERED",
  "RESPONDED", "FOLLOW_UP_REQUIRED", "QUALIFICATION_REQUIRED",
  "QUALIFIED", "REJECTED", "CLOSED",
] as const;
export type OutreachStatus = typeof OUTREACH_STATUSES[number];

/** Phase 15 — Outreach channels. */
export const OUTREACH_CHANNELS = [
  "EMAIL", "WHATSAPP", "MARKETPLACE", "WEB_FORM", "MANUAL", "OTHER",
] as const;
export type OutreachChannel = typeof OUTREACH_CHANNELS[number];

/** Phase 15 — Outreach template types. */
export const OUTREACH_TEMPLATE_TYPES = [
  "INITIAL_INQUIRY", "SUPPLIER_VERIFICATION", "LOGISTICS_INQUIRY",
  "FOLLOW_UP", "CUSTOM",
] as const;
export type OutreachTemplateType = typeof OUTREACH_TEMPLATE_TYPES[number];

/** Phase 15 — Response verification states. */
export const RESPONSE_VERIFICATION_STATES = [
  "EXTRACTED", "UNVERIFIED", "VERIFIED", "CONTRADICTED", "REQUIRES_CLARIFICATION",
] as const;
export type ResponseVerificationState = typeof RESPONSE_VERIFICATION_STATES[number];

/** Phase 15 — Audit actor types. */
export const AUDIT_ACTOR_TYPES = [
  "USER", "SYSTEM", "AI", "WORKER",
] as const;
export type AuditActorType = typeof AUDIT_ACTOR_TYPES[number];

/** Phase 15 — Qualification levels. */
export const QUALIFICATION_LEVELS = [
  "NOT_QUALIFIED", "WEAK", "CONDITIONAL", "QUALIFIED", "STRONG",
] as const;
export type QualificationLevel = typeof QUALIFICATION_LEVELS[number];

/** Phase 15 — Outreach thread event types. */
export const OUTREACH_THREAD_EVENT_TYPES = [
  "MESSAGE_SENT", "MESSAGE_RECEIVED", "RESPONSE_RECORDED", "FIELD_EXTRACTED",
  "QUALIFICATION_CHANGED", "FOLLOWUP_CREATED", "STATUS_CHANGED",
  "EVIDENCE_CREATED", "RESEARCH_REQUESTED", "NOTE_ADDED",
] as const;
export type OutreachThreadEventType = typeof OUTREACH_THREAD_EVENT_TYPES[number];

/** Phase 15 — Follow-up types. */
export const OUTREACH_FOLLOWUP_TYPES = [
  "MISSING_INFO", "CONTRADICTION", "UNVERIFIED_CLAIM",
  "DOCUMENTATION_REQUEST", "PRICE_CLARIFICATION", "SAMPLE_REQUEST",
] as const;
export type OutreachFollowupType = typeof OUTREACH_FOLLOWUP_TYPES[number];

/** Phase 15 — Supplier Outreach configuration. */
export const OUTREACH_CONFIG = {
  engineVersion: "phase15-v1",
  algorithmVersion: "OUTREACH_ALGORITHM_V1",

  // State machine: valid transitions per status
  validTransitions: {
    DRAFT: ["READY", "CLOSED"] as string[],
    READY: ["APPROVED", "CLOSED"] as string[],
    APPROVED: ["QUEUED", "SENT", "CLOSED"] as string[],
    QUEUED: ["SENT", "CLOSED"] as string[],
    SENT: ["DELIVERED", "CLOSED"] as string[],
    DELIVERED: ["RESPONDED", "CLOSED"] as string[],
    RESPONDED: ["FOLLOW_UP_REQUIRED", "QUALIFICATION_REQUIRED", "CLOSED"] as string[],
    FOLLOW_UP_REQUIRED: ["READY", "QUALIFICATION_REQUIRED", "CLOSED"] as string[],
    QUALIFICATION_REQUIRED: ["QUALIFIED", "REJECTED", "FOLLOW_UP_REQUIRED", "CLOSED"] as string[],
    QUALIFIED: ["CLOSED"] as string[],
    REJECTED: ["CLOSED"] as string[],
    CLOSED: [] as string[],
  },

  // Qualification dimension weights (12 dimensions, sum = 1.0)
  qualificationWeights: {
    identity: 0.10,
    productFit: 0.12,
    price: 0.10,
    moq: 0.08,
    leadTime: 0.08,
    capacity: 0.07,
    documentation: 0.08,
    exportCapability: 0.08,
    responsiveness: 0.07,
    evidenceQuality: 0.08,
    commercialTerms: 0.08,
    logisticsCompatibility: 0.06,
  },

  // Qualification level thresholds (score 0–100)
  qualificationLevelThresholds: {
    strongMin: 80,
    qualifiedMin: 60,
    conditionalMin: 40,
    weakMin: 20,
    // < weakMin = NOT_QUALIFIED
  },

  // Response confidence weights (5 dimensions, sum = 1.0)
  responseConfidenceWeights: {
    quantity: 0.20,
    quality: 0.25,
    independence: 0.20,
    completeness: 0.15,
    consistency: 0.20,
  },

  // Contradiction detection thresholds
  contradictionThresholds: {
    numericTolerancePercent: 0.15, // 15% difference triggers contradiction
    minEvidenceForContradiction: 2,
  },

  // Follow-up scheduling defaults
  followupDefaults: {
    reminderDays: 7,
    maxFollowups: 5,
    defaultPriority: 5,
  },

  // Staleness thresholds (days)
  stalenessThresholds: {
    responseStaleDays: 30,
    outreachExpireDays: 90,
    followupOverdueDays: 14,
  },

  // Scheduler
  maxJobsPerTenant: 20,
  detectionIntervalHours: 12,

  // Questionnaire dimensions for structured supplier questionnaire
  questionnaireDimensions: {
    product: ["exact_sku", "specifications", "availability", "customization"],
    commercial: ["moq", "unit_price", "volume_tiers", "sample_price", "payment_terms"],
    production: ["lead_time", "capacity", "production_location", "packaging"],
    logistics: ["origin", "incoterms", "carton_details", "shipping_readiness"],
    compliance: ["certifications", "documentation", "export_eligibility"],
  },
} as const;

/**
 * Error thrown when an invalid outreach state transition is attempted.
 */
export class OutreachStateTransitionError extends ValidationError {
  constructor(
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(
      `Invalid state transition from ${fromStatus} to ${toStatus}`,
    );
    this.name = "OutreachStateTransitionError";
  }
}
