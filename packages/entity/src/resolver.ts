// =============================================================================
// @exosquad/entity — Organization entity resolution engine
// =============================================================================
// Main orchestrator for organization identity resolution.
// Pipeline: CANDIDATE GENERATION → DETERMINISTIC COMPARE → AI (if needed)
//           → CONFLICT DETECTION → STRUCTURED DECISION → PERSISTENCE
// =============================================================================

import { compareOrganizations } from "./similarity.js";
import { generateOrgCandidates, generateOrgCandidatesForOrg } from "./candidates.js";
import { detectOrgConflicts } from "./conflicts.js";
import { createOrgAIProvider } from "./ai-provider.js";
import type {
  OrgAIProvider,
  OrgAIMatchRequest,
  OrgMatchResult,
  OrgCandidatePair,
  OrgIdentityInput,
  OrgResolutionResult,
} from "./types.js";

// ─── Resolver Configuration ──────────────────────────────────────────────────

export interface OrgResolverConfig {
  aiProvider?: OrgAIProvider;
  useAIForUncertain?: boolean;
  maxCandidatesPerOrg?: number;
  autoResolveThreshold?: number;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Organization entity resolution engine.
 * Orchestrates the full pipeline from candidate generation to decision.
 */
export class OrgEntityResolver {
  private aiProvider: OrgAIProvider;
  private useAIForUncertain: boolean;
  private maxCandidates: number;
  private autoResolveThreshold: number;

  constructor(config?: OrgResolverConfig) {
    this.aiProvider = config?.aiProvider ?? createOrgAIProvider();
    this.useAIForUncertain = config?.useAIForUncertain ?? true;
    this.maxCandidates = config?.maxCandidatesPerOrg ?? 50;
    this.autoResolveThreshold = config?.autoResolveThreshold ?? 0.8;
  }

  /**
   * Generate candidate pairs for a set of organizations.
   */
  generateCandidates(orgs: OrgIdentityInput[]): OrgCandidatePair[] {
    return generateOrgCandidates(orgs, {
      maxCandidatesPerOrg: this.maxCandidates,
    });
  }

  /**
   * Generate candidates for a single new org against existing orgs.
   */
  generateCandidatesForNewOrg(
    newOrg: OrgIdentityInput,
    existingOrgs: OrgIdentityInput[]
  ): OrgCandidatePair[] {
    return generateOrgCandidatesForOrg(newOrg, existingOrgs, this.maxCandidates);
  }

  /**
   * Resolve a single candidate pair.
   */
  async resolveCandidate(
    candidate: OrgCandidatePair,
    orgA: OrgIdentityInput,
    orgB: OrgIdentityInput
  ): Promise<OrgResolutionResult> {
    // Step 1: Deterministic comparison
    let matchResult = compareOrganizations(orgA, orgB);
    let aiUsed = false;

    // Step 2: If uncertain and AI available, try AI-assisted matching
    if (
      this.useAIForUncertain &&
      this.aiProvider.available &&
      (matchResult.decision === "UNRESOLVED" || matchResult.decision === "POSSIBLE_MATCH")
    ) {
      const aiResult = await this.tryAIMatching(orgA, orgB);
      if (aiResult && aiResult.confidence > matchResult.confidence) {
        aiUsed = true;
        matchResult = {
          ...matchResult,
          decision: aiResult.decision,
          confidence: aiResult.confidence,
          reasons: [...matchResult.reasons, ...aiResult.reasons.map((r) => `AI: ${r}`)],
        };
      }
    }

    // Step 3: Detect conflicts
    const conflicts = detectOrgConflicts(orgA, orgB);

    if (conflicts.length > 0 && matchResult.decision !== "NO_MATCH") {
      matchResult = {
        ...matchResult,
        decision: "CONFLICT",
        evidence: {
          ...matchResult.evidence,
          conflictState: "open",
        },
        reasons: [...matchResult.reasons, `${conflicts.length} conflict(s) detected`],
      };
    }

    // Step 4: Determine if auto-applicable
    const autoApplicable =
      (matchResult.decision === "EXACT_MATCH" || matchResult.decision === "HIGH_CONFIDENCE_MATCH") &&
      matchResult.confidence >= this.autoResolveThreshold &&
      conflicts.length === 0;

    return { candidate, matchResult, aiUsed, conflicts, autoApplicable };
  }

  /**
   * Resolve all candidates for a set of organizations.
   */
  async resolveAll(orgs: OrgIdentityInput[]): Promise<OrgResolutionResult[]> {
    const candidates = this.generateCandidates(orgs);
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const results: OrgResolutionResult[] = [];

    for (const candidate of candidates) {
      const orgA = orgMap.get(candidate.fromOrgId);
      const orgB = orgMap.get(candidate.toOrgId);
      if (!orgA || !orgB) continue;

      const result = await this.resolveCandidate(candidate, orgA, orgB);
      results.push(result);
    }

    return results;
  }

  /**
   * Try AI-assisted matching for a pair of organizations.
   */
  private async tryAIMatching(
    orgA: OrgIdentityInput,
    orgB: OrgIdentityInput
  ): Promise<{ decision: OrgMatchResult["decision"]; confidence: number; reasons: string[] } | null> {
    try {
      const request: OrgAIMatchRequest = {
        orgA: {
          name: orgA.canonicalName,
          legalName: orgA.legalName,
          domain: orgA.domain,
          country: orgA.country,
          identifiers: orgA.identifiers.map((i) => i.normalized),
          roles: orgA.roles,
        },
        orgB: {
          name: orgB.canonicalName,
          legalName: orgB.legalName,
          domain: orgB.domain,
          country: orgB.country,
          identifiers: orgB.identifiers.map((i) => i.normalized),
          roles: orgB.roles,
        },
      };

      const response = await this.aiProvider.matchOrganizations(request);
      return response;
    } catch {
      return null;
    }
  }
}
