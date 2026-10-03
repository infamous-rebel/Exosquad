// =============================================================================
// API — Decision Intelligence Orchestrator (Phase 8)
// =============================================================================
// Coordinates opportunity detection: loads demand signals, runs the
// opportunity engine, persists results (opportunities, calculations,
// evidence, risks, actions), and returns a summary.
//
// The orchestrator calls shared services — it does not contain calculation
// logic itself. All calculation logic is in opportunity-engine.ts.
// =============================================================================

import { prisma, type Prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { OPPORTUNITY_CONFIG } from "@exosquad/common";
import {
  evaluateOpportunity,
  type OpportunityCandidate,
  type OpportunityResult,
  type DemandSignalSummary,
} from "./opportunity-engine.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DetectionSummary {
  tenantId: string;
  candidatesEvaluated: number;
  opportunitiesCreated: number;
  opportunitiesDeduplicated: number;
  opportunities: Array<{
    id: string;
    opportunityType: string;
    score: number;
    confidence: number;
    title: string;
    status: string;
  }>;
  duration: number;
  algorithmVersion: string;
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

/**
 * Run opportunity detection for a tenant.
 * 1. Load demand signals
 * 2. Group by product/variant/geography
 * 3. Evaluate each candidate
 * 4. Persist opportunities, calculations, evidence, risks, actions
 * 5. Return summary
 */
export async function runOpportunityDetection(params: {
  tenantId: string;
  windowDays?: number;
  geography?: string;
}): Promise<DetectionSummary> {
  const startTime = Date.now();
  const { tenantId, windowDays = 30 } = params;

  logger.info({ tenantId, windowDays }, "opportunity_detection_started");

  // 1. Load all active demand signals for this tenant within the window
  const now = new Date();
  const startDate = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const signals = await prisma.demandSignal.findMany({
    where: {
      tenantId,
      status: "active",
      observedAt: { gte: startDate, lte: now },
    },
    orderBy: { observedAt: "asc" },
  });

  if (signals.length === 0) {
    logger.info({ tenantId }, "opportunity_detection_no_signals");
    return {
      tenantId,
      candidatesEvaluated: 0,
      opportunitiesCreated: 0,
      opportunitiesDeduplicated: 0,
      opportunities: [],
      duration: Date.now() - startTime,
      algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
    };
  }

  // 2. Group signals by product + geography
  const candidates = groupSignalsIntoCandidates(signals, tenantId);

  // 3. Evaluate each candidate
  let created = 0;
  let deduplicated = 0;
  const results: DetectionSummary["opportunities"] = [];

  for (const candidate of candidates) {
    const result = evaluateOpportunity(candidate);
    if (!result) continue;

    // 4. Persist with deduplication
    const persisted = await persistOpportunity(result);
    if (persisted.created) {
      created++;
      results.push({
        id: persisted.id,
        opportunityType: result.opportunityType,
        score: result.score,
        confidence: result.confidence,
        title: result.title,
        status: determineStatus(result.score),
      });
    } else {
      deduplicated++;
    }
  }

  const duration = Date.now() - startTime;

  logger.info(
    {
      tenantId,
      candidatesEvaluated: candidates.length,
      opportunitiesCreated: created,
      opportunitiesDeduplicated: deduplicated,
      duration,
      algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
    },
    "opportunity_detection_completed"
  );

  return {
    tenantId,
    candidatesEvaluated: candidates.length,
    opportunitiesCreated: created,
    opportunitiesDeduplicated: deduplicated,
    opportunities: results,
    duration,
    algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
  };
}

// ─── Signal Grouping ─────────────────────────────────────────────────────────

function groupSignalsIntoCandidates(
  signals: Array<{
    id: string;
    tenantId: string;
    productId: string | null;
    productVariantId: string | null;
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
  }>,
  tenantId: string
): OpportunityCandidate[] {
  // Group by productId + geography (or just geography for signals without product)
  const groups = new Map<string, DemandSignalSummary[]>();

  for (const s of signals) {
    const key = `${s.productId ?? "no-product"}:${s.geography ?? "global"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      id: s.id,
      sourceId: s.sourceId,
      signalType: s.signalType,
      metric: s.metric,
      value: s.value,
      observedAt: s.observedAt,
      geography: s.geography,
      confidence: s.confidence,
      freshness: s.freshness,
      dataQuality: s.dataQuality,
      sourceReliability: s.sourceReliability,
      isOutlier: s.isOutlier,
    });
  }

  const candidates: OpportunityCandidate[] = [];
  for (const [key, groupSignals] of groups) {
    const [productId, geography] = key.split(":");
    candidates.push({
      tenantId,
      productId: productId === "no-product" ? null : productId!,
      productVariantId: null,
      geographyCode: geography === "global" ? null : geography!,
      categoryId: null,
      signals: groupSignals,
    });
  }

  return candidates;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

async function persistOpportunity(result: OpportunityResult): Promise<{
  id: string;
  created: boolean;
}> {
  // Check for duplicate via content hash
  const existing = await prisma.opportunity.findUnique({
    where: {
      tenantId_contentHash: {
        tenantId: result.tenantId,
        contentHash: result.contentHash,
      },
    },
  });

  if (existing) {
    logger.debug(
      { opportunityId: existing.id, tenantId: result.tenantId },
      "opportunity_deduplicated"
    );
    return { id: existing.id, created: false };
  }

  // Determine initial status
  const status = determineStatus(result.score);

  // Use a transaction to ensure atomicity
  const opportunity = await prisma.$transaction(async (tx) => {
    // Create the opportunity
    const opp = await tx.opportunity.create({
      data: {
        tenantId: result.tenantId,
        productId: result.productId,
        productVariantId: result.productVariantId,
        geographyCode: result.geographyCode,
        categoryId: result.categoryId,
        opportunityType: result.opportunityType,
        status,
        score: result.score,
        confidence: result.confidence,
        title: result.title,
        summary: result.summary,
        detectedAt: result.detectedAt,
        validFrom: result.validFrom,
        validUntil: result.validUntil,
        algorithmVersion: result.algorithmVersion,
        contentHash: result.contentHash,
        demandScore: result.breakdown.demandStrength,
        growthScore: result.breakdown.demandMomentum,
        velocityScore: result.breakdown.demandMomentum,
        persistenceScore: result.breakdown.demandPersistence,
        accelerationScore: result.breakdown.acceleration,
        seasonalityScore: result.breakdown.seasonality,
        sourceDiversityScore: result.breakdown.sourceDiversity,
        riskScore: result.breakdown.riskAdjustment,
      },
    });

    // Create calculation snapshot
    await tx.opportunityCalculation.create({
      data: {
        opportunityId: opp.id,
        algorithmVersion: result.algorithmVersion,
        demandScore: result.breakdown.demandStrength,
        growthScore: result.breakdown.demandMomentum,
        velocityScore: result.breakdown.demandMomentum,
        persistenceScore: result.breakdown.demandPersistence,
        accelerationScore: result.breakdown.acceleration,
        seasonalityScore: result.breakdown.seasonality,
        sourceDiversityScore: result.breakdown.sourceDiversity,
        confidenceScore: result.breakdown.confidence,
        competitionScore: null, // Not available — Phase 8 does not fabricate
        commercialScore: null,  // Not available — Phase 8 does not fabricate
        sourcingScore: null,    // Not available — Phase 8 does not fabricate
        riskScore: result.breakdown.riskAdjustment,
        finalScore: result.breakdown.finalScore,
        inputHash: result.contentHash,
        inputSignalIds: result.signalIds,
      },
    });

    // Create evidence records
    if (result.evidence.length > 0) {
      await tx.opportunityEvidence.createMany({
        data: result.evidence.map((e) => ({
          opportunityId: opp.id,
          evidenceType: e.evidenceType,
          sourceId: e.sourceId,
          demandSignalId: e.demandSignalId,
          weight: e.weight,
          contribution: e.contribution,
          snapshotAt: e.snapshotAt,
          metadata: e.metadata as Prisma.InputJsonValue | undefined,
        })),
      });
    }

    // Create risk records
    if (result.risks.length > 0) {
      await tx.opportunityRisk.createMany({
        data: result.risks.map((r) => ({
          opportunityId: opp.id,
          riskType: r.riskType,
          severity: r.severity,
          score: r.score,
          description: r.description,
          evidence: r.evidence as Prisma.InputJsonValue | undefined,
        })),
      });
    }

    // Create action records
    if (result.actions.length > 0) {
      await tx.opportunityAction.createMany({
        data: result.actions.map((a) => ({
          opportunityId: opp.id,
          actionType: a.actionType,
          priority: a.priority,
          title: a.title,
          description: a.description,
          reason: a.reason,
        })),
      });
    }

    return opp;
  });

  logger.info(
    {
      opportunityId: opportunity.id,
      tenantId: result.tenantId,
      score: result.score,
      confidence: result.confidence,
      type: result.opportunityType,
      evidenceCount: result.evidence.length,
      riskCount: result.risks.length,
      actionCount: result.actions.length,
    },
    "opportunity_created"
  );

  return { id: opportunity.id, created: true };
}

// ─── Status Determination ────────────────────────────────────────────────────

function determineStatus(score: number): "DETECTED" | "WATCH" | "ACTIONABLE" {
  if (score >= OPPORTUNITY_CONFIG.actionableScore) return "ACTIONABLE";
  if (score >= OPPORTUNITY_CONFIG.watchScore) return "WATCH";
  return "DETECTED";
}

// ─── Expiration ──────────────────────────────────────────────────────────────

/**
 * Expire opportunities whose evidence is stale or validity period has passed.
 * Does NOT delete — just transitions status to EXPIRED.
 */
export async function expireStaleOpportunities(params: {
  tenantId: string;
}): Promise<{ expired: number }> {
  const now = new Date();

  const result = await prisma.opportunity.updateMany({
    where: {
      tenantId: params.tenantId,
      status: { not: "EXPIRED" },
      OR: [
        { validUntil: { not: null, lt: now } },
      ],
    },
    data: { status: "EXPIRED" },
  });

  if (result.count > 0) {
    logger.info(
      { tenantId: params.tenantId, expired: result.count },
      "opportunities_expired"
    );
  }

  return { expired: result.count };
}
