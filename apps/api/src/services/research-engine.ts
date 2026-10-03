// =============================================================================
// API — AI Research & Reasoning Engine (Phase 14)
// =============================================================================
// Pure, deterministic engine for research evidence quality assessment,
// contradiction detection, temporal classification, confidence calculation,
// research gap detection, and hypothesis evaluation support.
//
// No AI, no heuristics — deterministic math with documented formulas.
// Same inputs → same outputs. Every value is explainable.
// No database side effects — this module is a pure function.
//
// Key invariants:
// - Unknown ≠ Zero: missing evidence propagates as null/UNKNOWN
// - Contradictions preserved: conflicting evidence is not silently merged
// - Evidence-backed: no fabricated facts
// - Confidence ≠ AI opinion: calibrated from evidence dimensions
// =============================================================================

import { createHash } from "node:crypto";
import { RESEARCH_CONFIG } from "@exosquad/common";

// ─── Content Hashing ─────────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]),
  );
  return "{" + pairs.join(",") + "}";
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Compute content hash for a research request. */
export function computeResearchRequestHash(input: {
  tenantId: string;
  question: string;
  questionType: string;
  productId: string | null;
  market: string | null;
  country: string | null;
  researchObjective: string | null;
  requiredEvidenceQuality: string;
  requestedDepth: string;
}): string {
  return sha256(stableStringify(input));
}

/** Compute input hash for deduplication (excludes timestamps). */
export function computeResearchInputHash(input: {
  tenantId: string;
  question: string;
  questionType: string;
  productId: string | null;
  market: string | null;
  country: string | null;
}): string {
  return sha256(stableStringify(input));
}

/** Compute cache key for research request. */
export function computeResearchCacheKey(input: {
  tenantId: string;
  question: string;
  questionType: string;
  productId: string | null;
  market: string | null;
  country: string | null;
  requiredEvidenceQuality: string;
  requestedDepth: string;
  promptVersion: string;
}): string {
  return sha256(stableStringify(input));
}

/** Compute content hash for a sub-question. */
export function computeSubQuestionHash(input: {
  requestId: string;
  question: string;
  questionType: string;
  sequence: number;
}): string {
  return sha256(stableStringify(input));
}

/** Compute content hash for an evidence item. */
export function computeEvidenceItemHash(input: {
  requestId: string;
  title: string;
  description: string;
  sourceType: string;
  sourceEntityId: string | null;
  observedAt: string | null;
}): string {
  return sha256(stableStringify(input));
}

/** Compute content hash for a contradiction. */
export function computeContradictionHash(input: {
  requestId: string;
  subject: string;
  evidenceItemIds: string[];
}): string {
  return sha256(stableStringify(input));
}

/** Compute content hash for a hypothesis. */
export function computeHypothesisHash(input: {
  requestId: string;
  statement: string;
  hypothesisType: string;
}): string {
  return sha256(stableStringify(input));
}

/** Compute content hash for a research gap. */
export function computeResearchGapHash(input: {
  requestId: string;
  description: string;
  affectedDimension: string;
}): string {
  return sha256(stableStringify(input));
}

/** Compute content hash for a research result. */
export function computeResearchResultHash(input: {
  requestId: string;
  totalSubQuestions: number;
  completedSubQuestions: number;
  totalEvidenceItems: number;
  contradictionsFound: number;
  hypothesesEvaluated: number;
  gapsIdentified: number;
  researchIterations: number;
}): string {
  return sha256(stableStringify(input));
}

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface EvidenceItemInput {
  id: string;
  title: string;
  description: string;
  sourceType: string; // EXISTING_EVIDENCE | INTELLIGENCE_RESULT | AI_INFERENCE | MANUAL
  sourceEntity: string | null;
  sourceEntityId: string | null;
  extractedValue: unknown;
  valueType: string; // string | number | boolean | json | currency | date
  observedAt: Date | null;
  sourceIndependence: boolean;
  quality: string; // HIGH | MEDIUM | LOW | UNVERIFIED
  relevanceScore: number;
  wasUsed: boolean;
}

export interface ContradictionCandidate {
  subject: string;
  evidenceItems: EvidenceItemInput[];
}

export interface SubQuestionInput {
  id: string;
  question: string;
  questionType: string;
  sequence: number;
  status: string; // PENDING | IN_PROGRESS | COMPLETED | SKIPPED | FAILED
  evidenceFound: number;
  answerConfidence: number;
  isDependencyMet: boolean;
}

export interface HypothesisInput {
  id: string;
  statement: string;
  hypothesisType: string;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknowns: string[];
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface EvidenceQualityAssessment {
  evidenceId: string;
  sourceAuthorityScore: number;
  temporalFreshnessScore: number;
  sourceIndependenceScore: number;
  directnessScore: number;
  corroborationScore: number;
  overallQualityScore: number;
  qualityClassification: "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
  temporalClassification: "CURRENT" | "RECENT" | "HISTORICAL" | "STALE" | "UNKNOWN";
  freshnessLabel: "live" | "fresh" | "aging" | "stale" | "unknown";
}

export interface ContradictionDetection {
  subject: string;
  detected: boolean;
  severity: "low" | "medium" | "high" | "critical";
  conflictingValues: Record<string, unknown>;
  evidenceItemIds: string[];
  explanation: string | null;
  resolutionRequires: string | null;
}

export interface ConfidenceAssessment {
  overallConfidence: number;
  evidenceQuantityScore: number;
  evidenceQualityScore: number;
  sourceIndependenceScore: number;
  agreementScore: number;
  completenessScore: number;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_EVIDENCE";
}

export interface ResearchGapDetection {
  dimension: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  isBlocking: boolean;
  requiredEvidenceType: string | null;
  suggestedSource: string | null;
}

export interface ResearchCompleteness {
  overallCompleteness: number;
  subQuestionCompleteness: number;
  evidenceCompleteness: number;
  contradictionResolutionCompleteness: number;
  hypothesisCoverageCompleteness: number;
  dimensionCoverage: Record<string, boolean>;
}

// ─── Evidence Quality Assessment ─────────────────────────────────────────────

/**
 * Assess the quality of a single evidence item.
 * Deterministic: same inputs → same output.
 */
export function assessEvidenceQuality(
  evidence: EvidenceItemInput,
  referenceDate: Date,
  allEvidenceForSameSubject?: EvidenceItemInput[],
): EvidenceQualityAssessment {
  const weights = RESEARCH_CONFIG.evidenceQualityWeights;

  // 1. Source Authority (0–1)
  const sourceAuthorityScore = computeSourceAuthority(evidence);

  // 2. Temporal Freshness (0–1)
  const { freshnessScore, temporalClassification, freshnessLabel } =
    computeTemporalFreshness(evidence.observedAt, referenceDate);

  // 3. Source Independence (0–1)
  const sourceIndependenceScore = evidence.sourceIndependence ? 1.0 : 0.3;

  // 4. Directness (0–1) — how directly the evidence addresses the question
  const directnessScore = computeDirectness(evidence);

  // 5. Corroboration (0–1) — how many other independent sources agree
  const corroborationScore = computeCorroboration(evidence, allEvidenceForSameSubject);

  // Weighted aggregate
  const overallQualityScore =
    sourceAuthorityScore * weights.sourceAuthority +
    freshnessScore * weights.temporalFreshness +
    sourceIndependenceScore * weights.sourceIndependence +
    directnessScore * weights.directness +
    corroborationScore * weights.corroboration;

  // Classify
  const thresholds = RESEARCH_CONFIG.confidenceThresholds;
  let qualityClassification: "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
  if (evidence.sourceType === "AI_INFERENCE" && evidence.quality === "UNVERIFIED") {
    qualityClassification = "UNVERIFIED";
  } else if (overallQualityScore >= thresholds.highMin) {
    qualityClassification = "HIGH";
  } else if (overallQualityScore >= thresholds.mediumMin) {
    qualityClassification = "MEDIUM";
  } else if (overallQualityScore >= thresholds.lowMin) {
    qualityClassification = "LOW";
  } else {
    qualityClassification = "UNVERIFIED";
  }

  return {
    evidenceId: evidence.id,
    sourceAuthorityScore,
    temporalFreshnessScore: freshnessScore,
    sourceIndependenceScore,
    directnessScore,
    corroborationScore,
    overallQualityScore,
    qualityClassification,
    temporalClassification,
    freshnessLabel,
  };
}

function computeSourceAuthority(evidence: EvidenceItemInput): number {
  // EXISTING_EVIDENCE from authoritative sources gets highest score
  if (evidence.sourceType === "EXISTING_EVIDENCE") {
    const entity = evidence.sourceEntity ?? "";
    // Government/regulatory/official sources
    if (entity.includes("customs") || entity.includes("government") || entity.includes("regulatory")) {
      return 1.0;
    }
    // Manufacturer/official documentation
    if (entity.includes("manufacturer") || entity.includes("official")) {
      return 0.9;
    }
    // Structured intelligence results from deterministic engines
    if (entity.includes("pricing") || entity.includes("demand") || entity.includes("logistics") ||
        entity.includes("supply_chain") || entity.includes("authenticity") || entity.includes("sourcing")) {
      return 0.85;
    }
    // General existing evidence
    return 0.7;
  }

  if (evidence.sourceType === "INTELLIGENCE_RESULT") {
    return 0.75;
  }

  if (evidence.sourceType === "MANUAL") {
    return 0.6;
  }

  // AI_INFERENCE — lowest authority by default
  return 0.3;
}

function computeTemporalFreshness(
  observedAt: Date | null,
  referenceDate: Date,
): { freshnessScore: number; temporalClassification: "CURRENT" | "RECENT" | "HISTORICAL" | "STALE" | "UNKNOWN"; freshnessLabel: "live" | "fresh" | "aging" | "stale" | "unknown" } {
  if (!observedAt) {
    return { freshnessScore: 0.2, temporalClassification: "UNKNOWN", freshnessLabel: "unknown" };
  }

  const ageDays = (referenceDate.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
  const thresholds = RESEARCH_CONFIG.temporalThresholds;

  if (ageDays <= thresholds.currentMaxDays) {
    // Current: score 0.8–1.0, linearly decaying
    const score = 1.0 - (ageDays / thresholds.currentMaxDays) * 0.2;
    return { freshnessScore: score, temporalClassification: "CURRENT", freshnessLabel: "live" };
  }

  if (ageDays <= thresholds.recentMaxDays) {
    // Recent: score 0.5–0.8
    const progress = (ageDays - thresholds.currentMaxDays) / (thresholds.recentMaxDays - thresholds.currentMaxDays);
    const score = 0.8 - progress * 0.3;
    return { freshnessScore: score, temporalClassification: "RECENT", freshnessLabel: "fresh" };
  }

  if (ageDays <= thresholds.historicalMaxDays) {
    // Historical: score 0.2–0.5
    const progress = (ageDays - thresholds.recentMaxDays) / (thresholds.historicalMaxDays - thresholds.recentMaxDays);
    const score = 0.5 - progress * 0.3;
    return { freshnessScore: score, temporalClassification: "HISTORICAL", freshnessLabel: "aging" };
  }

  // Stale: score 0.0–0.2
  return { freshnessScore: 0.1, temporalClassification: "STALE", freshnessLabel: "stale" };
}

function computeDirectness(evidence: EvidenceItemInput): number {
  // Direct evidence (extractedValue present and relevant) scores higher
  if (evidence.extractedValue !== null && evidence.extractedValue !== undefined) {
    return Math.min(1.0, 0.5 + evidence.relevanceScore * 0.5);
  }
  // Indirect/descriptive evidence
  return 0.3 + evidence.relevanceScore * 0.3;
}

function computeCorroboration(
  evidence: EvidenceItemInput,
  allEvidenceForSameSubject?: EvidenceItemInput[],
): number {
  if (!allEvidenceForSameSubject || allEvidenceForSameSubject.length <= 1) {
    // No other evidence to corroborate — neutral score
    return 0.4;
  }

  const independentSources = allEvidenceForSameSubject.filter(
    (e) => e.id !== evidence.id && e.sourceIndependence && e.wasUsed,
  );

  if (independentSources.length === 0) {
    return 0.3;
  }
  if (independentSources.length === 1) {
    return 0.6;
  }
  if (independentSources.length === 2) {
    return 0.8;
  }
  // 3+ independent sources
  return 1.0;
}

// ─── Contradiction Detection ─────────────────────────────────────────────────

/**
 * Detect contradictions among evidence items for the same subject.
 * Deterministic: same inputs → same output.
 */
export function detectContradictions(
  candidates: ContradictionCandidate[],
): ContradictionDetection[] {
  const results: ContradictionDetection[] = [];

  for (const candidate of candidates) {
    const usedItems = candidate.evidenceItems.filter((e) => e.wasUsed);
    if (usedItems.length < RESEARCH_CONFIG.contradictionThresholds.minEvidenceForContradiction) {
      results.push({
        subject: candidate.subject,
        detected: false,
        severity: "low",
        conflictingValues: {},
        evidenceItemIds: usedItems.map((e) => e.id),
        explanation: null,
        resolutionRequires: null,
      });
      continue;
    }

    // Extract numeric values where possible
    const numericValues: Array<{ id: string; value: number }> = [];
    const categoricalValues: Array<{ id: string; value: string }> = [];

    for (const item of usedItems) {
      const val = item.extractedValue;
      if (typeof val === "number") {
        numericValues.push({ id: item.id, value: val });
      } else if (typeof val === "string") {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
          numericValues.push({ id: item.id, value: parsed });
        } else {
          categoricalValues.push({ id: item.id, value: val.toLowerCase().trim() });
        }
      }
    }

    // Check numeric contradictions
    if (numericValues.length >= 2) {
      const sorted = [...numericValues].sort((a, b) => a.value - b.value);
      const minVal = sorted[0]!.value;
      const maxVal = sorted[sorted.length - 1]!.value;

      if (minVal > 0) {
        const spreadPercent = (maxVal - minVal) / minVal;
        const tolerance = RESEARCH_CONFIG.contradictionThresholds.numericTolerancePercent;

        if (spreadPercent > tolerance) {
          const severity = classifyContradictionSeverity(spreadPercent);
          const conflictingValues: Record<string, unknown> = {};
          for (const nv of numericValues) {
            conflictingValues[nv.id] = nv.value;
          }

          results.push({
            subject: candidate.subject,
            detected: true,
            severity,
            conflictingValues,
            evidenceItemIds: numericValues.map((n) => n.id),
            explanation: `Numeric values for "${candidate.subject}" range from ${minVal} to ${maxVal} (${(spreadPercent * 100).toFixed(1)}% spread)`,
            resolutionRequires: `Confirm actual ${candidate.subject} value directly`,
          });
          continue;
        }
      }
    }

    // Check categorical contradictions
    if (categoricalValues.length >= 2) {
      const uniqueValues = new Set(categoricalValues.map((c) => c.value));
      if (uniqueValues.size > 1) {
        const conflictingValues: Record<string, unknown> = {};
        for (const cv of categoricalValues) {
          conflictingValues[cv.id] = cv.value;
        }

        results.push({
          subject: candidate.subject,
          detected: true,
          severity: "medium",
          conflictingValues,
          evidenceItemIds: categoricalValues.map((c) => c.id),
          explanation: `Conflicting categorical values for "${candidate.subject}": ${[...uniqueValues].join(" vs ")}`,
          resolutionRequires: `Clarify which ${candidate.subject} value is correct`,
        });
        continue;
      }
    }

    // No contradiction detected
    results.push({
      subject: candidate.subject,
      detected: false,
      severity: "low",
      conflictingValues: {},
      evidenceItemIds: usedItems.map((e) => e.id),
      explanation: null,
      resolutionRequires: null,
    });
  }

  return results;
}

function classifyContradictionSeverity(spreadPercent: number): "low" | "medium" | "high" | "critical" {
  if (spreadPercent > 1.0) return "critical"; // >100% spread
  if (spreadPercent > 0.5) return "high";     // >50% spread
  if (spreadPercent > 0.2) return "medium";   // >20% spread
  return "low";                                // >10% (tolerance) spread
}

// ─── Confidence Calculation ──────────────────────────────────────────────────

/**
 * Calculate calibrated confidence for a research result.
 * Confidence is derived from evidence dimensions — never from AI self-assessment.
 */
export function calculateConfidence(
  evidenceItems: EvidenceItemInput[],
  subQuestions: SubQuestionInput[],
  contradictions: ContradictionDetection[],
  _hypotheses: HypothesisInput[],
  referenceDate: Date,
): ConfidenceAssessment {
  const usedEvidence = evidenceItems.filter((e) => e.wasUsed);

  // 1. Evidence quantity score (0–1)
  const evidenceQuantityScore = computeEvidenceQuantityScore(usedEvidence.length);

  // 2. Evidence quality score (0–1) — average quality of used evidence
  const evidenceQualityScore = computeAverageEvidenceQuality(usedEvidence, referenceDate);

  // 3. Source independence score (0–1)
  const sourceIndependenceScore = computeSourceIndependenceScore(usedEvidence);

  // 4. Agreement score (0–1) — how much evidence agrees vs contradicts
  const agreementScore = computeAgreementScore(contradictions);

  // 5. Completeness score (0–1) — how many sub-questions are answered
  const completenessScore = computeSubQuestionCompleteness(subQuestions);

  // Weighted aggregate (matching RESEARCH_CONFIG.evidenceQualityWeights pattern)
  const overallConfidence =
    evidenceQuantityScore * 0.20 +
    evidenceQualityScore * 0.25 +
    sourceIndependenceScore * 0.20 +
    agreementScore * 0.15 +
    completenessScore * 0.20;

  // Classify into band
  const thresholds = RESEARCH_CONFIG.confidenceThresholds;
  let confidenceBand: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_EVIDENCE";
  if (usedEvidence.length === 0) {
    confidenceBand = "INSUFFICIENT_EVIDENCE";
  } else if (overallConfidence >= thresholds.highMin) {
    confidenceBand = "HIGH";
  } else if (overallConfidence >= thresholds.mediumMin) {
    confidenceBand = "MEDIUM";
  } else if (overallConfidence >= thresholds.lowMin) {
    confidenceBand = "LOW";
  } else {
    confidenceBand = "INSUFFICIENT_EVIDENCE";
  }

  return {
    overallConfidence,
    evidenceQuantityScore,
    evidenceQualityScore,
    sourceIndependenceScore,
    agreementScore,
    completenessScore,
    confidenceBand,
  };
}

function computeEvidenceQuantityScore(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 0.3;
  if (count === 2) return 0.5;
  if (count <= 5) return 0.7;
  if (count <= 10) return 0.85;
  return 1.0; // 11+ evidence items
}

function computeAverageEvidenceQuality(
  evidenceItems: EvidenceItemInput[],
  referenceDate: Date,
): number {
  if (evidenceItems.length === 0) return 0;

  const scores = evidenceItems.map((e) => {
    const assessment = assessEvidenceQuality(e, referenceDate, evidenceItems);
    return assessment.overallQualityScore;
  });

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

function computeSourceIndependenceScore(evidenceItems: EvidenceItemInput[]): number {
  if (evidenceItems.length === 0) return 0;
  const independent = evidenceItems.filter((e) => e.sourceIndependence).length;
  return independent / evidenceItems.length;
}

function computeAgreementScore(contradictions: ContradictionDetection[]): number {
  if (contradictions.length === 0) return 0.8; // No contradictions = reasonable agreement
  const detected = contradictions.filter((c) => c.detected).length;
  if (contradictions.length === 0) return 1.0;
  return 1.0 - (detected / contradictions.length);
}

function computeSubQuestionCompleteness(subQuestions: SubQuestionInput[]): number {
  if (subQuestions.length === 0) return 0;
  const completed = subQuestions.filter((sq) => sq.status === "COMPLETED").length;
  return completed / subQuestions.length;
}

// ─── Research Gap Detection ──────────────────────────────────────────────────

/** Known research dimensions and what evidence types fill them. */
const RESEARCH_DIMENSIONS: Array<{
  dimension: string;
  description: string;
  requiredEvidenceType: string;
  suggestedSource: string;
  blockingThreshold: string[]; // question types where this is blocking
}> = [
  {
    dimension: "product_identity",
    description: "Exact product specification, variant, and attributes",
    requiredEvidenceType: "PRODUCT_SPECIFICATION",
    suggestedSource: "manufacturer_documentation",
    blockingThreshold: ["IDENTITY", "SUPPLIER", "PRICING", "FEASIBILITY"],
  },
  {
    dimension: "supplier_price",
    description: "Observed supplier pricing for the product",
    requiredEvidenceType: "SUPPLIER_PRICE",
    suggestedSource: "price_observations",
    blockingThreshold: ["PRICING", "FEASIBILITY"],
  },
  {
    dimension: "moq",
    description: "Minimum order quantity from supplier",
    requiredEvidenceType: "MOQ",
    suggestedSource: "supplier_information",
    blockingThreshold: ["PRICING", "FEASIBILITY"],
  },
  {
    dimension: "supplier_legitimacy",
    description: "Evidence supporting supplier authenticity and reliability",
    requiredEvidenceType: "SUPPLIER_AUTHENTICITY",
    suggestedSource: "authenticity_assessment",
    blockingThreshold: ["SUPPLIER", "FEASIBILITY"],
  },
  {
    dimension: "shipping_route",
    description: "Available shipping routes and logistics options",
    requiredEvidenceType: "LOGISTICS_ROUTE",
    suggestedSource: "logistics_assessment",
    blockingThreshold: ["LOGISTICS", "FEASIBILITY"],
  },
  {
    dimension: "freight_cost",
    description: "Current freight/shipping cost estimates",
    requiredEvidenceType: "FREIGHT_COST",
    suggestedSource: "pricing_observation",
    blockingThreshold: ["PRICING", "LOGISTICS", "FEASIBILITY"],
  },
  {
    dimension: "demand_signal",
    description: "Bangladesh market demand evidence",
    requiredEvidenceType: "DEMAND_SIGNAL",
    suggestedSource: "demand_calculation",
    blockingThreshold: ["DEMAND", "FEASIBILITY"],
  },
  {
    dimension: "competition",
    description: "Competing products and market saturation",
    requiredEvidenceType: "COMPETITION_DATA",
    suggestedSource: "product_opportunity_assessment",
    blockingThreshold: ["COMPETITION", "FEASIBILITY"],
  },
  {
    dimension: "regulatory",
    description: "Regulatory, customs, and compliance requirements",
    requiredEvidenceType: "REGULATORY_INFO",
    suggestedSource: "government_source",
    blockingThreshold: ["REGULATORY", "FEASIBILITY"],
  },
  {
    dimension: "landed_cost",
    description: "Complete landed cost calculation",
    requiredEvidenceType: "LANDED_COST",
    suggestedSource: "pricing_assessment",
    blockingThreshold: ["PRICING", "FEASIBILITY"],
  },
];

/**
 * Detect research gaps based on available evidence and sub-question coverage.
 * Deterministic: same inputs → same output.
 */
export function detectResearchGaps(
  subQuestions: SubQuestionInput[],
  evidenceItems: EvidenceItemInput[],
  questionType: string,
): ResearchGapDetection[] {
  const gaps: ResearchGapDetection[] = [];

  // Map sub-questions to dimensions they cover
  const coveredDimensions = new Set<string>();
  for (const sq of subQuestions) {
    if (sq.status === "COMPLETED" && sq.evidenceFound > 0) {
      // Map question type to dimension
      const dimension = mapQuestionTypeToDimension(sq.questionType);
      if (dimension) {
        coveredDimensions.add(dimension);
      }
    }
  }

  // Check each dimension for gaps
  for (const dim of RESEARCH_DIMENSIONS) {
    const isCovered = coveredDimensions.has(dim.dimension);
    if (!isCovered) {
      const isBlocking = dim.blockingThreshold.includes(questionType);
      const hasAnyEvidence = evidenceItems.some(
        (e) =>
          e.sourceEntity?.includes(dim.dimension) ||
          e.title.toLowerCase().includes(dim.dimension.replace(/_/g, " ")),
      );

      // Only report gap if there's no evidence at all for this dimension
      if (!hasAnyEvidence) {
        gaps.push({
          dimension: dim.dimension,
          description: dim.description,
          severity: isBlocking ? "high" : "medium",
          isBlocking,
          requiredEvidenceType: dim.requiredEvidenceType,
          suggestedSource: dim.suggestedSource,
        });
      }
    }
  }

  // Check for sub-questions with no evidence
  for (const sq of subQuestions) {
    if (sq.status === "COMPLETED" && sq.evidenceFound === 0) {
      gaps.push({
        dimension: `sub_question_${sq.id}`,
        description: `Sub-question "${sq.question}" has no supporting evidence`,
        severity: sq.isDependencyMet ? "low" : "high",
        isBlocking: !sq.isDependencyMet,
        requiredEvidenceType: null,
        suggestedSource: null,
      });
    }
  }

  return gaps;
}

function mapQuestionTypeToDimension(questionType: string): string | null {
  const mapping: Record<string, string> = {
    IDENTITY: "product_identity",
    SUPPLIER: "supplier_legitimacy",
    PRICING: "supplier_price",
    DEMAND: "demand_signal",
    LOGISTICS: "shipping_route",
    COMPETITION: "competition",
    REGULATORY: "regulatory",
    FEASIBILITY: "landed_cost",
  };
  return mapping[questionType] ?? null;
}

// ─── Hypothesis Evaluation (Deterministic Part) ──────────────────────────────

/**
 * Evaluate a hypothesis based on available evidence.
 * This is the deterministic part — AI may enhance the rationale,
 * but the classification is derived from evidence counts and quality.
 */
export function evaluateHypothesis(
  hypothesis: HypothesisInput,
  evidenceItems: EvidenceItemInput[],
  contradictions: ContradictionDetection[],
): { status: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNCERTAIN" | "CONTRADICTED" | "INSUFFICIENT_EVIDENCE"; confidence: number } {
  const supporting = evidenceItems.filter((e) =>
    hypothesis.supportingEvidenceIds.includes(e.id) && e.wasUsed,
  );
  const contradicting = evidenceItems.filter((e) =>
    hypothesis.contradictingEvidenceIds.includes(e.id) && e.wasUsed,
  );

  const totalEvidence = supporting.length + contradicting.length;

  // Insufficient evidence
  if (totalEvidence === 0) {
    return { status: "INSUFFICIENT_EVIDENCE", confidence: 0 };
  }

  // Check for active contradictions involving this hypothesis's evidence
  const relevantContradictions = contradictions.filter((c) => {
    if (!c.detected) return false;
    return c.evidenceItemIds.some((id) =>
      [...hypothesis.supportingEvidenceIds, ...hypothesis.contradictingEvidenceIds].includes(id),
    );
  });

  // Contradicted: significant contradicting evidence or unresolved contradictions
  if (contradicting.length > supporting.length) {
    const confidence = Math.min(1.0, contradicting.length / (totalEvidence + hypothesis.unknowns.length));
    return { status: "CONTRADICTED", confidence };
  }

  if (relevantContradictions.length > 0 && contradicting.length > 0) {
    return { status: "CONTRADICTED", confidence: 0.4 };
  }

  // Supported: strong supporting evidence, minimal unknowns
  if (supporting.length >= 3 && hypothesis.unknowns.length <= 1 && contradicting.length === 0) {
    const confidence = Math.min(1.0, supporting.length / (totalEvidence + hypothesis.unknowns.length) * 0.9);
    return { status: "SUPPORTED", confidence };
  }

  // Partially supported: some evidence but gaps remain
  if (supporting.length > contradicting.length) {
    const unknownPenalty = Math.min(0.3, hypothesis.unknowns.length * 0.1);
    const confidence = Math.max(0.1,
      (supporting.length / (totalEvidence + hypothesis.unknowns.length)) - unknownPenalty,
    );
    return { status: "PARTIALLY_SUPPORTED", confidence };
  }

  // Uncertain: balanced or unclear
  return { status: "UNCERTAIN", confidence: 0.3 };
}

// ─── Research Completeness ───────────────────────────────────────────────────

/**
 * Calculate overall research completeness.
 */
export function calculateCompleteness(
  subQuestions: SubQuestionInput[],
  evidenceItems: EvidenceItemInput[],
  contradictions: ContradictionDetection[],
  hypotheses: HypothesisInput[],
  _questionType: string,
): ResearchCompleteness {
  // Sub-question completeness
  const totalSQ = subQuestions.length;
  const completedSQ = subQuestions.filter((sq) => sq.status === "COMPLETED").length;
  const subQuestionCompleteness = totalSQ > 0 ? completedSQ / totalSQ : 0;

  // Evidence completeness — how many dimensions have evidence
  const dimensionsWithEvidence = new Set<string>();
  for (const e of evidenceItems) {
    if (e.wasUsed) {
      const dim = mapQuestionTypeToDimension(e.sourceEntity ?? "");
      if (dim) dimensionsWithEvidence.add(dim);
    }
  }
  const totalDimensions = RESEARCH_DIMENSIONS.length;
  const evidenceCompleteness = dimensionsWithEvidence.size / totalDimensions;

  // Contradiction resolution completeness
  const totalContradictions = contradictions.length;
  const resolvedContradictions = contradictions.filter(
    (c) => !c.detected || c.severity === "low",
  ).length;
  const contradictionResolutionCompleteness =
    totalContradictions > 0 ? resolvedContradictions / totalContradictions : 1.0;

  // Hypothesis coverage completeness
  const totalHypotheses = hypotheses.length;
  const evaluatedHypotheses = hypotheses.filter(
    (h) => h.supportingEvidenceIds.length > 0 || h.contradictingEvidenceIds.length > 0,
  ).length;
  const hypothesisCoverageCompleteness =
    totalHypotheses > 0 ? evaluatedHypotheses / totalHypotheses : 0;

  // Dimension coverage
  const dimensionCoverage: Record<string, boolean> = {};
  for (const dim of RESEARCH_DIMENSIONS) {
    dimensionCoverage[dim.dimension] = dimensionsWithEvidence.has(dim.dimension);
  }

  // Overall completeness (weighted)
  const overallCompleteness =
    subQuestionCompleteness * 0.30 +
    evidenceCompleteness * 0.30 +
    contradictionResolutionCompleteness * 0.20 +
    hypothesisCoverageCompleteness * 0.20;

  return {
    overallCompleteness,
    subQuestionCompleteness,
    evidenceCompleteness,
    contradictionResolutionCompleteness,
    hypothesisCoverageCompleteness,
    dimensionCoverage,
  };
}

// ─── Research Depth Presets ──────────────────────────────────────────────────

/**
 * Get execution limits based on requested research depth.
 */
export function getDepthPreset(depth: string): {
  maxSubQuestions: number;
  maxEvidenceItems: number;
  maxIterations: number;
} {
  const presets = RESEARCH_CONFIG.depthPresets;
  if (depth === "brief") return { ...presets.brief };
  if (depth === "deep") return { ...presets.deep };
  return { ...presets.standard };
}

// ─── Execution Limit Checking ────────────────────────────────────────────────

export interface ExecutionLimits {
  currentIteration: number;
  maxIterations: number;
  modelCallsMade: number;
  maxModelCalls: number;
  evidenceItemsConsidered: number;
  maxEvidenceItems: number;
  subQuestionsGenerated: number;
  maxSubQuestions: number;
  tokenUsageEstimated: number;
  maxTokenUsage: number;
  startedAt: Date | null;
  maxExecutionTimeMs: number;
}

export interface LimitCheckResult {
  canContinue: boolean;
  reason: string | null;
  limitsRemaining: {
    iterations: number;
    modelCalls: number;
    evidenceItems: number;
    subQuestions: number;
    tokens: number;
    timeMs: number;
  };
}

/**
 * Check whether research execution should continue given current resource usage.
 */
export function checkExecutionLimits(limits: ExecutionLimits): LimitCheckResult {
  const remaining = {
    iterations: limits.maxIterations - limits.currentIteration,
    modelCalls: limits.maxModelCalls - limits.modelCallsMade,
    evidenceItems: limits.maxEvidenceItems - limits.evidenceItemsConsidered,
    subQuestions: limits.maxSubQuestions - limits.subQuestionsGenerated,
    tokens: limits.maxTokenUsage - limits.tokenUsageEstimated,
    timeMs: limits.maxExecutionTimeMs - (limits.startedAt ? Date.now() - limits.startedAt.getTime() : 0),
  };

  if (remaining.iterations <= 0) {
    return { canContinue: false, reason: "Maximum iterations reached", limitsRemaining: remaining };
  }
  if (remaining.modelCalls <= 0) {
    return { canContinue: false, reason: "Maximum model calls reached", limitsRemaining: remaining };
  }
  if (remaining.evidenceItems <= 0) {
    return { canContinue: false, reason: "Maximum evidence items reached", limitsRemaining: remaining };
  }
  if (remaining.subQuestions <= 0) {
    return { canContinue: false, reason: "Maximum sub-questions reached", limitsRemaining: remaining };
  }
  if (remaining.tokens <= 0) {
    return { canContinue: false, reason: "Maximum token usage reached", limitsRemaining: remaining };
  }
  if (remaining.timeMs <= 0) {
    return { canContinue: false, reason: "Maximum execution time reached", limitsRemaining: remaining };
  }

  return { canContinue: true, reason: null, limitsRemaining: remaining };
}
