// =============================================================================
// @exosquad/connector — Retry with exponential backoff + jitter
// =============================================================================

import { createChildLogger } from "@exosquad/logger";
import { ConnectorError } from "./errors.js";
import { z } from "zod";

const logger = createChildLogger({ module: "retry" });

// ─── Retry Config ──────────────────────────────────────────────────────────

export const retryConfigSchema = z.object({
  maxAttempts: z.number().int().positive().default(3),
  baseDelayMs: z.number().int().positive().default(1000),
  maxDelayMs: z.number().int().positive().default(30000),
  jitterFactor: z.number().min(0).max(1).default(0.3),
  multiplier: z.number().min(1).max(5).default(2),
  retryableStatusCodes: z.array(z.number()).default([408, 429, 500, 502, 503, 504]),
});

export type RetryConfig = z.infer<typeof retryConfigSchema>;

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3,
  multiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

// ─── Backoff Calculation ───────────────────────────────────────────────────

/**
 * Calculate delay for a given attempt using exponential backoff with jitter.
 * Formula: min(baseDelay * multiplier^attempt, maxDelay) * (1 ± jitter)
 */
export function calculateBackoff(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // -jitterRange to +jitterRange
  return Math.max(0, Math.round(cappedDelay + jitter));
}

// ─── Sleep ─────────────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    }, { once: true });
  });
}

// ─── Retry Wrapper ─────────────────────────────────────────────────────────

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  lastError?: Error;
}

/**
 * Execute an async function with retry, exponential backoff, and jitter.
 * Only retries on errors marked as retryable.
 */
export async function withRetry<T>(
  fn: (context: RetryContext) => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  signal?: AbortSignal
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn({ attempt, maxAttempts: config.maxAttempts, lastError });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry if error is explicitly non-retryable
      if (err instanceof ConnectorError && !err.retryable) {
        throw err;
      }

      // Don't retry if this was the last attempt
      if (attempt >= config.maxAttempts - 1) {
        break;
      }

      // Check if the error is retryable based on status code
      if (err instanceof ConnectorError) {
        const statusCode = err.statusCode;
        if (!config.retryableStatusCodes.includes(statusCode)) {
          throw err;
        }
      }

      const delayMs = calculateBackoff(attempt, config);
      logger.debug(
        { attempt: attempt + 1, maxAttempts: config.maxAttempts, delayMs, error: lastError.message },
        "Retrying after backoff"
      );

      await sleep(delayMs, signal);
    }
  }

  throw lastError;
}

/**
 * Parse retry config from raw JSON (e.g., from database).
 */
export function parseRetryConfig(raw: unknown): RetryConfig {
  const result = retryConfigSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_RETRY_CONFIG;
}
