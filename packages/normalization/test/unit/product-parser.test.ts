import { describe, it, expect } from "vitest";
import {
  parseProductName,
  parseProductRecord,
} from "../../src/product-parser.js";

describe("parseProductName", () => {
  it("parses 'Cetaphil Gentle Skin Cleanser 236ml'", () => {
    const result = parseProductName("Cetaphil Gentle Skin Cleanser 236ml");
    expect(result.originalName).toBe("Cetaphil Gentle Skin Cleanser 236ml");
    expect(result.brand).toBe("Cetaphil");
    expect(result.productCore).toBeTruthy();
    expect(result.netQuantity).toBe(236);
    expect(result.unit).toBe("ml");
  });

  it("parses 'NIVEA Soft Light Moisturiser 100ml'", () => {
    const result = parseProductName("NIVEA Soft Light Moisturiser 100ml");
    expect(result.brand).toBe("NIVEA");
    expect(result.netQuantity).toBe(100);
    expect(result.unit).toBe("ml");
  });

  it("parses product with pack structure", () => {
    const result = parseProductName("Himalaya Face Wash 6 x 50ml");
    expect(result.brand).toBe("Himalaya");
    expect(result.packStructure).not.toBeNull();
    expect(result.packStructure!.packCount).toBe(6);
  });

  it("handles product without brand", () => {
    const result = parseProductName("Organic Face Cream 50g");
    expect(result.netQuantity).toBe(50);
    expect(result.unit).toBe("g");
  });

  it("handles product without quantity", () => {
    const result = parseProductName("Cetaphil Daily Facial Cleanser");
    expect(result.brand).toBe("Cetaphil");
    expect(result.netQuantity).toBeNull();
    expect(result.unit).toBeNull();
  });

  it("preserves original name", () => {
    const result = parseProductName("  Cetaphil   Gentle   Cleanser  236ml  ");
    expect(result.originalName).toBe("Cetaphil   Gentle   Cleanser  236ml");
  });

  it("handles empty input", () => {
    const result = parseProductName("");
    expect(result.originalName).toBe("");
    expect(result.brand).toBeNull();
    expect(result.productCore).toBe("");
  });

  it("handles null/undefined gracefully", () => {
    const result = parseProductName(null as unknown as string);
    expect(result.originalName).toBe("");
  });

  it("extracts variant after dash", () => {
    const result = parseProductName("Cetaphil Gentle Cleanser - Sensitive Skin 236ml");
    expect(result.brand).toBe("Cetaphil");
    expect(result.variant).toBe("Sensitive Skin");
  });
});

describe("parseProductRecord", () => {
  it("extracts name from 'name' field", () => {
    const result = parseProductRecord({ name: "Cetaphil Cleanser 236ml" });
    expect(result.brand).toBe("Cetaphil");
    expect(result.netQuantity).toBe(236);
  });

  it("extracts name from 'title' field", () => {
    const result = parseProductRecord({ title: "NIVEA Soft 100ml" });
    expect(result.brand).toBe("NIVEA");
    expect(result.netQuantity).toBe(100);
  });

  it("extracts name from 'productName' field", () => {
    const result = parseProductRecord({ productName: "Himalaya Face Wash 50ml" });
    expect(result.brand).toBe("Himalaya");
  });

  it("handles empty record", () => {
    const result = parseProductRecord({});
    expect(result.originalName).toBe("");
    expect(result.brand).toBeNull();
  });
});
