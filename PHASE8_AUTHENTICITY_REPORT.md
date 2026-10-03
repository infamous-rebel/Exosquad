# Phase 8 Report: Authenticity Intelligence Engine

**Status:** ✅ COMPLETE  
**Date:** October 2, 2026  
**Implementation Period:** Full Original Roadmap Phase 8 delivery

---

## Executive Summary

The Authenticity Intelligence Engine implements a deterministic, evidence-based authenticity assessment system for the EXOSQUAD platform. It evaluates products, brands, sellers, suppliers, listings, and documents against a taxonomy of 40+ signal types to produce explainable authenticity scores, confidence levels, risk assessments, and status classifications.

**This is a completely additive capability** — it does not modify the existing Qoder Phase 8 (Decision Intelligence & Reseller Opportunity Engine). All existing Opportunity models, services, APIs, workers, and tests remain untouched.

**Key Achievements:**
- ✅ Pure deterministic authenticity calculation engine (no LLM dependency)
- ✅ 5 Prisma models: AuthenticityAssessment, AuthenticitySignal, AuthenticityEvidenceLink, AuthenticityRisk, AuthenticityDecision
- ✅ 1 AuthenticityStatus enum with 8 status values
- ✅ SHA-256 input hash deduplication ensuring assessment immutability
- ✅ Full evidence provenance chain: Assessment → Signal → Evidence → Source
- ✅ 40+ signal types across 8 categories (product, brand, seller, supplier, listing, document, pricing, cross-source)
- ✅ Score ≠ Confidence — separate dimensions with independent breakdowns
- ✅ Contradiction detection from explicit conflicts and implicit content hash divergence
- ✅ 8 status classifications: UNASSESSED, INSUFFICIENT_EVIDENCE, VERIFIED, LIKELY_AUTHENTIC, UNCERTAIN, SUSPICIOUS, LIKELY_COUNTERFEIT, CONTRADICTED
- ✅ 5 risk types: IDENTITY_CONTRADICTION, MISSING_EVIDENCE, PRICE_ANOMALY, SOURCE_CONFLICT, CONTENT_REUSE
- ✅ RESTful API with 9 endpoints under `/api/v1/authenticity`
- ✅ Async worker processor with 4 job types (detect, recalculate, refresh, expire)
- ✅ Authenticity scheduler (12-hour assessment cycle)
- ✅ 30 unit tests (all passing)
- ✅ 24 PostgreSQL integration tests (all passing)
- ✅ Full build verification (10/10 packages successful)
- ✅ Zero lint errors
- ✅ Backward compatible with all existing phases

---

## 1. Schema Changes

### New Enum

#### AuthenticityStatus
```prisma
enum AuthenticityStatus {
  UNASSESSED
  INSUFFICIENT_EVIDENCE
  VERIFIED
  LIKELY_AUTHENTIC
  UNCERTAIN
  SUSPICIOUS
  LIKELY_COUNTERFEIT
  CONTRADICTED
}
```

### New Models

#### AuthenticityAssessment
Core assessment record representing an authenticity evaluation of a subject entity.

**Fields:**
- `id`, `tenantId` — primary key with tenant isolation
- `subjectType`, `subjectId` — polymorphic subject reference (PRODUCT, SKU, BRAND, SELLER, SUPPLIER, LISTING, DOCUMENT)
- `status` — AuthenticityStatus enum
- `score` — final authenticity score (0–100)
- `confidence` — confidence level (0.0–1.0)
- `algorithmVersion` — semver tracking (currently "1.0.0")
- `inputHash` — SHA-256 of canonical input for deduplication
- `calculationHash` — SHA-256 of calculation result
- Counters: `evidenceCount`, `signalCount`, `contradictionCount`, `positiveSignalCount`, `negativeSignalCount`
- `dataCompleteness` — 0.0–1.0 evidence coverage metric
- `sourceDiversity` — number of distinct sources contributing evidence
- `assessedAt`, `validFrom`, `validUntil` — temporal validity

**Unique Constraint:**
```
@@unique([tenantId, subjectType, subjectId, inputHash])
```

#### AuthenticitySignal
Individual signal generated during assessment (e.g., SKU_MATCH, BRAND_MATCH, PRICE_ANOMALY).

**Fields:**
- `signalType` — 40+ signal types from the taxonomy
- `direction` — POSITIVE, NEGATIVE, NEUTRAL, UNKNOWN
- `score` — signal score (0.0–1.0)
- `weight` — category weight (0.0–2.0)
- `confidence` — signal-level confidence (0.0–1.0)
- `subjectType`, `subjectId` — signal target
- `evidenceId` — optional link to triggering evidence
- `metadata` — JSON signal-specific context

#### AuthenticityEvidenceLink
Links evidence records to assessments with role classification.

**Fields:**
- `evidenceRole` — SUPPORTING, CONTRADICTING, CONTEXTUAL
- `evidenceStrength` — DIRECT, STRONG, MODERATE, WEAK, CONTEXTUAL
- `relevance` — 0.0–1.0 relevance score
- `effect` — signed effect on final score (-1.0 to 1.0)

#### AuthenticityRisk
Identified risks from the assessment (e.g., IDENTITY_CONTRADICTION, PRICE_ANOMALY).

**Fields:**
- `riskType` — 5 risk types
- `severity` — low, medium, high, critical
- `score` — 0.0–1.0 risk severity
- `title`, `description` — human-readable risk explanation
- `evidence` — JSON risk-specific context

#### AuthenticityDecision
Immutable calculation snapshot preserving the full algorithm breakdown.

**Fields:**
- Category scores: `identityScore`, `brandScore`, `sellerScore`, `supplierScore`, `listingScore`, `documentScore`, `priceScore`, `corroborationScore`
- Confidence breakdown: `evidenceQuantityScore`, `evidenceQualityScore`, `independenceScore`, `completenessScore`, `consistencyScore`
- `contradictionPenalty` — penalty applied for contradictions
- `finalScore`, `finalConfidence` — final outputs
- `inputHash` — input fingerprint
- `evidenceIds`, `signalIds` — arrays of input IDs

### Migration
- Migration: `20261002121308_add_authenticity_intelligence`
- Applied successfully to PostgreSQL

---

## 2. Common Types (@exosquad/common)

Added to `packages/common/src/index.ts`:

- `AUTHENTICITY_STATUSES` — 8 status values
- `AUTHENTICITY_SUBJECT_TYPES` — 7 subject types
- `AUTHENTICITY_SIGNAL_TYPES` — 40+ signal types across 8 categories
- `SIGNAL_DIRECTIONS` — POSITIVE, NEGATIVE, NEUTRAL, UNKNOWN
- `EVIDENCE_ROLES` — SUPPORTING, CONTRADICTING, CONTEXTUAL
- `EVIDENCE_STRENGTHS` — DIRECT, STRONG, MODERATE, WEAK, CONTEXTUAL
- `AUTHENTICITY_RISK_TYPES` — 5 risk types
- `AUTHENTICITY_CONFIG` — Configuration constant with:
  - Evidence strength weights
  - Direction multipliers
  - Confidence weights (quantity 20%, quality 25%, independence 20%, completeness 15%, consistency 20%)
  - Status thresholds
  - Contradiction penalty factor
  - Algorithm version: "1.0.0"

---

## 3. Pure Calculation Engine

**File:** `apps/api/src/services/authenticity-engine.ts` (1492 lines)

### Architecture
Pure function with no database side effects. Same inputs → same outputs. Every score is explainable.

### Signal Generation (8 categories)

| Category | Signals Generated | Weight |
|----------|-------------------|--------|
| Product Identity | PRODUCT_IDENTITY_MATCH, SKU_MATCH, BARCODE_MATCH, PRODUCT_NAME_MATCH, PRODUCT_VARIANT_MATCH | 25% |
| Brand | BRAND_MATCH, BRAND_AUTHORIZATION, BRAND_ABSENCE | 15% |
| Seller | SELLER_IDENTITY_MATCH, SELLER_REPUTATION, SELLER_HISTORY | 10% |
| Supplier | SUPPLIER_IDENTITY_MATCH, SUPPLIER_MANUFACTURER_RELATIONSHIP, SUPPLIER_DOCUMENTATION | 10% |
| Listing | LISTING_CONSISTENCY, LISTING_QUALITY, LISTING_AGE | 10% |
| Document | DOCUMENT_VALIDATION, DOCUMENT_TYPE_MATCH | 10% |
| Pricing | PRICE_ANOMALY, PRICE_CONSISTENCY, PRICE_POSITION | 10% |
| Cross-Source | SOURCE_CORROBORATION, SOURCE_CONTRADICTION, CONTENT_REUSE | 10% |

### Scoring Formula
```
finalScore = weighted_category_sum - contradiction_penalty

where:
  weighted_category_sum = Σ(category_score × category_weight)
  contradiction_penalty = contradiction_count × penalty_factor × avg_contradiction_severity
```

### Confidence Formula
```
finalConfidence = (
  evidenceQuantityScore × 0.20 +
  evidenceQualityScore × 0.25 +
  independenceScore × 0.20 +
  completenessScore × 0.15 +
  consistencyScore × 0.20
)
```

**Score ≠ Confidence:** A product can have a high authenticity score (82) with LOW confidence (0.25) if evidence is limited. These are independent dimensions.

### Status Classification
```
INSUFFICIENT_EVIDENCE  — evidenceCount == 0
CONTRADICTED           — contradictionCount >= 3
LIKELY_COUNTERFEIT     — score < 20 && confidence > 0.5
SUSPICIOUS             — score < 40 && confidence > 0.4
UNCERTAIN              — confidence < 0.4
LIKELY_AUTHENTIC       — score > 70 && confidence > 0.5
VERIFIED               — score > 85 && confidence > 0.7
UNASSESSED             — default
```

### SHA-256 Deduplication
```
inputHash = SHA-256({
  tenantId, subjectType, subjectId,
  evidenceIds (sorted), evidenceVersions,
  conflictIds (sorted), algorithmVersion
})
```

---

## 4. Orchestrator Service

**File:** `apps/api/src/services/authenticity-intelligence.ts` (669 lines)

### Functions

| Function | Description |
|----------|-------------|
| `assessAuthenticity(input)` | Full assessment: load subject → load evidence → load sources → load conflicts → run engine → persist atomically |
| `getAssessment(tenantId, id)` | Get assessment with signals, risks, evidence links, decisions |
| `listAssessments(params)` | List with filtering (subjectType, status, minScore, minConfidence) and pagination |
| `getAssessmentSignals(tenantId, id)` | Get signals for an assessment |
| `getAssessmentEvidence(tenantId, id)` | Get evidence links for an assessment |
| `getAssessmentRisks(tenantId, id)` | Get risks for an assessment |
| `getAssessmentHistory(tenantId, id)` | Get decision history |
| `getAssessmentProvenance(tenantId, id)` | Full provenance traversal: Assessment → Signals → Evidence → Sources |
| `recalculateAssessment(tenantId, id)` | Re-run assessment (deduplication-aware) |

### Subject Loading
Supports 7 subject types:
- **PRODUCT** — loads product, brand, identifiers (GTIN, SKU, MPN), variants
- **SELLER** — loads seller profile, rating, reviews
- **SUPPLIER** — loads supplier profile, role, domain
- **BRAND** — loads brand identity
- **SKU, LISTING, DOCUMENT** — generic evidence-based assessment

### Atomic Persistence
All writes happen in a single Prisma transaction:
1. Create AuthenticityAssessment
2. Create AuthenticitySignals (bulk)
3. Create AuthenticityEvidenceLinks (bulk, with dedup)
4. Create AuthenticityRisks (bulk)
5. Create AuthenticityDecision snapshot

### Deduplication
Before creating, checks for existing assessment with same `@@unique([tenantId, subjectType, subjectId, inputHash])`. If found, returns existing assessment ID instead of creating duplicate.

---

## 5. API Routes

**File:** `apps/api/src/routes/authenticity.ts` (154 lines)  
**Prefix:** `/api/v1/authenticity`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/assess` | Run new authenticity assessment |
| GET | `/` | List assessments with filtering/pagination |
| GET | `/:id` | Get assessment detail |
| POST | `/:id/recalculate` | Recalculate assessment |
| GET | `/:id/signals` | Get assessment signals |
| GET | `/:id/evidence` | Get assessment evidence links |
| GET | `/:id/risks` | Get assessment risks |
| GET | `/:id/history` | Get decision history |
| GET | `/:id/provenance` | Get full provenance chain |

All routes require authentication (JWT Bearer token) and are tenant-scoped.

---

## 6. Worker Processor

**File:** `apps/worker/src/processors/authenticity.ts` (656 lines)

### Job Types

| Job | Description |
|-----|-------------|
| `authenticity:detect` | Batch detection for entities with evidence but no recent assessment (24hr window) |
| `authenticity:recalculate` | Recalculate a specific assessment |
| `authenticity:refresh` | Refresh assessment with latest evidence |
| `authenticity:expire` | Mark assessments older than 30 days as expired (set validUntil) |

### Architecture
Self-contained processor (no API imports) following the established worker pattern. Duplicates core calculation logic to maintain module independence.

### Queue Configuration
- Queue name: `authenticity_intelligence`
- Concurrency: `WORKER_CONCURRENCY / 2`
- Rate limit: 20 jobs per minute

---

## 7. Scheduler

**File:** `apps/worker/src/scheduler/authenticity-scheduler.ts` (181 lines)

- Checks every 60 seconds
- Runs detection every 12 hours
- Enqueues `authenticity:detect` and `authenticity:expire` per tenant
- Idempotent via jobId pattern: `auth-detect-{tenantId}-{date}`
- Wired into WorkerApp lifecycle (start/stop)

---

## 8. Testing

### Unit Tests (30 tests)
**File:** `apps/api/test/unit/authenticity-engine.test.ts` (634 lines)

| Category | Tests |
|----------|-------|
| Empty evidence | 2 tests — INSUFFICIENT_EVIDENCE status, determinism |
| Single weak source | 2 tests — low confidence, product identity signals |
| Multiple independent sources | 2 tests — confidence increase, corroboration signals |
| Contradictory sources | 3 tests — explicit conflicts, implicit contradictions, score reduction |
| SKU mismatch | 1 test — negative signal for conflicting SKUs |
| Price anomaly | 2 tests — extreme deviation detection, consistent price pass |
| Score vs confidence | 2 tests — independence verification |
| SHA-256 idempotency | 3 tests — same inputs, different inputs, calculation hash |
| Status classification | 2 tests — INSUFFICIENT_EVIDENCE, CONTRADICTED |
| Brand signals | 2 tests — positive match, UNKNOWN with no evidence |
| Seller signals | 1 test — UNKNOWN with no evidence |
| Supplier signals | 1 test — positive match with supplier name |
| Algorithm version | 2 tests — version tracking, hash differentiation |
| Risk generation | 2 tests — MISSING_EVIDENCE, IDENTITY_CONTRADICTION |
| Content reuse | 1 test — cross-listing content reuse detection |
| Data completeness | 2 tests — zero completeness, diverse evidence |

### Integration Tests (24 tests)
**File:** `apps/api/test/integration/authenticity-intelligence.test.ts` (787 lines)

| Category | Tests |
|----------|-------|
| Basic assessment | No evidence → INSUFFICIENT_EVIDENCE |
| Evidence assessment | Product identity evidence from 2 sources |
| Persistence | Assessment, signals, evidence links, risks, decisions |
| Signal validation | Types, directions, score ranges |
| Risk validation | Severity, score, descriptions |
| Evidence links | Roles (SUPPORTING/CONTRADICTING/CONTEXTUAL), strengths |
| Decision history | Snapshot integrity |
| Provenance | Full chain traversal: Assessment → Signals → Evidence → Sources |
| Tenant isolation | Cross-tenant access denied, data separation |
| Filtering/pagination | Subject type filter, page/limit |
| Deduplication | Same input hash returns existing assessment |
| Error handling | Non-existent assessment, invalid subject type, non-existent product |
| Score ranges | All scores in [0,100], confidence in [0,1] |
| Algorithm version | Tracked on all assessments |
| Hash persistence | inputHash (64 chars), calculationHash (64 chars) |
| Contradiction handling | Contradictory evidence detection |
| Brand assessment | Brand subject type support |
| Data completeness | 0.0–1.0 range |
| Source diversity | Multi-source tracking |
| Status validity | Only valid enum values |
| Signal counters | Consistency checks |

---

## 9. Files Created/Modified

### Created
| File | Lines | Description |
|------|-------|-------------|
| `packages/database/prisma/migrations/20261002121308_add_authenticity_intelligence/` | — | Database migration |
| `apps/api/src/services/authenticity-engine.ts` | 1492 | Pure calculation engine |
| `apps/api/src/services/authenticity-intelligence.ts` | 669 | Orchestrator service |
| `apps/api/src/routes/authenticity.ts` | 154 | API routes |
| `apps/worker/src/processors/authenticity.ts` | 656 | Worker processor |
| `apps/worker/src/scheduler/authenticity-scheduler.ts` | 181 | Assessment scheduler |
| `apps/api/test/unit/authenticity-engine.test.ts` | 634 | Unit tests |
| `apps/api/test/integration/authenticity-intelligence.test.ts` | 787 | Integration tests |

### Modified
| File | Changes |
|------|---------|
| `packages/database/prisma/schema.prisma` | +219 lines (enum + 5 models + Tenant relation) |
| `packages/common/src/index.ts` | +106 lines (types, enums, config) |
| `apps/api/src/app.ts` | +2 lines (route registration) |
| `apps/worker/src/queues/queue-manager.ts` | +25 lines (queue + worker registration) |
| `apps/worker/src/app.ts` | +8 lines (scheduler lifecycle) |

---

## 10. Verification Results

| Check | Result |
|-------|--------|
| Build | ✅ 10/10 packages successful |
| Lint | ✅ 8/8 tasks successful |
| Unit Tests | ✅ 30/30 passing |
| Integration Tests | ✅ 24/24 passing |
| Type Check | ✅ No errors |
| Migration | ✅ Applied successfully |
| Backward Compatibility | ✅ All existing tests unaffected |

---

## 11. Architectural Decisions

### 1. Score ≠ Confidence
These are independent dimensions. A product can have high authenticity score with low confidence (limited evidence) or moderate score with high confidence (lots of contradictory evidence). This prevents false certainty.

### 2. Immutable Assessments
Assessments are never overwritten. Recalculation with changed evidence creates a new record. Same input hash returns existing assessment (deduplication).

### 3. Worker Self-Containment
Worker processor duplicates calculation logic rather than importing from API layer. This maintains module independence and prevents circular dependencies.

### 4. Polymorphic Subject Type
The system supports 7 subject types (PRODUCT, SKU, BRAND, SELLER, SUPPLIER, LISTING, DOCUMENT) through a single assessment model with type-specific signal generation.

### 5. Evidence Role Classification
Each evidence link is classified as SUPPORTING, CONTRADICTING, or CONTEXTUAL based on the signal direction that referenced it. This enables provenance traversal and auditability.

---

## 12. What This Does NOT Do

- Does NOT modify any existing Opportunity engine code
- Does NOT fabricate authenticity data
- Does NOT use AI/LLM for scoring (pure deterministic math)
- Does NOT overwrite existing assessments
- Does NOT present inference as confirmed fact
- Does NOT merge products based on visual similarity alone

---

## 13. Next Steps (Phase 9 — User Experience)

- Landing page
- Dashboard with authenticity overview
- Authenticity assessment explorer
- Signal/risk visualization
- Alert configuration for authenticity changes
- Supplier outreach integration
