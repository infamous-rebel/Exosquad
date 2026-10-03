// =============================================================================
// Worker — AI Research Processor (Phase 14)
// =============================================================================
// Processes research execution jobs. Self-contained — does not import API-layer
// code. Implements deterministic functions directly.
// =============================================================================

import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { RESEARCH_CONFIG } from "@exosquad/common";

// ─── Content Hash Helpers (self-contained) ───────────────────────────────────

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

// ─── Job Data Types ──────────────────────────────────────────────────────────

interface ResearchExecuteJob {
  type: "research:execute";
  tenantId: string;
  requestId: string;
  triggeredBy: string;
}

interface ResearchRefreshJob {
  type: "research:refresh";
  tenantId: string;
  triggeredBy: string;
}

interface ResearchExpireJob {
  type: "research:expire";
  tenantId: string;
  triggeredBy: string;
}

type ResearchJob = ResearchExecuteJob | ResearchRefreshJob | ResearchExpireJob;

// ─── Job Processor ───────────────────────────────────────────────────────────

export async function processResearchJob(job: Job): Promise<void> {
  const data = job.data as ResearchJob;

  switch (data.type) {
    case "research:execute":
      await handleExecute(data);
      break;
    case "research:refresh":
      await handleRefresh(data);
      break;
    case "research:expire":
      await handleExpire(data);
      break;
    default:
      logger.warn({ type: (data as { type: string }).type }, "Unknown research job type");
  }
}

// ─── Execute Handler ─────────────────────────────────────────────────────────

async function handleExecute(job: ResearchExecuteJob): Promise<void> {
  const { tenantId, requestId } = job;

  logger.info({ tenantId, requestId, triggeredBy: job.triggeredBy }, "research_execute_job_started");

  const request = await prisma.researchRequest.findFirst({
    where: { id: requestId, tenantId },
    include: {
      subQuestions: true,
      evidenceItems: true,
      contradictions: true,
      hypotheses: true,
      gaps: true,
    },
  });

  if (!request) {
    logger.warn({ tenantId, requestId }, "research_request_not_found");
    return;
  }

  if (request.status !== "QUEUED") {
    logger.info({ tenantId, requestId, status: request.status }, "research_request_not_queued_skipping");
    return;
  }

  const startTime = Date.now();

  try {
    // ─── Step 1: Planning ─────────────────────────────────────────────────
    await prisma.researchRequest.update({
      where: { id: requestId },
      data: { status: "PLANNING", startedAt: new Date() },
    });

    // ─── Step 2: Decomposition ────────────────────────────────────────────
    await prisma.researchRequest.update({
      where: { id: requestId },
      data: { status: "RESEARCHING" },
    });

    const subQuestions = await createSubQuestions(requestId, tenantId, request);

    // ─── Step 3: Evidence Retrieval ───────────────────────────────────────
    const evidenceResult = await retrieveEvidence(requestId, tenantId, request);

    // ─── Step 4: Contradiction Detection ──────────────────────────────────
    const contradictions = detectContradictions(evidenceResult.evidenceBySubject);

    for (const c of contradictions) {
      if (!c.detected) continue;
      const hash = sha256(stableStringify({ requestId, subject: c.subject, evidenceItemIds: c.evidenceItemIds }));
      await prisma.researchContradiction.create({
        data: {
          tenantId, requestId, subject: c.subject,
          description: c.explanation ?? `Contradiction: ${c.subject}`,
          severity: c.severity, evidenceItemIds: c.evidenceItemIds,
          conflictingValues: JSON.parse(JSON.stringify(c.conflictingValues)),
          resolutionStatus: "OPEN", resolutionRequires: c.resolutionRequires,
          contentHash: hash,
        },
      });
    }

    // ─── Step 5: Hypothesis Evaluation ────────────────────────────────────
    await prisma.researchRequest.update({
      where: { id: requestId },
      data: { status: "ANALYZING" },
    });

    const hypothesisStatement = `Evidence is sufficient to address: "${request.question}"`;
    const hypHash = sha256(stableStringify({ requestId, statement: hypothesisStatement, hypothesisType: "feasibility" }));
    const createdHyp = await prisma.researchHypothesis.create({
      data: {
        tenantId, requestId, statement: hypothesisStatement,
        hypothesisType: "feasibility", status: "INSUFFICIENT_EVIDENCE",
        supportingEvidenceIds: [], contradictingEvidenceIds: [],
        unknowns: [], contentHash: hypHash,
      },
    });

    // Update hypothesis based on evidence count
    const totalEvidence = evidenceResult.evidenceItems.length;
    const hypStatus = totalEvidence >= 3 ? "PARTIALLY_SUPPORTED" : totalEvidence >= 1 ? "UNCERTAIN" : "INSUFFICIENT_EVIDENCE";
    const hypConfidence = totalEvidence >= 3 ? 0.5 : totalEvidence >= 1 ? 0.3 : 0;
    await prisma.researchHypothesis.update({
      where: { id: createdHyp.id },
      data: { status: hypStatus as never, confidence: hypConfidence },
    });

    // ─── Step 6: Gap Detection ────────────────────────────────────────────
    const gaps = detectGaps(subQuestions, evidenceResult.evidenceItems, request.questionType);
    for (const gap of gaps) {
      const gapHash = sha256(stableStringify({ requestId, description: gap.description, affectedDimension: gap.dimension }));
      await prisma.researchGap.create({
        data: {
          tenantId, requestId, description: gap.description,
          affectedDimension: gap.dimension, severity: gap.severity,
          requiredEvidenceType: gap.requiredEvidenceType,
          suggestedSource: gap.suggestedSource, isBlocking: gap.isBlocking,
          contentHash: gapHash,
        },
      });
    }

    // ─── Step 7: Synthesis ────────────────────────────────────────────────
    await prisma.researchRequest.update({
      where: { id: requestId },
      data: { status: "SYNTHESIZING" },
    });

    const completedSQ = subQuestions.filter((sq) => sq.status === "COMPLETED").length;
    const totalSQ = subQuestions.length;
    const totalContradictions = contradictions.filter((c) => c.detected).length;
    const blockingGaps = gaps.filter((g) => g.isBlocking).length;

    // Confidence calculation
    const evidenceQuantityScore = totalEvidence === 0 ? 0 : Math.min(1, totalEvidence / 10);
    const sqCompleteness = totalSQ > 0 ? completedSQ / totalSQ : 0;
    const agreementScore = contradictions.length > 0 ? 1 - (totalContradictions / contradictions.length) : 0.8;
    const overallConfidence = evidenceQuantityScore * 0.35 + sqCompleteness * 0.35 + agreementScore * 0.30;

    const completenessScore = sqCompleteness * 0.5 + (totalEvidence > 0 ? 0.3 : 0) + (totalContradictions === 0 ? 0.2 : 0.1);

    const summary = `Research on "${request.question}": ${completedSQ}/${totalSQ} sub-questions answered, ${totalEvidence} evidence items, ${totalContradictions} contradictions, ${gaps.length} gaps${blockingGaps > 0 ? ` (${blockingGaps} blocking)` : ""}.`;

    // ─── Step 8: Persist Result ───────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    const hasBlockingGaps = blockingGaps > 0;
    const finalStatus = hasBlockingGaps ? "PARTIAL" : "COMPLETED";

    const resultContentHash = sha256(stableStringify({
      requestId, totalSubQuestions: totalSQ, completedSubQuestions: completedSQ,
      totalEvidenceItems: totalEvidence, contradictionsFound: totalContradictions,
      hypothesesEvaluated: 1, gapsIdentified: gaps.length, researchIterations: request.currentIteration + 1,
    }));

    const resultInputHash = sha256(stableStringify({
      tenantId, question: request.question, questionType: request.questionType,
      productId: request.productId, market: request.market, country: request.country,
    }));

    await prisma.researchResult.create({
      data: {
        tenantId, requestId, summary,
        detailedFindings: JSON.parse(JSON.stringify({ subQuestions: totalSQ, evidence: totalEvidence, contradictions: totalContradictions })),
        conclusions: JSON.parse(JSON.stringify([{ statement: summary, confidence: overallConfidence }])),
        keyInsights: JSON.parse(JSON.stringify([
          `${totalEvidence} evidence items assessed`,
          totalContradictions > 0 ? `${totalContradictions} contradictions found` : "No contradictions",
          gaps.length > 0 ? `${gaps.length} research gaps identified` : "All dimensions covered",
        ])),
        overallConfidence,
        completenessScore,
        limitations: JSON.parse(JSON.stringify(gaps.map((g: { dimension: string }) => g.dimension))),
        furtherResearchNeeded: JSON.parse(JSON.stringify(gaps.map((g: { dimension: string }) => g.dimension))),
        priorityActions: JSON.parse(JSON.stringify(
          blockingGaps > 0 ? gaps.filter((g: { isBlocking: boolean }) => g.isBlocking).map((g: { dimension: string }) => `Resolve: ${g.dimension}`) : ["Review evidence"],
        )),
        totalSubQuestions: totalSQ,
        completedSubQuestions: completedSQ,
        totalEvidenceItems: totalEvidence,
        highQualityEvidence: evidenceResult.evidenceItems.filter((e: { quality: string }) => e.quality === "HIGH").length,
        contradictionsFound: totalContradictions,
        hypothesesEvaluated: 1,
        gapsIdentified: gaps.length,
        researchIterations: request.currentIteration + 1,
        contentHash: resultContentHash,
        inputHash: resultInputHash,
      },
    });

    await prisma.researchRequest.update({
      where: { id: requestId },
      data: {
        status: finalStatus as never,
        currentIteration: { increment: 1 },
        modelCallsMade: 0,
        evidenceItemsConsidered: totalEvidence,
        subQuestionsGenerated: totalSQ,
        overallConfidence,
        completenessScore,
        completedAt: new Date(),
        executionDurationMs: durationMs,
        providerName: "deterministic",
      },
    });

    logger.info(
      { tenantId, requestId, status: finalStatus, confidence: overallConfidence, durationMs },
      "research_execute_job_completed",
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await prisma.researchRequest.update({
      where: { id: requestId },
      data: {
        status: "FAILED", failedAt: new Date(),
        failureReason: errorMessage, executionDurationMs: durationMs,
      },
    });

    logger.error({ tenantId, requestId, error: errorMessage }, "research_execute_job_failed");
    throw error;
  }
}

// ─── Sub-Question Creation ───────────────────────────────────────────────────

async function createSubQuestions(
  requestId: string,
  tenantId: string,
  request: { question: string; questionType: string; maxSubQuestions: number },
): Promise<Array<{ id: string; question: string; questionType: string; sequence: number; status: string; evidenceFound: number; answerConfidence: number; isDependencyMet: boolean }>> {
  const defaults = getDefaultSubQuestions(request.questionType, request.question);
  const limited = defaults.slice(0, request.maxSubQuestions);
  const result: Array<{ id: string; question: string; questionType: string; sequence: number; status: string; evidenceFound: number; answerConfidence: number; isDependencyMet: boolean }> = [];

  for (let i = 0; i < limited.length; i++) {
    const hash = sha256(stableStringify({ requestId, question: limited[i]!.question, questionType: limited[i]!.questionType, sequence: i + 1 }));
    const created = await prisma.researchSubQuestion.create({
      data: {
        tenantId, requestId, sequence: i + 1,
        question: limited[i]!.question, questionType: limited[i]!.questionType as never,
        priority: limited[i]!.priority, contentHash: hash,
      },
    });
    result.push({
      id: created.id, question: created.question, questionType: created.questionType,
      sequence: created.sequence, status: created.status, evidenceFound: created.evidenceFound,
      answerConfidence: created.answerConfidence, isDependencyMet: true,
    });
  }

  await prisma.researchRequest.update({
    where: { id: requestId },
    data: {
      researchPlan: JSON.parse(JSON.stringify({ strategy: "default", subQuestionCount: limited.length })),
      planVersion: { increment: 1 },
      subQuestionsGenerated: limited.length,
    },
  });

  return result;
}

function getDefaultSubQuestions(questionType: string, question: string): Array<{ question: string; questionType: string; priority: number }> {
  const base = [{ question: `What is the exact subject of: "${question}"?`, questionType: "IDENTITY", priority: 1 }];
  switch (questionType) {
    case "SUPPLIER": return [...base, { question: "What suppliers exist?", questionType: "SUPPLIER", priority: 2 }, { question: "What pricing is observed?", questionType: "PRICING", priority: 3 }];
    case "PRICING": return [...base, { question: "What price observations exist?", questionType: "PRICING", priority: 2 }, { question: "What are the cost components?", questionType: "PRICING", priority: 3 }];
    case "DEMAND": return [...base, { question: "What demand signals exist?", questionType: "DEMAND", priority: 2 }, { question: "What competition exists?", questionType: "COMPETITION", priority: 3 }];
    case "FEASIBILITY": return [...base, { question: "What supplier options exist?", questionType: "SUPPLIER", priority: 2 }, { question: "What are the costs?", questionType: "PRICING", priority: 3 }, { question: "What demand evidence exists?", questionType: "DEMAND", priority: 4 }];
    default: return [...base, { question: "What evidence exists?", questionType: "GENERAL", priority: 2 }];
  }
}

// ─── Evidence Retrieval ──────────────────────────────────────────────────────

async function retrieveEvidence(
  requestId: string,
  tenantId: string,
  request: { productId: string | null; maxEvidenceItems: number },
): Promise<{
  evidenceItems: Array<{ id: string; quality: string }>;
  evidenceBySubject: Array<{ subject: string; evidenceItems: Array<{ id: string; title: string; description: string; sourceType: string; sourceEntity: string | null; sourceEntityId: string | null; extractedValue: unknown; valueType: string; observedAt: Date | null; sourceIndependence: boolean; quality: string; relevanceScore: number; wasUsed: boolean }> }>;
}> {
  const evidenceItems: Array<{ id: string; title: string; description: string; sourceType: string; sourceEntity: string | null; sourceEntityId: string | null; extractedValue: unknown; valueType: string; observedAt: Date | null; sourceIndependence: boolean; quality: string; relevanceScore: number; wasUsed: boolean }> = [];

  if (request.productId) {
    const phase6 = await prisma.evidence.findMany({
      where: { tenantId, productId: request.productId, status: "active" },
      take: request.maxEvidenceItems,
    });

    for (const ev of phase6) {
      evidenceItems.push({
        id: ev.id, title: ev.title, description: ev.description ?? ev.evidenceType,
        sourceType: "EXISTING_EVIDENCE", sourceEntity: ev.evidenceType, sourceEntityId: ev.id,
        extractedValue: ev.extractedValue, valueType: ev.valueType, observedAt: ev.observedAt,
        sourceIndependence: true, quality: "HIGH", relevanceScore: 0.8, wasUsed: true,
      });
    }

    const prices = await prisma.priceObservation.findMany({
      where: { tenantId, productId: request.productId }, take: 10,
    });
    for (const po of prices) {
      evidenceItems.push({
        id: `price_${po.id}`, title: `Price: ${po.observationType}`, description: `${po.price} ${po.currency}`,
        sourceType: "EXISTING_EVIDENCE", sourceEntity: "price_observation", sourceEntityId: po.id,
        extractedValue: po.price, valueType: "currency", observedAt: po.observedAt,
        sourceIndependence: true, quality: "HIGH", relevanceScore: 0.9, wasUsed: true,
      });
    }
  }

  // Persist evidence items
  for (const item of evidenceItems.slice(0, request.maxEvidenceItems)) {
    const hash = sha256(stableStringify({
      requestId, title: item.title, description: item.description,
      sourceType: item.sourceType, sourceEntityId: item.sourceEntityId,
      observedAt: item.observedAt?.toISOString() ?? null,
    }));

    await prisma.researchEvidenceItem.create({
      data: {
        tenantId, requestId, title: item.title, description: item.description,
        sourceType: item.sourceType as never, sourceEntity: item.sourceEntity,
        sourceEntityId: item.sourceEntityId,
        evidenceId: item.sourceType === "EXISTING_EVIDENCE" ? item.sourceEntityId : null,
        extractedValue: item.extractedValue ?? undefined,
        valueType: item.valueType, quality: item.quality as never,
        confidence: item.relevanceScore, sourceIndependence: item.sourceIndependence,
        observedAt: item.observedAt, temporalClassification: "UNKNOWN", freshness: "unknown",
        relevanceScore: item.relevanceScore, wasUsed: item.wasUsed, contentHash: hash,
      },
    });
  }

  await prisma.researchRequest.update({
    where: { id: requestId },
    data: { evidenceItemsConsidered: Math.min(evidenceItems.length, request.maxEvidenceItems) },
  });

  // Group by subject for contradiction detection
  const bySubject = new Map<string, typeof evidenceItems>();
  for (const item of evidenceItems) {
    const subject = item.sourceEntity ?? item.valueType;
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject)!.push(item);
  }

  const evidenceBySubject = [...bySubject.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([subject, items]) => ({ subject, evidenceItems: items }));

  return { evidenceItems, evidenceBySubject };
}

// ─── Contradiction Detection (self-contained) ────────────────────────────────

function detectContradictions(
  candidates: Array<{ subject: string; evidenceItems: Array<{ id: string; extractedValue: unknown; wasUsed: boolean }> }>,
): Array<{ detected: boolean; severity: string; subject: string; evidenceItemIds: string[]; conflictingValues: Record<string, unknown>; explanation: string | null; resolutionRequires: string | null }> {
  const results: Array<{ detected: boolean; severity: string; subject: string; evidenceItemIds: string[]; conflictingValues: Record<string, unknown>; explanation: string | null; resolutionRequires: string | null }> = [];

  for (const candidate of candidates) {
    const used = candidate.evidenceItems.filter((e) => e.wasUsed);
    if (used.length < RESEARCH_CONFIG.contradictionThresholds.minEvidenceForContradiction) {
      results.push({ detected: false, severity: "low", subject: candidate.subject, evidenceItemIds: used.map((e) => e.id), conflictingValues: {}, explanation: null, resolutionRequires: null });
      continue;
    }

    const numericValues: Array<{ id: string; value: number }> = [];
    for (const item of used) {
      if (typeof item.extractedValue === "number") {
        numericValues.push({ id: item.id, value: item.extractedValue });
      }
    }

    if (numericValues.length >= 2) {
      const sorted = [...numericValues].sort((a, b) => a.value - b.value);
      const minVal = sorted[0]!.value;
      const maxVal = sorted[sorted.length - 1]!.value;

      if (minVal > 0) {
        const spread = (maxVal - minVal) / minVal;
        if (spread > RESEARCH_CONFIG.contradictionThresholds.numericTolerancePercent) {
          const severity = spread > 1.0 ? "critical" : spread > 0.5 ? "high" : spread > 0.2 ? "medium" : "low";
          const conflictingValues: Record<string, unknown> = {};
          for (const nv of numericValues) conflictingValues[nv.id] = nv.value;
          results.push({
            detected: true, severity, subject: candidate.subject,
            evidenceItemIds: numericValues.map((n) => n.id),
            conflictingValues,
            explanation: `Values range from ${minVal} to ${maxVal} (${(spread * 100).toFixed(1)}% spread)`,
            resolutionRequires: `Confirm actual ${candidate.subject} value`,
          });
          continue;
        }
      }
    }

    results.push({ detected: false, severity: "low", subject: candidate.subject, evidenceItemIds: used.map((e) => e.id), conflictingValues: {}, explanation: null, resolutionRequires: null });
  }

  return results;
}

// ─── Gap Detection (self-contained) ──────────────────────────────────────────

function detectGaps(
  subQuestions: Array<{ status: string; evidenceFound: number; questionType: string }>,
  evidenceItems: Array<{ id: string }>,
  questionType: string,
): Array<{ dimension: string; description: string; severity: string; isBlocking: boolean; requiredEvidenceType: string | null; suggestedSource: string | null }> {
  const gaps: Array<{ dimension: string; description: string; severity: string; isBlocking: boolean; requiredEvidenceType: string | null; suggestedSource: string | null }> = [];

  const dimensionMap: Record<string, { desc: string; evidenceType: string; source: string; blocking: string[] }> = {
    product_identity: { desc: "Product specification", evidenceType: "PRODUCT_SPECIFICATION", source: "manufacturer_documentation", blocking: ["IDENTITY", "FEASIBILITY"] },
    supplier_price: { desc: "Supplier pricing", evidenceType: "SUPPLIER_PRICE", source: "price_observations", blocking: ["PRICING", "FEASIBILITY"] },
    supplier_legitimacy: { desc: "Supplier authenticity", evidenceType: "SUPPLIER_AUTHENTICITY", source: "authenticity_assessment", blocking: ["SUPPLIER", "FEASIBILITY"] },
    demand_signal: { desc: "Market demand", evidenceType: "DEMAND_SIGNAL", source: "demand_calculation", blocking: ["DEMAND", "FEASIBILITY"] },
    shipping_route: { desc: "Logistics routes", evidenceType: "LOGISTICS_ROUTE", source: "logistics_assessment", blocking: ["LOGISTICS", "FEASIBILITY"] },
  };

  const hasEvidence = evidenceItems.length > 0;

  if (!hasEvidence) {
    for (const [dim, info] of Object.entries(dimensionMap)) {
      gaps.push({
        dimension: dim, description: info.desc,
        severity: info.blocking.includes(questionType) ? "high" : "medium",
        isBlocking: info.blocking.includes(questionType),
        requiredEvidenceType: info.evidenceType, suggestedSource: info.source,
      });
    }
  }

  // Check for sub-questions with no evidence
  for (const sq of subQuestions) {
    if (sq.status === "COMPLETED" && sq.evidenceFound === 0) {
      gaps.push({
        dimension: "sub_question_evidence", description: "Sub-question has no supporting evidence",
        severity: "low", isBlocking: false, requiredEvidenceType: null, suggestedSource: null,
      });
    }
  }

  return gaps;
}

// ─── Refresh Handler ─────────────────────────────────────────────────────────

async function handleRefresh(job: ResearchRefreshJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "research_refresh_started");

  const queued = await prisma.researchRequest.findMany({
    where: { tenantId, status: "QUEUED" },
    orderBy: { priority: "asc" },
    take: RESEARCH_CONFIG.maxResearchJobsPerTenant,
  });

  for (const r of queued) {
    await handleExecute({ type: "research:execute", tenantId, requestId: r.id, triggeredBy: "refresh" });
  }

  logger.info({ tenantId, processedCount: queued.length }, "research_refresh_completed");
}

// ─── Expire Handler ──────────────────────────────────────────────────────────

async function handleExpire(job: ResearchExpireJob): Promise<void> {
  const { tenantId } = job;
  const staleThreshold = new Date(Date.now() - RESEARCH_CONFIG.cacheTtlSeconds * 1000);

  const stale = await prisma.researchRequest.findMany({
    where: {
      tenantId,
      status: { in: ["QUEUED", "PLANNING", "RESEARCHING", "ANALYZING", "SYNTHESIZING"] },
      createdAt: { lt: staleThreshold },
    },
    select: { id: true },
  });

  for (const r of stale) {
    await prisma.researchRequest.update({
      where: { id: r.id },
      data: { status: "FAILED", failedAt: new Date(), failureReason: "Expired" },
    });
  }

  logger.info({ tenantId, expiredCount: stale.length }, "research_expire_completed");
}
