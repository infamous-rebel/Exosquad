// =============================================================================
// API — Demand Intelligence Service (Phase 7)
// =============================================================================
// Orchestrates signal data retrieval and calculation engine to produce
// explainable demand intelligence with full provenance.
// Persists calculations and links them to input signals.
// =============================================================================

import { prisma, type Prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import type { DemandState, DataSufficiency } from "@exosquad/common";
import {
  calculateGrowth,
  calculateAcceleration,
  calculateVelocity,
  classifyTrend,
  calculateMomentum,
  detectSeasonality,
  calculatePersistence,
  calculateVolatility,
  calculateConfidence,
  assessDataSufficiency,
  classifyDemandState,
  type TimeSeriesPoint,
  type GrowthResult,
  type AccelerationResult,
  type VelocityResult,
  type TrendResult,
  type MomentumResult,
  type SeasonalityResult,
  type PersistenceResult,
  type VolatilityResult,
  type ConfidenceResult,
} from "./demand-engine.js";
import { getSignalTimeSeries } from "./demand-signals.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProductDemandResult {
  productId: string;
  demandState: DemandState;
  trend: TrendResult;
  growth: GrowthResult;
  acceleration: AccelerationResult;
  momentum: MomentumResult;
  persistence: PersistenceResult;
  volatility: VolatilityResult;
  seasonality: SeasonalityResult;
  confidence: ConfidenceResult;
  dataSufficiency: DataSufficiency;
  freshness: string;
  observationCount: number;
  sourceCount: number;
  timeWindow: { start: Date; end: Date; days: number };
  signalTypes: string[];
  calculationIds: string[];
}

export interface DemandHistoryResult {
  productId: string;
  signals: Array<{
    timestamp: Date;
    signalType: string;
    metric: string;
    value: number;
    unit: string | null;
    geography: string;
    quality: string;
    isOutlier: boolean;
  }>;
  calculations: Array<{
    type: string;
    timestamp: Date;
    result: unknown;
    confidence: number;
  }>;
}

export interface MarketDemandQuery {
  tenantId: string;
  productId?: string;
  brandId?: string;
  categoryId?: string;
  country?: string;
  geography?: string;
  signalType?: string;
  trend?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  dateStart?: Date;
  dateEnd?: Date;
  page?: number;
  limit?: number;
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

/** Compute full demand intelligence for a product. */
export async function computeProductDemand(params: {
  tenantId: string;
  productId: string;
  windowDays?: number;
  geography?: string;
}): Promise<ProductDemandResult> {
  const { tenantId, productId, windowDays = 30, geography = "global" } = params;
  const now = new Date();
  const startDate = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // 1. Fetch all active signals for this product within the window
  const signals = await getSignalTimeSeries({
    tenantId,
    productId,
    geography,
    startDate,
    endDate: now,
    excludeOutliers: true,
  });

  // 2. Group signals by metric for time-series analysis
  const metricGroups = groupSignalsByMetric(signals);

  // 3. Calculate per-metric growth using the primary metric (or first available)
  const primaryMetric = selectPrimaryMetric(metricGroups);
  const primaryPoints = primaryMetric
    ? metricGroups.get(primaryMetric)?.map((s) => ({ timestamp: s.observedAt, value: s.value })) ?? []
    : [] satisfies TimeSeriesPoint[];

  // 4. Growth: compare first half vs second half of window
  const growth = computeGrowthFromPoints(primaryPoints, windowDays);

  // 5. Acceleration: split into 3+ periods
  const acceleration = computeAccelerationFromPoints(primaryPoints);

  // 6. Velocity
  const velocity = primaryMetric
    ? calculateVelocity(primaryPoints, primaryMetric)
    : { value: 0, unit: "units_per_day", period: { start: now, end: now }, dailyVelocity: 0, weeklyVelocity: 0, monthlyVelocity: 0, formula: "", algorithm: "velocity", algorithmVersion: "v1", observationCount: 0, dataSufficiency: "INSUFFICIENT" as DataSufficiency };

  // 7. Trend classification
  const trend = classifyTrend(primaryPoints, growth, acceleration);

  // 8. Persistence
  const persistence = calculatePersistence(primaryPoints, trend.direction === "up" ? "up" : trend.direction === "down" ? "down" : "up");

  // 9. Volatility
  const volatility = calculateVolatility(primaryPoints);

  // 10. Seasonality (needs more data — use extended window)
  const extendedSignals = await getSignalTimeSeries({
    tenantId,
    productId,
    geography,
    startDate: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
    endDate: now,
    excludeOutliers: true,
  });
  const extendedPoints = primaryMetric
    ? extendedSignals.filter((s) => s.signalType === primaryMetric?.split("_")[0] || true)
      .map((s) => ({ timestamp: s.observedAt, value: s.value }))
    : [];
  const seasonality = detectSeasonality(extendedPoints);

  // 11. Momentum: composite of growth, velocity, and other signals
  const momentum = computeMomentumFromSignals(metricGroups, growth, acceleration, velocity);

  // 12. Confidence
  const uniqueSources = new Set(signals.map((s) => s.sourceId));
  const validCount = signals.filter((s) => s.dataQuality === "valid").length;
  const avgReliability = signals.length > 0
    ? signals.reduce((sum, s) => sum + s.sourceReliability, 0) / signals.length
    : 0;
  const freshest = signals.length > 0
    ? signals.reduce((latest, s) => s.observedAt > latest ? s.observedAt : latest, signals[0]!.observedAt)
    : null;
  const avgFreshness = computeAverageFreshness(signals);

  const confidence = calculateConfidence({
    observationCount: signals.length,
    sourceCount: uniqueSources.size,
    avgFreshness,
    qualityRatio: signals.length > 0 ? validCount / signals.length : 0,
    avgSourceReliability: avgReliability,
  });

  // 13. Data sufficiency
  const dataSufficiency = assessDataSufficiency(
    signals.length,
    uniqueSources.size,
    freshest,
    windowDays
  );

  // 14. Demand state
  const demandState = classifyDemandState(trend.trend, growth, persistence, signals.length);

  // 15. Persist calculations
  const calculationIds = await persistCalculations({
    tenantId,
    productId,
    geography,
    windowDays,
    signals,
    growth,
    acceleration,
    trend,
    momentum,
    persistence,
    volatility,
    seasonality,
    confidence,
    dataSufficiency,
    demandState,
  });

  const signalTypes = [...new Set(signals.map((s) => s.signalType))];

  return {
    productId,
    demandState,
    trend,
    growth,
    acceleration,
    momentum,
    persistence,
    volatility,
    seasonality,
    confidence,
    dataSufficiency,
    freshness: avgFreshness,
    observationCount: signals.length,
    sourceCount: uniqueSources.size,
    timeWindow: {
      start: startDate,
      end: now,
      days: windowDays,
    },
    signalTypes,
    calculationIds,
  };
}

/** Get demand history for a product. */
export async function getDemandHistory(params: {
  tenantId: string;
  productId: string;
  startDate: Date;
  endDate: Date;
  signalType?: string;
  metric?: string;
  geography?: string;
  productVariantId?: string;
}): Promise<DemandHistoryResult> {
  const signals = await getSignalTimeSeries({
    tenantId: params.tenantId,
    productId: params.productId,
    productVariantId: params.productVariantId,
    signalType: params.signalType,
    metric: params.metric,
    geography: params.geography,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  // Fetch persisted calculations for this product in the window
  const calculations = await prisma.demandCalculation.findMany({
    where: {
      tenantId: params.tenantId,
      productId: params.productId,
      status: "active",
      calculatedAt: { gte: params.startDate, lte: params.endDate },
    },
    orderBy: { calculatedAt: "desc" },
    take: 100,
  });

  return {
    productId: params.productId,
    signals: signals.map((s) => ({
      timestamp: s.observedAt,
      signalType: s.signalType,
      metric: s.metric,
      value: s.value,
      unit: s.unit,
      geography: s.geography,
      quality: s.dataQuality,
      isOutlier: s.isOutlier,
    })),
    calculations: calculations.map((c) => ({
      type: c.calculationType,
      timestamp: c.calculatedAt,
      result: c.result,
      confidence: c.confidence,
    })),
  };
}

/** Query market-level demand across products. */
export async function queryMarketDemand(input: MarketDemandQuery) {
  const { tenantId, page = 1, limit = 20 } = input;
  const filters = { ...input } as Record<string, unknown>;

  // Find demand calculations matching filters
  const where: Prisma.DemandCalculationWhereInput = {
    tenantId,
    calculationType: "trend_classification",
    status: "active",
  };

  if (filters.productId) where.productId = filters.productId as string;
  if (filters.brandId) where.brandId = filters.brandId as string;
  if (filters.geography) where.geography = filters.geography as string;
  if (filters.country) where.country = filters.country as string;
  if (filters.confidenceMin !== undefined || filters.confidenceMax !== undefined) {
    where.confidence = {};
    if (filters.confidenceMin !== undefined) where.confidence.gte = filters.confidenceMin as number;
    if (filters.confidenceMax !== undefined) where.confidence.lte = filters.confidenceMax as number;
  }
  if (filters.dateStart || filters.dateEnd) {
    where.calculatedAt = {};
    if (filters.dateStart) where.calculatedAt.gte = filters.dateStart as Date;
    if (filters.dateEnd) where.calculatedAt.lte = filters.dateEnd as Date;
  }

  const [data, total] = await Promise.all([
    prisma.demandCalculation.findMany({
      where,
      orderBy: { calculatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.demandCalculation.count({ where }),
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

/** Get demand calculation provenance for a product. */
export async function getDemandProvenance(params: {
  tenantId: string;
  productId: string;
  calculationType?: string;
}) {
  const where: Prisma.DemandCalculationWhereInput = {
    tenantId: params.tenantId,
    productId: params.productId,
    status: "active",
  };
  if (params.calculationType) where.calculationType = params.calculationType;

  const calculations = await prisma.demandCalculation.findMany({
    where,
    orderBy: { calculatedAt: "desc" },
    take: 50,
  });

  // For each calculation, trace back to input signals
  const provenance = await Promise.all(
    calculations.map(async (calc) => {
      const inputSignalIds = (calc.inputSignalIds as string[]) ?? [];
      const inputSignals = inputSignalIds.length > 0
        ? await prisma.demandSignal.findMany({
            where: { id: { in: inputSignalIds }, tenantId: params.tenantId },
            select: {
              id: true, signalType: true, metric: true, value: true,
              observedAt: true, sourceId: true, dataQuality: true,
              freshness: true, confidence: true,
            },
          })
        : [];

      return {
        calculation: {
          id: calc.id,
          type: calc.calculationType,
          algorithm: calc.algorithm,
          algorithmVersion: calc.algorithmVersion,
          result: calc.result,
          confidence: calc.confidence,
          calculatedAt: calc.calculatedAt,
          dataSufficiency: calc.dataSufficiency,
          observationCount: calc.observationCount,
          sourceCount: calc.sourceCount,
        },
        inputSignals: inputSignals.map((s) => ({
          id: s.id,
          signalType: s.signalType,
          metric: s.metric,
          value: s.value,
          observedAt: s.observedAt,
          sourceId: s.sourceId,
          dataQuality: s.dataQuality,
          freshness: s.freshness,
          confidence: s.confidence,
        })),
        provenanceChain: {
          metric: calc.calculationType,
          calculation: calc.algorithm,
          inputs: inputSignals.length,
          sources: new Set(inputSignals.map((s) => s.sourceId)).size,
        },
      };
    })
  );

  return { productId: params.productId, provenance };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function groupSignalsByMetric(
  signals: Array<{ signalType: string; metric: string; value: number; observedAt: Date }>
): Map<string, Array<{ signalType: string; metric: string; value: number; observedAt: Date }>> {
  const groups = new Map<string, Array<{ signalType: string; metric: string; value: number; observedAt: Date }>>();
  for (const s of signals) {
    const key = `${s.signalType}:${s.metric}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return groups;
}

function selectPrimaryMetric(
  groups: Map<string, Array<{ signalType: string; metric: string; value: number; observedAt: Date }>>
): string | null {
  // Priority order for primary metric
  const priorities = [
    "MARKETPLACE:listing_count",
    "MARKETPLACE:seller_count",
    "REVIEW_COUNT:review_count",
    "REVIEW_VELOCITY:reviews_per_day",
    "SEARCH:search_volume",
    "SOCIAL:mention_count",
    "PRODUCT_ACTIVITY:activity_count",
    "SELLER_COUNT:seller_count",
    "LISTING_COUNT:listing_count",
  ];

  for (const p of priorities) {
    if (groups.has(p) && groups.get(p)!.length > 0) return p;
  }

  // Fall back to first available metric with data
  for (const [key, values] of groups) {
    if (values.length > 0) return key;
  }

  return null;
}

function computeGrowthFromPoints(points: TimeSeriesPoint[], _windowDays: number): GrowthResult {
  if (points.length < 2) {
    return {
      absoluteChange: 0,
      percentageChange: null,
      rateOfChange: null,
      normalizedChange: null,
      baseline: { value: 0, periodStart: new Date(0), periodEnd: new Date(0) },
      current: { value: 0, periodStart: new Date(0), periodEnd: new Date(0) },
      formula: "(currentAvg - baselineAvg) / baselineAvg",
      algorithm: "demand-growth",
      algorithmVersion: "v1",
      observationCount: points.length,
      dataSufficiency: "INSUFFICIENT",
    };
  }

  const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const mid = Math.floor(sorted.length / 2);
  const baseline = sorted.slice(0, mid);
  const current = sorted.slice(mid);

  return calculateGrowth(baseline, current);
}

function computeAccelerationFromPoints(points: TimeSeriesPoint[]): AccelerationResult {
  if (points.length < 3) {
    return {
      state: "INSUFFICIENT_DATA",
      periodGrowthRates: [],
      accelerationValue: null,
      formula: "delta(growthRate) between consecutive periods",
      algorithm: "acceleration",
      algorithmVersion: "v1",
      observationCount: points.length,
      dataSufficiency: "INSUFFICIENT",
    };
  }

  const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Group into periods (roughly equal-sized buckets)
  const periodCount = Math.min(5, sorted.length);
  const bucketSize = Math.floor(sorted.length / periodCount);
  const periodPoints: TimeSeriesPoint[] = [];

  for (let i = 0; i < periodCount; i++) {
    const start = i * bucketSize;
    const end = i === periodCount - 1 ? sorted.length : (i + 1) * bucketSize;
    const bucket = sorted.slice(start, end);
    if (bucket.length > 0) {
      const avg = bucket.reduce((sum, p) => sum + p.value, 0) / bucket.length;
      periodPoints.push({ timestamp: bucket[Math.floor(bucket.length / 2)]!.timestamp, value: avg });
    }
  }

  return calculateAcceleration(periodPoints);
}

function computeMomentumFromSignals(
  metricGroups: Map<string, Array<{ signalType: string; metric: string; value: number; observedAt: Date }>>,
  growth: GrowthResult,
  acceleration: AccelerationResult,
  velocity: VelocityResult
): MomentumResult {
  const components: Record<string, { value: number; weight: number }> = {};

  // Growth component (0–100 based on percentage change)
  if (growth.percentageChange !== null) {
    components.growth = {
      value: Math.max(0, Math.min(100, 50 + growth.percentageChange)),
      weight: 0.3,
    };
  }

  // Acceleration component
  if (acceleration.accelerationValue !== null) {
    components.acceleration = {
      value: Math.max(0, Math.min(100, 50 + acceleration.accelerationValue * 2)),
      weight: 0.2,
    };
  }

  // Velocity component
  if (velocity.dailyVelocity !== 0) {
    components.velocity = {
      value: Math.max(0, Math.min(100, 50 + velocity.dailyVelocity * 10)),
      weight: 0.2,
    };
  }

  // Signal diversity component
  const signalTypeCount = metricGroups.size;
  if (signalTypeCount > 0) {
    components.signalDiversity = {
      value: Math.min(100, signalTypeCount * 20),
      weight: 0.15,
    };
  }

  // Data volume component
  const totalObs = Array.from(metricGroups.values()).reduce((sum, arr) => sum + arr.length, 0);
  if (totalObs > 0) {
    components.dataVolume = {
      value: Math.min(100, totalObs * 5),
      weight: 0.15,
    };
  }

  return calculateMomentum(components);
}

function computeAverageFreshness(
  signals: Array<{ freshness: string }>
): "fresh" | "aging" | "stale" | "unknown" {
  if (signals.length === 0) return "unknown";

  const counts = { fresh: 0, aging: 0, stale: 0, unknown: 0 };
  for (const s of signals) {
    const f = s.freshness as keyof typeof counts;
    if (f in counts) counts[f]++;
    else counts.unknown++;
  }

  // Return the most common freshness state
  const max = Math.max(counts.fresh, counts.aging, counts.stale, counts.unknown);
  if (max === counts.fresh) return "fresh";
  if (max === counts.aging) return "aging";
  if (max === counts.stale) return "stale";
  return "unknown";
}

async function persistCalculations(params: {
  tenantId: string;
  productId: string;
  geography: string;
  windowDays: number;
  signals: Array<{ id: string; sourceId: string; freshness: string }>;
  growth: GrowthResult;
  acceleration: AccelerationResult;
  trend: TrendResult;
  momentum: MomentumResult;
  persistence: PersistenceResult;
  volatility: VolatilityResult;
  seasonality: SeasonalityResult;
  confidence: ConfidenceResult;
  dataSufficiency: DataSufficiency;
  demandState: DemandState;
}): Promise<string[]> {
  const {
    tenantId, productId, geography, windowDays, signals,
    growth, acceleration, trend, momentum, persistence,
    volatility, seasonality, confidence, dataSufficiency, demandState,
  } = params;

  const inputSignalIds = signals.map((s) => s.id);
  const sourceIds = new Set(signals.map((s) => s.sourceId));
  const now = new Date();

  const calculations = [
    {
      calculationType: "current_demand",
      algorithm: "demand-state-v1",
      algorithmVersion: "v1",
      result: { demandState, confidence: confidence.confidence } as unknown as Prisma.InputJsonValue,
      resultSummary: `Demand state: ${demandState}`,
    },
    {
      calculationType: "demand_growth",
      algorithm: growth.algorithm,
      algorithmVersion: growth.algorithmVersion,
      result: growth as unknown as Prisma.InputJsonValue,
      resultSummary: growth.percentageChange !== null
        ? `Growth: ${growth.percentageChange}%`
        : "Growth: insufficient data",
    },
    {
      calculationType: "demand_acceleration",
      algorithm: acceleration.algorithm,
      algorithmVersion: acceleration.algorithmVersion,
      result: acceleration as unknown as Prisma.InputJsonValue,
      resultSummary: `Acceleration: ${acceleration.state}`,
    },
    {
      calculationType: "trend_classification",
      algorithm: trend.algorithm,
      algorithmVersion: trend.algorithmVersion,
      result: trend as unknown as Prisma.InputJsonValue,
      resultSummary: `Trend: ${trend.trend}`,
    },
    {
      calculationType: "momentum",
      algorithm: momentum.algorithm,
      algorithmVersion: momentum.algorithmVersion,
      result: momentum as unknown as Prisma.InputJsonValue,
      resultSummary: `Momentum score: ${momentum.score}`,
    },
    {
      calculationType: "persistence",
      algorithm: persistence.algorithm,
      algorithmVersion: persistence.algorithmVersion,
      result: persistence as unknown as Prisma.InputJsonValue,
      resultSummary: `Persistence: ${persistence.state}`,
    },
    {
      calculationType: "volatility",
      algorithm: volatility.algorithm,
      algorithmVersion: volatility.algorithmVersion,
      result: volatility as unknown as Prisma.InputJsonValue,
      resultSummary: `Volatility: ${volatility.level}`,
    },
    {
      calculationType: "seasonality",
      algorithm: seasonality.algorithm,
      algorithmVersion: seasonality.algorithmVersion,
      result: seasonality as unknown as Prisma.InputJsonValue,
      resultSummary: seasonality.isSeasonal
        ? `Seasonal (period: ${seasonality.periodDays} days)`
        : "Non-seasonal",
    },
  ];

  const ids: string[] = [];

  // Supersede previous calculations of same type for this product
  await prisma.demandCalculation.updateMany({
    where: {
      tenantId,
      productId,
      geography,
      windowDays,
      status: "active",
    },
    data: { status: "superseded" },
  });

  for (const calc of calculations) {
    const created = await prisma.demandCalculation.create({
      data: {
        tenantId,
        calculationType: calc.calculationType,
        algorithm: calc.algorithm,
        algorithmVersion: calc.algorithmVersion,
        entityType: "product",
        entityId: productId,
        productId,
        result: calc.result,
        resultSummary: calc.resultSummary,
        windowDays,
        geography,
        confidence: confidence.confidence,
        dataSufficiency,
        freshness: computeAverageFreshness(signals),
        observationCount: signals.length,
        sourceCount: sourceIds.size,
        periodStart: new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000),
        periodEnd: now,
        inputSignalIds,
        status: "active",
      },
    });
    ids.push(created.id);
  }

  logger.info(
    {
      tenantId,
      productId,
      calculationCount: ids.length,
      observationCount: signals.length,
      demandState,
    },
    "demand_calculation_completed"
  );

  return ids;
}
