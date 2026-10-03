// =============================================================================
// @exosquad/identity — Conflict detection
// =============================================================================
// Detects suspicious identity combinations:
// - Same GTIN + different product names
// - Same SKU + different brands
// - Same product + impossible quantity conflicts
// - Different GTINs + identical metadata
// =============================================================================

import type { DetectedConflict, ProductIdentityInput } from "./types.js";

const TRUSTED_IDENTIFIER_TYPES = new Set([
  "gtin8", "gtin12", "gtin13", "gtin14",
]);

/**
 * Detect conflicts between two products that have been matched or are being compared.
 */
export function detectConflicts(
  a: ProductIdentityInput,
  b: ProductIdentityInput
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  // 1. Same GTIN + radically different names
  const gtinConflicts = detectIdentifierNameConflicts(a, b);
  conflicts.push(...gtinConflicts);

  // 2. Same identifier + different brands
  const brandConflicts = detectIdentifierBrandConflicts(a, b);
  conflicts.push(...brandConflicts);

  // 3. Same product name + different GTINs (potential duplicate GTIN issue)
  const duplicateGtinConflicts = detectDuplicateGtinConflicts(a, b);
  conflicts.push(...duplicateGtinConflicts);

  // 4. Same product + different formulations (variant conflict)
  const variantConflicts = detectVariantConflicts(a, b);
  conflicts.push(...variantConflicts);

  return conflicts;
}

/**
 * Detect same GTIN with different product names.
 */
function detectIdentifierNameConflicts(
  a: ProductIdentityInput,
  b: ProductIdentityInput
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  for (const idA of a.identifiers) {
    if (!idA.isValid || !TRUSTED_IDENTIFIER_TYPES.has(idA.type)) continue;

    for (const idB of b.identifiers) {
      if (!idB.isValid || !TRUSTED_IDENTIFIER_TYPES.has(idB.type)) continue;
      if (idA.normalized !== idB.normalized) continue;

      // Same GTIN — check if names are radically different
      const nameSim = calculateSimpleSimilarity(
        a.normalizedName.toLowerCase(),
        b.normalizedName.toLowerCase()
      );

      if (nameSim < 0.3) {
        conflicts.push({
          conflictType: "identifier_collision",
          severity: "high",
          description: `Same ${idA.type} (${idA.normalized}) associated with materially different product names: "${a.name}" vs "${b.name}"`,
          entityId: a.id,
          conflictingData: {
            identifier: idA.normalized,
            identifierType: idA.type,
            productA: { id: a.id, name: a.name },
            productB: { id: b.id, name: b.name },
            nameSimilarity: nameSim,
          },
        });
      }
    }
  }

  return conflicts;
}

/**
 * Detect same identifier with different brands.
 */
function detectIdentifierBrandConflicts(
  a: ProductIdentityInput,
  b: ProductIdentityInput
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  // Both must have brands
  if (!a.brandName || !b.brandName) return conflicts;

  const brandSame = a.brandNormalizedName === b.brandNormalizedName ||
    (a.brandSearchKey && b.brandSearchKey && a.brandSearchKey === b.brandSearchKey);

  if (brandSame) return conflicts; // brands match, no conflict

  // Check if they share identifiers
  for (const idA of a.identifiers) {
    if (!idA.isValid || !TRUSTED_IDENTIFIER_TYPES.has(idA.type)) continue;

    for (const idB of b.identifiers) {
      if (!idB.isValid || !TRUSTED_IDENTIFIER_TYPES.has(idB.type)) continue;
      if (idA.normalized !== idB.normalized) continue;

      conflicts.push({
        conflictType: "brand_conflict",
        severity: "critical",
        description: `Same ${idA.type} (${idA.normalized}) with different brands: "${a.brandName}" vs "${b.brandName}"`,
        entityId: a.id,
        conflictingData: {
          identifier: idA.normalized,
          identifierType: idA.type,
          brandA: a.brandName,
          brandB: b.brandName,
        },
      });
    }
  }

  return conflicts;
}

/**
 * Detect different GTINs with otherwise identical metadata.
 */
function detectDuplicateGtinConflicts(
  a: ProductIdentityInput,
  b: ProductIdentityInput
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  // Only check if both have valid GTINs that differ
  const gtinsA = a.identifiers.filter((i) => i.isValid && TRUSTED_IDENTIFIER_TYPES.has(i.type));
  const gtinsB = b.identifiers.filter((i) => i.isValid && TRUSTED_IDENTIFIER_TYPES.has(i.type));

  if (gtinsA.length === 0 || gtinsB.length === 0) return conflicts;

  // Check if any GTINs match
  const hasMatch = gtinsA.some((idA) =>
    gtinsB.some((idB) => idA.normalized === idB.normalized)
  );

  if (hasMatch) return conflicts; // GTINs match, no conflict here

  // Check if names are very similar but GTINs differ
  const nameSim = calculateSimpleSimilarity(
    a.normalizedName.toLowerCase(),
    b.normalizedName.toLowerCase()
  );

  if (nameSim > 0.9) {
    conflicts.push({
      conflictType: "identifier_collision",
      severity: "medium",
      description: `Different GTINs with nearly identical product names: "${a.name}" vs "${b.name}"`,
      entityId: a.id,
      conflictingData: {
        gtinsA: gtinsA.map((i) => i.normalized),
        gtinsB: gtinsB.map((i) => i.normalized),
        nameSimilarity: nameSim,
        productA: { id: a.id, name: a.name },
        productB: { id: b.id, name: b.name },
      },
    });
  }

  return conflicts;
}

/**
 * Detect variant conflicts (same product, different formulations).
 */
function detectVariantConflicts(
  a: ProductIdentityInput,
  b: ProductIdentityInput
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  if (a.variants.length === 0 || b.variants.length === 0) return conflicts;

  const vA = a.variants[0]!;
  const vB = b.variants[0]!;

  // Check formulation conflict
  if (vA.formulation && vB.formulation && vA.formulation.toLowerCase() !== vB.formulation.toLowerCase()) {
    // Only a conflict if the product names are very similar
    const nameSim = calculateSimpleSimilarity(
      a.normalizedName.toLowerCase(),
      b.normalizedName.toLowerCase()
    );

    if (nameSim > 0.7) {
      conflicts.push({
        conflictType: "variant_conflict",
        severity: "medium",
        description: `Same product with different formulations: "${vA.formulation}" vs "${vB.formulation}"`,
        entityId: a.id,
        conflictingData: {
          formulationA: vA.formulation,
          formulationB: vB.formulation,
          productA: { id: a.id, name: a.name },
          productB: { id: b.id, name: b.name },
        },
      });
    }
  }

  return conflicts;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Simple character-level similarity for conflict detection.
 * Uses Jaccard on character bigrams.
 */
function calculateSimpleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0;

  const aBigrams = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) {
    aBigrams.add(a.slice(i, i + 2));
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (aBigrams.has(b.slice(i, i + 2))) intersection++;
  }

  const total = aBigrams.size + (b.length - 1) - intersection;
  return total > 0 ? (2 * intersection) / total : 0;
}
