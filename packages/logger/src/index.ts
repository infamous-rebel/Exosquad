// =============================================================================
// @exosquad/logger — structured JSON logging via Pino
// =============================================================================
// Outputs newline-delimited JSON for production log aggregation.
// Supports child loggers with bound context (requestId, tenantId, etc.).
// =============================================================================

import pino from "pino";

const level = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level,
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  serializers: {
    err: pino.stdSerializers.err,
  },
  base: {
    service: "exosquad",
  },
});

/**
 * Create a child logger with bound context fields.
 * Every log entry from the child will include these fields.
 */
export function createChildLogger(
  bindings: Record<string, unknown>
): pino.Logger {
  return logger.child(bindings);
}

export { logger as default };
