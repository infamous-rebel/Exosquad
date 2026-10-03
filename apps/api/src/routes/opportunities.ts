// =============================================================================
// API — Opportunity Routes (Phase 8)
// =============================================================================
// Authenticated, tenant-scoped endpoints for decision intelligence:
// list, detail, evidence, risks, actions, summary, recalculate.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  paginationSchema,
  sortSchema,
} from "@exosquad/common";

import {
  listOpportunities,
  getOpportunityById,
  getOpportunityEvidence,
  getOpportunityRisks,
  getOpportunityActions,
  getOpportunityCalculation,
  getOpportunitySummary,
} from "../services/opportunities.js";

import { runOpportunityDetection } from "../services/decision-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const opportunityListSchema = paginationSchema.merge(sortSchema).merge(
  z.object({
    status: z.string().optional(),
    opportunityType: z.string().optional(),
    productId: z.string().optional(),
    productVariantId: z.string().optional(),
    geographyCode: z.string().optional(),
    minScore: z.coerce.number().min(0).max(100).optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
);

const recalculateSchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
  geography: z.string().optional(),
});

// ─── Opportunity Routes ──────────────────────────────────────────────────────

/**
 * Main opportunity routes under /api/v1/opportunities.
 */
export async function opportunityRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/opportunities
  server.get("/", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = opportunityListSchema.parse(request.query);

    return listOpportunities({
      tenantId,
      ...query,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  });

  // GET /api/v1/opportunities/summary
  server.get("/summary", async (request) => {
    const tenantId = request.user!.tenantId;
    return getOpportunitySummary(tenantId);
  });

  // POST /api/v1/opportunities/recalculate
  server.post("/recalculate", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = recalculateSchema.parse(request.body ?? {});

    // Queue the recalculation asynchronously — do not block the response
    // Fire-and-forget: the worker will process it
    const summaryPromise = runOpportunityDetection({
      tenantId,
      windowDays: body.windowDays,
      geography: body.geography,
    });

    // Don't await — return immediately with a job reference
    summaryPromise.catch((err) => {
      // Log but don't crash the request
      const { logger } = require("@exosquad/logger");
      logger.error({ err, tenantId }, "opportunity_recalculation_failed");
    });

    return {
      status: "queued",
      message: "Opportunity recalculation has been queued",
      tenantId,
      windowDays: body.windowDays,
    };
  });

  // GET /api/v1/opportunities/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getOpportunityById(tenantId, id);
  });

  // GET /api/v1/opportunities/:id/evidence
  server.get<{ Params: { id: string } }>("/:id/evidence", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getOpportunityEvidence(tenantId, id);
  });

  // GET /api/v1/opportunities/:id/risks
  server.get<{ Params: { id: string } }>("/:id/risks", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getOpportunityRisks(tenantId, id);
  });

  // GET /api/v1/opportunities/:id/actions
  server.get<{ Params: { id: string } }>("/:id/actions", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getOpportunityActions(tenantId, id);
  });
}

// ─── Calculation Detail Routes ───────────────────────────────────────────────

/**
 * Calculation routes under /api/v1/opportunity-calculations.
 */
export async function opportunityCalculationRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/opportunity-calculations/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getOpportunityCalculation(tenantId, id);
  });
}
