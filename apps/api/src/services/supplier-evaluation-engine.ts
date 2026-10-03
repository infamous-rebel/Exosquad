// =============================================================================
// API — Supplier Evaluation Engine (Phase 13)
// =============================================================================
// Pure, deterministic engine for evaluating supplier quality across 12
// dimensions. No database, no HTTP, no filesystem, no tenant context.
//
// Key invariants:
// - Unknown ≠ Zero: missing info reduces confidence, never treated as negative
// - Deterministic: same input → same output
// - Evidence-backed: no fabricated supplier quality
// - 12 independent dimensions, each scored 0–100
// =============================================================================

import { createHash } from "node:crypto";
import { SOURCING_CONFIG, type SupplierMatchLevel } from "@exosquad/common";
import type { SourcingExplanation, EvidenceRef } from "./supplier-matching-engine.js";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface SupplierDataInput {
  supplierId: string;
  name: string;
  normalizedName: string;
  country: string | null;
  supplierRole: string | null; // manufacturer | distributor | wholesaler | etc.
  identityStatus: string; // unresolved | resolved | high_confidence | possible | ambiguous | conflict
  url: string | null;
  domain: string | null;
  email: string | null;
  phone: string | null;
  contactPerson: string | null;
  attributes: Record<string, unknown>;
  createdAt: Date;
}

export interface CommercialDataInput {
  hasPrice: boolean;
  hasMoq: boolean;
  hasLeadTime: boolean;
  hasPaymentTerms: boolean;
  hasQuantityBreaks: boolean;
  hasCertifications: boolean;
  hasPackaging: boolean;
  hasExportInfo: boolean;
}

export interface SupplierEvaluationEngineInput {
  supplierId: string;
  supplier: SupplierDataInput;
  commercialData: CommercialDataInput;
  matchLevel: SupplierMatchLevel;
  matchScore: number;
  evidence: EvidenceRef[];
  contactCount: number;
  /** Reference timestamp for staleness. Injected for determinism. */
  referenceDate: Date;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface SupplierStrength {
  dimension: string;
  score: number;
  statement: string;
}

export interface SupplierConstraint {
  dimension: string;
  severity: "low" | "medium" | "high" | "critical";
  statement: string;
}

export interface SupplierEvaluationResult {
  supplierId: string;
  qualityLevel: "very_low" | "low" | "moderate" | "high" | "very_high";
  qualityScore: number; // 0–100
  identityConfidence: number; // 0–1
  evidenceConfidence: number; // 0–1
  commercialCompleteness: number; // 0–1
  dimensionScores: Record<string, number>;
  strengths: SupplierStrength[];
  constraints: SupplierConstraint[];
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

function calcIdentityConfidence(supplier: SupplierDataInput): number {
  const statusMap: Record<string, number> = {
    high_confidence: 0.95,
    resolved: 0.80,
    possible: 0.50,
    unresolved: 0.20,
    ambiguous: 0.10,
    conflict: 0.05,
  };
  return statusMap[supplier.identityStatus] ?? 0.10;
}

function calcProductRelevance(matchScore: number): number {
  return clamp01(matchScore / 100);
}

function calcEvidenceQuality(evidence: EvidenceRef[], referenceDate: Date): number {
  if (evidence.length === 0) return 0;

  const freshCutoff = new Date(
    referenceDate.getTime() - SOURCING_CONFIG.currentCommercialDataDays * 24 * 60 * 60 * 1000,
  );

  const active = evidence.filter((e) => e.status === "active");
  if (active.length === 0) return 0;

  const avgConf = active.reduce((s, e) => s + e.confidence, 0) / active.length;
  const freshRatio = active.filter((e) => e.observedAt >= freshCutoff).length / active.length;
  const uniqueSources = new Set(active.map((e) => e.sourceId).filter(Boolean)).size;
  const sourceFactor = Math.min(1, uniqueSources / 3);
  const coverageFactor = Math.min(1, active.length / 5);

  return round2(clamp01(
    avgConf * 0.35 + freshRatio * 0.25 + sourceFactor * 0.20 + coverageFactor * 0.20,
  ));
}

function calcCommercialCompleteness(commercial: CommercialDataInput): number {
  const fields = [
    commercial.hasPrice,
    commercial.hasMoq,
    commercial.hasLeadTime,
    commercial.hasPaymentTerms,
    commercial.hasQuantityBreaks,
    commercial.hasCertifications,
    commercial.hasPackaging,
    commercial.hasExportInfo,
  ];
  const known = fields.filter(Boolean).length;
  return round2(known / fields.length);
}

function calcSupplierReliability(supplier: SupplierDataInput): number {
  // Based on identity status and presence of verifiable info
  let score = 0.3; // base
  if (supplier.identityStatus === "high_confidence") score += 0.4;
  else if (supplier.identityStatus === "resolved") score += 0.3;
  else if (supplier.identityStatus === "possible") score += 0.15;

  if (supplier.domain) score += 0.1;
  if (supplier.url) score += 0.05;
  if (supplier.supplierRole && supplier.supplierRole !== "unknown") score += 0.1;
  if (supplier.country) score += 0.05;

  return round2(clamp01(score));
}

function calcPriceTransparency(commercial: CommercialDataInput): number {
  return commercial.hasPrice ? (commercial.hasQuantityBreaks ? 1.0 : 0.7) : 0;
}

function calcMoqTransparency(commercial: CommercialDataInput): number {
  return commercial.hasMoq ? 1.0 : 0;
}

function calcLeadTimeTransparency(commercial: CommercialDataInput): number {
  return commercial.hasLeadTime ? 1.0 : 0;
}

function calcCertificationAvailability(commercial: CommercialDataInput): number {
  return commercial.hasCertifications ? 1.0 : 0;
}

function calcContactCompleteness(supplier: SupplierDataInput, contactCount: number): number {
  let score = 0;
  if (supplier.email) score += 0.2;
  if (supplier.phone) score += 0.2;
  if (supplier.url || supplier.domain) score += 0.2;
  if (supplier.contactPerson) score += 0.15;
  if (contactCount >= 3) score += 0.25;
  else if (contactCount >= 1) score += 0.15;
  return round2(clamp01(score));
}

function calcRecency(evidence: EvidenceRef[], referenceDate: Date): number {
  if (evidence.length === 0) return 0;

  const freshCutoff = new Date(
    referenceDate.getTime() - SOURCING_CONFIG.currentCommercialDataDays * 24 * 60 * 60 * 1000,
  );
  const histCutoff = new Date(
    referenceDate.getTime() - SOURCING_CONFIG.historicalEvidenceDays * 24 * 60 * 60 * 1000,
  );

  const active = evidence.filter((e) => e.status === "active");
  if (active.length === 0) return 0;

  const freshCount = active.filter((e) => e.observedAt >= freshCutoff).length;
  const histCount = active.filter((e) => e.observedAt >= histCutoff).length;

  const freshRatio = freshCount / active.length;
  const histRatio = histCount / active.length;

  return round2(clamp01(freshRatio * 0.7 + histRatio * 0.3));
}

function calcCrossSourceConsistency(evidence: EvidenceRef[]): number {
  if (evidence.length <= 1) return evidence.length === 1 ? 0.5 : 0;

  const active = evidence.filter((e) => e.status === "active");
  if (active.length <= 1) return 0.3;

  const uniqueSources = new Set(active.map((e) => e.sourceId).filter(Boolean));
  if (uniqueSources.size <= 1) return 0.4;

  // Check confidence agreement
  const confidences = active.map((e) => e.confidence);
  const avg = confidences.reduce((s, c) => s + c, 0) / confidences.length;
  const maxDeviation = Math.max(...confidences.map((c) => Math.abs(c - avg)));

  // Low deviation = high consistency
  return round2(clamp01(1 - maxDeviation));
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

/**
 * Evaluate supplier quality across 12 dimensions.
 * Pure function: same input → same output.
 */
export function calculateSupplierEvaluation(
  input: SupplierEvaluationEngineInput,
): SupplierEvaluationResult {
  const { supplier, commercialData, matchLevel, matchScore, evidence, contactCount, referenceDate } = input;

  // Calculate 12 dimensions
  const dimensionScores: Record<string, number> = {
    identityConfidence: round2(calcIdentityConfidence(supplier) * 100),
    productRelevance: round2(calcProductRelevance(matchScore) * 100),
    evidenceQuality: round2(calcEvidenceQuality(evidence, referenceDate) * 100),
    commercialCompleteness: round2(calcCommercialCompleteness(commercialData) * 100),
    supplierReliability: round2(calcSupplierReliability(supplier) * 100),
    priceTransparency: round2(calcPriceTransparency(commercialData) * 100),
    moqTransparency: round2(calcMoqTransparency(commercialData) * 100),
    leadTimeTransparency: round2(calcLeadTimeTransparency(commercialData) * 100),
    certificationAvailability: round2(calcCertificationAvailability(commercialData) * 100),
    contactCompleteness: round2(calcContactCompleteness(supplier, contactCount) * 100),
    recency: round2(calcRecency(evidence, referenceDate) * 100),
    crossSourceConsistency: round2(calcCrossSourceConsistency(evidence) * 100),
  };

  // Overall quality score — weighted mean over known dimensions
  // (all dimensions are always calculated, but missing data = low score, not zero)
  const allScores = Object.values(dimensionScores);
  const qualityScore = Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length);

  // Quality level classification
  const thresholds = SOURCING_CONFIG.supplierQualityThresholds;
  let qualityLevel: SupplierEvaluationResult["qualityLevel"];
  if (qualityScore >= thresholds.veryHighMin) qualityLevel = "very_high";
  else if (qualityScore >= thresholds.highMin) qualityLevel = "high";
  else if (qualityScore >= thresholds.moderateMin) qualityLevel = "moderate";
  else if (qualityScore >= thresholds.lowMin) qualityLevel = "low";
  else qualityLevel = "very_low";

  // Aggregate confidences
  const identityConfidence = round2((dimensionScores.identityConfidence ?? 0) / 100);
  const evidenceConfidence = round2((dimensionScores.evidenceQuality ?? 0) / 100);
  const commercialCompleteness = round2((dimensionScores.commercialCompleteness ?? 0) / 100);

  // Strengths (dimensions scoring >= 60)
  const strengths: SupplierStrength[] = [];
  const dimensionLabels: Record<string, string> = {
    identityConfidence: "Identity Confidence",
    productRelevance: "Product Relevance",
    evidenceQuality: "Evidence Quality",
    commercialCompleteness: "Commercial Completeness",
    supplierReliability: "Supplier Reliability",
    priceTransparency: "Price Transparency",
    moqTransparency: "MOQ Transparency",
    leadTimeTransparency: "Lead Time Transparency",
    certificationAvailability: "Certification Availability",
    contactCompleteness: "Contact Completeness",
    recency: "Evidence Recency",
    crossSourceConsistency: "Cross-Source Consistency",
  };

  for (const [dim, score] of Object.entries(dimensionScores)) {
    if (score >= 60) {
      strengths.push({
        dimension: dim,
        score,
        statement: `${dimensionLabels[dim] ?? dim} is strong at ${score}%`,
      });
    }
  }

  // Constraints (dimensions scoring <= 20 or missing critical data)
  const constraints: SupplierConstraint[] = [];
  if (dimensionScores.priceTransparency === 0) {
    constraints.push({
      dimension: "priceTransparency",
      severity: "high",
      statement: "No documented supplier price — pricing transparency is zero",
    });
  }
  if (dimensionScores.moqTransparency === 0) {
    constraints.push({
      dimension: "moqTransparency",
      severity: "medium",
      statement: "No documented MOQ — minimum order quantity is unknown",
    });
  }
  if (dimensionScores.leadTimeTransparency === 0) {
    constraints.push({
      dimension: "leadTimeTransparency",
      severity: "medium",
      statement: "No documented lead time — delivery timeline is unknown",
    });
  }
  if ((dimensionScores.contactCompleteness ?? 0) < 20) {
    constraints.push({
      dimension: "contactCompleteness",
      severity: "high",
      statement: "Supplier contact information is severely incomplete",
    });
  }
  if ((dimensionScores.evidenceQuality ?? 0) < 20) {
    constraints.push({
      dimension: "evidenceQuality",
      severity: evidence.length === 0 ? "critical" : "high",
      statement: evidence.length === 0
        ? "No evidence supports this supplier"
        : "Evidence quality is very low",
    });
  }
  if ((dimensionScores.identityConfidence ?? 0) < 20) {
    constraints.push({
      dimension: "identityConfidence",
      severity: "high",
      statement: `Supplier identity status is '${supplier.identityStatus}' — not reliably verified`,
    });
  }
  if (dimensionScores.certificationAvailability === 0) {
    constraints.push({
      dimension: "certificationAvailability",
      severity: "low",
      statement: "No certification evidence available for this supplier",
    });
  }

  // Explanations
  const explanations: SourcingExplanation[] = [];

  if (matchLevel === "exact" || matchLevel === "strong") {
    explanations.push({
      factor: "supplier_quality",
      impact: "positive",
      magnitude: round2(clamp01(matchScore / 100)),
      statement: `Supplier product match is ${matchLevel} (score ${matchScore})`,
      evidenceIds: evidence.slice(0, 3).map((e) => e.id),
    });
  }

  if (qualityScore >= 60) {
    explanations.push({
      factor: "supplier_quality",
      impact: "positive",
      magnitude: round2(clamp01(qualityScore / 100)),
      statement: `Supplier quality is ${qualityLevel} (${qualityScore}/100) across 12 dimensions`,
      evidenceIds: [],
    });
  } else if (qualityScore < 30) {
    explanations.push({
      factor: "supplier_quality",
      impact: "negative",
      magnitude: round2(1 - clamp01(qualityScore / 100)),
      statement: `Supplier quality is ${qualityLevel} (${qualityScore}/100) — significant gaps in evidence and commercial data`,
      evidenceIds: [],
    });
  }

  if (constraints.length > 0) {
    explanations.push({
      factor: "supplier_quality",
      impact: "negative",
      magnitude: round2(clamp01(constraints.length / 7)),
      statement: `${constraints.length} constraint(s) detected: ${constraints.slice(0, 3).map((c) => c.dimension).join(", ")}`,
      evidenceIds: [],
    });
  }

  // Content hash
  const contentHash = sha256(
    stableStringify({
      supplierId: input.supplierId,
      qualityScore,
      qualityLevel,
      dimensionScores,
      evidenceCount: evidence.length,
      commercialCompleteness,
      engineVersion: SOURCING_CONFIG.engineVersion,
    }),
  );

  return {
    supplierId: input.supplierId,
    qualityLevel,
    qualityScore,
    identityConfidence,
    evidenceConfidence,
    commercialCompleteness,
    dimensionScores,
    strengths,
    constraints,
    explanations,
    contentHash,
  };
}
