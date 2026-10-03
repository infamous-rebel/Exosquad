// =============================================================================
// API — Logistics Intelligence Service (Phase 10)
// =============================================================================
// Orchestrator that loads logistics graph data from the database, runs the pure
// calculation engine, and persists results atomically with full provenance.
// Handles: assessment, recalculation, history, provenance, graph queries.
// =============================================================================

import { prisma } from "@exosquad/database";
import { Prisma } from "@exosquad/database";
import type { LogisticsRouteStatus } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { NotFoundError, LOGISTICS_CONFIG } from "@exosquad/common";
import {
  runLogisticsEngine,
  computeLegContentHash,
  discoverRoutes,
  type LGNodeInput,
  type LGLegInput,
  type LGObservationInput,
  type LGEvidenceLinkInput,
  type LGRouteInput,
  type LGSourceInput,
} from "./logistics-engine.js";

// ─── Assessment Input ────────────────────────────────────────────────────────

export interface AssessLogisticsInput {
  tenantId: string;
  subjectType: string;
  subjectId: string;
}

export interface LogisticsAssessmentResult {
  assessmentId: string;
  status: string;
  routeCount: number;
  legCount: number;
  nodeCount: number;
  overallConfidence: number;
  algorithmVersion: string;
  riskCount: number;
  anomalyCount: number;
  conflictCount: number;
}

// ─── Main Assessment Orchestrator ────────────────────────────────────────────

/**
 * Run logistics assessment for a subject entity.
 * 1. Load graph data (nodes, legs, observations, evidence, sources, routes)
 * 2. Run the deterministic engine
 * 3. Persist assessment, decision, risks, anomalies
 * 4. Update leg statuses and confidences
 * 5. Return summary
 */
export async function assessLogistics(params: AssessLogisticsInput): Promise<LogisticsAssessmentResult> {
  const startTime = Date.now();
  const { tenantId, subjectType, subjectId } = params;

  logger.info({ tenantId, subjectType, subjectId }, "logistics_assessment_started");

  // 1. Load graph data
  const graphData = await loadGraphData(tenantId);

  // 2. Run engine
  const engineResult = runLogisticsEngine({
    tenantId,
    subjectType,
    subjectId,
    nodes: graphData.nodes,
    legs: graphData.legs,
    observations: graphData.observations,
    evidenceLinks: graphData.evidenceLinks,
    routes: graphData.routes,
    sources: graphData.sources,
  });

  // 3. Persist results atomically
  const assessment = await prisma.$transaction(async (tx) => {
    // Update leg statuses and confidences
    for (const lc of engineResult.legConfidences) {
      await tx.logisticsLeg.update({
        where: { id: lc.legId },
        data: { confidence: lc.finalConfidence },
      });
    }

    // Determine next version
    const latestAssessment = await tx.logisticsAssessment.findFirst({
      where: { tenantId, subjectType, subjectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestAssessment?.version ?? 0) + 1;

    const calculatedAt = new Date();

    const newAssessment = await tx.logisticsAssessment.create({
      data: {
        tenantId,
        subjectType,
        subjectId,
        status: engineResult.completeness.legCompleteness > 0.5 ? "COMPLETE" : "INSUFFICIENT",
        algorithmVersion: engineResult.algorithmVersion,
        inputHash: engineResult.inputHash,
        version: nextVersion,
        routeCount: engineResult.routeConfidences.length,
        legCount: engineResult.legConfidences.length,
        nodeCount: engineResult.legConfidences.length > 0 ? new Set([...engineResult.legConfidences.map(() => "n")]).size : 0,
        knownLegCount: engineResult.completeness.knownLegCount,
        unknownLegCount: engineResult.completeness.unknownLegCount,
        confirmedLegCount: engineResult.completeness.confirmedLegCount,
        contradictedLegCount: engineResult.completeness.contradictedLegCount,
        sourceDiversity: engineResult.completeness.sourceDiversity,
        evidenceCoverage: engineResult.completeness.evidenceCoverage,
        overallConfidence: engineResult.overallConfidence,
        nodeCompleteness: engineResult.completeness.nodeCompleteness,
        legCompleteness: engineResult.completeness.legCompleteness,
        evidenceCompleteness: engineResult.completeness.evidenceCompleteness,
        temporalCompleteness: engineResult.completeness.temporalCompleteness,
        routeCompleteness: engineResult.completeness.routeCompleteness,
        riskCount: engineResult.risks.length,
        anomalyCount: engineResult.anomalies.length,
        conflictCount: 0,
        calculatedAt,
      },
    });

    // Persist decision snapshot
    await tx.logisticsDecision.create({
      data: {
        assessmentId: newAssessment.id,
        algorithmVersion: engineResult.algorithmVersion,
        evidenceStrengthScore: engineResult.legConfidences.reduce((s, lc) => s + lc.evidenceStrengthScore, 0) / Math.max(1, engineResult.legConfidences.length),
        independenceScore: engineResult.legConfidences.reduce((s, lc) => s + lc.sourceIndependenceScore, 0) / Math.max(1, engineResult.legConfidences.length),
        carrierConfidenceScore: engineResult.legConfidences.reduce((s, lc) => s + lc.carrierConfidenceScore, 0) / Math.max(1, engineResult.legConfidences.length),
        directnessScore: engineResult.legConfidences.reduce((s, lc) => s + lc.directnessScore, 0) / Math.max(1, engineResult.legConfidences.length),
        corroborationScore: engineResult.legConfidences.reduce((s, lc) => s + lc.corroborationScore, 0) / Math.max(1, engineResult.legConfidences.length),
        freshnessScore: engineResult.legConfidences.reduce((s, lc) => s + lc.temporalFreshnessScore, 0) / Math.max(1, engineResult.legConfidences.length),
        contradictionPenalty: engineResult.legConfidences.reduce((s, lc) => s + lc.contradictionPenalty, 0) / Math.max(1, engineResult.legConfidences.length),
        completenessScore: engineResult.completeness.legCompleteness,
        finalConfidence: engineResult.overallConfidence,
        inputHash: engineResult.inputHash,
        legIds: JSON.parse(JSON.stringify(engineResult.legConfidences.map((lc) => lc.legId))),
        routeIds: JSON.parse(JSON.stringify(engineResult.routeConfidences.map((rc) => rc.routeId))),
        evidenceIds: JSON.parse(JSON.stringify(graphData.evidenceLinks.map((e) => e.evidenceId))),
        observationIds: JSON.parse(JSON.stringify(graphData.observations.map((o) => o.id))),
        calculatedAt,
      },
    });

    // Persist risks
    for (const risk of engineResult.risks) {
      await tx.logisticsRisk.create({
        data: {
          tenantId,
          assessmentId: newAssessment.id,
          riskType: risk.riskType,
          severity: risk.severity,
          description: risk.description,
          legId: risk.legId,
          nodeId: risk.nodeId,
          routeId: risk.routeId,
          metadata: risk.metadata as Prisma.InputJsonValue,
        },
      });
    }

    // Persist anomalies
    for (const anomaly of engineResult.anomalies) {
      await tx.logisticsAnomaly.create({
        data: {
          tenantId,
          assessmentId: newAssessment.id,
          anomalyType: anomaly.anomalyType,
          severity: anomaly.severity,
          description: anomaly.description,
          nodeId: anomaly.nodeId,
          legId: anomaly.legId,
          involvedNodeIds: JSON.parse(JSON.stringify(anomaly.involvedNodeIds)),
          involvedLegIds: JSON.parse(JSON.stringify(anomaly.involvedLegIds)),
        },
      });
    }

    return newAssessment;
  });

  const elapsed = Date.now() - startTime;
  logger.info(
    { tenantId, assessmentId: assessment.id, elapsedMs: elapsed },
    "logistics_assessment_completed",
  );

  return {
    assessmentId: assessment.id,
    status: assessment.status,
    routeCount: assessment.routeCount,
    legCount: assessment.legCount,
    nodeCount: graphData.nodes.length,
    overallConfidence: assessment.overallConfidence,
    algorithmVersion: assessment.algorithmVersion,
    riskCount: assessment.riskCount,
    anomalyCount: assessment.anomalyCount,
    conflictCount: assessment.conflictCount,
  };
}

// ─── Graph Data Loader ───────────────────────────────────────────────────────

async function loadGraphData(tenantId: string) {
  // Load nodes
  const dbNodes = await prisma.logisticsNode.findMany({
    where: { tenantId },
  });

  // Load legs
  const dbLegs = await prisma.logisticsLeg.findMany({
    where: { tenantId },
  });

  // Load observations
  const dbObservations = await prisma.logisticsObservation.findMany({
    where: { tenantId },
  });

  // Load evidence links
  const dbEvidenceLinks = await prisma.logisticsEvidenceLink.findMany({
    where: { tenantId },
  });

  // Load routes
  const dbRoutes = await prisma.logisticsRoute.findMany({
    where: { tenantId },
  });

  // Load sources
  const dbSources = await prisma.source.findMany({
    where: { tenantId },
    select: { id: true, type: true, name: true },
  });

  // Map to engine input types
  const nodes: LGNodeInput[] = dbNodes.map((n) => ({
    id: n.id,
    nodeType: n.nodeType,
    name: n.name,
    normalizedName: n.normalizedName,
    canonicalEntityType: n.canonicalEntityType,
    canonicalEntityId: n.canonicalEntityId,
    country: n.country,
    operationalStatus: n.operationalStatus,
    customsCapability: n.customsCapability,
    identityConfidence: n.identityConfidence,
    sourceId: n.sourceId,
  }));

  const legs: LGLegInput[] = dbLegs.map((l) => ({
    id: l.id,
    fromNodeId: l.fromNodeId,
    toNodeId: l.toNodeId,
    legType: l.legType,
    carrierOrganizationId: l.carrierOrganizationId,
    carrierName: l.carrierName,
    legStatus: l.legStatus,
    confidence: l.confidence,
    isContradicted: l.isContradicted,
    contradictionCount: l.contradictionCount,
    transitTimeMinHours: l.transitTimeMinHours,
    transitTimeMaxHours: l.transitTimeMaxHours,
    transitTimeKnown: l.transitTimeKnown,
    evidenceCount: l.evidenceCount,
    observationCount: l.observationCount,
    validFrom: l.validFrom,
    validTo: l.validTo,
  }));

  const observations: LGObservationInput[] = dbObservations.map((o) => ({
    id: o.id,
    legId: o.legId,
    sourceId: o.sourceId,
    observationType: o.observationType,
    observationStatus: o.observationStatus,
    contentHash: o.contentHash,
    observedAt: o.observedAt,
    validFrom: o.validFrom,
    validTo: o.validTo,
  }));

  const evidenceLinks: LGEvidenceLinkInput[] = dbEvidenceLinks.map((e) => ({
    id: e.id,
    legId: e.legId,
    evidenceId: e.evidenceId,
    evidenceRole: e.evidenceRole,
    evidenceStrength: e.evidenceStrength,
    relevance: e.relevance,
    effect: e.effect,
    sourceId: e.sourceId,
  }));

  const routes: LGRouteInput[] = dbRoutes.map((r) => ({
    id: r.id,
    originNodeId: r.originNodeId,
    destinationNodeId: r.destinationNodeId,
    legIds: r.legIds as string[],
    routeStatus: r.routeStatus,
    confidence: r.confidence,
    transitTimeKnown: r.transitTimeKnown,
    totalTransitMinHours: r.totalTransitMinHours,
    totalTransitMaxHours: r.totalTransitMaxHours,
  }));

  const sources: LGSourceInput[] = dbSources.map((s) => ({
    id: s.id,
    type: s.type,
    name: s.name,
  }));

  return { nodes, legs, observations, evidenceLinks, routes, sources };
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function getAssessment(tenantId: string, assessmentId: string) {
  const assessment = await prisma.logisticsAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("LogisticsAssessment", assessmentId);
  return assessment;
}

export async function listAssessments(params: {
  tenantId: string;
  page: number;
  limit: number;
  subjectType?: string;
  subjectId?: string;
  status?: string;
}) {
  const { tenantId, page, limit, subjectType, subjectId, status } = params;
  const where: Record<string, unknown> = { tenantId };
  if (subjectType) where.subjectType = subjectType;
  if (subjectId) where.subjectId = subjectId;
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.logisticsAssessment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { calculatedAt: "desc" },
    }),
    prisma.logisticsAssessment.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function recalculateAssessment(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  return assessLogistics({
    tenantId,
    subjectType: assessment.subjectType,
    subjectId: assessment.subjectId,
  });
}

// ─── Assessment Detail Queries ───────────────────────────────────────────────

export async function getAssessmentNodes(tenantId: string, assessmentId: string, page: number, limit: number): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  await getAssessment(tenantId, assessmentId); // verify exists
  const [data, total] = await Promise.all([
    prisma.logisticsNode.findMany({ where: { tenantId }, skip: (page - 1) * limit, take: limit }),
    prisma.logisticsNode.count({ where: { tenantId } }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getAssessmentLegs(tenantId: string, assessmentId: string, page: number, limit: number): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  await getAssessment(tenantId, assessmentId);
  const [data, total] = await Promise.all([
    prisma.logisticsLeg.findMany({ where: { tenantId }, skip: (page - 1) * limit, take: limit }),
    prisma.logisticsLeg.count({ where: { tenantId } }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getAssessmentRoutes(tenantId: string, assessmentId: string, page: number, limit: number): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  await getAssessment(tenantId, assessmentId);
  const [data, total] = await Promise.all([
    prisma.logisticsRoute.findMany({ where: { tenantId }, skip: (page - 1) * limit, take: limit }),
    prisma.logisticsRoute.count({ where: { tenantId } }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getAssessmentEvidence(tenantId: string, assessmentId: string, page: number, limit: number) {
  await getAssessment(tenantId, assessmentId);
  const [data, total] = await Promise.all([
    prisma.logisticsEvidenceLink.findMany({ where: { tenantId }, skip: (page - 1) * limit, take: limit }),
    prisma.logisticsEvidenceLink.count({ where: { tenantId } }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getAssessmentConflicts(tenantId: string, assessmentId: string) {
  await getAssessment(tenantId, assessmentId);
  return prisma.logisticsConflict.findMany({ where: { tenantId } });
}

export async function getAssessmentProvenance(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  const decision = await prisma.logisticsDecision.findFirst({
    where: { assessmentId },
  });
  return {
    assessment: { id: assessment.id, subjectType: assessment.subjectType, subjectId: assessment.subjectId, version: assessment.version },
    decision: decision ? { algorithmVersion: decision.algorithmVersion, finalConfidence: decision.finalConfidence, inputHash: decision.inputHash } : null,
  };
}

export async function getAssessmentHistory(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  return prisma.logisticsAssessment.findMany({
    where: { tenantId, subjectType: assessment.subjectType, subjectId: assessment.subjectId },
    orderBy: { version: "asc" },
  });
}

export async function getAssessmentRisks(tenantId: string, assessmentId: string): Promise<unknown[]> {
  await getAssessment(tenantId, assessmentId);
  return prisma.logisticsRisk.findMany({ where: { assessmentId, tenantId } });
}

export async function getAssessmentVerifications(tenantId: string, assessmentId: string) {
  await getAssessment(tenantId, assessmentId);
  // Verifications are derived from risks with missing information
  const risks = await prisma.logisticsRisk.findMany({ where: { assessmentId, tenantId } });
  return risks.filter((r) =>
    ["MISSING_LEG", "UNKNOWN_TRANSIT_TIME", "CARRIER_UNCERTAINTY", "UNAVAILABLE_NODE", "BORDER_CUSTOMS_UNCERTAINTY"].includes(r.riskType),
  ).map((r) => ({
    riskId: r.id,
    riskType: r.riskType,
    severity: r.severity,
    description: r.description,
    suggestedAction: `Verify ${r.riskType.toLowerCase().replace(/_/g, " ")}`,
  }));
}

export async function getAssessmentAnomalies(tenantId: string, assessmentId: string): Promise<unknown[]> {
  await getAssessment(tenantId, assessmentId);
  return prisma.logisticsAnomaly.findMany({ where: { assessmentId, tenantId } });
}

// ─── Route Discovery Query ───────────────────────────────────────────────────

export async function discoverRoutesForQuery(params: {
  tenantId: string;
  originNodeId: string;
  destinationNodeId: string;
  maxDepth?: number;
  maxRoutes?: number;
  legTypes?: string[];
  nodeTypes?: string[];
  statuses?: string[];
  minimumConfidence?: number;
  country?: string;
  asOf?: string;
}) {
  const { tenantId, originNodeId, destinationNodeId } = params;

  const [nodes, legs] = await Promise.all([
    prisma.logisticsNode.findMany({ where: { tenantId } }),
    prisma.logisticsLeg.findMany({ where: { tenantId } }),
  ]);

  const nodeInputs: LGNodeInput[] = nodes.map((n) => ({
    id: n.id, nodeType: n.nodeType, name: n.name, normalizedName: n.normalizedName,
    canonicalEntityType: n.canonicalEntityType, canonicalEntityId: n.canonicalEntityId,
    country: n.country, operationalStatus: n.operationalStatus, customsCapability: n.customsCapability,
    identityConfidence: n.identityConfidence, sourceId: n.sourceId,
  }));

  const legInputs: LGLegInput[] = legs.map((l) => ({
    id: l.id, fromNodeId: l.fromNodeId, toNodeId: l.toNodeId, legType: l.legType,
    carrierOrganizationId: l.carrierOrganizationId, carrierName: l.carrierName,
    legStatus: l.legStatus, confidence: l.confidence, isContradicted: l.isContradicted,
    contradictionCount: l.contradictionCount, transitTimeMinHours: l.transitTimeMinHours,
    transitTimeMaxHours: l.transitTimeMaxHours, transitTimeKnown: l.transitTimeKnown,
    evidenceCount: l.evidenceCount, observationCount: l.observationCount,
    validFrom: l.validFrom, validTo: l.validTo,
  }));

  return discoverRoutes(
    nodeInputs,
    legInputs,
    originNodeId,
    destinationNodeId,
    params.maxDepth ?? LOGISTICS_CONFIG.traversalDefaults.defaultMaxDepth,
    params.maxRoutes ?? LOGISTICS_CONFIG.traversalDefaults.maxRoutes,
    {
      nodeTypes: params.nodeTypes,
      legTypes: params.legTypes,
      statuses: params.statuses,
      minimumConfidence: params.minimumConfidence,
      country: params.country,
      asOf: params.asOf ? new Date(params.asOf) : undefined,
    },
  );
}

// ─── Relationship Queries ────────────────────────────────────────────────────

export async function listRoutes(params: {
  tenantId: string;
  page: number;
  limit: number;
  originNodeId?: string;
  destinationNodeId?: string;
  status?: string;
  hasEvidence?: boolean;
  asOf?: string;
}): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.originNodeId) where.originNodeId = params.originNodeId;
  if (params.destinationNodeId) where.destinationNodeId = params.destinationNodeId;
  if (params.status) where.routeStatus = params.status;

  const [data, total] = await Promise.all([
    prisma.logisticsRoute.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.logisticsRoute.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function listLegs(params: {
  tenantId: string;
  page: number;
  limit: number;
  fromNodeId?: string;
  toNodeId?: string;
  legType?: string;
  status?: string;
  country?: string;
  hasEvidence?: boolean;
  asOf?: string;
}): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.fromNodeId) where.fromNodeId = params.fromNodeId;
  if (params.toNodeId) where.toNodeId = params.toNodeId;
  if (params.legType) where.legType = params.legType;
  if (params.status) where.legStatus = params.status;

  const [data, total] = await Promise.all([
    prisma.logisticsLeg.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.logisticsLeg.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function listRelationships(params: {
  tenantId: string;
  page: number;
  limit: number;
  nodeType?: string;
  legType?: string;
  status?: string;
  minConfidence?: number;
  maxConfidence?: number;
  country?: string;
  hasEvidence?: boolean;
  asOf?: string;
}): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.legType) where.legType = params.legType;
  if (params.status) where.legStatus = params.status;
  if (params.minConfidence != null) where.confidence = { gte: params.minConfidence };
  if (params.maxConfidence != null) {
    const existing = where.confidence as Record<string, number> | undefined;
    where.confidence = { ...existing, lte: params.maxConfidence };
  }

  const [data, total] = await Promise.all([
    prisma.logisticsLeg.findMany({
      where,
      include: { fromNode: true, toNode: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.logisticsLeg.count({ where }),
  ]);

  // Apply post-filters for node type and country
  let filtered = data;
  if (params.nodeType) {
    filtered = filtered.filter((l) =>
      l.fromNode.nodeType === params.nodeType || l.toNode.nodeType === params.nodeType,
    );
  }
  if (params.country) {
    filtered = filtered.filter((l) =>
      l.fromNode.country === params.country || l.toNode.country === params.country,
    );
  }

  return { data: filtered, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// ─── Graph Builder ───────────────────────────────────────────────────────────

/**
 * Build/update logistics graph from Phase 9 supply-chain data.
 * Creates logistics nodes and legs from supply-chain relationships.
 */
export async function buildGraph(tenantId: string): Promise<{ nodesCreated: number; legsCreated: number }> {
  logger.info({ tenantId }, "logistics_graph_build_started");

  // Load Phase 9 supply-chain data
  const scNodes = await prisma.supplyChainNode.findMany({ where: { tenantId } });
  const scEdges = await prisma.supplyChainEdge.findMany({ where: { tenantId } });

  let nodesCreated = 0;
  let legsCreated = 0;

  // Map supply-chain node types to logistics node types
  const scToLogisticsNodeType: Record<string, string> = {
    MANUFACTURER: "MANUFACTURER_LOCATION",
    SUPPLIER: "SUPPLIER_LOCATION",
    EXPORTER: "EXPORTER_LOCATION",
    IMPORTER: "IMPORTER_LOCATION",
    PORT: "PORT",
    WAREHOUSE: "WAREHOUSE",
    BANGLADESH_IMPORTER: "IMPORTER_LOCATION",
    BANGLADESH_DISTRIBUTOR: "BANGLADESH_DISTRIBUTION_POINT",
    BANGLADESH_RESELLER: "BANGLADESH_MARKET",
    DESTINATION_COUNTRY: "DESTINATION",
    ORIGIN_COUNTRY: "ORIGIN",
  };

  // Create logistics nodes from supply-chain nodes
  for (const scNode of scNodes) {
    const logisticsType = scToLogisticsNodeType[scNode.nodeType];
    if (!logisticsType) continue;

    try {
      await prisma.logisticsNode.upsert({
        where: {
          tenantId_nodeType_normalizedName_sourceId: {
            tenantId,
            nodeType: logisticsType as never,
            normalizedName: scNode.normalizedName,
            sourceId: scNode.sourceId ?? "",
          },
        },
        update: {},
        create: {
          tenantId,
          nodeType: logisticsType as never,
          name: scNode.name,
          normalizedName: scNode.normalizedName,
          canonicalEntityType: "supplyChainNode",
          canonicalEntityId: scNode.id,
          country: scNode.country,
          sourceId: scNode.sourceId,
          identityStatus: scNode.identityStatus,
          identityConfidence: scNode.identityConfidence,
        },
      });
      nodesCreated++;
    } catch {
      // Node already exists or invalid — skip
    }
  }

  // Create logistics legs from supply-chain edges that represent transport
  const transportEdgeTypes = [
    "SHIPMENT_FROM", "SHIPMENT_TO", "EXPORTED_FROM", "IMPORTED_TO",
    "ORIGINATED_FROM", "DESTINATION_TO",
  ];

  for (const scEdge of scEdges) {
    if (!transportEdgeTypes.includes(scEdge.edgeType)) continue;

    // Find corresponding logistics nodes
    const fromLogisticsNode = await prisma.logisticsNode.findFirst({
      where: { tenantId, canonicalEntityId: scEdge.fromNodeId },
    });
    const toLogisticsNode = await prisma.logisticsNode.findFirst({
      where: { tenantId, canonicalEntityId: scEdge.toNodeId },
    });

    if (!fromLogisticsNode || !toLogisticsNode) continue;

    const contentHash = computeLegContentHash(
      tenantId,
      fromLogisticsNode.id,
      toLogisticsNode.id,
      "OTHER",
      null,
      null,
      null,
      null,
    );

    try {
      await prisma.logisticsLeg.upsert({
        where: {
          tenantId_fromNodeId_toNodeId_legType_contentHash: {
            tenantId,
            fromNodeId: fromLogisticsNode.id,
            toNodeId: toLogisticsNode.id,
            legType: "OTHER",
            contentHash,
          },
        },
        update: {},
        create: {
          tenantId,
          fromNodeId: fromLogisticsNode.id,
          toNodeId: toLogisticsNode.id,
          legType: "OTHER",
          legStatus: scEdge.relationshipStatus as LogisticsRouteStatus,
          confidence: scEdge.confidence,
          contentHash,
        },
      });
      legsCreated++;
    } catch {
      // Leg already exists — skip
    }
  }

  logger.info({ tenantId, nodesCreated, legsCreated }, "logistics_graph_build_completed");
  return { nodesCreated, legsCreated };
}
