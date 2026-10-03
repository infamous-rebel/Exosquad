# Phase 8 Report: Decision Intelligence & Reseller Opportunity Engine

**Status:** ✅ COMPLETE  
**Date:** October 2, 2026  
**Implementation Period:** Full Phase 8 delivery

---

## Executive Summary

Phase 8 successfully implements a deterministic decision intelligence layer that consumes Phase 7 demand intelligence outputs and transforms them into actionable reseller opportunities. The system provides explainable scoring, full evidence provenance, risk assessment, and recommended actions — all without fabricating commercial data.

**Key Achievements:**
- ✅ Pure deterministic opportunity calculation engine (no LLM dependency)
- ✅ 5 Prisma models: Opportunity, OpportunityCalculation, OpportunityEvidence, OpportunityRisk, OpportunityAction
- ✅ SHA-256 content hash deduplication ensuring temporal immutability
- ✅ Full evidence provenance chain: Opportunity → Evidence → DemandSignal → Source
- ✅ 8 risk types with severity scoring
- ✅ 9 action types with priority classification
- ✅ 7 opportunity types with automatic classification
- ✅ Status lifecycle: DETECTED → WATCH → ACTIONABLE → EXPIRED
- ✅ RESTful API with 8 endpoints under `/api/v1/opportunities`
- ✅ Async worker processor with 4 job types
- ✅ Opportunity scheduler (6-hour detection cycle)
- ✅ 35 unit tests (all passing)
- ✅ 18 PostgreSQL integration tests (all passing)
- ✅ Full build verification (10/10 packages successful)
- ✅ Zero lint errors
- ✅ Backward compatible with Phase 7

---

## 1. Schema Changes

### New Models

#### Opportunity
Core decision record representing a detected reseller opportunity.

**Fields:**
- `id`, `tenantId` — primary key with tenant isolation
- `productId`, `productVariantId`, `categoryId` — product scope
- `geographyCode` — geographic scope (BD-DH, BD-CT, etc.)
- `opportunityType` — 7 types (GROWING_PRODUCT, EMERGING_PRODUCT, SUSTAINED_DEMAND, etc.)
- `status` — OpportunityStatus enum (DETECTED, VALIDATED, WATCH, ACTIONABLE, DISMISSED, EXPIRED)
- `score` — final composite score (0–100)
- `confidence` — confidence level (0.0–1.0)
- `title`, `summary` — human-readable descriptions
- `detectedAt`, `validFrom`, `validUntil` — temporal validity
- `algorithmVersion` — semver tracking (currently "8.0.0")
- `contentHash` — SHA-256 for deduplication
- Score breakdown: `demandScore`, `growthScore`, `velocityScore`, `persistenceScore`, `accelerationScore`, `seasonalityScore`, `sourceDiversityScore`, `riskScore`

**Unique Constraint:**
```
@@unique([tenantId, contentHash])
```

#### OpportunityCalculation
Immutable calculation snapshot preserving algorithm inputs and outputs.

**Fields:**
- `id`, `opportunityId` — linked to opportunity
- `algorithmVersion` — semver of algorithm used
- Score components: `demandScore`, `growthScore`, `velocityScore`, `persistenceScore`, `accelerationScore`, `seasonalityScore`, `sourceDiversityScore`, `confidenceScore`, `competitionScore`, `commercialScore`, `sourcingScore`, `riskScore`
- `finalScore` — computed final score
- `inputHash` — SHA-256 of inputs
- `inputSignalIds` — array of signal IDs used

**Unique Constraint:**
```
@@unique([opportunityId, inputHash])
```

#### OpportunityEvidence
Provenance chain linking opportunities to demand signals and sources.

**Fields:**
- `id`, `opportunityId` — linked to opportunity
- `evidenceType` — DEMAND_GROWTH, DEMMAND_VELOCITY, DEMAND_PERSISTENCE, SOURCE_DIVERSITY, ACCELERATION, SEASONALITY, MULTI_SOURCE_CONFIRMATION, GEOGRAPHIC_SIGNAL
- `sourceId`, `demandSignalId` — provenance links (nullable for aggregate evidence)
- `weight` — evidence weight (0.0–1.0)
- `contribution` — contribution to score (0.0–1.0)
- `snapshotAt` — when evidence was captured
- `metadata` — JSONB additional data

#### OpportunityRisk
Risk assessments identified during opportunity evaluation.

**Fields:**
- `id`, `opportunityId` — linked to opportunity
- `riskType` — 8 types (LOW_DEMAND_CONFIDENCE, HIGH_VOLATILITY, STALE_SIGNAL, DATA_SPARSE, SOURCE_CONFLICT, SEASONAL_DEPENDENCY, GEOGRAPHIC_LIMITATION, COMMERCIAL_DATA_MISSING)
- `severity` — low, medium, high, critical
- `score` — risk score (0.0–1.0)
- `description` — human-readable risk description
- `evidence` — JSONB supporting evidence

#### OpportunityAction
Recommended actions based on opportunity analysis.

**Fields:**
- `id`, `opportunityId` — linked to opportunity
- `actionType` — 9 types (INVESTIGATE_SUPPLIERS, CHECK_COMPETITORS, VERIFY_PRICE, RUN_SMALL_TEST, WATCH_DEMAND, INVESTIGATE_SOURCE_CONFLICT, CHECK_SEASONALITY, CHECK_LOCAL_AVAILABILITY, COMPARE_IMPORT_COST)
- `priority` — low, medium, high
- `title`, `description`, `reason` — human-readable action details

### New Enum

#### OpportunityStatus
```
DETECTED    — Initial detection, score below watch threshold
VALIDATED   — Manually validated (future phase)
WATCH       — Score >= 50, monitor closely
ACTIONABLE  — Score >= 75, take action
DISMISSED   — Manually dismissed (future phase)
EXPIRED     — Validity period passed, auto-expired
```

---

## 2. Algorithm Design

### Scoring Model

The final score (0–100) is a weighted composite:

| Component | Weight | Description |
|-----------|--------|-------------|
| Demand Strength | 25% | Normalized signal intensity |
| Demand Momentum | 20% | Growth trend + velocity |
| Demand Persistence | 15% | Duration and consistency |
| Confidence | 20% | Signal quality × source diversity |
| Risk Adjustment | 20% | (100 - riskScore) inverse |

### Confidence Model

Confidence (0.0–1.0) is computed from:

| Factor | Weight | Description |
|--------|--------|-------------|
| Signal Confidence | 30% | Average signal confidence |
| Source Diversity | 20% | Number of unique sources |
| Persistence | 20% | Signal duration consistency |
| Completeness | 15% | Signal count vs ideal (20) |
| Agreement | 15% | Coefficient of variation inverse |

### Risk Assessment

8 risk types are evaluated:

1. **LOW_DEMAND_CONFIDENCE** — confidence < 0.50
2. **HIGH_VOLATILITY** — coefficient of variation > 40%
3. **STALE_SIGNAL** — latest signal > 30 days old
4. **DATA_SPARSE** — fewer than 5 signals
5. **SOURCE_CONFLICT** — contradictory source trends
6. **SEASONAL_DEPENDENCY** — persistence < 30%
7. **GEOGRAPHIC_LIMITATION** — single geography only
8. **COMMERCIAL_DATA_MISSING** — no commercial data (always present in Phase 8)

### Opportunity Classification

| Type | Conditions |
|------|-----------|
| SEASONAL_OPPORTUNITY | seasonality > 50 AND demandStrength > 40 |
| EMERGING_PRODUCT | acceleration > 65 AND demandStrength < 60 |
| GROWING_PRODUCT | demandMomentum > 60 AND demandStrength > 50 |
| SUSTAINED_DEMAND | persistence > 70 AND demandStrength > 40 |
| MOMENTUM_OPPORTUNITY | demandMomentum > 55 |
| GEOGRAPHIC_OPPORTUNITY | single geography with strong signals |
| UNDEREXPLORED_CATEGORY | low source diversity |

### Status Classification

| Status | Condition |
|--------|-----------|
| ACTIONABLE | score >= 75 |
| WATCH | score >= 50 |
| DETECTED | score < 50 |
| EXPIRED | validUntil < now() |

---

## 3. Architecture

### Pure Calculation Engine

**File:** `apps/api/src/services/opportunity-engine.ts` (1032 lines)

The engine is a pure function: given demand signals, it produces an opportunity result. No side effects, no database access, fully deterministic.

**Exports:**
- `evaluateOpportunity(candidate)` — evaluates a candidate and returns score/evidence/risks/actions
- `computeOpportunityContentHash(...)` — SHA-256 hash for deduplication

### Orchestrator

**File:** `apps/api/src/services/decision-intelligence.ts` (386 lines)

Coordinates the detection pipeline:
1. Load demand signals from database
2. Group signals by product + geography
3. Evaluate each candidate through the engine
4. Persist opportunities with deduplication
5. Return summary

**Exports:**
- `runOpportunityDetection(params)` — full detection pipeline
- `expireStaleOpportunities(params)` — expire stale opportunities

### Query Service

**File:** `apps/api/src/services/opportunities.ts` (250 lines)

Provides query access for the API layer with filtering, pagination, and tenant isolation.

**Exports:**
- `listOpportunities(input)` — paginated list with filters
- `getOpportunityById(tenantId, id)` — detail with relations
- `getOpportunityEvidence(tenantId, id)` — evidence chain
- `getOpportunityRisks(tenantId, id)` — risk assessments
- `getOpportunityActions(tenantId, id)` — recommended actions
- `getOpportunityCalculation(tenantId, id)` — calculation snapshot
- `getOpportunitySummary(tenantId)` — aggregate statistics

### Worker Processor

**File:** `apps/worker/src/processors/opportunity.ts` (546 lines)

Self-contained worker processor (does not import API-layer code). Handles 4 job types:

| Job Type | Description |
|----------|-------------|
| `opportunity:detect` | Run full detection pipeline |
| `opportunity:recalculate` | Recalculate with new window |
| `opportunity:expire` | Expire stale opportunities |
| `opportunity:refresh` | Expire + detect combined |

### Scheduler

**File:** `apps/worker/src/scheduler/opportunity-scheduler.ts` (182 lines)

Runs every 60 seconds, triggers detection every 6 hours per tenant. Enqueues:
- `opportunity:detect` — per tenant, daily dedup by jobId
- `opportunity:expire` — per tenant, daily dedup by jobId

---

## 4. API Endpoints

### Opportunity Routes (`/api/v1/opportunities`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List opportunities with filtering/pagination |
| GET | `/summary` | Aggregate statistics |
| POST | `/recalculate` | Queue recalculation job |
| GET | `/:id` | Opportunity detail with relations |
| GET | `/:id/evidence` | Evidence provenance chain |
| GET | `/:id/risks` | Risk assessments |
| GET | `/:id/actions` | Recommended actions |

### Calculation Routes (`/api/v1/opportunity-calculations`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:id` | Calculation snapshot detail |

### Query Parameters (GET /)

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `opportunityType` | string | Filter by type |
| `productId` | string | Filter by product |
| `geographyCode` | string | Filter by geography |
| `minScore` | number | Minimum score (0–100) |
| `minConfidence` | number | Minimum confidence (0–1) |
| `from` | string | Start date (ISO 8601) |
| `to` | string | End date (ISO 8601) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `sortBy` | string | Sort field |
| `sortOrder` | string | asc/desc |

---

## 5. Queue Integration

### New Queue: `decision_intelligence`

Registered in `apps/worker/src/queues/queue-manager.ts`:
- Concurrency: `WORKER_CONCURRENCY / 2`
- Rate limit: 20 jobs/minute
- Retry: 3 attempts, exponential backoff

### Scheduler Integration

Registered in `apps/worker/src/app.ts`:
- `OpportunityScheduler` runs alongside `IngestionScheduler`
- Detection interval: 6 hours
- Expiration: runs with each detection cycle
- Job ID deduplication: `opp-detect-{tenantId}-{date}`, `opp-expire-{tenantId}-{date}`

---

## 6. Configuration

### OPPORTUNITY_CONFIG (from @exosquad/common)

```typescript
{
  algorithmVersion: "8.0.0",
  minimumSignalConfidence: 0.50,
  minimumPersistence: 0.40,
  minimumEvidenceSources: 2,
  actionableScore: 75,
  watchScore: 50,
  staleSignalDays: 30,
  confidenceWeights: {
    signal: 0.30,
    sourceDiversity: 0.20,
    persistence: 0.20,
    completeness: 0.15,
    agreement: 0.15,
  },
  scoreWeights: {
    demandStrength: 0.25,
    demandMomentum: 0.20,
    demandPersistence: 0.15,
    confidence: 0.20,
    riskAdjustment: 0.20,
  },
}
```

---

## 7. Testing

### Unit Tests (35 tests)

**File:** `apps/api/test/unit/opportunity-engine.test.ts`

| Category | Tests |
|----------|-------|
| Basic scoring | 4 |
| Growth/acceleration | 5 |
| Persistence | 3 |
| Source diversity | 3 |
| Confidence model | 4 |
| Risk assessment | 5 |
| Missing data handling | 3 |
| Determinism | 2 |
| Content hashing | 2 |
| Action generation | 2 |
| Type classification | 2 |

### Integration Tests (18 tests)

**File:** `apps/api/test/integration/decision-intelligence.test.ts`

| Test | Description |
|------|-------------|
| Opportunity detection | Creates opportunities from demand signals |
| Content hash dedup | Same signals → same hash → deduplicated |
| Tenant isolation | Cross-tenant data inaccessible |
| Filtering/pagination | Status, geography, score filters work |
| Detail retrieval | Full opportunity with all relations |
| Evidence chain | Provenance from opportunity to signals |
| Risk persistence | All risk types persisted correctly |
| Action persistence | All action types persisted correctly |
| Calculation snapshot | Calculation linked to opportunity |
| Summary generation | Aggregate statistics correct |
| Expiration | Stale opportunities auto-expired |
| No signals | Empty result when no signals exist |
| Score determinism | Same input → same output |
| Status classification | DETECTED/WATCH/ACTIONABLE correct |
| Multi-source evidence | Evidence from multiple sources tracked |
| Calculation retrieval | By ID with tenant check |
| Cross-tenant rejection | NotFoundError for wrong tenant |
| Low confidence filtering | Below-threshold signals rejected |

### Test Results Summary

```
Unit Tests:        133 passed (35 new + 98 existing)
Integration Tests:  67 passed (18 new + 49 existing)
Total:             200 tests passed
```

---

## 8. Files Created/Modified

### New Files (7)

| File | Lines | Description |
|------|-------|-------------|
| `apps/api/src/services/opportunity-engine.ts` | 1032 | Pure calculation engine |
| `apps/api/src/services/decision-intelligence.ts` | 386 | Orchestrator |
| `apps/api/src/services/opportunities.ts` | 250 | Query service |
| `apps/api/src/routes/opportunities.ts` | 156 | API routes |
| `apps/worker/src/processors/opportunity.ts` | 546 | Worker processor |
| `apps/worker/src/scheduler/opportunity-scheduler.ts` | 182 | Opportunity scheduler |
| `apps/api/test/integration/decision-intelligence.test.ts` | 525 | Integration tests |

### Modified Files (5)

| File | Changes |
|------|---------|
| `packages/database/prisma/schema.prisma` | Added 5 models + 1 enum |
| `packages/common/src/index.ts` | Added Phase 8 enums/types/constants |
| `apps/api/src/app.ts` | Registered opportunity routes |
| `apps/worker/src/queues/queue-manager.ts` | Added decision_intelligence queue |
| `apps/worker/src/app.ts` | Added OpportunityScheduler |

### Migration

| Name | Description |
|------|-------------|
| `add_phase8_decision_intelligence` | Creates 5 tables + 1 enum |

---

## 9. Design Decisions

### 1. No Commercial Data Fabrication
Phase 8 explicitly does NOT fabricate supplier prices, margins, competition data, or any commercial metrics. The `COMMERCIAL_DATA_MISSING` risk is always present. Commercial scoring fields (`competitionScore`, `commercialScore`, `sourcingScore`) are persisted as `null`.

### 2. Worker Self-Containment
The worker processor (`apps/worker/src/processors/opportunity.ts`) does NOT import from the API layer. Calculation logic is replicated inline to maintain architectural boundaries.

### 3. Content Hash Deduplication
Each opportunity has a SHA-256 content hash based on: tenantId, productId, productVariantId, geographyCode, opportunityType, signalIds, and algorithmVersion. This ensures:
- Same input → same hash → deduplicated
- Different signals → different hash → new opportunity
- Algorithm version change → different hash → new calculation

### 4. Temporal Immutability
Opportunities are NEVER modified after creation. If signals change, a new opportunity is created with a new content hash. Old opportunities expire via `validUntil` timestamp.

### 5. Backward Compatibility
Phase 8 consumes Phase 7 outputs (DemandSignal) without modifying any Phase 7 tables or logic. All existing tests continue to pass.

---

## 10. Known Limitations

1. **No commercial scoring** — Phase 8 does not calculate supplier prices, margins, or competition. These require external data sources (future phase).

2. **No LLM integration** — All scoring is deterministic. AI-assisted analysis (e.g., product description comparison) is not implemented.

3. **No manual validation workflow** — VALIDATED and DISMISSED statuses exist but have no UI or API workflow yet.

4. **Scheduler is interval-based** — Not cron-based. Detection runs every 6 hours from worker startup.

5. **No opportunity merging** — If two opportunities overlap (same product, different geography), they remain separate.

6. **Evidence is snapshot-based** — Evidence records capture state at detection time. They do not update as signals change.

---

## 11. Phase 8 Verification Checklist

- [x] Schema: 5 models + 1 enum added
- [x] Migration: Applied successfully
- [x] Common types: All enums/constants exported
- [x] Engine: Pure function, deterministic, no side effects
- [x] Orchestrator: Groups signals, evaluates, persists atomically
- [x] Query service: Filtering, pagination, tenant isolation
- [x] API routes: 8 endpoints, authenticated, validated
- [x] Worker processor: 4 job types, self-contained
- [x] Queue registration: decision_intelligence queue active
- [x] Scheduler: 6-hour detection cycle
- [x] Unit tests: 35 tests, all passing
- [x] Integration tests: 18 tests, all passing
- [x] Build: 10/10 packages successful
- [x] Lint: Zero errors
- [x] Backward compatibility: All Phase 7 tests pass

---

## 12. Next Steps (Phase 9+)

1. **Commercial data integration** — Connect supplier APIs for pricing/margin data
2. **AI research orchestration** — LLM-assisted product comparison and authenticity analysis
3. **Alert system** — Notify users when actionable opportunities are detected
4. **Dashboard UI** — Visual opportunity explorer with filtering and detail views
5. **Manual validation workflow** — Allow users to validate/dismiss opportunities
6. **Opportunity merging** — Cross-geography opportunity consolidation
7. **Historical trending** — Track opportunity score evolution over time
