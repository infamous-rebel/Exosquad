import { describe, it, expect } from "vitest";
import {
  normalizeUnit,
  parseQuantityUnit,
  parsePackStructure,
  extractQuantityFromName,
  convertMass,
  convertVolume,
} from "../../src/units.js";

describe("normalizeUnit", () => {
  it("normalizes mass units", () => {
    expect(normalizeUnit("mg")).toEqual({ unit: "mg", category: "mass" });
    expect(normalizeUnit("g")).toEqual({ unit: "g", category: "mass" });
    expect(normalizeUnit("kg")).toEqual({ unit: "kg", category: "mass" });
    expect(normalizeUnit("grams")).toEqual({ unit: "g", category: "mass" });
    expect(normalizeUnit("GRAMS")).toEqual({ unit: "g", category: "mass" });
  });

  it("normalizes volume units", () => {
    expect(normalizeUnit("ml")).toEqual({ unit: "ml", category: "volume" });
    expect(normalizeUnit("l")).toEqual({ unit: "l", category: "volume" });
    expect(normalizeUnit("liters")).toEqual({ unit: "l", category: "volume" });
    expect(normalizeUnit("millilitres")).toEqual({ unit: "ml", category: "volume" });
  });

  it("normalizes count units", () => {
    expect(normalizeUnit("piece")).toEqual({ unit: "piece", category: "count" });
    expect(normalizeUnit("pcs")).toEqual({ unit: "piece", category: "count" });
    expect(normalizeUnit("bottle")).toEqual({ unit: "bottle", category: "count" });
    expect(normalizeUnit("tablets")).toEqual({ unit: "tablet", category: "count" });
  });

  it("returns null for unknown units", () => {
    expect(normalizeUnit("xyz")).toBeNull();
    expect(normalizeUnit("")).toBeNull();
  });
});

describe("parseQuantityUnit", () => {
  it("parses number + unit", () => {
    const result = parseQuantityUnit("236ml");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(236);
    expect(result!.unit).toBe("ml");
    expect(result!.category).toBe("volume");
  });

  it("parses number + space + unit", () => {
    const result = parseQuantityUnit("1.5 kg");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(1.5);
    expect(result!.unit).toBe("kg");
  });

  it("converts ounces to grams", () => {
    const result = parseQuantityUnit("8oz");
    expect(result).not.toBeNull();
    expect(result!.unit).toBe("g");
    expect(result!.quantity).toBeCloseTo(226.796, 2);
  });

  it("returns null for invalid input", () => {
    expect(parseQuantityUnit("")).toBeNull();
    expect(parseQuantityUnit("hello")).toBeNull();
    expect(parseQuantityUnit("0ml")).toBeNull();
  });
});

describe("parsePackStructure", () => {
  it("parses '6 x 236ml'", () => {
    const result = parsePackStructure("6 x 236ml");
    expect(result).not.toBeNull();
    expect(result!.packCount).toBe(6);
    expect(result!.perUnitQuantity).toBe(236);
    expect(result!.perUnitUnit).toBe("ml");
    expect(result!.totalQuantity).toBe(1416);
  });

  it("parses '2 x 50g'", () => {
    const result = parsePackStructure("2 x 50g");
    expect(result).not.toBeNull();
    expect(result!.packCount).toBe(2);
    expect(result!.perUnitQuantity).toBe(50);
    expect(result!.perUnitUnit).toBe("g");
    expect(result!.totalQuantity).toBe(100);
  });

  it("parses '12 x 100ml'", () => {
    const result = parsePackStructure("12 x 100ml");
    expect(result).not.toBeNull();
    expect(result!.packCount).toBe(12);
    expect(result!.totalQuantity).toBe(1200);
  });

  it("returns null for non-pack strings", () => {
    expect(parsePackStructure("236ml")).toBeNull();
    expect(parsePackStructure("")).toBeNull();
    expect(parsePackStructure("hello")).toBeNull();
  });
});

describe("extractQuantityFromName", () => {
  it("extracts quantity from product name", () => {
    const result = extractQuantityFromName("Gentle Skin Cleanser 236ml");
    expect(result.nameWithoutQuantity).toBe("Gentle Skin Cleanser");
    expect(result.quantity).toBe(236);
    expect(result.unit).toBe("ml");
  });

  it("extracts pack structure from name", () => {
    const result = extractQuantityFromName("Face Cream 6 x 50ml");
    expect(result.packStructure).not.toBeNull();
    expect(result.packStructure!.packCount).toBe(6);
  });

  it("returns original name if no quantity found", () => {
    const result = extractQuantityFromName("Some Product Name");
    expect(result.nameWithoutQuantity).toBe("Some Product Name");
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
  });
});

describe("convertMass", () => {
  it("converts grams to milligrams", () => {
    expect(convertMass(1, "g", "mg")).toBe(1000);
  });

  it("converts kilograms to grams", () => {
    expect(convertMass(1, "kg", "g")).toBe(1000);
  });

  it("returns null for unknown units", () => {
    expect(convertMass(1, "xyz", "g")).toBeNull();
  });
});

describe("convertVolume", () => {
  it("converts liters to milliliters", () => {
    expect(convertVolume(1, "l", "ml")).toBe(1000);
  });

  it("returns null for unknown units", () => {
    expect(convertVolume(1, "xyz", "ml")).toBeNull();
  });
});
