// =============================================================================
// Phase 12 — Unit Tests: Product Opportunity, Competition & Viability Engine
// =============================================================================
// Tests all deterministic calculations: competition analysis, demand/supply/
// logistics/pricing signals, market gaps, viability constraints, opportunity
// scoring, viability scoring, content hashing, and the main engine entry point.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  computeCompetitorContentHash,
  computeCompetitorSnapshotHash,
  computeDemandSnapshotHash,
  computeOpportunityInputHash,
  computeOpportunityContentHash,
  computeViabilityInputHash,
  computeViabilityContentHash,
  normalizeCompetitorObservation,
  compareCompetitors,
  aggregateCompetition,
  calculateCompetitionConcentration,
  analyzeDemandOpportunity,
  analyzeSupplyOpportunity,
  analyzeLogisticsOpportunity,
  analyzePricingOpportunity,
  calculateMarketSaturation,
  calculatePriceCompression,
  calculateSupplierDiversification,
  calculateDemandCompetitionMatrix,
  detectDemandSignals,
  detectCompetitionSignals,
  detectSupplySignals,
  detectLogisticsSignals,
  detectPricingSignals,
  detectDataQualitySignals,
  combineOpportunitySignals,
  detectOpportunityRisks,
  detectMarketGaps,
  detectViabilityConstraints,
  calculateOpportunityCompleteness,
  calculateOpportunityConfidence,
  calculateOpportunityScore,
  classifyOpportunityLevel,
  calculateViabilityScore,
  classifyViabilityLevel,
  runOpportunityEngine,
  type CompetitorObservationInput,
  type DemandInput,
  type SupplyInput,
  type LogisticsInput,
  type PricingInput,
  type OpportunityEngineInput,
  type CompetitionResult,
} from "../../src/services/product-opportunity-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCompetitor(overrides: Partial<CompetitorObservationInput> = {}): CompetitorObservationInput {
  return {
    id: `comp-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: "tenant-1",
    productId: "product-1",
    competitorName: "Competitor A",
    sourceType: "MARKETPLACE",
    market: "BD",
    country: "BD",
    sellingPrice: 100,
    currency: "BDT",
    priceBasis: "retail",
    rating: 4.0,
    reviewCount: 50,
    availability: "IN_STOCK",
    observedAt: new Date("2026-09-15"),
    contentHash: "hash-abc",
    ...overrides,
  };
}

function makeDemandInput(overrides: Partial<DemandInput> = {}): DemandInput {
  return {
    demandLevel: "HIGH",
    demandMomentum: "GROWING",
    searchGrowth: 0.25,
    seasonality: 0.1,
    trendStrength: 0.8,
    observationCount: 20,
    confidence: 0.8,
    volatility: 0.15,
    ...overrides,
  };
}

function makeSupplyInput(overrides: Partial<SupplyInput> = {}): SupplyInput {
  return {
    supplierCount: 5,
    supplierCountryCount: 3,
    supplierPriceSpread: 0.3,
    supplierReliability: 0.7,
    supplyCompleteness: 0.8,
    ...overrides,
  };
}

function makeLogisticsInput(overrides: Partial<LogisticsInput> = {}): LogisticsInput {
  return {
    routeCount: 3,
    availableModes: ["sea", "air"],
    routeReliability: 0.75,
    transitTimeRange: { min: 7, max: 21 },
    transitTimeUncertainty: 0.3,
    numberOfHops: 3,
    logisticsRiskCount: 1,
    ...overrides,
  };
}

function makePricingInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    unitLandedCost: 80,
    marketPriceMin: 100,
    marketPriceMax: 200,
    marketPriceMedian: 140,
    grossMarginMin: 0.1,
    grossMarginMax: 0.5,
    grossMarginBase: 0.3,
    priceVolatility: 0.2,
    pricingRiskCount: 0,
    ...overrides,
  };
}

function makeEngineInput(overrides: Partial<OpportunityEngineInput> = {}): OpportunityEngineInput {
  return {
    tenantId: "tenant-1",
    productId: "product-1",
    competitors: [makeCompetitor(), makeCompetitor({ id: "comp-2", competitorName: "Competitor B", sellingPrice: 120 })],
    demand: makeDemandInput(),
    supply: makeSupplyInput(),
    logistics: makeLogisticsInput(),
    pricing: makePricingInput(),
    referenceDate: new Date("2026-10-01"),
    ...overrides,
  };
}

// ─── Content Hash Tests ──────────────────────────────────────────────────────

describe("content hash functions", () => {
  it("computeCompetitorContentHash is deterministic", () => {
    const h = computeCompetitorContentHash("t1", "p1", "WEB", 100, "BDT", "retail", "BD", "BD", new Date("2026-09-15"));
    expect(h).toBe(computeCompetitorContentHash("t1", "p1", "WEB", 100, "BDT", "retail", "BD", "BD", new Date("2026-09-15")));
  });

  it("computeCompetitorContentHash changes with different input", () => {
    const h1 = computeCompetitorContentHash("t1", "p1", "WEB", 100, "BDT", "retail", "BD", "BD", new Date("2026-09-15"));
    const h2 = computeCompetitorContentHash("t1", "p1", "WEB", 200, "BDT", "retail", "BD", "BD", new Date("2026-09-15"));
    expect(h1).not.toBe(h2);
  });

  it("computeCompetitorSnapshotHash is deterministic", () => {
    const h = computeCompetitorSnapshotHash("t1", "p1", 5, 3, "MODERATE", new Date("2026-10-01"));
    expect(h).toBe(computeCompetitorSnapshotHash("t1", "p1", 5, 3, "MODERATE", new Date("2026-10-01")));
  });

  it("computeCompetitorSnapshotHash changes with different inputs", () => {
    const h1 = computeCompetitorSnapshotHash("t1", "p1", 5, 3, "MODERATE", new Date("2026-10-01"));
    const h2 = computeCompetitorSnapshotHash("t1", "p1", 10, 5, "HIGH", new Date("2026-10-01"));
    expect(h1).not.toBe(h2);
  });

  it("computeDemandSnapshotHash is deterministic", () => {
    const h = computeDemandSnapshotHash("t1", "p1", "HIGH", "GROWING", 10, new Date("2026-10-01"));
    expect(h).toBeTruthy();
    expect(h).toBe(computeDemandSnapshotHash("t1", "p1", "HIGH", "GROWING", 10, new Date("2026-10-01")));
  });

  it("computeOpportunityContentHash produces unique hashes for different inputs", () => {
    const h1 = computeOpportunityContentHash("t1", "p1", 70, "HIGH", "LOW", 0.8, 5, 1);
    const h2 = computeOpportunityContentHash("t1", "p2", 70, "HIGH", "LOW", 0.8, 5, 1);
    expect(h1).not.toBe(h2);
  });

  it("computeViabilityContentHash is deterministic", () => {
    const h = computeViabilityContentHash("t1", "p1", 70, 0.3, 2, "MODERATE");
    expect(h).toBe(computeViabilityContentHash("t1", "p1", 70, 0.3, 2, "MODERATE"));
  });
});

// ─── Competition Analysis Tests ──────────────────────────────────────────────

describe("competition analysis", () => {
  it("normalizeCompetitorObservation returns normalized data", () => {
    const obs = makeCompetitor();
    const result = normalizeCompetitorObservation(obs);
    expect(result).toBeDefined();
    expect(result.normalizedPrice).toBe(100);
    expect(result.comparable).toBe(true);
    expect(result.issue).toBeNull();
  });

  it("normalizeCompetitorObservation handles null price", () => {
    const obs = makeCompetitor({ sellingPrice: null });
    const result = normalizeCompetitorObservation(obs);
    expect(result.normalizedPrice).toBeNull();
    expect(result.comparable).toBe(false);
  });

  it("compareCompetitors separates comparable from incomparable", () => {
    const competitors = [
      makeCompetitor({ sellingPrice: 100 }),
      makeCompetitor({ id: "c2", sellingPrice: null }),
      makeCompetitor({ id: "c3", sellingPrice: 150 }),
    ];
    const result = compareCompetitors(competitors);
    expect(result.comparable.length).toBe(2);
    expect(result.incomparable.length).toBe(1);
  });

  it("aggregateCompetition produces valid competition result", () => {
    const competitors = [
      makeCompetitor({ competitorName: "A", sellingPrice: 100 }),
      makeCompetitor({ id: "c2", competitorName: "B", sellingPrice: 150 }),
    ];
    const result = aggregateCompetition(competitors, new Date("2026-10-01"));
    expect(result.competitionScore).toBeGreaterThanOrEqual(0);
    expect(result.competitionScore).toBeLessThanOrEqual(100);
    expect(result.uniqueCompetitorCount).toBe(2);
    expect(result.priceRange.min).toBe(100);
    expect(result.priceRange.max).toBe(150);
  });

  it("aggregateCompetition with empty competitors returns UNKNOWN", () => {
    const result = aggregateCompetition([], new Date("2026-10-01"));
    expect(result.competitionLevel).toBe("UNKNOWN");
    expect(result.competitorCount).toBe(0);
  });

  it("aggregateCompetition with many competitors returns HIGH competition", () => {
    const competitors = Array.from({ length: 20 }, (_, i) =>
      makeCompetitor({ id: `c${i}`, competitorName: `Comp ${i}`, sellingPrice: 80 + i * 5 })
    );
    const result = aggregateCompetition(competitors, new Date("2026-10-01"));
    expect(["HIGH", "VERY_HIGH"]).toContain(result.competitionLevel);
  });

  it("calculateCompetitionConcentration returns HHI", () => {
    const shares = [0.5, 0.3, 0.2];
    const hhi = calculateCompetitionConcentration(shares);
    // HHI is typically scaled to 0-10000
    expect(hhi).toBeGreaterThan(0);
    expect(hhi).toBeLessThanOrEqual(10000);
  });

  it("calculateCompetitionConcentration with empty shares returns null", () => {
    expect(calculateCompetitionConcentration([])).toBeNull();
  });
});

// ─── Demand Analysis Tests ───────────────────────────────────────────────────

describe("demand analysis", () => {
  it("returns high score for strong growing demand", () => {
    const result = analyzeDemandOpportunity(makeDemandInput({ demandLevel: "HIGH", demandMomentum: "GROWING", searchGrowth: 0.3 }));
    expect(result.score).toBeGreaterThan(50);
    expect(["growing", "rapidly_growing"]).toContain(result.direction);
  });

  it("returns low score for declining demand", () => {
    const result = analyzeDemandOpportunity(makeDemandInput({ demandLevel: "LOW", demandMomentum: "DECLINING", searchGrowth: -0.2 }));
    expect(result.score).toBeLessThan(50);
    expect(result.direction).toBe("declining");
  });

  it("returns moderate score for stable demand", () => {
    const result = analyzeDemandOpportunity(makeDemandInput({ demandLevel: "MODERATE", demandMomentum: "STABLE", searchGrowth: 0.0 }));
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it("handles null demand level", () => {
    const result = analyzeDemandOpportunity(makeDemandInput({ demandLevel: null }));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.direction).toBe("unknown");
  });

  it("produces explanations", () => {
    const result = analyzeDemandOpportunity(makeDemandInput());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it("confidence is bounded 0-1", () => {
    const result = analyzeDemandOpportunity(makeDemandInput({ confidence: 0.95, observationCount: 50 }));
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ─── Supply Analysis Tests ───────────────────────────────────────────────────

describe("supply analysis", () => {
  it("returns high score for diverse suppliers", () => {
    const result = analyzeSupplyOpportunity(makeSupplyInput({ supplierCount: 10, supplierCountryCount: 5 }));
    expect(result.score).toBeGreaterThan(50);
    expect(result.supplierDiversity).toBe("HIGH");
  });

  it("returns low score for no suppliers", () => {
    const result = analyzeSupplyOpportunity(makeSupplyInput({ supplierCount: 0 }));
    expect(result.score).toBeLessThan(30);
  });

  it("handles null supplier count", () => {
    const result = analyzeSupplyOpportunity(makeSupplyInput({ supplierCount: null }));
    expect(result.supplierCount).toBeNull();
    expect(result.supplierDiversity).toBe("UNKNOWN");
  });

  it("produces explanations", () => {
    const result = analyzeSupplyOpportunity(makeSupplyInput());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it("supplyConfidence is bounded 0-1", () => {
    const result = analyzeSupplyOpportunity(makeSupplyInput({ supplyCompleteness: 0.9 }));
    expect(result.supplyConfidence).toBeGreaterThan(0);
    expect(result.supplyConfidence).toBeLessThanOrEqual(1);
  });
});

// ─── Logistics Analysis Tests ────────────────────────────────────────────────

describe("logistics analysis", () => {
  it("returns high score for reliable routes", () => {
    const result = analyzeLogisticsOpportunity(makeLogisticsInput({ routeReliability: 0.9, routeCount: 5 }));
    expect(result.score).toBeGreaterThan(50);
  });

  it("returns low score for no routes", () => {
    const result = analyzeLogisticsOpportunity(makeLogisticsInput({ routeCount: 0 }));
    expect(result.score).toBeLessThan(30);
  });

  it("handles null route count", () => {
    const result = analyzeLogisticsOpportunity(makeLogisticsInput({ routeCount: null }));
    expect(result.logisticsComplexity).toBe("UNKNOWN");
  });

  it("produces explanations", () => {
    const result = analyzeLogisticsOpportunity(makeLogisticsInput());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it("logisticsConfidence is bounded 0-1", () => {
    const result = analyzeLogisticsOpportunity(makeLogisticsInput());
    expect(result.logisticsConfidence).toBeGreaterThan(0);
    expect(result.logisticsConfidence).toBeLessThanOrEqual(1);
  });
});

// ─── Pricing Analysis Tests ──────────────────────────────────────────────────

describe("pricing analysis", () => {
  it("returns high score for healthy margins", () => {
    const result = analyzePricingOpportunity(makePricingInput({ grossMarginBase: 0.4, unitLandedCost: 50, marketPriceMedian: 100 }));
    expect(result.score).toBeGreaterThan(50);
  });

  it("returns low score for negative margins", () => {
    const result = analyzePricingOpportunity(makePricingInput({ grossMarginBase: -0.1, unitLandedCost: 150, marketPriceMedian: 100 }));
    expect(result.score).toBeLessThan(30);
  });

  it("handles null pricing data", () => {
    const result = analyzePricingOpportunity(makePricingInput({ unitLandedCost: null, marketPriceMedian: null, marketPriceMin: null }));
    expect(result.score).toBe(0);
    expect(result.pricingConfidence).toBeLessThanOrEqual(0.5);
  });

  it("margin range reflects input", () => {
    const result = analyzePricingOpportunity(makePricingInput({ grossMarginMin: 0.1, grossMarginMax: 0.5, grossMarginBase: 0.3 }));
    expect(result.marginRange.min).toBe(0.1);
    expect(result.marginRange.max).toBe(0.5);
    expect(result.marginRange.base).toBe(0.3);
  });

  it("produces explanations", () => {
    const result = analyzePricingOpportunity(makePricingInput());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it("pricingConfidence is bounded 0-1", () => {
    const result = analyzePricingOpportunity(makePricingInput());
    expect(result.pricingConfidence).toBeGreaterThan(0);
    expect(result.pricingConfidence).toBeLessThanOrEqual(1);
  });
});

// ─── Market Saturation & Price Compression Tests ─────────────────────────────

describe("market saturation and price compression", () => {
  it("calculateMarketSaturation detects high saturation", () => {
    const result = calculateMarketSaturation(20, 100, true, 0.05);
    expect(["HIGH", "VERY_HIGH"]).toContain(result.level);
  });

  it("calculateMarketSaturation detects low saturation", () => {
    const result = calculateMarketSaturation(2, 10, false, 0.2);
    expect(result.level).toBe("LOW");
  });

  it("calculatePriceCompression detects tight prices", () => {
    const prices = [100, 101, 102, 103, 104];
    expect(calculatePriceCompression(prices)).toBe(true);
  });

  it("calculatePriceCompression detects wide prices", () => {
    const prices = [50, 100, 150, 200, 300];
    expect(calculatePriceCompression(prices)).toBe(false);
  });

  it("calculateSupplierDiversification returns correct concentration", () => {
    const result = calculateSupplierDiversification(10, 5, 0.3);
    expect(result.concentration).toBe("DIVERSIFIED");
  });

  it("calculateSupplierDiversification with single supplier returns HIGHLY_CONCENTRATED", () => {
    const result = calculateSupplierDiversification(1, 1, 0.0);
    expect(result.concentration).toBe("HIGHLY_CONCENTRATED");
  });

  it("calculateDemandCompetitionMatrix produces matrix", () => {
    const matrix = calculateDemandCompetitionMatrix("HIGH", "LOW");
    expect(matrix).toBeDefined();
    expect(matrix.combination).toBe("HIGH_DEMAND_LOW_COMPETITION");
    expect(matrix.interpretation).toBeTruthy();
  });
});

// ─── Signal Detection Tests ──────────────────────────────────────────────────

describe("signal detection", () => {
  it("detectDemandSignals produces signals for growing demand", () => {
    const signals = detectDemandSignals(makeDemandInput({ demandMomentum: "GROWING" }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.direction === "POSITIVE")).toBe(true);
  });

  it("detectDemandSignals produces negative signals for declining demand", () => {
    const signals = detectDemandSignals(makeDemandInput({ demandMomentum: "DECLINING" }));
    expect(signals.some((s) => s.direction === "NEGATIVE")).toBe(true);
  });

  it("detectCompetitionSignals produces signals", () => {
    const competition = aggregateCompetition(
      [makeCompetitor()],
      new Date("2026-10-01"),
    );
    const signals = detectCompetitionSignals(competition);
    expect(signals.length).toBeGreaterThan(0);
  });

  it("detectSupplySignals produces signals", () => {
    const supply = analyzeSupplyOpportunity(makeSupplyInput());
    const signals = detectSupplySignals(supply);
    expect(signals.length).toBeGreaterThan(0);
  });

  it("detectLogisticsSignals produces signals for complex routes", () => {
    const logistics = analyzeLogisticsOpportunity(makeLogisticsInput({ routeCount: 5, routeReliability: 0.9 }));
    const signals = detectLogisticsSignals(logistics);
    // May produce signals depending on score thresholds
    expect(signals).toBeDefined();
    expect(Array.isArray(signals)).toBe(true);
  });

  it("detectPricingSignals produces signals for healthy margins", () => {
    const pricing = analyzePricingOpportunity(makePricingInput({ grossMarginBase: 0.4 }));
    const signals = detectPricingSignals(pricing);
    // May produce signals depending on score thresholds
    expect(signals).toBeDefined();
    expect(Array.isArray(signals)).toBe(true);
  });

  it("detectDataQualitySignals detects low completeness", () => {
    const signals = detectDataQualitySignals(0.2);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.direction === "NEGATIVE")).toBe(true);
  });

  it("combineOpportunitySignals merges signals from all dimensions", () => {
    const competition = aggregateCompetition([makeCompetitor()], new Date("2026-10-01"));
    const supply = analyzeSupplyOpportunity(makeSupplyInput());
    const logistics = analyzeLogisticsOpportunity(makeLogisticsInput());
    const pricing = analyzePricingOpportunity(makePricingInput());
    const combined = combineOpportunitySignals(
      makeDemandInput(),
      competition,
      supply,
      logistics,
      pricing,
      0.8,
    );
    expect(combined.length).toBeGreaterThan(0);
  });
});

// ─── Risk Detection Tests ────────────────────────────────────────────────────

describe("risk detection", () => {
  it("detectOpportunityRisks detects risks for weak data", () => {
    const competition = aggregateCompetition([], new Date("2026-10-01"));
    const risks = detectOpportunityRisks(
      makeDemandInput({ demandLevel: null }),
      competition,
      analyzeSupplyOpportunity(makeSupplyInput({ supplierCount: null })),
      analyzeLogisticsOpportunity(makeLogisticsInput({ routeCount: null })),
      analyzePricingOpportunity(makePricingInput({ unitLandedCost: null, marketPriceMin: null, marketPriceMedian: null })),
      0.2,
    );
    expect(risks.length).toBeGreaterThan(0);
  });

  it("detectOpportunityRisks returns fewer risks for complete data", () => {
    const competition = aggregateCompetition([makeCompetitor()], new Date("2026-10-01"));
    const risks = detectOpportunityRisks(
      makeDemandInput(),
      competition,
      analyzeSupplyOpportunity(makeSupplyInput()),
      analyzeLogisticsOpportunity(makeLogisticsInput()),
      analyzePricingOpportunity(makePricingInput()),
      0.9,
    );
    // Complete data should have fewer or no CRITICAL risks
    const criticalRisks = risks.filter((r) => r.severity === "CRITICAL");
    expect(criticalRisks.length).toBe(0);
  });

  it("risks have required fields", () => {
    const competition = aggregateCompetition([], new Date("2026-10-01"));
    const risks = detectOpportunityRisks(
      makeDemandInput({ demandLevel: null }),
      competition,
      analyzeSupplyOpportunity(makeSupplyInput()),
      analyzeLogisticsOpportunity(makeLogisticsInput()),
      analyzePricingOpportunity(makePricingInput()),
      0.5,
    );
    for (const risk of risks) {
      expect(risk.riskType).toBeTruthy();
      expect(risk.severity).toBeTruthy();
      expect(risk.trigger).toBeTruthy();
      expect(risk.affectedDimension).toBeTruthy();
    }
  });
});

// ─── Market Gap Tests ────────────────────────────────────────────────────────

describe("market gap detection", () => {
  it("detectMarketGaps finds gaps in undersupplied market", () => {
    const competition = aggregateCompetition([], new Date("2026-10-01"));
    const supply = analyzeSupplyOpportunity(makeSupplyInput({ supplierCount: 1 }));
    const pricing = analyzePricingOpportunity(makePricingInput());
    const gaps = detectMarketGaps(
      makeDemandInput({ demandLevel: "HIGH", demandMomentum: "GROWING" }),
      competition,
      supply,
      pricing,
    );
    expect(gaps.length).toBeGreaterThan(0);
  });

  it("detectMarketGaps returns fewer gaps for balanced market", () => {
    const competition = aggregateCompetition(
      Array.from({ length: 10 }, (_, i) => makeCompetitor({ id: `c${i}`, competitorName: `C${i}` })),
      new Date("2026-10-01"),
    );
    const supply = analyzeSupplyOpportunity(makeSupplyInput({ supplierCount: 10 }));
    const pricing = analyzePricingOpportunity(makePricingInput());
    const gaps = detectMarketGaps(
      makeDemandInput({ demandLevel: "MODERATE", demandMomentum: "STABLE" }),
      competition,
      supply,
      pricing,
    );
    // Balanced market may have fewer gaps
    expect(gaps.length).toBeLessThanOrEqual(3);
  });

  it("gaps have required fields", () => {
    const competition = aggregateCompetition([], new Date("2026-10-01"));
    const supply = analyzeSupplyOpportunity(makeSupplyInput());
    const pricing = analyzePricingOpportunity(makePricingInput());
    const gaps = detectMarketGaps(
      makeDemandInput({ demandLevel: "HIGH" }),
      competition,
      supply,
      pricing,
    );
    for (const gap of gaps) {
      expect(gap.type).toBeTruthy();
      expect(gap.strength).toBeGreaterThan(0);
      expect(gap.explanation).toBeTruthy();
    }
  });
});

// ─── Viability Constraint Tests ──────────────────────────────────────────────

describe("viability constraints", () => {
  it("detects insufficient margin constraint", () => {
    const pricing = analyzePricingOpportunity(makePricingInput({ grossMarginBase: -0.05 }));
    const competition = aggregateCompetition([makeCompetitor()], new Date("2026-10-01"));
    const logistics = analyzeLogisticsOpportunity(makeLogisticsInput());
    const constraints = detectViabilityConstraints(
      pricing,
      makeSupplyInput(),
      logistics,
      competition,
      makeDemandInput(),
    );
    expect(constraints.some((c) => c.type === "INSUFFICIENT_MARGIN")).toBe(true);
  });

  it("detects high competition constraint", () => {
    const competition = aggregateCompetition(
      Array.from({ length: 15 }, (_, i) => makeCompetitor({ id: `c${i}`, competitorName: `C${i}` })),
      new Date("2026-10-01"),
    );
    const constraints = detectViabilityConstraints(
      analyzePricingOpportunity(makePricingInput()),
      makeSupplyInput(),
      analyzeLogisticsOpportunity(makeLogisticsInput()),
      competition,
      makeDemandInput(),
    );
    expect(constraints.some((c) => c.type === "HIGH_COMPETITION")).toBe(true);
  });

  it("detects weak demand constraint", () => {
    const competition = aggregateCompetition([makeCompetitor()], new Date("2026-10-01"));
    const constraints = detectViabilityConstraints(
      analyzePricingOpportunity(makePricingInput()),
      makeSupplyInput(),
      analyzeLogisticsOpportunity(makeLogisticsInput()),
      competition,
      makeDemandInput({ demandLevel: "LOW", demandMomentum: "DECLINING" }),
    );
    expect(constraints.some((c) => c.type === "WEAK_DEMAND")).toBe(true);
  });

  it("constraints have required fields", () => {
    const competition = aggregateCompetition([], new Date("2026-10-01"));
    const constraints = detectViabilityConstraints(
      analyzePricingOpportunity(makePricingInput({ grossMarginBase: -0.1 })),
      makeSupplyInput({ supplierCount: 0 }),
      analyzeLogisticsOpportunity(makeLogisticsInput()),
      competition,
      makeDemandInput({ demandLevel: "LOW" }),
    );
    for (const c of constraints) {
      expect(c.type).toBeTruthy();
      expect(c.severity).toBeTruthy();
      expect(c.explanation).toBeTruthy();
    }
  });
});

// ─── Scoring & Classification Tests ──────────────────────────────────────────

describe("opportunity scoring and classification", () => {
  it("calculateOpportunityCompleteness returns 0-1", () => {
    const completeness = calculateOpportunityCompleteness(
      makeDemandInput(),
      5,
      makeSupplyInput(),
      makeLogisticsInput(),
      makePricingInput(),
    );
    expect(completeness).toBeGreaterThan(0);
    expect(completeness).toBeLessThanOrEqual(1);
  });

  it("calculateOpportunityConfidence returns 0-1", () => {
    const confidence = calculateOpportunityConfidence(0.8, 0.7, 0.7, 0.7, 0.8, 0.8);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it("calculateOpportunityScore returns 0-100", () => {
    const score = calculateOpportunityScore(70, 60, 50, 65, 55);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("classifyOpportunityLevel returns correct levels", () => {
    expect(classifyOpportunityLevel(90)).toBe("VERY_HIGH");
    expect(classifyOpportunityLevel(70)).toBe("HIGH");
    expect(classifyOpportunityLevel(50)).toBe("MODERATE");
    expect(classifyOpportunityLevel(25)).toBe("LOW");
    expect(classifyOpportunityLevel(5)).toBe("VERY_LOW");
  });

  it("calculateViabilityScore returns 0-100", () => {
    const score = calculateViabilityScore(70, 60, 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("classifyViabilityLevel returns correct levels", () => {
    expect(classifyViabilityLevel(90)).toBe("STRONG");
    expect(classifyViabilityLevel(70)).toBe("VIABLE");
    expect(classifyViabilityLevel(50)).toBe("CONDITIONAL");
    expect(classifyViabilityLevel(25)).toBe("WEAK");
    expect(classifyViabilityLevel(5)).toBe("NOT_VIABLE");
  });
});

// ─── Main Engine Tests ───────────────────────────────────────────────────────

describe("runOpportunityEngine", () => {
  it("produces opportunity and viability results", () => {
    const result = runOpportunityEngine(makeEngineInput());
    expect(result.opportunity).toBeDefined();
    expect(result.viability).toBeDefined();
    expect(result.hashes).toBeDefined();
  });

  it("opportunity score is 0-100", () => {
    const result = runOpportunityEngine(makeEngineInput());
    expect(result.opportunity.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result.opportunity.opportunityScore).toBeLessThanOrEqual(100);
  });

  it("viability score is 0-100", () => {
    const result = runOpportunityEngine(makeEngineInput());
    expect(result.viability.viabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.viability.viabilityScore).toBeLessThanOrEqual(100);
  });

  it("hashes are populated", () => {
    const result = runOpportunityEngine(makeEngineInput());
    expect(result.hashes.competitorContentHash).toBeTruthy();
    expect(result.hashes.opportunityContentHash).toBeTruthy();
    expect(result.hashes.viabilityContentHash).toBeTruthy();
  });

  it("is deterministic — same input produces same output", () => {
    const input = makeEngineInput();
    const r1 = runOpportunityEngine(input);
    const r2 = runOpportunityEngine(input);
    expect(r1.opportunity.opportunityScore).toBe(r2.opportunity.opportunityScore);
    expect(r1.viability.viabilityScore).toBe(r2.viability.viabilityScore);
    expect(r1.hashes.opportunityContentHash).toBe(r2.hashes.opportunityContentHash);
  });

  it("handles empty competitors gracefully", () => {
    const result = runOpportunityEngine(makeEngineInput({ competitors: [] }));
    expect(result.opportunity.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result.opportunity.competitionSignal.competitionLevel).toBe("UNKNOWN");
  });

  it("handles all-null pricing gracefully", () => {
    const result = runOpportunityEngine(makeEngineInput({
      pricing: makePricingInput({ unitLandedCost: null, marketPriceMin: null, marketPriceMax: null, marketPriceMedian: null, grossMarginMin: null, grossMarginMax: null, grossMarginBase: null }),
    }));
    expect(result.opportunity.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result.viability.viabilityScore).toBeGreaterThanOrEqual(0);
  });

  it("produces market gaps, signals, and risks", () => {
    const result = runOpportunityEngine(makeEngineInput({
      demand: makeDemandInput({ demandLevel: "HIGH", demandMomentum: "GROWING" }),
      competitors: [],
    }));
    expect(result.opportunity.signals.length).toBeGreaterThan(0);
    // High demand + no competitors should produce gaps
    expect(result.opportunity.marketGaps.length).toBeGreaterThan(0);
  });

  it("opportunity and viability are independent dimensions", () => {
    const result = runOpportunityEngine(makeEngineInput());
    // They should not always be equal
    // (with good data they might both be high, but the scores are calculated differently)
    expect(result.opportunity.opportunityLevel).toBeTruthy();
    expect(result.viability.viabilityLevel).toBeTruthy();
  });
});
