// =============================================================================
// Phase 10 — Unit Tests: Logistics Calculation Engine
// =============================================================================
// Tests all deterministic logistics calculations: content hashing, evidence
// strength, temporal freshness, leg confidence, transit duration aggregation,
// route confidence, BFS route discovery, risk detection, anomaly detection,
// contradiction detection, completeness, and full engine run.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  computeLegContentHash,
  computeObservationContentHash,
  computeAssessmentInputHash,
  countIndependentSources,
  calculateEvidenceStrength,
  calculateTemporalFreshness,
  calculateLegConfidence,
  aggregateTransitDuration,
  aggregateRouteConfidence,
  discoverRoutes,
  detectRisks,
  detectAnomalies,
  detectContradictions,
  calculateCompleteness,
  runLogisticsEngine,
  type LGNodeInput,
  type LGLegInput,
  type LGObservationInput,
  type LGEvidenceLinkInput,
  type LGRouteInput,
  type LGSourceInput,
} from "../../src/services/logistics-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<LGNodeInput> = {}): LGNodeInput {
  return {
    id: `node-${Math.random().toString(36).slice(2, 8)}`,
    nodeType: "PORT",
    name: "Test Node",
    normalizedName: "test node",
    canonicalEntityType: null,
    canonicalEntityId: null,
    country: "BD",
    operationalStatus: "OPERATIONAL",
    customsCapability: false,
    identityConfidence: 0.5,
    sourceId: null,
    ...overrides,
  };
}

function makeLeg(overrides: Partial<LGLegInput> = {}): LGLegInput {
  return {
    id: `leg-${Math.random().toString(36).slice(2, 8)}`,
    fromNodeId: "node-1",
    toNodeId: "node-2",
    legType: "SEA",
    carrierOrganizationId: null,
    carrierName: null,
    legStatus: "UNKNOWN",
    confidence: 0,
    isContradicted: false,
    contradictionCount: 0,
    transitTimeMinHours: null,
    transitTimeMaxHours: null,
    transitTimeKnown: false,
    evidenceCount: 0,
    observationCount: 0,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

function makeObservation(overrides: Partial<LGObservationInput> = {}): LGObservationInput {
  return {
    id: `obs-${Math.random().toString(36).slice(2, 8)}`,
    legId: "leg-1",
    sourceId: "source-1",
    observationType: "TRANSIT_TIME",
    observationStatus: "OBSERVED",
    contentHash: "hash-1",
    observedAt: new Date(),
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

function makeEvidenceLink(overrides: Partial<LGEvidenceLinkInput> = {}): LGEvidenceLinkInput {
  return {
    id: `evl-${Math.random().toString(36).slice(2, 8)}`,
    legId: "leg-1",
    evidenceId: "evidence-1",
    evidenceRole: "SUPPORTING",
    evidenceStrength: "MODERATE",
    relevance: 1.0,
    effect: 0.5,
    sourceId: "source-1",
    ...overrides,
  };
}

function makeRoute(overrides: Partial<LGRouteInput> = {}): LGRouteInput {
  return {
    id: `route-${Math.random().toString(36).slice(2, 8)}`,
    originNodeId: "node-1",
    destinationNodeId: "node-3",
    legIds: ["leg-1", "leg-2"],
    routeStatus: "OBSERVED",
    confidence: 0,
    transitTimeKnown: false,
    totalTransitMinHours: null,
    totalTransitMaxHours: null,
    ...overrides,
  };
}

// ─── Content Hashing Tests ───────────────────────────────────────────────────

describe("Logistics Engine — Content Hashing", () => {
  it("1. leg content hash: same inputs → same hash", () => {
    const h1 = computeLegContentHash("t1", "n1", "n2", "SEA", null, null, 24, 48);
    const h2 = computeLegContentHash("t1", "n1", "n2", "SEA", null, null, 24, 48);
    expect(h1).toBe(h2);
  });

  it("2. leg content hash: different inputs → different hash", () => {
    const h1 = computeLegContentHash("t1", "n1", "n2", "SEA", null, null, 24, 48);
    const h2 = computeLegContentHash("t1", "n1", "n3", "SEA", null, null, 24, 48);
    expect(h1).not.toBe(h2);
  });

  it("3. observation content hash is deterministic", () => {
    const h1 = computeObservationContentHash("t1", "leg-1", "s1", "TRANSIT_TIME", { hours: 48 });
    const h2 = computeObservationContentHash("t1", "leg-1", "s1", "TRANSIT_TIME", { hours: 48 });
    expect(h1).toBe(h2);
  });

  it("4. assessment input hash is deterministic", () => {
    const h1 = computeAssessmentInputHash("t1", "PRODUCT", "p1", ["l1"], ["r1"], ["e1"], ["o1"], "v1");
    const h2 = computeAssessmentInputHash("t1", "PRODUCT", "p1", ["l1"], ["r1"], ["e1"], ["o1"], "v1");
    expect(h1).toBe(h2);
  });

  it("5. assessment input hash: order-independent for ID arrays", () => {
    const h1 = computeAssessmentInputHash("t1", "PRODUCT", "p1", ["l1", "l2"], [], [], [], "v1");
    const h2 = computeAssessmentInputHash("t1", "PRODUCT", "p1", ["l2", "l1"], [], [], [], "v1");
    expect(h1).toBe(h2);
  });
});

// ─── Source Independence Tests ───────────────────────────────────────────────

describe("Logistics Engine — Source Independence", () => {
  it("6. same source counted once", () => {
    const links = [
      makeEvidenceLink({ sourceId: "s1" }),
      makeEvidenceLink({ sourceId: "s1", id: "evl-2" }),
    ];
    expect(countIndependentSources(links)).toBe(1);
  });

  it("7. three distinct sources → 3", () => {
    const links = [
      makeEvidenceLink({ sourceId: "s1" }),
      makeEvidenceLink({ sourceId: "s2", id: "evl-2" }),
      makeEvidenceLink({ sourceId: "s3", id: "evl-3" }),
    ];
    expect(countIndependentSources(links)).toBe(3);
  });

  it("8. null sourceId not counted", () => {
    const links = [makeEvidenceLink({ sourceId: null })];
    expect(countIndependentSources(links)).toBe(0);
  });
});

// ─── Evidence Strength Tests ─────────────────────────────────────────────────

describe("Logistics Engine — Evidence Strength", () => {
  it("9. no evidence → strength 0", () => {
    expect(calculateEvidenceStrength([])).toBe(0);
  });

  it("10. DIRECT evidence → high strength", () => {
    const links = [makeEvidenceLink({ evidenceStrength: "DIRECT" })];
    expect(calculateEvidenceStrength(links)).toBeGreaterThan(0.5);
  });

  it("11. CONTRADICTING evidence reduces strength", () => {
    const links = [
      makeEvidenceLink({ evidenceStrength: "DIRECT", evidenceRole: "SUPPORTING" }),
      makeEvidenceLink({ evidenceStrength: "DIRECT", evidenceRole: "CONTRADICTING", evidenceId: "ev-2" }),
    ];
    const result = calculateEvidenceStrength(links);
    expect(result).toBeLessThan(1.0);
  });
});

// ─── Temporal Freshness Tests ────────────────────────────────────────────────

describe("Logistics Engine — Temporal Freshness", () => {
  it("12. recent observation → high freshness", () => {
    const obs = [makeObservation({ observedAt: new Date() })];
    expect(calculateTemporalFreshness(obs)).toBeGreaterThanOrEqual(0.9);
  });

  it("13. no observations → low freshness (0.1)", () => {
    expect(calculateTemporalFreshness([])).toBe(0.1);
  });

  it("14. old observation → low freshness", () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 2);
    const obs = [makeObservation({ observedAt: old })];
    expect(calculateTemporalFreshness(obs)).toBeLessThan(0.5);
  });
});

// ─── Leg Confidence Tests ────────────────────────────────────────────────────

describe("Logistics Engine — Leg Confidence", () => {
  it("15. confidence with full evidence", () => {
    const leg = makeLeg({
      id: "leg-1",
      legStatus: "CONFIRMED",
      carrierOrganizationId: "carrier-1",
      observationCount: 5,
      transitTimeKnown: true,
      transitTimeMinHours: 24,
      transitTimeMaxHours: 48,
    });
    const evLinks = [makeEvidenceLink({ evidenceStrength: "DIRECT" })];
    const obs = [makeObservation({ legId: "leg-1" })];

    const result = calculateLegConfidence(leg, evLinks, obs);
    expect(result.finalConfidence).toBeGreaterThan(0);
    expect(result.finalConfidence).toBeLessThanOrEqual(1);
    expect(result.carrierConfidenceScore).toBe(0.8);
  });

  it("16. no carrier → carrier score 0", () => {
    const leg = makeLeg({ id: "leg-1" });
    const result = calculateLegConfidence(leg, [], []);
    expect(result.carrierConfidenceScore).toBe(0);
  });

  it("17. carrier name only → carrier score 0.4", () => {
    const leg = makeLeg({ id: "leg-1", carrierName: "Maersk" });
    const result = calculateLegConfidence(leg, [], []);
    expect(result.carrierConfidenceScore).toBe(0.4);
  });

  it("18. contradiction penalty reduces confidence", () => {
    const leg = makeLeg({ id: "leg-1", contradictionCount: 3 });
    const result = calculateLegConfidence(leg, [], []);
    expect(result.contradictionPenalty).toBeGreaterThan(0);
  });
});

// ─── Transit Duration Tests ──────────────────────────────────────────────────

describe("Logistics Engine — Transit Duration", () => {
  it("19. all known legs → isKnown true", () => {
    const legs = [
      makeLeg({ id: "l1", transitTimeKnown: true, transitTimeMinHours: 24, transitTimeMaxHours: 48 }),
      makeLeg({ id: "l2", transitTimeKnown: true, transitTimeMinHours: 12, transitTimeMaxHours: 24 }),
    ];
    const result = aggregateTransitDuration(legs, ["l1", "l2"]);
    expect(result.isKnown).toBe(true);
    expect(result.minHours).toBe(36);
    expect(result.maxHours).toBe(72);
  });

  it("20. one unknown leg → isKnown false", () => {
    const legs = [
      makeLeg({ id: "l1", transitTimeKnown: true, transitTimeMinHours: 24, transitTimeMaxHours: 48 }),
      makeLeg({ id: "l2", transitTimeKnown: false }),
    ];
    const result = aggregateTransitDuration(legs, ["l1", "l2"]);
    expect(result.isKnown).toBe(false);
    expect(result.minHours).toBe(24);
  });

  it("21. no legs → isKnown false, zero range", () => {
    const result = aggregateTransitDuration([], []);
    expect(result.isKnown).toBe(false);
    expect(result.minHours).toBe(0);
    expect(result.maxHours).toBe(0);
  });

  it("22. unknown leg NEVER substitutes zero for missing min", () => {
    const legs = [
      makeLeg({ id: "l1", transitTimeKnown: false, transitTimeMinHours: 10, transitTimeMaxHours: null }),
    ];
    const result = aggregateTransitDuration(legs, ["l1"]);
    expect(result.isKnown).toBe(false);
    expect(result.minHours).toBe(10); // partial info preserved
  });
});

// ─── Route Confidence Tests ──────────────────────────────────────────────────

describe("Logistics Engine — Route Confidence", () => {
  it("23. route confidence = weakest leg (min)", () => {
    const legs = [
      makeLeg({ id: "l1" }),
      makeLeg({ id: "l2" }),
    ];
    const route = makeRoute({ legIds: ["l1", "l2"] });
    const confMap = new Map([
      ["l1", { legId: "l1", finalConfidence: 0.9, evidenceStrengthScore: 0, sourceIndependenceScore: 0, carrierConfidenceScore: 0, directnessScore: 0, corroborationScore: 0, temporalFreshnessScore: 0, contradictionPenalty: 0 }],
      ["l2", { legId: "l2", finalConfidence: 0.3, evidenceStrengthScore: 0, sourceIndependenceScore: 0, carrierConfidenceScore: 0, directnessScore: 0, corroborationScore: 0, temporalFreshnessScore: 0, contradictionPenalty: 0 }],
    ]);
    const result = aggregateRouteConfidence(route, legs, confMap);
    expect(result.overallConfidence).toBe(0.3);
  });

  it("24. mode change detection", () => {
    const legs = [
      makeLeg({ id: "l1", legType: "SEA" }),
      makeLeg({ id: "l2", legType: "ROAD" }),
    ];
    const route = makeRoute({ legIds: ["l1", "l2"] });
    const confMap = new Map();
    const result = aggregateRouteConfidence(route, legs, confMap);
    expect(result.modeChangeCount).toBe(1);
  });

  it("25. transshipment count = legs - 1", () => {
    const legs = [
      makeLeg({ id: "l1" }),
      makeLeg({ id: "l2" }),
      makeLeg({ id: "l3" }),
    ];
    const route = makeRoute({ legIds: ["l1", "l2", "l3"] });
    const confMap = new Map();
    const result = aggregateRouteConfidence(route, legs, confMap);
    expect(result.transshipmentCount).toBe(2);
  });
});

// ─── Route Discovery (BFS) Tests ─────────────────────────────────────────────

describe("Logistics Engine — Route Discovery", () => {
  it("26. direct route found", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" })];
    const legs = [makeLeg({ id: "l1", fromNodeId: "A", toNodeId: "B", legStatus: "CONFIRMED" })];
    const routes = discoverRoutes(nodes, legs, "A", "B");
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0]!.pathNodes).toContain("A");
    expect(routes[0]!.pathNodes).toContain("B");
  });

  it("27. multi-hop route found", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" }), makeNode({ id: "C" })];
    const legs = [
      makeLeg({ id: "l1", fromNodeId: "A", toNodeId: "B" }),
      makeLeg({ id: "l2", fromNodeId: "B", toNodeId: "C" }),
    ];
    const routes = discoverRoutes(nodes, legs, "A", "C");
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes.some((r) => r.pathNodes.includes("C"))).toBe(true);
  });

  it("28. no route when disconnected", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" }), makeNode({ id: "C" })];
    const legs = [makeLeg({ id: "l1", fromNodeId: "A", toNodeId: "B" })];
    const routes = discoverRoutes(nodes, legs, "A", "C");
    expect(routes.length).toBe(0);
  });

  it("29. depth limit enforced", () => {
    const nodes = [
      makeNode({ id: "A" }), makeNode({ id: "B" }),
      makeNode({ id: "C" }), makeNode({ id: "D" }),
    ];
    const legs = [
      makeLeg({ fromNodeId: "A", toNodeId: "B" }),
      makeLeg({ fromNodeId: "B", toNodeId: "C" }),
      makeLeg({ fromNodeId: "C", toNodeId: "D" }),
    ];
    const routes = discoverRoutes(nodes, legs, "A", "D", 2);
    // Should not find 3-hop route with depth 2
    const reachesD = routes.filter((r) => r.pathNodes.includes("D"));
    expect(reachesD.length).toBe(0);
  });

  it("30. cycle protection: no infinite loop", () => {
    const nodes = [makeNode({ id: "A" }), makeNode({ id: "B" }), makeNode({ id: "C" })];
    const legs = [
      makeLeg({ fromNodeId: "A", toNodeId: "B" }),
      makeLeg({ fromNodeId: "B", toNodeId: "C" }),
      makeLeg({ fromNodeId: "C", toNodeId: "A" }),
    ];
    // Should not hang
    const routes = discoverRoutes(nodes, legs, "A", "C", 5);
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  it("31. alternate routes preserved", () => {
    const nodes = [
      makeNode({ id: "A" }), makeNode({ id: "B" }),
      makeNode({ id: "C" }), makeNode({ id: "D" }),
    ];
    const legs = [
      makeLeg({ id: "l1", fromNodeId: "A", toNodeId: "B" }),
      makeLeg({ id: "l2", fromNodeId: "A", toNodeId: "C" }),
      makeLeg({ id: "l3", fromNodeId: "B", toNodeId: "D" }),
      makeLeg({ id: "l4", fromNodeId: "C", toNodeId: "D" }),
    ];
    const routes = discoverRoutes(nodes, legs, "A", "D");
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Risk Detection Tests ────────────────────────────────────────────────────

describe("Logistics Engine — Risk Detection", () => {
  it("32. low confidence route → risk detected", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
    const legs = [makeLeg({ id: "l1", fromNodeId: "n1", toNodeId: "n2", confidence: 0.1 })];
    const routes = [makeRoute({ id: "r1", originNodeId: "n1", destinationNodeId: "n2", legIds: ["l1"] })];
    const routeConfidences = [{ routeId: "r1", legConfidences: [0.1], overallConfidence: 0.1, transitDuration: { minHours: 0, maxHours: 0, isKnown: false }, legCount: 1, transshipmentCount: 0, modeChangeCount: 0 }];
    const risks = detectRisks(nodes, legs, [], routes, routeConfidences);
    expect(risks.some((r) => r.riskType === "LOW_EVIDENCE_COVERAGE")).toBe(true);
  });

  it("33. unknown transit time → risk detected", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
    const legs = [makeLeg({ id: "l1", fromNodeId: "n1", toNodeId: "n2", transitTimeKnown: false })];
    const routes = [makeRoute({ id: "r1", legIds: ["l1"] })];
    const routeConfidences = [{ routeId: "r1", legConfidences: [0.5], overallConfidence: 0.5, transitDuration: { minHours: 0, maxHours: 0, isKnown: false }, legCount: 1, transshipmentCount: 0, modeChangeCount: 0 }];
    const risks = detectRisks(nodes, legs, [], routes, routeConfidences);
    expect(risks.some((r) => r.riskType === "UNKNOWN_TRANSIT_TIME")).toBe(true);
  });
});

// ─── Anomaly Detection Tests ─────────────────────────────────────────────────

describe("Logistics Engine — Anomaly Detection", () => {
  it("34. self-loop detection", () => {
    const nodes = [makeNode({ id: "n1" })];
    const legs = [makeLeg({ fromNodeId: "n1", toNodeId: "n1" })];
    const anomalies = detectAnomalies(nodes, legs, []);
    expect(anomalies.some((a) => a.anomalyType === "SELF_LOOP")).toBe(true);
  });

  it("35. no anomaly in valid graph", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
    const legs = [makeLeg({ fromNodeId: "n1", toNodeId: "n2" })];
    const anomalies = detectAnomalies(nodes, legs, []);
    expect(anomalies.filter((a) => a.anomalyType === "SELF_LOOP").length).toBe(0);
  });

  it("36. disconnected route anomaly (no legs)", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n3" })];
    const legs: LGLegInput[] = [];
    const routes = [makeRoute({ originNodeId: "n1", destinationNodeId: "n3", legIds: [] })];
    const anomalies = detectAnomalies(nodes, legs, routes);
    expect(anomalies.some((a) => a.anomalyType === "DISCONNECTED_ROUTE")).toBe(true);
  });
});

// ─── Contradiction Detection Tests ───────────────────────────────────────────

describe("Logistics Engine — Contradiction Detection", () => {
  it("37. contradictory transit times detected", () => {
    const obs = [
      makeObservation({ legId: "l1", observationType: "TRANSIT_TIME", contentHash: "hash-a", sourceId: "s1" }),
      makeObservation({ legId: "l1", observationType: "TRANSIT_TIME", contentHash: "hash-b", sourceId: "s2", id: "obs-2" }),
    ];
    const contradictions = detectContradictions(obs, []);
    expect(contradictions.some((c) => c.conflictType === "CONTRADICTORY_TRANSIT_TIME")).toBe(true);
  });

  it("38. contradictory evidence roles detected", () => {
    const links = [
      makeEvidenceLink({ legId: "l1", evidenceRole: "SUPPORTING" }),
      makeEvidenceLink({ legId: "l1", evidenceRole: "CONTRADICTING", evidenceId: "ev-2", id: "evl-2" }),
    ];
    const contradictions = detectContradictions([], links);
    expect(contradictions.some((c) => c.conflictType === "CONTRADICTORY_EVIDENCE")).toBe(true);
  });

  it("39. no contradiction with consistent evidence", () => {
    const links = [
      makeEvidenceLink({ legId: "l1", evidenceRole: "SUPPORTING" }),
      makeEvidenceLink({ legId: "l1", evidenceRole: "SUPPORTING", evidenceId: "ev-2", id: "evl-2" }),
    ];
    const contradictions = detectContradictions([], links);
    expect(contradictions.length).toBe(0);
  });
});

// ─── Completeness Tests ──────────────────────────────────────────────────────

describe("Logistics Engine — Completeness", () => {
  it("40. completeness with mixed data", () => {
    const nodes = [
      makeNode({ id: "n1", identityConfidence: 0.9 }),
      makeNode({ id: "n2", identityConfidence: 0.3 }),
    ];
    const legs = [
      makeLeg({ id: "l1", legStatus: "CONFIRMED", transitTimeKnown: true, carrierOrganizationId: "c1" }),
      makeLeg({ id: "l2", legStatus: "UNKNOWN" }),
    ];
    const obs = [makeObservation({ legId: "l1", validFrom: new Date() })];
    const evLinks = [makeEvidenceLink({ legId: "l1" })];
    const routes = [makeRoute({ legIds: ["l1", "l2"] })];

    const result = calculateCompleteness(nodes, legs, obs, evLinks, routes);
    expect(result.nodeCompleteness).toBe(0.5); // 1 of 2 nodes > 0.5
    expect(result.knownLegCount).toBe(1);
    expect(result.unknownLegCount).toBe(1);
    expect(result.confirmedLegCount).toBe(1);
    expect(result.sourceDiversity).toBe(1);
  });

  it("41. empty graph → zero completeness", () => {
    const result = calculateCompleteness([], [], [], [], []);
    expect(result.nodeCompleteness).toBe(0);
    expect(result.legCompleteness).toBe(0);
    expect(result.evidenceCompleteness).toBe(0);
  });
});

// ─── Full Engine Tests ───────────────────────────────────────────────────────

describe("Logistics Engine — Full Run", () => {
  it("42. full engine run produces valid output", () => {
    const nodes = [
      makeNode({ id: "origin", nodeType: "ORIGIN" }),
      makeNode({ id: "port", nodeType: "PORT" }),
      makeNode({ id: "dest", nodeType: "DESTINATION" }),
    ];
    const legs = [
      makeLeg({ id: "l1", fromNodeId: "origin", toNodeId: "port", legStatus: "OBSERVED", carrierName: "Maersk" }),
      makeLeg({ id: "l2", fromNodeId: "port", toNodeId: "dest", legStatus: "CONFIRMED", carrierOrganizationId: "carrier-1" }),
    ];
    const routes = [makeRoute({ id: "r1", originNodeId: "origin", destinationNodeId: "dest", legIds: ["l1", "l2"] })];
    const obs = [makeObservation({ legId: "l1" })];
    const evLinks = [makeEvidenceLink({ legId: "l1" })];

    const result = runLogisticsEngine({
      tenantId: "t1",
      subjectType: "ROUTE",
      subjectId: "r1",
      nodes,
      legs,
      observations: obs,
      evidenceLinks: evLinks,
      routes,
      sources: [],
    });

    expect(result.algorithmVersion).toBe("LOGISTICS_ALGORITHM_V1");
    expect(result.legConfidences.length).toBe(2);
    expect(result.routeConfidences.length).toBe(1);
    expect(result.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(result.overallConfidence).toBeLessThanOrEqual(1);
    expect(result.inputHash).toBeTruthy();
  });

  it("43. idempotency: same inputs → same outputs", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
    const legs = [makeLeg({ id: "l1", fromNodeId: "n1", toNodeId: "n2" })];
    const input = {
      tenantId: "t1",
      subjectType: "PRODUCT",
      subjectId: "p1",
      nodes,
      legs,
      observations: [],
      evidenceLinks: [],
      routes: [],
      sources: [],
    };

    const r1 = runLogisticsEngine(input);
    const r2 = runLogisticsEngine(input);

    expect(r1.inputHash).toBe(r2.inputHash);
    expect(r1.overallConfidence).toBe(r2.overallConfidence);
  });

  it("44. confidence ≠ risk (independent dimensions)", () => {
    const nodes = [makeNode({ id: "n1" }), makeNode({ id: "n2" })];
    const legs = [makeLeg({
      id: "l1", fromNodeId: "n1", toNodeId: "n2",
      legStatus: "CONFIRMED", carrierOrganizationId: "c1",
      transitTimeKnown: false,
    })];
    const routes = [makeRoute({ legIds: ["l1"] })];

    const result = runLogisticsEngine({
      tenantId: "t1", subjectType: "ROUTE", subjectId: "r1",
      nodes, legs, observations: [], evidenceLinks: [], routes, sources: [],
    });

    // High confidence leg but unknown transit time → risk exists alongside confidence
    expect(result.legConfidences[0]!.finalConfidence).toBeGreaterThan(0);
    expect(result.risks.some((r) => r.riskType === "UNKNOWN_TRANSIT_TIME")).toBe(true);
  });

  it("45. empty graph → valid zero output", () => {
    const result = runLogisticsEngine({
      tenantId: "t1", subjectType: "PRODUCT", subjectId: "p1",
      nodes: [], legs: [], observations: [], evidenceLinks: [], routes: [], sources: [],
    });

    expect(result.legConfidences.length).toBe(0);
    expect(result.routeConfidences.length).toBe(0);
    expect(result.overallConfidence).toBe(0);
  });
});
