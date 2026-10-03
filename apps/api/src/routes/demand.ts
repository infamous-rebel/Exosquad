// =============================================================================
// API — Demand Intelligence Routes (Phase 7)
// =============================================================================
// Authenticated, tenant-scoped endpoints for demand intelligence:
// product demand, history, signals, trends, market demand, provenance.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  NotFoundError,
  paginationSchema,
  sortSchema,
} from "@exosquad/common";

import {
  queryDemandSignals,
  getDemandSignalById,
  getProductSignalSummary,
} from "../services/demand-signals.js";

import {
  computeProductDemand,
  getDemandHistory,
  queryMarketDemand,
  getDemandProvenance,
} from "../services/demand-intelligence.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const demandQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
  geography: z.string().default("global"),
});

const demandHistorySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  signalType: z.string().optional(),
  metric: z.string().optional(),
  geography: z.string().optional(),
  productVariantId: z.string().optional(),
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
});

const signalQuerySchema = paginationSchema.merge(sortSchema).merge(
  z.object({
    productId: z.string().optional(),
    productVariantId: z.string().optional(),
    brandId: z.string().optional(),
    sellerId: z.string().optional(),
    sourceId: z.string().optional(),
    signalType: z.string().optional(),
    metric: z.string().optional(),
    geography: z.string().optional(),
    country: z.string().optional(),
    marketplace: z.string().optional(),
    granularity: z.string().optional(),
    dataQuality: z.string().optional(),
    freshness: z.string().optional(),
    status: z.string().optional(),
    observedAfter: z.string().optional(),
    observedBefore: z.string().optional(),
  })
);

const marketDemandSchema = paginationSchema.merge(
  z.object({
    productId: z.string().optional(),
    brandId: z.string().optional(),
    country: z.string().optional(),
    geography: z.string().optional(),
    signalType: z.string().optional(),
    trend: z.string().optional(),
    confidenceMin: z.coerce.number().min(0).max(1).optional(),
    confidenceMax: z.coerce.number().min(0).max(1).optional(),
    dateStart: z.string().optional(),
    dateEnd: z.string().optional(),
  })
);

const provenanceQuerySchema = z.object({
  calculationType: z.string().optional(),
});

// ─── Product Demand Routes ───────────────────────────────────────────────────

/**
 * Product demand routes — demand intelligence for individual products.
 */
export async function productDemandRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/products/:id/demand
  server.get<{ Params: { id: string } }>(
    "/:id/demand",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { id: productId } = request.params;
      const query = demandQuerySchema.parse(request.query);

      // Verify product exists and belongs to tenant
      const { prisma } = await import("@exosquad/database");
      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true },
      });

      if (!product) {
        throw new NotFoundError("Product", productId);
      }

      const result = await computeProductDemand({
        tenantId,
        productId,
        windowDays: query.windowDays,
        geography: query.geography,
      });

      return result;
    }
  );

  // GET /api/v1/products/:id/demand/history
  server.get<{ Params: { id: string } }>(
    "/:id/demand/history",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { id: productId } = request.params;
      const query = demandHistorySchema.parse(request.query);

      const { prisma } = await import("@exosquad/database");
      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true },
      });

      if (!product) {
        throw new NotFoundError("Product", productId);
      }

      const now = new Date();
      const windowDays = query.windowDays;
      const startDate = query.startDate
        ? new Date(query.startDate)
        : new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const endDate = query.endDate ? new Date(query.endDate) : now;

      const result = await getDemandHistory({
        tenantId,
        productId,
        startDate,
        endDate,
        signalType: query.signalType,
        metric: query.metric,
        geography: query.geography,
        productVariantId: query.productVariantId,
      });

      return result;
    }
  );

  // GET /api/v1/products/:id/demand/provenance
  server.get<{ Params: { id: string } }>(
    "/:id/demand/provenance",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { id: productId } = request.params;
      const query = provenanceQuerySchema.parse(request.query);

      const { prisma } = await import("@exosquad/database");
      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true },
      });

      if (!product) {
        throw new NotFoundError("Product", productId);
      }

      const result = await getDemandProvenance({
        tenantId,
        productId,
        calculationType: query.calculationType,
      });

      return result;
    }
  );

  // GET /api/v1/products/:id/signals
  server.get<{ Params: { id: string } }>(
    "/:id/signals",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { id: productId } = request.params;
      const query = signalQuerySchema.parse(request.query);

      const { prisma } = await import("@exosquad/database");
      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true },
      });

      if (!product) {
        throw new NotFoundError("Product", productId);
      }

      const result = await queryDemandSignals({
        tenantId,
        productId,
        ...query,
        observedAfter: query.observedAfter ? new Date(query.observedAfter) : undefined,
        observedBefore: query.observedBefore ? new Date(query.observedBefore) : undefined,
      });

      return result;
    }
  );

  // GET /api/v1/products/:id/signals/summary
  server.get<{ Params: { id: string } }>(
    "/:id/signals/summary",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { id: productId } = request.params;

      const { prisma } = await import("@exosquad/database");
      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true },
      });

      if (!product) {
        throw new NotFoundError("Product", productId);
      }

      return getProductSignalSummary(tenantId, productId);
    }
  );

  // GET /api/v1/products/:id/trends
  server.get<{ Params: { id: string } }>(
    "/:id/trends",
    async (request) => {
      const tenantId = request.user!.tenantId;
      const { id: productId } = request.params;
      const query = demandQuerySchema.parse(request.query);

      const { prisma } = await import("@exosquad/database");
      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true },
      });

      if (!product) {
        throw new NotFoundError("Product", productId);
      }

      // Fetch latest trend calculation
      const { prisma: db } = await import("@exosquad/database");
      const trendCalc = await db.demandCalculation.findFirst({
        where: {
          tenantId,
          productId,
          calculationType: "trend_classification",
          status: "active",
        },
        orderBy: { calculatedAt: "desc" },
      });

      // Also get growth, acceleration, momentum for context
      const [growthCalc, accelerationCalc, momentumCalc] = await Promise.all([
        db.demandCalculation.findFirst({
          where: { tenantId, productId, calculationType: "demand_growth", status: "active" },
          orderBy: { calculatedAt: "desc" },
        }),
        db.demandCalculation.findFirst({
          where: { tenantId, productId, calculationType: "demand_acceleration", status: "active" },
          orderBy: { calculatedAt: "desc" },
        }),
        db.demandCalculation.findFirst({
          where: { tenantId, productId, calculationType: "momentum", status: "active" },
          orderBy: { calculatedAt: "desc" },
        }),
      ]);

      return {
        productId,
        trend: trendCalc?.result ?? null,
        growth: growthCalc?.result ?? null,
        acceleration: accelerationCalc?.result ?? null,
        momentum: momentumCalc?.result ?? null,
        window: { days: query.windowDays, geography: query.geography },
        calculatedAt: trendCalc?.calculatedAt ?? null,
      };
    }
  );
}

// ─── Market Demand Routes ────────────────────────────────────────────────────

/**
 * Market demand routes — aggregate demand intelligence across products.
 */
export async function marketDemandRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/demand
  server.get("/", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = marketDemandSchema.parse(request.query);

    const result = await queryMarketDemand({
      tenantId,
      ...query,
      dateStart: query.dateStart ? new Date(query.dateStart) : undefined,
      dateEnd: query.dateEnd ? new Date(query.dateEnd) : undefined,
    });

    return result;
  });
}

// ─── Signal Detail Routes ────────────────────────────────────────────────────

/**
 * Signal detail routes — individual signal inspection.
 */
export async function signalDetailRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/signals
  server.get("/", async (request) => {
    const tenantId = request.user!.tenantId;
    const query = signalQuerySchema.parse(request.query);

    const result = await queryDemandSignals({
      tenantId,
      ...query,
      observedAfter: query.observedAfter ? new Date(query.observedAfter) : undefined,
      observedBefore: query.observedBefore ? new Date(query.observedBefore) : undefined,
    });

    return result;
  });

  // GET /api/v1/signals/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const signal = await getDemandSignalById(tenantId, id);

    if (!signal) {
      throw new NotFoundError("DemandSignal", id);
    }

    return signal;
  });
}
