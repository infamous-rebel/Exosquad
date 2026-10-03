// =============================================================================
// API — Authenticity Routes (Phase 8 — Original Roadmap)
// =============================================================================
// Authenticated, tenant-scoped endpoints for authenticity intelligence:
// assess, get, list, recalculate, signals, evidence, risks, history, provenance.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  paginationSchema,
  sortSchema,
} from "@exosquad/common";

import {
  assessAuthenticity,
  getAssessment,
  listAssessments,
  getAssessmentSignals,
  getAssessmentEvidence,
  getAssessmentRisks,
  getAssessmentHistory,
  getAssessmentProvenance,
  recalculateAssessment,
} from "../services/authenticity-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const assessSchema = z.object({
  subjectType: z.enum(["PRODUCT", "SKU", "BRAND", "SELLER", "SUPPLIER", "LISTING", "DOCUMENT"]),
  subjectId: z.string().min(1),
});

const assessmentListSchema = paginationSchema.merge(sortSchema).merge(
  z.object({
    subjectType: z.string().optional(),
    subjectId: z.string().optional(),
    status: z.string().optional(),
    minScore: z.coerce.number().min(0).max(100).optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
  })
);

// ─── Authenticity Routes ─────────────────────────────────────────────────────

/**
 * Main authenticity routes under /api/v1/authenticity.
 */
export async function authenticityRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // POST /api/v1/authenticity/assess
  server.post("/assess", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = assessSchema.parse(request.body);

    const result = await assessAuthenticity({
      tenantId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
    });

    return {
      assessmentId: result.assessmentId,
      status: result.status,
      score: result.score,
      confidence: result.confidence,
      algorithmVersion: result.algorithmVersion,
      signalCount: result.signalCount,
      evidenceCount: result.evidenceCount,
      contradictionCount: result.contradictionCount,
    };
  });

  // GET /api/v1/authenticity (list)
  server.get("/", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = assessmentListSchema.parse(request.query);

    return listAssessments({
      tenantId,
      ...query,
    });
  });

  // GET /api/v1/authenticity/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessment(tenantId, id);
  });

  // POST /api/v1/authenticity/:id/recalculate
  server.post<{ Params: { id: string } }>("/:id/recalculate", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    // Fire-and-forget: return immediately
    recalculateAssessment(tenantId, id).catch((err) => {
      const { logger } = require("@exosquad/logger");
      logger.error({ err, tenantId, assessmentId: id }, "authenticity_recalculation_failed");
    });

    return {
      status: "queued",
      message: "Authenticity recalculation has been queued",
      tenantId,
      assessmentId: id,
    };
  });

  // GET /api/v1/authenticity/:id/signals
  server.get<{ Params: { id: string } }>("/:id/signals", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentSignals(tenantId, id);
  });

  // GET /api/v1/authenticity/:id/evidence
  server.get<{ Params: { id: string } }>("/:id/evidence", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentEvidence(tenantId, id);
  });

  // GET /api/v1/authenticity/:id/risks
  server.get<{ Params: { id: string } }>("/:id/risks", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentRisks(tenantId, id);
  });

  // GET /api/v1/authenticity/:id/history
  server.get<{ Params: { id: string } }>("/:id/history", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentHistory(tenantId, id);
  });

  // GET /api/v1/authenticity/:id/provenance
  server.get<{ Params: { id: string } }>("/:id/provenance", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    return getAssessmentProvenance(tenantId, id);
  });
}
