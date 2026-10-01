// =============================================================================
// @exosquad/connector — Error types for the connector engine
// =============================================================================

import { AppError } from "@exosquad/common";

export class ConnectorError extends AppError {
  public readonly sourceId?: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      sourceId?: string;
      retryable?: boolean;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, options?.statusCode ?? 502, options?.code ?? "CONNECTOR_ERROR", options?.context);
    this.name = "ConnectorError";
    this.sourceId = options?.sourceId;
    this.retryable = options?.retryable ?? true;
  }
}

export class TimeoutError extends ConnectorError {
  constructor(url: string, timeoutMs: number, sourceId?: string) {
    super(`Request timed out after ${timeoutMs}ms: ${url}`, {
      statusCode: 504,
      code: "TIMEOUT",
      sourceId,
      retryable: true,
      context: { url, timeoutMs },
    });
    this.name = "TimeoutError";
  }
}

export class RateLimitExceededError extends ConnectorError {
  public readonly retryAfterMs?: number;

  constructor(sourceId?: string, retryAfterMs?: number) {
    super("Rate limit exceeded by upstream source", {
      statusCode: 429,
      code: "UPSTREAM_RATE_LIMITED",
      sourceId,
      retryable: true,
      context: { retryAfterMs },
    });
    this.name = "RateLimitExceededError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class AuthenticationError extends ConnectorError {
  constructor(message: string, sourceId?: string) {
    super(message, {
      statusCode: 401,
      code: "SOURCE_AUTH_FAILED",
      sourceId,
      retryable: false,
    });
    this.name = "AuthenticationError";
  }
}

export class CircuitOpenError extends ConnectorError {
  constructor(sourceId: string, openUntil: Date) {
    super(`Circuit breaker is open for source ${sourceId}`, {
      statusCode: 503,
      code: "CIRCUIT_OPEN",
      sourceId,
      retryable: true,
      context: { openUntil: openUntil.toISOString() },
    });
    this.name = "CircuitOpenError";
  }
}

export class SchemaValidationError extends ConnectorError {
  public readonly details: unknown;

  constructor(message: string, details: unknown, sourceId?: string) {
    super(message, {
      statusCode: 422,
      code: "SCHEMA_VALIDATION_FAILED",
      sourceId,
      retryable: false,
      context: { details },
    });
    this.name = "SchemaValidationError";
    this.details = details;
  }
}

export class MalformedResponseError extends ConnectorError {
  constructor(message: string, sourceId?: string) {
    super(message, {
      statusCode: 502,
      code: "MALFORMED_RESPONSE",
      sourceId,
      retryable: false,
    });
    this.name = "MalformedResponseError";
  }
}
