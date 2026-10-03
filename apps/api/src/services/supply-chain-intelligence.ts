// =============================================================================
// API — Supply-Chain Intelligence Service (Phase 9)
// =============================================================================
// Orchestrator that loads graph data from the database, runs the pure
// calculation engine, and persists results atomically with full provenance.
// Handles: assessment, recalculation, history, provenance, graph queries.
// =============================================================================

import { prisma } from "@exosquad/database";
import type { SupplyChainNodeType, SupplyChainEdgeType, SupplyChainRelationshipStatus } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { NotFoundError, SUPPLY_CHAIN_CONFIG } from "@exosquad/common";
import {
  runSupplyChainEngine,
  computeEdgeContentHash,
  computeObservationContentHash,
  type SCNodeInput,
  type SCEdgeInput,
  type SCObservationInput,
  type SCEvidenceLinkInput,
  type SCSourceInput,
  type SCClaimInput,
  type SCConflictInput,
} from "./supply-chain-engine.js";

// ─── Assessment Input ────────────────────────────────────────────────────────

export interface AssessInput {
  tenantId: string;
  subjectType: string;
  subjectId: string;
}

export interface AssessmentResult {
  assessmentId: string;
  status: string;
  graphCompleteness: number;
  overallConfidence: number;
  algorithmVersion: string;
  knownNodeCount: number;
  unknownNodeCount: number;
  knownEdgeCount: number;
  unknownEdgeCount: number;
  confirmedEdgeCount: number;
  contradictedEdgeCount: number;
  pathCount: number;
  alternatePathCount: number;
  criticalUnknownCount: number;
  anomalyCount: number;
  conflictCount: number;
  verificationCount: number;
}

// ─── Main Assessment Orchestrator ────────────────────────────────────────────

/**
 * Run supply-chain assessment for a subject entity.
 * 1. Load graph data (nodes, edges, observations, evidence, sources, claims)
 * 2. Run the deterministic engine
 * 3. Persist assessment, decision, conflicts, verifications, anomalies
 * 4. Update edge statuses and confidences
 * 5. Return summary
 */
export async function assessSupplyChain(params: AssessInput): Promise<AssessmentResult> {
  const startTime = Date.now();
  const { tenantId, subjectType, subjectId } = params;

  logger.info({ tenantId, subjectType, subjectId }, "supply_chain_assessment_started");

  // 1. Load graph data
  const graphData = await loadGraphData(tenantId, subjectType, subjectId);

  // 2. Run engine
  const engineResult = runSupplyChainEngine({
    tenantId,
    subjectType,
    subjectId,
    nodes: graphData.nodes,
    edges: graphData.edges,
    observations: graphData.observations,
    evidenceLinks: graphData.evidenceLinks,
    sources: graphData.sources,
    claims: graphData.claims,
    conflicts: graphData.conflicts,
  });

  // 3. Persist results atomically
  const assessment = await prisma.$transaction(async (tx) => {
    // Update edge statuses and confidences
    for (let i = 0; i < engineResult.edgeConfidences.length; i++) {
      const ec = engineResult.edgeConfidences[i]!;
      const rs = engineResult.relationshipStatuses[i]!;
      await tx.supplyChainEdge.update({
        where: { id: ec.edgeId },
        data: {
          confidence: ec.finalConfidence,
          evidenceStrength: ec.evidenceStrengthScore,
          relationshipStatus: rs.status as SupplyChainRelationshipStatus,
        },
      });
    }

    // Create assessment with deterministic inputHash (PHASE9_SPEC.md §21)
    // inputHash is the pure SHA-256 fingerprint from the engine — never contaminated.
    // History is preserved via monotonically increasing version per subject.
    const calculatedAt = new Date();

    // Determine next version for this subject (monotonically increasing)
    const latestAssessment = await tx.supplyChainAssessment.findFirst({
      where: { tenantId, subjectType, subjectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestAssessment?.version ?? 0) + 1;

    const newAssessment = await tx.supplyChainAssessment.create({
      data: {
        tenantId,
        subjectType,
        subjectId,
        status: engineResult.completeness.graphCompleteness > 0.5 ? "COMPLETE" : "INSUFFICIENT",
        algorithmVersion: engineResult.algorithmVersion,
        inputHash: engineResult.inputHash, // pure deterministic hash — no timestamp contamination
        version: nextVersion,
        graphCompleteness: engineResult.completeness.graphCompleteness,
        knownNodeCount: engineResult.completeness.knownNodeCount,
        unknownNodeCount: engineResult.completeness.unknownNodeCount,
        knownEdgeCount: engineResult.completeness.knownEdgeCount,
        unknownEdgeCount: engineResult.completeness.unknownEdgeCount,
        confirmedEdgeCount: engineResult.completeness.confirmedEdgeCount,
        corroboratedEdgeCount: engineResult.completeness.corroboratedEdgeCount,
        claimedEdgeCount: engineResult.completeness.claimedEdgeCount,
        observedEdgeCount: engineResult.completeness.observedEdgeCount,
        inferredEdgeCount: engineResult.completeness.inferredEdgeCount,
        contradictedEdgeCount: engineResult.completeness.contradictedEdgeCount,
        sourceDiversity: engineResult.completeness.sourceDiversity,
        evidenceCoverage: engineResult.completeness.evidenceCoverage,
        identityConfidence: engineResult.completeness.identityConfidence,
        temporalCoverage: engineResult.completeness.temporalCoverage,
        pathCount: engineResult.completeness.pathCount,
        alternatePathCount: engineResult.completeness.alternatePathCount,
        criticalUnknownCount: engineResult.completeness.criticalUnknownCount,
        overallConfidence: engineResult.overallConfidence,
        nodeCompleteness: engineResult.completeness.nodeCompleteness,
        edgeCompleteness: engineResult.completeness.edgeCompleteness,
        evidenceCompleteness: engineResult.completeness.evidenceCompleteness,
        identityCompleteness: engineResult.completeness.identityCompleteness,
        temporalCompleteness: engineResult.completeness.temporalCompleteness,
        calculatedAt,
      },
    });

    // Create decision snapshot
    await tx.supplyChainDecision.create({
      data: {
        assessmentId: newAssessment.id,
        algorithmVersion: engineResult.algorithmVersion,
        evidenceStrengthScore:
          engineResult.edgeConfidences.reduce((s, e) => s + e.evidenceStrengthScore, 0) /
          Math.max(1, engineResult.edgeConfidences.length),
        independenceScore:
          engineResult.edgeConfidences.reduce((s, e) => s + e.sourceIndependenceScore, 0) /
          Math.max(1, engineResult.edgeConfidences.length),
        identityScore:
          engineResult.edgeConfidences.reduce((s, e) => s + e.identityConfidenceScore, 0) /
          Math.max(1, engineResult.edgeConfidences.length),
        directnessScore:
          engineResult.edgeConfidences.reduce((s, e) => s + e.directnessScore, 0) /
          Math.max(1, engineResult.edgeConfidences.length),
        corroborationScore:
          engineResult.edgeConfidences.reduce((s, e) => s + e.corroborationScore, 0) /
          Math.max(1, engineResult.edgeConfidences.length),
        freshnessScore:
          engineResult.edgeConfidences.reduce((s, e) => s + e.temporalFreshnessScore, 0) /
          Math.max(1, engineResult.edgeConfidences.length),
        contradictionPenalty:
          engineResult.edgeConfidences.reduce((s, e) => s + e.contradictionPenalty, 0) /
          Math.max(1, engineResult.edgeConfidences.length),
        completenessScore: engineResult.completeness.graphCompleteness,
        finalConfidence: engineResult.overallConfidence,
        inputHash: engineResult.inputHash,
        edgeIds: engineResult.edgeConfidences.map((e) => e.edgeId) as never,
        evidenceIds: graphData.evidenceLinks.map((e) => e.evidenceId) as never,
        observationIds: graphData.observations.map((o) => o.id) as never,
      },
    });

    // Persist new conflicts
    for (const conflict of engineResult.conflicts) {
      await tx.supplyChainConflict.create({
        data: {
          tenantId,
          edgeId: conflict.edgeId,
          nodeId: conflict.nodeId,
          conflictType: conflict.conflictType,
          severity: conflict.severity,
          description: conflict.description,
          supportingEvidenceId: conflict.supportingEvidenceId,
          contradictingEvidenceId: conflict.contradictingEvidenceId,
          resolutionState: "OPEN",
        },
      });
    }

    // Persist anomalies
    for (const anomaly of engineResult.anomalies) {
      await tx.supplyChainAnomaly.create({
        data: {
          tenantId,
          anomalyType: anomaly.anomalyType,
          severity: anomaly.severity,
          description: anomaly.description,
          nodeId: anomaly.nodeId,
          edgeId: anomaly.edgeId,
          involvedNodeIds: anomaly.involvedNodeIds,
          involvedEdgeIds: anomaly.involvedEdgeIds,
          status: "OPEN",
        },
      });
    }

    // Persist verification requirements
    for (const verification of engineResult.verifications) {
      await tx.supplyChainVerification.create({
        data: {
          tenantId,
          assessmentId: newAssessment.id,
          verificationType: verification.verificationType,
          priority: verification.priority,
          reason: verification.reason,
          targetNodeType: verification.targetNodeType,
          targetNodeId: verification.targetNodeId,
          targetEdgeType: verification.targetEdgeType,
          targetEdgeId: verification.targetEdgeId,
          existingEvidence: verification.existingEvidence as never,
          missingEvidence: verification.missingEvidence as never,
          importance: verification.importance,
        },
      });
    }

    return newAssessment;
  });

  const duration = Date.now() - startTime;
  logger.info(
    {
      tenantId,
      assessmentId: assessment.id,
      duration,
      confidence: engineResult.overallConfidence,
      completeness: engineResult.completeness.graphCompleteness,
    },
    "supply_chain_assessment_completed"
  );

  return {
    assessmentId: assessment.id,
    status: assessment.status,
    graphCompleteness: Number(assessment.graphCompleteness),
    overallConfidence: Number(assessment.overallConfidence),
    algorithmVersion: assessment.algorithmVersion,
    knownNodeCount: assessment.knownNodeCount,
    unknownNodeCount: assessment.unknownNodeCount,
    knownEdgeCount: assessment.knownEdgeCount,
    unknownEdgeCount: assessment.unknownEdgeCount,
    confirmedEdgeCount: assessment.confirmedEdgeCount,
    contradictedEdgeCount: assessment.contradictedEdgeCount,
    pathCount: assessment.pathCount,
    alternatePathCount: assessment.alternatePathCount,
    criticalUnknownCount: assessment.criticalUnknownCount,
    anomalyCount: engineResult.anomalies.length,
    conflictCount: engineResult.conflicts.length,
    verificationCount: engineResult.verifications.length,
  };
}

// ─── Graph Data Loading ──────────────────────────────────────────────────────

async function loadGraphData(
  tenantId: string,
  subjectType: string,
  subjectId: string
): Promise<{
  nodes: SCNodeInput[];
  edges: SCEdgeInput[];
  observations: SCObservationInput[];
  evidenceLinks: SCEvidenceLinkInput[];
  sources: SCSourceInput[];
  claims: SCClaimInput[];
  conflicts: SCConflictInput[];
}> {
  // Find the subject node
  const subjectNode = await prisma.supplyChainNode.findFirst({
    where: {
      tenantId,
      OR: [
        { id: subjectId },
        { canonicalEntityType: subjectType.toLowerCase(), canonicalEntityId: subjectId },
      ],
    },
  });

  // Load all nodes connected to the subject (within 1 hop)
  const nodeIds = new Set<string>();
  if (subjectNode) nodeIds.add(subjectNode.id);

  // Also find nodes by canonical entity reference
  const canonicalNodes = await prisma.supplyChainNode.findMany({
    where: {
      tenantId,
      canonicalEntityType: subjectType.toLowerCase(),
      canonicalEntityId: subjectId,
    },
  });
  for (const n of canonicalNodes) nodeIds.add(n.id);

  // Load edges connected to these nodes
  const startNodeIds = [...nodeIds];
  const edges = await prisma.supplyChainEdge.findMany({
    where: {
      tenantId,
      OR: [
        { fromNodeId: { in: startNodeIds } },
        { toNodeId: { in: startNodeIds } },
      ],
    },
  });

  // Add connected node IDs
  for (const edge of edges) {
    nodeIds.add(edge.fromNodeId);
    nodeIds.add(edge.toNodeId);
  }

  // Load all nodes
  const allNodeIds = [...nodeIds];
  const nodes = await prisma.supplyChainNode.findMany({
    where: { tenantId, id: { in: allNodeIds } },
  });

  // Load observations for these edges
  const edgeIds = edges.map((e) => e.id);
  const observations = await prisma.supplyChainObservation.findMany({
    where: { tenantId, edgeId: { in: edgeIds } },
  });

  // Load evidence links
  const evidenceLinks = await prisma.supplyChainEvidenceLink.findMany({
    where: { tenantId, edgeId: { in: edgeIds } },
  });

  // Load sources
  const sourceIds = [
    ...new Set([
      ...observations.map((o) => o.sourceId),
      ...evidenceLinks.map((e) => e.sourceId).filter(Boolean),
    ]),
  ].filter(Boolean) as string[];
  const sources = sourceIds.length > 0
    ? await prisma.source.findMany({
        where: { tenantId, id: { in: sourceIds } },
        select: { id: true, type: true, name: true, config: true },
      })
    : [];

  // Map source config to extract domain
  const sourceInputs: SCSourceInput[] = sources.map((s) => ({
    id: s.id,
    type: s.type,
    name: s.name,
    domain: extractDomain(s.config as Record<string, unknown>),
  }));

  // Load claims
  const claims = await prisma.supplyChainClaim.findMany({
    where: {
      tenantId,
      OR: [
        { claimingNodeId: { in: allNodeIds } },
        { targetNodeId: { in: allNodeIds } },
      ],
    },
  });

  // Load existing conflicts
  const conflicts = await prisma.supplyChainConflict.findMany({
    where: {
      tenantId,
      OR: [
        { edgeId: { in: edgeIds } },
        { nodeId: { in: allNodeIds } },
      ],
    },
  });

  return {
    nodes: nodes.map(mapNodeInput),
    edges: edges.map(mapEdgeInput),
    observations: observations.map(mapObservationInput),
    evidenceLinks: evidenceLinks.map(mapEvidenceLinkInput),
    sources: sourceInputs,
    claims: claims.map(mapClaimInput),
    conflicts: conflicts.map(mapConflictInput),
  };
}

function extractDomain(config: Record<string, unknown> | null): string | null {
  if (!config) return null;
  const baseUrl = config.baseUrl ?? config.base_url ?? config.url;
  if (typeof baseUrl === "string") {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return baseUrl;
    }
  }
  return null;
}

// ─── Mapper Functions ────────────────────────────────────────────────────────

function mapNodeInput(n: {
  id: string; nodeType: string; name: string; normalizedName: string;
  canonicalEntityType: string | null; canonicalEntityId: string | null;
  identityStatus: string; identityConfidence: number; country: string | null;
  sourceId: string | null;
}): SCNodeInput {
  return {
    id: n.id,
    nodeType: n.nodeType,
    name: n.name,
    normalizedName: n.normalizedName,
    canonicalEntityType: n.canonicalEntityType,
    canonicalEntityId: n.canonicalEntityId,
    identityStatus: n.identityStatus,
    identityConfidence: Number(n.identityConfidence),
    country: n.country,
    sourceId: n.sourceId,
  };
}

function mapEdgeInput(e: {
  id: string; fromNodeId: string; toNodeId: string; edgeType: string;
  relationshipStatus: string; confidence: number; isContradicted: boolean;
  contradictionCount: number;
}): SCEdgeInput {
  return {
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    edgeType: e.edgeType,
    relationshipStatus: e.relationshipStatus,
    confidence: Number(e.confidence),
    isContradicted: e.isContradicted,
    contradictionCount: e.contradictionCount,
  };
}

function mapObservationInput(o: {
  id: string; edgeId: string; sourceId: string; observationStatus: string;
  observedValue: unknown; contentHash: string; observedAt: Date;
  validFrom: Date | null; validTo: Date | null;
}): SCObservationInput {
  return {
    id: o.id,
    edgeId: o.edgeId,
    sourceId: o.sourceId,
    observationStatus: o.observationStatus,
    observedValue: o.observedValue as Record<string, unknown>,
    contentHash: o.contentHash,
    observedAt: o.observedAt,
    validFrom: o.validFrom,
    validTo: o.validTo,
  };
}

function mapEvidenceLinkInput(e: {
  id: string; edgeId: string; evidenceId: string; evidenceRole: string;
  evidenceStrength: string; relevance: number; effect: number; sourceId: string | null;
}): SCEvidenceLinkInput {
  return {
    id: e.id,
    edgeId: e.edgeId,
    evidenceId: e.evidenceId,
    evidenceRole: e.evidenceRole,
    evidenceStrength: e.evidenceStrength,
    relevance: Number(e.relevance),
    effect: Number(e.effect),
    sourceId: e.sourceId,
  };
}

function mapClaimInput(c: {
  id: string; claimType: string; claimText: string; claimingNodeId: string;
  targetNodeId: string; sourceId: string; status: string;
}): SCClaimInput {
  return {
    id: c.id,
    claimType: c.claimType,
    claimText: c.claimText,
    claimingNodeId: c.claimingNodeId,
    targetNodeId: c.targetNodeId,
    sourceId: c.sourceId,
    status: c.status,
  };
}

function mapConflictInput(c: {
  id: string; edgeId: string | null; nodeId: string | null; conflictType: string;
  severity: string; description: string; resolutionState: string;
}): SCConflictInput {
  return {
    id: c.id,
    edgeId: c.edgeId,
    nodeId: c.nodeId,
    conflictType: c.conflictType,
    severity: c.severity,
    description: c.description,
    resolutionState: c.resolutionState,
  };
}

// ─── Query Functions ─────────────────────────────────────────────────────────

/** Get a single assessment with full details. */
export async function getAssessment(tenantId: string, assessmentId: string): Promise<any> {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    include: {
      decisions: { orderBy: { calculatedAt: "desc" }, take: 1 },
      verifications: { orderBy: { importance: "desc" } },
    },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  // Load graph data for this assessment's subject
  const nodes = await prisma.supplyChainNode.findMany({
    where: { tenantId },
    take: 200,
  });

  const nodeIds = nodes.map((n) => n.id);
  const edges = await prisma.supplyChainEdge.findMany({
    where: {
      tenantId,
      OR: [
        { fromNodeId: { in: nodeIds } },
        { toNodeId: { in: nodeIds } },
      ],
    },
    take: 500,
  });

  return {
    data: {
      ...assessment,
      graphCompleteness: Number(assessment.graphCompleteness),
      overallConfidence: Number(assessment.overallConfidence),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}

/** List assessments with pagination and filters. */
export async function listAssessments(params: {
  tenantId: string;
  subjectType?: string;
  subjectId?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<any> {
  const { tenantId, subjectType, subjectId, status, page = 1, limit = 20 } = params;

  const where: Record<string, unknown> = { tenantId };
  if (subjectType) where.subjectType = subjectType;
  if (subjectId) where.subjectId = subjectId;
  if (status) where.status = status;

  const [total, assessments] = await Promise.all([
    prisma.supplyChainAssessment.count({ where: where as never }),
    prisma.supplyChainAssessment.findMany({
      where: where as never,
      orderBy: { calculatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: assessments.map((a) => ({
      ...a,
      graphCompleteness: Number(a.graphCompleteness),
      overallConfidence: Number(a.overallConfidence),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/** Get nodes for an assessment. */
export async function getAssessmentNodes(
  tenantId: string,
  assessmentId: string,
  page = 1,
  limit = 50
): Promise<any> {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  const where = { tenantId };
  const [total, nodes] = await Promise.all([
    prisma.supplyChainNode.count({ where }),
    prisma.supplyChainNode.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { nodeType: "asc" },
    }),
  ]);

  return {
    data: nodes,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Get edges for an assessment. */
export async function getAssessmentEdges(
  tenantId: string,
  assessmentId: string,
  page = 1,
  limit = 50
): Promise<any> {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  const where = { tenantId };
  const [total, edges] = await Promise.all([
    prisma.supplyChainEdge.count({ where }),
    prisma.supplyChainEdge.findMany({
      where,
      include: { fromNode: true, toNode: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { confidence: "desc" },
    }),
  ]);

  return {
    data: edges.map((e) => ({
      ...e,
      confidence: Number(e.confidence),
      evidenceStrength: Number(e.evidenceStrength),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Get paths for an assessment. */
export async function getAssessmentPaths(
  tenantId: string,
  assessmentId: string,
  maxDepth = 5
) {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  // Load graph and run path discovery
  const nodes = await prisma.supplyChainNode.findMany({ where: { tenantId }, take: 200 });
  const nodeIds = nodes.map((n) => n.id);
  const edges = await prisma.supplyChainEdge.findMany({
    where: { tenantId, OR: [{ fromNodeId: { in: nodeIds } }, { toNodeId: { in: nodeIds } }] },
    take: 500,
  });

  const confidenceMap = new Map<string, number>();
  for (const edge of edges) {
    confidenceMap.set(edge.id, Number(edge.confidence));
  }

  // Import engine path discovery
  const { discoverPaths } = await import("./supply-chain-engine.js");
  const paths = discoverPaths(
    assessment.subjectId,
    edges.map(mapEdgeInput),
    nodes.map(mapNodeInput),
    confidenceMap,
    Math.min(maxDepth, SUPPLY_CHAIN_CONFIG.traversalDefaults.maxDepth)
  );

  return { data: paths };
}

/** Get evidence for an assessment. */
export async function getAssessmentEvidence(
  tenantId: string,
  assessmentId: string,
  page = 1,
  limit = 50
): Promise<any> {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  const where = { tenantId };
  const [total, links] = await Promise.all([
    prisma.supplyChainEvidenceLink.count({ where }),
    prisma.supplyChainEvidenceLink.findMany({
      where,
      include: { evidence: true },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: links,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Get conflicts for an assessment. */
export async function getAssessmentConflicts(
  tenantId: string,
  assessmentId: string
) {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  const conflicts = await prisma.supplyChainConflict.findMany({
    where: { tenantId, resolutionState: "OPEN" },
    orderBy: { severity: "desc" },
  });

  return { data: conflicts };
}

/** Get provenance chain for an assessment. */
export async function getAssessmentProvenance(
  tenantId: string,
  assessmentId: string
): Promise<any> {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    include: { decisions: { take: 1, orderBy: { calculatedAt: "desc" } } },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  // Build provenance: Assessment → Decision → Edges → Observations → Sources
  const edges = await prisma.supplyChainEdge.findMany({
    where: { tenantId },
    include: {
      observations: { include: { source: true } },
      evidenceLinks: { include: { evidence: true } },
    },
    take: 200,
  });

  return {
    data: {
      assessment,
      provenanceChain: edges.map((e) => ({
        edge: { id: e.id, edgeType: e.edgeType, status: e.relationshipStatus },
        observations: e.observations.map((o) => ({
          id: o.id,
          sourceId: o.sourceId,
          sourceName: o.source?.name,
          observedAt: o.observedAt,
        })),
        evidence: e.evidenceLinks.map((el) => ({
          id: el.id,
          evidenceId: el.evidenceId,
          role: el.evidenceRole,
          strength: el.evidenceStrength,
        })),
      })),
    },
  };
}

/** Get historical assessments for a subject. */
export async function getAssessmentHistory(
  tenantId: string,
  assessmentId: string
) {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  const history = await prisma.supplyChainAssessment.findMany({
    where: {
      tenantId,
      subjectType: assessment.subjectType,
      subjectId: assessment.subjectId,
    },
    orderBy: { calculatedAt: "desc" },
    take: 50,
  });

  return {
    data: history.map((h) => ({
      ...h,
      graphCompleteness: Number(h.graphCompleteness),
      overallConfidence: Number(h.overallConfidence),
    })),
  };
}

/** Get verification requirements for an assessment. */
export async function getAssessmentVerifications(
  tenantId: string,
  assessmentId: string
): Promise<any> {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  const verifications = await prisma.supplyChainVerification.findMany({
    where: { assessmentId },
    orderBy: { importance: "desc" },
  });

  return { data: verifications };
}

/** Get anomalies for an assessment. */
export async function getAssessmentAnomalies(
  tenantId: string,
  assessmentId: string
): Promise<any> {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  const anomalies = await prisma.supplyChainAnomaly.findMany({
    where: { tenantId, status: "OPEN" },
    orderBy: { severity: "desc" },
  });

  return { data: anomalies };
}

// ─── Edge Detail Queries ─────────────────────────────────────────────────────

/** Get edge detail. */
export async function getEdge(tenantId: string, edgeId: string): Promise<any> {
  const edge = await prisma.supplyChainEdge.findFirst({
    where: { id: edgeId, tenantId },
    include: { fromNode: true, toNode: true },
  });
  if (!edge) throw new NotFoundError("SupplyChainEdge", edgeId);

  return {
    data: {
      ...edge,
      confidence: Number(edge.confidence),
      evidenceStrength: Number(edge.evidenceStrength),
    },
  };
}

/** Get edge provenance. */
export async function getEdgeProvenance(tenantId: string, edgeId: string): Promise<any> {
  const edge = await prisma.supplyChainEdge.findFirst({
    where: { id: edgeId, tenantId },
    include: {
      fromNode: true,
      toNode: true,
      observations: { include: { source: true } },
      evidenceLinks: { include: { evidence: true } },
    },
  });
  if (!edge) throw new NotFoundError("SupplyChainEdge", edgeId);

  return { data: edge };
}

/** Get edge observations. */
export async function getEdgeObservations(
  tenantId: string,
  edgeId: string,
  page = 1,
  limit = 50
): Promise<any> {
  const edge = await prisma.supplyChainEdge.findFirst({
    where: { id: edgeId, tenantId },
  });
  if (!edge) throw new NotFoundError("SupplyChainEdge", edgeId);

  const where = { tenantId, edgeId };
  const [total, observations] = await Promise.all([
    prisma.supplyChainObservation.count({ where }),
    prisma.supplyChainObservation.findMany({
      where,
      include: { source: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { observedAt: "desc" },
    }),
  ]);

  return {
    data: observations,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Claim Operations ────────────────────────────────────────────────────────

/** Record a supply-chain claim. */
export async function recordClaim(params: {
  tenantId: string;
  claimType: string;
  claimText: string;
  claimingNodeId: string;
  targetNodeId: string;
  sourceId: string;
  evidenceId?: string;
}) {
  const claim = await prisma.supplyChainClaim.create({
    data: {
      tenantId: params.tenantId,
      claimType: params.claimType,
      claimText: params.claimText,
      claimingNodeId: params.claimingNodeId,
      targetNodeId: params.targetNodeId,
      sourceId: params.sourceId,
      evidenceId: params.evidenceId,
      status: "UNVERIFIED",
    },
  });

  return { data: claim };
}

/** List claims. */
export async function listClaims(params: {
  tenantId: string;
  claimType?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<any> {
  const { tenantId, claimType, status, page = 1, limit = 20 } = params;
  const where: Record<string, unknown> = { tenantId };
  if (claimType) where.claimType = claimType;
  if (status) where.status = status;

  const [total, claims] = await Promise.all([
    prisma.supplyChainClaim.count({ where: where as never }),
    prisma.supplyChainClaim.findMany({
      where: where as never,
      include: { claimingNode: true, targetNode: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { observedAt: "desc" },
    }),
  ]);

  return {
    data: claims,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Get claim detail. */
export async function getClaim(tenantId: string, claimId: string): Promise<any> {
  const claim = await prisma.supplyChainClaim.findFirst({
    where: { id: claimId, tenantId },
    include: { claimingNode: true, targetNode: true },
  });
  if (!claim) throw new NotFoundError("SupplyChainClaim", claimId);
  return { data: claim };
}

// ─── Relationship Query ──────────────────────────────────────────────────────

/** Query relationships with filters (PHASE9_SPEC.md §19.4). */
export async function queryRelationships(params: {
  tenantId: string;
  nodeType?: string;
  edgeType?: string;
  status?: string;
  minConfidence?: number;
  maxConfidence?: number;
  sourceId?: string;
  country?: string;
  productId?: string;
  sellerId?: string;
  supplierId?: string;
  manufacturerId?: string;
  hasContradiction?: boolean;
  hasEvidence?: boolean;
  asOf?: string;
  page?: number;
  limit?: number;
}): Promise<any> {
  const {
    tenantId,
    nodeType,
    edgeType,
    status,
    minConfidence,
    maxConfidence,
    sourceId,
    country,
    productId,
    sellerId,
    supplierId,
    manufacturerId,
    hasContradiction,
    hasEvidence,
    asOf,
    page = 1,
    limit = 20,
  } = params;

  const edgeWhere: Record<string, unknown> = { tenantId };
  if (edgeType) edgeWhere.edgeType = edgeType;
  if (status) edgeWhere.relationshipStatus = status;
  if (hasContradiction !== undefined) edgeWhere.isContradicted = hasContradiction;
  if (minConfidence !== undefined || maxConfidence !== undefined) {
    edgeWhere.confidence = {};
    if (minConfidence !== undefined) (edgeWhere.confidence as Record<string, unknown>).gte = minConfidence;
    if (maxConfidence !== undefined) (edgeWhere.confidence as Record<string, unknown>).lte = maxConfidence;
  }

  // asOf temporal reconstruction: only include edges valid at the requested time
  if (asOf) {
    const asOfDate = new Date(asOf);
    edgeWhere.validFrom = { lte: asOfDate };
    edgeWhere.OR = [
      { validTo: null },
      { validTo: { gt: asOfDate } },
    ];
  }

  // If sourceId filter is specified, we need to join through observations
  const includeObservations = !!sourceId;
  const includeEvidenceLinks = !!hasEvidence;

  const [total, edges] = await Promise.all([
    prisma.supplyChainEdge.count({ where: edgeWhere as never }),
    prisma.supplyChainEdge.findMany({
      where: edgeWhere as never,
      include: {
        fromNode: true,
        toNode: true,
        ...(includeObservations ? { observations: true } : {}),
        ...(includeEvidenceLinks ? { evidenceLinks: true } : {}),
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { confidence: "desc" },
    }),
  ]);

  // Apply post-fetch filters that require joins or canonical entity lookups
  let filtered = edges;

  // Filter by node type if specified
  if (nodeType) {
    filtered = filtered.filter(
      (e) => e.fromNode.nodeType === nodeType || e.toNode.nodeType === nodeType
    );
  }

  // Filter by sourceId — edge must have at least one observation from this source
  if (sourceId) {
    filtered = filtered.filter(
      (e) => (e as any).observations?.some((o: any) => o.sourceId === sourceId) ?? false
    );
  }

  // Filter by country — either node must match
  if (country) {
    filtered = filtered.filter(
      (e) => e.fromNode.country === country || e.toNode.country === country
    );
  }

  // Filter by canonical entity references
  if (productId) {
    filtered = filtered.filter(
      (e) =>
        (e.fromNode.canonicalEntityType === "product" && e.fromNode.canonicalEntityId === productId) ||
        (e.toNode.canonicalEntityType === "product" && e.toNode.canonicalEntityId === productId)
    );
  }
  if (sellerId) {
    filtered = filtered.filter(
      (e) =>
        (e.fromNode.canonicalEntityType === "seller" && e.fromNode.canonicalEntityId === sellerId) ||
        (e.toNode.canonicalEntityType === "seller" && e.toNode.canonicalEntityId === sellerId)
    );
  }
  if (supplierId) {
    filtered = filtered.filter(
      (e) =>
        (e.fromNode.canonicalEntityType === "supplier" && e.fromNode.canonicalEntityId === supplierId) ||
        (e.toNode.canonicalEntityType === "supplier" && e.toNode.canonicalEntityId === supplierId)
    );
  }
  if (manufacturerId) {
    filtered = filtered.filter(
      (e) =>
        (e.fromNode.canonicalEntityType === "manufacturer" && e.fromNode.canonicalEntityId === manufacturerId) ||
        (e.toNode.canonicalEntityType === "manufacturer" && e.toNode.canonicalEntityId === manufacturerId)
    );
  }

  // Filter by hasEvidence — edge must have at least one evidence link
  if (hasEvidence !== undefined) {
    filtered = filtered.filter((e) => {
      const hasEv = ((e as any).evidenceLinks?.length ?? 0) > 0;
      return hasEvidence ? hasEv : !hasEv;
    });
  }

  const finalTotal = nodeType || sourceId || country || productId || sellerId || supplierId || manufacturerId || hasEvidence !== undefined
    ? filtered.length
    : total;

  return {
    data: filtered.map((e) => ({
      ...e,
      confidence: Number(e.confidence),
      evidenceStrength: Number(e.evidenceStrength),
    })),
    pagination: {
      page,
      limit,
      total: finalTotal,
      totalPages: Math.ceil(finalTotal / limit),
    },
  };
}

// ─── Recalculation ───────────────────────────────────────────────────────────

/** Force recalculation of an assessment. */
export async function recalculateAssessment(tenantId: string, assessmentId: string) {
  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplyChainAssessment", assessmentId);

  return assessSupplyChain({
    tenantId,
    subjectType: assessment.subjectType,
    subjectId: assessment.subjectId,
  });
}

// ─── Graph Building (for worker) ─────────────────────────────────────────────

/**
 * Build or update a supply-chain graph from raw evidence.
 * Creates nodes, edges, observations, and evidence links.
 * Returns counts of created/updated entities.
 */
export async function buildGraph(params: {
  tenantId: string;
  subjectType: string;
  subjectId: string;
  edges: Array<{
    fromNodeType: string;
    fromNodeName: string;
    toNodeType: string;
    toNodeName: string;
    edgeType: string;
    sourceId: string;
    evidenceId?: string;
    evidenceRole?: string;
    evidenceStrength?: string;
    observedValue?: Record<string, unknown>;
    observedAt?: Date;
    validFrom?: Date | null;
    validTo?: Date | null;
  }>;
}): Promise<{
  nodesCreated: number;
  edgesCreated: number;
  observationsCreated: number;
  evidenceLinksCreated: number;
}> {
  const { tenantId, edges: edgeInputs } = params;
  let nodesCreated = 0;
  let edgesCreated = 0;
  let observationsCreated = 0;
  let evidenceLinksCreated = 0;

  await prisma.$transaction(async (tx) => {
    for (const input of edgeInputs) {
      // Upsert from-node
      const fromNormalizedName = input.fromNodeName.toLowerCase().trim();
      const fromBefore = await tx.supplyChainNode.findFirst({
        where: { tenantId, nodeType: input.fromNodeType as SupplyChainNodeType, normalizedName: fromNormalizedName, sourceId: input.sourceId },
      });
      const fromNode = await tx.supplyChainNode.upsert({
        where: {
          tenantId_nodeType_normalizedName_sourceId: {
            tenantId,
            nodeType: input.fromNodeType as SupplyChainNodeType,
            normalizedName: fromNormalizedName,
            sourceId: input.sourceId,
          },
        },
        update: {},
        create: {
          tenantId,
          nodeType: input.fromNodeType as SupplyChainNodeType,
          name: input.fromNodeName,
          normalizedName: fromNormalizedName,
          sourceId: input.sourceId,
          identityStatus: "unresolved",
        },
      });
      if (!fromBefore) nodesCreated++;

      // Upsert to-node
      const toNormalizedName = input.toNodeName.toLowerCase().trim();
      const toBefore = await tx.supplyChainNode.findFirst({
        where: { tenantId, nodeType: input.toNodeType as SupplyChainNodeType, normalizedName: toNormalizedName, sourceId: input.sourceId },
      });
      const toNode = await tx.supplyChainNode.upsert({
        where: {
          tenantId_nodeType_normalizedName_sourceId: {
            tenantId,
            nodeType: input.toNodeType as SupplyChainNodeType,
            normalizedName: toNormalizedName,
            sourceId: input.sourceId,
          },
        },
        update: {},
        create: {
          tenantId,
          nodeType: input.toNodeType as SupplyChainNodeType,
          name: input.toNodeName,
          normalizedName: toNormalizedName,
          sourceId: input.sourceId,
          identityStatus: "unresolved",
        },
      });
      if (!toBefore) nodesCreated++;

      // Upsert edge with content hash dedup (PHASE9_SPEC.md §21 — concurrency-safe)
      const observedValue = input.observedValue ?? {
        relationship: `${input.fromNodeName} → ${input.toNodeName}`,
        edgeType: input.edgeType,
      };
      const contentHash = computeEdgeContentHash(
        tenantId,
        fromNode.id,
        toNode.id,
        input.edgeType,
        observedValue
      );

      // Upsert edge using unique constraint (tenantId, fromNodeId, toNodeId, edgeType, contentHash)
      const existingEdge = await tx.supplyChainEdge.findFirst({
        where: { tenantId, fromNodeId: fromNode.id, toNodeId: toNode.id, edgeType: input.edgeType as SupplyChainEdgeType, contentHash },
      });
      const edge = await tx.supplyChainEdge.upsert({
        where: {
          tenantId_fromNodeId_toNodeId_edgeType_contentHash: {
            tenantId,
            fromNodeId: fromNode.id,
            toNodeId: toNode.id,
            edgeType: input.edgeType as SupplyChainEdgeType,
            contentHash,
          },
        },
        update: {},
        create: {
          tenantId,
          fromNodeId: fromNode.id,
          toNodeId: toNode.id,
          edgeType: input.edgeType as SupplyChainEdgeType,
          relationshipStatus: "UNKNOWN" as SupplyChainRelationshipStatus,
          contentHash,
          observedAt: input.observedAt ?? new Date(),
          validFrom: input.validFrom,
          validTo: input.validTo,
        },
      });
      if (!existingEdge) edgesCreated++;

      // Upsert observation (immutable — concurrency-safe via unique constraint)
      const obsContentHash = computeObservationContentHash(
        tenantId,
        input.sourceId,
        edge.id,
        observedValue
      );

      const existingObs = await tx.supplyChainObservation.findFirst({
        where: { tenantId, edgeId: edge.id, sourceId: input.sourceId, contentHash: obsContentHash },
      });
      await tx.supplyChainObservation.upsert({
        where: {
          tenantId_edgeId_sourceId_contentHash: {
            tenantId,
            edgeId: edge.id,
            sourceId: input.sourceId,
            contentHash: obsContentHash,
          },
        },
        update: {},
        create: {
          tenantId,
          edgeId: edge.id,
          sourceId: input.sourceId,
          evidenceId: input.evidenceId,
          observationStatus: "observed",
          observedValue: observedValue as never,
          contentHash: obsContentHash,
          observedAt: input.observedAt ?? new Date(),
          retrievedAt: new Date(),
          validFrom: input.validFrom,
          validTo: input.validTo,
        },
      });
      if (!existingObs) observationsCreated++;

      // Upsert evidence link if evidenceId provided
      if (input.evidenceId) {
        const existingLink = await tx.supplyChainEvidenceLink.findFirst({
          where: { edgeId: edge.id, evidenceId: input.evidenceId },
        });
        await tx.supplyChainEvidenceLink.upsert({
          where: {
            edgeId_evidenceId: {
              edgeId: edge.id,
              evidenceId: input.evidenceId,
            },
          },
          update: {},
          create: {
            tenantId,
            edgeId: edge.id,
            evidenceId: input.evidenceId,
            evidenceRole: input.evidenceRole ?? "SUPPORTING",
            evidenceStrength: input.evidenceStrength ?? "MODERATE",
            sourceId: input.sourceId,
          },
        });
        if (!existingLink) evidenceLinksCreated++;
      }
    }
  });

  logger.info(
    { tenantId, nodesCreated, edgesCreated, observationsCreated, evidenceLinksCreated },
    "supply_chain_graph_built"
  );

  return { nodesCreated, edgesCreated, observationsCreated, evidenceLinksCreated };
}
