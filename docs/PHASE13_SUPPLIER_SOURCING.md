# Phase 13 — Supplier Discovery, Sourcing & Procurement Intelligence

## Overview

Phase 13 answers: **"Where can I source this product, from which suppliers, under what commercial terms, and which sourcing path is operationally viable?"**

It consumes Phase 7–12 outputs (demand signals, pricing, supply-chain, logistics, opportunity/viability) and combines them with supplier/product/evidence data to produce sourcing-specific intelligence. It does NOT recreate any prior phase calculations.

---

## Architecture

### Three-Layer Design

```
┌──────────────────────────────────────────────────────────┐
│  API Routes (Fastify)                                    │
│  /api/v1/sourcing/*                                      │
├──────────────────────────────────────────────────────────┤
│  Intelligence Service (Orchestrator)                     │
│  supplier-sourcing-intelligence.ts                       │
│  - Loads data from DB                                    │
│  - Runs 4 engines in sequence                            │
│  - Persists results atomically                           │
├──────────────────────────────────────────────────────────┤
│  Pure Engines (no DB, no HTTP, no filesystem)            │
│  1. Supplier Matching Engine                             │
│  2. Supplier Evaluation Engine                           │
│  3. Sourcing Engine                                      │
│  4. Procurement Viability Engine                         │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

```
Product + Supplier + Evidence + Phase 7-12 Data
    │
    ▼
┌─────────────────────┐
│ 1. Matching Engine   │ → matchLevel, matchScore, matchedAttributes
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 2. Evaluation Engine │ → qualityLevel, qualityScore, 12 dimension scores
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 3. Sourcing Engine   │ → sourcingLevel, sourcingScore, constraints
└──────────┬──────────┘
           ▼
┌─────────────────────────┐
│ 4. Viability Engine      │ → viabilityLevel, viabilityScore, confidence
└──────────┬──────────────┘
           ▼
    Persist to 7 Prisma models
```

---

## Pure Engines

### 1. Supplier Matching Engine

**File**: `apps/api/src/services/supplier-matching-engine.ts`

**Function**: `calculateSupplierMatch(input: SupplierMatchEngineInput): SupplierMatchResult`

Evaluates how well a supplier's product matches a target product:
- **Identifier matching**: GTIN, MPN, SKU, UPC, EAN (cross-type matching supported)
- **Attribute matching**: name token overlap, category match, country match, description overlap
- **Evidence confidence**: based on count, quality, recency, source independence
- **Weighted scoring**: renormalized over known dimensions only

**Match Levels**: `no_match` | `weak` | `possible` | `strong` | `exact`

### 2. Supplier Evaluation Engine

**File**: `apps/api/src/services/supplier-evaluation-engine.ts`

**Function**: `calculateSupplierEvaluation(input: SupplierEvaluationEngineInput): SupplierEvaluationResult`

Evaluates supplier quality across 12 independent dimensions:
1. Identity Confidence
2. Product Relevance
3. Evidence Quality
4. Commercial Completeness
5. Supplier Reliability
6. Price Transparency
7. MOQ Transparency
8. Lead Time Transparency
9. Certification Availability
10. Contact Completeness
11. Evidence Recency
12. Cross-Source Consistency

**Quality Levels**: `very_low` | `low` | `moderate` | `high` | `very_high`

### 3. Sourcing Engine

**File**: `apps/api/src/services/sourcing-engine.ts`

**Function**: `calculateSourcingOption(input: SourcingEngineInput): SourcingOptionResult`

Central engine evaluating sourcing economics:
- **MOQ analysis**: coverage months, burden score
- **Lead time analysis**: total cycle time, burden score
- **Capital exposure**: initial inventory cost, burden score
- **Constraint detection**: 10+ constraint types (UNKNOWN_MOQ, HIGH_MOQ, UNKNOWN_PRICE, LONG_LEAD_TIME, HIGH_CAPITAL_REQUIREMENT, etc.)
- **Weighted scoring**: renormalized over known dimensions

**Sourcing Levels**: `unavailable` | `weak` | `possible` | `strong` | `preferred`

### 4. Procurement Viability Engine

**File**: `apps/api/src/services/procurement-viability-engine.ts`

**Function**: `calculateProcurementViability(input: ProcurementViabilityEngineInput): ProcurementViabilityResult`

Evaluates whether a reseller can realistically procure from a specific supplier (12 dimensions):
1. Supplier Reliability
2. Supplier Evidence
3. Product Match
4. MOQ Burden
5. Capital Requirement
6. Price Transparency
7. Lead Time Burden
8. Payment Term Availability
9. Logistics Feasibility
10. Compliance Readiness
11. Documentation Completeness
12. Contact Availability

**Viability Levels**: `not_viable` | `weak` | `conditional` | `viable` | `strong`

---

## Intelligence Service

**File**: `apps/api/src/services/supplier-sourcing-intelligence.ts`

### Functions

| Function | Description |
|----------|-------------|
| `assessSupplierSourcing({ tenantId, productId })` | Full assessment for all suppliers of a product |
| `recalculateSupplierSourcing({ tenantId, productId })` | Recalculate (creates new version) |
| `listSupplierAssessments({ tenantId, productId?, page, limit })` | Paginated list |
| `getSupplierAssessment({ tenantId, assessmentId })` | Get single assessment |
| `getSupplierComparison({ tenantId, productId })` | Compare all suppliers for a product |
| `listSourcingConstraints({ tenantId, productId, page, limit })` | List constraints |
| `listSupplierContacts({ tenantId, supplierId })` | List supplier contacts |
| `getAssessmentHistory({ tenantId, productId, supplierId, limit })` | Version history |
| `expireStaleAssessments({ tenantId })` | Expire old assessments |

---

## API Reference

**Base URL**: `/api/v1/sourcing`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/assess` | Trigger assessment |
| GET | `/assessments` | List assessments (paginated) |
| GET | `/assessments/:id` | Get assessment |
| POST | `/assessments/:id/recalculate` | Recalculate |
| GET | `/assessments/:id/history` | Assessment history |
| GET | `/products/:productId/suppliers` | Supplier candidates |
| GET | `/products/:productId/suppliers/:supplierId` | Specific supplier |
| GET | `/products/:productId/sourcing/comparison` | Supplier comparison |
| GET | `/products/:productId/procurement-viability` | Procurement viability |
| GET | `/products/:productId/sourcing/constraints` | Constraints |
| GET | `/suppliers/:supplierId/contacts` | Supplier contacts |
| POST | `/expire` | Expire stale assessments |

---

## Database Models

7 new Prisma models:

| Model | Purpose |
|-------|---------|
| `SupplierSourcingAssessment` | Main assessment (match + sourcing + viability scores) |
| `SupplierProductMatch` | Match details per product-supplier pair |
| `SourcingOptionRecord` | Sourcing economics (price, MOQ, lead time, capital) |
| `ProcurementViabilityRecord` | Viability assessment (12 dimension scores) |
| `SupplierContactEvidence` | Contact provenance |
| `SourcingConstraintRecord` | Detected constraints |
| `SupplierComparisonSnapshot` | Comparison snapshots |

---

## Worker

### Processor

**File**: `apps/worker/src/processors/supplier-sourcing.ts`

Job types:
- `supplier-sourcing:assess` — Run assessment for product
- `supplier-sourcing:recalculate` — Recalculate specific assessment
- `supplier-sourcing:refresh` — Refresh stale assessments
- `supplier-sourcing:expire` — Expire old assessments

### Scheduler

**File**: `apps/worker/src/scheduler/supplier-sourcing-scheduler.ts`

- 12-hour detection cycle
- Max 20 assess jobs per tenant per cycle
- Deterministic job IDs (date-based)
- Enqueues assess, refresh, and expire jobs

---

## Key Design Decisions

1. **Unknown ≠ Zero**: Missing data reduces confidence, never treated as zero/negative
2. **Deterministic content hashing**: SHA-256 with stable JSON ordering, no timestamp contamination
3. **Monotonic versioning**: Per (tenantId, productId, supplierId) tuple
4. **Engine version**: `phase13-v1` persisted with every assessment
5. **Self-contained worker**: Includes engine source via tsconfig, not API-layer imports
6. **Content-hash deduplication**: Match, sourcing, viability records deduplicated by content hash
7. **Phase 13 consumes Phase 7–12**: Does NOT recalculate demand, pricing, logistics, or compliance
