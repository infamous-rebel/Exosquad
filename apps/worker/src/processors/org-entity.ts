// =============================================================================
// Worker — Organization Entity Resolution Processor
// =============================================================================
// Processes organization entity resolution jobs from the BullMQ queue.
// Pipeline: Load orgs → Generate candidates → Compare → Persist decisions
// =============================================================================

import { prisma, Prisma } from "@exosquad/database";
import { createChildLogger } from "@exosquad/logger";
import {
  OrgEntityResolver,
  createOrgAIProvider,
  createCompanySearchKey,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  type OrgIdentityInput,
  type OrgCandidatePair,
  type OrgResolutionResult,
} from "@exosquad/entity";
import { config } from "@exosquad/config";
import type { Job } from "bullmq";

const processorLogger = createChildLogger({ module: "org-entity-processor" });

// ─── Job Types ───────────────────────────────────────────────────────────────

type OrgEntityJobType =
  | "resolve_org_batch"      // Generate candidates and resolve for a set of orgs
  | "resolve_org_single"     // Resolve a single new org against existing
  | "resolve_org_candidate"  // Resolve a specific candidate pair
  | "reconcile_org_source";  // Reconcile all unresolved orgs from a source

interface OrgEntityJobPayload {
  tenantId: string;
  type: OrgEntityJobType;
  organizationIds?: string[];
  sourceId?: string;
  candidateId?: string;
  options?: {
    useAI?: boolean;
    maxCandidates?: number;
    batchSize?: number;
  };
}

// ─── Resolver Instance ──────────────────────────────────────────────────────

function getResolver(useAI: boolean): OrgEntityResolver {
  const aiProvider = useAI
    ? createOrgAIProvider({
        endpoint: (config as Record<string, unknown>).AI_ENDPOINT as string | undefined,
        apiKey: (config as Record<string, unknown>).AI_API_KEY as string | undefined,
        model: ((config as Record<string, unknown>).AI_MODEL as string) || "gpt-4o-mini",
      })
    : createOrgAIProvider();

  return new OrgEntityResolver({
    aiProvider,
    useAIForUncertain: useAI,
    maxCandidatesPerOrg: 50,
    autoResolveThreshold: 0.8,
  });
}

// ─── Main Processor ──────────────────────────────────────────────────────────

export async function processOrgEntityJob(job: Job): Promise<void> {
  const payload = job.data as OrgEntityJobPayload;
  const { tenantId, type, options: _options } = payload;

  processorLogger.info(
    { jobId: job.id, tenantId, type },
    "Processing org entity resolution job"
  );

  const useAI = _options?.useAI ?? false;
  const resolver = getResolver(useAI);

  switch (type) {
    case "resolve_org_batch":
      await resolveOrgBatch(tenantId, payload.organizationIds ?? [], resolver, _options);
      break;
    case "resolve_org_single":
      await resolveOrgSingle(tenantId, payload.organizationIds?.[0], resolver);
      break;
    case "resolve_org_candidate":
      await resolveOrgCandidatePair(tenantId, payload.candidateId, resolver);
      break;
    case "reconcile_org_source":
      await reconcileOrgSource(tenantId, payload.sourceId, resolver, _options);
      break;
    default:
      processorLogger.warn({ type }, "Unknown org entity job type");
  }
}

// ─── Batch Resolution ────────────────────────────────────────────────────────

async function resolveOrgBatch(
  tenantId: string,
  organizationIds: string[],
  resolver: OrgEntityResolver,
  options?: { batchSize?: number }
): Promise<void> {
  const batchSize = options?.batchSize ?? 100;

  if (organizationIds.length > 0) {
    const orgs = await loadOrganizations(tenantId, organizationIds);
    if (orgs.length < 2) {
      processorLogger.info({ tenantId, count: orgs.length }, "Not enough orgs for batch resolution");
      return;
    }

    const results = await resolver.resolveAll(orgs);
    await persistOrgResults(tenantId, results, orgs);
    return;
  }

  // Resolve all unresolved organizations for the tenant
  let hasMore = true;
  while (hasMore) {
    const unresolved = await prisma.organization.findMany({
      where: {
        tenantId,
        status: "active",
        identityStatus: { in: ["unresolved", "possible"] },
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (unresolved.length === 0) {
      hasMore = false;
      break;
    }

    const orgIds = unresolved.map((o) => o.id);
    const orgs = await loadOrganizations(tenantId, orgIds);
    const results = await resolver.resolveAll(orgs);
    await persistOrgResults(tenantId, results, orgs);

    if (unresolved.length < batchSize) {
      hasMore = false;
    }
  }
}

// ─── Single Org Resolution ──────────────────────────────────────────────────

async function resolveOrgSingle(
  tenantId: string,
  orgId: string | undefined,
  resolver: OrgEntityResolver
): Promise<void> {
  if (!orgId) return;

  const newOrgs = await loadOrganizations(tenantId, [orgId]);
  if (newOrgs.length === 0) return;

  const existing = await prisma.organization.findMany({
    where: {
      tenantId,
      status: "active",
      id: { not: orgId },
    },
    take: 500,
  });

  const existingOrgs = await loadOrganizations(tenantId, existing.map((o) => o.id));
  const candidates = resolver.generateCandidatesForNewOrg(newOrgs[0]!, existingOrgs);

  for (const candidate of candidates) {
    const orgA = newOrgs[0]!;
    const orgB = existingOrgs.find((o) => o.id === candidate.toOrgId) ??
                 existingOrgs.find((o) => o.id === candidate.fromOrgId);

    if (!orgB) continue;

    const result = await resolver.resolveCandidate(candidate, orgA, orgB);
    await persistOrgResults(tenantId, [result], [orgA, orgB]);
  }
}

// ─── Candidate Pair Resolution ──────────────────────────────────────────────

async function resolveOrgCandidatePair(
  tenantId: string,
  candidateId: string | undefined,
  resolver: OrgEntityResolver
): Promise<void> {
  if (!candidateId) return;

  const candidate = await prisma.orgIdentityCandidate.findFirst({
    where: { id: candidateId, tenantId },
  });

  if (!candidate) return;

  await prisma.orgIdentityCandidate.update({
    where: { id: candidateId },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  try {
    const orgs = await loadOrganizations(tenantId, [candidate.fromOrgId, candidate.toOrgId]);
    if (orgs.length < 2) {
      await prisma.orgIdentityCandidate.update({
        where: { id: candidateId },
        data: { status: "failed", lastError: "Could not load both organizations" },
      });
      return;
    }

    const pair: OrgCandidatePair = {
      fromOrgId: candidate.fromOrgId,
      toOrgId: candidate.toOrgId,
      generationMethod: candidate.generationMethod as "blocking" | "identifier" | "domain" | "manual" | "ai",
      blockingKey: candidate.blockingKey,
      priority: candidate.priority,
    };

    const result = await resolver.resolveCandidate(pair, orgs[0]!, orgs[1]!);
    await persistOrgResults(tenantId, [result], orgs);

    const status = result.matchResult.decision === "EXACT_MATCH" || result.matchResult.decision === "HIGH_CONFIDENCE_MATCH"
      ? "matched"
      : result.matchResult.decision === "NO_MATCH"
        ? "rejected"
        : result.matchResult.decision === "CONFLICT"
          ? "ambiguous"
          : "pending";

    await prisma.orgIdentityCandidate.update({
      where: { id: candidateId },
      data: {
        status,
        resultJson: result.matchResult as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.orgIdentityCandidate.update({
      where: { id: candidateId },
      data: { status: "failed", lastError: message },
    });
    throw err;
  }
}

// ─── Source Reconciliation ───────────────────────────────────────────────────

async function reconcileOrgSource(
  tenantId: string,
  sourceId: string | undefined,
  resolver: OrgEntityResolver,
  _options?: { batchSize?: number }
): Promise<void> {
  if (!sourceId) return;

  // Find all sellers/suppliers linked to this source that are unresolved
  const [sellers, suppliers] = await Promise.all([
    prisma.seller.findMany({
      where: { tenantId, sourceId, identityStatus: { in: ["unresolved", "possible"] } },
      select: { organizationId: true },
    }),
    prisma.supplier.findMany({
      where: { tenantId, sourceId, identityStatus: { in: ["unresolved", "possible"] } },
      select: { organizationId: true },
    }),
  ]);

  const orgIds = [
    ...sellers.map((s) => s.organizationId),
    ...suppliers.map((s) => s.organizationId),
  ].filter((id): id is string => id !== null);

  const uniqueOrgIds = [...new Set(orgIds)];
  if (uniqueOrgIds.length === 0) return;

  await resolveOrgBatch(tenantId, uniqueOrgIds, resolver, _options);
}

// ─── Data Loading ────────────────────────────────────────────────────────────

async function loadOrganizations(tenantId: string, orgIds: string[]): Promise<OrgIdentityInput[]> {
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds }, tenantId },
    include: {
      roles: { select: { role: true } },
      identifiers: { select: { type: true, value: true, normalized: true } },
      domains: { select: { domain: true, isPrimary: true } },
      emails: { select: { email: true, normalizedEmail: true, domain: true, isCorporate: true } },
      phones: { select: { rawPhone: true, normalizedPhone: true, countryCode: true } },
      locations: { select: { city: true, state: true, country: true, postalCode: true } },
    },
  });

  return orgs.map((o) => ({
    id: o.id,
    tenantId: o.tenantId,
    canonicalName: o.canonicalName,
    normalizedName: o.normalizedName,
    searchKey: o.searchKey,
    legalName: o.legalName,
    tradingName: o.tradingName,
    website: o.website,
    domain: o.domain,
    country: o.country,
    identifiers: o.identifiers.map((i) => ({
      type: i.type,
      value: i.value,
      normalized: i.normalized,
    })),
    domains: o.domains.map((d) => d.domain),
    emails: o.emails.map((e) => ({
      email: e.email,
      normalizedEmail: e.normalizedEmail,
      domain: e.domain,
      isCorporate: e.isCorporate,
    })),
    phones: o.phones.map((p) => ({
      rawPhone: p.rawPhone,
      normalizedPhone: p.normalizedPhone,
      countryCode: p.countryCode,
    })),
    locations: o.locations.map((l) => ({
      city: l.city,
      state: l.state,
      country: l.country,
      postalCode: l.postalCode,
    })),
    roles: o.roles.map((r) => r.role),
  }));
}

// ─── Result Persistence ─────────────────────────────────────────────────────

async function persistOrgResults(
  tenantId: string,
  results: OrgResolutionResult[],
  _orgs: OrgIdentityInput[]
): Promise<void> {
  for (const result of results) {
    const { candidate, matchResult, conflicts, autoApplicable } = result;

    try {
      // 1. Create org identity decision
      const decision = await prisma.orgIdentityDecision.create({
        data: {
          tenantId,
          fromOrgId: candidate.fromOrgId,
          toOrgId: candidate.toOrgId,
          decision: matchResult.decision,
          confidence: matchResult.confidence,
          reasons: matchResult.reasons as Prisma.InputJsonValue,
          nameMatch: matchResult.evidence.nameMatch ?? null,
          domainMatch: matchResult.evidence.domainMatch ?? null,
          emailMatch: matchResult.evidence.emailMatch ?? null,
          phoneMatch: matchResult.evidence.phoneMatch ?? null,
          addressMatch: matchResult.evidence.addressMatch ?? null,
          registrationMatch: matchResult.evidence.registrationMatch ?? null,
          sourceIdMatch: matchResult.evidence.sourceIdMatch ?? null,
          countryMatch: matchResult.evidence.countryMatch ?? null,
          websiteMatch: matchResult.evidence.websiteMatch ?? null,
          roleCompatibility: matchResult.evidence.roleCompatibility ?? null,
          conflictState: matchResult.evidence.conflictState ?? "none",
          method: result.aiUsed ? "hybrid" : "deterministic",
          methodVersion: "exosquad-entity/0.1.0",
        },
      });

      // 2. If auto-applicable, link orgs and update status
      if (autoApplicable) {
        const status = matchResult.decision === "EXACT_MATCH" ? "resolved"
          : matchResult.decision === "HIGH_CONFIDENCE_MATCH" ? "high_confidence"
          : "possible";

        await prisma.organization.updateMany({
          where: { id: { in: [candidate.fromOrgId, candidate.toOrgId] }, tenantId },
          data: { identityStatus: status },
        });
      }

      // 3. Create conflicts
      for (const conflict of conflicts) {
        await prisma.orgIdentityConflict.create({
          data: {
            tenantId,
            entityType: "organization",
            entityId: conflict.entityId,
            conflictType: conflict.conflictType,
            severity: conflict.severity,
            description: conflict.description.substring(0, 2000),
            conflictingData: conflict.conflictingData as Prisma.InputJsonValue,
          },
        });
      }

      // 4. Update candidate status
      await prisma.orgIdentityCandidate.updateMany({
        where: {
          tenantId,
          fromOrgId: candidate.fromOrgId,
          toOrgId: candidate.toOrgId,
        },
        data: {
          status: autoApplicable ? "matched" : "pending",
          resultJson: matchResult as unknown as Prisma.InputJsonValue,
        },
      });

      // 5. Suppress unused variable warnings
      void decision;
    } catch (err) {
      processorLogger.error(
        { err, tenantId, fromOrgId: candidate.fromOrgId, toOrgId: candidate.toOrgId },
        "Failed to persist org entity resolution result"
      );
    }
  }
}

// ─── Helpers (exported for use in normalization pipeline) ────────────────────

export { createCompanySearchKey, normalizeDomain, normalizeEmail, normalizePhone };
