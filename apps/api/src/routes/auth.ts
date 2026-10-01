import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/auth.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255).optional(),
  tenantName: z.string().min(1).max(255),
  tenantSlug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1),
});

export async function authRoutes(server: FastifyInstance): Promise<void> {
  const authService = new AuthService();

  // ─── POST /api/v1/auth/signup ──────────────────────────────────────────
  server.post("/signup", async (request, reply) => {
    const body = signupSchema.parse(request.body);

    const result = await authService.signup({
      email: body.email,
      password: body.password,
      name: body.name,
      tenantName: body.tenantName,
      tenantSlug: body.tenantSlug,
    });

    return reply.status(201).send(result);
  });

  // ─── POST /api/v1/auth/login ───────────────────────────────────────────
  server.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const result = await authService.login({
      email: body.email,
      password: body.password,
      tenantSlug: body.tenantSlug,
    });

    return reply.send(result);
  });

  // ─── GET /api/v1/auth/me ───────────────────────────────────────────────
  server.get(
    "/me",
    {
      preHandler: async (request: FastifyRequest) => {
        await server.authenticate(request);
      },
    },
    async (request) => {
      const user = await authService.getProfile(request.user!.userId);
      return { user };
    }
  );
}
