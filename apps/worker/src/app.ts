import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { QueueManager } from "./queues/queue-manager.js";

/**
 * Worker application.
 * Runs BullMQ job processors and exposes a minimal health endpoint.
 */
export class WorkerApp {
  private queueManager: QueueManager;
  private healthServer: ReturnType<typeof Fastify>;

  constructor() {
    this.queueManager = new QueueManager();

    // Minimal HTTP server for health checks (separate port from API)
    this.healthServer = Fastify({ logger: false });

    this.healthServer.get("/health", async () => ({
      status: "ok",
      service: "exosquad-worker",
      timestamp: new Date().toISOString(),
    }));

    this.healthServer.get("/health/ready", async (_request: FastifyRequest, reply: FastifyReply) => {
      const queueStats = await this.queueManager.getStats();
      const allHealthy = Object.values(queueStats).every(
        (s) => s.status === "ok"
      );

      return reply.status(allHealthy ? 200 : 503).send({
        status: allHealthy ? "ok" : "degraded",
        service: "exosquad-worker",
        timestamp: new Date().toISOString(),
        queues: queueStats,
      });
    });
  }

  async start(): Promise<void> {
    // Start all queue processors
    await this.queueManager.start();

    // Start health check server on API port + 1
    const healthPort = config.PORT + 1;
    await this.healthServer.listen({ port: healthPort, host: "0.0.0.0" });

    logger.info(
      { healthPort },
      "EXOSQUAD Worker started with health endpoint"
    );
  }

  async stop(): Promise<void> {
    await this.queueManager.stop();
    await this.healthServer.close();
    logger.info("Worker stopped");
  }
}
