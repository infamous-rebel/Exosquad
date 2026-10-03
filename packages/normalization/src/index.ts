// =============================================================================
// @exosquad/normalization — Public API
// =============================================================================
// Re-exports all normalization modules. Single entry point for the package.
// =============================================================================

// Types
export type {
  DataQuality,
  UnitCategory,
  MassUnit,
  VolumeUnit,
  CountUnit,
  UnitOfMeasure,
  PackStructure,
  NormalizedCurrency,
  NormalizedCountry,
  BarcodeValidation,
  BrandResolution,
  ParsedProduct,
  NormalizationResult,
} from "./types.js";

// Text normalization
export {
  normalizeText,
  normalizePunctuation,
  collapseWhitespace,
  normalizeBrandName,
  normalizeProductName,
  createSearchKey,
  isTextEquivalent,
} from "./text.js";

// Unit normalization
export {
  normalizeUnit,
  parseQuantityUnit,
  parsePackStructure,
  extractQuantityFromName,
  convertMass,
  convertVolume,
} from "./units.js";

// Currency normalization
export {
  normalizeCurrencyCode,
  parsePriceString,
  normalizeCurrencyAmount,
  isValidCurrencyCode,
} from "./currency.js";

// Country normalization
export {
  normalizeCountry,
  isValidCountryCode,
  getCountryAlpha2,
} from "./country.js";

// Barcode/GTIN validation
export {
  validateBarcode,
  verifyCheckDigit,
  calculateCheckDigit,
  upcToEan,
  isBarcodeLike,
} from "./barcode.js";

// Brand resolution
export {
  resolveBrand,
  registerBrandAlias,
  registerBrandAliases,
  isKnownBrand,
  getCanonicalBrand,
} from "./brand.js";

// Product name parsing
export {
  parseProductName,
  parseProductRecord,
} from "./product-parser.js";
