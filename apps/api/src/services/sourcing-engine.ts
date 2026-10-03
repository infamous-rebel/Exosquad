// =============================================================================
// API — Sourcing Engine (Phase 13)
// =============================================================================
// Pure, deterministic engine for evaluating sourcing economics and operational
// conditions. Central Phase 13 engine that consumes match + evaluation results
// and Phase 7–12 data to produce sourcing option assessments.
//
// Key invariants:
// - Unknown ≠ Zero: missing inputs propagate as null/UNKNOWN
// - Deterministic: same input → same output
// - Consumes Phase 7–12 outputs, does not recreate them
// - MOQ analysis uses Phase 7 demand data where available
// - Landed cost references Phase 11, does not recalculate
// =============================================================================

import { createHash } from "node:crypto";
import { SOURCING_CONFIG } from "@exosquad/common";
import type { SourcingExplanation, EvidenceRef } from "./supplier-matching-engine.js";
import type { SupplierEvaluationResult } from "./supplier-evaluation-engine.js";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface SourcingCommercialInput {
  sourcePrice: number | null;
  currency: string | null;
  moq: number | null;
  leadTimeDays: number | null;
  quantityBreaks: Array<{ quantity: number; unitPrice: number }> | null;
  paymentTerms: string | null;
}

export interface Phase7DemandInput {
  /** Estimated monthly demand (units). null = unknown. */
  estimatedMonthlyDemand: number | null;
  demandLevel: string | null; // HIGH | MODERATE | LOW | UNKNOWN
  demandConfidence: number; // 0–1
}

export interface Phase11PricingInput {
  /** Unit landed cost from Phase 11. null = not calculated. */
  unitLandedCost: number | null;
  currency: string | null;
}

export interface Phase10LogisticsInput {
  /** Number of available logistics routes. */
  routeCount: number | null;
  /** Average route reliability 0–1. null = unknown. */
  routeReliability: number | null;
  /** Estimated transit time range in days. */
  transitTimeDays: { min: number | null; max: number | null } | null;
}

export interface SourcingEngineInput {
  productId: string;
  supplierId: string;
  matchScore: number; // 0–100
  matchLevel: string;
  evaluationResult: SupplierEvaluationResult;
  commercial: SourcingCommercialInput;
  demand: Phase7DemandInput;
  pricing: Phase11PricingInput;
  logistics: Phase10LogisticsInput;
  evidence: EvidenceRef[];
  /** Reference timestamp for staleness. Injected for determinism. */
  referenceDate: Date;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface SourcingConstraintResult {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  value: string | null;
  explanation: string;
  evidenceIds: string[];
}

export interface SourcingOptionResult {
  supplierId: string;
  sourcePrice: number | null;
  currency: string | null;
  moq: number | null;
  leadTimeDays: number | null;

  // Calculated metrics
  estimatedLandedCost: number | null;
  estimatedInitialInventoryCost: number | null;
  moqCoverageMonths: number | null;

  // Scoring
  sourcingLevel: "unavailable" | "weak" | "possible" | "strong" | "preferred";
  sourcingScore: number; // 0–100

  constraints: SourcingConstraintResult[];
  explanations: SourcingExplanation[];
  contentHash: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── MOQ Analysis ────────────────────────────────────────────────────────────

function analyzeMoq(
  moq: number | null,
  monthlyDemand: number | null,
): { coverageMonths: number | null; burdenScore: number } {
  if (moq === null) {
    return { coverageMonths: null, burdenScore: 0 }; // unknown, not zero
  }

  // MOQ coverage in months
  let coverageMonths: number | null = null;
  if (monthlyDemand !== null && monthlyDemand > 0) {
    coverageMonths = round2(moq / monthlyDemand);
  }

  // Burden score (0 = no burden, 1 = extreme burden)
  let burdenScore: number;
  if (moq <= SOURCING_CONFIG.moqThresholds.lowMax) {
    burdenScore = 0.1; // low burden
  } else if (moq <= SOURCING_CONFIG.moqThresholds.moderateMax) {
    burdenScore = 0.3;
  } else if (moq <= SOURCING_CONFIG.moqThresholds.highMax) {
    burdenScore = 0.6;
  } else {
    burdenScore = 0.9; // very high burden
  }

  // If coverage is known and very high, increase burden
  if (coverageMonths !== null && coverageMonths > SOURCING_CONFIG.moqThresholds.highCoverageMonths) {
    burdenScore = Math.min(1, burdenScore + 0.2);
  }

  return { coverageMonths, burdenScore };
}

// ─── Lead Time Analysis ──────────────────────────────────────────────────────

function analyzeLeadTime(
  supplierLeadTime: number | null,
  transitTime: { min: number | null; max: number | null } | null,
): { totalDays: number | null; burdenScore: number } {
  // Total estimated cycle time = supplier prep + transit
  let totalDays: number | null = null;
  if (supplierLeadTime !== null && transitTime !== null && transitTime.max !== null) {
    totalDays = supplierLeadTime + transitTime.max;
  } else if (supplierLeadTime !== null) {
    totalDays = supplierLeadTime;
  }

  // Burden score
  let burdenScore: number;
  if (totalDays === null) {
    burdenScore = 0; // unknown, not zero
  } else if (totalDays <= SOURCING_CONFIG.leadTimeThresholds.shortMax) {
    burdenScore = 0.1;
  } else if (totalDays <= SOURCING_CONFIG.leadTimeThresholds.moderateMax) {
    burdenScore = 0.3;
  } else if (totalDays <= SOURCING_CONFIG.leadTimeThresholds.longMax) {
    burdenScore = 0.6;
  } else {
    burdenScore = 0.9;
  }

  return { totalDays, burdenScore };
}

// ─── Capital Exposure ────────────────────────────────────────────────────────

function analyzeCapitalExposure(
  moq: number | null,
  unitPrice: number | null,
): { initialCost: number | null; burdenScore: number } {
  if (moq === null || unitPrice === null) {
    return { initialCost: null, burdenScore: 0 }; // unknown
  }

  const initialCost = round2(moq * unitPrice);

  let burdenScore: number;
  if (initialCost <= SOURCING_CONFIG.capitalThresholds.lowMax) {
    burdenScore = 0.1;
  } else if (initialCost <= SOURCING_CONFIG.capitalThresholds.moderateMax) {
    burdenScore = 0.3;
  } else if (initialCost <= SOURCING_CONFIG.capitalThresholds.highMax) {
    burdenScore = 0.6;
  } else {
    burdenScore = 0.9;
  }

  return { initialCost, burdenScore };
}

// ─── Constraint Detection ────────────────────────────────────────────────────

function detectConstraints(
  input: SourcingEngineInput,
  moqAnalysis: { coverageMonths: number | null; burdenScore: number },
  leadTimeAnalysis: { totalDays: number | null; burdenScore: number },
  capitalAnalysis: { initialCost: number | null; burdenScore: number },
): SourcingConstraintResult[] {
  const constraints: SourcingConstraintResult[] = [];
  const { commercial, evaluationResult, logistics } = input;

  // MOQ constraints
  if (commercial.moq === null) {
    constraints.push({
      type: "UNKNOWN_MOQ",
      severity: "medium",
      value: null,
      explanation: "Supplier MOQ is not documented — inventory planning is uncertain",
      evidenceIds: [],
    });
  } else if (commercial.moq > SOURCING_CONFIG.moqThresholds.highMax) {
    constraints.push({
      type: "HIGH_MOQ",
      severity: moqAnalysis.burdenScore >= 0.8 ? "critical" : "high",
      value: String(commercial.moq),
      explanation: `MOQ of ${commercial.moq} units creates significant inventory exposure`,
      evidenceIds: [],
    });
  }

  // Price constraints
  if (commercial.sourcePrice === null) {
    constraints.push({
      type: "UNKNOWN_PRICE",
      severity: "high",
      value: null,
      explanation: "Supplier price is not documented — cost analysis is impossible",
      evidenceIds: [],
    });
  }

  // Lead time constraints
  if (commercial.leadTimeDays === null) {
    constraints.push({
      type: "UNKNOWN_LEAD_TIME",
      severity: "medium",
      value: null,
      explanation: "Supplier lead time is not documented — delivery planning is uncertain",
      evidenceIds: [],
    });
  } else if (commercial.leadTimeDays > SOURCING_CONFIG.leadTimeThresholds.longMax) {
    constraints.push({
      type: "LONG_LEAD_TIME",
      severity: leadTimeAnalysis.burdenScore >= 0.8 ? "critical" : "high",
      value: `${commercial.leadTimeDays} days`,
      explanation: `Lead time of ${commercial.leadTimeDays} days exceeds ${SOURCING_CONFIG.leadTimeThresholds.longMax}-day threshold`,
      evidenceIds: [],
    });
  }

  // Capital constraints
  if (capitalAnalysis.initialCost !== null && capitalAnalysis.initialCost > SOURCING_CONFIG.capitalThresholds.highMax) {
    constraints.push({
      type: "HIGH_CAPITAL_REQUIREMENT",
      severity: capitalAnalysis.burdenScore >= 0.8 ? "critical" : "high",
      value: `$${capitalAnalysis.initialCost.toFixed(2)}`,
      explanation: `Initial inventory cost of $${capitalAnalysis.initialCost.toFixed(2)} exceeds $${SOURCING_CONFIG.capitalThresholds.highMax} threshold`,
      evidenceIds: [],
    });
  }

  // Supplier identity constraint
  if (evaluationResult.identityConfidence < 0.3) {
    constraints.push({
      type: "SUPPLIER_IDENTITY_UNCERTAIN",
      severity: "high",
      value: `${(evaluationResult.identityConfidence * 100).toFixed(0)}%`,
      explanation: `Supplier identity confidence is only ${(evaluationResult.identityConfidence * 100).toFixed(0)}%`,
      evidenceIds: [],
    });
  }

  // Evidence constraints
  if (input.evidence.length === 0) {
    constraints.push({
      type: "INSUFFICIENT_SUPPLIER_EVIDENCE",
      severity: "critical",
      value: null,
      explanation: "No evidence supports this supplier-product relationship",
      evidenceIds: [],
    });
  } else if (input.evidence.length < SOURCING_CONFIG.minimumEvidenceCount) {
    constraints.push({
      type: "WEAK_SUPPLIER_EVIDENCE",
      severity: "medium",
      value: `${input.evidence.length} record(s)`,
      explanation: `Only ${input.evidence.length} evidence record(s) — minimum ${SOURCING_CONFIG.minimumEvidenceCount} recommended`,
      evidenceIds: input.evidence.map((e) => e.id),
    });
  }

  // Payment terms constraint
  if (!commercial.paymentTerms) {
    constraints.push({
      type: "MISSING_PAYMENT_TERMS",
      severity: "low",
      value: null,
      explanation: "Payment terms are not documented for this supplier",
      evidenceIds: [],
    });
  }

  // Logistics constraint
  if (logistics.routeCount === null || logistics.routeCount === 0) {
    constraints.push({
      type: "LOGISTICS_UNCERTAIN",
      severity: "medium",
      value: null,
      explanation: "No logistics routes identified — shipping feasibility is unknown",
      evidenceIds: [],
    });
  }

  // Match uncertainty
  if (input.matchLevel === "weak" || input.matchLevel === "no_match") {
    constraints.push({
      type: "PRODUCT_MATCH_UNCERTAIN",
      severity: input.matchLevel === "no_match" ? "critical" : "high",
      value: input.matchLevel,
      explanation: `Product-supplier match is '${input.matchLevel}' (score ${input.matchScore})`,
      evidenceIds: [],
    });
  }

  return constraints;
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

/**
 * Calculate sourcing option evaluation.
 * Pure function: same input → same output.
 */
export function calculateSourcingOption(input: SourcingEngineInput): SourcingOptionResult {
  const { commercial, demand, pricing, evaluationResult } = input;

  // MOQ analysis
  const moqAnalysis = analyzeMoq(commercial.moq, demand.estimatedMonthlyDemand);

  // Lead time analysis
  const leadTimeAnalysis = analyzeLeadTime(commercial.leadTimeDays, input.logistics.transitTimeDays);

  // Capital exposure
  const capitalAnalysis = analyzeCapitalExposure(commercial.moq, commercial.sourcePrice);

  // Estimated landed cost — reference Phase 11 if available
  const estimatedLandedCost = pricing.unitLandedCost ?? null;

  // Constraints
  const constraints = detectConstraints(input, moqAnalysis, leadTimeAnalysis, capitalAnalysis);

  // Sourcing score — weighted over known dimensions only (renormalized)
  const w = SOURCING_CONFIG.sourcingWeights;
  const dimensionScores: Array<[number | null, number]> = [
    [input.matchScore > 0 ? input.matchScore : null, w.productMatch],
    [commercial.sourcePrice !== null ? (commercial.sourcePrice > 0 ? Math.max(0, 100 - Math.min(100, (commercial.sourcePrice / 50) * 100)) : 50) : null, w.price],
    [commercial.moq !== null ? Math.max(0, 100 - moqAnalysis.burdenScore * 100) : null, w.moq],
    [leadTimeAnalysis.totalDays !== null ? Math.max(0, 100 - leadTimeAnalysis.burdenScore * 100) : null, w.leadTime],
    [evaluationResult.qualityScore > 0 ? evaluationResult.qualityScore : null, w.supplierQuality],
    [evaluationResult.evidenceConfidence > 0 ? evaluationResult.evidenceConfidence * 100 : null, w.evidenceConfidence],
    [evaluationResult.commercialCompleteness > 0 ? evaluationResult.commercialCompleteness * 100 : null, w.commercialCompleteness],
  ];

  let weightedSum = 0;
  let weightTotal = 0;
  for (const [score, weight] of dimensionScores) {
    if (score !== null) {
      weightedSum += score * weight;
      weightTotal += weight;
    }
  }

  const sourcingScore = weightTotal > 0
    ? Math.max(0, Math.min(100, Math.round(weightedSum / weightTotal)))
    : 0;

  // Sourcing level classification
  const thresholds = SOURCING_CONFIG.sourcingLevelThresholds;
  let sourcingLevel: SourcingOptionResult["sourcingLevel"];
  if (sourcingScore >= thresholds.preferredMin) sourcingLevel = "preferred";
  else if (sourcingScore >= thresholds.strongMin) sourcingLevel = "strong";
  else if (sourcingScore >= thresholds.possibleMin) sourcingLevel = "possible";
  else if (sourcingScore >= thresholds.weakMin) sourcingLevel = "weak";
  else sourcingLevel = "unavailable";

  // Explanations
  const explanations: SourcingExplanation[] = [];

  if (commercial.sourcePrice !== null) {
    explanations.push({
      factor: "price",
      impact: "positive",
      magnitude: round2(clamp01(0.7)),
      statement: `Documented supplier price: ${commercial.currency ?? "USD"} ${commercial.sourcePrice}`,
      evidenceIds: [],
    });
  }

  if (moqAnalysis.coverageMonths !== null) {
    explanations.push({
      factor: "moq",
      impact: moqAnalysis.coverageMonths > SOURCING_CONFIG.moqThresholds.highCoverageMonths ? "negative" : "neutral",
      magnitude: round2(moqAnalysis.burdenScore),
      statement: `MOQ of ${commercial.moq} units covers approximately ${moqAnalysis.coverageMonths} months of estimated demand`,
      evidenceIds: [],
    });
  }

  if (capitalAnalysis.initialCost !== null) {
    explanations.push({
      factor: "capital",
      impact: capitalAnalysis.initialCost > SOURCING_CONFIG.capitalThresholds.highMax ? "negative" : "neutral",
      magnitude: round2(capitalAnalysis.burdenScore),
      statement: `Estimated initial inventory cost: $${capitalAnalysis.initialCost.toFixed(2)}`,
      evidenceIds: [],
    });
  }

  if (constraints.length > 0) {
    const highSeverity = constraints.filter((c) => c.severity === "high" || c.severity === "critical");
    if (highSeverity.length > 0) {
      explanations.push({
        factor: "evidence",
        impact: "negative",
        magnitude: round2(clamp01(highSeverity.length / 5)),
        statement: `${highSeverity.length} high/critical constraint(s): ${highSeverity.slice(0, 3).map((c) => c.type).join(", ")}`,
        evidenceIds: [],
      });
    }
  }

  // Content hash
  const contentHash = sha256(
    stableStringify({
      productId: input.productId,
      supplierId: input.supplierId,
      sourcingScore,
      sourcingLevel,
      sourcePrice: commercial.sourcePrice,
      moq: commercial.moq,
      leadTimeDays: commercial.leadTimeDays,
      estimatedLandedCost,
      estimatedInitialInventoryCost: capitalAnalysis.initialCost,
      moqCoverageMonths: moqAnalysis.coverageMonths,
      constraintCount: constraints.length,
      engineVersion: SOURCING_CONFIG.engineVersion,
    }),
  );

  return {
    supplierId: input.supplierId,
    sourcePrice: commercial.sourcePrice,
    currency: commercial.currency,
    moq: commercial.moq,
    leadTimeDays: commercial.leadTimeDays,
    estimatedLandedCost,
    estimatedInitialInventoryCost: capitalAnalysis.initialCost,
    moqCoverageMonths: moqAnalysis.coverageMonths,
    sourcingLevel,
    sourcingScore,
    constraints,
    explanations,
    contentHash,
  };
}
