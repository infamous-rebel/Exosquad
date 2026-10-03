// =============================================================================
// @exosquad/normalization — Product name parsing
// =============================================================================
// Deterministic extraction of brand, product core, variant, and quantity
// from product name strings. Preserves original values.
// =============================================================================

import { normalizeText } from "./text.js";
import { resolveBrand } from "./brand.js";
import { extractQuantityFromName } from "./units.js";
import type { ParsedProduct } from "./types.js";

// ─── Variant Keywords ───────────────────────────────────────────────────────
// Common variant descriptors that appear after the product core name.

const VARIANT_KEYWORDS = new Set([
  "flavor", "flavour", "scent", "fragrance", "aroma",
  "variant", "type", "formula", "formulation",
  "for", "with", "infused", "enriched",
]);

const VARIANT_SUFFIXES = [
  "flavored", "flavoured", "scented",
  "free", "plus", "pro", "max", "extra",
  "light", "mild", "strong", "intense",
  "gentle", "sensitive", "dry", "oily", "normal",
  "skin", "hair", "body", "face", "eye",
];

/**
 * Parse a product name string into its canonical components.
 * Extracts brand, product core, variant, quantity, and unit.
 *
 * Examples:
 * - "Cetaphil Gentle Skin Cleanser 236ml" →
 *   { brand: "Cetaphil", productCore: "Gentle Skin Cleanser", netQuantity: 236, unit: "ml" }
 * - "NIVEA Soft Light Moisturiser 100ml" →
 *   { brand: "NIVEA", productCore: "Soft Light Moisturiser", netQuantity: 100, unit: "ml" }
 */
export function parseProductName(input: string): ParsedProduct {
  if (!input || !input.trim()) {
    return {
      originalName: input ?? "",
      normalizedName: "",
      brand: null,
      productCore: "",
      variant: null,
      netQuantity: null,
      unit: null,
      packStructure: null,
    };
  }

  const originalName = input.trim();
  const normalizedName = normalizeText(originalName);

  // Step 1: Extract quantity/pack from the end of the name
  const { nameWithoutQuantity, quantity, unit, packStructure } = extractQuantityFromName(normalizedName);

  // Step 2: Try to extract brand from the beginning
  const { brand, productCore, variant } = extractBrandAndCore(nameWithoutQuantity);

  return {
    originalName,
    normalizedName,
    brand,
    productCore,
    variant,
    netQuantity: quantity,
    unit,
    packStructure,
  };
}

/**
 * Extract brand, product core, and variant from a name (without quantity).
 */
function extractBrandAndCore(name: string): {
  brand: string | null;
  productCore: string;
  variant: string | null;
} {
  if (!name) return { brand: null, productCore: "", variant: null };

  const words = name.split(/\s+/);
  if (words.length === 0) return { brand: null, productCore: name, variant: null };

  // Strategy 1: Try matching the first word(s) against known brands
  // Try up to 3 words as potential brand name
  for (let brandLen = Math.min(3, words.length); brandLen >= 1; brandLen--) {
    const candidate = words.slice(0, brandLen).join(" ");
    const resolution = resolveBrand(candidate);

    if (resolution.quality === "valid") {
      const remaining = words.slice(brandLen).join(" ");
      const { core, variant } = splitCoreAndVariant(remaining);
      return { brand: resolution.normalizedName, productCore: core, variant };
    }
  }

  // Strategy 2: If first word is capitalized and not a common word, treat as brand
  const firstWord = words[0] ?? "";
  if (isLikelyBrand(firstWord) && words.length > 1) {
    const remaining = words.slice(1).join(" ");
    const { core, variant } = splitCoreAndVariant(remaining);
    return { brand: firstWord, productCore: core, variant };
  }

  // Strategy 3: No brand detected — entire name is the product core
  const { core, variant } = splitCoreAndVariant(name);
  return { brand: null, productCore: core, variant };
}

/**
 * Split a product name remainder into core product name and variant descriptor.
 */
function splitCoreAndVariant(name: string): { core: string; variant: string | null } {
  if (!name) return { core: "", variant: null };

  const trimmed = name.trim();
  if (!trimmed) return { core: "", variant: null };

  // Look for variant indicators:
  // "Product Name - Variant", "Product Name, Variant", "Product Name (Variant)"
  const dashMatch = trimmed.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch && dashMatch[1] !== undefined && dashMatch[2] !== undefined) {
    return { core: dashMatch[1].trim(), variant: dashMatch[2].trim() };
  }

  const parenMatch = trimmed.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (parenMatch && parenMatch[1] !== undefined && parenMatch[2] !== undefined) {
    return { core: parenMatch[1].trim(), variant: parenMatch[2].trim() };
  }

  // Look for variant keywords
  const lower = trimmed.toLowerCase();
  for (const keyword of VARIANT_KEYWORDS) {
    const idx = lower.indexOf(` ${keyword} `);
    if (idx > 0) {
      return {
        core: trimmed.slice(0, idx).trim(),
        variant: trimmed.slice(idx).trim(),
      };
    }
  }

  // Look for variant suffixes at the end
  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    const lastWord = (words[words.length - 1] ?? "").toLowerCase();
    if (VARIANT_SUFFIXES.includes(lastWord)) {
      return {
        core: words.slice(0, -1).join(" "),
        variant: words[words.length - 1] ?? null,
      };
    }
  }

  return { core: trimmed, variant: null };
}

/**
 * Heuristic: check if a word looks like a brand name.
 * Brands tend to be capitalized, short, and not common English words.
 */
function isLikelyBrand(word: string): boolean {
  if (!word) return false;

  // Must start with uppercase
  if (!word || word[0] !== word[0]?.toUpperCase()) return false;

  // Common non-brand words that start with uppercase (beginning of sentence)
  const COMMON_WORDS = new Set([
    "The", "A", "An", "New", "Ultra", "Super", "Premium", "Organic",
    "Natural", "Fresh", "Pure", "Soft", "Gentle", "Light", "Deep",
    "Daily", "Weekly", "Intensive", "Advanced", "Professional",
    "Original", "Classic", "Modern", "Classic", "Best", "Top",
    "For", "With", "And", "Of", "In", "On", "By", "From",
  ]);

  if (COMMON_WORDS.has(word)) return false;

  // Short words (1-3 chars) are unlikely brands unless all caps
  if (word.length <= 3 && word !== word.toUpperCase()) return false;

  return true;
}

/**
 * Parse a full product record from a source, extracting all normalizable fields.
 * This is the main entry point for product normalization from mapped source data.
 */
export function parseProductRecord(record: Record<string, unknown>): ParsedProduct {
  // Try common field names for the product name
  const nameFields = ["name", "title", "productName", "product_name", "productTitle"];
  let rawName = "";
  for (const field of nameFields) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      rawName = value.trim();
      break;
    }
  }

  return parseProductName(rawName);
}
