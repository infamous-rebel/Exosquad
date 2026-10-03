// =============================================================================
// API — Authenticity Calculation Engine (Phase 8 — Original Roadmap)
// =============================================================================
// Pure, deterministic calculation engine for authenticity assessment.
// Consumes evidence, product, seller, supplier, and brand data to produce
// authenticity scores, confidence, risk assessments, and status.
//
// No AI, no heuristics — deterministic math with documented formulas.
// Same inputs → same outputs. Every score is explainable.
// No database side effects — this module is a pure function.
// =============================================================================

import { createHash } from "node:crypto";
import {
  AUTHENTICITY_CONFIG,
  type AuthenticitySignalType,
  type AuthenticityRiskType,
} from "@exosquad/common";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface EvidenceSummary {
  id: string;
  sourceId: string | null;
  evidenceType: string;
  entityType: string;
  entityId: string;
  confidence: number;
  status: string;
  freshness: string;
  contentHash: string | null;
  extractedValue: Record<string, unknown> | null;
  normalizedValue: Record<string, unknown> | null;
  observedAt: Date;
}

export interface SubjectData {
  tenantId: string;
  subjectType: string; // PRODUCT | SKU | BRAND | SELLER | SUPPLIER | LISTING | DOCUMENT
  subjectId: string;

  // Product-specific
  productName?: string;
  normalizedProductName?: string;
  brandId?: string | null;
  brandName?: string | null;
  sku?: string | null;
  gtin?: string | null;
  mpn?: string | null;
  countryOfOrigin?: string | null;
  description?: string | null;
  attributes?: Record<string, unknown>;

  // Seller-specific
  sellerName?: string;
  sellerDomain?: string | null;
  sellerCountry?: string | null;
  sellerRating?: number | null;
  sellerReviewCount?: number | null;

  // Supplier-specific
  supplierName?: string;
  supplierDomain?: string | null;
  supplierCountry?: string | null;
  supplierRole?: string | null;

  // Listing-specific
  listingUrl?: string | null;
  listingPrice?: number | null;
  listingCurrency?: string | null;

  // Document-specific
  documentType?: string | null;
  documentValidated?: boolean | null;
}

export interface SourceMetadata {
  sourceId: string;
  type: string;
  healthStatus: string;
  totalFetched: number;
  consecutiveErrors: number;
}

export interface AuthenticityEngineInput {
  tenantId: string;
  subject: SubjectData;
  evidence: EvidenceSummary[];
  sources: SourceMetadata[];
  /** Existing evidence conflicts for this entity */
  conflicts: Array<{
    id: string;
    conflictType: string;
    description: string;
    status: string;
    supportingEvidenceId: string;
    contradictingEvidenceId: string;
  }>;
}

// ─── Signal Record ───────────────────────────────────────────────────────────

export interface SignalRecord {
  signalType: AuthenticitySignalType;
  direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "UNKNOWN";
  score: number; // 0.0–1.0
  weight: number; // 0.0–2.0
  confidence: number; // 0.0–1.0
  subjectType: string | null;
  subjectId: string | null;
  evidenceId: string | null;
  metadata: Record<string, unknown>;
}

// ─── Risk Record ─────────────────────────────────────────────────────────────

export interface RiskRecord {
  riskType: AuthenticityRiskType;
  severity: "low" | "medium" | "high" | "critical";
  score: number; // 0.0–1.0
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
}

// ─── Score Breakdown ─────────────────────────────────────────────────────────

export interface AuthenticityScoreBreakdown {
  identityScore: number;       // 0–100
  brandScore: number;          // 0–100
  sellerScore: number;         // 0–100
  supplierScore: number;       // 0–100
  listingScore: number;        // 0–100
  documentScore: number;       // 0–100
  priceScore: number;          // 0–100
  corroborationScore: number;  // 0–100
  contradictionPenalty: number; // 0–100
  finalScore: number;          // 0–100
}

// ─── Confidence Breakdown ────────────────────────────────────────────────────

export interface ConfidenceBreakdown {
  evidenceQuantityScore: number;  // 0.0–1.0
  evidenceQualityScore: number;   // 0.0–1.0
  independenceScore: number;      // 0.0–1.0
  completenessScore: number;      // 0.0–1.0
  consistencyScore: number;       // 0.0–1.0
  finalConfidence: number;        // 0.0–1.0
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface AuthenticityEngineResult {
  tenantId: string;
  subjectType: string;
  subjectId: string;
  status: string;
  score: number;
  confidence: number;
  algorithmVersion: string;
  inputHash: string;
  calculationHash: string;
  signals: SignalRecord[];
  risks: RiskRecord[];
  scoreBreakdown: AuthenticityScoreBreakdown;
  confidenceBreakdown: ConfidenceBreakdown;
  evidenceCount: number;
  signalCount: number;
  contradictionCount: number;
  positiveSignalCount: number;
  negativeSignalCount: number;
  dataCompleteness: number;
  sourceDiversity: number;
  evidenceIds: string[];
}

// ─── Pure Calculation Engine ─────────────────────────────────────────────────

/**
 * Compute the SHA-256 input hash for deduplication.
 */
function computeInputHash(input: AuthenticityEngineInput): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    subjectType: input.subject.subjectType,
    subjectId: input.subject.subjectId,
    evidenceIds: input.evidence.map((e) => e.id).sort(),
    evidenceVersions: input.evidence
      .map((e) => `${e.id}:${e.contentHash ?? "null"}`)
      .sort(),
    conflictIds: input.conflicts.map((c) => c.id).sort(),
    algorithmVersion: AUTHENTICITY_CONFIG.algorithmVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Generate product identity signals from evidence.
 */
function generateProductSignals(
  subject: SubjectData,
  evidence: EvidenceSummary[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  // Look for product identity evidence
  const identityEvidence = evidence.filter(
    (e) =>
      e.evidenceType === "PRODUCT_IDENTITY" ||
      e.evidenceType === "PRODUCT_NAME" ||
      e.evidenceType === "PRODUCT_VARIANT" ||
      e.evidenceType === "PRODUCT_IDENTIFIER"
  );

  if (identityEvidence.length === 0) {
    signals.push({
      signalType: "PRODUCT_IDENTITY_MATCH",
      direction: "UNKNOWN",
      score: 0,
      weight: 1.0,
      confidence: 0,
      subjectType: "product",
      subjectId: subject.subjectId,
      evidenceId: null,
      metadata: { reason: "no_product_identity_evidence" },
    });
    return signals;
  }

  // Group by source to detect cross-source agreement
  const bySource = new Map<string, EvidenceSummary[]>();
  for (const e of identityEvidence) {
    const sourceId = e.sourceId ?? "unknown";
    if (!bySource.has(sourceId)) bySource.set(sourceId, []);
    bySource.get(sourceId)!.push(e);
  }

  // Check for identifier matches across sources
  const skuValues = new Set<string>();
  const gtinValues = new Set<string>();
  const nameValues = new Set<string>();

  for (const e of identityEvidence) {
    const val = e.normalizedValue ?? e.extractedValue;
    if (!val) continue;

    if (val.sku) skuValues.add(String(val.sku).toUpperCase());
    if (val.gtin) gtinValues.add(String(val.gtin));
    if (val.ean) gtinValues.add(String(val.ean));
    if (val.upc) gtinValues.add(String(val.upc));
    if (val.name) nameValues.add(String(val.name).toLowerCase().trim());
  }

  // SKU match signal
  if (skuValues.size > 0) {
    const hasMatch = subject.sku && skuValues.has(subject.sku.toUpperCase());
    const hasConflict = skuValues.size > 1;

    if (hasConflict) {
      signals.push({
        signalType: "SKU_MATCH",
        direction: "NEGATIVE",
        score: 0.3,
        weight: 1.5,
        confidence: 0.8,
        subjectType: "product",
        subjectId: subject.subjectId,
        evidenceId: identityEvidence[0]?.id ?? null,
        metadata: { skuValues: [...skuValues], conflict: true },
      });
    } else if (hasMatch) {
      signals.push({
        signalType: "SKU_MATCH",
        direction: "POSITIVE",
        score: 0.9,
        weight: 1.5,
        confidence: 0.9,
        subjectType: "product",
        subjectId: subject.subjectId,
        evidenceId: identityEvidence[0]?.id ?? null,
        metadata: { skuValues: [...skuValues], conflict: false },
      });
    } else {
      signals.push({
        signalType: "SKU_MATCH",
        direction: "NEUTRAL",
        score: 0.5,
        weight: 1.0,
        confidence: 0.6,
        subjectType: "product",
        subjectId: subject.subjectId,
        evidenceId: identityEvidence[0]?.id ?? null,
        metadata: { skuValues: [...skuValues], conflict: false },
      });
    }
  }

  // Barcode/GTIN match signal
  if (gtinValues.size > 0) {
    const subjectGtin = subject.gtin?.toUpperCase();
    const hasMatch = subjectGtin && gtinValues.has(subjectGtin);
    const hasConflict = gtinValues.size > 1;

    if (hasConflict) {
      signals.push({
        signalType: "BARCODE_MATCH",
        direction: "NEGATIVE",
        score: 0.2,
        weight: 2.0,
        confidence: 0.9,
        subjectType: "product",
        subjectId: subject.subjectId,
        evidenceId: identityEvidence[0]?.id ?? null,
        metadata: { gtinValues: [...gtinValues], conflict: true },
      });
    } else if (hasMatch) {
      signals.push({
        signalType: "BARCODE_MATCH",
        direction: "POSITIVE",
        score: 1.0,
        weight: 2.0,
        confidence: 0.95,
        subjectType: "product",
        subjectId: subject.subjectId,
        evidenceId: identityEvidence[0]?.id ?? null,
        metadata: { gtinValues: [...gtinValues], conflict: false },
      });
    }
  }

  // Name match signal
  if (nameValues.size > 0 && subject.normalizedProductName) {
    const normalizedName = subject.normalizedProductName.toLowerCase().trim();
    const hasMatch = nameValues.has(normalizedName);
    const matchCount = [...nameValues].filter(
      (n) => n.includes(normalizedName) || normalizedName.includes(n)
    ).length;

    if (hasMatch || matchCount > 0) {
      signals.push({
        signalType: "PRODUCT_IDENTITY_MATCH",
        direction: "POSITIVE",
        score: Math.min(1.0, 0.5 + matchCount * 0.15),
        weight: 1.0,
        confidence: Math.min(0.9, 0.5 + matchCount * 0.1),
        subjectType: "product",
        subjectId: subject.subjectId,
        evidenceId: identityEvidence[0]?.id ?? null,
        metadata: { nameValues: [...nameValues].slice(0, 5), matchCount },
      });
    } else {
      signals.push({
        signalType: "PRODUCT_IDENTITY_MATCH",
        direction: "NEGATIVE",
        score: 0.3,
        weight: 1.0,
        confidence: 0.6,
        subjectType: "product",
        subjectId: subject.subjectId,
        evidenceId: identityEvidence[0]?.id ?? null,
        metadata: { nameValues: [...nameValues].slice(0, 5), matchCount: 0 },
      });
    }
  }

  return signals;
}

/**
 * Generate brand/manufacturer signals from evidence.
 */
function generateBrandSignals(
  subject: SubjectData,
  evidence: EvidenceSummary[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  const brandEvidence = evidence.filter(
    (e) =>
      e.evidenceType === "BRAND_IDENTITY" ||
      e.evidenceType === "MANUFACTURER_RELATIONSHIP" ||
      e.evidenceType === "DISTRIBUTOR_RELATIONSHIP"
  );

  if (brandEvidence.length === 0) {
    signals.push({
      signalType: "BRAND_MATCH",
      direction: "UNKNOWN",
      score: 0,
      weight: 1.0,
      confidence: 0,
      subjectType: "brand",
      subjectId: subject.brandId ?? null,
      evidenceId: null,
      metadata: { reason: "no_brand_evidence" },
    });
    return signals;
  }

  // Check brand consistency
  const brandNames = new Set<string>();
  for (const e of brandEvidence) {
    const val = e.normalizedValue ?? e.extractedValue;
    if (val?.brandName) brandNames.add(String(val.brandName).toLowerCase().trim());
    if (val?.name) brandNames.add(String(val.name).toLowerCase().trim());
  }

  if (subject.brandName) {
    const normalizedName = subject.brandName.toLowerCase().trim();
    const hasMatch = brandNames.has(normalizedName);

    signals.push({
      signalType: "BRAND_MATCH",
      direction: hasMatch ? "POSITIVE" : "NEGATIVE",
      score: hasMatch ? 0.85 : 0.3,
      weight: 1.5,
      confidence: hasMatch ? 0.8 : 0.6,
      subjectType: "brand",
      subjectId: subject.brandId ?? null,
      evidenceId: brandEvidence[0]?.id ?? null,
      metadata: { brandNames: [...brandNames].slice(0, 5) },
    });
  }

  // Check for authorized distributor evidence
  const authEvidence = brandEvidence.filter(
    (e) => e.evidenceType === "DISTRIBUTOR_RELATIONSHIP"
  );
  if (authEvidence.length > 0) {
    signals.push({
      signalType: "AUTHORIZED_DISTRIBUTOR_EVIDENCE",
      direction: "POSITIVE",
      score: 0.7,
      weight: 1.5,
      confidence: 0.7,
      subjectType: "brand",
      subjectId: subject.brandId ?? null,
      evidenceId: authEvidence[0]!.id,
      metadata: { count: authEvidence.length },
    });
  }

  return signals;
}

/**
 * Generate seller signals from evidence.
 */
function generateSellerSignals(
  subject: SubjectData,
  evidence: EvidenceSummary[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  const sellerEvidence = evidence.filter(
    (e) =>
      e.evidenceType === "SELLER_IDENTITY" ||
      e.evidenceType === "SELLER_LISTING"
  );

  if (sellerEvidence.length === 0) {
    signals.push({
      signalType: "SELLER_IDENTITY_MATCH",
      direction: "UNKNOWN",
      score: 0,
      weight: 1.0,
      confidence: 0,
      subjectType: "seller",
      subjectId: subject.subjectId,
      evidenceId: null,
      metadata: { reason: "no_seller_evidence" },
    });
    return signals;
  }

  // Seller identity consistency
  const sellerNames = new Set<string>();
  const sellerDomains = new Set<string>();
  for (const e of sellerEvidence) {
    const val = e.normalizedValue ?? e.extractedValue;
    if (val?.name) sellerNames.add(String(val.name).toLowerCase().trim());
    if (val?.domain) sellerDomains.add(String(val.domain).toLowerCase().trim());
    if (val?.storefrontName) sellerNames.add(String(val.storefrontName).toLowerCase().trim());
  }

  if (subject.sellerName) {
    const normalizedName = subject.sellerName.toLowerCase().trim();
    const hasMatch = sellerNames.has(normalizedName);

    signals.push({
      signalType: "SELLER_IDENTITY_MATCH",
      direction: hasMatch ? "POSITIVE" : "NEGATIVE",
      score: hasMatch ? 0.8 : 0.3,
      weight: 1.0,
      confidence: 0.7,
      subjectType: "seller",
      subjectId: subject.subjectId,
      evidenceId: sellerEvidence[0]?.id ?? null,
      metadata: { sellerNames: [...sellerNames].slice(0, 5) },
    });
  }

  // Seller source consistency
  if (sellerDomains.size > 0 && subject.sellerDomain) {
    const hasMatch = sellerDomains.has(subject.sellerDomain.toLowerCase().trim());
    signals.push({
      signalType: "SELLER_SOURCE_CONSISTENCY",
      direction: hasMatch ? "POSITIVE" : "NEGATIVE",
      score: hasMatch ? 0.75 : 0.25,
      weight: 1.0,
      confidence: 0.6,
      subjectType: "seller",
      subjectId: subject.subjectId,
      evidenceId: sellerEvidence[0]?.id ?? null,
      metadata: { sellerDomains: [...sellerDomains].slice(0, 5) },
    });
  }

  // Seller rating signal (contextual — high rating ≠ authenticity proof)
  if (subject.sellerRating !== null && subject.sellerRating !== undefined) {
    const ratingScore = Math.min(1.0, subject.sellerRating / 5.0);
    signals.push({
      signalType: "SELLER_HISTORY",
      direction: ratingScore > 0.6 ? "POSITIVE" : "NEUTRAL",
      score: ratingScore * 0.5, // Cap at 0.5 — ratings are weak signals
      weight: 0.5,
      confidence: 0.4, // Low confidence — ratings are not proof
      subjectType: "seller",
      subjectId: subject.subjectId,
      evidenceId: null,
      metadata: {
        rating: subject.sellerRating,
        reviewCount: subject.sellerReviewCount ?? 0,
        note: "rating_is_contextual_not_proof",
      },
    });
  }

  return signals;
}

/**
 * Generate supplier signals from evidence.
 */
function generateSupplierSignals(
  subject: SubjectData,
  evidence: EvidenceSummary[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  const supplierEvidence = evidence.filter(
    (e) =>
      e.evidenceType === "SUPPLIER_IDENTITY" ||
      e.evidenceType === "SUPPLIER_OFFER" ||
      e.evidenceType === "MANUFACTURER_RELATIONSHIP"
  );

  if (supplierEvidence.length === 0) {
    signals.push({
      signalType: "SUPPLIER_IDENTITY_MATCH",
      direction: "UNKNOWN",
      score: 0,
      weight: 1.0,
      confidence: 0,
      subjectType: "supplier",
      subjectId: subject.subjectId,
      evidenceId: null,
      metadata: { reason: "no_supplier_evidence" },
    });
    return signals;
  }

  // Supplier identity consistency
  const supplierNames = new Set<string>();
  for (const e of supplierEvidence) {
    const val = e.normalizedValue ?? e.extractedValue;
    if (val?.name) supplierNames.add(String(val.name).toLowerCase().trim());
    if (val?.supplierName) supplierNames.add(String(val.supplierName).toLowerCase().trim());
  }

  if (subject.supplierName) {
    const normalizedName = subject.supplierName.toLowerCase().trim();
    const hasMatch = supplierNames.has(normalizedName);

    signals.push({
      signalType: "SUPPLIER_IDENTITY_MATCH",
      direction: hasMatch ? "POSITIVE" : "NEGATIVE",
      score: hasMatch ? 0.8 : 0.3,
      weight: 1.0,
      confidence: 0.7,
      subjectType: "supplier",
      subjectId: subject.subjectId,
      evidenceId: supplierEvidence[0]?.id ?? null,
      metadata: { supplierNames: [...supplierNames].slice(0, 5) },
    });
  }

  // Supplier-manufacturer relationship
  const mfgEvidence = supplierEvidence.filter(
    (e) => e.evidenceType === "MANUFACTURER_RELATIONSHIP"
  );
  if (mfgEvidence.length > 0) {
    signals.push({
      signalType: "SUPPLIER_MANUFACTURER_RELATIONSHIP",
      direction: "POSITIVE",
      score: 0.7,
      weight: 1.5,
      confidence: 0.6,
      subjectType: "supplier",
      subjectId: subject.subjectId,
      evidenceId: mfgEvidence[0]!.id,
      metadata: { count: mfgEvidence.length },
    });
  }

  // Supplier documentation
  const docEvidence = supplierEvidence.filter(
    (e) => (e.normalizedValue ?? e.extractedValue)?.documentation
  );
  if (docEvidence.length > 0) {
    signals.push({
      signalType: "SUPPLIER_DOCUMENTATION",
      direction: "POSITIVE",
      score: 0.6,
      weight: 1.0,
      confidence: 0.5,
      subjectType: "supplier",
      subjectId: subject.subjectId,
      evidenceId: docEvidence[0]!.id,
      metadata: { count: docEvidence.length },
    });
  }

  return signals;
}

/**
 * Generate price anomaly signals.
 */
function generatePriceSignals(
  subject: SubjectData,
  evidence: EvidenceSummary[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  const priceEvidence = evidence.filter((e) => e.evidenceType === "PRICE");

  if (priceEvidence.length === 0 && subject.listingPrice == null) {
    return signals; // No price data — no signal
  }

  // Collect all price observations
  const prices: number[] = [];
  if (subject.listingPrice != null) prices.push(subject.listingPrice);

  for (const e of priceEvidence) {
    const val = e.normalizedValue ?? e.extractedValue;
    if (val?.price != null) {
      const price = Number(val.price);
      if (!isNaN(price) && price > 0) prices.push(price);
    }
  }

  if (prices.length < 2) {
    // Can't compute anomaly with < 2 data points
    if (prices.length === 1) {
      signals.push({
        signalType: "PRICE_ANOMALY",
        direction: "UNKNOWN",
        score: 0,
        weight: 1.0,
        confidence: 0.2,
        subjectType: "listing",
        subjectId: null,
        evidenceId: priceEvidence[0]?.id ?? null,
        metadata: { reason: "insufficient_price_data", priceCount: 1 },
      });
    }
    return signals;
  }

  // Calculate statistical anomaly
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Calculate IQR for outlier detection
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  // Check if the listing price is an anomaly
  if (subject.listingPrice != null) {
    const deviationFromMedian = Math.abs(subject.listingPrice - median) / median;
    const isOutlier = subject.listingPrice < lowerBound || subject.listingPrice > upperBound;

    if (isOutlier && deviationFromMedian > 0.5) {
      // Extreme discount or extreme premium
      const isDiscount = subject.listingPrice < median;
      signals.push({
        signalType: "PRICE_ANOMALY",
        direction: "NEGATIVE",
        score: Math.min(1.0, deviationFromMedian),
        weight: 1.5,
        confidence: Math.min(0.9, 0.5 + deviationFromMedian * 0.3),
        subjectType: "listing",
        subjectId: null,
        evidenceId: priceEvidence[0]?.id ?? null,
        metadata: {
          listingPrice: subject.listingPrice,
          median,
          mean,
          deviation: deviationFromMedian,
          isDiscount,
          isOutlier: true,
        },
      });

      if (isDiscount && deviationFromMedian > 0.7) {
        signals.push({
          signalType: "EXTREME_DISCOUNT",
          direction: "NEGATIVE",
          score: Math.min(1.0, deviationFromMedian),
          weight: 1.5,
          confidence: 0.7,
          subjectType: "listing",
          subjectId: null,
          evidenceId: priceEvidence[0]?.id ?? null,
          metadata: { discount: deviationFromMedian, listingPrice: subject.listingPrice, median },
        });
      }
    } else if (deviationFromMedian < 0.15) {
      signals.push({
        signalType: "PRICE_ANOMALY",
        direction: "POSITIVE",
        score: 0.7,
        weight: 0.5,
        confidence: 0.6,
        subjectType: "listing",
        subjectId: null,
        evidenceId: priceEvidence[0]?.id ?? null,
        metadata: { deviation: deviationFromMedian, note: "price_consistent" },
      });
    }
  }

  // Price dispersion signal
  if (prices.length >= 3) {
    const cv = (Math.sqrt(prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length)) / mean;
    if (cv > 0.5) {
      signals.push({
        signalType: "PRICE_DISPERSION",
        direction: "NEGATIVE",
        score: Math.min(1.0, cv),
        weight: 1.0,
        confidence: 0.6,
        subjectType: "listing",
        subjectId: null,
        evidenceId: null,
        metadata: { coefficientOfVariation: cv, priceCount: prices.length },
      });
    }
  }

  return signals;
}

/**
 * Generate listing/content signals from evidence.
 */
function generateListingSignals(
  _subject: SubjectData,
  evidence: EvidenceSummary[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  const listingEvidence = evidence.filter(
    (e) =>
      e.evidenceType === "SELLER_LISTING" ||
      e.evidenceType === "MARKET_OBSERVATION"
  );

  if (listingEvidence.length === 0) return signals;

  // Check for content reuse (same content hash across different entities)
  const contentHashes = new Map<string, string[]>();
  for (const e of listingEvidence) {
    if (e.contentHash) {
      if (!contentHashes.has(e.contentHash)) contentHashes.set(e.contentHash, []);
      contentHashes.get(e.contentHash)!.push(e.id);
    }
  }

  const reusedContent = [...contentHashes.entries()].filter(([, ids]) => ids.length > 1);
  if (reusedContent.length > 0) {
    signals.push({
      signalType: "LISTING_CONTENT_REUSE",
      direction: "NEGATIVE",
      score: Math.min(1.0, reusedContent.length * 0.3),
      weight: 1.0,
      confidence: 0.7,
      subjectType: "listing",
      subjectId: null,
      evidenceId: listingEvidence[0]!.id,
      metadata: {
        reusedContentCount: reusedContent.length,
        note: "content_reuse_is_risk_not_proof",
      },
    });
  }

  // Listing consistency
  const listingSources = new Set(listingEvidence.map((e) => e.sourceId));
  if (listingSources.size > 1) {
    signals.push({
      signalType: "LISTING_CONSISTENCY",
      direction: "POSITIVE",
      score: 0.6,
      weight: 0.5,
      confidence: 0.5,
      subjectType: "listing",
      subjectId: null,
      evidenceId: listingEvidence[0]!.id,
      metadata: { sourceCount: listingSources.size },
    });
  }

  return signals;
}

/**
 * Generate document signals from evidence.
 */
function generateDocumentSignals(
  subject: SubjectData,
  evidence: EvidenceSummary[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  const docEvidence = evidence.filter(
    (e) =>
      e.evidenceType === "AUTHENTICITY" ||
      e.evidenceType === "COUNTRY_OF_ORIGIN" ||
      (e.extractedValue as Record<string, unknown> | null)?.documentType != null
  );

  if (docEvidence.length === 0) {
    if (subject.documentType != null) {
      signals.push({
        signalType: "DOCUMENT_MISSING",
        direction: "UNKNOWN",
        score: 0,
        weight: 1.0,
        confidence: 0,
        subjectType: "document",
        subjectId: subject.subjectId,
        evidenceId: null,
        metadata: { reason: "document_expected_but_not_found" },
      } as unknown as SignalRecord);
    }
    return signals;
  }

  // Document present
  signals.push({
    signalType: "DOCUMENT_PRESENT",
    direction: "POSITIVE",
    score: 0.5,
    weight: 1.0,
    confidence: 0.6,
    subjectType: "document",
    subjectId: subject.subjectId,
    evidenceId: docEvidence[0]!.id,
    metadata: { count: docEvidence.length },
  });

  // Document validated
  if (subject.documentValidated === true) {
    signals.push({
      signalType: "DOCUMENT_VALIDATED",
      direction: "POSITIVE",
      score: 0.8,
      weight: 1.5,
      confidence: 0.8,
      subjectType: "document",
      subjectId: subject.subjectId,
      evidenceId: docEvidence[0]!.id,
      metadata: { validated: true },
    });
  } else if (subject.documentValidated === false) {
    signals.push({
      signalType: "DOCUMENT_UNVALIDATED",
      direction: "NEGATIVE",
      score: 0.3,
      weight: 1.0,
      confidence: 0.5,
      subjectType: "document",
      subjectId: subject.subjectId,
      evidenceId: docEvidence[0]!.id,
      metadata: { validated: false },
    });
  }

  return signals;
}

/**
 * Detect contradictions from evidence conflicts and signal analysis.
 */
function detectContradictions(
  evidence: EvidenceSummary[],
  conflicts: AuthenticityEngineInput["conflicts"]
): { signals: SignalRecord[]; count: number } {
  const signals: SignalRecord[] = [];
  let contradictionCount = 0;

  // Direct conflicts from EvidenceConflict table
  for (const conflict of conflicts) {
    if (conflict.status === "open" || conflict.status === "under_review") {
      contradictionCount++;
      signals.push({
        signalType: "SOURCE_CONTRADICTION",
        direction: "NEGATIVE",
        score: 0.7,
        weight: 1.5,
        confidence: 0.8,
        subjectType: null,
        subjectId: null,
        evidenceId: conflict.supportingEvidenceId,
        metadata: {
          conflictId: conflict.id,
          conflictType: conflict.conflictType,
          description: conflict.description,
          contradictingEvidenceId: conflict.contradictingEvidenceId,
        },
      });
    }
  }

  // Detect implicit contradictions from evidence
  // Same evidence type, different values from different sources
  const byType = new Map<string, EvidenceSummary[]>();
  for (const e of evidence) {
    if (!byType.has(e.evidenceType)) byType.set(e.evidenceType, []);
    byType.get(e.evidenceType)!.push(e);
  }

  for (const [type, typeEvidence] of byType) {
    const sources = new Set(typeEvidence.map((e) => e.sourceId));
    if (sources.size < 2) continue;

    // Check for value divergence
    const hashes = new Set(typeEvidence.map((e) => e.contentHash).filter(Boolean));
    if (hashes.size > 1 && typeEvidence.length >= 2) {
      // Different values from different sources for the same evidence type
      const existingContradiction = signals.some(
        (s) =>
          s.signalType === "SOURCE_CONTRADICTION" &&
          (s.metadata as Record<string, unknown>).evidenceType === type
      );

      if (!existingContradiction) {
        contradictionCount++;
        signals.push({
          signalType: "SOURCE_DISAGREEMENT",
          direction: "NEGATIVE",
          score: 0.5,
          weight: 1.0,
          confidence: 0.6,
          subjectType: null,
          subjectId: null,
          evidenceId: typeEvidence[0]!.id,
          metadata: {
            evidenceType: type,
            sourceCount: sources.size,
            distinctValues: hashes.size,
          },
        });
      }
    }
  }

  return { signals, count: contradictionCount };
}

/**
 * Generate source corroboration signals.
 */
function generateCorroborationSignals(
  evidence: EvidenceSummary[],
  sources: SourceMetadata[]
): SignalRecord[] {
  const signals: SignalRecord[] = [];

  if (evidence.length === 0) return signals;

  const distinctSources = new Set(evidence.map((e) => e.sourceId).filter(Boolean));

  if (distinctSources.size >= 2) {
    // Multiple independent sources corroborate
    signals.push({
      signalType: "SOURCE_CORROBORATION",
      direction: "POSITIVE",
      score: Math.min(1.0, 0.4 + distinctSources.size * 0.15),
      weight: 1.5,
      confidence: Math.min(0.9, 0.4 + distinctSources.size * 0.1),
      subjectType: null,
      subjectId: null,
      evidenceId: null,
      metadata: {
        distinctSourceCount: distinctSources.size,
        totalEvidence: evidence.length,
      },
    });
  }

  // Check source health impact
  const unhealthySources = sources.filter(
    (s) => s.healthStatus === "unhealthy" || s.consecutiveErrors > 5
  );
  if (unhealthySources.length > 0) {
    signals.push({
      signalType: "SOURCE_CONTRADICTION",
      direction: "NEGATIVE",
      score: 0.3,
      weight: 0.5,
      confidence: 0.4,
      subjectType: null,
      subjectId: null,
      evidenceId: null,
      metadata: {
        unhealthySourceCount: unhealthySources.length,
        note: "unhealthy_sources_reduce_confidence",
      },
    });
  }

  return signals;
}

/**
 * Calculate the authenticity score from signals.
 */
function calculateScore(signals: SignalRecord[]): AuthenticityScoreBreakdown {
  const config = AUTHENTICITY_CONFIG;

  // Group signals by category
  const productSignals = signals.filter(
    (s) =>
      s.signalType === "PRODUCT_IDENTITY_MATCH" ||
      s.signalType === "SKU_MATCH" ||
      s.signalType === "MODEL_NUMBER_MATCH" ||
      s.signalType === "BARCODE_MATCH" ||
      s.signalType === "VARIANT_MATCH" ||
      s.signalType === "SPECIFICATION_MATCH" ||
      s.signalType === "PACK_SIZE_MATCH"
  );

  const brandSignals = signals.filter(
    (s) =>
      s.signalType === "BRAND_MATCH" ||
      s.signalType === "MANUFACTURER_MATCH" ||
      s.signalType === "OFFICIAL_PRODUCT_REFERENCE" ||
      s.signalType === "MANUFACTURER_RELATIONSHIP" ||
      s.signalType === "AUTHORIZED_DISTRIBUTOR_EVIDENCE"
  );

  const sellerSignals = signals.filter(
    (s) =>
      s.signalType === "SELLER_IDENTITY_MATCH" ||
      s.signalType === "SELLER_HISTORY" ||
      s.signalType === "SELLER_AUTHORIZATION" ||
      s.signalType === "SELLER_CONTACT_CONSISTENCY" ||
      s.signalType === "SELLER_SOURCE_CONSISTENCY"
  );

  const supplierSignals = signals.filter(
    (s) =>
      s.signalType === "SUPPLIER_IDENTITY_MATCH" ||
      s.signalType === "SUPPLIER_MANUFACTURER_RELATIONSHIP" ||
      s.signalType === "SUPPLIER_DOCUMENTATION" ||
      s.signalType === "SUPPLIER_CATALOG_CONSISTENCY" ||
      s.signalType === "SUPPLIER_CONTACT_CONSISTENCY"
  );

  const listingSignals = signals.filter(
    (s) =>
      s.signalType === "LISTING_CONSISTENCY" ||
      s.signalType === "LISTING_METADATA_MATCH" ||
      s.signalType === "LISTING_CONTENT_REUSE" ||
      s.signalType === "LISTING_IMAGE_REUSE" ||
      s.signalType === "LISTING_SOURCE_CONFLICT"
  );

  const documentSignals = signals.filter(
    (s) =>
      s.signalType === "DOCUMENT_PRESENT" ||
      s.signalType === "DOCUMENT_VALIDATED" ||
      s.signalType === "DOCUMENT_UNVALIDATED" ||
      s.signalType === "DOCUMENT_MISMATCH" ||
      s.signalType === "DOCUMENT_CONTRADICTION"
  );

  const priceSignals = signals.filter(
    (s) =>
      s.signalType === "PRICE_ANOMALY" ||
      s.signalType === "EXTREME_DISCOUNT" ||
      s.signalType === "PRICE_DISPERSION"
  );

  const corroborationSignals = signals.filter(
    (s) =>
      s.signalType === "SOURCE_CORROBORATION" ||
      s.signalType === "SOURCE_CONTRADICTION" ||
      s.signalType === "SOURCE_DISAGREEMENT"
  );

  // Calculate category scores (0–100)
  const categoryScore = (categorySignals: SignalRecord[]): number => {
    if (categorySignals.length === 0) return 50; // Neutral when no data
    const weightedSum = categorySignals.reduce((sum, s) => {
      const dirMultiplier = config.directionMultipliers[s.direction];
      return sum + s.score * s.weight * dirMultiplier;
    }, 0);
    const maxPossible = categorySignals.reduce((sum, s) => sum + s.weight, 0);
    if (maxPossible === 0) return 50;
    // Normalize to 0–100
    const normalized = (weightedSum / maxPossible + 1) / 2; // Map [-1,1] to [0,1]
    return Math.round(normalized * 100);
  };

  const identityScore = categoryScore(productSignals);
  const brandScore = categoryScore(brandSignals);
  const sellerScore = categoryScore(sellerSignals);
  const supplierScore = categoryScore(supplierSignals);
  const listingScore = categoryScore(listingSignals);
  const documentScore = categoryScore(documentSignals);
  const priceScore = categoryScore(priceSignals);
  const corroborationScore = categoryScore(corroborationSignals);

  // Contradiction penalty
  const contradictionSignals = signals.filter(
    (s) => s.direction === "NEGATIVE" && s.signalType.includes("CONTRADICTION")
  );
  const contradictionPenalty = Math.min(
    50,
    contradictionSignals.reduce((sum, s) => sum + s.score * s.weight * config.contradictionPenaltyFactor * 100, 0)
  );

  // Final score: weighted average of category scores minus contradiction penalty
  const categoryWeights = {
    identity: 0.25,
    brand: 0.15,
    seller: 0.10,
    supplier: 0.10,
    listing: 0.10,
    document: 0.10,
    price: 0.10,
    corroboration: 0.10,
  };

  const finalScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        identityScore * categoryWeights.identity +
          brandScore * categoryWeights.brand +
          sellerScore * categoryWeights.seller +
          supplierScore * categoryWeights.supplier +
          listingScore * categoryWeights.listing +
          documentScore * categoryWeights.document +
          priceScore * categoryWeights.price +
          corroborationScore * categoryWeights.corroboration -
          contradictionPenalty
      )
    )
  );

  return {
    identityScore,
    brandScore,
    sellerScore,
    supplierScore,
    listingScore,
    documentScore,
    priceScore,
    corroborationScore,
    contradictionPenalty: Math.round(contradictionPenalty),
    finalScore,
  };
}

/**
 * Calculate confidence from evidence characteristics.
 */
function calculateConfidence(
  evidence: EvidenceSummary[],
  signals: SignalRecord[],
  _sources: SourceMetadata[]
): ConfidenceBreakdown {
  const config = AUTHENTICITY_CONFIG;

  // Evidence quantity score (0–1)
  const evidenceCount = evidence.length;
  const evidenceQuantityScore = Math.min(
    1.0,
    evidenceCount / config.minimumEvidenceForHighConfidence
  );

  // Evidence quality score (0–1)
  const avgConfidence =
    evidence.length > 0
      ? evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length
      : 0;
  const qualityDistribution =
    evidence.length > 0
      ? evidence.filter((e) => e.confidence >= 0.7).length / evidence.length
      : 0;
  const evidenceQualityScore = avgConfidence * 0.5 + qualityDistribution * 0.5;

  // Independence score (0–1)
  const distinctSources = new Set(evidence.map((e) => e.sourceId).filter(Boolean));
  const independenceScore = Math.min(
    1.0,
    distinctSources.size / config.minimumSourcesForIndependence
  );

  // Completeness score (0–1)
  // How many evidence categories are covered?
  const evidenceTypes = new Set(evidence.map((e) => e.evidenceType));
  const expectedCategories = 5; // identity, brand, seller, supplier, price
  const completenessScore = Math.min(1.0, evidenceTypes.size / expectedCategories);

  // Consistency score (0–1)
  const negativeSignals = signals.filter((s) => s.direction === "NEGATIVE");
  const contradictionSignals = signals.filter(
    (s) => s.signalType.includes("CONTRADICTION") || s.signalType.includes("DISAGREEMENT")
  );
  const consistencyRatio =
    signals.length > 0
      ? 1 - negativeSignals.length / signals.length
      : 0.5;
  const contradictionRatio =
    signals.length > 0
      ? 1 - contradictionSignals.length / signals.length
      : 0.5;
  const consistencyScore = consistencyRatio * 0.6 + contradictionRatio * 0.4;

  // Final confidence: weighted average
  const w = config.confidenceWeights;
  const finalConfidence = Math.max(
    0,
    Math.min(
      1.0,
      evidenceQuantityScore * w.evidenceQuantity +
        evidenceQualityScore * w.evidenceQuality +
        independenceScore * w.independence +
        completenessScore * w.completeness +
        consistencyScore * w.consistency
    )
  );

  return {
    evidenceQuantityScore: Math.round(evidenceQuantityScore * 1000) / 1000,
    evidenceQualityScore: Math.round(evidenceQualityScore * 1000) / 1000,
    independenceScore: Math.round(independenceScore * 1000) / 1000,
    completenessScore: Math.round(completenessScore * 1000) / 1000,
    consistencyScore: Math.round(consistencyScore * 1000) / 1000,
    finalConfidence: Math.round(finalConfidence * 1000) / 1000,
  };
}

/**
 * Determine assessment status from score and confidence.
 */
function determineStatus(
  score: number,
  confidence: number,
  contradictionCount: number,
  evidenceCount: number
): string {
  const thresholds = AUTHENTICITY_CONFIG.statusThresholds;

  // Insufficient evidence
  if (evidenceCount === 0) return "INSUFFICIENT_EVIDENCE";

  // Contradicted: strong contradictions override score
  if (contradictionCount >= 3 && confidence >= 0.5) return "CONTRADICTED";

  // Score-based classification
  if (score >= thresholds.verified && confidence >= 0.7) return "VERIFIED";
  if (score >= thresholds.likelyAuthentic && confidence >= 0.5) return "LIKELY_AUTHENTIC";
  if (score >= thresholds.uncertain) return "UNCERTAIN";
  if (score >= thresholds.suspicious) return "SUSPICIOUS";
  return "LIKELY_COUNTERFEIT";
}

/**
 * Generate risk records from signals and evidence.
 */
function generateRisks(
  signals: SignalRecord[],
  evidence: EvidenceSummary[],
  conflicts: AuthenticityEngineInput["conflicts"]
): RiskRecord[] {
  const risks: RiskRecord[] = [];

  // Identity contradiction risk
  const contradictionSignals = signals.filter(
    (s) => s.signalType.includes("CONTRADICTION") || s.signalType.includes("DISAGREEMENT")
  );
  if (contradictionSignals.length > 0) {
    const maxScore = Math.max(...contradictionSignals.map((s) => s.score));
    risks.push({
      riskType: "IDENTITY_CONTRADICTION",
      severity: maxScore > 0.7 ? "high" : maxScore > 0.4 ? "medium" : "low",
      score: maxScore,
      title: "Contradictory identity evidence detected",
      description: `${contradictionSignals.length} contradiction signal(s) found across evidence sources`,
      evidence: { signalCount: contradictionSignals.length, maxScore },
    });
  }

  // Missing evidence risk
  if (evidence.length < AUTHENTICITY_CONFIG.minimumEvidenceForHighConfidence) {
    risks.push({
      riskType: "MISSING_EVIDENCE",
      severity: evidence.length === 0 ? "high" : evidence.length < 3 ? "medium" : "low",
      score: Math.max(0, 1 - evidence.length / AUTHENTICITY_CONFIG.minimumEvidenceForHighConfidence),
      title: "Insufficient evidence for confident assessment",
      description: `Only ${evidence.length} evidence record(s) found, minimum ${AUTHENTICITY_CONFIG.minimumEvidenceForHighConfidence} recommended`,
      evidence: { evidenceCount: evidence.length },
    });
  }

  // Price anomaly risk
  const priceSignals = signals.filter(
    (s) => s.signalType === "PRICE_ANOMALY" || s.signalType === "EXTREME_DISCOUNT"
  );
  if (priceSignals.length > 0) {
    const maxScore = Math.max(...priceSignals.map((s) => s.score));
    risks.push({
      riskType: "PRICE_ANOMALY",
      severity: maxScore > 0.7 ? "high" : maxScore > 0.4 ? "medium" : "low",
      score: maxScore,
      title: "Price anomaly detected",
      description: "Product pricing deviates significantly from observed market prices",
      evidence: { signalCount: priceSignals.length, maxScore },
    });
  }

  // Source conflict risk
  if (conflicts.some((c) => c.status === "open")) {
    risks.push({
      riskType: "SOURCE_CONFLICT",
      severity: "medium",
      score: 0.6,
      title: "Open evidence conflicts exist",
      description: `${conflicts.filter((c) => c.status === "open").length} unresolved evidence conflict(s)`,
      evidence: { openConflictCount: conflicts.filter((c) => c.status === "open").length },
    });
  }

  // Content reuse risk
  const contentReuseSignals = signals.filter((s) => s.signalType === "LISTING_CONTENT_REUSE");
  if (contentReuseSignals.length > 0) {
    risks.push({
      riskType: "CONTENT_REUSE",
      severity: "medium",
      score: contentReuseSignals[0]!.score,
      title: "Content reuse detected across listings",
      description: "Identical content found across multiple unrelated listings",
      evidence: { count: contentReuseSignals.length },
    });
  }

  return risks;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Run the complete authenticity calculation.
 * This is a PURE function — no database side effects.
 */
export function calculateAuthenticity(input: AuthenticityEngineInput): AuthenticityEngineResult {
  const inputHash = computeInputHash(input);

  // 1. Generate all signals
  const productSignals = generateProductSignals(input.subject, input.evidence);
  const brandSignals = generateBrandSignals(input.subject, input.evidence);
  const sellerSignals = generateSellerSignals(input.subject, input.evidence);
  const supplierSignals = generateSupplierSignals(input.subject, input.evidence);
  const priceSignals = generatePriceSignals(input.subject, input.evidence);
  const listingSignals = generateListingSignals(input.subject, input.evidence);
  const documentSignals = generateDocumentSignals(input.subject, input.evidence);

  // 2. Detect contradictions
  const contradictions = detectContradictions(input.evidence, input.conflicts);

  // 3. Source corroboration
  const corroborationSignals = generateCorroborationSignals(input.evidence, input.sources);

  // Combine all signals
  const allSignals = [
    ...productSignals,
    ...brandSignals,
    ...sellerSignals,
    ...supplierSignals,
    ...priceSignals,
    ...listingSignals,
    ...documentSignals,
    ...contradictions.signals,
    ...corroborationSignals,
  ];

  // 4. Calculate score
  const scoreBreakdown = calculateScore(allSignals);

  // 5. Calculate confidence
  const confidenceBreakdown = calculateConfidence(input.evidence, allSignals, input.sources);

  // 6. Determine status
  const status = determineStatus(
    scoreBreakdown.finalScore,
    confidenceBreakdown.finalConfidence,
    contradictions.count,
    input.evidence.length
  );

  // 7. Generate risks
  const risks = generateRisks(allSignals, input.evidence, input.conflicts);

  // 8. Compute calculation hash
  const calculationHash = createHash("sha256")
    .update(
      JSON.stringify({
        inputHash,
        scoreBreakdown,
        confidenceBreakdown,
        status,
        signalCount: allSignals.length,
        algorithmVersion: AUTHENTICITY_CONFIG.algorithmVersion,
      })
    )
    .digest("hex");

  // 9. Compute summary stats
  const distinctSources = new Set(input.evidence.map((e) => e.sourceId).filter(Boolean));
  const positiveCount = allSignals.filter((s) => s.direction === "POSITIVE").length;
  const negativeCount = allSignals.filter((s) => s.direction === "NEGATIVE").length;

  // Data completeness: how many expected data dimensions are present
  const dimensions = ["product", "brand", "seller", "supplier", "price"];
  const presentDimensions = dimensions.filter((d) =>
    allSignals.some(
      (s) =>
        (s.subjectType === d || s.metadata?.evidenceType) &&
        s.direction !== "UNKNOWN"
    )
  );
  const dataCompleteness = presentDimensions.length / dimensions.length;

  return {
    tenantId: input.tenantId,
    subjectType: input.subject.subjectType,
    subjectId: input.subject.subjectId,
    status,
    score: scoreBreakdown.finalScore,
    confidence: confidenceBreakdown.finalConfidence,
    algorithmVersion: AUTHENTICITY_CONFIG.algorithmVersion,
    inputHash,
    calculationHash,
    signals: allSignals,
    risks,
    scoreBreakdown,
    confidenceBreakdown,
    evidenceCount: input.evidence.length,
    signalCount: allSignals.length,
    contradictionCount: contradictions.count,
    positiveSignalCount: positiveCount,
    negativeSignalCount: negativeCount,
    dataCompleteness: Math.round(dataCompleteness * 1000) / 1000,
    sourceDiversity: distinctSources.size,
    evidenceIds: input.evidence.map((e) => e.id),
  };
}
