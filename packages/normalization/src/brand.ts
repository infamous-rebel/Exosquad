// =============================================================================
// @exosquad/normalization — Brand resolution
// =============================================================================
// Deterministic brand matching infrastructure.
// Supports exact normalized match, known aliases, punctuation/casing differences.
// Does NOT merge potentially different brands — marks ambiguous instead.
// =============================================================================

import { normalizeBrandName, createSearchKey } from "./text.js";
import type { BrandResolution, DataQuality } from "./types.js";

// ─── Known Brand Alias Registry ─────────────────────────────────────────────
// Maps normalized brand names to their canonical form.
// This is a seed list — in production, brand aliases are stored in the database
// and loaded at runtime. This provides deterministic fallback resolution.

const KNOWN_BRAND_ALIASES: Map<string, string> = new Map();

// Common brand variations (seed data — extended by DB at runtime)
const SEED_ALIASES: Array<[string, string]> = [
  // Format: [alias, canonical]
  ["cetaphil", "Cetaphil"],
  ["cetaphil canada", "Cetaphil"],
  ["the body shop", "The Body Shop"],
  ["body shop", "The Body Shop"],
  ["mac cosmetics", "MAC"],
  ["m·a·c", "MAC"],
  ["m a c", "MAC"],
  ["estee lauder", "Estée Lauder"],
  ["esteelauder", "Estée Lauder"],
  ["la prairie", "La Prairie"],
  ["l'oreal", "L'Oréal"],
  ["loreal", "L'Oréal"],
  ["lore al", "L'Oréal"],
  ["maybelline new york", "Maybelline"],
  ["maybelline", "Maybelline"],
  ["revlon", "Revlon"],
  ["clinique", "Clinique"],
  ["neutrogena", "Neutrogena"],
  ["nivea", "NIVEA"],
  ["beiersdorf", "Beiersdorf"],
  ["unilever", "Unilever"],
  ["procter and gamble", "Procter & Gamble"],
  ["p&g", "Procter & Gamble"],
  ["pg", "Procter & Gamble"],
  ["johnson and johnson", "Johnson & Johnson"],
  ["j&j", "Johnson & Johnson"],
  ["jj", "Johnson & Johnson"],
  ["himalaya", "Himalaya"],
  ["himalaya herbals", "Himalaya"],
  ["patanjali", "Patanjali"],
  ["dabur", "Dabur"],
  ["emami", "Emami"],
  ["square toiletries", "Square"],
  ["square", "Square"],
  ["marico", "Marico"],
  ["gsk", "GSK"],
  ["glaxosmithkline", "GSK"],
  ["pfizer", "Pfizer"],
  ["bayer", "Bayer"],
  ["novartis", "Novartis"],
  ["roche", "Roche"],
  ["sanofi", "Sanofi"],
  ["abbott", "Abbott"],
  ["merck", "Merck"],
];

// Initialize the alias map
for (const [alias, canonical] of SEED_ALIASES) {
  KNOWN_BRAND_ALIASES.set(createSearchKey(alias), canonical);
}

/**
 * Resolve a brand name to its canonical form.
 * Uses known aliases, normalized matching, and search keys.
 *
 * If the brand cannot be resolved to a known entity, returns the normalized
 * form with quality="unresolved" — does NOT invent a match.
 */
export function resolveBrand(input: string): BrandResolution {
  if (!input || !input.trim()) {
    return {
      normalizedName: "",
      quality: "unresolved",
      original: input ?? "",
    };
  }

  const trimmed = input.trim();
  const normalized = normalizeBrandName(trimmed);
  const searchKey = createSearchKey(trimmed);

  // 1. Check known aliases
  const aliasMatch = KNOWN_BRAND_ALIASES.get(searchKey);
  if (aliasMatch) {
    return {
      normalizedName: aliasMatch,
      quality: "valid",
      original: trimmed,
    };
  }

  // 2. Check if the normalized form matches any known canonical name
  for (const [, canonical] of KNOWN_BRAND_ALIASES) {
    if (createSearchKey(canonical) === searchKey) {
      return {
        normalizedName: canonical,
        quality: "valid",
        original: trimmed,
      };
    }
  }

  // 3. No known match — return normalized form as unresolved
  // The brand is preserved but marked for later resolution (Phase 4 AI)
  return {
    normalizedName: normalized,
    quality: "unresolved" as DataQuality,
    original: trimmed,
  };
}

/**
 * Register a brand alias at runtime (e.g., from database records).
 * This extends the in-memory alias map for the current process lifetime.
 */
export function registerBrandAlias(alias: string, canonicalName: string): void {
  const key = createSearchKey(alias);
  KNOWN_BRAND_ALIASES.set(key, canonicalName);
}

/**
 * Register multiple brand aliases from a database-style list.
 */
export function registerBrandAliases(aliases: Array<{ alias: string; canonical: string }>): void {
  for (const { alias, canonical } of aliases) {
    registerBrandAlias(alias, canonical);
  }
}

/**
 * Check if a brand name is known (has an alias entry).
 */
export function isKnownBrand(input: string): boolean {
  if (!input) return false;
  const searchKey = createSearchKey(input);
  if (KNOWN_BRAND_ALIASES.has(searchKey)) return true;
  // Check if it matches any canonical name
  for (const [, canonical] of KNOWN_BRAND_ALIASES) {
    if (createSearchKey(canonical) === searchKey) return true;
  }
  return false;
}

/**
 * Get the canonical name for a known brand, or null if unknown.
 */
export function getCanonicalBrand(input: string): string | null {
  if (!input) return null;
  const searchKey = createSearchKey(input);
  const alias = KNOWN_BRAND_ALIASES.get(searchKey);
  if (alias) return alias;
  for (const [, canonical] of KNOWN_BRAND_ALIASES) {
    if (createSearchKey(canonical) === searchKey) return canonical;
  }
  return null;
}
