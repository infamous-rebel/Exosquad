// =============================================================================
// API — AI Research & Reasoning Routes (Phase 14)
// =============================================================================
// Authenticated, tenant-scoped endpoints for research request management,
// evidence retrieval, contradiction inspection, gap analysis, and results.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { paginationSchema } from "@exosquad/common";

import {
  createResearchRequest,
  listResearchRequests,
  getResearchRequest,
  getResearchResult,
  getResearchEvidence,
  getResearchGaps,
  getResearchContradictions,
  getResearchHypotheses,
  getResearchHistory,
  cancelResearchRequest,
} from "../services/research-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createRequestSchema = z.object({
  question: z.string().min(5).max(2000),
  questionType: z.enum([
    "IDENTITY", "SUPPLIER", "PRICING", "DEMAND", "LOGISTICS",
    "COMPETITION", "REGULATORY", "FEASIBILITY", "COMPARISON", "GENERAL",
  ]).optional(),
  productId: z.string().optional(),
  market: z.string().optional(),
  country: z.string().optional(),
  researchObjective: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  requiredEvidenceQuality: z.enum(["HIGH", "MEDIUM", "LOW", "UNVERIFIED"]).optional(),
  requestedDepth: z.enum(["brief", "standard", "deep"]).optional(),
  priority: z.number().min(1).max(10).optional(),
});

const requestListSchema = paginationSchema.merge(
  z.object({
    status: z.string().optional(),
    questionType: z.string().optional(),
  }),
);

const historyListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
  }),
);

// ─── Research Routes ─────────────────────────────────────────────────────────

/**
 * Research routes under /api/v1/research.
 */
export async function researchRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // ─── Request Management ────────────────────────────────────────────────

  // POST /api/v1/research/requests — Create a new research request
  server.post("/requests", async (request) => {
    const tenantId = request.user!.tenantId;
    const userId = request.user!.userId;
    const body = createRequestSchema.parse(request.body);

    const result = await createResearchRequest({
      tenantId,
      userId,
      question: body.question,
      questionType: body.questionType,
      productId: body.productId,
      market: body.market,
      country: body.country,
      researchObjective: body.researchObjective,
      constraints: body.constraints,
      requiredEvidenceQuality: body.requiredEvidenceQuality,
      requestedDepth: body.requestedDepth,
      priority: body.priority,
    });

    return { data: result };
  });

  // GET /api/v1/research/requests — List research requests
  server.get("/requests", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = requestListSchema.parse(request.query);
    return listResearchRequests({
      tenantId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      questionType: query.questionType,
    });
  });

  // GET /api/v1/research/requests/:id — Get research request with full details
  server.get<{ Params: { id: string } }>("/requests/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return getResearchRequest({ tenantId, requestId: id });
  });

  // POST /api/v1/research/requests/:id/cancel — Cancel a research request
  server.post<{ Params: { id: string } }>("/requests/:id/cancel", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return cancelResearchRequest({ tenantId, requestId: id });
  });

  // ─── Results ───────────────────────────────────────────────────────────

  // GET /api/v1/research/requests/:id/result — Get the research result
  server.get<{ Params: { id: string } }>("/requests/:id/result", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return getResearchResult({ tenantId, requestId: id });
  });

  // ─── Evidence ──────────────────────────────────────────────────────────

  // GET /api/v1/research/requests/:id/evidence — Get evidence items
  server.get<{ Params: { id: string } }>("/requests/:id/evidence", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);
    return getResearchEvidence({
      tenantId,
      requestId: id,
      page: query.page,
      limit: query.limit,
    });
  });

  // ─── Gaps ──────────────────────────────────────────────────────────────

  // GET /api/v1/research/requests/:id/gaps — Get research gaps
  server.get<{ Params: { id: string } }>("/requests/:id/gaps", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const data = await getResearchGaps({ tenantId, requestId: id });
    return { data };
  });

  // ─── Contradictions ────────────────────────────────────────────────────

  // GET /api/v1/research/requests/:id/contradictions — Get contradictions
  server.get<{ Params: { id: string } }>("/requests/:id/contradictions", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const data = await getResearchContradictions({ tenantId, requestId: id });
    return { data };
  });

  // ─── Hypotheses ────────────────────────────────────────────────────────

  // GET /api/v1/research/requests/:id/hypotheses — Get hypotheses
  server.get<{ Params: { id: string } }>("/requests/:id/hypotheses", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const data = await getResearchHypotheses({ tenantId, requestId: id });
    return { data };
  });

  // ─── History ───────────────────────────────────────────────────────────

  // GET /api/v1/research/history — Get research history
  server.get("/history", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = historyListSchema.parse(request.query);
    return getResearchHistory({
      tenantId,
      productId: query.productId,
      page: query.page,
      limit: query.limit,
    });
  });
}
