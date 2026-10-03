// =============================================================================
// API — Supplier Outreach Routes (Phase 15)
// =============================================================================
// Authenticated, tenant-scoped endpoints for supplier outreach, response
// capture, qualification, and follow-up management.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { paginationSchema } from "@exosquad/common";

import {
  createCampaign,
  listCampaigns,
  getCampaign,
  createOutreach,
  listOutreachs,
  getOutreach,
  createMessage,
  approveMessage,
  approveOutreach,
  sendOutreach,
  recordResponse,
  extractResponseFields,
  analyzeResponse,
  qualifySupplier,
  getQualification,
  getOutreachThread,
  getOutreachEvidence,
  createFollowup,
  listFollowups,
  createTemplate,
  listTemplates,
  expireStaleOutreach,
} from "../services/outreach-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createCampaignSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().optional(),
  targetMarket: z.string().optional(),
  requirements: z.record(z.unknown()).optional(),
});

const createOutreachSchema = z.object({
  campaignId: z.string().optional(),
  supplierId: z.string().min(1),
  productId: z.string().min(1),
  channel: z.enum(["EMAIL", "WHATSAPP", "MARKETPLACE", "WEB_FORM", "MANUAL", "OTHER"]).optional(),
  templateType: z.enum(["INITIAL_INQUIRY", "SUPPLIER_VERIFICATION", "LOGISTICS_INQUIRY", "FOLLOW_UP", "CUSTOM"]).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  assignedTo: z.string().optional(),
});

const createMessageSchema = z.object({
  direction: z.enum(["OUTBOUND", "INBOUND"]),
  channel: z.enum(["EMAIL", "WHATSAPP", "MARKETPLACE", "WEB_FORM", "MANUAL", "OTHER"]),
  subject: z.string().optional(),
  bodyText: z.string().min(1),
  structuredBody: z.record(z.unknown()).optional(),
  templateType: z.string().optional(),
  aiGenerated: z.boolean().optional(),
});

const approveMessageSchema = z.object({
  approvedBy: z.string().min(1),
});

const approveOutreachSchema = z.object({
  approvedBy: z.string().min(1),
});

const recordResponseSchema = z.object({
  rawBody: z.string().min(1),
  rawChannel: z.enum(["EMAIL", "WHATSAPP", "MARKETPLACE", "WEB_FORM", "MANUAL", "OTHER"]),
  contactPerson: z.string().optional(),
  receivedAt: z.string().datetime().optional(),
});

const extractFieldsSchema = z.object({
  fields: z.array(z.object({
    fieldName: z.string().min(1),
    fieldValue: z.string().min(1),
    valueType: z.enum(["string", "number", "boolean", "currency", "date"]).optional(),
  })).min(1),
});

const createFollowupSchema = z.object({
  followupType: z.enum(["MISSING_INFO", "CONTRADICTION", "UNVERIFIED_CLAIM", "DOCUMENTATION_REQUEST", "PRICE_CLARIFICATION", "SAMPLE_REQUEST"]),
  subject: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().int().min(1).max(10).optional(),
  dueAt: z.string().datetime().optional(),
});

const createTemplateSchema = z.object({
  templateType: z.enum(["INITIAL_INQUIRY", "SUPPLIER_VERIFICATION", "LOGISTICS_INQUIRY", "FOLLOW_UP", "CUSTOM"]),
  name: z.string().min(1),
  subjectTemplate: z.string().optional(),
  bodyTemplate: z.string().min(1),
  questionSet: z.record(z.unknown()).optional(),
});

const campaignListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    status: z.string().optional(),
  }),
);

const outreachListSchema = paginationSchema.merge(
  z.object({
    campaignId: z.string().optional(),
    supplierId: z.string().optional(),
    productId: z.string().optional(),
    status: z.string().optional(),
  }),
);

// ─── Outreach Routes ─────────────────────────────────────────────────────────

/**
 * Supplier outreach routes under /api/v1/outreach.
 */
export async function outreachRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // ─── Campaign Endpoints ──────────────────────────────────────────────────

  // POST /api/v1/outreach/campaigns
  server.post("/campaigns", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = createCampaignSchema.parse(request.body);
    return createCampaign({ tenantId, ...body });
  });

  // GET /api/v1/outreach/campaigns
  server.get("/campaigns", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = campaignListSchema.parse(request.query);
    return listCampaigns({ tenantId, ...query });
  });

  // GET /api/v1/outreach/campaigns/:id
  server.get<{ Params: { id: string } }>("/campaigns/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return getCampaign({ tenantId, campaignId: id });
  });

  // GET /api/v1/outreach/campaigns/:id/outreachs
  server.get<{ Params: { id: string } }>("/campaigns/:id/outreachs", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return listOutreachs({ tenantId, campaignId: id, page: 1, limit: 50 });
  });

  // ─── Outreach Endpoints ──────────────────────────────────────────────────

  // POST /api/v1/outreach/outreachs
  server.post("/outreachs", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = createOutreachSchema.parse(request.body);
    return createOutreach({ tenantId, ...body });
  });

  // GET /api/v1/outreach/outreachs
  server.get("/outreachs", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = outreachListSchema.parse(request.query);
    return listOutreachs({ tenantId, ...query });
  });

  // GET /api/v1/outreach/outreachs/:id
  server.get<{ Params: { id: string } }>("/outreachs/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return getOutreach({ tenantId, outreachId: id });
  });

  // ─── Message Endpoints ───────────────────────────────────────────────────

  // POST /api/v1/outreach/outreachs/:id/messages
  server.post<{ Params: { id: string } }>("/outreachs/:id/messages", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = createMessageSchema.parse(request.body);
    return createMessage({ tenantId, outreachId: id, ...body });
  });

  // POST /api/v1/outreach/outreachs/:id/messages/:messageId/approve
  server.post<{ Params: { id: string; messageId: string } }>(
    "/outreachs/:id/messages/:messageId/approve",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { messageId } = request.params;
      const body = approveMessageSchema.parse(request.body);
      return approveMessage({ tenantId, messageId, ...body });
    },
  );

  // ─── Outreach Lifecycle Endpoints ────────────────────────────────────────

  // POST /api/v1/outreach/outreachs/:id/approve
  server.post<{ Params: { id: string } }>("/outreachs/:id/approve", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = approveOutreachSchema.parse(request.body);
    return approveOutreach({ tenantId, outreachId: id, ...body });
  });

  // POST /api/v1/outreach/outreachs/:id/send
  server.post<{ Params: { id: string } }>("/outreachs/:id/send", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return sendOutreach({ tenantId, outreachId: id });
  });

  // ─── Response Endpoints ──────────────────────────────────────────────────

  // POST /api/v1/outreach/outreachs/:id/respond
  server.post<{ Params: { id: string } }>("/outreachs/:id/respond", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = recordResponseSchema.parse(request.body);
    return recordResponse({ tenantId, outreachId: id, ...body, receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined });
  });

  // POST /api/v1/outreach/outreachs/:id/extract-response
  server.post<{ Params: { id: string } }>("/outreachs/:id/extract-response", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = extractFieldsSchema.parse(request.body);
    return extractResponseFields({ tenantId, responseId: id, fields: body.fields });
  });

  // POST /api/v1/outreach/outreachs/:id/analyze-response
  server.post<{ Params: { id: string } }>("/outreachs/:id/analyze-response", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return analyzeResponse({ tenantId, outreachId: id });
  });

  // ─── Qualification Endpoints ─────────────────────────────────────────────

  // POST /api/v1/outreach/outreachs/:id/qualify
  server.post<{ Params: { id: string } }>("/outreachs/:id/qualify", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return qualifySupplier({ tenantId, outreachId: id });
  });

  // GET /api/v1/outreach/outreachs/:id/qualification
  server.get<{ Params: { id: string } }>("/outreachs/:id/qualification", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return getQualification({ tenantId, outreachId: id });
  });

  // ─── Thread & Evidence Endpoints ─────────────────────────────────────────

  // GET /api/v1/outreach/outreachs/:id/thread
  server.get<{ Params: { id: string } }>("/outreachs/:id/thread", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return getOutreachThread({ tenantId, outreachId: id });
  });

  // GET /api/v1/outreach/outreachs/:id/evidence
  server.get<{ Params: { id: string } }>("/outreachs/:id/evidence", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return getOutreachEvidence({ tenantId, outreachId: id });
  });

  // ─── Follow-up Endpoints ─────────────────────────────────────────────────

  // GET /api/v1/outreach/outreachs/:id/followups
  server.get<{ Params: { id: string } }>("/outreachs/:id/followups", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return listFollowups({ tenantId, outreachId: id });
  });

  // POST /api/v1/outreach/outreachs/:id/followups
  server.post<{ Params: { id: string } }>("/outreachs/:id/followups", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = createFollowupSchema.parse(request.body);
    return createFollowup({ tenantId, outreachId: id, ...body, dueAt: body.dueAt ? new Date(body.dueAt) : undefined });
  });

  // ─── Recalculation ───────────────────────────────────────────────────────

  // POST /api/v1/outreach/outreachs/:id/recalculate
  server.post<{ Params: { id: string } }>("/outreachs/:id/recalculate", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    // Trigger Phase 13 recalculation — the outreach has productId
    const outreach = await getOutreach({ tenantId, outreachId: id }) as { productId: string };
    // Import dynamically to avoid circular dependency
    const { recalculateSupplierSourcing } = await import("../services/supplier-sourcing-intelligence.js");
    return recalculateSupplierSourcing({ tenantId, productId: outreach.productId });
  });

  // ─── Template Endpoints ──────────────────────────────────────────────────

  // POST /api/v1/outreach/templates
  server.post("/templates", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = createTemplateSchema.parse(request.body);
    return createTemplate({ tenantId, ...body });
  });

  // GET /api/v1/outreach/templates
  server.get("/templates", async (request) => {
    const tenantId = request.user!.tenantId;
    const templateType = (request.query as Record<string, string>).templateType;
    return listTemplates({ tenantId, templateType });
  });

  // ─── Expiration ──────────────────────────────────────────────────────────

  // POST /api/v1/outreach/expire
  server.post("/expire", async (request) => {
    const tenantId = request.user!.tenantId;
    return expireStaleOutreach({ tenantId });
  });
}
