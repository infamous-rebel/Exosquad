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

// ─── HTTP Connector ────────────────────────────────────────────────────────

/**
 * Production HTTP connector with full resilience stack.
 * Each instance has shared rate limiter and circuit breaker for all sources.
 */
export class HttpConnector {
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT);
    this.circuitBreaker = new CircuitBreaker(DEFAULT_CIRCUIT_CONFIG);
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

    return withRetry(
      async () => {
        // Circuit breaker guard
        this.circuitBreaker.guard(sourceId);

        // Rate limit
        await this.rateLimiter.acquire(sourceId, signal);

        // Build request
        const { url, headers, queryParams } = this.buildRequest(config);
        const fullUrl = buildUrl(url, queryParams);

        // Execute HTTP request
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

        // Parse response
        const rawBody = await response.text();
        const responseHeaders = flattenHeaders(response.headers);
        const body = this.parseResponseBody(rawBody, responseHeaders, sourceId);

        // Check for HTTP error status
        if (!response.ok) {
          this.handleHttpError(response.status, sourceId, rawBody);
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
    signal?: AbortSignal
  ): Promise<PaginatedFetchResult> {
    if (!config.pagination) {
      const result = await this.fetch(config, sourceId, signal);
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

    while (state.hasMore && pageCount < maxPages) {
      // Build request with pagination parameters
      const { url, headers, queryParams } = this.buildRequest(config);

      // For link-based pagination, use nextUrl if available
      if (config.pagination.type === "link" && state.nextUrl) {
        const parsed = new URL(state.nextUrl);
        parsed.searchParams.forEach((value, key) => {
          queryParams[key] = value;
        });
      } else {
        applyPaginationParams(config.pagination, state, queryParams);
      }

      const fullUrl = buildUrl(url, queryParams);

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

          const rawBody = await response.text();
          const responseHeaders = flattenHeaders(response.headers);
          const body = this.parseResponseBody(
            rawBody,
            responseHeaders,
            sourceId
          );

          if (!response.ok) {
            this.handleHttpError(response.status, sourceId, rawBody);
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timer);
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

  private async executeRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Link external signal to our controller
    const onExternalAbort = (): void => {
      controller.abort();
    };
    signal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
        redirect: "follow",
      };

      if (body !== undefined && method !== "GET") {
        fetchOptions.body = JSON.stringify(body);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }

      const response = await fetch(url, fetchOptions);
      return response;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" || signal?.aborted)
      ) {
        throw new TimeoutError(url, timeoutMs);
      }
      throw new ConnectorError(
        `HTTP request failed: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, context: { url, method } }
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onExternalAbort);
    }
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
    _rawBody: string
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
        throw new RateLimitExceededError(sourceId);
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
  type SourceConfig,
  type FetchResult,
  type PaginatedFetchResult,
  type CheckpointState,
} from "./types.js";
