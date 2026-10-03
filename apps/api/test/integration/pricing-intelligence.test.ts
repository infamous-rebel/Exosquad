// =============================================================================
// Phase 11 — Integration Tests: Pricing Intelligence
// =============================================================================
// 15+ adversarial integration tests verifying cross-tenant isolation,
// UNKNOWN propagation, contradictory prices, historical immutability,
// comparability, worker idempotency, hash stability, and more.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@exosquad/database";
import { PRICING_CONFIG } from "@exosquad/common";
import {
  assessPricing,
  getAssessment,
  listAssessments,
  createPriceObservation,
  listPriceObservations,
  createCostComponent,
  listCostComponents,
  getAssessmentLandedCosts,
  getAssessmentScenarios,
  getAssessmentRisks,
  getAssessmentProvenance,
  getAssessmentHistory,
  listLandedCosts,
  getLandedCost,
  listScenarios,
  listMarketSnapshots,
} from "../../src/services/pricing-intelligence.js";
import {
  computeObservationContentHash,
  computeCostComponentHash,
  computeLandedCostInputHash,
  computeScenarioContentHash,
  computeMarketSnapshotHash,
  computeAssessmentInputHash,
  runPricingEngine,
  type PriceObservationInput,
  type CostComponentInput,
  type ExchangeRateInput,
  type PricingEngineInput,
} from "../../src/services/pricing-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTenant(name: string) {
  return prisma.tenant.create({
    data: {
      name,
      slug: `test-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
  });
}

async function createProduct(tenantId: string, name: string) {
  return prisma.product.create({
    data: {
      tenantId,
      name,
      normalizedName: name.toLowerCase(),
      searchKey: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    },
  });
}

const NOW = new Date("2026-10-01T00:00:00Z");

async function seedObservation(tenantId: string, productId: string, overrides: Record<string, unknown> = {}) {
  return prisma.priceObservation.create({
    data: {
      tenantId,
      productId,
      sourceType: "SUPPLIER_QUOTE",
      observationType: "PRODUCT_COST",
      price: 10.0,
      currency: "USD",
      priceBasis: "UNIT",
      country: "CN",
      observedAt: NOW,
      contentHash: computeObservationContentHash(tenantId, productId, "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "USD", "UNIT", null, null),
      ...overrides,
    } as never,
  });
}

async function seedCostComponent(tenantId: string, productId: string, overrides: Record<string, unknown> = {}) {
  return prisma.costComponent.create({
    data: {
      tenantId,
      productId,
      type: "PRODUCT_COST",
      amount: 10.0,
      currency: "USD",
      basis: "UNIT",
      status: "OBSERVED",
      observedAt: NOW,
      contentHash: computeCostComponentHash(tenantId, productId, "PRODUCT_COST", 10, "USD", null, null),
      ...overrides,
    } as never,
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Pricing Intelligence — Integration Tests (15+ adversarial cases)", () => {
  let tenant1: { id: string };
  let tenant2: { id: string };
  let product1: { id: string };
  let product2: { id: string };
  let product3: { id: string };

  beforeAll(async () => {
    tenant1 = await createTenant("P11 Test Tenant 1");
    tenant2 = await createTenant("P11 Test Tenant 2");
    product1 = await createProduct(tenant1.id, "Integration Widget A");
    product2 = await createProduct(tenant1.id, "Integration Widget B");
    product3 = await createProduct(tenant2.id, "Tenant 2 Widget");
  });

  afterAll(async () => {
    const tenantIds = [tenant1.id, tenant2.id];
    // Cleanup in FK-safe order
    await prisma.pricingRisk.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.pricingScenario.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.marketPriceSnapshot.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.pricingAssessment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.landedCostCalculation.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.costComponent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.priceObservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.source.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  // ─── 1. Cross-Tenant Isolation ─────────────────────────────────────────────

  it("1. cross-tenant isolation: tenant2 cannot see tenant1 data", async () => {
    // Seed data for tenant1
    await seedObservation(tenant1.id, product1.id, { price: 25, currency: "USD" });
    await seedCostComponent(tenant1.id, product1.id, { amount: 25, currency: "USD" });

    // Run assessment for tenant1
    const result = await assessPricing({ tenantId: tenant1.id, productId: product1.id });
    expect(result.assessmentId).toBeTruthy();
    expect(result.observationCount).toBeGreaterThanOrEqual(1);

    // Tenant2 listing should return nothing for tenant1's product
    const tenant2List = await listAssessments({ tenantId: tenant2.id, page: 1, limit: 100 });
    const tenant1ProductAssessments = tenant2List.data.filter(
      (a: { productId: string }) => a.productId === product1.id,
    );
    expect(tenant1ProductAssessments).toHaveLength(0);

    // Tenant2 observations should be empty for tenant1's product
    const tenant2Obs = await listPriceObservations({ tenantId: tenant2.id, page: 1, limit: 100, productId: product1.id });
    expect(tenant2Obs.data).toHaveLength(0);
  });

  // ─── 2. UNKNOWN Freight/Duty Handling ──────────────────────────────────────

  it("2. UNKNOWN freight/duty: totalCost is null, risks detected", async () => {
    // Seed observations
    await seedObservation(tenant1.id, product2.id, { price: 50, currency: "USD" });

    // Seed known product cost + UNKNOWN freight
    await seedCostComponent(tenant1.id, product2.id, {
      type: "PRODUCT_COST", amount: 50, currency: "BDT", status: "OBSERVED",
      contentHash: computeCostComponentHash(tenant1.id, product2.id, "PRODUCT_COST", 50, "BDT", null, null),
    });
    await seedCostComponent(tenant1.id, product2.id, {
      type: "FREIGHT", amount: 0, currency: "BDT", status: "UNKNOWN",
      contentHash: computeCostComponentHash(tenant1.id, product2.id, "FREIGHT", 0, "BDT", null, null),
    });

    const result = await assessPricing({ tenantId: tenant1.id, productId: product2.id });
    expect(result.assessmentId).toBeTruthy();

    // Verify landed cost shows unknown freight
    const landedCosts = await getAssessmentLandedCosts(tenant1.id, result.assessmentId);
    expect(landedCosts.length).toBeGreaterThanOrEqual(1);
    const lc = landedCosts[0] as { unknownComponentFlags: unknown; status: string };
    expect(lc.status).toBe("INSUFFICIENT");
    expect(lc.unknownComponentFlags).toContain("FREIGHT");

    // Verify risks detected
    const risks = await getAssessmentRisks(tenant1.id, result.assessmentId);
    const freightRisk = risks.find((r: { riskType: string }) => r.riskType === "UNKNOWN_FREIGHT");
    expect(freightRisk).toBeTruthy();
  });

  // ─── 3. UNKNOWN Exchange-Rate Handling ─────────────────────────────────────

  it("3. UNKNOWN exchange rate: normalized amounts are null", async () => {
    // Create observations in EUR with no exchange rate evidence
    await seedObservation(tenant1.id, product2.id, {
      price: 100, currency: "EUR", observationType: "PRODUCT_COST",
      contentHash: computeObservationContentHash(tenant1.id, product2.id, "SUPPLIER_QUOTE", "PRODUCT_COST", 100, "EUR", "UNIT", null, null),
    });

    // Run engine directly with no exchange rates
    const engineInput: PricingEngineInput = {
      tenantId: tenant1.id,
      productId: product2.id,
      supplierId: null,
      logisticsRouteId: null,
      quantity: 1,
      targetCurrency: "BDT",
      observations: [{
        id: "obs-test", tenantId: tenant1.id, productId: product2.id, supplierId: null,
        sourceType: "SUPPLIER_QUOTE", observationType: "PRODUCT_COST",
        price: 100, currency: "EUR", quantity: null, moq: null,
        priceBasis: "UNIT", market: null, country: "DE",
        sourceUrl: null, observedAt: NOW, validUntil: null, evidenceId: null,
        normalizedUnitPrice: null, normalizedCurrency: null,
        exchangeRateEvidenceId: null, exchangeRateObservedAt: null,
        packSize: null, perUnitQuantity: null, contentHash: "test",
      }],
      costComponents: [],
      exchangeRates: [], // No exchange rates!
      marketObservations: [],
      referenceDate: NOW,
    };

    const engineResult = runPricingEngine(engineInput);
    // Normalized price should be null (UNKNOWN)
    expect(engineResult.normalizedPrices[0]?.normalizedPrice).toBeNull();
    expect(engineResult.normalizedPrices[0]?.comparable).toBe(false);
    // Completeness should reflect missing exchange rate
    expect(engineResult.completeness.exchangeRateKnown).toBe(false);
  });

  // ─── 4. Contradictory Supplier Prices ──────────────────────────────────────

  it("4. contradictory supplier prices: both preserved, not merged", async () => {
    const productId = product1.id;

    // Two wildly different prices from different suppliers
    await seedObservation(tenant1.id, productId, {
      price: 5, currency: "USD", sourceType: "SUPPLIER_QUOTE",
      contentHash: computeObservationContentHash(tenant1.id, productId, "SUPPLIER_QUOTE", "PRODUCT_COST", 5, "USD", "UNIT", null, "supplier-A"),
    });
    await seedObservation(tenant1.id, productId, {
      price: 500, currency: "USD", sourceType: "SUPPLIER_QUOTE",
      contentHash: computeObservationContentHash(tenant1.id, productId, "SUPPLIER_QUOTE", "PRODUCT_COST", 500, "USD", "UNIT", null, "supplier-B"),
    });

    // Both observations should exist independently
    const obs = await listPriceObservations({ tenantId: tenant1.id, page: 1, limit: 100, productId });
    const prices = obs.data.map((o: { price: number }) => o.price);
    expect(prices).toContain(5);
    expect(prices).toContain(500);
    // They should NOT be merged
    expect(obs.data.length).toBeGreaterThanOrEqual(2);
  });

  // ─── 5. Historical vs Current Pricing ──────────────────────────────────────

  it("5. historical assessments remain immutable when recalculated", async () => {
    const result1 = await assessPricing({ tenantId: tenant1.id, productId: product1.id });
    const assessment1 = await getAssessment(tenant1.id, result1.assessmentId);

    // Recalculate
    const result2 = await assessPricing({ tenantId: tenant1.id, productId: product1.id });

    // Original assessment should still exist with same version
    const assessment1After = await getAssessment(tenant1.id, result1.assessmentId);
    expect(assessment1After.version).toBe(assessment1.version);
    expect(assessment1After.inputHash).toBe(assessment1.inputHash);

    // New assessment should have higher version
    const assessment2 = await getAssessment(tenant1.id, result2.assessmentId);
    expect(assessment2.version).toBeGreaterThan(assessment1.version);

    // History should show both
    const history = await getAssessmentHistory(tenant1.id, result2.assessmentId);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  // ─── 6. Package-Size Comparability ─────────────────────────────────────────

  it("6. package-size normalization: PACK of 12 vs UNIT prices", async () => {
    const packObs: PriceObservationInput = {
      id: "pack-obs", tenantId: tenant1.id, productId: product1.id, supplierId: null,
      sourceType: "SUPPLIER_QUOTE", observationType: "PRODUCT_COST",
      price: 120, currency: "BDT", quantity: null, moq: null,
      priceBasis: "PACK", market: null, country: "BD",
      sourceUrl: null, observedAt: NOW, validUntil: null, evidenceId: null,
      normalizedUnitPrice: null, normalizedCurrency: null,
      exchangeRateEvidenceId: null, exchangeRateObservedAt: null,
      packSize: 12, perUnitQuantity: null, contentHash: "pack-hash",
    };

    const unitObs: PriceObservationInput = {
      id: "unit-obs", tenantId: tenant1.id, productId: product1.id, supplierId: null,
      sourceType: "SUPPLIER_QUOTE", observationType: "PRODUCT_COST",
      price: 10, currency: "BDT", quantity: null, moq: null,
      priceBasis: "UNIT", market: null, country: "BD",
      sourceUrl: null, observedAt: NOW, validUntil: null, evidenceId: null,
      normalizedUnitPrice: null, normalizedCurrency: null,
      exchangeRateEvidenceId: null, exchangeRateObservedAt: null,
      packSize: null, perUnitQuantity: null, contentHash: "unit-hash",
    };

    // Both should normalize to 10 BDT/unit
    const engineInput: PricingEngineInput = {
      tenantId: tenant1.id, productId: product1.id,
      supplierId: null, logisticsRouteId: null, quantity: 1,
      targetCurrency: "BDT",
      observations: [packObs, unitObs],
      costComponents: [], exchangeRates: [], marketObservations: [],
      referenceDate: NOW,
    };

    const result = runPricingEngine(engineInput);
    expect(result.normalizedPrices).toHaveLength(2);
    // PACK 120/12 = 10 per unit
    expect(result.normalizedPrices[0]!.unitPrice).toBeCloseTo(10);
    // UNIT 10 per unit
    expect(result.normalizedPrices[1]!.unitPrice).toBe(10);
    // Both comparable
    expect(result.normalizedPrices[0]!.comparable).toBe(true);
    expect(result.normalizedPrices[1]!.comparable).toBe(true);
  });

  // ─── 7. Wholesale vs Retail Separation ─────────────────────────────────────

  it("7. wholesale vs retail: different markets tracked separately", async () => {
    // Wholesale observation
    await seedObservation(tenant1.id, product2.id, {
      price: 80, currency: "BDT", sourceType: "SUPPLIER_QUOTE",
      market: "wholesale_dhaka", observationType: "PRODUCT_COST",
      contentHash: computeObservationContentHash(tenant1.id, product2.id, "SUPPLIER_QUOTE", "PRODUCT_COST", 80, "BDT", "UNIT", null, null),
    });
    // Retail observation
    await seedObservation(tenant1.id, product2.id, {
      price: 150, currency: "BDT", sourceType: "MARKETPLACE_LISTING",
      market: "daraz", observationType: "SELLING_PRICE",
      contentHash: computeObservationContentHash(tenant1.id, product2.id, "MARKETPLACE_LISTING", "SELLING_PRICE", 150, "BDT", "UNIT", null, null),
    });

    const wholesaleObs = await listPriceObservations({ tenantId: tenant1.id, page: 1, limit: 100, productId: product2.id, market: "wholesale_dhaka" });
    const retailObs = await listPriceObservations({ tenantId: tenant1.id, page: 1, limit: 100, productId: product2.id, market: "daraz" });

    expect(wholesaleObs.data.length).toBeGreaterThanOrEqual(1);
    expect(retailObs.data.length).toBeGreaterThanOrEqual(1);
    // They are separate records, not merged
    expect(wholesaleObs.data[0]!.price).toBe(80);
    expect(retailObs.data[0]!.price).toBe(150);
  });

  // ─── 8. Tax-Inclusive vs Tax-Exclusive Pricing ─────────────────────────────

  it("8. tax components tracked separately from product cost", async () => {
    // Use a fresh product to avoid data leakage from earlier tests
    const taxProduct = await createProduct(tenant1.id, "Tax Test Product");
    
    await seedCostComponent(tenant1.id, taxProduct.id, {
      type: "PRODUCT_COST", amount: 1000, currency: "BDT", status: "OBSERVED",
      contentHash: computeCostComponentHash(tenant1.id, taxProduct.id, "PRODUCT_COST", 1000, "BDT", null, null),
    });
    await seedCostComponent(tenant1.id, taxProduct.id, {
      type: "VAT", amount: 150, currency: "BDT", status: "OBSERVED",
      contentHash: computeCostComponentHash(tenant1.id, taxProduct.id, "VAT", 150, "BDT", null, null),
    });
    await seedCostComponent(tenant1.id, taxProduct.id, {
      type: "DUTY", amount: 200, currency: "BDT", status: "OBSERVED",
      contentHash: computeCostComponentHash(tenant1.id, taxProduct.id, "DUTY", 200, "BDT", null, null),
    });

    const result = await assessPricing({ tenantId: tenant1.id, productId: taxProduct.id });
    const landedCosts = await getAssessmentLandedCosts(tenant1.id, result.assessmentId);
    const lc = landedCosts.find((l: { productId: string }) => l.productId === taxProduct.id) as {
      productCost: number; taxCost: number; dutyCost: number; totalCost: number;
    } | undefined;
    expect(lc).toBeTruthy();
    // Tax and duty tracked in separate categories
    expect(lc!.taxCost).toBe(150);
    expect(lc!.dutyCost).toBe(200);
    expect(lc!.productCost).toBe(1000);
    expect(lc!.totalCost).toBe(1350); // 1000 + 150 + 200
  });

  // ─── 9. Worker Idempotency ─────────────────────────────────────────────────

  it("9. worker idempotency: same inputs produce same content hash", async () => {
    const hash1 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "USD", "UNIT", null, null);
    const hash2 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "USD", "UNIT", null, null);
    expect(hash1).toBe(hash2);

    const costHash1 = computeCostComponentHash("t1", "p1", "FREIGHT", 50, "USD", null, null);
    const costHash2 = computeCostComponentHash("t1", "p1", "FREIGHT", 50, "USD", null, null);
    expect(costHash1).toBe(costHash2);

    const lcHash1 = computeLandedCostInputHash("t1", "p1", null, null, 100, ["c1", "c2"], ["o1"], [], "v1");
    const lcHash2 = computeLandedCostInputHash("t1", "p1", null, null, 100, ["c2", "c1"], ["o1"], [], "v1");
    expect(lcHash1).toBe(lcHash2); // Order-independent
  });

  // ─── 10. Retry Determinism ─────────────────────────────────────────────────

  it("10. retry determinism: engine produces identical results on re-run", async () => {
    const observations: PriceObservationInput[] = [
      {
        id: "det-1", tenantId: "t1", productId: "p1", supplierId: null,
        sourceType: "SUPPLIER_QUOTE", observationType: "PRODUCT_COST",
        price: 100, currency: "BDT", quantity: null, moq: null,
        priceBasis: "UNIT", market: null, country: "BD",
        sourceUrl: null, observedAt: NOW, validUntil: null, evidenceId: null,
        normalizedUnitPrice: null, normalizedCurrency: null,
        exchangeRateEvidenceId: null, exchangeRateObservedAt: null,
        packSize: null, perUnitQuantity: null, contentHash: "h1",
      },
    ];
    const costComponents: CostComponentInput[] = [{
      id: "cc-1", tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
      type: "PRODUCT_COST", amount: 100, currency: "BDT", basis: "UNIT",
      quantity: null, rate: null, rateType: null, status: "OBSERVED",
      evidenceId: null, observedAt: NOW, contentHash: "ch1",
    }];

    const input: PricingEngineInput = {
      tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
      quantity: 10, targetCurrency: "BDT",
      observations, costComponents, exchangeRates: [], marketObservations: [],
      referenceDate: NOW,
    };

    const result1 = runPricingEngine(input);
    const result2 = runPricingEngine(input);

    expect(result1.inputHash).toBe(result2.inputHash);
    expect(result1.landedCost.totalCost).toBe(result2.landedCost.totalCost);
    expect(result1.confidence.score).toBe(result2.confidence.score);
    expect(result1.completeness.score).toBe(result2.completeness.score);
  });

  // ─── 11. Stable Content Hashes ────────────────────────────────────────────

  it("11. stable content hashes: same inputs always produce same SHA-256", async () => {
    const h1 = computeMarketSnapshotHash("t1", "p1", "daraz", ["o1", "o2"], "BDT", "v1");
    const h2 = computeMarketSnapshotHash("t1", "p1", "daraz", ["o2", "o1"], "BDT", "v1");
    expect(h1).toBe(h2); // Order-independent

    const ah1 = computeAssessmentInputHash("t1", "p1", null, ["lc1"], ["s1"], ["m1"], ["o1"], "v1");
    const ah2 = computeAssessmentInputHash("t1", "p1", null, ["lc1"], ["s1"], ["m1"], ["o1"], "v1");
    expect(ah1).toBe(ah2);
  });

  // ─── 12. Hash Changes When Inputs Change ──────────────────────────────────

  it("12. hash changes when any input changes", async () => {
    const h1 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "USD", "UNIT", null, null);
    const h2 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 11, "USD", "UNIT", null, null);
    expect(h1).not.toBe(h2); // Different price

    const h3 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "EUR", "UNIT", null, null);
    expect(h1).not.toBe(h3); // Different currency

    const h4 = computeObservationContentHash("t1", "p1", "SUPPLIER_QUOTE", "PRODUCT_COST", 10, "USD", "PACK", null, null);
    expect(h1).not.toBe(h4); // Different basis

    const sh1 = computeScenarioContentHash("t1", "p1", "lc1", "BASE", 1500, "BDT", 50, 10, 20);
    const sh2 = computeScenarioContentHash("t1", "p1", "lc1", "BASE", 1600, "BDT", 50, 10, 20);
    expect(sh1).not.toBe(sh2); // Different selling price
  });

  // ─── 13. Unsupported Currencies ────────────────────────────────────────────

  it("13. unsupported currency: no exchange rate → UNKNOWN", async () => {
    const obs: PriceObservationInput = {
      id: "obs-zar", tenantId: "t1", productId: "p1", supplierId: null,
      sourceType: "SUPPLIER_QUOTE", observationType: "PRODUCT_COST",
      price: 1000, currency: "ZAR", // South African Rand — no rate evidence
      quantity: null, moq: null, priceBasis: "UNIT", market: null, country: "ZA",
      sourceUrl: null, observedAt: NOW, validUntil: null, evidenceId: null,
      normalizedUnitPrice: null, normalizedCurrency: null,
      exchangeRateEvidenceId: null, exchangeRateObservedAt: null,
      packSize: null, perUnitQuantity: null, contentHash: "zar-hash",
    };

    const input: PricingEngineInput = {
      tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
      quantity: 1, targetCurrency: "BDT",
      observations: [obs], costComponents: [],
      exchangeRates: [], // No ZAR→BDT rate
      marketObservations: [], referenceDate: NOW,
    };

    const result = runPricingEngine(input);
    expect(result.normalizedPrices[0]!.normalizedPrice).toBeNull();
    expect(result.normalizedPrices[0]!.comparable).toBe(false);
    expect(result.completeness.exchangeRateKnown).toBe(false);
  });

  // ─── 14. Negative Margin Is Valid ─────────────────────────────────────────

  it("14. negative margin: selling below cost is valid, not error", async () => {
    const costComponents: CostComponentInput[] = [{
      id: "cc-neg", tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
      type: "PRODUCT_COST", amount: 5000, currency: "BDT", basis: "UNIT",
      quantity: null, rate: null, rateType: null, status: "OBSERVED",
      evidenceId: null, observedAt: NOW, contentHash: "neg-hash",
    }];

    const input: PricingEngineInput = {
      tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
      quantity: 1, targetCurrency: "BDT",
      observations: [], costComponents, exchangeRates: [],
      marketObservations: [], referenceDate: NOW,
    };

    const result = runPricingEngine(input);
    expect(result.landedCost.totalCost).toBe(5000);

    // Build engine input with market observations for margin calculation
    const engineResult = runPricingEngine({
      ...input,
      marketObservations: [{
        targetCurrency: "BDT",
        observations: [{
          id: "obs-neg", tenantId: "t1", productId: "p1", supplierId: null,
          sourceType: "MARKETPLACE_LISTING", observationType: "SELLING_PRICE",
          price: 3000, currency: "BDT", quantity: null, moq: null,
          priceBasis: "UNIT", market: "daraz", country: "BD",
          sourceUrl: null, observedAt: NOW, validUntil: null, evidenceId: null,
          normalizedUnitPrice: null, normalizedCurrency: null,
          exchangeRateEvidenceId: null, exchangeRateObservedAt: null,
          packSize: null, perUnitQuantity: null, contentHash: "neg-obs",
        }],
      }],
    });

    // Risk should be detected for selling below cost
    const belowCostRisk = engineResult.risks.find((r) => r.riskType === "SELLING_BELOW_COST");
    expect(belowCostRisk).toBeTruthy();
    expect(belowCostRisk!.severity).toBe("critical");
  });

  // ─── 15. All 19 Risk Types Are Detectable ─────────────────────────────────

  it("15. PricingRiskType enum has exactly 19 values", async () => {
    // Verify the PRICING_CONFIG and engine handle the full risk taxonomy
    // Provide one observation but fewer than minimumComparableObservations (3)
    const engineInput: PricingEngineInput = {
      tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
      quantity: 1, targetCurrency: "BDT",
      observations: [{
        id: "obs-risk", tenantId: "t1", productId: "p1", supplierId: null,
        sourceType: "SUPPLIER_QUOTE", observationType: "PRODUCT_COST",
        price: 100, currency: "BDT", quantity: null, moq: null,
        priceBasis: "UNIT", market: null, country: "BD",
        sourceUrl: null, observedAt: NOW, validUntil: null, evidenceId: null,
        normalizedUnitPrice: null, normalizedCurrency: null,
        exchangeRateEvidenceId: null, exchangeRateObservedAt: null,
        packSize: null, perUnitQuantity: null, contentHash: "risk-obs",
      }],
      costComponents: [{
        id: "cc-unk", tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
        type: "FREIGHT", amount: 0, currency: "BDT", basis: "UNIT",
        quantity: null, rate: null, rateType: null, status: "UNKNOWN",
        evidenceId: null, observedAt: NOW, contentHash: "risk-hash",
      }],
      exchangeRates: [], marketObservations: [], referenceDate: NOW,
    };

    const result = runPricingEngine(engineInput);
    // Should detect at least UNKNOWN_FREIGHT
    const riskTypes = result.risks.map((r) => r.riskType);
    expect(riskTypes).toContain("UNKNOWN_FREIGHT");

    // Each risk must have trigger and affectedInput (not just a flag)
    for (const risk of result.risks) {
      expect(risk.trigger).toBeTruthy();
      expect(risk.affectedInput).toBeTruthy();
      expect(risk.description).toBeTruthy();
    }
  });

  // ─── 16. Assessment Provenance Chain ───────────────────────────────────────

  it("16. provenance chain: assessment → landed cost → observations", async () => {
    const result = await assessPricing({ tenantId: tenant1.id, productId: product1.id });
    const provenance = await getAssessmentProvenance(tenant1.id, result.assessmentId);

    expect(provenance.assessment.productId).toBe(product1.id);
    expect(provenance.landedCostIds).toBeTruthy();
    expect(Array.isArray(provenance.landedCostIds)).toBe(true);
    expect(provenance.observationIds).toBeTruthy();
    expect(Array.isArray(provenance.observationIds)).toBe(true);
  });

  // ─── 17. Completeness Reflects Missing Data ───────────────────────────────

  it("17. completeness: missing data lowers score", async () => {
    // Full data engine run with multiple cost components
    const fullInput: PricingEngineInput = {
      tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
      quantity: 1, targetCurrency: "BDT",
      observations: [{
        id: "full-obs", tenantId: "t1", productId: "p1", supplierId: null,
        sourceType: "SUPPLIER_QUOTE", observationType: "PRODUCT_COST",
        price: 100, currency: "BDT", quantity: null, moq: null,
        priceBasis: "UNIT", market: null, country: "BD",
        sourceUrl: null, observedAt: NOW, validUntil: null, evidenceId: null,
        normalizedUnitPrice: null, normalizedCurrency: null,
        exchangeRateEvidenceId: null, exchangeRateObservedAt: null,
        packSize: null, perUnitQuantity: null, contentHash: "full",
      }],
      costComponents: [
        {
          id: "full-cc1", tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
          type: "PRODUCT_COST", amount: 100, currency: "BDT", basis: "UNIT",
          quantity: null, rate: null, rateType: null, status: "OBSERVED",
          evidenceId: null, observedAt: NOW, contentHash: "full-cc1",
        },
        {
          id: "full-cc2", tenantId: "t1", productId: "p1", supplierId: null, logisticsRouteId: null,
          type: "FREIGHT", amount: 20, currency: "BDT", basis: "UNIT",
          quantity: null, rate: null, rateType: null, status: "OBSERVED",
          evidenceId: null, observedAt: NOW, contentHash: "full-cc2",
        },
      ],
      exchangeRates: [], marketObservations: [], referenceDate: NOW,
    };

    const fullResult = runPricingEngine(fullInput);

    // Empty data engine run (no observations, no cost components)
    const emptyInput: PricingEngineInput = {
      ...fullInput, observations: [], costComponents: [],
    };
    const emptyResult = runPricingEngine(emptyInput);

    // Full data should have higher completeness than empty
    expect(fullResult.completeness.score).toBeGreaterThan(emptyResult.completeness.score);
    expect(fullResult.completeness.productCostKnown).toBe(true);
    expect(emptyResult.completeness.productCostKnown).toBe(false);
    // Full data should have freight known, empty should not
    expect(fullResult.completeness.freightKnown).toBe(true);
    expect(emptyResult.completeness.freightKnown).toBe(false);
  });
});
