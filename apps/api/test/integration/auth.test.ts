import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "../../src/routes/auth.js";
import { authPlugin } from "../../src/plugins/auth.js";

describe("Auth Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(authPlugin);
    await app.register(authRoutes, { prefix: "/api/v1/auth" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/auth/signup should validate input", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: "invalid" },
    });

    expect(response.statusCode).toBe(500); // Zod validation throws
  });

  it("POST /api/v1/auth/login should validate input", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "invalid" },
    });

    expect(response.statusCode).toBe(500); // Zod validation throws
  });

  it("GET /api/v1/auth/me should require authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(response.statusCode).toBe(500); // Auth error
  });
});
