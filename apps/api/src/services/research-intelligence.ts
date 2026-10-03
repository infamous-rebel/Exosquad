// =============================================================================
// API — AI Research & Reasoning Intelligence Service (Phase 14)
// =============================================================================
// Orchestrator that manages the research lifecycle:
//   1. Create research request
//   2. Classify question
//   3. Decompose into sub-questions
//   4. Retrieve evidence from existing intelligence (Phases 7–13)
//   5. Assess evidence quality
//   6. Detect contradictions
//   7. Evaluate hypotheses
//   8. Detect research gaps
//   9. Synthesize results
//  10. Persist with full provenance
//
// Tenant isolation enforced at every step.
// AI provider calls are validated via Zod schemas.
// Provider failure ≠ system failure — graceful degradation.
// =============================================================================

import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { NotFoundError, RESEARCH_CONFIG } from "@exosquad/common";
import {
  computeResearchRequestHash,
  computeResearchInputHash,
  computeResearchCacheKey,
  computeSubQuestionHash,
  computeEvidenceItemHash,
  computeContradictionHash,
  computeHypothesisHash,
  computeResearchGapHash,
  computeResearchResultHash,
  assessEvidenceQuality,
  detectContradictions,
  calculateConfidence,
  detectResearchGaps,
  evaluateHypothesis,
  calculateCompleteness,
  getDepthPreset,
  type EvidenceItemInput,
  type SubQuestionInput,
  type ContradictionCandidate,
  type HypothesisInput,
} from "./research-engine.js";
import {
  createResearchProvider,
  type ResearchAIProvider,
  questionClassificationSchema,
  questionDecompositionSchema,
  hypothesisEvaluationSchema,
  researchSynthesisSchema,
} from "./research-provider.js";

// ─── Provider Singleton ──────────────────────────────────────────────────────

let _provider: ResearchAIProvider | null = null;

function getProvider(): ResearchAIProvider {
  if (!_provider) {
    _provider = createResearchProvider({
      endpoint: process.env.RESEARCH_AI_ENDPOINT,
      apiKey: process.env.RESEARCH_AI_API_KEY,
      model: process.env.RESEARCH_AI_MODEL,
    });
  }
  return _provider;
}

// ─── Create Research Request ─────────────────────────────────────────────────

export interface CreateResearchRequestInput {
  tenantId: string;
  userId?: string;
  question: string;
  questionType?: string;
  productId?: string;
  market?: string;
  country?: string;
  timePeriodStart?: Date;
  timePeriodEnd?: Date;
  researchObjective?: string;
  constraints?: string[];
  requiredEvidenceQuality?: string;
  requestedDepth?: string;
  priority?: number;
}

export async function createResearchRequest(
  input: CreateResearchRequestInput,
): Promise<{ id: string; status: string; inputHash: string }> {
  const { tenantId, question } = input;
  const questionType = input.questionType ?? "GENERAL";
  const productId = input.productId ?? null;
  const market = input.market ?? null;
  const country = input.country ?? null;
  const depth = input.requestedDepth ?? "standard";

  // Compute hashes
  const contentHash = computeResearchRequestHash({
    tenantId,
    question,
    questionType,
    productId,
    market,
    country,
    researchObjective: input.researchObjective ?? null,
    requiredEvidenceQuality: input.requiredEvidenceQuality ?? "MEDIUM",
    requestedDepth: depth,
  });

  const inputHash = computeResearchInputHash({
    tenantId,
    question,
    questionType,
    productId,
    market,
    country,
  });

  const cacheKey = computeResearchCacheKey({
    tenantId,
    question,
    questionType,
    productId,
    market,
    country,
    requiredEvidenceQuality: input.requiredEvidenceQuality ?? "MEDIUM",
    requestedDepth: depth,
    promptVersion: RESEARCH_CONFIG.promptVersion,
  });

  // Check for cached result (same input within TTL)
  const cached = await prisma.researchRequest.findFirst({
    where: {
      tenantId,
      cacheKey,
      status: "COMPLETED",
      createdAt: {
        gte: new Date(Date.now() - RESEARCH_CONFIG.cacheTtlSeconds * 1000),
      },
    },
    select: { id: true, inputHash: true, status: true },
  });

  if (cached) {
    logger.info({ tenantId, cachedId: cached.id }, "research_request_cache_hit");
    return { id: cached.id, status: cached.status, inputHash: cached.inputHash };
  }

  // Apply depth preset limits
  const preset = getDepthPreset(depth);

  const request = await prisma.researchRequest.create({
    data: {
      tenantId,
      userId: input.userId ?? null,
      question,
      questionType: questionType as never,
      productId: productId ?? undefined,
      market: market ?? undefined,
      country: country ?? undefined,
      timePeriodStart: input.timePeriodStart ?? null,
      timePeriodEnd: input.timePeriodEnd ?? null,
      researchObjective: input.researchObjective ?? null,
      constraints: input.constraints ?? [],
      requiredEvidenceQuality: (input.requiredEvidenceQuality ?? "MEDIUM") as never,
      requestedDepth: depth,
      priority: input.priority ?? 5,
      maxIterations: preset.maxIterations,
      maxModelCalls: RESEARCH_CONFIG.maxModelCalls,
      maxEvidenceItems: preset.maxEvidenceItems,
      maxSubQuestions: preset.maxSubQuestions,
      maxTokenUsage: RESEARCH_CONFIG.maxTokenUsage,
      contentHash,
      inputHash,
      cacheKey,
    },
    select: { id: true, status: true, inputHash: true },
  });

  logger.info({ tenantId, requestId: request.id, questionType, depth }, "research_request_created");

  return request;
}

// ─── Execute Research ────────────────────────────────────────────────────────

/**
 * Execute the full research workflow for a queued request.
 * Called by the worker processor.
 */
export async function executeResearch(requestId: string): Promise<{
  status: string;
  confidence: number;
  completeness: number;
  subQuestions: number;
  evidenceItems: number;
  contradictions: number;
  hypotheses: number;
  gaps: number;
  modelCalls: number;
  durationMs: number;
}> {
  const startTime = Date.now();

  // Load request
  const request = await prisma.researchRequest.findUnique({
    where: { id: requestId },
    include: {
      subQuestions: true,
      evidenceItems: true,
      contradictions: true,
      hypotheses: true,
      gaps: true,
    },
  });

  if (!request) {
    throw new NotFoundError("ResearchRequest", requestId);
  }

  const { tenantId } = request;
  const provider = getProvider();
  let modelCalls = request.modelCallsMade;

  logger.info({ tenantId, requestId }, "research_execution_started");

  // Update status to PLANNING
  await prisma.researchRequest.update({
    where: { id: requestId },
    data: { status: "PLANNING", startedAt: new Date() },
  });

  try {
    // ─── Step 1: Question Classification ──────────────────────────────────
    let classifiedType = request.questionType;
    if (provider.available) {
      const classification = await provider.generateStructured({
        systemPrompt: "You are a research question classifier for a product intelligence platform. Classify the question type and identify key entities.",
        userPrompt: `Classify this research question:\n\nQuestion: "${request.question}"\nProduct ID: ${request.productId ?? "none"}\nMarket: ${request.market ?? "none"}\nCountry: ${request.country ?? "none"}`,
        responseSchema: questionClassificationSchema,
        temperature: 0.1,
        maxTokens: 500,
      });

      if (classification.success && classification.data) {
        classifiedType = classification.data.questionType as never;
        modelCalls++;
        if (classification.tokenUsage) {
          await prisma.researchRequest.update({
            where: { id: requestId },
            data: { tokenUsageEstimated: { increment: classification.tokenUsage.totalTokens } },
          });
        }
      }
    }

    // ─── Step 2: Question Decomposition ───────────────────────────────────
    await prisma.researchRequest.update({
      where: { id: requestId },
      data: { status: "RESEARCHING", questionType: classifiedType },
    });

    const subQuestions = await decomposeQuestion(requestId, tenantId, request, provider, classifiedType);
    modelCalls += subQuestions.modelCallsUsed;

    // ─── Step 3: Evidence Retrieval ───────────────────────────────────────
    const evidenceResult = await retrieveEvidence(requestId, tenantId, request, subQuestions.subQuestionIds);

    // ─── Step 4: Evidence Quality Assessment ──────────────────────────────
    const qualityAssessments = await assessAllEvidenceQuality(
      requestId,
      tenantId,
      evidenceResult.evidenceItems,
      new Date(),
    );

    // ─── Step 5: Contradiction Detection ──────────────────────────────────
    const contradictions = await detectAndPersistContradictions(
      requestId,
      tenantId,
      evidenceResult.evidenceBySubject,
    );

    // ─── Step 6: Hypothesis Generation & Evaluation ───────────────────────
    const hypothesesResult = await generateAndEvaluateHypotheses(
      requestId,
      tenantId,
      request,
      evidenceResult.evidenceItems,
      contradictions,
      provider,
    );
    modelCalls += hypothesesResult.modelCallsUsed;

    // ─── Step 7: Research Gap Detection ───────────────────────────────────
    const gaps = await detectAndPersistGaps(
      requestId,
      tenantId,
      subQuestions.subQuestionInputs,
      evidenceResult.evidenceItems,
      request.questionType,
    );

    // ─── Step 8: Synthesis ────────────────────────────────────────────────
    await prisma.researchRequest.update({
      where: { id: requestId },
      data: { status: "SYNTHESIZING" },
    });

    const synthesis = await synthesizeResults(
      requestId,
      tenantId,
      request,
      subQuestions.subQuestionInputs,
      evidenceResult.evidenceItems,
      contradictions,
      hypothesesResult.hypothesisInputs,
      gaps,
      qualityAssessments,
      provider,
    );
    modelCalls += synthesis.modelCallsUsed;

    // ─── Step 9: Confidence & Completeness ────────────────────────────────
    const confidence = calculateConfidence(
      evidenceResult.evidenceItems,
      subQuestions.subQuestionInputs,
      contradictions.map((c) => c.detection as import("./research-engine.js").ContradictionDetection),
      hypothesesResult.hypothesisInputs,
      new Date(),
    );

    const completeness = calculateCompleteness(
      subQuestions.subQuestionInputs,
      evidenceResult.evidenceItems,
      contradictions.map((c) => c.detection as import("./research-engine.js").ContradictionDetection),
      hypothesesResult.hypothesisInputs,
      request.questionType,
    );

    // ─── Step 10: Persist Result ──────────────────────────────────────────
    const durationMs = Date.now() - startTime;

    const resultContentHash = computeResearchResultHash({
      requestId,
      totalSubQuestions: subQuestions.subQuestionInputs.length,
      completedSubQuestions: subQuestions.subQuestionInputs.filter((sq) => sq.status === "COMPLETED").length,
      totalEvidenceItems: evidenceResult.evidenceItems.length,
      contradictionsFound: contradictions.filter((c) => c.detection.detected).length,
      hypothesesEvaluated: hypothesesResult.hypothesisInputs.length,
      gapsIdentified: gaps.length,
      researchIterations: request.currentIteration + 1,
    });

    const resultInputHash = computeResearchInputHash({
      tenantId,
      question: request.question,
      questionType: request.questionType,
      productId: request.productId,
      market: request.market,
      country: request.country,
    });

    await prisma.researchResult.create({
      data: {
        tenantId,
        requestId,
        summary: synthesis.summary,
        detailedFindings: JSON.parse(JSON.stringify(synthesis.detailedFindings)),
        conclusions: JSON.parse(JSON.stringify(synthesis.conclusions)),
        keyInsights: JSON.parse(JSON.stringify(synthesis.keyInsights)),
        overallConfidence: confidence.overallConfidence,
        completenessScore: completeness.overallCompleteness,
        limitations: JSON.parse(JSON.stringify(synthesis.limitations)),
        furtherResearchNeeded: JSON.parse(JSON.stringify(synthesis.furtherResearchNeeded)),
        priorityActions: JSON.parse(JSON.stringify(synthesis.priorityActions)),
        totalSubQuestions: subQuestions.subQuestionInputs.length,
        completedSubQuestions: subQuestions.subQuestionInputs.filter((sq) => sq.status === "COMPLETED").length,
        totalEvidenceItems: evidenceResult.evidenceItems.length,
        highQualityEvidence: qualityAssessments.filter((a) => a.qualityClassification === "HIGH").length,
        contradictionsFound: contradictions.filter((c) => c.detection.detected).length,
        hypothesesEvaluated: hypothesesResult.hypothesisInputs.length,
        gapsIdentified: gaps.length,
        researchIterations: request.currentIteration + 1,
        contentHash: resultContentHash,
        inputHash: resultInputHash,
      },
    });

    // Update request status
    const hasBlockingGaps = gaps.some((g) => g.isBlocking);
    const finalStatus = hasBlockingGaps ? "PARTIAL" : "COMPLETED";

    await prisma.researchRequest.update({
      where: { id: requestId },
      data: {
        status: finalStatus as never,
        currentIteration: { increment: 1 },
        modelCallsMade: modelCalls,
        evidenceItemsConsidered: evidenceResult.evidenceItems.length,
        subQuestionsGenerated: subQuestions.subQuestionInputs.length,
        overallConfidence: confidence.overallConfidence,
        completenessScore: completeness.overallCompleteness,
        completedAt: new Date(),
        executionDurationMs: durationMs,
        providerName: provider.name,
        providerModel: provider.available ? (provider as { modelId?: string }).modelId ?? null : null,
      },
    });

    logger.info(
      { tenantId, requestId, status: finalStatus, confidence: confidence.overallConfidence, durationMs },
      "research_execution_completed",
    );

    return {
      status: finalStatus,
      confidence: confidence.overallConfidence,
      completeness: completeness.overallCompleteness,
      subQuestions: subQuestions.subQuestionInputs.length,
      evidenceItems: evidenceResult.evidenceItems.length,
      contradictions: contradictions.filter((c) => c.detection.detected).length,
      hypotheses: hypothesesResult.hypothesisInputs.length,
      gaps: gaps.length,
      modelCalls,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await prisma.researchRequest.update({
      where: { id: requestId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: errorMessage,
        executionDurationMs: durationMs,
        modelCallsMade: modelCalls,
      },
    });

    logger.error({ tenantId, requestId, error: errorMessage, durationMs }, "research_execution_failed");
    throw error;
  }
}

// ─── Question Decomposition ──────────────────────────────────────────────────

async function decomposeQuestion(
  requestId: string,
  tenantId: string,
  request: { question: string; productId: string | null; market: string | null; country: string | null; maxSubQuestions: number },
  provider: ResearchAIProvider,
  questionType: string,
): Promise<{
  subQuestionIds: string[];
  subQuestionInputs: SubQuestionInput[];
  modelCallsUsed: number;
}> {
  let modelCallsUsed = 0;
  const subQuestions: SubQuestionInput[] = [];

  if (provider.available) {
    const decomposition = await provider.generateStructured({
      systemPrompt: "You are a research planner for a product intelligence platform. Decompose complex questions into independently researchable sub-questions.",
      userPrompt: `Decompose this research question into sub-questions:\n\nMain question: "${request.question}"\nQuestion type: ${questionType}\nProduct: ${request.productId ?? "not specified"}\nMarket: ${request.market ?? "not specified"}\nCountry: ${request.country ?? "not specified"}\n\nGenerate at most ${request.maxSubQuestions} sub-questions.`,
      responseSchema: questionDecompositionSchema,
      temperature: 0.2,
      maxTokens: 2000,
    });

    if (decomposition.success && decomposition.data) {
      modelCallsUsed++;
      const limitedSubQs = decomposition.data.subquestions.slice(0, request.maxSubQuestions);

      for (let i = 0; i < limitedSubQs.length; i++) {
        const sq = limitedSubQs[i]!;
        const contentHash = computeSubQuestionHash({
          requestId,
          question: sq.question,
          questionType: sq.questionType,
          sequence: i + 1,
        });

        const created = await prisma.researchSubQuestion.create({
          data: {
            tenantId,
            requestId,
            sequence: i + 1,
            question: sq.question,
            questionType: sq.questionType as never,
            priority: sq.priority,
            dependsOn: sq.dependsOn,
            contentHash,
          },
        });

        subQuestions.push({
          id: created.id,
          question: created.question,
          questionType: created.questionType,
          sequence: created.sequence,
          status: "PENDING",
          evidenceFound: 0,
          answerConfidence: 0,
          isDependencyMet: sq.dependsOn.length === 0,
        });
      }

      // Store research plan
      await prisma.researchRequest.update({
        where: { id: requestId },
        data: {
          researchPlan: JSON.parse(JSON.stringify({
            strategy: decomposition.data.researchStrategy,
            complexity: decomposition.data.estimatedComplexity,
            subQuestionCount: limitedSubQs.length,
          })),
          planVersion: { increment: 1 },
          subQuestionsGenerated: limitedSubQs.length,
        },
      });
    }
  }

  // If AI provider unavailable or failed, create default sub-questions based on question type
  if (subQuestions.length === 0) {
    const defaults = getDefaultSubQuestions(questionType, request.question);
    for (let i = 0; i < defaults.length && i < request.maxSubQuestions; i++) {
      const contentHash = computeSubQuestionHash({
        requestId,
        question: defaults[i]!.question,
        questionType: defaults[i]!.questionType,
        sequence: i + 1,
      });

      const created = await prisma.researchSubQuestion.create({
        data: {
          tenantId,
          requestId,
          sequence: i + 1,
          question: defaults[i]!.question,
          questionType: defaults[i]!.questionType as never,
          priority: defaults[i]!.priority,
          contentHash,
        },
      });

      subQuestions.push({
        id: created.id,
        question: created.question,
        questionType: created.questionType,
        sequence: created.sequence,
        status: "PENDING",
        evidenceFound: 0,
        answerConfidence: 0,
        isDependencyMet: true,
      });
    }

    await prisma.researchRequest.update({
      where: { id: requestId },
      data: {
        researchPlan: JSON.parse(JSON.stringify({ strategy: "default_decomposition", subQuestionCount: subQuestions.length })),
        planVersion: { increment: 1 },
        subQuestionsGenerated: subQuestions.length,
      },
    });
  }

  return {
    subQuestionIds: subQuestions.map((sq) => sq.id),
    subQuestionInputs: subQuestions,
    modelCallsUsed,
  };
}

function getDefaultSubQuestions(
  questionType: string,
  question: string,
): Array<{ question: string; questionType: string; priority: number }> {
  // Provide sensible defaults based on question type
  const base = [
    { question: `What is the exact subject of: "${question}"?`, questionType: "IDENTITY", priority: 1 },
  ];

  switch (questionType) {
    case "SUPPLIER":
      return [
        ...base,
        { question: "What suppliers are available for this product?", questionType: "SUPPLIER", priority: 2 },
        { question: "What evidence supports supplier legitimacy?", questionType: "SUPPLIER", priority: 3 },
        { question: "What are the supplier pricing observations?", questionType: "PRICING", priority: 4 },
      ];
    case "PRICING":
      return [
        ...base,
        { question: "What price observations exist?", questionType: "PRICING", priority: 2 },
        { question: "What are the cost components?", questionType: "PRICING", priority: 3 },
        { question: "What is the landed cost?", questionType: "PRICING", priority: 4 },
      ];
    case "DEMAND":
      return [
        ...base,
        { question: "What demand signals exist?", questionType: "DEMAND", priority: 2 },
        { question: "What is the market trend?", questionType: "DEMAND", priority: 3 },
        { question: "What competition exists?", questionType: "COMPETITION", priority: 4 },
      ];
    case "LOGISTICS":
      return [
        ...base,
        { question: "What shipping routes exist?", questionType: "LOGISTICS", priority: 2 },
        { question: "What are the logistics costs?", questionType: "LOGISTICS", priority: 3 },
        { question: "What are the transit times?", questionType: "LOGISTICS", priority: 4 },
      ];
    case "FEASIBILITY":
      return [
        ...base,
        { question: "What supplier options exist?", questionType: "SUPPLIER", priority: 2 },
        { question: "What are the costs?", questionType: "PRICING", priority: 3 },
        { question: "What demand evidence exists?", questionType: "DEMAND", priority: 4 },
        { question: "What logistics options exist?", questionType: "LOGISTICS", priority: 5 },
        { question: "What regulatory requirements apply?", questionType: "REGULATORY", priority: 6 },
      ];
    default:
      return [
        ...base,
        { question: "What evidence exists for this question?", questionType: "GENERAL", priority: 2 },
        { question: "What is uncertain or contradictory?", questionType: "GENERAL", priority: 3 },
      ];
  }
}

// ─── Evidence Retrieval ──────────────────────────────────────────────────────

async function retrieveEvidence(
  requestId: string,
  tenantId: string,
  request: { productId: string | null; market: string | null; country: string | null; maxEvidenceItems: number },
  _subQuestionIds: string[],
): Promise<{
  evidenceItems: EvidenceItemInput[];
  evidenceBySubject: ContradictionCandidate[];
}> {
  const evidenceItems: EvidenceItemInput[] = [];

  // Load existing Phase 6 Evidence
  if (request.productId) {
    const phase6Evidence = await prisma.evidence.findMany({
      where: { tenantId, productId: request.productId, status: "active" },
      take: request.maxEvidenceItems,
    });

    for (const ev of phase6Evidence) {
      evidenceItems.push({
        id: ev.id,
        title: ev.title || ev.evidenceType,
        description: ev.description ?? `Evidence: ${ev.evidenceType}`,
        sourceType: "EXISTING_EVIDENCE",
        sourceEntity: ev.evidenceType,
        sourceEntityId: ev.id,
        extractedValue: ev.extractedValue ?? ev.normalizedValue,
        valueType: ev.valueType,
        observedAt: ev.observedAt,
        sourceIndependence: true,
        quality: "HIGH",
        relevanceScore: 0.8,
        wasUsed: true,
      });
    }
  }

  // Load Phase 7 demand calculations
  if (request.productId) {
    const demandCalcs = await prisma.demandCalculation.findMany({
      where: { tenantId, productId: request.productId },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    for (const dc of demandCalcs) {
      evidenceItems.push({
        id: `demand_calc_${dc.id}`,
        title: `Demand Calculation: ${dc.calculationType}`,
        description: `Demand ${dc.calculationType}: ${dc.resultSummary ?? "calculated"}`,
        sourceType: "INTELLIGENCE_RESULT",
        sourceEntity: "demand_calculation",
        sourceEntityId: dc.id,
        extractedValue: dc.result,
        valueType: "json",
        observedAt: dc.calculatedAt,
        sourceIndependence: true,
        quality: "HIGH",
        relevanceScore: 0.7,
        wasUsed: true,
      });
    }
  }

  // Load Phase 11 pricing data
  if (request.productId) {
    const priceObs = await prisma.priceObservation.findMany({
      where: { tenantId, productId: request.productId },
      take: 10,
    });

    for (const po of priceObs) {
      evidenceItems.push({
        id: `price_obs_${po.id}`,
        title: `Price Observation: ${po.observationType}`,
        description: `${po.price} ${po.currency} (${po.sourceType})`,
        sourceType: "EXISTING_EVIDENCE",
        sourceEntity: "price_observation",
        sourceEntityId: po.id,
        extractedValue: po.price,
        valueType: "currency",
        observedAt: po.observedAt,
        sourceIndependence: true,
        quality: "HIGH",
        relevanceScore: 0.9,
        wasUsed: true,
      });
    }
  }

  // Load Phase 9 supply chain data
  if (request.productId) {
    const scNodes = await prisma.supplyChainNode.findMany({
      where: { tenantId },
      take: 5,
    });

    for (const node of scNodes) {
      evidenceItems.push({
        id: `sc_node_${node.id}`,
        title: `Supply Chain Node: ${node.nodeType}`,
        description: `${node.nodeType} - ${node.name}`,
        sourceType: "INTELLIGENCE_RESULT",
        sourceEntity: "supply_chain_node",
        sourceEntityId: node.id,
        extractedValue: node.name,
        valueType: "string",
        observedAt: node.createdAt,
        sourceIndependence: true,
        quality: "MEDIUM",
        relevanceScore: 0.6,
        wasUsed: true,
      });
    }
  }

  // Persist evidence items
  for (const item of evidenceItems.slice(0, request.maxEvidenceItems)) {
    const contentHash = computeEvidenceItemHash({
      requestId,
      title: item.title,
      description: item.description,
      sourceType: item.sourceType,
      sourceEntityId: item.sourceEntityId,
      observedAt: item.observedAt?.toISOString() ?? null,
    });

    await prisma.researchEvidenceItem.create({
      data: {
        tenantId,
        requestId,
        title: item.title,
        description: item.description,
        sourceType: item.sourceType as never,
        sourceEntity: item.sourceEntity,
        sourceEntityId: item.sourceEntityId,
        evidenceId: item.sourceType === "EXISTING_EVIDENCE" ? item.sourceEntityId : null,
        extractedValue: item.extractedValue ?? undefined,
        valueType: item.valueType,
        quality: item.quality as never,
        confidence: item.relevanceScore,
        sourceIndependence: item.sourceIndependence,
        observedAt: item.observedAt,
        temporalClassification: "UNKNOWN",
        freshness: "unknown",
        relevanceScore: item.relevanceScore,
        wasUsed: item.wasUsed,
        contentHash,
      },
    });
  }

  // Update request counter
  await prisma.researchRequest.update({
    where: { id: requestId },
    data: { evidenceItemsConsidered: Math.min(evidenceItems.length, request.maxEvidenceItems) },
  });

  // Group evidence by subject for contradiction detection
  const bySubject = new Map<string, EvidenceItemInput[]>();
  for (const item of evidenceItems) {
    const subject = item.sourceEntity ?? item.valueType;
    if (!bySubject.has(subject)) {
      bySubject.set(subject, []);
    }
    bySubject.get(subject)!.push(item);
  }

  const evidenceBySubject: ContradictionCandidate[] = [];
  for (const [subject, items] of bySubject) {
    if (items.length >= 2) {
      evidenceBySubject.push({ subject, evidenceItems: items });
    }
  }

  return { evidenceItems, evidenceBySubject };
}

// ─── Evidence Quality Assessment ─────────────────────────────────────────────

async function assessAllEvidenceQuality(
  requestId: string,
  tenantId: string,
  evidenceItems: EvidenceItemInput[],
  referenceDate: Date,
): Promise<Array<{ evidenceId: string; qualityClassification: string }>> {
  const assessments: Array<{ evidenceId: string; qualityClassification: string }> = [];

  for (const item of evidenceItems) {
    const assessment = assessEvidenceQuality(item, referenceDate, evidenceItems);
    assessments.push({
      evidenceId: item.id,
      qualityClassification: assessment.qualityClassification,
    });

    // Update the evidence item with quality assessment
    await prisma.researchEvidenceItem.updateMany({
      where: { tenantId, requestId, sourceEntityId: item.sourceEntityId },
      data: {
        quality: assessment.qualityClassification as never,
        confidence: assessment.overallQualityScore,
        temporalClassification: assessment.temporalClassification as never,
        freshness: assessment.freshnessLabel,
      },
    });
  }

  return assessments;
}

// ─── Contradiction Detection ─────────────────────────────────────────────────

async function detectAndPersistContradictions(
  requestId: string,
  tenantId: string,
  candidates: ContradictionCandidate[],
): Promise<Array<{ detection: import("./research-engine.js").ContradictionDetection; hash: string }>> {
  const detections = detectContradictions(candidates);
  const results: Array<{ detection: import("./research-engine.js").ContradictionDetection; hash: string }> = [];

  for (const detection of detections) {
    if (!detection.detected) continue;

    const contentHash = computeContradictionHash({
      requestId,
      subject: detection.subject,
      evidenceItemIds: detection.evidenceItemIds,
    });

    await prisma.researchContradiction.create({
      data: {
        tenantId,
        requestId,
        subject: detection.subject,
        description: detection.explanation ?? `Contradiction detected for ${detection.subject}`,
        severity: detection.severity,
        evidenceItemIds: detection.evidenceItemIds,
        conflictingValues: JSON.parse(JSON.stringify(detection.conflictingValues)),
        resolutionStatus: "OPEN",
        resolutionRequires: detection.resolutionRequires,
        contentHash,
      },
    });

    results.push({ detection, hash: contentHash });
  }

  return results;
}

// ─── Hypothesis Generation & Evaluation ──────────────────────────────────────

async function generateAndEvaluateHypotheses(
  requestId: string,
  tenantId: string,
  request: { question: string; questionType: string },
  evidenceItems: EvidenceItemInput[],
  contradictions: Array<{ detection: { detected: boolean; severity: string; subject: string; evidenceItemIds: string[] } }>,
  provider: ResearchAIProvider,
): Promise<{ hypothesisInputs: HypothesisInput[]; modelCallsUsed: number }> {
  let modelCallsUsed = 0;
  const hypothesisInputs: HypothesisInput[] = [];

  // Generate hypotheses from the question type
  const defaultHypotheses = generateDefaultHypotheses(request.questionType, request.question);

  // If AI available, enhance hypotheses
  let enhancedHypotheses = defaultHypotheses;
  if (provider.available) {
    const evaluation = await provider.generateStructured({
      systemPrompt: "You are a research hypothesis evaluator. Evaluate hypotheses based on available evidence.",
      userPrompt: `Evaluate these hypotheses for the question "${request.question}":\n\n${defaultHypotheses.map((h, i) => `${i + 1}. ${h.statement} (${h.hypothesisType})`).join("\n")}\n\nEvidence available: ${evidenceItems.length} items`,
      responseSchema: hypothesisEvaluationSchema,
      temperature: 0.1,
      maxTokens: 1500,
    });

    if (evaluation.success && evaluation.data) {
      modelCallsUsed++;
      enhancedHypotheses = evaluation.data.hypotheses.map((h) => ({
        statement: h.statement,
        hypothesisType: h.hypothesisType,
        supportingEvidenceIds: evidenceItems.slice(0, 3).map((e) => e.id),
        contradictingEvidenceIds: [],
        unknowns: h.unknowns,
      }));
    }
  }

  // Persist and evaluate hypotheses
  for (const h of enhancedHypotheses) {
    const contentHash = computeHypothesisHash({
      requestId,
      statement: h.statement,
      hypothesisType: h.hypothesisType,
    });

    const hypothesisInput: HypothesisInput = {
      id: "", // will be set after creation
      statement: h.statement,
      hypothesisType: h.hypothesisType,
      supportingEvidenceIds: h.supportingEvidenceIds,
      contradictingEvidenceIds: h.contradictingEvidenceIds,
      unknowns: h.unknowns,
    };

    const created = await prisma.researchHypothesis.create({
      data: {
        tenantId,
        requestId,
        statement: h.statement,
        hypothesisType: h.hypothesisType,
        status: "UNCERTAIN",
        supportingEvidenceIds: h.supportingEvidenceIds,
        contradictingEvidenceIds: h.contradictingEvidenceIds,
        unknowns: h.unknowns,
        contentHash,
      },
    });

    hypothesisInput.id = created.id;
    hypothesisInputs.push(hypothesisInput);

    // Run deterministic evaluation
    const evalResult = evaluateHypothesis(
      hypothesisInput,
      evidenceItems,
      contradictions.map((c) => ({
        subject: c.detection.subject,
        detected: c.detection.detected,
        severity: c.detection.severity as "low" | "medium" | "high" | "critical",
        conflictingValues: {},
        evidenceItemIds: c.detection.evidenceItemIds,
        explanation: null,
        resolutionRequires: null,
      })),
    );

    // Update hypothesis with evaluation result
    await prisma.researchHypothesis.update({
      where: { id: created.id },
      data: {
        status: evalResult.status as never,
        confidence: evalResult.confidence,
      },
    });
  }

  await prisma.researchRequest.update({
    where: { id: requestId },
    data: { modelCallsMade: { increment: modelCallsUsed } },
  });

  return { hypothesisInputs, modelCallsUsed };
}

function generateDefaultHypotheses(
  questionType: string,
  question: string,
): Array<{ statement: string; hypothesisType: string; supportingEvidenceIds: string[]; contradictingEvidenceIds: string[]; unknowns: string[] }> {
  switch (questionType) {
    case "FEASIBILITY":
      return [
        { statement: `The product described in "${question}" may be commercially viable for Bangladesh resale`, hypothesisType: "viability", supportingEvidenceIds: [], contradictingEvidenceIds: [], unknowns: ["Actual landed cost", "Market demand level"] },
        { statement: `Sufficient supplier options exist for the product`, hypothesisType: "feasibility", supportingEvidenceIds: [], contradictingEvidenceIds: [], unknowns: ["Supplier count", "MOQ compatibility"] },
      ];
    case "SUPPLIER":
      return [
        { statement: `Reliable suppliers exist for the product described in "${question}"`, hypothesisType: "feasibility", supportingEvidenceIds: [], contradictingEvidenceIds: [], unknowns: ["Supplier legitimacy evidence"] },
      ];
    case "PRICING":
      return [
        { statement: `Sufficient pricing evidence exists to calculate landed cost for "${question}"`, hypothesisType: "feasibility", supportingEvidenceIds: [], contradictingEvidenceIds: [], unknowns: ["Complete cost breakdown"] },
      ];
    default:
      return [
        { statement: `Available evidence is sufficient to answer: "${question}"`, hypothesisType: "feasibility", supportingEvidenceIds: [], contradictingEvidenceIds: [], unknowns: ["Evidence completeness"] },
      ];
  }
}

// ─── Research Gap Detection ──────────────────────────────────────────────────

async function detectAndPersistGaps(
  requestId: string,
  tenantId: string,
  subQuestions: SubQuestionInput[],
  evidenceItems: EvidenceItemInput[],
  questionType: string,
): Promise<Array<{ dimension: string; isBlocking: boolean }>> {
  const gaps = detectResearchGaps(subQuestions, evidenceItems, questionType);
  const results: Array<{ dimension: string; isBlocking: boolean }> = [];

  for (const gap of gaps) {
    const contentHash = computeResearchGapHash({
      requestId,
      description: gap.description,
      affectedDimension: gap.dimension,
    });

    await prisma.researchGap.create({
      data: {
        tenantId,
        requestId,
        description: gap.description,
        affectedDimension: gap.dimension,
        severity: gap.severity,
        requiredEvidenceType: gap.requiredEvidenceType,
        suggestedSource: gap.suggestedSource,
        isBlocking: gap.isBlocking,
        contentHash,
      },
    });

    results.push({ dimension: gap.dimension, isBlocking: gap.isBlocking });
  }

  return results;
}

// ─── Synthesis ───────────────────────────────────────────────────────────────

async function synthesizeResults(
  _requestId: string,
  _tenantId: string,
  request: { question: string; questionType: string },
  subQuestions: SubQuestionInput[],
  evidenceItems: EvidenceItemInput[],
  contradictions: Array<{ detection: { detected: boolean; severity: string; subject: string; evidenceItemIds: string[]; conflictingValues: Record<string, unknown>; explanation: string | null; resolutionRequires: string | null } }>,
  hypotheses: HypothesisInput[],
  gaps: Array<{ dimension: string; isBlocking: boolean }>,
  _qualityAssessments: Array<{ evidenceId: string; qualityClassification: string }>,
  provider: ResearchAIProvider,
): Promise<{
  summary: string;
  detailedFindings: Record<string, unknown>;
  conclusions: unknown[];
  keyInsights: string[];
  limitations: string[];
  furtherResearchNeeded: string[];
  priorityActions: string[];
  modelCallsUsed: number;
}> {
  let modelCallsUsed = 0;

  // Build deterministic summary
  const completedSQ = subQuestions.filter((sq) => sq.status === "COMPLETED").length;
  const totalSQ = subQuestions.length;
  const totalEvidence = evidenceItems.length;
  const totalContradictions = contradictions.filter((c) => c.detection.detected).length;
  const totalGaps = gaps.length;
  const blockingGaps = gaps.filter((g) => g.isBlocking).length;

  // Try AI synthesis
  if (provider.available) {
    const synthesis = await provider.generateStructured({
      systemPrompt: "You are a research synthesis engine. Produce a structured, evidence-backed summary of research findings. Never invent facts.",
      userPrompt: `Synthesize research results for: "${request.question}"\n\nSub-questions: ${completedSQ}/${totalSQ} completed\nEvidence items: ${totalEvidence}\nContradictions: ${totalContradictions}\nResearch gaps: ${totalGaps} (${blockingGaps} blocking)\nHypotheses: ${hypotheses.length} evaluated`,
      responseSchema: researchSynthesisSchema,
      temperature: 0.2,
      maxTokens: 2000,
    });

    if (synthesis.success && synthesis.data) {
      modelCallsUsed++;
      return {
        summary: synthesis.data.summary,
        detailedFindings: { conclusions: synthesis.data.conclusions },
        conclusions: synthesis.data.conclusions,
        keyInsights: synthesis.data.keyInsights,
        limitations: synthesis.data.limitations,
        furtherResearchNeeded: synthesis.data.furtherResearchNeeded,
        priorityActions: synthesis.data.priorityActions,
        modelCallsUsed,
      };
    }
  }

  // Fallback: deterministic synthesis (no AI)
  const summary = `Research on "${request.question}": ${completedSQ}/${totalSQ} sub-questions answered, ${totalEvidence} evidence items considered, ${totalContradictions} contradictions detected, ${totalGaps} gaps identified${blockingGaps > 0 ? ` (${blockingGaps} blocking)` : ""}.`;

  const conclusions = [{
    statement: summary,
    confidence: totalEvidence > 0 ? 0.5 : 0.1,
    evidenceBasis: evidenceItems.slice(0, 5).map((e) => e.title),
    limitations: gaps.map((g) => g.dimension),
  }];

  const keyInsights = [
    `${totalEvidence} evidence items were retrieved and assessed`,
    totalContradictions > 0 ? `${totalContradictions} contradictions require resolution` : "No contradictions detected",
    totalGaps > 0 ? `${totalGaps} research gaps identified` : "All key dimensions covered",
  ];

  const limitations = [
    ...(provider.available ? [] : ["AI provider unavailable — synthesis is deterministic fallback"]),
    ...(blockingGaps > 0 ? [`${blockingGaps} blocking gaps prevent definitive conclusions`] : []),
  ];

  const furtherResearchNeeded = gaps.map((g) => g.dimension);
  const priorityActions = blockingGaps > 0
    ? gaps.filter((g) => g.isBlocking).map((g) => `Resolve: ${g.dimension}`)
    : ["Review evidence and make decision"];

  return {
    summary,
    detailedFindings: { conclusions },
    conclusions,
    keyInsights,
    limitations,
    furtherResearchNeeded,
    priorityActions,
    modelCallsUsed,
  };
}

// ─── Query / List Functions ──────────────────────────────────────────────────

export async function listResearchRequests(params: {
  tenantId: string;
  page?: number;
  limit?: number;
  status?: string;
  questionType?: string;
}): Promise<{
  data: unknown[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const { tenantId, page = 1, limit = 20, status, questionType } = params;

  const where: Record<string, unknown> = { tenantId };
  if (status) where.status = status;
  if (questionType) where.questionType = questionType;

  const [data, total] = await Promise.all([
    prisma.researchRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.researchRequest.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getResearchRequest(params: {
  tenantId: string;
  requestId: string;
}): Promise<unknown> {
  const { tenantId, requestId } = params;

  const request = await prisma.researchRequest.findFirst({
    where: { id: requestId, tenantId },
    include: {
      subQuestions: { orderBy: { sequence: "asc" } },
      evidenceItems: { take: 50 },
      contradictions: true,
      hypotheses: true,
      gaps: true,
      results: { take: 1, orderBy: { generatedAt: "desc" } },
    },
  });

  if (!request) {
    throw new NotFoundError("ResearchRequest", requestId);
  }

  return request;
}

export async function getResearchResult(params: {
  tenantId: string;
  requestId: string;
}): Promise<unknown> {
  const { tenantId, requestId } = params;

  const result = await prisma.researchResult.findFirst({
    where: { requestId, tenantId },
    orderBy: { generatedAt: "desc" },
  });

  if (!result) {
    throw new NotFoundError("ResearchResult", `for request ${requestId}`);
  }

  return result;
}

export async function getResearchEvidence(params: {
  tenantId: string;
  requestId: string;
  page?: number;
  limit?: number;
}): Promise<{
  data: unknown[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const { tenantId, requestId, page = 1, limit = 50 } = params;

  const where = { tenantId, requestId };

  const [data, total] = await Promise.all([
    prisma.researchEvidenceItem.findMany({
      where,
      orderBy: { relevanceScore: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.researchEvidenceItem.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getResearchGaps(params: {
  tenantId: string;
  requestId: string;
}): Promise<unknown[]> {
  return prisma.researchGap.findMany({
    where: { tenantId: params.tenantId, requestId: params.requestId },
    orderBy: { severity: "asc" },
  });
}

export async function getResearchContradictions(params: {
  tenantId: string;
  requestId: string;
}): Promise<unknown[]> {
  return prisma.researchContradiction.findMany({
    where: { tenantId: params.tenantId, requestId: params.requestId },
    orderBy: { severity: "asc" },
  });
}

export async function getResearchHypotheses(params: {
  tenantId: string;
  requestId: string;
}): Promise<unknown[]> {
  return prisma.researchHypothesis.findMany({
    where: { tenantId: params.tenantId, requestId: params.requestId },
    orderBy: { confidence: "desc" },
  });
}

export async function getResearchHistory(params: {
  tenantId: string;
  productId?: string;
  page?: number;
  limit?: number;
}): Promise<{
  data: unknown[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const { tenantId, productId, page = 1, limit = 20 } = params;

  const where: Record<string, unknown> = { tenantId, status: "COMPLETED" };
  if (productId) where.productId = productId;

  const [data, total] = await Promise.all([
    prisma.researchRequest.findMany({
      where,
      orderBy: { completedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { results: { take: 1, orderBy: { generatedAt: "desc" } } },
    }),
    prisma.researchRequest.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Cancel Research Request ─────────────────────────────────────────────────

export async function cancelResearchRequest(params: {
  tenantId: string;
  requestId: string;
}): Promise<{ id: string; status: string }> {
  const { tenantId, requestId } = params;

  const request = await prisma.researchRequest.findFirst({
    where: { id: requestId, tenantId },
    select: { id: true, status: true },
  });

  if (!request) {
    throw new NotFoundError("ResearchRequest", requestId);
  }

  const cancellableStatuses = ["QUEUED", "PLANNING", "RESEARCHING", "ANALYZING"];
  if (!cancellableStatuses.includes(request.status)) {
    return { id: request.id, status: request.status };
  }

  const updated = await prisma.researchRequest.update({
    where: { id: requestId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
    select: { id: true, status: true },
  });

  logger.info({ tenantId, requestId }, "research_request_cancelled");
  return updated;
}

// ─── Expire Stale Research ───────────────────────────────────────────────────

export async function expireStaleResearch(params: {
  tenantId: string;
}): Promise<{ expiredCount: number }> {
  const { tenantId } = params;
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
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: "Research request expired — exceeded maximum age",
      },
    });
  }

  logger.info({ tenantId, expiredCount: stale.length }, "stale_research_expired");
  return { expiredCount: stale.length };
}
