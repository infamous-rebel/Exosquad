# Phase 12 — Product Opportunity, Competition & Reseller Viability Intelligence

> Technical reference for the Phase 12 implementation.
> Companion documents: `PHASE12_REPORT.md` (completion report), `docs/ARCHITECTURE.md` (platform overview).

---

## 1. Overview

Phase 12 turns the raw evidence accumulated by Phases 2–11 into a single deterministic answer per product: **is there an opportunity, and is it reseller-viable for Bangladesh?**

It produces two independent scores per assessment:

| Score | Question it answers | Persisted as |
|-------|--------------------|--------------|
| **Opportunity score** (0–100) | How attractive is this product right now? | `ResellerViabilityAssessment.opportunityScore` / `opportunityLevel` |
| **Viability score** (0–100) | Can a reseller act on it profitably? | `ResellerViabilityAssessment.viabilityScore` / `viabilityLevel` |

Opportunity ≠ Viability: a product can have high opportunity (strong demand, low competition) yet low viability (negative margin, logistics too complex). The two dimensions are computed and persisted independently and are never conflated.

---

## 2. Design Principles

Every Phase 12 component enforces the AGENTS.md constitution:

- **No fabricated data.** Missing inputs propagate as `null` / `"UNKNOWN"` end-to-end. Unknown is never substituted with zero or a neutral default.
- **Deterministic where possible.** All scoring, hashing, thresholds, and risk detection are pure functions of the evidence. There is no LLM in the V1 pipeline.
- **Evidence chain.** Every assessment links back to the observations, signals, and calculations that produced it (see §9).
- **Tenant isolation.** Every query filters by `tenantId`; cross-tenant reads throw `NotFoundError`. Entry points additionally validate that the referenced `productId` belongs to the caller's tenant (`assertProductInTenant` guard in the intelligence service).
- **Immutable history.** Assessments are versioned monotonically; old versions are never overwritten.

---

## 3. Architecture: Three Layers

```
┌────────────────────────────────────────────────────────────────────┐
│ Layer 3 — API (apps/api/src/routes/opportunity.ts)                 │
│   13 endpoints under /api/v1/opportunity (Fastify + Zod)           │
├────────────────────────────────────────────────────────────────────┤
│ Layer 2 — Intelligence Service                                     │
│   (apps/api/src/services/product-opportunity-intelligence.ts)      │
│   Loads cross-phase evidence → calls engine → persists results     │
├────────────────────────────────────────────────────────────────────┤
│ Layer 1 — Pure Engine                                              │
│   (apps/api/src/services/product-opportunity-engine.ts)            │
│   Pure functions: analysis, scoring, signals, risks, hashing       │
└────────────────────────────────────────────────────────────────────┘
              ▲                                    ▲
              │                                    │
   apps/worker/src/processors/product-opportunity.ts
   (self-contained mirror of Layer 1+2 logic — see §8)
   apps/worker/src/scheduler/product-opportunity-scheduler.ts
```

The worker processor is intentionally **self-contained** (imports only `@exosquad/database`, `@exosquad/logger`, `@exosquad/common`, `bullmq`) and re-implements the same deterministic logic. This preserves the Phase 2-established rule that the worker never imports from `apps/api`.

---

## 4. Data Model

Six Prisma models (`packages/database/prisma/schema.prisma`):

| Model | Purpose |
|-------|---------|
| `CompetitorObservation` | Raw per-competitor observation (name, source, price, rating, availability). Immutable evidence input. |
| `CompetitorSnapshot` | Aggregated per-assessment competition snapshot (counts, price range, concentration). Content-hash deduplicated. |
| `DemandOpportunitySnapshot` | Per-assessment demand snapshot (level, momentum, growth, seasonality, volatility). |
| `ProductOppSignal` | Detected signal (22-type vocabulary) with direction, magnitude, evidence. |
| `ProductOppRisk` | Detected risk with severity (`LOW/MODERATE/HIGH/CRITICAL`), trigger, affected dimension. |
| `ResellerViabilityAssessment` | Root entity: opportunity + viability scores, levels, margins, completeness, confidence, status, version. |

Assessment status lifecycle: `DETECTED → WATCH → ACTIONABLE → EXPIRED`.

---

## 5. Cross-Phase Canonical References

Phase 12 introduces **no second identity system**. It consumes upstream phases by reference:

| Dimension | Source | What is used |
|-----------|--------|--------------|
| Demand | Phase 7 | `DemandSignal` (status, geography) and latest `DemandCalculation.result` JSON (trend, growthRate) |
| Supply | Phase 9 | `SupplyChainNode` with `nodeType` `SUPPLIER` / `MANUFACTURER` |
| Logistics | Phase 10 | `LogisticsLeg` (legType, transit days, confidence) joined via `fromNode`/`toNode` |
| Pricing | Phase 11 | `PriceObservation` and the latest `LandedCostCalculation` |

---

## 6. Deterministic Engine Semantics

### 6.1 Analysis dimensions

Five dimension analyzers each produce a score (0–100), an explanatory narrative, and dimension-specific facts:

- **Competition** — unique/fresh/active competitor counts over a 90-day freshness window; price range (min/max/median/spread); price pressure; simplified HHI concentration; price-compression detection (CV thresholds).
- **Demand** — level (HIGH/MODERATE/LOW) × momentum (ACCELERATING/GROWING/STABLE/DECLINING/VOLATILE) with search-growth adjustment.
- **Supply** — supplier count, country diversity, price spread, reliability; concentration classification via `supplierConcentrationThresholds`.
- **Logistics** — route count, transport modes, hop count, transit-time range and uncertainty; complexity classification (`highLogisticsComplexityMinHops`).
- **Pricing** — market price statistics, landed cost, price volatility, and **derived margin range**:
  - `marginBase = (referencePrice − unitLandedCost) / referencePrice`
  - `marginMin` from `marketPriceMin`, `marginMax` from `marketPriceMax` (only when > 0)
  - Margins are **fractions of price** (0.25 = 25%).

### 6.2 Unknown ≠ Zero score renormalization

`calculateOpportunityScore` accepts each dimension score as `number | null`:

- Unknown dimensions are **excluded** from the weighted mean (weights renormalized over known dimensions only).
- Compliance and market-fit weights are **excluded entirely in V1** (no evidence source exists); the engine never fabricates a neutral 50.
- When no dimension is known the score is **0**, not a fabricated baseline.

### 6.3 Viability

Viability starts from the opportunity score and applies a **margin multiplier** (only when margin is known):

| Base margin (fraction) | Multiplier |
|------------------------|------------|
| ≤ 0 | 0.3 |
| < 0.10 | 0.6 |
| < 0.25 | 0.85 |
| ≥ 0.25 | 1.0 |

Unknown margin leaves the score unmultiplied but is flagged via signals/risks. Viability constraints (e.g. `INSUFFICIENT_MARGIN`) are persisted separately on the assessment.

### 6.4 Signals, risks, market gaps

- **Signals**: V1 emits 13 threshold-driven signal types drawn from the 22-type `PRODUCT_OPP_SIGNAL_TYPES` vocabulary (e.g. `HIGH_COMPETITION`, `PRICE_COMPRESSION`, `LOW_MARGIN`, `HIGH_LANDED_COST`, `LOW_DATA_COMPLETENESS`), each with direction, magnitude, and evidence.
- **Risks**: 12 risk types (`WEAK_DEMAND`, `DEMAND_DECLINE`, `HIGH_COMPETITION`, `PRICE_COMPRESSION`, `SUPPLIER_CONCENTRATION`, `SUPPLY_UNCERTAINTY`, `LOGISTICS_COMPLEXITY`, `LOW_MARGIN`, `HIGH_PRICE_VOLATILITY`, `HIGH_LANDED_COST`, `INSUFFICIENT_DATA`, `SEASONALITY_RISK`) with severity escalation (e.g. negative margin → `CRITICAL`).
- **Market gaps**: 5 types (`COMPETITION_GAP`, `DEMAND_SUPPLY_GAP`, `AVAILABILITY_GAP`, `PRICE_GAP`, `UNDERSUPPLIED`) with strength 0.65–0.9.

### 6.5 Completeness and confidence

- **Completeness** = weighted fraction of dimensions with usable data (`completenessWeights`: demand 0.20, competition 0.20, supply 0.15, logistics 0.15, pricing 0.15, cost 0.15).
- **Confidence** = weighted blend of per-dimension evidence confidence plus completeness (`confidenceWeights`: 0.20/0.20/0.15/0.15/0.15/0.15).
- Completeness maps to the `DataCompletenessBand` enum (HIGH ≥ 0.75, MODERATE ≥ 0.5, LOW ≥ 0.25, VERY_LOW > 0, else UNKNOWN). Completeness < 0.40 raises the `INSUFFICIENT_DATA` risk.

---

## 7. Content Hashing & Deduplication

Seven SHA-256 hash functions (stable JSON key ordering, **no timestamp contamination**):

`computeCompetitorContentHash`, `computeCompetitorSnapshotHash`, `computeDemandSnapshotHash`, `computeOpportunityInputHash`, `computeOpportunityContentHash`, `computeViabilityInputHash`, `computeViabilityContentHash`.

Persistence is dedup-safe:

- Snapshots/signals/risks: `findFirst` by `(tenantId, productId, contentHash)` (signals additionally keyed by `signalType`); create only when absent.
- Assessments: new **version** row per run (`version = latest + 1`); identical input hash short-circuits to the existing latest assessment.

---

## 8. Worker & Scheduler

- **Queue**: `product_opportunity` (registered in `apps/worker/src/queues/queue-manager.ts`; concurrency = half of `WORKER_CONCURRENCY`; limiter 20 jobs/min).
- **Job types**: `product-opportunity:assess`, `product-opportunity:recalculate`, `product-opportunity:refresh`, `product-opportunity:expire`.
- **Scheduler** (`apps/worker/src/scheduler/product-opportunity-scheduler.ts`): 60 s tick, 12-hour detection interval; per tenant enqueues assess jobs (deterministic jobIds including a day key) for products with competitor observations in the last 48 h (capped at 20 per tenant per cycle), plus refresh and expire jobs.

---

## 9. HTTP API Reference

All routes require Bearer-token authentication and are tenant-scoped from the JWT. Base prefix: `/api/v1/opportunity`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/assess` | Run assessment for `{ productId }`; returns the persisted assessment |
| GET | `/assessments` | Paginated list; filters `productId`, `status` |
| GET | `/assessments/:id` | Assessment detail (with constraints/gap data) |
| POST | `/assessments/:id/recalculate` | Recompute and persist a new version |
| GET | `/assessments/:id/signals` | Signals for the assessment's product |
| GET | `/assessments/:id/risks` | Risks for the assessment's product |
| GET | `/assessments/:id/history` | Version history (limit 50) |
| POST | `/expire` | Expire stale assessments (`STALE_ASSESSMENT_DAYS` = 14) |
| GET | `/signals` | Paginated signals; filters `productId`, `signalType`, `direction` |
| GET | `/risks` | Paginated risks; filters `productId`, `severity`, `riskType` |
| POST | `/competitors` | Create a competitor observation (Zod-validated, hash-deduplicated) |
| GET | `/competitors` | Paginated competitor observations for a product |
| GET | `/competitor-snapshots` | Recent competition snapshots for a product |

Pagination follows the platform contract: `{ data: [], pagination: { page, limit, total, totalPages } }`.

### Intelligence service methods

`assessProductOpportunity`, `recalculateProductOpportunity`, `listAssessments`, `getAssessment`, `getAssessmentHistory`, `listSignals`, `listRisks`, `listCompetitorSnapshots`, `listCompetitorObservations`, `createCompetitorObservation`, `expireStaleAssessments`.

---

## 10. Provenance Chain

```
ResellerViabilityAssessment (version N)
 ├── ProductOppSignal[]      (contentHash-deduplicated)
 ├── ProductOppRisk[]        (contentHash-deduplicated)
 ├── CompetitorSnapshot      (contentHash-deduplicated)
 ├── DemandOpportunitySnapshot
 └── inputs referencing:
      DemandSignal / DemandCalculation      (Phase 7)
      SupplyChainNode (SUPPLIER/MFR)        (Phase 9)
      LogisticsLeg / LogisticsNode          (Phase 10)
      PriceObservation / LandedCostCalculation (Phase 11)
      CompetitorObservation                 (Phase 12 raw evidence)
```

---

## 11. Configuration Reference

`PRODUCT_OPP_CONFIG` (`packages/common/src/index.ts`, algorithm `OPPORTUNITY_ALGORITHM_V1`):

| Group | Key values |
|-------|-----------|
| Minimums | 3 competitor observations, 5 demand observations, 2 supplier observations, 3 prices for statistics |
| Staleness | 90 d competitors, 60 d demand, 120 d suppliers |
| Competition | veryLow ≤ 2, low ≤ 5, moderate ≤ 10, high ≤ 20; HHI 1500 / 2500 |
| Price compression | CV < 0.10 compressed, < 0.05 very compressed, min 5 observations |
| Risk thresholds | ≥ 15 competitors; margin < 0.10; CV > 0.30; ≥ 4 hops; completeness < 0.40; margin range < 0.05 |
| Confidence weights | demand 0.20, competition 0.20, supply 0.15, logistics 0.15, pricing 0.15, completeness 0.15 |
| Completeness weights | demand 0.20, competition 0.20, supply 0.15, logistics 0.15, pricing 0.15, cost 0.15 |
| Opportunity weights | demand 0.22, margin 0.22, competition 0.16, supply 0.12, logistics 0.10 |
| Levels | opportunity 20/40/60/80; viability 20/40/60/80 (STRONG > 80) |
| Momentum | accelerating > 0.20, growing > 0.05, declining < −0.05, volatile CV > 0.30 |

---

## 12. Testing & Verification

| Suite | Result |
|-------|--------|
| Engine unit tests (`test/unit/product-opportunity-engine.test.ts`) | 77 passing |
| Phase 12 integration tests (`test/integration/product-opportunity-intelligence.test.ts`) | 24 passing (incl. adversarial: tenant isolation, unknown≠zero renormalization, version monotonicity, hash divergence, competitor dedup, signal/risk detection, provenance, pagination, determinism) |
| Full unit regression | 391/391 |
| Full integration regression | 204/204 |
| Lint + build (turbo) | 10/10 packages |

---

## 13. Operational Notes

1. **Queue naming**: Phase 8 already owns `opportunities` / `OPPORTUNITY_CONFIG` / the `/api/v1/opportunities` prefix. Phase 12 deliberately uses `product_opportunity`, `PRODUCT_OPP_CONFIG`, and `/api/v1/opportunity`, with the routes imported under the alias `productOpportunityRoutes`.
2. **Partial unique index caveat**: the Phase 9 partial unique index `supply_chain_nodes_canonical_entity_unique` (`WHERE "canonicalEntityId" IS NOT NULL`) exists only as raw SQL in migration `20261002120000_phase9_supply_chain_corrections`. Databases baselined with `prisma db push` do **not** receive it automatically; apply it manually:
   ```sql
   CREATE UNIQUE INDEX "supply_chain_nodes_canonical_entity_unique"
     ON "supply_chain_nodes"("tenantId", "nodeType", "canonicalEntityType", "canonicalEntityId")
     WHERE "canonicalEntityId" IS NOT NULL;
   ```
3. **Unknown ≠ Zero invariant**: when extending the engine, any new dimension must be plumbed as `number | null` and excluded from renormalized aggregates when unknown — never defaulted to zero or a neutral mid-score.
4. **Enum strictness**: persisted `ProductOppSignal.signalType` values must come from `PRODUCT_OPP_SIGNAL_TYPES`; the service validates strictly and throws on unknown values rather than substituting a fallback type.
