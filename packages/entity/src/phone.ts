// =============================================================================
// @exosquad/entity — Phone number normalization
// =============================================================================
// Normalizes international phone numbers.
// Supports E.164 representation where country is known.
// Does NOT invent country codes — marks unknown as unavailable.
// =============================================================================

import type { NormalizedPhone } from "./types.js";

// ─── Country Code Map (ISO 3166-1 alpha-2 → dialing code) ────────────────────
// Covers major countries relevant to EXOSQUAD's scope.

const COUNTRY_DIAL_CODES: Record<string, string> = {
  BD: "880", US: "1", GB: "44", CA: "1", AU: "61",
  IN: "91", PK: "92", CN: "86", HK: "852", SG: "65",
  MY: "60", TH: "66", ID: "62", PH: "63", VN: "84",
  JP: "81", KR: "82", TW: "886", NZ: "64",
  DE: "49", FR: "33", IT: "39", ES: "34", NL: "31",
  BE: "32", AT: "43", CH: "41", SE: "46", NO: "47",
  DK: "45", FI: "358", PL: "48", CZ: "420", HU: "36",
  RO: "40", BG: "359", GR: "30", PT: "351", IE: "353",
  RU: "7", UA: "380", TR: "90", SA: "966", AE: "971",
  QA: "974", KW: "965", BH: "973", OM: "968", JO: "962",
  LB: "961", IQ: "964", IR: "98", IL: "972", EG: "20",
  ZA: "27", NG: "234", KE: "254", GH: "233", TZ: "255",
  ET: "251", MA: "212", TN: "216", DZ: "213",
  BR: "55", AR: "54", CL: "56", CO: "57", MX: "52",
  PE: "51", VE: "58", EC: "593",
};

// Reverse map: dialing code → country code (first match for ambiguous codes)
const DIAL_TO_COUNTRY: Record<string, string> = {};
for (const [cc, dc] of Object.entries(COUNTRY_DIAL_CODES)) {
  if (!DIAL_TO_COUNTRY[dc]) {
    DIAL_TO_COUNTRY[dc] = cc;
  }
}

/**
 * Normalize a phone number.
 * If country is known, produces E.164 representation.
 * If country is unknown, retains raw phone and marks normalized as unavailable.
 */
export function normalizePhone(input: string, country?: string | null): NormalizedPhone {
  if (!input) {
    return {
      original: "",
      e164: null,
      countryCode: null,
      nationalNumber: null,
      isValid: false,
    };
  }

  const original = input.trim();

  // Strip all non-digit characters except leading +
  const digits = original.replace(/[^\d+]/g, "");

  if (digits.length < 4) {
    return {
      original,
      e164: null,
      countryCode: country ?? null,
      nationalNumber: null,
      isValid: false,
    };
  }

  // Determine country code
  const resolvedCountry = country ?? null;

  // Try to extract E.164 from the digits
  let e164: string | null = null;
  let nationalNumber: string | null = null;

  if (digits.startsWith("+")) {
    // International format — try to identify country code
    const withoutPlus = digits.slice(1);
    const ccInfo = identifyCountryCode(withoutPlus);
    if (ccInfo) {
      e164 = `+${withoutPlus}`;
      nationalNumber = ccInfo.national;
    } else {
      // Can't parse — store raw
      e164 = null;
      nationalNumber = withoutPlus;
    }
  } else if (resolvedCountry) {
    // We know the country — construct E.164
    const dialCode = COUNTRY_DIAL_CODES[resolvedCountry];
    if (dialCode) {
      // Strip leading 0 from national number
      const national = digits.replace(/^0+/, "");
      e164 = `+${dialCode}${national}`;
      nationalNumber = national;
    }
  }

  const isValid = e164 !== null && e164.length >= 8;

  return {
    original,
    e164,
    countryCode: resolvedCountry,
    nationalNumber,
    isValid,
  };
}

/**
 * Check if two phone numbers are equivalent after normalization.
 */
export function isPhoneEquivalent(a: string, b: string, country?: string | null): boolean {
  const phoneA = normalizePhone(a, country);
  const phoneB = normalizePhone(b, country);

  // If both have E.164, compare directly
  if (phoneA.e164 && phoneB.e164) {
    return phoneA.e164 === phoneB.e164;
  }

  // Fall back to digit comparison
  const digitsA = a.replace(/[^\d]/g, "");
  const digitsB = b.replace(/[^\d]/g, "");
  return digitsA.length >= 6 && digitsA === digitsB;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Try to identify country code and extract national number from international digits.
 */
function identifyCountryCode(digits: string): { country: string; national: string } | null {
  // Try 1-digit codes first (US, CA, RU), then 2-digit, then 3-digit
  for (const len of [1, 2, 3]) {
    const code = digits.slice(0, len);
    const country = DIAL_TO_COUNTRY[code];
    if (country) {
      return { country, national: digits.slice(len) };
    }
  }
  return null;
}
