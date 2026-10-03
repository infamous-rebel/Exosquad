import { describe, it, expect } from "vitest";
import { normalizePhone, isPhoneEquivalent } from "../../src/phone.js";

describe("normalizePhone", () => {
  it("extracts digits from formatted number", () => {
    const r = normalizePhone("+1 (555) 123-4567");
    expect(r.isValid).toBe(true);
  });

  it("returns E.164 for known country", () => {
    const r = normalizePhone("01712345678", "BD");
    expect(r.e164).toBeTruthy();
    expect(r.countryCode).toBe("BD");
  });

  it("handles empty input", () => {
    const r = normalizePhone("");
    expect(r.isValid).toBe(false);
  });

  it("handles too-short numbers", () => {
    const r = normalizePhone("12");
    expect(r.isValid).toBe(false);
  });
});

describe("isPhoneEquivalent", () => {
  it("matches identical E.164 numbers", () => {
    expect(isPhoneEquivalent("+8801712345678", "+8801712345678")).toBe(true);
  });

  it("matches numbers with different formatting", () => {
    expect(isPhoneEquivalent("+880-171-234-5678", "+8801712345678")).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(isPhoneEquivalent("+8801712345678", "+8801712345679")).toBe(false);
  });

  it("matches with country context", () => {
    expect(isPhoneEquivalent("01712345678", "1712345678", "BD")).toBe(true);
  });
});
