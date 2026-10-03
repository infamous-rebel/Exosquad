import { describe, it, expect } from "vitest";
import { detectOrgConflicts } from "../../src/conflicts.js";
import type { OrgIdentityInput } from "../../src/types.js";

function makeOrg(overrides: Partial<OrgIdentityInput> & { id: string }): OrgIdentityInput {
  return {
    tenantId: "t1",
    canonicalName: "Test",
    normalizedName: "test",
    searchKey: "test",
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

describe("detectOrgConflicts", () => {
  it("detects registration collision (same type, different value)", () => {
    const a = makeOrg({ id: "1", identifiers: [{ type: "registration_id", value: "111", normalized: "111" }] });
    const b = makeOrg({ id: "2", identifiers: [{ type: "registration_id", value: "222", normalized: "222" }] });
    const conflicts = detectOrgConflicts(a, b);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.conflictType).toBe("registration_collision");
    expect(conflicts[0]!.severity).toBe("critical");
  });

  it("detects domain conflict (same domain, very different names)", () => {
    const a = makeOrg({ id: "1", canonicalName: "Acme Corp", domain: "acme.com", domains: ["acme.com"] });
    const b = makeOrg({ id: "2", canonicalName: "Zebra Inc", domain: "acme.com", domains: ["acme.com"] });
    const conflicts = detectOrgConflicts(a, b);
    expect(conflicts.some((c) => c.conflictType === "domain_conflict")).toBe(true);
  });

  it("detects name conflict (same name, different countries)", () => {
    const a = makeOrg({ id: "1", canonicalName: "Acme Trading Ltd", country: "US" });
    const b = makeOrg({ id: "2", canonicalName: "Acme Trading Ltd", country: "BD" });
    const conflicts = detectOrgConflicts(a, b);
    expect(conflicts.some((c) => c.conflictType === "name_conflict")).toBe(true);
  });

  it("returns no conflicts for identical orgs", () => {
    const a = makeOrg({ id: "1", canonicalName: "Acme" });
    const b = makeOrg({ id: "2", canonicalName: "Acme" });
    const conflicts = detectOrgConflicts(a, b);
    expect(conflicts.length).toBe(0);
  });

  it("does not flag different identifier types as conflict", () => {
    const a = makeOrg({ id: "1", identifiers: [{ type: "vat", value: "V1", normalized: "V1" }] });
    const b = makeOrg({ id: "2", identifiers: [{ type: "tin", value: "T1", normalized: "T1" }] });
    const conflicts = detectOrgConflicts(a, b);
    expect(conflicts.length).toBe(0);
  });
});
