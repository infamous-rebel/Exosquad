import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma, Prisma } from "@exosquad/database";
import { z } from "zod";
import {
  NotFoundError,
  ValidationError,
  paginationSchema,
  type PaginatedResult,
} from "@exosquad/common";
import { HttpConnector } from "@exosquad/connector";

const createSourceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    "web_scraper",
    "api_connector",
    "marketplace",
    "social_signal",
    "product_database",
  ]),
  connectorType: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  scheduleCron: z.string().optional(),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
  scheduleCron: z.string().nullable().optional(),
  status: z.enum(["active", "paused", "error", "disabled"]).optional(),
});

// Shared connector for health checks
const healthCheckConnector = new HttpConnector();

/**
 * Strip sensitive auth credentials from source config before returning
 * in API responses. Never expose API keys, tokens, or passwords to clients.
 */
function sanitizeSourceForResponse(source: Record<string, unknown>): Record<string, unknown> {
  const config = (source.config ?? {}) as Record<string, unknown>;
  const sanitizedConfig = { ...config };

  // Remove auth block entirely — credentials must never be returned
  delete sanitizedConfig.auth;

  return { ...source, config: sanitizedConfig };
}

/**
 * Source management routes.
 * Full CRUD + operational endpoints for data sources within a tenant.
 */
export async function sourceRoutes(server: FastifyInstance): Promise<void> {
  // All source routes require authentication
  server.addHook("preHandler", async (request: FastifyRequest) => {
    await server.authenticate(request);
  });

  // ─── GET /api/v1/sources ───────────────────────────────────────────────
  server.get("/", async (request) => {
    const query = paginationSchema.parse(request.query);
    const tenantId = request.user!.tenantId;

    const [data, total] = await Promise.all([
      prisma.source.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.source.count({ where: { tenantId } }),
    ]);

    const result: PaginatedResult<unknown> = {
      data: data.map((s) => sanitizeSourceForResponse(s as unknown as Record<string, unknown>)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };

    return result;
  });

  // ─── POST /api/v1/sources ──────────────────────────────────────────────
  server.post("/", async (request, reply) => {
    const body = createSourceSchema.parse(request.body);
    const tenantId = request.user!.tenantId;

    // Validate URL in config
    const config = body.config as Record<string, unknown>;
    if (config.url && typeof config.url === "string") {
      try {
        new URL(config.url);
      } catch {
        throw new ValidationError("Invalid URL in source config");
      }
    }

    const source = await prisma.source.create({
      data: {
        tenantId,
        name: body.name,
        type: body.type,
        connectorType: body.connectorType,
        config: body.config as Prisma.InputJsonValue,
        scheduleCron: body.scheduleCron,
      },
    });

    return reply.status(201).send(sanitizeSourceForResponse(source as unknown as Record<string, unknown>));
  });

  // ─── GET /api/v1/sources/:id ───────────────────────────────────────────
  server.get<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const source = await prisma.source.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundError("Source", id);
    }

    return sanitizeSourceForResponse(source as unknown as Record<string, unknown>);
  });

  // ─── PATCH /api/v1/sources/:id ─────────────────────────────────────────
  server.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const body = updateSourceSchema.parse(request.body);

    const source = await prisma.source.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundError("Source", id);
    }

    // Validate URL if config is being updated
    if (body.config) {
      const config = body.config as Record<string, unknown>;
      if (config.url && typeof config.url === "string") {
        try {
          new URL(config.url);
        } catch {
          throw new ValidationError("Invalid URL in source config");
        }
      }
    }

    const updated = await prisma.source.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.config !== undefined && { config: body.config as Prisma.InputJsonValue }),
        ...(body.scheduleCron !== undefined && { scheduleCron: body.scheduleCron }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    return sanitizeSourceForResponse(updated as unknown as Record<string, unknown>);
  });

  // ─── DELETE /api/v1/sources/:id ────────────────────────────────────────
  server.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const source = await prisma.source.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundError("Source", id);
    }

    await prisma.source.update({
      where: { id },
      data: { status: "disabled" },
    });

    return reply.status(204).send();
  });

  // ─── POST /api/v1/sources/:id/test ─────────────────────────────────────
  // Test connection to a source without ingesting data
  server.post<{ Params: { id: string } }>("/:id/test", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const source = await prisma.source.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundError("Source", id);
    }

    const config = source.config as Record<string, unknown>;
    const url = config.url as string | undefined;
    if (!url) {
      throw new ValidationError("Source config missing URL");
    }

    const result = await healthCheckConnector.healthCheck(url, source.id);

    return {
      sourceId: source.id,
      healthy: result.healthy,
      latencyMs: result.latencyMs,
      error: result.error,
      testedAt: new Date().toISOString(),
    };
  });

  // ─── POST /api/v1/sources/:id/ingest ───────────────────────────────────
  // Trigger manual ingestion for a source
  server.post<{ Params: { id: string } }>("/:id/ingest", async (request, reply) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const source = await prisma.source.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundError("Source", id);
    }

    if (source.status === "disabled") {
      throw new ValidationError("Cannot ingest from a disabled source");
    }

    // Add job to BullMQ ingestion queue
    // We import Queue dynamically to avoid circular dependencies
    const { Queue } = await import("bullmq");
    const { config } = await import("@exosquad/config");

    const ingestionQueue = new Queue("ingestion", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    const job = await ingestionQueue.add("manual-ingest", {
      sourceId: source.id,
      tenantId,
      triggeredBy: "api",
    }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });

    await ingestionQueue.close();

    return reply.status(202).send({
      jobId: job.id,
      sourceId: source.id,
      status: "queued",
      queuedAt: new Date().toISOString(),
    });
  });

  // ─── GET /api/v1/sources/:id/health ────────────────────────────────────
  // Get detailed health information for a source
  server.get<{ Params: { id: string } }>("/:id/health", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;

    const source = await prisma.source.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundError("Source", id);
    }

    // Get recent raw responses for freshness data
    const recentResponses = await prisma.rawResponse.findMany({
      where: { sourceId: id },
      orderBy: { retrievedAt: "desc" },
      take: 5,
      select: {
        id: true,
        httpStatus: true,
        latencyMs: true,
        recordCount: true,
        retrievedAt: true,
        errorMessage: true,
      },
    });

    // Get checkpoint state
    const checkpoint = await prisma.ingestionCheckpoint.findUnique({
      where: { sourceId: id },
    });

    return {
      sourceId: source.id,
      healthStatus: source.healthStatus,
      status: source.status,
      consecutiveErrors: source.consecutiveErrors,
      totalFetched: source.totalFetched,
      totalFailed: source.totalFailed,
      avgLatencyMs: source.avgLatencyMs,
      lastRunAt: source.lastRunAt,
      lastSuccessAt: source.lastSuccessAt,
      lastFetchedAt: source.lastFetchedAt,
      lastHealthyAt: source.lastHealthyAt,
      lastError: source.lastError,
      freshness: {
        lastFetchedAt: source.lastFetchedAt,
        lastSuccessAt: source.lastSuccessAt,
        recentResponses,
      },
      checkpoint: checkpoint
        ? {
            lastCursor: checkpoint.lastCursor,
            lastPage: checkpoint.lastPage,
            lastOffset: checkpoint.lastOffset,
            totalRecordsProcessed: checkpoint.totalRecordsProcessed,
            updatedAt: checkpoint.updatedAt,
          }
        : null,
    };
  });

  // ─── GET /api/v1/sources/:id/jobs ──────────────────────────────────────
  // Get ingestion job history for a source
  server.get<{ Params: { id: string } }>("/:id/jobs", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    const source = await prisma.source.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!source) {
      throw new NotFoundError("Source", id);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          tenantId,
          queue: "ingestion",
          payload: { path: ["sourceId"], equals: id },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.job.count({
        where: {
          tenantId,
          queue: "ingestion",
          payload: { path: ["sourceId"], equals: id },
        },
      }),
    ]);

    return {
      data: jobs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // ─── GET /api/v1/sources/:id/raw-responses ─────────────────────────────
  // Get raw response history for a source
  server.get<{ Params: { id: string } }>("/:id/raw-responses", async (request) => {
    const tenantId = request.user!.tenantId;
    const { id } = request.params;
    const query = paginationSchema.parse(request.query);

    const source = await prisma.source.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!source) {
      throw new NotFoundError("Source", id);
    }

    const [responses, total] = await Promise.all([
      prisma.rawResponse.findMany({
        where: { sourceId: id, tenantId },
        orderBy: { retrievedAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          requestUrl: true,
          requestMethod: true,
          httpStatus: true,
          contentHash: true,
          latencyMs: true,
          recordCount: true,
          jobId: true,
          errorMessage: true,
          retrievedAt: true,
        },
      }),
      prisma.rawResponse.count({ where: { sourceId: id, tenantId } }),
    ]);

    return {
      data: responses,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });
}
