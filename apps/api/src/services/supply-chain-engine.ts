// =============================================================================
// API — Supply-Chain Calculation Engine (Phase 9)
// =============================================================================
// Pure, deterministic calculation engine for supply-chain graph intelligence.
// Consumes graph data (nodes, edges, observations, evidence, claims) and
// produces confidence scores, relationship statuses, contradiction detection,
// path discovery, anomaly detection, completeness metrics, and verification
// requirements.
//
// No AI, no heuristics — deterministic math with documented formulas.
// Same inputs → same outputs. Every score is explainable.
// No database side effects — this module is a pure function.
// =============================================================================

import { createHash } from "node:crypto";
import {
  SUPPLY_CHAIN_CONFIG,
} from "@exosquad/common";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface SCNodeInput {
  id: string;
  nodeType: string;
  name: string;
  normalizedName: string;
  canonicalEntityType: string | null;
  canonicalEntityId: string | null;
  identityStatus: string;
  identityConfidence: number;
  country: string | null;
  sourceId: string | null;
}

export interface SCEdgeInput {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  relationshipStatus: string;
  confidence: number;
  isContradicted: boolean;
  contradictionCount: number;
}

export interface SCObservationInput {
  id: string;
  edgeId: string;
  sourceId: string;
  observationStatus: string;
  observedValue: Record<string, unknown>;
  contentHash: string;
  observedAt: Date;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface SCEvidenceLinkInput {
  id: string;
  edgeId: string;
  evidenceId: string;
  evidenceRole: string;
  evidenceStrength: string;
  relevance: number;
  effect: number;
  sourceId: string | null;
}

export interface SCSourceInput {
  id: string;
  type: string;
  name: string;
  domain: string | null;
}

export interface SCClaimInput {
  id: string;
  claimType: string;
  claimText: string;
  claimingNodeId: string;
  targetNodeId: string;
  sourceId: string;
  status: string;
}

export interface SCConflictInput {
  id: string;
  edgeId: string | null;
  nodeId: string | null;
  conflictType: string;
  severity: string;
  description: string;
  resolutionState: string;
}

export interface SupplyChainEngineInput {
  tenantId: string;
  subjectType: string;
  subjectId: string;
  nodes: SCNodeInput[];
  edges: SCEdgeInput[];
  observations: SCObservationInput[];
  evidenceLinks: SCEvidenceLinkInput[];
  sources: SCSourceInput[];
  claims: SCClaimInput[];
  conflicts: SCConflictInput[];
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface EdgeConfidenceResult {
  edgeId: string;
  evidenceStrengthScore: number;
  sourceIndependenceScore: number;
  identityConfidenceScore: number;
  directnessScore: number;
  corroborationScore: number;
  temporalFreshnessScore: number;
  contradictionPenalty: number;
  finalConfidence: number;
}

export interface RelationshipStatusResult {
  edgeId: string;
  status: string;
  reason: string;
}

export interface PathResult {
  pathNodes: string[];
  pathEdges: string[];
  edgeStatuses: string[];
  edgeConfidences: number[];
  overallPathConfidence: number;
  hasUnknownLinks: boolean;
  hasContradictions: boolean;
  hopCount: number;
}

export interface AnomalyResult {
  anomalyType: string;
  severity: string;
  description: string;
  nodeId: string | null;
  edgeId: string | null;
  involvedNodeIds: string[];
  involvedEdgeIds: string[];
}

export interface ConflictResult {
  conflictType: string;
  severity: string;
  description: string;
  edgeId: string | null;
  nodeId: string | null;
  supportingEvidenceId: string;
  contradictingEvidenceId: string;
}

export interface VerificationResult {
  verificationType: string;
  priority: string;
  reason: string;
  targetNodeType: string | null;
  targetNodeId: string | null;
  targetEdgeType: string | null;
  targetEdgeId: string | null;
  existingEvidence: Record<string, unknown>[];
  missingEvidence: Record<string, unknown>[];
  importance: number;
}

export interface CompletenessResult {
  nodeCompleteness: number;
  edgeCompleteness: number;
  evidenceCompleteness: number;
  identityCompleteness: number;
  temporalCompleteness: number;
  graphCompleteness: number;
  knownNodeCount: number;
  unknownNodeCount: number;
  knownEdgeCount: number;
  unknownEdgeCount: number;
  confirmedEdgeCount: number;
  corroboratedEdgeCount: number;
  claimedEdgeCount: number;
  observedEdgeCount: number;
  inferredEdgeCount: number;
  contradictedEdgeCount: number;
  sourceDiversity: number;
  evidenceCoverage: number;
  identityConfidence: number;
  temporalCoverage: number;
  pathCount: number;
  alternatePathCount: number;
  criticalUnknownCount: number;
}

export interface SupplyChainEngineResult {
  tenantId: string;
  subjectType: string;
  subjectId: string;
  algorithmVersion: string;
  inputHash: string;
  edgeConfidences: EdgeConfidenceResult[];
  relationshipStatuses: RelationshipStatusResult[];
  paths: PathResult[];
  anomalies: AnomalyResult[];
  conflicts: ConflictResult[];
  verifications: VerificationResult[];
  completeness: CompletenessResult;
  overallConfidence: number;
}

// ─── Edge Type Validity Constraints ──────────────────────────────────────────

const VALID_EDGE_NODE_TYPES: Record<string, { from: string[]; to: string[] }> = {
  BRAND_MANUFACTURES_PRODUCT: { from: ["BRAND"], to: ["PRODUCT"] },
  MANUFACTURER_PRODUCES_SKU: { from: ["MANUFACTURER"], to: ["SKU"] },
  MANUFACTURER_DISTRIBUTES: { from: ["MANUFACTURER"], to: ["DISTRIBUTOR", "AUTHORIZED_DISTRIBUTOR"] },
  MANUFACTURER_SUPPLIES: { from: ["MANUFACTURER"], to: ["SUPPLIER"] },
  MANUFACTURER_EXPORTS: { from: ["MANUFACTURER"], to: ["EXPORTER"] },
  AUTHORIZED_DISTRIBUTOR_DISTRIBUTES: { from: ["AUTHORIZED_DISTRIBUTOR"], to: ["DISTRIBUTOR"] },
  DISTRIBUTOR_SUPPLIES: { from: ["DISTRIBUTOR"], to: ["SUPPLIER"] },
  SUPPLIER_SUPPLIES: { from: ["SUPPLIER"], to: ["SELLER"] },
  SUPPLIER_SOURCES_FROM: { from: ["SUPPLIER"], to: ["MANUFACTURER"] },
  SELLER_PURCHASES_FROM: { from: ["SELLER"], to: ["SUPPLIER"] },
  SELLER_SUPPLIES: { from: ["SELLER"], to: ["SELLER"] },
  SELLER_LISTS: { from: ["SELLER"], to: ["LISTING"] },
  SELLER_OFFERS: { from: ["SELLER"], to: ["OFFER"] },
  LISTING_REPRESENTS_PRODUCT: { from: ["LISTING"], to: ["PRODUCT"] },
  LISTING_OFFERS_SKU: { from: ["LISTING"], to: ["SKU"] },
  FULFILLMENT_BY: { from: ["LISTING"], to: ["FULFILLMENT_PROVIDER"] },
  STORED_AT: { from: ["PRODUCT", "SKU"], to: ["WAREHOUSE"] },
  ORIGINATED_FROM: {
    from: ["PRODUCT", "SKU"],
    to: ["ORIGIN_COUNTRY", "ORIGIN_REGION", "ORIGIN_CITY"],
  },
  EXPORTED_FROM: {
    from: ["EXPORTER"],
    to: ["ORIGIN_COUNTRY", "PORT"],
  },
  IMPORTED_TO: {
    from: ["IMPORTER"],
    to: ["DESTINATION_COUNTRY", "PORT"],
  },
  EXPORTER_EXPORTS: { from: ["EXPORTER"], to: ["SHIPMENT"] },
  IMPORTER_IMPORTS: { from: ["IMPORTER"], to: ["SHIPMENT"] },
  SHIPMENT_FROM: {
    from: ["SHIPMENT"],
    to: ["ORIGIN_COUNTRY", "ORIGIN_REGION", "ORIGIN_CITY", "PORT"],
  },
  SHIPMENT_TO: {
    from: ["SHIPMENT"],
    to: ["DESTINATION_COUNTRY", "DESTINATION_REGION", "DESTINATION_CITY", "PORT"],
  },
  TRADE_OBSERVATION_SUPPORTS: { from: ["TRADE_OBSERVATION"], to: ["*"] },
  DESTINATION_TO: {
    from: ["SHIPMENT"],
    to: ["DESTINATION_COUNTRY", "DESTINATION_REGION", "DESTINATION_CITY"],
  },
  SOLD_IN_MARKET: {
    from: ["PRODUCT", "SKU"],
    to: ["BANGLADESH_MARKET_ENTITY"],
  },
  BANGLADESH_IMPORTER_DISTRIBUTES: {
    from: ["BANGLADESH_IMPORTER"],
    to: ["BANGLADESH_DISTRIBUTOR"],
  },
  BANGLADESH_DISTRIBUTOR_SUPPLIES: {
    from: ["BANGLADESH_DISTRIBUTOR"],
    to: ["BANGLADESH_RESELLER"],
  },
  BANGLADESH_SUPPLIER_SUPPLIES: {
    from: ["BANGLADESH_MARKET_ENTITY"],
    to: ["SELLER"],
  },
  BANGLADESH_RESELLER_SELLS: {
    from: ["BANGLADESH_RESELLER"],
    to: ["LISTING"],
  },
};

// ─── Content Hashing ─────────────────────────────────────────────────────────

/** Compute SHA-256 content hash for edge deduplication. */
export function computeEdgeContentHash(
  tenantId: string,
  fromNodeId: string,
  toNodeId: string,
  edgeType: string,
  observedValue: Record<string, unknown>
): string {
  const canonical = JSON.stringify({
    tenantId,
    fromNodeId,
    toNodeId,
    edgeType,
    observedValue,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Compute SHA-256 content hash for observation deduplication. */
export function computeObservationContentHash(
  tenantId: string,
  sourceId: string,
  edgeId: string,
  observedValue: Record<string, unknown>
): string {
  const canonical = JSON.stringify({
    tenantId,
    sourceId,
    edgeId,
    observedValue,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Compute SHA-256 input hash for assessment deduplication. */
export function computeAssessmentInputHash(
  tenantId: string,
  subjectType: string,
  subjectId: string,
  nodes: SCNodeInput[],
  edges: SCEdgeInput[],
  observations: SCObservationInput[],
  evidenceLinks: SCEvidenceLinkInput[],
  conflicts: SCConflictInput[]
): string {
  const canonical = JSON.stringify({
    tenantId,
    subjectType,
    subjectId,
    nodeIds: nodes.map((n) => n.id).sort(),
    edgeIds: edges.map((e) => e.id).sort(),
    observationIds: observations.map((o) => o.id).sort(),
    evidenceLinkIds: evidenceLinks.map((e) => e.id).sort(),
    conflictIds: conflicts.map((c) => c.id).sort(),
    algorithmVersion: SUPPLY_CHAIN_CONFIG.algorithmVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ─── Source Independence ─────────────────────────────────────────────────────

/**
 * Determine distinct independent source count for a set of observations.
 * Independence rules:
 * 1. Same sourceId → NOT independent
 * 2. Same domain → NOT independent
 * 3. Different sourceId + different domain → independent
 */
export function countIndependentSources(
  observations: SCObservationInput[],
  sources: SCSourceInput[]
): number {
  const sourceMap = new Map<string, SCSourceInput>();
  for (const s of sources) {
    sourceMap.set(s.id, s);
  }

  const seenDomains = new Set<string>();
  const seenSourceIds = new Set<string>();
  let independentCount = 0;

  for (const obs of observations) {
    if (seenSourceIds.has(obs.sourceId)) continue;

    const source = sourceMap.get(obs.sourceId);
    const domain = source?.domain ?? `source:${obs.sourceId}`;

    if (seenDomains.has(domain)) continue;

    seenSourceIds.add(obs.sourceId);
    seenDomains.add(domain);
    independentCount++;
  }

  return independentCount;
}

// ─── Evidence Strength Calculation ───────────────────────────────────────────

/** Calculate weighted average evidence strength from evidence links. */
export function calculateEvidenceStrength(
  evidenceLinks: SCEvidenceLinkInput[]
): number {
  const supporting = evidenceLinks.filter(
    (e) => e.evidenceRole === "SUPPORTING" || e.evidenceRole === "CONTEXTUAL"
  );
  if (supporting.length === 0) return 0;

  const strengthValues = SUPPLY_CHAIN_CONFIG.evidenceStrengthValues;
  let totalWeight = 0;
  let weightedSum = 0;

  for (const link of supporting) {
    const value =
      strengthValues[link.evidenceStrength as keyof typeof strengthValues] ?? 0.2;
    const weight = link.relevance;
    weightedSum += value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ─── Temporal Freshness ──────────────────────────────────────────────────────

/** Calculate temporal freshness based on most recent observation. */
export function calculateTemporalFreshness(
  observations: SCObservationInput[],
  now: Date = new Date()
): number {
  if (observations.length === 0) return 0;

  const mostRecent = observations.reduce((latest, obs) =>
    obs.observedAt > latest.observedAt ? obs : latest
  );

  const daysSinceObservation =
    (now.getTime() - mostRecent.observedAt.getTime()) / (1000 * 60 * 60 * 24);

  const decay = SUPPLY_CHAIN_CONFIG.temporalFreshnessDecay;
  for (const tier of decay) {
    if (daysSinceObservation < tier.maxDays) {
      return tier.value;
    }
  }

  return 0.1;
}

// ─── Edge Confidence Calculation ─────────────────────────────────────────────

/**
 * Calculate deterministic confidence for a single edge.
 *
 * edgeConfidence =
 *   evidenceStrength   (0.25) ×
 *   sourceIndependence (0.20) ×
 *   identityConfidence (0.20) ×
 *   directness         (0.15) ×
 *   corroboration      (0.10) ×
 *   temporalFreshness  (0.10)
 *   - contradictionPenalty
 */
export function calculateEdgeConfidence(
  edge: SCEdgeInput,
  nodes: SCNodeInput[],
  observations: SCObservationInput[],
  evidenceLinks: SCEvidenceLinkInput[],
  sources: SCSourceInput[],
  now: Date = new Date()
): EdgeConfidenceResult {
  const weights = SUPPLY_CHAIN_CONFIG.confidenceWeights;

  // Evidence strength
  const edgeEvidence = evidenceLinks.filter((e) => e.edgeId === edge.id);
  const evidenceStrengthScore = calculateEvidenceStrength(edgeEvidence);

  // Source independence
  const edgeObservations = observations.filter((o) => o.edgeId === edge.id);
  const distinctSources = countIndependentSources(edgeObservations, sources);
  const sourceIndependenceScore = Math.min(1.0, distinctSources / 3);

  // Identity confidence (average of both nodes)
  const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
  const toNode = nodes.find((n) => n.id === edge.toNodeId);
  const fromConfidence = fromNode?.identityConfidence ?? 0;
  const toConfidence = toNode?.identityConfidence ?? 0;
  const identityConfidenceScore = (fromConfidence + toConfidence) / 2;

  // Directness
  const directnessValues = SUPPLY_CHAIN_CONFIG.directnessValues;
  const status = edge.relationshipStatus as keyof typeof directnessValues;
  const directnessScore = directnessValues[status] ?? 0;

  // Corroboration
  const supportingCount = edgeEvidence.filter(
    (e) => e.evidenceRole === "SUPPORTING"
  ).length;
  const corroborationScore = Math.min(1.0, supportingCount / 5);

  // Temporal freshness
  const temporalFreshnessScore = calculateTemporalFreshness(
    edgeObservations,
    now
  );

  // Contradiction penalty
  const contradictionPenalty =
    SUPPLY_CHAIN_CONFIG.contradictionPenaltyFactor *
    Math.min(1.0, edge.contradictionCount);

  // Final confidence (weighted product minus penalty)
  const rawConfidence =
    evidenceStrengthScore * weights.evidenceStrength +
    sourceIndependenceScore * weights.sourceIndependence +
    identityConfidenceScore * weights.identityConfidence +
    directnessScore * weights.directness +
    corroborationScore * weights.corroboration +
    temporalFreshnessScore * weights.temporalFreshness;

  const finalConfidence = Math.max(0, rawConfidence - contradictionPenalty);

  return {
    edgeId: edge.id,
    evidenceStrengthScore,
    sourceIndependenceScore,
    identityConfidenceScore,
    directnessScore,
    corroborationScore,
    temporalFreshnessScore,
    contradictionPenalty,
    finalConfidence: Math.round(finalConfidence * 10000) / 10000,
  };
}

// ─── Relationship Status Determination ───────────────────────────────────────

/**
 * Determine the relationship status for an edge based on evidence rules.
 *
 * Progression:
 * - No evidence → UNKNOWN
 * - 1 direct source → OBSERVED
 * - Self-claim only → CLAIMED
 * - 2+ independent sources → CORROBORATED
 * - 3+ sources + identity confidence ≥ 0.8 + evidence strength ≥ 0.7 + no contradictions → CONFIRMED
 * - Any contradicting evidence → CONTRADICTED (preserved alongside original)
 */
export function determineRelationshipStatus(
  edge: SCEdgeInput,
  observations: SCObservationInput[],
  evidenceLinks: SCEvidenceLinkInput[],
  sources: SCSourceInput[],
  claims: SCClaimInput[],
  nodes: SCNodeInput[]
): RelationshipStatusResult {
  const edgeObservations = observations.filter((o) => o.edgeId === edge.id);
  const edgeEvidence = evidenceLinks.filter((e) => e.edgeId === edge.id);
  const edgeClaims = claims.filter(
    (c) =>
      (c.targetNodeId === edge.fromNodeId || c.targetNodeId === edge.toNodeId) &&
      (c.claimingNodeId === edge.fromNodeId || c.claimingNodeId === edge.toNodeId)
  );

  // Check for contradictions first
  const contradictingEvidence = edgeEvidence.filter(
    (e) => e.evidenceRole === "CONTRADICTING"
  );
  if (contradictingEvidence.length > 0 || edge.isContradicted) {
    return {
      edgeId: edge.id,
      status: "CONTRADICTED",
      reason: "Contradicting evidence exists for this relationship",
    };
  }

  // No evidence at all
  if (edgeObservations.length === 0 && edgeEvidence.length === 0) {
    // Check if there's a claim
    if (edgeClaims.length > 0) {
      return {
        edgeId: edge.id,
        status: "CLAIMED",
        reason: "Relationship exists only as a party claim with no independent evidence",
      };
    }
    return {
      edgeId: edge.id,
      status: "UNKNOWN",
      reason: "No evidence or observations for this relationship",
    };
  }

  const distinctSources = countIndependentSources(edgeObservations, sources);
  const evidenceStrength = calculateEvidenceStrength(edgeEvidence);

  // Check confirmation rules
  const rules = SUPPLY_CHAIN_CONFIG.confirmationRules;
  const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
  const toNode = nodes.find((n) => n.id === edge.toNodeId);
  const avgIdentityConfidence =
    ((fromNode?.identityConfidence ?? 0) + (toNode?.identityConfidence ?? 0)) / 2;

  if (
    distinctSources >= rules.minSourceDiversity &&
    avgIdentityConfidence >= rules.minIdentityConfidence &&
    evidenceStrength >= rules.minEvidenceStrength &&
    !edge.isContradicted
  ) {
    return {
      edgeId: edge.id,
      status: "CONFIRMED",
      reason: `Confirmed by ${distinctSources} independent sources with sufficient identity confidence and evidence strength`,
    };
  }

  // Check corroboration
  const corrobRules = SUPPLY_CHAIN_CONFIG.corroborationRules;
  if (distinctSources >= corrobRules.minSourceDiversity) {
    return {
      edgeId: edge.id,
      status: "CORROBORATED",
      reason: `Corroborated by ${distinctSources} independent sources`,
    };
  }

  // Check if only claims
  if (edgeClaims.length > 0 && edgeEvidence.length === 0) {
    return {
      edgeId: edge.id,
      status: "CLAIMED",
      reason: "Relationship based on party claim without independent evidence",
    };
  }

  // Check if inferred (from deterministic rules)
  const inferredObs = edgeObservations.filter(
    (o) => o.observationStatus === "inferred"
  );
  if (inferredObs.length >= 2 && edgeEvidence.length >= 2) {
    return {
      edgeId: edge.id,
      status: "INFERRED",
      reason: "Relationship inferred from deterministic reasoning over available evidence",
    };
  }

  // Single source → OBSERVED
  if (edgeObservations.length >= 1) {
    return {
      edgeId: edge.id,
      status: "OBSERVED",
      reason: "Directly observed from a single source",
    };
  }

  return {
    edgeId: edge.id,
    status: "UNKNOWN",
    reason: "Insufficient evidence to establish relationship status",
  };
}

// ─── Edge Type Validity Check ────────────────────────────────────────────────

/** Check if an edge type is valid for the given from/to node types. */
export function isEdgeTypeValid(
  edgeType: string,
  fromNodeType: string,
  toNodeType: string
): boolean {
  const constraint = VALID_EDGE_NODE_TYPES[edgeType];
  if (!constraint) return true; // Unknown edge types are not invalid per se
  const fromValid =
    constraint.from.includes("*") || constraint.from.includes(fromNodeType);
  const toValid =
    constraint.to.includes("*") || constraint.to.includes(toNodeType);
  return fromValid && toValid;
}

// ─── Anomaly Detection ───────────────────────────────────────────────────────

/**
 * Detect graph anomalies deterministically.
 * Checks: self-loops, invalid relationships, contradictory manufacturer/origin,
 * suspicious shortcuts, temporal overlaps.
 */
export function detectAnomalies(
  nodes: SCNodeInput[],
  edges: SCEdgeInput[],
  _observations: SCObservationInput[],
  evidenceLinks: SCEvidenceLinkInput[],
  _sources: SCSourceInput[]
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];
  const nodeMap = new Map<string, SCNodeInput>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // 1. Self-loop detection
  for (const edge of edges) {
    if (edge.fromNodeId === edge.toNodeId) {
      anomalies.push({
        anomalyType: "SELF_LOOP",
        severity: "high",
        description: `Edge ${edge.id} forms a self-loop: node ${edge.fromNodeId} references itself`,
        nodeId: edge.fromNodeId,
        edgeId: edge.id,
        involvedNodeIds: [edge.fromNodeId],
        involvedEdgeIds: [edge.id],
      });
    }
  }

  // 2. Invalid relationship detection
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.fromNodeId);
    const toNode = nodeMap.get(edge.toNodeId);
    if (fromNode && toNode && !isEdgeTypeValid(edge.edgeType, fromNode.nodeType, toNode.nodeType)) {
      anomalies.push({
        anomalyType: "INVALID_RELATIONSHIP",
        severity: "medium",
        description: `Edge type ${edge.edgeType} is invalid for ${fromNode.nodeType} → ${toNode.nodeType}`,
        nodeId: null,
        edgeId: edge.id,
        involvedNodeIds: [edge.fromNodeId, edge.toNodeId],
        involvedEdgeIds: [edge.id],
      });
    }
  }

  // 3. Contradictory manufacturer detection
  // Same SKU with edges to different manufacturers
  const skuManufacturerEdges = edges.filter(
    (e) => e.edgeType === "MANUFACTURER_PRODUCES_SKU" || e.edgeType === "BRAND_MANUFACTURES_PRODUCT"
  );
  const skuToManufacturers = new Map<string, SCEdgeInput[]>();
  for (const e of skuManufacturerEdges) {
    const toNode = nodeMap.get(e.toNodeId);
    if (toNode && (toNode.nodeType === "PRODUCT" || toNode.nodeType === "SKU")) {
      const key = e.toNodeId;
      if (!skuToManufacturers.has(key)) skuToManufacturers.set(key, []);
      skuToManufacturers.get(key)!.push(e);
    }
  }
  for (const [productId, mfgEdges] of skuToManufacturers) {
    const uniqueManufacturers = new Set(mfgEdges.map((e) => e.fromNodeId));
    if (uniqueManufacturers.size > 1) {
      anomalies.push({
        anomalyType: "CONTRADICTORY_MANUFACTURER",
        severity: "critical",
        description: `Product/SKU ${productId} has ${uniqueManufacturers.size} different manufacturers: ${[...uniqueManufacturers].join(", ")}`,
        nodeId: productId,
        edgeId: null,
        involvedNodeIds: [...uniqueManufacturers, productId],
        involvedEdgeIds: mfgEdges.map((e) => e.id),
      });
    }
  }

  // 4. Contradictory origin detection
  const originEdges = edges.filter((e) => e.edgeType === "ORIGINATED_FROM");
  const productOrigins = new Map<string, SCEdgeInput[]>();
  for (const e of originEdges) {
    const key = e.fromNodeId;
    if (!productOrigins.has(key)) productOrigins.set(key, []);
    productOrigins.get(key)!.push(e);
  }
  for (const [productId, oEdges] of productOrigins) {
    const uniqueOrigins = new Set(oEdges.map((e) => e.toNodeId));
    if (uniqueOrigins.size > 1) {
      anomalies.push({
        anomalyType: "CONTRADICTORY_ORIGIN",
        severity: "high",
        description: `Product ${productId} has ${uniqueOrigins.size} different origins: ${[...uniqueOrigins].join(", ")}`,
        nodeId: productId,
        edgeId: null,
        involvedNodeIds: [...uniqueOrigins, productId],
        involvedEdgeIds: oEdges.map((e) => e.id),
      });
    }
  }

  // 5. Suspicious shortcut: SELLER → MANUFACTURER direct with no intermediary
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.fromNodeId);
    const toNode = nodeMap.get(edge.toNodeId);
    if (
      fromNode?.nodeType === "SELLER" &&
      toNode?.nodeType === "MANUFACTURER" &&
      edge.relationshipStatus !== "UNKNOWN"
    ) {
      // Check if there's evidence for a direct link
      const edgeEvidence = evidenceLinks.filter((e) => e.edgeId === edge.id);
      const directEvidence = edgeEvidence.filter(
        (e) => e.evidenceStrength === "DIRECT" || e.evidenceStrength === "STRONG"
      );
      if (directEvidence.length === 0) {
        anomalies.push({
          anomalyType: "SUSPICIOUS_SHORTCUT",
          severity: "medium",
          description: `Direct SELLER → MANUFACTURER link without strong/direct evidence (seller: ${edge.fromNodeId}, manufacturer: ${edge.toNodeId})`,
          nodeId: null,
          edgeId: edge.id,
          involvedNodeIds: [edge.fromNodeId, edge.toNodeId],
          involvedEdgeIds: [edge.id],
        });
      }
    }
  }

  // 6. Cycle detection via DFS
  const cycleAnomalies = detectCycles(nodes, edges);
  anomalies.push(...cycleAnomalies);

  return anomalies;
}

// ─── Cycle Detection ─────────────────────────────────────────────────────────

/** Detect cycles in the graph using DFS with visited-set tracking. */
export function detectCycles(
  nodes: SCNodeInput[],
  edges: SCEdgeInput[]
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];
  const adjList = new Map<string, { toNodeId: string; edgeId: string }[]>();

  for (const edge of edges) {
    if (!adjList.has(edge.fromNodeId)) adjList.set(edge.fromNodeId, []);
    adjList.get(edge.fromNodeId)!.push({
      toNodeId: edge.toNodeId,
      edgeId: edge.id,
    });
  }

  const allNodeIds = nodes.map((n) => n.id);
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];
  const pathEdges: string[] = [];

  function dfs(nodeId: string): void {
    if (inStack.has(nodeId)) {
      // Found a cycle
      const cycleStart = path.indexOf(nodeId);
      if (cycleStart >= 0) {
        const cycleNodes = path.slice(cycleStart);
        const cycleEdgeIds = pathEdges.slice(cycleStart);
        anomalies.push({
          anomalyType: "CYCLE_DETECTED",
          severity: "high",
          description: `Cycle detected: ${cycleNodes.join(" → ")} → ${nodeId}`,
          nodeId: null,
          edgeId: null,
          involvedNodeIds: cycleNodes,
          involvedEdgeIds: cycleEdgeIds,
        });
      }
      return;
    }

    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjList.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      pathEdges.push(neighbor.edgeId);
      dfs(neighbor.toNodeId);
      pathEdges.pop();
    }

    path.pop();
    inStack.delete(nodeId);
  }

  for (const nodeId of allNodeIds) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return anomalies;
}

// ─── Conflict Detection ──────────────────────────────────────────────────────

/**
 * Detect contradictions/conflicts between evidence for the same relationship.
 */
export function detectConflicts(
  edges: SCEdgeInput[],
  evidenceLinks: SCEvidenceLinkInput[],
  nodes: SCNodeInput[]
): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  const nodeMap = new Map<string, SCNodeInput>();
  for (const n of nodes) nodeMap.set(n.id, n);

  for (const edge of edges) {
    const edgeEvidence = evidenceLinks.filter((e) => e.edgeId === edge.id);
    const supporting = edgeEvidence.filter((e) => e.evidenceRole === "SUPPORTING");
    const contradicting = edgeEvidence.filter(
      (e) => e.evidenceRole === "CONTRADICTING"
    );

    // Contradictory evidence on same edge
    for (const con of contradicting) {
      const sup = supporting[0];
      if (sup) {
        conflicts.push({
          conflictType: "CONTRADICTORY_EVIDENCE",
          severity: "high",
          description: `Edge ${edge.id} has both supporting and contradicting evidence`,
          edgeId: edge.id,
          nodeId: null,
          supportingEvidenceId: sup.evidenceId,
          contradictingEvidenceId: con.evidenceId,
        });
      }
    }
  }

  // Contradictory manufacturer: same product, different manufacturers
  const mfgEdges = edges.filter(
    (e) =>
      e.edgeType === "MANUFACTURER_PRODUCES_SKU" ||
      e.edgeType === "BRAND_MANUFACTURES_PRODUCT"
  );
  const productMfgMap = new Map<string, SCEdgeInput[]>();
  for (const e of mfgEdges) {
    const key = e.toNodeId;
    if (!productMfgMap.has(key)) productMfgMap.set(key, []);
    productMfgMap.get(key)!.push(e);
  }
  for (const [productId, mfgs] of productMfgMap) {
    if (mfgs.length > 1) {
      const uniqueMfgs = new Set(mfgs.map((e) => e.fromNodeId));
      if (uniqueMfgs.size > 1) {
        const mfgIds = [...uniqueMfgs];
        for (let i = 0; i < mfgIds.length - 1; i++) {
          const edgeA = mfgs.find((e) => e.fromNodeId === mfgIds[i]);
          const edgeB = mfgs.find((e) => e.fromNodeId === mfgIds[i + 1]);
          if (edgeA && edgeB) {
            const evA = evidenceLinks.find((ev) => ev.edgeId === edgeA.id);
            const evB = evidenceLinks.find((ev) => ev.edgeId === edgeB.id);
            conflicts.push({
              conflictType: "CONTRADICTORY_MANUFACTURER",
              severity: "critical",
              description: `Product ${productId} claimed by multiple manufacturers: ${mfgIds.join(", ")}`,
              edgeId: edgeA.id,
              nodeId: productId,
              supportingEvidenceId: evA?.evidenceId ?? "none",
              contradictingEvidenceId: evB?.evidenceId ?? "none",
            });
          }
        }
      }
    }
  }

  return conflicts;
}

// ─── Path Discovery ──────────────────────────────────────────────────────────

/** Traversal filter controls for path discovery (PHASE9_SPEC.md §14). */
export interface TraversalFilters {
  nodeTypes?: string[];
  edgeTypes?: string[];
  statuses?: string[];
  minimumConfidence?: number;
}

/**
 * BFS-based multi-hop path discovery with bounded depth and cycle detection.
 * Returns all paths from startNodeId up to maxDepth hops.
 * Supports traversal filters applied during BFS (not post-filtered).
 */
export function discoverPaths(
  startNodeId: string,
  edges: SCEdgeInput[],
  nodes: SCNodeInput[],
  edgeConfidences: Map<string, number>,
  maxDepth: number = SUPPLY_CHAIN_CONFIG.traversalDefaults.defaultMaxDepth,
  filters?: TraversalFilters
): PathResult[] {
  const paths: PathResult[] = [];
  const boundedDepth = Math.min(maxDepth, SUPPLY_CHAIN_CONFIG.traversalDefaults.maxDepth);

  // Build node type lookup for filtering
  const nodeTypeMap = new Map<string, string>();
  for (const n of nodes) {
    nodeTypeMap.set(n.id, n.nodeType);
  }

  // Build allowed sets for O(1) lookup during traversal
  const allowedNodeTypes = filters?.nodeTypes ? new Set(filters.nodeTypes) : null;
  const allowedEdgeTypes = filters?.edgeTypes ? new Set(filters.edgeTypes) : null;
  const allowedStatuses = filters?.statuses ? new Set(filters.statuses) : null;
  const minConfidence = filters?.minimumConfidence ?? 0;

  const adjList = new Map<string, { toNodeId: string; edgeId: string; edgeType: string }[]>();
  for (const edge of edges) {
    if (!adjList.has(edge.fromNodeId)) adjList.set(edge.fromNodeId, []);
    adjList.get(edge.fromNodeId)!.push({
      toNodeId: edge.toNodeId,
      edgeId: edge.id,
      edgeType: edge.edgeType,
    });
  }

  const edgeStatusMap = new Map<string, string>();
  for (const edge of edges) {
    edgeStatusMap.set(edge.id, edge.relationshipStatus);
  }

  // BFS
  interface BFSState {
    nodeId: string;
    pathNodes: string[];
    pathEdges: string[];
    visited: Set<string>;
  }

  const queue: BFSState[] = [
    {
      nodeId: startNodeId,
      pathNodes: [startNodeId],
      pathEdges: [],
      visited: new Set([startNodeId]),
    },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Record path if it has edges
    if (current.pathEdges.length > 0) {
      const edgeStatuses = current.pathEdges.map(
        (eId) => edgeStatusMap.get(eId) ?? "UNKNOWN"
      );
      const edgeConfidencesList = current.pathEdges.map(
        (eId) => edgeConfidences.get(eId) ?? 0
      );
      const overallConfidence =
        edgeConfidencesList.length > 0
          ? edgeConfidencesList.reduce((a, b) => a * b, 1)
          : 0;
      const hasUnknown = edgeStatuses.some((s) => s === "UNKNOWN");
      const hasContradictions = edgeStatuses.some((s) => s === "CONTRADICTED");

      paths.push({
        pathNodes: [...current.pathNodes],
        pathEdges: [...current.pathEdges],
        edgeStatuses,
        edgeConfidences: edgeConfidencesList,
        overallPathConfidence: Math.round(overallConfidence * 10000) / 10000,
        hasUnknownLinks: hasUnknown,
        hasContradictions: hasContradictions,
        hopCount: current.pathEdges.length,
      });
    }

    // Stop expanding if at max depth
    if (current.pathEdges.length >= boundedDepth) continue;

    const neighbors = adjList.get(current.nodeId) ?? [];
    for (const neighbor of neighbors) {
      // Apply edge type filter during traversal
      if (allowedEdgeTypes && !allowedEdgeTypes.has(neighbor.edgeType)) continue;

      // Apply status filter during traversal
      if (allowedStatuses) {
        const edgeStatus = edgeStatusMap.get(neighbor.edgeId) ?? "UNKNOWN";
        if (!allowedStatuses.has(edgeStatus)) continue;
      }

      // Apply minimum confidence filter during traversal
      if (minConfidence > 0) {
        const conf = edgeConfidences.get(neighbor.edgeId) ?? 0;
        if (conf < minConfidence) continue;
      }

      // Apply node type filter during traversal
      if (allowedNodeTypes) {
        const nodeType = nodeTypeMap.get(neighbor.toNodeId);
        if (!nodeType || !allowedNodeTypes.has(nodeType)) continue;
      }

      if (!current.visited.has(neighbor.toNodeId)) {
        const newVisited = new Set(current.visited);
        newVisited.add(neighbor.toNodeId);
        queue.push({
          nodeId: neighbor.toNodeId,
          pathNodes: [...current.pathNodes, neighbor.toNodeId],
          pathEdges: [...current.pathEdges, neighbor.edgeId],
          visited: newVisited,
        });
      }
    }
  }

  return paths;
}

// ─── Completeness Calculation ────────────────────────────────────────────────

/**
 * Calculate five-dimensional completeness metrics for the supply-chain graph.
 */
export function calculateCompleteness(
  nodes: SCNodeInput[],
  edges: SCEdgeInput[],
  observations: SCObservationInput[],
  evidenceLinks: SCEvidenceLinkInput[],
  sources: SCSourceInput[],
  paths: PathResult[]
): CompletenessResult {
  // Node completeness
  const unknownNodes = nodes.filter((n) => n.nodeType === "UNKNOWN");
  const knownNodes = nodes.filter((n) => n.nodeType !== "UNKNOWN");
  const nodeCompleteness =
    nodes.length > 0 ? knownNodes.length / nodes.length : 0;

  // Edge completeness
  const unknownEdges = edges.filter((e) => e.relationshipStatus === "UNKNOWN");
  const knownEdges = edges.filter((e) => e.relationshipStatus !== "UNKNOWN");
  const edgeCompleteness =
    edges.length > 0 ? knownEdges.length / edges.length : 0;

  // Evidence completeness
  const nonUnknownEdges = edges.filter(
    (e) => e.relationshipStatus !== "UNKNOWN"
  );
  const edgesWithEvidence = nonUnknownEdges.filter((e) =>
    evidenceLinks.some((ev) => ev.edgeId === e.id)
  );
  const evidenceCompleteness =
    nonUnknownEdges.length > 0
      ? edgesWithEvidence.length / nonUnknownEdges.length
      : 0;

  // Identity completeness
  const resolvedNodes = nodes.filter(
    (n) =>
      n.identityStatus === "resolved" || n.identityStatus === "high_confidence"
  );
  const identityCompleteness =
    nodes.length > 0 ? resolvedNodes.length / nodes.length : 0;

  // Temporal completeness
  const edgesWithTemporal = nonUnknownEdges.filter(
    (_e) => false // SCEdgeInput doesn't carry validFrom; temporal tracked via observations
  );
  const temporalCompleteness =
    nonUnknownEdges.length > 0
      ? edgesWithTemporal.length / nonUnknownEdges.length
      : 0;

  // Graph completeness (average of 5 dimensions)
  const graphCompleteness =
    (nodeCompleteness +
      edgeCompleteness +
      evidenceCompleteness +
      identityCompleteness +
      temporalCompleteness) /
    5;

  // Status counts
  const confirmedEdgeCount = edges.filter(
    (e) => e.relationshipStatus === "CONFIRMED"
  ).length;
  const corroboratedEdgeCount = edges.filter(
    (e) => e.relationshipStatus === "CORROBORATED"
  ).length;
  const claimedEdgeCount = edges.filter(
    (e) => e.relationshipStatus === "CLAIMED"
  ).length;
  const observedEdgeCount = edges.filter(
    (e) => e.relationshipStatus === "OBSERVED"
  ).length;
  const inferredEdgeCount = edges.filter(
    (e) => e.relationshipStatus === "INFERRED"
  ).length;
  const contradictedEdgeCount = edges.filter(
    (e) => e.relationshipStatus === "CONTRADICTED"
  ).length;

  // Source diversity (max across all edges)
  let maxSourceDiversity = 0;
  for (const edge of edges) {
    const edgeObs = observations.filter((o) => o.edgeId === edge.id);
    const diversity = countIndependentSources(edgeObs, sources);
    if (diversity > maxSourceDiversity) maxSourceDiversity = diversity;
  }

  // Evidence coverage
  const evidenceCoverage = evidenceCompleteness;

  // Average identity confidence
  const identityConfidence =
    nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.identityConfidence, 0) / nodes.length
      : 0;

  // Temporal coverage
  const temporalCoverage = temporalCompleteness;

  // Path counts
  const primaryPaths = paths.filter((p) => !p.hasUnknownLinks);
  const alternatePaths = paths.filter(
    (p) => p.hasUnknownLinks || p.hopCount > 1
  );

  // Critical unknown count
  const criticalUnknownCount = edges.filter(
    (e) =>
      e.relationshipStatus === "UNKNOWN" &&
      (e.edgeType.includes("MANUFACTURER") ||
        e.edgeType.includes("SUPPLIER") ||
        e.edgeType.includes("ORIGIN"))
  ).length;

  return {
    nodeCompleteness: Math.round(nodeCompleteness * 10000) / 10000,
    edgeCompleteness: Math.round(edgeCompleteness * 10000) / 10000,
    evidenceCompleteness: Math.round(evidenceCompleteness * 10000) / 10000,
    identityCompleteness: Math.round(identityCompleteness * 10000) / 10000,
    temporalCompleteness: Math.round(temporalCompleteness * 10000) / 10000,
    graphCompleteness: Math.round(graphCompleteness * 10000) / 10000,
    knownNodeCount: knownNodes.length,
    unknownNodeCount: unknownNodes.length,
    knownEdgeCount: knownEdges.length,
    unknownEdgeCount: unknownEdges.length,
    confirmedEdgeCount,
    corroboratedEdgeCount,
    claimedEdgeCount,
    observedEdgeCount,
    inferredEdgeCount,
    contradictedEdgeCount,
    sourceDiversity: maxSourceDiversity,
    evidenceCoverage: Math.round(evidenceCoverage * 10000) / 10000,
    identityConfidence: Math.round(identityConfidence * 10000) / 10000,
    temporalCoverage: Math.round(temporalCoverage * 10000) / 10000,
    pathCount: primaryPaths.length,
    alternatePathCount: alternatePaths.length,
    criticalUnknownCount,
  };
}

// ─── Verification Requirements ───────────────────────────────────────────────

/**
 * Generate verification requirements for unresolved/unknown supply-chain links.
 */
export function generateVerificationRequirements(
  nodes: SCNodeInput[],
  edges: SCEdgeInput[],
  evidenceLinks: SCEvidenceLinkInput[],
  claims: SCClaimInput[]
): VerificationResult[] {
  const verifications: VerificationResult[] = [];
  const nodeMap = new Map<string, SCNodeInput>();
  for (const n of nodes) nodeMap.set(n.id, n);

  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.fromNodeId);
    const toNode = nodeMap.get(edge.toNodeId);
    if (!fromNode || !toNode) continue;

    const edgeEvidence = evidenceLinks.filter((e) => e.edgeId === edge.id);
    const edgeClaims = claims.filter(
      (c) =>
        (c.claimingNodeId === edge.fromNodeId ||
          c.claimingNodeId === edge.toNodeId) &&
        (c.targetNodeId === edge.fromNodeId ||
          c.targetNodeId === edge.toNodeId)
    );

    // VERIFY_SUPPLIER_AUTHORIZATION
    if (
      (toNode.nodeType === "SUPPLIER" || fromNode.nodeType === "SUPPLIER") &&
      edgeClaims.length > 0 &&
      edgeEvidence.filter((e) => e.evidenceRole === "SUPPORTING").length === 0
    ) {
      const supplierNode =
        fromNode.nodeType === "SUPPLIER" ? fromNode : toNode;
      verifications.push({
        verificationType: "VERIFY_SUPPLIER_AUTHORIZATION",
        priority: "high",
        reason: `Supplier ${supplierNode.name} claims authorization but has no independent supporting evidence`,
        targetNodeType: supplierNode.nodeType,
        targetNodeId: supplierNode.id,
        targetEdgeType: edge.edgeType,
        targetEdgeId: edge.id,
        existingEvidence: edgeEvidence.map((e) => ({
          evidenceId: e.evidenceId,
          role: e.evidenceRole,
        })),
        missingEvidence: [
          {
            type: "authorization_document",
            description:
              "Independent authorization letter or distributor agreement",
          },
        ],
        importance: 0.8,
      });
    }

    // VERIFY_MANUFACTURER_RELATIONSHIP
    if (
      (edge.edgeType === "BRAND_MANUFACTURES_PRODUCT" ||
        edge.edgeType === "MANUFACTURER_PRODUCES_SKU") &&
      (edge.relationshipStatus === "UNKNOWN" ||
        edge.relationshipStatus === "CLAIMED")
    ) {
      verifications.push({
        verificationType: "VERIFY_MANUFACTURER_RELATIONSHIP",
        priority: "critical",
        reason: `Manufacturer relationship for ${toNode.name} is ${edge.relationshipStatus}`,
        targetNodeType: toNode.nodeType,
        targetNodeId: toNode.id,
        targetEdgeType: edge.edgeType,
        targetEdgeId: edge.id,
        existingEvidence: edgeEvidence.map((e) => ({
          evidenceId: e.evidenceId,
          role: e.evidenceRole,
        })),
        missingEvidence: [
          {
            type: "manufacturer_confirmation",
            description:
              "Direct confirmation from manufacturer or authorized representative",
          },
        ],
        importance: 0.9,
      });
    }

    // VERIFY_ORIGIN
    if (
      edge.edgeType === "ORIGINATED_FROM" &&
      (edge.relationshipStatus === "UNKNOWN" ||
        edge.relationshipStatus === "CONTRADICTED")
    ) {
      verifications.push({
        verificationType: "VERIFY_ORIGIN",
        priority: "high",
        reason: `Origin for ${fromNode.name} is ${edge.relationshipStatus}`,
        targetNodeType: fromNode.nodeType,
        targetNodeId: fromNode.id,
        targetEdgeType: edge.edgeType,
        targetEdgeId: edge.id,
        existingEvidence: edgeEvidence.map((e) => ({
          evidenceId: e.evidenceId,
          role: e.evidenceRole,
        })),
        missingEvidence: [
          {
            type: "origin_certificate",
            description: "Certificate of origin or trade documentation",
          },
        ],
        importance: 0.85,
      });
    }

    // VERIFY_EXPORTER_IDENTITY
    if (
      fromNode.nodeType === "EXPORTER" &&
      fromNode.identityStatus === "unresolved"
    ) {
      verifications.push({
        verificationType: "VERIFY_EXPORTER_IDENTITY",
        priority: "medium",
        reason: `Exporter ${fromNode.name} identity is unresolved`,
        targetNodeType: fromNode.nodeType,
        targetNodeId: fromNode.id,
        targetEdgeType: edge.edgeType,
        targetEdgeId: edge.id,
        existingEvidence: [],
        missingEvidence: [
          {
            type: "exporter_registration",
            description: "Official exporter registration or license",
          },
        ],
        importance: 0.7,
      });
    }

    // VERIFY_IMPORTER_IDENTITY
    if (
      toNode.nodeType === "IMPORTER" &&
      toNode.identityStatus === "unresolved"
    ) {
      verifications.push({
        verificationType: "VERIFY_IMPORTER_IDENTITY",
        priority: "medium",
        reason: `Importer ${toNode.name} identity is unresolved`,
        targetNodeType: toNode.nodeType,
        targetNodeId: toNode.id,
        targetEdgeType: edge.edgeType,
        targetEdgeId: edge.id,
        existingEvidence: [],
        missingEvidence: [
          {
            type: "importer_license",
            description: "Official importer license or registration",
          },
        ],
        importance: 0.7,
      });
    }

    // VERIFY_BANGLADESH_DISTRIBUTOR
    if (
      (fromNode.nodeType === "BANGLADESH_IMPORTER" ||
        fromNode.nodeType === "BANGLADESH_DISTRIBUTOR" ||
        toNode.nodeType === "BANGLADESH_DISTRIBUTOR" ||
        toNode.nodeType === "BANGLADESH_RESELLER") &&
      edge.relationshipStatus === "UNKNOWN"
    ) {
      const bdNode =
        fromNode.nodeType.startsWith("BANGLADESH") ? fromNode : toNode;
      verifications.push({
        verificationType: "VERIFY_BANGLADESH_DISTRIBUTOR",
        priority: "high",
        reason: `Bangladesh entity ${bdNode.name} has unknown relationship status`,
        targetNodeType: bdNode.nodeType,
        targetNodeId: bdNode.id,
        targetEdgeType: edge.edgeType,
        targetEdgeId: edge.id,
        existingEvidence: edgeEvidence.map((e) => ({
          evidenceId: e.evidenceId,
          role: e.evidenceRole,
        })),
        missingEvidence: [
          {
            type: "bangladesh_distribution_agreement",
            description:
              "Bangladesh distribution agreement or authorization",
          },
        ],
        importance: 0.85,
      });
    }
  }

  // VERIFY_TRADE_ROUTE: no trade evidence for claimed route
  const tradeEdges = edges.filter(
    (e) =>
      e.edgeType === "SHIPMENT_FROM" ||
      e.edgeType === "SHIPMENT_TO" ||
      e.edgeType === "EXPORTED_FROM" ||
      e.edgeType === "IMPORTED_TO"
  );
  for (const edge of tradeEdges) {
    const edgeEvidence = evidenceLinks.filter((e) => e.edgeId === edge.id);
    if (
      edgeEvidence.length === 0 &&
      edge.relationshipStatus !== "UNKNOWN"
    ) {
      verifications.push({
        verificationType: "VERIFY_TRADE_ROUTE",
        priority: "medium",
        reason: `Trade route edge has no supporting trade evidence`,
        targetNodeType: null,
        targetNodeId: null,
        targetEdgeType: edge.edgeType,
        targetEdgeId: edge.id,
        existingEvidence: [],
        missingEvidence: [
          {
            type: "trade_documentation",
            description: "Bill of lading, customs declaration, or trade record",
          },
        ],
        importance: 0.75,
      });
    }
  }

  return verifications;
}

// ─── Main Engine Entry Point ─────────────────────────────────────────────────

/**
 * Run the complete supply-chain calculation engine.
 * Pure function: same inputs → same outputs.
 */
export function runSupplyChainEngine(
  input: SupplyChainEngineInput
): SupplyChainEngineResult {
  const {
    tenantId,
    subjectType,
    subjectId,
    nodes,
    edges,
    observations,
    evidenceLinks,
    sources,
    claims,
    conflicts: existingConflicts,
  } = input;

  // 1. Compute input hash
  const inputHash = computeAssessmentInputHash(
    tenantId,
    subjectType,
    subjectId,
    nodes,
    edges,
    observations,
    evidenceLinks,
    existingConflicts
  );

  // 2. Calculate edge confidences
  const edgeConfidences = edges.map((edge) =>
    calculateEdgeConfidence(edge, nodes, observations, evidenceLinks, sources)
  );

  // 3. Determine relationship statuses
  const relationshipStatuses = edges.map((edge) =>
    determineRelationshipStatus(
      edge,
      observations,
      evidenceLinks,
      sources,
      claims,
      nodes
    )
  );

  // 4. Build confidence map for path discovery
  const confidenceMap = new Map<string, number>();
  for (const ec of edgeConfidences) {
    confidenceMap.set(ec.edgeId, ec.finalConfidence);
  }

  // 5. Discover paths from subject node
  const paths = discoverPaths(subjectId, edges, nodes, confidenceMap);

  // 6. Detect anomalies
  const anomalies = detectAnomalies(
    nodes,
    edges,
    observations,
    evidenceLinks,
    sources
  );

  // 7. Detect conflicts
  const newConflicts = detectConflicts(edges, evidenceLinks, nodes);

  // 8. Calculate completeness
  const completeness = calculateCompleteness(
    nodes,
    edges,
    observations,
    evidenceLinks,
    sources,
    paths
  );

  // 9. Generate verification requirements
  const verifications = generateVerificationRequirements(
    nodes,
    edges,
    evidenceLinks,
    claims
  );

  // 10. Calculate overall confidence (average of edge confidences weighted by importance)
  const overallConfidence =
    edgeConfidences.length > 0
      ? edgeConfidences.reduce((sum, ec) => sum + ec.finalConfidence, 0) /
        edgeConfidences.length
      : 0;

  return {
    tenantId,
    subjectType,
    subjectId,
    algorithmVersion: SUPPLY_CHAIN_CONFIG.algorithmVersion,
    inputHash,
    edgeConfidences,
    relationshipStatuses,
    paths,
    anomalies,
    conflicts: newConflicts,
    verifications,
    completeness,
    overallConfidence: Math.round(overallConfidence * 10000) / 10000,
  };
}
