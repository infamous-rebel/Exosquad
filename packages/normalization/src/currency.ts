// =============================================================================
// @exosquad/normalization — Currency normalization
// =============================================================================
// ISO 4217 currency code normalization and conversion infrastructure.
// Does NOT fabricate exchange rates — marks unavailable when no rate exists.
// =============================================================================

import type { NormalizedCurrency } from "./types.js";

// ─── ISO 4217 Currency Code Map ─────────────────────────────────────────────
// Maps common currency symbols, names, and non-standard codes to ISO 4217.

const CURRENCY_ALIASES: Record<string, string> = {
  // Symbols
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "৳": "BDT",
  "₽": "RUB",
  "₩": "KRW",
  "₺": "TRY",
  "₱": "PHP",
  "฿": "THB",
  "₫": "VND",
  "₦": "NGN",
  "₵": "GHS",
  "R$": "BRL",
  "RM": "MYR",
  "S$": "SGD",
  "A$": "AUD",
  "C$": "CAD",
  "NZ$": "NZD",
  "HK$": "HKD",
  "R": "ZAR",

  // Common name forms
  "usd": "USD",
  "us dollar": "USD",
  "us dollars": "USD",
  "dollar": "USD",
  "dollars": "USD",
  "eur": "EUR",
  "euro": "EUR",
  "euros": "EUR",
  "gbp": "GBP",
  "pound": "GBP",
  "pounds": "GBP",
  "pound sterling": "GBP",
  "sterling": "GBP",
  "bdt": "BDT",
  "taka": "BDT",
  "bangladeshi taka": "BDT",
  "jpy": "JPY",
  "yen": "JPY",
  "inr": "INR",
  "rupee": "INR",
  "rupees": "INR",
  "indian rupee": "INR",
  "cny": "CNY",
  "yuan": "CNY",
  "renminbi": "CNY",
  "rmb": "CNY",
  "aud": "AUD",
  "can": "CAD",
  "cad": "CAD",
};

/** Set of all valid ISO 4217 codes (subset of most common). */
const VALID_ISO_CODES = new Set([
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY",
  "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP",
  "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD",
  "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR", "ILS",
  "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR",
  "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD",
  "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU",
  "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK",
  "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG",
  "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK",
  "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL",
  "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH",
  "UGX", "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD",
  "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWL",
]);

/**
 * Normalize a currency string to ISO 4217 code.
 * Handles symbols, names, and case variations.
 * Returns null if the currency cannot be determined.
 */
export function normalizeCurrencyCode(input: string): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already a valid ISO code (case-insensitive)
  const upper = trimmed.toUpperCase();
  if (VALID_ISO_CODES.has(upper)) {
    return upper;
  }

  // Check aliases (case-insensitive)
  const lower = trimmed.toLowerCase();
  const alias = CURRENCY_ALIASES[lower];
  if (alias) return alias;

  // Try the raw symbol
  const symbolAlias = CURRENCY_ALIASES[trimmed];
  if (symbolAlias) return symbolAlias;

  return null;
}

/**
 * Parse a price string that may contain currency symbol/code and amount.
 * Examples: "$12.99", "USD 12.99", "12.99 USD", "৳ 500", "€1,234.56"
 */
export function parsePriceString(input: string): { amount: number; currency: string } | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try to extract currency code/symbol and numeric amount
  // Pattern 1: symbol/code followed by amount: "$12.99", "USD 12.99"
  const prefixMatch = trimmed.match(/^([A-Za-z]{1,3}|[$€£¥₹৳₽₩₺₱฿₫₦₵R]|RM|S\$|A\$|C\$|NZ\$|HK\$)\s*([\d,]+\.?\d*)\s*$/);
  if (prefixMatch && prefixMatch[1] !== undefined && prefixMatch[2] !== undefined) {
    const currencyStr = prefixMatch[1];
    const amountStr = prefixMatch[2].replace(/,/g, "");
    const amount = parseFloat(amountStr);
    if (!isNaN(amount) && amount >= 0) {
      const currency = normalizeCurrencyCode(currencyStr);
      if (currency) {
        return { amount, currency };
      }
    }
  }

  // Pattern 2: amount followed by currency code: "12.99 USD", "500 BDT"
  const suffixMatch = trimmed.match(/^([\d,]+\.?\d*)\s+([A-Za-z]{3})\s*$/);
  if (suffixMatch && suffixMatch[1] !== undefined && suffixMatch[2] !== undefined) {
    const amountStr = suffixMatch[1].replace(/,/g, "");
    const amount = parseFloat(amountStr);
    const currency = normalizeCurrencyCode(suffixMatch[2]);
    if (!isNaN(amount) && amount >= 0 && currency) {
      return { amount, currency };
    }
  }

  // Pattern 3: just a number (currency unknown)
  const numberOnly = trimmed.replace(/,/g, "");
  const num = parseFloat(numberOnly);
  if (!isNaN(num) && num >= 0) {
    // Cannot determine currency — return null
    return null;
  }

  return null;
}

/**
 * Create a normalized currency representation.
 * Does NOT fabricate exchange rates — if no rate is available, marks as unavailable.
 */
export function normalizeCurrencyAmount(
  amount: number,
  currencyCode: string,
  options?: {
    targetCurrency?: string;
    exchangeRate?: number;
    exchangeRateSource?: string;
    exchangeRateTimestamp?: Date;
  }
): NormalizedCurrency {
  const normalizedCode = normalizeCurrencyCode(currencyCode) ?? currencyCode.toUpperCase();

  let convertedAmount: number | null = null;
  let conversionStatus: NormalizedCurrency["conversionStatus"] = "not_attempted";

  if (options?.exchangeRate !== undefined && options?.targetCurrency) {
    convertedAmount = Math.round(amount * options.exchangeRate * 100) / 100;
    conversionStatus = "converted";
  } else if (options?.targetCurrency && options.targetCurrency !== normalizedCode) {
    // Target currency specified but no rate available
    conversionStatus = "unavailable";
  }

  return {
    originalAmount: amount,
    originalCurrency: normalizedCode,
    convertedAmount,
    targetCurrency: options?.targetCurrency ?? null,
    exchangeRate: options?.exchangeRate ?? null,
    exchangeRateSource: options?.exchangeRateSource ?? null,
    exchangeRateTimestamp: options?.exchangeRateTimestamp ?? null,
    conversionStatus,
    original: `${amount} ${normalizedCode}`,
  };
}

/**
 * Check if a string is a valid ISO 4217 currency code.
 */
export function isValidCurrencyCode(input: string): boolean {
  if (!input) return false;
  return VALID_ISO_CODES.has(input.trim().toUpperCase());
}
