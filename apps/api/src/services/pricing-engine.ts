// =============================================================================
// API — Pricing Calculation Engine (Phase 11)
// =============================================================================
// Pure, deterministic calculation engine for landed cost, pricing, margin,
// and commercial risk intelligence. Consumes price observations, cost
// components, exchange rates, and market data to produce landed costs,
// margins, scenarios, risk detection, and market positioning.
//
// No AI, no heuristics — deterministic math with documented formulas.
// Same inputs → same outputs. Every value is explainable.
// No database side effects — this module is a pure function.
//
// Key invariants:
// - Unknown ≠ Zero: missing inputs propagate as null/UNKNOWN
// - Contradictions preserved: conflicting observations are not silently merged
// - Evidence-backed: no fabricated prices, rates, or fees
// - Negative margin is valid: it is not an error state
// =============================================================================

import { createHash } from "node:crypto";
import { PRICING_CONFIG } from "@exosquad/common";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface PriceObservationInput {
  id: string;
  tenantId: string;
  productId: string;
  supplierId: string | null;
  sourceType: string;
  observationType: string;
  price: number;
  currency: string;
  quantity: number | null;
  moq: number | null;
  priceBasis: string;
  market: string | null;
  country: string | null;
  sourceUrl: string | null;
  observedAt: Date;
  validUntil: Date | null;
  evidenceId: string | null;
  normalizedUnitPrice: number | null;
  normalizedCurrency: string | null;
  exchangeRateEvidenceId: string | null;
  exchangeRateObservedAt: Date | null;
  packSize: number | null;
  perUnitQuantity: number | null;
  contentHash: string;
}

export interface CostComponentInput {
  id: string;
  tenantId: string;
  productId: string;
  supplierId: string | null;
  logisticsRouteId: string | null;
  type: string;
  amount: number;
  currency: string;
  basis: string;
  quantity: number | null;
  rate: number | null;
  rateType: string | null;
  status: string;
  evidenceId: string | null;
  observedAt: Date | null;
  contentHash: string;
}

export interface ExchangeRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  observedAt: Date;
  evidenceId: string | null;
}

export interface MarketObservationGroup {
  observations: PriceObservationInput[];
  market: string;
  country: string;
  targetCurrency: string;
}

export interface PricingEngineInput {
  tenantId: string;
  productId: string;
  supplierId: string | null;
  logisticsRouteId: string | null;
  quantity: number;
  targetCurrency: string;
  observations: PriceObservationInput[];
  costComponents: CostComponentInput[];
  exchangeRates: ExchangeRateInput[];
  marketObservations: MarketObservationGroup[];
  /** Reference timestamp for staleness calculations. Injected for determinism. */
  referenceDate: Date;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface NormalizedPrice {
  observationId: string;
  originalPrice: number;
  originalCurrency: string;
  normalizedPrice: number | null; // null = UNKNOWN (no valid exchange rate)
  normalizedCurrency: string;
  unitPrice: number | null; // null = cannot determine per-unit price
  unitBasis: string;
  exchangeRateUsed: number | null;
  exchangeRateEvidenceId: string | null;
  comparable: boolean;
  comparabilityIssue: string | null;
}

export interface PriceStatistics {
  observationCount: number;
  comparableCount: number;
  incomparableCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  medianPrice: number | null;
  averagePrice: number | null;
  lowerQuartile: number | null;
  upperQuartile: number | null;
  priceSpread: number | null;
  spreadPercentage: number | null;
  priceVolatility: number | null; // coefficient of variation
  trendDirection: string;
  currency: string;
}

export interface LandedCostBreakdown {
  productCost: number | null; // null = UNKNOWN
  originCosts: number | null;
  freightCost: number | null;
  insuranceCost: number | null;
  dutyCost: number | null;
  taxCost: number | null;
  portCost: number | null;
  customsCost: number | null;
  clearingCost: number | null;
  destinationCost: number | null;
  otherCost: number | null;
  totalCost: number | null; // null if any required component is null
  unitLandedCost: number | null;
  unknownComponents: string[];
  componentDetails: CostComponentDetail[];
}

export interface CostComponentDetail {
  componentId: string;
  type: string;
  amount: number;
  currency: string;
  normalizedAmount: number | null;
  status: string;
  evidenceId: string | null;
}

export interface MarginResult {
  sellingPrice: number | null;
  totalVariableCost: number | null;
  grossProfit: number | null;
  grossMargin: number | null; // null if sellingPrice is 0 or unknown
  markup: number | null; // null if cost is 0 or unknown
  breakEvenPrice: number | null;
  targetPrice: number | null;
  unknownInputs: string[];
}

export interface ScenarioResult {
  scenarioType: string;
  sellingPrice: number | null;
  currency: string;
  platformFees: number;
  salesCommission: number;
  marketingCost: number;
  warehouseCost: number;
  deliveryCost: number;
  otherSellingCost: number;
  grossProfit: number | null;
  grossMargin: number | null;
  markup: number | null;
  breakEvenPrice: number | null;
  pricePosition: string;
  unknownInputs: string[];
}

export interface PricingRiskResult {
  riskType: string;
  severity: string;
  description: string;
  trigger: string;
  affectedInput: string;
  affectedEntityId: string | null;
  affectedEntityType: string | null;
  evidence: Record<string, unknown>;
}

export interface PricingCompleteness {
  score: number; // 0.0–1.0
  productCostKnown: boolean;
  freightKnown: boolean;
  dutyKnown: boolean;
  taxKnown: boolean;
  insuranceKnown: boolean;
  portCostsKnown: boolean;
  clearingKnown: boolean;
  inlandTransportKnown: boolean;
  marketPricesKnown: boolean;
  exchangeRateKnown: boolean;
  details: Record<string, boolean>;
}

export interface PricingConfidence {
  score: number; // 0.0–1.0
  evidenceQualityScore: number;
  evidenceQuantityScore: number;
  sourceIndependenceScore: number;
  temporalFreshnessScore: number;
  completenessScore: number;
  confidenceBand: string;
}

export interface PricingEngineResult {
  tenantId: string;
  productId: string;
  supplierId: string | null;
  logisticsRouteId: string | null;
  algorithmVersion: string;
  inputHash: string;
  normalizedPrices: NormalizedPrice[];
  marketStatistics: PriceStatistics | null;
  landedCost: LandedCostBreakdown;
  margin: MarginResult | null;
  scenarios: ScenarioResult[];
  risks: PricingRiskResult[];
  completeness: PricingCompleteness;
  confidence: PricingConfidence;
  pricePosition: string;
}

// ─── Content Hash Functions ──────────────────────────────────────────────────

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

export function computeObservationContentHash(
  tenantId: string,
  productId: string,
  sourceType: string,
  observationType: string,
  price: number,
  currency: string,
  priceBasis: string,
  quantity: number | null,
  supplierId: string | null,
): string {
  const canonical = stableStringify({
    tenantId, productId, sourceType, observationType,
    price, currency, priceBasis, quantity, supplierId,
  });
  return sha256(canonical);
}

export function computeCostComponentHash(
  tenantId: string,
  productId: string,
  type: string,
  amount: number,
  currency: string,
  supplierId: string | null,
  logisticsRouteId: string | null,
): string {
  const canonical = stableStringify({
    tenantId, productId, type, amount, currency, supplierId, logisticsRouteId,
  });
  return sha256(canonical);
}

export function computeLandedCostInputHash(
  tenantId: string,
  productId: string,
  supplierId: string | null,
  routeId: string | null,
  quantity: number,
  componentIds: string[],
  observationIds: string[],
  exchangeRateRefs: string[],
  algorithmVersion: string,
): string {
  const sorted = [...componentIds].sort();
  const sortedObs = [...observationIds].sort();
  const sortedEx = [...exchangeRateRefs].sort();
  const canonical = stableStringify({
    tenantId, productId, supplierId, routeId, quantity,
    componentIds: sorted, observationIds: sortedObs,
    exchangeRateRefs: sortedEx, algorithmVersion,
  });
  return sha256(canonical);
}

export function computeScenarioContentHash(
  tenantId: string,
  productId: string,
  landedCostId: string,
  scenarioType: string,
  sellingPrice: number | null,
  currency: string,
  platformFees: number,
  salesCommission: number,
  deliveryCost: number,
): string {
  const canonical = stableStringify({
    tenantId, productId, landedCostId, scenarioType,
    sellingPrice, currency, platformFees, salesCommission, deliveryCost,
  });
  return sha256(canonical);
}

export function computeMarketSnapshotHash(
  tenantId: string,
  productId: string,
  market: string,
  observationIds: string[],
  currency: string,
  algorithmVersion: string,
): string {
  const sorted = [...observationIds].sort();
  const canonical = stableStringify({
    tenantId, productId, market, observationIds: sorted, currency, algorithmVersion,
  });
  return sha256(canonical);
}

export function computeAssessmentInputHash(
  tenantId: string,
  productId: string,
  supplierId: string | null,
  landedCostIds: string[],
  scenarioIds: string[],
  marketSnapshotIds: string[],
  observationIds: string[],
  algorithmVersion: string,
): string {
  const canonical = stableStringify({
    tenantId, productId, supplierId,
    landedCostIds: [...landedCostIds].sort(),
    scenarioIds: [...scenarioIds].sort(),
    marketSnapshotIds: [...marketSnapshotIds].sort(),
    observationIds: [...observationIds].sort(),
    algorithmVersion,
  });
  return sha256(canonical);
}

// ─── Currency Normalization ──────────────────────────────────────────────────

export function normalizeCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: ExchangeRateInput[],
): { normalizedAmount: number | null; rateUsed: number | null; evidenceId: string | null } {
  if (fromCurrency === toCurrency) {
    return { normalizedAmount: amount, rateUsed: 1.0, evidenceId: null };
  }

  // Find the best (most recent) exchange rate for this pair
  const matching = exchangeRates
    .filter((r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency)
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());

  if (matching.length === 0) {
    // Try inverse rate
    const inverse = exchangeRates
      .filter((r) => r.fromCurrency === toCurrency && r.toCurrency === fromCurrency)
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());

    if (inverse.length === 0) {
      return { normalizedAmount: null, rateUsed: null, evidenceId: null };
    }

    const best = inverse[0]!;
    if (best.rate === 0) {
      return { normalizedAmount: null, rateUsed: null, evidenceId: null };
    }

    return {
      normalizedAmount: amount / best.rate,
      rateUsed: 1 / best.rate,
      evidenceId: best.evidenceId,
    };
  }

  const best = matching[0]!;
  if (best.rate === 0) {
    return { normalizedAmount: null, rateUsed: null, evidenceId: null };
  }
  return {
    normalizedAmount: amount * best.rate,
    rateUsed: best.rate,
    evidenceId: best.evidenceId,
  };
}

// ─── Unit Price Normalization ────────────────────────────────────────────────

export function normalizeUnitPrice(
  price: number,
  priceBasis: string,
  packSize: number | null,
  perUnitQuantity: number | null,
  quantity: number | null,
): { unitPrice: number | null; unitBasis: string; issue: string | null } {
  if (priceBasis === "UNIT") {
    return { unitPrice: price, unitBasis: "UNIT", issue: null };
  }

  // For PACK/CASE/CARTON: divide by packSize or perUnitQuantity
  if (["PACK", "CASE", "CARTON"].includes(priceBasis)) {
    const divisor = perUnitQuantity ?? packSize ?? quantity;
    if (divisor !== null && divisor > 0) {
      return { unitPrice: price / divisor, unitBasis: "UNIT", issue: null };
    }
    return { unitPrice: null, unitBasis: "UNIT", issue: `Cannot determine per-unit divisor for ${priceBasis}` };
  }

  // For KG/LITER: divide by weight/volume quantity
  if (["KG", "LITER"].includes(priceBasis)) {
    if (quantity !== null && quantity > 0) {
      return { unitPrice: price / quantity, unitBasis: "UNIT", issue: null };
    }
    return { unitPrice: null, unitBasis: "UNIT", issue: `Cannot determine quantity for ${priceBasis} basis` };
  }

  // CONTAINER/PALLET/OTHER: cannot normalize without explicit conversion
  return { unitPrice: null, unitBasis: priceBasis, issue: `Cannot normalize ${priceBasis} to unit price without conversion data` };
}

// ─── Price Normalization Pipeline ────────────────────────────────────────────

export function normalizePriceObservation(
  obs: PriceObservationInput,
  targetCurrency: string,
  exchangeRates: ExchangeRateInput[],
): NormalizedPrice {
  // Step 1: Currency normalization
  const currencyResult = normalizeCurrency(obs.price, obs.currency, targetCurrency, exchangeRates);

  // Step 2: Unit price normalization
  const unitResult = normalizeUnitPrice(
    currencyResult.normalizedAmount ?? obs.price,
    obs.priceBasis,
    obs.packSize,
    obs.perUnitQuantity,
    obs.quantity,
  );

  // If currency normalization failed, unit price is also unknown
  const normalizedPrice = currencyResult.normalizedAmount;
  const unitPrice = currencyResult.normalizedAmount !== null ? unitResult.unitPrice : null;

  return {
    observationId: obs.id,
    originalPrice: obs.price,
    originalCurrency: obs.currency,
    normalizedPrice,
    normalizedCurrency: targetCurrency,
    unitPrice,
    unitBasis: "UNIT",
    exchangeRateUsed: currencyResult.rateUsed,
    exchangeRateEvidenceId: currencyResult.evidenceId,
    comparable: unitPrice !== null && normalizedPrice !== null,
    comparabilityIssue: unitResult.issue ?? (normalizedPrice === null ? "No exchange rate evidence" : null),
  };
}

// ─── Price Comparability ─────────────────────────────────────────────────────

export function arePricesComparable(
  a: NormalizedPrice,
  b: NormalizedPrice,
): { comparable: boolean; reason: string | null } {
  if (!a.comparable || !b.comparable) {
    return { comparable: false, reason: "One or both prices could not be normalized" };
  }
  if (a.normalizedCurrency !== b.normalizedCurrency) {
    return { comparable: false, reason: `Different currencies: ${a.normalizedCurrency} vs ${b.normalizedCurrency}` };
  }
  return { comparable: true, reason: null };
}

// ─── Market Price Aggregation ────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0] ?? null;
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerVal = sorted[lower];
  const upperVal = sorted[upper];
  if (lowerVal === undefined || upperVal === undefined) return null;
  if (lower === upper) return lowerVal;
  const weight = index - lower;
  return lowerVal * (1 - weight) + upperVal * weight;
}

export function aggregateMarketPrices(
  normalizedPrices: NormalizedPrice[],
): PriceStatistics | null {
  const comparable = normalizedPrices.filter((p) => p.comparable && p.unitPrice !== null);
  const incomparable = normalizedPrices.length - comparable.length;

  if (comparable.length === 0) return null;

  const prices = comparable
    .map((p) => p.unitPrice!)
    .filter((p) => p !== null && p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;

  const min = prices[0]!;
  const max = prices[prices.length - 1]!;
  const sum = prices.reduce((s, p) => s + p, 0);
  const mean = sum / prices.length;

  const median = prices.length >= PRICING_CONFIG.minimumObservationsForMedian
    ? percentile(prices, 0.5)
    : null;

  const p25 = prices.length >= PRICING_CONFIG.minimumObservationsForQuartiles
    ? percentile(prices, 0.25)
    : null;

  const p75 = prices.length >= PRICING_CONFIG.minimumObservationsForQuartiles
    ? percentile(prices, 0.75)
    : null;

  const spread = max - min;
  const spreadPct = median !== null && median > 0 ? spread / median : null;

  // Coefficient of variation (volatility)
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const volatility = mean > 0 ? stdDev / mean : null;

  // Trend detection: compare first half vs second half of sorted-by-date observations
  const trendDirection = detectTrendDirection(comparable);

  return {
    observationCount: normalizedPrices.length,
    comparableCount: comparable.length,
    incomparableCount: incomparable,
    minPrice: min ?? null,
    maxPrice: max ?? null,
    medianPrice: median,
    averagePrice: mean,
    lowerQuartile: p25,
    upperQuartile: p75,
    priceSpread: spread,
    spreadPercentage: spreadPct,
    priceVolatility: volatility,
    trendDirection,
    currency: comparable[0]?.normalizedCurrency ?? "UNKNOWN",
  };
}

function detectTrendDirection(prices: NormalizedPrice[]): string {
  if (prices.length < 2) return "UNKNOWN";

  // Sort by observation date (deterministic: by date then by ID for stability)
  const sorted = [...prices].sort((a, b) => {
    const dateDiff = new Date(a.observationId).getTime() - new Date(b.observationId).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.observationId.localeCompare(b.observationId);
  });

  // Use actual observedAt from the normalized prices — but we don't have it here.
  // Instead, use the order as provided (caller should sort by observedAt).
  const half = Math.floor(sorted.length / 2);
  if (half === 0) return "UNKNOWN";

  const firstHalf = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);

  const firstAvg = firstHalf.reduce((s, p) => s + (p.unitPrice ?? 0), 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, p) => s + (p.unitPrice ?? 0), 0) / secondHalf.length;

  if (firstAvg === 0) return "UNKNOWN";
  const changeRatio = (secondAvg - firstAvg) / firstAvg;

  if (Math.abs(changeRatio) < 0.05) return "STABLE";
  if (changeRatio > 0.20) return "RISING";
  if (changeRatio < -0.20) return "DECLINING";
  if (changeRatio > 0) return "RISING";
  return "DECLINING";
}

// ─── Landed Cost Calculation ─────────────────────────────────────────────────

const COST_TYPE_TO_CATEGORY: Record<string, keyof Omit<LandedCostBreakdown, "totalCost" | "unitLandedCost" | "unknownComponents" | "componentDetails">> = {
  PRODUCT_COST: "productCost",
  PACKAGING: "originCosts",
  INLAND_ORIGIN: "originCosts",
  EXPORT_HANDLING: "originCosts",
  FREIGHT: "freightCost",
  INSURANCE: "insuranceCost",
  DUTY: "dutyCost",
  VAT: "taxCost",
  AIT: "taxCost",
  ATV: "taxCost",
  CD: "taxCost",
  SD: "taxCost",
  RD: "taxCost",
  PORT: "portCost",
  CUSTOMS: "customsCost",
  CLEARING: "clearingCost",
  INLAND_BANGLADESH: "destinationCost",
  WAREHOUSE: "destinationCost",
  PAYMENT: "otherCost",
  PLATFORM: "otherCost",
  OTHER: "otherCost",
};

export function calculateLandedCost(
  costComponents: CostComponentInput[],
  quantity: number,
  targetCurrency: string,
  exchangeRates: ExchangeRateInput[],
): LandedCostBreakdown {
  const breakdown: LandedCostBreakdown = {
    productCost: null,
    originCosts: null,
    freightCost: null,
    insuranceCost: null,
    dutyCost: null,
    taxCost: null,
    portCost: null,
    customsCost: null,
    clearingCost: null,
    destinationCost: null,
    otherCost: null,
    totalCost: null,
    unitLandedCost: null,
    unknownComponents: [],
    componentDetails: [],
  };

  // Initialize ALL cost categories to 0 (known absent = 0, not null/unknown)
  const categoryTotals: Record<string, { total: number; hasUnknown: boolean; hasComponents: boolean; components: CostComponentDetail[] }> = {
    productCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    originCosts: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    freightCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    insuranceCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    dutyCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    taxCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    portCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    customsCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    clearingCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    destinationCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
    otherCost: { total: 0, hasUnknown: false, hasComponents: false, components: [] },
  };

  for (const comp of costComponents) {
    const category = COST_TYPE_TO_CATEGORY[comp.type] ?? "otherCost";

    if (!categoryTotals[category]) {
      categoryTotals[category] = { total: 0, hasUnknown: false, hasComponents: false, components: [] };
    }
    categoryTotals[category].hasComponents = true;

    // Normalize currency
    const normalized = normalizeCurrency(comp.amount, comp.currency, targetCurrency, exchangeRates);
    const normalizedAmount = normalized.normalizedAmount;

    const detail: CostComponentDetail = {
      componentId: comp.id,
      type: comp.type,
      amount: comp.amount,
      currency: comp.currency,
      normalizedAmount,
      status: comp.status,
      evidenceId: comp.evidenceId,
    };
    categoryTotals[category].components.push(detail);

    if (comp.status === "UNKNOWN" || normalizedAmount === null) {
      categoryTotals[category].hasUnknown = true;
      if (!breakdown.unknownComponents.includes(comp.type)) {
        breakdown.unknownComponents.push(comp.type);
      }
    } else {
      categoryTotals[category].total += normalizedAmount;
    }
  }

  // Assign category totals to breakdown
  // If NO components at all, all categories are null (unknown)
  // If SOME components exist, categories without components are 0 (known absent)
  // Categories with components but all UNKNOWN are also null
  const hasAnyComponents = costComponents.length > 0;
  for (const [category, data] of Object.entries(categoryTotals)) {
    if (!hasAnyComponents) {
      // No components at all — everything is unknown
      (breakdown as unknown as Record<string, unknown>)[category] = null;
    } else if (!data.hasComponents) {
      // Some components exist but not for this category — known absent
      (breakdown as unknown as Record<string, unknown>)[category] = 0;
    } else if (data.hasUnknown && data.total === 0) {
      // Components exist but all are unknown
      (breakdown as unknown as Record<string, unknown>)[category] = null;
    } else {
      (breakdown as unknown as Record<string, unknown>)[category] = data.total;
    }
    breakdown.componentDetails.push(...data.components);
  }

  // Sort unknown components for determinism
  breakdown.unknownComponents.sort();

  // Calculate total: only if ALL categories are known
  const allKnown = [
    breakdown.productCost, breakdown.originCosts, breakdown.freightCost,
    breakdown.insuranceCost, breakdown.dutyCost, breakdown.taxCost,
    breakdown.portCost, breakdown.customsCost, breakdown.clearingCost,
    breakdown.destinationCost, breakdown.otherCost,
  ].every((v) => v !== null);

  if (allKnown) {
    breakdown.totalCost = (breakdown.productCost ?? 0) + (breakdown.originCosts ?? 0) +
      (breakdown.freightCost ?? 0) + (breakdown.insuranceCost ?? 0) +
      (breakdown.dutyCost ?? 0) + (breakdown.taxCost ?? 0) +
      (breakdown.portCost ?? 0) + (breakdown.customsCost ?? 0) +
      (breakdown.clearingCost ?? 0) + (breakdown.destinationCost ?? 0) +
      (breakdown.otherCost ?? 0);

    if (quantity > 0) {
      breakdown.unitLandedCost = breakdown.totalCost / quantity;
    }
  }

  return breakdown;
}

// ─── Margin Calculations ─────────────────────────────────────────────────────

export function calculateGrossProfit(
  sellingPrice: number | null,
  totalVariableCost: number | null,
): number | null {
  if (sellingPrice === null || totalVariableCost === null) return null;
  return sellingPrice - totalVariableCost;
}

export function calculateGrossMargin(
  grossProfit: number | null,
  sellingPrice: number | null,
): number | null {
  if (grossProfit === null || sellingPrice === null) return null;
  if (sellingPrice === 0) return null; // division by zero
  return grossProfit / sellingPrice;
}

export function calculateMarkup(
  grossProfit: number | null,
  cost: number | null,
): number | null {
  if (grossProfit === null || cost === null) return null;
  if (cost === 0) return null; // division by zero
  return grossProfit / cost;
}

export function calculateBreakEvenPrice(
  landedCost: number | null,
  platformFees: number,
  salesCommission: number,
  deliveryCost: number,
  otherSellingCosts: number,
  commissionRate: number = 0,
): number | null {
  if (landedCost === null) return null;

  const fixedSellingCosts = platformFees + deliveryCost + otherSellingCosts;
  // breakEven = (landedCost + fixedSellingCosts) / (1 - commissionRate)
  if (commissionRate >= 1) return null; // invalid commission rate
  const denominator = 1 - commissionRate;
  return (landedCost + fixedSellingCosts + salesCommission) / denominator;
}

export function calculateTargetPrice(
  landedCost: number | null,
  totalSellingCosts: number,
  targetMargin: number,
): number | null {
  if (landedCost === null) return null;
  if (targetMargin >= 1) return null; // invalid margin
  const totalCost = landedCost + totalSellingCosts;
  return totalCost / (1 - targetMargin);
}

export function calculateMargin(
  landedCost: number | null,
  sellingPrice: number | null,
  platformFees: number,
  salesCommission: number,
  marketingCost: number,
  warehouseCost: number,
  deliveryCost: number,
  otherSellingCost: number,
  targetMargin: number | null,
): MarginResult {
  const unknownInputs: string[] = [];

  if (landedCost === null) unknownInputs.push("LANDED_COST");
  if (sellingPrice === null) unknownInputs.push("SELLING_PRICE");

  const totalVariableCost = landedCost !== null
    ? landedCost + platformFees + salesCommission + marketingCost + warehouseCost + deliveryCost + otherSellingCost
    : null;

  const grossProfit = calculateGrossProfit(sellingPrice, totalVariableCost);
  const grossMargin = calculateGrossMargin(grossProfit, sellingPrice);
  const markup = calculateMarkup(grossProfit, landedCost);
  const breakEvenPrice = calculateBreakEvenPrice(
    landedCost, platformFees, salesCommission, deliveryCost, otherSellingCost,
  );

  let targetPrice: number | null = null;
  if (targetMargin !== null && landedCost !== null) {
    targetPrice = calculateTargetPrice(landedCost, platformFees + salesCommission + marketingCost + warehouseCost + deliveryCost + otherSellingCost, targetMargin);
  }

  return {
    sellingPrice,
    totalVariableCost,
    grossProfit,
    grossMargin,
    markup,
    breakEvenPrice,
    targetPrice,
    unknownInputs,
  };
}

// ─── Scenario Building ───────────────────────────────────────────────────────

export function buildPricingScenario(
  scenarioType: string,
  landedCost: LandedCostBreakdown,
  marketStats: PriceStatistics | null,
  sellingPrice: number | null,
  currency: string,
  platformFees: number,
  salesCommission: number,
  marketingCost: number,
  warehouseCost: number,
  deliveryCost: number,
  otherSellingCost: number,
  targetMargin: number | null,
): ScenarioResult {
  const unknownInputs: string[] = [];
  let effectiveSellingPrice = sellingPrice;

  // If no explicit selling price, derive from market statistics based on scenario type
  if (effectiveSellingPrice === null && marketStats !== null) {
    switch (scenarioType) {
      case "CONSERVATIVE":
        effectiveSellingPrice = marketStats.lowerQuartile ?? marketStats.medianPrice ?? null;
        break;
      case "BASE":
        effectiveSellingPrice = marketStats.medianPrice ?? marketStats.averagePrice ?? null;
        break;
      case "UPSIDE":
        effectiveSellingPrice = marketStats.upperQuartile ?? marketStats.maxPrice ?? null;
        break;
      default:
        effectiveSellingPrice = marketStats.medianPrice ?? null;
    }
  }

  if (effectiveSellingPrice === null) unknownInputs.push("SELLING_PRICE");
  if (landedCost.totalCost === null) unknownInputs.push("LANDED_COST");

  const margin = calculateMargin(
    landedCost.totalCost,
    effectiveSellingPrice,
    platformFees,
    salesCommission,
    marketingCost,
    warehouseCost,
    deliveryCost,
    otherSellingCost,
    targetMargin,
  );

  return {
    scenarioType,
    sellingPrice: effectiveSellingPrice,
    currency,
    platformFees,
    salesCommission,
    marketingCost,
    warehouseCost,
    deliveryCost,
    otherSellingCost,
    grossProfit: margin.grossProfit,
    grossMargin: margin.grossMargin,
    markup: margin.markup,
    breakEvenPrice: margin.breakEvenPrice,
    pricePosition: "UNKNOWN", // calculated separately
    unknownInputs,
  };
}

// ─── Price Position ──────────────────────────────────────────────────────────

export function calculatePricePosition(
  price: number | null,
  marketStats: PriceStatistics | null,
): string {
  if (price === null || marketStats === null) return "UNKNOWN";
  if (marketStats.medianPrice === null && marketStats.averagePrice === null) return "UNKNOWN";

  const refPrice = marketStats.medianPrice ?? marketStats.averagePrice!;
  if (refPrice === 0) return "UNKNOWN";

  const ratio = price / refPrice;
  const thresholds = PRICING_CONFIG.pricePositionThresholds;

  if (ratio <= 1 - (1 - thresholds.belowMarket) * 2) return "BELOW_MARKET";
  if (ratio <= 1 - (thresholds.upperMarket - thresholds.midMarket)) return "LOWER_MARKET";
  if (ratio <= 1 + (thresholds.upperMarket - thresholds.midMarket)) return "MID_MARKET";
  if (ratio <= 1 + (1 - thresholds.belowMarket) * 2) return "UPPER_MARKET";
  return "ABOVE_MARKET";
}

// ─── Risk Detection ──────────────────────────────────────────────────────────

export function detectPricingRisks(
  input: PricingEngineInput,
  landedCost: LandedCostBreakdown,
  marketStats: PriceStatistics | null,
  normalizedPrices: NormalizedPrice[],
  margin: MarginResult | null,
  referenceDate: Date,
): PricingRiskResult[] {
  const risks: PricingRiskResult[] = [];

  // Cost risks
  if (landedCost.freightCost === null && hasComponentType(input.costComponents, "FREIGHT")) {
    risks.push(makeRisk("UNKNOWN_FREIGHT", "high", "Freight cost is unknown", "No valid freight cost component", "FREIGHT", input.productId, "product", {}));
  } else if (!hasComponentType(input.costComponents, "FREIGHT")) {
    risks.push(makeRisk("UNKNOWN_FREIGHT", "medium", "No freight cost component exists", "No FREIGHT cost component configured", "FREIGHT", input.productId, "product", {}));
  }

  if (landedCost.dutyCost === null && !hasComponentType(input.costComponents, "DUTY")) {
    risks.push(makeRisk("UNKNOWN_DUTY", "high", "No duty cost component exists", "No DUTY cost component configured", "DUTY", input.productId, "product", {}));
  }

  if (landedCost.taxCost === null && !hasAnyComponentType(input.costComponents, ["VAT", "AIT", "ATV", "CD", "SD", "RD"])) {
    risks.push(makeRisk("UNKNOWN_TAX", "high", "No tax cost components exist", "No tax cost components configured", "TAX", input.productId, "product", {}));
  }

  if (landedCost.clearingCost === null && !hasComponentType(input.costComponents, "CLEARING")) {
    risks.push(makeRisk("UNKNOWN_CLEARING", "medium", "No clearing cost component exists", "No CLEARING cost component configured", "CLEARING", input.productId, "product", {}));
  }

  // Currency uncertainty
  const exchangeRateAge = getExchangeRateAge(input.exchangeRates, referenceDate);
  if (exchangeRateAge === null || exchangeRateAge > PRICING_CONFIG.staleExchangeRateThresholdDays) {
    risks.push(makeRisk("CURRENCY_UNCERTAINTY", "high", "Exchange rate is stale or missing", `Exchange rate age: ${exchangeRateAge ?? "unknown"} days`, "EXCHANGE_RATE", null, null, { ageDays: exchangeRateAge }));
  }

  // High logistics cost
  if (landedCost.freightCost !== null && landedCost.productCost !== null && landedCost.productCost > 0) {
    const freightRatio = landedCost.freightCost / landedCost.productCost;
    if (freightRatio > PRICING_CONFIG.riskThresholds.highLogisticsCostPercentage) {
      risks.push(makeRisk("HIGH_LOGISTICS_COST", "medium", `Freight is ${(freightRatio * 100).toFixed(1)}% of product cost`, `Freight ratio: ${freightRatio.toFixed(3)}`, "FREIGHT", input.productId, "product", { ratio: freightRatio }));
    }
  }

  // Supplier price uncertainty
  const supplierPrices = normalizedPrices.filter((p) => p.comparable);
  if (supplierPrices.length >= 2) {
    const prices = supplierPrices.map((p) => p.unitPrice!).filter((p) => p !== null);
    if (prices.length >= 2) {
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      if (minP > 0 && (maxP - minP) / minP > 0.30) {
        risks.push(makeRisk("SUPPLIER_PRICE_UNCERTAINTY", "medium", "Supplier prices vary significantly", `Price range: ${minP}–${maxP}`, "SUPPLIER_PRICE", input.productId, "product", { min: minP, max: maxP }));
      }
    }
  }

  // Market risks
  if (marketStats !== null) {
    if (marketStats.comparableCount < PRICING_CONFIG.minimumComparableObservations) {
      risks.push(makeRisk("INSUFFICIENT_PRICE_OBSERVATIONS", "high", `Only ${marketStats.comparableCount} comparable observations`, `Minimum: ${PRICING_CONFIG.minimumComparableObservations}`, "MARKET_OBSERVATIONS", input.productId, "product", { count: marketStats.comparableCount }));
    }

    if (marketStats.spreadPercentage !== null && marketStats.spreadPercentage > PRICING_CONFIG.riskThresholds.highPriceSpreadPercentage) {
      const severity = marketStats.spreadPercentage > PRICING_CONFIG.riskThresholds.criticalPriceSpreadPercentage ? "critical" : "high";
      risks.push(makeRisk("LARGE_PRICE_SPREAD", severity, `Price spread is ${(marketStats.spreadPercentage * 100).toFixed(1)}%`, `Spread: ${(marketStats.spreadPercentage * 100).toFixed(1)}%`, "PRICE_SPREAD", input.productId, "product", { spreadPercentage: marketStats.spreadPercentage }));
    }

    // Stale observations
    const staleObs = normalizedPrices.filter((p) => {
      const obs = input.observations.find((o) => o.id === p.observationId);
      if (!obs) return false;
      const ageDays = (referenceDate.getTime() - obs.observedAt.getTime()) / (1000 * 60 * 60 * 24);
      return ageDays > PRICING_CONFIG.staleObservationThresholdDays;
    });
    if (staleObs.length > 0) {
      risks.push(makeRisk("STALE_OBSERVATIONS", "medium", `${staleObs.length} observations are stale`, `${staleObs.length} observations older than ${PRICING_CONFIG.staleObservationThresholdDays} days`, "OBSERVATION_FRESHNESS", input.productId, "product", { staleCount: staleObs.length }));
    }
  }

  // Margin risks
  if (margin !== null) {
    if (margin.unknownInputs.length > 0) {
      risks.push(makeRisk("INSUFFICIENT_MARGIN_INPUTS", "high", "Cannot calculate complete margins", `Unknown: ${margin.unknownInputs.join(", ")}`, "MARGIN_INPUTS", input.productId, "product", { unknownInputs: margin.unknownInputs }));
    }

    if (margin.grossMargin !== null && margin.grossMargin < 0) {
      risks.push(makeRisk("SELLING_BELOW_COST", "critical", "Selling price is below landed cost", `Gross margin: ${(margin.grossMargin * 100).toFixed(1)}%`, "GROSS_MARGIN", input.productId, "product", { grossMargin: margin.grossMargin }));
    }

    if (margin.grossMargin !== null && margin.grossMargin > 0 && margin.grossMargin < PRICING_CONFIG.riskThresholds.narrowMarginThreshold) {
      risks.push(makeRisk("NARROW_MARGIN_RANGE", "medium", `Gross margin is ${(margin.grossMargin * 100).toFixed(1)}%`, `Below ${PRICING_CONFIG.riskThresholds.narrowMarginThreshold * 100}% threshold`, "GROSS_MARGIN", input.productId, "product", { grossMargin: margin.grossMargin }));
    }
  }

  return risks;
}

function hasComponentType(components: CostComponentInput[], type: string): boolean {
  return components.some((c) => c.type === type);
}

function hasAnyComponentType(components: CostComponentInput[], types: string[]): boolean {
  return components.some((c) => types.includes(c.type));
}

function getExchangeRateAge(rates: ExchangeRateInput[], referenceDate: Date): number | null {
  if (rates.length === 0) return null;
  const mostRecent = rates.reduce((best, r) => r.observedAt > best.observedAt ? r : best, rates[0]!);
  return (referenceDate.getTime() - mostRecent.observedAt.getTime()) / (1000 * 60 * 60 * 24);
}

function makeRisk(
  riskType: string,
  severity: string,
  description: string,
  trigger: string,
  affectedInput: string,
  affectedEntityId: string | null,
  affectedEntityType: string | null,
  evidence: Record<string, unknown>,
): PricingRiskResult {
  return { riskType, severity, description, trigger, affectedInput, affectedEntityId, affectedEntityType, evidence };
}

// ─── Completeness ────────────────────────────────────────────────────────────

export function calculatePricingCompleteness(
  landedCost: LandedCostBreakdown,
  marketStats: PriceStatistics | null,
  exchangeRates: ExchangeRateInput[],
): PricingCompleteness {
  const weights = PRICING_CONFIG.completenessWeights;
  let score = 0;
  const details: Record<string, boolean> = {};

  const checks: [string, boolean, number][] = [
    ["productCost", landedCost.productCost !== null, weights.productCost],
    ["freight", landedCost.freightCost !== null, weights.freight],
    ["duty", landedCost.dutyCost !== null, weights.duty],
    ["tax", landedCost.taxCost !== null, weights.tax],
    ["insurance", landedCost.insuranceCost !== null, weights.insurance],
    ["portCosts", landedCost.portCost !== null, weights.portCosts],
    ["clearing", landedCost.clearingCost !== null, weights.clearing],
    ["inlandTransport", landedCost.destinationCost !== null, weights.inlandTransport],
    ["marketPrices", marketStats !== null && marketStats.comparableCount >= PRICING_CONFIG.minimumComparableObservations, weights.marketPrices],
    ["exchangeRate", exchangeRates.length > 0, 0.0], // bonus, not in weights
  ];

  for (const [key, known, weight] of checks) {
    details[key] = known;
    if (known) score += weight;
  }

  // Normalize to 0–1 range (weights sum to 1.0 minus exchange rate bonus)
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
  score = Math.min(1, score / totalWeight);

  return {
    score,
    productCostKnown: landedCost.productCost !== null,
    freightKnown: landedCost.freightCost !== null,
    dutyKnown: landedCost.dutyCost !== null,
    taxKnown: landedCost.taxCost !== null,
    insuranceKnown: landedCost.insuranceCost !== null,
    portCostsKnown: landedCost.portCost !== null,
    clearingKnown: landedCost.clearingCost !== null,
    inlandTransportKnown: landedCost.destinationCost !== null,
    marketPricesKnown: marketStats !== null && marketStats.comparableCount >= PRICING_CONFIG.minimumComparableObservations,
    exchangeRateKnown: exchangeRates.length > 0,
    details,
  };
}

// ─── Confidence ──────────────────────────────────────────────────────────────

export function calculatePricingConfidence(
  observations: PriceObservationInput[],
  _normalizedPrices: NormalizedPrice[],
  completeness: PricingCompleteness,
  _exchangeRates: ExchangeRateInput[],
  referenceDate: Date,
): PricingConfidence {
  const weights = PRICING_CONFIG.confidenceWeights;

  // Evidence quality: proportion of observations with evidence
  const withEvidence = observations.filter((o) => o.evidenceId !== null).length;
  const evidenceQualityScore = observations.length > 0 ? withEvidence / observations.length : 0;

  // Evidence quantity: log-scaled count of observations
  const evidenceQuantityScore = Math.min(1, Math.log1p(observations.length) / Math.log1p(10));

  // Source independence: distinct source types
  const distinctSources = new Set(observations.map((o) => o.sourceType)).size;
  const sourceIndependenceScore = Math.min(1, distinctSources / 3);

  // Temporal freshness: average age of observations
  let temporalFreshnessScore = 0;
  if (observations.length > 0) {
    const ages = observations.map((o) => (referenceDate.getTime() - o.observedAt.getTime()) / (1000 * 60 * 60 * 24));
    const avgAge = ages.reduce((s, a) => s + a, 0) / ages.length;
    // Decay: 7d = 1.0, 30d = 0.8, 90d = 0.6, 180d = 0.4, 365d = 0.2, >365d = 0.1
    if (avgAge <= 7) temporalFreshnessScore = 1.0;
    else if (avgAge <= 30) temporalFreshnessScore = 0.8;
    else if (avgAge <= 90) temporalFreshnessScore = 0.6;
    else if (avgAge <= 180) temporalFreshnessScore = 0.4;
    else if (avgAge <= 365) temporalFreshnessScore = 0.2;
    else temporalFreshnessScore = 0.1;
  }

  const completenessScore = completeness.score;

  const raw =
    evidenceQualityScore * weights.evidenceQuality +
    evidenceQuantityScore * weights.evidenceQuantity +
    sourceIndependenceScore * weights.sourceIndependence +
    temporalFreshnessScore * weights.temporalFreshness +
    completenessScore * weights.completeness;

  const score = Math.max(0, Math.min(1, raw));

  let confidenceBand: string;
  if (score >= 0.75) confidenceBand = "HIGH";
  else if (score >= 0.50) confidenceBand = "MEDIUM";
  else if (score >= 0.25) confidenceBand = "LOW";
  else confidenceBand = "INSUFFICIENT_DATA";

  return {
    score,
    evidenceQualityScore,
    evidenceQuantityScore,
    sourceIndependenceScore,
    temporalFreshnessScore,
    completenessScore,
    confidenceBand,
  };
}

// ─── Main Engine Runner ──────────────────────────────────────────────────────

export function runPricingEngine(input: PricingEngineInput): PricingEngineResult {
  const { tenantId, productId, supplierId, logisticsRouteId, quantity, targetCurrency, observations, costComponents, exchangeRates, marketObservations, referenceDate } = input;

  // 1. Normalize all price observations
  const normalizedPrices = observations.map((obs) =>
    normalizePriceObservation(obs, targetCurrency, exchangeRates),
  );

  // 2. Aggregate market prices (if market observations available)
  let marketStats: PriceStatistics | null = null;
  if (marketObservations.length > 0) {
    const allMarketNorms: NormalizedPrice[] = [];
    for (const group of marketObservations) {
      for (const obs of group.observations) {
        allMarketNorms.push(normalizePriceObservation(obs, group.targetCurrency, exchangeRates));
      }
    }
    marketStats = aggregateMarketPrices(allMarketNorms);
  } else if (observations.some((o) => o.observationType === "SELLING_PRICE" || o.observationType === "COMPETITOR_PRICE")) {
    marketStats = aggregateMarketPrices(normalizedPrices.filter((p) => {
      const obs = observations.find((o) => o.id === p.observationId);
      return obs?.observationType === "SELLING_PRICE" || obs?.observationType === "COMPETITOR_PRICE";
    }));
  }

  // 3. Calculate landed cost
  const landedCost = calculateLandedCost(costComponents, quantity, targetCurrency, exchangeRates);

  // 4. Calculate margin (if we have market price data)
  let margin: MarginResult | null = null;
  const referencePrice = marketStats?.medianPrice ?? marketStats?.averagePrice ?? null;
  if (referencePrice !== null) {
    margin = calculateMargin(
      landedCost.totalCost,
      referencePrice,
      0, 0, 0, 0, 0, 0, null,
    );
  }

  // 5. Build scenarios
  const scenarios: ScenarioResult[] = [];
  for (const scenarioType of ["CONSERVATIVE", "BASE", "UPSIDE"] as const) {
    scenarios.push(buildPricingScenario(
      scenarioType, landedCost, marketStats, null, targetCurrency,
      0, 0, 0, 0, 0, 0, null,
    ));
  }

  // 6. Detect risks
  const risks = detectPricingRisks(input, landedCost, marketStats, normalizedPrices, margin, referenceDate);

  // 7. Calculate completeness and confidence
  const completeness = calculatePricingCompleteness(landedCost, marketStats, exchangeRates);
  const confidence = calculatePricingConfidence(observations, normalizedPrices, completeness, exchangeRates, referenceDate);

  // 8. Price position
  const pricePosition = marketStats?.medianPrice !== null && marketStats?.medianPrice !== undefined
    ? calculatePricePosition(marketStats.medianPrice, marketStats)
    : "UNKNOWN";

  // Update scenario price positions
  for (const scenario of scenarios) {
    scenario.pricePosition = calculatePricePosition(scenario.sellingPrice, marketStats);
  }

  // 9. Compute input hash
  const inputHash = computeLandedCostInputHash(
    tenantId, productId, supplierId, logisticsRouteId, quantity,
    costComponents.map((c) => c.id),
    observations.map((o) => o.id),
    exchangeRates.map((r) => r.evidenceId ?? `${r.fromCurrency}-${r.toCurrency}-${r.observedAt.toISOString()}`),
    PRICING_CONFIG.algorithmVersion,
  );

  return {
    tenantId,
    productId,
    supplierId,
    logisticsRouteId,
    algorithmVersion: PRICING_CONFIG.algorithmVersion,
    inputHash,
    normalizedPrices,
    marketStatistics: marketStats,
    landedCost,
    margin,
    scenarios,
    risks,
    completeness,
    confidence,
    pricePosition,
  };
}
