// =============================================================================
// API — Evidence Routes (Phase 6)
// =============================================================================
// Authenticated, tenant-scoped endpoints for evidence, claims, provenance,
// conflicts, and calculations.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  NotFoundError,
  paginationSchema,
  sortSchema,
} from "@exosquad/common";

import { queryEvidence, getEvidenceById } from "../services/evidence.js";
import { queryClaims, getClaimById } from "../services/claims.js";
import { getEntityProvenance, getProvenanceGraph } from "../services/provenance.js";
import { queryConflicts, getConflictById, resolveConflict } from "../services/evidence-conflicts.js";
import { getCalculationById, getCalculationProvenance, queryCalculations } from "../services/calculations.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const evidenceQuerySchema = paginationSchema.merge(sortSchema).merge(
  z.object({
    sourceId: z.string().optional(),
    observationId: z.string().optional(),
    productId: z.string().optional(),
    evidenceType: z.string().optional(),
    status: z.string().optional(),
    freshness: z.string().optional(),
    confidenceMin: z.number().min(0).max(1).optional(),
    confidenceMax: z.number().min(0).max(1).optional(),
    observedAfter: z.string().optional(),
    observedBefore: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    search: z.string().optional(),
  })
);

const claimQuerySchema = paginationSchema.merge(sortSchema).merge(
  z.object({
    subjectType: z.string().optional(),
    subjectId: z.string().optional(),
    predicate: z.string().optional(),
    claimType: z.string().optional(),
    status: z.string().optional(),
    observationStatus: z.string().optional(),
  })
);

const provenanceQuerySchema = z.object({
  maxDepth: z.number().int().min(1).max(10).default(5),
});

const graphQuerySchema = z.object({
  maxDepth: z.number().int().min(1).max(7).default(3),
});

const conflictQuerySchema = paginationSchema.merge(sortSchema).merge(
  z.object({
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    conflictType: z.string().optional(),
    status: z.string().optional(),
  })
);

const resolveConflictSchema = z.object({
  resolvedBy: z.string().min(1),
  resolution: z.string().min(1),
  resolverMethod: z.string().optional(),
  newStatus: z.string().optional(),
});

const calculationQuerySchema = paginationSchema.merge(sortSchema).merge(
  z.object({
    calculationType: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    status: z.string().optional(),
    algorithm: z.string().optional(),
  })
);

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Evidence routes — list and retrieve evidence with filtering.
 */
export async function evidenceRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/evidence
  server.get("/", async (request) => {
    const query = evidenceQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const result = await queryEvidence({
      tenantId,
      ...query,
      observedAfter: query.observedAfter ? new Date(query.observedAfter) : undefined,
      observedBefore: query.observedBefore ? new Date(query.observedBefore) : undefined,
    });
    return result;
  });

  // GET /api/v1/evidence/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const evidence = await getEvidenceById(tenantId, id);

    if (!evidence) {
      throw new NotFoundError("Evidence", id);
    }

    return evidence;
  });
}

/**
 * Claim routes — list and retrieve claims.
 */
export async function claimRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/claims
  server.get("/", async (request) => {
    const query = claimQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const result = await queryClaims({ tenantId, ...query });
    return result;
  });

  // GET /api/v1/claims/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const claim = await getClaimById(tenantId, id);

    if (!claim) {
      throw new NotFoundError("Claim", id);
    }

    return claim;
  });
}

/**
 * Provenance routes — entity provenance chain traversal.
 */
export async function provenanceRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/provenance/:entityType/:entityId
  server.get<{ Params: { entityType: string; entityId: string } }>(
    "/provenance/:entityType/:entityId",
    async (request) => {
      const query = provenanceQuerySchema.parse(request.query);
      const tenantId = request.user!.tenantId;
      const { entityType, entityId } = request.params;

      const result = await getEntityProvenance(tenantId, entityType, entityId, query.maxDepth);
      return result;
    }
  );
}

/**
 * Evidence graph routes — bounded graph traversal.
 */
export async function evidenceGraphRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/graph/:entityType/:entityId
  server.get<{ Params: { entityType: string; entityId: string } }>(
    "/graph/:entityType/:entityId",
    async (request) => {
      const query = graphQuerySchema.parse(request.query);
      const tenantId = request.user!.tenantId;
      const { entityType, entityId } = request.params;

      const result = await getProvenanceGraph(tenantId, entityType, entityId, query.maxDepth);
      return result;
    }
  );
}

/**
 * Evidence conflict routes — list, retrieve, and resolve conflicts.
 */
export async function evidenceConflictRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/conflicts
  server.get("/conflicts", async (request) => {
    const query = conflictQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const result = await queryConflicts({ tenantId, ...query });
    return result;
  });

  // GET /api/v1/conflicts/:id
  server.get<{ Params: { id: string } }>("/conflicts/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const conflict = await getConflictById(tenantId, id);

    if (!conflict) {
      throw new NotFoundError("Conflict", id);
    }

    return conflict;
  });

  // PATCH /api/v1/conflicts/:id
  server.patch<{ Params: { id: string } }>("/conflicts/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = resolveConflictSchema.parse(request.body);

    const conflict = await getConflictById(tenantId, id);

    if (!conflict) {
      throw new NotFoundError("Conflict", id);
    }

    const result = await resolveConflict({ tenantId, conflictId: id, ...body });
    return result;
  });
}

/**
 * Calculation routes — list, retrieve, and get provenance for calculations.
 */
export async function calculationRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/calculations
  server.get("/calculations", async (request) => {
    const query = calculationQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const result = await queryCalculations({ tenantId, ...query });
    return result;
  });

  // GET /api/v1/calculations/:id
  server.get<{ Params: { id: string } }>("/calculations/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const calculation = await getCalculationById(tenantId, id);

    if (!calculation) {
      throw new NotFoundError("Calculation", id);
    }

    return calculation;
  });

  // GET /api/v1/calculations/:id/provenance
  server.get<{ Params: { id: string } }>("/calculations/:id/provenance", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const calculation = await getCalculationById(tenantId, id);

    if (!calculation) {
      throw new NotFoundError("Calculation", id);
    }

    const result = await getCalculationProvenance(tenantId, id);
    return result;
  });
}
