# Phase 12 Report: Product Opportunity, Competition & Reseller Viability Intelligence

**Status:** ✅ CLEARED — ALL 17 TASKS COMPLETE  
**Date:** October 3, 2026  
**Implementation Period:** Full Phase 12 delivery + regression restoration + security audit pass

---

## Executive Summary

Phase 12 completes the intelligence stack by answering, per product, two independent deterministic questions: **how attractive is this product right now** (opportunity score) and **can a Bangladesh reseller act on it profitably** (viability score). Both scores derive exclusively from evidence accumulated by Phases 2–11 — competitor observations, demand signals and calculations, supply-chain nodes, logistics legs, price observations, and landed costs. No data is fabricated; unknown inputs propagate as `null`/`UNKNOWN` and are excluded from aggregates rather than substituted with zero or neutral values.

A full regression pass and a security/tenant-isolation/provenance audit were executed after the feature work. Three pre-existing regressions unrelated to Phase 12 were discovered and resolved during the regression task (see §6), and one tenant-hygiene gap found by the audit was fixed and re-verified (see §7).

**Key Achievements:**
- ✅ Pure deterministic opportunity engine (no LLM dependency) — 5 dimension analyzers (competition, demand, supply, logistics, pricing)
- ✅ 6 Prisma models: CompetitorObservation, CompetitorSnapshot, DemandOpportunitySnapshot, ProductOppSignal, ProductOppRisk, ResellerViabilityAssessment
- ✅ Opportunity ≠ Viability: independent scores, levels, and persistence (margin multiplies viability only when margin is known)
- ✅ Unknown ≠ Zero: weighted-mean renormalization over known dimensions only; no fabricated neutral scores; zero-data products score 0, not a baseline
- ✅ Derived margin range as fractions of price (min/base/max) from landed cost + market prices; negative margin is a valid commercial fact, not an error state
- ✅ 13 threshold-driven signals drawn from the strict 22-type `PRODUCT_OPP_SIGNAL_TYPES` vocabulary; unknown signal values throw — never substituted with a fallback type
- ✅ 12 risk types with severity escalation (e.g. negative margin → CRITICAL); 5 market-gap types; viability constraints
- ✅ 7 SHA-256 content-hash functions (stable JSON ordering, no timestamp contamination) with findFirst-dedup persistence for snapshots/signals/risks
- ✅ Monotonic versioned assessments (version = latest + 1, history retained); 14-day staleness expiry
- ✅ Completeness model (6 weighted dimensions) and confidence model (6 weighted factors) as independent dimensions; DataCompletenessBand mapping
- ✅ Cross-phase canonical references: Phase 7 demand, Phase 9 supply-chain nodes, Phase 10 logistics legs, Phase 11 pricing — **no second identity system**
- ✅ RESTful API: 13 endpoints under `/api/v1/opportunity` (conflict-free with Phase 8's `/api/v1/opportunities`)
- ✅ Self-contained worker processor (4 job types) importing only `@exosquad/database`, `@exosquad/logger`, `@exosquad/common`, `bullmq`
- ✅ Queue `product_opportunity` registered; scheduler with 12-hour cycle, 48-hour observation window, 20 jobs/tenant cap, deterministic jobIds
- ✅ 77 engine unit tests + 24 integration tests (including adversarial tenant-isolation, renormalization, version monotonicity, hash divergence, dedup, provenance, determinism)
- ✅ Full regression green: 391/391 unit, 204/204 integration, lint + build 10/10 packages
- ✅ Backward compatible with all Phase 2–11 implementations

---

## 1. Architecture

Three layers per the supplementary spec:

| Layer | File | Responsibility |
|-------|------|----------------|
| 1 — Pure Engine | `apps/api/src/services/product-opportunity-engine.ts` | Pure functions: dimension analysis, scoring, signals, risks, gaps, constraints, hashing |
| 2 — Intelligence Service | `apps/api/src/services/product-opportunity-intelligence.ts` | Load Phase 7–11 evidence → run engine → persist atomically → query APIs |
| 3 — HTTP API | `apps/api/src/routes/opportunity.ts` | 13 authenticated, Zod-validated, tenant-scoped endpoints |

Worker mirrors layers 1–2 in a self-contained processor (`apps/worker/src/processors/product-opportunity.ts`) per the Phase 2 rule that the worker never imports from `apps/api`.

**Scoring model:**
- Opportunity score = renormalized weighted mean of known dimension scores (weights: demand 0.22, margin 0.22, competition 0.16, supply 0.12, logistics 0.10; compliance/marketFit excluded in V1 — no evidence source).
- Viability score = opportunity score × margin multiplier (≤0 → 0.3, <0.10 → 0.6, <0.25 → 0.85, ≥0.25 → 1.0; unknown margin leaves score unmultiplied and is flagged via signals/risks).

---

## 2. What Was Delivered

### 2.1 Schema (`packages/database`)
6 models + supporting enums. Key columns: opportunity/viability scores and levels, derived margins (`grossMarginMin/Base/Max` as fractions), `estimatedMarginPercentage`, `unitLandedCost`, demand/competition/saturation classifications, `confidence`, `dataCompleteness` band, `version` (monotonic), `status` lifecycle (`DETECTED → WATCH → ACTIONABLE → EXPIRED`), `contentHash` throughout.

### 2.2 Common (`packages/common`)
`PRODUCT_OPP_SIGNAL_TYPES` (22 types), `PRODUCT_OPP_CONFIG` (algorithm `OPPORTUNITY_ALGORITHM_V1`): minimums, staleness windows (90/60/120 days), competition thresholds (2/5/10/20 + HHI 1500/2500), price compression (CV 0.10/0.05, min 5), risk thresholds (15 competitors, margin 0.10, volatility 0.30, 4 hops, completeness 0.40), confidence + completeness weights, opportunity + viability level thresholds, momentum thresholds.

### 2.3 Engine
Dimension analyzers, `calculateOpportunityScore` with `number | null` dimensions (Unknown ≠ Zero renormalization), margin derivation, viability + constraints, 13 signals, 12 risks (including `HIGH_LANDED_COST` when landed cost exceeds median market price), 5 market gaps, completeness + confidence, 7 hash functions.

### 2.4 Service
11 methods (`assessProductOpportunity`, `recalculateProductOpportunity`, `listAssessments`, `getAssessment`, `getAssessmentHistory`, `listSignals`, `listRisks`, `listCompetitorSnapshots`, `listCompetitorObservations`, `createCompetitorObservation`, `expireStaleAssessments`). Persistence is atomic (`$transaction`), content-hash deduplicated, and strictly validated (`toPrismaSignalType` throws on unknown values).

### 2.5 API
13 endpoints: assess, list/get assessments, recalculate, nested signals/risks/history, expire, flat signals/risks, competitor observation create/list, competitor snapshots. All routes enforce `server.authenticate`, parse input with Zod, and take `tenantId` exclusively from the JWT.

### 2.6 Worker & Scheduler
4 job types on queue `product_opportunity` (concurrency = ½ `WORKER_CONCURRENCY`, 20/min limiter). Scheduler: 60 s tick, 12-hour detection interval, per-tenant candidates from observations within 48 h (cap 20/tenant), deterministic jobIds.

---

## 3. Constitution Compliance

| Principle | Evidence |
|-----------|----------|
| No fabricated data | Zero-data products score 0 with UNKNOWN levels (integration test 4); unknown dimensions excluded from aggregates (test 5); no neutral-50 fabrication; momentum UNKNOWN without calculations (test 20) |
| Deterministic | Same inputs → identical scores/hashes across runs and versions (tests 23, unit determinism suite) |
| Evidence chain | Assessment → snapshots/signals/risks persisted atomically with content hashes; provenance resolvability pinned by test 16 |
| Resilience | Processor follows platform job semantics (attempts/backoff/limiter via queue-manager); per-source failures degrade to UNKNOWN dimensions, never collapse the assessment |
| Tenant isolation | Every query filters `tenantId`; `getAssessment` throws `NotFoundError` cross-tenant; `assertProductInTenant` guards write/assess entry points; 3 adversarial isolation tests |
| Unknown ≠ Zero | Renormalized weighted mean; unknown never treated as zero; margins null when inputs unknown |
| No investment verdicts | Engine exposes commercial facts, scores, uncertainty, risks — no buy/sell recommendations |

---

## 4. Verification Results (Final, Post-Audit)

| Check | Result |
|-------|--------|
| TypeScript strict (`tsc --noEmit`, all packages via turbo build) | ✅ clean |
| Lint (ESLint 9 flat) | ✅ 10/10 packages |
| Build (turbo) | ✅ 10/10 packages |
| Unit tests | ✅ 391/391 (11 files) |
| Integration tests | ✅ 204/204 (11 files, PostgreSQL) |
| Phase 12 engine unit tests | ✅ 77/77 |
| Phase 12 integration tests | ✅ 24/24 |

---

## 5. Notable Engine Corrections During Integration Hardening

Two design flaws were caught by the Phase 12 integration suite and fixed in the engine:

1. **Fabricated opportunity contribution from absent evidence** — `calculateOpportunityScore` originally inverted UNKNOWN competition into a positive opportunity contribution and added neutral-50 compliance/market-fit terms. Fixed: dimensions are `number | null`; the weighted mean renormalizes over known dimensions only; compliance/marketFit excluded entirely in V1; score is 0 when nothing is known.
2. **Missing margin derivation** — the engine consumed margins but never derived them from known inputs, persisting nulls. Fixed: `analyzePricingOpportunity` derives margin fractions (min/base/max) from landed cost + market prices; `estimatedMarginPercentage` uses the base fraction directly.

Additionally, the service's `toPrismaSignalType` was hardened from a fabricated fallback mapping to a strict validating pass-through over `PRODUCT_OPP_SIGNAL_TYPES` (unknown values throw — fail loud, never fabricate), and `toPrismaCompleteness` was remapped to the valid `DataCompletenessBand` enum values.

---

## 6. Regression Restoration (Pre-Existing Issues Resolved)

The full regression suite exposed three pre-existing failures unrelated to Phase 12 feature code. All were resolved and re-verified:

1. **Phase 8 engine backward compatibility (3 failures in `decision-intelligence.test.ts`)**
   - The prior engine recreation emitted uppercase severities/priorities (`"HIGH"/"MODERATE"/"LOW"`), violating the schema contract `severity String // low | medium | high | critical` and the worker processor's original lowercase behavior. Fixed in `apps/api/src/services/opportunity-engine.ts`: all 9 emission sites mapped to lowercase (`high/medium/low`), including the internal volatility-severity comparison.
   - `Opportunity.score` (raw demand score) diverged from `OpportunityCalculation.finalScore` (confidence-adjusted), breaking the original invariant `calc.finalScore === detail.score`. Fixed: the engine now returns the confidence-adjusted final score as `score` and sets `breakdown.finalScore: score`, matching the worker processor's original semantics (`score: finalScore`). Phase 8 unit tests (35/35) and integration tests (18/18) pass.
2. **`auth.test.ts` stale expectation** — `GET /api/v1/auth/me` without a token correctly returns **401** (`UnauthorizedError` per the constitution); the test expected a legacy 500. Test corrected to assert 401.
3. **`supply-chain.test.ts` test 34 (canonical node uniqueness)** — the Phase 9 partial unique index exists only as raw SQL in migration `20261002120000_phase9_supply_chain_corrections`, but the environment database was baselined with `prisma db push`, which never applies raw migration SQL. Verified zero duplicate canonical tuples, then applied:
   ```sql
   CREATE UNIQUE INDEX "supply_chain_nodes_canonical_entity_unique"
     ON "supply_chain_nodes"("tenantId", "nodeType", "canonicalEntityType", "canonicalEntityId")
     WHERE "canonicalEntityId" IS NOT NULL;
   ```
   All 36 supply-chain integration tests pass. Operational caveat documented in `docs/PHASE12_PRODUCT_OPPORTUNITY.md` §13.

---

## 7. Security / Tenant-Isolation / Provenance Audit

Systematic audit of all Phase 12 files (routes, service, engine, processor, scheduler):

**Security — PASS**
- All 13 endpoints behind `server.authenticate` preHandler; `tenantId` sourced exclusively from JWT (`request.user.tenantId`), never from body/query.
- Every handler validates input with Zod (`assessSchema`, `assessmentListSchema`, `signalListSchema`, `riskListSchema`, `competitorObservationCreateSchema`, `competitorObservationListSchema`, `competitorSnapshotListSchema`); pagination clamped (page ≥ 1, limit ≤ 100).
- No raw SQL, no hardcoded secrets, no internal error detail exposure (platform error handler governs).

**Tenant isolation — PASS (1 finding, fixed)**
- All 20+ service/worker query sites verified tenant-scoped (15 Prisma call sites in the service, 15 in the processor, scheduler iterates tenants).
- **Finding F1:** `createCompetitorObservation` and the assess entry point accepted arbitrary `productId` without validating product ownership. `CompetitorObservation` has no FK to `Product`, so cross-tenant productId references were possible (no data leak — all reads are tenant-scoped — but a tenant-hygiene violation). **Fix:** added `assertProductInTenant(tenantId, productId)` guard to both entry points, throwing `NotFoundError("Product", ...)` for foreign products. Re-verified: tsc clean, 24/24 Phase 12 integration tests, full suites green.

**Provenance — PASS**
- 7 SHA-256 hash functions with stable JSON ordering and no timestamp contamination; determinism and divergence pinned by unit and integration tests.
- Snapshots/signals/risks deduplicated by `(tenantId, productId[, type], contentHash)`; assessments versioned monotonically with retained history (test 6).
- Strict signal-type validation prevents fabricated provenance values.
- Upstream provenance references canonical Phase 7/9/10/11 IDs — verified in both service and worker loaders.

---

## 8. Operational Notes & Limitations

1. **Naming conflict avoidance**: Phase 8 owns `opportunities` queue, `OPPORTUNITY_CONFIG`, and `/api/v1/opportunities`; Phase 12 uses `product_opportunity`, `PRODUCT_OPP_CONFIG`, `/api/v1/opportunity`, with routes imported as `productOpportunityRoutes`.
2. **V1 scope**: compliance and market-fit weights exist in config but are excluded from scoring (no evidence source); `competitionStructure` and `marketSaturation` persist as `UNKNOWN` (never guessed). Worker processors duplicate engine logic by design (self-containment) — engine threshold changes must be mirrored in `apps/worker/src/processors/product-opportunity.ts`.
3. **db push caveat**: raw-SQL-only constraints (currently one Phase 9 partial unique index) are not applied by `prisma db push`; apply manually on baselined databases (SQL in §6.3 and docs §13.2).
4. **Staleness**: competitor observations older than 90 days are excluded from analysis; assessments older than 14 days expire via the `expire` job/endpoint.

---

## 9. Sign-Off

Phase 12 is genuinely operational: deterministic engine, persisted evidence-backed assessments with full provenance, tenant-isolated API surface, resilient async processing, and scheduling — verified by 595 passing tests (391 unit + 204 integration), clean lint/build across all 10 packages, and a completed security audit. Backward compatibility with Phases 2–11 is confirmed by the full green regression.

**Recommended next steps (post-Phase 12):** wire the compliance/market-fit dimensions when regulatory/fit evidence sources land (Phase 13+); consider promoting raw-SQL-only constraints into a managed migration strategy for `db push`-baselined environments.
