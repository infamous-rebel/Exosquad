// =============================================================================
// API — Supply-Chain Routes (Phase 9)
// =============================================================================
// Authenticated, tenant-scoped endpoints for supply-chain intelligence:
// assess, list, get, recalculate, nodes, edges, paths, evidence, conflicts,
// provenance, history, verifications, anomalies, edge detail, claims,
// relationship queries.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  paginationSchema,
  SC_CLAIM_TYPES,
} from "@exosquad/common";

import {
  assessSupplyChain,
  getAssessment,
  listAssessments,
  getAssessmentNodes,
  getAssessmentEdges,
  getAssessmentPaths,
  getAssessmentEvidence,
  getAssessmentConflicts,
  getAssessmentProvenance,
  getAssessmentHistory,
  getAssessmentVerifications,
  getAssessmentAnomalies,
  getEdge,
  getEdgeProvenance,
  getEdgeObservations,
  recordClaim,
  listClaims,
  getClaim,
  queryRelationships,
  recalculateAssessment,
} from "../services/supply-chain-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const assessSchema = z.object({
  subjectType: z.enum(["PRODUCT", "SKU", "SELLER", "SUPPLIER", "BRAND", "ORGANIZATION"]),
  subjectId: z.string().min(1),
});

const assessmentListSchema = paginationSchema.merge(
  z.object({
    subjectType: z.string().optional(),
    subjectId: z.string().optional(),
    status: z.string().optional(),
  })
);

const claimCreateSchema = z.object({
  claimType: z.enum(SC_CLAIM_TYPES as unknown as [string, ...string[]]),
  claimText: z.string().min(1),
  claimingNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceId: z.string().min(1),
  evidenceId: z.string().optional(),
});

const claimListSchema = paginationSchema.merge(
  z.object({
    claimType: z.string().optional(),
    status: z.string().optional(),
  })
);

const relationshipQuerySchema = paginationSchema.merge(
  z.object({
    nodeType: z.string().optional(),
    edgeType: z.string().optional(),
    status: z.string().optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
    maxConfidence: z.coerce.number().min(0).max(1).optional(),
    sourceId: z.string().optional(),
    country: z.string().optional(),
    productId: z.string().optional(),
    sellerId: z.string().optional(),
    supplierId: z.string().optional(),
    manufacturerId: z.string().optional(),
    hasContradiction: z.coerce.boolean().optional(),
    hasEvidence: z.coerce.boolean().optional(),
    asOf: z.string().optional(),
  })
);

const pathsQuerySchema = z.object({
  maxDepth: z.coerce.number().int().min(1).max(10).default(5),
});

// ─── Supply-Chain Routes ─────────────────────────────────────────────────────

/**
 * Main supply-chain routes under /api/v1/supply-chain.
 */
export async function supplyChainRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // POST /api/v1/supply-chain/assess
  server.post("/assess", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = assessSchema.parse(request.body);

    const result = await assessSupplyChain({
      tenantId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
    });

    return result;
  });

  // GET /api/v1/supply-chain (list assessments)
  server.get("/", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = assessmentListSchema.parse(request.query);

    return listAssessments({ tenantId, ...query });
  });

  // GET /api/v1/supply-chain/relationships
  server.get("/relationships", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = relationshipQuerySchema.parse(request.query);

    return queryRelationships({ tenantId, ...query });
  });

  // GET /api/v1/supply-chain/claims
  server.get("/claims", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = claimListSchema.parse(request.query);

    return listClaims({ tenantId, ...query });
  });

  // POST /api/v1/supply-chain/claims
  server.post("/claims", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = claimCreateSchema.parse(request.body);

    return recordClaim({ tenantId, ...body });
  });

  // GET /api/v1/supply-chain/claims/:id
  server.get<{ Params: { id: string } }>("/claims/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getClaim(tenantId, id);
  });

  // GET /api/v1/supply-chain/edges/:id
  server.get<{ Params: { id: string } }>("/edges/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getEdge(tenantId, id);
  });

  // GET /api/v1/supply-chain/edges/:id/provenance
  server.get<{ Params: { id: string } }>("/edges/:id/provenance", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getEdgeProvenance(tenantId, id);
  });

  // GET /api/v1/supply-chain/edges/:id/observations
  server.get<{ Params: { id: string } }>("/edges/:id/observations", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    return getEdgeObservations(tenantId, id, query.page, query.limit);
  });

  // GET /api/v1/supply-chain/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessment(tenantId, id);
  });

  // POST /api/v1/supply-chain/:id/recalculate
  server.post<{ Params: { id: string } }>("/:id/recalculate", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    // Fire-and-forget: return immediately
    recalculateAssessment(tenantId, id).catch((err) => {
      const { logger } = require("@exosquad/logger");
      logger.error({ err, tenantId, assessmentId: id }, "supply_chain_recalculation_failed");
    });

    return {
      status: "queued",
      message: "Supply-chain recalculation has been queued",
      tenantId,
      assessmentId: id,
    };
  });

  // GET /api/v1/supply-chain/:id/nodes
  server.get<{ Params: { id: string } }>("/:id/nodes", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    return getAssessmentNodes(tenantId, id, query.page, query.limit);
  });

  // GET /api/v1/supply-chain/:id/edges
  server.get<{ Params: { id: string } }>("/:id/edges", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    return getAssessmentEdges(tenantId, id, query.page, query.limit);
  });

  // GET /api/v1/supply-chain/:id/paths
  server.get<{ Params: { id: string } }>("/:id/paths", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = pathsQuerySchema.parse(request.query);

    return getAssessmentPaths(tenantId, id, query.maxDepth);
  });

  // GET /api/v1/supply-chain/:id/evidence
  server.get<{ Params: { id: string } }>("/:id/evidence", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    return getAssessmentEvidence(tenantId, id, query.page, query.limit);
  });

  // GET /api/v1/supply-chain/:id/conflicts
  server.get<{ Params: { id: string } }>("/:id/conflicts", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentConflicts(tenantId, id);
  });

  // GET /api/v1/supply-chain/:id/provenance
  server.get<{ Params: { id: string } }>("/:id/provenance", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentProvenance(tenantId, id);
  });

  // GET /api/v1/supply-chain/:id/history
  server.get<{ Params: { id: string } }>("/:id/history", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentHistory(tenantId, id);
  });

  // GET /api/v1/supply-chain/:id/verifications
  server.get<{ Params: { id: string } }>("/:id/verifications", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentVerifications(tenantId, id);
  });

  // GET /api/v1/supply-chain/:id/anomalies
  server.get<{ Params: { id: string } }>("/:id/anomalies", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentAnomalies(tenantId, id);
  });
}
