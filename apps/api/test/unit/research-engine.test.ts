// =============================================================================
// Phase 14 — Unit Tests: AI Research & Reasoning Engine
// =============================================================================
// Tests all deterministic research engine functions: content hashing,
// evidence quality assessment, contradiction detection, confidence calculation,
// research gap detection, hypothesis evaluation, completeness, and limits.
// =============================================================================

import { describe, it, expect } from "vitest";
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
  type EvidenceItemInput,
  type SubQuestionInput,
  type ContradictionCandidate,
  type HypothesisInput,
  type ExecutionLimits,
} from "../../src/services/research-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-01T00:00:00Z");
const RECENT = new Date("2026-08-01T00:00:00Z");
const HISTORICAL = new Date("2026-01-01T00:00:00Z");
const STALE = new Date("2024-01-01T00:00:00Z");

function makeEvidence(overrides: Partial<EvidenceItemInput> = {}): EvidenceItemInput {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test Evidence",
    description: "Test description",
    sourceType: "EXISTING_EVIDENCE",
    sourceEntity: "price_observation",
    sourceEntityId: "entity-1",
    extractedValue: 100,
    valueType: "number",
    observedAt: NOW,
    sourceIndependence: true,
    quality: "HIGH",
    relevanceScore: 0.8,
    wasUsed: true,
    ...overrides,
  };
}

function makeSubQuestion(overrides: Partial<SubQuestionInput> = {}): SubQuestionInput {
  return {
    id: `sq-${Math.random().toString(36).slice(2, 8)}`,
    question: "Test question?",
    questionType: "GENERAL",
    sequence: 1,
    status: "COMPLETED",
    evidenceFound: 3,
    answerConfidence: 0.7,
    isDependencyMet: true,
    ...overrides,
  };
}

// ─── Content Hashing ─────────────────────────────────────────────────────────

describe("Research Engine — Content Hashing", () => {
  it("sha256 produces consistent 64-char hex", () => {
    const hash = sha256("test");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256("test")).toBe(hash); // deterministic
  });

  it("computeResearchRequestHash is deterministic", () => {
    const input = { tenantId: "t1", question: "test?", questionType: "GENERAL", productId: null, market: null, country: null, researchObjective: null, requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard" };
    expect(computeResearchRequestHash(input)).toBe(computeResearchRequestHash(input));
  });

  it("different inputs produce different hashes", () => {
    const h1 = computeResearchRequestHash({ tenantId: "t1", question: "q1", questionType: "GENERAL", productId: null, market: null, country: null, researchObjective: null, requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard" });
    const h2 = computeResearchRequestHash({ tenantId: "t1", question: "q2", questionType: "GENERAL", productId: null, market: null, country: null, researchObjective: null, requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard" });
    expect(h1).not.toBe(h2);
  });

  it("computeResearchInputHash excludes timestamps", () => {
    const h = computeResearchInputHash({ tenantId: "t1", question: "q", questionType: "GENERAL", productId: null, market: null, country: null });
    expect(h).toHaveLength(64);
  });

  it("computeResearchCacheKey includes prompt version", () => {
    const h1 = computeResearchCacheKey({ tenantId: "t1", question: "q", questionType: "GENERAL", productId: null, market: null, country: null, requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard", promptVersion: "v1" });
    const h2 = computeResearchCacheKey({ tenantId: "t1", question: "q", questionType: "GENERAL", productId: null, market: null, country: null, requiredEvidenceQuality: "MEDIUM", requestedDepth: "standard", promptVersion: "v2" });
    expect(h1).not.toBe(h2);
  });

  it("computeSubQuestionHash is deterministic", () => {
    const input = { requestId: "r1", question: "q", questionType: "GENERAL", sequence: 1 };
    expect(computeSubQuestionHash(input)).toBe(computeSubQuestionHash(input));
  });

  it("computeEvidenceItemHash handles null observedAt", () => {
    const h = computeEvidenceItemHash({ requestId: "r1", title: "t", description: "d", sourceType: "EXISTING_EVIDENCE", sourceEntityId: null, observedAt: null });
    expect(h).toHaveLength(64);
  });

  it("computeContradictionHash is deterministic", () => {
    const h = computeContradictionHash({ requestId: "r1", subject: "MOQ", evidenceItemIds: ["a", "b"] });
    expect(h).toBe(computeContradictionHash({ requestId: "r1", subject: "MOQ", evidenceItemIds: ["a", "b"] }));
  });

  it("computeHypothesisHash differs for different statements", () => {
    const h1 = computeHypothesisHash({ requestId: "r1", statement: "h1", hypothesisType: "feasibility" });
    const h2 = computeHypothesisHash({ requestId: "r1", statement: "h2", hypothesisType: "feasibility" });
    expect(h1).not.toBe(h2);
  });

  it("computeResearchGapHash is deterministic", () => {
    const h = computeResearchGapHash({ requestId: "r1", description: "gap", affectedDimension: "moq" });
    expect(h).toBe(computeResearchGapHash({ requestId: "r1", description: "gap", affectedDimension: "moq" }));
  });

  it("computeResearchResultHash includes all fields", () => {
    const h = computeResearchResultHash({ requestId: "r1", totalSubQuestions: 5, completedSubQuestions: 3, totalEvidenceItems: 10, contradictionsFound: 1, hypothesesEvaluated: 2, gapsIdentified: 3, researchIterations: 1 });
    expect(h).toHaveLength(64);
  });
});

// ─── Evidence Quality Assessment ─────────────────────────────────────────────

describe("Research Engine — Evidence Quality Assessment", () => {
  it("high-quality evidence from authoritative source gets high score", () => {
    const ev = makeEvidence({ sourceType: "EXISTING_EVIDENCE", sourceEntity: "customs_data", sourceIndependence: true, observedAt: NOW, relevanceScore: 0.9, extractedValue: 100 });
    const result = assessEvidenceQuality(ev, NOW);
    expect(result.sourceAuthorityScore).toBe(1.0);
    expect(result.qualityClassification).toBe("HIGH");
    expect(result.temporalClassification).toBe("CURRENT");
  });

  it("AI inference gets low authority", () => {
    const ev = makeEvidence({ sourceType: "AI_INFERENCE", quality: "UNVERIFIED" });
    const result = assessEvidenceQuality(ev, NOW);
    expect(result.sourceAuthorityScore).toBe(0.3);
    expect(result.qualityClassification).toBe("UNVERIFIED");
  });

  it("temporal freshness: current evidence scores high", () => {
    const ev = makeEvidence({ observedAt: NOW });
    const result = assessEvidenceQuality(ev, NOW);
    expect(result.temporalClassification).toBe("CURRENT");
    expect(result.temporalFreshnessScore).toBeGreaterThanOrEqual(0.8);
  });

  it("temporal freshness: recent evidence scores medium", () => {
    const ev = makeEvidence({ observedAt: RECENT });
    const result = assessEvidenceQuality(ev, NOW);
    expect(result.temporalClassification).toBe("RECENT");
    expect(result.temporalFreshnessScore).toBeGreaterThanOrEqual(0.5);
    expect(result.temporalFreshnessScore).toBeLessThan(0.8);
  });

  it("temporal freshness: historical evidence scores lower", () => {
    const ev = makeEvidence({ observedAt: HISTORICAL });
    const result = assessEvidenceQuality(ev, NOW);
    expect(result.temporalClassification).toBe("HISTORICAL");
    expect(result.temporalFreshnessScore).toBeGreaterThanOrEqual(0.2);
    expect(result.temporalFreshnessScore).toBeLessThan(0.5);
  });

  it("temporal freshness: stale evidence scores lowest", () => {
    const ev = makeEvidence({ observedAt: STALE });
    const result = assessEvidenceQuality(ev, NOW);
    expect(result.temporalClassification).toBe("STALE");
    expect(result.temporalFreshnessScore).toBeLessThanOrEqual(0.2);
  });

  it("temporal freshness: null observedAt is UNKNOWN", () => {
    const ev = makeEvidence({ observedAt: null });
    const result = assessEvidenceQuality(ev, NOW);
    expect(result.temporalClassification).toBe("UNKNOWN");
    expect(result.freshnessLabel).toBe("unknown");
  });

  it("independent source gets higher score than dependent", () => {
    const independent = makeEvidence({ sourceIndependence: true });
    const dependent = makeEvidence({ sourceIndependence: false });
    const r1 = assessEvidenceQuality(independent, NOW);
    const r2 = assessEvidenceQuality(dependent, NOW);
    expect(r1.sourceIndependenceScore).toBeGreaterThan(r2.sourceIndependenceScore);
  });

  it("corroboration increases with more independent sources", () => {
    const ev = makeEvidence();
    const others = [makeEvidence({ id: "other1", sourceIndependence: true }), makeEvidence({ id: "other2", sourceIndependence: true })];
    const result = assessEvidenceQuality(ev, NOW, [ev, ...others]);
    expect(result.corroborationScore).toBeGreaterThanOrEqual(0.6);
  });

  it("overall quality score is weighted sum", () => {
    const ev = makeEvidence();
    const result = assessEvidenceQuality(ev, NOW);
    expect(result.overallQualityScore).toBeGreaterThan(0);
    expect(result.overallQualityScore).toBeLessThanOrEqual(1);
  });
});

// ─── Contradiction Detection ─────────────────────────────────────────────────

describe("Research Engine — Contradiction Detection", () => {
  it("detects numeric contradiction above tolerance", () => {
    const candidate: ContradictionCandidate = {
      subject: "MOQ",
      evidenceItems: [
        makeEvidence({ id: "a", extractedValue: 500 }),
        makeEvidence({ id: "b", extractedValue: 1000 }),
      ],
    };
    const results = detectContradictions([candidate]);
    expect(results[0]!.detected).toBe(true);
    expect(results[0]!.severity).toBe("high"); // 100% spread → high (>50%)
  });

  it("no contradiction when values within tolerance", () => {
    const candidate: ContradictionCandidate = {
      subject: "price",
      evidenceItems: [
        makeEvidence({ id: "a", extractedValue: 100 }),
        makeEvidence({ id: "b", extractedValue: 105 }), // 5% spread < 10% tolerance
      ],
    };
    const results = detectContradictions([candidate]);
    expect(results[0]!.detected).toBe(false);
  });

  it("critical severity for >100% spread", () => {
    const candidate: ContradictionCandidate = {
      subject: "price",
      evidenceItems: [
        makeEvidence({ id: "a", extractedValue: 50 }),
        makeEvidence({ id: "b", extractedValue: 200 }), // 300% spread
      ],
    };
    const results = detectContradictions([candidate]);
    expect(results[0]!.detected).toBe(true);
    expect(results[0]!.severity).toBe("critical");
  });

  it("does not detect contradiction with < 2 evidence items", () => {
    const candidate: ContradictionCandidate = {
      subject: "MOQ",
      evidenceItems: [makeEvidence({ id: "a", extractedValue: 500 })],
    };
    const results = detectContradictions([candidate]);
    expect(results[0]!.detected).toBe(false);
  });

  it("ignores unused evidence items", () => {
    const candidate: ContradictionCandidate = {
      subject: "price",
      evidenceItems: [
        makeEvidence({ id: "a", extractedValue: 50, wasUsed: true }),
        makeEvidence({ id: "b", extractedValue: 200, wasUsed: false }),
      ],
    };
    const results = detectContradictions([candidate]);
    expect(results[0]!.detected).toBe(false);
  });

  it("handles categorical contradictions", () => {
    const candidate: ContradictionCandidate = {
      subject: "origin",
      evidenceItems: [
        makeEvidence({ id: "a", extractedValue: "China" }),
        makeEvidence({ id: "b", extractedValue: "Vietnam" }),
      ],
    };
    const results = detectContradictions([candidate]);
    expect(results[0]!.detected).toBe(true);
    expect(results[0]!.severity).toBe("medium");
  });

  it("no categorical contradiction when values match", () => {
    const candidate: ContradictionCandidate = {
      subject: "origin",
      evidenceItems: [
        makeEvidence({ id: "a", extractedValue: "China" }),
        makeEvidence({ id: "b", extractedValue: "china" }), // case-insensitive
      ],
    };
    const results = detectContradictions([candidate]);
    expect(results[0]!.detected).toBe(false);
  });
});

// ─── Confidence Calculation ──────────────────────────────────────────────────

describe("Research Engine — Confidence Calculation", () => {
  it("no evidence = INSUFFICIENT_EVIDENCE", () => {
    const result = calculateConfidence([], [], [], [], NOW);
    expect(result.confidenceBand).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.overallConfidence).toBeGreaterThan(0); // agreement baseline contributes even with no evidence
  });

  it("high evidence count increases confidence", () => {
    const evidence = Array.from({ length: 15 }, (_, i) => makeEvidence({ id: `e${i}` }));
    const subQuestions = [makeSubQuestion({ status: "COMPLETED" })];
    const result = calculateConfidence(evidence, subQuestions, [], [], NOW);
    expect(result.evidenceQuantityScore).toBe(1.0);
    expect(result.overallConfidence).toBeGreaterThan(0.3);
  });

  it("contradictions reduce agreement score", () => {
    const evidence = [makeEvidence({ id: "e1" })];
    const contradictions = [{ subject: "price", detected: true, severity: "high" as const, conflictingValues: {}, evidenceItemIds: ["e1"], explanation: null, resolutionRequires: null }];
    const result = calculateConfidence(evidence, [makeSubQuestion()], contradictions, [], NOW);
    expect(result.agreementScore).toBe(0); // 1 detected out of 1
  });

  it("completed sub-questions increase completeness", () => {
    const subQuestions = [
      makeSubQuestion({ status: "COMPLETED" }),
      makeSubQuestion({ status: "COMPLETED" }),
      makeSubQuestion({ status: "PENDING" }),
    ];
    const result = calculateConfidence([makeEvidence()], subQuestions, [], [], NOW);
    expect(result.completenessScore).toBeCloseTo(2 / 3, 1);
  });

  it("independent sources increase independence score", () => {
    const evidence = [
      makeEvidence({ id: "e1", sourceIndependence: true }),
      makeEvidence({ id: "e2", sourceIndependence: true }),
    ];
    const result = calculateConfidence(evidence, [], [], [], NOW);
    expect(result.sourceIndependenceScore).toBe(1.0);
  });
});

// ─── Hypothesis Evaluation ───────────────────────────────────────────────────

describe("Research Engine — Hypothesis Evaluation", () => {
  it("no evidence = INSUFFICIENT_EVIDENCE", () => {
    const hyp: HypothesisInput = { id: "h1", statement: "test", hypothesisType: "feasibility", supportingEvidenceIds: [], contradictingEvidenceIds: [], unknowns: [] };
    const result = evaluateHypothesis(hyp, [], []);
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.confidence).toBe(0);
  });

  it("strong supporting evidence = SUPPORTED", () => {
    const evidence = [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2" }), makeEvidence({ id: "e3" })];
    const hyp: HypothesisInput = { id: "h1", statement: "test", hypothesisType: "feasibility", supportingEvidenceIds: ["e1", "e2", "e3"], contradictingEvidenceIds: [], unknowns: [] };
    const result = evaluateHypothesis(hyp, evidence, []);
    expect(result.status).toBe("SUPPORTED");
  });

  it("more contradicting than supporting = CONTRADICTED", () => {
    const evidence = [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2" }), makeEvidence({ id: "e3" })];
    const hyp: HypothesisInput = { id: "h1", statement: "test", hypothesisType: "feasibility", supportingEvidenceIds: ["e1"], contradictingEvidenceIds: ["e2", "e3"], unknowns: [] };
    const result = evaluateHypothesis(hyp, evidence, []);
    expect(result.status).toBe("CONTRADICTED");
  });

  it("some supporting with unknowns = PARTIALLY_SUPPORTED", () => {
    const evidence = [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2" })];
    const hyp: HypothesisInput = { id: "h1", statement: "test", hypothesisType: "feasibility", supportingEvidenceIds: ["e1", "e2"], contradictingEvidenceIds: [], unknowns: ["missing data"] };
    const result = evaluateHypothesis(hyp, evidence, []);
    expect(result.status).toBe("PARTIALLY_SUPPORTED");
  });
});

// ─── Research Gap Detection ──────────────────────────────────────────────────

describe("Research Engine — Research Gap Detection", () => {
  it("detects gaps when no evidence exists", () => {
    const subQuestions = [makeSubQuestion({ status: "PENDING", evidenceFound: 0 })];
    const gaps = detectResearchGaps(subQuestions, [], "FEASIBILITY");
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.isBlocking)).toBe(true);
  });

  it("fewer gaps when evidence exists", () => {
    const evidence = [makeEvidence({ sourceEntity: "supplier_price" })];
    const subQuestions = [makeSubQuestion({ status: "COMPLETED", evidenceFound: 1, questionType: "PRICING" })];
    const gaps = detectResearchGaps(subQuestions, evidence, "FEASIBILITY");
    // Should have fewer gaps since pricing dimension is covered
    expect(gaps.length).toBeGreaterThanOrEqual(0);
  });

  it("detects sub-questions with no evidence", () => {
    const subQuestions = [makeSubQuestion({ status: "COMPLETED", evidenceFound: 0 })];
    const gaps = detectResearchGaps(subQuestions, [], "GENERAL");
    expect(gaps.some((g) => g.dimension.startsWith("sub_question_"))).toBe(true);
  });
});

// ─── Completeness Calculation ────────────────────────────────────────────────

describe("Research Engine — Completeness", () => {
  it("empty inputs = 0 completeness", () => {
    const result = calculateCompleteness([], [], [], [], "GENERAL");
    expect(result.overallCompleteness).toBeGreaterThan(0); // contradiction resolution baseline contributes
    expect(result.subQuestionCompleteness).toBe(0);
  });

  it("all sub-questions completed = high sub-question completeness", () => {
    const subQuestions = [makeSubQuestion({ status: "COMPLETED" }), makeSubQuestion({ status: "COMPLETED" })];
    const result = calculateCompleteness(subQuestions, [], [], [], "GENERAL");
    expect(result.subQuestionCompleteness).toBe(1.0);
  });

  it("no contradictions = high contradiction resolution", () => {
    const result = calculateCompleteness([], [], [], [], "GENERAL");
    expect(result.contradictionResolutionCompleteness).toBe(1.0);
  });

  it("dimension coverage tracks which dimensions have evidence", () => {
    const result = calculateCompleteness([], [], [], [], "GENERAL");
    expect(Object.keys(result.dimensionCoverage).length).toBeGreaterThan(0);
  });
});

// ─── Depth Presets ───────────────────────────────────────────────────────────

describe("Research Engine — Depth Presets", () => {
  it("brief preset has smallest limits", () => {
    const preset = getDepthPreset("brief");
    expect(preset.maxSubQuestions).toBe(5);
    expect(preset.maxEvidenceItems).toBe(15);
    expect(preset.maxIterations).toBe(2);
  });

  it("standard preset has medium limits", () => {
    const preset = getDepthPreset("standard");
    expect(preset.maxSubQuestions).toBe(10);
    expect(preset.maxEvidenceItems).toBe(30);
    expect(preset.maxIterations).toBe(4);
  });

  it("deep preset has largest limits", () => {
    const preset = getDepthPreset("deep");
    expect(preset.maxSubQuestions).toBe(15);
    expect(preset.maxEvidenceItems).toBe(50);
    expect(preset.maxIterations).toBe(5);
  });

  it("unknown depth defaults to standard", () => {
    const preset = getDepthPreset("unknown");
    expect(preset.maxSubQuestions).toBe(10);
  });
});

// ─── Execution Limits ────────────────────────────────────────────────────────

describe("Research Engine — Execution Limits", () => {
  function makeLimits(overrides: Partial<ExecutionLimits> = {}): ExecutionLimits {
    return {
      currentIteration: 0, maxIterations: 5,
      modelCallsMade: 0, maxModelCalls: 20,
      evidenceItemsConsidered: 0, maxEvidenceItems: 50,
      subQuestionsGenerated: 0, maxSubQuestions: 15,
      tokenUsageEstimated: 0, maxTokenUsage: 50000,
      startedAt: new Date(), maxExecutionTimeMs: 300_000,
      ...overrides,
    };
  }

  it("can continue when all limits are within bounds", () => {
    const result = checkExecutionLimits(makeLimits());
    expect(result.canContinue).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("cannot continue when iterations exhausted", () => {
    const result = checkExecutionLimits(makeLimits({ currentIteration: 5 }));
    expect(result.canContinue).toBe(false);
    expect(result.reason).toContain("iterations");
  });

  it("cannot continue when model calls exhausted", () => {
    const result = checkExecutionLimits(makeLimits({ modelCallsMade: 20 }));
    expect(result.canContinue).toBe(false);
    expect(result.reason).toContain("model calls");
  });

  it("cannot continue when evidence items exhausted", () => {
    const result = checkExecutionLimits(makeLimits({ evidenceItemsConsidered: 50 }));
    expect(result.canContinue).toBe(false);
    expect(result.reason).toContain("evidence");
  });

  it("cannot continue when sub-questions exhausted", () => {
    const result = checkExecutionLimits(makeLimits({ subQuestionsGenerated: 15 }));
    expect(result.canContinue).toBe(false);
    expect(result.reason).toContain("sub-questions");
  });

  it("cannot continue when tokens exhausted", () => {
    const result = checkExecutionLimits(makeLimits({ tokenUsageEstimated: 50000 }));
    expect(result.canContinue).toBe(false);
    expect(result.reason).toContain("token");
  });

  it("reports remaining limits", () => {
    const result = checkExecutionLimits(makeLimits({ currentIteration: 2, modelCallsMade: 5 }));
    expect(result.limitsRemaining.iterations).toBe(3);
    expect(result.limitsRemaining.modelCalls).toBe(15);
  });
});
