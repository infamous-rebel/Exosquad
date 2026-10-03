// =============================================================================
// Worker — Product Opportunity & Reseller Viability Processor (Phase 12)
// =============================================================================
// Processes opportunity assessment, recalculation, refresh, and expiration jobs.
// Deterministic scoring over real data from Phases 7–11 (demand signals, supply
// chain nodes, logistics legs, price observations, landed costs).
// This processor is self-contained — it does not import API-layer code.
// =============================================================================

import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { PRODUCT_OPP_CONFIG } from "@exosquad/common";

// ─── Job Data Types ──────────────────────────────────────────────────────────

interface OpportunityAssessJob {
  type: "product-opportunity:assess";
  tenantId: string;
  productId: string;
  triggeredBy: string;
}

interface OpportunityRecalculateJob {
  type: "product-opportunity:recalculate";
  tenantId: string;
  assessmentId: string;
  triggeredBy: string;
}

interface OpportunityRefreshJob {
  type: "product-opportunity:refresh";
  tenantId: string;
  triggeredBy: string;
}

interface OpportunityExpireJob {
  type: "product-opportunity:expire";
  tenantId: string;
  triggeredBy: string;
}

type OpportunityJob =
  | OpportunityAssessJob
  | OpportunityRecalculateJob
  | OpportunityRefreshJob
  | OpportunityExpireJob;

// Stale assessment threshold (days) — matches API-side expiration window.
const STALE_ASSESSMENT_DAYS = 14;

// ─── Content Hash Helpers ────────────────────────────────────────────────────

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

// ─── Deterministic Statistics ────────────────────────────────────────────────

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1] ?? 0;
  const b = sorted[mid] ?? 0;
  return (a + b) / 2;
}

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// ─── Signal / Risk Builders ──────────────────────────────────────────────────

interface PlannedSignal {
  signalType: string;
  direction: "POSITIVE" | "NEGATIVE";
  magnitude: number;
  evidence: string;
  sourceReferences: string[];
}

interface PlannedRisk {
  riskType: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  trigger: string;
  affectedDimension: string;
  evidenceReferences: string[];
}

function severityFromMagnitude(magnitude: number): "LOW" | "MODERATE" | "HIGH" | "CRITICAL" {
  if (magnitude >= 0.8) return "CRITICAL";
  if (magnitude >= 0.6) return "HIGH";
  if (magnitude >= 0.4) return "MODERATE";
  return "LOW";
}

// ─── Assessment Core ─────────────────────────────────────────────────────────

async function runAssessment(tenantId: string, productId: string): Promise<void> {
  const now = new Date();
  const competitorCutoff = new Date(
    now.getTime() - PRODUCT_OPP_CONFIG.staleCompetitorObservationThresholdDays * 24 * 60 * 60 * 1000,
  );

  // Load real data from Phases 7–11 (tenant-scoped).
  const competitorObs = await prisma.competitorObservation.findMany({
    where: { tenantId, productId, observedAt: { gte: competitorCutoff } },
    orderBy: { observedAt: "desc" },
    take: 100,
  });

  const demandSignals = await prisma.demandSignal.findMany({
    where: { tenantId, productId, status: "active" },
    orderBy: { observedAt: "desc" },
    take: 50,
  });

  const demandCalcs = await prisma.demandCalculation.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const supplyNodes = await prisma.supplyChainNode.findMany({
    where: { tenantId, nodeType: { in: ["SUPPLIER", "MANUFACTURER"] } },
    take: 50,
  });

  const logisticsLegs = await prisma.logisticsLeg.findMany({
    where: { tenantId },
    take: 50,
  });

  const priceObs = await prisma.priceObservation.findMany({
    where: { tenantId, productId },
    orderBy: { observedAt: "desc" },
    take: 50,
  });

  const landedCosts = await prisma.landedCostCalculation.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  // ─── Competition analysis (deterministic) ────────────────────────────────
  const competitorNames = new Set(
    competitorObs.map((c) => c.competitorName).filter((n): n is string => Boolean(n)),
  );
  const activeCompetitors = competitorObs.filter(
    (c) => c.availability === "IN_STOCK" || c.availability === "LIMITED",
  ).length;

  const competitorPrices = competitorObs
    .map((c) => c.sellingPrice)
    .filter((p): p is number => p !== null && p > 0)
    .sort((a, b) => a - b);
  const compMedian = median(competitorPrices);
  const compMin = competitorPrices.length > 0 ? (competitorPrices[0] ?? null) : null;
  const compMax = competitorPrices.length > 0 ? (competitorPrices[competitorPrices.length - 1] ?? null) : null;
  const compSpread =
    compMin !== null && compMax !== null && compMin > 0 ? (compMax - compMin) / compMin : null;
  const compCV = coefficientOfVariation(competitorPrices);

  const thresholds = PRODUCT_OPP_CONFIG.competitionThresholds;
  const uniqueCount = competitorNames.size > 0 ? competitorNames.size : competitorObs.length;
  let competitionLevel: string;
  if (competitorObs.length === 0) {
    competitionLevel = "UNKNOWN";
  } else if (uniqueCount <= thresholds.veryLowMaxCompetitors) {
    competitionLevel = "VERY_LOW";
  } else if (uniqueCount <= thresholds.lowMaxCompetitors) {
    competitionLevel = "LOW";
  } else if (uniqueCount <= thresholds.moderateMaxCompetitors) {
    competitionLevel = "MODERATE";
  } else if (uniqueCount <= thresholds.highMaxCompetitors) {
    competitionLevel = "HIGH";
  } else {
    competitionLevel = "VERY_HIGH";
  }

  let priceCompetitionLevel: string;
  if (compCV === null) {
    priceCompetitionLevel = "UNKNOWN";
  } else if (compCV < PRODUCT_OPP_CONFIG.priceCompressionThresholds.veryNarrowSpreadCV) {
    priceCompetitionLevel = "VERY_HIGH";
  } else if (compCV < PRODUCT_OPP_CONFIG.priceCompressionThresholds.narrowSpreadCV) {
    priceCompetitionLevel = "HIGH";
  } else if (compCV < PRODUCT_OPP_CONFIG.riskThresholds.highPriceVolatility) {
    priceCompetitionLevel = "MODERATE";
  } else {
    priceCompetitionLevel = "LOW";
  }

  // ─── Demand analysis (Phase 7 references) ────────────────────────────────
  const calcResult = (demandCalcs[0]?.result ?? {}) as Record<string, unknown>;
  const trendRaw = typeof calcResult.trend === "string" ? calcResult.trend : null;
  const growthRaw = typeof calcResult.growthRate === "number" ? calcResult.growthRate : null;

  let demandMomentum = "UNKNOWN";
  if (trendRaw) {
    const upper = trendRaw.toUpperCase();
    if (["ACCELERATING", "GROWING", "STABLE", "DECLINING", "VOLATILE"].includes(upper)) {
      demandMomentum = upper;
    } else if (upper === "RISING" || upper === "UP") {
      demandMomentum = "GROWING";
    } else if (upper === "FALLING" || upper === "DOWN") {
      demandMomentum = "DECLINING";
    } else if (upper === "FLAT") {
      demandMomentum = "STABLE";
    }
  }

  let demandLevel: string | null = null;
  if (demandSignals.length >= 20) demandLevel = "HIGH";
  else if (demandSignals.length >= 8) demandLevel = "MODERATE";
  else if (demandSignals.length > 0) demandLevel = "LOW";

  const demandConfidence =
    demandSignals.length > 0
      ? demandSignals.reduce((s, d) => s + d.confidence, 0) / demandSignals.length
      : 0;

  // ─── Supply analysis (Phase 9 references) ────────────────────────────────
  const supplierCount = supplyNodes.length > 0 ? supplyNodes.length : null;
  const supplierCountries = new Set(
    supplyNodes.map((n) => n.country).filter((c): c is string => Boolean(c)),
  );

  let supplierConcentration: string;
  if (supplierCount === null) {
    supplierConcentration = "UNKNOWN";
  } else if (supplierCount >= PRODUCT_OPP_CONFIG.supplierConcentrationThresholds.diversifiedMinSuppliers) {
    supplierConcentration = "DIVERSIFIED";
  } else if (supplierCount >= 3) {
    supplierConcentration = "MODERATELY_CONCENTRATED";
  } else if (supplierCount === 2) {
    supplierConcentration = "CONCENTRATED";
  } else {
    supplierConcentration = "HIGHLY_CONCENTRATED";
  }

  // ─── Logistics analysis (Phase 10 references) ────────────────────────────
  const routeCount = logisticsLegs.length > 0 ? logisticsLegs.length : null;
  const routeReliability =
    logisticsLegs.length > 0
      ? logisticsLegs.reduce((s, l) => s + l.confidence, 0) / logisticsLegs.length
      : null;
  const numberOfHops = logisticsLegs.length > 0 ? Math.min(10, logisticsLegs.length) : null;

  let logisticsComplexity: string | null = null;
  if (numberOfHops !== null) {
    if (numberOfHops >= PRODUCT_OPP_CONFIG.riskThresholds.highLogisticsComplexityMinHops) {
      logisticsComplexity = "HIGH";
    } else if (numberOfHops >= 2) {
      logisticsComplexity = "MODERATE";
    } else {
      logisticsComplexity = "LOW";
    }
  }

  // ─── Pricing analysis (Phase 11 references) ──────────────────────────────
  const marketPrices = priceObs
    .map((p) => p.normalizedUnitPrice ?? p.price)
    .filter((p): p is number => p !== null && p > 0)
    .sort((a, b) => a - b);
  const latestLandedCost = landedCosts[0];
  const unitLandedCost = latestLandedCost?.unitLandedCost ?? null;
  const marketPriceMin = marketPrices.length > 0 ? (marketPrices[0] ?? null) : null;
  const marketPriceMax =
    marketPrices.length > 0 ? (marketPrices[marketPrices.length - 1] ?? null) : null;
  const marketPriceMedian = median(marketPrices);
  const priceCV = coefficientOfVariation(marketPrices);

  // Gross margin — only when both landed cost and market price are known.
  let grossMargin: number | null = null;
  if (unitLandedCost !== null && unitLandedCost > 0 && marketPriceMedian !== null) {
    grossMargin = (marketPriceMedian - unitLandedCost) / marketPriceMedian;
  }

  // ─── Completeness & confidence (config-weighted, deterministic) ──────────
  const cw = PRODUCT_OPP_CONFIG.completenessWeights;
  const dataCompleteness = clamp01(
    (demandSignals.length >= PRODUCT_OPP_CONFIG.minimumDemandObservations ? cw.demandData : 0) +
      (competitorObs.length >= PRODUCT_OPP_CONFIG.minimumCompetitorObservations ? cw.competitionData : 0) +
      ((supplierCount ?? 0) >= PRODUCT_OPP_CONFIG.minimumSupplierObservations ? cw.supplyData : 0) +
      (routeCount !== null ? cw.logisticsData : 0) +
      (marketPrices.length >= PRODUCT_OPP_CONFIG.minimumPriceObservationsForStatistics ? cw.pricingData : 0) +
      (unitLandedCost !== null ? cw.costData : 0),
  );

  const cfw = PRODUCT_OPP_CONFIG.confidenceWeights;
  const overallConfidence = clamp01(
    demandConfidence * cfw.demandEvidence +
      (competitorObs.length > 0 ? 0.6 : 0) * cfw.competitionEvidence +
      (supplierCount !== null ? 0.6 : 0) * cfw.supplyEvidence +
      (routeReliability ?? 0) * cfw.logisticsEvidence +
      (marketPrices.length > 0 ? 0.6 : 0) * cfw.pricingEvidence +
      dataCompleteness * cfw.dataCompleteness,
  );

  // ─── Dimension scores (0–100) ────────────────────────────────────────────
  const demandScore =
    demandSignals.length === 0
      ? null
      : Math.min(100, Math.round((demandSignals.length / 20) * 50 + demandConfidence * 50));

  const competitionScore =
    competitorObs.length === 0
      ? null
      : Math.max(0, 100 - Math.min(100, (uniqueCount / 25) * 100));

  const supplyScore =
    supplierCount === null ? null : Math.min(100, Math.round((supplierCount / 5) * 100));

  const logisticsScore =
    routeReliability === null
      ? null
      : Math.round(routeReliability * 100) -
        (logisticsComplexity === "HIGH" ? 20 : logisticsComplexity === "MODERATE" ? 10 : 0);

  const pricingScore =
    grossMargin === null
      ? null
      : Math.max(0, Math.min(100, Math.round((grossMargin / 0.5) * 100)));

  // Opportunity score — weighted mean over KNOWN dimensions only (renormalized;
  // unknown dimensions are excluded, never treated as zero).
  const dimensionWeights: Array<[number | null, number]> = [
    [demandScore, PRODUCT_OPP_CONFIG.opportunityWeights.demand],
    [pricingScore, PRODUCT_OPP_CONFIG.opportunityWeights.margin],
    [competitionScore, PRODUCT_OPP_CONFIG.opportunityWeights.competition],
    [supplyScore, PRODUCT_OPP_CONFIG.opportunityWeights.supply],
    [logisticsScore, PRODUCT_OPP_CONFIG.opportunityWeights.logistics],
  ];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [score, weight] of dimensionWeights) {
    if (score !== null) {
      weightedSum += score * weight;
      weightTotal += weight;
    }
  }
  const opportunityScore =
    weightTotal > 0
      ? Math.max(0, Math.min(100, Math.round(weightedSum / weightTotal)))
      : 0;

  // Viability score — opportunity adjusted for margin feasibility. When margin
  // is unknown, viability equals opportunity scaled by confidence (uncertainty
  // reduces viability, never fabricates feasibility).
  const viabilityScore =
    grossMargin !== null
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              opportunityScore *
                (grossMargin <= 0 ? 0.3 : grossMargin < 0.1 ? 0.6 : grossMargin < 0.25 ? 0.85 : 1.0),
            ),
          ),
        )
      : Math.round(opportunityScore * (0.5 + overallConfidence * 0.5));

  // ─── Signal detection (threshold-driven, evidence-backed) ────────────────
  const signals: PlannedSignal[] = [];

  if (growthRaw !== null && growthRaw > PRODUCT_OPP_CONFIG.demandMomentumThresholds.acceleratingMinGrowth) {
    signals.push({
      signalType: "STRONG_DEMAND_GROWTH",
      direction: "POSITIVE",
      magnitude: round2(clamp01(growthRaw)),
      evidence: `Demand growth rate ${(growthRaw * 100).toFixed(1)}% exceeds ${PRODUCT_OPP_CONFIG.demandMomentumThresholds.acceleratingMinGrowth * 100}% threshold (from Phase 7 demand calculation)`,
      sourceReferences: demandCalcs.map((c) => c.id),
    });
  }
  if (growthRaw !== null && growthRaw < PRODUCT_OPP_CONFIG.demandMomentumThresholds.decliningMaxGrowth) {
    signals.push({
      signalType: "DEMAND_DECLINE",
      direction: "NEGATIVE",
      magnitude: round2(clamp01(Math.abs(growthRaw))),
      evidence: `Demand growth rate ${(growthRaw * 100).toFixed(1)}% is below declining threshold`,
      sourceReferences: demandCalcs.map((c) => c.id),
    });
  }
  if (demandSignals.length > 0 && demandSignals.length < PRODUCT_OPP_CONFIG.minimumDemandObservations) {
    signals.push({
      signalType: "WEAK_DEMAND",
      direction: "NEGATIVE",
      magnitude: round2(clamp01(1 - demandSignals.length / PRODUCT_OPP_CONFIG.minimumDemandObservations)),
      evidence: `Only ${demandSignals.length} active demand signals (minimum ${PRODUCT_OPP_CONFIG.minimumDemandObservations} required for reliable analysis)`,
      sourceReferences: demandSignals.slice(0, 5).map((d) => d.id),
    });
  }
  if (competitorObs.length > 0 && uniqueCount <= PRODUCT_OPP_CONFIG.competitionThresholds.veryLowMaxCompetitors) {
    signals.push({
      signalType: "LOW_COMPETITOR_DENSITY",
      direction: "POSITIVE",
      magnitude: 0.7,
      evidence: `${uniqueCount} unique competitors observed across ${competitorObs.length} observations`,
      sourceReferences: competitorObs.slice(0, 5).map((c) => c.id),
    });
  }
  if (uniqueCount >= PRODUCT_OPP_CONFIG.riskThresholds.highCompetitionMinCompetitors) {
    signals.push({
      signalType: "HIGH_COMPETITION",
      direction: "NEGATIVE",
      magnitude: round2(clamp01(uniqueCount / 30)),
      evidence: `${uniqueCount} unique competitors observed (threshold ${PRODUCT_OPP_CONFIG.riskThresholds.highCompetitionMinCompetitors})`,
      sourceReferences: competitorObs.slice(0, 5).map((c) => c.id),
    });
  }
  if (compCV !== null && competitorPrices.length >= PRODUCT_OPP_CONFIG.priceCompressionThresholds.minimumObservations && compCV < PRODUCT_OPP_CONFIG.priceCompressionThresholds.narrowSpreadCV) {
    signals.push({
      signalType: "PRICE_COMPRESSION",
      direction: "NEGATIVE",
      magnitude: round2(clamp01(1 - compCV / PRODUCT_OPP_CONFIG.priceCompressionThresholds.narrowSpreadCV)),
      evidence: `Competitor price CV ${(compCV * 100).toFixed(1)}% below ${(PRODUCT_OPP_CONFIG.priceCompressionThresholds.narrowSpreadCV * 100).toFixed(0)}% compression threshold across ${competitorPrices.length} prices`,
      sourceReferences: competitorObs.slice(0, 5).map((c) => c.id),
    });
  }
  if (compCV !== null && compCV > PRODUCT_OPP_CONFIG.riskThresholds.highPriceVolatility) {
    signals.push({
      signalType: "WIDE_PRICE_SPREAD",
      direction: "POSITIVE",
      magnitude: round2(clamp01(compCV)),
      evidence: `Competitor price CV ${(compCV * 100).toFixed(1)}% indicates wide pricing spread`,
      sourceReferences: competitorObs.slice(0, 5).map((c) => c.id),
    });
  }
  if (supplierCount !== null && supplierCount >= PRODUCT_OPP_CONFIG.supplierConcentrationThresholds.diversifiedMinSuppliers) {
    signals.push({
      signalType: "MULTIPLE_SUPPLIER_OPTIONS",
      direction: "POSITIVE",
      magnitude: round2(clamp01(supplierCount / 10)),
      evidence: `${supplierCount} supplier/manufacturer nodes across ${supplierCountries.size} countries`,
      sourceReferences: supplyNodes.slice(0, 5).map((n) => n.id),
    });
  }
  if (supplierCount === 1) {
    signals.push({
      signalType: "HIGH_SUPPLIER_CONCENTRATION",
      direction: "NEGATIVE",
      magnitude: 0.8,
      evidence: "Only 1 supplier/manufacturer node identified in supply chain graph",
      sourceReferences: supplyNodes.slice(0, 5).map((n) => n.id),
    });
  }
  if (numberOfHops !== null && numberOfHops >= PRODUCT_OPP_CONFIG.riskThresholds.highLogisticsComplexityMinHops) {
    signals.push({
      signalType: "HIGH_LOGISTICS_COMPLEXITY",
      direction: "NEGATIVE",
      magnitude: round2(clamp01(numberOfHops / 10)),
      evidence: `${numberOfHops} logistics legs detected (threshold ${PRODUCT_OPP_CONFIG.riskThresholds.highLogisticsComplexityMinHops})`,
      sourceReferences: logisticsLegs.slice(0, 5).map((l) => l.id),
    });
  }
  if (grossMargin !== null && grossMargin < PRODUCT_OPP_CONFIG.riskThresholds.lowMarginThreshold) {
    signals.push({
      signalType: "LOW_MARGIN",
      direction: "NEGATIVE",
      magnitude: round2(clamp01(1 - grossMargin / PRODUCT_OPP_CONFIG.riskThresholds.lowMarginThreshold)),
      evidence: `Gross margin ${(grossMargin * 100).toFixed(1)}% below ${(PRODUCT_OPP_CONFIG.riskThresholds.lowMarginThreshold * 100).toFixed(0)}% threshold (landed cost vs median market price)`,
      sourceReferences: latestLandedCost ? [latestLandedCost.id] : [],
    });
  }
  if (unitLandedCost !== null && marketPriceMedian !== null && unitLandedCost > marketPriceMedian) {
    signals.push({
      signalType: "HIGH_LANDED_COST",
      direction: "NEGATIVE",
      magnitude: round2(clamp01((unitLandedCost - marketPriceMedian) / marketPriceMedian)),
      evidence: `Unit landed cost ${unitLandedCost.toFixed(2)} exceeds median market price ${marketPriceMedian.toFixed(2)}`,
      sourceReferences: latestLandedCost ? [latestLandedCost.id] : [],
    });
  }
  if (dataCompleteness < PRODUCT_OPP_CONFIG.riskThresholds.insufficientDataCompleteness) {
    signals.push({
      signalType: "LOW_DATA_COMPLETENESS",
      direction: "NEGATIVE",
      magnitude: round2(clamp01(1 - dataCompleteness / PRODUCT_OPP_CONFIG.riskThresholds.insufficientDataCompleteness)),
      evidence: `Data completeness ${(dataCompleteness * 100).toFixed(0)}% below ${(PRODUCT_OPP_CONFIG.riskThresholds.insufficientDataCompleteness * 100).toFixed(0)}% threshold`,
      sourceReferences: [],
    });
  }
  if (priceCV !== null && priceCV > PRODUCT_OPP_CONFIG.riskThresholds.highPriceVolatility && marketPrices.length >= PRODUCT_OPP_CONFIG.minimumPriceObservationsForStatistics) {
    signals.push({
      signalType: "HIGH_PRICE_VOLATILITY",
      direction: "NEGATIVE",
      magnitude: round2(clamp01(priceCV)),
      evidence: `Market price CV ${(priceCV * 100).toFixed(1)}% exceeds ${(PRODUCT_OPP_CONFIG.riskThresholds.highPriceVolatility * 100).toFixed(0)}% volatility threshold`,
      sourceReferences: priceObs.slice(0, 5).map((p) => p.id),
    });
  }

  // ─── Risk derivation from negative signals ───────────────────────────────
  const riskMapping: Record<string, { riskType: string; affectedDimension: string }> = {
    WEAK_DEMAND: { riskType: "WEAK_DEMAND", affectedDimension: "DEMAND" },
    DEMAND_DECLINE: { riskType: "DEMAND_DECLINE", affectedDimension: "DEMAND" },
    HIGH_COMPETITION: { riskType: "HIGH_COMPETITION", affectedDimension: "COMPETITION" },
    PRICE_COMPRESSION: { riskType: "PRICE_COMPRESSION", affectedDimension: "COMPETITION" },
    HIGH_SUPPLIER_CONCENTRATION: { riskType: "SUPPLIER_CONCENTRATION", affectedDimension: "SUPPLY" },
    HIGH_LOGISTICS_COMPLEXITY: { riskType: "LOGISTICS_COMPLEXITY", affectedDimension: "LOGISTICS" },
    LOW_MARGIN: { riskType: "LOW_MARGIN", affectedDimension: "PRICING" },
    HIGH_LANDED_COST: { riskType: "HIGH_LANDED_COST", affectedDimension: "PRICING" },
    HIGH_PRICE_VOLATILITY: { riskType: "HIGH_PRICE_VOLATILITY", affectedDimension: "PRICING" },
    LOW_DATA_COMPLETENESS: { riskType: "INSUFFICIENT_DATA", affectedDimension: "DATA" },
  };

  const risks: PlannedRisk[] = [];
  for (const signal of signals) {
    if (signal.direction !== "NEGATIVE") continue;
    const mapping = riskMapping[signal.signalType];
    if (!mapping) continue;
    risks.push({
      riskType: mapping.riskType,
      severity: severityFromMagnitude(signal.magnitude),
      trigger: signal.evidence,
      affectedDimension: mapping.affectedDimension,
      evidenceReferences: signal.sourceReferences,
    });
  }

  // ─── Commercial / operational risk classification ────────────────────────
  const commercialRisk =
    grossMargin === null
      ? "UNKNOWN"
      : grossMargin < 0.05
        ? "HIGH"
        : grossMargin < 0.15
          ? "MODERATE"
          : "LOW";
  const operationalRisk =
    logisticsComplexity === "HIGH" || supplierConcentration === "HIGHLY_CONCENTRATED"
      ? "HIGH"
      : logisticsComplexity === "MODERATE" || supplierConcentration === "CONCENTRATED"
        ? "MODERATE"
        : logisticsComplexity === null
          ? "UNKNOWN"
          : "LOW";

  let dataCompletenessBand: string;
  if (dataCompleteness >= 0.8) dataCompletenessBand = "HIGH";
  else if (dataCompleteness >= 0.6) dataCompletenessBand = "MODERATE";
  else if (dataCompleteness >= 0.4) dataCompletenessBand = "LOW";
  else if (dataCompleteness > 0) dataCompletenessBand = "VERY_LOW";
  else dataCompletenessBand = "UNKNOWN";

  // ─── Content hashes (no timestamp contamination) ─────────────────────────
  const competitorSnapshotHash = sha256(
    stableStringify({
      productId,
      observationIds: competitorObs.map((c) => c.id).sort(),
      uniqueCount,
      activeCompetitors,
      algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
    }),
  );
  const demandSnapshotHash = sha256(
    stableStringify({
      productId,
      demandLevel,
      demandMomentum,
      searchGrowth: growthRaw,
      signalIds: demandSignals.map((d) => d.id).sort(),
      algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
    }),
  );
  const inputHash = sha256(
    stableStringify({
      productId,
      competitorObservationIds: competitorObs.map((c) => c.id).sort(),
      demandSignalIds: demandSignals.map((d) => d.id).sort(),
      supplierNodeIds: supplyNodes.map((n) => n.id).sort(),
      logisticsLegIds: logisticsLegs.map((l) => l.id).sort(),
      priceObservationIds: priceObs.map((p) => p.id).sort(),
      landedCostIds: landedCosts.map((c) => c.id).sort(),
      algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
    }),
  );
  const contentHash = sha256(
    stableStringify({
      inputHash,
      opportunityScore,
      viabilityScore,
      competitionLevel,
      demandLevel,
      signals: signals.map((s) => [s.signalType, s.direction, s.magnitude]),
      risks: risks.map((r) => [r.riskType, r.severity]),
      algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
    }),
  );

  // ─── Persist snapshots (deduplicated by contentHash) ─────────────────────
  let competitorSnapshotId: string | null = null;
  if (competitorObs.length > 0) {
    const existing = await prisma.competitorSnapshot.findFirst({
      where: { tenantId, productId, contentHash: competitorSnapshotHash },
      select: { id: true },
    });
    if (existing) {
      competitorSnapshotId = existing.id;
    } else {
      const created = await prisma.competitorSnapshot.create({
        data: {
          tenantId,
          productId,
          observationCount: competitorObs.length,
          uniqueCompetitorCount: uniqueCount,
          activeCompetitorCount: activeCompetitors,
          minPrice: compMin,
          maxPrice: compMax,
          medianPrice: compMedian,
          priceSpread: compSpread !== null ? round4(compSpread) : null,
          competitionLevel: competitionLevel as never,
          priceCompetitionLevel: priceCompetitionLevel as never,
          snapshotDate: now,
          confidence: overallConfidence,
          completeness: dataCompleteness,
          contentHash: competitorSnapshotHash,
        },
      });
      competitorSnapshotId = created.id;
    }
  }

  let demandSnapshotId: string | null = null;
  if (demandSignals.length > 0) {
    const existing = await prisma.demandOpportunitySnapshot.findFirst({
      where: { tenantId, productId, contentHash: demandSnapshotHash },
      select: { id: true },
    });
    if (existing) {
      demandSnapshotId = existing.id;
    } else {
      const created = await prisma.demandOpportunitySnapshot.create({
        data: {
          tenantId,
          productId,
          demandLevel,
          demandMomentum: demandMomentum as never,
          searchGrowth: growthRaw,
          observationCount: demandSignals.length,
          confidence: demandConfidence,
          completeness: demandSignals.length >= PRODUCT_OPP_CONFIG.minimumDemandObservations ? 1 : demandSignals.length / PRODUCT_OPP_CONFIG.minimumDemandObservations,
          snapshotDate: now,
          contentHash: demandSnapshotHash,
        },
      });
      demandSnapshotId = created.id;
    }
  }

  // ─── Persist signals & risks (deduplicated by contentHash) ───────────────
  const signalIds: string[] = [];
  for (const signal of signals) {
    const signalHash = sha256(
      stableStringify({
        productId,
        signalType: signal.signalType,
        direction: signal.direction,
        magnitude: signal.magnitude,
        evidence: signal.evidence,
        algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
      }),
    );
    const existing = await prisma.productOppSignal.findFirst({
      where: { tenantId, productId, signalType: signal.signalType as never, contentHash: signalHash },
      select: { id: true },
    });
    if (existing) {
      signalIds.push(existing.id);
    } else {
      const created = await prisma.productOppSignal.create({
        data: {
          tenantId,
          productId,
          signalType: signal.signalType as never,
          direction: signal.direction,
          magnitude: signal.magnitude,
          evidence: signal.evidence,
          sourceReferences: signal.sourceReferences,
          detectedAt: now,
          contentHash: signalHash,
        },
      });
      signalIds.push(created.id);
    }
  }

  const riskIds: string[] = [];
  for (const risk of risks) {
    const riskHash = sha256(
      stableStringify({
        productId,
        riskType: risk.riskType,
        severity: risk.severity,
        trigger: risk.trigger,
        algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
      }),
    );
    const existing = await prisma.productOppRisk.findFirst({
      where: { tenantId, productId, riskType: risk.riskType as never, contentHash: riskHash },
      select: { id: true },
    });
    if (existing) {
      riskIds.push(existing.id);
    } else {
      const created = await prisma.productOppRisk.create({
        data: {
          tenantId,
          productId,
          riskType: risk.riskType as never,
          severity: risk.severity,
          trigger: risk.trigger,
          affectedDimension: risk.affectedDimension,
          evidenceReferences: risk.evidenceReferences,
          detectedAt: now,
          contentHash: riskHash,
        },
      });
      riskIds.push(created.id);
    }
  }

  // ─── Persist assessment (new immutable version) ──────────────────────────
  const latestAssessment = await prisma.resellerViabilityAssessment.findFirst({
    where: { tenantId, productId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestAssessment?.version ?? 0) + 1;

  await prisma.resellerViabilityAssessment.create({
    data: {
      tenantId,
      productId,
      demandLevel,
      demandMomentum: demandMomentum as never,
      demandConfidence,
      competitionLevel: competitionLevel as never,
      uniqueCompetitors: competitorObs.length > 0 ? uniqueCount : null,
      activeListings: competitorObs.length > 0 ? activeCompetitors : null,
      competitionConfidence: competitorObs.length > 0 ? 0.6 : 0,
      supplierCount,
      supplierDiversity:
        supplierCount === null
          ? null
          : supplierCount >= 5
            ? "HIGH"
            : supplierCount >= 3
              ? "MODERATE"
              : "LOW",
      supplierConcentration: supplierConcentration as never,
      supplyConfidence: supplierCount !== null ? 0.6 : 0,
      routeCount,
      logisticsComplexity,
      logisticsConfidence: routeReliability ?? 0,
      unitLandedCost,
      marketPriceMin,
      marketPriceMax,
      marketPriceMedian,
      grossMarginMin: grossMargin,
      grossMarginMax: grossMargin,
      pricingConfidence: marketPrices.length > 0 ? 0.6 : 0,
      marketSaturation:
        competitorObs.length === 0
          ? "UNKNOWN"
          : uniqueCount > PRODUCT_OPP_CONFIG.saturationThresholds.highMaxCompetitorDensity
            ? "VERY_HIGH"
            : uniqueCount > PRODUCT_OPP_CONFIG.saturationThresholds.moderateMaxCompetitorDensity
              ? "HIGH"
              : uniqueCount > PRODUCT_OPP_CONFIG.saturationThresholds.lowMaxCompetitorDensity
                ? "MODERATE"
                : "LOW",
      priceCompression:
        compCV !== null &&
        competitorPrices.length >= PRODUCT_OPP_CONFIG.priceCompressionThresholds.minimumObservations &&
        compCV < PRODUCT_OPP_CONFIG.priceCompressionThresholds.narrowSpreadCV,
      opportunityScore,
      viabilityScore,
      dataCompleteness: dataCompletenessBand as never,
      commercialRisk,
      operationalRisk,
      status: "DETECTED",
      algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
      inputHash,
      contentHash,
      signalIds,
      riskIds,
      competitorSnapshotId,
      demandSnapshotId,
      version: nextVersion,
      calculatedAt: now,
    },
  });

  logger.info(
    {
      tenantId,
      productId,
      version: nextVersion,
      opportunityScore,
      viabilityScore,
      signals: signalIds.length,
      risks: riskIds.length,
    },
    "product_opportunity_assess_completed",
  );
}

// ─── Job Handlers ────────────────────────────────────────────────────────────

async function handleAssess(job: OpportunityAssessJob): Promise<void> {
  const { tenantId, productId } = job;
  logger.info({ tenantId, productId }, "product_opportunity_assess_started");
  await runAssessment(tenantId, productId);
}

async function handleRecalculate(job: OpportunityRecalculateJob): Promise<void> {
  const { tenantId, assessmentId } = job;
  const assessment = await prisma.resellerViabilityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) {
    logger.warn({ tenantId, assessmentId }, "product_opportunity_recalculate_not_found");
    return;
  }

  await runAssessment(tenantId, assessment.productId);
}

async function handleRefresh(job: OpportunityRefreshJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "product_opportunity_refresh_started");

  const staleThreshold = new Date(Date.now() - STALE_ASSESSMENT_DAYS * 24 * 60 * 60 * 1000);

  // Find products whose latest assessment is stale, then re-assess each.
  const staleAssessments = await prisma.resellerViabilityAssessment.findMany({
    where: {
      tenantId,
      status: { not: "EXPIRED" },
      calculatedAt: { lt: staleThreshold },
    },
    orderBy: { calculatedAt: "asc" },
    select: { productId: true },
    distinct: ["productId"],
    take: 50,
  });

  for (const assessment of staleAssessments) {
    try {
      await runAssessment(tenantId, assessment.productId);
    } catch (err) {
      // One failed product must never collapse the refresh batch.
      logger.error(
        { tenantId, productId: assessment.productId, err },
        "product_opportunity_refresh_product_failed",
      );
    }
  }

  logger.info(
    { tenantId, refreshed: staleAssessments.length },
    "product_opportunity_refresh_completed",
  );
}

async function handleExpire(job: OpportunityExpireJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "product_opportunity_expire_started");

  const staleThreshold = new Date(Date.now() - STALE_ASSESSMENT_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.resellerViabilityAssessment.updateMany({
    where: {
      tenantId,
      status: { not: "EXPIRED" },
      calculatedAt: { lt: staleThreshold },
    },
    data: { status: "EXPIRED" },
  });

  logger.info({ tenantId, expired: result.count }, "product_opportunity_expire_completed");
}

// ─── Main Processor Entry Point ──────────────────────────────────────────────

export async function processProductOpportunityJob(job: Job): Promise<void> {
  const data = job.data as OpportunityJob;
  const startTime = Date.now();

  logger.info(
    { type: data.type, tenantId: data.tenantId, jobId: job.id },
    "product_opportunity_job_started",
  );

  try {
    switch (data.type) {
      case "product-opportunity:assess":
        await handleAssess(data);
        break;
      case "product-opportunity:recalculate":
        await handleRecalculate(data);
        break;
      case "product-opportunity:refresh":
        await handleRefresh(data);
        break;
      case "product-opportunity:expire":
        await handleExpire(data);
        break;
      default:
        logger.warn(
          { type: (data as { type: string }).type, jobId: job.id },
          "Unknown product opportunity job type",
        );
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      { type: data.type, tenantId: data.tenantId, jobId: job.id, elapsedMs: elapsed },
      "product_opportunity_job_completed",
    );
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error(
      { type: data.type, tenantId: data.tenantId, jobId: job.id, elapsedMs: elapsed, err },
      "product_opportunity_job_failed",
    );
    throw err;
  }
}
