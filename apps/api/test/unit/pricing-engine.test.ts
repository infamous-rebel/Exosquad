// =============================================================================
// Phase 11 — Unit Tests: Pricing Calculation Engine
// =============================================================================
// Tests all deterministic pricing calculations: content hashing, currency
// normalization, unit normalization, price comparability, market aggregation,
// landed cost, margin calculations, scenarios, risk detection, completeness,
// confidence, and full engine run.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  computeObservationContentHash,
  computeCostComponentHash,
  computeLandedCostInputHash,
  computeScenarioContentHash,
  computeMarketSnapshotHash,
  computeAssessmentInputHash,
  normalizeCurrency,
  normalizeUnitPrice,
  normalizePriceObservation,
  arePricesComparable,
  aggregateMarketPrices,
  calculateLandedCost,
  calculateGrossProfit,
  calculateGrossMargin,
  calculateMarkup,
  calculateBreakEvenPrice,
  calculateTargetPrice,
  calculateMargin,
  buildPricingScenario,
  calculatePricePosition,
  detectPricingRisks,
  calculatePricingCompleteness,
  calculatePricingConfidence,
  runPricingEngine,
  type PriceObservationInput,
  type CostComponentInput,
  type ExchangeRateInput,
  type NormalizedPrice,
  type PricingEngineInput,
} from "../../src/services/pricing-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-01T00:00:00Z");

function makeObservation(overrides: Partial<PriceObservationInput> = {}): PriceObservationInput {
  return {
    id: `obs-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: "tenant-1",
    productId: "product-1",
    supplierId: null,
    sourceType: "SUPPLIER_QUOTE",
    observationType: "PRODUCT_COST",
    price: 10.0,
    currency: "USD",
    quantity: null,
    moq: null,
    priceBasis: "UNIT",
    market: null,
    country: "CN",
    sourceUrl: null,
    observedAt: NOW,
    validUntil: null,
    evidenceId: null,
    normalizedUnitPrice: null,
    normalizedCurrency: null,
    exchangeRateEvidenceId: null,
    exchangeRateObservedAt: null,
    packSize: null,
    perUnitQuantity: null,
    contentHash: "hash-1",
    ...overrides,
  };
}

function makeCostComponent(overrides: Partial<CostComponentInput> = {}): CostComponentInput {
  return {
    id: `comp-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: "tenant-1",
    productId: "product-1",
    supplierId: null,
    logisticsRouteId: null,
    type: "PRODUCT_COST",
    amount: 10.0,
    currency: "USD",
    basis: "UNIT",
    quantity: null,
    rate: null,
    rateType: null,
    status: "OBSERVED",
    evidenceId: null,
    observedAt: NOW,
    contentHash: "hash-1",
    ...overrides,
  };
}

function makeExchangeRate(overrides: Partial<ExchangeRateInput> = {}): ExchangeRateInput {
  return {
    fromCurrency: "USD",
    toCurrency: "BDT",
    rate: 110.0,
    observedAt: NOW,
    evidenceId: "ev-1",
    ...overrides,
  };
}

// ─── Content Hashing Tests ───────────────────────────────────────────────────

describe("Pricing Engine — Content Hashing", () => {
  it("1. observation hash: same inputs → same hash", () => {
    const h1 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "USD", "UNIT", null, null);
    const h2 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "USD", "UNIT", null, null);
    expect(h1).toBe(h2);
  });

  it("2. observation hash: different price → different hash", () => {
    const h1 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "USD", "UNIT", null, null);
    const h2 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 12, "USD", "UNIT", null, null);
    expect(h1).not.toBe(h2);
  });

  it("3. cost component hash is deterministic", () => {
    const h1 = computeCostComponentHash("t1", "p1", "FREIGHT", 50, "USD", null, null);
    const h2 = computeCostComponentHash("t1", "p1", "FREIGHT", 50, "USD", null, null);
    expect(h1).toBe(h2);
  });

  it("4. landed cost input hash is deterministic", () => {
    const h1 = computeLandedCostInputHash("t1", "p1", null, null, 100, ["c1"], ["o1"], ["e1"], "v1");
    const h2 = computeLandedCostInputHash("t1", "p1", null, null, 100, ["c1"], ["o1"], ["e1"], "v1");
    expect(h1).toBe(h2);
  });

  it("5. landed cost input hash: order-independent for ID arrays", () => {
    const h1 = computeLandedCostInputHash("t1", "p1", null, null, 100, ["c1", "c2"], ["o1"], [], "v1");
    const h2 = computeLandedCostInputHash("t1", "p1", null, null, 100, ["c2", "c1"], ["o1"], [], "v1");
    expect(h1).toBe(h2);
  });

  it("6. scenario content hash is deterministic", () => {
    const h1 = computeScenarioContentHash("t1", "p1", "lc1", "BASE", 1500, "BDT", 50, 10, 20);
    const h2 = computeScenarioContentHash("t1", "p1", "lc1", "BASE", 1500, "BDT", 50, 10, 20);
    expect(h1).toBe(h2);
  });

  it("7. market snapshot hash is deterministic", () => {
    const h1 = computeMarketSnapshotHash("t1", "p1", "daraz", ["o1", "o2"], "BDT", "v1");
    const h2 = computeMarketSnapshotHash("t1", "p1", "daraz", ["o2", "o1"], "BDT", "v1");
    expect(h1).toBe(h2);
  });

  it("8. assessment input hash is deterministic", () => {
    const h1 = computeAssessmentInputHash("t1", "p1", null, ["lc1"], ["s1"], ["m1"], ["o1"], "v1");
    const h2 = computeAssessmentInputHash("t1", "p1", null, ["lc1"], ["s1"], ["m1"], ["o1"], "v1");
    expect(h1).toBe(h2);
  });
});

// ─── Currency Normalization Tests ────────────────────────────────────────────

describe("Pricing Engine — Currency Normalization", () => {
  it("9. same currency: no conversion needed", () => {
    const result = normalizeCurrency(100, "USD", "USD", []);
    expect(result.normalizedAmount).toBe(100);
    expect(result.rateUsed).toBe(1.0);
  });

  it("10. known exchange rate: correct conversion", () => {
    const rates = [makeExchangeRate({ fromCurrency: "USD", toCurrency: "BDT", rate: 110 })];
    const result = normalizeCurrency(10, "USD", "BDT", rates);
    expect(result.normalizedAmount).toBe(1100);
    expect(result.rateUsed).toBe(110);
  });

  it("11. missing exchange rate: returns null (UNKNOWN)", () => {
    const result = normalizeCurrency(10, "USD", "BDT", []);
    expect(result.normalizedAmount).toBeNull();
    expect(result.rateUsed).toBeNull();
  });

  it("12. inverse exchange rate: uses 1/rate", () => {
    const rates = [makeExchangeRate({ fromCurrency: "BDT", toCurrency: "USD", rate: 110 })];
    const result = normalizeCurrency(1100, "USD", "BDT", rates);
    expect(result.normalizedAmount).toBeCloseTo(1100 / 110, 5);
  });

  it("13. zero exchange rate: returns null", () => {
    const rates = [makeExchangeRate({ rate: 0 })];
    const result = normalizeCurrency(10, "USD", "BDT", rates);
    expect(result.normalizedAmount).toBeNull();
  });

  it("14. most recent rate is used when multiple exist", () => {
    const rates = [
      makeExchangeRate({ rate: 100, observedAt: new Date("2026-01-01") }),
      makeExchangeRate({ rate: 120, observedAt: new Date("2026-09-01") }),
    ];
    const result = normalizeCurrency(10, "USD", "BDT", rates);
    expect(result.normalizedAmount).toBe(1200);
  });
});

// ─── Unit Price Normalization Tests ──────────────────────────────────────────

describe("Pricing Engine — Unit Price Normalization", () => {
  it("15. UNIT basis: price is already per-unit", () => {
    const result = normalizeUnitPrice(10, "UNIT", null, null, null);
    expect(result.unitPrice).toBe(10);
    expect(result.issue).toBeNull();
  });

  it("16. PACK basis with packSize: divides correctly", () => {
    const result = normalizeUnitPrice(120, "PACK", 12, null, null);
    expect(result.unitPrice).toBe(10);
  });

  it("17. CASE basis with perUnitQuantity: divides correctly", () => {
    const result = normalizeUnitPrice(600, "CASE", null, 24, null);
    expect(result.unitPrice).toBe(25);
  });

  it("18. KG basis with quantity: divides correctly", () => {
    const result = normalizeUnitPrice(500, "KG", null, null, 5);
    expect(result.unitPrice).toBe(100);
  });

  it("19. PACK basis without divisor: returns null", () => {
    const result = normalizeUnitPrice(120, "PACK", null, null, null);
    expect(result.unitPrice).toBeNull();
    expect(result.issue).not.toBeNull();
  });

  it("20. CONTAINER basis: cannot normalize without conversion", () => {
    const result = normalizeUnitPrice(5000, "CONTAINER", null, null, null);
    expect(result.unitPrice).toBeNull();
    expect(result.issue).not.toBeNull();
  });

  it("21. zero quantity: returns null", () => {
    const result = normalizeUnitPrice(100, "KG", null, null, 0);
    expect(result.unitPrice).toBeNull();
  });
});

// ─── Price Observation Normalization ─────────────────────────────────────────

describe("Pricing Engine — Observation Normalization", () => {
  it("22. full normalization: currency + unit", () => {
    const obs = makeObservation({ price: 120, currency: "USD", priceBasis: "PACK", packSize: 12 });
    const rates = [makeExchangeRate({ rate: 110 })];
    const result = normalizePriceObservation(obs, "BDT", rates);
    expect(result.normalizedPrice).toBeCloseTo(13200);
    expect(result.unitPrice).toBeCloseTo(1100);
    expect(result.comparable).toBe(true);
  });

  it("23. missing exchange rate: normalized price is null", () => {
    const obs = makeObservation({ price: 10, currency: "USD" });
    const result = normalizePriceObservation(obs, "BDT", []);
    expect(result.normalizedPrice).toBeNull();
    expect(result.unitPrice).toBeNull();
    expect(result.comparable).toBe(false);
  });
});

// ─── Price Comparability ─────────────────────────────────────────────────────

describe("Pricing Engine — Price Comparability", () => {
  it("24. two comparable prices", () => {
    const a: NormalizedPrice = { observationId: "o1", originalPrice: 10, originalCurrency: "USD", normalizedPrice: 1100, normalizedCurrency: "BDT", unitPrice: 1100, unitBasis: "UNIT", exchangeRateUsed: 110, exchangeRateEvidenceId: null, comparable: true, comparabilityIssue: null };
    const b: NormalizedPrice = { observationId: "o2", originalPrice: 12, originalCurrency: "USD", normalizedPrice: 1320, normalizedCurrency: "BDT", unitPrice: 1320, unitBasis: "UNIT", exchangeRateUsed: 110, exchangeRateEvidenceId: null, comparable: true, comparabilityIssue: null };
    expect(arePricesComparable(a, b).comparable).toBe(true);
  });

  it("25. incomparable: one not normalized", () => {
    const a: NormalizedPrice = { observationId: "o1", originalPrice: 10, originalCurrency: "USD", normalizedPrice: null, normalizedCurrency: "BDT", unitPrice: null, unitBasis: "UNIT", exchangeRateUsed: null, exchangeRateEvidenceId: null, comparable: false, comparabilityIssue: "no rate" };
    const b: NormalizedPrice = { observationId: "o2", originalPrice: 12, originalCurrency: "USD", normalizedPrice: 1320, normalizedCurrency: "BDT", unitPrice: 1320, unitBasis: "UNIT", exchangeRateUsed: 110, exchangeRateEvidenceId: null, comparable: true, comparabilityIssue: null };
    expect(arePricesComparable(a, b).comparable).toBe(false);
  });
});

// ─── Market Price Aggregation ────────────────────────────────────────────────

describe("Pricing Engine — Market Aggregation", () => {
  function makeNormPrice(unitPrice: number): NormalizedPrice {
    return { observationId: `o-${Math.random().toString(36).slice(2, 6)}`, originalPrice: unitPrice / 110, originalCurrency: "USD", normalizedPrice: unitPrice, normalizedCurrency: "BDT", unitPrice, unitBasis: "UNIT", exchangeRateUsed: 110, exchangeRateEvidenceId: null, comparable: true, comparabilityIssue: null };
  }

  it("26. basic aggregation: min, max, mean", () => {
    const prices = [100, 200, 300, 400, 500].map(makeNormPrice);
    const stats = aggregateMarketPrices(prices);
    expect(stats).not.toBeNull();
    expect(stats!.minPrice).toBe(100);
    expect(stats!.maxPrice).toBe(500);
    expect(stats!.averagePrice).toBe(300);
  });

  it("27. median with sufficient observations", () => {
    const prices = [100, 200, 300, 400, 500].map(makeNormPrice);
    const stats = aggregateMarketPrices(prices);
    expect(stats!.medianPrice).toBe(300);
  });

  it("28. insufficient observations for median", () => {
    const prices = [100, 200].map(makeNormPrice);
    const stats = aggregateMarketPrices(prices);
    expect(stats!.medianPrice).toBeNull();
  });

  it("29. quartiles with sufficient observations", () => {
    const prices = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map(makeNormPrice);
    const stats = aggregateMarketPrices(prices);
    expect(stats!.lowerQuartile).not.toBeNull();
    expect(stats!.upperQuartile).not.toBeNull();
  });

  it("30. empty observations: returns null", () => {
    expect(aggregateMarketPrices([])).toBeNull();
  });

  it("31. all incomparable: returns null", () => {
    const prices: NormalizedPrice[] = [{ observationId: "o1", originalPrice: 10, originalCurrency: "USD", normalizedPrice: null, normalizedCurrency: "BDT", unitPrice: null, unitBasis: "UNIT", exchangeRateUsed: null, exchangeRateEvidenceId: null, comparable: false, comparabilityIssue: "no rate" }];
    expect(aggregateMarketPrices(prices)).toBeNull();
  });

  it("32. spread calculation", () => {
    const prices = [100, 500].map(makeNormPrice);
    const stats = aggregateMarketPrices(prices);
    expect(stats!.priceSpread).toBe(400);
  });

  it("33. contradictory observations preserved (not merged)", () => {
    const prices = [100, 1000].map(makeNormPrice);
    const stats = aggregateMarketPrices(prices);
    expect(stats!.minPrice).toBe(100);
    expect(stats!.maxPrice).toBe(1000);
    expect(stats!.comparableCount).toBe(2);
  });
});

// ─── Landed Cost Calculation ─────────────────────────────────────────────────

describe("Pricing Engine — Landed Cost", () => {
  it("34. complete inputs: all components known", () => {
    const components = [
      makeCostComponent({ type: "PRODUCT_COST", amount: 10, currency: "USD" }),
      makeCostComponent({ type: "FREIGHT", amount: 3, currency: "USD" }),
      makeCostComponent({ type: "DUTY", amount: 2, currency: "USD" }),
    ];
    const rates = [makeExchangeRate({ rate: 110 })];
    const result = calculateLandedCost(components, 100, "BDT", rates);
    expect(result.totalCost).toBeCloseTo(1650); // (10+3+2)*110
    expect(result.unitLandedCost).toBeCloseTo(16.5);
    expect(result.unknownComponents).toHaveLength(0);
  });

  it("35. missing freight: total is null", () => {
    const components = [
      makeCostComponent({ type: "PRODUCT_COST", amount: 10, currency: "USD" }),
      makeCostComponent({ type: "FREIGHT", amount: 0, currency: "USD", status: "UNKNOWN" }),
    ];
    const rates = [makeExchangeRate({ rate: 110 })];
    const result = calculateLandedCost(components, 100, "BDT", rates);
    expect(result.totalCost).toBeNull();
    expect(result.unitLandedCost).toBeNull();
    expect(result.unknownComponents).toContain("FREIGHT");
  });

  it("36. missing exchange rate: component normalized amount is null", () => {
    const components = [makeCostComponent({ type: "PRODUCT_COST", amount: 10, currency: "USD" })];
    const result = calculateLandedCost(components, 100, "BDT", []);
    expect(result.totalCost).toBeNull();
    expect(result.unknownComponents).toContain("PRODUCT_COST");
  });

  it("37. same currency: no conversion needed", () => {
    const components = [makeCostComponent({ type: "PRODUCT_COST", amount: 1000, currency: "BDT" })];
    const result = calculateLandedCost(components, 10, "BDT", []);
    expect(result.totalCost).toBe(1000);
    expect(result.unitLandedCost).toBe(100);
  });

  it("38. zero quantity: unitLandedCost is null", () => {
    const components = [makeCostComponent({ type: "PRODUCT_COST", amount: 10, currency: "BDT" })];
    const result = calculateLandedCost(components, 0, "BDT", []);
    expect(result.totalCost).toBe(10);
    expect(result.unitLandedCost).toBeNull();
  });
});

// ─── Margin Calculations ─────────────────────────────────────────────────────

describe("Pricing Engine — Margin Calculations", () => {
  it("39. gross profit: selling - cost", () => {
    expect(calculateGrossProfit(1500, 1000)).toBe(500);
  });

  it("40. gross profit: unknown input → null", () => {
    expect(calculateGrossProfit(null, 1000)).toBeNull();
    expect(calculateGrossProfit(1500, null)).toBeNull();
  });

  it("41. gross margin: profit / selling", () => {
    expect(calculateGrossMargin(500, 1500)).toBeCloseTo(0.3333, 3);
  });

  it("42. gross margin: zero selling price → null", () => {
    expect(calculateGrossMargin(500, 0)).toBeNull();
  });

  it("43. markup: profit / cost", () => {
    expect(calculateMarkup(500, 1000)).toBe(0.5);
  });

  it("44. markup: zero cost → null", () => {
    expect(calculateMarkup(500, 0)).toBeNull();
  });

  it("45. break-even: covers all costs", () => {
    const bep = calculateBreakEvenPrice(1000, 50, 0, 30, 20);
    expect(bep).toBe(1100);
  });

  it("46. break-even: unknown landed cost → null", () => {
    expect(calculateBreakEvenPrice(null, 50, 0, 30, 20)).toBeNull();
  });

  it("47. target price: for 20% margin", () => {
    const tp = calculateTargetPrice(1000, 100, 0.20);
    expect(tp).toBe(1375); // (1000+100)/(1-0.20)
  });

  it("48. negative margin is valid (not error)", () => {
    const result = calculateMargin(1500, 1000, 0, 0, 0, 0, 0, 0, null);
    expect(result.grossProfit).toBe(-500);
    expect(result.grossMargin).toBeCloseTo(-0.5, 3);
  });

  it("49. full margin calculation with unknown inputs", () => {
    const result = calculateMargin(null, 1500, 50, 0, 0, 0, 0, 0, null);
    expect(result.grossProfit).toBeNull();
    expect(result.unknownInputs).toContain("LANDED_COST");
  });
});

// ─── Scenario Building ───────────────────────────────────────────────────────

describe("Pricing Engine — Scenarios", () => {
  it("50. base scenario with market data", () => {
    const landedCost = { productCost: 1100, originCosts: 0, freightCost: 330, insuranceCost: 0, dutyCost: 220, taxCost: 0, portCost: 0, customsCost: 0, clearingCost: 0, destinationCost: 0, otherCost: 0, totalCost: 1650, unitLandedCost: 16.5, unknownComponents: [], componentDetails: [] };
    const marketStats = { observationCount: 10, comparableCount: 10, incomparableCount: 0, minPrice: 1500, maxPrice: 3000, medianPrice: 2200, averagePrice: 2100, lowerQuartile: 1800, upperQuartile: 2600, priceSpread: 1500, spreadPercentage: 0.68, priceVolatility: 0.2, trendDirection: "STABLE", currency: "BDT" };
    const scenario = buildPricingScenario("BASE", landedCost, marketStats, null, "BDT", 0, 0, 0, 0, 0, 0, null);
    expect(scenario.sellingPrice).toBe(2200);
    expect(scenario.grossProfit).toBeCloseTo(550);
  });

  it("51. conservative scenario uses lower quartile", () => {
    const landedCost = { productCost: 1100, originCosts: 0, freightCost: 330, insuranceCost: 0, dutyCost: 220, taxCost: 0, portCost: 0, customsCost: 0, clearingCost: 0, destinationCost: 0, otherCost: 0, totalCost: 1650, unitLandedCost: 16.5, unknownComponents: [], componentDetails: [] };
    const marketStats = { observationCount: 10, comparableCount: 10, incomparableCount: 0, minPrice: 1500, maxPrice: 3000, medianPrice: 2200, averagePrice: 2100, lowerQuartile: 1800, upperQuartile: 2600, priceSpread: 1500, spreadPercentage: 0.68, priceVolatility: 0.2, trendDirection: "STABLE", currency: "BDT" };
    const scenario = buildPricingScenario("CONSERVATIVE", landedCost, marketStats, null, "BDT", 0, 0, 0, 0, 0, 0, null);
    expect(scenario.sellingPrice).toBe(1800);
  });

  it("52. scenario with explicit selling price", () => {
    const landedCost = { productCost: 1100, originCosts: 0, freightCost: 330, insuranceCost: 0, dutyCost: 220, taxCost: 0, portCost: 0, customsCost: 0, clearingCost: 0, destinationCost: 0, otherCost: 0, totalCost: 1650, unitLandedCost: 16.5, unknownComponents: [], componentDetails: [] };
    const scenario = buildPricingScenario("BASE", landedCost, null, 2500, "BDT", 50, 0, 0, 0, 0, 0, null);
    expect(scenario.sellingPrice).toBe(2500);
    expect(scenario.grossProfit).toBe(800); // 2500 - (1650+50)
  });
});

// ─── Price Position ──────────────────────────────────────────────────────────

describe("Pricing Engine — Price Position", () => {
  it("53. mid-market price", () => {
    const stats = { observationCount: 10, comparableCount: 10, incomparableCount: 0, minPrice: 1000, maxPrice: 3000, medianPrice: 2000, averagePrice: 2000, lowerQuartile: 1500, upperQuartile: 2500, priceSpread: 2000, spreadPercentage: 1.0, priceVolatility: 0.3, trendDirection: "STABLE", currency: "BDT" };
    expect(calculatePricePosition(2000, stats)).toBe("MID_MARKET");
  });

  it("54. null price: UNKNOWN", () => {
    expect(calculatePricePosition(null, null)).toBe("UNKNOWN");
  });
});

// ─── Risk Detection ──────────────────────────────────────────────────────────

describe("Pricing Engine — Risk Detection", () => {
  it("55. unknown freight detected", () => {
    const input: PricingEngineInput = { tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null, quantity: 100, targetCurrency: "BDT", observations: [], costComponents: [makeCostComponent({ type: "PRODUCT_COST", amount: 1000, currency: "BDT" })], exchangeRates: [], marketObservations: [], referenceDate: NOW };
    const landedCost = calculateLandedCost(input.costComponents, 100, "BDT", []);
    const risks = detectPricingRisks(input, landedCost, null, [], null, NOW);
    expect(risks.some((r) => r.riskType === "UNKNOWN_FREIGHT")).toBe(true);
  });

  it("56. selling below cost: critical risk", () => {
    const input: PricingEngineInput = { tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null, quantity: 100, targetCurrency: "BDT", observations: [], costComponents: [], exchangeRates: [], marketObservations: [], referenceDate: NOW };
    const landedCost = { productCost: 2000, originCosts: 0, freightCost: 0, insuranceCost: 0, dutyCost: 0, taxCost: 0, portCost: 0, customsCost: 0, clearingCost: 0, destinationCost: 0, otherCost: 0, totalCost: 2000, unitLandedCost: 20, unknownComponents: [], componentDetails: [] };
    const margin = calculateMargin(2000, 1500, 0, 0, 0, 0, 0, 0, null);
    const risks = detectPricingRisks(input, landedCost, null, [], margin, NOW);
    expect(risks.some((r) => r.riskType === "SELLING_BELOW_COST")).toBe(true);
    expect(risks.find((r) => r.riskType === "SELLING_BELOW_COST")!.severity).toBe("critical");
  });

  it("57. insufficient observations risk", () => {
    const input: PricingEngineInput = { tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null, quantity: 100, targetCurrency: "BDT", observations: [], costComponents: [], exchangeRates: [], marketObservations: [], referenceDate: NOW };
    const landedCost = { productCost: null, originCosts: null, freightCost: null, insuranceCost: null, dutyCost: null, taxCost: null, portCost: null, customsCost: null, clearingCost: null, destinationCost: null, otherCost: null, totalCost: null, unitLandedCost: null, unknownComponents: [], componentDetails: [] };
    const stats = { observationCount: 1, comparableCount: 1, incomparableCount: 0, minPrice: 1000, maxPrice: 1000, medianPrice: null, averagePrice: 1000, lowerQuartile: null, upperQuartile: null, priceSpread: 0, spreadPercentage: null, priceVolatility: null, trendDirection: "UNKNOWN", currency: "BDT" };
    const risks = detectPricingRisks(input, landedCost, stats, [], null, NOW);
    expect(risks.some((r) => r.riskType === "INSUFFICIENT_PRICE_OBSERVATIONS")).toBe(true);
  });
});

// ─── Completeness ────────────────────────────────────────────────────────────

describe("Pricing Engine — Completeness", () => {
  it("58. all known: high completeness", () => {
    const landedCost = { productCost: 100, originCosts: 10, freightCost: 50, insuranceCost: 5, dutyCost: 20, taxCost: 15, portCost: 10, customsCost: 5, clearingCost: 5, destinationCost: 20, otherCost: 0, totalCost: 240, unitLandedCost: 2.4, unknownComponents: [], componentDetails: [] };
    const stats = { observationCount: 10, comparableCount: 10, incomparableCount: 0, minPrice: 200, maxPrice: 400, medianPrice: 300, averagePrice: 300, lowerQuartile: 250, upperQuartile: 350, priceSpread: 200, spreadPercentage: 0.67, priceVolatility: 0.1, trendDirection: "STABLE", currency: "BDT" };
    const result = calculatePricingCompleteness(landedCost, stats, [makeExchangeRate()]);
    expect(result.score).toBeGreaterThan(0.8);
    expect(result.productCostKnown).toBe(true);
    expect(result.freightKnown).toBe(true);
  });

  it("59. all unknown: low completeness", () => {
    const landedCost = { productCost: null, originCosts: null, freightCost: null, insuranceCost: null, dutyCost: null, taxCost: null, portCost: null, customsCost: null, clearingCost: null, destinationCost: null, otherCost: null, totalCost: null, unitLandedCost: null, unknownComponents: ["PRODUCT_COST", "FREIGHT"], componentDetails: [] };
    const result = calculatePricingCompleteness(landedCost, null, []);
    expect(result.score).toBe(0);
  });
});

// ─── Confidence ──────────────────────────────────────────────────────────────

describe("Pricing Engine — Confidence", () => {
  it("60. high confidence with many evidence-backed observations", () => {
    const obs = Array.from({ length: 10 }, (_, i) => makeObservation({ evidenceId: `ev-${i}`, observedAt: new Date("2026-09-25") }));
    const norms = obs.map((o) => ({ observationId: o.id, originalPrice: o.price, originalCurrency: o.currency, normalizedPrice: o.price * 110, normalizedCurrency: "BDT", unitPrice: o.price * 110, unitBasis: "UNIT", exchangeRateUsed: 110, exchangeRateEvidenceId: "ev-1", comparable: true, comparabilityIssue: null }));
    const completeness = { score: 0.9, productCostKnown: true, freightKnown: true, dutyKnown: true, taxKnown: true, insuranceKnown: true, portCostsKnown: true, clearingKnown: true, inlandTransportKnown: true, marketPricesKnown: true, exchangeRateKnown: true, details: {} };
    const result = calculatePricingConfidence(obs, norms, completeness, [makeExchangeRate()], NOW);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.confidenceBand).not.toBe("INSUFFICIENT_DATA");
  });

  it("61. low confidence with no observations", () => {
    const completeness = { score: 0, productCostKnown: false, freightKnown: false, dutyKnown: false, taxKnown: false, insuranceKnown: false, portCostsKnown: false, clearingKnown: false, inlandTransportKnown: false, marketPricesKnown: false, exchangeRateKnown: false, details: {} };
    const result = calculatePricingConfidence([], [], completeness, [], NOW);
    expect(result.score).toBe(0);
    expect(result.confidenceBand).toBe("INSUFFICIENT_DATA");
  });
});

// ─── Full Engine Run ─────────────────────────────────────────────────────────

describe("Pricing Engine — Full Run", () => {
  it("62. complete engine run produces all outputs", () => {
    const input: PricingEngineInput = {
      tenantId: "t1",
      productId: "p1",
      supplierId: "s1",
      logisticsRouteId: null,
      quantity: 100,
      targetCurrency: "BDT",
      observations: [
        makeObservation({ id: "o1", price: 10, currency: "USD", observationType: "PRODUCT_COST", evidenceId: "e1" }),
        makeObservation({ id: "o2", price: 2500, currency: "BDT", observationType: "SELLING_PRICE", market: "daraz" }),
      ],
      costComponents: [
        makeCostComponent({ id: "c1", type: "PRODUCT_COST", amount: 10, currency: "USD" }),
        makeCostComponent({ id: "c2", type: "FREIGHT", amount: 3, currency: "USD" }),
      ],
      exchangeRates: [makeExchangeRate({ rate: 110 })],
      marketObservations: [],
      referenceDate: NOW,
    };

    const result = runPricingEngine(input);
    expect(result.tenantId).toBe("t1");
    expect(result.productId).toBe("p1");
    expect(result.algorithmVersion).toBe("PRICING_ALGORITHM_V1");
    expect(result.inputHash).toBeTruthy();
    expect(result.normalizedPrices).toHaveLength(2);
    expect(result.landedCost).toBeDefined();
    expect(result.scenarios).toHaveLength(3);
    expect(result.risks).toBeDefined();
    expect(result.completeness).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  it("63. engine is deterministic: same inputs → same outputs", () => {
    const input: PricingEngineInput = {
      tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null, quantity: 50,
      targetCurrency: "BDT",
      observations: [makeObservation({ id: "o1", price: 10, currency: "USD" })],
      costComponents: [makeCostComponent({ id: "c1", type: "PRODUCT_COST", amount: 10, currency: "USD" })],
      exchangeRates: [makeExchangeRate({ rate: 110 })],
      marketObservations: [],
      referenceDate: NOW,
    };

    const r1 = runPricingEngine(input);
    const r2 = runPricingEngine(input);
    expect(r1.inputHash).toBe(r2.inputHash);
    expect(r1.landedCost.totalCost).toBe(r2.landedCost.totalCost);
    expect(r1.confidence.score).toBe(r2.confidence.score);
  });

  it("64. unknown ≠ zero: missing freight stays unknown", () => {
    const input: PricingEngineInput = {
      tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null, quantity: 100,
      targetCurrency: "BDT",
      observations: [],
      costComponents: [
        makeCostComponent({ type: "PRODUCT_COST", amount: 1000, currency: "BDT" }),
        makeCostComponent({ type: "FREIGHT", amount: 0, currency: "BDT", status: "UNKNOWN" }),
      ],
      exchangeRates: [],
      marketObservations: [],
      referenceDate: NOW,
    };

    const result = runPricingEngine(input);
    expect(result.landedCost.totalCost).toBeNull();
    expect(result.landedCost.unknownComponents).toContain("FREIGHT");
  });
});
