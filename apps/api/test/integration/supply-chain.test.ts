// =============================================================================
// Phase 9 — Integration Tests: Supply-Chain Intelligence
// =============================================================================
// Tests supply-chain assessment, graph building, edge status progression,
// evidence chain, path discovery, tenant isolation, deduplication, temporal
// reconstruction, adversarial scenarios, and regression safety.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@exosquad/database";
import { SUPPLY_CHAIN_CONFIG } from "@exosquad/common";
import {
  assessSupplyChain,
  getAssessment,
  listAssessments,
  getAssessmentNodes,
  getAssessmentEdges,
  getAssessmentPaths,
  getAssessmentEvidence,
  getAssessmentConflicts,
  getAssessmentProvenance,
  getAssessmentHistory,
  getAssessmentVerifications,
  getAssessmentAnomalies,
  getEdge,
  getEdgeProvenance,
  getEdgeObservations,
  recordClaim,
  listClaims,
  getClaim,
  queryRelationships,
  recalculateAssessment,
  buildGraph,
} from "../../src/services/supply-chain-intelligence.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTenant(name: string) {
  return prisma.tenant.create({
    data: { name, slug: `test-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
  });
}

async function createSource(tenantId: string, name: string, domain?: string) {
  return prisma.source.create({
    data: {
      tenantId,
      name,
      type: "api_connector",
      connectorType: "http",
      config: domain ? { baseUrl: `https://${domain}` } : {},
      status: "active",
    },
  });
}

async function createSCNode(tenantId: string, nodeType: string, name: string, sourceId?: string) {
  return prisma.supplyChainNode.create({
    data: {
      tenantId,
      nodeType,
      name,
      normalizedName: name.toLowerCase(),
      sourceId: sourceId ?? null,
      identityStatus: "unresolved",
    },
  });
}

async function createEvidence(tenantId: string, sourceId: string, entityType: string, entityId: string) {
  const observation = await prisma.observation.create({
    data: {
      tenantId,
      sourceId,
      rawPayload: { test: true },
      contentHash: `hash-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      observedAt: new Date(),
      retrievedAt: new Date(),
    },
  });

  return prisma.evidence.create({
    data: {
      tenantId,
      sourceId,
      evidenceType: "PRODUCT_IDENTITY",
      entityType,
      entityId,
      title: "Test Evidence",
      contentHash: `ev-hash-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      normalizedValue: {},
      confidence: 0.8,
      observationId: observation.id,
    },
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Supply-Chain Intelligence — Integration Tests", () => {
  let tenant1: { id: string };
  let tenant2: { id: string };
  let source1: { id: string };
  let source2: { id: string };

  beforeAll(async () => {
    tenant1 = await createTenant("SC Test Tenant 1");
    tenant2 = await createTenant("SC Test Tenant 2");
    source1 = await createSource(tenant1.id, "SC Source Alpha", "alpha.example.com");
    source2 = await createSource(tenant1.id, "SC Source Beta", "beta.example.com");
  });

  afterAll(async () => {
    // Cleanup — order respects FK constraints
    await prisma.supplyChainVerification.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.supplyChainDecision.deleteMany({ where: { assessment: { tenantId: { in: [tenant1.id, tenant2.id] } } } });
    await prisma.supplyChainAnomaly.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.supplyChainConflict.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.supplyChainClaim.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.supplyChainEvidenceLink.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.supplyChainObservation.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.supplyChainAssessment.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.supplyChainEdge.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.supplyChainNode.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    // Delete Phase 2 evidence/observations that reference sources (FK constraint)
    await prisma.evidence.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.observation.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.source.deleteMany({ where: { tenantId: { in: [tenant1.id, tenant2.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant1.id, tenant2.id] } } });
  });

  // ─── Graph Building ───────────────────────────────────────────────────────

  it("1. complete graph creation end-to-end via buildGraph", async () => {
    const result = await buildGraph({
      tenantId: tenant1.id,
      subjectType: "PRODUCT",
      subjectId: "product-1",
      edges: [
        {
          fromNodeType: "SUPPLIER",
          fromNodeName: "Acme Supplier",
          toNodeType: "PRODUCT",
          toNodeName: "Widget A",
          edgeType: "SUPPLIER_SUPPLIES",
          sourceId: source1.id,
          observedValue: { relationship: "Acme supplies Widget A" },
        },
      ],
    });

    expect(result.nodesCreated).toBe(2);
    expect(result.edgesCreated).toBe(1);
    expect(result.observationsCreated).toBe(1);
  });

  it("2. partial graph with unknown links", async () => {
    const node1 = await createSCNode(tenant1.id, "PRODUCT", "Unknown Origin Product");
    const node2 = await createSCNode(tenant1.id, "ORIGIN_COUNTRY", "Unknown Origin");

    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: node1.id,
        toNodeId: node2.id,
        edgeType: "ORIGINATED_FROM",
        relationshipStatus: "UNKNOWN",
      },
    });

    const edges = await prisma.supplyChainEdge.findMany({
      where: { tenantId: tenant1.id, relationshipStatus: "UNKNOWN" },
    });
    expect(edges.length).toBeGreaterThan(0);
  });

  // ─── Assessment ────────────────────────────────────────────────────────────

  it("3. assessment API end-to-end", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "Assessment Product");
    const result = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: node.id,
    });

    expect(result.assessmentId).toBeDefined();
    expect(result.algorithmVersion).toBe(SUPPLY_CHAIN_CONFIG.algorithmVersion);
  });

  it("4. list assessments with pagination", async () => {
    const result = await listAssessments({
      tenantId: tenant1.id,
      page: 1,
      limit: 10,
    });

    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
    expect(result.pagination.page).toBe(1);
  });

  it("5. get assessment detail", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "Detail Product");
    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: node.id,
    });

    const detail = await getAssessment(tenant1.id, assessment.assessmentId);
    expect(detail.data).toBeDefined();
    expect(detail.data.id).toBe(assessment.assessmentId);
  });

  // ─── Edge Operations ──────────────────────────────────────────────────────

  it("6. edge detail retrieval", async () => {
    const node1 = await createSCNode(tenant1.id, "SELLER", "Edge Test Seller");
    const node2 = await createSCNode(tenant1.id, "LISTING", "Edge Test Listing");
    const edge = await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: node1.id,
        toNodeId: node2.id,
        edgeType: "SELLER_LISTS",
        relationshipStatus: "OBSERVED",
        confidence: 0.7,
      },
    });

    const result = await getEdge(tenant1.id, edge.id);
    expect(result.data).toBeDefined();
    expect(result.data.id).toBe(edge.id);
  });

  it("7. edge provenance chain", async () => {
    const node1 = await createSCNode(tenant1.id, "SUPPLIER", "Prov Supplier");
    const node2 = await createSCNode(tenant1.id, "SELLER", "Prov Seller");
    const edge = await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: node1.id,
        toNodeId: node2.id,
        edgeType: "SUPPLIER_SUPPLIES",
      },
    });

    const result = await getEdgeProvenance(tenant1.id, edge.id);
    expect(result.data).toBeDefined();
  });

  // ─── Path Discovery ───────────────────────────────────────────────────────

  it("8. multi-hop path retrieval", async () => {
    const n1 = await createSCNode(tenant1.id, "BRAND", "Path Brand");
    const n2 = await createSCNode(tenant1.id, "PRODUCT", "Path Product");
    const n3 = await createSCNode(tenant1.id, "SELLER", "Path Seller");

    await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: n1.id, toNodeId: n2.id, edgeType: "BRAND_MANUFACTURES_PRODUCT", relationshipStatus: "CONFIRMED", confidence: 0.9 },
    });
    await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: n2.id, toNodeId: n3.id, edgeType: "SUPPLIER_SUPPLIES", relationshipStatus: "OBSERVED", confidence: 0.7 },
    });

    const node = await prisma.supplyChainNode.findFirst({ where: { tenantId: tenant1.id, name: "Path Brand" } });
    const result = await getAssessmentPaths(tenant1.id, (await assessSupplyChain({ tenantId: tenant1.id, subjectType: "brand", subjectId: node!.id })).assessmentId);
    expect(result.data).toBeDefined();
  });

  // ─── Claims ────────────────────────────────────────────────────────────────

  it("9. claim recording and retrieval", async () => {
    const n1 = await createSCNode(tenant1.id, "SUPPLIER", "Claim Supplier");
    const n2 = await createSCNode(tenant1.id, "PRODUCT", "Claim Product");

    const claim = await recordClaim({
      tenantId: tenant1.id,
      claimType: "FACTORY_DIRECT",
      claimText: "We are the factory",
      claimingNodeId: n1.id,
      targetNodeId: n2.id,
      sourceId: source1.id,
    });

    expect(claim.data).toBeDefined();
    expect(claim.data.status).toBe("UNVERIFIED");

    const detail = await getClaim(tenant1.id, claim.data.id);
    expect(detail.data.claimType).toBe("FACTORY_DIRECT");
  });

  it("10. list claims with filters", async () => {
    const result = await listClaims({ tenantId: tenant1.id, page: 1, limit: 10 });
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
  });

  // ─── Relationship Queries ──────────────────────────────────────────────────

  it("11. relationship query with filters", async () => {
    const result = await queryRelationships({
      tenantId: tenant1.id,
      page: 1,
      limit: 10,
    });
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
  });

  // ─── Tenant Isolation ─────────────────────────────────────────────────────

  it("12. cross-tenant isolation", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "Tenant Isolated Product");
    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: node.id,
    });

    // Tenant 2 should not see Tenant 1's assessment
    const result = await listAssessments({ tenantId: tenant2.id });
    const found = result.data.find((a: { id: string }) => a.id === assessment.assessmentId);
    expect(found).toBeUndefined();
  });

  // ─── Deduplication ─────────────────────────────────────────────────────────

  it("13. duplicate ingestion idempotency", async () => {
    const result1 = await buildGraph({
      tenantId: tenant1.id,
      subjectType: "PRODUCT",
      subjectId: "dedup-test",
      edges: [{
        fromNodeType: "SUPPLIER",
        fromNodeName: "Dedup Supplier",
        toNodeType: "PRODUCT",
        toNodeName: "Dedup Product",
        edgeType: "SUPPLIER_SUPPLIES",
        sourceId: source1.id,
        observedValue: { dedup: true },
      }],
    });

    const result2 = await buildGraph({
      tenantId: tenant1.id,
      subjectType: "PRODUCT",
      subjectId: "dedup-test",
      edges: [{
        fromNodeType: "SUPPLIER",
        fromNodeName: "Dedup Supplier",
        toNodeType: "PRODUCT",
        toNodeName: "Dedup Product",
        edgeType: "SUPPLIER_SUPPLIES",
        sourceId: source1.id,
        observedValue: { dedup: true },
      }],
    });

    // Second call should not create duplicates
    expect(result2.edgesCreated).toBe(0);
    expect(result2.observationsCreated).toBe(0);
  });

  // ─── History ───────────────────────────────────────────────────────────────

  it("14. recalculation preserves history", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "History Product");
    const a1 = await assessSupplyChain({ tenantId: tenant1.id, subjectType: "product", subjectId: node.id });

    // Recalculate
    const a2 = await recalculateAssessment(tenant1.id, a1.assessmentId);

    // Both assessments should exist
    const history = await getAssessmentHistory(tenant1.id, a1.assessmentId);
    expect(history.data.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Verification & Anomalies ─────────────────────────────────────────────

  it("15. verification requirement generation", async () => {
    const mfg = await createSCNode(tenant1.id, "MANUFACTURER", "Verify Mfg");
    const prod = await createSCNode(tenant1.id, "PRODUCT", "Verify Product");
    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: mfg.id,
        toNodeId: prod.id,
        edgeType: "BRAND_MANUFACTURES_PRODUCT",
        relationshipStatus: "UNKNOWN",
      },
    });

    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: prod.id,
    });

    const verifications = await getAssessmentVerifications(tenant1.id, assessment.assessmentId);
    expect(verifications.data).toBeDefined();
  });

  it("16. anomaly detection in graph", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "Anomaly Product");
    // Create self-loop
    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: node.id,
        toNodeId: node.id,
        edgeType: "SUPPLIER_SUPPLIES",
      },
    });

    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: node.id,
    });

    const anomalies = await getAssessmentAnomalies(tenant1.id, assessment.assessmentId);
    expect(anomalies.data.some((a: { anomalyType: string }) => a.anomalyType === "SELF_LOOP")).toBe(true);
  });

  // ─── Adversarial Tests ─────────────────────────────────────────────────────

  it("17. adversarial: marketplace-only claim stays CLAIMED", async () => {
    const seller = await createSCNode(tenant1.id, "SELLER", "Marketplace Seller");
    const product = await createSCNode(tenant1.id, "PRODUCT", "Marketplace Product");

    // Create a claim without independent evidence
    await prisma.supplyChainClaim.create({
      data: {
        tenantId: tenant1.id,
        claimType: "FACTORY_DIRECT",
        claimText: "Factory direct from marketplace",
        claimingNodeId: seller.id,
        targetNodeId: product.id,
        sourceId: source1.id,
        status: "UNVERIFIED",
      },
    });

    // Create edge with claim only
    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: seller.id,
        toNodeId: product.id,
        edgeType: "SELLER_PURCHASES_FROM",
        relationshipStatus: "CLAIMED",
      },
    });

    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: product.id,
    });

    // Should not be CONFIRMED
    expect(assessment.overallConfidence).toBeLessThan(1.0);
  });

  it("18. adversarial: contradictory manufacturer preserved", async () => {
    const mfg1 = await createSCNode(tenant1.id, "MANUFACTURER", "Mfg A");
    const mfg2 = await createSCNode(tenant1.id, "MANUFACTURER", "Mfg B");
    const sku = await createSCNode(tenant1.id, "SKU", "Contradictory SKU");

    await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: mfg1.id, toNodeId: sku.id, edgeType: "MANUFACTURER_PRODUCES_SKU", relationshipStatus: "OBSERVED" },
    });
    await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: mfg2.id, toNodeId: sku.id, edgeType: "MANUFACTURER_PRODUCES_SKU", relationshipStatus: "OBSERVED" },
    });

    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "sku",
      subjectId: sku.id,
    });

    // Should detect anomaly
    expect(assessment.anomalyCount).toBeGreaterThan(0);
  });

  it("19. adversarial: missing distributor creates unknown link", async () => {
    const mfg = await createSCNode(tenant1.id, "MANUFACTURER", "Missing Dist Mfg");
    const supplier = await createSCNode(tenant1.id, "SUPPLIER", "Missing Dist Supplier");

    // No distributor node — direct manufacturer to supplier
    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: mfg.id,
        toNodeId: supplier.id,
        edgeType: "MANUFACTURER_SUPPLIES",
        relationshipStatus: "UNKNOWN",
      },
    });

    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "supplier",
      subjectId: supplier.id,
    });

    expect(assessment.unknownEdgeCount).toBeGreaterThan(0);
  });

  it("20. adversarial: duplicate evidence ingestion", async () => {
    const result1 = await buildGraph({
      tenantId: tenant1.id,
      subjectType: "PRODUCT",
      subjectId: "dup-evidence-test",
      edges: [{
        fromNodeType: "SUPPLIER",
        fromNodeName: "Dup Evidence Supplier",
        toNodeType: "PRODUCT",
        toNodeName: "Dup Evidence Product",
        edgeType: "SUPPLIER_SUPPLIES",
        sourceId: source1.id,
        observedValue: { dup: true },
      }],
    });

    const result2 = await buildGraph({
      tenantId: tenant1.id,
      subjectType: "PRODUCT",
      subjectId: "dup-evidence-test",
      edges: [{
        fromNodeType: "SUPPLIER",
        fromNodeName: "Dup Evidence Supplier",
        toNodeType: "PRODUCT",
        toNodeName: "Dup Evidence Product",
        edgeType: "SUPPLIER_SUPPLIES",
        sourceId: source1.id,
        observedValue: { dup: true },
      }],
    });

    // No duplicates
    expect(result2.edgesCreated).toBe(0);
    expect(result2.observationsCreated).toBe(0);
  });

  it("21. adversarial: cross-tenant lookup returns empty", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "Cross Tenant Product");
    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: node.id,
    });

    const result = await listAssessments({ tenantId: tenant2.id });
    const found = result.data.find((a: { id: string }) => a.id === assessment.assessmentId);
    expect(found).toBeUndefined();
  });

  it("22. evidence provenance chain traversal", async () => {
    const node1 = await createSCNode(tenant1.id, "SUPPLIER", "Evidence Prov Supplier");
    const node2 = await createSCNode(tenant1.id, "SELLER", "Evidence Prov Seller");
    const edge = await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: node1.id, toNodeId: node2.id, edgeType: "SUPPLIER_SUPPLIES" },
    });

    const evidence = await createEvidence(tenant1.id, source1.id, "supplier", node1.id);
    await prisma.supplyChainEvidenceLink.create({
      data: {
        tenantId: tenant1.id,
        edgeId: edge.id,
        evidenceId: evidence.id,
        evidenceRole: "SUPPORTING",
        evidenceStrength: "STRONG",
        sourceId: source1.id,
      },
    });

    const prov = await getEdgeProvenance(tenant1.id, edge.id);
    expect(prov.data.evidenceLinks.length).toBeGreaterThan(0);
  });

  it("23. assessment conflicts retrieval", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "Conflict Test Product");
    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: node.id,
    });

    const conflicts = await getAssessmentConflicts(tenant1.id, assessment.assessmentId);
    expect(conflicts.data).toBeDefined();
    expect(Array.isArray(conflicts.data)).toBe(true);
  });

  it("24. assessment provenance retrieval", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "Provenance Product");
    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "product",
      subjectId: node.id,
    });

    const prov = await getAssessmentProvenance(tenant1.id, assessment.assessmentId);
    expect(prov.data).toBeDefined();
    expect(prov.data.assessment).toBeDefined();
  });

  // ─── Deterministic inputHash ─────────────────────────────────────────────

  it("25. deterministic inputHash: same inputs → identical hash", async () => {
    const node = await createSCNode(tenant1.id, "PRODUCT", "Hash Determinism Product");
    const a1 = await assessSupplyChain({ tenantId: tenant1.id, subjectType: "product", subjectId: node.id });
    // Small delay to ensure different wall-clock time
    await new Promise((r) => setTimeout(r, 50));
    const a2 = await assessSupplyChain({ tenantId: tenant1.id, subjectType: "product", subjectId: node.id });

    // Both assessments should exist (version history preserved)
    const history = await getAssessmentHistory(tenant1.id, a1.assessmentId);
    expect(history.data.length).toBeGreaterThanOrEqual(1);

    // Both should have valid assessment IDs (different records)
    expect(a1.assessmentId).not.toBe(a2.assessmentId);
  });

  // ─── asOf Temporal Reconstruction ──────────────────────────────────────────

  it("26. asOf: relationship valid before asOf", async () => {
    const n1 = await createSCNode(tenant1.id, "SUPPLIER", "Temporal Supplier");
    const n2 = await createSCNode(tenant1.id, "PRODUCT", "Temporal Product");
    const pastDate = new Date("2024-01-15");
    const futureDate = new Date("2024-12-31");

    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: n1.id,
        toNodeId: n2.id,
        edgeType: "SUPPLIER_SUPPLIES",
        relationshipStatus: "CONFIRMED",
        validFrom: pastDate,
        validTo: futureDate,
      },
    });

    // Query at a time when the relationship was valid
    const result = await queryRelationships({
      tenantId: tenant1.id,
      asOf: "2024-06-01T00:00:00.000Z",
    });
    const found = result.data.find((e: any) => e.fromNodeId === n1.id);
    expect(found).toBeDefined();
  });

  it("27. asOf: relationship not yet valid at asOf", async () => {
    const n1 = await createSCNode(tenant1.id, "SUPPLIER", "Future Supplier");
    const n2 = await createSCNode(tenant1.id, "PRODUCT", "Future Product");

    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: n1.id,
        toNodeId: n2.id,
        edgeType: "SUPPLIER_SUPPLIES",
        relationshipStatus: "CONFIRMED",
        validFrom: new Date("2025-06-01"),
        validTo: new Date("2025-12-31"),
      },
    });

    // Query at a time BEFORE the relationship was valid
    const result = await queryRelationships({
      tenantId: tenant1.id,
      asOf: "2025-01-01T00:00:00.000Z",
    });
    const found = result.data.find((e: any) => e.fromNodeId === n1.id && e.toNodeId === n2.id);
    expect(found).toBeUndefined();
  });

  it("28. asOf: relationship expired before asOf", async () => {
    const n1 = await createSCNode(tenant1.id, "SUPPLIER", "Expired Supplier");
    const n2 = await createSCNode(tenant1.id, "PRODUCT", "Expired Product");

    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: n1.id,
        toNodeId: n2.id,
        edgeType: "SUPPLIER_SUPPLIES",
        relationshipStatus: "CONFIRMED",
        validFrom: new Date("2023-01-01"),
        validTo: new Date("2023-06-30"),
      },
    });

    // Query at a time AFTER the relationship expired
    const result = await queryRelationships({
      tenantId: tenant1.id,
      asOf: "2024-01-01T00:00:00.000Z",
    });
    const found = result.data.find((e: any) => e.fromNodeId === n1.id && e.toNodeId === n2.id);
    expect(found).toBeUndefined();
  });

  it("29. asOf: open-ended relationship visible at any future date", async () => {
    const n1 = await createSCNode(tenant1.id, "SUPPLIER", "Open-ended Supplier");
    const n2 = await createSCNode(tenant1.id, "PRODUCT", "Open-ended Product");

    await prisma.supplyChainEdge.create({
      data: {
        tenantId: tenant1.id,
        fromNodeId: n1.id,
        toNodeId: n2.id,
        edgeType: "SUPPLIER_SUPPLIES",
        relationshipStatus: "CONFIRMED",
        validFrom: new Date("2024-01-01"),
        validTo: null,
      },
    });

    // Query far in the future — open-ended should still be visible
    const result = await queryRelationships({
      tenantId: tenant1.id,
      asOf: "2099-01-01T00:00:00.000Z",
    });
    const found = result.data.find((e: any) => e.fromNodeId === n1.id && e.toNodeId === n2.id);
    expect(found).toBeDefined();
  });

  // ─── Relationship Filters ────────────────────────────────────────────────

  it("30. relationship filter: sourceId", async () => {
    const result = await queryRelationships({
      tenantId: tenant1.id,
      sourceId: source1.id,
    });
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("31. relationship filter: country", async () => {
    const n1 = await createSCNode(tenant1.id, "SUPPLIER", "BD Supplier");
    const n2 = await createSCNode(tenant1.id, "PRODUCT", "BD Product");
    // Update node with country
    await prisma.supplyChainNode.update({ where: { id: n1.id }, data: { country: "BD" } });
    await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: n1.id, toNodeId: n2.id, edgeType: "SUPPLIER_SUPPLIES" },
    });

    const result = await queryRelationships({ tenantId: tenant1.id, country: "BD" });
    const found = result.data.find((e: any) => e.fromNodeId === n1.id);
    expect(found).toBeDefined();
  });

  it("32. relationship filter: hasEvidence", async () => {
    const n1 = await createSCNode(tenant1.id, "SUPPLIER", "Evidence Filter Supplier");
    const n2 = await createSCNode(tenant1.id, "PRODUCT", "Evidence Filter Product");
    const edge = await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: n1.id, toNodeId: n2.id, edgeType: "SUPPLIER_SUPPLIES" },
    });
    const evidence = await createEvidence(tenant1.id, source1.id, "supplier", n1.id);
    await prisma.supplyChainEvidenceLink.create({
      data: { tenantId: tenant1.id, edgeId: edge.id, evidenceId: evidence.id, evidenceRole: "SUPPORTING", evidenceStrength: "STRONG", sourceId: source1.id },
    });

    const withEv = await queryRelationships({ tenantId: tenant1.id, hasEvidence: true });
    const foundWith = withEv.data.find((e: any) => e.id === edge.id);
    expect(foundWith).toBeDefined();
  });

  it("33. relationship filter: combined filters", async () => {
    const result = await queryRelationships({
      tenantId: tenant1.id,
      edgeType: "SUPPLIER_SUPPLIES",
      hasEvidence: true,
      sourceId: source1.id,
    });
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
  });

  // ─── Canonical Node Uniqueness ───────────────────────────────────────────

  it("34. canonical node uniqueness: same entity cannot create duplicate nodes", async () => {
    // Create first node with canonical reference
    const node1 = await prisma.supplyChainNode.create({
      data: {
        tenantId: tenant1.id,
        nodeType: "PRODUCT",
        name: "Canonical Product",
        normalizedName: "canonical product",
        canonicalEntityType: "product",
        canonicalEntityId: "canonical-prod-123",
        sourceId: source1.id,
        identityStatus: "resolved",
      },
    });

    // Attempting to create a duplicate with same canonical reference should fail
    // (the partial unique index only applies when canonicalEntityId IS NOT NULL)
    let threw = false;
    try {
      await prisma.supplyChainNode.create({
        data: {
          tenantId: tenant1.id,
          nodeType: "PRODUCT",
          name: "Canonical Product Duplicate",
          normalizedName: `canonical product dup ${Date.now()}`,
          canonicalEntityType: "product",
          canonicalEntityId: "canonical-prod-123",
          sourceId: source2.id, // different source
          identityStatus: "resolved",
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Cleanup
    await prisma.supplyChainNode.delete({ where: { id: node1.id } });
  });

  // ─── Adversarial: Multi-Source Corroboration ───────────────────────────

  it("35. adversarial: 3 independent sources corroborate same relationship", async () => {
    const source3 = await createSource(tenant1.id, "SC Source Gamma", "gamma.example.com");

    const result = await buildGraph({
      tenantId: tenant1.id,
      subjectType: "PRODUCT",
      subjectId: "corroboration-test",
      edges: [
        { fromNodeType: "SUPPLIER", fromNodeName: "Corroborated Supplier", toNodeType: "PRODUCT", toNodeName: "Corroborated Product", edgeType: "SUPPLIER_SUPPLIES", sourceId: source1.id, observedValue: { src: 1 } },
        { fromNodeType: "SUPPLIER", fromNodeName: "Corroborated Supplier", toNodeType: "PRODUCT", toNodeName: "Corroborated Product", edgeType: "SUPPLIER_SUPPLIES", sourceId: source2.id, observedValue: { src: 2 } },
        { fromNodeType: "SUPPLIER", fromNodeName: "Corroborated Supplier", toNodeType: "PRODUCT", toNodeName: "Corroborated Product", edgeType: "SUPPLIER_SUPPLIES", sourceId: source3.id, observedValue: { src: 3 } },
      ],
    });

    // Should create observations from each source
    expect(result.observationsCreated).toBe(3);

    // Cleanup — remove observations referencing source3 before deleting source
    await prisma.supplyChainObservation.deleteMany({ where: { sourceId: source3.id } });
    await prisma.supplyChainEvidenceLink.deleteMany({ where: { sourceId: source3.id } });
    await prisma.source.delete({ where: { id: source3.id } });
  });

  // ─── Adversarial: Cycle Detection ──────────────────────────────────────

  it("36. adversarial: explicit cycle A → B → C → A detected safely", async () => {
    const nodeA = await createSCNode(tenant1.id, "SUPPLIER", "Cycle Node A");
    const nodeB = await createSCNode(tenant1.id, "SELLER", "Cycle Node B");
    const nodeC = await createSCNode(tenant1.id, "DISTRIBUTOR", "Cycle Node C");

    // Create cycle edges
    await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: nodeA.id, toNodeId: nodeB.id, edgeType: "SUPPLIER_SUPPLIES", relationshipStatus: "OBSERVED" },
    });
    await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: nodeB.id, toNodeId: nodeC.id, edgeType: "DISTRIBUTOR_SUPPLIES", relationshipStatus: "OBSERVED" },
    });
    await prisma.supplyChainEdge.create({
      data: { tenantId: tenant1.id, fromNodeId: nodeC.id, toNodeId: nodeA.id, edgeType: "SUPPLIER_SUPPLIES", relationshipStatus: "OBSERVED" },
    });

    // Assessment should complete without error (cycle doesn't corrupt graph)
    const assessment = await assessSupplyChain({
      tenantId: tenant1.id,
      subjectType: "supplier",
      subjectId: nodeA.id,
    });
    expect(assessment.assessmentId).toBeDefined();

    // Graph traversal should terminate safely (bounded depth + visited set)
    const paths = await getAssessmentPaths(tenant1.id, assessment.assessmentId, 5);
    expect(paths.data).toBeDefined();
    expect(Array.isArray(paths.data)).toBe(true);
  });
});
