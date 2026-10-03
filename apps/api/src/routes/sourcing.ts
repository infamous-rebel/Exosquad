// =============================================================================
// API — Supplier Sourcing Routes (Phase 13)
// =============================================================================
// Authenticated, tenant-scoped endpoints for supplier discovery, sourcing,
// and procurement viability intelligence.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { paginationSchema } from "@exosquad/common";

import {
  assessSupplierSourcing,
  recalculateSupplierSourcing,
  listSupplierAssessments,
  getSupplierAssessment,
  getSupplierComparison,
  listSourcingConstraints,
  listSupplierContacts,
  getAssessmentHistory,
  expireStaleAssessments,
} from "../services/supplier-sourcing-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const assessSchema = z.object({
  productId: z.string().min(1),
});

const assessmentListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
  }),
);

const constraintListSchema = paginationSchema.merge(
  z.object({
    productId: z.string().min(1),
  }),
);

// ─── Sourcing Routes ─────────────────────────────────────────────────────────

/**
 * Supplier sourcing routes under /api/v1/sourcing.
 */
export async function sourcingRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // ─── Assessment Endpoints ────────────────────────────────────────────────

  // POST /api/v1/sourcing/assess
  server.post("/assess", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = assessSchema.parse(request.body);
    return assessSupplierSourcing({ tenantId, productId: body.productId });
  });

  // GET /api/v1/sourcing/assessments
  server.get("/assessments", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = assessmentListSchema.parse(request.query);
    return listSupplierAssessments({ tenantId, ...query });
  });

  // GET /api/v1/sourcing/assessments/:id
  server.get<{ Params: { id: string } }>("/assessments/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    return getSupplierAssessment({ tenantId, assessmentId: id });
  });

  // POST /api/v1/sourcing/assessments/:id/recalculate
  server.post<{ Params: { id: string } }>("/assessments/:id/recalculate", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const assessment = await getSupplierAssessment({ tenantId, assessmentId: id }) as { productId: string };
    return recalculateSupplierSourcing({ tenantId, productId: assessment.productId });
  });

  // GET /api/v1/sourcing/assessments/:id/history
  server.get<{ Params: { id: string } }>("/assessments/:id/history", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const assessment = await getSupplierAssessment({ tenantId, assessmentId: id }) as { productId: string; supplierId: string };
    return getAssessmentHistory({
      tenantId,
      productId: assessment.productId,
      supplierId: assessment.supplierId,
      limit: 50,
    });
  });

  // ─── Product-Scoped Endpoints ────────────────────────────────────────────

  // GET /api/v1/sourcing/products/:productId/suppliers
  server.get<{ Params: { productId: string } }>("/products/:productId/suppliers", async (request) => {
    const tenantId = request.user!.tenantId;
    const { productId } = request.params;
    return listSupplierAssessments({ tenantId, productId, page: 1, limit: 50 });
  });

  // GET /api/v1/sourcing/products/:productId/suppliers/:supplierId
  server.get<{ Params: { productId: string; supplierId: string } }>(
    "/products/:productId/suppliers/:supplierId",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { productId, supplierId } = request.params;
      const assessments = await listSupplierAssessments({ tenantId, productId, page: 1, limit: 1 });
      const match = assessments.data.find((a) => (a as Record<string, unknown>).supplierId === supplierId);
      return match ?? { data: null, message: "Supplier assessment not found" };
    },
  );

  // GET /api/v1/sourcing/products/:productId/sourcing/comparison
  server.get<{ Params: { productId: string } }>(
    "/products/:productId/sourcing/comparison",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { productId } = request.params;
      return getSupplierComparison({ tenantId, productId });
    },
  );

  // GET /api/v1/sourcing/products/:productId/procurement-viability
  server.get<{ Params: { productId: string } }>(
    "/products/:productId/procurement-viability",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { productId } = request.params;
      return getSupplierComparison({ tenantId, productId });
    },
  );

  // GET /api/v1/sourcing/products/:productId/sourcing/constraints
  server.get<{ Params: { productId: string } }>(
    "/products/:productId/sourcing/constraints",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { productId } = request.params;
      const query = constraintListSchema.parse({ ...(request.query as Record<string, unknown>), productId });
      return listSourcingConstraints({ tenantId, ...query });
    },
  );

  // ─── Supplier Contact Endpoints ──────────────────────────────────────────

  // GET /api/v1/sourcing/suppliers/:supplierId/contacts
  server.get<{ Params: { supplierId: string } }>("/suppliers/:supplierId/contacts", async (request) => {
    const tenantId = request.user!.tenantId;
    const { supplierId } = request.params;
    return listSupplierContacts({ tenantId, supplierId });
  });

  // ─── Expiration ──────────────────────────────────────────────────────────

  // POST /api/v1/sourcing/expire
  server.post("/expire", async (request) => {
    const tenantId = request.user!.tenantId;
    return expireStaleAssessments({ tenantId });
  });
}
