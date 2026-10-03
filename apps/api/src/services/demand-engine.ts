// =============================================================================
// API — Demand Calculation Engine (Phase 7)
// =============================================================================
// Deterministic, versioned calculations for demand intelligence.
// All calculations are pure functions over time-series signal data.
// No AI, no heuristics — deterministic math with documented formulas.
// =============================================================================

import type { TrendState, AccelerationState, DemandState, DataSufficiency } from "@exosquad/common";

// ─── Time Series Point ───────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

// ─── Growth Calculation ──────────────────────────────────────────────────────
// Algorithm: demand-growth-v1
// Formula: (currentValue - baselineValue) / baselineValue
// Supports: absolute change, percentage change, rate of change

export interface GrowthResult {
  absoluteChange: number;
  percentageChange: number | null;
  rateOfChange: number | null; // per-day
  normalizedChange: number | null; // 0–1 scale
  baseline: { value: number; periodStart: Date; periodEnd: Date };
  current: { value: number; periodStart: Date; periodEnd: Date };
  formula: string;
  algorithm: string;
  algorithmVersion: string;
  observationCount: number;
  dataSufficiency: DataSufficiency;
}

export function calculateGrowth(
  baselinePoints: TimeSeriesPoint[],
  currentPoints: TimeSeriesPoint[]
): GrowthResult {
  const algorithm = "demand-growth";
  const algorithmVersion = "v1";

  if (baselinePoints.length === 0 || currentPoints.length === 0) {
    return {
      absoluteChange: 0,
      percentageChange: null,
      rateOfChange: null,
      normalizedChange: null,
      baseline: { value: 0, periodStart: new Date(0), periodEnd: new Date(0) },
      current: { value: 0, periodStart: new Date(0), periodEnd: new Date(0) },
      formula: "(current - baseline) / baseline",
      algorithm,
      algorithmVersion,
      observationCount: baselinePoints.length + currentPoints.length,
      dataSufficiency: "INSUFFICIENT",
    };
  }

  const baselineAvg = average(baselinePoints.map((p) => p.value));
  const currentAvg = average(currentPoints.map((p) => p.value));
  const absoluteChange = currentAvg - baselineAvg;
  const percentageChange = baselineAvg !== 0
    ? (absoluteChange / baselineAvg) * 100
    : null;

  // Rate of change: absolute change per day
  const baselineStart = earliest(baselinePoints);
  const currentEnd = latest(currentPoints);
  const totalDays = Math.max(1, (currentEnd.getTime() - baselineStart.getTime()) / (1000 * 60 * 60 * 24));
  const rateOfChange = absoluteChange / totalDays;

  // Normalized change: map to 0–1 using sigmoid-like function
  const normalizedChange = percentageChange !== null
    ? sigmoidNormalize(percentageChange, -100, 100)
    : null;

  let dataSufficiency: DataSufficiency = "SUFFICIENT";
  if (baselinePoints.length < 3 || currentPoints.length < 3) dataSufficiency = "LIMITED";
  if (baselinePoints.length < 2 || currentPoints.length < 2) dataSufficiency = "INSUFFICIENT";

  return {
    absoluteChange: round(absoluteChange),
    percentageChange: percentageChange !== null ? round(percentageChange) : null,
    rateOfChange: round(rateOfChange),
    normalizedChange: normalizedChange !== null ? round(normalizedChange) : null,
    baseline: {
      value: round(baselineAvg),
      periodStart: baselineStart,
      periodEnd: latest(baselinePoints),
    },
    current: {
      value: round(currentAvg),
      periodStart: earliest(currentPoints),
      periodEnd: currentEnd,
    },
    formula: "(currentAvg - baselineAvg) / baselineAvg",
    algorithm,
    algorithmVersion,
    observationCount: baselinePoints.length + currentPoints.length,
    dataSufficiency,
  };
}

// ─── Acceleration Calculation ────────────────────────────────────────────────
// Algorithm: acceleration-v1
// Measures whether the growth rate itself is changing.
// Requires at least 3 periods to compute.

export interface AccelerationResult {
  state: AccelerationState;
  periodGrowthRates: number[]; // growth rate per period
  accelerationValue: number | null; // change in growth rate
  formula: string;
  algorithm: string;
  algorithmVersion: string;
  observationCount: number;
  dataSufficiency: DataSufficiency;
}

export function calculateAcceleration(
  periodAverages: TimeSeriesPoint[] // one point per period, ordered chronologically
): AccelerationResult {
  const algorithm = "acceleration";
  const algorithmVersion = "v1";

  if (periodAverages.length < 3) {
    return {
      state: "INSUFFICIENT_DATA",
      periodGrowthRates: [],
      accelerationValue: null,
      formula: "delta(growthRate) between consecutive periods",
      algorithm,
      algorithmVersion,
      observationCount: periodAverages.length,
      dataSufficiency: periodAverages.length < 2 ? "INSUFFICIENT" : "LIMITED",
    };
  }

  // Calculate growth rate between consecutive periods
  const growthRates: number[] = [];
  for (let i = 1; i < periodAverages.length; i++) {
    const prev = periodAverages[i - 1]!.value;
    const curr = periodAverages[i]!.value;
    if (prev !== 0) {
      growthRates.push(((curr - prev) / Math.abs(prev)) * 100);
    } else {
      growthRates.push(curr > 0 ? 100 : 0);
    }
  }

  // Acceleration = change in growth rate between last two periods
  const lastGrowth = growthRates[growthRates.length - 1]!;
  const prevGrowth = growthRates[growthRates.length - 2]!;
  const accelerationValue = lastGrowth - prevGrowth;

  // Classify state
  const state = classifyAcceleration(growthRates, accelerationValue);

  let dataSufficiency: DataSufficiency = "SUFFICIENT";
  if (periodAverages.length < 5) dataSufficiency = "LIMITED";

  return {
    state,
    periodGrowthRates: growthRates.map(round),
    accelerationValue: round(accelerationValue),
    formula: "growthRate[i] - growthRate[i-1]",
    algorithm,
    algorithmVersion,
    observationCount: periodAverages.length,
    dataSufficiency,
  };
}

function classifyAcceleration(growthRates: number[], acceleration: number): AccelerationState {
  if (growthRates.length < 2) return "INSUFFICIENT_DATA";

  const avgGrowth = average(growthRates);
  const volatility = standardDeviation(growthRates);

  // High volatility = volatile
  if (volatility > 20) return "VOLATILE";

  // Negative growth trend
  if (avgGrowth < -5) {
    if (acceleration < -5) return "DECLINING";
    return "DECELERATING";
  }

  // Positive growth
  if (avgGrowth > 5) {
    if (acceleration > 5) return "ACCELERATING";
    return "GROWING_STEADILY";
  }

  return "STABLE";
}

// ─── Velocity Calculation ────────────────────────────────────────────────────
// Algorithm: velocity-v1
// Calculates rate of change per time unit (reviews/day, listings/week, etc.)

export interface VelocityResult {
  value: number; // units per day
  unit: string; // e.g., "reviews_per_day"
  period: { start: Date; end: Date };
  dailyVelocity: number;
  weeklyVelocity: number;
  monthlyVelocity: number;
  formula: string;
  algorithm: string;
  algorithmVersion: string;
  observationCount: number;
  dataSufficiency: DataSufficiency;
}

export function calculateVelocity(
  points: TimeSeriesPoint[],
  metricUnit: string = "units"
): VelocityResult {
  const algorithm = "velocity";
  const algorithmVersion = "v1";

  if (points.length < 2) {
    return {
      value: 0,
      unit: `${metricUnit}_per_day`,
      period: { start: new Date(0), end: new Date(0) },
      dailyVelocity: 0,
      weeklyVelocity: 0,
      monthlyVelocity: 0,
      formula: "delta(value) / delta(days)",
      algorithm,
      algorithmVersion,
      observationCount: points.length,
      dataSufficiency: "INSUFFICIENT",
    };
  }

  const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const days = Math.max(1, (last.timestamp.getTime() - first.timestamp.getTime()) / (1000 * 60 * 60 * 24));
  const totalChange = last.value - first.value;
  const dailyVelocity = totalChange / days;

  let dataSufficiency: DataSufficiency = "SUFFICIENT";
  if (points.length < 3) dataSufficiency = "LIMITED";
  if (points.length < 2) dataSufficiency = "INSUFFICIENT";

  return {
    value: round(dailyVelocity),
    unit: `${metricUnit}_per_day`,
    period: { start: first.timestamp, end: last.timestamp },
    dailyVelocity: round(dailyVelocity),
    weeklyVelocity: round(dailyVelocity * 7),
    monthlyVelocity: round(dailyVelocity * 30),
    formula: "(lastValue - firstValue) / totalDays",
    algorithm,
    algorithmVersion,
    observationCount: points.length,
    dataSufficiency,
  };
}

// ─── Trend Classification ────────────────────────────────────────────────────
// Algorithm: trend-classification-v1
// Deterministic classifier based on growth, acceleration, and volatility.

export interface TrendResult {
  trend: TrendState;
  strength: number; // 0–1
  direction: "up" | "down" | "flat" | "mixed";
  components: {
    growthRate: number | null;
    acceleration: number | null;
    volatility: number;
    consistency: number; // 0–1
  };
  formula: string;
  algorithm: string;
  algorithmVersion: string;
  observationCount: number;
  dataSufficiency: DataSufficiency;
}

export function classifyTrend(
  points: TimeSeriesPoint[],
  growthResult?: GrowthResult,
  accelerationResult?: AccelerationResult
): TrendResult {
  const algorithm = "trend-classification";
  const algorithmVersion = "v1";

  if (points.length < 3) {
    return {
      trend: "INSUFFICIENT_DATA",
      strength: 0,
      direction: "flat",
      components: { growthRate: null, acceleration: null, volatility: 0, consistency: 0 },
      formula: "composite(growth, acceleration, volatility, consistency)",
      algorithm,
      algorithmVersion,
      observationCount: points.length,
      dataSufficiency: "INSUFFICIENT",
    };
  }

  const values = points.map((p) => p.value);
  const volatility = coefficientOfVariation(values);
  const avgGrowth = growthResult?.percentageChange ?? null;
  const accel = accelerationResult?.accelerationValue ?? null;

  // Consistency: how often the direction is the same
  const directionChanges = countDirectionChanges(values);
  const consistency = 1 - (directionChanges / Math.max(1, values.length - 1));

  // Check for seasonality (requires more data)
  if (points.length >= 30 && detectSeasonalitySimple(values)) {
    return {
      trend: "SEASONAL",
      strength: round(consistency),
      direction: "mixed",
      components: {
        growthRate: avgGrowth,
        acceleration: accel,
        volatility: round(volatility),
        consistency: round(consistency),
      },
      formula: "composite(growth, acceleration, volatility, consistency)",
      algorithm,
      algorithmVersion,
      observationCount: points.length,
      dataSufficiency: "SUFFICIENT",
    };
  }

  // High volatility
  if (volatility > 50) {
    return {
      trend: "VOLATILE",
      strength: round(Math.min(1, volatility / 100)),
      direction: "mixed",
      components: {
        growthRate: avgGrowth,
        acceleration: accel,
        volatility: round(volatility),
        consistency: round(consistency),
      },
      formula: "composite(growth, acceleration, volatility, consistency)",
      algorithm,
      algorithmVersion,
      observationCount: points.length,
      dataSufficiency: points.length < 7 ? "LIMITED" : "SUFFICIENT",
    };
  }

  // Classify based on growth rate and consistency
  let trend: TrendState;
  let direction: "up" | "down" | "flat";

  if (avgGrowth === null) {
    trend = "INSUFFICIENT_DATA";
    direction = "flat";
  } else if (avgGrowth > 20 && consistency > 0.6) {
    trend = "STRONG_UPTREND";
    direction = "up";
  } else if (avgGrowth > 5) {
    trend = "UPTREND";
    direction = "up";
  } else if (avgGrowth < -20 && consistency > 0.6) {
    trend = "STRONG_DOWNTREND";
    direction = "down";
  } else if (avgGrowth < -5) {
    trend = "DOWNWARD";
    direction = "down";
  } else {
    trend = "STABLE";
    direction = "flat";
  }

  // Strength is based on consistency and magnitude of growth
  const growthMagnitude = avgGrowth !== null ? Math.min(100, Math.abs(avgGrowth)) / 100 : 0;
  const strength = round((growthMagnitude * 0.5 + consistency * 0.5));

  let dataSufficiency: DataSufficiency = "SUFFICIENT";
  if (points.length < 7) dataSufficiency = "LIMITED";
  if (points.length < 3) dataSufficiency = "INSUFFICIENT";

  return {
    trend,
    strength,
    direction,
    components: {
      growthRate: avgGrowth,
      acceleration: accel,
      volatility: round(volatility),
      consistency: round(consistency),
    },
    formula: "composite(growth, acceleration, volatility, consistency)",
    algorithm,
    algorithmVersion,
    observationCount: points.length,
    dataSufficiency,
  };
}

// ─── Momentum Calculation ────────────────────────────────────────────────────
// Algorithm: momentum-v1
// Composite of: recent growth, acceleration, activity velocity, review velocity,
// seller/listing growth, search growth, social activity.

export interface MomentumResult {
  score: number; // 0–100
  components: Record<string, { value: number; weight: number; contribution: number }>;
  confidence: number;
  formula: string;
  algorithm: string;
  algorithmVersion: string;
  observationCount: number;
  dataSufficiency: DataSufficiency;
}

export function calculateMomentum(
  componentScores: Record<string, { value: number; weight: number }>
): MomentumResult {
  const algorithm = "momentum";
  const algorithmVersion = "v1";

  const components: Record<string, { value: number; weight: number; contribution: number }> = {};
  let totalWeight = 0;
  let weightedSum = 0;
  let validComponents = 0;

  for (const [name, { value, weight }] of Object.entries(componentScores)) {
    // Clamp value to 0–100
    const clampedValue = Math.max(0, Math.min(100, value));
    const contribution = clampedValue * weight;
    components[name] = { value: round(clampedValue), weight, contribution: round(contribution) };
    totalWeight += weight;
    weightedSum += contribution;
    validComponents++;
  }

  const score = totalWeight > 0 ? round(weightedSum / totalWeight) : 0;
  const confidence = round(Math.min(1, validComponents / 4)); // Need at least 4 components for full confidence

  let dataSufficiency: DataSufficiency = "SUFFICIENT";
  if (validComponents < 2) dataSufficiency = "INSUFFICIENT";
  else if (validComponents < 4) dataSufficiency = "LIMITED";

  return {
    score,
    components,
    confidence,
    formula: "weightedAverage(componentScores)",
    algorithm,
    algorithmVersion,
    observationCount: validComponents,
    dataSufficiency,
  };
}

// ─── Seasonality Detection ───────────────────────────────────────────────────
// Algorithm: seasonality-v1
// Simple autocorrelation-based detection for recurring patterns.

export interface SeasonalityResult {
  isSeasonal: boolean;
  confidence: number;
  periodDays: number | null; // detected period in days
  method: string;
  formula: string;
  algorithm: string;
  algorithmVersion: string;
  observationCount: number;
  dataSufficiency: DataSufficiency;
}

export function detectSeasonality(
  points: TimeSeriesPoint[],
  minPeriodDays: number = 7
): SeasonalityResult {
  const algorithm = "seasonality";
  const algorithmVersion = "v1";

  if (points.length < 14) {
    return {
      isSeasonal: false,
      confidence: 0,
      periodDays: null,
      method: "autocorrelation",
      formula: "autocorrelation(values, lag)",
      algorithm,
      algorithmVersion,
      observationCount: points.length,
      dataSufficiency: "INSUFFICIENT",
    };
  }

  const values = points.map((p) => p.value);
  const mean = average(values);
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

  if (variance === 0) {
    return {
      isSeasonal: false,
      confidence: 1,
      periodDays: null,
      method: "autocorrelation",
      formula: "autocorrelation(values, lag)",
      algorithm,
      algorithmVersion,
      observationCount: points.length,
      dataSufficiency: "SUFFICIENT",
    };
  }

  // Autocorrelation for different lags
  let bestLag = 0;
  let bestCorrelation = 0;
  const maxLag = Math.floor(values.length / 2);

  for (let lag = minPeriodDays; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < values.length - lag; i++) {
      sum += (values[i]! - mean) * (values[i + lag]! - mean);
      count++;
    }
    const autocorr = sum / (count * variance);
    if (autocorr > bestCorrelation) {
      bestCorrelation = autocorr;
      bestLag = lag;
    }
  }

  const isSeasonal = bestCorrelation > 0.5;
  const confidence = round(Math.min(1, bestCorrelation));

  return {
    isSeasonal,
    confidence,
    periodDays: isSeasonal ? bestLag : null,
    method: "autocorrelation",
    formula: "autocorrelation(values, lag)",
    algorithm,
    algorithmVersion,
    observationCount: points.length,
    dataSufficiency: points.length < 30 ? "LIMITED" : "SUFFICIENT",
  };
}

// ─── Persistence Calculation ─────────────────────────────────────────────────
// Algorithm: persistence-v1
// Distinguishes short-lived spikes from sustained growth.

export interface PersistenceResult {
  state: "persistent" | "temporary" | "spike" | "unknown";
  durationDays: number;
  sustainedPeriods: number;
  totalPeriods: number;
  consistencyRatio: number; // 0–1
  formula: string;
  algorithm: string;
  algorithmVersion: string;
  observationCount: number;
  dataSufficiency: DataSufficiency;
}

export function calculatePersistence(
  points: TimeSeriesPoint[],
  direction: "up" | "down" = "up"
): PersistenceResult {
  const algorithm = "persistence";
  const algorithmVersion = "v1";

  if (points.length < 3) {
    return {
      state: "unknown",
      durationDays: 0,
      sustainedPeriods: 0,
      totalPeriods: points.length,
      consistencyRatio: 0,
      formula: "sustainedPeriods / totalPeriods",
      algorithm,
      algorithmVersion,
      observationCount: points.length,
      dataSufficiency: "INSUFFICIENT",
    };
  }

  const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let sustainedCount = 0;

  for (let i = 1; i < sorted.length; i++) {
    const change = sorted[i]!.value - sorted[i - 1]!.value;
    if (direction === "up" && change > 0) sustainedCount++;
    else if (direction === "down" && change < 0) sustainedCount++;
  }

  const totalPeriods = sorted.length - 1;
  const consistencyRatio = totalPeriods > 0 ? sustainedCount / totalPeriods : 0;

  const firstDate = sorted[0]!.timestamp;
  const lastDate = sorted[sorted.length - 1]!.timestamp;
  const durationDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

  let state: "persistent" | "temporary" | "spike" | "unknown";
  if (consistencyRatio >= 0.7 && durationDays >= 7) state = "persistent";
  else if (consistencyRatio >= 0.5) state = "temporary";
  else if (durationDays <= 2 && sustainedCount <= 1) state = "spike";
  else state = "temporary";

  return {
    state,
    durationDays: round(durationDays),
    sustainedPeriods: sustainedCount,
    totalPeriods,
    consistencyRatio: round(consistencyRatio),
    formula: "sustainedPeriods / totalPeriods",
    algorithm,
    algorithmVersion,
    observationCount: points.length,
    dataSufficiency: points.length < 7 ? "LIMITED" : "SUFFICIENT",
  };
}

// ─── Volatility Calculation ──────────────────────────────────────────────────
// Algorithm: volatility-v1
// Uses coefficient of variation and standard deviation.

export interface VolatilityResult {
  level: "low" | "moderate" | "high" | "unknown";
  coefficientOfVariation: number; // percentage
  standardDeviation: number;
  mean: number;
  method: string;
  formula: string;
  algorithm: string;
  algorithmVersion: string;
  observationCount: number;
  dataSufficiency: DataSufficiency;
}

export function calculateVolatility(points: TimeSeriesPoint[]): VolatilityResult {
  const algorithm = "volatility";
  const algorithmVersion = "v1";

  if (points.length < 3) {
    return {
      level: "unknown",
      coefficientOfVariation: 0,
      standardDeviation: 0,
      mean: 0,
      method: "coefficient_of_variation",
      formula: "stdDev / mean * 100",
      algorithm,
      algorithmVersion,
      observationCount: points.length,
      dataSufficiency: "INSUFFICIENT",
    };
  }

  const values = points.map((p) => p.value);
  const mean = average(values);
  const stdDev = standardDeviation(values);
  const cv = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0;

  let level: "low" | "moderate" | "high" | "unknown";
  if (cv < 15) level = "low";
  else if (cv < 40) level = "moderate";
  else level = "high";

  return {
    level,
    coefficientOfVariation: round(cv),
    standardDeviation: round(stdDev),
    mean: round(mean),
    method: "coefficient_of_variation",
    formula: "stdDev / mean * 100",
    algorithm,
    algorithmVersion,
    observationCount: points.length,
    dataSufficiency: points.length < 7 ? "LIMITED" : "SUFFICIENT",
  };
}

// ─── Data Sufficiency Assessment ─────────────────────────────────────────────

export function assessDataSufficiency(
  observationCount: number,
  sourceCount: number,
  latestObservedAt: Date | null,
  maxWindowDays: number = 30,
  now: Date = new Date()
): DataSufficiency {
  if (observationCount === 0) return "INSUFFICIENT";
  if (observationCount === 1) return "INSUFFICIENT";

  // Check freshness
  if (latestObservedAt) {
    const daysSinceLastObs = (now.getTime() - latestObservedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastObs > maxWindowDays * 2) return "STALE";
  }

  if (observationCount < 3) return "LIMITED";
  if (sourceCount < 1) return "LIMITED";
  if (observationCount < 7) return "LIMITED";

  return "SUFFICIENT";
}

// ─── Confidence Calculation ──────────────────────────────────────────────────
// Algorithm: confidence-v1
// Based on: observation count, source count, data quality, source reliability,
// cross-source agreement, freshness.

export interface ConfidenceResult {
  confidence: number; // 0–1
  factors: {
    observationFactor: number;
    sourceFactor: number;
    freshnessFactor: number;
    qualityFactor: number;
    reliabilityFactor: number;
  };
  formula: string;
  algorithm: string;
  algorithmVersion: string;
}

export function calculateConfidence(params: {
  observationCount: number;
  sourceCount: number;
  avgFreshness: string; // "fresh" | "aging" | "stale" | "unknown"
  qualityRatio: number; // ratio of valid observations (0–1)
  avgSourceReliability: number; // 0–1
}): ConfidenceResult {
  const algorithm = "confidence";
  const algorithmVersion = "v1";

  // Observation factor: more observations = higher confidence
  const observationFactor = Math.min(1, params.observationCount / 20);

  // Source factor: more sources = higher confidence
  const sourceFactor = Math.min(1, params.sourceCount / 5);

  // Freshness factor
  const freshnessMap: Record<string, number> = { fresh: 1.0, aging: 0.7, stale: 0.3, unknown: 0.2 };
  const freshnessFactor = freshnessMap[params.avgFreshness] ?? 0.2;

  // Quality factor
  const qualityFactor = params.qualityRatio;

  // Reliability factor
  const reliabilityFactor = params.avgSourceReliability;

  // Weighted combination
  const confidence = round(
    observationFactor * 0.2 +
    sourceFactor * 0.2 +
    freshnessFactor * 0.2 +
    qualityFactor * 0.2 +
    reliabilityFactor * 0.2
  );

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    factors: {
      observationFactor: round(observationFactor),
      sourceFactor: round(sourceFactor),
      freshnessFactor: round(freshnessFactor),
      qualityFactor: round(qualityFactor),
      reliabilityFactor: round(reliabilityFactor),
    },
    formula: "0.2*obs + 0.2*source + 0.2*freshness + 0.2*quality + 0.2*reliability",
    algorithm,
    algorithmVersion,
  };
}

// ─── Demand State Classification ─────────────────────────────────────────────
// Algorithm: demand-state-v1

export function classifyDemandState(
  trend: TrendState,
  growth: GrowthResult | null,
  persistence: PersistenceResult | null,
  observationCount: number
): DemandState {
  if (observationCount < 3) return "INSUFFICIENT_DATA";
  if (trend === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  if (trend === "SEASONAL") return "SEASONAL";
  if (trend === "VOLATILE") return "VOLATILE";

  // Check persistence
  if (persistence && persistence.state === "persistent") {
    if (trend === "STRONG_UPTREND" || trend === "UPTREND") return "GROWING";
    if (trend === "STRONG_DOWNTREND" || trend === "DOWNWARD") return "DECLINING";
    if (trend === "STABLE") return "ESTABLISHED";
  }

  // Short-lived or emerging
  if (trend === "STRONG_UPTREND" || trend === "UPTREND") {
    if (growth && growth.percentageChange !== null && growth.percentageChange > 50) return "EMERGING";
    return "GROWING";
  }

  if (trend === "STRONG_DOWNTREND" || trend === "DOWNWARD") return "DECLINING";
  if (trend === "STABLE") return "ESTABLISHED";

  return "STABLE";
}

// ─── Math Utilities ──────────────────────────────────────────────────────────

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  if (mean === 0) return 0;
  return (standardDeviation(values) / Math.abs(mean)) * 100;
}

function earliest(points: TimeSeriesPoint[]): Date {
  return points.reduce((min, p) => p.timestamp < min ? p.timestamp : min, points[0]!.timestamp);
}

function latest(points: TimeSeriesPoint[]): Date {
  return points.reduce((max, p) => p.timestamp > max ? p.timestamp : max, points[0]!.timestamp);
}

function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Sigmoid normalization: maps a value from [min, max] to [0, 1]. */
function sigmoidNormalize(value: number, min: number, max: number): number {
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

/** Count direction changes in a series. */
function countDirectionChanges(values: number[]): number {
  if (values.length < 3) return 0;
  let changes = 0;
  for (let i = 2; i < values.length; i++) {
    const prevDir = values[i - 1]! - values[i - 2]!;
    const currDir = values[i]! - values[i - 1]!;
    if ((prevDir > 0 && currDir < 0) || (prevDir < 0 && currDir > 0)) {
      changes++;
    }
  }
  return changes;
}

/** Simple seasonality check using autocorrelation. */
function detectSeasonalitySimple(values: number[]): boolean {
  if (values.length < 14) return false;
  const mean = average(values);
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  if (variance === 0) return false;

  // Check for weekly pattern (lag=7)
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length - 7; i++) {
    sum += (values[i]! - mean) * (values[i + 7]! - mean);
    count++;
  }
  const autocorr = sum / (count * variance);
  return autocorr > 0.5;
}
