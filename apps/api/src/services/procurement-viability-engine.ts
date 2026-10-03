// =============================================================================
// API — Procurement Viability Engine (Phase 13)
// =============================================================================
// Pure, deterministic engine for evaluating whether a reseller can realistically
// procure from a specific supplier. Different from Phase 12 reseller viability
// (which evaluates product-level commercial viability). This evaluates
// supplier-level procurement feasibility.
//
// Key invariants:
// - Unknown ≠ Zero: missing info reduces confidence, never treated as zero
// - Deterministic: same input → same output
// - 12 dimensions, each independently scored
// - Viability ≠ Phase 12 viability: this is supplier-specific procurement
// =============================================================================

import { createHash } from "node:crypto";
import { SOURCING_CONFIG } from "@exosquad/common";
import type { SourcingExplanation, EvidenceRef } from "./supplier-matching-engine.js";
import type { SupplierEvaluationResult } from "./supplier-evaluation-engine.js";
import type { SourcingOptionResult, SourcingConstraintResult } from "./sourcing-engine.js";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface ProcurementViabilityEngineInput {
  productId: string;
  supplierId: string;
  matchScore: number;
  matchLevel: string;
  evaluationResult: SupplierEvaluationResult;
  sourcingResult: SourcingOptionResult;
  evidence: EvidenceRef[];
  /** Whether Phase 11 compliance/import data exists for this product. */
  hasComplianceData: boolean;
  /** Whether Phase 10 logistics routes are available. */
  hasLogisticsRoutes: boolean;
  /** Number of documented supplier contacts. */
  contactCount: number;
  /** Reference timestamp for staleness. Injected for determinism. */
  referenceDate: Date;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface ProcurementViabilityResult {
  supplierId: string;
  viabilityLevel: "not_viable" | "weak" | "conditional" | "viable" | "strong";
  viabilityScore: number; // 0–100
  confidence: number; // 0–1
  capitalRequirement: number | null;
  estimatedLeadTimeDays: number | null;
  inventoryExposure: number | null; // MOQ coverage in months
  dimensionScores: Record<string, number>;
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

// ─── Dimension Calculators ───────────────────────────────────────────────────

function calcSupplierReliabilityDim(evalResult: SupplierEvaluationResult): number {
  return evalResult.dimensionScores.supplierReliability ?? 0;
}

function calcSupplierEvidenceDim(evalResult: SupplierEvaluationResult, evidenceCount: number): number {
  const evidenceQuality = evalResult.dimensionScores.evidenceQuality ?? 0;
  const countFactor = Math.min(1, evidenceCount / 5) * 100;
  return round2((evidenceQuality * 0.6 + countFactor * 0.4));
}

function calcProductMatchDim(matchScore: number): number {
  return Math.min(100, Math.round(matchScore));
}

function calcMoqBurdenDim(moqCoverageMonths: number | null, moq: number | null): number {
  if (moq === null) return 0; // unknown, not zero
  if (moqCoverageMonths === null) {
    // Coverage unknown, use raw MOQ thresholds
    if (moq <= SOURCING_CONFIG.moqThresholds.lowMax) return 80;
    if (moq <= SOURCING_CONFIG.moqThresholds.moderateMax) return 60;
    if (moq <= SOURCING_CONFIG.moqThresholds.highMax) return 30;
    return 10;
  }
  // Lower coverage = less burden = higher score
  if (moqCoverageMonths <= 1) return 90;
  if (moqCoverageMonths <= 3) return 70;
  if (moqCoverageMonths <= SOURCING_CONFIG.moqThresholds.highCoverageMonths) return 40;
  return 15;
}

function calcCapitalRequirementDim(capitalCost: number | null): number {
  if (capitalCost === null) return 0; // unknown
  if (capitalCost <= SOURCING_CONFIG.capitalThresholds.lowMax) return 90;
  if (capitalCost <= SOURCING_CONFIG.capitalThresholds.moderateMax) return 65;
  if (capitalCost <= SOURCING_CONFIG.capitalThresholds.highMax) return 35;
  return 10;
}

function calcPriceTransparencyDim(sourcePrice: number | null): number {
  return sourcePrice !== null ? 100 : 0;
}

function calcLeadTimeBurdenDim(leadTimeDays: number | null): number {
  if (leadTimeDays === null) return 0; // unknown
  if (leadTimeDays <= SOURCING_CONFIG.leadTimeThresholds.shortMax) return 90;
  if (leadTimeDays <= SOURCING_CONFIG.leadTimeThresholds.moderateMax) return 65;
  if (leadTimeDays <= SOURCING_CONFIG.leadTimeThresholds.longMax) return 35;
  return 10;
}

function calcPaymentTermDim(hasPaymentTerms: boolean): number {
  return hasPaymentTerms ? 100 : 0;
}

function calcLogisticsFeasibilityDim(hasRoutes: boolean, routeReliability: number | null): number {
  if (!hasRoutes) return 0; // unknown
  return routeReliability !== null ? Math.round(routeReliability * 100) : 50;
}

function calcComplianceReadinessDim(hasComplianceData: boolean): number {
  return hasComplianceData ? 80 : 0; // unknown ≠ non-compliant
}

function calcDocumentationCompletenessDim(evalResult: SupplierEvaluationResult): number {
  return evalResult.dimensionScores.commercialCompleteness ?? 0;
}

function calcContactAvailabilityDim(_contactCount: number, evalResult: SupplierEvaluationResult): number {
  return evalResult.dimensionScores.contactCompleteness ?? 0;
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

/**
 * Calculate procurement viability for a specific supplier.
 * Pure function: same input → same output.
 */
export function calculateProcurementViability(
  input: ProcurementViabilityEngineInput,
): ProcurementViabilityResult {
  const {
    evaluationResult,
    sourcingResult,
    evidence,
    hasComplianceData,
    hasLogisticsRoutes,
    contactCount,
  } = input;

  // Calculate 12 dimension scores (0–100 each)
  const dimensionScores: Record<string, number> = {
    supplierReliability: calcSupplierReliabilityDim(evaluationResult),
    supplierEvidence: calcSupplierEvidenceDim(evaluationResult, evidence.length),
    productMatch: calcProductMatchDim(input.matchScore),
    moqBurden: calcMoqBurdenDim(sourcingResult.moqCoverageMonths, sourcingResult.moq),
    capitalRequirement: calcCapitalRequirementDim(sourcingResult.estimatedInitialInventoryCost),
    priceTransparency: calcPriceTransparencyDim(sourcingResult.sourcePrice),
    leadTimeBurden: calcLeadTimeBurdenDim(sourcingResult.leadTimeDays),
    paymentTermAvailability: calcPaymentTermDim(sourcingResult.moq !== null), // payment terms tracked via sourcing
    logisticsFeasibility: calcLogisticsFeasibilityDim(hasLogisticsRoutes, null),
    complianceReadiness: calcComplianceReadinessDim(hasComplianceData),
    documentationCompleteness: calcDocumentationCompletenessDim(evaluationResult),
    contactAvailability: calcContactAvailabilityDim(contactCount, evaluationResult),
  };

  // Viability score — weighted mean over known dimensions
  // Unknown dimensions (score = 0 due to missing data) are included but reduce the overall score
  const vw = SOURCING_CONFIG.viabilityWeights;
  const weightMap: Record<string, number> = {
    supplierReliability: vw.supplierReliability,
    supplierEvidence: vw.supplierEvidence,
    productMatch: vw.productMatch,
    moqBurden: vw.moqBurden,
    capitalRequirement: vw.capitalRequirement,
    priceTransparency: vw.priceTransparency,
    leadTimeBurden: vw.leadTimeBurden,
    paymentTermAvailability: vw.paymentTermAvailability,
    logisticsFeasibility: vw.logisticsFeasibility,
    complianceReadiness: vw.complianceReadiness,
    documentationCompleteness: vw.documentationCompleteness,
    contactAvailability: vw.contactAvailability,
  };

  let weightedSum = 0;
  let weightTotal = 0;
  for (const [dim, score] of Object.entries(dimensionScores)) {
    const weight = weightMap[dim] ?? 0;
    // Include all dimensions — unknown (0) reduces score, doesn't exclude
    weightedSum += score * weight;
    weightTotal += weight;
  }

  const viabilityScore = weightTotal > 0
    ? Math.max(0, Math.min(100, Math.round(weightedSum / weightTotal)))
    : 0;

  // Viability level classification
  const thresholds = SOURCING_CONFIG.viabilityLevelThresholds;
  let viabilityLevel: ProcurementViabilityResult["viabilityLevel"];
  if (viabilityScore >= thresholds.strongMin) viabilityLevel = "strong";
  else if (viabilityScore >= thresholds.viableMin) viabilityLevel = "viable";
  else if (viabilityScore >= thresholds.conditionalMin) viabilityLevel = "conditional";
  else if (viabilityScore >= thresholds.weakMin) viabilityLevel = "weak";
  else viabilityLevel = "not_viable";

  // Confidence — based on data availability
  const knownDimensions = Object.values(dimensionScores).filter((s) => s > 0).length;
  const totalDimensions = Object.keys(dimensionScores).length;
  const dataCoverage = knownDimensions / totalDimensions;

  const evidenceConfidence = evidence.length >= SOURCING_CONFIG.minimumEvidenceCount
    ? Math.min(1, evidence.length / 5)
    : evidence.length / SOURCING_CONFIG.minimumEvidenceCount;

  const confidence = round2(clamp01(
    dataCoverage * 0.4 + evidenceConfidence * 0.3 + evaluationResult.evidenceConfidence * 0.3,
  ));

  // Pass through commercial metrics
  const capitalRequirement = sourcingResult.estimatedInitialInventoryCost;
  const estimatedLeadTimeDays = sourcingResult.leadTimeDays;
  const inventoryExposure = sourcingResult.moqCoverageMonths;

  // Aggregate constraints from sourcing result + viability-specific
  const constraints: SourcingConstraintResult[] = [...sourcingResult.constraints];

  // Add viability-specific constraints
  if (!hasComplianceData) {
    constraints.push({
      type: "COMPLIANCE_UNCERTAIN",
      severity: "medium",
      value: null,
      explanation: "No compliance/import data available for this product — regulatory readiness is unknown",
      evidenceIds: [],
    });
  }

  if (!hasLogisticsRoutes) {
    constraints.push({
      type: "LOGISTICS_UNCERTAIN",
      severity: "medium",
      value: null,
      explanation: "No logistics routes identified — shipping feasibility cannot be assessed",
      evidenceIds: [],
    });
  }

  // Explanations
  const explanations: SourcingExplanation[] = [];

  if (viabilityScore >= 60) {
    explanations.push({
      factor: "supplier_quality",
      impact: "positive",
      magnitude: round2(clamp01(viabilityScore / 100)),
      statement: `Procurement viability is ${viabilityLevel} (${viabilityScore}/100) — ${knownDimensions}/${totalDimensions} dimensions have data`,
      evidenceIds: [],
    });
  } else if (viabilityScore < 30) {
    explanations.push({
      factor: "supplier_quality",
      impact: "negative",
      magnitude: round2(1 - clamp01(viabilityScore / 100)),
      statement: `Procurement viability is ${viabilityLevel} (${viabilityScore}/100) — significant data gaps and constraints`,
      evidenceIds: [],
    });
  }

  if (capitalRequirement !== null) {
    explanations.push({
      factor: "capital",
      impact: capitalRequirement > SOURCING_CONFIG.capitalThresholds.highMax ? "negative" : "neutral",
      magnitude: round2(clamp01(capitalRequirement / SOURCING_CONFIG.capitalThresholds.highMax)),
      statement: `Capital requirement: $${capitalRequirement.toFixed(2)} (MOQ-based initial inventory cost)`,
      evidenceIds: [],
    });
  } else {
    explanations.push({
      factor: "capital",
      impact: "unknown",
      magnitude: 0,
      statement: "Capital requirement is unknown — price or MOQ not documented",
      evidenceIds: [],
    });
  }

  if (constraints.length > 0) {
    const critical = constraints.filter((c) => c.severity === "critical");
    if (critical.length > 0) {
      explanations.push({
        factor: "evidence",
        impact: "negative",
        magnitude: round2(clamp01(critical.length / 3)),
        statement: `${critical.length} critical constraint(s) block procurement: ${critical.slice(0, 3).map((c) => c.type).join(", ")}`,
        evidenceIds: [],
      });
    }
  }

  // Content hash
  const contentHash = sha256(
    stableStringify({
      productId: input.productId,
      supplierId: input.supplierId,
      viabilityScore,
      viabilityLevel,
      dimensionScores,
      capitalRequirement,
      estimatedLeadTimeDays,
      inventoryExposure,
      constraintCount: constraints.length,
      confidence,
      engineVersion: SOURCING_CONFIG.engineVersion,
    }),
  );

  return {
    supplierId: input.supplierId,
    viabilityLevel,
    viabilityScore,
    confidence,
    capitalRequirement,
    estimatedLeadTimeDays,
    inventoryExposure,
    dimensionScores,
    constraints,
    explanations,
    contentHash,
  };
}
