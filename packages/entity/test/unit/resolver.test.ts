import { describe, it, expect } from "vitest";
import { OrgEntityResolver } from "../../src/resolver.js";
import { NoOpOrgAIProvider } from "../../src/ai-provider.js";
import type { OrgIdentityInput } from "../../src/types.js";

function makeOrg(overrides: Partial<OrgIdentityInput> & { id: string; tenantId: string }): OrgIdentityInput {
  return {
    canonicalName: "Test Org",
    normalizedName: "test org",
    searchKey: "test org",
    legalName: null,
    tradingName: null,
    website: null,
    domain: null,
    country: null,
    identifiers: [],
    domains: [],
    emails: [],
    phones: [],
    locations: [],
    roles: [],
    ...overrides,
  };
}

describe("OrgEntityResolver", () => {
  const resolver = new OrgEntityResolver({
    aiProvider: new NoOpOrgAIProvider(),
    useAIForUncertain: false,
  });

  it("resolves exact identifier match", async () => {
    const a = makeOrg({ id: "1", tenantId: "t1", canonicalName: "Acme", identifiers: [{ type: "registration_id", value: "123", normalized: "123" }] });
    const b = makeOrg({ id: "2", tenantId: "t1", canonicalName: "Acme Ltd", identifiers: [{ type: "registration_id", value: "123", normalized: "123" }] });
    const candidates = resolver.generateCandidates([a, b]);
    expect(candidates.length).toBeGreaterThan(0);

    const result = await resolver.resolveCandidate(candidates[0]!, a, b);
    expect(result.matchResult.decision).toBe("EXACT_MATCH");
    expect(result.autoApplicable).toBe(true);
    expect(result.aiUsed).toBe(false);
  });

  it("resolves domain match with high confidence", async () => {
    const a = makeOrg({ id: "1", tenantId: "t1", canonicalName: "Acme Trading", domain: "acme.com", domains: ["acme.com"] });
    const b = makeOrg({ id: "2", tenantId: "t1", canonicalName: "Acme Trading Ltd", domain: "acme.com", domains: ["acme.com"] });
    const candidates = resolver.generateCandidates([a, b]);

    const result = await resolver.resolveCandidate(candidates[0]!, a, b);
    expect(result.matchResult.decision).toBe("HIGH_CONFIDENCE_MATCH");
    expect(result.autoApplicable).toBe(true);
  });

  it("detects conflicts and prevents auto-apply", async () => {
    const a = makeOrg({
      id: "1", tenantId: "t1", canonicalName: "Acme",
      identifiers: [{ type: "registration_id", value: "111", normalized: "111" }],
    });
    const b = makeOrg({
      id: "2", tenantId: "t1", canonicalName: "Acme",
      identifiers: [{ type: "registration_id", value: "222", normalized: "222" }],
    });
    const candidates = resolver.generateCandidates([a, b]);

    const result = await resolver.resolveCandidate(candidates[0]!, a, b);
    expect(result.matchResult.decision).toBe("CONFLICT");
    expect(result.autoApplicable).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("resolveAll processes all candidates", async () => {
    const orgs = [
      makeOrg({ id: "1", tenantId: "t1", canonicalName: "Acme", domain: "acme.com", domains: ["acme.com"] }),
      makeOrg({ id: "2", tenantId: "t1", canonicalName: "Acme Ltd", domain: "acme.com", domains: ["acme.com"] }),
      makeOrg({ id: "3", tenantId: "t1", canonicalName: "Zebra Inc" }),
    ];
    const results = await resolver.resolveAll(orgs);
    expect(results.length).toBeGreaterThan(0);
  });

  it("generates candidates for new org against existing", () => {
    const newOrg = makeOrg({ id: "new", tenantId: "t1", canonicalName: "Acme", domain: "acme.com", domains: ["acme.com"] });
    const existing = [
      makeOrg({ id: "1", tenantId: "t1", canonicalName: "Acme Ltd", domain: "acme.com", domains: ["acme.com"] }),
      makeOrg({ id: "2", tenantId: "t1", canonicalName: "Zebra", domain: "zebra.com", domains: ["zebra.com"] }),
    ];
    const candidates = resolver.generateCandidatesForNewOrg(newOrg, existing);
    expect(candidates.length).toBeGreaterThan(0);
  });
});
