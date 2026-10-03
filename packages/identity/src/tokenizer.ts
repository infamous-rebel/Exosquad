// =============================================================================
// @exosquad/identity — Product tokenization
// =============================================================================
// Robust product token representation for identity resolution.
// Extracts brand, product core, variant, quantity, unit, and attributes
// from product name strings. Preserves all meaningful terms.
// =============================================================================

import {
  parseProductName,
  createSearchKey,
  normalizeText,
  type ParsedProduct,
} from "@exosquad/normalization";
import type { ProductToken } from "./types.js";

// ─── Attribute Detection Patterns ────────────────────────────────────────────

const ATTRIBUTE_PATTERNS: Array<{
  name: string;
  patterns: RegExp[];
}> = [
  {
    name: "spf",
    patterns: [/spf\s*(\d+)/i],
  },
  {
    name: "concentration",
    patterns: [/(\d+(?:\.\d+)?)\s*%/],
  },
  {
    name: "formulation",
    patterns: [
      /\b(cream|lotion|serum|gel|foam|oil|balm|spray|powder|stick|roll-on|wipe)\b/i,
      /\b(formulation|formula)\s*:\s*(\w+)/i,
    ],
  },
  {
    name: "skin_type",
    patterns: [
      /\b(sensitive|dry|oily|normal|combination)\s+skin\b/i,
      /\bfor\s+(sensitive|dry|oily|normal|combination)\s+skin\b/i,
    ],
  },
  {
    name: "target_area",
    patterns: [
      /\b(face|facial|body|hair|eye|lip|hand|foot)\b/i,
    ],
  },
  {
    name: "age_group",
    patterns: [
      /\b(kids|children|infant|baby|toddler|teen|adult|men|women)\b/i,
    ],
  },
  {
    name: "flavor",
    patterns: [
      /\b(vanilla|chocolate|strawberry|mint|lemon|orange|berry|unflavored|plain)\b/i,
      /\bflavored?\s*:\s*(\w+)/i,
    ],
  },
  {
    name: "scent",
    patterns: [
      /\b(fragrance[- ]free|unscented|scented|perfumed)\b/i,
      /\bscent\s*:\s*(\w+)/i,
    ],
  },
  {
    name: "key_ingredient",
    patterns: [
      /\b(retinol|niacinamide|hyaluronic\s+acid|vitamin\s+c|vitamin\s+e|salicylic\s+acid|glycolic\s+acid|tea\s+tree|aloe|ceramide|peptide|zinc|benzoyl\s+peroxide)\b/i,
    ],
  },
];

// ─── Variant Keywords ────────────────────────────────────────────────────────

const VARIANT_DESCRIPTOR_WORDS = new Set([
  "flavored", "flavoured", "scented", "fragranced", "unscented",
  "fragrance-free", "fragrance free",
  "gentle", "sensitive", "dry", "oily", "normal",
  "light", "mild", "strong", "intense", "extra",
  "plus", "pro", "max",
  "for", "with", "infused", "enriched",
  "retinol", "niacinamide", "vitamin", "hyaluronic",
  "sp f", "spf",
]);

/**
 * Create a product token from a raw product name string.
 * This is the primary entry point for tokenization.
 */
export function tokenizeProductName(input: string): ProductToken {
  if (!input || !input.trim()) {
    return emptyToken(input ?? "");
  }

  const originalName = input.trim();
  const parsed: ParsedProduct = parseProductName(originalName);
  const normalizedName = normalizeText(originalName);
  const searchKey = createSearchKey(originalName);

  // Extract brand tokens
  const brandTokens = parsed.brand
    ? parsed.brand.toLowerCase().split(/\s+/).filter(Boolean)
    : [];

  // Extract product core tokens
  const productTokens = parsed.productCore
    ? parsed.productCore.toLowerCase().split(/\s+/).filter(Boolean)
    : [];

  // Extract variant tokens
  const variantTokens = parsed.variant
    ? parsed.variant.toLowerCase().split(/\s+/).filter(Boolean)
    : [];

  // Extract pack structure
  const packCount = parsed.packStructure?.packCount ?? null;
  const perUnitQuantity = parsed.packStructure?.perUnitQuantity ?? parsed.netQuantity;
  const perUnitUnit = parsed.packStructure?.perUnitUnit ?? parsed.unit;

  // Detect attributes from the full name
  const attributes = detectAttributes(originalName);

  // Build the full token set (all meaningful tokens for fast comparison)
  const allTokens = new Set<string>();
  for (const t of brandTokens) allTokens.add(t);
  for (const t of productTokens) allTokens.add(t);
  for (const t of variantTokens) allTokens.add(t);
  for (const [, v] of Object.entries(attributes)) allTokens.add(v.toLowerCase());
  if (parsed.unit) allTokens.add(parsed.unit);

  return {
    originalName,
    normalizedName,
    searchKey,
    brandTokens,
    productTokens,
    variantTokens,
    quantity: parsed.netQuantity,
    unit: parsed.unit,
    packCount,
    perUnitQuantity,
    perUnitUnit,
    attributes,
    allTokens,
  };
}

/**
 * Create a product token from pre-parsed components (e.g., from database records).
 */
export function tokenizeFromComponents(input: {
  name: string;
  brandName?: string | null;
  variantName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  packCount?: number | null;
  perUnitQuantity?: number | null;
  perUnitUnit?: string | null;
}): ProductToken {
  const originalName = input.name.trim();
  const normalizedName = normalizeText(originalName);
  const searchKey = createSearchKey(originalName);

  const brandTokens = input.brandName
    ? input.brandName.toLowerCase().split(/\s+/).filter(Boolean)
    : [];

  // For product tokens, strip the brand from the name if present
  let productCore = originalName;
  if (input.brandName) {
    const brandLower = input.brandName.toLowerCase();
    const nameLower = originalName.toLowerCase();
    if (nameLower.startsWith(brandLower)) {
      productCore = originalName.slice(input.brandName.length).trim();
    }
  }
  const productTokens = productCore
    ? productCore.toLowerCase().split(/\s+/).filter(Boolean)
    : [];

  const variantTokens = input.variantName
    ? input.variantName.toLowerCase().split(/\s+/).filter(Boolean)
    : [];

  const attributes = detectAttributes(originalName);

  const allTokens = new Set<string>();
  for (const t of brandTokens) allTokens.add(t);
  for (const t of productTokens) allTokens.add(t);
  for (const t of variantTokens) allTokens.add(t);
  for (const [, v] of Object.entries(attributes)) allTokens.add(v.toLowerCase());
  if (input.unit) allTokens.add(input.unit);

  return {
    originalName,
    normalizedName,
    searchKey,
    brandTokens,
    productTokens,
    variantTokens,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    packCount: input.packCount ?? null,
    perUnitQuantity: input.perUnitQuantity ?? input.quantity ?? null,
    perUnitUnit: input.perUnitUnit ?? input.unit ?? null,
    attributes,
    allTokens,
  };
}

/**
 * Detect structured attributes from a product name string.
 */
function detectAttributes(name: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (const { name: attrName, patterns } of ATTRIBUTE_PATTERNS) {
    for (const pattern of patterns) {
      const match = name.match(pattern);
      if (match && match[1] !== undefined) {
        // Use the first match for each attribute
        if (!(attrName in attrs)) {
          attrs[attrName] = match[1].trim();
        }
      }
    }
  }

  return attrs;
}

/**
 * Create an empty token for invalid/empty input.
 */
function emptyToken(original: string): ProductToken {
  return {
    originalName: original,
    normalizedName: "",
    searchKey: "",
    brandTokens: [],
    productTokens: [],
    variantTokens: [],
    quantity: null,
    unit: null,
    packCount: null,
    perUnitQuantity: null,
    perUnitUnit: null,
    attributes: {},
    allTokens: new Set(),
  };
}

/**
 * Check if a token looks like it has meaningful variant descriptors
 * that should not be discarded.
 */
export function hasSignificantVariant(token: ProductToken): boolean {
  if (token.variantTokens.length > 0) return true;
  for (const word of token.productTokens) {
    if (VARIANT_DESCRIPTOR_WORDS.has(word)) return true;
  }
  if (Object.keys(token.attributes).length > 0) return true;
  return false;
}

/**
 * Get a canonical blocking key for a product token.
 * Used for candidate generation (indexing).
 */
export function getBlockingKey(token: ProductToken): string {
  const parts: string[] = [];

  // Brand (first 2 brand tokens normalized)
  if (token.brandTokens.length > 0) {
    parts.push("b:" + token.brandTokens.slice(0, 2).sort().join("_"));
  }

  // Core product terms (first 3 significant tokens, sorted)
  const coreTerms = token.productTokens
    .filter((t) => t.length > 2) // skip tiny words
    .slice(0, 3)
    .sort();
  if (coreTerms.length > 0) {
    parts.push("p:" + coreTerms.join("_"));
  }

  return parts.join("|");
}
