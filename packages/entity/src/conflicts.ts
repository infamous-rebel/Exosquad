// =============================================================================
// @exosquad/entity — Organization conflict detection
// =============================================================================
// Detects conflicting identity evidence between organizations.
// =============================================================================

import { isDomainEquivalent } from "./domain.js";
import { companyNameSimilarity } from "./company-name.js";
import type { OrgIdentityInput, DetectedOrgConflict } from "./types.js";

/**
 * Detect conflicts between two organizations.
 * Conflicts indicate contradictory evidence that should not be auto-resolved.
 */
export function detectOrgConflicts(
  orgA: OrgIdentityInput,
  orgB: OrgIdentityInput
): DetectedOrgConflict[] {
  const conflicts: DetectedOrgConflict[] = [];

  // 1. Registration ID collision: same type, different value
  for (const ia of orgA.identifiers) {
    for (const ib of orgB.identifiers) {
      if (ia.type === ib.type && ia.normalized !== ib.normalized) {
        if (["registration_id", "vat", "tin"].includes(ia.type)) {
          conflicts.push({
            conflictType: "registration_collision",
            severity: "critical",
            description: `Same ${ia.type} type but different values: "${ia.normalized}" vs "${ib.normalized}"`,
            entityId: orgA.id,
            conflictingData: { type: ia.type, valueA: ia.normalized, valueB: ib.normalized },
          });
        }
      }
    }
  }

  // 2. Domain conflict: same domain, very different names
  const domainsA = [orgA.domain, ...orgA.domains].filter((d): d is string => !!d);
  const domainsB = [orgB.domain, ...orgB.domains].filter((d): d is string => !!d);
  for (const da of domainsA) {
    for (const db of domainsB) {
      if (isDomainEquivalent(da, db)) {
        const nameSim = companyNameSimilarity(orgA.canonicalName, orgB.canonicalName);
        if (nameSim < 0.2) {
          conflicts.push({
            conflictType: "domain_conflict",
            severity: "high",
            description: `Same domain but very different names (similarity: ${nameSim.toFixed(2)})`,
            entityId: orgA.id,
            conflictingData: { domain: da, nameA: orgA.canonicalName, nameB: orgB.canonicalName, nameSimilarity: nameSim },
          });
        }
      }
    }
  }

  // 3. Name conflict: same name, different countries
  if (orgA.country && orgB.country && orgA.country !== orgB.country) {
    const nameSim = companyNameSimilarity(orgA.canonicalName, orgB.canonicalName);
    if (nameSim > 0.8) {
      conflicts.push({
        conflictType: "name_conflict",
        severity: "medium",
        description: `Same name but different countries: ${orgA.country} vs ${orgB.country}`,
        entityId: orgA.id,
        conflictingData: { nameA: orgA.canonicalName, nameB: orgB.canonicalName, countryA: orgA.country, countryB: orgB.country },
      });
    }
  }

  return conflicts;
}
