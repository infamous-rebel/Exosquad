import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import * as jose from "jose";
import { config } from "@exosquad/config";
import { UnauthorizedError } from "@exosquad/common";

/** Extend FastifyRequest with authenticated user context. */
declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId: string;
      tenantId: string;
      role: string;
    };
  }
}

const JWT_SECRET = new TextEncoder().encode(config.JWT_SECRET);

/**
 * Verify and decode a JWT token.
 * Returns the payload if valid, null otherwise.
 */
export async function verifyToken(
  token: string
): Promise<{ userId: string; tenantId: string; role: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const userId = payload.sub;
    const tenantId = payload.tenantId;
    const role = payload.role;

    if (!userId || typeof userId !== "string" || !tenantId || typeof tenantId !== "string") {
      return null;
    }

    return {
      userId,
      tenantId,
      role: typeof role === "string" ? role : "member",
    };
  } catch {
    return null;
  }
}

/**
 * Sign a JWT token for the given user.
 */
export async function signToken(payload: {
  sub: string;
  tenantId: string;
  role: string;
}): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

/**
 * Authentication plugin.
 * Provides `authenticate` preHandler for protected routes.
 * Uses fastify-plugin to break encapsulation so the decorator is available globally.
 */
export const authPlugin = fp(async function (server: FastifyInstance): Promise<void> {
  server.decorateRequest("user", undefined);

  server.decorate("authenticate", async function (
    this: FastifyInstance,
    request: FastifyRequest
  ) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid authorization header");
    }

    const token = authHeader.slice(7);
    const user = await verifyToken(token);

    if (!user) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    request.user = user;
  });
}, {
  name: "exosquad-auth",
});

// Declare the decorate method for TypeScript
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}
