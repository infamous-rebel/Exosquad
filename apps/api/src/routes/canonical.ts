// =============================================================================
// API — Canonical Data Routes (Phase 3)
// =============================================================================
// Authenticated, tenant-scoped endpoints for accessing canonical entities:
// products, brands, categories, observations, and normalization errors.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "@exosquad/database";
import { z } from "zod";
import {
  NotFoundError,
  paginationSchema,
  sortSchema,
  type PaginatedResult,
} from "@exosquad/common";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const productQuerySchema = paginationSchema.merge(sortSchema).merge(
  z.object({
    brandId: z.string().optional(),
    categoryId: z.string().optional(),
    status: z.enum(["active", "merged", "deprecated"]).optional(),
    search: z.string().optional(),
  })
);

const brandQuerySchema = paginationSchema.merge(
  z.object({
    status: z.enum(["active", "merged", "deprecated"]).optional(),
    search: z.string().optional(),
  })
);

const observationQuerySchema = paginationSchema.merge(
  z.object({
    sourceId: z.string().optional(),
    status: z.enum(["pending", "normalized", "failed", "skipped", "partial"]).optional(),
    quality: z.enum(["valid", "partial", "ambiguous", "invalid", "unresolved"]).optional(),
  })
);

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Product routes — CRUD + search for canonical products.
 */
export async function productRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/products
  server.get("/", async (request) => {
    const query = productQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.brandId) where.brandId = query.brandId;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.normalizedName = { contains: query.search.toLowerCase(), mode: "insensitive" };
    }

    const orderBy: Record<string, string> = {};
    if (query.sortBy) {
      orderBy[query.sortBy] = query.sortOrder;
    } else {
      orderBy["createdAt"] = "desc";
    }

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          brand: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          identifiers: { select: { id: true, type: true, value: true, isValid: true } },
          _count: { select: { variants: true, evidence: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const result: PaginatedResult<unknown> = {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };

    return result;
  });

  // GET /api/v1/products/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const product = await prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        brand: { select: { id: true, name: true, normalizedName: true } },
        category: { select: { id: true, name: true, path: true } },
        variants: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        identifiers: {
          select: { id: true, type: true, value: true, normalized: true, isValid: true, sourceId: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundError("Product", id);
    }

    return product;
  });

  // GET /api/v1/products/:id/evidence
  server.get<{ Params: { id: string } }>("/:id/evidence", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    const product = await prisma.product.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundError("Product", id);
    }

    const [data, total] = await Promise.all([
      prisma.evidence.findMany({
        where: { productId: id, tenantId },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.evidence.count({ where: { productId: id, tenantId } }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    } satisfies PaginatedResult<unknown>;
  });
}

/**
 * Brand routes — list and view canonical brands.
 */
export async function brandRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/brands
  server.get("/", async (request) => {
    const query = brandQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.normalizedName = { contains: query.search.toLowerCase(), mode: "insensitive" };
    }

    const [data, total] = await Promise.all([
      prisma.brand.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          _count: { select: { products: true, aliases: true } },
        },
      }),
      prisma.brand.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    } satisfies PaginatedResult<unknown>;
  });

  // GET /api/v1/brands/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const brand = await prisma.brand.findFirst({
      where: { id, tenantId },
      include: {
        aliases: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        _count: { select: { products: true } },
      },
    });

    if (!brand) {
      throw new NotFoundError("Brand", id);
    }

    return brand;
  });
}

/**
 * Observation routes — list and view raw observations with normalization status.
 */
export async function observationRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/observations
  server.get("/", async (request) => {
    const query = observationQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.sourceId) where.sourceId = query.sourceId;
    if (query.status) where.normalizationStatus = query.status;
    if (query.quality) where.dataQuality = query.quality;

    const [data, total] = await Promise.all([
      prisma.observation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          sourceId: true,
          contentHash: true,
          retrievedAt: true,
          observedAt: true,
          normalizationStatus: true,
          dataQuality: true,
          normalizedAt: true,
          brandId: true,
          productId: true,
          productVariantId: true,
          createdAt: true,
          source: { select: { id: true, name: true } },
        },
      }),
      prisma.observation.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    } satisfies PaginatedResult<unknown>;
  });

  // GET /api/v1/observations/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const observation = await prisma.observation.findFirst({
      where: { id, tenantId },
      include: {
        source: { select: { id: true, name: true, type: true } },
        normalizationErrors: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!observation) {
      throw new NotFoundError("Observation", id);
    }

    return observation;
  });
}

/**
 * Normalization error routes — view processing failures.
 */
export async function normalizationErrorRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/normalization-errors
  server.get("/", async (request) => {
    const query = paginationSchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where = { tenantId };

    const [data, total] = await Promise.all([
      prisma.normalizationError.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.normalizationError.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    } satisfies PaginatedResult<unknown>;
  });
}
