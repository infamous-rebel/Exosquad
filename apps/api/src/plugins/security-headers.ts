import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * Security headers plugin.
 * Sets standard security headers on every response.
 */
export async function securityHeadersPlugin(
  server: FastifyInstance
): Promise<void> {
  server.addHook(
    "onSend",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.header("x-content-type-options", "nosniff");
      reply.header("x-frame-options", "DENY");
      reply.header("x-xss-protection", "0"); // Modern browsers use CSP instead
      reply.header("referrer-policy", "strict-origin-when-cross-origin");
      reply.header(
        "permissions-policy",
        "camera=(), microphone=(), geolocation=()"
      );
      // In production, configure a proper CSP based on frontend requirements
      if (process.env.NODE_ENV === "production") {
        reply.header(
          "strict-transport-security",
          "max-age=31536000; includeSubDomains"
        );
      }
    }
  );
}
