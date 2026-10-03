import { describe, it, expect } from "vitest";
import {
  normalizeCurrencyCode,
  parsePriceString,
  normalizeCurrencyAmount,
  isValidCurrencyCode,
} from "../../src/currency.js";

describe("normalizeCurrencyCode", () => {
  it("normalizes ISO codes case-insensitively", () => {
    expect(normalizeCurrencyCode("usd")).toBe("USD");
    expect(normalizeCurrencyCode("EUR")).toBe("EUR");
    expect(normalizeCurrencyCode("bdt")).toBe("BDT");
  });

  it("normalizes currency symbols", () => {
    expect(normalizeCurrencyCode("$")).toBe("USD");
    expect(normalizeCurrencyCode("€")).toBe("EUR");
    expect(normalizeCurrencyCode("£")).toBe("GBP");
    expect(normalizeCurrencyCode("৳")).toBe("BDT");
  });

  it("normalizes currency names", () => {
    expect(normalizeCurrencyCode("dollar")).toBe("USD");
    expect(normalizeCurrencyCode("euro")).toBe("EUR");
    expect(normalizeCurrencyCode("taka")).toBe("BDT");
    expect(normalizeCurrencyCode("pound")).toBe("GBP");
  });

  it("returns null for unknown currencies", () => {
    expect(normalizeCurrencyCode("XYZ")).toBeNull();
    expect(normalizeCurrencyCode("")).toBeNull();
    expect(normalizeCurrencyCode("fake")).toBeNull();
  });
});

describe("parsePriceString", () => {
  it("parses symbol + amount", () => {
    const result = parsePriceString("$12.99");
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(12.99);
    expect(result!.currency).toBe("USD");
  });

  it("parses amount + currency code", () => {
    const result = parsePriceString("500 BDT");
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(500);
    expect(result!.currency).toBe("BDT");
  });

  it("parses code + amount", () => {
    const result = parsePriceString("USD 12.99");
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(12.99);
    expect(result!.currency).toBe("USD");
  });

  it("handles comma-separated thousands", () => {
    const result = parsePriceString("$1,234.56");
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(1234.56);
  });

  it("returns null for unparseable strings", () => {
    expect(parsePriceString("")).toBeNull();
    expect(parsePriceString("free")).toBeNull();
  });
});

describe("normalizeCurrencyAmount", () => {
  it("creates normalized currency without conversion", () => {
    const result = normalizeCurrencyAmount(100, "usd");
    expect(result.originalAmount).toBe(100);
    expect(result.originalCurrency).toBe("USD");
    expect(result.conversionStatus).toBe("not_attempted");
    expect(result.convertedAmount).toBeNull();
  });

  it("creates normalized currency with conversion", () => {
    const result = normalizeCurrencyAmount(100, "USD", {
      targetCurrency: "BDT",
      exchangeRate: 110.5,
      exchangeRateSource: "test",
    });
    expect(result.convertedAmount).toBe(11050);
    expect(result.conversionStatus).toBe("converted");
    expect(result.targetCurrency).toBe("BDT");
  });

  it("marks as unavailable when no rate exists", () => {
    const result = normalizeCurrencyAmount(100, "USD", {
      targetCurrency: "BDT",
    });
    expect(result.conversionStatus).toBe("unavailable");
    expect(result.convertedAmount).toBeNull();
  });
});

describe("isValidCurrencyCode", () => {
  it("returns true for valid codes", () => {
    expect(isValidCurrencyCode("USD")).toBe(true);
    expect(isValidCurrencyCode("BDT")).toBe(true);
    expect(isValidCurrencyCode("EUR")).toBe(true);
  });

  it("returns false for invalid codes", () => {
    expect(isValidCurrencyCode("XYZ")).toBe(false);
    expect(isValidCurrencyCode("")).toBe(false);
  });
});
