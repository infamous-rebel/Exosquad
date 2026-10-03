// =============================================================================
// API — Supplier Outreach Intelligence Service (Phase 15)
// =============================================================================
// Orchestrator that manages the supplier outreach lifecycle:
//   1. Campaign creation and management
//   2. Outreach creation with state machine
//   3. AI-assisted message generation (via Phase 14 provider)
//   4. Human approval gate
//   5. Response capture with original preservation
//   6. AI-assisted response extraction
//   7. Contradiction detection against existing intelligence
//   8. Follow-up generation
//   9. Supplier qualification
//  10. Evidence integration
//  11. Phase 13 recalculation triggers
//  12. Audit trail and thread events
//
// Tenant isolation enforced at every step.
// Supplier messages treated as untrusted external input.
// AI extraction != verification.
// =============================================================================

import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import {
  NotFoundError,
  ValidationError,
  OUTREACH_CONFIG,
  OutreachStateTransitionError,
} from "@exosquad/common";
import {
  isValidTransition,
  computeMessageContentHash,
  computeResponseContentHash,
  computeExtractedFieldContentHash,
  computeFollowupContentHash,
  computeQualificationContentHash,
  calculateQualification,
  detectResponseContradictions,
  generateFollowups,
  calculateResponseConfidence,
  calculateCompleteness,
  getQuestionnaireFields,
  type ExtractedFieldRef,
  type ExistingEvidenceRef,
  type QualificationDimensionInput,
} from "./outreach-engine.js";

// ─── Input / Result Types ────────────────────────────────────────────────────

export interface CreateCampaignInput {
  tenantId: string;
  productId: string;
  title: string;
  objective?: string;
  targetMarket?: string;
  requirements?: Record<string, unknown>;
}

export interface CreateOutreachInput {
  tenantId: string;
  campaignId?: string;
  supplierId: string;
  productId: string;
  channel?: string;
  templateType?: string;
  priority?: number;
  assignedTo?: string;
}

export interface RecordResponseInput {
  tenantId: string;
  outreachId: string;
  rawBody: string;
  rawChannel: string;
  contactPerson?: string;
  receivedAt?: Date;
}

export interface ExtractFieldInput {
  fieldName: string;
  fieldValue: string;
  valueType?: string;
}

// ─── Tenant-Isolation Guards ─────────────────────────────────────────────────

async function assertTenantEntity(
  tenantId: string,
  entityType: "product" | "supplier" | "outreach" | "campaign",
  entityId: string,
): Promise<void> {
  let found: unknown = null;

  switch (entityType) {
    case "product":
      found = await prisma.product.findFirst({ where: { id: entityId, tenantId }, select: { id: true } });
      break;
    case "supplier":
      found = await prisma.supplier.findFirst({ where: { id: entityId, tenantId }, select: { id: true } });
      break;
    case "outreach":
      found = await prisma.outreach.findFirst({ where: { id: entityId, tenantId }, select: { id: true } });
      break;
    case "campaign":
      found = await prisma.outreachCampaign.findFirst({ where: { id: entityId, tenantId }, select: { id: true } });
      break;
  }

  if (!found) {
    throw new NotFoundError(entityType.charAt(0).toUpperCase() + entityType.slice(1), entityId);
  }
}

// ─── Audit Trail Helper ──────────────────────────────────────────────────────

async function createAuditEntry(params: {
  tenantId: string;
  outreachId?: string;
  campaignId?: string;
  action: string;
  actorType: "USER" | "SYSTEM" | "AI" | "WORKER";
  actorId?: string;
  previousState?: string;
  newState?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.outreachAuditEntry.create({
    data: {
      tenantId: params.tenantId,
      outreachId: params.outreachId ?? null,
      campaignId: params.campaignId ?? null,
      action: params.action,
      actorType: params.actorType as never,
      actorId: params.actorId ?? null,
      previousState: params.previousState ?? null,
      newState: params.newState ?? null,
      metadata: (params.metadata ?? {}) as any,
    },
  });
}

// ─── Thread Event Helper ─────────────────────────────────────────────────────

async function createThreadEvent(params: {
  tenantId: string;
  outreachId: string;
  eventType: string;
  eventData?: Record<string, unknown>;
  actorType: "USER" | "SYSTEM" | "AI" | "WORKER";
  actorId?: string;
}): Promise<void> {
  await prisma.outreachThreadEvent.create({
    data: {
      tenantId: params.tenantId,
      outreachId: params.outreachId,
      eventType: params.eventType,
      eventData: (params.eventData ?? {}) as any,
      actorType: params.actorType as never,
      actorId: params.actorId ?? null,
    },
  });
}

// ─── Campaign Operations ─────────────────────────────────────────────────────

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<{ id: string; title: string; status: string }> {
  await assertTenantEntity(input.tenantId, "product", input.productId);

  const campaign = await prisma.outreachCampaign.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      title: input.title,
      objective: input.objective ?? null,
      targetMarket: input.targetMarket ?? null,
      requirements: (input.requirements ?? {}) as any,
    },
  });

  await createAuditEntry({
    tenantId: input.tenantId,
    campaignId: campaign.id,
    action: "CAMPAIGN_CREATED",
    actorType: "USER",
    newState: campaign.status,
    metadata: { title: campaign.title, productId: input.productId },
  });

  logger.info({ tenantId: input.tenantId, campaignId: campaign.id }, "outreach_campaign_created");
  return { id: campaign.id, title: campaign.title, status: campaign.status };
}

export async function listCampaigns(params: {
  tenantId: string;
  page?: number;
  limit?: number;
  productId?: string;
  status?: string;
}): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { tenantId: params.tenantId };
  if (params.productId) where.productId = params.productId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.outreachCampaign.findMany({
      where,
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.outreachCampaign.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCampaign(params: {
  tenantId: string;
  campaignId: string;
}): Promise<unknown> {
  const campaign = await prisma.outreachCampaign.findFirst({
    where: { id: params.campaignId, tenantId: params.tenantId },
    include: {
      product: { select: { id: true, name: true } },
      outreachs: {
        include: {
          supplier: { select: { id: true, name: true, country: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!campaign) throw new NotFoundError("OutreachCampaign", params.campaignId);
  return campaign;
}

// ─── Outreach Operations ─────────────────────────────────────────────────────

export async function createOutreach(
  input: CreateOutreachInput,
): Promise<{ id: string; status: string }> {
  await assertTenantEntity(input.tenantId, "product", input.productId);
  await assertTenantEntity(input.tenantId, "supplier", input.supplierId);

  if (input.campaignId) {
    await assertTenantEntity(input.tenantId, "campaign", input.campaignId);
  }

  const outreach = await prisma.outreach.create({
    data: {
      tenantId: input.tenantId,
      campaignId: input.campaignId ?? null,
      supplierId: input.supplierId,
      productId: input.productId,
      channel: (input.channel ?? "MANUAL") as never,
      templateType: (input.templateType ?? null) as never,
      priority: input.priority ?? 5,
      assignedTo: input.assignedTo ?? null,
    },
  });

  await createAuditEntry({
    tenantId: input.tenantId,
    outreachId: outreach.id,
    action: "OUTREACH_CREATED",
    actorType: "USER",
    newState: outreach.status,
    metadata: { supplierId: input.supplierId, productId: input.productId },
  });

  await createThreadEvent({
    tenantId: input.tenantId,
    outreachId: outreach.id,
    eventType: "STATUS_CHANGED",
    eventData: { from: null, to: outreach.status },
    actorType: "USER",
  });

  logger.info({ tenantId: input.tenantId, outreachId: outreach.id }, "outreach_created");
  return { id: outreach.id, status: outreach.status };
}

export async function listOutreachs(params: {
  tenantId: string;
  page?: number;
  limit?: number;
  campaignId?: string;
  supplierId?: string;
  productId?: string;
  status?: string;
}): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { tenantId: params.tenantId };
  if (params.campaignId) where.campaignId = params.campaignId;
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.productId) where.productId = params.productId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.outreach.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, country: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.outreach.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getOutreach(params: {
  tenantId: string;
  outreachId: string;
}): Promise<unknown> {
  const outreach = await prisma.outreach.findFirst({
    where: { id: params.outreachId, tenantId: params.tenantId },
    include: {
      supplier: { select: { id: true, name: true, country: true, email: true, phone: true } },
      product: { select: { id: true, name: true } },
      campaign: { select: { id: true, title: true } },
    },
  });

  if (!outreach) throw new NotFoundError("Outreach", params.outreachId);
  return outreach;
}

// ─── Message Operations ──────────────────────────────────────────────────────

export async function createMessage(params: {
  tenantId: string;
  outreachId: string;
  direction: string;
  channel: string;
  subject?: string;
  bodyText: string;
  structuredBody?: Record<string, unknown>;
  templateType?: string;
  aiGenerated?: boolean;
}): Promise<{ id: string; contentHash: string }> {
  await assertTenantEntity(params.tenantId, "outreach", params.outreachId);

  const contentHash = computeMessageContentHash({
    outreachId: params.outreachId,
    direction: params.direction,
    channel: params.channel,
    subject: params.subject ?? null,
    bodyText: params.bodyText,
    templateType: params.templateType ?? null,
  });

  const message = await prisma.outreachMessage.create({
    data: {
      tenantId: params.tenantId,
      outreachId: params.outreachId,
      direction: params.direction,
      channel: params.channel as never,
      subject: params.subject ?? null,
      bodyText: params.bodyText,
      structuredBody: (params.structuredBody ?? null) as any,
      templateType: (params.templateType ?? null) as never,
      aiGenerated: params.aiGenerated ?? false,
      contentHash,
    },
  });

  await createAuditEntry({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    action: "MESSAGE_CREATED",
    actorType: params.aiGenerated ? "AI" : "USER",
    metadata: { messageId: message.id, direction: params.direction },
  });

  return { id: message.id, contentHash };
}

export async function approveMessage(params: {
  tenantId: string;
  messageId: string;
  approvedBy: string;
}): Promise<void> {
  const message = await prisma.outreachMessage.findFirst({
    where: { id: params.messageId, tenantId: params.tenantId },
    include: { outreach: { select: { id: true, status: true } } },
  });

  if (!message) throw new NotFoundError("OutreachMessage", params.messageId);

  await prisma.outreachMessage.update({
    where: { id: params.messageId },
    data: { approvedBy: params.approvedBy, approvedAt: new Date() },
  });

  await createAuditEntry({
    tenantId: params.tenantId,
    outreachId: message.outreachId,
    action: "MESSAGE_APPROVED",
    actorType: "USER",
    actorId: params.approvedBy,
    metadata: { messageId: params.messageId },
  });
}

// ─── Outreach State Transitions ──────────────────────────────────────────────

export async function transitionOutreach(params: {
  tenantId: string;
  outreachId: string;
  toStatus: string;
  actorType: "USER" | "SYSTEM" | "AI" | "WORKER";
  actorId?: string;
}): Promise<{ id: string; previousStatus: string; newStatus: string }> {
  const outreach = await prisma.outreach.findFirst({
    where: { id: params.outreachId, tenantId: params.tenantId },
  });

  if (!outreach) throw new NotFoundError("Outreach", params.outreachId);

  if (!isValidTransition(outreach.status, params.toStatus)) {
    throw new OutreachStateTransitionError(outreach.status, params.toStatus);
  }

  const updated = await prisma.outreach.update({
    where: { id: params.outreachId },
    data: {
      status: params.toStatus as never,
      lastContactedAt: params.toStatus === "SENT" ? new Date() : outreach.lastContactedAt,
    },
  });

  await createAuditEntry({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    action: "STATUS_CHANGED",
    actorType: params.actorType,
    actorId: params.actorId,
    previousState: outreach.status,
    newState: params.toStatus,
  });

  await createThreadEvent({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    eventType: "STATUS_CHANGED",
    eventData: { from: outreach.status, to: params.toStatus },
    actorType: params.actorType,
    actorId: params.actorId,
  });

  logger.info(
    { tenantId: params.tenantId, outreachId: params.outreachId, from: outreach.status, to: params.toStatus },
    "outreach_status_transition",
  );

  return { id: updated.id, previousStatus: outreach.status, newStatus: params.toStatus };
}

export async function approveOutreach(params: {
  tenantId: string;
  outreachId: string;
  approvedBy: string;
}): Promise<{ id: string; previousStatus: string; newStatus: string }> {
  return transitionOutreach({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    toStatus: "APPROVED",
    actorType: "USER",
    actorId: params.approvedBy,
  });
}

export async function sendOutreach(params: {
  tenantId: string;
  outreachId: string;
}): Promise<{ id: string; previousStatus: string; newStatus: string }> {
  // Verify the outreach is in APPROVED or QUEUED state
  const outreach = await prisma.outreach.findFirst({
    where: { id: params.outreachId, tenantId: params.tenantId },
  });
  if (!outreach) throw new NotFoundError("Outreach", params.outreachId);

  if (outreach.status !== "APPROVED" && outreach.status !== "QUEUED") {
    throw new ValidationError("Outreach must be APPROVED or QUEUED before sending");
  }

  const result = await transitionOutreach({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    toStatus: "SENT",
    actorType: "USER",
  });

  await createThreadEvent({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    eventType: "MESSAGE_SENT",
    eventData: { sentAt: new Date().toISOString() },
    actorType: "USER",
  });

  return result;
}

// ─── Response Operations ─────────────────────────────────────────────────────

export async function recordResponse(
  input: RecordResponseInput,
): Promise<{ id: string; contentHash: string; isDuplicate: boolean }> {
  await assertTenantEntity(input.tenantId, "outreach", input.outreachId);

  const receivedAt = input.receivedAt ?? new Date();
  const contentHash = computeResponseContentHash({
    outreachId: input.outreachId,
    rawBody: input.rawBody,
    rawChannel: input.rawChannel,
    receivedAt: receivedAt.toISOString(),
  });

  // Idempotency: check for duplicate response
  const existing = await prisma.outreachResponse.findFirst({
    where: { tenantId: input.tenantId, contentHash },
    select: { id: true },
  });

  if (existing) {
    logger.info({ tenantId: input.tenantId, contentHash }, "outreach_response_duplicate");
    return { id: existing.id, contentHash, isDuplicate: true };
  }

  const response = await prisma.outreachResponse.create({
    data: {
      tenantId: input.tenantId,
      outreachId: input.outreachId,
      rawBody: input.rawBody,
      rawChannel: input.rawChannel as never,
      receivedAt,
      contactPerson: input.contactPerson ?? null,
      contentHash,
    },
  });

  // Transition outreach to RESPONDED if currently DELIVERED or SENT
  // State machine requires SENT → DELIVERED → RESPONDED
  const outreach = await prisma.outreach.findFirst({
    where: { id: input.outreachId, tenantId: input.tenantId },
    select: { status: true },
  });

  if (outreach) {
    if (outreach.status === "SENT") {
      // Must go through DELIVERED first
      await transitionOutreach({
        tenantId: input.tenantId,
        outreachId: input.outreachId,
        toStatus: "DELIVERED",
        actorType: "SYSTEM",
      });
      await transitionOutreach({
        tenantId: input.tenantId,
        outreachId: input.outreachId,
        toStatus: "RESPONDED",
        actorType: "SYSTEM",
      });
    } else if (outreach.status === "DELIVERED") {
      await transitionOutreach({
        tenantId: input.tenantId,
        outreachId: input.outreachId,
        toStatus: "RESPONDED",
        actorType: "SYSTEM",
      });
    }
  }

  await createAuditEntry({
    tenantId: input.tenantId,
    outreachId: input.outreachId,
    action: "RESPONSE_RECEIVED",
    actorType: "SYSTEM",
    metadata: { responseId: response.id, contentHash },
  });

  await createThreadEvent({
    tenantId: input.tenantId,
    outreachId: input.outreachId,
    eventType: "RESPONSE_RECORDED",
    eventData: { responseId: response.id, receivedAt: receivedAt.toISOString() },
    actorType: "SYSTEM",
  });

  return { id: response.id, contentHash, isDuplicate: false };
}

// ─── Extract Response Fields ─────────────────────────────────────────────────

export async function extractResponseFields(params: {
  tenantId: string;
  responseId: string;
  fields: ExtractFieldInput[];
}): Promise<{ extractedCount: number; fields: unknown[] }> {
  const response = await prisma.outreachResponse.findFirst({
    where: { id: params.responseId, tenantId: params.tenantId },
    include: { outreach: { select: { id: true, supplierId: true, productId: true } } },
  });

  if (!response) throw new NotFoundError("OutreachResponse", params.responseId);

  const extractedFields = [];

  for (const field of params.fields) {
    const contentHash = computeExtractedFieldContentHash({
      responseId: params.responseId,
      fieldName: field.fieldName,
      fieldValue: field.fieldValue,
      valueType: field.valueType ?? "string",
    });

    // Idempotency: check for duplicate extraction
    const existingField = await prisma.outreachExtractedField.findFirst({
      where: { tenantId: params.tenantId, contentHash },
      select: { id: true },
    });

    if (existingField) continue;

    const extracted = await prisma.outreachExtractedField.create({
      data: {
        tenantId: params.tenantId,
        responseId: params.responseId,
        fieldName: field.fieldName,
        fieldValue: field.fieldValue,
        valueType: field.valueType ?? "string",
        contentHash,
      },
    });

    extractedFields.push(extracted);

    // Create evidence record for the extracted field
    await prisma.evidence.create({
      data: {
        tenantId: params.tenantId,
        evidenceType: "SUPPLIER_RESPONSE_FIELD",
        title: `Supplier response: ${field.fieldName}`,
        description: `Extracted from supplier response for outreach ${response.outreachId}`,
        extractedValue: { fieldName: field.fieldName, value: field.fieldValue },
        normalizedValue: { fieldName: field.fieldName, value: field.fieldValue, valueType: field.valueType ?? "string" },
        valueType: field.valueType ?? "string",
        confidence: 0.5, // AI extraction starts at moderate confidence
        extractionMethod: "ai_inference",
        entityType: "supplier",
        entityId: response.outreach.supplierId,
        productSupplierId: null,
        status: "active",
        observationStatus: "inferred",
      },
    });
  }

  await createAuditEntry({
    tenantId: params.tenantId,
    outreachId: response.outreachId,
    action: "FIELD_EXTRACTED",
    actorType: "AI",
    metadata: { responseId: params.responseId, extractedCount: extractedFields.length } as any,
  });

  await createThreadEvent({
    tenantId: params.tenantId,
    outreachId: response.outreachId,
    eventType: "FIELD_EXTRACTED",
    eventData: { responseId: params.responseId, count: extractedFields.length },
    actorType: "AI",
  });

  return { extractedCount: extractedFields.length, fields: extractedFields };
}

// ─── Analyze Response ────────────────────────────────────────────────────────

export async function analyzeResponse(params: {
  tenantId: string;
  outreachId: string;
}): Promise<{
  contradictions: unknown[];
  followups: unknown[];
  completeness: unknown;
  confidence: number;
}> {
  const outreach = await prisma.outreach.findFirst({
    where: { id: params.outreachId, tenantId: params.tenantId },
    include: {
      responses: {
        include: { extractedFields: true },
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!outreach) throw new NotFoundError("Outreach", params.outreachId);

  const latestResponse = outreach.responses[0];
  if (!latestResponse) {
    return { contradictions: [], followups: [], completeness: { score: 0 }, confidence: 0 };
  }

  // Get extracted fields
  const extractedFields: ExtractedFieldRef[] = latestResponse.extractedFields.map((f) => ({
    fieldName: f.fieldName,
    fieldValue: f.fieldValue,
    valueType: f.valueType,
  }));

  // Load existing intelligence for contradiction detection
  const existingProductSuppliers = await prisma.productSupplier.findMany({
    where: { tenantId: params.tenantId, productId: outreach.productId, supplierId: outreach.supplierId },
    select: { moq: true, price: true, leadTimeDays: true },
  });

  const existingEvidence: ExistingEvidenceRef[] = [];
  for (const ps of existingProductSuppliers) {
    if (ps.moq !== null) existingEvidence.push({ fieldName: "moq", value: ps.moq, source: "phase13_product_supplier" });
    if (ps.price !== null) existingEvidence.push({ fieldName: "unit_price", value: ps.price.toNumber(), source: "phase13_product_supplier" });
    if (ps.leadTimeDays !== null) existingEvidence.push({ fieldName: "lead_time", value: ps.leadTimeDays, source: "phase13_product_supplier" });
  }

  // Detect contradictions
  const contradictions = detectResponseContradictions(extractedFields, existingEvidence);

  // Update contradicted fields
  for (const contradiction of contradictions) {
    await prisma.outreachExtractedField.updateMany({
      where: {
        tenantId: params.tenantId,
        responseId: latestResponse.id,
        fieldName: contradiction.fieldName,
      },
      data: { verificationState: "CONTRADICTED" },
    });
  }

  // Calculate completeness
  const templateType = outreach.templateType ?? "INITIAL_INQUIRY";
  const requiredFields = getQuestionnaireFields(templateType);
  const providedFields = extractedFields.map((f) => f.fieldName);
  const completeness = calculateCompleteness(requiredFields, providedFields);

  // Calculate confidence
  const confidence = calculateResponseConfidence({
    quantity: extractedFields.length,
    quality: 70, // Default moderate quality for direct supplier response
    independence: 80, // Direct from supplier
    completeness: completeness.score * 100,
    consistency: contradictions.length > 0 ? 40 : 90,
  });

  // Generate follow-ups
  const unverifiedFields = latestResponse.extractedFields
    .filter((f) => f.verificationState === "UNVERIFIED" || f.verificationState === "REQUIRES_CLARIFICATION")
    .map((f) => f.fieldName);

  const followupInputs = {
    requiredFields,
    providedFields,
    contradictions,
    unverifiedFields,
  };

  const generatedFollowups = generateFollowups(followupInputs);

  // Persist follow-ups
  for (const fu of generatedFollowups) {
    const fuHash = computeFollowupContentHash({
      outreachId: params.outreachId,
      followupType: fu.followupType,
      subject: fu.subject,
      description: fu.description,
    });

    const existingFu = await prisma.outreachFollowup.findFirst({
      where: { tenantId: params.tenantId, contentHash: fuHash },
      select: { id: true },
    });

    if (existingFu) continue;

    await prisma.outreachFollowup.create({
      data: {
        tenantId: params.tenantId,
        outreachId: params.outreachId,
        followupType: fu.followupType,
        subject: fu.subject,
        description: fu.description,
        priority: fu.priority,
        contentHash: fuHash,
        dueAt: new Date(Date.now() + OUTREACH_CONFIG.followupDefaults.reminderDays * 86400000),
      },
    });
  }

  // Transition to FOLLOW_UP_REQUIRED if there are follow-ups
  if (generatedFollowups.length > 0 && outreach.status === "RESPONDED") {
    try {
      await transitionOutreach({
        tenantId: params.tenantId,
        outreachId: params.outreachId,
        toStatus: "FOLLOW_UP_REQUIRED",
        actorType: "SYSTEM",
      });
    } catch {
      // Transition may not be valid from current state — that's ok
    }
  }

  return { contradictions, followups: generatedFollowups, completeness, confidence };
}

// ─── Qualification ───────────────────────────────────────────────────────────

export async function qualifySupplier(params: {
  tenantId: string;
  outreachId: string;
  dimensionOverrides?: Partial<QualificationDimensionInput>;
}): Promise<{ id: string; score: number; level: string; confidence: number }> {
  const outreach = await prisma.outreach.findFirst({
    where: { id: params.outreachId, tenantId: params.tenantId },
    include: {
      responses: {
        include: { extractedFields: true },
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!outreach) throw new NotFoundError("Outreach", params.outreachId);

  // Build dimension scores from extracted fields + overrides
  const dimensions: Partial<QualificationDimensionInput> = { ...params.dimensionOverrides };

  const latestResponse = outreach.responses[0];
  if (latestResponse) {
    const fieldMap = new Map(latestResponse.extractedFields.map((f) => [f.fieldName, f.fieldValue]));

    // Map extracted fields to qualification dimensions
    if (fieldMap.has("unit_price") && !dimensions.price) {
      dimensions.price = 70; // Default moderate score for having price data
    }
    if (fieldMap.has("moq") && !dimensions.moq) {
      dimensions.moq = 70;
    }
    if (fieldMap.has("lead_time") && !dimensions.leadTime) {
      dimensions.leadTime = 70;
    }
    if (fieldMap.has("certifications") && !dimensions.documentation) {
      dimensions.documentation = 80;
    }
    if (fieldMap.has("production_location") && !dimensions.logisticsCompatibility) {
      dimensions.logisticsCompatibility = 70;
    }
    if (fieldMap.has("capacity") && !dimensions.capacity) {
      dimensions.capacity = 70;
    }
    if (fieldMap.has("export_eligibility") && !dimensions.exportCapability) {
      dimensions.exportCapability = 80;
    }
  }

  // Always set identity dimension from supplier existence
  if (!dimensions.identity) {
    dimensions.identity = 60; // Supplier exists in our system
  }
  if (!dimensions.productFit) {
    dimensions.productFit = 50; // Default moderate
  }
  if (!dimensions.responsiveness) {
    dimensions.responsiveness = latestResponse ? 80 : 30;
  }
  if (!dimensions.evidenceQuality) {
    dimensions.evidenceQuality = latestResponse ? 60 : 30;
  }
  if (!dimensions.commercialTerms) {
    const hasCommercial = latestResponse?.extractedFields.some(
      (f) => ["unit_price", "moq", "payment_terms", "incoterms"].includes(f.fieldName),
    );
    dimensions.commercialTerms = hasCommercial ? 70 : 30;
  }

  const result = calculateQualification(dimensions);

  const contentHash = computeQualificationContentHash({
    outreachId: params.outreachId,
    dimensionScores: result.dimensionScores,
    score: result.score,
    confidence: result.confidence,
  });

  // Get current max version
  const latestQualification = await prisma.outreachQualification.findFirst({
    where: { tenantId: params.tenantId, outreachId: params.outreachId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const version = (latestQualification?.version ?? 0) + 1;

  const qualification = await prisma.outreachQualification.create({
    data: {
      tenantId: params.tenantId,
      outreachId: params.outreachId,
      qualificationLevel: result.level as never,
      score: result.score,
      confidence: result.confidence,
      dimensionScores: result.dimensionScores,
      explanations: result.explanations,
      contentHash,
      version,
    },
  });

  // Transition to QUALIFICATION_REQUIRED or QUALIFIED
  if (outreach.status === "RESPONDED" || outreach.status === "FOLLOW_UP_REQUIRED") {
    try {
      await transitionOutreach({
        tenantId: params.tenantId,
        outreachId: params.outreachId,
        toStatus: "QUALIFICATION_REQUIRED",
        actorType: "SYSTEM",
      });
    } catch {
      // May not be valid from current state
    }
  }

  await createAuditEntry({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    action: "QUALIFICATION_CHANGED",
    actorType: "SYSTEM",
    newState: result.level,
    metadata: { score: result.score, version },
  });

  await createThreadEvent({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    eventType: "QUALIFICATION_CHANGED",
    eventData: { level: result.level, score: result.score, confidence: result.confidence, version },
    actorType: "SYSTEM",
  });

  return { id: qualification.id, score: result.score, level: result.level, confidence: result.confidence };
}

export async function getQualification(params: {
  tenantId: string;
  outreachId: string;
}): Promise<unknown> {
  const qualification = await prisma.outreachQualification.findFirst({
    where: { tenantId: params.tenantId, outreachId: params.outreachId },
    orderBy: { version: "desc" },
  });

  if (!qualification) throw new NotFoundError("OutreachQualification", params.outreachId);
  return qualification;
}

// ─── Thread & Evidence ───────────────────────────────────────────────────────

export async function getOutreachThread(params: {
  tenantId: string;
  outreachId: string;
}): Promise<unknown[]> {
  await assertTenantEntity(params.tenantId, "outreach", params.outreachId);

  const [messages, responses, followups, threadEvents, qualifications] = await Promise.all([
    prisma.outreachMessage.findMany({
      where: { tenantId: params.tenantId, outreachId: params.outreachId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.outreachResponse.findMany({
      where: { tenantId: params.tenantId, outreachId: params.outreachId },
      include: { extractedFields: true },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.outreachFollowup.findMany({
      where: { tenantId: params.tenantId, outreachId: params.outreachId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.outreachThreadEvent.findMany({
      where: { tenantId: params.tenantId, outreachId: params.outreachId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.outreachQualification.findMany({
      where: { tenantId: params.tenantId, outreachId: params.outreachId },
      orderBy: { version: "asc" },
    }),
  ]);

  // Merge into a unified timeline
  interface ThreadItem {
    type: string;
    timestamp: Date;
    data: unknown;
  }

  const timeline: ThreadItem[] = [
    ...messages.map((m) => ({ type: "message", timestamp: m.createdAt, data: m })),
    ...responses.map((r) => ({ type: "response", timestamp: r.receivedAt, data: r })),
    ...followups.map((f) => ({ type: "followup", timestamp: f.createdAt, data: f })),
    ...threadEvents.map((e) => ({ type: "event", timestamp: e.createdAt, data: e })),
    ...qualifications.map((q) => ({ type: "qualification", timestamp: q.createdAt, data: q })),
  ];

  timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return timeline;
}

export async function getOutreachEvidence(params: {
  tenantId: string;
  outreachId: string;
}): Promise<unknown[]> {
  const outreach = await prisma.outreach.findFirst({
    where: { id: params.outreachId, tenantId: params.tenantId },
    select: { supplierId: true },
  });

  if (!outreach) throw new NotFoundError("Outreach", params.outreachId);

  return prisma.evidence.findMany({
    where: {
      tenantId: params.tenantId,
      entityType: "supplier",
      entityId: outreach.supplierId,
      evidenceType: "SUPPLIER_RESPONSE_FIELD",
    },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Follow-up Operations ────────────────────────────────────────────────────

export async function createFollowup(params: {
  tenantId: string;
  outreachId: string;
  followupType: string;
  subject: string;
  description: string;
  priority?: number;
  dueAt?: Date;
}): Promise<{ id: string }> {
  await assertTenantEntity(params.tenantId, "outreach", params.outreachId);

  const contentHash = computeFollowupContentHash({
    outreachId: params.outreachId,
    followupType: params.followupType,
    subject: params.subject,
    description: params.description,
  });

  // Idempotency
  const existing = await prisma.outreachFollowup.findFirst({
    where: { tenantId: params.tenantId, contentHash },
    select: { id: true },
  });

  if (existing) return { id: existing.id };

  const followup = await prisma.outreachFollowup.create({
    data: {
      tenantId: params.tenantId,
      outreachId: params.outreachId,
      followupType: params.followupType,
      subject: params.subject,
      description: params.description,
      priority: params.priority ?? OUTREACH_CONFIG.followupDefaults.defaultPriority,
      dueAt: params.dueAt ?? new Date(Date.now() + OUTREACH_CONFIG.followupDefaults.reminderDays * 86400000),
      contentHash,
    },
  });

  await createThreadEvent({
    tenantId: params.tenantId,
    outreachId: params.outreachId,
    eventType: "FOLLOWUP_CREATED",
    eventData: { followupId: followup.id, type: params.followupType },
    actorType: "USER",
  });

  return { id: followup.id };
}

export async function listFollowups(params: {
  tenantId: string;
  outreachId: string;
}): Promise<unknown[]> {
  return prisma.outreachFollowup.findMany({
    where: { tenantId: params.tenantId, outreachId: params.outreachId },
    orderBy: { priority: "asc" },
  });
}

// ─── Template Operations ─────────────────────────────────────────────────────

export async function createTemplate(params: {
  tenantId: string;
  templateType: string;
  name: string;
  subjectTemplate?: string;
  bodyTemplate: string;
  questionSet?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const template = await prisma.outreachTemplate.create({
    data: {
      tenantId: params.tenantId,
      templateType: params.templateType as never,
      name: params.name,
      subjectTemplate: params.subjectTemplate ?? null,
      bodyTemplate: params.bodyTemplate,
      questionSet: (params.questionSet ?? {}) as any,
    },
  });

  return { id: template.id };
}

export async function listTemplates(params: {
  tenantId: string;
  templateType?: string;
}): Promise<unknown[]> {
  const where: Record<string, unknown> = { tenantId: params.tenantId, isActive: true };
  if (params.templateType) where.templateType = params.templateType;

  return prisma.outreachTemplate.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

// ─── Expiration ──────────────────────────────────────────────────────────────

export async function expireStaleOutreach(params: {
  tenantId: string;
}): Promise<{ expiredCount: number }> {
  const cutoff = new Date(
    Date.now() - OUTREACH_CONFIG.stalenessThresholds.outreachExpireDays * 86400000,
  );

  const staleOutreachs = await prisma.outreach.findMany({
    where: {
      tenantId: params.tenantId,
      status: { notIn: ["CLOSED", "QUALIFIED", "REJECTED"] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, status: true },
  });

  let expiredCount = 0;
  for (const outreach of staleOutreachs) {
    try {
      await transitionOutreach({
        tenantId: params.tenantId,
        outreachId: outreach.id,
        toStatus: "CLOSED",
        actorType: "WORKER",
      });
      expiredCount++;
    } catch {
      // Transition may not be valid
    }
  }

  logger.info({ tenantId: params.tenantId, expiredCount }, "outreach_expiration_completed");
  return { expiredCount };
}
