// =============================================================================
// @exosquad/normalization — Unit normalization
// =============================================================================
// Deterministic unit-of-measure normalization for commercial products.
// Supports mass, volume, and count units with pack structure parsing.
// =============================================================================

import type { UnitOfMeasure, PackStructure, UnitCategory } from "./types.js";

// ─── Unit Alias Maps ────────────────────────────────────────────────────────

const MASS_ALIASES: Record<string, { unit: "mg" | "g" | "kg"; factor: number }> = {
  // Milligrams
  "mg": { unit: "mg", factor: 1 },
  "milligram": { unit: "mg", factor: 1 },
  "milligrams": { unit: "mg", factor: 1 },
  "milligramme": { unit: "mg", factor: 1 },
  "milligrammes": { unit: "mg", factor: 1 },
  // Grams
  "g": { unit: "g", factor: 1 },
  "gram": { unit: "g", factor: 1 },
  "grams": { unit: "g", factor: 1 },
  "gramme": { unit: "g", factor: 1 },
  "grammes": { unit: "g", factor: 1 },
  "gm": { unit: "g", factor: 1 },
  "gr": { unit: "g", factor: 1 },
  // Kilograms
  "kg": { unit: "kg", factor: 1 },
  "kilogram": { unit: "kg", factor: 1 },
  "kilograms": { unit: "kg", factor: 1 },
  "kilo": { unit: "kg", factor: 1 },
  "kilos": { unit: "kg", factor: 1 },
  // Ounces → grams
  "oz": { unit: "g", factor: 28.3495 },
  "ounce": { unit: "g", factor: 28.3495 },
  "ounces": { unit: "g", factor: 28.3495 },
  // Pounds → grams
  "lb": { unit: "g", factor: 453.592 },
  "lbs": { unit: "g", factor: 453.592 },
  "pound": { unit: "g", factor: 453.592 },
  "pounds": { unit: "g", factor: 453.592 },
};

const VOLUME_ALIASES: Record<string, { unit: "ml" | "l"; factor: number }> = {
  // Milliliters
  "ml": { unit: "ml", factor: 1 },
  "milliliter": { unit: "ml", factor: 1 },
  "milliliters": { unit: "ml", factor: 1 },
  "millilitre": { unit: "ml", factor: 1 },
  "millilitres": { unit: "ml", factor: 1 },
  "cc": { unit: "ml", factor: 1 },
  // Liters
  "l": { unit: "l", factor: 1 },
  "liter": { unit: "l", factor: 1 },
  "liters": { unit: "l", factor: 1 },
  "litre": { unit: "l", factor: 1 },
  "litres": { unit: "l", factor: 1 },
  "lt": { unit: "l", factor: 1 },
  // Fluid ounces → ml
  "fl oz": { unit: "ml", factor: 29.5735 },
  "floz": { unit: "ml", factor: 29.5735 },
  "fluid ounce": { unit: "ml", factor: 29.5735 },
  "fluid ounces": { unit: "ml", factor: 29.5735 },
  // Gallons → ml
  "gal": { unit: "l", factor: 3.78541 },
  "gallon": { unit: "l", factor: 3.78541 },
  "gallons": { unit: "l", factor: 3.78541 },
};

const COUNT_ALIASES: Set<string> = new Set([
  "unit", "units",
  "piece", "pieces", "pc", "pcs",
  "pack", "packs", "pk",
  "box", "boxes",
  "bottle", "bottles", "btl",
  "tube", "tubes",
  "sachet", "sachets",
  "capsule", "capsules", "cap", "caps",
  "tablet", "tablets", "tab", "tabs",
]);

/**
 * Normalize a unit string to its canonical form.
 * Returns null if the unit is not recognized.
 */
export function normalizeUnit(rawUnit: string): { unit: string; category: UnitCategory } | null {
  if (!rawUnit) return null;

  const cleaned = rawUnit.trim().toLowerCase();
  if (!cleaned) return null;

  // Check mass
  const massMatch = MASS_ALIASES[cleaned];
  if (massMatch) {
    return { unit: massMatch.unit, category: "mass" };
  }

  // Check volume (multi-word first)
  const volumeMatch = VOLUME_ALIASES[cleaned];
  if (volumeMatch) {
    return { unit: volumeMatch.unit, category: "volume" };
  }

  // Check count
  if (COUNT_ALIASES.has(cleaned)) {
    return { unit: normalizeCountUnit(cleaned), category: "count" };
  }

  return null;
}

/**
 * Normalize a count unit alias to its canonical form.
 */
function normalizeCountUnit(raw: string): string {
  const mapping: Record<string, string> = {
    "unit": "unit", "units": "unit",
    "piece": "piece", "pieces": "piece", "pc": "piece", "pcs": "piece",
    "pack": "pack", "packs": "pack", "pk": "pack",
    "box": "box", "boxes": "box",
    "bottle": "bottle", "bottles": "bottle", "btl": "bottle",
    "tube": "tube", "tubes": "tube",
    "sachet": "sachet", "sachets": "sachet",
    "capsule": "capsule", "capsules": "capsule", "cap": "capsule", "caps": "capsule",
    "tablet": "tablet", "tablets": "tablet", "tab": "tablet", "tabs": "tablet",
  };
  return mapping[raw] ?? "unit";
}

/**
 * Parse and normalize a quantity + unit string (e.g., "236ml", "1.5 kg", "500mg").
 */
export function parseQuantityUnit(input: string): UnitOfMeasure | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pattern: optional number, optional space, unit string
  const match = trimmed.match(/^([\d]*[.]?[\d]+)\s*([a-zA-Z.]+(?:\s+[a-zA-Z.]+)?)\s*$/);
  if (!match || match[1] === undefined || match[2] === undefined) return null;

  const quantity = parseFloat(match[1]);
  if (isNaN(quantity) || quantity <= 0) return null;

  const unitStr = match[2].trim().toLowerCase();
  const normalized = normalizeUnit(unitStr);
  if (!normalized) return null;

  // Convert to canonical unit using factor
  let canonicalQuantity = quantity;
  if (normalized.category === "mass") {
    const alias = MASS_ALIASES[unitStr];
    if (alias) canonicalQuantity = quantity * alias.factor;
  } else if (normalized.category === "volume") {
    const alias = VOLUME_ALIASES[unitStr];
    if (alias) canonicalQuantity = quantity * alias.factor;
  }

  return {
    unit: normalized.unit,
    category: normalized.category,
    quantity: roundToPrecision(canonicalQuantity, 6),
    original: trimmed,
  };
}

/**
 * Parse a pack structure string (e.g., "6 x 236ml", "2 x 50g", "12 x 100ml").
 */
export function parsePackStructure(input: string): PackStructure | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pattern: count x quantity unit
  const match = trimmed.match(/^(\d+)\s*[xX×]\s*([\d]*[.]?[\d]+)\s*([a-zA-Z.]+(?:\s+[a-zA-Z.]+)?)\s*$/);
  if (!match || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }

  const packCount = parseInt(match[1], 10);
  const perUnitQuantity = parseFloat(match[2]);
  if (isNaN(packCount) || packCount <= 0 || isNaN(perUnitQuantity) || perUnitQuantity <= 0) {
    return null;
  }

  const unitStr = match[3].trim().toLowerCase();
  const normalized = normalizeUnit(unitStr);
  if (!normalized) return null;

  // Convert per-unit quantity to canonical
  let canonicalPerUnit = perUnitQuantity;
  if (normalized.category === "mass") {
    const alias = MASS_ALIASES[unitStr];
    if (alias) canonicalPerUnit = perUnitQuantity * alias.factor;
  } else if (normalized.category === "volume") {
    const alias = VOLUME_ALIASES[unitStr];
    if (alias) canonicalPerUnit = perUnitQuantity * alias.factor;
  }

  const totalQuantity = packCount * canonicalPerUnit;

  return {
    packCount,
    perUnitQuantity: roundToPrecision(canonicalPerUnit, 6),
    perUnitUnit: normalized.unit,
    totalQuantity: roundToPrecision(totalQuantity, 6),
    baseUnit: normalized.unit,
    original: trimmed,
  };
}

/**
 * Extract quantity and unit from a product name suffix.
 * Handles patterns like "236ml", "1.5 kg", "500mg", "6 x 236ml".
 */
export function extractQuantityFromName(name: string): {
  nameWithoutQuantity: string;
  quantity: number | null;
  unit: string | null;
  packStructure: PackStructure | null;
} {
  if (!name) return { nameWithoutQuantity: name, quantity: null, unit: null, packStructure: null };

  // Try pack structure first: "6 x 236ml"
  const packMatch = name.match(/\s*[-–]?\s*(\d+)\s*[xX×]\s*([\d]*[.]?[\d]+)\s*([a-zA-Z.]+)\s*$/);
  if (packMatch) {
    const packStr = packMatch[0].trim();
    const pack = parsePackStructure(packStr.replace(/^[-–]\s*/, ""));
    if (pack) {
      const nameWithout = name.slice(0, name.length - packStr.length).trim().replace(/[-–]\s*$/, "").trim();
      return { nameWithoutQuantity: nameWithout, quantity: pack.totalQuantity, unit: pack.baseUnit, packStructure: pack };
    }
  }

  // Try simple quantity: "236ml", "1.5 kg"
  const qtyMatch = name.match(/\s*[-–]?\s*([\d]*[.]?[\d]+)\s*([a-zA-Z.]+(?:\s+[a-zA-Z.]+)?)\s*$/);
  if (qtyMatch && qtyMatch[1] !== undefined && qtyMatch[2] !== undefined) {
    const unitStr = qtyMatch[2].trim().toLowerCase();
    const normalized = normalizeUnit(unitStr);
    if (normalized) {
      const qtyStr = qtyMatch[0];
      const qty = parseFloat(qtyMatch[1]);
      const nameWithout = name.slice(0, name.length - qtyStr.length).trim().replace(/[-–]\s*$/, "").trim();

      let canonicalQty = qty;
      if (normalized.category === "mass") {
        const alias = MASS_ALIASES[unitStr];
        if (alias) canonicalQty = qty * alias.factor;
      } else if (normalized.category === "volume") {
        const alias = VOLUME_ALIASES[unitStr];
        if (alias) canonicalQty = qty * alias.factor;
      }

      return {
        nameWithoutQuantity: nameWithout,
        quantity: roundToPrecision(canonicalQty, 6),
        unit: normalized.unit,
        packStructure: null,
      };
    }
  }

  return { nameWithoutQuantity: name, quantity: null, unit: null, packStructure: null };
}

// ─── Conversion Factors (to base unit: mg for mass, ml for volume) ──────────

const MASS_TO_BASE: Record<string, number> = {
  "mg": 1,
  "g": 1000,
  "kg": 1_000_000,
};

const VOLUME_TO_BASE: Record<string, number> = {
  "ml": 1,
  "l": 1000,
};

/**
 * Convert a mass value to a different mass unit.
 */
export function convertMass(value: number, fromUnit: string, toUnit: string): number | null {
  const fromFactor = MASS_TO_BASE[fromUnit.toLowerCase()];
  const toFactor = MASS_TO_BASE[toUnit.toLowerCase()];
  if (!fromFactor || !toFactor) return null;

  // Convert to base (mg), then to target
  const inBase = value * fromFactor;
  return roundToPrecision(inBase / toFactor, 6);
}

/**
 * Convert a volume value to a different volume unit.
 */
export function convertVolume(value: number, fromUnit: string, toUnit: string): number | null {
  const fromFactor = VOLUME_TO_BASE[fromUnit.toLowerCase()];
  const toFactor = VOLUME_TO_BASE[toUnit.toLowerCase()];
  if (!fromFactor || !toFactor) return null;

  // Convert to base (ml), then to target
  const inBase = value * fromFactor;
  return roundToPrecision(inBase / toFactor, 6);
}

/**
 * Round a number to a specific decimal precision to avoid floating-point errors.
 */
function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}
