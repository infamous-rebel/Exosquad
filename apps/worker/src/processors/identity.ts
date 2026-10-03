// =============================================================================
// Worker — Identity Resolution Processor
// =============================================================================
// Processes identity resolution jobs from the BullMQ queue.
// Pipeline: Load products → Generate candidates → Compare → Persist decisions
// =============================================================================

import { prisma, Prisma } from "@exosquad/database";
import { createChildLogger } from "@exosquad/logger";
import {
  IdentityResolver,
  createAIProvider,
  tokenizeProductName,
  type ProductIdentityInput,
  type CandidatePair,
  type ResolutionResult,
} from "@exosquad/identity";
import { config } from "@exosquad/config";
import type { Job } from "bullmq";

const processorLogger = createChildLogger({ module: "identity-processor" });

// ─── Job Types ───────────────────────────────────────────────────────────────

type IdentityJobType =
  | "resolve_batch"       // Generate candidates and resolve for a set of products
  | "resolve_single"      // Resolve a single new product against existing
  | "resolve_candidate"   // Resolve a specific candidate pair
  | "reconcile_source";   // Reconcile all unresolved products for a source

interface IdentityJobPayload {
  tenantId: string;
  type: IdentityJobType;
  productIds?: string[];
  sourceId?: string;
  candidateId?: string;
  options?: {
    useAI?: boolean;
    maxCandidates?: number;
    batchSize?: number;
  };
}

// ─── Resolver Instance ──────────────────────────────────────────────────────

function getResolver(useAI: boolean): IdentityResolver {
  const aiProvider = useAI
    ? createAIProvider({
        endpoint: (config as Record<string, unknown>).AI_ENDPOINT as string | undefined,
        apiKey: (config as Record<string, unknown>).AI_API_KEY as string | undefined,
        model: ((config as Record<string, unknown>).AI_MODEL as string) || "gpt-4o-mini",
      })
    : createAIProvider();

  return new IdentityResolver({
    aiProvider,
    useAIForUncertain: useAI,
    maxCandidatesPerProduct: 50,
    autoResolveThreshold: 0.8,
  });
}

// ─── Main Processor ──────────────────────────────────────────────────────────

export async function processIdentityJob(job: Job): Promise<void> {
  const payload = job.data as IdentityJobPayload;
  const { tenantId, type, options: _options } = payload;

  processorLogger.info(
    { jobId: job.id, tenantId, type },
    "Processing identity resolution job"
  );

  const useAI = _options?.useAI ?? false;
  const resolver = getResolver(useAI);
  
  switch (type) {
    case "resolve_batch":
      await resolveBatch(tenantId, payload.productIds ?? [], resolver, _options);
      break;
    case "resolve_single":
      await resolveSingle(tenantId, payload.productIds?.[0], resolver, _options);
      break;
    case "resolve_candidate":
      await resolveCandidatePair(tenantId, payload.candidateId, resolver);
      break;
    case "reconcile_source":
      await reconcileSource(tenantId, payload.sourceId, resolver, _options);
      break;
    default:
      processorLogger.warn({ type }, "Unknown identity job type");
  }
}

// ─── Batch Resolution ────────────────────────────────────────────────────────

async function resolveBatch(
  tenantId: string,
  productIds: string[],
  resolver: IdentityResolver,
  options?: { batchSize?: number }
): Promise<void> {
  const batchSize = options?.batchSize ?? 100;

  // If specific product IDs provided, resolve those
  if (productIds.length > 0) {
    const products = await loadProducts(tenantId, productIds);
    if (products.length < 2) {
      processorLogger.info({ tenantId, count: products.length }, "Not enough products for batch resolution");
      return;
    }

    const results = await resolver.resolveAll(products);
    await persistResults(tenantId, results);
    return;
  }

  // Otherwise, resolve all unresolved products for the tenant
  let hasMore = true;
  while (hasMore) {
    const unresolved = await prisma.product.findMany({
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

    const productIds = unresolved.map((p) => p.id);
    const products = await loadProducts(tenantId, productIds);
    const results = await resolver.resolveAll(products);
    await persistResults(tenantId, results);

    if (unresolved.length < batchSize) {
      hasMore = false;
    }
  }
}

// ─── Single Product Resolution ──────────────────────────────────────────────

async function resolveSingle(
  tenantId: string,
  productId: string | undefined,
  resolver: IdentityResolver,
  _options?: { maxCandidates?: number }
): Promise<void> {
  if (!productId) return;

  const newProduct = await loadProducts(tenantId, [productId]);
  if (newProduct.length === 0) return;

  // Load existing products for comparison
  const existing = await prisma.product.findMany({
    where: {
      tenantId,
      status: "active",
      id: { not: productId },
    },
    take: 500,
  });

  const existingProducts = await loadProducts(tenantId, existing.map((p) => p.id));
  const candidates = resolver.generateCandidatesForNewProduct(newProduct[0]!, existingProducts);

  for (const candidate of candidates) {
    const productA = newProduct[0]!;
    const productB = existingProducts.find((p) => p.id === candidate.toProductId) ??
                     existingProducts.find((p) => p.id === candidate.fromProductId);

    if (!productB) continue;

    const result = await resolver.resolveCandidate(candidate, productA, productB);
    await persistResults(tenantId, [result]);
  }
}

// ─── Candidate Pair Resolution ──────────────────────────────────────────────

async function resolveCandidatePair(
  tenantId: string,
  candidateId: string | undefined,
  resolver: IdentityResolver
): Promise<void> {
  if (!candidateId) return;

  const candidate = await prisma.identityCandidate.findFirst({
    where: { id: candidateId, tenantId },
  });

  if (!candidate) return;

  // Update candidate status
  await prisma.identityCandidate.update({
    where: { id: candidateId },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  try {
    const products = await loadProducts(tenantId, [candidate.fromProductId, candidate.toProductId]);
    if (products.length < 2) {
      await prisma.identityCandidate.update({
        where: { id: candidateId },
        data: { status: "failed", lastError: "Could not load both products" },
      });
      return;
    }

    const pair: CandidatePair = {
      fromProductId: candidate.fromProductId,
      toProductId: candidate.toProductId,
      generationMethod: candidate.generationMethod as "blocking" | "identifier" | "manual" | "ai",
      blockingKey: candidate.blockingKey,
      priority: candidate.priority,
    };

    const result = await resolver.resolveCandidate(pair, products[0]!, products[1]!);
    await persistResults(tenantId, [result]);

    // Update candidate status based on result
    const status = result.matchResult.decision === "EXACT_MATCH" || result.matchResult.decision === "HIGH_CONFIDENCE_MATCH"
      ? "matched"
      : result.matchResult.decision === "NO_MATCH"
        ? "rejected"
        : result.matchResult.decision === "CONFLICT"
          ? "ambiguous"
          : "pending";

    await prisma.identityCandidate.update({
      where: { id: candidateId },
      data: {
        status,
        resultJson: result.matchResult as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.identityCandidate.update({
      where: { id: candidateId },
      data: { status: "failed", lastError: message },
    });
    throw err;
  }
}

// ─── Source Reconciliation ───────────────────────────────────────────────────

async function reconcileSource(
  tenantId: string,
  sourceId: string | undefined,
  resolver: IdentityResolver,
  _options?: { batchSize?: number }
): Promise<void> {
  if (!sourceId) return;

  // Find all products linked to observations from this source that are unresolved
  const observations = await prisma.observation.findMany({
    where: {
      sourceId,
      tenantId,
      productId: { not: null },
    },
    select: { productId: true },
    distinct: ["productId"],
  });

  const productIds = observations.map((o) => o.productId).filter((id): id is string => id !== null);
  if (productIds.length === 0) return;

  await resolveBatch(tenantId, productIds, resolver, _options);
}

// ─── Data Loading ────────────────────────────────────────────────────────────

async function loadProducts(tenantId: string, productIds: string[]): Promise<ProductIdentityInput[]> {
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId },
    include: {
      brand: { select: { id: true, name: true, normalizedName: true, searchKey: true } },
      identifiers: { select: { type: true, value: true, normalized: true, isValid: true } },
      variants: {
        select: {
          id: true, name: true, normalizedName: true,
          packCount: true, perUnitQuantity: true, perUnitUnit: true,
          totalQuantity: true, quantityUnit: true,
          formulation: true, flavor: true, scent: true,
          concentration: true, strength: true, spf: true,
          ageGroup: true, genderTarget: true, color: true,
        },
      },
    },
  });

  return products.map((p) => ({
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    normalizedName: p.normalizedName,
    brandId: p.brandId,
    brandName: p.brand?.name ?? null,
    brandNormalizedName: p.brand?.normalizedName ?? null,
    brandSearchKey: p.brand?.searchKey ?? null,
    countryOfOrigin: p.countryOfOrigin,
    identifiers: p.identifiers.map((i) => ({
      type: i.type,
      value: i.value,
      normalized: i.normalized,
      isValid: i.isValid,
    })),
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      normalizedName: v.normalizedName,
      packCount: v.packCount,
      perUnitQuantity: v.perUnitQuantity !== null ? Number(v.perUnitQuantity) : null,
      perUnitUnit: v.perUnitUnit,
      totalQuantity: v.totalQuantity !== null ? Number(v.totalQuantity) : null,
      quantityUnit: v.quantityUnit,
      formulation: v.formulation,
      flavor: v.flavor,
      scent: v.scent,
      concentration: v.concentration,
      strength: v.strength,
      spf: v.spf,
      ageGroup: v.ageGroup,
      genderTarget: v.genderTarget,
      color: v.color,
    })),
  }));
}

// ─── Result Persistence ─────────────────────────────────────────────────────

async function persistResults(
  tenantId: string,
  results: ResolutionResult[]
): Promise<void> {
  for (const result of results) {
    const { candidate, matchResult, conflicts, autoApplicable } = result;

    try {
      // 1. Create identity decision
      const decision = await prisma.identityDecision.create({
        data: {
          tenantId,
          fromProductId: candidate.fromProductId,
          toProductId: candidate.toProductId,
          decision: matchResult.decision,
          confidence: matchResult.confidence,
          reasons: matchResult.reasons as Prisma.InputJsonValue,
          identifierMatch: matchResult.evidence.identifierMatch ?? null,
          brandMatch: matchResult.evidence.brandMatch ?? null,
          nameMatch: matchResult.evidence.nameMatch ?? null,
          variantMatch: matchResult.evidence.variantMatch ?? null,
          quantityMatch: matchResult.evidence.quantityMatch ?? null,
          packMatch: matchResult.evidence.packMatch ?? null,
          countryMatch: matchResult.evidence.countryMatch ?? null,
          manufacturerMatch: matchResult.evidence.manufacturerMatch ?? null,
          conflictState: matchResult.evidence.conflictState ?? "none",
          method: result.aiUsed ? "hybrid" : "deterministic",
          methodVersion: "exosquad-identity/0.1.0",
        },
      });

      // 2. Create identity relationship if matched
      if (matchResult.relationshipType && autoApplicable) {
        await prisma.identityRelationship.upsert({
          where: {
            tenantId_fromProductId_toProductId_relationshipType: {
              tenantId,
              fromProductId: candidate.fromProductId,
              toProductId: candidate.toProductId,
              relationshipType: matchResult.relationshipType,
            },
          },
          create: {
            tenantId,
            fromProductId: candidate.fromProductId,
            toProductId: candidate.toProductId,
            relationshipType: matchResult.relationshipType,
            confidence: matchResult.confidence,
            evidenceJson: matchResult.evidence as unknown as Prisma.InputJsonValue,
            decisionId: decision.id,
          },
          update: {
            confidence: matchResult.confidence,
            evidenceJson: matchResult.evidence as unknown as Prisma.InputJsonValue,
            decisionId: decision.id,
          },
        });

        // Update product identity status
        const status = matchResult.decision === "EXACT_MATCH" ? "resolved"
          : matchResult.decision === "HIGH_CONFIDENCE_MATCH" ? "high_confidence"
          : "possible";

        await prisma.product.updateMany({
          where: { id: { in: [candidate.fromProductId, candidate.toProductId] }, tenantId },
          data: { identityStatus: status },
        });
      }

      // 3. Create conflicts
      for (const conflict of conflicts) {
        await prisma.identityConflict.create({
          data: {
            tenantId,
            entityType: "product",
            entityId: conflict.entityId,
            conflictType: conflict.conflictType,
            severity: conflict.severity,
            description: conflict.description.substring(0, 2000),
            conflictingData: conflict.conflictingData as Prisma.InputJsonValue,
          },
        });
      }

      // 4. Update product search keys if not set
      await updateSearchKeys(tenantId, [candidate.fromProductId, candidate.toProductId]);
    } catch (err) {
      processorLogger.error(
        { err, tenantId, fromProductId: candidate.fromProductId, toProductId: candidate.toProductId },
        "Failed to persist identity resolution result"
      );
    }
  }
}

/**
 * Update search keys for products that don't have them.
 */
async function updateSearchKeys(tenantId: string, productIds: string[]): Promise<void> {
  for (const productId of productIds) {
    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId, searchKey: "" },
      select: { id: true, name: true },
    });

    if (product) {
      const token = tokenizeProductName(product.name);
      await prisma.product.update({
        where: { id: productId },
        data: { searchKey: token.searchKey },
      });
    }
  }
}
