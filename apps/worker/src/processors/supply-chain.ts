// =============================================================================
// Worker — Supply-Chain Intelligence Processor (Phase 9)
// =============================================================================
// Processes supply-chain graph building, recalculation, conflict detection,
// anomaly detection, refresh, and expiration jobs.
// This processor is self-contained — it does not import API-layer code.
// =============================================================================

import type { Job } from "bullmq";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { SUPPLY_CHAIN_CONFIG } from "@exosquad/common";

// ─── Job Data Types ──────────────────────────────────────────────────────────

interface SupplyChainBuildJob {
  type: "supply-chain:build";
  tenantId: string;
  subjectType: string;
  subjectId: string;
  triggeredBy: string;
}

interface SupplyChainRecalculateJob {
  type: "supply-chain:recalculate";
  tenantId: string;
  assessmentId: string;
  triggeredBy: string;
}

interface SupplyChainRefreshJob {
  type: "supply-chain:refresh";
  tenantId: string;
  subjectType: string;
  subjectId: string;
  triggeredBy: string;
}

interface SupplyChainDetectConflictsJob {
  type: "supply-chain:detect-conflicts";
  tenantId: string;
  triggeredBy: string;
}

interface SupplyChainDetectAnomaliesJob {
  type: "supply-chain:detect-anomalies";
  tenantId: string;
  triggeredBy: string;
}

interface SupplyChainExpireJob {
  type: "supply-chain:expire";
  tenantId: string;
  triggeredBy: string;
}

type SupplyChainJob =
  | SupplyChainBuildJob
  | SupplyChainRecalculateJob
  | SupplyChainRefreshJob
  | SupplyChainDetectConflictsJob
  | SupplyChainDetectAnomaliesJob
  | SupplyChainExpireJob;

// ─── Pure Calculation Helpers (Worker-safe) ──────────────────────────────────

function calculateEdgeConfidence(
  evidenceStrength: number,
  distinctSources: number,
  identityConfidence: number,
  relationshipStatus: string,
  supportingCount: number,
  daysSinceObservation: number,
  contradictionCount: number
): number {
  const weights = SUPPLY_CHAIN_CONFIG.confidenceWeights;
  const directnessValues = SUPPLY_CHAIN_CONFIG.directnessValues;

  const sourceIndependence = Math.min(1.0, distinctSources / 3);
  const directness = directnessValues[relationshipStatus as keyof typeof directnessValues] ?? 0;
  const corroboration = Math.min(1.0, supportingCount / 5);

  let temporalFreshness = 0.1;
  for (const tier of SUPPLY_CHAIN_CONFIG.temporalFreshnessDecay) {
    if (daysSinceObservation < tier.maxDays) {
      temporalFreshness = tier.value;
      break;
    }
  }

  const contradictionPenalty =
    SUPPLY_CHAIN_CONFIG.contradictionPenaltyFactor * Math.min(1.0, contradictionCount);

  const raw =
    evidenceStrength * weights.evidenceStrength +
    sourceIndependence * weights.sourceIndependence +
    identityConfidence * weights.identityConfidence +
    directness * weights.directness +
    corroboration * weights.corroboration +
    temporalFreshness * weights.temporalFreshness;

  return Math.max(0, Math.round((raw - contradictionPenalty) * 10000) / 10000);
}

// ─── Job: Build Graph ────────────────────────────────────────────────────────

async function processBuildJob(job: SupplyChainBuildJob): Promise<void> {
  const { tenantId, subjectType, subjectId } = job;
  const startTime = Date.now();

  logger.info({ tenantId, subjectType, subjectId }, "supply_chain_build_started");

  // Load existing graph data for the subject
  const subjectNodes = await prisma.supplyChainNode.findMany({
    where: {
      tenantId,
      OR: [
        { id: subjectId },
        { canonicalEntityType: subjectType.toLowerCase(), canonicalEntityId: subjectId },
      ],
    },
  });

  if (subjectNodes.length === 0) {
    logger.info({ tenantId, subjectType, subjectId }, "supply_chain_build_no_subject_nodes");
    return;
  }

  const nodeIds = subjectNodes.map((n) => n.id);

  // Load connected edges
  const edges = await prisma.supplyChainEdge.findMany({
    where: {
      tenantId,
      OR: [{ fromNodeId: { in: nodeIds } }, { toNodeId: { in: nodeIds } }],
    },
    include: {
      observations: true,
      evidenceLinks: true,
    },
  });

  // Add connected node IDs
  for (const edge of edges) {
    nodeIds.push(edge.fromNodeId, edge.toNodeId);
  }

  // Load all nodes
  const allNodes = await prisma.supplyChainNode.findMany({
    where: { tenantId, id: { in: [...new Set(nodeIds)] } },
  });

  // Load sources for independence calculation
  const sourceIds = [...new Set(edges.flatMap((e) => e.observations.map((o) => o.sourceId)))];
  const sources = sourceIds.length > 0
    ? await prisma.source.findMany({
        where: { tenantId, id: { in: sourceIds } },
        select: { id: true, type: true, name: true, config: true },
      })
    : [];

  const sourceDomainMap = new Map<string, string>();
  for (const s of sources) {
    const cfg = s.config as Record<string, unknown> | null;
    const baseUrl = cfg?.baseUrl ?? cfg?.base_url ?? cfg?.url;
    if (typeof baseUrl === "string") {
      try {
        sourceDomainMap.set(s.id, new URL(baseUrl).hostname);
      } catch {
        sourceDomainMap.set(s.id, baseUrl);
      }
    } else {
      sourceDomainMap.set(s.id, `source:${s.id}`);
    }
  }

  // Recalculate each edge
  const now = new Date();
  for (const edge of edges) {
    const observations = edge.observations;
    const evidenceLinks = edge.evidenceLinks;

    // Count independent sources
    const seenDomains = new Set<string>();
    const seenSourceIds = new Set<string>();
    let distinctSources = 0;
    for (const obs of observations) {
      if (seenSourceIds.has(obs.sourceId)) continue;
      const domain = sourceDomainMap.get(obs.sourceId) ?? `source:${obs.sourceId}`;
      if (seenDomains.has(domain)) continue;
      seenSourceIds.add(obs.sourceId);
      seenDomains.add(domain);
      distinctSources++;
    }

    // Evidence strength
    const strengthValues = SUPPLY_CHAIN_CONFIG.evidenceStrengthValues;
    let evidenceStrength = 0;
    const supportingLinks = evidenceLinks.filter(
      (e) => e.evidenceRole === "SUPPORTING" || e.evidenceRole === "CONTEXTUAL"
    );
    if (supportingLinks.length > 0) {
      let totalWeight = 0;
      let weightedSum = 0;
      for (const link of supportingLinks) {
        const value = strengthValues[link.evidenceStrength as keyof typeof strengthValues] ?? 0.2;
        weightedSum += value * Number(link.relevance);
        totalWeight += Number(link.relevance);
      }
      evidenceStrength = totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    // Identity confidence
    const fromNode = allNodes.find((n) => n.id === edge.fromNodeId);
    const toNode = allNodes.find((n) => n.id === edge.toNodeId);
    const avgIdentity =
      ((fromNode ? Number(fromNode.identityConfidence) : 0) +
        (toNode ? Number(toNode.identityConfidence) : 0)) /
      2;

    // Temporal freshness
    let daysSince = Infinity;
    if (observations.length > 0) {
      const mostRecent = observations.reduce((latest, obs) =>
        obs.observedAt > latest.observedAt ? obs : latest
      );
      daysSince = (now.getTime() - mostRecent.observedAt.getTime()) / (1000 * 60 * 60 * 24);
    }

    // Determine status
    const supportingCount = evidenceLinks.filter((e) => e.evidenceRole === "SUPPORTING").length;
    const contradictingCount = evidenceLinks.filter(
      (e) => e.evidenceRole === "CONTRADICTING"
    ).length;

    let status = edge.relationshipStatus;
    if (contradictingCount > 0 || edge.isContradicted) {
      status = "CONTRADICTED";
    } else if (distinctSources >= SUPPLY_CHAIN_CONFIG.confirmationRules.minSourceDiversity &&
      avgIdentity >= SUPPLY_CHAIN_CONFIG.confirmationRules.minIdentityConfidence &&
      evidenceStrength >= SUPPLY_CHAIN_CONFIG.confirmationRules.minEvidenceStrength &&
      !edge.isContradicted) {
      status = "CONFIRMED";
    } else if (distinctSources >= SUPPLY_CHAIN_CONFIG.corroborationRules.minSourceDiversity) {
      status = "CORROBORATED";
    } else if (observations.length > 0) {
      status = "OBSERVED";
    } else {
      status = "UNKNOWN";
    }

    const confidence = calculateEdgeConfidence(
      evidenceStrength,
      distinctSources,
      avgIdentity,
      status,
      supportingCount,
      daysSince,
      edge.contradictionCount
    );

    await prisma.supplyChainEdge.update({
      where: { id: edge.id },
      data: {
        confidence,
        evidenceStrength,
        sourceDiversity: distinctSources,
        relationshipStatus: status,
        evidenceCount: evidenceLinks.length,
        observationCount: observations.length,
      },
    });
  }

  const duration = Date.now() - startTime;
  logger.info(
    { tenantId, edgesProcessed: edges.length, duration },
    "supply_chain_build_completed"
  );
}

// ─── Job: Recalculate ────────────────────────────────────────────────────────

async function processRecalculateJob(job: SupplyChainRecalculateJob): Promise<void> {
  const { tenantId, assessmentId } = job;

  logger.info({ tenantId, assessmentId }, "supply_chain_recalculate_started");

  const assessment = await prisma.supplyChainAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) {
    logger.warn({ tenantId, assessmentId }, "supply_chain_recalculate_assessment_not_found");
    return;
  }

  // Delegate to build job logic
  await processBuildJob({
    type: "supply-chain:build",
    tenantId,
    subjectType: assessment.subjectType,
    subjectId: assessment.subjectId,
    triggeredBy: job.triggeredBy,
  });
}

// ─── Job: Refresh ────────────────────────────────────────────────────────────

async function processRefreshJob(job: SupplyChainRefreshJob): Promise<void> {
  const { tenantId, subjectType, subjectId } = job;

  logger.info({ tenantId, subjectType, subjectId }, "supply_chain_refresh_started");

  // Check if assessment is stale (>24h)
  const latestAssessment = await prisma.supplyChainAssessment.findFirst({
    where: { tenantId, subjectType, subjectId },
    orderBy: { calculatedAt: "desc" },
  });

  if (latestAssessment) {
    const hoursSinceCalc =
      (Date.now() - latestAssessment.calculatedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCalc < 24) {
      logger.debug(
        { tenantId, subjectType, subjectId, hoursSinceCalc },
        "supply_chain_refresh_assessment_still_fresh"
      );
      return;
    }
  }

  // Trigger rebuild
  await processBuildJob({
    type: "supply-chain:build",
    tenantId,
    subjectType,
    subjectId,
    triggeredBy: job.triggeredBy,
  });
}

// ─── Job: Detect Conflicts ──────────────────────────────────────────────────

async function processDetectConflictsJob(job: SupplyChainDetectConflictsJob): Promise<void> {
  const { tenantId } = job;
  const startTime = Date.now();

  logger.info({ tenantId }, "supply_chain_detect_conflicts_started");

  // Load all edges for this tenant
  const edges = await prisma.supplyChainEdge.findMany({
    where: { tenantId },
    include: { evidenceLinks: true },
    take: 1000,
  });

  let conflictsCreated = 0;

  // Check for contradictory evidence on same edge
  for (const edge of edges) {
    const supporting = edge.evidenceLinks.filter((e) => e.evidenceRole === "SUPPORTING");
    const contradicting = edge.evidenceLinks.filter((e) => e.evidenceRole === "CONTRADICTING");

    if (supporting.length > 0 && contradicting.length > 0) {
      // Check if conflict already exists
      const existing = await prisma.supplyChainConflict.findFirst({
        where: {
          tenantId,
          edgeId: edge.id,
          conflictType: "CONTRADICTORY_EVIDENCE",
          resolutionState: "OPEN",
        },
      });

      if (!existing) {
        await prisma.supplyChainConflict.create({
          data: {
            tenantId,
            edgeId: edge.id,
            conflictType: "CONTRADICTORY_EVIDENCE",
            severity: "high",
            description: `Edge ${edge.id} has both supporting (${supporting.length}) and contradicting (${contradicting.length}) evidence`,
            supportingEvidenceId: supporting[0]!.evidenceId,
            contradictingEvidenceId: contradicting[0]!.evidenceId,
            resolutionState: "OPEN",
          },
        });
        conflictsCreated++;

        // Mark edge as contradicted
        await prisma.supplyChainEdge.update({
          where: { id: edge.id },
          data: {
            isContradicted: true,
            contradictionCount: contradicting.length,
            relationshipStatus: "CONTRADICTED",
          },
        });
      }
    }
  }

  // Check for contradictory manufacturer (same product, different manufacturers)
  const mfgEdges = edges.filter(
    (e) => e.edgeType === "MANUFACTURER_PRODUCES_SKU" || e.edgeType === "BRAND_MANUFACTURES_PRODUCT"
  );
  const productMfgMap = new Map<string, typeof mfgEdges>();
  for (const e of mfgEdges) {
    const key = e.toNodeId;
    if (!productMfgMap.has(key)) productMfgMap.set(key, []);
    productMfgMap.get(key)!.push(e);
  }

  for (const [productId, mfgs] of productMfgMap) {
    const uniqueMfgs = new Set(mfgs.map((e) => e.fromNodeId));
    if (uniqueMfgs.size > 1) {
      const existing = await prisma.supplyChainConflict.findFirst({
        where: {
          tenantId,
          nodeId: productId,
          conflictType: "CONTRADICTORY_MANUFACTURER",
          resolutionState: "OPEN",
        },
      });

      if (!existing) {
        const evA = mfgs[0]?.evidenceLinks[0];
        const evB = mfgs[1]?.evidenceLinks[0];

        await prisma.supplyChainConflict.create({
          data: {
            tenantId,
            nodeId: productId,
            edgeId: mfgs[0]?.id,
            conflictType: "CONTRADICTORY_MANUFACTURER",
            severity: "critical",
            description: `Product ${productId} has ${uniqueMfgs.size} different manufacturers`,
            supportingEvidenceId: evA?.evidenceId ?? "none",
            contradictingEvidenceId: evB?.evidenceId ?? "none",
            resolutionState: "OPEN",
          },
        });
        conflictsCreated++;
      }
    }
  }

  const duration = Date.now() - startTime;
  logger.info(
    { tenantId, conflictsCreated, duration },
    "supply_chain_detect_conflicts_completed"
  );
}

// ─── Job: Detect Anomalies ──────────────────────────────────────────────────

async function processDetectAnomaliesJob(job: SupplyChainDetectAnomaliesJob): Promise<void> {
  const { tenantId } = job;
  const startTime = Date.now();

  logger.info({ tenantId }, "supply_chain_detect_anomalies_started");

  const [nodes, edges] = await Promise.all([
    prisma.supplyChainNode.findMany({ where: { tenantId }, take: 2000 }),
    prisma.supplyChainEdge.findMany({ where: { tenantId }, take: 5000 }),
  ]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let anomaliesCreated = 0;

  // Self-loops
  for (const edge of edges) {
    if (edge.fromNodeId === edge.toNodeId) {
      const existing = await prisma.supplyChainAnomaly.findFirst({
        where: { tenantId, anomalyType: "SELF_LOOP", edgeId: edge.id, status: "OPEN" },
      });
      if (!existing) {
        await prisma.supplyChainAnomaly.create({
          data: {
            tenantId,
            anomalyType: "SELF_LOOP",
            severity: "high",
            description: `Edge ${edge.id} forms a self-loop`,
            nodeId: edge.fromNodeId,
            edgeId: edge.id,
            involvedNodeIds: [edge.fromNodeId],
            involvedEdgeIds: [edge.id],
          },
        });
        anomaliesCreated++;
      }
    }
  }

  // Invalid relationships
  // (Edge type validity check — simplified for worker)
  const VALID_EDGE_TYPES: Record<string, { from: string[]; to: string[] }> = {
    BRAND_MANUFACTURES_PRODUCT: { from: ["BRAND"], to: ["PRODUCT"] },
    MANUFACTURER_PRODUCES_SKU: { from: ["MANUFACTURER"], to: ["SKU"] },
    SUPPLIER_SUPPLIES: { from: ["SUPPLIER"], to: ["SELLER"] },
    SELLER_PURCHASES_FROM: { from: ["SELLER"], to: ["SUPPLIER"] },
    SELLER_LISTS: { from: ["SELLER"], to: ["LISTING"] },
    ORIGINATED_FROM: { from: ["PRODUCT", "SKU"], to: ["ORIGIN_COUNTRY", "ORIGIN_REGION", "ORIGIN_CITY"] },
  };

  for (const edge of edges) {
    const constraint = VALID_EDGE_TYPES[edge.edgeType];
    if (!constraint) continue;

    const fromNode = nodeMap.get(edge.fromNodeId);
    const toNode = nodeMap.get(edge.toNodeId);
    if (!fromNode || !toNode) continue;

    const fromValid = constraint.from.includes(fromNode.nodeType);
    const toValid = constraint.to.includes(toNode.nodeType);

    if (!fromValid || !toValid) {
      const existing = await prisma.supplyChainAnomaly.findFirst({
        where: { tenantId, anomalyType: "INVALID_RELATIONSHIP", edgeId: edge.id, status: "OPEN" },
      });
      if (!existing) {
        await prisma.supplyChainAnomaly.create({
          data: {
            tenantId,
            anomalyType: "INVALID_RELATIONSHIP",
            severity: "medium",
            description: `Edge type ${edge.edgeType} invalid for ${fromNode.nodeType} → ${toNode.nodeType}`,
            edgeId: edge.id,
            involvedNodeIds: [edge.fromNodeId, edge.toNodeId],
            involvedEdgeIds: [edge.id],
          },
        });
        anomaliesCreated++;
      }
    }
  }

  const duration = Date.now() - startTime;
  logger.info(
    { tenantId, anomaliesCreated, duration },
    "supply_chain_detect_anomalies_completed"
  );
}

// ─── Job: Expire ─────────────────────────────────────────────────────────────

async function processExpireJob(job: SupplyChainExpireJob): Promise<void> {
  const { tenantId } = job;
  const now = new Date();

  logger.info({ tenantId }, "supply_chain_expire_started");

  // Find edges past their validTo date
  const expiredEdges = await prisma.supplyChainEdge.findMany({
    where: {
      tenantId,
      validTo: { lt: now },
    },
  });

  let expiredCount = 0;
  for (const edge of expiredEdges) {
    // Mark as expired by updating status if not already
    if (edge.relationshipStatus !== "UNKNOWN") {
      await prisma.supplyChainEdge.update({
        where: { id: edge.id },
        data: { relationshipStatus: "UNKNOWN" },
      });
      expiredCount++;
    }
  }

  // Mark stale assessments
  const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleAssessments = await prisma.supplyChainAssessment.findMany({
    where: {
      tenantId,
      status: { in: ["COMPLETE", "PENDING"] },
      calculatedAt: { lt: staleThreshold },
    },
  });

  let staleCount = 0;
  for (const assessment of staleAssessments) {
    await prisma.supplyChainAssessment.update({
      where: { id: assessment.id },
      data: { status: "STALE" },
    });
    staleCount++;
  }

  logger.info(
    { tenantId, expiredCount, staleCount },
    "supply_chain_expire_completed"
  );
}

// ─── Main Processor ──────────────────────────────────────────────────────────

/**
 * Process supply-chain jobs from the BullMQ queue.
 */
export async function processSupplyChainJob(job: Job): Promise<void> {
  const data = job.data as SupplyChainJob;
  const startTime = Date.now();

  logger.info(
    { jobId: job.id, type: data.type, tenantId: data.tenantId },
    "supply_chain_job_started"
  );

  try {
    switch (data.type) {
      case "supply-chain:build":
        await processBuildJob(data);
        break;
      case "supply-chain:recalculate":
        await processRecalculateJob(data);
        break;
      case "supply-chain:refresh":
        await processRefreshJob(data);
        break;
      case "supply-chain:detect-conflicts":
        await processDetectConflictsJob(data);
        break;
      case "supply-chain:detect-anomalies":
        await processDetectAnomaliesJob(data);
        break;
      case "supply-chain:expire":
        await processExpireJob(data);
        break;
      default:
        logger.warn({ type: (data as { type: string }).type }, "Unknown supply-chain job type");
    }

    const duration = Date.now() - startTime;
    logger.info(
      { jobId: job.id, type: data.type, duration },
      "supply_chain_job_completed"
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      { jobId: job.id, type: data.type, duration, error },
      "supply_chain_job_failed"
    );
    throw error;
  }
}
