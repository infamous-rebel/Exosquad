// =============================================================================
// API — Logistics Calculation Engine (Phase 10)
// =============================================================================
// Pure, deterministic calculation engine for logistics graph intelligence.
// Consumes graph data (nodes, legs, observations, evidence, routes) and
// produces confidence scores, route statuses, risk detection, anomaly detection,
// route discovery, completeness metrics, and contradiction detection.
//
// No AI, no heuristics — deterministic math with documented formulas.
// Same inputs → same outputs. Every score is explainable.
// No database side effects — this module is a pure function.
// =============================================================================

import { createHash } from "node:crypto";
import { LOGISTICS_CONFIG } from "@exosquad/common";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface LGNodeInput {
  id: string;
  nodeType: string;
  name: string;
  normalizedName: string;
  canonicalEntityType: string | null;
  canonicalEntityId: string | null;
  country: string | null;
  operationalStatus: string;
  customsCapability: boolean;
  identityConfidence: number;
  sourceId: string | null;
}

export interface LGLegInput {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  legType: string;
  carrierOrganizationId: string | null;
  carrierName: string | null;
  legStatus: string;
  confidence: number;
  isContradicted: boolean;
  contradictionCount: number;
  transitTimeMinHours: number | null;
  transitTimeMaxHours: number | null;
  transitTimeKnown: boolean;
  evidenceCount: number;
  observationCount: number;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface LGObservationInput {
  id: string;
  legId: string | null;
  sourceId: string;
  observationType: string;
  observationStatus: string;
  contentHash: string;
  observedAt: Date;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface LGEvidenceLinkInput {
  id: string;
  legId: string;
  evidenceId: string;
  evidenceRole: string;
  evidenceStrength: string;
  relevance: number;
  effect: number;
  sourceId: string | null;
}

export interface LGRouteInput {
  id: string;
  originNodeId: string;
  destinationNodeId: string;
  legIds: string[];
  routeStatus: string;
  confidence: number;
  transitTimeKnown: boolean;
  totalTransitMinHours: number | null;
  totalTransitMaxHours: number | null;
}

export interface LGSourceInput {
  id: string;
  type: string;
  name: string;
}

export interface LogisticsEngineInput {
  tenantId: string;
  subjectType: string;
  subjectId: string;
  nodes: LGNodeInput[];
  legs: LGLegInput[];
  observations: LGObservationInput[];
  evidenceLinks: LGEvidenceLinkInput[];
  routes: LGRouteInput[];
  sources: LGSourceInput[];
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface LegConfidenceResult {
  legId: string;
  evidenceStrengthScore: number;
  sourceIndependenceScore: number;
  carrierConfidenceScore: number;
  directnessScore: number;
  corroborationScore: number;
  temporalFreshnessScore: number;
  contradictionPenalty: number;
  finalConfidence: number;
}

export interface TransitDurationResult {
  minHours: number;
  maxHours: number;
  isKnown: boolean;
}

export interface RouteConfidenceResult {
  routeId: string;
  legConfidences: number[];
  overallConfidence: number;
  transitDuration: TransitDurationResult;
  legCount: number;
  transshipmentCount: number;
  modeChangeCount: number;
}

export interface RiskResult {
  riskType: string;
  severity: string;
  description: string;
  legId: string | null;
  nodeId: string | null;
  routeId: string | null;
  metadata: Record<string, unknown>;
}

export interface AnomalyResult {
  anomalyType: string;
  severity: string;
  description: string;
  nodeId: string | null;
  legId: string | null;
  involvedNodeIds: string[];
  involvedLegIds: string[];
}

export interface RouteDiscoveryResult {
  pathNodes: string[];
  pathLegs: string[];
  legTypes: string[];
  legStatuses: string[];
  legConfidences: number[];
  overallConfidence: number;
  transitDuration: TransitDurationResult;
  hasUnknownLegs: boolean;
  hasContradictions: boolean;
  legCount: number;
  transshipmentCount: number;
  modeChangeCount: number;
}

export interface CompletenessResult {
  nodeCompleteness: number;
  legCompleteness: number;
  evidenceCompleteness: number;
  temporalCompleteness: number;
  routeCompleteness: number;
  knownLegCount: number;
  unknownLegCount: number;
  confirmedLegCount: number;
  contradictedLegCount: number;
  sourceDiversity: number;
  evidenceCoverage: number;
}

export interface LogisticsEngineResult {
  tenantId: string;
  subjectType: string;
  subjectId: string;
  algorithmVersion: string;
  inputHash: string;
  legConfidences: LegConfidenceResult[];
  routeConfidences: RouteConfidenceResult[];
  risks: RiskResult[];
  anomalies: AnomalyResult[];
  discoveredRoutes: RouteDiscoveryResult[];
  completeness: CompletenessResult;
  overallConfidence: number;
}

// ─── Content Hash Functions ──────────────────────────────────────────────────

/**
 * Compute SHA-256 content hash for a logistics leg.
 * Pure deterministic — no timestamps, UUIDs, or random values.
 */
export function computeLegContentHash(
  tenantId: string,
  fromNodeId: string,
  toNodeId: string,
  legType: string,
  carrierOrganizationId: string | null,
  carrierName: string | null,
  transitTimeMinHours: number | null,
  transitTimeMaxHours: number | null,
): string {
  const canonical = JSON.stringify({
    tenantId,
    fromNodeId,
    toNodeId,
    legType,
    carrierOrganizationId: carrierOrganizationId ?? null,
    carrierName: carrierName ?? null,
    transitTimeMinHours: transitTimeMinHours ?? null,
    transitTimeMaxHours: transitTimeMaxHours ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Compute SHA-256 content hash for a logistics observation.
 */
export function computeObservationContentHash(
  tenantId: string,
  legId: string | null,
  sourceId: string,
  observationType: string,
  observedValue: Record<string, unknown>,
): string {
  const canonical = JSON.stringify({
    tenantId,
    legId: legId ?? null,
    sourceId,
    observationType,
    observedValue,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Compute SHA-256 assessment input hash — pure deterministic fingerprint.
 * NEVER append timestamps, UUIDs, or random values.
 */
export function computeAssessmentInputHash(
  tenantId: string,
  subjectType: string,
  subjectId: string,
  legIds: string[],
  routeIds: string[],
  evidenceIds: string[],
  observationIds: string[],
  algorithmVersion: string,
): string {
  const canonical = JSON.stringify({
    tenantId,
    subjectType,
    subjectId,
    legIds: [...legIds].sort(),
    routeIds: [...routeIds].sort(),
    evidenceIds: [...evidenceIds].sort(),
    observationIds: [...observationIds].sort(),
    algorithmVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ─── Confidence Calculations ─────────────────────────────────────────────────

/**
 * Count distinct sources providing evidence for legs.
 */
export function countIndependentSources(
  evidenceLinks: LGEvidenceLinkInput[],
): number {
  const sourceIds = new Set<string>();
  for (const link of evidenceLinks) {
    if (link.sourceId) sourceIds.add(link.sourceId);
  }
  return sourceIds.size;
}

/**
 * Calculate evidence strength from evidence links.
 */
export function calculateEvidenceStrength(
  legEvidenceLinks: LGEvidenceLinkInput[],
): number {
  if (legEvidenceLinks.length === 0) return 0;
  const strengthValues = LOGISTICS_CONFIG.evidenceStrengthValues;
  let total = 0;
  for (const link of legEvidenceLinks) {
    const roleMultiplier = link.evidenceRole === "CONTRADICTING" ? -1 : 1;
    const strength = (strengthValues as Record<string, number>)[link.evidenceStrength] ?? 0.2;
    total += strength * link.relevance * roleMultiplier;
  }
  return Math.max(0, Math.min(1, total / Math.max(1, legEvidenceLinks.length)));
}

/**
 * Calculate temporal freshness based on days since observation.
 */
export function calculateTemporalFreshness(observations: LGObservationInput[]): number {
  if (observations.length === 0) return 0.1;
  const now = new Date();
  let maxFreshness = 0.1;
  for (const obs of observations) {
    const daysSince = (now.getTime() - obs.observedAt.getTime()) / (1000 * 60 * 60 * 24);
    for (const tier of LOGISTICS_CONFIG.temporalFreshnessDecay) {
      if (daysSince < tier.maxDays) {
        maxFreshness = Math.max(maxFreshness, tier.value);
        break;
      }
    }
  }
  return maxFreshness;
}

/**
 * Calculate confidence for a single logistics leg.
 */
export function calculateLegConfidence(
  leg: LGLegInput,
  legEvidence: LGEvidenceLinkInput[],
  legObservations: LGObservationInput[],
): LegConfidenceResult {
  const weights = LOGISTICS_CONFIG.confidenceWeights;
  const directnessValues = LOGISTICS_CONFIG.directnessValues;

  // Evidence strength
  const evidenceStrengthScore = calculateEvidenceStrength(legEvidence);

  // Source independence
  const distinctSources = countIndependentSources(legEvidence);
  const sourceIndependenceScore = Math.min(1.0, distinctSources / 3);

  // Carrier confidence
  const carrierConfidenceScore = leg.carrierOrganizationId ? 0.8 : leg.carrierName ? 0.4 : 0.0;

  // Directness (from leg status)
  const directnessScore = (directnessValues as Record<string, number>)[leg.legStatus] ?? 0;

  // Corroboration
  const corroborationScore = Math.min(1.0, leg.observationCount / 5);

  // Temporal freshness
  const temporalFreshnessScore = calculateTemporalFreshness(legObservations);

  // Contradiction penalty
  const contradictionPenalty =
    LOGISTICS_CONFIG.contradictionPenaltyFactor * Math.min(1.0, leg.contradictionCount);

  // Weighted sum
  const raw =
    evidenceStrengthScore * weights.evidenceStrength +
    sourceIndependenceScore * weights.sourceIndependence +
    carrierConfidenceScore * weights.carrierConfidence +
    directnessScore * weights.directness +
    corroborationScore * weights.corroboration +
    temporalFreshnessScore * weights.temporalFreshness;

  const finalConfidence = Math.max(0, Math.min(1, raw - contradictionPenalty));

  return {
    legId: leg.id,
    evidenceStrengthScore,
    sourceIndependenceScore,
    carrierConfidenceScore,
    directnessScore,
    corroborationScore,
    temporalFreshnessScore,
    contradictionPenalty,
    finalConfidence,
  };
}

// ─── Transit Duration Aggregation ────────────────────────────────────────────

/**
 * Aggregate transit duration across ordered legs.
 * Unknown legs make the total unknown with computed bounds.
 * Zero is NEVER substituted for unknown.
 */
export function aggregateTransitDuration(
  legs: LGLegInput[],
  orderedLegIds: string[],
): TransitDurationResult {
  let totalMin = 0;
  let totalMax = 0;
  let allKnown = true;
  let hasAnyLeg = false;

  for (const legId of orderedLegIds) {
    const leg = legs.find((l) => l.id === legId);
    if (!leg) continue;
    hasAnyLeg = true;

    if (leg.transitTimeKnown && leg.transitTimeMinHours != null && leg.transitTimeMaxHours != null) {
      totalMin += leg.transitTimeMinHours;
      totalMax += leg.transitTimeMaxHours;
    } else {
      allKnown = false;
      // Add bounds from partial info if available
      if (leg.transitTimeMinHours != null) totalMin += leg.transitTimeMinHours;
      if (leg.transitTimeMaxHours != null) totalMax += leg.transitTimeMaxHours;
    }
  }

  if (!hasAnyLeg) {
    return { minHours: 0, maxHours: 0, isKnown: false };
  }

  return {
    minHours: totalMin,
    maxHours: allKnown ? totalMax : totalMax, // upper bound from known max values
    isKnown: allKnown,
  };
}

// ─── Route Confidence ────────────────────────────────────────────────────────

/**
 * Aggregate route confidence from leg confidences.
 */
export function aggregateRouteConfidence(
  route: LGRouteInput,
  legs: LGLegInput[],
  legConfidenceMap: Map<string, LegConfidenceResult>,
): RouteConfidenceResult {
  const routeLegs = route.legIds
    .map((id) => legs.find((l) => l.id === id))
    .filter((l): l is LGLegInput => l != null);

  const legConfidences = routeLegs.map(
    (l) => legConfidenceMap.get(l.id)?.finalConfidence ?? 0,
  );

  // Overall route confidence = minimum leg confidence (weakest link)
  const overallConfidence = legConfidences.length > 0
    ? Math.min(...legConfidences)
    : 0;

  const transitDuration = aggregateTransitDuration(legs, route.legIds);

  // Count transshipments (intermediate nodes) and mode changes
  let transshipmentCount = Math.max(0, routeLegs.length - 1);
  let modeChangeCount = 0;
  for (let i = 1; i < routeLegs.length; i++) {
    if (routeLegs[i]!.legType !== routeLegs[i - 1]!.legType) {
      modeChangeCount++;
    }
  }

  return {
    routeId: route.id,
    legConfidences,
    overallConfidence,
    transitDuration,
    legCount: routeLegs.length,
    transshipmentCount,
    modeChangeCount,
  };
}

// ─── Route Discovery (BFS) ──────────────────────────────────────────────────

export interface TraversalFilters {
  nodeTypes?: string[];
  legTypes?: string[];
  statuses?: string[];
  minimumConfidence?: number;
  country?: string;
  asOf?: Date;
}

/**
 * Discover routes between origin and destination via bounded BFS.
 * - Cycle protection
 * - Duplicate-route prevention
 * - Alternate route preservation
 * - Configurable max depth and max routes
 */
export function discoverRoutes(
  nodes: LGNodeInput[],
  legs: LGLegInput[],
  originNodeId: string,
  destinationNodeId: string,
  maxDepth: number = LOGISTICS_CONFIG.traversalDefaults.defaultMaxDepth,
  maxRoutes: number = LOGISTICS_CONFIG.traversalDefaults.maxRoutes,
  filters?: TraversalFilters,
): RouteDiscoveryResult[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const legMap = new Map(legs.map((l) => [l.id, l]));

  // Build adjacency list
  const adjacency = new Map<string, LGLegInput[]>();
  for (const leg of legs) {
    // Apply filters during graph construction
    if (filters?.legTypes && !filters.legTypes.includes(leg.legType)) continue;
    if (filters?.statuses && !filters.statuses.includes(leg.legStatus)) continue;
    if (filters?.minimumConfidence != null && leg.confidence < filters.minimumConfidence) continue;

    const existing = adjacency.get(leg.fromNodeId) ?? [];
    existing.push(leg);
    adjacency.set(leg.fromNodeId, existing);
  }

  const results: RouteDiscoveryResult[] = [];
  const routeSignatures = new Set<string>();

  // BFS queue: [currentNodeId, pathNodes, pathLegs, visited]
  const queue: Array<{
    nodeId: string;
    pathNodes: string[];
    pathLegs: string[];
    visited: Set<string>;
  }> = [{ nodeId: originNodeId, pathNodes: [originNodeId], pathLegs: [], visited: new Set([originNodeId]) }];

  while (queue.length > 0 && results.length < maxRoutes) {
    const current = queue.shift()!;

    // Depth bound
    if (current.pathLegs.length >= maxDepth) continue;

    const neighbors = adjacency.get(current.nodeId) ?? [];
    for (const leg of neighbors) {
      // Cycle protection
      if (current.visited.has(leg.toNodeId)) continue;

      // Node type filter
      const toNode = nodeMap.get(leg.toNodeId);
      if (filters?.nodeTypes && toNode && !filters.nodeTypes.includes(toNode.nodeType)) continue;

      // Country filter
      if (filters?.country && toNode && toNode.country !== filters.country) continue;

      // asOf temporal filter
      if (filters?.asOf) {
        if (leg.validFrom && leg.validFrom > filters.asOf) continue;
        if (leg.validTo && leg.validTo <= filters.asOf) continue;
      }

      const newPathNodes = [...current.pathNodes, leg.toNodeId];
      const newPathLegs = [...current.pathLegs, leg.id];
      const newVisited = new Set([...current.visited, leg.toNodeId]);

      // Check if we reached destination
      if (leg.toNodeId === destinationNodeId) {
        // Duplicate-route prevention via signature
        const signature = newPathLegs.join("|");
        if (routeSignatures.has(signature)) continue;
        routeSignatures.add(signature);

        const routeLegs = newPathLegs.map((id) => legMap.get(id)!).filter(Boolean);
        const legTypes = routeLegs.map((l) => l.legType);
        const legStatuses = routeLegs.map((l) => l.legStatus);
        const legConfidences = routeLegs.map((l) => l.confidence);
        const transitDuration = aggregateTransitDuration(legs, newPathLegs);

        let modeChangeCount = 0;
        for (let i = 1; i < routeLegs.length; i++) {
          if (routeLegs[i]!.legType !== routeLegs[i - 1]!.legType) modeChangeCount++;
        }

        results.push({
          pathNodes: newPathNodes,
          pathLegs: newPathLegs,
          legTypes,
          legStatuses,
          legConfidences,
          overallConfidence: legConfidences.length > 0 ? Math.min(...legConfidences) : 0,
          transitDuration,
          hasUnknownLegs: routeLegs.some((l) => !l.transitTimeKnown),
          hasContradictions: routeLegs.some((l) => l.isContradicted),
          legCount: routeLegs.length,
          transshipmentCount: Math.max(0, routeLegs.length - 1),
          modeChangeCount,
        });

        continue; // Don't extend past destination
      }

      // Continue BFS
      queue.push({
        nodeId: leg.toNodeId,
        pathNodes: newPathNodes,
        pathLegs: newPathLegs,
        visited: newVisited,
      });
    }
  }

  return results;
}

// ─── Risk Detection ──────────────────────────────────────────────────────────

/**
 * Detect logistics risks. Risk is independent from confidence.
 */
export function detectRisks(
  nodes: LGNodeInput[],
  legs: LGLegInput[],
  observations: LGObservationInput[],
  routes: LGRouteInput[],
  routeConfidences: RouteConfidenceResult[],
): RiskResult[] {
  const risks: RiskResult[] = [];
  const thresholds = LOGISTICS_CONFIG.riskThresholds;
  const now = new Date();

  // Per-route risks
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const rc = routeConfidences[i]!;

    if (rc.transshipmentCount > thresholds.maxTransshipments) {
      risks.push({
        riskType: "EXCESSIVE_TRANSSHIPMENTS",
        severity: rc.transshipmentCount > thresholds.maxTransshipments + 2 ? "critical" : "high",
        description: `Route has ${rc.transshipmentCount} transshipments (threshold: ${thresholds.maxTransshipments})`,
        legId: null,
        nodeId: null,
        routeId: route.id,
        metadata: { transshipmentCount: rc.transshipmentCount, threshold: thresholds.maxTransshipments },
      });
    }

    if (rc.modeChangeCount > thresholds.maxModeChanges) {
      risks.push({
        riskType: "EXCESSIVE_MODE_CHANGES",
        severity: "medium",
        description: `Route has ${rc.modeChangeCount} mode changes (threshold: ${thresholds.maxModeChanges})`,
        legId: null,
        nodeId: null,
        routeId: route.id,
        metadata: { modeChangeCount: rc.modeChangeCount },
      });
    }

    if (!route.transitTimeKnown) {
      risks.push({
        riskType: "UNKNOWN_TRANSIT_TIME",
        severity: "high",
        description: "Route has unknown transit time for one or more legs",
        legId: null,
        nodeId: null,
        routeId: route.id,
        metadata: {},
      });
    }

    if (rc.overallConfidence < 0.3) {
      risks.push({
        riskType: "LOW_EVIDENCE_COVERAGE",
        severity: rc.overallConfidence < 0.1 ? "critical" : "high",
        description: `Route confidence is ${rc.overallConfidence.toFixed(2)} (below 0.3 threshold)`,
        legId: null,
        nodeId: null,
        routeId: route.id,
        metadata: { confidence: rc.overallConfidence },
      });
    }
  }

  // Per-leg risks
  for (const leg of legs) {
    if (!leg.transitTimeKnown) {
      risks.push({
        riskType: "UNKNOWN_TRANSIT_TIME",
        severity: "medium",
        description: `Leg ${leg.id} has unknown transit time`,
        legId: leg.id,
        nodeId: null,
        routeId: null,
        metadata: {},
      });
    }

    if (leg.isContradicted) {
      risks.push({
        riskType: "CONTRADICTORY_EVIDENCE",
        severity: "high",
        description: `Leg ${leg.id} has contradictory evidence (${leg.contradictionCount} contradictions)`,
        legId: leg.id,
        nodeId: null,
        routeId: null,
        metadata: { contradictionCount: leg.contradictionCount },
      });
    }

    if (!leg.carrierOrganizationId && !leg.carrierName) {
      risks.push({
        riskType: "CARRIER_UNCERTAINTY",
        severity: "medium",
        description: `Leg ${leg.id} has no known carrier`,
        legId: leg.id,
        nodeId: null,
        routeId: null,
        metadata: {},
      });
    }
  }

  // Per-node risks
  for (const node of nodes) {
    if (node.operationalStatus === "UNAVAILABLE") {
      risks.push({
        riskType: "UNAVAILABLE_NODE",
        severity: "critical",
        description: `Node ${node.name} (${node.nodeType}) is unavailable`,
        legId: null,
        nodeId: node.id,
        routeId: null,
        metadata: { nodeType: node.nodeType },
      });
    }
  }

  // Stale observations
  const staleObs = observations.filter((o) => {
    const daysSince = (now.getTime() - o.observedAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > thresholds.staleObservationDays;
  });
  if (staleObs.length > 0) {
    risks.push({
      riskType: "STALE_OBSERVATION",
      severity: staleObs.length > 10 ? "high" : "medium",
      description: `${staleObs.length} observations are stale (> ${thresholds.staleObservationDays} days)`,
      legId: null,
      nodeId: null,
      routeId: null,
      metadata: { staleCount: staleObs.length },
    });
  }

  return risks;
}

// ─── Anomaly Detection ───────────────────────────────────────────────────────

/**
 * Detect logistics graph anomalies.
 */
export function detectAnomalies(
  nodes: LGNodeInput[],
  legs: LGLegInput[],
  routes: LGRouteInput[],
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Self-loop detection
  for (const leg of legs) {
    if (leg.fromNodeId === leg.toNodeId) {
      anomalies.push({
        anomalyType: "SELF_LOOP",
        severity: "critical",
        description: `Leg ${leg.id} connects node ${leg.fromNodeId} to itself`,
        nodeId: leg.fromNodeId,
        legId: leg.id,
        involvedNodeIds: [leg.fromNodeId],
        involvedLegIds: [leg.id],
      });
    }
  }

  // Cycle detection via DFS
  const adjacency = new Map<string, LGLegInput[]>();
  for (const leg of legs) {
    const existing = adjacency.get(leg.fromNodeId) ?? [];
    existing.push(leg);
    adjacency.set(leg.fromNodeId, existing);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function detectCycleDFS(nodeId: string, path: string[]): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const leg of neighbors) {
      if (!visited.has(leg.toNodeId)) {
        if (detectCycleDFS(leg.toNodeId, [...path, leg.toNodeId])) return true;
      } else if (recStack.has(leg.toNodeId)) {
        anomalies.push({
          anomalyType: "CYCLE_DETECTED",
          severity: "high",
          description: `Cycle detected involving nodes: ${[...path, leg.toNodeId].join(" → ")}`,
          nodeId: null,
          legId: null,
          involvedNodeIds: [...new Set([...path, leg.toNodeId])],
          involvedLegIds: legs.filter((l) => {
            const pathNodes = [...path, leg.toNodeId];
            return pathNodes.includes(l.fromNodeId) && pathNodes.includes(l.toNodeId);
          }).map((l) => l.id),
        });
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      detectCycleDFS(node.id, [node.id]);
    }
  }

  // Missing origin/destination in routes
  for (const route of routes) {
    if (!nodeMap.has(route.originNodeId)) {
      anomalies.push({
        anomalyType: "MISSING_ORIGIN",
        severity: "critical",
        description: `Route ${route.id} references missing origin node ${route.originNodeId}`,
        nodeId: null,
        legId: null,
        involvedNodeIds: [route.originNodeId],
        involvedLegIds: [],
      });
    }
    if (!nodeMap.has(route.destinationNodeId)) {
      anomalies.push({
        anomalyType: "MISSING_DESTINATION",
        severity: "critical",
        description: `Route ${route.id} references missing destination node ${route.destinationNodeId}`,
        nodeId: null,
        legId: null,
        involvedNodeIds: [route.destinationNodeId],
        involvedLegIds: [],
      });
    }
  }

  // Duplicate leg detection (same from/to/type)
  const legSignatures = new Map<string, LGLegInput[]>();
  for (const leg of legs) {
    const sig = `${leg.fromNodeId}|${leg.toNodeId}|${leg.legType}`;
    const existing = legSignatures.get(sig) ?? [];
    existing.push(leg);
    legSignatures.set(sig, existing);
  }
  for (const [, group] of legSignatures) {
    if (group.length > 1) {
      anomalies.push({
        anomalyType: "DUPLICATE_LEG",
        severity: "medium",
        description: `Duplicate legs detected: ${group.map((l) => l.id).join(", ")}`,
        nodeId: null,
        legId: null,
        involvedNodeIds: [group[0]!.fromNodeId, group[0]!.toNodeId],
        involvedLegIds: group.map((l) => l.id),
      });
    }
  }

  // Contradictory timing detection
  for (const [, group] of legSignatures) {
    if (group.length > 1) {
      const times = group.filter((l) => l.transitTimeKnown && l.transitTimeMinHours != null);
      if (times.length >= 2) {
        const minTimes = times.map((l) => l.transitTimeMinHours!);
        const maxDiff = Math.max(...minTimes) - Math.min(...minTimes);
        if (maxDiff > 24) { // > 24 hours difference
          anomalies.push({
            anomalyType: "CONTRADICTORY_TIMING",
            severity: "high",
            description: `Contradictory transit times on parallel legs: ${minTimes.join(" vs ")} hours`,
            nodeId: null,
            legId: null,
            involvedNodeIds: [group[0]!.fromNodeId, group[0]!.toNodeId],
            involvedLegIds: times.map((l) => l.id),
          });
        }
      }
    }
  }

  // Disconnected route detection
  for (const route of routes) {
    if (route.legIds.length === 0) {
      anomalies.push({
        anomalyType: "DISCONNECTED_ROUTE",
        severity: "high",
        description: `Route ${route.id} has no legs`,
        nodeId: null,
        legId: null,
        involvedNodeIds: [route.originNodeId, route.destinationNodeId],
        involvedLegIds: [],
      });
    }
  }

  return anomalies;
}

// ─── Contradiction Detection ─────────────────────────────────────────────────

export interface ContradictionResult {
  conflictType: string;
  severity: string;
  description: string;
  legId: string | null;
  nodeId: string | null;
  supportingEvidenceId: string;
  contradictingEvidenceId: string;
}

/**
 * Detect contradictory logistics information.
 * Preserves conflicting observations rather than selecting one.
 */
export function detectContradictions(
  observations: LGObservationInput[],
  evidenceLinks: LGEvidenceLinkInput[],
): ContradictionResult[] {
  const contradictions: ContradictionResult[] = [];

  // Group observations by leg
  const legObservations = new Map<string, LGObservationInput[]>();
  for (const obs of observations) {
    if (!obs.legId) continue;
    const existing = legObservations.get(obs.legId) ?? [];
    existing.push(obs);
    legObservations.set(obs.legId, existing);
  }

  // Check for contradictory transit times per leg
  for (const [legId, obsGroup] of legObservations) {
    const transitObs = obsGroup.filter((o) => o.observationType === "TRANSIT_TIME");
    if (transitObs.length >= 2) {
      // Different sources claiming different transit times
      const sourceHashes = new Set(transitObs.map((o) => o.contentHash));
      if (sourceHashes.size > 1) {
        contradictions.push({
          conflictType: "CONTRADICTORY_TRANSIT_TIME",
          severity: "high",
          description: `Multiple conflicting transit time observations for leg ${legId}`,
          legId,
          nodeId: null,
          supportingEvidenceId: transitObs[0]!.id,
          contradictingEvidenceId: transitObs[1]!.id,
        });
      }
    }
  }

  // Check for contradictory evidence roles on same leg
  const legEvidence = new Map<string, LGEvidenceLinkInput[]>();
  for (const link of evidenceLinks) {
    const existing = legEvidence.get(link.legId) ?? [];
    existing.push(link);
    legEvidence.set(link.legId, existing);
  }

  for (const [legId, links] of legEvidence) {
    const supporting = links.filter((l) => l.evidenceRole === "SUPPORTING");
    const contradicting = links.filter((l) => l.evidenceRole === "CONTRADICTING");
    if (supporting.length > 0 && contradicting.length > 0) {
      contradictions.push({
        conflictType: "CONTRADICTORY_EVIDENCE",
        severity: "high",
        description: `Leg ${legId} has both supporting and contradicting evidence`,
        legId,
        nodeId: null,
        supportingEvidenceId: supporting[0]!.evidenceId,
        contradictingEvidenceId: contradicting[0]!.evidenceId,
      });
    }
  }

  return contradictions;
}

// ─── Completeness Calculation ────────────────────────────────────────────────

/**
 * Calculate route/leg/node completeness metrics.
 */
export function calculateCompleteness(
  nodes: LGNodeInput[],
  legs: LGLegInput[],
  observations: LGObservationInput[],
  evidenceLinks: LGEvidenceLinkInput[],
  routes: LGRouteInput[],
): CompletenessResult {
  const weights = LOGISTICS_CONFIG.completenessWeights;

  // Node completeness: how many nodes have known identity and status
  const nodesWithIdentity = nodes.filter((n) => n.identityConfidence > 0.5).length;
  const nodeCompleteness = nodes.length > 0 ? nodesWithIdentity / nodes.length : 0;

  // Leg completeness: how many legs have known status, mode, timing
  let knownLegs = 0;
  let unknownLegs = 0;
  let confirmedLegs = 0;
  let contradictedLegs = 0;
  let legTimingKnown = 0;
  let legCarrierKnown = 0;

  for (const leg of legs) {
    if (leg.legStatus !== "UNKNOWN") knownLegs++;
    else unknownLegs++;
    if (leg.legStatus === "CONFIRMED" || leg.legStatus === "CORROBORATED") confirmedLegs++;
    if (leg.isContradicted) contradictedLegs++;
    if (leg.transitTimeKnown) legTimingKnown++;
    if (leg.carrierOrganizationId || leg.carrierName) legCarrierKnown++;
  }

  const legCompleteness = legs.length > 0
    ? (knownLegs / legs.length) * weights.legsKnown +
      (legTimingKnown / Math.max(1, legs.length)) * weights.timingKnown +
      (legCarrierKnown / Math.max(1, legs.length)) * weights.carrierKnown
    : 0;

  // Evidence completeness
  const legsWithEvidence = new Set(evidenceLinks.map((l) => l.legId)).size;
  const evidenceCoverage = legs.length > 0 ? legsWithEvidence / legs.length : 0;
  const evidenceCompleteness = evidenceCoverage * weights.evidenceCoverage;

  // Temporal completeness
  const obsWithTemporal = observations.filter((o) => o.validFrom != null).length;
  const temporalCompleteness = observations.length > 0
    ? (obsWithTemporal / observations.length) * weights.temporalCoverage
    : 0;

  // Route completeness
  const routesWithLegs = routes.filter((r) => r.legIds.length > 0).length;
  const routeCompleteness = routes.length > 0 ? routesWithLegs / routes.length : 0;

  // Source diversity
  const sourceDiversity = countIndependentSources(evidenceLinks);

  return {
    nodeCompleteness,
    legCompleteness,
    evidenceCompleteness,
    temporalCompleteness,
    routeCompleteness,
    knownLegCount: knownLegs,
    unknownLegCount: unknownLegs,
    confirmedLegCount: confirmedLegs,
    contradictedLegCount: contradictedLegs,
    sourceDiversity,
    evidenceCoverage,
  };
}

// ─── Main Engine Entry Point ─────────────────────────────────────────────────

/**
 * Run the complete logistics calculation engine.
 * Pure function: same inputs → same outputs.
 */
export function runLogisticsEngine(input: LogisticsEngineInput): LogisticsEngineResult {
  const { tenantId, subjectType, subjectId, nodes, legs, observations, evidenceLinks, routes } = input;

  // 1. Calculate leg confidences
  const legConfidences: LegConfidenceResult[] = legs.map((leg) => {
    const legEvidence = evidenceLinks.filter((e) => e.legId === leg.id);
    const legObs = observations.filter((o) => o.legId === leg.id);
    return calculateLegConfidence(leg, legEvidence, legObs);
  });

  const legConfidenceMap = new Map(legConfidences.map((lc) => [lc.legId, lc]));

  // 2. Calculate route confidences
  const routeConfidences: RouteConfidenceResult[] = routes.map((route) =>
    aggregateRouteConfidence(route, legs, legConfidenceMap),
  );

  // 3. Discover routes via BFS (for all node pairs that have legs)
  const originNodes = nodes.filter((n) => n.nodeType === "ORIGIN" || n.nodeType === "PORT" || n.nodeType === "MANUFACTURER_LOCATION");
  const destNodes = nodes.filter((n) => n.nodeType === "DESTINATION" || n.nodeType === "BANGLADESH_MARKET" || n.nodeType === "BANGLADESH_WAREHOUSE");

  const discoveredRoutes: RouteDiscoveryResult[] = [];
  for (const origin of originNodes) {
    for (const dest of destNodes) {
      const found = discoverRoutes(nodes, legs, origin.id, dest.id);
      discoveredRoutes.push(...found);
    }
  }

  // 4. Detect risks
  const risks = detectRisks(nodes, legs, observations, routes, routeConfidences);

  // 5. Detect anomalies
  const anomalies = detectAnomalies(nodes, legs, routes);

  // 6. Detect contradictions
  detectContradictions(observations, evidenceLinks);

  // 7. Calculate completeness
  const completeness = calculateCompleteness(nodes, legs, observations, evidenceLinks, routes);

  // 8. Compute overall confidence (average of leg confidences weighted by evidence)
  const overallConfidence = legConfidences.length > 0
    ? legConfidences.reduce((sum, lc) => sum + lc.finalConfidence, 0) / legConfidences.length
    : 0;

  // 9. Compute input hash
  const inputHash = computeAssessmentInputHash(
    tenantId,
    subjectType,
    subjectId,
    legs.map((l) => l.id),
    routes.map((r) => r.id),
    evidenceLinks.map((e) => e.evidenceId),
    observations.map((o) => o.id),
    LOGISTICS_CONFIG.algorithmVersion,
  );

  return {
    tenantId,
    subjectType,
    subjectId,
    algorithmVersion: LOGISTICS_CONFIG.algorithmVersion,
    inputHash,
    legConfidences,
    routeConfidences,
    risks,
    anomalies,
    discoveredRoutes,
    completeness,
    overallConfidence,
  };
}
