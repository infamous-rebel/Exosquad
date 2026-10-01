import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * Simple in-memory rate limiting plugin.
 * In production, replace with Redis-backed rate limiting (@fastify/rate-limit).
 * This provides basic per-IP protection from day one.
 */
const store = new Map<string, { count: number; resetAt: number }>();

// Cleanup expired entries every 60 seconds
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store) {
    if (value.resetAt < now) {
      store.delete(key);
    }
  }
}, 60_000);

// Allow cleanup to not prevent process exit
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100;

export async function rateLimitPlugin(server: FastifyInstance): Promise<void> {
  server.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const key = request.ip;
      const now = Date.now();

      let entry = store.get(key);

      if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + WINDOW_MS };
        store.set(key, entry);
      }

      entry.count++;

      // Set rate limit headers
      const remaining = Math.max(0, MAX_REQUESTS - entry.count);
      reply.header("x-ratelimit-limit", MAX_REQUESTS);
      reply.header("x-ratelimit-remaining", remaining);
      reply.header("x-ratelimit-reset", Math.ceil(entry.resetAt / 1000));

      if (entry.count > MAX_REQUESTS) {
        reply.header("retry-after", Math.ceil((entry.resetAt - now) / 1000));
        return reply.status(429).send({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
        });
      }
    }
  );
}
