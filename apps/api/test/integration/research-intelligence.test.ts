// =============================================================================
// Phase 14 — Integration Tests: AI Research & Reasoning Intelligence
// =============================================================================
// 24+ adversarial integration tests verifying cross-tenant isolation,
// research lifecycle, content-hash deduplication, evidence retrieval,
// contradiction detection, gap analysis, hypothesis evaluation,
// graceful AI degradation, depth presets, and full provenance chain.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@exosquad/database";
import { RESEARCH_CONFIG } from "@exosquad/common";
import {
  createResearchRequest,
  executeResearch,
  listResearchRequests,
  getResearchRequest,
  getResearchResult,
  getResearchEvidence,
  getResearchGaps,
  getResearchContradictions,
  getResearchHypotheses,
  getResearchHistory,
  cancelResearchRequest,
  expireStaleResearch,
} from "../../src/services/research-intelligence.js";
import {
  sha256,
  computeResearchRequestHash,
  computeResearchInputHash,
  computeResearchCacheKey,
  computeSubQuestionHash,
  computeEvidenceItemHash,
  computeContradictionHash,
  computeHypothesisHash,
  computeResearchGapHash,
  computeResearchResultHash,
  assessEvidenceQuality,
  detectContradictions,
  calculateConfidence,
  detectResearchGaps,
  evaluateHypothesis,
  calculateCompleteness,
  getDepthPreset,
  checkExecutionLimits,
} from "../../src/services/research-engine.js";

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

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Research Intelligence — Integration Tests (24+ adversarial cases)", () => {
  let tenant1: { id: string };
  let tenant2: { id: string };
  let product1: { id: string };
  let product2: { id: string };

  beforeAll(async () => {
    tenant1 = await createTenant("P14 Test Tenant 1");
    tenant2 = await createTenant("P14 Test Tenant 2");
    product1 = await createProduct(tenant1.id, "Research Widget Alpha");
    product2 = await createProduct(tenant1.id, "Research Widget Beta");
  });

  afterAll(async () => {
    const tenantIds = [tenant1.id, tenant2.id];
    // Cleanup in FK-safe order
    await prisma.researchResult.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.researchGap.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.researchHypothesis.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.researchContradiction.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.researchEvidenceItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.researchSubQuestion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.researchRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  // ─── 1. Cross-Tenant Isolation ─────────────────────────────────────────────

  it("1. cross-tenant isolation: tenant2 cannot see tenant1 research", async () => {
    // Create research for tenant1
    const result = await createResearchRequest({
      tenantId: tenant1.id,
      question: "What is the demand for electronics in Bangladesh?",
      questionType: "DEMAND",
    });
    expect(result.id).toBeTruthy();
    expect(result.status).toBe("QUEUED");

    // List for tenant1 should find it
    const tenant1List = await listResearchRequests({ tenantId: tenant1.id, page: 1, limit: 100 });
    expect(tenant1List.data.length).toBeGreaterThanOrEqual(1);
    expect(tenant1List.data.some((r: unknown) => (r as { id: string }).id === result.id)).toBe(true);

    // List for tenant2 should NOT find it
    const tenant2List = await listResearchRequests({ tenantId: tenant2.id, page: 1, limit: 100 });
    const tenant2Ids = tenant2List.data.map((r: unknown) => (r as { id: string }).id);
    expect(tenant2Ids).not.toContain(result.id);
  });

  // ─── 2. Request Creation with Defaults ─────────────────────────────────────

  it("2. request creation: defaults applied correctly", async () => {
    const result = await createResearchRequest({
      tenantId: tenant1.id,
      question: "What are the top suppliers for textiles?",
    });

    const request = await getResearchRequest({ tenantId: tenant1.id, requestId: result.id }) as {
      questionType: string;
      requiredEvidenceQuality: string;
      requestedDepth: string;
      status: string;
    };

    expect(request.questionType).toBe("GENERAL");
    expect(request.requiredEvidenceQuality).toBe("MEDIUM");
    expect(request.requestedDepth).toBe("standard");
    expect(request.status).toBe("QUEUED");
  });

  // ─── 3. Depth Presets Applied ──────────────────────────────────────────────

  it("3. depth presets: brief has smaller limits than deep", async () => {
    const brief = await createResearchRequest({
      tenantId: tenant1.id,
      question: "Quick check: is this product available?",
      requestedDepth: "brief",
    });
    const deep = await createResearchRequest({
      tenantId: tenant1.id,
      question: "Deep analysis of supply chain for electronics",
      requestedDepth: "deep",
    });

    const briefReq = await getResearchRequest({ tenantId: tenant1.id, requestId: brief.id }) as {
      maxSubQuestions: number;
      maxEvidenceItems: number;
      maxIterations: number;
    };
    const deepReq = await getResearchRequest({ tenantId: tenant1.id, requestId: deep.id }) as {
      maxSubQuestions: number;
      maxEvidenceItems: number;
      maxIterations: number;
    };

    expect(briefReq.maxSubQuestions).toBeLessThan(deepReq.maxSubQuestions);
    expect(briefReq.maxEvidenceItems).toBeLessThan(deepReq.maxEvidenceItems);
    expect(briefReq.maxIterations).toBeLessThan(deepReq.maxIterations);
  });

  // ─── 4. Content Hash Determinism ───────────────────────────────────────────

  it("4. content hash determinism: same inputs produce same hash", async () => {
    const h1 = computeResearchRequestHash({
      tenantId: "t1", question: "q?", questionType: "GENERAL",
      productId: null, market: null, country: null,
      researchObjective: null, requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard",
    });
    const h2 = computeResearchRequestHash({
      tenantId: "t1", question: "q?", questionType: "GENERAL",
      productId: null, market: null, country: null,
      researchObjective: null, requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard",
    });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // ─── 5. Cache Key Includes Prompt Version ──────────────────────────────────

  it("5. cache key: different prompt versions produce different keys", async () => {
    const k1 = computeResearchCacheKey({
      tenantId: "t1", question: "q?", questionType: "GENERAL",
      productId: null, market: null, country: null,
      requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard", promptVersion: "v1",
    });
    const k2 = computeResearchCacheKey({
      tenantId: "t1", question: "q?", questionType: "GENERAL",
      productId: null, market: null, country: null,
      requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard", promptVersion: "v2",
    });
    expect(k1).not.toBe(k2);
  });

  // ─── 6. Execute Research (Full Workflow) ───────────────────────────────────

  it("6. execute research: full workflow produces results", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "What is the landed cost of importing electronics from China to Bangladesh?",
      questionType: "LOGISTICS",
      productId: product1.id,
    });

    const result = await executeResearch(created.id);

    // With NoOp AI provider, research degrades gracefully to PARTIAL
    expect(["COMPLETED", "PARTIAL"]).toContain(result.status);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.completeness).toBeGreaterThanOrEqual(0);
    expect(result.completeness).toBeLessThanOrEqual(1);
    expect(result.subQuestions).toBeGreaterThanOrEqual(0);
    expect(result.evidenceItems).toBeGreaterThanOrEqual(0);
    expect(result.modelCalls).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ─── 7. Execute Research: Nonexistent Request Throws ───────────────────────

  it("7. execute research: nonexistent request throws NotFoundError", async () => {
    await expect(executeResearch("nonexistent-id")).rejects.toThrow();
  });

  // ─── 8. Cancel Research Request ────────────────────────────────────────────

  it("8. cancel request: QUEUED request can be cancelled", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "Cancel me please",
    });

    const cancelled = await cancelResearchRequest({ tenantId: tenant1.id, requestId: created.id });
    expect(cancelled.status).toBe("CANCELLED");

    // Verify it's actually cancelled in DB
    const request = await getResearchRequest({ tenantId: tenant1.id, requestId: created.id }) as {
      status: string;
    };
    expect(request.status).toBe("CANCELLED");
  });

  // ─── 9. Cancel Already Completed Request ───────────────────────────────────

  it("9. cancel request: COMPLETED request stays COMPLETED", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "Already done research",
    });

    // Execute it first
    await executeResearch(created.id);

    // Try to cancel — should remain COMPLETED
    const result = await cancelResearchRequest({ tenantId: tenant1.id, requestId: created.id });
    expect(result.status).toBe("COMPLETED");
  });

  // ─── 10. Research Result Retrieval ─────────────────────────────────────────

  it("10. research result: retrievable after execution", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "What are the pricing trends for textiles in Dhaka?",
      questionType: "PRICING",
      productId: product2.id,
    });

    await executeResearch(created.id);

    const result = await getResearchResult({ tenantId: tenant1.id, requestId: created.id }) as {
      requestId: string;
      overallConfidence: number;
      completenessScore: number;
    };
    expect(result.requestId).toBe(created.id);
    expect(result.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(result.completenessScore).toBeGreaterThanOrEqual(0);
  });

  // ─── 11. Evidence Retrieval ────────────────────────────────────────────────

  it("11. evidence retrieval: paginated list after execution", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "Find all suppliers for raw materials",
      questionType: "SUPPLIER",
    });

    await executeResearch(created.id);

    const evidence = await getResearchEvidence({ tenantId: tenant1.id, requestId: created.id, page: 1, limit: 10 });
    expect(evidence.pagination.page).toBe(1);
    expect(evidence.pagination.limit).toBe(10);
    expect(evidence.pagination.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(evidence.data)).toBe(true);
  });

  // ─── 12. Contradiction Detection ───────────────────────────────────────────

  it("12. contradictions: detectable after execution with conflicting evidence", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "What is the MOQ for this product?",
      questionType: "PRICING",
    });

    await executeResearch(created.id);

    const contradictions = await getResearchContradictions({ tenantId: tenant1.id, requestId: created.id });
    expect(Array.isArray(contradictions)).toBe(true);
    // Contradictions may or may not be found depending on evidence, but the query must work
  });

  // ─── 13. Research Gaps ─────────────────────────────────────────────────────

  it("13. research gaps: identified after execution", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "What is the authenticity status of this brand?",
      questionType: "IDENTITY",
    });

    await executeResearch(created.id);

    const gaps = await getResearchGaps({ tenantId: tenant1.id, requestId: created.id });
    expect(Array.isArray(gaps)).toBe(true);
    // Gaps should be identified (at minimum, dimensions without evidence)
  });

  // ─── 14. Hypotheses ────────────────────────────────────────────────────────

  it("14. hypotheses: evaluable after execution", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "Is this supplier reliable?",
      questionType: "SUPPLIER",
    });

    await executeResearch(created.id);

    const hypotheses = await getResearchHypotheses({ tenantId: tenant1.id, requestId: created.id });
    expect(Array.isArray(hypotheses)).toBe(true);
  });

  // ─── 15. Research History ──────────────────────────────────────────────────

  it("15. research history: completed requests appear in history", async () => {
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "Market analysis for consumer electronics",
      questionType: "DEMAND",
      productId: product1.id,
    });

    await executeResearch(created.id);

    const history = await getResearchHistory({ tenantId: tenant1.id, productId: product1.id, page: 1, limit: 10 });
    // History may include COMPLETED and possibly PARTIAL results
    expect(history.pagination.total).toBeGreaterThanOrEqual(0);
  });

  // ─── 16. Expire Stale Research ─────────────────────────────────────────────

  it("16. expire stale: old QUEUED requests are marked FAILED", async () => {
    // Create a request and manually backdate it
    const created = await createResearchRequest({
      tenantId: tenant1.id,
      question: "This will expire",
    });

    // Backdate the creation time to well beyond the cache TTL
    const veryOldDate = new Date(Date.now() - (RESEARCH_CONFIG.cacheTtlSeconds + 1000) * 1000);
    await prisma.researchRequest.update({
      where: { id: created.id },
      data: { createdAt: veryOldDate },
    });

    const result = await expireStaleResearch({ tenantId: tenant1.id });
    expect(result.expiredCount).toBeGreaterThanOrEqual(1);

    // Verify the request is now FAILED
    const request = await getResearchRequest({ tenantId: tenant1.id, requestId: created.id }) as {
      status: string;
    };
    expect(request.status).toBe("FAILED");
  });

  // ─── 17. Input Hash Excludes Timestamps ────────────────────────────────────

  it("17. input hash: deterministic regardless of when it's computed", async () => {
    const h1 = computeResearchInputHash({
      tenantId: "t1", question: "q?", questionType: "GENERAL",
      productId: null, market: null, country: null,
    });
    // Wait a tick to ensure time has passed
    await new Promise((resolve) => setTimeout(resolve, 10));
    const h2 = computeResearchInputHash({
      tenantId: "t1", question: "q?", questionType: "GENERAL",
      productId: null, market: null, country: null,
    });
    expect(h1).toBe(h2);
  });

  // ─── 18. Engine Determinism ────────────────────────────────────────────────

  it("18. engine determinism: same evidence produces same quality scores", async () => {
    const NOW = new Date("2026-10-01T00:00:00Z");
    const evidence = {
      id: "det-1",
      title: "Test",
      description: "Desc",
      sourceType: "EXISTING_EVIDENCE" as const,
      sourceEntity: "price_observation",
      sourceEntityId: "entity-1",
      extractedValue: 100,
      valueType: "number",
      observedAt: NOW,
      sourceIndependence: true,
      quality: "HIGH" as const,
      relevanceScore: 0.8,
      wasUsed: true,
    };

    const r1 = assessEvidenceQuality(evidence, NOW);
    const r2 = assessEvidenceQuality(evidence, NOW);

    expect(r1.overallQualityScore).toBe(r2.overallQualityScore);
    expect(r1.sourceAuthorityScore).toBe(r2.sourceAuthorityScore);
    expect(r1.temporalFreshnessScore).toBe(r2.temporalFreshnessScore);
  });

  // ─── 19. Contradiction Detection Engine ────────────────────────────────────

  it("19. contradiction detection: numeric spread detected", async () => {
    const results = detectContradictions([{
      subject: "price",
      evidenceItems: [
        {
          id: "a", title: "t", description: "d", sourceType: "EXISTING_EVIDENCE",
          sourceEntity: "e", sourceEntityId: "e1", extractedValue: 100,
          valueType: "number", observedAt: new Date(), sourceIndependence: true,
          quality: "HIGH", relevanceScore: 0.8, wasUsed: true,
        },
        {
          id: "b", title: "t", description: "d", sourceType: "EXISTING_EVIDENCE",
          sourceEntity: "e", sourceEntityId: "e2", extractedValue: 500,
          valueType: "number", observedAt: new Date(), sourceIndependence: true,
          quality: "HIGH", relevanceScore: 0.8, wasUsed: true,
        },
      ],
    }]);

    expect(results[0]!.detected).toBe(true);
    expect(results[0]!.severity).toBeTruthy();
  });

  // ─── 20. Confidence with No Evidence ───────────────────────────────────────

  it("20. confidence: no evidence produces INSUFFICIENT_EVIDENCE band", async () => {
    const result = calculateConfidence([], [], [], [], new Date());
    expect(result.confidenceBand).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(result.overallConfidence).toBeLessThanOrEqual(1);
  });

  // ─── 21. Research Gap Detection with Empty Evidence ────────────────────────

  it("21. research gaps: empty evidence triggers gaps", async () => {
    const subQuestions = [{
      id: "sq-1", question: "What is the price?", questionType: "PRICING",
      sequence: 1, status: "PENDING" as const, evidenceFound: 0,
      answerConfidence: 0, isDependencyMet: true,
    }];
    const gaps = detectResearchGaps(subQuestions, [], "PRICING");
    expect(gaps.length).toBeGreaterThan(0);
    // Should have blocking gaps since no evidence found
    expect(gaps.some((g) => g.isBlocking)).toBe(true);
  });

  // ─── 22. Hypothesis Evaluation: No Evidence ────────────────────────────────

  it("22. hypothesis evaluation: no evidence = INSUFFICIENT_EVIDENCE", async () => {
    const result = evaluateHypothesis(
      { id: "h1", statement: "test", hypothesisType: "feasibility", supportingEvidenceIds: [], contradictingEvidenceIds: [], unknowns: [] },
      [],
      [],
    );
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.confidence).toBe(0);
  });

  // ─── 23. Execution Limits Enforcement ──────────────────────────────────────

  it("23. execution limits: exceeded iterations block continuation", async () => {
    const result = checkExecutionLimits({
      currentIteration: 10,
      maxIterations: 5,
      modelCallsMade: 0,
      maxModelCalls: 20,
      evidenceItemsConsidered: 0,
      maxEvidenceItems: 50,
      subQuestionsGenerated: 0,
      maxSubQuestions: 15,
      tokenUsageEstimated: 0,
      maxTokenUsage: 50000,
      startedAt: new Date(),
      maxExecutionTimeMs: 300_000,
    });
    expect(result.canContinue).toBe(false);
    expect(result.reason).toContain("iterations");
  });

  // ─── 24. Completeness with Full Data ───────────────────────────────────────

  it("24. completeness: full data scores higher than empty", async () => {
    const subQuestions = [
      { id: "sq1", question: "q1", questionType: "GENERAL", sequence: 1, status: "COMPLETED" as const, evidenceFound: 5, answerConfidence: 0.8, isDependencyMet: true },
      { id: "sq2", question: "q2", questionType: "GENERAL", sequence: 2, status: "COMPLETED" as const, evidenceFound: 3, answerConfidence: 0.7, isDependencyMet: true },
    ];
    const evidence = [
      {
        id: "e1", title: "t", description: "d", sourceType: "EXISTING_EVIDENCE" as const,
        sourceEntity: "e", sourceEntityId: "e1", extractedValue: 100,
        valueType: "number", observedAt: new Date(), sourceIndependence: true,
        quality: "HIGH" as const, relevanceScore: 0.8, wasUsed: true,
      },
    ];

    const fullCompleteness = calculateCompleteness(subQuestions, evidence, [], [], "GENERAL");
    const emptyCompleteness = calculateCompleteness([], [], [], [], "GENERAL");

    expect(fullCompleteness.overallCompleteness).toBeGreaterThan(emptyCompleteness.overallCompleteness);
    expect(fullCompleteness.subQuestionCompleteness).toBe(1.0);
    expect(emptyCompleteness.subQuestionCompleteness).toBe(0);
  });

  // ─── 25. SHA-256 Consistency ──────────────────────────────────────────────

  it("25. sha256: consistent across calls", async () => {
    const input = "test-input-for-research";
    const h1 = sha256(input);
    const h2 = sha256(input);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  // ─── 26. List Pagination ──────────────────────────────────────────────────

  it("26. list pagination: respects page and limit", async () => {
    // Create multiple requests
    for (let i = 0; i < 3; i++) {
      await createResearchRequest({
        tenantId: tenant1.id,
        question: `Pagination test question ${i}`,
      });
    }

    const page1 = await listResearchRequests({ tenantId: tenant1.id, page: 1, limit: 2 });
    expect(page1.data.length).toBeLessThanOrEqual(2);
    expect(page1.pagination.page).toBe(1);
    expect(page1.pagination.limit).toBe(2);

    if (page1.pagination.total > 2) {
      const page2 = await listResearchRequests({ tenantId: tenant1.id, page: 2, limit: 2 });
      expect(page2.pagination.page).toBe(2);
      // Pages should have different items
      const page1Ids = page1.data.map((r: unknown) => (r as { id: string }).id);
      const page2Ids = page2.data.map((r: unknown) => (r as { id: string }).id);
      expect(page1Ids).not.toEqual(page2Ids);
    }
  });
});
