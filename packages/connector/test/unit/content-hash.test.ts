import { describe, it, expect } from "vitest";
import { computeContentHash, computeJsonHash } from "../../src/content-hash";

describe("computeContentHash", () => {
  it("returns consistent SHA-256 for the same string", () => {
    const hash1 = computeContentHash("hello world");
    const hash2 = computeContentHash("hello world");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("returns different hashes for different strings", () => {
    const hash1 = computeContentHash("hello");
    const hash2 = computeContentHash("world");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", () => {
    const hash = computeContentHash("");
    expect(hash).toHaveLength(64);
  });

  it("handles Buffer input", () => {
    const hash = computeContentHash(Buffer.from("test data"));
    expect(hash).toHaveLength(64);
  });
});

describe("computeJsonHash", () => {
  it("produces deterministic hash regardless of key order", () => {
    const hash1 = computeJsonHash({ b: 2, a: 1 });
    const hash2 = computeJsonHash({ a: 1, b: 2 });
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different objects", () => {
    const hash1 = computeJsonHash({ a: 1 });
    const hash2 = computeJsonHash({ a: 2 });
    expect(hash1).not.toBe(hash2);
  });
});
