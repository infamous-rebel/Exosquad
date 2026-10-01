import Fastify, { type FastifyInstance } from "fastify";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { AppError } from "@exosquad/common";
import { requestTrackerPlugin } from "./plugins/request-tracker.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { securityHeadersPlugin } from "./plugins/security-headers.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";

export class App {
  private server: FastifyInstance;

  constructor() {
    this.server = Fastify({
      logger: false, // We use our own Pino logger
      requestTimeout: 30_000,
      trustProxy: true,
    });

    this.registerPlugins();
    this.registerRoutes();
    this.registerErrorHandling();
  }

  private registerPlugins(): void {
    this.server.register(requestTrackerPlugin);
    this.server.register(authPlugin);
    this.server.register(rateLimitPlugin);
    this.server.register(securityHeadersPlugin);
  }

  private registerRoutes(): void {
    this.server.register(healthRoutes, { prefix: "/health" });
    this.server.register(authRoutes, { prefix: "/api/v1/auth" });
  }

  private registerErrorHandling(): void {
    this.server.setErrorHandler((error: Error & { validation?: unknown }, request, reply) => {
      // Fastify validation errors (status 400 from schema validation)
      if (error.validation) {
        request.log.error({ err: error, url: request.url }, "Validation error");
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: error.message,
            details: error.validation,
          },
        });
      }

      // Known application errors
      if (error instanceof AppError) {
        request.log.error(
          { err: error, url: request.url, statusCode: error.statusCode },
          error.message
        );
        return reply.status(error.statusCode).send(error.toJSON());
      }

      // Unknown errors — never leak internals
      request.log.error({ err: error, url: request.url }, "Unhandled error");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      });
    });
  }

  async start(): Promise<void> {
    try {
      const address = await this.server.listen({
        port: config.PORT,
        host: "0.0.0.0",
      });
      logger.info({ address, port: config.PORT }, "EXOSQUAD API server started");
    } catch (err) {
      logger.fatal({ err }, "Failed to start API server");
      throw err;
    }
  }

  async stop(): Promise<void> {
    await this.server.close();
    logger.info("API server stopped");
  }

  /** Expose the Fastify instance for testing. */
  getServer(): FastifyInstance {
    return this.server;
  }
}
