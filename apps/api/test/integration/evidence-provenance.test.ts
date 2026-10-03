// =============================================================================
// Phase 6 — Integration Tests: Evidence & Provenance with real PostgreSQL
// =============================================================================
// Tests evidence persistence, provenance chain, conflict detection,
// historical reconstruction, tenant isolation, and concurrency.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@exosquad/database";
import { computeContentHash } from "../../src/services/evidence.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTenant(name: string) {
  return prisma.tenant.create({
    data: { name, slug: `test-${name.toLowerCase()}-${Date.now()}` },
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

async function createObservation(tenantId: string, sourceId: string, payload: Record<string, unknown>) {
  const contentHash = computeContentHash(payload);
  return prisma.observation.create({
    data: {
      tenantId,
      sourceId,
      rawPayload: payload,
      contentHash,
      retrievedAt: new Date(),
      observedAt: new Date(),
      normalizationStatus: "normalized",
      normalizedPayload: payload,
      normalizedAt: new Date(),
    },
  });
}

async function cleanupTenant(slug: string) {
  const tenant = await prisma.tenant.findFirst({ where: { slug } });
  if (!tenant) return;

  await prisma.$transaction(async (tx) => {
    // Phase 6 tables
    await tx.provenanceEdge.deleteMany({ where: { tenantId: tenant.id } });
    await tx.calculation.deleteMany({ where: { tenantId: tenant.id } });
    await tx.evidenceConflict.deleteMany({ where: { tenantId: tenant.id } });
    await tx.claim.deleteMany({ where: { tenantId: tenant.id } });
    await tx.evidence.deleteMany({ where: { tenantId: tenant.id } });
    // Phase 4-5 tables
    await tx.orgMergeHistory.deleteMany({ where: { tenantId: tenant.id } });
    await tx.orgIdentityCandidate.deleteMany({ where: { tenantId: tenant.id } });
    await tx.orgIdentityDecision.deleteMany({ where: { tenantId: tenant.id } });
    await tx.orgIdentityConflict.deleteMany({ where: { tenantId: tenant.id } });
    await tx.commercialRelationship.deleteMany({ where: { tenantId: tenant.id } });
    await tx.productSupplier.deleteMany({ where: { tenantId: tenant.id } });
    await tx.productSeller.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organization.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityMergeHistory.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityCandidate.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityDecision.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityConflict.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityRelationship.deleteMany({ where: { tenantId: tenant.id } });
    await tx.productAttribute.deleteMany({ where: { tenantId: tenant.id } });
    const tenantProducts = await tx.product.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    if (tenantProducts.length > 0) {
      await tx.productVariant.deleteMany({ where: { productId: { in: tenantProducts.map((p) => p.id) } } });
    }
    await tx.productIdentifier.deleteMany({ where: { tenantId: tenant.id } });
    await tx.product.deleteMany({ where: { tenantId: tenant.id } });
    await tx.brand.deleteMany({ where: { tenantId: tenant.id } });
    await tx.category.deleteMany({ where: { tenantId: tenant.id } });
    await tx.normalizationError.deleteMany({ where: { tenantId: tenant.id } });
    await tx.observation.deleteMany({ where: { tenantId: tenant.id } });
    await tx.rawResponse.deleteMany({ where: { tenantId: tenant.id } });
    await tx.ingestionCheckpoint.deleteMany({ where: { tenantId: tenant.id } });
    await tx.source.deleteMany({ where: { tenantId: tenant.id } });
    await tx.job.deleteMany({ where: { tenantId: tenant.id } });
    await tx.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await tx.user.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tenant.delete({ where: { id: tenant.id } });
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Phase 6: Evidence & Provenance Integration", () => {
  let tenantId: string;
  let sourceId: string;

  beforeAll(async () => {
    const tenant = await createTenant("Phase6 Integration");
    tenantId = tenant.id;
    const source = await createSource(tenantId, "Test Source A");
    sourceId = source.id;
  });

  afterAll(async () => {
    await cleanupTenant(`test-phase6-integration-${Date.now()}`);
    // Fallback: cleanup by tenantId
    await prisma.provenanceEdge.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.evidenceConflict.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.calculation.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.claim.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.evidence.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.observation.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.source.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    await prisma.$disconnect();
  });

  // ─── Evidence Persistence ──────────────────────────────────────────────────

  describe("Evidence persistence", () => {
    it("creates evidence with full provenance fields", async () => {
      const observation = await createObservation(tenantId, sourceId, {
        productName: "Test Product",
        price: 100,
        currency: "BDT",
      });

      const evidence = await prisma.evidence.create({
        data: {
          tenantId,
          sourceId,
          observationId: observation.id,
          evidenceType: "PRODUCT_IDENTITY",
          title: "Product name evidence",
          sourcePath: "$.productName",
          extractedValue: "Test Product",
          normalizedValue: "test product",
          valueType: "string",
          confidence: 0.9,
          confidenceBasis: ["direct_extraction"],
          observedAt: observation.observedAt,
          retrievedAt: observation.retrievedAt,
          freshness: "live",
          contentHash: computeContentHash("Test Product"),
          extractionMethod: "automated",
          parserVersion: "v1",
          status: "active",
          observationStatus: "observed",
          entityType: "product",
          entityId: observation.id,
        },
      });

      expect(evidence.id).toBeDefined();
      expect(evidence.evidenceType).toBe("PRODUCT_IDENTITY");
      expect(evidence.title).toBe("Product name evidence");
      expect(evidence.sourcePath).toBe("$.productName");
      expect(evidence.confidence).toBe(0.9);
      expect(evidence.freshness).toBe("live");
      expect(evidence.status).toBe("active");
      expect(evidence.observationStatus).toBe("observed");
    });

    it("enforces unique constraint on dedup key", async () => {
      const observation = await createObservation(tenantId, sourceId, { name: "Dedup Test" });
      const hash = computeContentHash("Dedup Test");

      await prisma.evidence.create({
        data: {
          tenantId,
          sourceId,
          observationId: observation.id,
          evidenceType: "PRODUCT_IDENTITY",
          title: "First",
          sourcePath: "$.name",
          contentHash: hash,
          entityType: "product",
          entityId: observation.id,
        },
      });

      await expect(
        prisma.evidence.create({
          data: {
            tenantId,
            sourceId,
            observationId: observation.id,
            evidenceType: "PRODUCT_IDENTITY",
            title: "Duplicate",
            sourcePath: "$.name",
            contentHash: hash,
            entityType: "product",
            entityId: observation.id,
          },
        })
      ).rejects.toThrow();
    });
  });

  // ─── Historical Reconstruction ─────────────────────────────────────────────

  describe("Historical reconstruction (mandatory test)", () => {
    it("preserves temporal evidence — T1 price ≠ T2 price", async () => {
      const product = await prisma.product.create({
        data: { tenantId, name: "Historical Product", normalizedName: "historical product", searchKey: "historicalproduct" },
      });

      const T1 = new Date("2026-09-01T10:00:00Z");
      const T2 = new Date("2026-10-01T10:00:00Z");

      // T1: price = 1000
      const ev1 = await prisma.evidence.create({
        data: {
          tenantId, sourceId, evidenceType: "PRICE", title: "Price at T1",
          sourcePath: "$.price", extractedValue: 1000, normalizedValue: 1000,
          valueType: "number", confidence: 0.95, observedAt: T1, retrievedAt: T1,
          freshness: "stale", contentHash: computeContentHash(1000),
          status: "active", observationStatus: "observed",
          entityType: "product", entityId: product.id, productId: product.id,
        },
      });

      // T2: price = 1200
      const ev2 = await prisma.evidence.create({
        data: {
          tenantId, sourceId, evidenceType: "PRICE", title: "Price at T2",
          sourcePath: "$.price", extractedValue: 1200, normalizedValue: 1200,
          valueType: "number", confidence: 0.95, observedAt: T2, retrievedAt: T2,
          freshness: "fresh", contentHash: computeContentHash(1200),
          status: "active", observationStatus: "observed",
          entityType: "product", entityId: product.id, productId: product.id,
        },
      });

      // Query at T1 — should find only T1 evidence
      const atT1 = await prisma.evidence.findMany({
        where: {
          tenantId,
          entityType: "product",
          entityId: product.id,
          evidenceType: "PRICE",
          observedAt: { lte: T1 },
        },
        orderBy: { observedAt: "desc" },
      });

      expect(atT1.length).toBe(1);
      expect(atT1[0].normalizedValue).toBe(1000);

      // Query at T2 — should find both
      const atT2 = await prisma.evidence.findMany({
        where: {
          tenantId,
          entityType: "product",
          entityId: product.id,
          evidenceType: "PRICE",
          observedAt: { lte: T2 },
        },
        orderBy: { observedAt: "desc" },
      });

      expect(atT2.length).toBe(2);
      expect(atT2[0].normalizedValue).toBe(1200);
      expect(atT2[1].normalizedValue).toBe(1000);

      // Latest price should be 1200
      const latest = await prisma.evidence.findFirst({
        where: { tenantId, entityType: "product", entityId: product.id, evidenceType: "PRICE" },
        orderBy: { observedAt: "desc" },
      });
      expect(latest!.normalizedValue).toBe(1200);
    });
  });

  // ─── Conflict Detection & Preservation ─────────────────────────────────────

  describe("Conflict preservation (mandatory test)", () => {
    it("preserves conflicting evidence from different sources", async () => {
      const product = await prisma.product.create({
        data: { tenantId, name: "Conflict Product", normalizedName: "conflict product", searchKey: "conflictproduct" },
      });

      const sourceB = await createSource(tenantId, "Test Source B");

      // Source A says manufacturer = X
      const evA = await prisma.evidence.create({
        data: {
          tenantId, sourceId, evidenceType: "PRODUCT_IDENTITY", title: "Manufacturer from A",
          sourcePath: "$.manufacturer", extractedValue: "CompanyX", normalizedValue: "companyx",
          confidence: 0.8, contentHash: computeContentHash("companyx"),
          entityType: "product", entityId: product.id, productId: product.id,
          observationStatus: "observed",
        },
      });

      // Source B says manufacturer = Y
      const evB = await prisma.evidence.create({
        data: {
          tenantId, sourceId: sourceB.id, evidenceType: "PRODUCT_IDENTITY", title: "Manufacturer from B",
          sourcePath: "$.manufacturer", extractedValue: "CompanyY", normalizedValue: "companyy",
          confidence: 0.7, contentHash: computeContentHash("companyy"),
          entityType: "product", entityId: product.id, productId: product.id,
          observationStatus: "observed",
        },
      });

      // Both evidence records exist
      const allEvidence = await prisma.evidence.findMany({
        where: { tenantId, entityType: "product", entityId: product.id, evidenceType: "PRODUCT_IDENTITY" },
      });
      expect(allEvidence.length).toBe(2);

      // Create conflict record
      const conflict = await prisma.evidenceConflict.create({
        data: {
          tenantId,
          entityType: "product",
          entityId: product.id,
          conflictType: "value_conflict",
          description: "Conflicting manufacturer values",
          supportingEvidenceId: evA.id,
          contradictingEvidenceId: evB.id,
          status: "open",
        },
      });

      expect(conflict.id).toBeDefined();
      expect(conflict.status).toBe("open");
      expect(conflict.supportingEvidenceId).toBe(evA.id);
      expect(conflict.contradictingEvidenceId).toBe(evB.id);

      // Conflict is queryable
      const found = await prisma.evidenceConflict.findFirst({
        where: { tenantId, entityType: "product", entityId: product.id },
        include: { supportingEvidence: true, contradictingEvidence: true },
      });
      expect(found).not.toBeNull();
      expect(found!.supportingEvidence.normalizedValue).toBe("companyx");
      expect(found!.contradictingEvidence.normalizedValue).toBe("companyy");

      // Resolution is auditable
      const resolved = await prisma.evidenceConflict.update({
        where: { id: conflict.id },
        data: {
          status: "resolved",
          resolvedAt: new Date(),
          resolvedBy: "test-user",
          resolution: "Source A is more reliable",
          resolverMethod: "manual",
        },
      });
      expect(resolved.status).toBe("resolved");
      expect(resolved.resolution).toBe("Source A is more reliable");

      // Cleanup source B — delete conflicts first (FK references), then evidence, then source
      await prisma.evidenceConflict.deleteMany({
        where: {
          OR: [
            { supportingEvidence: { sourceId: sourceB.id } },
            { contradictingEvidence: { sourceId: sourceB.id } },
          ],
        },
      });
      await prisma.evidence.deleteMany({ where: { sourceId: sourceB.id } });
      await prisma.source.delete({ where: { id: sourceB.id } });
    });
  });

  // ─── Provenance Chain ──────────────────────────────────────────────────────

  describe("Provenance chain traversal", () => {
    it("traverses source → observation → evidence → claim", async () => {
      const product = await prisma.product.create({
        data: { tenantId, name: "Provenance Product", normalizedName: "provenance product", searchKey: "provenanceproduct" },
      });

      const observation = await createObservation(tenantId, sourceId, { name: "Test" });

      const evidence = await prisma.evidence.create({
        data: {
          tenantId, sourceId, observationId: observation.id,
          evidenceType: "PRODUCT_IDENTITY", title: "Name evidence",
          sourcePath: "$.name", extractedValue: "Test",
          contentHash: computeContentHash("Test"),
          entityType: "product", entityId: product.id, productId: product.id,
        },
      });

      const claim = await prisma.claim.create({
        data: {
          tenantId,
          subjectType: "product",
          subjectId: product.id,
          predicate: "NAME_IS",
          value: "Test",
          claimType: "attribute",
          confidence: 0.9,
          evidence: { connect: { id: evidence.id } },
        },
      });

      // Traverse: claim → evidence → observation → source
      const foundClaim = await prisma.claim.findFirst({
        where: { id: claim.id, tenantId },
        include: { evidence: { include: { observation: true, source: true } } },
      });

      expect(foundClaim).not.toBeNull();
      expect(foundClaim!.evidence.length).toBe(1);
      expect(foundClaim!.evidence[0].id).toBe(evidence.id);
      expect(foundClaim!.evidence[0].observation).not.toBeNull();
      expect(foundClaim!.evidence[0].observation!.id).toBe(observation.id);
      expect(foundClaim!.evidence[0].source).not.toBeNull();
      expect(foundClaim!.evidence[0].source!.id).toBe(sourceId);
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────────────

  describe("Tenant isolation", () => {
    it("tenant A cannot see tenant B evidence", async () => {
      const tenantB = await createTenant("Phase6 Tenant B");

      const product = await prisma.product.create({
        data: { tenantId: tenantB.id, name: "Tenant B Product", normalizedName: "tenant b product", searchKey: "tenantbproduct" },
      });

      await prisma.evidence.create({
        data: {
          tenantId: tenantB.id,
          evidenceType: "PRICE",
          title: "Tenant B price",
          extractedValue: 500,
          contentHash: computeContentHash(500),
          entityType: "product",
          entityId: product.id,
          productId: product.id,
        },
      });

      // Tenant A queries — should see nothing
      const tenantAEvidence = await prisma.evidence.findMany({
        where: { tenantId, entityType: "product", entityId: product.id },
      });
      expect(tenantAEvidence.length).toBe(0);

      // Tenant B queries — should see their evidence
      const tenantBEvidence = await prisma.evidence.findMany({
        where: { tenantId: tenantB.id, entityType: "product", entityId: product.id },
      });
      expect(tenantBEvidence.length).toBe(1);

      // Cleanup tenant B
      await prisma.evidence.deleteMany({ where: { tenantId: tenantB.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.source.deleteMany({ where: { tenantId: tenantB.id } });
      await prisma.tenant.delete({ where: { id: tenantB.id } });
    });

    it("tenant A cannot see tenant B claims", async () => {
      const tenantB = await createTenant("Phase6 Tenant B Claims");

      await prisma.claim.create({
        data: {
          tenantId: tenantB.id,
          subjectType: "product",
          subjectId: "some-id",
          predicate: "SELLS",
          claimType: "relationship",
        },
      });

      const tenantAClaims = await prisma.claim.findMany({
        where: { tenantId },
      });
      const hasTenantBClaim = tenantAClaims.some((c) => c.subjectId === "some-id");
      expect(hasTenantBClaim).toBe(false);

      await prisma.claim.deleteMany({ where: { tenantId: tenantB.id } });
      await prisma.tenant.delete({ where: { id: tenantB.id } });
    });
  });

  // ─── Calculation Provenance ────────────────────────────────────────────────

  describe("Calculation provenance", () => {
    it("tracks calculation inputs and outputs", async () => {
      const product = await prisma.product.create({
        data: { tenantId, name: "Calc Product", normalizedName: "calc product", searchKey: "calcproduct" },
      });

      // Create input evidence
      const ev1 = await prisma.evidence.create({
        data: {
          tenantId, sourceId, evidenceType: "PRICE", title: "Price 1",
          sourcePath: "$.price", extractedValue: 100, normalizedValue: 100,
          valueType: "number", contentHash: computeContentHash(100),
          entityType: "product", entityId: product.id, productId: product.id,
        },
      });

      const ev2 = await prisma.evidence.create({
        data: {
          tenantId, sourceId, evidenceType: "PRICE", title: "Price 2",
          sourcePath: "$.price", extractedValue: 200, normalizedValue: 200,
          valueType: "number", contentHash: computeContentHash(200),
          entityType: "product", entityId: product.id, productId: product.id,
        },
      });

      // Create calculation
      const calc = await prisma.calculation.create({
        data: {
          tenantId,
          calculationType: "average_price",
          algorithm: "mean",
          algorithmVersion: "price-stats-v1",
          inputs: [{ evidenceId: ev1.id }, { evidenceId: ev2.id }],
          outputs: { value: 150, currency: "BDT" },
          units: "BDT",
          currency: "BDT",
          confidence: 0.9,
          entityType: "product",
          entityId: product.id,
          inputEvidence: { connect: [{ id: ev1.id }, { id: ev2.id }] },
        },
      });

      // Verify provenance chain
      const found = await prisma.calculation.findFirst({
        where: { id: calc.id, tenantId },
        include: { inputEvidence: true },
      });

      expect(found).not.toBeNull();
      expect(found!.algorithm).toBe("mean");
      expect(found!.inputEvidence.length).toBe(2);
      expect(found!.outputs).toEqual({ value: 150, currency: "BDT" });
    });
  });

  // ─── Evidence Status Lifecycle ─────────────────────────────────────────────

  describe("Evidence status lifecycle", () => {
    it("supports active → stale → superseded transitions", async () => {
      const product = await prisma.product.create({
        data: { tenantId, name: "Lifecycle Product", normalizedName: "lifecycle product", searchKey: "lifecycleproduct" },
      });

      const ev = await prisma.evidence.create({
        data: {
          tenantId, evidenceType: "PRICE", title: "Price",
          extractedValue: 100, contentHash: computeContentHash(100),
          entityType: "product", entityId: product.id, productId: product.id,
          status: "active", freshness: "live",
        },
      });

      expect(ev.status).toBe("active");

      // Transition to stale
      const stale = await prisma.evidence.update({
        where: { id: ev.id },
        data: { status: "stale", freshness: "stale" },
      });
      expect(stale.status).toBe("stale");

      // Supersede
      const superseded = await prisma.evidence.update({
        where: { id: ev.id },
        data: { status: "superseded" },
      });
      expect(superseded.status).toBe("superseded");
    });
  });
});
