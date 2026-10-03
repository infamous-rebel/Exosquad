// =============================================================================
// API — Logistics Routes (Phase 10)
// =============================================================================
// Authenticated, tenant-scoped endpoints for logistics intelligence:
// assess, list, get, recalculate, nodes, legs, routes, evidence, conflicts,
// provenance, history, risks, verifications, anomalies, route discovery,
// relationship queries.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { paginationSchema } from "@exosquad/common";

import {
  assessLogistics,
  getAssessment,
  listAssessments,
  getAssessmentNodes,
  getAssessmentLegs,
  getAssessmentRoutes,
  getAssessmentEvidence,
  getAssessmentConflicts,
  getAssessmentProvenance,
  getAssessmentHistory,
  getAssessmentRisks,
  getAssessmentVerifications,
  getAssessmentAnomalies,
  discoverRoutesForQuery,
  listRoutes,
  listLegs,
  listRelationships,
  recalculateAssessment,
} from "../services/logistics-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const assessSchema = z.object({
  subjectType: z.enum(["PRODUCT", "SKU", "SELLER", "SUPPLIER", "BRAND", "ORGANIZATION", "ROUTE"]),
  subjectId: z.string().min(1),
});

const assessmentListSchema = paginationSchema.merge(
  z.object({
    subjectType: z.string().optional(),
    subjectId: z.string().optional(),
    status: z.string().optional(),
  })
);

const routeDiscoverySchema = z.object({
  originNodeId: z.string().min(1),
  destinationNodeId: z.string().min(1),
  maxDepth: z.coerce.number().int().min(1).max(10).default(5),
  maxRoutes: z.coerce.number().int().min(1).max(50).default(20),
  legTypes: z.string().optional(),
  nodeTypes: z.string().optional(),
  statuses: z.string().optional(),
  minimumConfidence: z.coerce.number().min(0).max(1).optional(),
  country: z.string().optional(),
  asOf: z.string().optional(),
});

const routeListSchema = paginationSchema.merge(
  z.object({
    originNodeId: z.string().optional(),
    destinationNodeId: z.string().optional(),
    status: z.string().optional(),
    hasEvidence: z.coerce.boolean().optional(),
    asOf: z.string().optional(),
  })
);

const legListSchema = paginationSchema.merge(
  z.object({
    fromNodeId: z.string().optional(),
    toNodeId: z.string().optional(),
    legType: z.string().optional(),
    status: z.string().optional(),
    country: z.string().optional(),
    hasEvidence: z.coerce.boolean().optional(),
    asOf: z.string().optional(),
  })
);

const relationshipQuerySchema = paginationSchema.merge(
  z.object({
    nodeType: z.string().optional(),
    legType: z.string().optional(),
    status: z.string().optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
    maxConfidence: z.coerce.number().min(0).max(1).optional(),
    country: z.string().optional(),
    hasEvidence: z.coerce.boolean().optional(),
    asOf: z.string().optional(),
  })
);

// ─── Logistics Routes ────────────────────────────────────────────────────────

/**
 * Main logistics routes under /api/v1/logistics.
 */
export async function logisticsRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // POST /api/v1/logistics/assess
  server.post("/assess", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = assessSchema.parse(request.body);

    const result = await assessLogistics({
      tenantId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
    });

    return result;
  });

  // GET /api/v1/logistics (list assessments)
  server.get("/", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = assessmentListSchema.parse(request.query);

    return listAssessments({ tenantId, ...query });
  });

  // GET /api/v1/logistics/routes
  server.get("/routes", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = routeListSchema.parse(request.query);

    return listRoutes({ tenantId, ...query });
  });

  // GET /api/v1/logistics/legs
  server.get("/legs", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = legListSchema.parse(request.query);

    return listLegs({ tenantId, ...query });
  });

  // GET /api/v1/logistics/relationships
  server.get("/relationships", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = relationshipQuerySchema.parse(request.query);

    return listRelationships({ tenantId, ...query });
  });

  // POST /api/v1/logistics/discover-routes
  server.post("/discover-routes", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = routeDiscoverySchema.parse(request.body);

    return discoverRoutesForQuery({
      tenantId,
      originNodeId: body.originNodeId,
      destinationNodeId: body.destinationNodeId,
      maxDepth: body.maxDepth,
      maxRoutes: body.maxRoutes,
      legTypes: body.legTypes?.split(","),
      nodeTypes: body.nodeTypes?.split(","),
      statuses: body.statuses?.split(","),
      minimumConfidence: body.minimumConfidence,
      country: body.country,
      asOf: body.asOf,
    });
  });

  // GET /api/v1/logistics/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessment(tenantId, id);
  });

  // POST /api/v1/logistics/:id/recalculate
  server.post<{ Params: { id: string } }>("/:id/recalculate", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    recalculateAssessment(tenantId, id).catch((err) => {
      const { logger } = require("@exosquad/logger");
      logger.error({ err, tenantId, assessmentId: id }, "logistics_recalculation_failed");
    });

    return {
      status: "queued",
      message: "Logistics recalculation has been queued",
      tenantId,
      assessmentId: id,
    };
  });

  // GET /api/v1/logistics/:id/nodes
  server.get<{ Params: { id: string } }>("/:id/nodes", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    return getAssessmentNodes(tenantId, id, query.page, query.limit);
  });

  // GET /api/v1/logistics/:id/legs
  server.get<{ Params: { id: string } }>("/:id/legs", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    return getAssessmentLegs(tenantId, id, query.page, query.limit);
  });

  // GET /api/v1/logistics/:id/routes
  server.get<{ Params: { id: string } }>("/:id/routes", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    return getAssessmentRoutes(tenantId, id, query.page, query.limit);
  });

  // GET /api/v1/logistics/:id/evidence
  server.get<{ Params: { id: string } }>("/:id/evidence", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    return getAssessmentEvidence(tenantId, id, query.page, query.limit);
  });

  // GET /api/v1/logistics/:id/conflicts
  server.get<{ Params: { id: string } }>("/:id/conflicts", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentConflicts(tenantId, id);
  });

  // GET /api/v1/logistics/:id/provenance
  server.get<{ Params: { id: string } }>("/:id/provenance", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentProvenance(tenantId, id);
  });

  // GET /api/v1/logistics/:id/history
  server.get<{ Params: { id: string } }>("/:id/history", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentHistory(tenantId, id);
  });

  // GET /api/v1/logistics/:id/risks
  server.get<{ Params: { id: string } }>("/:id/risks", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentRisks(tenantId, id);
  });

  // GET /api/v1/logistics/:id/verifications
  server.get<{ Params: { id: string } }>("/:id/verifications", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentVerifications(tenantId, id);
  });

  // GET /api/v1/logistics/:id/anomalies
  server.get<{ Params: { id: string } }>("/:id/anomalies", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentAnomalies(tenantId, id);
  });
}
