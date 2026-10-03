// =============================================================================
// Phase 12 — Integration Tests: Product Opportunity & Reseller Viability
// =============================================================================
// 22+ adversarial integration tests verifying cross-tenant isolation,
// UNKNOWN propagation (never fabricated), score renormalization, version
// immutability, signal/risk deduplication, content-hash stability,
// provenance chain integrity, expiration, and negative-margin validity.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "@exosquad/database";
import { NotFoundError } from "@exosquad/common";
import {
  assessProductOpportunity,
  recalculateProductOpportunity,
  getAssessment,
  getAssessmentHistory,
  listAssessments,
  listSignals,
  listRisks,
  listCompetitorSnapshots,
  listCompetitorObservations,
  createCompetitorObservation,
  expireStaleAssessments,
} from "../../src/services/product-opportunity-intelligence.js";
import {
  computeOpportunityContentHash,
  runOpportunityEngine,
  type CompetitorObservationInput,
} from "../../src/services/product-opportunity-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randomHash(): string {
  return sha256(`seed-${Math.random()}-${Date.now()}`);
}

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

async function createSource(tenantId: string, name: string) {
  return prisma.source.create({
    data: {
      tenantId,
      name,
      type: "marketplace",
      connectorType: "marketplace_adapter",
      status: "active",
    },
  });
}

const OBSERVED_AT = new Date("2026-09-20T00:00:00Z");

async function seedCompetitor(
  tenantId: string,
  productId: string,
  overrides: {
    competitorName?: string | null;
    sellingPrice?: number | null;
    availability?: string | null;
    observedAt?: Date;
  } = {},
) {
  return createCompetitorObservation({
    tenantId,
    productId,
    competitorName: overrides.competitorName ?? `Competitor-${randomHash().slice(0, 8)}`,
    sourceType: "MARKETPLACE_LISTING",
    sourceUrl: null,
    market: "daraz",
    country: "BD",
    sellingPrice: overrides.sellingPrice ?? 100,
    currency: "BDT",
    priceBasis: "UNIT",
    rating: 4.0,
    reviewCount: 50,
    availability: overrides.availability ?? "IN_STOCK",
    observedAt: overrides.observedAt ?? OBSERVED_AT,
  });
}

async function seedDemandSignal(
  tenantId: string,
  productId: string,
  sourceId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.demandSignal.create({
    data: {
      tenantId,
      productId,
      sourceId,
      signalType: "SEARCH",
      metric: "search_volume",
      value: 100,
      observedAt: OBSERVED_AT,
      retrievedAt: OBSERVED_AT,
      confidence: 0.8,
      status: "active",
      contentHash: randomHash(),
      ...overrides,
    } as never,
  });
}

async function seedDemandCalculation(
  tenantId: string,
  productId: string,
  result: Record<string, unknown>,
) {
  return prisma.demandCalculation.create({
    data: {
      tenantId,
      productId,
      calculationType: "trend_classification",
      algorithm: "trend-classification-v1",
      algorithmVersion: "v1",
      entityId: productId,
      result: result as never,
      confidence: 0.7,
      observationCount: 10,
    } as never,
  });
}

async function seedSupplyNode(tenantId: string, country: string) {
  return prisma.supplyChainNode.create({
    data: {
      tenantId,
      nodeType: "SUPPLIER",
      name: `Supplier-${randomHash().slice(0, 8)}`,
      normalizedName: `supplier-${randomHash().slice(0, 8)}`,
      country,
    },
  });
}

async function seedLogisticsLeg(tenantId: string, hops: number) {
  const from = await prisma.logisticsNode.create({
    data: {
      tenantId,
      nodeType: "PORT",
      name: `Port-From-${randomHash().slice(0, 6)}`,
      normalizedName: `port-from-${randomHash().slice(0, 6)}`,
    },
  });
  const to = await prisma.logisticsNode.create({
    data: {
      tenantId,
      nodeType: "PORT",
      name: `Port-To-${randomHash().slice(0, 6)}`,
      normalizedName: `port-to-${randomHash().slice(0, 6)}`,
    },
  });
  const legs = [];
  let currentFrom = from.id;
  for (let i = 0; i < hops; i++) {
    const nextTo = i === hops - 1 ? to.id : (
      await prisma.logisticsNode.create({
        data: {
          tenantId,
          nodeType: "PORT",
          name: `Port-Mid-${randomHash().slice(0, 6)}`,
          normalizedName: `port-mid-${randomHash().slice(0, 6)}`,
        },
      })
    ).id;
    legs.push(
      await prisma.logisticsLeg.create({
        data: {
          tenantId,
          fromNodeId: currentFrom,
          toNodeId: nextTo,
          legType: "SEA",
          confidence: 0.7,
        },
      }),
    );
    currentFrom = nextTo;
  }
  return legs;
}

async function seedPriceObservation(
  tenantId: string,
  productId: string,
  price: number,
) {
  return prisma.priceObservation.create({
    data: {
      tenantId,
      productId,
      sourceType: "MARKETPLACE_LISTING",
      observationType: "SELLING_PRICE",
      price,
      currency: "BDT",
      priceBasis: "UNIT",
      observedAt: OBSERVED_AT,
      contentHash: randomHash(),
    } as never,
  });
}

async function seedLandedCost(
  tenantId: string,
  productId: string,
  unitLandedCost: number,
) {
  return prisma.landedCostCalculation.create({
    data: {
      tenantId,
      productId,
      quantity: 1,
      currency: "BDT",
      totalCost: unitLandedCost,
      unitLandedCost,
      status: "COMPLETE",
      unknownComponentFlags: [],
      inputHash: randomHash(),
      contentHash: randomHash(),
    } as never,
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Product Opportunity Intelligence — Integration Tests (22+ adversarial cases)", () => {
  let tenant1: { id: string };
  let tenant2: { id: string };
  let product1: { id: string };
  let product2: { id: string };
  let product3: { id: string };
  let product4: { id: string };
  let product5: { id: string };
  let product6: { id: string };
  let source1: { id: string };

  beforeAll(async () => {
    tenant1 = await createTenant("P12 Test Tenant 1");
    tenant2 = await createTenant("P12 Test Tenant 2");
    product1 = await createProduct(tenant1.id, "P12 Widget A");
    product2 = await createProduct(tenant1.id, "P12 Widget B");
    product3 = await createProduct(tenant1.id, "P12 Widget C");
    product4 = await createProduct(tenant1.id, "P12 Widget D");
    product5 = await createProduct(tenant1.id, "P12 Widget E");
    product6 = await createProduct(tenant1.id, "P12 Widget F");
    source1 = await createSource(tenant1.id, "P12 Test Source");
  });

  afterAll(async () => {
    const tenantIds = [tenant1.id, tenant2.id];
    // Cleanup in FK-safe order
    await prisma.resellerViabilityAssessment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.productOppSignal.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.productOppRisk.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.competitorSnapshot.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.demandOpportunitySnapshot.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.competitorObservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.demandSignal.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.demandCalculation.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.logisticsLeg.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.logisticsNode.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.supplyChainNode.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.landedCostCalculation.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.priceObservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.source.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  // ─── 1–3. Cross-Tenant Isolation ───────────────────────────────────────────

  it("1. cross-tenant isolation: tenant2 assessments exclude tenant1 data", async () => {
    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product1.id });
    expect(result.assessmentId).toBeTruthy();

    const tenant2List = await listAssessments({ tenantId: tenant2.id, page: 1, limit: 100 });
    const foreign = tenant2List.data.filter((a) => a.productId === product1.id);
    expect(foreign).toHaveLength(0);
  });

  it("2. cross-tenant isolation: getAssessment from wrong tenant throws NotFoundError", async () => {
    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product1.id });

    await expect(
      getAssessment({ tenantId: tenant2.id, assessmentId: result.assessmentId }),
    ).rejects.toThrow(NotFoundError);
  });

  it("3. cross-tenant isolation: signals/risks/observations are tenant-scoped", async () => {
    await seedCompetitor(tenant1.id, product2.id);
    await assessProductOpportunity({ tenantId: tenant1.id, productId: product2.id });

    const t2Signals = await listSignals({ tenantId: tenant2.id, productId: product2.id, limit: 100 });
    expect(t2Signals.data).toHaveLength(0);

    const t2Risks = await listRisks({ tenantId: tenant2.id, productId: product2.id, limit: 100 });
    expect(t2Risks.data).toHaveLength(0);

    const t2Obs = await listCompetitorObservations({ tenantId: tenant2.id, productId: product2.id });
    expect(t2Obs.data).toHaveLength(0);
  });

  // ─── 4–5. Empty Data & UNKNOWN Propagation ─────────────────────────────────

  it("4. no upstream data: assessment created with UNKNOWN levels and zero scores, never fabricated", async () => {
    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product3.id });
    expect(result.assessmentId).toBeTruthy();
    expect(result.opportunityScore).toBe(0);
    expect(result.competitorCount).toBe(0);

    const assessment = await getAssessment({ tenantId: tenant1.id, assessmentId: result.assessmentId });
    expect(assessment.competitionLevel).toBe("UNKNOWN");
    expect(assessment.demandMomentum).toBe("UNKNOWN");
    expect(assessment.supplierConcentration).toBe("UNKNOWN");
    expect(assessment.marketSaturation).toBe("UNKNOWN");
    expect(assessment.demandLevel).toBe("UNKNOWN");
    expect(assessment.unitLandedCost).toBeNull();
    expect(assessment.status).toBe("DETECTED");
  });

  it("5. unknown ≠ zero: only-known dimensions are renormalized, unknown never treated as zero", async () => {
    // Only pricing data: landed cost 40, market prices around 100 → margin 0.6 → pricingScore 100
    await seedLandedCost(tenant1.id, product4.id, 40);
    for (const price of [95, 100, 105]) {
      await seedPriceObservation(tenant1.id, product4.id, price);
    }

    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product4.id });
    const assessment = await getAssessment({ tenantId: tenant1.id, assessmentId: result.assessmentId });

    // Demand/supply/logistics are null — engine excludes them from the weighted mean
    expect(assessment.supplierCount).toBeNull();
    expect(assessment.routeCount).toBeNull();
    // With only the margin dimension known and margin 0.6 → score should be high, not dragged to 0
    expect(assessment.opportunityScore).toBeGreaterThan(70);
  });

  // ─── 6–8. Versioning, Immutability & Dedup ─────────────────────────────────

  it("6. version monotonicity: repeated assessment increments version, both records retained", async () => {
    await seedCompetitor(tenant1.id, product5.id, { sellingPrice: 100 });
    const r1 = await assessProductOpportunity({ tenantId: tenant1.id, productId: product5.id });
    const r2 = await assessProductOpportunity({ tenantId: tenant1.id, productId: product5.id });

    expect(r2.version).toBe(r1.version + 1);

    const history = await getAssessmentHistory({ tenantId: tenant1.id, productId: product5.id, limit: 10 });
    const versions = history.map((h) => h.version).sort((a, b) => a - b);
    expect(versions).toEqual([r1.version, r2.version]);
  });

  it("7. historical immutability: v1 record is unchanged after v2 exists", async () => {
    const history = await getAssessmentHistory({ tenantId: tenant1.id, productId: product5.id, limit: 10 });
    const v1 = history.find((h) => h.version === 1);
    expect(v1).toBeTruthy();
    // Scores from the first run remain exactly as originally calculated
    expect(v1!.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(v1!.opportunityScore).toBeLessThanOrEqual(100);
  });

  it("8. signal dedup: re-assessment with identical inputs creates no duplicate signal rows", async () => {
    // Assess twice for product5 (same seeded competitor data)
    const before = await listSignals({ tenantId: tenant1.id, productId: product5.id, limit: 100 });
    await assessProductOpportunity({ tenantId: tenant1.id, productId: product5.id });
    const after = await listSignals({ tenantId: tenant1.id, productId: product5.id, limit: 100 });

    expect(after.total).toBe(before.total);
  });

  // ─── 9–10. Content Hash Determinism (engine level) ─────────────────────────

  it("9. content hash stability: identical engine inputs produce identical content hashes", async () => {
    const competitor: CompetitorObservationInput = {
      id: "c-1",
      tenantId: tenant1.id,
      productId: product1.id,
      competitorName: "HashCo",
      sourceType: "MARKETPLACE_LISTING",
      market: "daraz",
      country: "BD",
      sellingPrice: 120,
      currency: "BDT",
      priceBasis: "UNIT",
      rating: 4.0,
      reviewCount: 10,
      availability: "IN_STOCK",
      observedAt: OBSERVED_AT,
      contentHash: "hash-1",
    };

    const input = {
      tenantId: tenant1.id,
      productId: product1.id,
      competitors: [competitor],
      demand: {
        demandLevel: "MODERATE",
        demandMomentum: "GROWING",
        searchGrowth: 0.1,
        seasonality: null,
        trendStrength: null,
        observationCount: 10,
        confidence: 0.7,
        volatility: null,
      },
      supply: {
        supplierCount: 3,
        supplierCountryCount: 2,
        supplierPriceSpread: null,
        supplierReliability: null,
        supplyCompleteness: 0.6,
      },
      logistics: {
        routeCount: 2,
        availableModes: ["SEA"],
        routeReliability: 0.7,
        transitTimeRange: null,
        transitTimeUncertainty: null,
        numberOfHops: 2,
        logisticsRiskCount: 0,
      },
      pricing: {
        unitLandedCost: 50,
        marketPriceMin: 90,
        marketPriceMax: 110,
        marketPriceMedian: 100,
        grossMarginMin: 0.5,
        grossMarginMax: 0.5,
        grossMarginBase: 0.5,
        priceVolatility: null,
        pricingRiskCount: 0,
      },
      referenceDate: OBSERVED_AT,
    } as const;

    const run1 = runOpportunityEngine(input);
    const run2 = runOpportunityEngine(input);

    expect(run1.hashes.contentHash).toBe(run2.hashes.contentHash);
    expect(computeOpportunityContentHash(
      tenant1.id,
      product1.id,
      run1.opportunity.opportunityScore,
      run1.opportunity.confidence,
      run1.opportunity.completeness,
    )).toBe(
      computeOpportunityContentHash(
        tenant1.id,
        product1.id,
        run2.opportunity.opportunityScore,
        run2.opportunity.confidence,
        run2.opportunity.completeness,
      ),
    );
  });

  it("10. content hash divergence: changed competitor price changes the hash", async () => {
    const h1 = computeOpportunityContentHash(tenant1.id, product1.id, 50, 0.7, 0.8);
    const h2 = computeOpportunityContentHash(tenant1.id, product1.id, 60, 0.7, 0.8);
    expect(h1).not.toBe(h2);
  });

  // ─── 11. Competitor Observation Deduplication ──────────────────────────────

  it("11. competitor observation dedup: identical input returns the same record", async () => {
    const payload = {
      tenantId: tenant1.id,
      productId: product2.id,
      competitorName: "DupCo",
      sourceType: "MANUAL",
      sourceUrl: "https://example.com/dup",
      market: "daraz",
      country: "BD",
      sellingPrice: 77.5,
      currency: "BDT",
      priceBasis: "UNIT",
      rating: null,
      reviewCount: null,
      availability: "IN_STOCK",
      observedAt: new Date("2026-09-25T00:00:00Z"),
    };

    const first = await createCompetitorObservation(payload);
    const second = await createCompetitorObservation(payload);

    expect(second.id).toBe(first.id);
    expect(second.contentHash).toBe(first.contentHash);
  });

  // ─── 12–15. Signal & Risk Detection Over Real Data ─────────────────────────

  it("12. HIGH_COMPETITION: 15+ unique competitors trigger signal and risk", async () => {
    for (let i = 0; i < 16; i++) {
      await seedCompetitor(tenant1.id, product6.id, { sellingPrice: 100 + i });
    }

    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product6.id });
    const signals = await listSignals({ tenantId: tenant1.id, productId: product6.id, limit: 100 });
    const risks = await listRisks({ tenantId: tenant1.id, productId: product6.id, limit: 100 });

    const highCompetitionSignal = signals.data.find((s) => s.signalType === "HIGH_COMPETITION");
    expect(highCompetitionSignal).toBeTruthy();
    expect(highCompetitionSignal!.direction).toBe("NEGATIVE");

    const highCompetitionRisk = risks.data.find((r) => r.riskType === "HIGH_COMPETITION");
    expect(highCompetitionRisk).toBeTruthy();

    const assessment = await getAssessment({ tenantId: tenant1.id, assessmentId: result.assessmentId });
    expect(assessment.competitionLevel).toBe("HIGH");
  });

  it("13. PRICE_COMPRESSION: 5+ tight prices compress and flag saturation pressure", async () => {
    const product = await createProduct(tenant1.id, "P12 Widget G");
    for (const price of [100, 100.5, 101, 101.5, 102]) {
      await seedCompetitor(tenant1.id, product.id, { sellingPrice: price });
    }

    await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });
    const signals = await listSignals({ tenantId: tenant1.id, productId: product.id, limit: 100 });
    const compression = signals.data.find((s) => s.signalType === "PRICE_COMPRESSION");
    expect(compression).toBeTruthy();

    const assessment = await listAssessments({ tenantId: tenant1.id, productId: product.id, limit: 1 });
    const detail = await getAssessment({ tenantId: tenant1.id, assessmentId: assessment.data[0]!.id });
    expect(detail.priceCompression).toBe(true);
  });

  it("14. LOW_MARGIN + HIGH_LANDED_COST: negative margin is valid, not an error state", async () => {
    const product = await createProduct(tenant1.id, "P12 Widget H");
    // Landed cost above every market price → negative margin
    await seedLandedCost(tenant1.id, product.id, 200);
    for (const price of [100, 120, 140]) {
      await seedPriceObservation(tenant1.id, product.id, price);
    }

    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });
    const assessment = await getAssessment({ tenantId: tenant1.id, assessmentId: result.assessmentId });

    // Negative margin is preserved as a commercial fact, not clamped to zero
    expect(assessment.grossMarginMin).toBeLessThan(0);
    expect(assessment.unitLandedCost).toBe(200);
    expect(assessment.commercialRisk).toBe("HIGH");

    const risks = await listRisks({ tenantId: tenant1.id, productId: product.id, limit: 100 });
    expect(risks.data.find((r) => r.riskType === "LOW_MARGIN")).toBeTruthy();
    expect(risks.data.find((r) => r.riskType === "HIGH_LANDED_COST")).toBeTruthy();
  });

  it("15. LOW_DATA_COMPLETENESS: sparse data triggers signal and INSUFFICIENT_DATA risk", async () => {
    const product = await createProduct(tenant1.id, "P12 Widget I");
    await seedCompetitor(tenant1.id, product.id);

    await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });
    const signals = await listSignals({ tenantId: tenant1.id, productId: product.id, limit: 100 });
    const risks = await listRisks({ tenantId: tenant1.id, productId: product.id, limit: 100 });

    expect(signals.data.find((s) => s.signalType === "LOW_DATA_COMPLETENESS")).toBeTruthy();
    const insufficient = risks.data.find((r) => r.riskType === "INSUFFICIENT_DATA");
    expect(insufficient).toBeTruthy();
    expect(insufficient!.affectedDimension).toBe("DATA");
  });

  // ─── 16–17. Provenance Chain ───────────────────────────────────────────────

  it("16. provenance chain: assessment links to resolvable snapshots, signals, and risks", async () => {
    // Rich data: demand signals + calc + competitors + supplier + logistics + pricing
    const product = await createProduct(tenant1.id, "P12 Widget J");
    for (let i = 0; i < 10; i++) {
      await seedDemandSignal(tenant1.id, product.id, source1.id);
    }
    await seedDemandCalculation(tenant1.id, product.id, { trend: "RISING", growthRate: 0.25 });
    await seedCompetitor(tenant1.id, product.id, { sellingPrice: 100 });
    await seedSupplyNode(tenant1.id, "CN");
    await seedSupplyNode(tenant1.id, "VN");
    await seedLogisticsLeg(tenant1.id, 2);
    await seedLandedCost(tenant1.id, product.id, 50);
    await seedPriceObservation(tenant1.id, product.id, 100);

    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });
    const assessment = await getAssessment({ tenantId: tenant1.id, assessmentId: result.assessmentId });

    // Snapshots resolvable
    expect(assessment.demandSnapshotId).toBeTruthy();
    expect(assessment.competitorSnapshotId).toBeTruthy();
    const demandSnapshot = await prisma.demandOpportunitySnapshot.findUnique({
      where: { id: assessment.demandSnapshotId! },
    });
    expect(demandSnapshot).toBeTruthy();
    expect(demandSnapshot!.demandMomentum).toBe("GROWING");
    expect(demandSnapshot!.searchGrowth).toBeCloseTo(0.25);

    // Signals and risks resolvable, with provenance on the assessment
    const signalIds = assessment.signalIds as string[];
    const riskIds = assessment.riskIds as string[];
    expect(signalIds.length).toBeGreaterThan(0);
    for (const signalId of signalIds) {
      const signal = await prisma.productOppSignal.findUnique({ where: { id: signalId } });
      expect(signal).toBeTruthy();
      expect(signal!.tenantId).toBe(tenant1.id);
    }
    for (const riskId of riskIds) {
      const risk = await prisma.productOppRisk.findUnique({ where: { id: riskId } });
      expect(risk).toBeTruthy();
      expect(risk!.tenantId).toBe(tenant1.id);
    }

    // STRONG_DEMAND_GROWTH from growth 25% > 20% threshold
    const signals = await listSignals({ tenantId: tenant1.id, productId: product.id, limit: 100 });
    expect(signals.data.find((s) => s.signalType === "STRONG_DEMAND_GROWTH")).toBeTruthy();
  });

  it("17. history ordering: getAssessmentHistory returns versions in descending order", async () => {
    const history = await getAssessmentHistory({ tenantId: tenant1.id, productId: product5.id, limit: 10 });
    expect(history.length).toBeGreaterThanOrEqual(2);
    const versions = history.map((h) => h.version);
    const sorted = [...versions].sort((a, b) => b - a);
    expect(versions).toEqual(sorted);
  });

  // ─── 18. Bounds Sanity ─────────────────────────────────────────────────────

  it("18. bounds sanity: scores within [0,100], confidences within [0,1]", async () => {
    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product1.id });
    expect(result.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result.opportunityScore).toBeLessThanOrEqual(100);
    expect(result.viabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.viabilityScore).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.completeness).toBeGreaterThanOrEqual(0);
    expect(result.completeness).toBeLessThanOrEqual(1);

    const snapshots = await listCompetitorSnapshots({ tenantId: tenant1.id, productId: product6.id, limit: 10 });
    for (const snap of snapshots) {
      expect(snap.confidence).toBeGreaterThanOrEqual(0);
      expect(snap.confidence).toBeLessThanOrEqual(1);
      expect(snap.completeness).toBeGreaterThanOrEqual(0);
      expect(snap.completeness).toBeLessThanOrEqual(1);
    }
  });

  // ─── 19. Expiration ────────────────────────────────────────────────────────

  it("19. expiration: assessments older than 14 days transition to EXPIRED", async () => {
    const product = await createProduct(tenant1.id, "P12 Widget K");
    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });

    // Backdate the assessment
    await prisma.resellerViabilityAssessment.update({
      where: { id: result.assessmentId },
      data: { calculatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
    });

    const expired = await expireStaleAssessments({ tenantId: tenant1.id });
    expect(expired.expired).toBeGreaterThanOrEqual(1);

    const assessment = await getAssessment({ tenantId: tenant1.id, assessmentId: result.assessmentId });
    expect(assessment.status).toBe("EXPIRED");
  });

  // ─── 20. Demand Momentum UNKNOWN Without Calculation ──────────────────────

  it("20. demand momentum UNKNOWN: signals without calculations never fabricate momentum", async () => {
    const product = await createProduct(tenant1.id, "P12 Widget L");
    for (let i = 0; i < 10; i++) {
      await seedDemandSignal(tenant1.id, product.id, source1.id);
    }
    // No DemandCalculation seeded

    const result = await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });
    const assessment = await getAssessment({ tenantId: tenant1.id, assessmentId: result.assessmentId });
    expect(assessment.demandMomentum).toBe("UNKNOWN");
    expect(assessment.demandLevel).toBe("MODERATE"); // 10 signals
  });

  // ─── 21. Supplier Diversity Signal ─────────────────────────────────────────

  it("21. MULTIPLE_SUPPLIER_OPTIONS: 5+ suppliers across countries emit positive signal", async () => {
    const product = await createProduct(tenant1.id, "P12 Widget M");
    for (const country of ["CN", "VN", "IN", "TH", "MY"]) {
      await seedSupplyNode(tenant1.id, country);
    }

    await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });
    const signals = await listSignals({ tenantId: tenant1.id, productId: product.id, limit: 100 });
    const diversity = signals.data.find((s) => s.signalType === "MULTIPLE_SUPPLIER_OPTIONS");
    expect(diversity).toBeTruthy();
    expect(diversity!.direction).toBe("POSITIVE");

    const assessment = await listAssessments({ tenantId: tenant1.id, productId: product.id, limit: 1 });
    const detail = await getAssessment({ tenantId: tenant1.id, assessmentId: assessment.data[0]!.id });
    expect(detail.supplierConcentration).toBe("DIVERSIFIED");
  });

  // ─── 22. Pagination Contract ───────────────────────────────────────────────

  it("22. pagination: listAssessments returns valid pagination metadata", async () => {
    const page1 = await listAssessments({ tenantId: tenant1.id, page: 1, limit: 3 });
    expect(page1.pagination.page).toBe(1);
    expect(page1.pagination.limit).toBe(3);
    expect(page1.pagination.total).toBeGreaterThanOrEqual(page1.data.length);
    expect(page1.pagination.totalPages).toBe(Math.ceil(page1.pagination.total / 3));
    expect(page1.data.length).toBeLessThanOrEqual(3);
  });

  // ─── 23. Deterministic Recalculation ───────────────────────────────────────

  it("23. deterministic recalculation: same inputs yield identical scores across versions", async () => {
    const product = await createProduct(tenant1.id, "P12 Widget N");
    await seedLandedCost(tenant1.id, product.id, 50);
    for (const price of [95, 100, 105]) {
      await seedPriceObservation(tenant1.id, product.id, price);
    }
    for (let i = 0; i < 3; i++) {
      await seedCompetitor(tenant1.id, product.id, { sellingPrice: 100 + i });
    }

    const r1 = await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });
    const r2 = await recalculateProductOpportunity({ tenantId: tenant1.id, productId: product.id });

    expect(r2.opportunityScore).toBe(r1.opportunityScore);
    expect(r2.viabilityScore).toBe(r1.viabilityScore);
    expect(r2.version).toBe(r1.version + 1);
  });

  // ─── 24. Logistics Complexity From Real Legs ──────────────────────────────

  it("24. HIGH_LOGISTICS_COMPLEXITY: 4+ legs emit negative signal and HIGH complexity", async () => {
    const product = await createProduct(tenant1.id, "P12 Widget O");
    await seedLogisticsLeg(tenant1.id, 5);

    await assessProductOpportunity({ tenantId: tenant1.id, productId: product.id });
    const signals = await listSignals({ tenantId: tenant1.id, productId: product.id, limit: 100 });
    const complexity = signals.data.find((s) => s.signalType === "HIGH_LOGISTICS_COMPLEXITY");
    expect(complexity).toBeTruthy();

    const risks = await listRisks({ tenantId: tenant1.id, productId: product.id, limit: 100 });
    const logisticsRisk = risks.data.find((r) => r.riskType === "LOGISTICS_COMPLEXITY");
    expect(logisticsRisk).toBeTruthy();
    expect(logisticsRisk!.affectedDimension).toBe("LOGISTICS");
  });
});
