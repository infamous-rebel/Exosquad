// =============================================================================
// Worker — Normalization Pipeline
// =============================================================================
// Phase 3: Production-grade normalization pipeline that transforms raw
// observations into the canonical EXOSQUAD data model.
//
// Pipeline stages:
// 1. Field mapping (source-specific → intermediate)
// 2. Product name parsing
// 3. Text normalization
// 4. Unit normalization
// 5. Currency normalization
// 6. Country normalization
// 7. Barcode validation
// 8. Brand resolution
// 9. Entity matching (find or create Brand, Product, ProductVariant)
// 10. Evidence creation
// 11. Observation update
// =============================================================================

import { prisma, Prisma } from "@exosquad/database";
import { createChildLogger } from "@exosquad/logger";
import {
  parseProductName,
  normalizeText,
  normalizeBrandName,
  normalizeCountry,
  normalizeCurrencyCode,
  parsePriceString,
  normalizeCurrencyAmount,
  validateBarcode,
  parseQuantityUnit,
  createSearchKey,
  type DataQuality,
} from "@exosquad/normalization";
import {
  applyFieldMapping,
  parseFieldMapping,
  type FieldMapping,
} from "@exosquad/connector";

const pipelineLogger = createChildLogger({ module: "normalization-pipeline" });

// ─── Types ───────────────────────────────────────────────────────────────────

interface NormalizationContext {
  tenantId: string;
  sourceId: string;
  fieldMapping: FieldMapping | null;
}

interface NormalizationStats {
  total: number;
  normalized: number;
  failed: number;
  skipped: number;
  partial: number;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

/**
 * Process a batch of pending observations for a given source.
 * Returns statistics about the batch processing.
 */
export async function normalizeBatch(
  sourceId: string,
  tenantId: string,
  options?: { batchSize?: number }
): Promise<NormalizationStats> {
  const batchSize = options?.batchSize ?? 100;

  // Load source config for field mapping
  const source = await prisma.source.findFirst({
    where: { id: sourceId, tenantId },
    select: { config: true },
  });

  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const sourceConfig = source.config as Record<string, unknown>;
  const fieldMapping = sourceConfig.mapping
    ? parseFieldMapping(sourceConfig.mapping)
    : null;

  const context: NormalizationContext = {
    tenantId,
    sourceId,
    fieldMapping,
  };

  // Fetch pending observations in batches
  const stats: NormalizationStats = {
    total: 0,
    normalized: 0,
    failed: 0,
    skipped: 0,
    partial: 0,
  };

  let hasMore = true;
  while (hasMore) {
    const observations = await prisma.observation.findMany({
      where: {
        sourceId,
        tenantId,
        normalizationStatus: "pending",
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (observations.length === 0) {
      hasMore = false;
      break;
    }

    stats.total += observations.length;

    // Process each observation individually (record-level failure isolation)
    for (const observation of observations) {
      try {
        const result = await normalizeObservation(observation, context);
        switch (result) {
          case "normalized":
            stats.normalized++;
            break;
          case "partial":
            stats.partial++;
            break;
          case "failed":
            stats.failed++;
            break;
          case "skipped":
            stats.skipped++;
            break;
        }
      } catch (err) {
        stats.failed++;
        pipelineLogger.error(
          { observationId: observation.id, err },
          "Unexpected error normalizing observation"
        );

        // Mark as failed and record error
        await prisma.observation.update({
          where: { id: observation.id },
          data: {
            normalizationStatus: "failed",
            dataQuality: "invalid",
          },
        });

        await prisma.normalizationError.create({
          data: {
            tenantId,
            observationId: observation.id,
            sourceId,
            failureCategory: "parse_error",
            reason: err instanceof Error ? err.message : "Unknown error",
            rawRecord: observation.rawPayload as Prisma.InputJsonValue,
          },
        });
      }
    }

    // If we got fewer than batchSize, there are no more
    if (observations.length < batchSize) {
      hasMore = false;
    }
  }

  pipelineLogger.info(
    { sourceId, tenantId, ...stats },
    "Normalization batch completed"
  );

  return stats;
}

/**
 * Normalize a single observation.
 * Returns the result status: "normalized" | "partial" | "failed" | "skipped"
 */
async function normalizeObservation(
  observation: {
    id: string;
    tenantId: string;
    sourceId: string;
    rawPayload: Prisma.JsonValue;
    contentHash: string;
    observedAt: Date;
    retrievedAt: Date;
  },
  context: NormalizationContext
): Promise<"normalized" | "partial" | "failed" | "skipped"> {
  const rawPayload = observation.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object") {
    await recordFailure(observation, context, "schema_validation", "Raw payload is not an object");
    return "failed";
  }

  const record = rawPayload as Record<string, unknown>;

  // Step 1: Apply source-specific field mapping
  let mapped: Record<string, unknown>;
  if (context.fieldMapping) {
    try {
      mapped = applyFieldMapping(record, context.fieldMapping);
    } catch (err) {
      await recordFailure(observation, context, "schema_validation",
        `Field mapping failed: ${err instanceof Error ? err.message : "unknown"}`);
      return "failed";
    }
  } else {
    // No field mapping — use the raw record as-is
    mapped = record;
  }

  // Step 2: Extract product name and parse
  const nameStr = extractStringField(mapped, ["name", "title", "productName", "product_name", "productTitle"]);
  if (!nameStr) {
    await recordFailure(observation, context, "missing_required", "No product name found in record");
    return "failed";
  }

  const parsed = parseProductName(nameStr);
  let quality: DataQuality = "valid";

  // Step 3: Normalize brand
  let brandId: string | null = null;
  if (parsed.brand) {
    brandId = await findOrCreateBrand(context.tenantId, parsed.brand);
  }

  // Step 4: Normalize country
  const countryStr = extractStringField(mapped, ["country", "countryOfOrigin", "origin", "madeIn", "made_in"]);
  let normalizedCountry: string | null = null;
  if (countryStr) {
    const country = normalizeCountry(countryStr);
    if (country) {
      normalizedCountry = country.alpha2;
    }
  }

  // Step 5: Normalize currency/price
  const priceStr = extractStringField(mapped, ["price", "unitPrice", "unit_price", "amount", "cost"]);
  const currencyStr = extractStringField(mapped, ["currency", "currencyCode", "currency_code"]);
  let priceData: Prisma.InputJsonValue | null = null;
  if (priceStr) {
    const parsed_price = parsePriceString(priceStr);
    if (parsed_price) {
      const normalized = normalizeCurrencyAmount(parsed_price.amount, parsed_price.currency);
      priceData = normalized as unknown as Prisma.InputJsonValue;
    } else if (currencyStr) {
      const code = normalizeCurrencyCode(currencyStr);
      const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
      if (code && !isNaN(num)) {
        const normalized = normalizeCurrencyAmount(num, code);
        priceData = normalized as unknown as Prisma.InputJsonValue;
      }
    }
  }

  // Step 6: Validate barcode/GTIN
  let barcodeData: { type: string; value: string; valid: boolean } | null = null;
  const barcodeStr = extractStringField(mapped, ["barcode", "gtin", "upc", "ean", "gtin13", "gtin12", "gtin8", "gtin14"]);
  if (barcodeStr) {
    const validation = validateBarcode(barcodeStr);
    barcodeData = { type: validation.type, value: validation.normalized, valid: validation.valid };
  }

  // Step 7: Normalize unit/quantity
  let quantityData: { quantity: number | null; unit: string | null; packCount: number | null } = {
    quantity: parsed.netQuantity,
    unit: parsed.unit,
    packCount: parsed.packStructure?.packCount ?? null,
  };

  // Try extracting from dedicated fields if not in name
  if (!quantityData.quantity) {
    const qtyStr = extractStringField(mapped, ["quantity", "netQuantity", "net_quantity", "size", "volume", "weight"]);
    if (qtyStr) {
      const parsed_qty = parseQuantityUnit(qtyStr);
      if (parsed_qty) {
        quantityData.quantity = parsed_qty.quantity;
        quantityData.unit = parsed_qty.unit;
      }
    }
  }

  // Step 8: Find or create Product and ProductVariant
  let productId: string | null = null;
  let productVariantId: string | null = null;

  productId = await findOrCreateProduct(context.tenantId, {
    name: parsed.productCore || parsed.normalizedName,
    normalizedName: normalizeText(parsed.productCore || parsed.normalizedName),
    brandId,
    countryOfOrigin: normalizedCountry,
  });

  if (productId) {
    productVariantId = await findOrCreateVariant(productId, {
      name: parsed.variant,
      normalizedName: parsed.variant ? normalizeText(parsed.variant) : null,
      packCount: quantityData.packCount,
      perUnitQuantity: quantityData.quantity,
      perUnitUnit: quantityData.unit,
      totalQuantity: quantityData.quantity,
      quantityUnit: quantityData.unit,
    });
  }

  // Step 9: Create ProductIdentifier if barcode found
  if (barcodeData && productId) {
    await upsertIdentifier(context.tenantId, productId, context.sourceId, barcodeData);
  }

  // Step 10: Create evidence record
  if (productId) {
    const evidenceValue = {
      originalName: parsed.originalName,
      normalizedName: parsed.normalizedName,
      brand: parsed.brand,
      productCore: parsed.productCore,
      variant: parsed.variant,
      price: priceData,
      country: normalizedCountry,
      barcode: barcodeData,
    };

    await prisma.evidence.create({
      data: {
        tenantId: context.tenantId,
        entityType: "product",
        entityId: productId,
        productId,
        observationId: observation.id,
        sourceId: context.sourceId,
        evidenceType: "PRODUCT_IDENTITY",
        title: "Product identity from normalization",
        sourcePath: "$.normalized",
        extractedValue: evidenceValue as Prisma.InputJsonValue,
        normalizedValue: evidenceValue as Prisma.InputJsonValue,
        valueType: "json",
        confidence: brandId ? 0.8 : 0.5,
        confidenceBasis: ["normalization_pipeline"] as Prisma.InputJsonValue,
        extractionMethod: "automated",
        parserVersion: "exosquad-normalization/0.1.0",
        method: "automated",
        methodVersion: "exosquad-normalization/0.1.0",
        observedAt: observation.observedAt,
        retrievedAt: observation.retrievedAt,
      },
    });
  }

  // Step 11: Build normalized payload
  const normalizedPayload: Record<string, unknown> = {
    originalName: parsed.originalName,
    normalizedName: parsed.normalizedName,
    brand: parsed.brand,
    productCore: parsed.productCore,
    variant: parsed.variant,
    netQuantity: quantityData.quantity,
    unit: quantityData.unit,
    packStructure: parsed.packStructure ? {
      packCount: parsed.packStructure.packCount,
      perUnitQuantity: parsed.packStructure.perUnitQuantity,
      perUnitUnit: parsed.packStructure.perUnitUnit,
      totalQuantity: parsed.packStructure.totalQuantity,
      baseUnit: parsed.packStructure.baseUnit,
    } : null,
    country: normalizedCountry,
    price: priceData,
    barcode: barcodeData,
  };

  // Step 12: Determine data quality
  if (!parsed.brand && !brandId) quality = "partial";
  if (!parsed.productCore) quality = "partial";
  if (barcodeData && !barcodeData.valid) quality = "partial";

  // Step 13: Update observation
  const normStatus = quality === "valid" ? "normalized" : quality === "partial" ? "partial" : "normalized";
  await prisma.observation.update({
    where: { id: observation.id },
    data: {
      normalizationStatus: normStatus,
      normalizedPayload: normalizedPayload as Prisma.InputJsonValue,
      normalizedAt: new Date(),
      dataQuality: quality,
      brandId,
      productId,
      productVariantId,
    },
  });

  return quality === "valid" ? "normalized" : "partial";
}

// ─── Entity Matching ─────────────────────────────────────────────────────────

/**
 * Find or create a Brand entity for the tenant.
 * Uses normalized name matching for deterministic dedup.
 */
async function findOrCreateBrand(tenantId: string, brandName: string): Promise<string | null> {
  const normalizedName = normalizeBrandName(brandName);
  const searchKey = createSearchKey(brandName);

  if (!normalizedName) return null;

  // Try to find existing brand by normalized name
  const existing = await prisma.brand.findFirst({
    where: {
      tenantId,
      normalizedName,
      status: "active",
    },
  });

  if (existing) return existing.id;

  // Also check by search key for fuzzy matches
  const bySearchKey = await prisma.brand.findFirst({
    where: {
      tenantId,
      searchKey,
      status: "active",
    },
  });

  if (bySearchKey) return bySearchKey.id;

  // Create new brand
  try {
    const created = await prisma.brand.create({
      data: {
        tenantId,
        name: brandName,
        normalizedName,
        searchKey,
      },
    });
    return created.id;
  } catch (err) {
    // Unique constraint violation — another job created it concurrently
    const errCode = (err as { code?: string })?.code;
    if (errCode === "P2002") {
      const retry = await prisma.brand.findFirst({
        where: { tenantId, normalizedName, status: "active" },
      });
      return retry?.id ?? null;
    }
    pipelineLogger.error({ err, tenantId, brandName }, "Failed to create brand");
    return null;
  }
}

/**
 * Find or create a Product entity.
 * Uses normalized name + brand matching for deterministic dedup.
 */
async function findOrCreateProduct(
  tenantId: string,
  data: {
    name: string;
    normalizedName: string;
    brandId: string | null;
    countryOfOrigin: string | null;
  }
): Promise<string | null> {
  if (!data.normalizedName) return null;

  // Try to find by exact normalized name + brand
  const existing = await prisma.product.findFirst({
    where: {
      tenantId,
      normalizedName: data.normalizedName,
      brandId: data.brandId,
      status: "active",
    },
  });

  if (existing) return existing.id;

  // Create new product
  try {
    const created = await prisma.product.create({
      data: {
        tenantId,
        name: data.name,
        normalizedName: data.normalizedName,
        brandId: data.brandId,
        countryOfOrigin: data.countryOfOrigin,
        confidence: data.brandId ? 0.7 : 0.3,
      },
    });
    return created.id;
  } catch (err) {
    const errCode = (err as { code?: string })?.code;
    if (errCode === "P2002") {
      const retry = await prisma.product.findFirst({
        where: { tenantId, normalizedName: data.normalizedName, brandId: data.brandId, status: "active" },
      });
      return retry?.id ?? null;
    }
    pipelineLogger.error({ err, tenantId, name: data.name }, "Failed to create product");
    return null;
  }
}

/**
 * Find or create a ProductVariant.
 */
async function findOrCreateVariant(
  productId: string,
  data: {
    name: string | null;
    normalizedName: string | null;
    packCount: number | null;
    perUnitQuantity: number | null;
    perUnitUnit: string | null;
    totalQuantity: number | null;
    quantityUnit: string | null;
  }
): Promise<string | null> {
  // Try to find by product + normalized variant name + pack structure
  const existing = await prisma.productVariant.findFirst({
    where: {
      productId,
      normalizedName: data.normalizedName,
      packCount: data.packCount,
      perUnitUnit: data.perUnitUnit,
    },
  });

  if (existing) return existing.id;

  // Create new variant
  try {
    const created = await prisma.productVariant.create({
      data: {
        productId,
        name: data.name,
        normalizedName: data.normalizedName,
        packCount: data.packCount,
        perUnitQuantity: data.perUnitQuantity !== null ? new Prisma.Decimal(data.perUnitQuantity) : null,
        perUnitUnit: data.perUnitUnit,
        totalQuantity: data.totalQuantity !== null ? new Prisma.Decimal(data.totalQuantity) : null,
        netQuantity: data.totalQuantity !== null ? new Prisma.Decimal(data.totalQuantity) : null,
        quantityUnit: data.quantityUnit,
      },
    });
    return created.id;
  } catch (err) {
    pipelineLogger.error({ err, productId, variant: data.name }, "Failed to create variant");
    return null;
  }
}

/**
 * Upsert a product identifier (barcode/GTIN).
 */
async function upsertIdentifier(
  tenantId: string,
  productId: string,
  sourceId: string,
  barcode: { type: string; value: string; valid: boolean }
): Promise<void> {
  if (!barcode.value) return;

  const typeMap: Record<string, string> = {
    "GTIN-8": "gtin8",
    "GTIN-12": "gtin12",
    "GTIN-13": "gtin13",
    "GTIN-14": "gtin14",
  };

  const idType = typeMap[barcode.type] ?? "gtin13";

  try {
    await prisma.productIdentifier.upsert({
      where: {
        tenantId_type_normalized: {
          tenantId,
          type: idType,
          normalized: barcode.value,
        },
      },
      create: {
        productId,
        tenantId,
        type: idType,
        value: barcode.value,
        normalized: barcode.value,
        isValid: barcode.valid,
        sourceId,
      },
      update: {
        isValid: barcode.valid,
      },
    });
  } catch (err) {
    pipelineLogger.error({ err, productId, barcode }, "Failed to upsert identifier");
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Record a normalization failure for an observation.
 */
async function recordFailure(
  observation: { id: string; tenantId: string; sourceId: string; rawPayload: Prisma.JsonValue },
  context: NormalizationContext,
  category: string,
  reason: string
): Promise<void> {
  await prisma.observation.update({
    where: { id: observation.id },
    data: {
      normalizationStatus: "failed",
      dataQuality: "invalid",
    },
  });

  await prisma.normalizationError.create({
    data: {
      tenantId: context.tenantId,
      observationId: observation.id,
      sourceId: context.sourceId,
      failureCategory: category,
      reason: reason.substring(0, 2000),
      rawRecord: observation.rawPayload as Prisma.InputJsonValue,
    },
  });
}

/**
 * Extract a string field from a record, trying multiple field names.
 */
function extractStringField(record: Record<string, unknown>, fieldNames: string[]): string | null {
  for (const name of fieldNames) {
    const value = record[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
