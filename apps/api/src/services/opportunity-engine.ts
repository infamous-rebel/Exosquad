// =============================================================================
// API — Opportunity Calculation Engine (Phase 8)
// =============================================================================
// Pure, deterministic opportunity scoring engine. Evaluates demand signals
// to produce opportunity scores, confidence, risk assessments, and actions.
//
// No AI, no heuristics — deterministic math with documented formulas.
// Same inputs → same outputs. Every value is explainable.
// No database side effects — this module is a pure function.
// =============================================================================

import { createHash } from "node:crypto";
import { OPPORTUNITY_CONFIG } from "@exosquad/common";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface DemandSignalSummary {
  id: string;
  sourceId: string;
  signalType: string;
  metric: string;
  value: number;
  observedAt: Date;
  geography: string;
  confidence: number;
  freshness: string;
  dataQuality: string;
  sourceReliability: number;
  isOutlier: boolean;
}

export interface OpportunityCandidate {
  tenantId: string;
  productId: string | null;
  productVariantId: string | null;
  geographyCode: string | null;
  categoryId: string | null;
  signals: DemandSignalSummary[];
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface OpportunityBreakdown {
  demandStrength: number;
  demandMomentum: number;
  demandPersistence: number;
  velocity: number;
  acceleration: number;
  seasonality: number;
  sourceDiversity: number;
  riskAdjustment: number;
  confidence: number;
  finalScore: number;
}

export interface OpportunityRiskItem {
  riskType: string;
  severity: string;
  score: number;
  description: string;
  evidence: Record<string, unknown>;
  affectedSignals: string[];
}

export interface OpportunityActionItem {
  actionType: string;
  priority: string;
  title: string;
  description: string;
  reason: string;
}

export interface OpportunityEvidenceItem {
  evidenceType: string;
  sourceId: string;
  demandSignalId: string;
  weight: number;
  contribution: number;
  snapshotAt: Date;
  metadata: Record<string, unknown>;
}

export interface OpportunityResult {
  tenantId: string;
  productId: string | null;
  productVariantId: string | null;
  geographyCode: string | null;
  categoryId: string | null;
  score: number;
  confidence: number;
  opportunityType: string;
  algorithmVersion: string;
  contentHash: string;
  detectedAt: Date;
  validFrom: Date;
  validUntil: Date;
  breakdown: OpportunityBreakdown;
  risks: OpportunityRiskItem[];
  actions: OpportunityActionItem[];
  evidence: OpportunityEvidenceItem[];
  signalIds: string[];
  title: string;
  summary: string;
}

// ─── Hash Helpers ────────────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function computeOpportunityContentHash(data: {
  tenantId: string;
  productId: string | null;
  productVariantId: string | null;
  geographyCode: string | null;
  opportunityType: string;
  signalIds: string[];
  algorithmVersion: string;
}): string {
  // Sort signal IDs for deterministic ordering
  const sortedSignalIds = [...data.signalIds].sort();
  const canonical = stableStringify({
    tenantId: data.tenantId,
    productId: data.productId,
    productVariantId: data.productVariantId,
    geographyCode: data.geographyCode,
    opportunityType: data.opportunityType,
    signalIds: sortedSignalIds,
    algorithmVersion: data.algorithmVersion,
  });
  return sha256(canonical);
}

// ─── Signal Filtering ────────────────────────────────────────────────────────

function filterValidSignals(signals: DemandSignalSummary[]): DemandSignalSummary[] {
  return signals.filter((s) => {
    // Filter outliers
    if (s.isOutlier) return false;
    // Filter invalid quality
    if (s.dataQuality === "invalid" || s.dataQuality === "missing") return false;
    // Filter low confidence
    if (s.confidence < OPPORTUNITY_CONFIG.minimumSignalConfidence) return false;
    return true;
  });
}

function filterFreshSignals(signals: DemandSignalSummary[]): DemandSignalSummary[] {
  const now = Date.now();
  const staleThresholdMs = OPPORTUNITY_CONFIG.staleSignalDays * 24 * 60 * 60 * 1000;
  return signals.filter((s) => {
    const age = now - s.observedAt.getTime();
    return age <= staleThresholdMs;
  });
}

// ─── Scoring Functions ───────────────────────────────────────────────────────

function calculateDemandStrength(signals: DemandSignalSummary[]): number {
  if (signals.length === 0) return 0;
  const avgConfidence = signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length;
  const avgReliability = signals.reduce((s, sig) => s + sig.sourceReliability, 0) / signals.length;
  const countFactor = Math.min(1, signals.length / 10);
  return Math.round((avgConfidence * 0.5 + avgReliability * 0.3 + countFactor * 0.2) * 100);
}

function calculateDemandMomentum(signals: DemandSignalSummary[]): number {
  if (signals.length < 2) return 50;
  const sorted = [...signals].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
  const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
  const avgFirst = firstHalf.reduce((s, sig) => s + sig.value, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, sig) => s + sig.value, 0) / secondHalf.length;
  if (avgFirst <= 0) return avgSecond > 0 ? 80 : 50;
  const growthRate = (avgSecond - avgFirst) / avgFirst;
  // Map growth rate to 0-100 scale
  return Math.max(0, Math.min(100, Math.round(50 + growthRate * 200)));
}

function calculatePersistence(signals: DemandSignalSummary[]): number {
  if (signals.length < 2) return 0;
  const sorted = [...signals].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const lastIdx = sorted.length - 1;
  const timeSpan = sorted[lastIdx]!.observedAt.getTime() - sorted[0]!.observedAt.getTime();
  const days = timeSpan / (24 * 60 * 60 * 1000);
  // Longer time span = higher persistence
  return Math.min(100, Math.round((days / 30) * 50 + (signals.length / 20) * 50));
}

function calculateVelocity(signals: DemandSignalSummary[]): number {
  if (signals.length < 2) return 0;
  const sorted = [...signals].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const lastIdx = sorted.length - 1;
  const timeSpanDays = Math.max(1, (sorted[lastIdx]!.observedAt.getTime() - sorted[0]!.observedAt.getTime()) / (24 * 60 * 60 * 1000));
  // Signal density relative to time span: more signals in more days = higher velocity
  const densityFactor = Math.min(2, signals.length / Math.max(1, timeSpanDays));
  return Math.min(100, Math.round(densityFactor * 50));
}

function calculateAcceleration(signals: DemandSignalSummary[]): number {
  if (signals.length < 4) return 50;
  const sorted = [...signals].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const quarters = [
    sorted.slice(0, Math.floor(sorted.length / 4)),
    sorted.slice(Math.floor(sorted.length / 4), Math.floor(sorted.length / 2)),
    sorted.slice(Math.floor(sorted.length / 2), Math.floor(3 * sorted.length / 4)),
    sorted.slice(Math.floor(3 * sorted.length / 4)),
  ].filter((q) => q.length > 0);
  if (quarters.length < 2) return 50;
  const avgs = quarters.map((q) => q.reduce((s, sig) => s + sig.value, 0) / q.length);
  // Calculate second derivative (acceleration)
  const firstDiffs: number[] = [];
  for (let i = 1; i < avgs.length; i++) {
    firstDiffs.push((avgs[i] ?? 0) - (avgs[i - 1] ?? 0));
  }
  // Calculate second derivative (change in acceleration)
  let avgSecondDiff = 0;
  if (firstDiffs.length >= 2) {
    const secondDiffs: number[] = [];
    for (let i = 1; i < firstDiffs.length; i++) {
      secondDiffs.push(firstDiffs[i]! - firstDiffs[i - 1]!);
    }
    avgSecondDiff = secondDiffs.reduce((s, d) => s + d, 0) / secondDiffs.length;
  }
  // Use second derivative for acceleration: positive = accelerating, negative = decelerating
  return Math.max(0, Math.min(100, Math.round(50 + 50 * Math.tanh(avgSecondDiff / 30))));
}

function calculateSeasonality(_signals: DemandSignalSummary[]): number {
  // Simplified: real seasonality needs longer time series
  return 50;
}

function calculateSourceDiversity(signals: DemandSignalSummary[]): number {
  const uniqueSources = new Set(signals.map((s) => s.sourceId));
  const diversityRatio = uniqueSources.size / Math.max(1, signals.length);
  // Use power curve to reward source diversity more generously
  return Math.round(Math.pow(diversityRatio, 0.6) * 100);
}

// ─── Confidence Calculation ──────────────────────────────────────────────────

function calculateConfidence(signals: DemandSignalSummary[]): number {
  if (signals.length === 0) return 0;
  const weights = OPPORTUNITY_CONFIG.confidenceWeights;

  // Signal quality component
  const avgConfidence = signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length;
  const signalScore = avgConfidence;

  // Source diversity component
  const uniqueSources = new Set(signals.map((s) => s.sourceId));
  const diversityScore = Math.min(1, uniqueSources.size / 5);

  // Persistence component
  const sorted = [...signals].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const lastIdx2 = sorted.length - 1;
  const timeSpan = sorted.length >= 2
    ? (sorted[lastIdx2]!.observedAt.getTime() - sorted[0]!.observedAt.getTime()) / (24 * 60 * 60 * 1000)
    : 0;
  const persistenceScore = Math.min(1, timeSpan / 30);

  // Completeness component
  const completenessScore = Math.min(1, signals.length / 10);

  // Agreement component (inverse of coefficient of variation)
  const values = signals.map((s) => s.value);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const agreementScore = Math.max(0, 1 - cv);

  const confidence =
    signalScore * weights.signal +
    diversityScore * weights.sourceDiversity +
    persistenceScore * weights.persistence +
    completenessScore * weights.completeness +
    agreementScore * weights.agreement;

  return Math.max(0, Math.min(1, confidence));
}

// ─── Risk Assessment ─────────────────────────────────────────────────────────

function assessRisks(signals: DemandSignalSummary[]): OpportunityRiskItem[] {
  const risks: OpportunityRiskItem[] = [];

  // High volatility risk
  const values = signals.map((s) => s.value);
  if (values.length >= 2) {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv > 0.5) {
      risks.push({
        riskType: "HIGH_VOLATILITY",
        severity: cv > 1.0 ? "high" : "medium",
        score: Math.round(cv * 50),
        description: `Signal values show high volatility (CV: ${cv.toFixed(2)})`,
        evidence: { coefficientOfVariation: cv, signalCount: signals.length },
        affectedSignals: signals.map((s) => s.id),
      });
    }
  }

  // Stale signal risk
  const freshSignals = filterFreshSignals(signals);
  if (freshSignals.length < signals.length * 0.5) {
    risks.push({
      riskType: "STALE_SIGNAL",
      severity: "high",
      score: 70,
      description: `Most signals are stale (${freshSignals.length}/${signals.length} fresh)`,
      evidence: { freshCount: freshSignals.length, totalCount: signals.length },
      affectedSignals: signals.filter((s) => !freshSignals.includes(s)).map((s) => s.id),
    });
  }

  // Data sparse risk
  if (signals.length < OPPORTUNITY_CONFIG.minimumEvidenceSources + 2) {
    risks.push({
      riskType: "DATA_SPARSE",
      severity: signals.length < 3 ? "high" : "medium",
      score: Math.max(0, 80 - signals.length * 15),
      description: `Only ${signals.length} signal(s) available`,
      evidence: { signalCount: signals.length },
      affectedSignals: signals.map((s) => s.id),
    });
  }

  // Source conflict risk
  const sourceGroups = new Map<string, DemandSignalSummary[]>();
  for (const s of signals) {
    const group = sourceGroups.get(s.sourceId) ?? [];
    group.push(s);
    sourceGroups.set(s.sourceId, group);
  }
  if (sourceGroups.size >= 2) {
    const sourceAvgs = [...sourceGroups.entries()].map(([, sigs]) =>
      sigs.reduce((s, sig) => s + sig.value, 0) / sigs.length,
    );
    const grandMean = sourceAvgs.reduce((s, v) => s + v, 0) / sourceAvgs.length;
    const sourceVariance = sourceAvgs.reduce((s, v) => s + (v - grandMean) * (v - grandMean), 0) / sourceAvgs.length;
    const sourceCV = grandMean > 0 ? Math.sqrt(sourceVariance) / grandMean : 0;
    if (sourceCV >= 0.20) {
      risks.push({
        riskType: "SOURCE_CONFLICT",
        severity: "medium",
        score: Math.round(sourceCV * 50),
        description: "Different sources show significantly different values",
        evidence: { sourceCV, sourceCount: sourceGroups.size },
        affectedSignals: signals.map((s) => s.id),
      });
    }
  }

  // Always include commercial data missing risk (Phase 8 doesn't have commercial data)
  risks.push({
    riskType: "COMMERCIAL_DATA_MISSING",
    severity: "low",
    score: 20,
    description: "No commercial/pricing data available for this opportunity",
    evidence: {},
    affectedSignals: [],
  });

  return risks;
}

// ─── Action Generation ───────────────────────────────────────────────────────

function generateActions(
  score: number,
  confidence: number,
  risks: OpportunityRiskItem[],
): OpportunityActionItem[] {
  const actions: OpportunityActionItem[] = [];

  // High score → investigate suppliers
  if (score >= 60) {
    actions.push({
      actionType: "INVESTIGATE_SUPPLIERS",
      priority: score >= 75 ? "high" : "medium",
      title: "Investigate Suppliers",
      description: `Opportunity score ${score} warrants supplier investigation.`,
      reason: `Opportunity score ${score} warrants supplier investigation.`,
    });
  }

  // Low confidence → watch demand
  if (confidence < 0.5) {
    actions.push({
      actionType: "WATCH_DEMAND",
      priority: "medium",
      title: "Watch Demand",
      description: `Low confidence (${(confidence * 100).toFixed(0)}%) — monitor demand signals.`,
      reason: `Low confidence (${(confidence * 100).toFixed(0)}%) — monitor demand signals.`,
    });
  }

  // Always include price verification when commercial data is missing
  const commercialMissing = risks.some((r) => r.riskType === "COMMERCIAL_DATA_MISSING");
  if (commercialMissing) {
    actions.push({
      actionType: "VERIFY_PRICE",
      priority: "medium",
      title: "Verify Price",
      description: "No pricing data available — verify market prices before proceeding.",
      reason: "No pricing data available — verify market prices before proceeding.",
    });
  }

  // High volatility → monitor
  const volatilityRisk = risks.find((r) => r.riskType === "HIGH_VOLATILITY");
  if (volatilityRisk) {
    actions.push({
      actionType: "MONITOR_VOLATILITY",
      priority: volatilityRisk.severity === "high" ? "high" : "low",
      title: "Monitor Volatility",
      description: "High signal volatility detected — monitor for stabilization.",
      reason: "High signal volatility detected — monitor for stabilization.",
    });
  }

  return actions;
}

// ─── Opportunity Type Classification ─────────────────────────────────────────

function classifyOpportunityType(
  breakdown: OpportunityBreakdown,
  signalCount: number,
): string {
  const { demandMomentum, demandPersistence, acceleration } = breakdown;

  // Long persistent demand
  if (signalCount >= 15 && demandPersistence >= 60) {
    return "SUSTAINED_DEMAND";
  }

  // Strong growth
  if (demandMomentum >= 60 && acceleration >= 50) {
    return "GROWING_PRODUCT";
  }

  // High momentum but shorter history
  if (demandMomentum >= 60 && signalCount < 15) {
    return "EMERGING_PRODUCT";
  }

  // High acceleration
  if (acceleration >= 60) {
    return "MOMENTUM_OPPORTUNITY";
  }

  // Default
  return "GROWING_PRODUCT";
}

// ─── Main Evaluation Function ────────────────────────────────────────────────

export function evaluateOpportunity(candidate: OpportunityCandidate): OpportunityResult | null {
  // Filter valid signals
  const validSignals = filterValidSignals(candidate.signals);

  // Need minimum signals
  if (validSignals.length < OPPORTUNITY_CONFIG.minimumEvidenceSources) {
    return null;
  }

  // Calculate base breakdown (without derived fields)
  const baseBreakdown = {
    demandStrength: calculateDemandStrength(validSignals),
    demandMomentum: calculateDemandMomentum(validSignals),
    demandPersistence: calculatePersistence(validSignals),
    velocity: calculateVelocity(validSignals),
    acceleration: calculateAcceleration(validSignals),
    seasonality: calculateSeasonality(validSignals),
    sourceDiversity: calculateSourceDiversity(validSignals),
  };

  // Calculate overall score using balanced weights
  const rawScore =
    baseBreakdown.demandStrength * 0.35 +
    baseBreakdown.demandMomentum * 0.30 +
    baseBreakdown.demandPersistence * 0.10 +
    baseBreakdown.sourceDiversity * 0.15 +
    baseBreakdown.velocity * 0.10;

  const confidence = calculateConfidence(validSignals);

  // Raw demand score, clamped to 0-100
  const rawDemandScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Assess risks
  const risks = assessRisks(validSignals);

  // Risk adjustment metric (for breakdown — not subtracted from score)
  const totalRiskScore = risks.reduce((s, r) => s + r.score, 0);
  const riskAdjustment = Math.max(0, Math.min(100, totalRiskScore));

  // Final score applies confidence adjustment — persisted as the opportunity score
  const score = Math.max(0, Math.min(100, Math.round(rawDemandScore * (0.5 + confidence * 0.5))));

  // Build complete breakdown with derived fields
  const breakdown: OpportunityBreakdown = {
    ...baseBreakdown,
    riskAdjustment,
    confidence,
    finalScore: score,
  };

  // Classify opportunity type
  const opportunityType = classifyOpportunityType(breakdown, validSignals.length);

  // Generate actions
  const actions = generateActions(score, confidence, risks);

  // Generate title and summary
  const title = `${opportunityType.replace(/_/g, " ")} opportunity${candidate.productId ? ` for product ${candidate.productId}` : ""}`;
  const summary = `Demand score: ${score}/100, confidence: ${(confidence * 100).toFixed(0)}%, ${validSignals.length} signal(s) from ${new Set(validSignals.map((s) => s.sourceId)).size} source(s).`;

  // Build evidence from signals
  const now = new Date();
  const evidence: OpportunityEvidenceItem[] = validSignals.map((s) => ({
    evidenceType: "DEMAND_SIGNAL",
    sourceId: s.sourceId,
    demandSignalId: s.id,
    weight: s.confidence,
    contribution: s.value,
    snapshotAt: s.observedAt,
    metadata: {
      signalType: s.signalType,
      metric: s.metric,
      geography: s.geography,
      freshness: s.freshness,
      dataQuality: s.dataQuality,
      sourceReliability: s.sourceReliability,
    },
  }));

  // Compute content hash
  const signalIds = validSignals.map((s) => s.id);
  const contentHash = computeOpportunityContentHash({
    tenantId: candidate.tenantId,
    productId: candidate.productId,
    productVariantId: candidate.productVariantId,
    geographyCode: candidate.geographyCode,
    opportunityType,
    signalIds,
    algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
  });

  // Validity window: detected now, valid for 30 days
  const detectedAt = now;
  const validFrom = now;
  const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    tenantId: candidate.tenantId,
    productId: candidate.productId,
    productVariantId: candidate.productVariantId,
    geographyCode: candidate.geographyCode,
    categoryId: candidate.categoryId,
    score,
    confidence,
    opportunityType,
    algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
    contentHash,
    detectedAt,
    validFrom,
    validUntil,
    breakdown,
    risks,
    actions,
    evidence,
    signalIds,
    title,
    summary,
  };
}
