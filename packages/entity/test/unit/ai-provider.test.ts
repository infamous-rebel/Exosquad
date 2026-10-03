import { describe, it, expect } from "vitest";
import { NoOpOrgAIProvider, createOrgAIProvider } from "../../src/ai-provider.js";

describe("NoOpOrgAIProvider", () => {
  it("reports unavailable", () => {
    const provider = new NoOpOrgAIProvider();
    expect(provider.available).toBe(false);
    expect(provider.name).toBe("none");
  });

  it("returns UNRESOLVED", async () => {
    const provider = new NoOpOrgAIProvider();
    const result = await provider.matchOrganizations({
      orgA: { name: "A", legalName: null, domain: null, country: null, identifiers: [], roles: [] },
      orgB: { name: "B", legalName: null, domain: null, country: null, identifiers: [], roles: [] },
    });
    expect(result.decision).toBe("UNRESOLVED");
    expect(result.confidence).toBe(0);
  });
});

describe("createOrgAIProvider", () => {
  it("returns NoOp when no config", () => {
    const provider = createOrgAIProvider();
    expect(provider.available).toBe(false);
  });

  it("returns NoOp when no endpoint", () => {
    const provider = createOrgAIProvider({ name: "test" });
    expect(provider.available).toBe(false);
  });

  it("returns HttpAIProvider when endpoint provided", () => {
    const provider = createOrgAIProvider({ endpoint: "https://api.example.com", model: "gpt-4" });
    expect(provider.available).toBe(true);
    expect(provider.name).toBe("http");
  });
});
