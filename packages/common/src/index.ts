// =============================================================================
// @exosquad/common — shared types, errors, and validation schemas
// =============================================================================

import { z } from "zod";

// -----------------------------------------------------------------------------
// ERROR HIERARCHY
// -----------------------------------------------------------------------------

/** Base application error. All domain errors extend this. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.context ? { context: this.context } : {}),
      },
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(msg, 404, "NOT_FOUND", { resource, id });
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", { details });
    this.name = "ValidationError";
    this.details = details;
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super("Rate limit exceeded", 429, "RATE_LIMITED", { retryAfter });
    this.name = "RateLimitError";
  }
}

export class SourceError extends AppError {
  constructor(message: string, sourceId?: string, context?: Record<string, unknown>) {
    super(message, 502, "SOURCE_ERROR", { sourceId, ...context });
    this.name = "SourceError";
  }
}

// -----------------------------------------------------------------------------
// VALIDATION SCHEMAS — shared input validation
// -----------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

// -----------------------------------------------------------------------------
// SHARED TYPES
// -----------------------------------------------------------------------------

export type PaginationParams = z.infer<typeof paginationSchema>;
export type SortParams = z.infer<typeof sortSchema>;

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthenticatedRequest {
  userId: string;
  tenantId: string;
  userRole: string;
}

/** Standard health check response shape. */
export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  version: string;
  checks?: Record<string, { status: string; latencyMs?: number }>;
}
