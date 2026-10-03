import { describe, it, expect } from "vitest";
import {
  resolveBrand,
  registerBrandAlias,
  isKnownBrand,
  getCanonicalBrand,
} from "../../src/brand.js";

describe("resolveBrand", () => {
  it("resolves known brands", () => {
    const result = resolveBrand("Cetaphil");
    expect(result.normalizedName).toBe("Cetaphil");
    expect(result.quality).toBe("valid");
  });

  it("resolves brand aliases", () => {
    const result = resolveBrand("P&G");
    expect(result.normalizedName).toBe("Procter & Gamble");
    expect(result.quality).toBe("valid");
  });

  it("resolves case-insensitively", () => {
    const result = resolveBrand("cetaphil");
    expect(result.normalizedName).toBe("Cetaphil");
    expect(result.quality).toBe("valid");
  });

  it("resolves punctuation differences", () => {
    const result = resolveBrand("L'Oreal");
    expect(result.normalizedName).toBe("L'Oréal");
    expect(result.quality).toBe("valid");
  });

  it("marks unknown brands as unresolved", () => {
    const result = resolveBrand("SomeRandomBrand123");
    expect(result.quality).toBe("unresolved");
    expect(result.normalizedName).toBeTruthy();
    expect(result.original).toBe("SomeRandomBrand123");
  });

  it("handles empty input", () => {
    const result = resolveBrand("");
    expect(result.quality).toBe("unresolved");
    expect(result.normalizedName).toBe("");
  });

  it("preserves original value", () => {
    const result = resolveBrand("  CETAPHIL  ");
    expect(result.original).toBe("CETAPHIL");
  });
});

describe("registerBrandAlias", () => {
  it("registers a new alias that can be resolved", () => {
    registerBrandAlias("Test Brand XYZ", "TestBrand");
    const result = resolveBrand("Test Brand XYZ");
    expect(result.normalizedName).toBe("TestBrand");
    expect(result.quality).toBe("valid");
  });
});

describe("isKnownBrand", () => {
  it("returns true for known brands", () => {
    expect(isKnownBrand("Cetaphil")).toBe(true);
    expect(isKnownBrand("NIVEA")).toBe(true);
    expect(isKnownBrand("p&g")).toBe(true);
  });

  it("returns false for unknown brands", () => {
    expect(isKnownBrand("CompletelyUnknownBrand999")).toBe(false);
    expect(isKnownBrand("")).toBe(false);
  });
});

describe("getCanonicalBrand", () => {
  it("returns canonical name for known brands", () => {
    expect(getCanonicalBrand("Cetaphil")).toBe("Cetaphil");
    expect(getCanonicalBrand("p&g")).toBe("Procter & Gamble");
  });

  it("returns null for unknown brands", () => {
    expect(getCanonicalBrand("UnknownBrand999")).toBeNull();
    expect(getCanonicalBrand("")).toBeNull();
  });
});
