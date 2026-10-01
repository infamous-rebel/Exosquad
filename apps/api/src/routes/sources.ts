import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma, Prisma } from "@exosquad/database";
import { z } from "zod";
import {
  NotFoundError,
  paginationSchema,
  type PaginatedResult,
} from "@exosquad/common";

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

/**
 * Source management routes.
 * CRUD operations for data sources within a tenant.
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

  // ─── POST /api/v1/sources ──────────────────────────────────────────────
  server.post("/", async (request, reply) => {
    const body = createSourceSchema.parse(request.body);
    const tenantId = request.user!.tenantId;

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

    return reply.status(201).send(source);
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

    return source;
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
}
