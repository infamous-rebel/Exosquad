// =============================================================================
// API — Demand Signal Service (Phase 7)
// =============================================================================
// Manages normalized demand signal time-series data.
// Signals are NEVER overwritten — each record is a temporal observation.
// Provides deduplication, outlier detection, and data quality assessment.
// =============================================================================

import { prisma, type Prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { createHash } from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateDemandSignalInput {
  tenantId: string;
  productId?: string;
  productVariantId?: string;
  brandId?: string;
  sellerId?: string;
  sourceId: string;
  evidenceId?: string;
  signalType: string;
  metric: string;
  value: number;
  originalValue?: number;
  unit?: string;
  currency?: string;
  observedAt: Date;
  retrievedAt: Date;
  periodStart?: Date;
  periodEnd?: Date;
  granularity?: string;
  geography?: string;
  country?: string;
  marketplace?: string;
  confidence?: number;
  freshness?: string;
  observationStatus?: string;
  dataQuality?: string;
  sourceReliability?: number;
}

export interface QueryDemandSignalsInput {
  tenantId: string;
  productId?: string;
  productVariantId?: string;
  brandId?: string;
  sellerId?: string;
  sourceId?: string;
  signalType?: string;
  metric?: string;
  geography?: string;
  country?: string;
  marketplace?: string;
  granularity?: string;
  dataQuality?: string;
  freshness?: string;
  status?: string;
  observedAfter?: Date;
  observedBefore?: Date;
  periodStart?: Date;
  periodEnd?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ─── Content Hash ────────────────────────────────────────────────────────────

/** Compute SHA-256 content hash for signal deduplication. */
export function computeSignalContentHash(data: {
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

// ─── Freshness Calculation ───────────────────────────────────────────────────

/** Calculate freshness based on observation age and signal type. */
export function calculateSignalFreshness(
  observedAt: Date,
  signalType: string,
  now: Date = new Date()
): string {
  const ageHours = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60);

  // Different freshness thresholds by signal type
  const thresholds: Record<string, { fresh: number; aging: number }> = {
    MARKETPLACE: { fresh: 24, aging: 72 },
    SELLER_COUNT: { fresh: 24, aging: 72 },
    LISTING_COUNT: { fresh: 24, aging: 72 },
    REVIEW_COUNT: { fresh: 48, aging: 168 },
    REVIEW_VELOCITY: { fresh: 48, aging: 168 },
    PRICE: { fresh: 12, aging: 48 },
    PRICE_CHANGE: { fresh: 12, aging: 48 },
    AVAILABILITY: { fresh: 6, aging: 24 },
    STOCK: { fresh: 6, aging: 24 },
    SEARCH: { fresh: 168, aging: 720 },
    SOCIAL: { fresh: 48, aging: 168 },
    QUERY_VOLUME: { fresh: 168, aging: 720 },
    QUERY_GROWTH: { fresh: 168, aging: 720 },
    RANK: { fresh: 24, aging: 72 },
    RATING: { fresh: 168, aging: 720 },
    ENGAGEMENT: { fresh: 48, aging: 168 },
    MENTION: { fresh: 48, aging: 168 },
    PRODUCT_ACTIVITY: { fresh: 48, aging: 168 },
  };

  const t = thresholds[signalType] ?? { fresh: 48, aging: 168 };

  if (ageHours <= t.fresh) return "fresh";
  if (ageHours <= t.aging) return "aging";
  return "stale";
}

// ─── Outlier Detection ───────────────────────────────────────────────────────

/** Detect outliers using IQR method. Returns { isOutlier, score }. */
export function detectOutlierIQR(
  values: number[],
  newValue: number
): { isOutlier: boolean; score: number } {
  if (values.length < 4) return { isOutlier: false, score: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  if (newValue < lowerBound || newValue > upperBound) {
    const deviation = newValue < lowerBound
      ? (lowerBound - newValue) / (iqr || 1)
      : (newValue - upperBound) / (iqr || 1);
    return { isOutlier: true, score: Math.round(deviation * 100) / 100 };
  }

  return { isOutlier: false, score: 0 };
}

/** Detect outliers using z-score method. */
export function detectOutlierZScore(
  values: number[],
  newValue: number,
  threshold: number = 2.5
): { isOutlier: boolean; score: number } {
  if (values.length < 3) return { isOutlier: false, score: 0 };

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  );

  if (stdDev === 0) return { isOutlier: false, score: 0 };

  const zScore = Math.abs((newValue - mean) / stdDev);
  return {
    isOutlier: zScore > threshold,
    score: Math.round(zScore * 100) / 100,
  };
}

// ─── Signal CRUD ─────────────────────────────────────────────────────────────

/** Create a demand signal with deduplication. */
export async function createDemandSignal(
  input: CreateDemandSignalInput
): Promise<{ signal: { id: string; tenantId: string; signalType: string; metric: string; value: number }; created: boolean }> {
  const granularity = input.granularity ?? "day";
  const geography = input.geography ?? "global";
  const contentHash = computeSignalContentHash({
    signalType: input.signalType,
    metric: input.metric,
    value: input.value,
    observedAt: input.observedAt,
    granularity,
    geography,
    sourceId: input.sourceId,
  });

  // Check for duplicate
  const existing = await prisma.demandSignal.findUnique({
    where: {
      tenantId_sourceId_signalType_metric_observedAt_granularity_geography_contentHash: {
        tenantId: input.tenantId,
        sourceId: input.sourceId,
        signalType: input.signalType,
        metric: input.metric,
        observedAt: input.observedAt,
        granularity,
        geography,
        contentHash,
      },
    },
  });

  if (existing) {
    logger.debug(
      { signalId: existing.id, signalType: input.signalType, metric: input.metric },
      "Duplicate demand signal skipped"
    );
    return { signal: existing, created: false };
  }

  // Detect outliers against recent history for same product/metric
  let isOutlier = false;
  let outlierMethod: string | undefined;
  let outlierScore: number | undefined;

  if (input.productId) {
    const recentSignals = await prisma.demandSignal.findMany({
      where: {
        tenantId: input.tenantId,
        productId: input.productId,
        signalType: input.signalType,
        metric: input.metric,
        status: "active",
        dataQuality: "valid",
        isOutlier: false,
        observedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { value: true },
      orderBy: { observedAt: "desc" },
      take: 30,
    });

    if (recentSignals.length >= 4) {
      const values = recentSignals.map((s) => s.value);
      const iqrResult = detectOutlierIQR(values, input.value);
      if (iqrResult.isOutlier) {
        isOutlier = true;
        outlierMethod = "iqr";
        outlierScore = iqrResult.score;
      }
    }
  }

  const freshness = input.freshness ?? calculateSignalFreshness(input.observedAt, input.signalType);

  const signal = await prisma.demandSignal.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      productVariantId: input.productVariantId,
      brandId: input.brandId,
      sellerId: input.sellerId,
      sourceId: input.sourceId,
      evidenceId: input.evidenceId,
      signalType: input.signalType,
      metric: input.metric,
      value: input.value,
      originalValue: input.originalValue,
      unit: input.unit,
      currency: input.currency,
      observedAt: input.observedAt,
      retrievedAt: input.retrievedAt,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      granularity,
      geography,
      country: input.country,
      marketplace: input.marketplace,
      confidence: input.confidence ?? 0.5,
      freshness,
      observationStatus: input.observationStatus ?? "observed",
      dataQuality: isOutlier ? "suspect" : (input.dataQuality ?? "valid"),
      sourceReliability: input.sourceReliability ?? 0.5,
      contentHash,
      isOutlier,
      outlierMethod,
      outlierScore,
    },
  });

  logger.info(
    {
      signalId: signal.id,
      tenantId: signal.tenantId,
      productId: signal.productId,
      signalType: signal.signalType,
      metric: signal.metric,
      value: signal.value,
      isOutlier,
    },
    "demand_signal_ingested"
  );

  return { signal, created: true };
}

/** Query demand signals with filtering and pagination. */
export async function queryDemandSignals(input: QueryDemandSignalsInput) {
  const {
    tenantId, page = 1, limit = 20,
    sortBy = "observedAt", sortOrder = "desc",
    ...filters
  } = input;

  const where: Prisma.DemandSignalWhereInput = { tenantId };

  if (filters.productId) where.productId = filters.productId;
  if (filters.productVariantId) where.productVariantId = filters.productVariantId;
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.sellerId) where.sellerId = filters.sellerId;
  if (filters.sourceId) where.sourceId = filters.sourceId;
  if (filters.signalType) where.signalType = filters.signalType;
  if (filters.metric) where.metric = filters.metric;
  if (filters.geography) where.geography = filters.geography;
  if (filters.country) where.country = filters.country;
  if (filters.marketplace) where.marketplace = filters.marketplace;
  if (filters.granularity) where.granularity = filters.granularity;
  if (filters.dataQuality) where.dataQuality = filters.dataQuality;
  if (filters.freshness) where.freshness = filters.freshness;
  if (filters.status) where.status = filters.status;
  if (filters.observedAfter || filters.observedBefore) {
    where.observedAt = {};
    if (filters.observedAfter) where.observedAt.gte = filters.observedAfter;
    if (filters.observedBefore) where.observedAt.lte = filters.observedBefore;
  }

  const [data, total] = await Promise.all([
    prisma.demandSignal.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.demandSignal.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/** Get a single demand signal by ID. */
export async function getDemandSignalById(tenantId: string, id: string) {
  return prisma.demandSignal.findFirst({
    where: { id, tenantId },
  });
}

/** Get time-series data for a product/metric within a date range. */
export async function getSignalTimeSeries(params: {
  tenantId: string;
  productId?: string;
  productVariantId?: string;
  signalType?: string;
  metric?: string;
  geography?: string;
  country?: string;
  startDate: Date;
  endDate: Date;
  granularity?: string;
  excludeOutliers?: boolean;
}) {
  const where: Prisma.DemandSignalWhereInput = {
    tenantId: params.tenantId,
    observedAt: { gte: params.startDate, lte: params.endDate },
    status: "active",
  };

  if (params.productId) where.productId = params.productId;
  if (params.productVariantId) where.productVariantId = params.productVariantId;
  if (params.signalType) where.signalType = params.signalType;
  if (params.metric) where.metric = params.metric;
  if (params.geography) where.geography = params.geography;
  if (params.country) where.country = params.country;
  if (params.granularity) where.granularity = params.granularity;
  if (params.excludeOutliers) where.isOutlier = false;

  return prisma.demandSignal.findMany({
    where,
    orderBy: { observedAt: "asc" },
  });
}

/** Get distinct signal types and metrics available for a product. */
export async function getProductSignalSummary(tenantId: string, productId: string) {
  const signals = await prisma.demandSignal.groupBy({
    by: ["signalType", "metric"],
    where: { tenantId, productId, status: "active" },
    _count: { id: true },
    _min: { observedAt: true },
    _max: { observedAt: true },
  });

  return signals.map((s) => ({
    signalType: s.signalType,
    metric: s.metric,
    observationCount: s._count.id,
    firstObserved: s._min.observedAt,
    lastObserved: s._max.observedAt,
  }));
}
