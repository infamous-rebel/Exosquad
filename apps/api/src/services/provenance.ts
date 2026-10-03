// =============================================================================
// Provenance Service — Phase 6
// =============================================================================
// Bounded graph traversal for entity provenance chains.
// Traces: entity → claims → evidence → observations → sources
// =============================================================================

import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { ProvenanceNotFoundError } from "@exosquad/common";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProvenanceResult {
  entity: {
    type: string;
    id: string;
    data: Record<string, unknown>;
  };
  claims: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
  calculations: Array<Record<string, unknown>>;
  conflicts: Array<Record<string, unknown>>;
  freshness: string;
  traversalDepth: number;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  data: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationshipType: string;
  confidence: number;
  observationStatus: string;
}

export interface ProvenanceGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxDepth: number;
  truncated: boolean;
}

// ─── Entity Provenance ───────────────────────────────────────────────────────

/**
 * Get full provenance chain for an entity.
 * Supports: product, productVariant, seller, supplier, organization, brand,
 *           commercialRelationship, identityDecision
 */
export async function getEntityProvenance(
  tenantId: string,
  entityType: string,
  entityId: string,
  maxDepth: number = 5
): Promise<ProvenanceResult> {
  const boundedDepth = Math.min(maxDepth, 10);

  // Fetch entity
  const entityData = await fetchEntity(tenantId, entityType, entityId);
  if (!entityData) {
    throw new ProvenanceNotFoundError(entityType, entityId);
  }

  // Fetch related data in parallel
  const [claims, evidence, observations, sources, calculations, conflicts] =
    await Promise.all([
      fetchEntityClaims(tenantId, entityType, entityId),
      fetchEntityEvidence(tenantId, entityType, entityId),
      fetchEntityObservations(tenantId, entityType, entityId),
      fetchEntitySources(tenantId, entityType, entityId),
      fetchEntityCalculations(tenantId, entityType, entityId),
      fetchEntityConflicts(tenantId, entityType, entityId),
    ]);

  // Determine overall freshness
  const freshness = computeOverallFreshness(evidence);

  logger.debug(
    { tenantId, entityType, entityId, evidenceCount: evidence.length, claimsCount: claims.length },
    "Provenance traversal completed"
  );

  return {
    entity: { type: entityType, id: entityId, data: entityData },
    claims,
    evidence,
    sources,
    observations,
    relationships: [], // populated for relationship entities
    calculations,
    conflicts,
    freshness,
    traversalDepth: boundedDepth,
  };
}

// ─── Graph Traversal ─────────────────────────────────────────────────────────

/**
 * Bounded graph traversal from an entity.
 * Returns nodes and edges for visualization.
 */
export async function getProvenanceGraph(
  tenantId: string,
  entityType: string,
  entityId: string,
  maxDepth: number = 3
): Promise<ProvenanceGraphResult> {
  const boundedDepth = Math.min(maxDepth, 7);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const visited = new Set<string>();

  await traverseGraph(tenantId, entityType, entityId, boundedDepth, 0, nodes, edges, visited);

  return {
    nodes: Array.from(nodes.values()),
    edges,
    maxDepth: boundedDepth,
    truncated: visited.size > 100, // safety limit
  };
}

async function traverseGraph(
  tenantId: string,
  nodeType: string,
  nodeId: string,
  maxDepth: number,
  currentDepth: number,
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  visited: Set<string>
): Promise<void> {
  const nodeKey = `${nodeType}:${nodeId}`;
  if (visited.has(nodeKey) || currentDepth > maxDepth || nodes.size > 100) return;
  visited.add(nodeKey);

  // Add node
  const entityData = await fetchEntity(tenantId, nodeType, nodeId);
  if (!entityData) return;

  nodes.set(nodeKey, {
    id: nodeId,
    type: nodeType,
    label: (entityData.name ?? entityData.canonicalName ?? entityData.title ?? nodeId) as string,
    data: entityData,
  });

  // Fetch evidence for this entity
  const evidence = await prisma.evidence.findMany({
    where: { tenantId, entityType: nodeType, entityId: nodeId },
    select: {
      id: true,
      evidenceType: true,
      title: true,
      confidence: true,
      observationStatus: true,
      sourceId: true,
      observationId: true,
    },
    take: 20,
  });

  // Add evidence nodes and edges
  for (const ev of evidence) {
    const evKey = `evidence:${ev.id}`;
    if (!nodes.has(evKey)) {
      nodes.set(evKey, {
        id: ev.id,
        type: "evidence",
        label: ev.title,
        data: { evidenceType: ev.evidenceType, confidence: ev.confidence, observationStatus: ev.observationStatus },
      });
    }
    edges.push({
      source: nodeKey,
      target: evKey,
      relationshipType: "HAS_EVIDENCE",
      confidence: ev.confidence,
      observationStatus: ev.observationStatus,
    });

    // Traverse to source
    if (ev.sourceId && currentDepth < maxDepth) {
      const srcKey = `source:${ev.sourceId}`;
      if (!nodes.has(srcKey)) {
        const source = await prisma.source.findFirst({
          where: { id: ev.sourceId, tenantId },
          select: { id: true, name: true, type: true, healthStatus: true },
        });
        if (source) {
          nodes.set(srcKey, {
            id: source.id,
            type: "source",
            label: source.name,
            data: { type: source.type, healthStatus: source.healthStatus },
          });
        }
      }
      edges.push({
        source: evKey,
        target: srcKey,
        relationshipType: "DERIVED_FROM",
        confidence: 1.0,
        observationStatus: "observed",
      });
    }

    // Traverse to observation
    if (ev.observationId && currentDepth < maxDepth) {
      const obsKey = `observation:${ev.observationId}`;
      if (!nodes.has(obsKey)) {
        const obs = await prisma.observation.findFirst({
          where: { id: ev.observationId, tenantId },
          select: { id: true, observedAt: true, retrievedAt: true, normalizationStatus: true },
        });
        if (obs) {
          nodes.set(obsKey, {
            id: obs.id,
            type: "observation",
            label: `Observation ${obs.observedAt.toISOString().slice(0, 10)}`,
            data: { observedAt: obs.observedAt, retrievedAt: obs.retrievedAt, status: obs.normalizationStatus },
          });
        }
      }
      edges.push({
        source: evKey,
        target: obsKey,
        relationshipType: "EXTRACTED_FROM",
        confidence: 1.0,
        observationStatus: "observed",
      });
    }
  }
}

// ─── Helper: Fetch Entity ────────────────────────────────────────────────────

async function fetchEntity(
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<Record<string, unknown> | null> {
  switch (entityType) {
    case "product":
      return prisma.product.findFirst({ where: { id: entityId, tenantId } }) as Promise<Record<string, unknown> | null>;
    case "productVariant":
      return prisma.productVariant.findFirst({
        where: { id: entityId, product: { tenantId } },
      }) as Promise<Record<string, unknown> | null>;
    case "seller":
      return prisma.seller.findFirst({ where: { id: entityId, tenantId } }) as Promise<Record<string, unknown> | null>;
    case "supplier":
      return prisma.supplier.findFirst({ where: { id: entityId, tenantId } }) as Promise<Record<string, unknown> | null>;
    case "organization":
      return prisma.organization.findFirst({ where: { id: entityId, tenantId } }) as Promise<Record<string, unknown> | null>;
    case "brand":
      return prisma.brand.findFirst({ where: { id: entityId, tenantId } }) as Promise<Record<string, unknown> | null>;
    case "commercialRelationship":
      return prisma.commercialRelationship.findFirst({ where: { id: entityId, tenantId } }) as Promise<Record<string, unknown> | null>;
    case "identityDecision":
      return prisma.identityDecision.findFirst({ where: { id: entityId, tenantId } }) as Promise<Record<string, unknown> | null>;
    case "evidence":
      return prisma.evidence.findFirst({ where: { id: entityId, tenantId } }) as Promise<Record<string, unknown> | null>;
    default:
      return null;
  }
}

// ─── Helper: Fetch Related Data ──────────────────────────────────────────────

async function fetchEntityClaims(tenantId: string, entityType: string, entityId: string) {
  return prisma.claim.findMany({
    where: { tenantId, subjectType: entityType, subjectId: entityId },
    select: {
      id: true, predicate: true, claimType: true, status: true,
      confidence: true, observationStatus: true, observedAt: true,
      _count: { select: { evidence: true } },
    },
    orderBy: { observedAt: "desc" },
    take: 50,
  });
}

async function fetchEntityEvidence(tenantId: string, entityType: string, entityId: string) {
  return prisma.evidence.findMany({
    where: { tenantId, entityType, entityId },
    select: {
      id: true, evidenceType: true, title: true, confidence: true,
      status: true, freshness: true, observationStatus: true,
      observedAt: true, sourcePath: true, sourceUrl: true,
      source: { select: { id: true, name: true, type: true } },
    },
    orderBy: { observedAt: "desc" },
    take: 100,
  });
}

async function fetchEntityObservations(tenantId: string, entityType: string, entityId: string) {
  // Get observation IDs from evidence
  const evidence = await prisma.evidence.findMany({
    where: { tenantId, entityType, entityId, observationId: { not: null } },
    select: { observationId: true },
    distinct: ["observationId"],
    take: 50,
  });

  const obsIds = evidence.map((e) => e.observationId!).filter(Boolean);
  if (obsIds.length === 0) return [];

  return prisma.observation.findMany({
    where: { id: { in: obsIds }, tenantId },
    select: {
      id: true, observedAt: true, retrievedAt: true,
      normalizationStatus: true, dataQuality: true,
      source: { select: { id: true, name: true } },
    },
    orderBy: { observedAt: "desc" },
    take: 50,
  });
}

async function fetchEntitySources(tenantId: string, entityType: string, entityId: string) {
  const evidence = await prisma.evidence.findMany({
    where: { tenantId, entityType, entityId, sourceId: { not: null } },
    select: { sourceId: true },
    distinct: ["sourceId"],
    take: 20,
  });

  const sourceIds = evidence.map((e) => e.sourceId!).filter(Boolean);
  if (sourceIds.length === 0) return [];

  return prisma.source.findMany({
    where: { id: { in: sourceIds }, tenantId },
    select: {
      id: true, name: true, type: true, status: true,
      healthStatus: true, lastSuccessAt: true, lastFetchedAt: true,
    },
  });
}

async function fetchEntityCalculations(tenantId: string, entityType: string, entityId: string) {
  return prisma.calculation.findMany({
    where: { tenantId, entityType, entityId },
    select: {
      id: true, calculationType: true, algorithm: true, algorithmVersion: true,
      outputs: true, confidence: true, status: true, calculationTimestamp: true,
    },
    orderBy: { calculationTimestamp: "desc" },
    take: 20,
  });
}

async function fetchEntityConflicts(tenantId: string, entityType: string, entityId: string) {
  return prisma.evidenceConflict.findMany({
    where: { tenantId, entityType, entityId },
    select: {
      id: true, conflictType: true, description: true, status: true,
      resolvedAt: true, resolution: true,
      supportingEvidence: { select: { id: true, title: true, evidenceType: true } },
      contradictingEvidence: { select: { id: true, title: true, evidenceType: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

// ─── Helper: Overall Freshness ───────────────────────────────────────────────

function computeOverallFreshness(evidence: Array<{ freshness: string }>): string {
  if (evidence.length === 0) return "unknown";

  const freshnessOrder = { live: 0, fresh: 1, aging: 2, stale: 3, unknown: 4 };
  const worst = evidence.reduce((worst, e) => {
    const eLevel = freshnessOrder[e.freshness as keyof typeof freshnessOrder] ?? 4;
    return eLevel > worst ? eLevel : worst;
  }, 0);

  const reverseMap = ["live", "fresh", "aging", "stale", "unknown"];
  return reverseMap[worst] ?? "unknown";
}
