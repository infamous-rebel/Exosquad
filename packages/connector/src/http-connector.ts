// =============================================================================
// @exosquad/connector — HTTP Connector Engine
// =============================================================================
// Production-grade HTTP connector with:
// - All auth strategies (none, api_key, bearer, basic, oauth2)
// - All pagination strategies (page, offset, cursor, link)
// - Retry with exponential backoff + jitter
// - Token-bucket rate limiting (per-source)
// - Circuit breaker (per-source)
// - Configurable timeouts
// - Content hashing for deduplication
// - Secrets sanitization in stored metadata
// - Checkpoint/resume for resumable ingestion
// - Bounded concurrency for parallel operations
// =============================================================================

import { createChildLogger } from "@exosquad/logger";
import { applyAuth, type RequestParts } from "./auth.js";
import {
  advancePagination,
  applyPaginationParams,
  type PaginationState,
} from "./pagination.js";
import { withRetry, DEFAULT_RETRY_CONFIG } from "./retry.js";
import { RateLimiter, parseRateLimitHeaders } from "./rate-limiter.js";
import { CircuitBreaker, DEFAULT_CIRCUIT_CONFIG } from "./circuit-breaker.js";
import { computeContentHash } from "./content-hash.js";
import {
  ConnectorError,
  TimeoutError,
  RateLimitExceededError,
  MalformedResponseError,
} from "./errors.js";
import {
  sanitizeRequestHeaders,
  flattenHeaders,
  extractResponseDataArray,
  buildUrl,
  validateOutboundUrl,
  parseRetryAfterHeader,
  type SourceConfig,
  type FetchResult,
  type PaginatedFetchResult,
  type CheckpointState,
} from "./types.js";

const logger = createChildLogger({ module: "http-connector" });

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 };
const DEFAULT_MAX_PAGES = 1000; // Safety limit to prevent infinite pagination
const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB

// ─── HTTP Connector ────────────────────────────────────────────────────────

/**
 * Production HTTP connector with full resilience stack.
 * Each instance has shared rate limiter and circuit breaker for all sources.
 */
/**
 * Callback invoked after each page is fetched in fetchAll().
 * Enables incremental checkpointing — if the worker crashes mid-pagination,
 * the last completed page state is already persisted.
 */
export type PageCompleteCallback = (
  page: FetchResult,
  pageIndex: number,
  runningTotal: number,
  checkpoint: CheckpointState
) => Promise<void> | void;

export class HttpConnector {
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private maxResponseBytes: number;
  private ssrfProtection: boolean;

  constructor(options?: { maxResponseBytes?: number; skipSsrfValidation?: boolean }) {
    this.rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT);
    this.circuitBreaker = new CircuitBreaker(DEFAULT_CIRCUIT_CONFIG);
    this.maxResponseBytes = options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    // SSRF protection is ON by default; tests can disable it for localhost
    this.ssrfProtection = !options?.skipSsrfValidation;
  }

  // ─── Single Fetch ────────────────────────────────────────────────────────

  /**
   * Execute a single HTTP request with full resilience:
   * circuit breaker → rate limit → retry → fetch → parse → hash.
   */
  async fetch(
    config: SourceConfig,
    sourceId: string,
    signal?: AbortSignal
  ): Promise<FetchResult> {
    const retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retry,
    };
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Build request and validate URL BEFORE retry loop
    // SSRF blocks must not be retried — they are deterministic security blocks
    const { url, headers, queryParams } = this.buildRequest(config);
    const fullUrl = buildUrl(url, queryParams);

    if (this.ssrfProtection) {
      await validateOutboundUrl(fullUrl);
    }

    return withRetry(
      async () => {
        // Circuit breaker guard
        this.circuitBreaker.guard(sourceId);

        // Rate limit
        await this.rateLimiter.acquire(sourceId, signal);

        // Execute HTTP request (with safe redirect following)
        const startTime = Date.now();
        const response = await this.executeRequest(
          fullUrl,
          config.method ?? "GET",
          headers,
          config.body,
          timeoutMs,
          signal
        );
        const latencyMs = Date.now() - startTime;

        // Read response body with streaming size limit
        const rawBody = await this.readResponseBody(response, fullUrl);
        const responseHeaders = flattenHeaders(response.headers);
        const body = this.parseResponseBody(rawBody, responseHeaders, sourceId);

        // Check for HTTP error status
        if (!response.ok) {
          this.handleHttpError(response.status, sourceId, rawBody, responseHeaders);
        }

        // Record circuit breaker success
        this.circuitBreaker.recordSuccess(sourceId);

        // Adapt rate limiter from response headers
        this.adaptRateLimitFromHeaders(sourceId, responseHeaders);

        // Compute content hash for deduplication
        const contentHash = computeContentHash(rawBody);
        const sanitizedHeaders = sanitizeRequestHeaders(headers);
        const records = extractResponseDataArray(body);

        logger.info(
          {
            sourceId,
            url: fullUrl,
            status: response.status,
            latencyMs,
            contentHash: contentHash.substring(0, 16),
            recordCount: records.length,
          },
          "HTTP fetch completed"
        );

        return {
          status: response.status,
          headers: responseHeaders,
          body,
          rawBody,
          contentHash,
          latencyMs,
          requestUrl: fullUrl,
          requestMethod: config.method ?? "GET",
          requestHeaders: sanitizedHeaders,
          recordCount: records.length,
          retrievedAt: new Date(),
        };
      },
      retryConfig,
      signal
    );
  }

  // ─── Paginated Fetch ─────────────────────────────────────────────────────

  /**
   * Fetch all pages from a paginated source.
   * Supports checkpoint/resume for interrupted ingestion.
   * Enforces a safety limit on maximum pages to prevent infinite loops.
   */
  async fetchAll(
    config: SourceConfig,
    sourceId: string,
    checkpoint?: CheckpointState,
    signal?: AbortSignal,
    onPageComplete?: PageCompleteCallback
  ): Promise<PaginatedFetchResult> {
    if (!config.pagination) {
      const result = await this.fetch(config, sourceId, signal);
      if (onPageComplete) {
        await onPageComplete(result, 0, result.recordCount, {
          totalRecordsProcessed: result.recordCount,
        });
      }
      return {
        results: [result],
        totalRecords: result.recordCount,
        checkpoint: { totalRecordsProcessed: result.recordCount },
      };
    }

    // Initialize pagination state from checkpoint or defaults
    let state: PaginationState = this.initPaginationState(
      config,
      checkpoint
    );
    const results: FetchResult[] = [];
    let totalRecords = 0;
    let pageCount = 0;
    const maxPages = DEFAULT_MAX_PAGES;

    // Track seen cursors to detect loops
    const seenCursors = new Set<string>();
    if (checkpoint?.lastCursor) {
      seenCursors.add(checkpoint.lastCursor);
    }

    while (state.hasMore && pageCount < maxPages) {
      // Build request with pagination parameters
      const { url, headers, queryParams } = this.buildRequest(config);

      // For link-based pagination, use the full nextUrl directly
      let fullUrl: string;
      if (config.pagination.type === "link" && state.nextUrl) {
        // Validate and use the next URL from the Link header directly
        if (this.ssrfProtection) {
          await validateOutboundUrl(state.nextUrl);
        }
        fullUrl = state.nextUrl;
      } else {
        applyPaginationParams(config.pagination, state, queryParams);
        fullUrl = buildUrl(url, queryParams);
      }

      // SSRF protection: validate outbound URL (async — includes DNS check)
      if (this.ssrfProtection) {
        await validateOutboundUrl(fullUrl);
      }

      // Execute with retry + resilience
      const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
      const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      const result = await withRetry(
        async () => {
          this.circuitBreaker.guard(sourceId);
          await this.rateLimiter.acquire(sourceId, signal);

          const startTime = Date.now();
          const response = await this.executeRequest(
            fullUrl,
            config.method ?? "GET",
            headers,
            config.body,
            timeoutMs,
            signal
          );
          const latencyMs = Date.now() - startTime;

          const rawBody = await this.readResponseBody(response, fullUrl);
          const responseHeaders = flattenHeaders(response.headers);
          const body = this.parseResponseBody(
            rawBody,
            responseHeaders,
            sourceId
          );

          if (!response.ok) {
            this.handleHttpError(response.status, sourceId, rawBody, responseHeaders);
          }

          this.circuitBreaker.recordSuccess(sourceId);
          this.adaptRateLimitFromHeaders(sourceId, responseHeaders);

          const contentHash = computeContentHash(rawBody);
          const sanitizedHeaders = sanitizeRequestHeaders(headers);
          const records = extractResponseDataArray(body);

          return {
            status: response.status,
            headers: responseHeaders,
            body,
            rawBody,
            contentHash,
            latencyMs,
            requestUrl: fullUrl,
            requestMethod: config.method ?? "GET",
            requestHeaders: sanitizedHeaders,
            recordCount: records.length,
            retrievedAt: new Date(),
          };
        },
        retryConfig,
        signal
      );

      results.push(result);
      totalRecords += result.recordCount;
      pageCount++;

      // Advance pagination state
      state = advancePagination(config.pagination, {
        baseUrl: url,
        queryParams,
        state,
        response: {
          status: result.status,
          headers: result.headers,
          body: result.body,
        },
      });

      // Repeated cursor detection — prevent infinite loops
      if (config.pagination.type === "cursor" && state.cursor) {
        if (seenCursors.has(state.cursor)) {
          logger.warn(
            { sourceId, cursor: state.cursor },
            "Repeated cursor detected — stopping pagination to prevent infinite loop"
          );
          state = { ...state, hasMore: false };
        } else {
          seenCursors.add(state.cursor);
        }
      }

      // Build incremental checkpoint for callback
      const incrementalCheckpoint: CheckpointState = {
        lastCursor: state.cursor,
        lastPage: state.page,
        lastOffset: state.offset,
        lastSyncTimestamp: new Date(),
        totalRecordsProcessed:
          (checkpoint?.totalRecordsProcessed ?? 0) + totalRecords,
      };

      // Invoke page-complete callback for incremental checkpointing
      if (onPageComplete) {
        await onPageComplete(result, pageCount, totalRecords, incrementalCheckpoint);
      }

      logger.debug(
        {
          sourceId,
          page: pageCount,
          recordsInPage: result.recordCount,
          totalRecords,
          hasMore: state.hasMore,
        },
        "Pagination page completed"
      );
    }

    if (pageCount >= maxPages) {
      logger.warn(
        { sourceId, maxPages },
        "Reached maximum page limit — pagination truncated"
      );
    }

    // Build updated checkpoint
    const updatedCheckpoint: CheckpointState = {
      lastCursor: state.cursor,
      lastPage: state.page,
      lastOffset: state.offset,
      lastSyncTimestamp: new Date(),
      totalRecordsProcessed:
        (checkpoint?.totalRecordsProcessed ?? 0) + totalRecords,
    };

    logger.info(
      {
        sourceId,
        pages: pageCount,
        totalRecords,
        hasMore: state.hasMore,
      },
      "Paginated fetch completed"
    );

    return { results, totalRecords, checkpoint: updatedCheckpoint };
  }

  // ─── Health Check ────────────────────────────────────────────────────────

  /**
   * Lightweight health check — sends a HEAD or GET request to verify
   * the source is reachable.
   */
  async healthCheck(
    url: string,
    _sourceId: string,
    timeoutMs = 10_000
  ): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      // SSRF validation for health check URL
      if (this.ssrfProtection) {
        await validateOutboundUrl(url);
      }

      // Use safe redirect following (same as regular requests)
      const response = await this.executeRequest(
        url, "GET", {}, undefined, timeoutMs
      );

      // Consume body to free socket
      await response.text().catch(() => {});

      const latencyMs = Date.now() - startTime;
      return {
        healthy: response.ok,
        latencyMs,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const message =
        err instanceof Error ? err.message : "Unknown error";
      return { healthy: false, latencyMs, error: message };
    }
  }

  // ─── Accessors ───────────────────────────────────────────────────────────

  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  // ─── Private: Request Building ───────────────────────────────────────────

  private buildRequest(config: SourceConfig): {
    url: string;
    headers: Record<string, string>;
    queryParams: Record<string, string>;
  } {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "User-Agent": "EXOSQUAD-Connector/0.2.0",
      ...config.headers,
    };

    const queryParams: Record<string, string> = { ...config.queryParams };

    // Apply authentication
    if (config.auth) {
      const requestParts: RequestParts = {
        url: config.url,
        headers,
        queryParams,
      };
      applyAuth(config.auth, requestParts);
    }

    return { url: config.url, headers, queryParams };
  }

  // ─── Private: HTTP Execution ─────────────────────────────────────────────

  /** Maximum number of HTTP redirects to follow */
  private static readonly MAX_REDIRECTS = 10;

  /**
   * Execute a single HTTP request with safe redirect following.
   * Uses redirect: "manual" and validates each redirect destination
   * through SSRF protection to prevent redirect-based SSRF attacks.
   */
  private async executeRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<Response> {
    let currentUrl = url;
    let redirectCount = 0;

    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const onExternalAbort = (): void => {
        controller.abort();
      };
      signal?.addEventListener("abort", onExternalAbort, { once: true });

      try {
        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
          redirect: "manual", // Safe redirect — we validate each hop
        };

        if (body !== undefined && method !== "GET") {
          fetchOptions.body = JSON.stringify(body);
          if (!headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
          }
        }

        const response = await fetch(currentUrl, fetchOptions);

        // Handle redirects manually with SSRF validation at each hop
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          // Consume the redirect response body to free the socket
          await response.text().catch(() => {});

          if (!location) {
            throw new ConnectorError("Redirect response missing Location header", {
              retryable: false,
              context: { url: currentUrl, status: response.status },
            });
          }

          // Resolve relative redirect URLs
          const nextUrl = new URL(location, currentUrl).toString();

          // SSRF validation on redirect destination
          if (this.ssrfProtection) {
            await validateOutboundUrl(nextUrl);
          }

          redirectCount++;
          if (redirectCount > HttpConnector.MAX_REDIRECTS) {
            throw new ConnectorError(
              `Too many redirects (max ${HttpConnector.MAX_REDIRECTS})`,
              { retryable: false, context: { url: currentUrl, redirectCount } }
            );
          }

          logger.debug(
            { from: currentUrl, to: nextUrl, redirectCount },
            "Following redirect with SSRF validation"
          );

          currentUrl = nextUrl;
          // 303 changes method to GET; 307/308 preserve method
          if (response.status === 303) {
            method = "GET";
          }
          continue; // Retry with new URL
        }

        // Content-length pre-check (fast rejection before streaming)
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > this.maxResponseBytes) {
          // Consume body to free socket
          await response.text().catch(() => {});
          throw new ConnectorError(
            `Response size ${contentLength} exceeds limit of ${this.maxResponseBytes} bytes`,
            { retryable: false, context: { url: currentUrl, maxResponseBytes: this.maxResponseBytes } }
          );
        }

        return response;
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === "AbortError" || signal?.aborted)
        ) {
          throw new TimeoutError(currentUrl, timeoutMs);
        }
        if (err instanceof ConnectorError) throw err;
        throw new ConnectorError(
          `HTTP request failed: ${err instanceof Error ? err.message : String(err)}`,
          { retryable: true, context: { url: currentUrl, method } }
        );
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  /**
   * Read an HTTP response body as a stream with a hard byte limit.
   * Protects against responses that exceed maxResponseBytes even when
   * content-length is missing or incorrect (chunked transfer encoding).
   */
  private async readResponseBody(response: Response, url: string): Promise<string> {
    if (!response.body) {
      return "";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > this.maxResponseBytes) {
          await reader.cancel();
          throw new ConnectorError(
            `Response body exceeds limit of ${this.maxResponseBytes} bytes (streaming)`,
            {
              retryable: false,
              context: { url, maxResponseBytes: this.maxResponseBytes, bytesRead: totalBytes },
            }
          );
        }

        chunks.push(value);
      }
    } catch (err) {
      if (err instanceof ConnectorError) throw err;
      // Reader error — try to cancel and rethrow
      await reader.cancel().catch(() => {});
      throw new ConnectorError(
        `Failed to read response body: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, context: { url } }
      );
    }

    // Concatenate chunks into a single string
    if (chunks.length === 0) return "";
    if (chunks.length === 1) return decoder.decode(chunks[0]);

    const total = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      total.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return decoder.decode(total);
  }

  // ─── Private: Response Parsing ───────────────────────────────────────────

  private parseResponseBody(
    rawBody: string,
    headers: Record<string, string>,
    sourceId: string
  ): unknown {
    if (!rawBody || rawBody.trim().length === 0) {
      return null;
    }

    const contentType = headers["content-type"] ?? "";

    // JSON response
    if (contentType.includes("application/json") || contentType.includes("+json")) {
      try {
        return JSON.parse(rawBody);
      } catch {
        throw new MalformedResponseError(
          "Response body is not valid JSON",
          sourceId
        );
      }
    }

    // Try JSON parse as fallback for responses without content-type
    try {
      return JSON.parse(rawBody);
    } catch {
      // Not JSON — return as string wrapped in object
      return { _raw: rawBody, _contentType: contentType };
    }
  }

  // ─── Private: Error Handling ─────────────────────────────────────────────

  private handleHttpError(
    status: number,
    sourceId: string,
    _rawBody: string,
    responseHeaders?: Record<string, string>
  ): never {
    // Record circuit breaker failure
    this.circuitBreaker.recordFailure(sourceId, status);

    switch (status) {
      case 401:
      case 403:
        throw new ConnectorError(
          `Authentication failed: HTTP ${status}`,
          {
            statusCode: status,
            code: "SOURCE_AUTH_FAILED",
            sourceId,
            retryable: false,
          }
        );

      case 429: {
        // Parse Retry-After from response headers if available
        const retryAfterMs = parseRetryAfterHeader(responseHeaders);
        throw new RateLimitExceededError(sourceId, retryAfterMs);
      }

      case 404:
        throw new ConnectorError(
          `Source not found: HTTP 404`,
          {
            statusCode: 404,
            code: "SOURCE_NOT_FOUND",
            sourceId,
            retryable: false,
          }
        );

      case 500:
      case 502:
      case 503:
      case 504:
        throw new ConnectorError(
          `Server error: HTTP ${status}`,
          {
            statusCode: status,
            code: "SOURCE_SERVER_ERROR",
            sourceId,
            retryable: true,
          }
        );

      default:
        throw new ConnectorError(
          `Unexpected HTTP status: ${status}`,
          {
            statusCode: status,
            code: "SOURCE_HTTP_ERROR",
            sourceId,
            retryable: status >= 500,
          }
        );
    }
  }

  // ─── Private: Rate Limit Adaptation ──────────────────────────────────────

  private adaptRateLimitFromHeaders(
    sourceId: string,
    headers: Record<string, string>
  ): void {
    const rlInfo = parseRateLimitHeaders(headers);
    if (rlInfo.remaining !== undefined && rlInfo.remaining <= 2) {
      logger.warn(
        { sourceId, remaining: rlInfo.remaining },
        "Source rate limit nearly exhausted"
      );
    }
  }

  // ─── Private: Pagination Init ────────────────────────────────────────────

  private initPaginationState(
    config: SourceConfig,
    checkpoint?: CheckpointState
  ): PaginationState {
    if (checkpoint && config.pagination) {
      return {
        page: checkpoint.lastPage,
        offset: checkpoint.lastOffset,
        cursor: checkpoint.lastCursor,
        hasMore: true,
      };
    }

    // Default initial state based on pagination type
    switch (config.pagination?.type) {
      case "page":
        return { page: config.pagination.startPage, hasMore: true };
      case "offset":
        return { offset: 0, hasMore: true };
      case "cursor":
        return { hasMore: true };
      case "link":
        return { hasMore: true };
      default:
        return { hasMore: false };
    }
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────

export {
  // Auth
  applyAuth,
  parseAuthConfig,
  authConfigSchema,
  type AuthConfig,
  type RequestParts,
} from "./auth.js";

export {
  // Pagination
  advancePagination,
  applyPaginationParams,
  parseLinkHeader,
  parsePaginationConfig,
  paginationConfigSchema,
  type PaginationConfig,
  type PaginationState,
} from "./pagination.js";

export {
  // Retry
  withRetry,
  calculateBackoff,
  parseRetryConfig,
  retryConfigSchema,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
  type RetryContext,
} from "./retry.js";

export {
  // Rate Limiter
  RateLimiter,
  parseRateLimitHeaders,
  type RateLimitConfig,
} from "./rate-limiter.js";

export {
  // Circuit Breaker
  CircuitBreaker,
  DEFAULT_CIRCUIT_CONFIG,
  type CircuitBreakerConfig,
  type CircuitState,
} from "./circuit-breaker.js";

export {
  // Content Hash
  computeContentHash,
  computeJsonHash,
} from "./content-hash.js";

export {
  // Field Mapping
  applyFieldMapping,
  extractPath,
  extractDataArray,
  mapResponseRecords,
  parseFieldMapping,
  fieldMappingSchema,
  type FieldMapping,
} from "./field-mapping.js";

export {
  // Errors
  ConnectorError,
  TimeoutError,
  RateLimitExceededError,
  AuthenticationError,
  CircuitOpenError,
  SchemaValidationError,
  MalformedResponseError,
} from "./errors.js";

export {
  // Types & Utilities
  sanitizeRequestHeaders,
  flattenHeaders,
  extractResponseDataArray,
  buildUrl,
  validateOutboundUrl,
  parseRetryAfterHeader,
  type SourceConfig,
  type FetchResult,
  type PaginatedFetchResult,
  type CheckpointState,
} from "./types.js";
