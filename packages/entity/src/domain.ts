// =============================================================================
// @exosquad/entity — Domain normalization
// =============================================================================
// Normalizes website/domain values for comparison.
// Handles http/https, www, trailing slashes, paths, subdomains.
// =============================================================================

import type { NormalizedDomain } from "./types.js";

/** Known free email / hosting domains that should not be treated as corporate. */
const FREE_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "mail.com",
  "protonmail.com",
  "proton.me",
  "icloud.com",
  "me.com",
  "mac.com",
  "yandex.com",
  "yandex.ru",
  "gmx.com",
  "gmx.net",
  "zoho.com",
  "fastmail.com",
  "tutanota.com",
  "tutanota.de",
  "inbox.com",
  "mail.ru",
  "rediffmail.com",
  "web.de",
  "libero.it",
  "virgilio.it",
]);

/**
 * Normalize a domain/URL for comparison.
 * Extracts the registrable domain, handles subdomains.
 */
export function normalizeDomain(input: string): NormalizedDomain {
  if (!input) {
    return {
      original: "",
      normalized: "",
      hostname: "",
      registrableDomain: "",
      isSubdomain: false,
    };
  }

  let original = input.trim();

  // Step 1: Strip protocol
  let hostname = original
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "");

  // Step 2: Strip path, query, fragment
  hostname = hostname.split("/")[0]!;
  hostname = hostname.split("?")[0]!;
  hostname = hostname.split("#")[0]!;

  // Step 3: Strip port
  hostname = hostname.split(":")[0]!;

  // Step 4: Lowercase
  hostname = hostname.toLowerCase().trim();

  // Step 5: Strip www prefix
  hostname = hostname.replace(/^www\./, "");

  // Step 6: Remove trailing dots
  hostname = hostname.replace(/\.$/, "");

  // Step 7: Determine registrable domain
  const registrableDomain = extractRegistrableDomain(hostname);
  const isSubdomain = hostname !== registrableDomain && hostname.endsWith("." + registrableDomain);

  return {
    original,
    normalized: registrableDomain,
    hostname,
    registrableDomain,
    isSubdomain,
  };
}

/**
 * Check if two domains are equivalent (same registrable domain).
 */
export function isDomainEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  const domA = normalizeDomain(a);
  const domB = normalizeDomain(b);
  return domA.registrableDomain === domB.registrableDomain && domA.registrableDomain !== "";
}

/**
 * Check if a domain is a corporate domain (not a free email provider).
 */
export function isCorporateDomain(domain: string): boolean {
  if (!domain) return false;
  const normalized = normalizeDomain(domain);
  return !FREE_DOMAINS.has(normalized.registrableDomain);
}

/**
 * Check if a domain is a free email provider.
 */
export function isFreeEmailDomain(domain: string): boolean {
  if (!domain) return false;
  const normalized = normalizeDomain(domain);
  return FREE_DOMAINS.has(normalized.registrableDomain);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Extract the registrable domain from a hostname.
 * Simple heuristic: last two parts (or last three for known ccTLDs).
 * This is a simplified approach; a full PSL parser would be more accurate.
 */
function extractRegistrableDomain(hostname: string): string {
  if (!hostname) return "";

  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;

  // Known two-part ccTLDs (e.g., co.uk, com.au, co.in)
  const twoPartCctlds = new Set([
    "co.uk", "org.uk", "ac.uk", "gov.uk",
    "com.au", "net.au", "org.au",
    "co.in", "net.in", "org.in",
    "co.nz", "net.nz", "org.nz",
    "co.za", "org.za",
    "com.br", "net.br", "org.br",
    "co.jp", "or.jp", "ne.jp",
    "com.cn", "net.cn", "org.cn",
    "co.kr", "or.kr",
    "com.sg", "net.sg", "org.sg",
    "com.bd", "net.bd", "org.bd",
    "com.hk", "net.hk", "org.hk",
    "com.tw", "net.tw", "org.tw",
    "com.mx", "net.mx", "org.mx",
    "com.ar", "net.ar", "org.ar",
    "com.tr", "net.tr", "org.tr",
    "com.eg", "net.eg", "org.eg",
    "com.ng", "net.ng", "org.ng",
    "com.pk", "net.pk", "org.pk",
  ]);

  // Check if last two parts form a known ccTLD
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join(".");
    if (twoPartCctlds.has(lastTwo)) {
      return parts.slice(-3).join(".");
    }
  }

  // Default: last two parts
  return parts.slice(-2).join(".");
}
