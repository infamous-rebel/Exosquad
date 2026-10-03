// =============================================================================
// @exosquad/normalization — Shared types
// =============================================================================

/** Data quality states for normalized values. */
export type DataQuality = "valid" | "partial" | "ambiguous" | "invalid" | "unresolved";

/** Normalized unit categories. */
export type UnitCategory = "mass" | "volume" | "count" | "unknown";

/** Canonical mass units (base: mg). */
export type MassUnit = "mg" | "g" | "kg";

/** Canonical volume units (base: ml). */
export type VolumeUnit = "ml" | "l";

/** Canonical count units. */
export type CountUnit =
  | "unit" | "piece" | "pack" | "box" | "bottle"
  | "tube" | "sachet" | "capsule" | "tablet";

/** A canonical unit of measure. */
export interface UnitOfMeasure {
  /** The normalized unit value. */
  unit: string;
  /** The unit category. */
  category: UnitCategory;
  /** Numeric quantity in this unit. */
  quantity: number;
  /** The original source string before normalization. */
  original: string;
}

/** Pack structure representation. */
export interface PackStructure {
  /** Number of items in the pack (e.g., 6 in "6 x 236ml"). */
  packCount: number;
  /** Per-unit quantity (e.g., 236 in "6 x 236ml"). */
  perUnitQuantity: number;
  /** Per-unit unit (e.g., "ml" in "6 x 236ml"). */
  perUnitUnit: string;
  /** Total quantity = packCount * perUnitQuantity. */
  totalQuantity: number;
  /** Normalized base unit. */
  baseUnit: string;
  /** The original source string. */
  original: string;
}

/** Currency amount with provenance. */
export interface NormalizedCurrency {
  /** Original amount as received from source. */
  originalAmount: number;
  /** Original currency code (ISO 4217). */
  originalCurrency: string;
  /** Converted amount (null if conversion unavailable). */
  convertedAmount: number | null;
  /** Target currency for conversion. */
  targetCurrency: string | null;
  /** Exchange rate used (null if unavailable). */
  exchangeRate: number | null;
  /** Source of the exchange rate. */
  exchangeRateSource: string | null;
  /** When the exchange rate was obtained. */
  exchangeRateTimestamp: Date | null;
  /** Conversion status. */
  conversionStatus: "converted" | "unavailable" | "not_attempted";
  /** The original source string. */
  original: string;
}

/** Country resolution result. */
export interface NormalizedCountry {
  /** ISO 3166-1 alpha-2 code (e.g., "US"). */
  alpha2: string;
  /** ISO 3166-1 alpha-3 code (e.g., "USA"). */
  alpha3: string;
  /** ISO 3166-1 numeric code (e.g., "840"). */
  numeric: string;
  /** Short English name. */
  name: string;
  /** How the country was determined. */
  method: "exact" | "alias" | "alpha2" | "alpha3" | "inferred";
  /** The original source string. */
  original: string;
}

/** GTIN/barcode validation result. */
export interface BarcodeValidation {
  /** Whether the barcode is valid. */
  valid: boolean;
  /** The barcode type (GTIN-8, GTIN-12/UPC-A, GTIN-13/EAN-13, GTIN-14). */
  type: "GTIN-8" | "GTIN-12" | "GTIN-13" | "GTIN-14" | "unknown";
  /** The normalized (zero-padded) barcode value. */
  normalized: string;
  /** The original source string. */
  original: string;
}

/** Brand resolution result. */
export interface BrandResolution {
  /** The normalized brand name. */
  normalizedName: string;
  /** Whether this is an exact match or requires review. */
  quality: DataQuality;
  /** The original source string. */
  original: string;
}

/** Parsed product name components. */
export interface ParsedProduct {
  /** Original full name string. */
  originalName: string;
  /** Normalized (cleaned) name. */
  normalizedName: string;
  /** Extracted brand (may be unresolved). */
  brand: string | null;
  /** Product name without brand prefix. */
  productCore: string;
  /** Variant descriptor (flavor, scent, etc.). */
  variant: string | null;
  /** Extracted net quantity. */
  netQuantity: number | null;
  /** Extracted unit. */
  unit: string | null;
  /** Pack structure if detected. */
  packStructure: PackStructure | null;
}

/** Result of normalizing a single source record. */
export interface NormalizationResult {
  /** Whether normalization succeeded for this record. */
  success: boolean;
  /** Parsed product information. */
  product: ParsedProduct | null;
  /** Normalized brand. */
  brand: BrandResolution | null;
  /** Normalized country of origin. */
  country: NormalizedCountry | null;
  /** Validated barcode/GTIN. */
  barcode: BarcodeValidation | null;
  /** Normalized currency (if price present). */
  currency: NormalizedCurrency | null;
  /** Normalized unit of measure. */
  unitOfMeasure: UnitOfMeasure | null;
  /** Data quality assessment. */
  quality: DataQuality;
  /** Error information if failed. */
  error: { category: string; reason: string } | null;
}
