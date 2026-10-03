// =============================================================================
// @exosquad/identity — Candidate generation (blocking/indexing)
// =============================================================================
// Generates candidate pairs for identity resolution without O(n²) comparisons.
// Uses blocking keys to group potentially matching products.
// =============================================================================

import { tokenizeProductName, getBlockingKey } from "./tokenizer.js";
import type { CandidatePair, ProductIdentityInput } from "./types.js";

/**
 * Generate blocking keys for a product.
 * A product can have multiple blocking keys to increase recall.
 */
export function generateBlockingKeys(
  product: ProductIdentityInput
): string[] {
  const keys: string[] = [];
  const token = tokenizeProductName(product.name);

  // Key 1: Brand + core product terms
  const mainKey = getBlockingKey(token);
  if (mainKey) keys.push(mainKey);

  // Key 2: Each valid identifier (for identifier-based blocking)
  for (const id of product.identifiers) {
    if (id.isValid) {
      keys.push(`id:${id.type}:${id.normalized}`);
    }
  }

  // Key 3: Brand + quantity (for same-brand same-size matching)
  if (token.brandTokens.length > 0 && token.quantity !== null) {
    const brandKey = token.brandTokens.slice(0, 2).sort().join("_");
    keys.push(`bq:${brandKey}:${token.quantity}${token.unit ?? ""}`);
  }

  // Key 4: Brand only (for broader matching)
  if (token.brandTokens.length > 0) {
    const brandKey = token.brandTokens.slice(0, 2).sort().join("_");
    keys.push(`brand:${brandKey}`);
  }

  return [...new Set(keys)]; // deduplicate
}

/**
 * Generate candidate pairs from a set of products using blocking.
 * Groups products by shared blocking keys, then produces unique pairs.
 *
 * This avoids O(n²) by only comparing products that share at least one key.
 */
export function generateCandidates(
  products: ProductIdentityInput[],
  options?: {
    maxCandidatesPerProduct?: number;
    includeBrandBlocking?: boolean;
  }
): CandidatePair[] {
  const maxPerProduct = options?.maxCandidatesPerProduct ?? 50;
  const includeBrandBlocking = options?.includeBrandBlocking ?? true;

  // Build blocking index: key → product IDs
  const index = new Map<string, Set<string>>();
  const productMap = new Map<string, ProductIdentityInput>();

  for (const product of products) {
    productMap.set(product.id, product);
    const keys = generateBlockingKeys(product);

    for (const key of keys) {
      // Skip brand-only blocking if disabled (too broad)
      if (!includeBrandBlocking && key.startsWith("brand:")) continue;

      let set = index.get(key);
      if (!set) {
        set = new Set();
        index.set(key, set);
      }
      set.add(product.id);
    }
  }

  // Generate candidate pairs from shared blocking keys
  const pairSet = new Set<string>(); // "fromId:toId" for dedup
  const candidates: CandidatePair[] = [];

  for (const [key, productIds] of index) {
    if (productIds.size < 2) continue;
    // Skip overly broad keys (would create too many pairs)
    if (productIds.size > 500) continue;

    const ids = [...productIds];
    let pairsFromThisKey = 0;

    for (let i = 0; i < ids.length && pairsFromThisKey < maxPerProduct * 2; i++) {
      for (let j = i + 1; j < ids.length && pairsFromThisKey < maxPerProduct * 2; j++) {
        const fromId = ids[i]!;
        const toId = ids[j]!;

        // Ensure consistent ordering
        const [sortedFrom, sortedTo] = fromId < toId ? [fromId, toId] : [toId, fromId];
        const pairKey = `${sortedFrom}:${sortedTo}`;

        if (pairSet.has(pairKey)) continue;
        pairSet.add(pairKey);

        // Determine generation method
        const method = key.startsWith("id:") ? "identifier" : "blocking";
        const priority = key.startsWith("id:") ? 10 : key.startsWith("bq:") ? 5 : 0;

        candidates.push({
          fromProductId: sortedFrom,
          toProductId: sortedTo,
          generationMethod: method,
          blockingKey: key,
          priority,
        });

        pairsFromThisKey++;
      }
    }
  }

  // Sort by priority (higher first)
  candidates.sort((a, b) => b.priority - a.priority);

  // Limit per product
  const perProductCount = new Map<string, number>();
  const limited: CandidatePair[] = [];

  for (const candidate of candidates) {
    const fromCount = perProductCount.get(candidate.fromProductId) ?? 0;
    const toCount = perProductCount.get(candidate.toProductId) ?? 0;

    if (fromCount < maxPerProduct && toCount < maxPerProduct) {
      limited.push(candidate);
      perProductCount.set(candidate.fromProductId, fromCount + 1);
      perProductCount.set(candidate.toProductId, toCount + 1);
    }
  }

  return limited;
}

/**
 * Generate candidates for a single product against an existing set of products.
 * Used for incremental resolution (new observation → existing products).
 */
export function generateCandidatesForProduct(
  newProduct: ProductIdentityInput,
  existingProducts: ProductIdentityInput[],
  maxCandidates: number = 20
): CandidatePair[] {
  const newKeys = generateBlockingKeys(newProduct);
  const newKeySet = new Set(newKeys);

  // Score each existing product by shared blocking keys
  const scored: Array<{ product: ProductIdentityInput; sharedKeys: number; priority: number }> = [];

  for (const existing of existingProducts) {
    if (existing.id === newProduct.id) continue;
    if (existing.tenantId !== newProduct.tenantId) continue;

    const existingKeys = generateBlockingKeys(existing);
    let sharedKeys = 0;
    let maxPriority = 0;

    for (const key of existingKeys) {
      if (newKeySet.has(key)) {
        sharedKeys++;
        if (key.startsWith("id:")) maxPriority = Math.max(maxPriority, 10);
        else if (key.startsWith("bq:")) maxPriority = Math.max(maxPriority, 5);
        else maxPriority = Math.max(maxPriority, 0);
      }
    }

    if (sharedKeys > 0) {
      scored.push({ product: existing, sharedKeys, priority: maxPriority });
    }
  }

  // Sort by shared keys (more = better), then priority
  scored.sort((a, b) => {
    if (b.sharedKeys !== a.sharedKeys) return b.sharedKeys - a.sharedKeys;
    return b.priority - a.priority;
  });

  // Take top N
  return scored.slice(0, maxCandidates).map((s) => {
    const [fromId, toId] = newProduct.id < s.product.id
      ? [newProduct.id, s.product.id]
      : [s.product.id, newProduct.id];

    return {
      fromProductId: fromId,
      toProductId: toId,
      generationMethod: "blocking" as const,
      blockingKey: null,
      priority: s.priority,
    };
  });
}
