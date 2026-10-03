import { describe, it, expect } from "vitest";
import { compareOrganizations } from "../../src/similarity.js";
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

describe("compareOrganizations", () => {
  it("returns EXACT_MATCH for same registration ID", () => {
    const a = makeOrg({ id: "1", tenantId: "t1", canonicalName: "Acme Ltd", identifiers: [{ type: "registration_id", value: "12345", normalized: "12345" }] });
    const b = makeOrg({ id: "2", tenantId: "t1", canonicalName: "Acme LLC", identifiers: [{ type: "registration_id", value: "12345", normalized: "12345" }] });
    const r = compareOrganizations(a, b);
    expect(r.decision).toBe("EXACT_MATCH");
    expect(r.confidence).toBe(0.95);
  });

  it("returns HIGH_CONFIDENCE_MATCH for same domain + similar name", () => {
    const a = makeOrg({ id: "1", tenantId: "t1", canonicalName: "Acme Trading", domain: "acme.com", domains: ["acme.com"] });
    const b = makeOrg({ id: "2", tenantId: "t1", canonicalName: "Acme Trading Ltd", domain: "acme.com", domains: ["acme.com"] });
    const r = compareOrganizations(a, b);
    expect(r.decision).toBe("HIGH_CONFIDENCE_MATCH");
  });

  it("returns NO_MATCH for completely different orgs", () => {
    const a = makeOrg({ id: "1", tenantId: "t1", canonicalName: "Acme Corp" });
    const b = makeOrg({ id: "2", tenantId: "t1", canonicalName: "Zebra Inc" });
    const r = compareOrganizations(a, b);
    expect(r.decision).toBe("NO_MATCH");
  });

  it("returns CONFLICT for same identifier type, different value", () => {
    const a = makeOrg({
      id: "1", tenantId: "t1", canonicalName: "Acme",
      identifiers: [{ type: "registration_id", value: "111", normalized: "111" }],
    });
    const b = makeOrg({
      id: "2", tenantId: "t1", canonicalName: "Acme",
      identifiers: [{ type: "registration_id", value: "222", normalized: "222" }],
    });
    const r = compareOrganizations(a, b);
    expect(r.decision).toBe("CONFLICT");
    expect(r.evidence.registrationMatch).toBe("conflict");
  });

  it("produces structured evidence with all dimensions", () => {
    const a = makeOrg({ id: "1", tenantId: "t1", canonicalName: "Acme", domain: "acme.com", domains: ["acme.com"] });
    const b = makeOrg({ id: "2", tenantId: "t1", canonicalName: "Acme", domain: "acme.com", domains: ["acme.com"] });
    const r = compareOrganizations(a, b);
    expect(r.evidence).toHaveProperty("nameMatch");
    expect(r.evidence).toHaveProperty("domainMatch");
    expect(r.evidence).toHaveProperty("emailMatch");
    expect(r.evidence).toHaveProperty("phoneMatch");
    expect(r.evidence).toHaveProperty("addressMatch");
    expect(r.evidence).toHaveProperty("registrationMatch");
    expect(r.evidence).toHaveProperty("countryMatch");
    expect(r.evidence).toHaveProperty("websiteMatch");
    expect(r.evidence).toHaveProperty("roleCompatibility");
    expect(r.evidence.scores).toHaveProperty("overallScore");
  });

  it("detects matching phone numbers", () => {
    const a = makeOrg({
      id: "1", tenantId: "t1", canonicalName: "Acme",
      phones: [{ rawPhone: "+8801712345678", normalizedPhone: "+8801712345678", countryCode: "BD" }],
    });
    const b = makeOrg({
      id: "2", tenantId: "t1", canonicalName: "Acme Ltd",
      phones: [{ rawPhone: "+8801712345678", normalizedPhone: "+8801712345678", countryCode: "BD" }],
    });
    const r = compareOrganizations(a, b);
    expect(r.evidence.phoneMatch).toBe("exact");
  });

  it("detects matching corporate emails", () => {
    const a = makeOrg({
      id: "1", tenantId: "t1", canonicalName: "Acme",
      emails: [{ email: "info@acme.com", normalizedEmail: "info@acme.com", domain: "acme.com", isCorporate: true }],
    });
    const b = makeOrg({
      id: "2", tenantId: "t1", canonicalName: "Acme Ltd",
      emails: [{ email: "info@acme.com", normalizedEmail: "info@acme.com", domain: "acme.com", isCorporate: true }],
    });
    const r = compareOrganizations(a, b);
    expect(r.evidence.emailMatch).toBe("exact");
  });
});
