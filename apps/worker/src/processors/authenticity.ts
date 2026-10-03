// =============================================================================
// Worker — Authenticity Intelligence Processor (Phase 8 — Original Roadmap)
// =============================================================================
// Processes authenticity detection, recalculation, refresh, and expiration jobs.
// This processor is self-contained — it does not import API-layer code.
// Follows the same patterns as the opportunity processor.
// =============================================================================

import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { AUTHENTICITY_CONFIG } from "@exosquad/common";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvidenceRow {
  id: string;
  sourceId: string | null;
  evidenceType: string;
  entityType: string;
  entityId: string;
  confidence: number;
  status: string;
  freshness: string;
  contentHash: string | null;
  extractedValue: Record<string, unknown> | null;
  normalizedValue: Record<string, unknown> | null;
  observedAt: Date;
}

interface SignalRecord {
  signalType: string;
  direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "UNKNOWN";
  score: number;
  weight: number;
  confidence: number;
  subjectType: string | null;
  subjectId: string | null;
  evidenceId: string | null;
  metadata: Record<string, unknown>;
}

interface ConflictRow {
  id: string;
  conflictType: string;
  description: string;
  status: string;
  supportingEvidenceId: string;
  contradictingEvidenceId: string;
}

// ─── Job Data Types ──────────────────────────────────────────────────────────

interface AuthenticityDetectJob {
  type: "authenticity:detect";
  tenantId: string;
  subjectType?: string;
  subjectId?: string;
  triggeredBy: string;
}

interface AuthenticityRecalculateJob {
  type: "authenticity:recalculate";
  tenantId: string;
  assessmentId: string;
  triggeredBy: string;
}

interface AuthenticityRefreshJob {
  type: "authenticity:refresh";
  tenantId: string;
  subjectType: string;
  subjectId: string;
  triggeredBy: string;
}

interface AuthenticityExpireJob {
  type: "authenticity:expire";
  tenantId: string;
  triggeredBy: string;
}

type AuthenticityJob =
  | AuthenticityDetectJob
  | AuthenticityRecalculateJob
  | AuthenticityRefreshJob
  | AuthenticityExpireJob;

// ─── Pure Calculation (Worker-safe) ──────────────────────────────────────────

function computeInputHash(
  tenantId: string,
  subjectType: string,
  subjectId: string,
  evidence: EvidenceRow[],
  conflicts: ConflictRow[]
): string {
  const canonical = JSON.stringify({
    tenantId,
    subjectType,
    subjectId,
    evidenceIds: evidence.map((e) => e.id).sort(),
    evidenceVersions: evidence.map((e) => `${e.id}:${e.contentHash ?? "null"}`).sort(),
    conflictIds: conflicts.map((c) => c.id).sort(),
    algorithmVersion: AUTHENTICITY_CONFIG.algorithmVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function generateSignals(
  _subjectType: string,
  subjectId: string,
  evidence: EvidenceRow[],
  conflicts: ConflictRow[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  // Product identity signals
  const identityEvidence = evidence.filter(
    (e) =>
      e.evidenceType === "PRODUCT_IDENTITY" ||
      e.evidenceType === "PRODUCT_NAME" ||
      e.evidenceType === "PRODUCT_VARIANT" ||
      e.evidenceType === "PRODUCT_IDENTIFIER"
  );

  if (identityEvidence.length > 0) {
    const sources = new Set(identityEvidence.map((e) => e.sourceId!));
    const hashes = new Set(identityEvidence.map((e) => e.contentHash).filter(Boolean));

    if (sources.size > 1 && hashes.size <= 1) {
      signals.push({
        signalType: "PRODUCT_IDENTITY_MATCH",
        direction: "POSITIVE",
        score: 0.8,
        weight: 1.0,
        confidence: 0.8,
        subjectType: "product",
        subjectId,
        evidenceId: identityEvidence[0]!.id,
        metadata: { sourceCount: sources.size, matchType: "cross_source_agreement" },
      });
    } else if (hashes.size > 1) {
      signals.push({
        signalType: "PRODUCT_IDENTITY_MATCH",
        direction: "NEGATIVE",
        score: 0.5,
        weight: 1.5,
        confidence: 0.7,
        subjectType: "product",
        subjectId,
        evidenceId: identityEvidence[0]!.id,
        metadata: { distinctValues: hashes.size, conflict: true },
      });
    } else {
      signals.push({
        signalType: "PRODUCT_IDENTITY_MATCH",
        direction: "POSITIVE",
        score: 0.6,
        weight: 1.0,
        confidence: 0.6,
        subjectType: "product",
        subjectId,
        evidenceId: identityEvidence[0]!.id,
        metadata: { evidenceCount: identityEvidence.length },
      });
    }
  }

  // Brand signals
  const brandEvidence = evidence.filter(
    (e) => e.evidenceType === "BRAND_IDENTITY" || e.evidenceType === "MANUFACTURER_RELATIONSHIP"
  );
  if (brandEvidence.length > 0) {
    signals.push({
      signalType: "BRAND_MATCH",
      direction: "POSITIVE",
      score: Math.min(1.0, 0.5 + brandEvidence.length * 0.1),
      weight: 1.5,
      confidence: 0.7,
      subjectType: "brand",
      subjectId: null,
      evidenceId: brandEvidence[0]!.id,
      metadata: { count: brandEvidence.length },
    });
  }

  // Seller signals
  const sellerEvidence = evidence.filter(
    (e) => e.evidenceType === "SELLER_IDENTITY" || e.evidenceType === "SELLER_LISTING"
  );
  if (sellerEvidence.length > 0) {
    signals.push({
      signalType: "SELLER_IDENTITY_MATCH",
      direction: "POSITIVE",
      score: Math.min(1.0, 0.5 + sellerEvidence.length * 0.1),
      weight: 1.0,
      confidence: 0.6,
      subjectType: "seller",
      subjectId: null,
      evidenceId: sellerEvidence[0]!.id,
      metadata: { count: sellerEvidence.length },
    });
  }

  // Supplier signals
  const supplierEvidence = evidence.filter(
    (e) => e.evidenceType === "SUPPLIER_IDENTITY" || e.evidenceType === "SUPPLIER_OFFER"
  );
  if (supplierEvidence.length > 0) {
    signals.push({
      signalType: "SUPPLIER_IDENTITY_MATCH",
      direction: "POSITIVE",
      score: Math.min(1.0, 0.5 + supplierEvidence.length * 0.1),
      weight: 1.0,
      confidence: 0.6,
      subjectType: "supplier",
      subjectId: null,
      evidenceId: supplierEvidence[0]!.id,
      metadata: { count: supplierEvidence.length },
    });
  }

  // Price signals
  const priceEvidence = evidence.filter((e) => e.evidenceType === "PRICE");
  if (priceEvidence.length >= 2) {
    const prices = priceEvidence
      .map((e) => Number((e.normalizedValue ?? e.extractedValue)?.price ?? 0))
      .filter((p) => p > 0);

    if (prices.length >= 2) {
      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      const maxDev = Math.max(...prices.map((p) => Math.abs(p - mean) / mean));
      if (maxDev > 0.5) {
        signals.push({
          signalType: "PRICE_ANOMALY",
          direction: "NEGATIVE",
          score: Math.min(1.0, maxDev),
          weight: 1.5,
          confidence: 0.6,
          subjectType: "listing",
          subjectId: null,
          evidenceId: priceEvidence[0]!.id,
          metadata: { maxDeviation: maxDev, priceCount: prices.length },
        });
      }
    }
  }

  // Contradiction signals from conflicts
  for (const conflict of conflicts) {
    if (conflict.status === "open" || conflict.status === "under_review") {
      signals.push({
        signalType: "SOURCE_CONTRADICTION",
        direction: "NEGATIVE",
        score: 0.7,
        weight: 1.5,
        confidence: 0.8,
        subjectType: null,
        subjectId: null,
        evidenceId: conflict.supportingEvidenceId,
        metadata: {
          conflictId: conflict.id,
          conflictType: conflict.conflictType,
          description: conflict.description,
        },
      });
    }
  }

  // Source corroboration
  const distinctSources = new Set(evidence.map((e) => e.sourceId!).filter(Boolean));
  if (distinctSources.size >= 2) {
    signals.push({
      signalType: "SOURCE_CORROBORATION",
      direction: "POSITIVE",
      score: Math.min(1.0, 0.4 + distinctSources.size * 0.15),
      weight: 1.5,
      confidence: Math.min(0.9, 0.4 + distinctSources.size * 0.1),
      subjectType: null,
      subjectId: null,
      evidenceId: null,
      metadata: { distinctSourceCount: distinctSources.size },
    });
  }

  return signals;
}

function calculateScore(signals: SignalRecord[]): number {
  if (signals.length === 0) return 50;

  const positiveWeighted = signals
    .filter((s) => s.direction === "POSITIVE")
    .reduce((sum, s) => sum + s.score * s.weight, 0);
  const negativeWeighted = signals
    .filter((s) => s.direction === "NEGATIVE")
    .reduce((sum, s) => sum + s.score * s.weight, 0);
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);

  if (totalWeight === 0) return 50;

  const netScore = (positiveWeighted - negativeWeighted) / totalWeight;
  return Math.max(0, Math.min(100, Math.round((netScore + 1) / 2 * 100)));
}

function calculateConfidence(evidence: EvidenceRow[], signals: SignalRecord[]): number {
  const config = AUTHENTICITY_CONFIG;
  const evidenceCount = evidence.length;
  const distinctSources = new Set(evidence.map((e) => e.sourceId!).filter(Boolean));

  const quantityScore = Math.min(1.0, evidenceCount / config.minimumEvidenceForHighConfidence);
  const qualityScore =
    evidence.length > 0
      ? evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length
      : 0;
  const independenceScore = Math.min(1.0, distinctSources.size / config.minimumSourcesForIndependence);

  const negativeSignals = signals.filter((s) => s.direction === "NEGATIVE");
  const consistencyScore = signals.length > 0 ? 1 - negativeSignals.length / signals.length : 0.5;

  const w = config.confidenceWeights;
  return Math.max(0, Math.min(1.0,
    Math.round((
      quantityScore * w.evidenceQuantity +
      qualityScore * w.evidenceQuality +
      independenceScore * w.independence +
      0.5 * w.completeness +
      consistencyScore * w.consistency
    ) * 1000) / 1000
  ));
}

function determineStatus(
  score: number,
  confidence: number,
  contradictionCount: number,
  evidenceCount: number
): string {
  const t = AUTHENTICITY_CONFIG.statusThresholds;
  if (evidenceCount === 0) return "INSUFFICIENT_EVIDENCE";
  if (contradictionCount >= 3 && confidence >= 0.5) return "CONTRADICTED";
  if (score >= t.verified && confidence >= 0.7) return "VERIFIED";
  if (score >= t.likelyAuthentic && confidence >= 0.5) return "LIKELY_AUTHENTIC";
  if (score >= t.uncertain) return "UNCERTAIN";
  if (score >= t.suspicious) return "SUSPICIOUS";
  return "LIKELY_COUNTERFEIT";
}

// ─── Assessment Runner ───────────────────────────────────────────────────────

async function runAssessment(
  tenantId: string,
  subjectType: string,
  subjectId: string
): Promise<{ assessmentId: string; score: number; confidence: number; status: string }> {
  // Load evidence
  const where: Record<string, unknown> = { tenantId };
  const entityType = subjectType.toLowerCase();

  if (subjectType === "PRODUCT") {
    where.OR = [{ entityType: "product", entityId: subjectId }, { productId: subjectId }];
  } else {
    where.OR = [{ entityType, entityId: subjectId }, { entityId: subjectId }];
  }

  const evidenceRows = await prisma.evidence.findMany({
    where: where as any,
    orderBy: { observedAt: "desc" },
    take: 200,
  });

  const evidence: EvidenceRow[] = evidenceRows.map((e) => ({
    id: e.id,
    sourceId: e.sourceId,
    evidenceType: e.evidenceType,
    entityType: e.entityType,
    entityId: e.entityId,
    confidence: e.confidence,
    status: e.status,
    freshness: e.freshness,
    contentHash: e.contentHash,
    extractedValue: e.extractedValue as Record<string, unknown> | null,
    normalizedValue: e.normalizedValue as Record<string, unknown> | null,
    observedAt: e.observedAt,
  }));

  // Load conflicts
  const conflictRows = await prisma.evidenceConflict.findMany({
    where: { tenantId, entityType, entityId: subjectId },
    take: 50,
  });

  const conflicts: ConflictRow[] = conflictRows.map((c) => ({
    id: c.id,
    conflictType: c.conflictType,
    description: c.description,
    status: c.status,
    supportingEvidenceId: c.supportingEvidenceId,
    contradictingEvidenceId: c.contradictingEvidenceId,
  }));

  // Generate signals
  const signals = generateSignals(subjectType, subjectId, evidence, conflicts);

  // Calculate score and confidence
  const score = calculateScore(signals);
  const confidence = calculateConfidence(evidence, signals);
  const contradictionCount = signals.filter(
    (s) => s.signalType.includes("CONTRADICTION") || s.signalType.includes("DISAGREEMENT")
  ).length;
  const status = determineStatus(score, confidence, contradictionCount, evidence.length);

  // Compute hashes
  const inputHash = computeInputHash(tenantId, subjectType, subjectId, evidence, conflicts);
  const calculationHash = createHash("sha256")
    .update(JSON.stringify({ inputHash, score, confidence, status, signalCount: signals.length }))
    .digest("hex");

  // Persist
  const distinctSources = new Set(evidence.map((e) => e.sourceId!).filter(Boolean));
  const positiveCount = signals.filter((s) => s.direction === "POSITIVE").length;
  const negativeCount = signals.filter((s) => s.direction === "NEGATIVE").length;

  const assessment = await prisma.authenticityAssessment.create({
    data: {
      tenantId,
      subjectType,
      subjectId,
      status: status as any,
      score,
      confidence,
      algorithmVersion: AUTHENTICITY_CONFIG.algorithmVersion,
      inputHash,
      calculationHash,
      evidenceCount: evidence.length,
      signalCount: signals.length,
      contradictionCount,
      positiveSignalCount: positiveCount,
      negativeSignalCount: negativeCount,
      dataCompleteness: 0.5, // Simplified
      sourceDiversity: distinctSources.size,
      assessedAt: new Date(),
    },
  });

  // Persist signals
  if (signals.length > 0) {
    await prisma.authenticitySignal.createMany({
      data: signals.map((s) => ({
        tenantId,
        assessmentId: assessment.id,
        signalType: s.signalType,
        direction: s.direction,
        score: s.score,
        weight: s.weight,
        confidence: s.confidence,
        subjectType: s.subjectType,
        subjectId: s.subjectId,
        evidenceId: s.evidenceId,
        metadata: s.metadata as any,
      })),
    });
  }

  // Persist evidence links
  const evidenceLinks = evidence.map((e) => {
    const signal = signals.find((s) => s.evidenceId === e.id);
    const direction = signal?.direction ?? "UNKNOWN";
    return {
      tenantId,
      assessmentId: assessment.id,
      evidenceId: e.id,
      evidenceRole: direction === "POSITIVE" ? "SUPPORTING" : direction === "NEGATIVE" ? "CONTRADICTING" : "CONTEXTUAL",
      evidenceStrength: "MODERATE",
      relevance: signal?.score ?? 0.5,
      effect: direction === "POSITIVE" ? (signal?.score ?? 0.5) : direction === "NEGATIVE" ? -(signal?.score ?? 0.5) : 0,
      observedAt: new Date(),
    };
  });

  if (evidenceLinks.length > 0) {
    await prisma.authenticityEvidenceLink.createMany({
      data: evidenceLinks,
      skipDuplicates: true,
    });
  }

  // Persist decision snapshot
  await prisma.authenticityDecision.create({
    data: {
      assessmentId: assessment.id,
      algorithmVersion: AUTHENTICITY_CONFIG.algorithmVersion,
      identityScore: score,
      brandScore: 50,
      sellerScore: 50,
      supplierScore: 50,
      listingScore: 50,
      documentScore: 50,
      priceScore: 50,
      corroborationScore: 50,
      evidenceQuantityScore: 0.5,
      evidenceQualityScore: 0.5,
      independenceScore: 0.5,
      completenessScore: 0.5,
      consistencyScore: 0.5,
      contradictionPenalty: contradictionCount * AUTHENTICITY_CONFIG.contradictionPenaltyFactor * 100,
      finalScore: score,
      finalConfidence: confidence,
      inputHash,
      evidenceIds: evidence.map((e) => e.id),
      signalIds: signals.map((_, i) => `signal-${i}`),
    },
  });

  return { assessmentId: assessment.id, score, confidence, status };
}

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Process authenticity intelligence jobs.
 */
export async function processAuthenticityJob(job: Job): Promise<void> {
  const data = job.data as AuthenticityJob;

  logger.info(
    { jobId: job.id, jobName: job.name, queue: "authenticity_intelligence", tenantId: data.tenantId },
    "authenticity_worker_started"
  );
  const startTime = Date.now();

  try {
    switch (data.type) {
      case "authenticity:detect":
        await processDetect(data);
        break;
      case "authenticity:recalculate":
        await processRecalculate(data);
        break;
      case "authenticity:refresh":
        await processRefresh(data);
        break;
      case "authenticity:expire":
        await processExpire(data);
        break;
      default:
        throw new Error(`Unknown authenticity job type: ${(data as any).type}`);
    }

    logger.info(
      { jobId: job.id, duration: Date.now() - startTime },
      "authenticity_worker_completed"
    );
  } catch (err) {
    logger.error(
      { jobId: job.id, err, duration: Date.now() - startTime },
      "authenticity_worker_failed"
    );
    throw err;
  }
}

async function processDetect(data: AuthenticityDetectJob): Promise<void> {
  const { tenantId, subjectType, subjectId } = data;

  if (subjectType && subjectId) {
    const result = await runAssessment(tenantId, subjectType, subjectId);
    logger.info(
      { assessmentId: result.assessmentId, score: result.score, status: result.status },
      "authenticity_detect_completed"
    );
    return;
  }

  // Find entities with evidence but no recent assessment
  const subjectTypes = ["PRODUCT", "SELLER", "SUPPLIER", "BRAND"];
  for (const type of subjectTypes) {
    const entityType = type.toLowerCase();
    const entitiesWithEvidence = await prisma.evidence.groupBy({
      by: ["entityId"],
      where: { tenantId, entityType },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    });

    let assessed = 0;
    for (const entity of entitiesWithEvidence) {
      const recentAssessment = await prisma.authenticityAssessment.findFirst({
        where: {
          tenantId,
          subjectType: type,
          subjectId: entity.entityId,
          assessedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (recentAssessment) continue;

      try {
        await runAssessment(tenantId, type, entity.entityId);
        assessed++;
      } catch (err) {
        logger.warn({ subjectType: type, subjectId: entity.entityId, err }, "authenticity_detect_entity_failed");
      }
    }

    if (assessed > 0) {
      logger.info({ subjectType: type, assessed }, "authenticity_detect_batch_completed");
    }
  }
}

async function processRecalculate(data: AuthenticityRecalculateJob): Promise<void> {
  const { tenantId, assessmentId } = data;
  const existing = await prisma.authenticityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    select: { subjectType: true, subjectId: true },
  });
  if (!existing) {
    logger.warn({ assessmentId }, "authenticity_recalculate_not_found");
    return;
  }
  const result = await runAssessment(tenantId, existing.subjectType, existing.subjectId);
  logger.info(
    { oldAssessmentId: assessmentId, newAssessmentId: result.assessmentId, score: result.score },
    "authenticity_recalculate_completed"
  );
}

async function processRefresh(data: AuthenticityRefreshJob): Promise<void> {
  const { tenantId, subjectType, subjectId } = data;
  const result = await runAssessment(tenantId, subjectType, subjectId);
  logger.info(
    { assessmentId: result.assessmentId, subjectType, subjectId, score: result.score },
    "authenticity_refresh_completed"
  );
}

async function processExpire(data: AuthenticityExpireJob): Promise<void> {
  const { tenantId } = data;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.authenticityAssessment.updateMany({
    where: {
      tenantId,
      validUntil: null,
      assessedAt: { lt: cutoff },
      status: { not: "CONTRADICTED" },
    },
    data: { validUntil: new Date() },
  });
  logger.info({ expiredCount: result.count }, "authenticity_expire_completed");
}
