// =============================================================================
// Worker — Decision Intelligence Processor (Phase 8)
// =============================================================================
// Processes opportunity detection and management jobs from the
// decision_intelligence queue.
// Handles: opportunity:detect, opportunity:recalculate,
// opportunity:expire, opportunity:refresh.
//
// This processor is self-contained — it does not import API-layer code.
// The pure calculation logic is replicated here (worker-safe).
// =============================================================================

import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { OPPORTUNITY_CONFIG } from "@exosquad/common";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DemandSignalRow {
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
}

interface SignalSummary {
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

interface Candidate {
  tenantId: string;
  productId: string | null;
  productVariantId: string | null;
  geographyCode: string | null;
  categoryId: string | null;
  signals: SignalSummary[];
}

// ─── Main Processor ──────────────────────────────────────────────────────────

export async function processOpportunityJob(job: Job): Promise<unknown> {
  const { type } = job.data;

  switch (type) {
    case "opportunity:detect":
    case "opportunity:recalculate":
      return handleDetect(job);
    case "opportunity:expire":
      return handleExpire(job);
    case "opportunity:refresh":
      return handleRefresh(job);
    default:
      logger.warn({ jobType: type, jobId: job.id }, "Unknown opportunity job type");
      throw new Error(`Unknown opportunity job type: ${type}`);
  }
}

// ─── Detect / Recalculate ────────────────────────────────────────────────────

async function handleDetect(job: Job): Promise<{
  tenantId: string;
  candidatesEvaluated: number;
  opportunitiesCreated: number;
  opportunitiesDeduplicated: number;
}> {
  const { tenantId, windowDays = 30 } = job.data;

  logger.info({ jobId: job.id, tenantId, windowDays }, "opportunity_detection_started");

  const startTime = Date.now();
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
    logger.info({ jobId: job.id, tenantId }, "opportunity_detection_no_signals");
    return { tenantId, candidatesEvaluated: 0, opportunitiesCreated: 0, opportunitiesDeduplicated: 0 };
  }

  const candidates = groupSignals(signals, tenantId);
  let created = 0;
  let deduplicated = 0;

  for (const candidate of candidates) {
    const result = evaluateCandidate(candidate);
    if (!result) continue;

    // Persist with deduplication via content hash
    try {
      const existing = await prisma.opportunity.findUnique({
        where: {
          tenantId_contentHash: {
            tenantId: result.tenantId,
            contentHash: result.contentHash,
          },
        },
      });

      if (existing) {
        deduplicated++;
        continue;
      }

      const status = result.score >= OPPORTUNITY_CONFIG.actionableScore
        ? "ACTIONABLE" as const
        : result.score >= OPPORTUNITY_CONFIG.watchScore
          ? "WATCH" as const
          : "DETECTED" as const;

      await prisma.$transaction(async (tx) => {
        const opp = await tx.opportunity.create({
          data: {
            tenantId: result.tenantId,
            productId: result.productId,
            productVariantId: result.productVariantId,
            geographyCode: result.geographyCode,
            categoryId: null,
            opportunityType: result.opportunityType,
            status,
            score: result.score,
            confidence: result.confidence,
            title: result.title,
            summary: result.summary,
            detectedAt: now,
            validFrom: now,
            validUntil: new Date(now.getTime() + OPPORTUNITY_CONFIG.staleSignalDays * 24 * 60 * 60 * 1000),
            algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
            contentHash: result.contentHash,
            demandScore: result.demandStrength,
            growthScore: result.demandMomentum,
            velocityScore: result.demandMomentum,
            persistenceScore: result.demandPersistence,
            accelerationScore: result.acceleration,
            seasonalityScore: result.seasonality,
            sourceDiversityScore: result.sourceDiversity,
            riskScore: result.riskAdjustment,
          },
        });

        await tx.opportunityCalculation.create({
          data: {
            opportunityId: opp.id,
            algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
            demandScore: result.demandStrength,
            growthScore: result.demandMomentum,
            velocityScore: result.demandMomentum,
            persistenceScore: result.demandPersistence,
            accelerationScore: result.acceleration,
            seasonalityScore: result.seasonality,
            sourceDiversityScore: result.sourceDiversity,
            confidenceScore: result.confidenceScore,
            competitionScore: null,
            commercialScore: null,
            sourcingScore: null,
            riskScore: result.riskAdjustment,
            finalScore: result.score,
            inputHash: result.contentHash,
            inputSignalIds: result.signalIds,
          },
        });

        // Evidence, risks, actions are generated inline
        if (result.evidence.length > 0) {
          await tx.opportunityEvidence.createMany({
            data: result.evidence.map((e) => ({
              opportunityId: opp.id,
              evidenceType: e.evidenceType,
              sourceId: e.sourceId,
              demandSignalId: e.demandSignalId,
              weight: e.weight,
              contribution: e.contribution,
              snapshotAt: now,
              metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            })),
          });
        }

        if (result.risks.length > 0) {
          await tx.opportunityRisk.createMany({
            data: result.risks.map((r) => ({
              opportunityId: opp.id,
              riskType: r.riskType,
              severity: r.severity,
              score: r.score,
              description: r.description,
              evidence: (r.evidence ?? undefined) as Prisma.InputJsonValue | undefined,
            })),
          });
        }

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
      });

      created++;
    } catch (err) {
      logger.debug({ jobId: job.id, tenantId, err }, "opportunity_creation_skipped (likely duplicate)");
      deduplicated++;
    }
  }

  const duration = Date.now() - startTime;

  logger.info(
    {
      jobId: job.id, tenantId, candidatesEvaluated: candidates.length,
      opportunitiesCreated: created, opportunitiesDeduplicated: deduplicated,
      duration, algorithmVersion: OPPORTUNITY_CONFIG.algorithmVersion,
    },
    "opportunity_detection_completed"
  );

  return { tenantId, candidatesEvaluated: candidates.length, opportunitiesCreated: created, opportunitiesDeduplicated: deduplicated };
}

// ─── Expire ──────────────────────────────────────────────────────────────────

async function handleExpire(job: Job): Promise<{ expired: number }> {
  const { tenantId } = job.data;
  const now = new Date();

  const result = await prisma.opportunity.updateMany({
    where: {
      tenantId,
      status: { not: "EXPIRED" },
      validUntil: { not: null, lt: now },
    },
    data: { status: "EXPIRED" },
  });

  logger.info({ jobId: job.id, tenantId, expired: result.count }, "opportunity_expiration_completed");
  return { expired: result.count };
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

async function handleRefresh(job: Job): Promise<{ refreshed: number }> {
  await handleExpire(job);
  const detectResult = await handleDetect(job);
  logger.info({ jobId: job.id, ...detectResult }, "opportunity_refresh_completed");
  return { refreshed: detectResult.opportunitiesCreated };
}

// ─── Signal Grouping ─────────────────────────────────────────────────────────

function groupSignals(signals: DemandSignalRow[], tenantId: string): Candidate[] {
  const groups = new Map<string, SignalSummary[]>();

  for (const s of signals) {
    const key = `${s.productId ?? "no-product"}:${s.geography ?? "global"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      id: s.id, sourceId: s.sourceId, signalType: s.signalType, metric: s.metric,
      value: s.value, observedAt: s.observedAt, geography: s.geography,
      confidence: s.confidence, freshness: s.freshness, dataQuality: s.dataQuality,
      sourceReliability: s.sourceReliability, isOutlier: s.isOutlier,
    });
  }

  return [...groups.entries()].map(([key, sigs]) => {
    const [productId, geography] = key.split(":");
    return {
      tenantId,
      productId: productId === "no-product" ? null : productId!,
      productVariantId: null,
      geographyCode: geography === "global" ? null : geography!,
      categoryId: null,
      signals: sigs,
    };
  });
}

// ─── Inline Evaluation (worker-safe, mirrors opportunity-engine.ts) ──────────

interface EvalResult {
  tenantId: string;
  productId: string | null;
  productVariantId: string | null;
  geographyCode: string | null;
  opportunityType: string;
  score: number;
  confidence: number;
  confidenceScore: number;
  title: string;
  summary: string;
  contentHash: string;
  demandStrength: number;
  demandMomentum: number;
  demandPersistence: number;
  acceleration: number;
  seasonality: number;
  sourceDiversity: number;
  riskAdjustment: number;
  signalIds: string[];
  evidence: Array<{ evidenceType: string; sourceId: string | null; demandSignalId: string | null; weight: number; contribution: number; metadata: Record<string, unknown> | null }>;
  risks: Array<{ riskType: string; severity: string; score: number; description: string; evidence: Record<string, unknown> | null }>;
  actions: Array<{ actionType: string; priority: string; title: string; description: string; reason: string }>;
}

function evaluateCandidate(candidate: Candidate): EvalResult | null {
  const { tenantId, productId, productVariantId, geographyCode, signals } = candidate;
  const validSignals = signals.filter((s) => s.dataQuality === "valid" && !s.isOutlier);
  if (validSignals.length < 2) return null;

  const avgConf = avg(validSignals.map((s) => s.confidence));
  if (avgConf < OPPORTUNITY_CONFIG.minimumSignalConfidence) return null;

  const demandStrength = calcDemandStrength(validSignals);
  const demandMomentum = calcDemandMomentum(validSignals);
  const demandPersistence = calcDemandPersistence(validSignals);
  const acceleration = calcAcceleration(validSignals);
  const seasonality = calcSeasonality(validSignals);
  const sourceDiversity = calcSourceDiversity(validSignals);

  const w = OPPORTUNITY_CONFIG.confidenceWeights;
  const completeness = Math.min(1, validSignals.length / 20);
  const values = validSignals.map((s) => s.value);
  const agreement = Math.max(0, Math.min(1, 1 - cv(values) / 100));
  const confidenceScore = avgConf * w.signal + (sourceDiversity / 100) * w.sourceDiversity +
    (demandPersistence / 100) * w.persistence + completeness * w.completeness + agreement * w.agreement;

  const risks = assessRisks(validSignals, confidenceScore, sourceDiversity, demandPersistence, demandMomentum);
  const riskAdjustment = calcRiskAdjustment(risks);

  const sw = OPPORTUNITY_CONFIG.scoreWeights;
  const finalScore = Math.max(0, Math.min(100, round(
    demandStrength * sw.demandStrength + demandMomentum * sw.demandMomentum +
    demandPersistence * sw.demandPersistence + confidenceScore * 100 * sw.confidence +
    (100 - riskAdjustment) * sw.riskAdjustment
  )));

  const opportunityType = classifyType(demandStrength, demandMomentum, demandPersistence, acceleration, seasonality);
  const signalIds = validSignals.map((s) => s.id).sort();
  const contentHash = computeHash(tenantId, productId, productVariantId, geographyCode, opportunityType, signalIds);

  const evidence = buildEvidence(validSignals, demandStrength, demandMomentum, demandPersistence, acceleration, seasonality, sourceDiversity);
  const actions = buildActions(opportunityType, risks, finalScore, confidenceScore, demandPersistence, seasonality);

  const geoLabel = geographyCode && geographyCode !== "global" ? geographyCode.replace("BD-", "") : "Bangladesh";
  const statusLabel = finalScore >= OPPORTUNITY_CONFIG.actionableScore ? "actionable" :
    finalScore >= OPPORTUNITY_CONFIG.watchScore ? "watch" : "early-stage";

  return {
    tenantId, productId, productVariantId, geographyCode,
    opportunityType, score: finalScore, confidence: round(confidenceScore),
    confidenceScore: round(confidenceScore),
    title: `${opportunityType.replace(/_/g, " ")} — ${geoLabel}`,
    summary: `${statusLabel} ${opportunityType.replace(/_/g, " ").toLowerCase()} with score ${round(finalScore)}/100 and confidence ${round(confidenceScore * 100)}%. Based on ${validSignals.length} signals from ${new Set(validSignals.map((s) => s.sourceId)).size} sources. ${risks.length} risk factor${risks.length !== 1 ? "s" : ""} identified.`,
    contentHash, demandStrength: round(demandStrength), demandMomentum: round(demandMomentum),
    demandPersistence: round(demandPersistence), acceleration: round(acceleration),
    seasonality: round(seasonality), sourceDiversity: round(sourceDiversity),
    riskAdjustment: round(riskAdjustment), signalIds, evidence, risks, actions,
  };
}

// ─── Calculation Helpers (mirrors opportunity-engine.ts) ─────────────────────

function calcDemandStrength(sigs: SignalSummary[]): number {
  if (sigs.length === 0) return 0;
  const vals = sigs.map((s) => s.value);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min;
  const norm = vals.map((v) => range > 0 ? ((v - min) / range) * 100 : 50);
  const wSum = norm.reduce((sum, v, i) => sum + v * (0.5 + sigs[i]!.sourceReliability * 0.5), 0);
  const tWeight = sigs.reduce((sum, s) => sum + (0.5 + s.sourceReliability * 0.5), 0);
  return tWeight > 0 ? Math.min(100, wSum / tWeight) : 0;
}

function calcDemandMomentum(sigs: SignalSummary[]): number {
  if (sigs.length < 2) return 0;
  const sorted = [...sigs].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const mid = Math.floor(sorted.length / 2);
  const firstAvg = avg(sorted.slice(0, mid).map((s) => s.value));
  const secondAvg = avg(sorted.slice(mid).map((s) => s.value));
  const growth = firstAvg !== 0 ? ((secondAvg - firstAvg) / Math.abs(firstAvg)) * 100 : secondAvg > 0 ? 100 : 0;
  const growthScore = Math.max(0, Math.min(100, 50 + growth));
  const totalDays = Math.max(1, (sorted[sorted.length - 1]!.observedAt.getTime() - sorted[0]!.observedAt.getTime()) / 86400000);
  const dailyVel = (secondAvg - firstAvg) / totalDays;
  const velScore = Math.max(0, Math.min(100, 50 + dailyVel * 50));
  return growthScore * 0.6 + velScore * 0.4;
}

function calcDemandPersistence(sigs: SignalSummary[]): number {
  if (sigs.length < 3) return 0;
  const sorted = [...sigs].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const a = avg(sorted.map((s) => s.value));
  let sustained = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.value >= a * 0.8 || sorted[i]!.value >= sorted[i - 1]!.value) sustained++;
  }
  const consistency = sustained / (sorted.length - 1);
  const days = (sorted[sorted.length - 1]!.observedAt.getTime() - sorted[0]!.observedAt.getTime()) / 86400000;
  const durFactor = Math.min(1, days / 30);
  return (consistency * 0.6 + durFactor * 0.4) * 100;
}

function calcAcceleration(sigs: SignalSummary[]): number {
  if (sigs.length < 4) return 0;
  const sorted = [...sigs].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const pCount = Math.min(3, sorted.length);
  const bSize = Math.floor(sorted.length / pCount);
  const pAvgs: number[] = [];
  for (let i = 0; i < pCount; i++) {
    const s = i * bSize, e = i === pCount - 1 ? sorted.length : (i + 1) * bSize;
    const bucket = sorted.slice(s, e);
    if (bucket.length > 0) pAvgs.push(avg(bucket.map((x) => x.value)));
  }
  if (pAvgs.length < 3) return 0;
  const gRates: number[] = [];
  for (let i = 1; i < pAvgs.length; i++) {
    const p = pAvgs[i - 1]!, c = pAvgs[i]!;
    gRates.push(p !== 0 ? ((c - p) / Math.abs(p)) * 100 : c > 0 ? 100 : 0);
  }
  if (gRates.length < 2) return 0;
  return Math.max(0, Math.min(100, 50 + (gRates[gRates.length - 1]! - gRates[gRates.length - 2]!) * 2));
}

function calcSeasonality(sigs: SignalSummary[]): number {
  if (sigs.length < 14) return 0;
  const sorted = [...sigs].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const vals = sorted.map((s) => s.value);
  const m = avg(vals);
  const v = vals.reduce((sum, x) => sum + (x - m) ** 2, 0) / vals.length;
  if (v === 0) return 0;
  let sum = 0, count = 0;
  for (let i = 0; i < vals.length - 7; i++) { sum += (vals[i]! - m) * (vals[i + 7]! - m); count++; }
  const ac = count > 0 ? sum / (count * v) : 0;
  return Math.max(0, Math.min(100, ac * 100));
}

function calcSourceDiversity(sigs: SignalSummary[]): number {
  const unique = new Set(sigs.map((s) => s.sourceId));
  const divScore = Math.min(100, 20 + (unique.size - 1) * 20);
  const types = new Set(sigs.map((s) => s.signalType));
  const typeDiv = Math.min(100, types.size * 25);
  return divScore * 0.6 + typeDiv * 0.4;
}

function assessRisks(sigs: SignalSummary[], conf: number, _srcDiv: number, _persist: number, _momentum: number) {
  const risks: Array<{ riskType: string; severity: string; score: number; description: string; evidence: Record<string, unknown> | null }> = [];
  if (conf < 0.5) risks.push({ riskType: "LOW_DEMAND_CONFIDENCE", severity: conf < 0.3 ? "high" : "medium", score: round(1 - conf), description: `Confidence is low (${round(conf * 100)}%).`, evidence: { confidence: round(conf) } });
  const vals = sigs.map((s) => s.value);
  if (vals.length >= 3) { const c = cv(vals); if (c > 40) risks.push({ riskType: "HIGH_VOLATILITY", severity: c > 70 ? "high" : "medium", score: round(Math.min(1, c / 100)), description: `Volatility is high (CV: ${round(c)}%).`, evidence: { cv: round(c) } }); }
  const now = new Date();
  const latest = sigs.reduce((l, s) => s.observedAt > l.observedAt ? s : l, sigs[0]!);
  const daysSince = (now.getTime() - latest.observedAt.getTime()) / 86400000;
  if (daysSince > OPPORTUNITY_CONFIG.staleSignalDays) risks.push({ riskType: "STALE_SIGNAL", severity: daysSince > OPPORTUNITY_CONFIG.staleSignalDays * 2 ? "high" : "medium", score: round(Math.min(1, daysSince / (OPPORTUNITY_CONFIG.staleSignalDays * 3))), description: `Latest signal is ${Math.round(daysSince)} days old.`, evidence: { days: round(daysSince) } });
  if (sigs.length < 5) risks.push({ riskType: "DATA_SPARSE", severity: sigs.length < 3 ? "high" : "medium", score: round(Math.max(0, 1 - sigs.length / 10)), description: `Only ${sigs.length} signals.`, evidence: { count: sigs.length } });
  risks.push({ riskType: "COMMERCIAL_DATA_MISSING", severity: "low", score: 0.2, description: "No commercial data available.", evidence: null });
  return risks;
}

function calcRiskAdjustment(risks: Array<{ riskType: string; severity: string; score: number }>): number {
  if (risks.length === 0) return 0;
  const sw: Record<string, number> = { low: 0.2, medium: 0.5, high: 0.8, critical: 1.0 };
  const ws = risks.reduce((sum: number, r) => sum + r.score * (sw[r.severity] ?? 0.5), 0);
  return Math.min(100, (ws / Math.max(1, risks.length)) * 100);
}

function classifyType(ds: number, dm: number, dp: number, acc: number, seas: number): string {
  if (seas > 50 && ds > 40) return "SEASONAL_OPPORTUNITY";
  if (acc > 65 && ds < 60) return "EMERGING_PRODUCT";
  if (dm > 60 && ds > 50) return "GROWING_PRODUCT";
  if (dp > 70 && ds > 40) return "SUSTAINED_DEMAND";
  if (dm > 55) return "MOMENTUM_OPPORTUNITY";
  return "GROWING_PRODUCT";
}

function buildEvidence(_sigs: SignalSummary[], _ds: number, dm: number, dp: number, acc: number, seas: number, srcDiv: number) {
  const ev: Array<{ evidenceType: string; sourceId: string | null; demandSignalId: string | null; weight: number; contribution: number; metadata: Record<string, unknown> | null }> = [];
  if (dm > 30) ev.push({ evidenceType: "DEMAND_GROWTH", sourceId: null, demandSignalId: null, weight: 0.25, contribution: round(Math.min(1, dm / 100)), metadata: { momentum: round(dm) } });
  if (dm > 20) ev.push({ evidenceType: "DEMAND_VELOCITY", sourceId: null, demandSignalId: null, weight: 0.2, contribution: round(dm / 100), metadata: null });
  if (dp > 20) ev.push({ evidenceType: "DEMAND_PERSISTENCE", sourceId: null, demandSignalId: null, weight: 0.15, contribution: round(dp / 100), metadata: null });
  if (srcDiv > 20) ev.push({ evidenceType: "SOURCE_DIVERSITY", sourceId: null, demandSignalId: null, weight: 0.15, contribution: round(srcDiv / 100), metadata: null });
  if (acc > 55) ev.push({ evidenceType: "ACCELERATION", sourceId: null, demandSignalId: null, weight: 0.15, contribution: round(acc / 100), metadata: null });
  if (seas > 30) ev.push({ evidenceType: "SEASONALITY", sourceId: null, demandSignalId: null, weight: 0.1, contribution: round(seas / 100), metadata: null });
  return ev;
}

function buildActions(_type: string, risks: Array<{ riskType: string }>, score: number, conf: number, dp: number, seas: number) {
  const acts: Array<{ actionType: string; priority: string; title: string; description: string; reason: string }> = [];
  if (score >= OPPORTUNITY_CONFIG.watchScore) acts.push({ actionType: "INVESTIGATE_SUPPLIERS", priority: score >= OPPORTUNITY_CONFIG.actionableScore ? "high" : "medium", title: "Investigate potential suppliers", description: "Research suppliers for this product.", reason: `Score (${round(score)}) warrants investigation.` });
  if (risks.some((r) => r.riskType === "SOURCE_CONFLICT")) acts.push({ actionType: "INVESTIGATE_SOURCE_CONFLICT", priority: "high", title: "Investigate conflicting data", description: "Sources show contradictory trends.", reason: "Source conflict detected." });
  if (conf < 0.5) acts.push({ actionType: "WATCH_DEMAND", priority: "medium", title: "Monitor demand signals", description: "Continue monitoring.", reason: `Confidence low (${round(conf * 100)}%).` });
  if (dp < 40 || seas > 50) acts.push({ actionType: "CHECK_SEASONALITY", priority: "medium", title: "Verify seasonal patterns", description: "Demand may be seasonal.", reason: "Low persistence or high seasonality." });
  acts.push({ actionType: "VERIFY_PRICE", priority: "medium", title: "Research pricing", description: "No commercial data available.", reason: "Commercial data unavailable." });
  if (score >= OPPORTUNITY_CONFIG.actionableScore) acts.push({ actionType: "COMPARE_IMPORT_COST", priority: "high", title: "Compare import costs", description: "Analyze landed cost.", reason: `Actionable (score: ${round(score)}).` });
  return acts;
}

function computeHash(tenantId: string, productId: string | null, pvId: string | null, geo: string | null, type: string, signalIds: string[]): string {
  const canonical = [tenantId, productId ?? "", pvId ?? "", geo ?? "", type, [...signalIds].sort().join(","), OPPORTUNITY_CONFIG.algorithmVersion].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function avg(vals: number[]): number { return vals.length === 0 ? 0 : vals.reduce((s, v) => s + v, 0) / vals.length; }
function cv(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = avg(vals);
  if (m === 0) return 0;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length);
  return (sd / Math.abs(m)) * 100;
}
function round(v: number, d: number = 2): number { const f = 10 ** d; return Math.round(v * f) / f; }
