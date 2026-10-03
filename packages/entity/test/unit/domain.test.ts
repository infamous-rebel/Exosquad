import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  isDomainEquivalent,
  isCorporateDomain,
  isFreeEmailDomain,
} from "../../src/domain.js";

describe("normalizeDomain", () => {
  it("strips protocol and www", () => {
    const r = normalizeDomain("https://www.example.com/path");
    expect(r.hostname).toBe("example.com");
    expect(r.normalized).toBe("example.com");
  });

  it("extracts registrable domain from subdomain", () => {
    const r = normalizeDomain("shop.example.com");
    expect(r.registrableDomain).toBe("example.com");
    expect(r.isSubdomain).toBe(true);
  });

  it("handles ccTLD: co.uk", () => {
    const r = normalizeDomain("example.co.uk");
    expect(r.registrableDomain).toBe("example.co.uk");
  });

  it("handles empty input", () => {
    const r = normalizeDomain("");
    expect(r.hostname).toBe("");
  });

  it("lowercases", () => {
    const r = normalizeDomain("EXAMPLE.COM");
    expect(r.hostname).toBe("example.com");
  });
});

describe("isDomainEquivalent", () => {
  it("matches same domain", () => {
    expect(isDomainEquivalent("example.com", "example.com")).toBe(true);
  });

  it("matches subdomain to registrable", () => {
    expect(isDomainEquivalent("shop.example.com", "example.com")).toBe(true);
  });

  it("does not match different domains", () => {
    expect(isDomainEquivalent("example.com", "other.com")).toBe(false);
  });
});

describe("isFreeEmailDomain", () => {
  it("gmail.com is free", () => {
    expect(isFreeEmailDomain("gmail.com")).toBe(true);
  });

  it("yahoo.com is free", () => {
    expect(isFreeEmailDomain("yahoo.com")).toBe(true);
  });

  it("company.com is not free", () => {
    expect(isFreeEmailDomain("company.com")).toBe(false);
  });
});

describe("isCorporateDomain", () => {
  it("company.com is corporate", () => {
    expect(isCorporateDomain("company.com")).toBe(true);
  });

  it("gmail.com is not corporate", () => {
    expect(isCorporateDomain("gmail.com")).toBe(false);
  });
});
