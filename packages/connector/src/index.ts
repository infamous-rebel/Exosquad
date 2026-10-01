// =============================================================================
// @exosquad/connector — Public API
// =============================================================================
// Re-exports everything from the HTTP connector module.
// This is the single entry point for the connector package.
// =============================================================================

export {
  // Core connector
  HttpConnector,

  // Auth
  applyAuth,
  parseAuthConfig,
  authConfigSchema,
  type AuthConfig,
  type RequestParts,

  // Pagination
  advancePagination,
  applyPaginationParams,
  parseLinkHeader,
  parsePaginationConfig,
  paginationConfigSchema,
  type PaginationConfig,
  type PaginationState,

  // Retry
  withRetry,
  calculateBackoff,
  parseRetryConfig,
  retryConfigSchema,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
  type RetryContext,

  // Rate Limiter
  RateLimiter,
  parseRateLimitHeaders,
  type RateLimitConfig,

  // Circuit Breaker
  CircuitBreaker,
  DEFAULT_CIRCUIT_CONFIG,
  type CircuitBreakerConfig,
  type CircuitState,

  // Content Hash
  computeContentHash,
  computeJsonHash,

  // Field Mapping
  applyFieldMapping,
  extractPath,
  extractDataArray,
  mapResponseRecords,
  parseFieldMapping,
  fieldMappingSchema,
  type FieldMapping,

  // Errors
  ConnectorError,
  TimeoutError,
  RateLimitExceededError,
  AuthenticationError,
  CircuitOpenError,
  SchemaValidationError,
  MalformedResponseError,

  // Types & Utilities
  sanitizeRequestHeaders,
  flattenHeaders,
  extractResponseDataArray,
  buildUrl,
  type SourceConfig,
  type FetchResult,
  type PaginatedFetchResult,
  type CheckpointState,
} from "./http-connector.js";
