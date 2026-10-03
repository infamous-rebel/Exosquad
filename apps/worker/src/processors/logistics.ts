// =============================================================================
// Worker — Logistics Intelligence Processor (Phase 10)
// =============================================================================
// Processes logistics graph building, route calculation, recalculation,
// conflict detection, anomaly detection, refresh, and expiration jobs.
// This processor is self-contained — it does not import API-layer code.
// =============================================================================

import type { Job } from "bullmq";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { LOGISTICS_CONFIG } from "@exosquad/common";

// ─── Job Data Types ──────────────────────────────────────────────────────────

interface LogisticsBuildJob {
  type: "logistics:build";
  tenantId: string;
  triggeredBy: string;
}

interface LogisticsCalculateRoutesJob {
  type: "logistics:calculate-routes";
  tenantId: string;
  subjectType: string;
  subjectId: string;
  triggeredBy: string;
}

interface LogisticsRecalculateJob {
  type: "logistics:recalculate";
  tenantId: string;
  assessmentId: string;
  triggeredBy: string;
}

interface LogisticsDetectConflictsJob {
  type: "logistics:detect-conflicts";
  tenantId: string;
  triggeredBy: string;
}

interface LogisticsDetectAnomaliesJob {
  type: "logistics:detect-anomalies";
  tenantId: string;
  triggeredBy: string;
}

interface LogisticsRefreshJob {
  type: "logistics:refresh";
  tenantId: string;
  triggeredBy: string;
}

interface LogisticsExpireJob {
  type: "logistics:expire";
  tenantId: string;
  triggeredBy: string;
}

type LogisticsJob =
  | LogisticsBuildJob
  | LogisticsCalculateRoutesJob
  | LogisticsRecalculateJob
  | LogisticsDetectConflictsJob
  | LogisticsDetectAnomaliesJob
  | LogisticsRefreshJob
  | LogisticsExpireJob;

// ─── Pure Calculation Helpers (Worker-safe) ──────────────────────────────────

function calculateLegConfidence(
  evidenceStrength: number,
  distinctSources: number,
  hasCarrier: boolean,
  legStatus: string,
  observationCount: number,
  daysSinceObservation: number,
  contradictionCount: number,
): number {
  const weights = LOGISTICS_CONFIG.confidenceWeights;
  const directnessValues = LOGISTICS_CONFIG.directnessValues;

  const sourceIndependence = Math.min(1.0, distinctSources / 3);
  const carrierConfidence = hasCarrier ? 0.7 : 0.0;
  const directness = (directnessValues as Record<string, number>)[legStatus] ?? 0;
  const corroboration = Math.min(1.0, observationCount / 5);

  let temporalFreshness = 0.1;
  for (const tier of LOGISTICS_CONFIG.temporalFreshnessDecay) {
    if (daysSinceObservation < tier.maxDays) {
      temporalFreshness = tier.value;
      break;
    }
  }

  const contradictionPenalty =
    LOGISTICS_CONFIG.contradictionPenaltyFactor * Math.min(1.0, contradictionCount);

  const raw =
    evidenceStrength * weights.evidenceStrength +
    sourceIndependence * weights.sourceIndependence +
    carrierConfidence * weights.carrierConfidence +
    directness * weights.directness +
    corroboration * weights.corroboration +
    temporalFreshness * weights.temporalFreshness;

  return Math.max(0, Math.min(1, raw - contradictionPenalty));
}

// ─── Job Handlers ────────────────────────────────────────────────────────────

async function handleBuild(job: LogisticsBuildJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "logistics_build_started");

  // Load Phase 9 supply-chain data and create logistics nodes/legs
  const scNodes = await prisma.supplyChainNode.findMany({ where: { tenantId } });
  const scEdges = await prisma.supplyChainEdge.findMany({ where: { tenantId } });

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

  let nodesCreated = 0;
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
      // Skip duplicates
    }
  }

  logger.info({ tenantId, nodesCreated, scEdges: scEdges.length }, "logistics_build_completed");
}

async function handleCalculateRoutes(job: LogisticsCalculateRoutesJob): Promise<void> {
  const { tenantId, subjectType, subjectId } = job;
  logger.info({ tenantId, subjectType, subjectId }, "logistics_calculate_routes_started");

  // Load all logistics data for tenant
  const [nodes, legs, observations, evidenceLinks, routes] = await Promise.all([
    prisma.logisticsNode.findMany({ where: { tenantId } }),
    prisma.logisticsLeg.findMany({ where: { tenantId } }),
    prisma.logisticsObservation.findMany({ where: { tenantId } }),
    prisma.logisticsEvidenceLink.findMany({ where: { tenantId } }),
    prisma.logisticsRoute.findMany({ where: { tenantId } }),
  ]);

  // Calculate leg confidences
  for (const leg of legs) {
    const legEvidence = evidenceLinks.filter((e) => e.legId === leg.id);
    const legObs = observations.filter((o) => o.legId === leg.id);
    const distinctSources = new Set(legEvidence.map((e) => e.sourceId).filter(Boolean)).size;
    const daysSinceObs = legObs.length > 0
      ? (Date.now() - Math.max(...legObs.map((o) => o.observedAt.getTime()))) / (1000 * 60 * 60 * 24)
      : 365;

    const confidence = calculateLegConfidence(
      leg.evidenceStrength,
      distinctSources,
      !!(leg.carrierOrganizationId || leg.carrierName),
      leg.legStatus,
      leg.observationCount,
      daysSinceObs,
      leg.contradictionCount,
    );

    await prisma.logisticsLeg.update({
      where: { id: leg.id },
      data: { confidence },
    });
  }

  // Create assessment
  const latestAssessment = await prisma.logisticsAssessment.findFirst({
    where: { tenantId, subjectType, subjectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestAssessment?.version ?? 0) + 1;

  const knownLegs = legs.filter((l) => l.legStatus !== "UNKNOWN").length;
  const confirmedLegs = legs.filter((l) => l.legStatus === "CONFIRMED" || l.legStatus === "CORROBORATED").length;

  await prisma.logisticsAssessment.create({
    data: {
      tenantId,
      subjectType,
      subjectId,
      status: knownLegs > legs.length / 2 ? "COMPLETE" : "INSUFFICIENT",
      algorithmVersion: LOGISTICS_CONFIG.algorithmVersion,
      inputHash: `lg-${tenantId}-${subjectType}-${subjectId}-${nextVersion}`,
      version: nextVersion,
      routeCount: routes.length,
      legCount: legs.length,
      nodeCount: nodes.length,
      knownLegCount: knownLegs,
      unknownLegCount: legs.length - knownLegs,
      confirmedLegCount: confirmedLegs,
      overallConfidence: legs.length > 0 ? legs.reduce((s, l) => s + l.confidence, 0) / legs.length : 0,
    },
  });

  logger.info({ tenantId, legCount: legs.length, routeCount: routes.length }, "logistics_calculate_routes_completed");
}

async function handleRecalculate(job: LogisticsRecalculateJob): Promise<void> {
  const { tenantId, assessmentId } = job;
  const assessment = await prisma.logisticsAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) {
    logger.warn({ tenantId, assessmentId }, "logistics_recalculate_assessment_not_found");
    return;
  }

  await handleCalculateRoutes({
    type: "logistics:calculate-routes",
    tenantId,
    subjectType: assessment.subjectType,
    subjectId: assessment.subjectId,
    triggeredBy: "recalculate",
  });
}

async function handleDetectConflicts(job: LogisticsDetectConflictsJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "logistics_detect_conflicts_started");

  // Find legs with contradictory evidence
  const legs = await prisma.logisticsLeg.findMany({
    where: { tenantId, isContradicted: true },
  });

  let conflictsCreated = 0;
  for (const leg of legs) {
    const existingConflict = await prisma.logisticsConflict.findFirst({
      where: { tenantId, legId: leg.id, resolutionState: "OPEN" },
    });
    if (existingConflict) continue;

    await prisma.logisticsConflict.create({
      data: {
        tenantId,
        legId: leg.id,
        conflictType: "CONTRADICTORY_EVIDENCE",
        severity: leg.contradictionCount > 3 ? "critical" : "high",
        description: `Leg ${leg.id} has ${leg.contradictionCount} contradictory evidence items`,
        supportingEvidenceId: leg.id,
        contradictingEvidenceId: leg.id,
      },
    });
    conflictsCreated++;
  }

  logger.info({ tenantId, conflictsCreated }, "logistics_detect_conflicts_completed");
}

async function handleDetectAnomalies(job: LogisticsDetectAnomaliesJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "logistics_detect_anomalies_started");

  const legs = await prisma.logisticsLeg.findMany({ where: { tenantId } });
  let anomaliesCreated = 0;

  // Self-loop detection
  for (const leg of legs) {
    if (leg.fromNodeId === leg.toNodeId) {
      const existing = await prisma.logisticsAnomaly.findFirst({
        where: { tenantId, legId: leg.id, anomalyType: "SELF_LOOP" },
      });
      if (!existing) {
        await prisma.logisticsAnomaly.create({
          data: {
            tenantId,
            anomalyType: "SELF_LOOP",
            severity: "critical",
            description: `Leg ${leg.id} connects node ${leg.fromNodeId} to itself`,
            legId: leg.id,
            nodeId: leg.fromNodeId,
            assessmentId: "",
          },
        });
        anomaliesCreated++;
      }
    }
  }

  logger.info({ tenantId, anomaliesCreated }, "logistics_detect_anomalies_completed");
}

async function handleRefresh(job: LogisticsRefreshJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "logistics_refresh_started");

  // Mark stale assessments
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 30);

  await prisma.logisticsAssessment.updateMany({
    where: {
      tenantId,
      status: "COMPLETE",
      calculatedAt: { lt: staleThreshold },
    },
    data: { status: "STALE" },
  });

  logger.info({ tenantId }, "logistics_refresh_completed");
}

async function handleExpire(job: LogisticsExpireJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "logistics_expire_started");

  // Expire legs with validTo in the past
  const now = new Date();
  await prisma.logisticsLeg.updateMany({
    where: {
      tenantId,
      validTo: { lt: now },
      legStatus: { not: "CONTRADICTED" },
    },
    data: { legStatus: "UNKNOWN" },
  });

  // Expire routes with validTo in the past
  await prisma.logisticsRoute.updateMany({
    where: {
      tenantId,
      validTo: { lt: now },
      routeStatus: { not: "CONTRADICTED" },
    },
    data: { routeStatus: "UNKNOWN" },
  });

  logger.info({ tenantId }, "logistics_expire_completed");
}

// ─── Main Processor Entry Point ──────────────────────────────────────────────

export async function processLogisticsJob(job: Job): Promise<void> {
  const data = job.data as LogisticsJob;
  const startTime = Date.now();

  logger.info(
    { type: data.type, tenantId: data.tenantId, jobId: job.id },
    "logistics_job_started",
  );

  try {
    switch (data.type) {
      case "logistics:build":
        await handleBuild(data);
        break;
      case "logistics:calculate-routes":
        await handleCalculateRoutes(data);
        break;
      case "logistics:recalculate":
        await handleRecalculate(data);
        break;
      case "logistics:detect-conflicts":
        await handleDetectConflicts(data);
        break;
      case "logistics:detect-anomalies":
        await handleDetectAnomalies(data);
        break;
      case "logistics:refresh":
        await handleRefresh(data);
        break;
      case "logistics:expire":
        await handleExpire(data);
        break;
      default:
        logger.warn({ type: (data as { type: string }).type, jobId: job.id }, "Unknown logistics job type");
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      { type: data.type, tenantId: data.tenantId, jobId: job.id, elapsedMs: elapsed },
      "logistics_job_completed",
    );
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error(
      { type: data.type, tenantId: data.tenantId, jobId: job.id, elapsedMs: elapsed, err },
      "logistics_job_failed",
    );
    throw err;
  }
}
