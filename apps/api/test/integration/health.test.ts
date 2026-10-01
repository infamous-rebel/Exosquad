import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "../../src/routes/health.js";

describe("Health Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(healthRoutes, { prefix: "/health" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health should return ok status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.payload);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("exosquad-api");
    expect(body.timestamp).toBeDefined();
  });

  it("GET /health/ready should check dependencies", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
    });

    const body = JSON.parse(response.payload);
    expect(body.service).toBe("exosquad-api");
    expect(body.timestamp).toBeDefined();
    // Without a real DB, this will be degraded
    expect(["ok", "degraded"]).toContain(body.status);
  });
});
