// =============================================================================
// API — Pricing Routes (Phase 11)
// =============================================================================
// Authenticated, tenant-scoped endpoints for pricing intelligence:
// assess, list, get, recalculate, observations, cost components, landed costs,
// scenarios, market snapshots, risks, provenance, history.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { paginationSchema } from "@exosquad/common";

import {
  assessPricing,
  getAssessment,
  listAssessments,
  recalculateAssessment,
  createPriceObservation,
  listPriceObservations,
  createCostComponent,
  listCostComponents,
  getAssessmentLandedCosts,
  getAssessmentScenarios,
  getAssessmentMarketSnapshots,
  getAssessmentRisks,
  getAssessmentProvenance,
  getAssessmentHistory,
  listLandedCosts,
  getLandedCost,
  listScenarios,
  listMarketSnapshots,
} from "../services/pricing-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const assessSchema = z.object({
  productId: z.string().min(1),
  supplierId: z.string().optional(),
  logisticsRouteId: z.string().optional(),
  quantity: z.coerce.number().positive().default(1),
  targetCurrency: z.string().length(3).default("BDT"),
});

const assessmentListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    supplierId: z.string().optional(),
    status: z.string().optional(),
  }),
);

const observationCreateSchema = z.object({
  productId: z.string().min(1),
  supplierId: z.string().optional(),
  sourceType: z.string().min(1),
  observationType: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  currency: z.string().length(3),
  quantity: z.coerce.number().positive().optional(),
  moq: z.coerce.number().nonnegative().optional(),
  priceBasis: z.string().default("UNIT"),
  market: z.string().optional(),
  country: z.string().optional(),
  sourceUrl: z.string().optional(),
  observedAt: z.coerce.date(),
  validUntil: z.coerce.date().optional(),
  evidenceId: z.string().optional(),
  packSize: z.coerce.number().positive().optional(),
  perUnitQuantity: z.coerce.number().positive().optional(),
});

const observationListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    supplierId: z.string().optional(),
    sourceType: z.string().optional(),
    observationType: z.string().optional(),
    market: z.string().optional(),
    currency: z.string().optional(),
  }),
);

const costComponentCreateSchema = z.object({
  productId: z.string().min(1),
  supplierId: z.string().optional(),
  logisticsRouteId: z.string().optional(),
  type: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
  currency: z.string().length(3),
  basis: z.string().default("UNIT"),
  quantity: z.coerce.number().positive().optional(),
  rate: z.coerce.number().optional(),
  rateType: z.string().optional(),
  status: z.string().default("OBSERVED"),
  evidenceId: z.string().optional(),
  observedAt: z.coerce.date().optional(),
});

const costComponentListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    supplierId: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
  }),
);

const landedCostListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    supplierId: z.string().optional(),
    status: z.string().optional(),
  }),
);

const scenarioListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    scenarioType: z.string().optional(),
    status: z.string().optional(),
  }),
);

const marketSnapshotListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    market: z.string().optional(),
  }),
);

// ─── Pricing Routes ──────────────────────────────────────────────────────────

/**
 * Main pricing routes under /api/v1/pricing.
 */
export async function pricingRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // ─── Assessment Endpoints ────────────────────────────────────────────────

  // POST /api/v1/pricing/assess
  server.post("/assess", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = assessSchema.parse(request.body);

    return assessPricing({
      tenantId,
      productId: body.productId,
      supplierId: body.supplierId ?? null,
      logisticsRouteId: body.logisticsRouteId ?? null,
      quantity: body.quantity,
      targetCurrency: body.targetCurrency,
    });
  });

  // GET /api/v1/pricing (list assessments)
  server.get("/", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = assessmentListSchema.parse(request.query);

    return listAssessments({ tenantId, ...query });
  });

  // GET /api/v1/pricing/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessment(tenantId, id);
  });

  // POST /api/v1/pricing/:id/recalculate
  server.post<{ Params: { id: string } }>("/:id/recalculate", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    recalculateAssessment(tenantId, id).catch((err) => {
      const { logger } = require("@exosquad/logger");
      logger.error({ err, tenantId, assessmentId: id }, "pricing_recalculation_failed");
    });

    return {
      status: "queued",
      message: "Pricing recalculation has been queued",
      tenantId,
      assessmentId: id,
    };
  });

  // GET /api/v1/pricing/:id/landed-costs
  server.get<{ Params: { id: string } }>("/:id/landed-costs", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentLandedCosts(tenantId, id);
  });

  // GET /api/v1/pricing/:id/scenarios
  server.get<{ Params: { id: string } }>("/:id/scenarios", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentScenarios(tenantId, id);
  });

  // GET /api/v1/pricing/:id/market-snapshots
  server.get<{ Params: { id: string } }>("/:id/market-snapshots", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentMarketSnapshots(tenantId, id);
  });

  // GET /api/v1/pricing/:id/risks
  server.get<{ Params: { id: string } }>("/:id/risks", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentRisks(tenantId, id);
  });

  // GET /api/v1/pricing/:id/provenance
  server.get<{ Params: { id: string } }>("/:id/provenance", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentProvenance(tenantId, id);
  });

  // GET /api/v1/pricing/:id/history
  server.get<{ Params: { id: string } }>("/:id/history", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentHistory(tenantId, id);
  });

  // ─── Price Observation Endpoints ─────────────────────────────────────────

  // POST /api/v1/pricing/observations
  server.post("/observations", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = observationCreateSchema.parse(request.body);

    return createPriceObservation({ tenantId, ...body });
  });

  // GET /api/v1/pricing/observations
  server.get("/observations", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = observationListSchema.parse(request.query);

    return listPriceObservations({ tenantId, ...query });
  });

  // ─── Cost Component Endpoints ────────────────────────────────────────────

  // POST /api/v1/pricing/cost-components
  server.post("/cost-components", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = costComponentCreateSchema.parse(request.body);

    return createCostComponent({ tenantId, ...body });
  });

  // GET /api/v1/pricing/cost-components
  server.get("/cost-components", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = costComponentListSchema.parse(request.query);

    return listCostComponents({ tenantId, ...query });
  });

  // ─── Landed Cost Endpoints ───────────────────────────────────────────────

  // GET /api/v1/pricing/landed-costs
  server.get("/landed-costs", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = landedCostListSchema.parse(request.query);

    return listLandedCosts({ tenantId, ...query });
  });

  // GET /api/v1/pricing/landed-costs/:lcId
  server.get<{ Params: { lcId: string } }>("/landed-costs/:lcId", async (request) => {
    const tenantId = request.user!.tenantId;
    const { lcId } = request.params;

    return getLandedCost(tenantId, lcId);
  });

  // ─── Scenario Endpoints ──────────────────────────────────────────────────

  // GET /api/v1/pricing/scenarios
  server.get("/scenarios", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = scenarioListSchema.parse(request.query);

    return listScenarios({ tenantId, ...query });
  });

  // ─── Market Snapshot Endpoints ───────────────────────────────────────────

  // GET /api/v1/pricing/market-snapshots
  server.get("/market-snapshots", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = marketSnapshotListSchema.parse(request.query);

    return listMarketSnapshots({ tenantId, ...query });
  });
}
