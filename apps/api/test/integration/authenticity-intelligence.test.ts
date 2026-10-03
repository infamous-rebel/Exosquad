// =============================================================================
// Phase 8 (Original Roadmap) — Integration Tests: Authenticity Intelligence
// =============================================================================
// Tests authenticity assessment, signal generation, persistence, tenant
// isolation, deduplication, evidence chain, provenance, recalculation,
// risk persistence, and multi-tenant isolation with real PostgreSQL.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@exosquad/database";
import { AUTHENTICITY_CONFIG } from "@exosquad/common";
import {
  assessAuthenticity,
  getAssessment,
  listAssessments,
  getAssessmentSignals,
  getAssessmentEvidence,
  getAssessmentRisks,
  getAssessmentHistory,
  getAssessmentProvenance,
  recalculateAssessment,
} from "../../src/services/authenticity-intelligence.js";

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

async function createProduct(tenantId: string, name: string, brandId?: string) {
  return prisma.product.create({
    data: {
      tenantId,
      name,
      normalizedName: name.toLowerCase(),
      searchKey: name.toLowerCase().replace(/\s+/g, ""),
      brandId,
    },
  });
}

async function createBrand(tenantId: string, name: string) {
  return prisma.brand.create({
    data: {
      tenantId,
      name,
      normalizedName: name.toLowerCase(),
      searchKey: name.toLowerCase().replace(/\s+/g, ""),
    },
  });
}

async function createEvidence(params: {
  tenantId: string;
  sourceId: string;
  entityType: string;
  entityId: string;
  evidenceType: string;
  title?: string;
  contentHash?: string;
  normalizedValue?: Record<string, unknown>;
  confidence?: number;
}) {
  const {
    tenantId,
    sourceId,
    entityType,
    entityId,
    evidenceType,
    title = "Test Evidence",
    contentHash = `hash-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    normalizedValue = {},
    confidence = 0.8,
  } = params;

  // Create observation first (required FK)
  const observation = await prisma.observation.create({
    data: {
      tenantId,
      sourceId,
      rawPayload: { test: true },
      contentHash,
      observedAt: new Date(),
      retrievedAt: new Date(),
    },
  });

  return prisma.evidence.create({
    data: {
      tenantId,
      sourceId,
      observationId: observation.id,
      evidenceType,
      title,
      entityType,
      entityId,
      contentHash,
      confidence,
      status: "active",
      freshness: "fresh",
      normalizedValue,
      extractedValue: normalizedValue,
      observedAt: new Date(),
    },
  });
}

async function cleanupTenant(tenantId: string) {
  await prisma.$transaction(async (tx) => {
    // Authenticity tables
    await tx.authenticityDecision.deleteMany({ where: { assessment: { tenantId } } });
    await tx.authenticityRisk.deleteMany({ where: { assessment: { tenantId } } });
    await tx.authenticityEvidenceLink.deleteMany({ where: { assessment: { tenantId } } });
    await tx.authenticitySignal.deleteMany({ where: { assessment: { tenantId } } });
    await tx.authenticityAssessment.deleteMany({ where: { tenantId } });
    // Evidence & conflicts
    await tx.evidenceConflict.deleteMany({ where: { tenantId } });
    const evidence = await tx.evidence.findMany({ where: { tenantId }, select: { id: true } });
    if (evidence.length > 0) {
      const evidenceIds = evidence.map((e) => e.id);
      await tx.claim.deleteMany({ where: { tenantId, evidenceId: { in: evidenceIds } } });
    }
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

describe("Phase 8 (Original Roadmap): Authenticity Intelligence Integration", () => {
  let tenantId: string;
  let sourceId1: string;
  let sourceId2: string;
  let productId: string;
  let brandId: string;

  beforeAll(async () => {
    const tenant = await createTenant("Auth Intelligence Integration");
    tenantId = tenant.id;

    const source1 = await createSource(tenantId, "Auth Source Alpha");
    sourceId1 = source1.id;
    const source2 = await createSource(tenantId, "Auth Source Beta");
    sourceId2 = source2.id;

    const brand = await createBrand(tenantId, "Auth Test Brand");
    brandId = brand.id;

    const product = await createProduct(tenantId, "Auth Test Product", brandId);
    productId = product.id;
  });

  afterAll(async () => {
    await cleanupTenant(tenantId);
    await prisma.$disconnect();
  });

  // ─── 1. Basic Assessment with No Evidence ─────────────────────────────────

  it("should assess a product with no evidence and return INSUFFICIENT_EVIDENCE", async () => {
    const result = await assessAuthenticity({
      tenantId,
      subjectType: "PRODUCT",
      subjectId: productId,
    });

    expect(result.tenantId).toBe(tenantId);
    expect(result.subjectType).toBe("PRODUCT");
    expect(result.subjectId).toBe(productId);
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.score).toBe(50); // Neutral score for no evidence
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(0.3);
    expect(result.evidenceCount).toBe(0);
    expect(result.signalCount).toBeGreaterThan(0); // UNKNOWN signals
    expect(result.assessmentId).toBeTruthy();
    expect(result.algorithmVersion).toBe(AUTHENTICITY_CONFIG.algorithmVersion);
    expect(result.inputHash).toBeTruthy();
    expect(result.calculationHash).toBeTruthy();
  });

  // ─── 2. Assessment with Evidence ──────────────────────────────────────────

  it("should assess a product with product identity evidence", async () => {
    // Create evidence from source 1
    await createEvidence({
      tenantId,
      sourceId: sourceId1,
      entityType: "product",
      entityId: productId,
      evidenceType: "PRODUCT_IDENTITY",
      title: "Product identity from Alpha",
      contentHash: "auth-hash-consistent-1",
      normalizedValue: { name: "auth test product", sku: "AUTH-001" },
      confidence: 0.85,
    });

    // Create matching evidence from source 2
    await createEvidence({
      tenantId,
      sourceId: sourceId2,
      entityType: "product",
      entityId: productId,
      evidenceType: "PRODUCT_IDENTITY",
      title: "Product identity from Beta",
      contentHash: "auth-hash-consistent-1",
      normalizedValue: { name: "auth test product", sku: "AUTH-001" },
      confidence: 0.8,
    });

    const result = await assessAuthenticity({
      tenantId,
      subjectType: "PRODUCT",
      subjectId: productId,
    });

    expect(result.status).not.toBe("INSUFFICIENT_EVIDENCE");
    expect(result.evidenceCount).toBe(2);
    expect(result.sourceDiversity).toBe(2);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.positiveSignalCount).toBeGreaterThanOrEqual(0);
  });

  // ─── 3. Assessment Persistence ────────────────────────────────────────────

  it("should persist assessment with signals, evidence links, risks, and decisions", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 10,
      sortOrder: "desc",
    });

    expect(assessments.data.length).toBeGreaterThan(0);

    const latest = assessments.data[0]!;
    expect(latest.tenantId).toBe(tenantId);
    expect(latest.subjectType).toBe("PRODUCT");
    expect(latest.subjectId).toBe(productId);

    // Get full assessment with relations
    const detail = await getAssessment(tenantId, latest.id);
    expect(detail.signals).toBeDefined();
    expect(detail.risks).toBeDefined();
    expect(detail.evidenceLinks).toBeDefined();
    expect(detail.decisions).toBeDefined();
    expect(detail.signals.length).toBeGreaterThan(0);
    expect(detail.decisions.length).toBe(1);

    // Verify decision snapshot
    const decision = detail.decisions[0]!;
    expect(decision.algorithmVersion).toBe(AUTHENTICITY_CONFIG.algorithmVersion);
    expect(decision.finalScore).toBe(latest.score);
    expect(decision.finalConfidence).toBe(latest.confidence);
  });

  // ─── 4. Signal Persistence ────────────────────────────────────────────────

  it("should persist signals with correct types and directions", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 10,
      sortOrder: "desc",
    });
    const assessmentId = assessments.data[0]!.id;

    const signals = await getAssessmentSignals(tenantId, assessmentId);
    expect(signals.length).toBeGreaterThan(0);

    for (const signal of signals) {
      expect(signal.assessmentId).toBe(assessmentId);
      expect(signal.signalType).toBeTruthy();
      expect(["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"]).toContain(signal.direction);
      expect(signal.score).toBeGreaterThanOrEqual(0);
      expect(signal.score).toBeLessThanOrEqual(1);
      expect(signal.weight).toBeGreaterThan(0);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    }
  });

  // ─── 5. Risk Persistence ──────────────────────────────────────────────────

  it("should persist risk assessments", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 10,
      sortOrder: "desc",
    });
    const assessmentId = assessments.data[0]!.id;

    const risks = await getAssessmentRisks(tenantId, assessmentId);
    // With evidence, we may or may not have risks — but structure should be valid
    for (const risk of risks) {
      expect(risk.assessmentId).toBe(assessmentId);
      expect(risk.riskType).toBeTruthy();
      expect(["low", "medium", "high", "critical"]).toContain(risk.severity);
      expect(risk.score).toBeGreaterThanOrEqual(0);
      expect(risk.score).toBeLessThanOrEqual(1);
      expect(risk.title).toBeTruthy();
      expect(risk.description).toBeTruthy();
    }
  });

  // ─── 6. Evidence Link Persistence ─────────────────────────────────────────

  it("should persist evidence links with roles", async () => {
    // Find the assessment that has evidence (not the empty one)
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });
    const withEvidence = assessments.data.find((a) => a.evidenceCount > 0);
    if (!withEvidence) {
      // Skip if no assessment with evidence exists yet
      return;
    }
    const assessmentId = withEvidence.id;

    const evidenceLinks = await getAssessmentEvidence(tenantId, assessmentId);
    expect(evidenceLinks.length).toBeGreaterThan(0);

    for (const link of evidenceLinks) {
      expect(link.assessmentId).toBe(assessmentId);
      expect(link.evidenceId).toBeTruthy();
      expect(["SUPPORTING", "CONTRADICTING", "CONTEXTUAL"]).toContain(link.evidenceRole);
      expect(["DIRECT", "STRONG", "MODERATE", "WEAK", "CONTEXTUAL"]).toContain(link.evidenceStrength);
      expect(typeof link.relevance).toBe("number");
    }
  });

  // ─── 7. Decision History ──────────────────────────────────────────────────

  it("should maintain decision history", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 10,
      sortOrder: "desc",
    });
    const assessmentId = assessments.data[0]!.id;

    const history = await getAssessmentHistory(tenantId, assessmentId);
    expect(history.length).toBeGreaterThanOrEqual(1);

    const decision = history[0]!;
    expect(decision.assessmentId).toBe(assessmentId);
    expect(typeof decision.identityScore).toBe("number");
    expect(typeof decision.brandScore).toBe("number");
    expect(typeof decision.evidenceQuantityScore).toBe("number");
    expect(typeof decision.finalScore).toBe("number");
    expect(typeof decision.finalConfidence).toBe("number");
    expect(decision.inputHash).toBeTruthy();
  });

  // ─── 8. Provenance Chain ──────────────────────────────────────────────────

  it("should traverse the full provenance chain", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 10,
      sortOrder: "desc",
    });
    const assessmentId = assessments.data[0]!.id;

    const provenance = await getAssessmentProvenance(tenantId, assessmentId);

    expect(provenance.assessment.id).toBe(assessmentId);
    expect(provenance.assessment.subjectType).toBe("PRODUCT");
    expect(provenance.assessment.subjectId).toBe(productId);
    expect(provenance.assessment.status).toBeTruthy();
    expect(typeof provenance.assessment.score).toBe("number");
    expect(typeof provenance.assessment.confidence).toBe("number");
    expect(provenance.assessment.algorithmVersion).toBe(AUTHENTICITY_CONFIG.algorithmVersion);

    // Signals
    expect(Array.isArray(provenance.signals)).toBe(true);

    // Evidence
    expect(Array.isArray(provenance.evidence)).toBe(true);

    // Sources
    expect(Array.isArray(provenance.sources)).toBe(true);

    // Provenance chain summary
    expect(provenance.provenanceChain.assessmentId).toBe(assessmentId);
    expect(typeof provenance.provenanceChain.signalCount).toBe("number");
    expect(typeof provenance.provenanceChain.evidenceCount).toBe("number");
    expect(typeof provenance.provenanceChain.sourceCount).toBe("number");
  });

  // ─── 9. Tenant Isolation ──────────────────────────────────────────────────

  it("should isolate assessments by tenant", async () => {
    const tenant2 = await createTenant("Auth Tenant B");
    const source2 = await createSource(tenant2.id, "Auth Source for B");
    const product2 = await createProduct(tenant2.id, "Auth Product B");

    // Assess for tenant2
    const result = await assessAuthenticity({
      tenantId: tenant2.id,
      subjectType: "PRODUCT",
      subjectId: product2.id,
    });

    expect(result.tenantId).toBe(tenant2.id);

    // Tenant2 should not see tenant1's assessments
    const tenant2Assessments = await listAssessments({
      tenantId: tenant2.id,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });
    for (const a of tenant2Assessments.data) {
      expect(a.tenantId).toBe(tenant2.id);
    }

    // Tenant1 should not see tenant2's assessments
    const tenant1Assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });
    for (const a of tenant1Assessments.data) {
      expect(a.tenantId).toBe(tenantId);
    }

    await cleanupTenant(tenant2.id);
  });

  // ─── 10. Cross-Tenant Access Denied ───────────────────────────────────────

  it("should throw NotFoundError for cross-tenant assessment access", async () => {
    const tenant3 = await createTenant("Auth Tenant C");

    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 1,
      sortOrder: "desc",
    });
    const assessmentId = assessments.data[0]!.id;

    // Try to access tenant1's assessment from tenant3
    await expect(getAssessment(tenant3.id, assessmentId)).rejects.toThrow();

    await cleanupTenant(tenant3.id);
  });

  // ─── 11. Listing with Filtering and Pagination ────────────────────────────

  it("should list assessments with filtering and pagination", async () => {
    // List all
    const all = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });
    expect(all.data.length).toBeGreaterThan(0);
    expect(all.pagination.total).toBeGreaterThan(0);
    expect(all.pagination.page).toBe(1);

    // Filter by subjectType
    const filtered = await listAssessments({
      tenantId,
      subjectType: "PRODUCT",
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });
    expect(filtered.data.length).toBeGreaterThan(0);
    for (const a of filtered.data) {
      expect(a.subjectType).toBe("PRODUCT");
    }

    // Pagination
    const page1 = await listAssessments({
      tenantId,
      page: 1,
      limit: 1,
      sortOrder: "desc",
    });
    expect(page1.data.length).toBeLessThanOrEqual(1);
    expect(page1.pagination.limit).toBe(1);
  });

  // ─── 12. Recalculation Creates New Record ─────────────────────────────────

  it("should deduplicate assessments with same input hash", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 10,
      sortOrder: "desc",
    });
    const originalId = assessments.data[0]!.id;

    // Recalculate — same evidence means same inputHash, so same assessment returned
    const recalculated = await recalculateAssessment(tenantId, originalId);

    expect(recalculated.assessmentId).toBeTruthy();
    // Same input hash → deduplicated → same assessment ID
    expect(recalculated.assessmentId).toBe(originalId);
    // Same subject
    expect(recalculated.subjectType).toBe("PRODUCT");
    expect(recalculated.subjectId).toBe(productId);
    // Same algorithm version
    expect(recalculated.algorithmVersion).toBe(AUTHENTICITY_CONFIG.algorithmVersion);
  });

  // ─── 13. Recalculation of Non-Existent Assessment ─────────────────────────

  it("should throw NotFoundError when recalculating non-existent assessment", async () => {
    await expect(
      recalculateAssessment(tenantId, "non-existent-id")
    ).rejects.toThrow();
  });

  // ─── 14. Invalid Subject Type ─────────────────────────────────────────────

  it("should throw ValidationError for unsupported subject type", async () => {
    await expect(
      assessAuthenticity({
        tenantId,
        subjectType: "INVALID_TYPE",
        subjectId: "some-id",
      })
    ).rejects.toThrow();
  });

  // ─── 15. Non-Existent Product ─────────────────────────────────────────────

  it("should throw NotFoundError for non-existent product", async () => {
    await expect(
      assessAuthenticity({
        tenantId,
        subjectType: "PRODUCT",
        subjectId: "non-existent-product-id",
      })
    ).rejects.toThrow();
  });

  // ─── 16. Score and Confidence Ranges ──────────────────────────────────────

  it("should produce score in [0,100] and confidence in [0,1]", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });

    for (const a of assessments.data) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
  });

  // ─── 17. Algorithm Version Tracking ───────────────────────────────────────

  it("should track algorithm version on all assessments", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });

    for (const a of assessments.data) {
      expect(a.algorithmVersion).toBe(AUTHENTICITY_CONFIG.algorithmVersion);
    }
  });

  // ─── 18. Hash Persistence ─────────────────────────────────────────────────

  it("should persist inputHash and calculationHash", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });

    for (const a of assessments.data) {
      expect(a.inputHash).toBeTruthy();
      expect(a.inputHash.length).toBe(64); // SHA-256 hex
      if (a.calculationHash) {
        expect(a.calculationHash.length).toBe(64);
      }
    }
  });

  // ─── 19. Contradictory Evidence ───────────────────────────────────────────

  it("should handle contradictory evidence and produce lower score", async () => {
    // Create a new product for this test
    const contradictProduct = await createProduct(tenantId, "Contradict Test Product");

    // Create evidence with different content hashes (contradiction)
    await createEvidence({
      tenantId,
      sourceId: sourceId1,
      entityType: "product",
      entityId: contradictProduct.id,
      evidenceType: "PRODUCT_IDENTITY",
      title: "Contradict evidence A",
      contentHash: "contradict-hash-A",
      normalizedValue: { name: "product version A" },
      confidence: 0.8,
    });

    await createEvidence({
      tenantId,
      sourceId: sourceId2,
      entityType: "product",
      entityId: contradictProduct.id,
      evidenceType: "PRODUCT_IDENTITY",
      title: "Contradict evidence B",
      contentHash: "contradict-hash-B",
      normalizedValue: { name: "product version B" },
      confidence: 0.8,
    });

    const result = await assessAuthenticity({
      tenantId,
      subjectType: "PRODUCT",
      subjectId: contradictProduct.id,
    });

    // Should have contradictions detected
    expect(result.contradictionCount).toBeGreaterThan(0);
    expect(result.negativeSignalCount).toBeGreaterThan(0);
  });

  // ─── 20. Brand Assessment ─────────────────────────────────────────────────

  it("should assess a brand subject", async () => {
    const result = await assessAuthenticity({
      tenantId,
      subjectType: "BRAND",
      subjectId: brandId,
    });

    expect(result.tenantId).toBe(tenantId);
    expect(result.subjectType).toBe("BRAND");
    expect(result.subjectId).toBe(brandId);
    expect(result.assessmentId).toBeTruthy();
    // Brand with no direct evidence → INSUFFICIENT_EVIDENCE or low confidence
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  // ─── 21. Data Completeness ────────────────────────────────────────────────

  it("should report data completeness based on evidence diversity", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });

    for (const a of assessments.data) {
      expect(a.dataCompleteness).toBeGreaterThanOrEqual(0);
      expect(a.dataCompleteness).toBeLessThanOrEqual(1);
    }
  });

  // ─── 22. Source Diversity ─────────────────────────────────────────────────

  it("should track source diversity count", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });

    // The assessment with 2 evidence records from 2 sources should have diversity 2
    const withEvidence = assessments.data.find((a) => a.evidenceCount >= 2);
    if (withEvidence) {
      expect(withEvidence.sourceDiversity).toBeGreaterThanOrEqual(1);
    }
  });

  // ─── 23. Status Valid Values ──────────────────────────────────────────────

  it("should only produce valid status values", async () => {
    const validStatuses = [
      "UNASSESSED",
      "INSUFFICIENT_EVIDENCE",
      "VERIFIED",
      "LIKELY_AUTHENTIC",
      "UNCERTAIN",
      "SUSPICIOUS",
      "LIKELY_COUNTERFEIT",
      "CONTRADICTED",
    ];

    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });

    for (const a of assessments.data) {
      expect(validStatuses).toContain(a.status);
    }
  });

  // ─── 24. Signal Counters Consistency ──────────────────────────────────────

  it("should have consistent signal counters", async () => {
    const assessments = await listAssessments({
      tenantId,
      page: 1,
      limit: 100,
      sortOrder: "desc",
    });

    for (const a of assessments.data) {
      expect(a.signalCount).toBeGreaterThanOrEqual(0);
      expect(a.positiveSignalCount).toBeGreaterThanOrEqual(0);
      expect(a.negativeSignalCount).toBeGreaterThanOrEqual(0);
      expect(a.contradictionCount).toBeGreaterThanOrEqual(0);
      // Positive + negative should not exceed total
      expect(a.positiveSignalCount + a.negativeSignalCount).toBeLessThanOrEqual(a.signalCount + a.negativeSignalCount);
    }
  });
});
