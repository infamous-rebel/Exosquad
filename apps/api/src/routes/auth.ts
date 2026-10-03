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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const onboardingSchema = z.object({
  businessName: z.string().min(1).max(255).optional(),
  businessRole: z.enum(["reseller", "importer", "both"]).optional(),
  primaryMarket: z.string().min(1).max(100).optional(),
  productCategories: z.array(z.string().max(100)).max(20).optional(),
  sourcingRegions: z.array(z.string().max(100)).max(20).optional(),
  budgetRange: z.string().max(50).optional(),
  objective: z.string().max(500).optional(),
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

  // ─── POST /api/v1/auth/forgot-password ─────────────────────────────────
  server.post("/forgot-password", async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);
    const result = await authService.requestPasswordReset(body.email);
    return reply.send(result);
  });

  // ─── POST /api/v1/auth/reset-password ──────────────────────────────────
  server.post("/reset-password", async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);
    const result = await authService.resetPassword(body.token, body.newPassword);
    return reply.send(result);
  });

  // ─── POST /api/v1/auth/onboarding ──────────────────────────────────────
  server.post(
    "/onboarding",
    {
      preHandler: async (request: FastifyRequest) => {
        await server.authenticate(request);
      },
    },
    async (request, reply) => {
      const body = onboardingSchema.parse(request.body);
      // Tenant ID comes from JWT — never from client input
      const tenantId = request.user!.tenantId;
      const result = await authService.updateOnboarding(tenantId, body);
      return reply.send(result);
    }
  );
}
