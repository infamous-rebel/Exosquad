// =============================================================================
// Worker — Supplier Outreach Intelligence Processor (Phase 15)
// =============================================================================
// Processes outreach job types: generate-draft, extract-response,
// analyze-response, verify-claim, qualify, recalculate, expire.
// Self-contained — does not import API-layer code.
// =============================================================================

import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { OUTREACH_CONFIG } from "@exosquad/common";

// ─── Job Data Types ──────────────────────────────────────────────────────────

interface OutreachGenerateDraftJob {
  type: "outreach:generate-draft";
  tenantId: string;
  outreachId: string;
  templateType: string;
  triggeredBy: string;
}

interface OutreachExtractResponseJob {
  type: "outreach:extract-response";
  tenantId: string;
  responseId: string;
  triggeredBy: string;
}

interface OutreachAnalyzeResponseJob {
  type: "outreach:analyze-response";
  tenantId: string;
  outreachId: string;
  triggeredBy: string;
}

interface OutreachVerifyClaimJob {
  type: "outreach:verify-claim";
  tenantId: string;
  outreachId: string;
  claimField: string;
  claimValue: string;
  triggeredBy: string;
}

interface OutreachQualifyJob {
  type: "outreach:qualify";
  tenantId: string;
  outreachId: string;
  triggeredBy: string;
}

interface OutreachRecalculateJob {
  type: "outreach:recalculate";
  tenantId: string;
  outreachId: string;
  productId: string;
  triggeredBy: string;
}

interface OutreachExpireJob {
  type: "outreach:expire";
  tenantId: string;
  triggeredBy: string;
}

type OutreachJob =
  | OutreachGenerateDraftJob
  | OutreachExtractResponseJob
  | OutreachAnalyzeResponseJob
  | OutreachVerifyClaimJob
  | OutreachQualifyJob
  | OutreachRecalculateJob
  | OutreachExpireJob;

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

// ─── Engine Functions (inlined for self-contained worker) ────────────────────

function isValidTransition(from: string, to: string): boolean {
  const allowed = OUTREACH_CONFIG.validTransitions[from as keyof typeof OUTREACH_CONFIG.validTransitions];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ─── Job Processors ──────────────────────────────────────────────────────────

async function processGenerateDraft(job: OutreachGenerateDraftJob): Promise<void> {
  const { tenantId, outreachId, templateType } = job;
  logger.info({ tenantId, outreachId, templateType }, "outreach_generate_draft_started");

  const outreach = await prisma.outreach.findFirst({
    where: { id: outreachId, tenantId },
    include: {
      supplier: true,
      product: { include: { identifiers: true } },
    },
  });

  if (!outreach) {
    logger.warn({ tenantId, outreachId }, "outreach_generate_draft_outreach_not_found");
    return;
  }

  // Generate a structured draft based on template type
  const draftBody = generateStructuredDraft(outreach.supplier.name, outreach.product.name, templateType, outreach.product.identifiers);

  // Create the message record
  const contentHash = sha256(stableStringify({
    outreachId,
    direction: "OUTBOUND",
    channel: outreach.channel,
    bodyText: draftBody,
    templateType,
  }));

  await prisma.outreachMessage.create({
    data: {
      tenantId,
      outreachId,
      direction: "OUTBOUND",
      channel: outreach.channel as never,
      bodyText: draftBody,
      templateType: templateType as never,
      aiGenerated: true,
      contentHash,
    },
  });

  // Transition to READY if currently DRAFT
  if (outreach.status === "DRAFT" && isValidTransition("DRAFT", "READY")) {
    await prisma.outreach.update({
      where: { id: outreachId },
      data: { status: "READY" as never },
    });
  }

  // Thread event
  await prisma.outreachThreadEvent.create({
    data: {
      tenantId,
      outreachId,
      eventType: "MESSAGE_SENT",
      eventData: { type: "draft_generated", templateType },
      actorType: "AI",
    },
  });

  logger.info({ tenantId, outreachId }, "outreach_generate_draft_completed");
}

function generateStructuredDraft(
  supplierName: string,
  productName: string,
  templateType: string,
  identifiers: Array<{ type: string; value: string }>,
): string {
  const skuInfo = identifiers.length > 0
    ? `\nProduct identifiers: ${identifiers.map((i) => `${i.type}: ${i.value}`).join(", ")}`
    : "";

  switch (templateType) {
    case "INITIAL_INQUIRY":
      return `Dear ${supplierName},\n\nWe are interested in sourcing "${productName}" for the Bangladesh market.${skuInfo}\n\nPlease provide the following information:\n1. Exact SKU/model available\n2. Unit price and volume tiers\n3. Minimum order quantity (MOQ)\n4. Sample availability and pricing\n5. Production lead time\n6. Production capacity\n7. Available Incoterms\n8. Payment terms\n9. Certifications held\n10. Export capability to Bangladesh\n\nWe look forward to your response.\n\nBest regards`;

    case "SUPPLIER_VERIFICATION":
      return `Dear ${supplierName},\n\nWe are conducting supplier verification for "${productName}".${skuInfo}\n\nPlease provide:\n1. Legal company name and registration details\n2. Manufacturing/factory location\n3. Business registration certificate\n4. Export history and references\n5. Relevant certifications\n6. Website and contact information\n\nThank you for your cooperation.`;

    case "LOGISTICS_INQUIRY":
      return `Dear ${supplierName},\n\nRegarding logistics for "${productName}":${skuInfo}\n\nPlease provide:\n1. Shipping origin port/location\n2. Available Incoterms (FOB, CIF, etc.)\n3. Carton dimensions and gross weight\n4. Estimated production lead time\n5. Available shipping options\n6. Export documentation provided\n\nThank you.`;

    default:
      return `Dear ${supplierName},\n\nRegarding "${productName}":${skuInfo}\n\nWe would appreciate your response to our inquiry.\n\nBest regards`;
  }
}

async function processExtractResponse(job: OutreachExtractResponseJob): Promise<void> {
  const { tenantId, responseId } = job;
  logger.info({ tenantId, responseId }, "outreach_extract_response_started");

  const response = await prisma.outreachResponse.findFirst({
    where: { id: responseId, tenantId },
    include: { outreach: { select: { id: true, supplierId: true } } },
  });

  if (!response) {
    logger.warn({ tenantId, responseId }, "outreach_extract_response_not_found");
    return;
  }

  // In a real implementation, this would call the AI provider to extract fields.
  // For now, we mark the response as processed and create a thread event.
  await prisma.outreachThreadEvent.create({
    data: {
      tenantId,
      outreachId: response.outreachId,
      eventType: "FIELD_EXTRACTED",
      eventData: { responseId, status: "extraction_queued" },
      actorType: "AI",
    },
  });

  logger.info({ tenantId, responseId }, "outreach_extract_response_completed");
}

async function processAnalyzeResponse(job: OutreachAnalyzeResponseJob): Promise<void> {
  const { tenantId, outreachId } = job;
  logger.info({ tenantId, outreachId }, "outreach_analyze_response_started");

  const outreach = await prisma.outreach.findFirst({
    where: { id: outreachId, tenantId },
    include: {
      responses: {
        include: { extractedFields: true },
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!outreach || outreach.responses.length === 0) {
    logger.warn({ tenantId, outreachId }, "outreach_analyze_response_no_response_found");
    return;
  }

  // Load existing intelligence for comparison
  const existingProductSuppliers = await prisma.productSupplier.findMany({
    where: { tenantId, productId: outreach.productId, supplierId: outreach.supplierId },
    select: { moq: true, price: true, leadTimeDays: true },
  });

  const extractedFields = outreach.responses[0]?.extractedFields ?? [];
  let contradictionsFound = 0;

  for (const field of extractedFields) {
    let existingValue: number | null = null;

    if (field.fieldName === "moq") existingValue = existingProductSuppliers[0]?.moq ?? null;
    if (field.fieldName === "unit_price") existingValue = existingProductSuppliers[0]?.price?.toNumber() ?? null;
    if (field.fieldName === "lead_time") existingValue = existingProductSuppliers[0]?.leadTimeDays ?? null;

    if (existingValue !== null && field.valueType === "number") {
      const extractedNum = parseFloat(field.fieldValue);
      if (!isNaN(extractedNum)) {
        const tolerance = OUTREACH_CONFIG.contradictionThresholds.numericTolerancePercent;
        const percentDiff = Math.abs(extractedNum - existingValue) / Math.abs(existingValue);
        if (percentDiff > tolerance) {
          await prisma.outreachExtractedField.update({
            where: { id: field.id },
            data: { verificationState: "CONTRADICTED" },
          });
          contradictionsFound++;
        }
      }
    }
  }

  await prisma.outreachThreadEvent.create({
    data: {
      tenantId,
      outreachId,
      eventType: "FIELD_EXTRACTED",
      eventData: { status: "analysis_completed", contradictionsFound },
      actorType: "SYSTEM",
    },
  });

  logger.info({ tenantId, outreachId, contradictionsFound }, "outreach_analyze_response_completed");
}

async function processVerifyClaim(job: OutreachVerifyClaimJob): Promise<void> {
  const { tenantId, outreachId, claimField, claimValue } = job;
  logger.info({ tenantId, outreachId, claimField }, "outreach_verify_claim_started");

  // Create a research request via Phase 14 infrastructure
  const contentHash = sha256(stableStringify({ tenantId, outreachId, claimField, claimValue }));

  const existingRequest = await prisma.researchRequest.findFirst({
    where: { tenantId, inputHash: contentHash },
    select: { id: true },
  });

  if (existingRequest) {
    logger.info({ tenantId, existingRequestId: existingRequest.id }, "outreach_verify_claim_already_exists");
    return;
  }

  await prisma.researchRequest.create({
    data: {
      tenantId,
      question: `Verify supplier claim: ${claimField} = "${claimValue}"`,
      questionType: "SUPPLIER" as never,
      productId: null,
      status: "QUEUED" as never,
      requestedDepth: "brief",
      contentHash,
      inputHash: contentHash,
    },
  });

  await prisma.outreachThreadEvent.create({
    data: {
      tenantId,
      outreachId,
      eventType: "RESEARCH_REQUESTED",
      eventData: { claimField, claimValue },
      actorType: "SYSTEM",
    },
  });

  logger.info({ tenantId, outreachId, claimField }, "outreach_verify_claim_completed");
}

async function processQualify(job: OutreachQualifyJob): Promise<void> {
  const { tenantId, outreachId } = job;
  logger.info({ tenantId, outreachId }, "outreach_qualify_started");

  const outreach = await prisma.outreach.findFirst({
    where: { id: outreachId, tenantId },
    include: {
      responses: {
        include: { extractedFields: true },
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!outreach) {
    logger.warn({ tenantId, outreachId }, "outreach_qualify_outreach_not_found");
    return;
  }

  // Calculate qualification based on available data
  const weights = OUTREACH_CONFIG.qualificationWeights;
  const dimensions: Record<string, number> = {};

  const latestResponse = outreach.responses[0];
  const fieldNames = latestResponse?.extractedFields.map((f) => f.fieldName) ?? [];

  // Set dimension scores based on available data
  dimensions.identity = 60;
  dimensions.productFit = 50;
  dimensions.price = fieldNames.includes("unit_price") ? 70 : -1;
  dimensions.moq = fieldNames.includes("moq") ? 70 : -1;
  dimensions.leadTime = fieldNames.includes("lead_time") ? 70 : -1;
  dimensions.capacity = fieldNames.includes("capacity") ? 70 : -1;
  dimensions.documentation = fieldNames.includes("certifications") ? 80 : -1;
  dimensions.exportCapability = fieldNames.includes("export_eligibility") ? 80 : -1;
  dimensions.responsiveness = latestResponse ? 80 : 30;
  dimensions.evidenceQuality = latestResponse ? 60 : 30;
  dimensions.commercialTerms = fieldNames.some((f) => ["unit_price", "moq", "payment_terms"].includes(f)) ? 70 : -1;
  dimensions.logisticsCompatibility = fieldNames.includes("production_location") ? 70 : -1;

  // Calculate weighted score (exclude unknown dimensions)
  const knownDims = Object.entries(dimensions).filter(([, v]) => v >= 0);
  const w = weights as unknown as Record<string, number>;
  const knownWeightSum = knownDims.reduce((sum, [k]) => sum + (w[k] ?? 0), 0);

  let score = 0;
  if (knownWeightSum > 0) {
    for (const [key, value] of knownDims) {
      score += (value * (w[key] ?? 0)) / knownWeightSum;
    }
  }

  score = Math.round(score * 100) / 100;
  const confidence = Math.round((knownDims.length / Object.keys(weights).length) * 100) / 100;

  const thresholds = OUTREACH_CONFIG.qualificationLevelThresholds;
  let level: string;
  if (score >= thresholds.strongMin) level = "STRONG";
  else if (score >= thresholds.qualifiedMin) level = "QUALIFIED";
  else if (score >= thresholds.conditionalMin) level = "CONDITIONAL";
  else if (score >= thresholds.weakMin) level = "WEAK";
  else level = "NOT_QUALIFIED";

  const contentHash = sha256(stableStringify({ outreachId, dimensionScores: dimensions, score, confidence }));

  // Get max version
  const latest = await prisma.outreachQualification.findFirst({
    where: { tenantId, outreachId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  await prisma.outreachQualification.create({
    data: {
      tenantId,
      outreachId,
      qualificationLevel: level as never,
      score,
      confidence,
      dimensionScores: Object.fromEntries(knownDims),
      explanations: [`Score: ${score}, Level: ${level}, Dimensions: ${knownDims.length}/${Object.keys(weights).length}`],
      contentHash,
      version: (latest?.version ?? 0) + 1,
    },
  });

  // Transition
  if (isValidTransition(outreach.status, "QUALIFICATION_REQUIRED")) {
    await prisma.outreach.update({
      where: { id: outreachId },
      data: { status: "QUALIFICATION_REQUIRED" as never },
    });
  }

  await prisma.outreachThreadEvent.create({
    data: {
      tenantId,
      outreachId,
      eventType: "QUALIFICATION_CHANGED",
      eventData: { level, score, confidence },
      actorType: "SYSTEM",
    },
  });

  logger.info({ tenantId, outreachId, level, score }, "outreach_qualify_completed");
}

async function processRecalculate(job: OutreachRecalculateJob): Promise<void> {
  const { tenantId, productId } = job;
  logger.info({ tenantId, productId }, "outreach_recalculate_started");

  // Trigger Phase 13 recalculation by enqueueing a supplier sourcing assess job
  // We don't import the API service — we enqueue directly
  // The queue manager handles this via the supplier_sourcing queue
  // For now, just log — the scheduler will pick it up
  logger.info({ tenantId, productId }, "outreach_recalculate_phase13_trigger_logged");
}

async function processExpire(job: OutreachExpireJob): Promise<void> {
  const { tenantId } = job;
  logger.info({ tenantId }, "outreach_expire_started");

  const cutoff = new Date(
    Date.now() - OUTREACH_CONFIG.stalenessThresholds.outreachExpireDays * 86400000,
  );

  const staleOutreachs = await prisma.outreach.findMany({
    where: {
      tenantId,
      status: { notIn: ["CLOSED", "QUALIFIED", "REJECTED"] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, status: true },
  });

  let expiredCount = 0;
  for (const outreach of staleOutreachs) {
    if (isValidTransition(outreach.status, "CLOSED")) {
      await prisma.outreach.update({
        where: { id: outreach.id },
        data: { status: "CLOSED" as never },
      });

      await prisma.outreachThreadEvent.create({
        data: {
          tenantId,
          outreachId: outreach.id,
          eventType: "STATUS_CHANGED",
          eventData: { from: outreach.status, to: "CLOSED", reason: "expired" },
          actorType: "WORKER",
        },
      });

      expiredCount++;
    }
  }

  logger.info({ tenantId, expiredCount }, "outreach_expire_completed");
}

// ─── Main Job Dispatcher ─────────────────────────────────────────────────────

export async function processOutreachJob(job: Job): Promise<void> {
  const data = job.data as OutreachJob;

  switch (data.type) {
    case "outreach:generate-draft":
      return processGenerateDraft(data);
    case "outreach:extract-response":
      return processExtractResponse(data);
    case "outreach:analyze-response":
      return processAnalyzeResponse(data);
    case "outreach:verify-claim":
      return processVerifyClaim(data);
    case "outreach:qualify":
      return processQualify(data);
    case "outreach:recalculate":
      return processRecalculate(data);
    case "outreach:expire":
      return processExpire(data);
    default:
      logger.warn({ jobId: job.id, type: (data as Record<string, unknown>).type }, "Unknown outreach job type");
  }
}
