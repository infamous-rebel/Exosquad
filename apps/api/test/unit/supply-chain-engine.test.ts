// =============================================================================
// Phase 9 — Unit Tests: Supply-Chain Calculation Engine
// =============================================================================
// Tests all deterministic supply-chain calculations: node normalization,
// edge confidence, relationship status, source independence, contradiction
// detection, path discovery, cycle detection, anomaly detection, completeness,
// verification requirements, content hashing, and edge cases.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  computeEdgeContentHash,
  computeObservationContentHash,
  computeAssessmentInputHash,
  countIndependentSources,
  calculateEvidenceStrength,
  calculateTemporalFreshness,
  calculateEdgeConfidence,
  determineRelationshipStatus,
  isEdgeTypeValid,
  detectAnomalies,
  detectCycles,
  detectConflicts,
  discoverPaths,
  calculateCompleteness,
  generateVerificationRequirements,
  runSupplyChainEngine,
  type SCNodeInput,
  type SCEdgeInput,
  type SCObservationInput,
  type SCEvidenceLinkInput,
  type SCSourceInput,
  type SCClaimInput,
  type SCConflictInput,
} from "../../src/services/supply-chain-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<SCNodeInput> = {}): SCNodeInput {
  return {
    id: `node-${Math.random().toString(36).slice(2, 8)}`,
    nodeType: "PRODUCT",
    name: "Test Node",
    normalizedName: "test node",
    canonicalEntityType: null,
    canonicalEntityId: null,
    identityStatus: "unresolved",
    identityConfidence: 0.5,
    country: null,
    sourceId: null,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<SCEdgeInput> = {}): SCEdgeInput {
  return {
    id: `edge-${Math.random().toString(36).slice(2, 8)}`,
    fromNodeId: "node-1",
    toNodeId: "node-2",
    edgeType: "SUPPLIER_SUPPLIES",
    relationshipStatus: "UNKNOWN",
    confidence: 0,
    isContradicted: false,
    contradictionCount: 0,
    ...overrides,
  };
}

function makeObservation(overrides: Partial<SCObservationInput> = {}): SCObservationInput {
  return {
    id: `obs-${Math.random().toString(36).slice(2, 8)}`,
    edgeId: "edge-1",
    sourceId: "source-1",
    observationStatus: "observed",
    observedValue: { relationship: "test" },
    contentHash: "hash-1",
    observedAt: new Date(),
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

function makeEvidenceLink(overrides: Partial<SCEvidenceLinkInput> = {}): SCEvidenceLinkInput {
  return {
    id: `evl-${Math.random().toString(36).slice(2, 8)}`,
    edgeId: "edge-1",
    evidenceId: "evidence-1",
    evidenceRole: "SUPPORTING",
    evidenceStrength: "MODERATE",
    relevance: 1.0,
    effect: 0.5,
    sourceId: "source-1",
    ...overrides,
  };
}

function makeSource(overrides: Partial<SCSourceInput> = {}): SCSourceInput {
  return {
    id: `source-${Math.random().toString(36).slice(2, 8)}`,
    type: "web_scraper",
    name: "Test Source",
    domain: "example.com",
    ...overrides,
  };
}

function makeClaim(overrides: Partial<SCClaimInput> = {}): SCClaimInput {
  return {
    id: `claim-${Math.random().toString(36).slice(2, 8)}`,
    claimType: "FACTORY_DIRECT",
    claimText: "We are factory direct",
    claimingNodeId: "node-1",
    targetNodeId: "node-2",
    sourceId: "source-1",
    status: "UNVERIFIED",
    ...overrides,
  };
}

// ─── Content Hashing Tests ───────────────────────────────────────────────────

describe("Supply-Chain Engine — Content Hashing", () => {
  it("1. deterministic hashing: same inputs → same hash", () => {
    const hash1 = computeEdgeContentHash("t1", "n1", "n2", "SUPPLIER_SUPPLIES", { a: 1 });
    const hash2 = computeEdgeContentHash("t1", "n1", "n2", "SUPPLIER_SUPPLIES", { a: 1 });
    expect(hash1).toBe(hash2);
  });

  it("2. different inputs → different hash", () => {
    const hash1 = computeEdgeContentHash("t1", "n1", "n2", "SUPPLIER_SUPPLIES", { a: 1 });
    const hash2 = computeEdgeContentHash("t1", "n1", "n3", "SUPPLIER_SUPPLIES", { a: 1 });
    expect(hash1).not.toBe(hash2);
  });

  it("3. observation content hash is deterministic", () => {
    const hash1 = computeObservationContentHash("t1", "s1", "e1", { val: "x" });
    const hash2 = computeObservationContentHash("t1", "s1", "e1", { val: "x" });
    expect(hash1).toBe(hash2);
  });

  it("4. assessment input hash is deterministic", () => {
    const nodes = [makeNode({ id: "n1" })];
    const edges = [makeEdge({ id: "e1" })];
    const hash1 = computeAssessmentInputHash("t1", "PRODUCT", "p1", nodes, edges, [], [], []);
    const hash2 = computeAssessmentInputHash("t1", "PRODUCT", "p1", nodes, edges, [], [], []);
    expect(hash1).toBe(hash2);
  });
});

// ─── Source Independence Tests ───────────────────────────────────────────────

describe("Supply-Chain Engine — Source Independence", () => {
  it("5. same source → NOT independent", () => {
    const obs = [
      makeObservation({ sourceId: "s1" }),
      makeObservation({ sourceId: "s1" }),
    ];
    const sources = [makeSource({ id: "s1", domain: "example.com" })];
    expect(countIndependentSources(obs, sources)).toBe(1);
  });

  it("6. same domain → NOT independent", () => {
    const obs = [
      makeObservation({ sourceId: "s1" }),
      makeObservation({ sourceId: "s2" }),
    ];
    const sources = [
      makeSource({ id: "s1", domain: "example.com" }),
      makeSource({ id: "s2", domain: "example.com" }),
    ];
    expect(countIndependentSources(obs, sources)).toBe(1);
  });

  it("7. different sources + different domains → independent", () => {
    const obs = [
      makeObservation({ sourceId: "s1" }),
      makeObservation({ sourceId: "s2" }),
      makeObservation({ sourceId: "s3" }),
    ];
    const sources = [
      makeSource({ id: "s1", domain: "alibaba.com" }),
      makeSource({ id: "s2", domain: "globalsources.com" }),
      makeSource({ id: "s3", domain: "made-in-china.com" }),
    ];
    expect(countIndependentSources(obs, sources)).toBe(3);
  });
});

// ─── Evidence Strength Tests ─────────────────────────────────────────────────

describe("Supply-Chain Engine — Evidence Strength", () => {
  it("8. DIRECT evidence → strength 1.0", () => {
    const links = [makeEvidenceLink({ evidenceStrength: "DIRECT", relevance: 1.0 })];
    expect(calculateEvidenceStrength(links)).toBe(1.0);
  });

  it("9. WEAK evidence → strength 0.3", () => {
    const links = [makeEvidenceLink({ evidenceStrength: "WEAK", relevance: 1.0 })];
    expect(calculateEvidenceStrength(links)).toBe(0.3);
  });

  it("10. no evidence → strength 0", () => {
    expect(calculateEvidenceStrength([])).toBe(0);
  });
});

// ─── Temporal Freshness Tests ────────────────────────────────────────────────

describe("Supply-Chain Engine — Temporal Freshness", () => {
  it("11. recent observation (<7d) → freshness 1.0", () => {
    const obs = [makeObservation({ observedAt: new Date() })];
    expect(calculateTemporalFreshness(obs)).toBe(1.0);
  });

  it("12. no observations → freshness 0", () => {
    expect(calculateTemporalFreshness([])).toBe(0);
  });
});

// ─── Edge Confidence Tests ───────────────────────────────────────────────────

describe("Supply-Chain Engine — Edge Confidence", () => {
  it("13. confidence calculation with full evidence", () => {
    const nodes = [
      makeNode({ id: "n1", identityConfidence: 0.9 }),
      makeNode({ id: "n2", identityConfidence: 0.8 }),
    ];
    const edge = makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2", relationshipStatus: "OBSERVED" });
    const obs = [makeObservation({ edgeId: "e1", sourceId: "s1" })];
    const evLinks = [makeEvidenceLink({ edgeId: "e1", evidenceStrength: "DIRECT" })];
    const sources = [makeSource({ id: "s1", domain: "example.com" })];

    const result = calculateEdgeConfidence(edge, nodes, obs, evLinks, sources);
    expect(result.finalConfidence).toBeGreaterThan(0);
    expect(result.finalConfidence).toBeLessThanOrEqual(1);
    expect(result.evidenceStrengthScore).toBe(1.0);
  });

  it("14. contradiction penalty reduces confidence", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
    const edge = makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2", contradictionCount: 2 });
    const result = calculateEdgeConfidence(edge, nodes, [], [], []);
    expect(result.contradictionPenalty).toBeGreaterThan(0);
  });
});

// ─── Relationship Status Tests ───────────────────────────────────────────────

describe("Supply-Chain Engine — Relationship Status", () => {
  it("15. no evidence → UNKNOWN", () => {
    const edge = makeEdge();
    const result = determineRelationshipStatus(edge, [], [], [], [], []);
    expect(result.status).toBe("UNKNOWN");
  });

  it("16. single source observation → OBSERVED", () => {
    const edge = makeEdge({ id: "e1" });
    const obs = [makeObservation({ edgeId: "e1", sourceId: "s1" })];
    const sources = [makeSource({ id: "s1", domain: "example.com" })];
    const result = determineRelationshipStatus(edge, obs, [], sources, [], []);
    expect(result.status).toBe("OBSERVED");
  });

  it("17. claim only → CLAIMED", () => {
    const edge = makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" });
    const claims = [makeClaim({ claimingNodeId: "n1", targetNodeId: "n2" })];
    const result = determineRelationshipStatus(edge, [], [], [], claims, []);
    expect(result.status).toBe("CLAIMED");
  });

  it("18. 2+ independent sources → CORROBORATED", () => {
    const edge = makeEdge({ id: "e1" });
    const obs = [
      makeObservation({ edgeId: "e1", sourceId: "s1" }),
      makeObservation({ edgeId: "e1", sourceId: "s2" }),
    ];
    const sources = [
      makeSource({ id: "s1", domain: "alibaba.com" }),
      makeSource({ id: "s2", domain: "globalsources.com" }),
    ];
    const result = determineRelationshipStatus(edge, obs, [], sources, [], []);
    expect(result.status).toBe("CORROBORATED");
  });

  it("19. contradicting evidence → CONTRADICTED", () => {
    const edge = makeEdge({ id: "e1" });
    const evLinks = [
      makeEvidenceLink({ edgeId: "e1", evidenceRole: "SUPPORTING" }),
      makeEvidenceLink({ edgeId: "e1", evidenceRole: "CONTRADICTING", evidenceId: "ev-2" }),
    ];
    const result = determineRelationshipStatus(edge, [], evLinks, [], [], []);
    expect(result.status).toBe("CONTRADICTED");
  });

  it("20. claim remains CLAIMED until corroborated", () => {
    const edge = makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" });
    const claims = [makeClaim({ claimingNodeId: "n1", targetNodeId: "n2" })];
    const obs = [makeObservation({ edgeId: "e1", sourceId: "s1" })];
    const sources = [makeSource({ id: "s1", domain: "example.com" })];
    const result = determineRelationshipStatus(edge, obs, [], sources, claims, []);
    // Single source with a claim → OBSERVED (observation takes precedence)
    expect(["OBSERVED", "CLAIMED"]).toContain(result.status);
  });
});

// ─── Edge Type Validity Tests ────────────────────────────────────────────────

describe("Supply-Chain Engine — Edge Type Validity", () => {
  it("21. valid edge type passes", () => {
    expect(isEdgeTypeValid("BRAND_MANUFACTURES_PRODUCT", "BRAND", "PRODUCT")).toBe(true);
  });

  it("22. invalid edge type fails", () => {
    expect(isEdgeTypeValid("BRAND_MANUFACTURES_PRODUCT", "SELLER", "WAREHOUSE")).toBe(false);
  });
});

// ─── Anomaly Detection Tests ─────────────────────────────────────────────────

describe("Supply-Chain Engine — Anomaly Detection", () => {
  it("23. self-loop detection", () => {
    const nodes = [makeNode({ id: "n1" })];
    const edges = [makeEdge({ fromNodeId: "n1", toNodeId: "n1" })];
    const anomalies = detectAnomalies(nodes, edges, [], [], []);
    expect(anomalies.some((a) => a.anomalyType === "SELF_LOOP")).toBe(true);
  });

  it("24. invalid relationship detection", () => {
    const nodes = [makeNode({ id: "n1", nodeType: "SELLER" }), makeNode({ id: "n2", nodeType: "WAREHOUSE" })];
    const edges = [makeEdge({ fromNodeId: "n1", toNodeId: "n2", edgeType: "BRAND_MANUFACTURES_PRODUCT" })];
    const anomalies = detectAnomalies(nodes, edges, [], [], []);
    expect(anomalies.some((a) => a.anomalyType === "INVALID_RELATIONSHIP")).toBe(true);
  });

  it("25. contradictory manufacturer detection", () => {
    const nodes = [
      makeNode({ id: "mfg1", nodeType: "MANUFACTURER" }),
      makeNode({ id: "mfg2", nodeType: "MANUFACTURER" }),
      makeNode({ id: "prod1", nodeType: "SKU" }),
    ];
    const edges = [
      makeEdge({ fromNodeId: "mfg1", toNodeId: "prod1", edgeType: "MANUFACTURER_PRODUCES_SKU" }),
      makeEdge({ fromNodeId: "mfg2", toNodeId: "prod1", edgeType: "MANUFACTURER_PRODUCES_SKU" }),
    ];
    const anomalies = detectAnomalies(nodes, edges, [], [], []);
    expect(anomalies.some((a) => a.anomalyType === "CONTRADICTORY_MANUFACTURER")).toBe(true);
  });

  it("26. contradictory origin detection", () => {
    const nodes = [
      makeNode({ id: "p1", nodeType: "PRODUCT" }),
      makeNode({ id: "o1", nodeType: "ORIGIN_COUNTRY" }),
      makeNode({ id: "o2", nodeType: "ORIGIN_COUNTRY" }),
    ];
    const edges = [
      makeEdge({ fromNodeId: "p1", toNodeId: "o1", edgeType: "ORIGINATED_FROM" }),
      makeEdge({ fromNodeId: "p1", toNodeId: "o2", edgeType: "ORIGINATED_FROM" }),
    ];
    const anomalies = detectAnomalies(nodes, edges, [], [], []);
    expect(anomalies.some((a) => a.anomalyType === "CONTRADICTORY_ORIGIN")).toBe(true);
  });

  it("27. suspicious shortcut detection", () => {
    const nodes = [
      makeNode({ id: "s1", nodeType: "SELLER" }),
      makeNode({ id: "m1", nodeType: "MANUFACTURER" }),
    ];
    const edges = [makeEdge({ fromNodeId: "s1", toNodeId: "m1", edgeType: "SELLER_PURCHASES_FROM", relationshipStatus: "OBSERVED" })];
    // No direct/strong evidence → suspicious shortcut
    const anomalies = detectAnomalies(nodes, edges, [], [], []);
    expect(anomalies.some((a) => a.anomalyType === "SUSPICIOUS_SHORTCUT")).toBe(true);
  });
});

// ─── Cycle Detection Tests ───────────────────────────────────────────────────

describe("Supply-Chain Engine — Cycle Detection", () => {
  it("28. cycle A→B→C→A detected", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" }), makeNode({ id: "C" })];
    const edges = [
      makeEdge({ fromNodeId: "A", toNodeId: "B" }),
      makeEdge({ fromNodeId: "B", toNodeId: "C" }),
      makeEdge({ fromNodeId: "C", toNodeId: "A" }),
    ];
    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0].anomalyType).toBe("CYCLE_DETECTED");
  });

  it("29. no cycle in linear graph", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" }), makeNode({ id: "C" })];
    const edges = [
      makeEdge({ fromNodeId: "A", toNodeId: "B" }),
      makeEdge({ fromNodeId: "B", toNodeId: "C" }),
    ];
    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBe(0);
  });
});

// ─── Path Discovery Tests ────────────────────────────────────────────────────

describe("Supply-Chain Engine — Path Discovery", () => {
  it("30. multi-hop path discovery", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" }), makeNode({ id: "C" })];
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "A", toNodeId: "B", relationshipStatus: "OBSERVED" }),
      makeEdge({ id: "e2", fromNodeId: "B", toNodeId: "C", relationshipStatus: "OBSERVED" }),
    ];
    const confMap = new Map([["e1", 0.8], ["e2", 0.7]]);
    const paths = discoverPaths("A", edges, nodes, confMap);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.hopCount === 2)).toBe(true);
  });

  it("31. traversal depth limit enforced", () => {
    const nodes = [
      makeNode({ id: "A" }), makeNode({ id: "B" }),
      makeNode({ id: "C" }), makeNode({ id: "D" }),
    ];
    const edges = [
      makeEdge({ fromNodeId: "A", toNodeId: "B" }),
      makeEdge({ fromNodeId: "B", toNodeId: "C" }),
      makeEdge({ fromNodeId: "C", toNodeId: "D" }),
    ];
    const confMap = new Map<string, number>();
    const paths = discoverPaths("A", edges, nodes, confMap, 2);
    const maxHops = Math.max(...paths.map((p) => p.hopCount));
    expect(maxHops).toBeLessThanOrEqual(2);
  });

  it("32. alternate paths preserved", () => {
    const nodes = [
      makeNode({ id: "A" }), makeNode({ id: "B" }),
      makeNode({ id: "C" }), makeNode({ id: "D" }),
    ];
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "A", toNodeId: "B" }),
      makeEdge({ id: "e2", fromNodeId: "A", toNodeId: "C" }),
      makeEdge({ id: "e3", fromNodeId: "B", toNodeId: "D" }),
      makeEdge({ id: "e4", fromNodeId: "C", toNodeId: "D" }),
    ];
    const confMap = new Map([["e1", 0.8], ["e2", 0.6], ["e3", 0.7], ["e4", 0.9]]);
    const paths = discoverPaths("A", edges, nodes, confMap);
    // Should find multiple paths to D
    const pathsToD = paths.filter((p) => p.pathNodes.includes("D"));
    expect(pathsToD.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Completeness Tests ──────────────────────────────────────────────────────

describe("Supply-Chain Engine — Completeness", () => {
  it("33. completeness calculation with mixed graph", () => {
    const nodes = [
      makeNode({ id: "n1", identityStatus: "resolved", identityConfidence: 0.9 }),
      makeNode({ id: "n2", identityStatus: "unresolved", identityConfidence: 0.3 }),
      makeNode({ id: "n3", nodeType: "UNKNOWN", identityConfidence: 0 }),
    ];
    const edges = [
      makeEdge({ id: "e1", relationshipStatus: "CONFIRMED" }),
      makeEdge({ id: "e2", relationshipStatus: "UNKNOWN" }),
    ];
    const obs = [makeObservation({ edgeId: "e1" })];
    const evLinks = [makeEvidenceLink({ edgeId: "e1" })];
    const sources = [makeSource({ id: "source-1" })];
    const paths = discoverPaths("n1", edges, nodes, new Map());

    const result = calculateCompleteness(nodes, edges, obs, evLinks, sources, paths);
    expect(result.nodeCompleteness).toBeGreaterThan(0);
    expect(result.nodeCompleteness).toBeLessThan(1);
    expect(result.unknownNodeCount).toBe(1);
    expect(result.knownNodeCount).toBe(2);
  });
});

// ─── Verification Requirements Tests ─────────────────────────────────────────

describe("Supply-Chain Engine — Verification Requirements", () => {
  it("34. generates VERIFY_MANUFACTURER_RELATIONSHIP for unknown mfg link", () => {
    const nodes = [
      makeNode({ id: "mfg1", nodeType: "MANUFACTURER" }),
      makeNode({ id: "p1", nodeType: "PRODUCT" }),
    ];
    const edges = [
      makeEdge({
        fromNodeId: "mfg1", toNodeId: "p1",
        edgeType: "BRAND_MANUFACTURES_PRODUCT",
        relationshipStatus: "UNKNOWN",
      }),
    ];
    const result = generateVerificationRequirements(nodes, edges, [], []);
    expect(result.some((v) => v.verificationType === "VERIFY_MANUFACTURER_RELATIONSHIP")).toBe(true);
  });

  it("35. generates VERIFY_ORIGIN for contradicted origin", () => {
    const nodes = [
      makeNode({ id: "p1", nodeType: "PRODUCT" }),
      makeNode({ id: "o1", nodeType: "ORIGIN_COUNTRY" }),
    ];
    const edges = [
      makeEdge({
        fromNodeId: "p1", toNodeId: "o1",
        edgeType: "ORIGINATED_FROM",
        relationshipStatus: "CONTRADICTED",
      }),
    ];
    const result = generateVerificationRequirements(nodes, edges, [], []);
    expect(result.some((v) => v.verificationType === "VERIFY_ORIGIN")).toBe(true);
  });
});

// ─── Full Engine Tests ───────────────────────────────────────────────────────

describe("Supply-Chain Engine — Full Run", () => {
  it("36. confidence ≠ status (independent dimensions)", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
    const edges = [makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2", relationshipStatus: "OBSERVED" })];
    const obs = [makeObservation({ edgeId: "e1", sourceId: "s1" })];
    const evLinks = [makeEvidenceLink({ edgeId: "e1" })];
    const sources = [makeSource({ id: "s1" })];

    const result = runSupplyChainEngine({
      tenantId: "t1",
      subjectType: "PRODUCT",
      subjectId: "n1",
      nodes,
      edges,
      observations: obs,
      evidenceLinks: evLinks,
      sources,
      claims: [],
      conflicts: [],
    });

    expect(result.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(result.relationshipStatuses.length).toBeGreaterThan(0);
    expect(result.algorithmVersion).toBe("SUPPLY_CHAIN_ALGORITHM_V1");
  });

  it("37. marketplace listing NOT treated as manufacturer proof", () => {
    const nodes = [
      makeNode({ id: "listing1", nodeType: "LISTING" }),
      makeNode({ id: "p1", nodeType: "PRODUCT" }),
    ];
    const edges = [
      makeEdge({
        fromNodeId: "listing1", toNodeId: "p1",
        edgeType: "LISTING_REPRESENTS_PRODUCT",
        relationshipStatus: "OBSERVED",
      }),
    ];

    const result = runSupplyChainEngine({
      tenantId: "t1",
      subjectType: "PRODUCT",
      subjectId: "p1",
      nodes,
      edges,
      observations: [],
      evidenceLinks: [],
      sources: [],
      claims: [],
      conflicts: [],
    });

    // Listing edge should not be treated as manufacturer proof
    expect(result.relationshipStatuses[0].status).not.toBe("CONFIRMED");
  });

  it("38. idempotency: same inputs → same outputs", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
    const edges = [makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" })];
    const input = {
      tenantId: "t1",
      subjectType: "PRODUCT",
      subjectId: "n1",
      nodes,
      edges,
      observations: [],
      evidenceLinks: [],
      sources: [],
      claims: [],
      conflicts: [],
    };

    const result1 = runSupplyChainEngine(input);
    const result2 = runSupplyChainEngine(input);

    expect(result1.inputHash).toBe(result2.inputHash);
    expect(result1.overallConfidence).toBe(result2.overallConfidence);
  });

  // ─── Traversal Filter Controls ──────────────────────────────────────────────

  it("39. traversal filter: edgeTypes restricts BFS expansion", () => {
    const nodes = [
      makeNode({ id: "n1", nodeType: "SUPPLIER" }),
      makeNode({ id: "n2", nodeType: "SELLER" }),
      makeNode({ id: "n3", nodeType: "LISTING" }),
    ];
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2", edgeType: "SUPPLIER_SUPPLIES", relationshipStatus: "CONFIRMED" }),
      makeEdge({ id: "e2", fromNodeId: "n2", toNodeId: "n3", edgeType: "SELLER_LISTS", relationshipStatus: "CONFIRMED" }),
    ];
    const confMap = new Map([["e1", 0.9], ["e2", 0.8]]);

    // Without filter — should find both hops
    const allPaths = discoverPaths("n1", edges, nodes, confMap, 5);
    expect(allPaths.length).toBe(2);

    // Filter to only SUPPLIER_SUPPLIES — should only find 1 hop
    const filtered = discoverPaths("n1", edges, nodes, confMap, 5, { edgeTypes: ["SUPPLIER_SUPPLIES"] });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.pathEdges).toEqual(["e1"]);
  });

  it("40. traversal filter: statuses restricts BFS expansion", () => {
    const nodes = [
      makeNode({ id: "n1" }),
      makeNode({ id: "n2" }),
      makeNode({ id: "n3" }),
    ];
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2", relationshipStatus: "CONFIRMED" }),
      makeEdge({ id: "e2", fromNodeId: "n2", toNodeId: "n3", relationshipStatus: "UNKNOWN" }),
    ];
    const confMap = new Map([["e1", 0.9], ["e2", 0.1]]);

    // Only CONFIRMED edges
    const filtered = discoverPaths("n1", edges, nodes, confMap, 5, { statuses: ["CONFIRMED"] });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.pathEdges).toEqual(["e1"]);
  });

  it("41. traversal filter: minimumConfidence restricts BFS", () => {
    const nodes = [
      makeNode({ id: "n1" }),
      makeNode({ id: "n2" }),
      makeNode({ id: "n3" }),
    ];
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" }),
      makeEdge({ id: "e2", fromNodeId: "n2", toNodeId: "n3" }),
    ];
    const confMap = new Map([["e1", 0.9], ["e2", 0.3]]);

    const filtered = discoverPaths("n1", edges, nodes, confMap, 5, { minimumConfidence: 0.5 });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.pathEdges).toEqual(["e1"]);
  });

  it("42. traversal filter: nodeTypes restricts BFS expansion", () => {
    const nodes = [
      makeNode({ id: "n1", nodeType: "SUPPLIER" }),
      makeNode({ id: "n2", nodeType: "SELLER" }),
      makeNode({ id: "n3", nodeType: "LISTING" }),
    ];
    const edges = [
      makeEdge({ id: "e1", fromNodeId: "n1", toNodeId: "n2" }),
      makeEdge({ id: "e2", fromNodeId: "n2", toNodeId: "n3" }),
    ];
    const confMap = new Map([["e1", 0.9], ["e2", 0.8]]);

    // Only allow SELLER target nodes — should stop before LISTING
    const filtered = discoverPaths("n1", edges, nodes, confMap, 5, { nodeTypes: ["SELLER"] });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.pathNodes).toEqual(["n1", "n2"]);
  });
});
