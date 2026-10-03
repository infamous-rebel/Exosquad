// =============================================================================
// Worker — Pricing Intelligence Processor (Phase 11)
// =============================================================================
// Processes pricing assessment, recalculation, refresh, and expiration jobs.
// This processor is self-contained — it does not import API-layer code.
// =============================================================================

import type { Job } from "bullmq";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { PRICING_CONFIG } from "@exosquad/common";
import { createHash } from "node:crypto";

// ─── Job Data Types ──────────────────────────────────────────────────────────

interface PricingAssessJob {
  type: "pricing:assess";
  tenantId: string;
  productId: string;
  supplierId?: string | null;
  quantity?: number;
  targetCurrency?: string;
  triggeredBy: string;
}

interface PricingRecalculateJob {
  type: "pricing:recalculate";
  tenantId: string;
  assessmentId: string;
  triggeredBy: string;
}

interface PricingRefreshJob {
  type: "pricing:refresh";
  tenantId: string;
  triggeredBy: string;
}

interface PricingExpireJob {
  type: "pricing:expire";
  tenantId: string;
  triggeredBy: string;
}

type PricingJob =
  | PricingAssessJob
  | PricingRecalculateJob
  | PricingRefreshJob
  | PricingExpireJob;

// ─── Content Hash Helper ────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ─── Job Handlers ────────────────────────────────────────────────────────────

async function handleAssess(job: PricingAssessJob): Promise<void> {
  const { tenantId, productId, supplierId = null } = job;
  const quantity = job.quantity ?? 1;
  const targetCurrency = job.targetCurrency ?? PRICING_CONFIG.defaultTargetCurrency;

  logger.info({ tenantId, productId, supplierId, quantity }, "pricing_assess_started");

  // Load price observations
  const observations = await prisma.priceObservation.findMany({
    where: { tenantId, productId, ...(supplierId ? { supplierId } : {}) },
  });

  // Load cost components
  const costComponents = await prisma.costComponent.findMany({
    where: { tenantId, productId, ...(supplierId ? { supplierId } : {}) },
  });

  // Calculate basic aggregation
  const productCostObs = observations.filter(
    (o) => o.observationType === "PRODUCT_COST" || o.observationType === "SELLING_PRICE",
  );
  void productCostObs; // Used for future statistical aggregation

  const knownCostComponents = costComponents.filter((c) => c.status !== "UNKNOWN");
  const unknownCostTypes = costComponents.filter((c) => c.status === "UNKNOWN").map((c) => c.type);

  // Calculate total cost from known components (simplified — same currency assumed)
  let totalKnownCost = 0;
  const costByCategory: Record<string, number> = {};
  for (const comp of knownCostComponents) {
    totalKnownCost += comp.amount;
    const category = comp.type;
    costByCategory[category] = (costByCategory[category] ?? 0) + comp.amount;
  }

  const hasAllCosts = unknownCostTypes.length === 0;
  const totalCost = hasAllCosts ? totalKnownCost : 0;

  // Determine next version
  const latestAssessment = await prisma.pricingAssessment.findFirst({
    where: { tenantId, productId, supplierId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestAssessment?.version ?? 0) + 1;
  const calculatedAt = new Date();

  // Calculate basic confidence
  const observationScore = Math.min(1.0, observations.length / PRICING_CONFIG.minimumComparableObservations);
  const costScore = Math.min(1.0, knownCostComponents.length / 5);
  const confidenceScore = (observationScore * 0.4 + costScore * 0.6);
  const completenessScore = hasAllCosts ? 1.0 : knownCostComponents.length / (knownCostComponents.length + unknownCostTypes.length);

  // Build input hash
  const inputHash = sha256(stableStringify({
    tenantId, productId, supplierId, quantity, targetCurrency,
    observationIds: observations.map((o) => o.id).sort(),
    costComponentIds: costComponents.map((c) => c.id).sort(),
    algorithmVersion: PRICING_CONFIG.algorithmVersion,
  }));

  // Create landed cost calculation
  const landedCost = await prisma.landedCostCalculation.create({
    data: {
      tenantId,
      productId,
      supplierId,
      quantity,
      currency: targetCurrency,
      productCost: costByCategory["PRODUCT_COST"] ?? 0,
      originCosts: (costByCategory["PACKAGING"] ?? 0) + (costByCategory["INLAND_ORIGIN"] ?? 0) + (costByCategory["EXPORT_HANDLING"] ?? 0),
      freightCost: costByCategory["FREIGHT"] ?? 0,
      insuranceCost: costByCategory["INSURANCE"] ?? 0,
      dutyCost: costByCategory["DUTY"] ?? 0,
      taxCost: (costByCategory["VAT"] ?? 0) + (costByCategory["AIT"] ?? 0) + (costByCategory["ATV"] ?? 0) + (costByCategory["CD"] ?? 0) + (costByCategory["SD"] ?? 0) + (costByCategory["RD"] ?? 0),
      portCost: costByCategory["PORT"] ?? 0,
      customsCost: costByCategory["CUSTOMS"] ?? 0,
      clearingCost: costByCategory["CLEARING"] ?? 0,
      destinationCost: (costByCategory["INLAND_BANGLADESH"] ?? 0) + (costByCategory["WAREHOUSE"] ?? 0),
      otherCost: (costByCategory["PAYMENT"] ?? 0) + (costByCategory["PLATFORM"] ?? 0) + (costByCategory["OTHER"] ?? 0),
      totalCost,
      unitLandedCost: quantity > 0 ? totalCost / quantity : null,
      status: hasAllCosts ? "COMPLETE" : "INSUFFICIENT",
      unknownComponentFlags: unknownCostTypes,
      confidence: confidenceScore,
      completeness: completenessScore,
      componentIds: costComponents.map((c) => c.id),
      observationIds: observations.map((o) => o.id),
      algorithmVersion: PRICING_CONFIG.algorithmVersion,
      inputHash,
      version: nextVersion,
      calculatedAt,
      contentHash: sha256(stableStringify({
        tenantId, productId, supplierId, quantity,
        componentIds: costComponents.map((c) => c.id).sort(),
        observationIds: observations.map((o) => o.id).sort(),
        algorithmVersion: PRICING_CONFIG.algorithmVersion,
      })),
    },
  });

  // Create assessment
  await prisma.pricingAssessment.create({
    data: {
      tenantId,
      productId,
      supplierId,
      status: hasAllCosts ? "COMPLETE" : "INSUFFICIENT",
      algorithmVersion: PRICING_CONFIG.algorithmVersion,
      inputHash,
      version: nextVersion,
      observationCount: observations.length,
      costComponentCount: costComponents.length,
      landedCostCount: 1,
      scenarioCount: 0,
      marketSnapshotCount: 0,
      riskCount: unknownCostTypes.length > 0 ? 1 : 0,
      overallConfidence: confidenceScore,
      overallCompleteness: completenessScore,
      landedCostIds: [landedCost.id],
      scenarioIds: [],
      marketSnapshotIds: [],
      observationIds: observations.map((o) => o.id),
      calculatedAt,
    },
  });

  logger.info(
    { tenantId, productId, observationCount: observations.length, costComponentCount: costComponents.length },
    "pricing_assess_completed",
  );
}

async function handleRecalculate(job: PricingRecalculateJob): Promise<void> {
  const { tenantId, assessmentId } = job;
  const assessment = await prisma.pricingAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) {
    logger.warn({ tenantId, assessmentId }, "pricing_recalculate_assessment_not_found");
    return;
  }

  await handleAssess({
    type: "pricing:assess",
    tenantId,
    productId: assessment.productId,
    supplierId: assessment.supplierId,
    triggeredBy: "recalculate",
  });
}

async function handleRefresh(job: PricingRefreshJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "pricing_refresh_started");

  // Mark stale assessments
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - PRICING_CONFIG.staleObservationThresholdDays);

  await prisma.pricingAssessment.updateMany({
    where: {
      tenantId,
      status: "COMPLETE",
      calculatedAt: { lt: staleThreshold },
    },
    data: { status: "STALE" },
  });

  // Mark stale landed cost calculations
  await prisma.landedCostCalculation.updateMany({
    where: {
      tenantId,
      status: "COMPLETE",
      calculatedAt: { lt: staleThreshold },
    },
    data: { status: "STALE" },
  });

  logger.info({ tenantId }, "pricing_refresh_completed");
}

async function handleExpire(job: PricingExpireJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "pricing_expire_started");

  const now = new Date();

  // Expire price observations with validUntil in the past
  // Observations are immutable — we don't modify them, just note they're expired
  // The validUntil field is metadata only; stale observations are filtered at query time

  // Expire cost components with validTo in the past
  await prisma.costComponent.updateMany({
    where: {
      tenantId,
      validTo: { lt: now },
      status: { not: "EXPIRED" },
    },
    data: { status: "EXPIRED" },
  });

  // Expire scenarios with validTo in the past
  await prisma.pricingScenario.updateMany({
    where: {
      tenantId,
      validTo: { lt: now },
      status: { not: "STALE" },
    },
    data: { status: "STALE" },
  });

  logger.info({ tenantId }, "pricing_expire_completed");
}

// ─── Main Processor Entry Point ──────────────────────────────────────────────

export async function processPricingJob(job: Job): Promise<void> {
  const data = job.data as PricingJob;
  const startTime = Date.now();

  logger.info(
    { type: data.type, tenantId: data.tenantId, jobId: job.id },
    "pricing_job_started",
  );

  try {
    switch (data.type) {
      case "pricing:assess":
        await handleAssess(data);
        break;
      case "pricing:recalculate":
        await handleRecalculate(data);
        break;
      case "pricing:refresh":
        await handleRefresh(data);
        break;
      case "pricing:expire":
        await handleExpire(data);
        break;
      default:
        logger.warn({ type: (data as { type: string }).type, jobId: job.id }, "Unknown pricing job type");
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      { type: data.type, tenantId: data.tenantId, jobId: job.id, elapsedMs: elapsed },
      "pricing_job_completed",
    );
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error(
      { type: data.type, tenantId: data.tenantId, jobId: job.id, elapsedMs: elapsed, err },
      "pricing_job_failed",
    );
    throw err;
  }
}
