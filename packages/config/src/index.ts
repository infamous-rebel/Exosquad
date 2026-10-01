// =============================================================================
// @exosquad/config — environment validation with Zod
// =============================================================================
// All environment variables are validated at startup. The application refuses
// to start with missing or invalid configuration.
// =============================================================================

import { z } from "zod";

const envSchema = z.object({
  // ─── Database ────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // ─── Redis ───────────────────────────────────────────────────────────────
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // ─── Application ─────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // ─── Authentication ──────────────────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("24h"),

  // ─── Worker ──────────────────────────────────────────────────────────────
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Load and validate environment variables.
 * Throws if required variables are missing or invalid.
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error("Environment validation failed:");
    console.error(JSON.stringify(formatted, null, 2));
    throw new Error("Invalid environment configuration");
  }

  return result.data;
}

/** Singleton validated config. Import this in application code. */
export const config = loadEnv();
