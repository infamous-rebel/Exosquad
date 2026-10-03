import { describe, it, expect } from "vitest";
import {
  normalizeCompanyName,
  createCompanySearchKey,
  isCompanyNameEquivalent,
  companyNameSimilarity,
} from "../../src/company-name.js";

describe("normalizeCompanyName", () => {
  it("lowercases and trims", () => {
    const r = normalizeCompanyName("  Acme Corp  ");
    expect(r.normalizedName).toBe("acme corp");
    expect(r.originalName).toBe("  Acme Corp  ");
  });

  it("strips legal suffix: Ltd", () => {
    const r = normalizeCompanyName("Acme Trading Ltd");
    expect(r.legalSuffix).toBe("ltd");
    expect(r.coreName).toBe("acme trading");
  });

  it("strips legal suffix: LLC", () => {
    const r = normalizeCompanyName("Acme LLC");
    expect(r.legalSuffix).toBe("llc");
    expect(r.coreName).toBe("acme");
  });

  it("strips multi-word suffix: Pvt Ltd", () => {
    const r = normalizeCompanyName("Acme Pvt Ltd");
    expect(r.legalSuffix).toBe("pvt ltd");
    expect(r.coreName).toBe("acme");
  });

  it("strips GmbH", () => {
    const r = normalizeCompanyName("Müller GmbH");
    expect(r.legalSuffix).toBe("gmbh");
    expect(r.coreName).toBe("müller");
  });

  it("returns null suffix when none found", () => {
    const r = normalizeCompanyName("Acme Trading");
    expect(r.legalSuffix).toBeNull();
    expect(r.coreName).toBe("acme trading");
  });

  it("produces a search key", () => {
    const r = normalizeCompanyName("Acme Trading Ltd.");
    expect(r.searchKey.length).toBeGreaterThan(0);
  });
});

describe("createCompanySearchKey", () => {
  it("strips punctuation and legal suffixes", () => {
    const key = createCompanySearchKey("A.B.C. Trading Ltd.");
    expect(key).not.toContain("ltd");
    expect(key).not.toContain(".");
  });

  it("returns empty for empty input", () => {
    expect(createCompanySearchKey("")).toBe("");
  });
});

describe("isCompanyNameEquivalent", () => {
  it("matches same name with different suffix", () => {
    expect(isCompanyNameEquivalent("Acme Ltd", "Acme LLC")).toBe(true);
  });

  it("matches same name with/without punctuation", () => {
    expect(isCompanyNameEquivalent("A.B.C. Corp", "ABC Corp")).toBe(true);
  });

  it("does not match different names", () => {
    expect(isCompanyNameEquivalent("Acme Corp", "Beta Inc")).toBe(false);
  });
});

describe("companyNameSimilarity", () => {
  it("returns 1.0 for identical names", () => {
    expect(companyNameSimilarity("Acme Corp", "Acme Corp")).toBe(1.0);
  });

  it("returns high score for similar names", () => {
    const score = companyNameSimilarity("Acme Trading Ltd", "Acme Trading LLC");
    expect(score).toBeGreaterThan(0.7);
  });

  it("returns low score for different names", () => {
    const score = companyNameSimilarity("Acme Corp", "Zebra Inc");
    expect(score).toBeLessThan(0.5);
  });

  it("returns 0 for completely different names", () => {
    expect(companyNameSimilarity("Acme", "Zzzzz")).toBeLessThan(0.2);
  });
});
