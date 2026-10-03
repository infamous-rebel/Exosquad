// =============================================================================
// @exosquad/connector — Types and utilities
// =============================================================================

import dns from "node:dns";
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

// ─── SSRF Protection ─────────────────────────────────────────────────────

/**
 * Parse the Retry-After HTTP header.
 * Supports both formats:
 * - Integer seconds: "120"
 * - HTTP-date: "Fri, 31 Dec 1999 23:59:59 GMT"
 * Returns milliseconds, or undefined if header is absent/invalid.
 */
export function parseRetryAfterHeader(
  headers?: Record<string, string>
): number | undefined {
  if (!headers) return undefined;
  const value = headers["retry-after"] ?? headers["Retry-After"];
  if (!value) return undefined;

  // Try integer seconds first
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  // Try HTTP-date format
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now();
    return ms > 0 ? ms : 0;
  }

  return undefined;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "host.docker.internal",
]);

const BLOCKED_PROTOCOLS = new Set([
  "file:",
  "ftp:",
  "gopher:",
  "data:",
  "javascript:",
]);

/**
 * Validate that an outbound URL is safe to request.
 * Blocks:
 * - Non-HTTP(S) protocols
 * - Private/loopback IP addresses (SSRF prevention)
 * - localhost and common internal hostnames
 * - URLs with embedded credentials
 * - DNS resolution to private IPs (anti-DNS-rebinding)
 */
export async function validateOutboundUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  // Protocol check
  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Blocked protocol: ${parsed.protocol}`);
  }

  // Only allow http and https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Only HTTP/HTTPS protocols allowed, got: ${parsed.protocol}`);
  }

  // Block embedded credentials (http://user:pass@host/)
  if (parsed.username || parsed.password) {
    throw new Error(`URLs with embedded credentials are not allowed`);
  }

  // Hostname check — block localhost and private IPs
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }

  // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    checkPrivateIpv4(
      parseInt(ipv4Match[1]!, 10),
      parseInt(ipv4Match[2]!, 10),
      hostname
    );
  }

  // DNS resolution check — resolve hostname and verify the IP is not private
  // This prevents DNS-based SSRF where a public hostname resolves to a private IP
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (addr.family === 4) {
        const parts = addr.address.split(".").map(Number);
        checkPrivateIpv4(parts[0]!, parts[1]!, `${hostname} (resolves to ${addr.address})`);
      } else if (addr.family === 6) {
        // Block IPv6 loopback, link-local, unique-local
        const ip = addr.address.toLowerCase();
        if (
          ip === "::1" ||
          ip === "::" ||
          ip.startsWith("fe80:") || // link-local
          ip.startsWith("fc") || ip.startsWith("fd") // unique local (fc00::/7)
        ) {
          throw new Error(`Blocked private IPv6: ${hostname} resolves to ${addr.address}`);
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Blocked")) {
      throw err;
    }
    // DNS resolution failure — block the request (fail closed)
    throw new Error(`DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

/**
 * Check if an IPv4 address is in a private/reserved range.
 * Throws if blocked.
 */
function checkPrivateIpv4(first: number, second: number, label: string): void {
  if (first === 10) throw new Error(`Blocked private IP range: ${label}`);
  if (first === 172 && second >= 16 && second <= 31) throw new Error(`Blocked private IP range: ${label}`);
  if (first === 192 && second === 168) throw new Error(`Blocked private IP range: ${label}`);
  if (first === 127) throw new Error(`Blocked loopback: ${label}`);
  if (first === 169 && second === 254) throw new Error(`Blocked link-local: ${label}`);
  if (first === 0) throw new Error(`Blocked reserved: ${label}`);
  if (first === 100 && second >= 64 && second <= 127) throw new Error(`Blocked shared address space: ${label}`);
}
