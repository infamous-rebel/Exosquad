import { describe, it, expect } from "vitest";
import { CircuitBreaker, DEFAULT_CIRCUIT_CONFIG } from "../../src/circuit-breaker";
import { CircuitOpenError } from "../../src/errors";

describe("CircuitBreaker", () => {
  const config = { ...DEFAULT_CIRCUIT_CONFIG, failureThreshold: 3, recoveryTimeMs: 100, successThreshold: 2 };

  it("starts in closed state", () => {
    const cb = new CircuitBreaker(config);
    expect(cb.getState("source-1")).toBe("closed");
  });

  it("allows requests in closed state", () => {
    const cb = new CircuitBreaker(config);
    expect(() => cb.guard("source-1")).not.toThrow();
  });

  it("opens circuit after failure threshold", () => {
    const cb = new CircuitBreaker(config);
    cb.recordFailure("source-1", 500);
    cb.recordFailure("source-1", 502);
    cb.recordFailure("source-1", 503);
    expect(cb.getState("source-1")).toBe("open");
  });

  it("throws CircuitOpenError when circuit is open", () => {
    const cb = new CircuitBreaker(config);
    cb.recordFailure("source-1", 500);
    cb.recordFailure("source-1", 502);
    cb.recordFailure("source-1", 503);
    expect(() => cb.guard("source-1")).toThrow(CircuitOpenError);
  });

  it("transitions to half_open after recovery time", async () => {
    const cb = new CircuitBreaker(config);
    cb.recordFailure("source-1", 500);
    cb.recordFailure("source-1", 502);
    cb.recordFailure("source-1", 503);
    expect(cb.getState("source-1")).toBe("open");

    // Wait for recovery time
    await new Promise((r) => setTimeout(r, 150));

    // Should transition to half_open and allow the request
    expect(() => cb.guard("source-1")).not.toThrow();
    expect(cb.getState("source-1")).toBe("half_open");
  });

  it("closes circuit after success threshold in half_open", async () => {
    const cb = new CircuitBreaker(config);
    cb.recordFailure("source-1", 500);
    cb.recordFailure("source-1", 502);
    cb.recordFailure("source-1", 503);

    await new Promise((r) => setTimeout(r, 150));
    cb.guard("source-1"); // transitions to half_open

    cb.recordSuccess("source-1");
    expect(cb.getState("source-1")).toBe("half_open"); // need 2 successes
    cb.recordSuccess("source-1");
    expect(cb.getState("source-1")).toBe("closed"); // now closed
  });

  it("reopens circuit on failure in half_open", async () => {
    const cb = new CircuitBreaker(config);
    cb.recordFailure("source-1", 500);
    cb.recordFailure("source-1", 502);
    cb.recordFailure("source-1", 503);

    await new Promise((r) => setTimeout(r, 150));
    cb.guard("source-1"); // transitions to half_open

    cb.recordFailure("source-1", 500); // any failure reopens
    expect(cb.getState("source-1")).toBe("open");
  });

  it("tracks circuits independently per key", () => {
    const cb = new CircuitBreaker(config);
    cb.recordFailure("source-1", 500);
    cb.recordFailure("source-1", 502);
    cb.recordFailure("source-1", 503);

    expect(cb.getState("source-1")).toBe("open");
    expect(cb.getState("source-2")).toBe("closed"); // unaffected
  });

  it("ignores non-monitored status codes", () => {
    const cb = new CircuitBreaker(config);
    cb.recordFailure("source-1", 400); // not in monitoredStatusCodes
    cb.recordFailure("source-1", 404);
    cb.recordFailure("source-1", 401);
    expect(cb.getState("source-1")).toBe("closed"); // still closed
  });

  it("resets a specific circuit", () => {
    const cb = new CircuitBreaker(config);
    cb.recordFailure("source-1", 500);
    cb.recordFailure("source-1", 502);
    cb.recordFailure("source-1", 503);
    expect(cb.getState("source-1")).toBe("open");

    cb.reset("source-1");
    expect(cb.getState("source-1")).toBe("closed");
  });
});
