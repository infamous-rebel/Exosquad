// =============================================================================
// API — Product Opportunity Routes (Phase 12)
// =============================================================================
// Authenticated, tenant-scoped endpoints for product opportunity, competition,
// and reseller viability intelligence:
// assess, list, get, recalculate, signals, risks, competitor observations,
// competitor snapshots, history.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { paginationSchema } from "@exosquad/common";

import {
  assessProductOpportunity,
  recalculateProductOpportunity,
  listAssessments,
  getAssessment,
  getAssessmentHistory,
  listSignals,
  listRisks,
  listCompetitorSnapshots,
  listCompetitorObservations,
  createCompetitorObservation,
  expireStaleAssessments,
} from "../services/product-opportunity-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const assessSchema = z.object({
  productId: z.string().min(1),
});

const assessmentListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    status: z.string().optional(),
  }),
);

const signalListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().min(1),
    signalType: z.string().optional(),
    direction: z.string().optional(),
  }),
);

const riskListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().min(1),
    severity: z.string().optional(),
    riskType: z.string().optional(),
  }),
);

const competitorObservationCreateSchema = z.object({
  productId: z.string().min(1),
  competitorName: z.string().nullable().default(null),
  sourceType: z.string().min(1),
  sourceUrl: z.string().nullable().default(null),
  market: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  sellingPrice: z.coerce.number().nonnegative().nullable().default(null),
  currency: z.string().length(3).nullable().default(null),
  priceBasis: z.string().nullable().default(null),
  rating: z.coerce.number().min(0).max(5).nullable().default(null),
  reviewCount: z.coerce.number().int().nonnegative().nullable().default(null),
  availability: z.string().nullable().default(null),
  observedAt: z.coerce.date(),
});

const competitorObservationListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().min(1),
  }),
);

const competitorSnapshotListSchema = z.object({
  productId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Opportunity Routes ──────────────────────────────────────────────────────

/**
 * Product opportunity routes under /api/v1/opportunity.
 */
export async function opportunityRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // ─── Assessment Endpoints ────────────────────────────────────────────────

  // POST /api/v1/opportunity/assess
  server.post("/assess", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = assessSchema.parse(request.body);

    return assessProductOpportunity({ tenantId, productId: body.productId });
  });

  // GET /api/v1/opportunity/assessments (list assessments)
  server.get("/assessments", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = assessmentListSchema.parse(request.query);

    return listAssessments({ tenantId, ...query });
  });

  // GET /api/v1/opportunity/assessments/:id
  server.get<{ Params: { id: string } }>("/assessments/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessment({ tenantId, assessmentId: id });
  });

  // POST /api/v1/opportunity/assessments/:id/recalculate
  server.post<{ Params: { id: string } }>("/assessments/:id/recalculate", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const assessment = await getAssessment({ tenantId, assessmentId: id });

    return recalculateProductOpportunity({ tenantId, productId: assessment.productId });
  });

  // GET /api/v1/opportunity/assessments/:id/signals
  server.get<{ Params: { id: string } }>("/assessments/:id/signals", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const assessment = await getAssessment({ tenantId, assessmentId: id });

    return listSignals({ tenantId, productId: assessment.productId, limit: 100 });
  });

  // GET /api/v1/opportunity/assessments/:id/risks
  server.get<{ Params: { id: string } }>("/assessments/:id/risks", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const assessment = await getAssessment({ tenantId, assessmentId: id });

    return listRisks({ tenantId, productId: assessment.productId, limit: 100 });
  });

  // GET /api/v1/opportunity/assessments/:id/history
  server.get<{ Params: { id: string } }>("/assessments/:id/history", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const assessment = await getAssessment({ tenantId, assessmentId: id });

    return getAssessmentHistory({ tenantId, productId: assessment.productId, limit: 50 });
  });

  // POST /api/v1/opportunity/expire
  server.post("/expire", async (request) => {
    const tenantId = request.user!.tenantId;

    return expireStaleAssessments({ tenantId });
  });

  // ─── Signal Endpoints ────────────────────────────────────────────────────

  // GET /api/v1/opportunity/signals
  server.get("/signals", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = signalListSchema.parse(request.query);

    return listSignals({ tenantId, ...query });
  });

  // ─── Risk Endpoints ──────────────────────────────────────────────────────

  // GET /api/v1/opportunity/risks
  server.get("/risks", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = riskListSchema.parse(request.query);

    return listRisks({ tenantId, ...query });
  });

  // ─── Competitor Observation Endpoints ────────────────────────────────────

  // POST /api/v1/opportunity/competitors
  server.post("/competitors", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = competitorObservationCreateSchema.parse(request.body);

    return createCompetitorObservation({ tenantId, ...body });
  });

  // GET /api/v1/opportunity/competitors
  server.get("/competitors", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = competitorObservationListSchema.parse(request.query);

    return listCompetitorObservations({ tenantId, ...query });
  });

  // ─── Competitor Snapshot Endpoints ───────────────────────────────────────

  // GET /api/v1/opportunity/competitor-snapshots
  server.get("/competitor-snapshots", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = competitorSnapshotListSchema.parse(request.query);

    return listCompetitorSnapshots({ tenantId, ...query });
  });
}
