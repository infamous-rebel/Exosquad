import { describe, it, expect } from "vitest";
import { normalizeEmail, isEmailEquivalent, isEmailDomainMatch } from "../../src/email.js";

describe("normalizeEmail", () => {
  it("lowercases", () => {
    const r = normalizeEmail("User@Example.COM");
    expect(r.normalized).toBe("user@example.com");
    expect(r.domain).toBe("example.com");
  });

  it("strips gmail dots", () => {
    const r = normalizeEmail("u.s.e.r@gmail.com");
    expect(r.normalized).toBe("user@gmail.com");
  });

  it("strips gmail +tags", () => {
    const r = normalizeEmail("user+tag@gmail.com");
    expect(r.normalized).toBe("user@gmail.com");
  });

  it("detects corporate email", () => {
    const r = normalizeEmail("info@company.com");
    expect(r.isCorporate).toBe(true);
  });

  it("detects free email", () => {
    const r = normalizeEmail("user@gmail.com");
    expect(r.isCorporate).toBe(false);
  });
});

describe("isEmailEquivalent", () => {
  it("matches same email", () => {
    expect(isEmailEquivalent("user@example.com", "user@example.com")).toBe(true);
  });

  it("matches gmail with dots", () => {
    expect(isEmailEquivalent("u.s.e.r@gmail.com", "user@gmail.com")).toBe(true);
  });

  it("does not match different emails", () => {
    expect(isEmailEquivalent("a@example.com", "b@example.com")).toBe(false);
  });
});

describe("isEmailDomainMatch", () => {
  it("matches same domain", () => {
    expect(isEmailDomainMatch("a@company.com", "b@company.com")).toBe(true);
  });

  it("does not match different domains", () => {
    expect(isEmailDomainMatch("a@company.com", "b@other.com")).toBe(false);
  });
});
