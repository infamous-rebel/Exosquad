import bcrypt from "bcryptjs";
import { prisma } from "@exosquad/database";
import { signToken } from "../plugins/auth.js";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
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
}
