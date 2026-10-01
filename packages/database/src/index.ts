import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export { PrismaClient, Prisma };
export type * from "@prisma/client";

/**
 * Create a PrismaClient with sensible defaults for the EXOSQUAD platform.
 * In production, configure log levels via environment variables.
 */
function createClient(): PrismaClient {
  const logLevels: Prisma.LogLevel[] =
    process.env.NODE_ENV === "production" ? ["warn", "error"] : ["warn", "error"];

  return new PrismaClient({
    log: logLevels.map((level) => ({ level, emit: "event" as const })),
  });
}

/** Singleton Prisma client for the application. */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Test-safe client factory: creates a new PrismaClient with the given URL.
 * Use in tests where each test suite needs an isolated connection.
 */
export function createTestClient(datasourceUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: datasourceUrl } } });
}
