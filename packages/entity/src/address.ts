// =============================================================================
// @exosquad/entity — Address normalization
// =============================================================================
// Normalizes addresses sufficiently for matching.
// Preserves original; produces comparison-friendly representation.
// Address similarity is supporting evidence only — never proof of identity.
// =============================================================================

import { normalizeText, collapseWhitespace } from "@exosquad/normalization";
import type { NormalizedAddress } from "./types.js";

/**
 * Normalize an address for comparison.
 * Parses components where possible; produces a comparison key.
 */
export function normalizeAddress(
  input: string,
  options?: { country?: string | null }
): NormalizedAddress {
  if (!input) {
    return {
      original: "",
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: options?.country ?? null,
      normalizedForComparison: "",
    };
  }

  const original = input.trim();

  // Simple heuristic parsing — split by commas
  const parts = original.split(",").map((p) => p.trim()).filter(Boolean);

  let street: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let postalCode: string | null = null;
  const country = options?.country ?? null;

  if (parts.length >= 1) street = parts[0]!;
  if (parts.length >= 2) city = parts[1]!;
  if (parts.length >= 3) state = parts[2]!;
  if (parts.length >= 4) postalCode = extractPostalCode(parts[3]!) ?? parts[3]!;

  // Try to extract postal code from any part
  if (!postalCode) {
    for (const part of parts) {
      const pc = extractPostalCode(part);
      if (pc) {
        postalCode = pc;
        break;
      }
    }
  }

  // Build comparison key: lowercase, no punctuation, sorted components
  const comparisonParts = [street, city, state, postalCode, country]
    .filter((p): p is string => !!p)
    .map((p) => normalizeText(p, { lowercase: true }).replace(/[^\w\s]/g, ""))
    .map((p) => collapseWhitespace(p).trim())
    .filter(Boolean);

  const normalizedForComparison = comparisonParts.join(" ");

  return {
    original,
    street,
    city,
    state,
    postalCode,
    country,
    normalizedForComparison,
  };
}

/**
 * Compute address similarity score (0.0–1.0).
 * Uses token overlap on normalized comparison strings.
 */
export function addressSimilarity(a: string, b: string, country?: string | null): number {
  const addrA = normalizeAddress(a, { country });
  const addrB = normalizeAddress(b, { country });

  if (!addrA.normalizedForComparison || !addrB.normalizedForComparison) return 0;

  if (addrA.normalizedForComparison === addrB.normalizedForComparison) return 1.0;

  const tokensA = new Set(addrA.normalizedForComparison.split(/\s+/).filter(Boolean));
  const tokensB = new Set(addrB.normalizedForComparison.split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Try to extract a postal code from a string.
 * Returns the postal code if found, null otherwise.
 */
function extractPostalCode(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Common postal code patterns
  // US ZIP: 12345 or 12345-6789
  if (/^\d{5}(-\d{4})?$/.test(trimmed)) return trimmed;
  // UK: alphanumeric
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(trimmed)) return trimmed.replace(/\s+/g, " ");
  // General: 4-10 alphanumeric
  if (/^[A-Z0-9]{4,10}$/i.test(trimmed)) return trimmed.toUpperCase();

  return null;
}
