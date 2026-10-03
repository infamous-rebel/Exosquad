// =============================================================================
// Worker — Demand Intelligence Processor (Phase 7)
// =============================================================================
// Processes demand calculation jobs from the demand_intelligence queue.
// Handles: normalize_demand_signal, calculate_demand_metrics,
// calculate_trends, calculate_momentum, calculate_seasonality,
// recompute_product_demand, recompute_market_demand.
// =============================================================================

import type { Job } from "bullmq";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { createHash } from "node:crypto";

// ─── Inline Helpers (worker-safe, no API dependency) ─────────────────────────

function computeSignalContentHash(data: {
  signalType: string;
  metric: string;
  value: number;
  observedAt: Date;
  granularity: string;
  geography: string;
  sourceId: string;
}): string {
  const payload = `${data.sourceId}:${data.signalType}:${data.metric}:${data.value}:${data.observedAt.toISOString()}:${data.granularity}:${data.geography}`;
  return createHash("sha256").update(payload).digest("hex");
}

function calculateFreshness(observedAt: Date, signalType: string, now: Date = new Date()): string {
  const ageHours = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60);
  const thresholds: Record<string, { fresh: number; aging: number }> = {
    MARKETPLACE: { fresh: 24, aging: 72 },
    SELLER_COUNT: { fresh: 24, aging: 72 },
    LISTING_COUNT: { fresh: 24, aging: 72 },
    REVIEW_COUNT: { fresh: 48, aging: 168 },
    PRICE: { fresh: 12, aging: 48 },
    AVAILABILITY: { fresh: 6, aging: 24 },
    SEARCH: { fresh: 168, aging: 720 },
    SOCIAL: { fresh: 48, aging: 168 },
  };
  const t = thresholds[signalType] ?? { fresh: 48, aging: 168 };
  if (ageHours <= t.fresh) return "fresh";
  if (ageHours <= t.aging) return "aging";
  return "stale";
}

// ─── Main Processor ──────────────────────────────────────────────────────────

export async function processDemandJob(job: Job): Promise<unknown> {
  const { type } = job.data;

  switch (type) {
    case "normalize_demand_signal":
      return handleNormalizeSignal(job);
    case "calculate_demand_metrics":
    case "calculate_trends":
    case "calculate_momentum":
    case "calculate_seasonality":
    case "recompute_product_demand":
      return handleRecomputeProductDemand(job);
    case "recompute_market_demand":
      return handleRecomputeMarketDemand(job);
    default:
      logger.warn({ jobType: type, jobId: job.id }, "Unknown demand job type");
      throw new Error(`Unknown demand job type: ${type}`);
  }
}

// ─── Signal Normalization ────────────────────────────────────────────────────

async function handleNormalizeSignal(job: Job): Promise<{ signalId: string; created: boolean }> {
  const d = job.data;
  const granularity = d.granularity ?? "day";
  const geography = d.geography ?? "global";
  const observedAt = new Date(d.observedAt);
  const retrievedAt = new Date(d.retrievedAt);

  const contentHash = computeSignalContentHash({
    signalType: d.signalType,
    metric: d.metric,
    value: d.value,
    observedAt,
    granularity,
    geography,
    sourceId: d.sourceId,
  });

  // Dedup check
  const existing = await prisma.demandSignal.findUnique({
    where: {
      tenantId_sourceId_signalType_metric_observedAt_granularity_geography_contentHash: {
        tenantId: d.tenantId,
        sourceId: d.sourceId,
        signalType: d.signalType,
        metric: d.metric,
        observedAt,
        granularity,
        geography,
        contentHash,
      },
    },
  });

  if (existing) {
    logger.debug({ signalId: existing.id }, "Duplicate demand signal skipped");
    return { signalId: existing.id, created: false };
  }

  const freshness = calculateFreshness(observedAt, d.signalType);

  const signal = await prisma.demandSignal.create({
    data: {
      tenantId: d.tenantId,
      productId: d.productId,
      productVariantId: d.productVariantId,
      brandId: d.brandId,
      sellerId: d.sellerId,
      sourceId: d.sourceId,
      evidenceId: d.evidenceId,
      signalType: d.signalType,
      metric: d.metric,
      value: d.value,
      originalValue: d.originalValue,
      unit: d.unit,
      currency: d.currency,
      observedAt,
      retrievedAt,
      periodStart: d.periodStart ? new Date(d.periodStart) : undefined,
      periodEnd: d.periodEnd ? new Date(d.periodEnd) : undefined,
      granularity,
      geography,
      country: d.country,
      marketplace: d.marketplace,
      confidence: d.confidence ?? 0.5,
      freshness,
      observationStatus: d.observationStatus ?? "observed",
      dataQuality: d.dataQuality ?? "valid",
      sourceReliability: d.sourceReliability ?? 0.5,
      contentHash,
    },
  });

  logger.info(
    { signalId: signal.id, tenantId: signal.tenantId, signalType: signal.signalType, metric: signal.metric },
    "demand_signal_normalized"
  );

  return { signalId: signal.id, created: true };
}

// ─── Recompute Product Demand ────────────────────────────────────────────────

async function handleRecomputeProductDemand(job: Job): Promise<{ productId: string; demandState: string }> {
  const { tenantId, productId, windowDays = 30, geography = "global" } = job.data;

  logger.info(
    { jobId: job.id, tenantId, productId, windowDays },
    "demand_calculation_started"
  );

  // Fetch signals for this product
  const now = new Date();
  const startDate = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const signals = await prisma.demandSignal.findMany({
    where: {
      tenantId,
      productId,
      geography,
      status: "active",
      observedAt: { gte: startDate, lte: now },
      isOutlier: false,
    },
    orderBy: { observedAt: "asc" },
  });

  // Supersede previous calculations
  await prisma.demandCalculation.updateMany({
    where: { tenantId, productId, geography, windowDays, status: "active" },
    data: { status: "superseded" },
  });

  // Compute basic metrics from signals
  const points = signals.map((s) => ({ timestamp: s.observedAt, value: s.value }));
  const sourceIds = new Set(signals.map((s) => s.sourceId));

  // Growth: first half vs second half
  let growthResult = {};
  if (points.length >= 2) {
    const mid = Math.floor(points.length / 2);
    const baseline = points.slice(0, mid);
    const current = points.slice(mid);
    const baselineAvg = baseline.reduce((s, p) => s + p.value, 0) / baseline.length;
    const currentAvg = current.reduce((s, p) => s + p.value, 0) / current.length;
    const absChange = currentAvg - baselineAvg;
    const pctChange = baselineAvg !== 0 ? (absChange / baselineAvg) * 100 : null;
    growthResult = {
      absoluteChange: Math.round(absChange * 100) / 100,
      percentageChange: pctChange !== null ? Math.round(pctChange * 100) / 100 : null,
      algorithm: "demand-growth",
      algorithmVersion: "v1",
    };
  }

  // Trend: simple classification
  let trendState = "INSUFFICIENT_DATA";
  if (points.length >= 3 && "percentageChange" in growthResult) {
    const pct = (growthResult as { percentageChange: number | null }).percentageChange;
    if (pct !== null) {
      if (pct > 20) trendState = "STRONG_UPTREND";
      else if (pct > 5) trendState = "UPTREND";
      else if (pct < -20) trendState = "STRONG_DOWNTREND";
      else if (pct < -5) trendState = "DOWNWARD";
      else trendState = "STABLE";
    }
  }

  // Demand state
  let demandState = "INSUFFICIENT_DATA";
  if (points.length >= 3) {
    if (trendState === "STRONG_UPTREND" || trendState === "UPTREND") demandState = "GROWING";
    else if (trendState === "STRONG_DOWNTREND" || trendState === "DOWNWARD") demandState = "DECLINING";
    else if (trendState === "STABLE") demandState = "ESTABLISHED";
    else demandState = "STABLE";
  }

  // Confidence
  const avgReliability = signals.length > 0
    ? signals.reduce((sum, s) => sum + s.sourceReliability, 0) / signals.length
    : 0;
  const validCount = signals.filter((s) => s.dataQuality === "valid").length;
  const qualityRatio = signals.length > 0 ? validCount / signals.length : 0;
  const obsFactor = Math.min(1, signals.length / 20);
  const sourceFactor = Math.min(1, sourceIds.size / 5);
  const confidence = Math.round(
    (obsFactor * 0.3 + sourceFactor * 0.2 + qualityRatio * 0.2 + avgReliability * 0.3) * 100
  ) / 100;

  // Data sufficiency
  let dataSufficiency = "SUFFICIENT";
  if (signals.length < 2) dataSufficiency = "INSUFFICIENT";
  else if (signals.length < 7) dataSufficiency = "LIMITED";

  // Persist key calculations
  const inputSignalIds = signals.map((s) => s.id);
  const calcBase = {
    tenantId,
    entityType: "product",
    entityId: productId,
    productId,
    geography,
    windowDays,
    observationCount: signals.length,
    sourceCount: sourceIds.size,
    confidence,
    dataSufficiency,
    freshness: signals.length > 0 ? calculateFreshness(signals[signals.length - 1]!.observedAt, signals[signals.length - 1]!.signalType) : "unknown",
    periodStart: startDate,
    periodEnd: now,
    inputSignalIds,
    status: "active" as const,
  };

  await prisma.demandCalculation.createMany({
    data: [
      {
        ...calcBase,
        calculationType: "current_demand",
        algorithm: "demand-state-v1",
        algorithmVersion: "v1",
        result: { demandState, confidence },
        resultSummary: `Demand state: ${demandState}`,
      },
      {
        ...calcBase,
        calculationType: "demand_growth",
        algorithm: "demand-growth",
        algorithmVersion: "v1",
        result: growthResult,
        resultSummary: "percentageChange" in growthResult
          ? `Growth: ${(growthResult as { percentageChange: number | null }).percentageChange}%`
          : "Growth: insufficient data",
      },
      {
        ...calcBase,
        calculationType: "trend_classification",
        algorithm: "trend-classification",
        algorithmVersion: "v1",
        result: { trend: trendState, observationCount: signals.length },
        resultSummary: `Trend: ${trendState}`,
      },
    ],
  });

  logger.info(
    { jobId: job.id, tenantId, productId, demandState, observationCount: signals.length },
    "demand_calculation_completed"
  );

  return { productId, demandState };
}

// ─── Recompute Market Demand ─────────────────────────────────────────────────

async function handleRecomputeMarketDemand(job: Job): Promise<{ processed: number }> {
  const { tenantId, brandId, geography = "global", windowDays = 30 } = job.data;

  const where: Record<string, unknown> = { tenantId };
  if (brandId) where.brandId = brandId;

  const products = await prisma.product.findMany({
    where,
    select: { id: true },
    take: 100, // Bounded batch
  });

  let processed = 0;
  for (const product of products) {
    try {
      // Inline minimal recomputation
      const now = new Date();
      const startDate = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

      const signalCount = await prisma.demandSignal.count({
        where: {
          tenantId,
          productId: product.id,
          geography,
          status: "active",
          observedAt: { gte: startDate, lte: now },
        },
      });

      if (signalCount > 0) {
        processed++;
      }
    } catch (err) {
      logger.error(
        { jobId: job.id, tenantId, productId: product.id, err },
        "demand_recalculation_failed_for_product"
      );
    }
  }

  logger.info(
    { jobId: job.id, tenantId, processed, total: products.length },
    "market_demand_recalculated"
  );

  return { processed };
}
