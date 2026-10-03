// =============================================================================
// @exosquad/normalization — Text normalization
// =============================================================================
// Deterministic text normalization for product names, brand names, etc.
// Preserves original strings; produces normalized search representations.
// =============================================================================

/**
 * Full text normalization pipeline.
 * Applies Unicode NFC, whitespace, punctuation, and optional lowercasing.
 */
export function normalizeText(input: string, options?: { lowercase?: boolean }): string {
  if (!input) return "";

  let result = input;

  // 1. Unicode NFC normalization (compose characters)
  result = result.normalize("NFC");

  // 2. Replace common Unicode punctuation with ASCII equivalents
  result = normalizePunctuation(result);

  // 3. Collapse whitespace (spaces, tabs, non-breaking spaces, etc.)
  result = collapseWhitespace(result);

  // 4. Trim leading/trailing whitespace
  result = result.trim();

  // 5. Optional lowercasing
  if (options?.lowercase) {
    result = result.toLowerCase();
  }

  return result;
}

/**
 * Normalize Unicode punctuation to ASCII equivalents.
 * Handles smart quotes, em/en dashes, ellipsis, etc.
 */
export function normalizePunctuation(input: string): string {
  if (!input) return "";

  let result = input;

  // Smart quotes → straight quotes
  result = result.replace(/[\u2018\u2019\u201A\u201B]/g, "'");  // single quotes
  result = result.replace(/[\u201C\u201D\u201E\u201F]/g, '"');  // double quotes

  // Dashes → hyphen-minus
  result = result.replace(/[\u2013\u2014\u2015\u2010\u2011]/g, "-");

  // Ellipsis
  result = result.replace(/\u2026/g, "...");

  // Non-breaking space → regular space
  result = result.replace(/\u00A0/g, " ");

  // Zero-width characters (remove silently)
  result = result.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

  // Full-width ASCII variants (U+FF01-U+FF5E) → ASCII equivalents
  result = result.replace(/[\uFF01-\uFF5E]/g, (ch) => {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });

  return result;
}

/**
 * Collapse all whitespace sequences to a single space.
 * Handles tabs, newlines, non-breaking spaces, etc.
 */
export function collapseWhitespace(input: string): string {
  if (!input) return "";
  // Match any Unicode whitespace character sequence
  return input.replace(/[\s\u00A0\u2000-\u200B\u2028\u2029\u3000]+/g, " ");
}

/**
 * Normalize a brand name for comparison purposes.
 * Produces a deterministic lowercase, trimmed, punctuation-normalized form.
 */
export function normalizeBrandName(input: string): string {
  if (!input) return "";
  return normalizeText(input, { lowercase: true });
}

/**
 * Normalize a product name for comparison purposes.
 * Preserves casing but normalizes whitespace and punctuation.
 */
export function normalizeProductName(input: string): string {
  if (!input) return "";
  return normalizeText(input);
}

/**
 * Create a search key from text — lowercase, no punctuation, collapsed whitespace.
 * Used for fuzzy matching and deduplication.
 */
export function createSearchKey(input: string): string {
  if (!input) return "";
  let result = normalizeText(input, { lowercase: true });
  // Remove all punctuation except hyphens and spaces (meaningful in product names)
  result = result.replace(/[^\w\s-]/g, "");
  // Collapse any resulting whitespace
  result = collapseWhitespace(result).trim();
  return result;
}

/**
 * Check if two strings are equivalent after normalization.
 */
export function isTextEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  return createSearchKey(a) === createSearchKey(b);
}
