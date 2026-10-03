import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma, Prisma } from "@exosquad/database";
import { signToken } from "../plugins/auth.js";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
} from "@exosquad/common";

const BCRYPT_ROUNDS = 12;

interface SignupInput {
  email: string;
  password: string;
  name?: string;
  tenantName: string;
  tenantSlug: string;
}

interface LoginInput {
  email: string;
  password: string;
  tenantSlug: string;
}

export class AuthService {
  /**
   * Register a new tenant and owner user.
   * Creates both in a single transaction for atomicity.
   */
  async signup(input: SignupInput): Promise<{
    user: { id: string; email: string; name: string | null; role: string };
    tenant: { id: string; name: string; slug: string };
    token: string;
  }> {
    // Check if tenant slug is already taken
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: input.tenantSlug },
    });
    if (existingTenant) {
      throw new ConflictError("Tenant slug already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    // Create tenant + user atomically
    const tenant = await prisma.tenant.create({
      data: {
        name: input.tenantName,
        slug: input.tenantSlug,
        users: {
          create: {
            email: input.email.toLowerCase().trim(),
            passwordHash,
            name: input.name ?? null,
            role: "owner",
          },
        },
      },
      include: { users: { take: 1 } },
    });

    const user = tenant.users[0];
    if (!user) {
      throw new Error("Failed to create user during signup");
    }
    const token = await signToken({
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      token,
    };
  }

  /**
   * Authenticate a user and return a JWT.
   */
  async login(input: LoginInput): Promise<{
    user: { id: string; email: string; name: string | null; role: string };
    tenant: { id: string; name: string; slug: string };
    token: string;
  }> {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: input.tenantSlug },
      include: {
        users: {
          where: { email: input.email.toLowerCase().trim() },
          take: 1,
        },
      },
    });

    if (!tenant || tenant.users.length === 0) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const user = tenant.users[0];

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.status !== "active") {
      throw new UnauthorizedError("Account is disabled");
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Update last login timestamp (fire-and-forget)
    prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {
        // Non-critical: don't fail login for this
      });

    const token = await signToken({
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      token,
    };
  }

  /**
   * Get user profile by ID.
   */
  async getProfile(userId: string): Promise<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    tenant: { id: string; name: string; slug: string };
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new NotFoundError("User", userId);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
      },
    };
  }

  // ─── Password Reset ──────────────────────────────────────────────────────

  /**
   * Request a password reset token.
   * Enumeration-safe: always returns success, never reveals whether email exists.
   * Stores SHA-256 hash of raw token; raw token returned for dev (no email service).
   */
  async requestPasswordReset(email: string): Promise<{ success: true }> {
    const normalisedEmail = email.toLowerCase().trim();

    // Find user by email across all tenants
    const user = await prisma.user.findFirst({
      where: { email: normalisedEmail },
    });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");
      const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashedToken,
          passwordResetExpiry: expiry,
        },
      });
    }

    // Always return success — never reveal whether the account exists
    return { success: true };
  }

  /**
   * Reset password using a raw reset token.
   * Validates the token hash and expiry before updating the password.
   */
  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new ValidationError("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    return { success: true };
  }

  // ─── Onboarding ──────────────────────────────────────────────────────────

  /**
   * Update tenant onboarding configuration.
   * Merges onboarding data into existing Tenant.config without overwriting unrelated keys.
   * Tenant ID must come from the authenticated session (JWT), never from client input.
   */
  async updateOnboarding(
    tenantId: string,
    onboardingData: Record<string, unknown>,
  ): Promise<{ success: true }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundError("Tenant", tenantId);
    }

    // Merge with existing config (do not overwrite unrelated keys)
    const existingConfig =
      (tenant.config as Record<string, unknown>) ?? {};
    const mergedConfig = { ...existingConfig, ...onboardingData } as Record<string, unknown>;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { config: mergedConfig as Prisma.InputJsonValue },
    });

    return { success: true };
  }
}
