// =============================================================================
// Tests — AI provider abstraction
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  NoOpAIProvider,
  HttpAIProvider,
  createAIProvider,
} from "../../src/ai-provider.js";
import type { AIMatchRequest } from "../../src/types.js";

const sampleRequest: AIMatchRequest = {
  productA: {
    name: "CeraVe Hydrating Facial Cleanser 236ml",
    brand: "CeraVe",
    identifiers: ["3606000423981"],
    quantity: "236ml",
    variant: null,
  },
  productB: {
    name: "CeraVe Hydrating Facial Cleanser 473ml",
    brand: "CeraVe",
    identifiers: [],
    quantity: "473ml",
    variant: null,
  },
};

describe("NoOpAIProvider", () => {
  it("should report as unavailable", () => {
    const provider = new NoOpAIProvider();
    expect(provider.available).toBe(false);
    expect(provider.name).toBe("none");
  });

  it("should always return UNRESOLVED", async () => {
    const provider = new NoOpAIProvider();
    const result = await provider.matchProducts(sampleRequest);
    expect(result.decision).toBe("UNRESOLVED");
    expect(result.confidence).toBe(0);
    expect(result.reasons).toContain("AI provider not available");
    expect(result.relationshipType).toBeNull();
  });
});

describe("HttpAIProvider", () => {
  it("should report unavailable when endpoint is empty", () => {
    const provider = new HttpAIProvider({
      name: "test",
      endpoint: "",
      model: "gpt-4o-mini",
    });
    expect(provider.available).toBe(false);
  });

  it("should report available when endpoint is set", () => {
    const provider = new HttpAIProvider({
      name: "test",
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "gpt-4o-mini",
    });
    expect(provider.available).toBe(true);
    expect(provider.name).toBe("test");
  });

  it("should return UNRESOLVED when not available", async () => {
    const provider = new HttpAIProvider({
      name: "test",
      endpoint: "",
      model: "gpt-4o-mini",
    });
    const result = await provider.matchProducts(sampleRequest);
    expect(result.decision).toBe("UNRESOLVED");
    expect(result.confidence).toBe(0);
  });

  it("should handle fetch errors gracefully", async () => {
    const provider = new HttpAIProvider({
      name: "test",
      endpoint: "https://invalid.nonexistent.example.com/api",
      model: "gpt-4o-mini",
      timeoutMs: 1000,
    });
    const result = await provider.matchProducts(sampleRequest);
    expect(result.decision).toBe("UNRESOLVED");
    expect(result.confidence).toBe(0);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

describe("createAIProvider", () => {
  it("should return NoOpAIProvider when no config is provided", () => {
    const provider = createAIProvider();
    expect(provider).toBeInstanceOf(NoOpAIProvider);
    expect(provider.available).toBe(false);
  });

  it("should return NoOpAIProvider when endpoint is missing", () => {
    const provider = createAIProvider({ name: "test" });
    expect(provider).toBeInstanceOf(NoOpAIProvider);
  });

  it("should return HttpAIProvider when endpoint is provided", () => {
    const provider = createAIProvider({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "gpt-4o-mini",
    });
    expect(provider).toBeInstanceOf(HttpAIProvider);
    expect(provider.available).toBe(true);
  });

  it("should use default model name when not specified", () => {
    const provider = createAIProvider({
      endpoint: "https://api.example.com/v1/chat/completions",
    });
    expect(provider).toBeInstanceOf(HttpAIProvider);
    expect(provider.name).toBe("http");
  });
});
