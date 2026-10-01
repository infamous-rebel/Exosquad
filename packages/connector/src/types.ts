// =============================================================================
// @exosquad/connector — Types and utilities
// =============================================================================

import type { AuthConfig } from "./auth.js";
import type { PaginationConfig } from "./pagination.js";
import type { RetryConfig } from "./retry.js";
import type { RateLimitConfig } from "./rate-limiter.js";
import type { CircuitBreakerConfig } from "./circuit-breaker.js";
import type { FieldMapping } from "./field-mapping.js";

// ─── Source Configuration ──────────────────────────────────────────────────

/**
 * Complete configuration for a data source connector.
 * Constructed from Source.config + ApiConnection data in the database.
 */
export interface SourceConfig {
  url: string;
  method?: "GET" | "POST" | "PUT";
  auth?: AuthConfig;
  pagination?: PaginationConfig;
  retry?: Partial<RetryConfig>;
  rateLimit?: RateLimitConfig;
  circuitBreaker?: CircuitBreakerConfig;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  mapping?: FieldMapping;
  incrementalSync?: boolean;
}

// ─── Fetch Result ──────────────────────────────────────────────────────────

/**
 * Result of a single HTTP fetch operation.
 * Contains the raw response data with full provenance metadata.
 */
export interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
  contentHash: string;
  latencyMs: number;
  requestUrl: string;
  requestMethod: string;
  requestHeaders: Record<string, string>; // sanitized — no secrets
  recordCount: number;
  retrievedAt: Date;
}

/**
 * Result of a paginated fetch-all operation.
 */
export interface PaginatedFetchResult {
  results: FetchResult[];
  totalRecords: number;
  checkpoint: CheckpointState;
}

// ─── Checkpoint ────────────────────────────────────────────────────────────

/**
 * Pagination/sync state that can be persisted for resumable ingestion.
 */
export interface CheckpointState {
  lastCursor?: string;
  lastPage?: number;
  lastOffset?: number;
  lastSyncTimestamp?: Date;
  totalRecordsProcessed: number;
}

// ─── Secrets Sanitization ──────────────────────────────────────────────────

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
  "x-auth-token",
]);

/**
 * Sanitize request headers by removing sensitive values.
 * Used before persisting or logging request metadata.
 */
export function sanitizeRequestHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Flatten HTTP response headers (Headers object or plain object) to a
 * plain Record<string, string>.
 */
export function flattenHeaders(
  headers: Headers | Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") {
        result[key] = value;
      }
    }
  }
  return result;
}

// ─── Data Extraction Helpers ───────────────────────────────────────────────

/**
 * Extract a data array from a response body.
 * Tries common wrapper keys (data, results, items, records, entries).
 */
export function extractResponseDataArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of ["data", "results", "items", "records", "entries"]) {
      const value = obj[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/**
 * Build a full URL from base URL, path, and query parameters.
 */
export function buildUrl(
  baseUrl: string,
  queryParams: Record<string, string>
): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
