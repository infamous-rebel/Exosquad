// =============================================================================
// @exosquad/entity — Company name normalization
// =============================================================================
// Deterministic normalization for business names.
// Handles legal suffixes, punctuation, Unicode, casing, whitespace.
// Preserves original; produces normalized and search-key representations.
// =============================================================================

import {
  normalizeText,
  collapseWhitespace,
} from "@exosquad/normalization";
import type { NormalizedCompanyName } from "./types.js";

// ─── Legal Suffixes ──────────────────────────────────────────────────────────
// Common legal/corporate suffixes that can be safely stripped for comparison.
// This list is intentionally conservative — we do NOT strip meaningful words.

const LEGAL_SUFFIXES = new Set([
  "ltd",
  "limited",
  "llc",
  "l.l.c",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "sarl",
  "fze",
  "fzco",
  "plc",
  "pvt",
  "pvt ltd",
  "private limited",
  "private ltd",
  "public limited",
  "ag",
  "sa",
  "s.a",
  "s.a.r.l",
  "bv",
  "nv",
  "pty",
  "pty ltd",
  "proprietory",
  "limited liability",
  "joint stock",
  "jsc",
  "llp",
  "l.l.p",
  "pllc",
  "pc",
  "pa",
  "professional corporation",
  "professional association",
  "establishment",
  "est",
  "trading as",
  "t/a",
  "d.b.a",
  "dba",
]);

// ─── Company Name Normalization ──────────────────────────────────────────────

/**
 * Normalize a company name for identity comparison.
 * Returns original, normalized, search key, detected suffix, and core name.
 */
export function normalizeCompanyName(input: string): NormalizedCompanyName {
  if (!input) {
    return {
      originalName: "",
      normalizedName: "",
      searchKey: "",
      legalSuffix: null,
      coreName: "",
    };
  }

  // Step 1: Basic text normalization (Unicode NFC, punctuation, whitespace)
  let normalized = normalizeText(input, { lowercase: true });

  // Step 2: Detect and strip legal suffix
  const { core, suffix } = stripLegalSuffix(normalized);

  // Step 3: Create search key (no punctuation, collapsed)
  const searchKey = createCompanySearchKey(core);

  // Step 4: Trim the normalized form
  normalized = collapseWhitespace(normalized).trim();

  return {
    originalName: input,
    normalizedName: normalized,
    searchKey,
    legalSuffix: suffix,
    coreName: core,
  };
}

/**
 * Create a search key from a company name.
 * Lowercase, no punctuation, no legal suffixes, collapsed whitespace.
 */
export function createCompanySearchKey(input: string): string {
  if (!input) return "";
  let result = normalizeText(input, { lowercase: true });
  const { core } = stripLegalSuffix(result);
  // Remove all punctuation except hyphens (meaningful in some names)
  result = core.replace(/[^\w\s-]/g, "");
  result = collapseWhitespace(result).trim();
  return result;
}

/**
 * Check if two company names are equivalent after normalization.
 */
export function isCompanyNameEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  return createCompanySearchKey(a) === createCompanySearchKey(b);
}

/**
 * Compute a simple name similarity score (0.0–1.0) between two company names.
 * Uses Jaccard similarity on token sets after normalization.
 */
export function companyNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;

  const keyA = createCompanySearchKey(a);
  const keyB = createCompanySearchKey(b);

  // Exact match after normalization
  if (keyA === keyB) return 1.0;

  // Token-level Jaccard similarity
  const tokensA = new Set(keyA.split(/\s+/).filter(Boolean));
  const tokensB = new Set(keyB.split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Strip known legal suffixes from a normalized (lowercased) name.
 * Returns the core name and the detected suffix (if any).
 */
function stripLegalSuffix(name: string): { core: string; suffix: string | null } {
  if (!name) return { core: "", suffix: null };

  // Work with the lowercased name
  const lower = name.toLowerCase().trim();

  // Try multi-word suffixes first (longest match)
  const suffixPatterns = [
    "private limited",
    "public limited",
    "limited liability",
    "professional corporation",
    "professional association",
    "joint stock",
    "pty ltd",
    "pvt ltd",
    "private ltd",
    "l.l.c",
    "l.l.p",
    "s.a.r.l",
    "s.a",
    "d.b.a",
    "t/a",
    "trading as",
  ];

  for (const suffix of suffixPatterns) {
    if (lower.endsWith(suffix)) {
      const core = lower.slice(0, lower.length - suffix.length).trim();
      // Remove trailing punctuation (commas, etc.)
      const cleanCore = core.replace(/[,.\s]+$/, "").trim();
      if (cleanCore.length > 0) {
        return { core: cleanCore, suffix };
      }
    }
  }

  // Try single-word suffixes
  const words = lower.split(/\s+/);
  if (words.length > 1) {
    const lastWord = words[words.length - 1]!;
    // Strip trailing punctuation from the last word for matching
    const cleanLast = lastWord.replace(/[.,;:!?]+$/, "");
    if (LEGAL_SUFFIXES.has(cleanLast)) {
      const core = words.slice(0, -1).join(" ");
      const cleanCore = core.replace(/[,.\s]+$/, "").trim();
      if (cleanCore.length > 0) {
        return { core: cleanCore, suffix: cleanLast };
      }
    }
  }

  return { core: lower, suffix: null };
}
