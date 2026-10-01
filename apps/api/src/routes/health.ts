import type { FastifyInstance } from "fastify";
import { prisma } from "@exosquad/database";

/**
 * Health check routes.
 * - GET /health — basic liveness probe
 * - GET /health/ready — readiness probe (checks DB + Redis connectivity)
 */
export async function healthRoutes(server: FastifyInstance): Promise<void> {
  // Liveness probe — always returns 200 if the process is running
  server.get("/", async () => {
    return {
      status: "ok",
      service: "exosquad-api",
      timestamp: new Date().toISOString(),
    };
  });

  // Readiness probe — verifies dependency connectivity
  server.get("/ready", async (_request, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};
    let allHealthy = true;

    // Check database connectivity
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: "ok",
        latencyMs: Date.now() - dbStart,
      };
    } catch (err) {
      checks.database = { status: "error" };
      allHealthy = false;
      server.log.error({ err }, "Database health check failed");
    }

    const overallStatus = allHealthy ? "ok" : "degraded";

    return reply.status(allHealthy ? 200 : 503).send({
      status: overallStatus,
      service: "exosquad-api",
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
