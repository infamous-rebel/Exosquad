// =============================================================================
// @exosquad/entity — Email normalization
// =============================================================================
// Normalizes email addresses for comparison.
// Distinguishes corporate from free-provider emails.
// =============================================================================

import { normalizeDomain, isCorporateDomain } from "./domain.js";
import type { NormalizedEmail } from "./types.js";

/**
 * Normalize an email address for comparison.
 * Lowercases, strips dots from Gmail local parts, identifies corporate vs free.
 */
export function normalizeEmail(input: string): NormalizedEmail {
  if (!input) {
    return {
      original: "",
      normalized: "",
      localPart: "",
      domain: "",
      isCorporate: false,
    };
  }

  const original = input.trim();
  const atIndex = original.lastIndexOf("@");
  if (atIndex < 0) {
    return {
      original,
      normalized: original.toLowerCase(),
      localPart: original.toLowerCase(),
      domain: "",
      isCorporate: false,
    };
  }

  const localPart = original.slice(0, atIndex).toLowerCase();
  const domainRaw = original.slice(atIndex + 1);
  const domainNorm = normalizeDomain(domainRaw);
  const domain = domainNorm.registrableDomain || domainNorm.hostname;

  // Gmail-specific normalization: strip dots and +tags
  let normalizedLocal = localPart;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Remove +tag suffix
    normalizedLocal = normalizedLocal.split("+")[0]!;
    // Remove dots (Gmail ignores them)
    normalizedLocal = normalizedLocal.replace(/\./g, "");
  }

  const normalized = `${normalizedLocal}@${domain}`;
  const isCorporate = isCorporateDomain(domain);

  return {
    original,
    normalized,
    localPart: normalizedLocal,
    domain,
    isCorporate,
  };
}

/**
 * Check if two emails are equivalent after normalization.
 */
export function isEmailEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeEmail(a).normalized === normalizeEmail(b).normalized;
}

/**
 * Check if two emails share the same domain.
 */
export function isEmailDomainMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const emailA = normalizeEmail(a);
  const emailB = normalizeEmail(b);
  return emailA.domain === emailB.domain && emailA.domain !== "";
}
