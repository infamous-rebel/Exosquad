# Phase 13 — Implementation Report

## Supplier Discovery, Sourcing & Procurement Intelligence

**Status**: Complete
**Engine Version**: `phase13-v1`
**Date**: 2025

---

## 1. Implementation Summary

Phase 13 delivers the intelligence layer that answers: *"Where can I source this product, from which suppliers, under what commercial terms, and which sourcing path is operationally viable?"*

The implementation follows the established three-layer architecture:

1. **Pure Engines** — 4 deterministic functions with no DB/HTTP/filesystem side effects
2. **Intelligence Service** — Orchestrator that loads data, runs engines, persists results
3. **API Routes** — 12 Fastify endpoints under `/api/v1/sourcing`

### Files Created/Modified

| Layer | File | Lines | Purpose |
|-------|------|------:|---------|
| Schema | `packages/database/prisma/schema.prisma` | — | 7 new Prisma models |
| Common | `packages/common/src/index.ts` | — | SOURCING_CONFIG, types, constants |
| Engine | `apps/api/src/services/supplier-matching-engine.ts` | 459 | Product-supplier matching |
| Engine | `apps/api/src/services/supplier-evaluation-engine.ts` | 443 | 12-dimension supplier evaluation |
| Engine | `apps/api/src/services/sourcing-engine.ts` | 493 | Sourcing economics analysis |
| Engine | `apps/api/src/services/procurement-viability-engine.ts` | 355 | 12-dimension procurement viability |
| Service | `apps/api/src/services/supplier-sourcing-intelligence.ts` | 667 | Orchestrator |
| Routes | `apps/api/src/routes/sourcing.ts` | 165 | 12 API endpoints |
| Worker | `apps/worker/src/processors/supplier-sourcing.ts` | 444 | Background job processor |
| Worker | `apps/worker/src/queues/queue-manager.ts` | — | Queue registration |
| Worker | `apps/worker/src/scheduler/supplier-sourcing-scheduler.ts` | — | 12-hour detection cycle |
| Worker | `apps/worker/src/app.ts` | — | Scheduler startup |
| Worker | `apps/worker/tsconfig.json` | — | Include API engine files |
| Docs | `docs/PHASE13_SUPPLIER_SOURCING.md` | 227 | Architecture documentation |

---

## 2. Pure Engines

### 2.1 Supplier Matching Engine

**Function**: `calculateSupplierMatch(input): SupplierMatchResult`

Evaluates how well a supplier's product matches a target product.

- **Identifier matching**: GTIN, MPN, SKU, UPC, EAN with cross-type matching
- **Attribute matching**: name token overlap, category/country match, description overlap
- **Evidence confidence**: count, quality, recency, source independence
- **Weighted scoring**: renormalized over known dimensions only (Unknown ≠ Zero)

**Match Levels**: `no_match` (< 20) | `weak` (20–40) | `possible` (40–60) | `strong` (60–80) | `exact` (≥ 80)

### 2.2 Supplier Evaluation Engine

**Function**: `calculateSupplierEvaluation(input): SupplierEvaluationResult`

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

**Quality Levels**: `very_low` (< 20) | `low` (20–40) | `moderate` (40–60) | `high` (60–80) | `very_high` (≥ 80)

### 2.3 Sourcing Engine

**Function**: `calculateSourcingOption(input): SourcingOptionResult`

Central engine evaluating sourcing economics:

- MOQ analysis (coverage months, burden score)
- Lead time analysis (cycle time, burden score)
- Capital exposure (initial inventory cost, burden score)
- 10+ constraint types detected (UNKNOWN_MOQ, HIGH_MOQ, UNKNOWN_PRICE, LONG_LEAD_TIME, HIGH_CAPITAL_REQUIREMENT, etc.)
- Weighted scoring renormalized over known dimensions

**Sourcing Levels**: `unavailable` (< 15) | `weak` (15–35) | `possible` (35–55) | `strong` (55–75) | `preferred` (≥ 75)

### 2.4 Procurement Viability Engine

**Function**: `calculateProcurementViability(input): ProcurementViabilityResult`

Evaluates whether procurement from a specific supplier is realistic (12 dimensions):

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

**Viability Levels**: `not_viable` (< 20) | `weak` (20–40) | `conditional` (40–60) | `viable` (60–80) | `strong` (≥ 80)

---

## 3. Database Schema

7 new Prisma models added:

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `SupplierSourcingAssessment` | Main assessment record | matchLevel, matchScore, sourcingLevel, sourcingScore, viabilityLevel, viabilityScore, confidence, completeness |
| `SupplierProductMatch` | Match details per pair | matchLevel, matchScore, matchedAttributes, unmatchedAttributes, evidenceConfidence |
| `SourcingOptionRecord` | Sourcing economics | sourcePrice, moq, leadTimeDays, estimatedLandedCost, estimatedInitialInventoryCost |
| `ProcurementViabilityRecord` | Viability scores | viabilityLevel, viabilityScore, capitalRequirement, estimatedLeadTimeDays, inventoryExposure |
| `SupplierContactEvidence` | Contact provenance | contactType, contactValue, confidence |
| `SourcingConstraintRecord` | Detected constraints | constraintType, severity, value, explanation |
| `SupplierComparisonSnapshot` | Comparison snapshots | supplierCount, comparisonFactors |

All models include tenant relations, content hashing (SHA-256), and engine version tracking.

---

## 4. API Endpoints

12 endpoints under `/api/v1/sourcing`:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/assess` | Trigger assessment for a product |
| GET | `/assessments` | List assessments (paginated) |
| GET | `/assessments/:id` | Get single assessment |
| POST | `/assessments/:id/recalculate` | Recalculate assessment |
| GET | `/assessments/:id/history` | Version history |
| GET | `/products/:productId/suppliers` | All supplier assessments for product |
| GET | `/products/:productId/suppliers/:supplierId` | Specific supplier assessment |
| GET | `/products/:productId/sourcing/comparison` | Compare all suppliers |
| GET | `/products/:productId/procurement-viability` | Procurement viability |
| GET | `/products/:productId/sourcing/constraints` | Sourcing constraints |
| GET | `/suppliers/:supplierId/contacts` | Supplier contact evidence |
| POST | `/expire` | Expire stale assessments |

---

## 5. Worker Infrastructure

### Processor

**File**: `apps/worker/src/processors/supplier-sourcing.ts`

4 job types:
- `supplier-sourcing:assess` — Run full assessment for a product
- `supplier-sourcing:recalculate` — Recalculate specific assessment (new version)
- `supplier-sourcing:refresh` — Refresh stale assessments
- `supplier-sourcing:expire` — Expire old assessments

Self-contained: includes engine source via tsconfig, not API-layer imports.

### Queue

Registered in `apps/worker/src/queues/queue-manager.ts` following Phase 12 pattern.

### Scheduler

**File**: `apps/worker/src/scheduler/supplier-sourcing-scheduler.ts`

- 12-hour detection cycle
- Max 20 assess jobs per tenant per cycle
- Deterministic job IDs (date-based)
- Enqueues assess, refresh, and expire jobs

---

## 6. Test Results

### 6.1 Unit Tests — Engine Tests (150 tests)

| Test File | Tests | Status |
|-----------|------:|--------|
| `supplier-matching-engine.test.ts` | 36 | ✅ Pass |
| `supplier-evaluation-engine.test.ts` | 44 | ✅ Pass |
| `sourcing-engine.test.ts` | 32 | ✅ Pass |
| `procurement-viability-engine.test.ts` | 38 | ✅ Pass |
| **Subtotal** | **150** | **✅ All Pass** |

### 6.2 Unit Tests — Service Tests (27 tests)

| Test File | Tests | Status |
|-----------|------:|--------|
| `supplier-sourcing-intelligence.test.ts` | 27 | ✅ Pass |

Coverage: orchestration logic, tenant isolation, Prisma mocking (vi.hoisted), error handling, versioning, engine version persistence.

### 6.3 Integration Tests (27 tests)

| Test File | Tests | Status |
|-----------|------:|--------|
| `supplier-sourcing-intelligence.test.ts` | 27 | ✅ Pass |

Coverage: real DB, tenant isolation, product ownership, evidence ownership, persistence verification (all 7 models), recalculation versioning, temporal data, Unknown ≠ Zero, empty supplier sets, multiple suppliers comparison, cross-tenant rejection, content hash stability, engine version consistency, score bounds, status values.

### 6.4 Full Regression

```
Test Files  16 passed (16)
     Tests  568 passed (568)
  Duration  22.63s
```

All Phase 7–12 tests remain green. No modifications to prior-phase semantics.

### 6.5 Type Check & Build

| Check | Result |
|-------|--------|
| `pnpm typecheck` | ✅ Clean |
| `pnpm build` (api) | ✅ Clean |
| `pnpm build` (worker) | ✅ Clean |
| `pnpm lint` | ✅ Clean |

---

## 7. Key Design Decisions

1. **Unknown ≠ Zero**: Missing dimensions are excluded from weighted aggregates and renormalized over known dimensions only. Missing info reduces confidence; it is never treated as a negative fact.

2. **Deterministic content hashing**: SHA-256 with stable JSON key ordering. No timestamps in hash input. Enables content-hash deduplication and change detection.

3. **Monotonic versioning**: Each (tenantId, productId, supplierId) tuple has an independent version counter that increments on recalculation.

4. **Engine version tracking**: `phase13-v1` persisted with every assessment, enabling future engine upgrades without breaking existing data.

5. **Self-contained worker**: Worker processor includes engine source files via tsconfig `include`, avoiding cross-package API imports. Only imports from `@exosquad/database`, `@exosquad/logger`, `@exosquad/common`, and `bullmq`.

6. **Content-hash deduplication**: Match, sourcing, and viability records are deduplicated by content hash — upsert only when content actually changes.

7. **Phase 13 consumes Phase 7–12**: Demand signals, pricing, logistics, and compliance data are loaded as references. Phase 13 does NOT recalculate any prior-phase outputs.

---

## 8. TypeScript Issues Resolved

| Issue | Fix |
|-------|-----|
| Worker `rootDir` constraint | Removed `rootDir: "src"` from worker tsconfig, added API engine files to `include` |
| Prisma JSON field type mismatch | Cast explanation arrays with `as never` for Prisma `InputJsonValue` fields |
| `noUncheckedIndexedAccess` errors | Added `?? 0` fallbacks for Record access in engine files |
| Nullable string fields | Added `?? ""` fallbacks for `supplierProductName` and `description` |
| TS2742 inferred Prisma types | Added explicit `Promise<unknown>` return types to query functions |
| Fastify spread type error | Cast `request.query` to `Record<string, unknown>` before spread |

---

## 9. Verification Checklist

- [x] 7 Prisma models created with tenant relations
- [x] SOURCING_CONFIG with all weights, thresholds, constants
- [x] 4 pure engines (no DB, no HTTP, no filesystem)
- [x] Intelligence service orchestrator
- [x] 12 API endpoints registered
- [x] Worker processor (4 job types)
- [x] Queue registration
- [x] Scheduler (12-hour cycle)
- [x] 150 engine unit tests passing
- [x] 27 service unit tests passing
- [x] 27 integration tests passing (real DB)
- [x] 568 total tests passing (all phases)
- [x] TypeScript clean
- [x] Build clean (api + worker)
- [x] Lint clean
- [x] No regression in Phase 7–12 tests
- [x] Architecture documentation
