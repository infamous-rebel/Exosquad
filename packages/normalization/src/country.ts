// =============================================================================
// @exosquad/normalization — Country normalization
// =============================================================================
// ISO 3166-1 country code normalization.
// Maps names, aliases, alpha-2, alpha-3, and numeric codes to canonical forms.
// =============================================================================

import type { NormalizedCountry } from "./types.js";

// ─── Country Data ───────────────────────────────────────────────────────────

interface CountryEntry {
  alpha2: string;
  alpha3: string;
  numeric: string;
  name: string;
  aliases: string[];
}

const COUNTRIES: CountryEntry[] = [
  { alpha2: "AF", alpha3: "AFG", numeric: "004", name: "Afghanistan", aliases: ["afghanestan"] },
  { alpha2: "AL", alpha3: "ALB", numeric: "008", name: "Albania", aliases: [] },
  { alpha2: "DZ", alpha3: "DZA", numeric: "012", name: "Algeria", aliases: [] },
  { alpha2: "AR", alpha3: "ARG", numeric: "032", name: "Argentina", aliases: [] },
  { alpha2: "AM", alpha3: "ARM", numeric: "051", name: "Armenia", aliases: [] },
  { alpha2: "AU", alpha3: "AUS", numeric: "036", name: "Australia", aliases: ["aussie"] },
  { alpha2: "AT", alpha3: "AUT", numeric: "040", name: "Austria", aliases: ["österreich", "oesterreich"] },
  { alpha2: "AZ", alpha3: "AZE", numeric: "031", name: "Azerbaijan", aliases: [] },
  { alpha2: "BD", alpha3: "BGD", numeric: "050", name: "Bangladesh", aliases: [] },
  { alpha2: "BY", alpha3: "BLR", numeric: "112", name: "Belarus", aliases: [] },
  { alpha2: "BE", alpha3: "BEL", numeric: "056", name: "Belgium", aliases: ["belgië", "belgie"] },
  { alpha2: "BR", alpha3: "BRA", numeric: "076", name: "Brazil", aliases: ["brasil"] },
  { alpha2: "BG", alpha3: "BGR", numeric: "100", name: "Bulgaria", aliases: [] },
  { alpha2: "CA", alpha3: "CAN", numeric: "124", name: "Canada", aliases: [] },
  { alpha2: "CL", alpha3: "CHL", numeric: "152", name: "Chile", aliases: [] },
  { alpha2: "CN", alpha3: "CHN", numeric: "156", name: "China", aliases: ["prc", "people's republic of china", "zhongguo"] },
  { alpha2: "CO", alpha3: "COL", numeric: "170", name: "Colombia", aliases: [] },
  { alpha2: "HR", alpha3: "HRV", numeric: "191", name: "Croatia", aliases: ["hrvatska"] },
  { alpha2: "CU", alpha3: "CUB", numeric: "192", name: "Cuba", aliases: [] },
  { alpha2: "CZ", alpha3: "CZE", numeric: "203", name: "Czech Republic", aliases: ["czechia", "česká republika"] },
  { alpha2: "DK", alpha3: "DNK", numeric: "208", name: "Denmark", aliases: ["danmark"] },
  { alpha2: "EG", alpha3: "EGY", numeric: "818", name: "Egypt", aliases: ["misr"] },
  { alpha2: "FI", alpha3: "FIN", numeric: "246", name: "Finland", aliases: ["suomi"] },
  { alpha2: "FR", alpha3: "FRA", numeric: "250", name: "France", aliases: ["république française"] },
  { alpha2: "GE", alpha3: "GEO", numeric: "268", name: "Georgia", aliases: ["sakartvelo"] },
  { alpha2: "DE", alpha3: "DEU", numeric: "276", name: "Germany", aliases: ["deutschland", "bundesrepublik deutschland"] },
  { alpha2: "GR", alpha3: "GRC", numeric: "300", name: "Greece", aliases: ["hellas", "ellas"] },
  { alpha2: "HK", alpha3: "HKG", numeric: "344", name: "Hong Kong", aliases: ["hk"] },
  { alpha2: "HU", alpha3: "HUN", numeric: "348", name: "Hungary", aliases: ["magyarország"] },
  { alpha2: "IN", alpha3: "IND", numeric: "356", name: "India", aliases: ["bharat", "hindustan"] },
  { alpha2: "ID", alpha3: "IDN", numeric: "360", name: "Indonesia", aliases: [] },
  { alpha2: "IR", alpha3: "IRN", numeric: "364", name: "Iran", aliases: ["persia"] },
  { alpha2: "IQ", alpha3: "IRQ", numeric: "368", name: "Iraq", aliases: [] },
  { alpha2: "IE", alpha3: "IRL", numeric: "372", name: "Ireland", aliases: ["éire"] },
  { alpha2: "IL", alpha3: "ISR", numeric: "376", name: "Israel", aliases: ["yisrael"] },
  { alpha2: "IT", alpha3: "ITA", numeric: "380", name: "Italy", aliases: ["italia"] },
  { alpha2: "JP", alpha3: "JPN", numeric: "392", name: "Japan", aliases: ["nippon", "nihon"] },
  { alpha2: "JO", alpha3: "JOR", numeric: "400", name: "Jordan", aliases: [] },
  { alpha2: "KZ", alpha3: "KAZ", numeric: "398", name: "Kazakhstan", aliases: [] },
  { alpha2: "KE", alpha3: "KEN", numeric: "404", name: "Kenya", aliases: [] },
  { alpha2: "KR", alpha3: "KOR", numeric: "410", name: "South Korea", aliases: ["korea, republic of", "republic of korea", "rok", "korea"] },
  { alpha2: "KP", alpha3: "PRK", numeric: "408", name: "North Korea", aliases: ["democratic people's republic of korea", "dprk"] },
  { alpha2: "KW", alpha3: "KWT", numeric: "414", name: "Kuwait", aliases: [] },
  { alpha2: "KG", alpha3: "KGZ", numeric: "417", name: "Kyrgyzstan", aliases: [] },
  { alpha2: "LA", alpha3: "LAO", numeric: "418", name: "Laos", aliases: ["lao"] },
  { alpha2: "LV", alpha3: "LVA", numeric: "428", name: "Latvia", aliases: ["latvija"] },
  { alpha2: "LB", alpha3: "LBN", numeric: "422", name: "Lebanon", aliases: [] },
  { alpha2: "LT", alpha3: "LTU", numeric: "440", name: "Lithuania", aliases: ["lietuva"] },
  { alpha2: "MY", alpha3: "MYS", numeric: "458", name: "Malaysia", aliases: [] },
  { alpha2: "MX", alpha3: "MEX", numeric: "484", name: "Mexico", aliases: ["méxico", "mexico"] },
  { alpha2: "MD", alpha3: "MDA", numeric: "498", name: "Moldova", aliases: [] },
  { alpha2: "MN", alpha3: "MNG", numeric: "496", name: "Mongolia", aliases: [] },
  { alpha2: "MA", alpha3: "MAR", numeric: "504", name: "Morocco", aliases: ["maghreb"] },
  { alpha2: "MM", alpha3: "MMR", numeric: "104", name: "Myanmar", aliases: ["burma"] },
  { alpha2: "NP", alpha3: "NPL", numeric: "524", name: "Nepal", aliases: [] },
  { alpha2: "NL", alpha3: "NLD", numeric: "528", name: "Netherlands", aliases: ["holland", "nederland"] },
  { alpha2: "NZ", alpha3: "NZL", numeric: "554", name: "New Zealand", aliases: ["aotearoa"] },
  { alpha2: "NG", alpha3: "NGA", numeric: "566", name: "Nigeria", aliases: [] },
  { alpha2: "NO", alpha3: "NOR", numeric: "578", name: "Norway", aliases: ["norge"] },
  { alpha2: "OM", alpha3: "OMN", numeric: "512", name: "Oman", aliases: [] },
  { alpha2: "PK", alpha3: "PAK", numeric: "586", name: "Pakistan", aliases: [] },
  { alpha2: "PE", alpha3: "PER", numeric: "604", name: "Peru", aliases: ["perú"] },
  { alpha2: "PH", alpha3: "PHL", numeric: "608", name: "Philippines", aliases: ["pilipinas"] },
  { alpha2: "PL", alpha3: "POL", numeric: "616", name: "Poland", aliases: ["polska"] },
  { alpha2: "PT", alpha3: "PRT", numeric: "620", name: "Portugal", aliases: [] },
  { alpha2: "QA", alpha3: "QAT", numeric: "634", name: "Qatar", aliases: [] },
  { alpha2: "RO", alpha3: "ROU", numeric: "642", name: "Romania", aliases: ["românia"] },
  { alpha2: "RU", alpha3: "RUS", numeric: "643", name: "Russia", aliases: ["russian federation", "rossiya"] },
  { alpha2: "SA", alpha3: "SAU", numeric: "682", name: "Saudi Arabia", aliases: ["ksa", "kingdom of saudi arabia"] },
  { alpha2: "SG", alpha3: "SGP", numeric: "702", name: "Singapore", aliases: [] },
  { alpha2: "SK", alpha3: "SVK", numeric: "703", name: "Slovakia", aliases: ["slovenská republika"] },
  { alpha2: "SI", alpha3: "SVN", numeric: "705", name: "Slovenia", aliases: ["slovenija"] },
  { alpha2: "ZA", alpha3: "ZAF", numeric: "710", name: "South Africa", aliases: ["rsa"] },
  { alpha2: "ES", alpha3: "ESP", numeric: "724", name: "Spain", aliases: ["españa", "espana"] },
  { alpha2: "LK", alpha3: "LKA", numeric: "144", name: "Sri Lanka", aliases: ["ceylon"] },
  { alpha2: "SE", alpha3: "SWE", numeric: "752", name: "Sweden", aliases: ["sverige"] },
  { alpha2: "CH", alpha3: "CHE", numeric: "756", name: "Switzerland", aliases: ["schweiz", "suisse", "svizzera"] },
  { alpha2: "TW", alpha3: "TWN", numeric: "158", name: "Taiwan", aliases: ["republic of china", "roc"] },
  { alpha2: "TJ", alpha3: "TJK", numeric: "762", name: "Tajikistan", aliases: [] },
  { alpha2: "TZ", alpha3: "TZA", numeric: "834", name: "Tanzania", aliases: [] },
  { alpha2: "TH", alpha3: "THA", numeric: "764", name: "Thailand", aliases: ["siam", "prathet thai"] },
  { alpha2: "TR", alpha3: "TUR", numeric: "792", name: "Turkey", aliases: ["türkiye", "turkiye"] },
  { alpha2: "TM", alpha3: "TKM", numeric: "795", name: "Turkmenistan", aliases: [] },
  { alpha2: "UA", alpha3: "UKR", numeric: "804", name: "Ukraine", aliases: ["ukrayina"] },
  { alpha2: "AE", alpha3: "ARE", numeric: "784", name: "United Arab Emirates", aliases: ["uae", "emirates"] },
  { alpha2: "GB", alpha3: "GBR", numeric: "826", name: "United Kingdom", aliases: ["uk", "great britain", "britain", "england", "scotland", "wales"] },
  { alpha2: "US", alpha3: "USA", numeric: "840", name: "United States", aliases: ["usa", "us", "united states of america", "america"] },
  { alpha2: "UY", alpha3: "URY", numeric: "858", name: "Uruguay", aliases: [] },
  { alpha2: "UZ", alpha3: "UZB", numeric: "860", name: "Uzbekistan", aliases: [] },
  { alpha2: "VE", alpha3: "VEN", numeric: "862", name: "Venezuela", aliases: [] },
  { alpha2: "VN", alpha3: "VNM", numeric: "704", name: "Vietnam", aliases: ["viet nam"] },
  { alpha2: "YE", alpha3: "YEM", numeric: "887", name: "Yemen", aliases: [] },
  { alpha2: "ZM", alpha3: "ZMB", numeric: "894", name: "Zambia", aliases: [] },
  { alpha2: "ZW", alpha3: "ZWE", numeric: "716", name: "Zimbabwe", aliases: [] },
];

// Build lookup indexes at module load
const BY_ALPHA2 = new Map<string, CountryEntry>();
const BY_ALPHA3 = new Map<string, CountryEntry>();
const BY_NUMERIC = new Map<string, CountryEntry>();
const BY_NAME = new Map<string, CountryEntry>();
const BY_ALIAS = new Map<string, CountryEntry>();

for (const c of COUNTRIES) {
  BY_ALPHA2.set(c.alpha2.toLowerCase(), c);
  BY_ALPHA3.set(c.alpha3.toLowerCase(), c);
  BY_NUMERIC.set(c.numeric, c);
  BY_NAME.set(c.name.toLowerCase(), c);
  for (const alias of c.aliases) {
    BY_ALIAS.set(alias.toLowerCase(), c);
  }
}

/**
 * Normalize a country string to ISO 3166-1 canonical form.
 * Handles names, alpha-2, alpha-3, numeric codes, and common aliases.
 */
export function normalizeCountry(input: string): NormalizedCountry | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();

  // Try alpha-2 (2 letters)
  if (/^[A-Z]{2}$/.test(upper)) {
    const entry = BY_ALPHA2.get(lower);
    if (entry) {
      return toResult(entry, "alpha2", trimmed);
    }
  }

  // Try alpha-3 (3 letters)
  if (/^[A-Z]{3}$/.test(upper)) {
    const entry = BY_ALPHA3.get(lower);
    if (entry) {
      return toResult(entry, "alpha3", trimmed);
    }
  }

  // Try numeric (3 digits)
  if (/^\d{3}$/.test(trimmed)) {
    const entry = BY_NUMERIC.get(trimmed);
    if (entry) {
      return toResult(entry, "exact", trimmed);
    }
  }

  // Try exact name match
  const byName = BY_NAME.get(lower);
  if (byName) {
    return toResult(byName, "exact", trimmed);
  }

  // Try alias match
  const byAlias = BY_ALIAS.get(lower);
  if (byAlias) {
    return toResult(byAlias, "alias", trimmed);
  }

  return null;
}

function toResult(entry: CountryEntry, method: NormalizedCountry["method"], original: string): NormalizedCountry {
  return {
    alpha2: entry.alpha2,
    alpha3: entry.alpha3,
    numeric: entry.numeric,
    name: entry.name,
    method,
    original,
  };
}

/**
 * Check if a string is a valid ISO 3166-1 alpha-2 code.
 */
export function isValidCountryCode(input: string): boolean {
  if (!input) return false;
  return BY_ALPHA2.has(input.trim().toLowerCase());
}

/**
 * Get the alpha-2 code for a country given any recognized identifier.
 */
export function getCountryAlpha2(input: string): string | null {
  const result = normalizeCountry(input);
  return result?.alpha2 ?? null;
}
