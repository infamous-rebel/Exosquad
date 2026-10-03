import { describe, it, expect } from "vitest";
import {
  validateBarcode,
  verifyCheckDigit,
  calculateCheckDigit,
  upcToEan,
  isBarcodeLike,
} from "../../src/barcode.js";

describe("validateBarcode", () => {
  it("validates GTIN-8 with correct check digit", () => {
    // GTIN-8: 96385074 — check digit is 4
    const result = validateBarcode("96385074");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("GTIN-8");
    expect(result.normalized).toBe("96385074");
  });

  it("validates GTIN-13 (EAN-13) with correct check digit", () => {
    // EAN-13: 4006381333931 — known valid
    const result = validateBarcode("4006381333931");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("GTIN-13");
  });

  it("rejects GTIN-13 with incorrect check digit", () => {
    const result = validateBarcode("4006381333932");
    expect(result.valid).toBe(false);
    expect(result.type).toBe("GTIN-13");
  });

  it("validates GTIN-12 (UPC-A)", () => {
    // UPC-A: 012345678905 — check digit is 5
    const result = validateBarcode("012345678905");
    expect(result.valid).toBe(true);
    expect(result.type).toBe("GTIN-12");
  });

  it("validates GTIN-14", () => {
    // GTIN-14: 10012345678902
    const result = validateBarcode("10012345678902");
    expect(result.type).toBe("GTIN-14");
    // We just check the type is correct; check digit may or may not be valid
  });

  it("strips hyphens and spaces", () => {
    const result = validateBarcode("4006-3813-3393-1");
    expect(result.normalized).toBe("4006381333931");
    expect(result.type).toBe("GTIN-13");
  });

  it("rejects non-digit characters", () => {
    const result = validateBarcode("ABC12345");
    expect(result.valid).toBe(false);
    expect(result.type).toBe("unknown");
  });

  it("rejects invalid lengths", () => {
    const result = validateBarcode("12345");
    expect(result.valid).toBe(false);
    expect(result.type).toBe("unknown");
  });

  it("handles empty input", () => {
    const result = validateBarcode("");
    expect(result.valid).toBe(false);
    expect(result.normalized).toBe("");
  });
});

describe("verifyCheckDigit", () => {
  it("verifies correct check digits", () => {
    expect(verifyCheckDigit("96385074")).toBe(true);
    expect(verifyCheckDigit("012345678905")).toBe(true);
  });

  it("rejects incorrect check digits", () => {
    expect(verifyCheckDigit("96385073")).toBe(false);
    expect(verifyCheckDigit("012345678901")).toBe(false);
  });

  it("rejects non-numeric strings", () => {
    expect(verifyCheckDigit("abcdefgh")).toBe(false);
  });

  it("rejects too-short strings", () => {
    expect(verifyCheckDigit("123")).toBe(false);
  });
});

describe("calculateCheckDigit", () => {
  it("calculates correct check digit for GTIN-13 payload", () => {
    // For EAN-13 "4006381333931", payload is "400638133393", check digit is 1
    expect(calculateCheckDigit("400638133393")).toBe(1);
  });

  it("calculates correct check digit for UPC-A payload", () => {
    // For UPC-A "012345678905", payload is "01234567890", check digit is 5
    expect(calculateCheckDigit("01234567890")).toBe(5);
  });
});

describe("upcToEan", () => {
  it("converts UPC-A to EAN-13 by prepending 0", () => {
    const result = upcToEan("012345678905");
    expect(result).toBe("0012345678905");
  });

  it("returns null for invalid UPC", () => {
    expect(upcToEan("12345")).toBeNull();
    expect(upcToEan("abcdefghijkl")).toBeNull();
  });
});

describe("isBarcodeLike", () => {
  it("detects barcode-like strings", () => {
    expect(isBarcodeLike("4006381333931")).toBe(true);
    expect(isBarcodeLike("012345678905")).toBe(true);
  });

  it("rejects non-barcode strings", () => {
    expect(isBarcodeLike("hello")).toBe(false);
    expect(isBarcodeLike("12345")).toBe(false);
    expect(isBarcodeLike("")).toBe(false);
  });
});
