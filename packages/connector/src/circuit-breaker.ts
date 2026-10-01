// =============================================================================
// @exosquad/connector — Circuit breaker
// =============================================================================
// Prevents cascading failures by stopping requests to unhealthy sources.
// States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
// =============================================================================

import { createChildLogger } from "@exosquad/logger";
import { CircuitOpenError } from "./errors.js";

const logger = createChildLogger({ module: "circuit-breaker" });

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Failures before opening circuit
  recoveryTimeMs: number;      // Time to wait before trying again
  successThreshold: number;    // Successes in half_open to close circuit
  monitoredStatusCodes: number[]; // HTTP status codes that count as failures
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeMs: 60_000,      // 1 minute
  successThreshold: 2,
  monitoredStatusCodes: [500, 502, 503, 504],
};

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number;
  openedAt: number;
}

/**
 * Per-source circuit breaker.
 * Each source gets its own circuit that tracks failures independently.
 */
export class CircuitBreaker {
  private circuits = new Map<string, CircuitBreakerState>();
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG) {
    this.config = config;
  }

  /**
   * Check if a request is allowed for the given key.
   * Throws CircuitOpenError if the circuit is open.
   */
  guard(key: string): void {
    const circuit = this.getCircuit(key);

    if (circuit.state === "closed") {
      return;
    }

    if (circuit.state === "open") {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed >= this.config.recoveryTimeMs) {
        // Transition to half_open — allow one request to test recovery
        circuit.state = "half_open";
        circuit.successCount = 0;
        logger.info({ key }, "Circuit breaker: open → half_open");
        return;
      }

      const openUntil = new Date(circuit.openedAt + this.config.recoveryTimeMs);
      throw new CircuitOpenError(key, openUntil);
    }

    // half_open: allow the request (already transitioned above if needed)
  }

  /**
   * Record a successful request.
   */
  recordSuccess(key: string): void {
    const circuit = this.getCircuit(key);

    if (circuit.state === "half_open") {
      circuit.successCount++;
      if (circuit.successCount >= this.config.successThreshold) {
        circuit.state = "closed";
        circuit.failureCount = 0;
        circuit.successCount = 0;
        logger.info({ key }, "Circuit breaker: half_open → closed (recovered)");
      }
    } else if (circuit.state === "closed") {
      // Reset failure count on success
      circuit.failureCount = 0;
    }
  }

  /**
   * Record a failed request.
   */
  recordFailure(key: string, statusCode?: number): void {
    const circuit = this.getCircuit(key);

    // Only count monitored status codes (or all errors if no status code)
    if (statusCode && !this.config.monitoredStatusCodes.includes(statusCode)) {
      return;
    }

    circuit.failureCount++;
    circuit.lastFailureAt = Date.now();

    if (circuit.state === "half_open") {
      // Any failure in half_open immediately opens the circuit
      circuit.state = "open";
      circuit.openedAt = Date.now();
      logger.warn({ key, failureCount: circuit.failureCount }, "Circuit breaker: half_open → open");
      return;
    }

    if (circuit.state === "closed" && circuit.failureCount >= this.config.failureThreshold) {
      circuit.state = "open";
      circuit.openedAt = Date.now();
      logger.warn(
        { key, failureCount: circuit.failureCount, threshold: this.config.failureThreshold },
        "Circuit breaker: closed → open"
      );
    }
  }

  /**
   * Get the current state of a circuit.
   */
  getState(key: string): CircuitState {
    return this.getCircuit(key).state;
  }

  /**
   * Get stats for all circuits.
   */
  getStats(): Record<string, { state: CircuitState; failureCount: number }> {
    const stats: Record<string, { state: CircuitState; failureCount: number }> = {};
    for (const [key, circuit] of this.circuits) {
      stats[key] = { state: circuit.state, failureCount: circuit.failureCount };
    }
    return stats;
  }

  /**
   * Reset a specific circuit.
   */
  reset(key: string): void {
    this.circuits.delete(key);
  }

  private getCircuit(key: string): CircuitBreakerState {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = {
        state: "closed",
        failureCount: 0,
        successCount: 0,
        lastFailureAt: 0,
        openedAt: 0,
      };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }
}
