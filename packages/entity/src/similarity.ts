// =============================================================================
// @exosquad/entity — Organization similarity comparison
// =============================================================================
// Deterministic comparison of two organizations across all matching dimensions.
// Produces structured evidence — never a single opaque score.
// =============================================================================

import { companyNameSimilarity } from "./company-name.js";
import { isDomainEquivalent, normalizeDomain } from "./domain.js";
import { isEmailEquivalent, isEmailDomainMatch } from "./email.js";
import { isPhoneEquivalent } from "./phone.js";
import { addressSimilarity } from "./address.js";
import type {
  OrgIdentityInput,
  OrgMatchResult,
  OrgMatchEvidence,
  OrgMatchDecision,
  NameMatchQuality,
  DomainMatchQuality,
  EmailMatchQuality,
  PhoneMatchQuality,
  AddressMatchQuality,
  IdentifierMatchQuality,
  CountryMatchQuality,
  WebsiteMatchQuality,
  RoleCompatibility,
} from "./types.js";

/**
 * Compare two organizations and produce a structured match result.
 * Deterministic — no AI involved at this stage.
 */
export function compareOrganizations(
  orgA: OrgIdentityInput,
  orgB: OrgIdentityInput
): OrgMatchResult {
  const evidence = buildEvidence(orgA, orgB);
  const { decision, confidence, reasons } = decideFromEvidence(evidence);

  return { decision, confidence, evidence, reasons };
}

// ─── Evidence Builder ────────────────────────────────────────────────────────

function buildEvidence(orgA: OrgIdentityInput, orgB: OrgIdentityInput): OrgMatchEvidence {
  const reasons: string[] = [];

  // 1. Name match
  const nameScore = companyNameSimilarity(orgA.canonicalName, orgB.canonicalName);
  const nameMatch = nameQuality(nameScore);
  if (nameScore > 0.8) reasons.push(`High name similarity (${nameScore.toFixed(2)})`);
  if (nameScore < 0.3 && nameScore > 0) reasons.push(`Low name similarity (${nameScore.toFixed(2)})`);

  // 2. Domain match
  const { domainScore, domainMatch } = compareDomains(orgA, orgB);
  if (domainMatch === "exact") reasons.push("Same registrable domain");
  if (domainMatch === "conflict") reasons.push("Domain conflict detected");

  // 3. Website match
  const { websiteScore: _websiteScore, websiteMatch } = compareWebsites(orgA, orgB);

  // 4. Email match
  const { emailScore, emailMatch } = compareEmails(orgA, orgB);
  if (emailMatch === "exact") reasons.push("Matching email address");
  if (emailMatch === "domain") reasons.push("Same email domain");

  // 5. Phone match
  const { phoneScore, phoneMatch } = comparePhones(orgA, orgB);
  if (phoneMatch === "exact") reasons.push("Matching phone number");

  // 6. Registration/identifier match
  const { identifierScore, registrationMatch } = compareIdentifiers(orgA, orgB);
  if (registrationMatch === "exact") reasons.push("Matching registration identifier");
  if (registrationMatch === "conflict") reasons.push("Identifier collision detected");

  // 7. Source ID match (not compared here — done at candidate level)
  const sourceIdMatch: IdentifierMatchQuality = "none";

  // 8. Address match
  const addrScore = compareAddresses(orgA, orgB);
  const addressMatch: AddressMatchQuality = addrScore >= 0.8 ? "exact" : addrScore >= 0.4 ? "similar" : "none";
  if (addressMatch === "exact") reasons.push("Matching address");

  // 9. Country match
  const countryMatch = compareCountries(orgA.country, orgB.country);
  if (countryMatch === "different") reasons.push("Different countries");

  // 10. Role compatibility
  const roleCompat = compareRoles(orgA.roles, orgB.roles);
  if (roleCompat === "conflicting") reasons.push("Conflicting roles detected");
  if (roleCompat === "compatible") reasons.push("Compatible roles");

  // Overall score: weighted combination
  const overallScore = computeOverallScore({
    nameScore, domainScore, emailScore, phoneScore,
    addressScore: addrScore, identifierScore,
  });

  return {
    nameMatch,
    domainMatch,
    emailMatch,
    phoneMatch,
    addressMatch,
    registrationMatch,
    sourceIdMatch,
    countryMatch,
    websiteMatch,
    roleCompatibility: roleCompat,
    conflictState: "none",
    sourceReliability: null,
    scores: {
      nameScore,
      domainScore,
      emailScore,
      phoneScore,
      addressScore: addrScore,
      identifierScore,
      overallScore,
    },
    reasons,
  };
}

// ─── Dimension Comparisons ───────────────────────────────────────────────────

function compareDomains(orgA: OrgIdentityInput, orgB: OrgIdentityInput): {
  domainScore: number; domainMatch: DomainMatchQuality;
} {
  const domainsA = orgA.domains.filter(Boolean);
  const domainsB = orgB.domains.filter(Boolean);

  // Also include primary domain
  if (orgA.domain) domainsA.push(orgA.domain);
  if (orgB.domain) domainsB.push(orgB.domain);

  if (domainsA.length === 0 || domainsB.length === 0) {
    return { domainScore: 0, domainMatch: "none" };
  }

  for (const da of domainsA) {
    for (const db of domainsB) {
      if (isDomainEquivalent(da, db)) {
        return { domainScore: 1.0, domainMatch: "exact" };
      }
    }
  }

  // Check for conflict: same domain but very different names
  const nameScore = companyNameSimilarity(orgA.canonicalName, orgB.canonicalName);
  if (nameScore < 0.2) {
    return { domainScore: 0.5, domainMatch: "conflict" };
  }

  return { domainScore: 0, domainMatch: "none" };
}

function compareWebsites(orgA: OrgIdentityInput, orgB: OrgIdentityInput): {
  websiteScore: number; websiteMatch: WebsiteMatchQuality;
} {
  if (!orgA.website || !orgB.website) {
    return { websiteScore: 0, websiteMatch: "none" };
  }

  const domA = normalizeDomain(orgA.website);
  const domB = normalizeDomain(orgB.website);

  if (domA.registrableDomain === domB.registrableDomain && domA.registrableDomain) {
    if (domA.hostname === domB.hostname) {
      return { websiteScore: 1.0, websiteMatch: "exact" };
    }
    return { websiteScore: 0.7, websiteMatch: "similar" };
  }

  return { websiteScore: 0, websiteMatch: "none" };
}

function compareEmails(orgA: OrgIdentityInput, orgB: OrgIdentityInput): {
  emailScore: number; emailMatch: EmailMatchQuality;
} {
  if (orgA.emails.length === 0 || orgB.emails.length === 0) {
    return { emailScore: 0, emailMatch: "none" };
  }

  for (const ea of orgA.emails) {
    for (const eb of orgB.emails) {
      if (isEmailEquivalent(ea.normalizedEmail, eb.normalizedEmail)) {
        // Only count corporate emails as strong evidence
        if (ea.isCorporate && eb.isCorporate) {
          return { emailScore: 1.0, emailMatch: "exact" };
        }
        return { emailScore: 0.3, emailMatch: "exact" }; // free email = weak
      }
    }
  }

  // Check domain match
  for (const ea of orgA.emails) {
    for (const eb of orgB.emails) {
      if (ea.isCorporate && eb.isCorporate && isEmailDomainMatch(ea.normalizedEmail, eb.normalizedEmail)) {
        return { emailScore: 0.5, emailMatch: "domain" };
      }
    }
  }

  return { emailScore: 0, emailMatch: "none" };
}

function comparePhones(orgA: OrgIdentityInput, orgB: OrgIdentityInput): {
  phoneScore: number; phoneMatch: PhoneMatchQuality;
} {
  if (orgA.phones.length === 0 || orgB.phones.length === 0) {
    return { phoneScore: 0, phoneMatch: "none" };
  }

  for (const pa of orgA.phones) {
    for (const pb of orgB.phones) {
      if (pa.normalizedPhone && pb.normalizedPhone) {
        if (pa.normalizedPhone === pb.normalizedPhone) {
          return { phoneScore: 1.0, phoneMatch: "exact" };
        }
      } else if (isPhoneEquivalent(pa.rawPhone, pb.rawPhone, orgA.country ?? orgB.country)) {
        return { phoneScore: 0.8, phoneMatch: "exact" };
      }
    }
  }

  return { phoneScore: 0, phoneMatch: "none" };
}

function compareIdentifiers(orgA: OrgIdentityInput, orgB: OrgIdentityInput): {
  identifierScore: number; registrationMatch: IdentifierMatchQuality;
} {
  if (orgA.identifiers.length === 0 || orgB.identifiers.length === 0) {
    return { identifierScore: 0, registrationMatch: "none" };
  }

  for (const ia of orgA.identifiers) {
    for (const ib of orgB.identifiers) {
      if (ia.type === ib.type && ia.normalized === ib.normalized) {
        return { identifierScore: 1.0, registrationMatch: "exact" };
      }
      // Same type, different value = conflict
      if (ia.type === ib.type && ia.normalized !== ib.normalized) {
        // Only flag conflict for strong identifier types
        if (["registration_id", "vat", "tin"].includes(ia.type)) {
          return { identifierScore: 0, registrationMatch: "conflict" };
        }
      }
    }
  }

  return { identifierScore: 0, registrationMatch: "none" };
}

function compareAddresses(orgA: OrgIdentityInput, orgB: OrgIdentityInput): number {
  if (orgA.locations.length === 0 || orgB.locations.length === 0) return 0;

  let maxScore = 0;
  for (const la of orgA.locations) {
    for (const lb of orgB.locations) {
      const partsA = [la.city, la.state, la.postalCode, la.country].filter(Boolean).join(", ");
      const partsB = [lb.city, lb.state, lb.postalCode, lb.country].filter(Boolean).join(", ");
      if (partsA && partsB) {
        const score = addressSimilarity(partsA, partsB, la.country ?? lb.country);
        maxScore = Math.max(maxScore, score);
      }
    }
  }
  return maxScore;
}

function compareCountries(a: string | null, b: string | null): CountryMatchQuality {
  if (!a || !b) return "none";
  if (a === b) return "exact";
  // Compatible = same region (simplified)
  const regions: Record<string, string[]> = {
    EU: ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "CZ", "HU", "RO", "BG", "GR", "PT", "IE", "SE", "NO", "DK", "FI"],
    GCC: ["SA", "AE", "QA", "KW", "BH", "OM"],
    NAFTA: ["US", "CA", "MX"],
    ASEAN: ["MY", "TH", "ID", "PH", "VN", "SG"],
  };
  for (const members of Object.values(regions)) {
    if (members.includes(a) && members.includes(b)) return "compatible";
  }
  return "different";
}

function compareRoles(rolesA: string[], rolesB: string[]): RoleCompatibility {
  if (rolesA.length === 0 || rolesB.length === 0) return "neutral";
  const setA = new Set(rolesA);
  const setB = new Set(rolesB);
  // Check for overlap
  for (const r of setA) {
    if (setB.has(r)) return "compatible";
  }
  // No overlap — not conflicting, just neutral
  return "neutral";
}

// ─── Decision Logic ──────────────────────────────────────────────────────────

function decideFromEvidence(evidence: OrgMatchEvidence): {
  decision: OrgMatchDecision; confidence: number; reasons: string[];
} {
  const reasons: string[] = [...evidence.reasons];
  const { overallScore } = evidence.scores;

  // Exact identifier match → HIGH confidence
  if (evidence.registrationMatch === "exact") {
    return { decision: "EXACT_MATCH", confidence: 0.95, reasons: [...reasons, "Exact registration identifier match"] };
  }

  // Domain + name → HIGH confidence
  if (evidence.domainMatch === "exact" && evidence.nameMatch !== "none") {
    return { decision: "HIGH_CONFIDENCE_MATCH", confidence: 0.85, reasons: [...reasons, "Domain + name match"] };
  }

  // Multiple strong signals
  const strongSignals = [
    evidence.domainMatch === "exact",
    evidence.emailMatch === "exact",
    evidence.phoneMatch === "exact",
  ].filter(Boolean).length;

  if (strongSignals >= 2 && evidence.nameMatch !== "none") {
    return { decision: "HIGH_CONFIDENCE_MATCH", confidence: 0.8, reasons: [...reasons, "Multiple strong identity signals"] };
  }

  // Conflicts → CONFLICT
  if (
    evidence.registrationMatch === "conflict" ||
    evidence.domainMatch === "conflict" ||
    evidence.phoneMatch === "conflict"
  ) {
    return { decision: "CONFLICT", confidence: 0, reasons: [...reasons, "Conflicting identity evidence"] };
  }

  // Score-based fallback
  if (overallScore >= 0.7) {
    return { decision: "POSSIBLE_MATCH", confidence: overallScore, reasons: [...reasons, `Moderate overall similarity (${overallScore.toFixed(2)})`] };
  }

  if (overallScore >= 0.4) {
    return { decision: "UNRESOLVED", confidence: overallScore, reasons: [...reasons, `Low similarity — needs review (${overallScore.toFixed(2)})`] };
  }

  return { decision: "NO_MATCH", confidence: 1 - overallScore, reasons: [...reasons, "Insufficient similarity"] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nameQuality(score: number): NameMatchQuality {
  if (score >= 0.95) return "exact";
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  if (score > 0) return "low";
  return "none";
}

function computeOverallScore(scores: {
  nameScore: number; domainScore: number; emailScore: number;
  phoneScore: number; addressScore: number; identifierScore: number;
}): number {
  // Weighted combination — identifiers and domains are strongest signals
  const weights = {
    nameScore: 0.2,
    domainScore: 0.25,
    emailScore: 0.15,
    phoneScore: 0.15,
    addressScore: 0.1,
    identifierScore: 0.15,
  };

  let total = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const value = scores[key as keyof typeof scores];
    if (value > 0 || key === "nameScore") {
      total += value * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? total / totalWeight : 0;
}
