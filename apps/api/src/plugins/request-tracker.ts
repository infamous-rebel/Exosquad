import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createChildLogger } from "@exosquad/logger";

/**
 * Request tracking plugin.
 * Assigns a unique request ID and creates a child logger with request context.
 */
export async function requestTrackerPlugin(
  server: FastifyInstance
): Promise<void> {
  server.addHook("onRequest", (request: FastifyRequest, _reply, done) => {
    // Generate request ID if not provided by upstream
    const requestId =
      (request.headers["x-request-id"] as string) || randomUUID();

    // Attach child logger with request context
    const childLogger = createChildLogger({
      requestId,
      method: request.method,
      url: request.url,
    });

    (request as any).log = childLogger;
    (request as any).requestId = requestId;

    done();
  });

  server.addHook("onSend", (request, _reply, payload, done) => {
    const requestId = (request as any).requestId as string;
    if (requestId) {
      const newPayload =
        typeof payload === "string"
          ? payload
          : payload?.toString() ?? "";
      done(null, newPayload);
    } else {
      done();
    }
  });
}
