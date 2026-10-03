// =============================================================================
// @exosquad/normalization — Barcode / GTIN validation
// =============================================================================
// Validates GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN-13), GTIN-14 check digits.
// Deterministic — no AI involved.
// =============================================================================

import type { BarcodeValidation } from "./types.js";

/**
 * Validate and normalize a barcode/GTIN string.
 * Checks format, length, and check digit.
 */
export function validateBarcode(input: string): BarcodeValidation {
  if (!input) {
    return { valid: false, type: "unknown", normalized: "", original: "" };
  }

  // Strip common formatting characters (spaces, hyphens)
  const cleaned = input.replace(/[\s-]/g, "");

  // Must be all digits
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, type: "unknown", normalized: cleaned, original: input };
  }

  const len = cleaned.length;

  // GTIN-8
  if (len === 8) {
    const valid = verifyCheckDigit(cleaned);
    return {
      valid,
      type: "GTIN-8",
      normalized: cleaned,
      original: input,
    };
  }

  // GTIN-12 (UPC-A)
  if (len === 12) {
    const valid = verifyCheckDigit(cleaned);
    return {
      valid,
      type: "GTIN-12",
      normalized: cleaned,
      original: input,
    };
  }

  // GTIN-13 (EAN-13)
  if (len === 13) {
    const valid = verifyCheckDigit(cleaned);
    return {
      valid,
      type: "GTIN-13",
      normalized: cleaned,
      original: input,
    };
  }

  // GTIN-14
  if (len === 14) {
    const valid = verifyCheckDigit(cleaned);
    return {
      valid,
      type: "GTIN-14",
      normalized: cleaned,
      original: input,
    };
  }

  // Unknown length — not a valid GTIN
  return {
    valid: false,
    type: "unknown",
    normalized: cleaned,
    original: input,
  };
}

/**
 * Verify the check digit of a GTIN using the standard modulo-10 algorithm.
 * Works for GTIN-8, GTIN-12, GTIN-13, and GTIN-14.
 *
 * Algorithm:
 * 1. From right to left (excluding check digit), multiply alternating digits by 3 and 1
 * 2. Sum all products
 * 3. Check digit = (10 - (sum mod 10)) mod 10
 */
export function verifyCheckDigit(digits: string): boolean {
  if (digits.length < 8 || !/^\d+$/.test(digits)) return false;

  const nums = digits.split("").map(Number);
  const checkDigit = nums[nums.length - 1];
  const payload = nums.slice(0, -1);

  let sum = 0;
  // Process from right to left of the payload
  for (let i = payload.length - 1; i >= 0; i--) {
    const posFromRight = payload.length - 1 - i;
    if (posFromRight % 2 === 0) {
      sum += payload[i]! * 3;
    } else {
      sum += payload[i]! * 1;
    }
  }

  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
}

/**
 * Calculate the check digit for a GTIN payload (without the check digit).
 */
export function calculateCheckDigit(payload: string): number {
  if (!/^\d+$/.test(payload)) return -1;

  const nums = payload.split("").map(Number);
  let sum = 0;

  for (let i = nums.length - 1; i >= 0; i--) {
    const posFromRight = nums.length - 1 - i;
    if (posFromRight % 2 === 0) {
      sum += nums[i]! * 3;
    } else {
      sum += nums[i]! * 1;
    }
  }

  return (10 - (sum % 10)) % 10;
}

/**
 * Normalize a GTIN-12 (UPC-A) to GTIN-13 by prepending a leading zero.
 */
export function upcToEan(upc: string): string | null {
  const cleaned = upc.replace(/[\s-]/g, "");
  if (cleaned.length !== 12 || !/^\d+$/.test(cleaned)) return null;
  if (!verifyCheckDigit(cleaned)) return null;
  return "0" + cleaned;
}

/**
 * Check if a string looks like a barcode (pure digits, reasonable length).
 */
export function isBarcodeLike(input: string): boolean {
  if (!input) return false;
  const cleaned = input.replace(/[\s-]/g, "");
  return /^\d{8,14}$/.test(cleaned);
}
