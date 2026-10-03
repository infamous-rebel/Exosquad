// =============================================================================
// @exosquad/entity — Candidate generation (blocking/indexing)
// =============================================================================
// Generates candidate pairs for organization identity resolution.
// Uses blocking keys to avoid O(n²) comparisons.
// =============================================================================

import { createCompanySearchKey } from "./company-name.js";
import { normalizeDomain } from "./domain.js";
import type { OrgIdentityInput, OrgCandidatePair } from "./types.js";

/**
 * Generate blocking keys for an organization.
 * Each key groups potentially matching organizations.
 */
export function generateOrgBlockingKeys(org: OrgIdentityInput): string[] {
  const keys: string[] = [];

  // Key 1: Normalized company name search key
  const nameKey = createCompanySearchKey(org.canonicalName);
  if (nameKey) keys.push(`name:${nameKey}`);

  // Key 2: Normalized domain
  if (org.domain) {
    const dom = normalizeDomain(org.domain);
    if (dom.registrableDomain) keys.push(`domain:${dom.registrableDomain}`);
  }

  // Key 3: Additional domains
  for (const d of org.domains) {
    const dom = normalizeDomain(d);
    if (dom.registrableDomain) keys.push(`domain:${dom.registrableDomain}`);
  }

  // Key 4: Registration identifiers
  for (const id of org.identifiers) {
    if (id.normalized) keys.push(`id:${id.type}:${id.normalized}`);
  }

  // Key 5: Normalized phone
  for (const p of org.phones) {
    if (p.normalizedPhone) keys.push(`phone:${p.normalizedPhone}`);
  }

  // Key 6: Name + country
  if (org.country && nameKey) {
    keys.push(`namecountry:${nameKey}:${org.country}`);
  }

  // Key 7: Name + city (from first location)
  if (org.locations.length > 0 && org.locations[0]!.city && nameKey) {
    const city = org.locations[0]!.city.toLowerCase().replace(/[^\w]/g, "");
    keys.push(`namecity:${nameKey}:${city}`);
  }

  // Key 8: Website hostname
  if (org.website) {
    const dom = normalizeDomain(org.website);
    if (dom.hostname) keys.push(`web:${dom.hostname}`);
  }

  return [...new Set(keys)]; // deduplicate
}

/**
 * Generate candidate pairs from a set of organizations using blocking.
 * Groups organizations by shared blocking keys, then produces unique pairs.
 */
export function generateOrgCandidates(
  orgs: OrgIdentityInput[],
  options?: { maxCandidatesPerOrg?: number }
): OrgCandidatePair[] {
  const maxPerOrg = options?.maxCandidatesPerOrg ?? 50;

  // Build blocking index: key → org IDs
  const index = new Map<string, Set<string>>();
  const orgMap = new Map<string, OrgIdentityInput>();

  for (const org of orgs) {
    orgMap.set(org.id, org);
    const keys = generateOrgBlockingKeys(org);
    for (const key of keys) {
      let set = index.get(key);
      if (!set) {
        set = new Set();
        index.set(key, set);
      }
      set.add(org.id);
    }
  }

  // Generate candidate pairs from shared blocking keys
  const pairSet = new Set<string>();
  const candidates: OrgCandidatePair[] = [];

  for (const [key, orgIds] of index) {
    if (orgIds.size < 2) continue;
    // Skip overly broad keys
    if (orgIds.size > 500) continue;

    const ids = [...orgIds];
    let pairsFromKey = 0;

    for (let i = 0; i < ids.length && pairsFromKey < maxPerOrg * 2; i++) {
      for (let j = i + 1; j < ids.length && pairsFromKey < maxPerOrg * 2; j++) {
        const fromId = ids[i]!;
        const toId = ids[j]!;
        const [sortedFrom, sortedTo] = fromId < toId ? [fromId, toId] : [toId, fromId];
        const pairKey = `${sortedFrom}:${sortedTo}`;

        if (pairSet.has(pairKey)) continue;
        pairSet.add(pairKey);

        const method = key.startsWith("id:") ? "identifier" as const
          : key.startsWith("domain:") ? "domain" as const
          : "blocking" as const;

        const priority = key.startsWith("id:") ? 10
          : key.startsWith("domain:") ? 8
          : key.startsWith("phone:") ? 7
          : key.startsWith("namecountry:") ? 4
          : key.startsWith("namecity:") ? 3
          : 0;

        candidates.push({
          fromOrgId: sortedFrom,
          toOrgId: sortedTo,
          generationMethod: method,
          blockingKey: key,
          priority,
        });
        pairsFromKey++;
      }
    }
  }

  // Sort by priority
  candidates.sort((a, b) => b.priority - a.priority);

  // Limit per org
  const perOrgCount = new Map<string, number>();
  const limited: OrgCandidatePair[] = [];

  for (const c of candidates) {
    const fromCount = perOrgCount.get(c.fromOrgId) ?? 0;
    const toCount = perOrgCount.get(c.toOrgId) ?? 0;
    if (fromCount < maxPerOrg && toCount < maxPerOrg) {
      limited.push(c);
      perOrgCount.set(c.fromOrgId, fromCount + 1);
      perOrgCount.set(c.toOrgId, toCount + 1);
    }
  }

  return limited;
}

/**
 * Generate candidates for a single new org against existing orgs.
 */
export function generateOrgCandidatesForOrg(
  newOrg: OrgIdentityInput,
  existingOrgs: OrgIdentityInput[],
  maxCandidates: number = 20
): OrgCandidatePair[] {
  const newKeys = new Set(generateOrgBlockingKeys(newOrg));
  const scored: Array<{ org: OrgIdentityInput; sharedKeys: number; priority: number }> = [];

  for (const existing of existingOrgs) {
    if (existing.id === newOrg.id) continue;
    if (existing.tenantId !== newOrg.tenantId) continue;

    const existingKeys = generateOrgBlockingKeys(existing);
    let sharedKeys = 0;
    let maxPriority = 0;

    for (const key of existingKeys) {
      if (newKeys.has(key)) {
        sharedKeys++;
        if (key.startsWith("id:")) maxPriority = Math.max(maxPriority, 10);
        else if (key.startsWith("domain:")) maxPriority = Math.max(maxPriority, 8);
        else if (key.startsWith("phone:")) maxPriority = Math.max(maxPriority, 7);
        else maxPriority = Math.max(maxPriority, 0);
      }
    }

    if (sharedKeys > 0) {
      scored.push({ org: existing, sharedKeys, priority: maxPriority });
    }
  }

  scored.sort((a, b) => {
    if (b.sharedKeys !== a.sharedKeys) return b.sharedKeys - a.sharedKeys;
    return b.priority - a.priority;
  });

  return scored.slice(0, maxCandidates).map((s) => {
    const [fromId, toId] = newOrg.id < s.org.id
      ? [newOrg.id, s.org.id]
      : [s.org.id, newOrg.id];
    return {
      fromOrgId: fromId,
      toOrgId: toId,
      generationMethod: "blocking" as const,
      blockingKey: null,
      priority: s.priority,
    };
  });
}
