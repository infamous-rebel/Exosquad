// =============================================================================
// API — Organization Entity Routes (Phase 5)
// =============================================================================
// Authenticated, tenant-scoped endpoints for commercial entity intelligence:
// organizations, org candidates, org conflicts, org decisions, org search,
// org merge/split, org resolution trigger.
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
import { createCompanySearchKey } from "@exosquad/entity";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const orgQuerySchema = paginationSchema.merge(
  z.object({
    status: z.enum(["active", "merged", "deprecated"]).optional(),
    identityStatus: z.enum([
      "resolved", "high_confidence", "possible",
      "ambiguous", "conflict", "unresolved",
    ]).optional(),
    country: z.string().optional(),
    role: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
);

const orgCandidateQuerySchema = paginationSchema.merge(
  z.object({
    status: z.enum(["pending", "processing", "matched", "rejected", "ambiguous", "failed"]).optional(),
    orgId: z.string().optional(),
  })
);

const orgConflictQuerySchema = paginationSchema.merge(
  z.object({
    status: z.enum(["open", "resolved", "dismissed", "superseded"]).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    conflictType: z.string().optional(),
    entityId: z.string().optional(),
  })
);

const orgDecisionQuerySchema = paginationSchema.merge(
  z.object({
    decision: z.enum([
      "EXACT_MATCH", "HIGH_CONFIDENCE_MATCH", "POSSIBLE_MATCH",
      "NO_MATCH", "CONFLICT", "UNRESOLVED",
    ]).optional(),
    orgId: z.string().optional(),
    method: z.string().optional(),
  })
);

const orgSearchQuerySchema = paginationSchema.merge(
  z.object({
    q: z.string().min(1),
    type: z.enum(["name", "domain", "identifier", "all"]).default("all"),
  })
);

const orgMergeRequestSchema = z.object({
  fromOrgId: z.string().min(1),
  toOrgId: z.string().min(1),
  reason: z.string().min(1).max(2000),
});

const orgConflictResolutionSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  resolution: z.string().min(1).max(2000),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Organization listing and detail.
 */
export async function organizationRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/organizations
  server.get("/", async (request) => {
    const query = orgQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId, status: query.status ?? "active" };
    if (query.identityStatus) where.identityStatus = query.identityStatus;
    if (query.country) where.country = query.country;
    if (query.role) {
      where.roles = { some: { role: query.role } };
    }
    if (query.search) {
      const searchKey = createCompanySearchKey(query.search);
      where.OR = [
        { canonicalName: { contains: query.search, mode: "insensitive" } },
        { normalizedName: { contains: query.search.toLowerCase(), mode: "insensitive" } },
        { searchKey: { contains: searchKey, mode: "insensitive" } },
        { domain: { contains: query.search.toLowerCase(), mode: "insensitive" } },
      ];
    }

    const orderBy: Record<string, string> = {};
    if (query.sortBy) {
      orderBy[query.sortBy] = query.sortOrder;
    } else {
      orderBy["createdAt"] = "desc";
    }

    const [data, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          roles: { select: { role: true, confidence: true } },
          domains: { select: { domain: true, isPrimary: true } },
          _count: {
            select: {
              sellers: true,
              suppliers: true,
              manufacturers: true,
              relationshipsAsFrom: true,
              relationshipsAsTo: true,
            },
          },
        },
      }),
      prisma.organization.count({ where }),
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

  // GET /api/v1/organizations/:id
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const org = await prisma.organization.findFirst({
      where: { id, tenantId },
      include: {
        roles: { select: { role: true, confidence: true, evidenceSource: true } },
        identifiers: { select: { type: true, value: true, normalized: true, country: true, verified: true } },
        domains: { select: { domain: true, isPrimary: true, confidence: true } },
        emails: { select: { email: true, normalizedEmail: true, domain: true, isCorporate: true } },
        phones: { select: { rawPhone: true, normalizedPhone: true, countryCode: true } },
        locations: { select: { locationType: true, city: true, state: true, country: true, postalCode: true, isPrimary: true } },
        contacts: { take: 20 },
        sellers: { select: { id: true, name: true, sourceId: true }, take: 20 },
        suppliers: { select: { id: true, name: true, sourceId: true }, take: 20 },
        manufacturers: { select: { id: true, name: true }, take: 20 },
        relationshipsAsFrom: {
          include: { toOrg: { select: { id: true, canonicalName: true } } },
          take: 20,
        },
        relationshipsAsTo: {
          include: { fromOrg: { select: { id: true, canonicalName: true } } },
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

    if (!org) throw new NotFoundError("Organization", id);
    return org;
  });
}

/**
 * Organization candidate routes.
 */
export async function orgCandidateRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/organizations/candidates
  server.get("/candidates", async (request) => {
    const query = orgCandidateQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.status) where.status = query.status;
    if (query.orgId) {
      where.OR = [
        { fromOrgId: query.orgId },
        { toOrgId: query.orgId },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.orgIdentityCandidate.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          fromOrg: { select: { id: true, canonicalName: true, identityStatus: true } },
          toOrg: { select: { id: true, canonicalName: true, identityStatus: true } },
        },
      }),
      prisma.orgIdentityCandidate.count({ where }),
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
 * Organization conflict routes.
 */
export async function orgConflictRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/organizations/conflicts
  server.get("/conflicts", async (request) => {
    const query = orgConflictQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.conflictType) where.conflictType = query.conflictType;
    if (query.entityId) where.entityId = query.entityId;

    const [data, total] = await Promise.all([
      prisma.orgIdentityConflict.findMany({
        where,
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          entity: { select: { id: true, canonicalName: true, identityStatus: true } },
        },
      }),
      prisma.orgIdentityConflict.count({ where }),
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

  // PATCH /api/v1/organizations/conflicts/:id
  server.patch<{ Params: { id: string } }>("/conflicts/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = orgConflictResolutionSchema.parse(request.body);

    const conflict = await prisma.orgIdentityConflict.findFirst({
      where: { id, tenantId },
    });

    if (!conflict) throw new NotFoundError("OrgIdentityConflict", id);

    const updated = await prisma.orgIdentityConflict.update({
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
 * Organization decision routes.
 */
export async function orgDecisionRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/organizations/decisions
  server.get("/decisions", async (request) => {
    const query = orgDecisionQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.decision) where.decision = query.decision;
    if (query.method) where.method = query.method;
    if (query.orgId) {
      where.OR = [
        { fromOrgId: query.orgId },
        { toOrgId: query.orgId },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.orgIdentityDecision.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          fromOrg: { select: { id: true, canonicalName: true } },
          toOrg: { select: { id: true, canonicalName: true } },
        },
      }),
      prisma.orgIdentityDecision.count({ where }),
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
 * Organization search routes.
 */
export async function orgSearchRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // GET /api/v1/organizations/search
  server.get("/search", async (request) => {
    const query = orgSearchQuerySchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const results: Array<{
      type: string;
      id: string;
      name: string;
      score: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (query.type === "all" || query.type === "identifier") {
      const identifiers = await prisma.organizationIdentifier.findMany({
        where: {
          tenantId,
          normalized: query.q.replace(/[\s-]/g, ""),
        },
        include: {
          organization: { select: { id: true, canonicalName: true, identityStatus: true } },
        },
        take: query.limit,
      });

      for (const id of identifiers) {
        results.push({
          type: "identifier",
          id: id.organization.id,
          name: id.organization.canonicalName,
          score: 1.0,
          metadata: { identifierType: id.type, identifierValue: id.normalized },
        });
      }
    }

    if ((query.type === "all" || query.type === "domain") && results.length < query.limit) {
      const domains = await prisma.organizationDomain.findMany({
        where: {
          tenantId,
          domain: { contains: query.q.toLowerCase(), mode: "insensitive" },
        },
        include: {
          organization: { select: { id: true, canonicalName: true, identityStatus: true } },
        },
        take: query.limit,
      });

      for (const d of domains) {
        results.push({
          type: "domain",
          id: d.organization.id,
          name: d.organization.canonicalName,
          score: 0.9,
          metadata: { domain: d.domain },
        });
      }
    }

    if ((query.type === "all" || query.type === "name") && results.length < query.limit) {
      const searchKey = createCompanySearchKey(query.q);
      const orgs = await prisma.organization.findMany({
        where: {
          tenantId,
          status: "active",
          OR: [
            { searchKey: { contains: searchKey, mode: "insensitive" } },
            { normalizedName: { contains: query.q.toLowerCase(), mode: "insensitive" } },
          ],
        },
        include: {
          roles: { select: { role: true } },
          domains: { select: { domain: true } },
        },
        take: query.limit - results.length,
      });

      for (const o of orgs) {
        results.push({
          type: "organization",
          id: o.id,
          name: o.canonicalName,
          score: 0.8,
          metadata: {
            roles: o.roles.map((r) => r.role),
            domain: o.domains[0]?.domain ?? null,
            identityStatus: o.identityStatus,
          },
        });
      }
    }

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
 * Organization merge/split routes.
 */
export async function orgMergeRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // POST /api/v1/organizations/merge
  server.post("/merge", async (request) => {
    const tenantId = request.user!.tenantId;
    const userId = request.user!.userId;
    const body = orgMergeRequestSchema.parse(request.body);

    const [fromOrg, toOrg] = await Promise.all([
      prisma.organization.findFirst({ where: { id: body.fromOrgId, tenantId } }),
      prisma.organization.findFirst({ where: { id: body.toOrgId, tenantId } }),
    ]);

    if (!fromOrg) throw new NotFoundError("Organization", body.fromOrgId);
    if (!toOrg) throw new NotFoundError("Organization", body.toOrgId);
    if (fromOrg.id === toOrg.id) {
      throw new ValidationError("Cannot merge an organization with itself");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark fromOrg as merged
      await tx.organization.update({
        where: { id: body.fromOrgId },
        data: { status: "merged", mergedIntoId: body.toOrgId, identityStatus: "resolved" },
      });

      // 2. Re-link sellers, suppliers, manufacturers from fromOrg → toOrg
      await Promise.all([
        tx.seller.updateMany({
          where: { tenantId, organizationId: body.fromOrgId },
          data: { organizationId: body.toOrgId },
        }),
        tx.supplier.updateMany({
          where: { tenantId, organizationId: body.fromOrgId },
          data: { organizationId: body.toOrgId },
        }),
        tx.manufacturer.updateMany({
          where: { tenantId, organizationId: body.fromOrgId },
          data: { organizationId: body.toOrgId },
        }),
      ]);

      // 3. Create merge history
      const history = await tx.orgMergeHistory.create({
        data: {
          tenantId,
          entityId: body.fromOrgId,
          action: "merged",
          fromOrgId: body.fromOrgId,
          toOrgId: body.toOrgId,
          reason: body.reason,
          actorType: "manual",
          actorId: userId,
        },
      });

      // 4. Create decision record
      await tx.orgIdentityDecision.create({
        data: {
          tenantId,
          fromOrgId: body.fromOrgId,
          toOrgId: body.toOrgId,
          decision: "EXACT_MATCH",
          confidence: 1.0,
          reasons: [body.reason] as Prisma.InputJsonValue,
          method: "manual",
          reviewerId: userId,
          reviewedAt: new Date(),
        },
      });

      return history;
    });

    return result;
  });

  // POST /api/v1/organizations/split
  server.post("/split", async (request) => {
    const tenantId = request.user!.tenantId;
    const userId = request.user!.userId;
    const body = z.object({
      fromOrgId: z.string().min(1),
      toOrgId: z.string().min(1),
      reason: z.string().min(1).max(2000),
    }).parse(request.body);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Restore fromOrg status
      await tx.organization.update({
        where: { id: body.fromOrgId, tenantId },
        data: { status: "active", mergedIntoId: null },
      });

      // 2. Create split history
      const history = await tx.orgMergeHistory.create({
        data: {
          tenantId,
          entityId: body.fromOrgId,
          action: "split",
          fromOrgId: body.fromOrgId,
          toOrgId: body.toOrgId,
          reason: body.reason,
          actorType: "manual",
          actorId: userId,
        },
      });

      return history;
    });

    return result;
  });

  // GET /api/v1/organizations/merge-history
  server.get("/merge-history", async (request) => {
    const query = paginationSchema.merge(
      z.object({
        orgId: z.string().optional(),
        action: z.string().optional(),
      })
    ).parse(request.query);
    const tenantId = request.user!.tenantId;

    const where: Record<string, unknown> = { tenantId };
    if (query.orgId) where.entityId = query.orgId;
    if (query.action) where.action = query.action;

    const [data, total] = await Promise.all([
      prisma.orgMergeHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.orgMergeHistory.count({ where }),
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
 * Trigger organization resolution.
 */
export async function orgTriggerRoutes(server: FastifyInstance): Promise<void> {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // POST /api/v1/organizations/resolve
  server.post("/resolve", async (request) => {
    const tenantId = request.user!.tenantId;
    const body = z.object({
      organizationIds: z.array(z.string()).optional(),
      sourceId: z.string().optional(),
      useAI: z.boolean().default(false),
    }).parse(request.body);

    const { Queue } = await import("bullmq");
    const { config } = await import("@exosquad/config");

    const connection = {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    };

    const queue = new Queue("org_entity_resolution", { connection });

    const jobType = body.organizationIds
      ? "resolve_org_batch"
      : body.sourceId
        ? "reconcile_org_source"
        : "resolve_org_batch";

    const job = await queue.add(jobType, {
      tenantId,
      type: jobType,
      organizationIds: body.organizationIds,
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
