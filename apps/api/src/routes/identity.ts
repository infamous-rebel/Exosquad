// =============================================================================
// API — Identity Resolution Routes (Phase 4)
// =============================================================================
// Authenticated, tenant-scoped endpoints for identity intelligence:
// products with identity, candidates, conflicts, decisions, search, merge.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma, Prisma } from "@exosquad/database";
import { z } from "zod";
import {
  NotFoundError,
  ValidationError,
  paginationSchema,
  type PaginatedResult,
} from "@exosquad/common";
import { createSearchKey } from "@exosquad/normalization";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const identityProductQuerySchema = paginationSchema.merge(
  z.object({
    brandId: z.string().optional(),
    status: z.enum(["active", "merged", "deprecated"]).optional(),
    identityStatus: z.enum([
      "resolved", "high_confidence", "possible",
      "ambiguous", "conflict", "unresolved", "invalid",
    ]).optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
);

const candidateQuerySchema = paginationSchema.merge(
  z.object({
    status: z.enum(["pending", "processing", "matched", "rejected", "ambiguous", "failed"]).optional(),
    productId: z.string().optional(),
  })
);

const conflictQuerySchema = paginationSchema.merge(
  z.object({
    status: z.enum(["open", "resolved", "dismissed", "superseded"]).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    conflictType: z.string().optional(),
    entityId: z.string().optional(),
  })
);

const decisionQuerySchema = paginationSchema.merge(
  z.object({
    decision: z.enum([
      "EXACT_MATCH", "HIGH_CONFIDENCE_MATCH", "POSSIBLE_MATCH",
      "NO_MATCH", "CONFLICT", "UNRESOLVED",
    ]).optional(),
    productId: z.string().optional(),
    method: z.string().optional(),
  })
);

const searchQuerySchema = paginationSchema.merge(
  z.object({
    q: z.string().min(1),
    type: z.enum(["name", "identifier", "brand", "all"]).default("all"),
  })
);

const mergeRequestSchema = z.object({
  fromProductId: z.string().min(1),
  toProductId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  relationshipType: z.enum([
    "EXACT_SKU", "SAME_PRODUCT_VARIANT", "SAME_PRODUCT_FAMILY",
    "RELATED_PRODUCT", "REPLACED_BY", "SUPERSEDED_BY",
  ]),
});

const conflictResolutionSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  resolution: z.string().min(1).max(2000),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Identity product routes — enhanced product listing with identity status.
 */
export async function identityProductRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/identity/products
  server.get("/products", async (request) => {
    const query = identityProductQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.brandId) where.brandId = query.brandId;
    if (query.status) where.status = query.status;
    if (query.identityStatus) where.identityStatus = query.identityStatus;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { normalizedName: { contains: query.search.toLowerCase(), mode: "insensitive" } },
        { searchKey: { contains: createSearchKey(query.search), mode: "insensitive" } },
      ];
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
          identifiers: { select: { id: true, type: true, value: true, isValid: true } },
          _count: {
            select: {
              variants: true,
              relationshipsAsFrom: true,
              relationshipsAsTo: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
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

  // GET /api/v1/identity/products/:id
  server.get<{ Params: { id: string } }>("/products/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const product = await prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        brand: { select: { id: true, name: true, normalizedName: true } },
        variants: { orderBy: { createdAt: "desc" }, take: 50 },
        identifiers: {
          select: { id: true, type: true, value: true, normalized: true, isValid: true, sourceId: true },
        },
        productAttributes: { take: 50 },
        relationshipsAsFrom: {
          include: { toProduct: { select: { id: true, name: true } } },
          take: 20,
        },
        relationshipsAsTo: {
          include: { fromProduct: { select: { id: true, name: true } } },
          take: 20,
        },
        _count: {
          select: {
            decisionsAsFrom: true,
            decisionsAsTo: true,
            conflictsAsEntity: true,
            candidatesAsFrom: true,
          },
        },
      },
    });

    if (!product) throw new NotFoundError("Product", id);
    return product;
  });
}

/**
 * Identity candidate routes — view and manage resolution candidates.
 */
export async function identityCandidateRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/identity/candidates
  server.get("/candidates", async (request) => {
    const query = candidateQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.status) where.status = query.status;
    if (query.productId) {
      where.OR = [
        { fromProductId: query.productId },
        { toProductId: query.productId },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.identityCandidate.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          fromProduct: { select: { id: true, name: true, identityStatus: true } },
          toProduct: { select: { id: true, name: true, identityStatus: true } },
        },
      }),
      prisma.identityCandidate.count({ where }),
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
 * Identity conflict routes — view and manage conflicts.
 */
export async function identityConflictRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/identity/conflicts
  server.get("/conflicts", async (request) => {
    const query = conflictQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.conflictType) where.conflictType = query.conflictType;
    if (query.entityId) where.entityId = query.entityId;

    const [data, total] = await Promise.all([
      prisma.identityConflict.findMany({
        where,
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          entity: { select: { id: true, name: true, identityStatus: true } },
        },
      }),
      prisma.identityConflict.count({ where }),
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

  // PATCH /api/v1/identity/conflicts/:id
  server.patch<{ Params: { id: string } }>("/conflicts/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = conflictResolutionSchema.parse(request.body);

    const conflict = await prisma.identityConflict.findFirst({
      where: { id, tenantId },
    });

    if (!conflict) throw new NotFoundError("IdentityConflict", id);

    const updated = await prisma.identityConflict.update({
      where: { id },
      data: {
        status: body.status,
        resolution: body.resolution,
        resolvedAt: new Date(),
        resolvedBy: request.user!.userId,
      },
    });

    return updated;
  });
}

/**
 * Identity decision routes — view match decisions and evidence.
 */
export async function identityDecisionRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/identity/decisions
  server.get("/decisions", async (request) => {
    const query = decisionQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.decision) where.decision = query.decision;
    if (query.method) where.method = query.method;
    if (query.productId) {
      where.OR = [
        { fromProductId: query.productId },
        { toProductId: query.productId },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.identityDecision.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          fromProduct: { select: { id: true, name: true } },
          toProduct: { select: { id: true, name: true } },
        },
      }),
      prisma.identityDecision.count({ where }),
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
 * Identity search routes — search across products, identifiers, brands.
 */
export async function identitySearchRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/identity/search
  server.get("/search", async (request) => {
    const query = searchQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const results: Array<{
      type: string;
      id: string;
      name: string;
      score: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (query.type === "all" || query.type === "identifier") {
      // Exact identifier lookup
      const identifiers = await prisma.productIdentifier.findMany({
        where: {
          tenantId,
          normalized: query.q.replace(/[\s-]/g, ""),
          isValid: true,
        },
        include: {
          product: { select: { id: true, name: true, identityStatus: true } },
        },
        take: query.limit,
      });

      for (const id of identifiers) {
        results.push({
          type: "identifier",
          id: id.product.id,
          name: id.product.name,
          score: 1.0,
          metadata: { identifierType: id.type, identifierValue: id.normalized },
        });
      }
    }

    if ((query.type === "all" || query.type === "name") && results.length < query.limit) {
      // Name search
      const searchKey = createSearchKey(query.q);
      const products = await prisma.product.findMany({
        where: {
          tenantId,
          status: "active",
          OR: [
            { searchKey: { contains: searchKey, mode: "insensitive" } },
            { normalizedName: { contains: query.q.toLowerCase(), mode: "insensitive" } },
          ],
        },
        include: {
          brand: { select: { id: true, name: true } },
          identifiers: { select: { type: true, value: true, isValid: true } },
        },
        take: query.limit - results.length,
      });

      for (const p of products) {
        results.push({
          type: "product",
          id: p.id,
          name: p.name,
          score: 0.8,
          metadata: {
            brand: p.brand?.name ?? null,
            identityStatus: p.identityStatus,
            identifiers: p.identifiers.length,
          },
        });
      }
    }

    if ((query.type === "all" || query.type === "brand") && results.length < query.limit) {
      // Brand search
      const brands = await prisma.brand.findMany({
        where: {
          tenantId,
          status: "active",
          OR: [
            { searchKey: { contains: createSearchKey(query.q), mode: "insensitive" } },
            { normalizedName: { contains: query.q.toLowerCase(), mode: "insensitive" } },
          ],
        },
        take: query.limit - results.length,
      });

      for (const b of brands) {
        results.push({
          type: "brand",
          id: b.id,
          name: b.name,
          score: 0.7,
          metadata: { normalizedName: b.normalizedName },
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return {
      data: results.slice(0, query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: results.length,
        totalPages: 1,
      },
    } satisfies PaginatedResult<unknown>;
  });
}

/**
 * Identity merge routes — merge/split products with history.
 */
export async function identityMergeRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // POST /api/v1/identity/merge
  server.post("/merge", async (request) => {
    const tenantId = request.user!.tenantId;
    const userId = request.user!.userId;
    const body = mergeRequestSchema.parse(request.body);

    // Verify both products exist and belong to tenant
    const [fromProduct, toProduct] = await Promise.all([
      prisma.product.findFirst({ where: { id: body.fromProductId, tenantId } }),
      prisma.product.findFirst({ where: { id: body.toProductId, tenantId } }),
    ]);

    if (!fromProduct) throw new NotFoundError("Product", body.fromProductId);
    if (!toProduct) throw new NotFoundError("Product", body.toProductId);
    if (fromProduct.id === toProduct.id) {
      throw new ValidationError("Cannot merge a product with itself");
    }

    // Perform merge in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create identity relationship
      const relationship = await tx.identityRelationship.upsert({
        where: {
          tenantId_fromProductId_toProductId_relationshipType: {
            tenantId,
            fromProductId: body.fromProductId,
            toProductId: body.toProductId,
            relationshipType: body.relationshipType,
          },
        },
        create: {
          tenantId,
          fromProductId: body.fromProductId,
          toProductId: body.toProductId,
          relationshipType: body.relationshipType,
          confidence: 1.0,
          evidenceJson: { reason: body.reason, method: "manual" } as Prisma.InputJsonValue,
        },
        update: {
          confidence: 1.0,
          evidenceJson: { reason: body.reason, method: "manual" } as Prisma.InputJsonValue,
          status: "active",
        },
      });

      // 2. If EXACT_SKU, mark the from product as merged
      if (body.relationshipType === "EXACT_SKU") {
        await tx.product.update({
          where: { id: body.fromProductId },
          data: { status: "merged", mergedIntoId: body.toProductId, identityStatus: "resolved" },
        });
      }

      // 3. Create merge history
      await tx.identityMergeHistory.create({
        data: {
          tenantId,
          entityId: body.fromProductId,
          action: "merged",
          fromProductId: body.fromProductId,
          toProductId: body.toProductId,
          reason: body.reason,
          evidenceJson: { relationshipType: body.relationshipType } as Prisma.InputJsonValue,
          actorType: "manual",
          actorId: userId,
        },
      });

      // 4. Create decision record
      await tx.identityDecision.create({
        data: {
          tenantId,
          fromProductId: body.fromProductId,
          toProductId: body.toProductId,
          decision: "EXACT_MATCH",
          confidence: 1.0,
          reasons: [body.reason] as Prisma.InputJsonValue,
          method: "manual",
          reviewerId: userId,
          reviewedAt: new Date(),
        },
      });

      return relationship;
    });

    return result;
  });

  // POST /api/v1/identity/split
  server.post("/split", async (request) => {
    const tenantId = request.user!.tenantId;
    const userId = request.user!.userId;
    const body = z.object({
      fromProductId: z.string().min(1),
      toProductId: z.string().min(1),
      reason: z.string().min(1).max(2000),
    }).parse(request.body);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Deactivate the relationship
      await tx.identityRelationship.updateMany({
        where: {
          tenantId,
          fromProductId: body.fromProductId,
          toProductId: body.toProductId,
          status: "active",
        },
        data: { status: "reversed" },
      });

      // 2. Restore product status if it was merged
      await tx.product.update({
        where: { id: body.fromProductId, tenantId },
        data: { status: "active", mergedIntoId: null },
      });

      // 3. Create split history
      const history = await tx.identityMergeHistory.create({
        data: {
          tenantId,
          entityId: body.fromProductId,
          action: "split",
          fromProductId: body.fromProductId,
          toProductId: body.toProductId,
          reason: body.reason,
          actorType: "manual",
          actorId: userId,
        },
      });

      return history;
    });

    return result;
  });

  // GET /api/v1/identity/merge-history
  server.get("/merge-history", async (request) => {
    const query = paginationSchema.merge(
      z.object({
        productId: z.string().optional(),
        action: z.string().optional(),
      })
    ).parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.productId) where.entityId = query.productId;
    if (query.action) where.action = query.action;

    const [data, total] = await Promise.all([
      prisma.identityMergeHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.identityMergeHistory.count({ where }),
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
 * Trigger identity resolution for products.
 */
export async function identityTriggerRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // POST /api/v1/identity/resolve
  server.post("/resolve", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = z.object({
      productIds: z.array(z.string()).optional(),
      sourceId: z.string().optional(),
      useAI: z.boolean().default(false),
    }).parse(request.body);

    // Import queue manager dynamically to avoid circular deps
    const { Queue } = await import("bullmq");
    const { config } = await import("@exosquad/config");

    const connection = {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    };

    const queue = new Queue("identity_resolution", { connection });

    const jobType = body.productIds
      ? "resolve_batch"
      : body.sourceId
        ? "reconcile_source"
        : "resolve_batch";

    const job = await queue.add(jobType, {
      tenantId,
      type: jobType,
      productIds: body.productIds,
      sourceId: body.sourceId,
      options: { useAI: body.useAI },
    }, {
      priority: 5,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });

    await queue.close();

    return { jobId: job.id, status: "queued", type: jobType };
  });
}
