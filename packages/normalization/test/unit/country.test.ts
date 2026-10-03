import { describe, it, expect } from "vitest";
import {
  normalizeCountry,
  isValidCountryCode,
  getCountryAlpha2,
} from "../../src/country.js";

describe("normalizeCountry", () => {
  it("resolves alpha-2 codes", () => {
    const result = normalizeCountry("US");
    expect(result).not.toBeNull();
    expect(result!.alpha2).toBe("US");
    expect(result!.alpha3).toBe("USA");
    expect(result!.name).toBe("United States");
    expect(result!.method).toBe("alpha2");
  });

  it("resolves alpha-3 codes", () => {
    const result = normalizeCountry("GBR");
    expect(result).not.toBeNull();
    expect(result!.alpha2).toBe("GB");
    expect(result!.name).toBe("United Kingdom");
    expect(result!.method).toBe("alpha3");
  });

  it("resolves country names", () => {
    const result = normalizeCountry("Bangladesh");
    expect(result).not.toBeNull();
    expect(result!.alpha2).toBe("BD");
    expect(result!.alpha3).toBe("BGD");
  });

  it("resolves aliases", () => {
    expect(normalizeCountry("USA")?.alpha2).toBe("US");
    expect(normalizeCountry("America")?.alpha2).toBe("US");
    expect(normalizeCountry("UK")?.alpha2).toBe("GB");
    expect(normalizeCountry("Germany")?.alpha2).toBe("DE");
    expect(normalizeCountry("deutschland")?.alpha2).toBe("DE");
  });

  it("is case-insensitive", () => {
    expect(normalizeCountry("us")?.alpha2).toBe("US");
    expect(normalizeCountry("united states")?.alpha2).toBe("US");
    expect(normalizeCountry("BANGLADESH")?.alpha2).toBe("BD");
  });

  it("returns null for unknown countries", () => {
    expect(normalizeCountry("Narnia")).toBeNull();
    expect(normalizeCountry("")).toBeNull();
    expect(normalizeCountry("XYZ")).toBeNull();
  });

  it("preserves original value", () => {
    const result = normalizeCountry("USA");
    expect(result!.original).toBe("USA");
  });
});

describe("isValidCountryCode", () => {
  it("returns true for valid alpha-2 codes", () => {
    expect(isValidCountryCode("US")).toBe(true);
    expect(isValidCountryCode("BD")).toBe(true);
    expect(isValidCountryCode("GB")).toBe(true);
  });

  it("returns false for invalid codes", () => {
    expect(isValidCountryCode("XX")).toBe(false);
    expect(isValidCountryCode("")).toBe(false);
  });
});

describe("getCountryAlpha2", () => {
  it("returns alpha-2 from any format", () => {
    expect(getCountryAlpha2("United States")).toBe("US");
    expect(getCountryAlpha2("USA")).toBe("US");
    expect(getCountryAlpha2("US")).toBe("US");
    expect(getCountryAlpha2("America")).toBe("US");
  });

  it("returns null for unknown", () => {
    expect(getCountryAlpha2("Narnia")).toBeNull();
  });
});
