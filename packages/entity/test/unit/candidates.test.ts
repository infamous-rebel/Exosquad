import { describe, it, expect } from "vitest";
import {
  generateOrgBlockingKeys,
  generateOrgCandidates,
  generateOrgCandidatesForOrg,
} from "../../src/candidates.js";
import type { OrgIdentityInput } from "../../src/types.js";

function makeOrg(id: string, name: string, domain?: string): OrgIdentityInput {
  return {
    id,
    tenantId: "t1",
    canonicalName: name,
    normalizedName: name.toLowerCase(),
    searchKey: name.toLowerCase(),
    legalName: null,
    tradingName: null,
    website: null,
    domain: domain ?? null,
    country: null,
    identifiers: [],
    domains: domain ? [domain] : [],
    emails: [],
    phones: [],
    locations: [],
    roles: [],
  };
}

describe("generateOrgBlockingKeys", () => {
  it("generates name key", () => {
    const org = makeOrg("1", "Acme Trading");
    const keys = generateOrgBlockingKeys(org);
    expect(keys.some((k) => k.startsWith("name:"))).toBe(true);
  });

  it("generates domain key", () => {
    const org = makeOrg("1", "Acme", "acme.com");
    const keys = generateOrgBlockingKeys(org);
    expect(keys.some((k) => k.startsWith("domain:"))).toBe(true);
  });

  it("generates identifier keys", () => {
    const org: OrgIdentityInput = {
      ...makeOrg("1", "Acme"),
      identifiers: [{ type: "registration_id", value: "123", normalized: "123" }],
    };
    const keys = generateOrgBlockingKeys(org);
    expect(keys.some((k) => k.startsWith("id:"))).toBe(true);
  });

  it("deduplicates keys", () => {
    const org = makeOrg("1", "Acme", "acme.com");
    const keys = generateOrgBlockingKeys(org);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });
});

describe("generateOrgCandidates", () => {
  it("generates pairs for orgs sharing a domain", () => {
    const orgs = [makeOrg("1", "Acme", "acme.com"), makeOrg("2", "Acme Ltd", "acme.com")];
    const candidates = generateOrgCandidates(orgs);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.fromOrgId).toBe("1");
    expect(candidates[0]!.toOrgId).toBe("2");
  });

  it("generates pairs for orgs with same name", () => {
    const orgs = [makeOrg("1", "Acme Trading"), makeOrg("2", "Acme Trading")];
    const candidates = generateOrgCandidates(orgs);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("returns empty for unrelated orgs", () => {
    const orgs = [makeOrg("1", "Acme Corp"), makeOrg("2", "Zebra Inc")];
    const candidates = generateOrgCandidates(orgs);
    expect(candidates.length).toBe(0);
  });

  it("respects maxCandidatesPerOrg", () => {
    const orgs = Array.from({ length: 10 }, (_, i) => makeOrg(`org-${i}`, "Same Name", "same.com"));
    const candidates = generateOrgCandidates(orgs, { maxCandidatesPerOrg: 3 });
    // Each org should appear at most 3 times
    const counts = new Map<string, number>();
    for (const c of candidates) {
      counts.set(c.fromOrgId, (counts.get(c.fromOrgId) ?? 0) + 1);
      counts.set(c.toOrgId, (counts.get(c.toOrgId) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});

describe("generateOrgCandidatesForOrg", () => {
  it("finds candidates for a new org", () => {
    const newOrg = makeOrg("new", "Acme Trading", "acme.com");
    const existing = [makeOrg("1", "Acme", "acme.com"), makeOrg("2", "Zebra", "zebra.com")];
    const candidates = generateOrgCandidatesForOrg(newOrg, existing);
    expect(candidates.length).toBeGreaterThan(0);
    // Should match org 1 via domain
    expect(candidates.some((c) => c.fromOrgId === "1" || c.toOrgId === "1")).toBe(true);
  });

  it("excludes different tenants", () => {
    const newOrg = { ...makeOrg("new", "Acme", "acme.com"), tenantId: "t1" };
    const existing = [{ ...makeOrg("1", "Acme", "acme.com"), tenantId: "t2" }];
    const candidates = generateOrgCandidatesForOrg(newOrg, existing);
    expect(candidates.length).toBe(0);
  });
});
