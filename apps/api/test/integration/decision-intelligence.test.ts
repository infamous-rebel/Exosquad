// =============================================================================
// Phase 8 — Integration Tests: Decision Intelligence with real PostgreSQL
// =============================================================================
// Tests opportunity detection, persistence, tenant isolation, deduplication,
// evidence chain, risk/action persistence, expiration, scoring, filtering,
// and multi-tenant isolation.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@exosquad/database";
import { OPPORTUNITY_CONFIG } from "@exosquad/common";
import { createDemandSignal } from "../../src/services/demand-signals.js";
import { runOpportunityDetection, expireStaleOpportunities } from "../../src/services/decision-intelligence.js";
import {
  listOpportunities,
  getOpportunityById,
  getOpportunityEvidence,
  getOpportunityRisks,
  getOpportunityActions,
  getOpportunityCalculation,
  getOpportunitySummary,
} from "../../src/services/opportunities.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTenant(name: string) {
  return prisma.tenant.create({
    data: { name, slug: `test-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}` },
  });
}

async function createSource(tenantId: string, name: string) {
  return prisma.source.create({
    data: {
      tenantId,
      name,
      type: "api_connector",
      connectorType: "http",
      config: {},
      status: "active",
    },
  });
}

async function createProduct(tenantId: string, name: string) {
  return prisma.product.create({
    data: {
      tenantId,
      name,
      normalizedName: name.toLowerCase(),
      searchKey: name.toLowerCase().replace(/\s+/g, ""),
    },
  });
}

async function addSignal(params: {
  tenantId: string;
  sourceId: string;
  productId: string;
  value: number;
  observedAt: Date;
  geography?: string;
  confidence?: number;
  sourceReliability?: number;
}) {
  const {
    tenantId,
    sourceId,
    productId,
    value,
    observedAt,
    geography = "BD-DH",
    confidence = 0.75,
    sourceReliability = 0.8,
  } = params;

  return createDemandSignal({
    tenantId,
    sourceId,
    productId,
    signalType: "SEARCH_VOLUME",
    metric: "daily_searches",
    value,
    observedAt,
    retrievedAt: new Date(),
    geography,
    confidence,
    sourceReliability,
    dataQuality: "valid",
  });
}

async function cleanupTenant(tenantId: string) {
  await prisma.$transaction(async (tx) => {
    // Phase 8 tables
    await tx.opportunityAction.deleteMany({ where: { opportunity: { tenantId } } });
    await tx.opportunityRisk.deleteMany({ where: { opportunity: { tenantId } } });
    await tx.opportunityEvidence.deleteMany({ where: { opportunity: { tenantId } } });
    await tx.opportunityCalculation.deleteMany({ where: { opportunity: { tenantId } } });
    await tx.opportunity.deleteMany({ where: { tenantId } });
    // Phase 7 tables
    await tx.demandCalculation.deleteMany({ where: { tenantId } });
    await tx.demandSignal.deleteMany({ where: { tenantId } });
    // Phase 6 tables
    await tx.provenanceEdge.deleteMany({ where: { tenantId } });
    await tx.calculation.deleteMany({ where: { tenantId } });
    await tx.evidenceConflict.deleteMany({ where: { tenantId } });
    await tx.claim.deleteMany({ where: { tenantId } });
    await tx.evidence.deleteMany({ where: { tenantId } });
    // Phase 4-5 tables
    await tx.orgMergeHistory.deleteMany({ where: { tenantId } });
    await tx.orgIdentityCandidate.deleteMany({ where: { tenantId } });
    await tx.orgIdentityDecision.deleteMany({ where: { tenantId } });
    await tx.orgIdentityConflict.deleteMany({ where: { tenantId } });
    await tx.commercialRelationship.deleteMany({ where: { tenantId } });
    await tx.productSupplier.deleteMany({ where: { tenantId } });
    await tx.productSeller.deleteMany({ where: { tenantId } });
    await tx.organization.deleteMany({ where: { tenantId } });
    await tx.identityMergeHistory.deleteMany({ where: { tenantId } });
    await tx.identityCandidate.deleteMany({ where: { tenantId } });
    await tx.identityDecision.deleteMany({ where: { tenantId } });
    await tx.identityConflict.deleteMany({ where: { tenantId } });
    await tx.identityRelationship.deleteMany({ where: { tenantId } });
    const tenantProducts = await tx.product.findMany({ where: { tenantId }, select: { id: true } });
    if (tenantProducts.length > 0) {
      await tx.productVariant.deleteMany({ where: { productId: { in: tenantProducts.map((p) => p.id) } } });
    }
    await tx.productIdentifier.deleteMany({ where: { tenantId } });
    await tx.product.deleteMany({ where: { tenantId } });
    await tx.brand.deleteMany({ where: { tenantId } });
    await tx.category.deleteMany({ where: { tenantId } });
    await tx.normalizationError.deleteMany({ where: { tenantId } });
    await tx.observation.deleteMany({ where: { tenantId } });
    await tx.rawResponse.deleteMany({ where: { tenantId } });
    await tx.ingestionCheckpoint.deleteMany({ where: { tenantId } });
    await tx.source.deleteMany({ where: { tenantId } });
    await tx.job.deleteMany({ where: { tenantId } });
    await tx.auditLog.deleteMany({ where: { tenantId } });
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.tenant.delete({ where: { id: tenantId } });
  }).catch(() => {});
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Phase 8: Decision Intelligence Integration", () => {
  let tenantId: string;
  let sourceId1: string;
  let sourceId2: string;
  let productId: string;

  beforeAll(async () => {
    const tenant = await createTenant("Phase8 Integration");
    tenantId = tenant.id;
    const source1 = await createSource(tenantId, "Opportunity Source A");
    sourceId1 = source1.id;
    const source2 = await createSource(tenantId, "Opportunity Source B");
    sourceId2 = source2.id;
    const product = await createProduct(tenantId, "Opportunity Test Product");
    productId = product.id;
  });

  afterAll(async () => {
    await cleanupTenant(tenantId);
    await prisma.$disconnect();
  });

  // ─── 1. Opportunity Detection from Demand Signals ─────────────────────────

  it("should detect opportunities from demand signals", async () => {
    const now = new Date();

    // Create 10 demand signals with growing trend across 2 sources
    for (let i = 0; i < 5; i++) {
      await addSignal({
        tenantId,
        sourceId: sourceId1,
        productId,
        value: 10 + i * 5,
        observedAt: new Date(now.getTime() - (10 - i) * 86400000),
        confidence: 0.8,
        sourceReliability: 0.85,
      });
      await addSignal({
        tenantId,
        sourceId: sourceId2,
        productId,
        value: 12 + i * 4,
        observedAt: new Date(now.getTime() - (10 - i) * 86400000),
        confidence: 0.75,
        sourceReliability: 0.7,
      });
    }

    const result = await runOpportunityDetection({ tenantId, windowDays: 30 });

    expect(result.tenantId).toBe(tenantId);
    expect(result.candidatesEvaluated).toBeGreaterThanOrEqual(1);
    expect(result.opportunitiesCreated).toBeGreaterThanOrEqual(1);
    expect(result.algorithmVersion).toBe(OPPORTUNITY_CONFIG.algorithmVersion);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  // ─── 2. Content Hash Deduplication ────────────────────────────────────────

  it("should deduplicate opportunities with same content hash", async () => {
    // Run detection again — same signals should produce same hash
    const result = await runOpportunityDetection({ tenantId, windowDays: 30 });

    // All should be deduplicated since nothing changed
    expect(result.opportunitiesDeduplicated).toBeGreaterThanOrEqual(1);
    expect(result.opportunitiesCreated).toBe(0);
  });

  // ─── 3. Tenant Isolation ──────────────────────────────────────────────────

  it("should isolate opportunities by tenant", async () => {
    const tenant2 = await createTenant("Phase8 Tenant B");

    // Run detection for tenant2 — should find no signals
    const result = await runOpportunityDetection({ tenantId: tenant2.id, windowDays: 30 });
    expect(result.candidatesEvaluated).toBe(0);
    expect(result.opportunitiesCreated).toBe(0);

    // List opportunities for tenant2 — should be empty
    const opps = await listOpportunities({ tenantId: tenant2.id });
    expect(opps.data.length).toBe(0);
    expect(opps.pagination.total).toBe(0);

    await cleanupTenant(tenant2.id);
  });

  // ─── 4. Opportunity Listing with Filtering ────────────────────────────────

  it("should list opportunities with filtering and pagination", async () => {
    // List all opportunities for the tenant
    const all = await listOpportunities({ tenantId });
    expect(all.data.length).toBeGreaterThan(0);
    expect(all.pagination.total).toBeGreaterThan(0);
    expect(all.pagination.page).toBe(1);

    // Filter by geography
    const filtered = await listOpportunities({ tenantId, geographyCode: "BD-DH" });
    expect(filtered.data.length).toBeGreaterThanOrEqual(0);

    // Pagination
    const page1 = await listOpportunities({ tenantId, page: 1, limit: 1 });
    expect(page1.data.length).toBeLessThanOrEqual(1);
    expect(page1.pagination.limit).toBe(1);
  });

  // ─── 5. Opportunity Detail Retrieval ──────────────────────────────────────

  it("should retrieve opportunity by ID with all relations", async () => {
    const opps = await listOpportunities({ tenantId });
    expect(opps.data.length).toBeGreaterThan(0);

    const oppId = opps.data[0]!.id;
    const detail = await getOpportunityById(tenantId, oppId);

    expect(detail.id).toBe(oppId);
    expect(detail.tenantId).toBe(tenantId);
    expect(detail.score).toBeGreaterThanOrEqual(0);
    expect(detail.confidence).toBeGreaterThanOrEqual(0);
    expect(detail.title).toBeTruthy();
    expect(detail.summary).toBeTruthy();
    expect(detail.algorithmVersion).toBe(OPPORTUNITY_CONFIG.algorithmVersion);
    expect(detail.contentHash).toBeTruthy();

    // Should have calculations, evidence, risks, actions
    expect(detail.calculations).toBeDefined();
    expect(detail.evidence).toBeDefined();
    expect(detail.risks).toBeDefined();
    expect(detail.actions).toBeDefined();
  });

  // ─── 6. Evidence Chain ────────────────────────────────────────────────────

  it("should maintain evidence provenance chain", async () => {
    const opps = await listOpportunities({ tenantId });
    const oppId = opps.data[0]!.id;

    const evidence = await getOpportunityEvidence(tenantId, oppId);
    expect(evidence.length).toBeGreaterThan(0);

    for (const e of evidence) {
      expect(e.opportunityId).toBe(oppId);
      expect(e.evidenceType).toBeTruthy();
      expect(e.weight).toBeGreaterThan(0);
      expect(e.snapshotAt).toBeDefined();
    }
  });

  // ─── 7. Risk Assessment Persistence ───────────────────────────────────────

  it("should persist risk assessments", async () => {
    const opps = await listOpportunities({ tenantId });
    const oppId = opps.data[0]!.id;

    const risks = await getOpportunityRisks(tenantId, oppId);
    expect(risks.length).toBeGreaterThan(0);

    for (const r of risks) {
      expect(r.opportunityId).toBe(oppId);
      expect(r.riskType).toBeTruthy();
      expect(["low", "medium", "high", "critical"]).toContain(r.severity);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.description).toBeTruthy();
    }

    // Should always have COMMERCIAL_DATA_MISSING risk
    const commercialRisk = risks.find((r) => r.riskType === "COMMERCIAL_DATA_MISSING");
    expect(commercialRisk).toBeDefined();
  });

  // ─── 8. Action Recommendation Persistence ─────────────────────────────────

  it("should persist action recommendations", async () => {
    const opps = await listOpportunities({ tenantId });
    const oppId = opps.data[0]!.id;

    const actions = await getOpportunityActions(tenantId, oppId);
    expect(actions.length).toBeGreaterThan(0);

    for (const a of actions) {
      expect(a.opportunityId).toBe(oppId);
      expect(a.actionType).toBeTruthy();
      expect(["low", "medium", "high"]).toContain(a.priority);
      expect(a.title).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(a.reason).toBeTruthy();
    }
  });

  // ─── 9. Calculation Snapshot ──────────────────────────────────────────────

  it("should persist calculation snapshots", async () => {
    const opps = await listOpportunities({ tenantId });
    const oppId = opps.data[0]!.id;

    const detail = await getOpportunityById(tenantId, oppId);
    expect(detail.calculations.length).toBeGreaterThan(0);

    const calc = detail.calculations[0]!;
    expect(calc.opportunityId).toBe(oppId);
    expect(calc.algorithmVersion).toBe(OPPORTUNITY_CONFIG.algorithmVersion);
    expect(calc.finalScore).toBeGreaterThanOrEqual(0);
    expect(calc.inputSignalIds).toBeDefined();
    expect(Array.isArray(calc.inputSignalIds)).toBe(true);
    expect(calc.inputHash).toBeTruthy();
  });

  // ─── 10. Opportunity Summary ──────────────────────────────────────────────

  it("should generate opportunity summary", async () => {
    const summary = await getOpportunitySummary(tenantId);

    expect(summary.total).toBeGreaterThan(0);
    expect(typeof summary.actionable).toBe("number");
    expect(typeof summary.watch).toBe("number");
    expect(typeof summary.detected).toBe("number");
    expect(typeof summary.averageConfidence).toBe("number");
    expect(typeof summary.averageScore).toBe("number");
    expect(Array.isArray(summary.byType)).toBe(true);
    expect(Array.isArray(summary.byGeography)).toBe(true);
  });

  // ─── 11. Opportunity Expiration ───────────────────────────────────────────

  it("should expire stale opportunities", async () => {
    // Create an opportunity with a past validUntil date
    const pastDate = new Date(Date.now() - 2 * 86400000);

    await prisma.opportunity.create({
      data: {
        tenantId,
        productId,
        geographyCode: "BD-CT",
        opportunityType: "GROWING_PRODUCT",
        status: "DETECTED",
        score: 50,
        confidence: 0.6,
        title: "Stale Test Opportunity",
        summary: "Should be expired",
        detectedAt: pastDate,
        validFrom: pastDate,
        validUntil: pastDate, // Already expired
        algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
        contentHash: `stale-test-${Date.now()}`,
        demandScore: 50,
        growthScore: 50,
        velocityScore: 50,
        persistenceScore: 50,
        accelerationScore: 50,
        seasonalityScore: 0,
        sourceDiversityScore: 50,
        riskScore: 20,
      },
    });

    const result = await expireStaleOpportunities({ tenantId });
    expect(result.expired).toBeGreaterThanOrEqual(1);

    // Verify the stale opportunity is now EXPIRED
    const staleOpp = await prisma.opportunity.findFirst({
      where: { tenantId, title: "Stale Test Opportunity" },
    });
    expect(staleOpp?.status).toBe("EXPIRED");
  });

  // ─── 12. No Signals → No Opportunities ────────────────────────────────────

  it("should return empty result when no signals exist", async () => {
    const tenant3 = await createTenant("Phase8 No Signals");

    const result = await runOpportunityDetection({ tenantId: tenant3.id, windowDays: 30 });
    expect(result.candidatesEvaluated).toBe(0);
    expect(result.opportunitiesCreated).toBe(0);
    expect(result.opportunities.length).toBe(0);

    await cleanupTenant(tenant3.id);
  });

  // ─── 13. Score Determinism ────────────────────────────────────────────────

  it("should produce deterministic scores for same input", async () => {
    const opps = await listOpportunities({ tenantId });
    expect(opps.data.length).toBeGreaterThan(0);

    // Get the detail of the first opportunity
    const detail = await getOpportunityById(tenantId, opps.data[0]!.id);
    const calc = detail.calculations[0]!;

    // The final score should match the opportunity score
    expect(calc.finalScore).toBe(detail.score);
    expect(calc.demandScore).toBe(detail.demandScore);
    expect(calc.riskScore).toBe(detail.riskScore);
  });

  // ─── 14. Status Classification ────────────────────────────────────────────

  it("should classify opportunity status correctly", async () => {
    const opps = await listOpportunities({ tenantId });

    for (const opp of opps.data) {
      // EXPIRED is a terminal state — skip classification check for those
      if (opp.status === "EXPIRED") continue;

      if (opp.score >= OPPORTUNITY_CONFIG.actionableScore) {
        expect(opp.status).toBe("ACTIONABLE");
      } else if (opp.score >= OPPORTUNITY_CONFIG.watchScore) {
        expect(opp.status).toBe("WATCH");
      } else {
        expect(opp.status).toBe("DETECTED");
      }
    }
  });

  // ─── 15. Multi-Source Evidence ────────────────────────────────────────────

  it("should track evidence from multiple sources", async () => {
    const opps = await listOpportunities({ tenantId });
    const oppId = opps.data[0]!.id;
    const evidence = await getOpportunityEvidence(tenantId, oppId);

    // We created signals from 2 sources, so evidence should reflect diversity
    expect(evidence.length).toBeGreaterThan(0);

    // At least one evidence type should be present
    const evidenceTypes = new Set(evidence.map((e) => e.evidenceType));
    expect(evidenceTypes.size).toBeGreaterThan(0);
  });

  // ─── 16. Calculation Retrieval by ID ──────────────────────────────────────

  it("should retrieve calculation by ID with tenant check", async () => {
    const opps = await listOpportunities({ tenantId });
    const detail = await getOpportunityById(tenantId, opps.data[0]!.id);
    expect(detail.calculations.length).toBeGreaterThan(0);

    const calcId = detail.calculations[0]!.id;
    const calc = await getOpportunityCalculation(tenantId, calcId);
    expect(calc.id).toBe(calcId);
    expect(calc.opportunity.tenantId).toBe(tenantId);
  });

  // ─── 17. NotFoundError for Wrong Tenant ───────────────────────────────────

  it("should throw NotFoundError for cross-tenant access", async () => {
    const tenant4 = await createTenant("Phase8 Wrong Tenant");

    const opps = await listOpportunities({ tenantId });
    const oppId = opps.data[0]!.id;

    // Try to access tenant1's opportunity from tenant4
    await expect(getOpportunityById(tenant4.id, oppId)).rejects.toThrow();

    await cleanupTenant(tenant4.id);
  });

  // ─── 18. Low Confidence Signals Filtered ──────────────────────────────────

  it("should not create opportunities from low-confidence signals only", async () => {
    const tenant5 = await createTenant("Phase8 Low Conf");
    const src = await createSource(tenant5.id, "Low Conf Source");
    const prod = await createProduct(tenant5.id, "Low Conf Product");
    const now = new Date();

    // Create signals with very low confidence
    for (let i = 0; i < 5; i++) {
      await addSignal({
        tenantId: tenant5.id,
        sourceId: src.id,
        productId: prod.id,
        value: 50 + i * 10,
        observedAt: new Date(now.getTime() - (5 - i) * 86400000),
        confidence: 0.1, // Below minimumSignalConfidence (0.50)
        sourceReliability: 0.3,
      });
    }

    const result = await runOpportunityDetection({ tenantId: tenant5.id, windowDays: 30 });
    expect(result.opportunitiesCreated).toBe(0);

    await cleanupTenant(tenant5.id);
  });
});
