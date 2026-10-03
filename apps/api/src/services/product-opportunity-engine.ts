// =============================================================================
// API — Product Opportunity, Competition & Reseller Viability Engine (Phase 12)
// =============================================================================
// Pure, deterministic calculation engine for product opportunity intelligence.
// Consumes demand signals, competition data, supply-chain intelligence,
// logistics data, and pricing data to produce opportunity assessments,
// competition analysis, viability dimensions, signals, risks, and market gaps.
//
// No AI, no heuristics — deterministic math with documented formulas.
// Same inputs → same outputs. Every value is explainable.
// No database side effects — this module is a pure function.
//
// Key invariants:
// - Unknown ≠ Zero: missing inputs propagate as null/UNKNOWN
// - Contradictions preserved: conflicting observations are not silently merged
// - Evidence-backed: no fabricated demand, competition, or pricing data
// - No hidden recommendations: exposes measurable dimensions, not BUY/WINNER
// - Opportunity ≠ Viability: independent dimensions
// =============================================================================

import { createHash } from "node:crypto";
import { PRODUCT_OPP_CONFIG } from "@exosquad/common";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface CompetitorObservationInput {
  id: string;
  tenantId: string;
  productId: string;
  competitorName: string | null;
  sourceType: string;
  market: string | null;
  country: string | null;
  sellingPrice: number | null;
  currency: string | null;
  priceBasis: string | null;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  observedAt: Date;
  contentHash: string;
}

export interface DemandInput {
  demandLevel: string | null; // HIGH | MODERATE | LOW | UNKNOWN | null
  demandMomentum: string; // ACCELERATING | GROWING | STABLE | DECLINING | VOLATILE | UNKNOWN
  searchGrowth: number | null;
  seasonality: number | null;
  trendStrength: number | null;
  observationCount: number;
  confidence: number;
  volatility: number | null;
}

export interface SupplyInput {
  supplierCount: number | null;
  supplierCountryCount: number | null;
  supplierPriceSpread: number | null;
  supplierReliability: number | null; // 0–1 or null = UNKNOWN
  supplyCompleteness: number; // 0–1
}

export interface LogisticsInput {
  routeCount: number | null;
  availableModes: string[];
  routeReliability: number | null; // 0–1 or null = UNKNOWN
  transitTimeRange: { min: number | null; max: number | null } | null;
  transitTimeUncertainty: number | null;
  numberOfHops: number | null;
  logisticsRiskCount: number;
}

export interface PricingInput {
  unitLandedCost: number | null;
  marketPriceMin: number | null;
  marketPriceMax: number | null;
  marketPriceMedian: number | null;
  grossMarginMin: number | null;
  grossMarginMax: number | null;
  grossMarginBase: number | null;
  priceVolatility: number | null;
  pricingRiskCount: number;
}

export interface OpportunityEngineInput {
  tenantId: string;
  productId: string;
  competitors: CompetitorObservationInput[];
  demand: DemandInput;
  supply: SupplyInput;
  logistics: LogisticsInput;
  pricing: PricingInput;
  /** Reference timestamp for staleness. Injected for determinism. */
  referenceDate: Date;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface CompetitionResult {
  competitionLevel: string; // VERY_LOW | LOW | MODERATE | HIGH | VERY_HIGH | UNKNOWN
  competitionScore: number; // 0–100
  competitorCount: number;
  uniqueCompetitorCount: number;
  activeCompetitorCount: number;
  priceRange: { min: number | null; max: number | null; median: number | null; spread: number | null };
  pricePressure: number | null; // 0–1
  marketConcentration: number | null; // HHI or null
  priceCompression: boolean;
  explanations: Explanation[];
}

export interface DemandSignalResult {
  score: number; // 0–100
  direction: string; // declining | stable | growing | rapidly_growing | unknown
  strength: number; // 0–1
  confidence: number; // 0–1
  demandLevel: string;
  demandMomentum: string;
  explanations: Explanation[];
}

export interface SupplySignalResult {
  score: number; // 0–100
  supplierCount: number | null;
  supplierDiversity: string; // HIGH | MODERATE | LOW | UNKNOWN
  supplierConcentration: string;
  supplyConfidence: number; // 0–1
  explanations: Explanation[];
}

export interface LogisticsSignalResult {
  score: number; // 0–100
  logisticsComplexity: string; // HIGH | MODERATE | LOW | UNKNOWN
  routeCount: number | null;
  transitTimeUncertainty: number | null;
  logisticsConfidence: number; // 0–1
  explanations: Explanation[];
}

export interface PricingSignalResult {
  score: number; // 0–100
  marginRange: { min: number | null; max: number | null; base: number | null };
  priceVolatility: number | null;
  pricingConfidence: number; // 0–1
  explanations: Explanation[];
}

export interface MarketGap {
  type: string; // UNDERSUPPLIED | PRICE_GAP | COMPETITION_GAP | AVAILABILITY_GAP | DEMAND_SUPPLY_GAP
  strength: number; // 0–1
  explanation: string;
}

export interface ViabilityConstraint {
  type: string;
  severity: string; // LOW | MODERATE | HIGH | CRITICAL
  value: number | null;
  explanation: string;
}

export interface OpportunitySignal {
  signalType: string;
  direction: string; // POSITIVE | NEGATIVE | NEUTRAL | UNKNOWN
  magnitude: number | null; // 0–1
  evidence: string;
}

export interface OpportunityRisk {
  riskType: string;
  severity: string; // LOW | MODERATE | HIGH | CRITICAL
  trigger: string;
  affectedDimension: string;
}

export interface Explanation {
  factor: string;
  impact: string; // positive | negative | neutral | unknown
  magnitude: number; // 0–1
  statement: string;
}

export interface ProductOpportunityResult {
  productId: string;
  opportunityLevel: string; // VERY_LOW | LOW | MODERATE | HIGH | VERY_HIGH
  opportunityScore: number; // 0–100
  demandSignal: DemandSignalResult;
  pricingSignal: PricingSignalResult;
  competitionSignal: CompetitionResult;
  supplySignal: SupplySignalResult;
  logisticsSignal: LogisticsSignalResult;
  confidence: number; // 0–1
  completeness: number; // 0–1
  marketGaps: MarketGap[];
  signals: OpportunitySignal[];
  risks: OpportunityRisk[];
  explanations: Explanation[];
  calculatedAt: Date;
}

export interface ResellerViabilityResult {
  viabilityLevel: string; // NOT_VIABLE | WEAK | CONDITIONAL | VIABLE | STRONG
  viabilityScore: number; // 0–100
  estimatedGrossMargin: number | null;
  estimatedMarginPercentage: number | null;
  capitalRequirement: number | null;
  inventoryRisk: number; // 0–1
  executionComplexity: number; // 0–1
  constraints: ViabilityConstraint[];
  explanations: Explanation[];
  confidence: number; // 0–1
}

export interface OpportunityContentHashes {
  competitorContentHash: string;
  competitionSnapshotHash: string;
  demandSnapshotHash: string;
  opportunityInputHash: string;
  opportunityContentHash: string;
  viabilityInputHash: string;
  viabilityContentHash: string;
}

// ─── Hash Helpers ────────────────────────────────────────────────────────────

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

// ─── Content Hash Functions ──────────────────────────────────────────────────

export function computeCompetitorContentHash(
  tenantId: string,
  productId: string,
  sourceType: string,
  sellingPrice: number | null,
  currency: string | null,
  priceBasis: string | null,
  market: string | null,
  country: string | null,
  observedAt: Date,
): string {
  const canonical = stableStringify({
    tenantId,
    productId,
    sourceType,
    sellingPrice: sellingPrice ?? null,
    currency: currency ?? null,
    priceBasis: priceBasis ?? null,
    market: market ?? null,
    country: country ?? null,
    observedAt: observedAt.toISOString(),
  });
  return sha256(canonical);
}

export function computeCompetitorSnapshotHash(
  tenantId: string,
  productId: string,
  observationCount: number,
  uniqueCompetitorCount: number,
  competitionLevel: string,
  snapshotDate: Date,
): string {
  const canonical = stableStringify({
    tenantId,
    productId,
    observationCount,
    uniqueCompetitorCount,
    competitionLevel,
    snapshotDate: snapshotDate.toISOString(),
  });
  return sha256(canonical);
}

export function computeDemandSnapshotHash(
  tenantId: string,
  productId: string,
  demandLevel: string | null,
  demandMomentum: string,
  observationCount: number,
  snapshotDate: Date,
): string {
  const canonical = stableStringify({
    tenantId,
    productId,
    demandLevel: demandLevel ?? null,
    demandMomentum,
    observationCount,
    snapshotDate: snapshotDate.toISOString(),
  });
  return sha256(canonical);
}

export function computeOpportunityInputHash(
  tenantId: string,
  productId: string,
  competitorCount: number,
  demandLevel: string | null,
  demandMomentum: string,
  supplierCount: number | null,
  unitLandedCost: number | null,
  marketPriceMedian: number | null,
): string {
  const canonical = stableStringify({
    tenantId,
    productId,
    competitorCount,
    demandLevel: demandLevel ?? null,
    demandMomentum,
    supplierCount: supplierCount ?? null,
    unitLandedCost: unitLandedCost ?? null,
    marketPriceMedian: marketPriceMedian ?? null,
  });
  return sha256(canonical);
}

export function computeOpportunityContentHash(
  tenantId: string,
  productId: string,
  opportunityScore: number,
  opportunityLevel: string,
  competitionLevel: string,
  confidence: number,
  signalCount: number,
  riskCount: number,
): string {
  const canonical = stableStringify({
    tenantId,
    productId,
    opportunityScore,
    opportunityLevel,
    competitionLevel,
    confidence,
    signalCount,
    riskCount,
  });
  return sha256(canonical);
}

export function computeViabilityInputHash(
  tenantId: string,
  productId: string,
  opportunityScore: number,
  grossMargin: number | null,
  constraintCount: number,
  logisticsComplexity: string,
): string {
  const canonical = stableStringify({
    tenantId,
    productId,
    opportunityScore,
    grossMargin: grossMargin ?? null,
    constraintCount,
    logisticsComplexity,
  });
  return sha256(canonical);
}

export function computeViabilityContentHash(
  tenantId: string,
  productId: string,
  viabilityScore: number,
  viabilityLevel: string,
  estimatedMargin: number | null,
  constraintCount: number,
  confidence: number,
): string {
  const canonical = stableStringify({
    tenantId,
    productId,
    viabilityScore,
    viabilityLevel,
    estimatedMargin: estimatedMargin ?? null,
    constraintCount,
    confidence,
  });
  return sha256(canonical);
}

// ─── Competition Analysis ────────────────────────────────────────────────────

export function normalizeCompetitorObservation(
  obs: CompetitorObservationInput,
): { normalizedPrice: number | null; comparable: boolean; issue: string | null } {
  if (obs.sellingPrice === null || obs.currency === null) {
    return { normalizedPrice: null, comparable: false, issue: "MISSING_PRICE_OR_CURRENCY" };
  }
  if (obs.sellingPrice < 0) {
    return { normalizedPrice: null, comparable: false, issue: "NEGATIVE_PRICE" };
  }
  return { normalizedPrice: obs.sellingPrice, comparable: true, issue: null };
}

export function compareCompetitors(
  competitors: CompetitorObservationInput[],
): { comparable: CompetitorObservationInput[]; incomparable: CompetitorObservationInput[] } {
  const comparable: CompetitorObservationInput[] = [];
  const incomparable: CompetitorObservationInput[] = [];
  for (const c of competitors) {
    const { comparable: isComparable } = normalizeCompetitorObservation(c);
    if (isComparable) {
      comparable.push(c);
    } else {
      incomparable.push(c);
    }
  }
  return { comparable, incomparable };
}

export function aggregateCompetition(
  competitors: CompetitorObservationInput[],
  referenceDate: Date,
): CompetitionResult {
  const explanations: Explanation[] = [];
  const staleThreshold = PRODUCT_OPP_CONFIG.staleCompetitorObservationThresholdDays;

  // Filter to non-stale observations
  const freshCompetitors = competitors.filter((c) => {
    const daysSinceObserved = (referenceDate.getTime() - c.observedAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceObserved <= staleThreshold;
  });

  const { comparable } = compareCompetitors(freshCompetitors);

  // Count unique competitors by name
  const uniqueNames = new Set(
    freshCompetitors.map((c) => c.competitorName ?? c.sourceType + ":" + (c.market ?? "unknown")),
  );
  const uniqueCompetitorCount = uniqueNames.size;

  // Count active (in-stock) competitors
  const activeCompetitorCount = freshCompetitors.filter(
    (c) => c.availability === null || c.availability === "IN_STOCK" || c.availability === "LIMITED",
  ).length;

  // Price statistics from comparable observations
  const prices = comparable
    .map((c) => c.sellingPrice)
    .filter((p): p is number => p !== null && p > 0)
    .sort((a, b) => a - b);

  let min: number | null = null;
  let max: number | null = null;
  let median: number | null = null;
  let spread: number | null = null;

  if (prices.length > 0) {
    min = prices[0] ?? null;
    max = prices[prices.length - 1] ?? null;
    if (prices.length % 2 === 0 && prices.length >= 2) {
      const midIdx = prices.length / 2;
      median = ((prices[midIdx - 1] ?? 0) + (prices[midIdx] ?? 0)) / 2;
    } else if (prices.length >= 1) {
      median = prices[Math.floor(prices.length / 2)] ?? null;
    }
    if (min !== null && max !== null && min > 0) {
      spread = (max - min) / min;
    }
  }

  // Competition level based on unique competitor count
  const thresholds = PRODUCT_OPP_CONFIG.competitionThresholds;
  let competitionLevel: string;
  let competitionScore: number;

  if (uniqueCompetitorCount === 0) {
    competitionLevel = "UNKNOWN";
    competitionScore = 0;
    explanations.push({
      factor: "competition",
      impact: "unknown",
      magnitude: 0,
      statement: "No competitor observations available.",
    });
  } else if (uniqueCompetitorCount <= thresholds.veryLowMaxCompetitors) {
    competitionLevel = "VERY_LOW";
    competitionScore = 15;
    explanations.push({
      factor: "competition",
      impact: "positive",
      magnitude: 0.85,
      statement: `Very low competition: ${uniqueCompetitorCount} unique competitor(s) observed.`,
    });
  } else if (uniqueCompetitorCount <= thresholds.lowMaxCompetitors) {
    competitionLevel = "LOW";
    competitionScore = 30;
    explanations.push({
      factor: "competition",
      impact: "positive",
      magnitude: 0.70,
      statement: `Low competition: ${uniqueCompetitorCount} unique competitors observed.`,
    });
  } else if (uniqueCompetitorCount <= thresholds.moderateMaxCompetitors) {
    competitionLevel = "MODERATE";
    competitionScore = 50;
    explanations.push({
      factor: "competition",
      impact: "neutral",
      magnitude: 0.50,
      statement: `Moderate competition: ${uniqueCompetitorCount} unique competitors observed.`,
    });
  } else if (uniqueCompetitorCount <= thresholds.highMaxCompetitors) {
    competitionLevel = "HIGH";
    competitionScore = 70;
    explanations.push({
      factor: "competition",
      impact: "negative",
      magnitude: 0.70,
      statement: `High competition: ${uniqueCompetitorCount} unique competitors observed.`,
    });
  } else {
    competitionLevel = "VERY_HIGH";
    competitionScore = 90;
    explanations.push({
      factor: "competition",
      impact: "negative",
      magnitude: 0.90,
      statement: `Very high competition: ${uniqueCompetitorCount} unique competitors observed.`,
    });
  }

  // Price pressure (0–1): higher = more pressure
  let pricePressure: number | null = null;
  if (spread !== null && prices.length >= 2) {
    // Narrower spread = more price pressure (competitors cluster)
    pricePressure = Math.max(0, Math.min(1, 1 - spread));
  }

  // Market concentration (simplified HHI proxy using equal market share)
  let marketConcentration: number | null = null;
  if (uniqueCompetitorCount > 0) {
    // With equal shares, HHI = 10000/n (simplified)
    marketConcentration = Math.round(10000 / uniqueCompetitorCount);
  }

  // Price compression detection
  const priceCompression = calculatePriceCompression(prices);

  return {
    competitionLevel,
    competitionScore,
    competitorCount: freshCompetitors.length,
    uniqueCompetitorCount,
    activeCompetitorCount,
    priceRange: { min, max, median, spread },
    pricePressure,
    marketConcentration,
    priceCompression,
    explanations,
  };
}

export function calculateCompetitionConcentration(
  competitorShares: number[],
): number | null {
  if (competitorShares.length === 0) return null;
  // HHI = sum of squared market shares (as percentages)
  const total = competitorShares.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const hhi = competitorShares.reduce((s, v) => {
    const sharePercent = (v / total) * 100;
    return s + sharePercent * sharePercent;
  }, 0);
  return Math.round(hhi);
}

// ─── Demand Analysis ─────────────────────────────────────────────────────────

export function analyzeDemandOpportunity(demand: DemandInput): DemandSignalResult {
  const explanations: Explanation[] = [];
  const { demandLevel, demandMomentum, observationCount, confidence } = demand;

  // Score based on demand level and momentum
  let score = 0;
  let direction = "unknown";
  let strength = 0;

  if (demandLevel === null || demandLevel === "UNKNOWN") {
    score = 0;
    direction = "unknown";
    strength = 0;
    explanations.push({
      factor: "demand",
      impact: "unknown",
      magnitude: 0,
      statement: "Demand level is unknown — insufficient evidence.",
    });
  } else {
    // Base score from demand level
    switch (demandLevel) {
      case "HIGH": score = 80; break;
      case "MODERATE": score = 50; break;
      case "LOW": score = 20; break;
      default: score = 0;
    }

    // Adjust for momentum
    const momentumThresholds = PRODUCT_OPP_CONFIG.demandMomentumThresholds;
    switch (demandMomentum) {
      case "ACCELERATING":
        score = Math.min(100, score + 20);
        direction = "rapidly_growing";
        strength = momentumThresholds.acceleratingMinGrowth;
        break;
      case "GROWING":
        score = Math.min(100, score + 10);
        direction = "growing";
        strength = momentumThresholds.growingMinGrowth;
        break;
      case "STABLE":
        direction = "stable";
        strength = 0;
        break;
      case "DECLINING":
        score = Math.max(0, score - 15);
        direction = "declining";
        strength = momentumThresholds.decliningMaxGrowth;
        break;
      case "VOLATILE":
        direction = "stable"; // volatile doesn't imply direction
        strength = 0;
        break;
      default:
        direction = "unknown";
        strength = 0;
    }

    // Adjust for search growth if available
    if (demand.searchGrowth !== null) {
      if (demand.searchGrowth > 0) {
        score = Math.min(100, score + Math.round(demand.searchGrowth * 10));
      } else {
        score = Math.max(0, score + Math.round(demand.searchGrowth * 10));
      }
    }

    explanations.push({
      factor: "demand",
      impact: score >= 50 ? "positive" : score >= 20 ? "neutral" : "negative",
      magnitude: score / 100,
      statement: `Demand is ${demandLevel.toLowerCase()} with ${demandMomentum.toLowerCase()} momentum (${observationCount} observations, confidence: ${(confidence * 100).toFixed(0)}%).`,
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    direction,
    strength: Math.max(0, Math.min(1, Math.abs(strength))),
    confidence,
    demandLevel: demandLevel ?? "UNKNOWN",
    demandMomentum,
    explanations,
  };
}

// ─── Supply Analysis ─────────────────────────────────────────────────────────

export function analyzeSupplyOpportunity(supply: SupplyInput): SupplySignalResult {
  const explanations: Explanation[] = [];
  const { supplierCount, supplierCountryCount, supplierReliability, supplyCompleteness } = supply;

  let score = 0;
  let supplierDiversity = "UNKNOWN";
  let supplierConcentration = "UNKNOWN";
  let supplyConfidence = supplyCompleteness;

  if (supplierCount === null || supplierCount === 0) {
    score = 0;
    explanations.push({
      factor: "supply",
      impact: "unknown",
      magnitude: 0,
      statement: "No supplier data available.",
    });
  } else {
    // Score based on supplier count
    if (supplierCount >= 5) score = 80;
    else if (supplierCount >= 3) score = 60;
    else if (supplierCount >= 2) score = 40;
    else score = 20;

    // Diversity
    if (supplierCountryCount !== null) {
      if (supplierCountryCount >= 3) supplierDiversity = "HIGH";
      else if (supplierCountryCount >= 2) supplierDiversity = "MODERATE";
      else supplierDiversity = "LOW";
    }

    // Concentration
    if (supplierCount >= PRODUCT_OPP_CONFIG.supplierConcentrationThresholds.diversifiedMinSuppliers) {
      supplierConcentration = "DIVERSIFIED";
    } else if (supplierCount >= 3) {
      supplierConcentration = "MODERATELY_CONCENTRATED";
    } else if (supplierCount >= 2) {
      supplierConcentration = "CONCENTRATED";
    } else {
      supplierConcentration = "HIGHLY_CONCENTRATED";
    }

    // Adjust for reliability
    if (supplierReliability !== null) {
      score = Math.round(score * (0.5 + supplierReliability * 0.5));
    }

    explanations.push({
      factor: "supply",
      impact: score >= 50 ? "positive" : "neutral",
      magnitude: score / 100,
      statement: `${supplierCount} supplier(s) available, diversity: ${supplierDiversity.toLowerCase()}, concentration: ${supplierConcentration.toLowerCase()}.`,
    });
  }

  return { score, supplierCount, supplierDiversity, supplierConcentration, supplyConfidence, explanations };
}

// ─── Logistics Analysis ──────────────────────────────────────────────────────

export function analyzeLogisticsOpportunity(logistics: LogisticsInput): LogisticsSignalResult {
  const explanations: Explanation[] = [];
  const { routeCount, numberOfHops, routeReliability, transitTimeUncertainty, logisticsRiskCount } = logistics;

  let score = 0;
  let logisticsComplexity = "UNKNOWN";
  let logisticsConfidence = 0.5; // default moderate

  if (routeCount === null || routeCount === 0) {
    score = 0;
    explanations.push({
      factor: "logistics",
      impact: "unknown",
      magnitude: 0,
      statement: "No logistics route data available.",
    });
  } else {
    // Base score from route availability
    score = Math.min(100, routeCount * 25);

    // Complexity from hops
    if (numberOfHops !== null) {
      if (numberOfHops >= PRODUCT_OPP_CONFIG.riskThresholds.highLogisticsComplexityMinHops) {
        logisticsComplexity = "HIGH";
        score = Math.max(0, score - 20);
      } else if (numberOfHops >= 3) {
        logisticsComplexity = "MODERATE";
        score = Math.max(0, score - 10);
      } else {
        logisticsComplexity = "LOW";
      }
    } else {
      logisticsComplexity = "UNKNOWN";
    }

    // Adjust for reliability
    if (routeReliability !== null) {
      logisticsConfidence = routeReliability;
    }

    // Reduce for risk count
    if (logisticsRiskCount > 0) {
      score = Math.max(0, score - logisticsRiskCount * 5);
    }

    explanations.push({
      factor: "logistics",
      impact: score >= 50 ? "positive" : "neutral",
      magnitude: score / 100,
      statement: `${routeCount} route(s) available, complexity: ${logisticsComplexity.toLowerCase()}, ${logisticsRiskCount} risk(s) detected.`,
    });
  }

  return { score, logisticsComplexity, routeCount, transitTimeUncertainty, logisticsConfidence, explanations };
}

// ─── Pricing Analysis ────────────────────────────────────────────────────────

export function analyzePricingOpportunity(pricing: PricingInput): PricingSignalResult {
  const explanations: Explanation[] = [];
  const { unitLandedCost, marketPriceMin, marketPriceMax, marketPriceMedian, grossMarginMin, grossMarginMax, grossMarginBase, priceVolatility } = pricing;

  let score = 0;
  let pricingConfidence = 0.5;

  // Margin facts are derived from known inputs only — never fabricated.
  // All values are fractions of price (e.g. 0.25 = 25% margin).
  let derivedMarginMin: number | null = grossMarginMin;
  let derivedMarginMax: number | null = grossMarginMax;
  let derivedMarginBase: number | null = grossMarginBase;

  if (unitLandedCost === null || (marketPriceMedian === null && marketPriceMin === null)) {
    score = 0;
    explanations.push({
      factor: "pricing",
      impact: "unknown",
      magnitude: 0,
      statement: "Insufficient pricing data for margin analysis.",
    });
  } else {
    const referencePrice = marketPriceMedian ?? marketPriceMin;
    if (referencePrice !== null && referencePrice > 0) {
      const margin = referencePrice - unitLandedCost;
      const marginPercent = margin / referencePrice;

      if (marginPercent >= 0.30) score = 90;
      else if (marginPercent >= 0.20) score = 70;
      else if (marginPercent >= 0.10) score = 50;
      else if (marginPercent >= 0) score = 30;
      else score = 10; // negative margin

      // Derive margin range from the known price points.
      if (derivedMarginBase === null) {
        derivedMarginBase = marginPercent;
      }
      if (derivedMarginMin === null && marketPriceMin !== null && marketPriceMin > 0) {
        derivedMarginMin = (marketPriceMin - unitLandedCost) / marketPriceMin;
      }
      if (derivedMarginMax === null && marketPriceMax !== null && marketPriceMax > 0) {
        derivedMarginMax = (marketPriceMax - unitLandedCost) / marketPriceMax;
      }

      explanations.push({
        factor: "pricing",
        impact: score >= 50 ? "positive" : "negative",
        magnitude: score / 100,
        statement: `Estimated margin: ${(marginPercent * 100).toFixed(1)}% (landed cost: ${unitLandedCost.toFixed(2)}, market price: ${referencePrice.toFixed(2)}).`,
      });
    }
  }

  // Reduce confidence for volatility
  if (priceVolatility !== null && priceVolatility > PRODUCT_OPP_CONFIG.riskThresholds.highPriceVolatility) {
    pricingConfidence *= 0.7;
  }

  // Reduce for risk count
  if (pricing.pricingRiskCount > 0) {
    pricingConfidence *= Math.max(0.5, 1 - pricing.pricingRiskCount * 0.1);
  }

  return {
    score,
    marginRange: { min: derivedMarginMin, max: derivedMarginMax, base: derivedMarginBase },
    priceVolatility,
    pricingConfidence,
    explanations,
  };
}

// ─── Market Saturation ───────────────────────────────────────────────────────

export function calculateMarketSaturation(
  uniqueCompetitorCount: number,
  activeListings: number,
  priceCompression: boolean,
  demandGrowth: number | null,
): { level: string; score: number } {
  const thresholds = PRODUCT_OPP_CONFIG.saturationThresholds;

  if (uniqueCompetitorCount === 0 && activeListings === 0) {
    return { level: "UNKNOWN", score: 0 };
  }

  let saturationScore = 0;

  // Competitor density component
  if (uniqueCompetitorCount <= thresholds.lowMaxCompetitorDensity) {
    saturationScore += 20;
  } else if (uniqueCompetitorCount <= thresholds.moderateMaxCompetitorDensity) {
    saturationScore += 40;
  } else if (uniqueCompetitorCount <= thresholds.highMaxCompetitorDensity) {
    saturationScore += 70;
  } else {
    saturationScore += 90;
  }

  // Price compression component
  if (priceCompression) {
    saturationScore += 20;
  }

  // Demand growth counter-signal (growing demand reduces saturation effect)
  if (demandGrowth !== null && demandGrowth > 0.10) {
    saturationScore = Math.max(0, saturationScore - 15);
  }

  saturationScore = Math.min(100, saturationScore);

  let level: string;
  if (saturationScore <= 25) level = "LOW";
  else if (saturationScore <= 50) level = "MODERATE";
  else if (saturationScore <= 75) level = "HIGH";
  else level = "VERY_HIGH";

  return { level, score: saturationScore };
}

// ─── Price Compression ───────────────────────────────────────────────────────

export function calculatePriceCompression(prices: number[]): boolean {
  const thresholds = PRODUCT_OPP_CONFIG.priceCompressionThresholds;
  if (prices.length < thresholds.minimumObservations) return false;

  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  if (mean <= 0) return false;

  const variance = prices.reduce((s, p) => s + (p - mean) * (p - mean), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation

  return cv < thresholds.narrowSpreadCV;
}

// ─── Supplier Diversification ────────────────────────────────────────────────

export function calculateSupplierDiversification(
  supplierCount: number | null,
  supplierCountryCount: number | null,
  supplierPriceSpread: number | null,
): { count: number | null; countryCount: number | null; priceSpread: number | null; concentration: string } {
  let concentration = "UNKNOWN";

  if (supplierCount !== null) {
    if (supplierCount >= PRODUCT_OPP_CONFIG.supplierConcentrationThresholds.diversifiedMinSuppliers) {
      concentration = "DIVERSIFIED";
    } else if (supplierCount >= 3) {
      concentration = "MODERATELY_CONCENTRATED";
    } else if (supplierCount >= 2) {
      concentration = "CONCENTRATED";
    } else {
      concentration = "HIGHLY_CONCENTRATED";
    }
  }

  return {
    count: supplierCount,
    countryCount: supplierCountryCount,
    priceSpread: supplierPriceSpread,
    concentration,
  };
}

// ─── Demand-Competition Matrix ───────────────────────────────────────────────

export function calculateDemandCompetitionMatrix(
  demandLevel: string,
  competitionLevel: string,
): { combination: string; interpretation: string } {
  const demandHigh = demandLevel === "HIGH" || demandLevel === "MODERATE";
  const demandLow = demandLevel === "LOW";
  const compLow = competitionLevel === "VERY_LOW" || competitionLevel === "LOW";
  const compHigh = competitionLevel === "HIGH" || competitionLevel === "VERY_HIGH";

  let combination: string;
  let interpretation: string;

  if (demandHigh && compLow) {
    combination = "HIGH_DEMAND_LOW_COMPETITION";
    interpretation = "Strong demand with limited competition — potential market gap.";
  } else if (demandHigh && compHigh) {
    combination = "HIGH_DEMAND_HIGH_COMPETITION";
    interpretation = "Strong demand but saturated market — differentiation required.";
  } else if (demandLow && compLow) {
    combination = "LOW_DEMAND_LOW_COMPETITION";
    interpretation = "Limited demand and few competitors — niche or emerging market.";
  } else if (demandLow && compHigh) {
    combination = "LOW_DEMAND_HIGH_COMPETITION";
    interpretation = "Weak demand with many competitors — challenging market position.";
  } else {
    combination = "UNKNOWN";
    interpretation = "Insufficient data to classify demand-competition relationship.";
  }

  return { combination, interpretation };
}

// ─── Signal Detection ────────────────────────────────────────────────────────

export function detectDemandSignals(demand: DemandInput): OpportunitySignal[] {
  const signals: OpportunitySignal[] = [];

  if (demand.demandMomentum === "ACCELERATING" || demand.demandMomentum === "GROWING") {
    signals.push({
      signalType: "STRONG_DEMAND_GROWTH",
      direction: "POSITIVE",
      magnitude: demand.confidence,
      evidence: `Demand is ${demand.demandMomentum.toLowerCase()} with ${demand.observationCount} observations.`,
    });
  }

  if (demand.demandLevel === "LOW" || demand.confidence < PRODUCT_OPP_CONFIG.riskThresholds.weakDemandConfidence) {
    signals.push({
      signalType: "WEAK_DEMAND",
      direction: "NEGATIVE",
      magnitude: 1 - demand.confidence,
      evidence: `Demand is ${demand.demandLevel?.toLowerCase() ?? "unknown"} with confidence ${(demand.confidence * 100).toFixed(0)}%.`,
    });
  }

  if (demand.demandMomentum === "DECLINING") {
    signals.push({
      signalType: "DEMAND_DECLINE",
      direction: "NEGATIVE",
      magnitude: 0.7,
      evidence: "Demand momentum is declining.",
    });
  }

  if (demand.demandMomentum === "VOLATILE" || (demand.volatility !== null && demand.volatility > PRODUCT_OPP_CONFIG.riskThresholds.highPriceVolatility)) {
    signals.push({
      signalType: "DEMAND_VOLATILITY",
      direction: "NEGATIVE",
      magnitude: demand.volatility ?? 0.5,
      evidence: "Demand shows high volatility.",
    });
  }

  if (demand.seasonality !== null && demand.seasonality > 0.5) {
    signals.push({
      signalType: "SEASONALITY_DETECTED",
      direction: "NEUTRAL",
      magnitude: demand.seasonality,
      evidence: `Seasonality detected: ${(demand.seasonality * 100).toFixed(0)}%.`,
    });
  }

  return signals;
}

export function detectCompetitionSignals(competition: CompetitionResult): OpportunitySignal[] {
  const signals: OpportunitySignal[] = [];

  if (competition.competitionLevel === "VERY_LOW" || competition.competitionLevel === "LOW") {
    signals.push({
      signalType: "LOW_COMPETITOR_DENSITY",
      direction: "POSITIVE",
      magnitude: competition.competitionLevel === "VERY_LOW" ? 0.9 : 0.7,
      evidence: `${competition.uniqueCompetitorCount} unique competitor(s) observed.`,
    });
  }

  if (competition.competitionLevel === "HIGH" || competition.competitionLevel === "VERY_HIGH") {
    signals.push({
      signalType: "HIGH_COMPETITION",
      direction: "NEGATIVE",
      magnitude: competition.competitionLevel === "VERY_HIGH" ? 0.9 : 0.7,
      evidence: `${competition.uniqueCompetitorCount} unique competitors — high competitive pressure.`,
    });
  }

  if (competition.priceCompression) {
    signals.push({
      signalType: "PRICE_COMPRESSION",
      direction: "NEGATIVE",
      magnitude: 0.7,
      evidence: "Competitor prices are tightly clustered — price compression detected.",
    });
  }

  if (competition.priceRange.spread !== null && competition.priceRange.spread > 0.5) {
    signals.push({
      signalType: "WIDE_PRICE_SPREAD",
      direction: "NEUTRAL",
      magnitude: Math.min(1, competition.priceRange.spread),
      evidence: `Price spread: ${(competition.priceRange.spread * 100).toFixed(0)}%.`,
    });
  }

  return signals;
}

export function detectSupplySignals(supply: SupplySignalResult): OpportunitySignal[] {
  const signals: OpportunitySignal[] = [];

  if (supply.supplierCount !== null && supply.supplierCount >= 3) {
    signals.push({
      signalType: "MULTIPLE_SUPPLIER_OPTIONS",
      direction: "POSITIVE",
      magnitude: Math.min(1, supply.supplierCount / 10),
      evidence: `${supply.supplierCount} supplier(s) available.`,
    });
  }

  if (supply.supplierConcentration === "HIGHLY_CONCENTRATED" || supply.supplierConcentration === "CONCENTRATED") {
    signals.push({
      signalType: "HIGH_SUPPLIER_CONCENTRATION",
      direction: "NEGATIVE",
      magnitude: supply.supplierConcentration === "HIGHLY_CONCENTRATED" ? 0.9 : 0.6,
      evidence: `Supplier concentration: ${supply.supplierConcentration.toLowerCase()}.`,
    });
  }

  if (supply.supplierDiversity === "HIGH") {
    signals.push({
      signalType: "SUPPLIER_DIVERSITY",
      direction: "POSITIVE",
      magnitude: 0.7,
      evidence: "High supplier geographic diversity.",
    });
  }

  return signals;
}

export function detectLogisticsSignals(logistics: LogisticsSignalResult): OpportunitySignal[] {
  const signals: OpportunitySignal[] = [];

  if (logistics.logisticsComplexity === "HIGH") {
    signals.push({
      signalType: "HIGH_LOGISTICS_COMPLEXITY",
      direction: "NEGATIVE",
      magnitude: 0.8,
      evidence: "Logistics route is complex with multiple hops.",
    });
  }

  if (logistics.transitTimeUncertainty !== null && logistics.transitTimeUncertainty > 0.5) {
    signals.push({
      signalType: "LOGISTICS_UNCERTAINTY",
      direction: "NEGATIVE",
      magnitude: logistics.transitTimeUncertainty,
      evidence: "High transit time uncertainty.",
    });
  }

  return signals;
}

export function detectPricingSignals(pricing: PricingSignalResult): OpportunitySignal[] {
  const signals: OpportunitySignal[] = [];

  if (pricing.marginRange.min !== null && pricing.marginRange.min < PRODUCT_OPP_CONFIG.riskThresholds.lowMarginThreshold) {
    signals.push({
      signalType: "LOW_MARGIN",
      direction: "NEGATIVE",
      magnitude: 0.8,
      evidence: `Minimum estimated margin: ${(pricing.marginRange.min * 100).toFixed(1)}%.`,
    });
  }

  if (pricing.marginRange.min !== null && pricing.marginRange.max !== null) {
    const range = pricing.marginRange.max - pricing.marginRange.min;
    if (range < PRODUCT_OPP_CONFIG.riskThresholds.narrowMarginRange) {
      signals.push({
        signalType: "NARROW_MARGIN_RANGE",
        direction: "NEGATIVE",
        magnitude: 0.6,
        evidence: `Margin range is narrow: ${((pricing.marginRange.max - pricing.marginRange.min) * 100).toFixed(1)}%.`,
      });
    }
  }

  if (pricing.priceVolatility !== null && pricing.priceVolatility > PRODUCT_OPP_CONFIG.riskThresholds.highPriceVolatility) {
    signals.push({
      signalType: "HIGH_PRICE_VOLATILITY",
      direction: "NEGATIVE",
      magnitude: pricing.priceVolatility,
      evidence: `Price volatility: ${(pricing.priceVolatility * 100).toFixed(0)}%.`,
    });
  }

  return signals;
}

export function detectDataQualitySignals(completeness: number): OpportunitySignal[] {
  const signals: OpportunitySignal[] = [];
  if (completeness < PRODUCT_OPP_CONFIG.riskThresholds.insufficientDataCompleteness) {
    signals.push({
      signalType: "LOW_DATA_COMPLETENESS",
      direction: "NEGATIVE",
      magnitude: 1 - completeness,
      evidence: `Data completeness is only ${(completeness * 100).toFixed(0)}%.`,
    });
  }
  return signals;
}

export function combineOpportunitySignals(
  demand: DemandInput,
  competition: CompetitionResult,
  supply: SupplySignalResult,
  logistics: LogisticsSignalResult,
  pricing: PricingSignalResult,
  completeness: number,
): OpportunitySignal[] {
  return [
    ...detectDemandSignals(demand),
    ...detectCompetitionSignals(competition),
    ...detectSupplySignals(supply),
    ...detectLogisticsSignals(logistics),
    ...detectPricingSignals(pricing),
    ...detectDataQualitySignals(completeness),
  ];
}

// ─── Risk Detection ──────────────────────────────────────────────────────────

export function detectOpportunityRisks(
  demand: DemandInput,
  competition: CompetitionResult,
  supply: SupplySignalResult,
  logistics: LogisticsSignalResult,
  pricing: PricingSignalResult,
  completeness: number,
  rawPricing?: PricingInput,
): OpportunityRisk[] {
  const risks: OpportunityRisk[] = [];

  // Demand risks
  if (demand.demandLevel === "LOW" || demand.confidence < PRODUCT_OPP_CONFIG.riskThresholds.weakDemandConfidence) {
    risks.push({
      riskType: "WEAK_DEMAND",
      severity: demand.confidence < 0.15 ? "CRITICAL" : "HIGH",
      trigger: `Demand confidence: ${(demand.confidence * 100).toFixed(0)}%`,
      affectedDimension: "DEMAND",
    });
  }
  if (demand.demandMomentum === "DECLINING") {
    risks.push({
      riskType: "DEMAND_DECLINE",
      severity: "HIGH",
      trigger: "Demand momentum is declining",
      affectedDimension: "DEMAND",
    });
  }

  // Competition risks
  if (competition.uniqueCompetitorCount >= PRODUCT_OPP_CONFIG.riskThresholds.highCompetitionMinCompetitors) {
    risks.push({
      riskType: "HIGH_COMPETITION",
      severity: competition.uniqueCompetitorCount >= 25 ? "CRITICAL" : "HIGH",
      trigger: `${competition.uniqueCompetitorCount} unique competitors`,
      affectedDimension: "COMPETITION",
    });
  }
  if (competition.priceCompression) {
    risks.push({
      riskType: "PRICE_COMPRESSION",
      severity: "MODERATE",
      trigger: "Competitor prices tightly clustered",
      affectedDimension: "COMPETITION",
    });
  }

  // Supply risks
  if (supply.supplierConcentration === "HIGHLY_CONCENTRATED") {
    risks.push({
      riskType: "SUPPLIER_CONCENTRATION",
      severity: "HIGH",
      trigger: "Single or no supplier options",
      affectedDimension: "SUPPLY",
    });
  }
  if (supply.supplierCount === null || supply.supplierCount === 0) {
    risks.push({
      riskType: "SUPPLY_UNCERTAINTY",
      severity: "HIGH",
      trigger: "No supplier data available",
      affectedDimension: "SUPPLY",
    });
  }

  // Logistics risks
  if (logistics.logisticsComplexity === "HIGH") {
    risks.push({
      riskType: "LOGISTICS_COMPLEXITY",
      severity: "MODERATE",
      trigger: "Complex logistics route with multiple hops",
      affectedDimension: "LOGISTICS",
    });
  }

  // Pricing risks
  if (pricing.marginRange.base !== null && pricing.marginRange.base < PRODUCT_OPP_CONFIG.riskThresholds.lowMarginThreshold) {
    risks.push({
      riskType: "LOW_MARGIN",
      severity: pricing.marginRange.base < 0 ? "CRITICAL" : "HIGH",
      trigger: `Base margin: ${(pricing.marginRange.base * 100).toFixed(1)}%`,
      affectedDimension: "PRICING",
    });
  }
  if (pricing.priceVolatility !== null && pricing.priceVolatility > PRODUCT_OPP_CONFIG.riskThresholds.highPriceVolatility) {
    risks.push({
      riskType: "HIGH_PRICE_VOLATILITY",
      severity: "MODERATE",
      trigger: `Price volatility: ${(pricing.priceVolatility * 100).toFixed(0)}%`,
      affectedDimension: "PRICING",
    });
  }
  // Landed cost exceeding the median market price is a distinct commercial
  // fact from low margin — it triggers independently when raw inputs are known.
  if (
    rawPricing &&
    rawPricing.unitLandedCost !== null &&
    rawPricing.marketPriceMedian !== null &&
    rawPricing.marketPriceMedian > 0 &&
    rawPricing.unitLandedCost > rawPricing.marketPriceMedian
  ) {
    risks.push({
      riskType: "HIGH_LANDED_COST",
      severity: "HIGH",
      trigger: `Unit landed cost ${rawPricing.unitLandedCost.toFixed(2)} exceeds median market price ${rawPricing.marketPriceMedian.toFixed(2)}`,
      affectedDimension: "PRICING",
    });
  }

  // Data risks
  if (completeness < PRODUCT_OPP_CONFIG.riskThresholds.insufficientDataCompleteness) {
    risks.push({
      riskType: "INSUFFICIENT_DATA",
      severity: completeness < 0.2 ? "CRITICAL" : "HIGH",
      trigger: `Data completeness: ${(completeness * 100).toFixed(0)}%`,
      affectedDimension: "DATA",
    });
  }

  // Seasonality risk
  if (demand.seasonality !== null && demand.seasonality > 0.6) {
    risks.push({
      riskType: "SEASONALITY_RISK",
      severity: "MODERATE",
      trigger: `High seasonality: ${(demand.seasonality * 100).toFixed(0)}%`,
      affectedDimension: "DEMAND",
    });
  }

  return risks;
}

// ─── Market Gap Detection ────────────────────────────────────────────────────

export function detectMarketGaps(
  demand: DemandInput,
  competition: CompetitionResult,
  supply: SupplySignalResult,
  pricing: PricingSignalResult,
): MarketGap[] {
  const gaps: MarketGap[] = [];

  const demandStrong = demand.demandLevel === "HIGH" || demand.demandLevel === "MODERATE";
  const competitionLow = competition.competitionLevel === "VERY_LOW" || competition.competitionLevel === "LOW";
  const supplyLimited = supply.supplierCount !== null && supply.supplierCount <= 2;
  const priceGapExists = pricing.marginRange.base !== null && pricing.marginRange.base > 0.20;

  // Low competition + strong demand
  if (demandStrong && competitionLow) {
    gaps.push({
      type: "COMPETITION_GAP",
      strength: 0.8,
      explanation: "Strong demand with low competition — market entry opportunity.",
    });
  }

  // Strong demand + limited supply
  if (demandStrong && supplyLimited) {
    gaps.push({
      type: "DEMAND_SUPPLY_GAP",
      strength: 0.7,
      explanation: "Strong demand with limited supplier availability — sourcing opportunity.",
    });
  }

  // Strong demand + poor availability
  if (demandStrong && competition.activeCompetitorCount <= 2) {
    gaps.push({
      type: "AVAILABILITY_GAP",
      strength: 0.75,
      explanation: "Strong demand with few active listings — availability gap.",
    });
  }

  // High margin opportunity
  if (priceGapExists && competitionLow) {
    gaps.push({
      type: "PRICE_GAP",
      strength: 0.65,
      explanation: "Good margin potential with low competition — price gap.",
    });
  }

  // Undersupplied market
  if (demandStrong && supplyLimited && competitionLow) {
    gaps.push({
      type: "UNDERSUPPLIED",
      strength: 0.9,
      explanation: "Market is undersupplied: strong demand, few competitors, limited suppliers.",
    });
  }

  return gaps;
}

// ─── Viability Constraints ───────────────────────────────────────────────────

export function detectViabilityConstraints(
  pricing: PricingSignalResult,
  supply: SupplyInput,
  logisticsResult: LogisticsSignalResult,
  competition: CompetitionResult,
  demand: DemandInput,
): ViabilityConstraint[] {
  const constraints: ViabilityConstraint[] = [];

  // Insufficient margin
  if (pricing.marginRange.base !== null && pricing.marginRange.base < PRODUCT_OPP_CONFIG.riskThresholds.lowMarginThreshold) {
    constraints.push({
      type: "INSUFFICIENT_MARGIN",
      severity: pricing.marginRange.base < 0 ? "CRITICAL" : "HIGH",
      value: pricing.marginRange.base,
      explanation: `Estimated margin ${(pricing.marginRange.base * 100).toFixed(1)}% is below threshold.`,
    });
  }

  // High competition
  if (competition.uniqueCompetitorCount >= PRODUCT_OPP_CONFIG.riskThresholds.highCompetitionMinCompetitors) {
    constraints.push({
      type: "HIGH_COMPETITION",
      severity: "MODERATE",
      value: competition.uniqueCompetitorCount,
      explanation: `${competition.uniqueCompetitorCount} competitors in market.`,
    });
  }

  // Weak demand
  if (demand.demandLevel === "LOW" || demand.demandMomentum === "DECLINING") {
    constraints.push({
      type: "WEAK_DEMAND",
      severity: demand.demandMomentum === "DECLINING" ? "HIGH" : "MODERATE",
      value: null,
      explanation: `Demand is ${demand.demandLevel?.toLowerCase() ?? "unknown"} with ${demand.demandMomentum.toLowerCase()} momentum.`,
    });
  }

  // Supplier uncertainty
  if (supply.supplierCount === null || supply.supplierCount === 0) {
    constraints.push({
      type: "SUPPLIER_UNCERTAINTY",
      severity: "HIGH",
      value: null,
      explanation: "No supplier data available.",
    });
  }

  // High logistics cost/complexity
  if (logisticsResult.logisticsComplexity === "HIGH") {
    constraints.push({
      type: "HIGH_LOGISTICS_COST",
      severity: "MODERATE",
      value: null,
      explanation: "Logistics route is complex — may increase costs.",
    });
  }

  // Insufficient evidence
  if (demand.observationCount < PRODUCT_OPP_CONFIG.minimumDemandObservations) {
    constraints.push({
      type: "INSUFFICIENT_EVIDENCE",
      severity: "MODERATE",
      value: demand.observationCount,
      explanation: `Only ${demand.observationCount} demand observation(s) — below minimum ${PRODUCT_OPP_CONFIG.minimumDemandObservations}.`,
    });
  }

  return constraints;
}

// ─── Completeness & Confidence ───────────────────────────────────────────────

export function calculateOpportunityCompleteness(
  demand: DemandInput,
  competitorCount: number,
  supply: SupplyInput,
  logistics: LogisticsInput,
  pricing: PricingInput,
): number {
  const weights = PRODUCT_OPP_CONFIG.completenessWeights;
  let completeness = 0;

  // Demand data
  if (demand.demandLevel !== null && demand.demandLevel !== "UNKNOWN") {
    completeness += weights.demandData * Math.min(1, demand.observationCount / PRODUCT_OPP_CONFIG.minimumDemandObservations);
  }

  // Competition data
  if (competitorCount > 0) {
    completeness += weights.competitionData * Math.min(1, competitorCount / PRODUCT_OPP_CONFIG.minimumCompetitorObservations);
  }

  // Supply data
  if (supply.supplierCount !== null && supply.supplierCount > 0) {
    completeness += weights.supplyData * supply.supplyCompleteness;
  }

  // Logistics data
  if (logistics.routeCount !== null && logistics.routeCount > 0) {
    completeness += weights.logisticsData;
  }

  // Pricing data
  if (pricing.unitLandedCost !== null) {
    completeness += weights.pricingData;
  }
  if (pricing.marketPriceMedian !== null) {
    completeness += weights.costData;
  }

  return Math.max(0, Math.min(1, completeness));
}

export function calculateOpportunityConfidence(
  demandConfidence: number,
  competitionConfidence: number,
  supplyConfidence: number,
  logisticsConfidence: number,
  pricingConfidence: number,
  completeness: number,
): number {
  const weights = PRODUCT_OPP_CONFIG.confidenceWeights;

  const confidence =
    demandConfidence * weights.demandEvidence +
    competitionConfidence * weights.competitionEvidence +
    supplyConfidence * weights.supplyEvidence +
    logisticsConfidence * weights.logisticsEvidence +
    pricingConfidence * weights.pricingEvidence +
    completeness * weights.dataCompleteness;

  return Math.max(0, Math.min(1, confidence));
}

// ─── Opportunity Score ───────────────────────────────────────────────────────

export function calculateOpportunityScore(
  demandScore: number | null,
  pricingScore: number | null,
  competitionScore: number | null,
  supplyScore: number | null,
  logisticsScore: number | null,
): number {
  const w = PRODUCT_OPP_CONFIG.opportunityWeights;

  // Renormalize over KNOWN dimensions only. Unknown dimensions are excluded
  // from the weighted mean — never treated as zero, never fabricated.
  // competitionScore is 0-100 where higher = more competition = less
  // opportunity, so it is inverted here.
  // Compliance and marketFit have no data source in V1 — they are excluded
  // entirely rather than fabricated at a neutral value.
  const dimensions: Array<[number | null, number]> = [
    [demandScore, w.demand],
    [pricingScore, w.margin],
    [competitionScore === null ? null : Math.max(0, 100 - competitionScore), w.competition],
    [supplyScore, w.supply],
    [logisticsScore, w.logistics],
  ];

  let weightedSum = 0;
  let weightTotal = 0;
  for (const [score, weight] of dimensions) {
    if (score !== null) {
      weightedSum += score * weight;
      weightTotal += weight;
    }
  }

  // No known dimensions at all — opportunity is genuinely UNKNOWN.
  if (weightTotal === 0) return 0;

  return Math.max(0, Math.min(100, Math.round(weightedSum / weightTotal)));
}

export function classifyOpportunityLevel(score: number): string {
  const t = PRODUCT_OPP_CONFIG.opportunityLevelThresholds;
  if (score <= t.veryLowMax) return "VERY_LOW";
  if (score <= t.lowMax) return "LOW";
  if (score <= t.moderateMax) return "MODERATE";
  if (score <= t.highMax) return "HIGH";
  return "VERY_HIGH";
}

// ─── Viability Score ─────────────────────────────────────────────────────────

export function calculateViabilityScore(
  opportunityScore: number,
  marginScore: number,
  constraintPenalty: number,
): number {
  // Viability is based on opportunity + margin - constraints
  const base = (opportunityScore * 0.4) + (marginScore * 0.4);
  const score = base - constraintPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function classifyViabilityLevel(score: number): string {
  const t = PRODUCT_OPP_CONFIG.viabilityLevelThresholds;
  if (score <= t.notViableMax) return "NOT_VIABLE";
  if (score <= t.weakMax) return "WEAK";
  if (score <= t.conditionalMax) return "CONDITIONAL";
  if (score <= t.viableMax) return "VIABLE";
  return "STRONG";
}

// ─── Main Engine Entry Point ─────────────────────────────────────────────────

export function runOpportunityEngine(input: OpportunityEngineInput): {
  opportunity: ProductOpportunityResult;
  viability: ResellerViabilityResult;
  hashes: OpportunityContentHashes;
} {
  const { tenantId, productId, competitors, demand, supply, logistics, pricing, referenceDate } = input;

  // 1. Competition analysis
  const competition = aggregateCompetition(competitors, referenceDate);

  // 2. Dimension analysis
  const demandResult = analyzeDemandOpportunity(demand);
  const supplyResult = analyzeSupplyOpportunity(supply);
  const logisticsResult = analyzeLogisticsOpportunity(logistics);
  const pricingResult = analyzePricingOpportunity(pricing);

  // 3. Completeness & confidence
  const completeness = calculateOpportunityCompleteness(
    demand, competitors.length, supply, logistics, pricing,
  );
  const confidence = calculateOpportunityConfidence(
    demand.confidence,
    competition.competitionLevel === "UNKNOWN" ? 0 : 0.7,
    supplyResult.supplyConfidence,
    logisticsResult.logisticsConfidence,
    pricingResult.pricingConfidence,
    completeness,
  );

  // 4. Signals & risks
  const signals = combineOpportunitySignals(demand, competition, supplyResult, logisticsResult, pricingResult, completeness);
  const risks = detectOpportunityRisks(demand, competition, supplyResult, logisticsResult, pricingResult, completeness, pricing);

  // 5. Market gaps
  const marketGaps = detectMarketGaps(demand, competition, supplyResult, pricingResult);

  // 6. Opportunity score — unknown dimensions pass null (excluded from the
  // weighted mean), never zero.
  const opportunityScore = calculateOpportunityScore(
    demand.demandLevel === null || demand.demandLevel === "UNKNOWN" ? null : demandResult.score,
    pricing.unitLandedCost === null && pricing.marketPriceMedian === null ? null : pricingResult.score,
    competition.competitionLevel === "UNKNOWN" ? null : competition.competitionScore,
    supply.supplierCount === null ? null : supplyResult.score,
    logistics.routeCount === null ? null : logisticsResult.score,
  );
  const opportunityLevel = classifyOpportunityLevel(opportunityScore);

  // 7. Combine explanations
  const allExplanations = [
    ...demandResult.explanations,
    ...competition.explanations,
    ...supplyResult.explanations,
    ...logisticsResult.explanations,
    ...pricingResult.explanations,
  ];

  // 8. Build opportunity result
  const opportunity: ProductOpportunityResult = {
    productId,
    opportunityLevel,
    opportunityScore,
    demandSignal: demandResult,
    pricingSignal: pricingResult,
    competitionSignal: competition,
    supplySignal: supplyResult,
    logisticsSignal: logisticsResult,
    confidence,
    completeness,
    marketGaps,
    signals,
    risks,
    explanations: allExplanations,
    calculatedAt: referenceDate,
  };

  // 9. Viability
  const constraints = detectViabilityConstraints(pricingResult, supply, logisticsResult, competition, demand);
  const constraintPenalty = constraints.reduce((sum, c) => {
    switch (c.severity) {
      case "CRITICAL": return sum + 20;
      case "HIGH": return sum + 12;
      case "MODERATE": return sum + 6;
      default: return sum + 2;
    }
  }, 0);

  const marginScore = pricingResult.score;
  const viabilityScore = calculateViabilityScore(opportunityScore, marginScore, constraintPenalty);
  const viabilityLevel = classifyViabilityLevel(viabilityScore);

  const estimatedGrossMargin = pricingResult.marginRange.base;
  // marginRange.base is already a fraction of price (e.g. 0.25 = 25%).
  const estimatedMarginPercentage = estimatedGrossMargin;

  const inventoryRisk = supply.supplierReliability !== null
    ? Math.max(0, Math.min(1, 1 - supply.supplierReliability))
    : 0.5; // UNKNOWN

  const executionComplexity = logisticsResult.logisticsComplexity === "HIGH" ? 0.8
    : logisticsResult.logisticsComplexity === "MODERATE" ? 0.5
    : logisticsResult.logisticsComplexity === "LOW" ? 0.2
    : 0.5; // UNKNOWN

  const viabilityExplanations: Explanation[] = [
    {
      factor: "viability",
      impact: viabilityScore >= 50 ? "positive" : "negative",
      magnitude: viabilityScore / 100,
      statement: `Viability score: ${viabilityScore}/100 (${viabilityLevel.toLowerCase()}). ${constraints.length} constraint(s) detected.`,
    },
  ];

  const viability: ResellerViabilityResult = {
    viabilityLevel,
    viabilityScore,
    estimatedGrossMargin,
    estimatedMarginPercentage,
    capitalRequirement: pricing.unitLandedCost !== null ? pricing.unitLandedCost : null,
    inventoryRisk,
    executionComplexity,
    constraints,
    explanations: viabilityExplanations,
    confidence,
  };

  // 10. Content hashes
  const hashes: OpportunityContentHashes = {
    competitorContentHash: computeCompetitorSnapshotHash(
      tenantId, productId, competitors.length,
      competition.uniqueCompetitorCount, competition.competitionLevel, referenceDate,
    ),
    competitionSnapshotHash: computeCompetitorSnapshotHash(
      tenantId, productId, competitors.length,
      competition.uniqueCompetitorCount, competition.competitionLevel, referenceDate,
    ),
    demandSnapshotHash: computeDemandSnapshotHash(
      tenantId, productId, demand.demandLevel, demand.demandMomentum,
      demand.observationCount, referenceDate,
    ),
    opportunityInputHash: computeOpportunityInputHash(
      tenantId, productId, competitors.length,
      demand.demandLevel, demand.demandMomentum,
      supply.supplierCount, pricing.unitLandedCost, pricing.marketPriceMedian,
    ),
    opportunityContentHash: computeOpportunityContentHash(
      tenantId, productId, opportunityScore, opportunityLevel,
      competition.competitionLevel, confidence, signals.length, risks.length,
    ),
    viabilityInputHash: computeViabilityInputHash(
      tenantId, productId, opportunityScore,
      estimatedGrossMargin, constraints.length, logisticsResult.logisticsComplexity,
    ),
    viabilityContentHash: computeViabilityContentHash(
      tenantId, productId, viabilityScore, viabilityLevel,
      estimatedGrossMargin, constraints.length, confidence,
    ),
  };

  return { opportunity, viability, hashes };
}
